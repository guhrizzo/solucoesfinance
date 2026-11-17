// lib/interBoletoApply.ts
// Banco Inter: núcleo único e idempotente "aplicar situação" do boleto, usado pelo
// webhook, pelo botão "Consultar" e pelo cron. SOMENTE servidor (Admin SDK).
//
// Pago → caixa numa ÚNICA transação: marca o boleto, cria a entrada
// users/{ownerUid}/cashflow/boleto_{boletoId} com create() (a existência desse doc
// é a trava: nunca duas entradas, em nenhuma ordem de chegada), dá baixa na conta
// a receber ligada e, se o item do extrato já está em "A conciliar" sem nenhuma
// ambiguidade, vincula. Todas as leituras vêm antes das escritas.
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

const PAGAS: ReadonlySet<BoletoSituacao> = new Set(["RECEBIDO", "MARCADO_RECEBIDO"]);
/** Terminais não pagos que ainda aceitam um pagamento confirmado pelo banco. */
const ENCERRADAS_SEM_PAGAMENTO: ReadonlySet<BoletoSituacao> = new Set(["CANCELADO", "EXPIRADO", "FALHA_EMISSAO"]);

const round2 = (v: number) => Math.round(v * 100) / 100;
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

    // Pago no banco. Já pago aqui → nada a fazer (idempotente).
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

    // ---------- monta as escritas ----------
    const rec = recSnap?.exists ? (recSnap.data() as Record<string, unknown>) : null;
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
    if (rec && recRef) entrada.settledReceivableId = recRef.id;

    // Extrato: candidatos = itens pendentes de entrada; concorrentes = outros
    // lançamentos de boleto ainda sem item do extrato (disputariam o mesmo item).
    const candidatos = pendSnap.docs.map((d) => {
      const x = d.data() ?? {};
      return { docId: d.id, txKey: String(x.txKey ?? ""), amount: Number(x.amount), date: String(x.date ?? "") };
    }).filter((c) => c.txKey);
    const concorrentes = vizinhosSnap.docs
      .filter((d) => d.id !== cashId)
      .map((d) => d.data() ?? {})
      .filter((x) => x.type === "entrada" && typeof x.boletoId === "string" && x.boletoId && !x.interTxId)
      .map((x) => ({ amount: Number(x.amount), date: String(x.date ?? "") }));
    const casado = candidatoUnico({ amount: valorRecebido, date: data }, candidatos, concorrentes);
    if (casado) {
      entrada.interTxId = casado.txKey;
      marcaBoleto.interTxKey = casado.txKey;
    }

    // ---------- escritas ----------
    t.update(boletoRef, marcaBoleto);
    t.create(cashRef, entrada);
    if (rec && recRef) {
      const total = Number(rec.amount) || 0;
      const recebido = round2((Number(rec.amountReceived) || 0) + valorRecebido);
      const upd: Record<string, unknown> = {
        amountReceived: recebido,
        settledBy: actor.uid,
        settledByName: actor.name,
        settledAt: now,
      };
      if (recebido >= total - CENTS_EPSILON) {
        upd.status = "recebido";
        upd.receivedAt = data;
      }
      t.update(recRef, upd);
    }
    if (casado) {
      t.update(pendCol.doc(casado.docId), {
        status: "conciliado",
        cashflowId: cashId,
        resolvedAt: now,
        resolvedBy: actor.uid,
      });
    }
    return { aplicada: true, pago: true };
  });
}
