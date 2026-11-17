// lib/interBoletoApply.ts
// Banco Inter: núcleo único e idempotente "aplicar situação" do boleto, usado pelo
// webhook, pelo botão "Consultar" e pelo cron. SOMENTE servidor (Admin SDK).
//
// Pago → caixa numa ÚNICA transação: marca o boleto, cria a entrada
// users/{ownerUid}/cashflow/boleto_{boletoId} com create() (a existência desse doc
// é a trava: nunca duas entradas, em nenhuma ordem de chegada), dá baixa na conta
// a receber ligada e, se o item do extrato já está em "A conciliar" sem nenhuma
// ambiguidade, vincula. Todas as leituras vêm antes das escritas.
//
// Dois cuidados contra dinheiro em dobro no caixa:
//  - Conta a receber já marcada "recebido" à mão tem um lançamento-espelho
//    (sourceReceivableId); a baixa do boleto reajusta/remove o espelho com a mesma
//    regra de syncReceivableCashflow.
//  - Se o item do extrato chegou antes e foi resolvido à mão ("criar"), já existe
//    uma entrada com interTxId e sem boletoId: com exatamente uma dessas no mesmo
//    valor/janela, o boleto ADOTA essa entrada em vez de criar outra; com mais de
//    uma, cria a do boleto e marca o boleto para revisão (revisarCaixa). Também marca
//    revisão (sem adotar) quando há uma entrada do mesmo valor/janela lançada à mão
//    e baixada nesta conta a receber, ou vinda do extrato e baixada em outra conta.
// Nada de segredo é lido, gravado ou devolvido aqui.

import type { Firestore } from "firebase-admin/firestore";
import type { Actor } from "./audit";
import { candidatoUnico } from "./interBoletoExtrato";
import { podeAplicar, type BoletoDoc, type BoletoSituacao } from "./interBoletoTypes";
import type { CobrancaInter } from "./interCobranca";
import { CAT_TO_CASHFLOW } from "./receivableCashflowSync";

const DAY = 86_400_000;
/** Mesma janela de candidatoUnico: concorrentes são buscados a ±3 dias. */
const JANELA_DIAS = 3;
const CENTS_EPSILON = 0.005;
const CATEGORIA_AVULSO = "Outros recebimentos";
const CATEGORIA_PADRAO_CONTA = "Outros ganhos";
export const MSG_PAGO_SEM_DADOS = "Pagamento confirmado sem valor/data; consulte novamente";
export const MSG_REVISAR_CAIXA = "Possível lançamento duplicado no caixa; confira";

const PAGAS: ReadonlySet<BoletoSituacao> = new Set(["RECEBIDO", "MARCADO_RECEBIDO"]);
/** Terminais não pagos que ainda aceitam um pagamento confirmado pelo banco. */
const ENCERRADAS_SEM_PAGAMENTO: ReadonlySet<BoletoSituacao> = new Set(["CANCELADO", "EXPIRADO", "FALHA_EMISSAO"]);

const round2 = (v: number) => Math.round(v * 100) / 100;
const cents = (v: number) => Math.round(v * 100);
const isoMs = (iso: string) => Date.parse(iso + "T00:00:00Z");
const toISO = (ms: number) => new Date(ms).toISOString().slice(0, 10);

type Resultado = { aplicada: boolean; pago: boolean };
const NADA: Resultado = { aplicada: false, pago: false };

/** Dados do boleto que vêm da consulta (só os presentes: ausente não apaga o que já existe). */
function dadosRemotos(r: CobrancaInter): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (r.linhaDigitavel) out.linhaDigitavel = r.linhaDigitavel;
  if (r.codigoBarras) out.codigoBarras = r.codigoBarras;
  if (r.nossoNumero) out.nossoNumero = r.nossoNumero;
  if (r.pixCopiaECola) out.pixCopiaECola = r.pixCopiaECola;
  if (r.origemRecebimento) out.origemRecebimento = r.origemRecebimento;
  return out;
}

export async function aplicarSituacao(
  db: Firestore,
  ownerUid: string,
  boletoId: string,
  remoto: CobrancaInter,
  actor: Actor,
  now: number = Date.now(),
): Promise<Resultado> {
  const base = `users/${ownerUid}`;
  const boletoRef = db.doc(`${base}/boletos/${boletoId}`);
  const cashId = `boleto_${boletoId}`;
  const cashCol = db.collection(`${base}/cashflow`);
  const cashRef = cashCol.doc(cashId);
  const pendCol = db.collection(`${base}/interPendentes`);

  return db.runTransaction(async (t) => {
    // ---------- leituras ----------
    const snap = await t.get(boletoRef);
    if (!snap.exists) throw new Error("Boleto não encontrado.");
    const atual = snap.data() as BoletoDoc;
    const nova = remoto.situacao;
    const remotoPago = PAGAS.has(nova);

    if (!remotoPago) {
      // Não pago: regra de transição normal (terminais não mudam; repetido é ignorado).
      if (!podeAplicar(atual.situacao, nova)) return NADA;
      t.update(boletoRef, { situacao: nova, ...dadosRemotos(remoto) });
      return { aplicada: true, pago: false };
    }

    // Pago no banco. Já pago aqui → nada a fazer (idempotente, inclusive após adoção).
    if (PAGAS.has(atual.situacao)) return NADA;
    const aposCancelamento = ENCERRADAS_SEM_PAGAMENTO.has(atual.situacao);
    if (!aposCancelamento && !podeAplicar(atual.situacao, nova)) return NADA;

    // Sem valor/data não se inventa lançamento: registra e espera a próxima consulta.
    const valor = Number(remoto.valorTotalRecebido);
    const data = typeof remoto.dataPagamento === "string" ? remoto.dataPagamento.slice(0, 10) : "";
    if (!(Number.isFinite(valor) && valor > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      if (atual.lastError !== MSG_PAGO_SEM_DADOS) t.update(boletoRef, { lastError: MSG_PAGO_SEM_DADOS });
      return NADA;
    }
    const valorRecebido = round2(valor);

    const cashSnap = await t.get(cashRef);
    const recRef = atual.receivableId ? db.doc(`${base}/receivables/${atual.receivableId}`) : null;
    const recSnap = recRef ? await t.get(recRef) : null;
    const espelhosSnap = recRef ? await t.get(cashCol.where("sourceReceivableId", "==", recRef.id)) : null;
    const pendSnap = await t.get(pendCol.where("status", "==", "pendente").where("type", "==", "entrada"));
    const de = toISO(isoMs(data) - JANELA_DIAS * DAY);
    const ate = toISO(isoMs(data) + JANELA_DIAS * DAY);
    const vizinhosSnap = await t.get(cashCol.where("date", ">=", de).where("date", "<=", ate));

    const marcaBoleto: Record<string, unknown> = {
      situacao: nova,
      ...dadosRemotos(remoto),
      valorRecebido,
      paidAt: data,
      cashflowId: cashId,
      ...(aposCancelamento ? { pagoAposCancelamento: true } : {}),
      ...(atual.lastError ? { lastError: null } : {}),
    };

    // Entrada já existe (estado inconsistente de uma rodada antiga): só alinha o
    // boleto, sem segunda entrada nem segunda baixa na conta a receber.
    if (cashSnap.exists) {
      t.update(boletoRef, marcaBoleto);
      return { aplicada: true, pago: true };
    }

    const rec = recSnap?.exists && recRef ? (recSnap.data() as Record<string, unknown>) : null;
    const recId = rec && recRef ? recRef.id : null;

    // ---------- entrada já lançada à mão a partir do extrato? ----------
    // Entrada do mesmo valor (centavos) na janela, com interTxId, sem boletoId,
    // que não é espelho e não pertence a OUTRA conta a receber.
    const lancadasDoExtrato = vizinhosSnap.docs.filter((d) => {
      const x = d.data() ?? {};
      if (d.id === cashId || x.type !== "entrada") return false;
      if (!x.interTxId || x.boletoId || x.sourceReceivableId) return false;
      if (x.settledReceivableId && x.settledReceivableId !== recId) return false;
      return Number.isFinite(Number(x.amount)) && cents(Number(x.amount)) === cents(valorRecebido);
    });
    // Suspeitas que o boleto NÃO pode adotar (só sinaliza): mesmo valor/janela, sem
    // boletoId e que não é espelho, e (a) lançada à mão no caixa e baixada NESTA conta
    // pela baixa automática (sem interTxId), ou (b) vinda de "A conciliar" (interTxId)
    // mas já baixada em OUTRA conta a receber. O dinheiro do boleto entra garantido.
    const idsExtrato = new Set(lancadasDoExtrato.map((d) => d.id));
    const suspeitas = vizinhosSnap.docs.filter((d) => {
      const x = d.data() ?? {};
      if (d.id === cashId || idsExtrato.has(d.id) || x.type !== "entrada") return false;
      if (x.boletoId || x.sourceReceivableId) return false;
      if (!Number.isFinite(Number(x.amount)) || cents(Number(x.amount)) !== cents(valorRecebido)) return false;
      const daConta = !!recId && x.settledReceivableId === recId;
      const deOutraConta = !!x.interTxId && !!x.settledReceivableId && x.settledReceivableId !== recId;
      return daConta || deOutraConta;
    });

    // ---------- escritas ----------
    let jaBaixada = false;
    if (lancadasDoExtrato.length === 1) {
      // ADOÇÃO: a entrada existente passa a ser a do boleto; nada é criado.
      const adotada = lancadasDoExtrato[0];
      const x = adotada.data() ?? {};
      jaBaixada = !!recId && x.settledReceivableId === recId;
      marcaBoleto.cashflowId = adotada.id;
      marcaBoleto.interTxKey = String(x.interTxId);
      t.update(boletoRef, marcaBoleto);
      t.update(cashCol.doc(adotada.id), {
        boletoId,
        ...(recId && !x.settledReceivableId ? { settledReceivableId: recId } : {}),
      });
    } else {
      const titulo = rec && typeof rec.title === "string" && rec.title.trim() ? rec.title.trim() : "";
      const entrada: Record<string, unknown> = {
        type: "entrada",
        amount: valorRecebido,
        date: data,
        description: titulo || `Boleto · ${atual.payer?.nome ?? ""}`.trim(),
        category: rec
          ? CAT_TO_CASHFLOW[typeof rec.category === "string" ? rec.category : ""] ?? CATEGORIA_PADRAO_CONTA
          : CATEGORIA_AVULSO,
        boletoId,
        createdAt: now,
        createdBy: actor.uid,
        createdByName: actor.name,
      };
      if (recId) entrada.settledReceivableId = recId;

      // Mais de uma entrada lançada à mão no mesmo valor/janela, ou uma suspeita que
      // não dá para adotar: o dinheiro do boleto entra garantido, mas pode haver
      // duplicata — o usuário confere.
      if (lancadasDoExtrato.length > 1 || suspeitas.length > 0) {
        marcaBoleto.revisarCaixa = true;
        marcaBoleto.lastError = MSG_REVISAR_CAIXA;
      }

      // Extrato: candidatos = itens pendentes de entrada; concorrentes = outros
      // lançamentos de boleto ainda sem item do extrato (disputariam o mesmo item).
      const candidatos = pendSnap.docs.map((d) => {
        const p = d.data() ?? {};
        return { docId: d.id, txKey: String(p.txKey ?? ""), amount: Number(p.amount), date: String(p.date ?? "") };
      }).filter((c) => c.txKey);
      const concorrentes = vizinhosSnap.docs
        .filter((d) => d.id !== cashId)
        .map((d) => d.data() ?? {})
        .filter((v) => v.type === "entrada" && typeof v.boletoId === "string" && v.boletoId && !v.interTxId)
        .map((v) => ({ amount: Number(v.amount), date: String(v.date ?? "") }));
      const casado = candidatoUnico({ amount: valorRecebido, date: data }, candidatos, concorrentes);
      if (casado) {
        entrada.interTxId = casado.txKey;
        marcaBoleto.interTxKey = casado.txKey;
      }

      t.update(boletoRef, marcaBoleto);
      t.create(cashRef, entrada);
      if (casado) {
        t.update(pendCol.doc(casado.docId), {
          status: "conciliado",
          cashflowId: cashId,
          resolvedAt: now,
          resolvedBy: actor.uid,
        });
      }
    }

    // ---------- conta a receber + espelho ----------
    if (rec && recRef && !jaBaixada) {
      const total = Number(rec.amount) || 0;
      const anterior = Number(rec.amountReceived) || 0;
      const jaRecebida = rec.status === "recebido";
      // Conta já dada como recebida à mão: o boleto é o MESMO dinheiro do espelho,
      // então não passa do total — salvo se o próprio pagamento real for maior
      // (juros/multa), aí vale o pagamento.
      const recebido = jaRecebida
        ? round2(Math.min(anterior + valorRecebido, Math.max(total, valorRecebido)))
        : round2(anterior + valorRecebido);
      const fica = jaRecebida || recebido >= total - CENTS_EPSILON;
      const upd: Record<string, unknown> = {
        amountReceived: recebido,
        settledBy: actor.uid,
        settledByName: actor.name,
        settledAt: now,
      };
      if (fica && !jaRecebida) {
        upd.status = "recebido";
        upd.receivedAt = data;
      }
      t.update(recRef, upd);

      // Mesma regra de syncReceivableCashflow: espelho só cobre o saldo.
      const espelhos = espelhosSnap?.docs ?? [];
      const resto = round2(total - recebido);
      if (!fica || resto <= CENTS_EPSILON) {
        for (const d of espelhos) t.delete(cashCol.doc(d.id));
      } else if (espelhos.length > 0) {
        t.update(cashCol.doc(espelhos[0].id), { amount: resto });
        for (const d of espelhos.slice(1)) t.delete(cashCol.doc(d.id));
      }
    }
    return { aplicada: true, pago: true };
  });
}
