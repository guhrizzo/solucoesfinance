// lib/interBoletoServer.ts
// Banco Inter: núcleos testáveis das rotas de boleto (emitir, cancelar, PDF e
// atualizar). SOMENTE servidor (Admin SDK). As rotas em app/api/inter/boletos/*
// só fazem o portão (token, permissão contasReceber, Pro, rate limit) e chamam
// estes núcleos.
//
// Emitir, nesta ordem: valida tudo → confere "um boleto vigente por conta a
// receber" → carrega a conexão → grava o doc local PRIMEIRO (EM_PROCESSAMENTO,
// sem codigoSolicitacao) → chama o Inter UMA vez, sem retry → grava o código e
// consulta algumas vezes até ter a linha digitável.
//  - Recusa clara do Inter (HTTP 4xx) ou dado recusado antes do envio: o doc vira
//    FALHA_EMISSAO com lastError curto.
//  - Falha AMBÍGUA (rede, 5xx, resposta ilegível): o Inter pode ter criado a
//    cobrança. O doc fica EM_PROCESSAMENTO com lastError (continua "vigente",
//    então não deixa emitir outro em dobro) e o atualizar o recupera pelo
//    seuNumero na listagem do Inter.
//
// Nada de segredo, PEM, token ou corpo de resposta do Inter vai para resposta,
// documento ou log: só mensagens nossas, em português.

import type { Firestore } from "firebase-admin/firestore";
import type { Actor } from "./audit";
import type { BoletoData } from "./boleto";
import { isValidCnpj, isValidCpf, EMAIL_RE } from "./contract";
import { aplicarSituacao } from "./interBoletoApply";
import { newBoletoId, seuNumeroDe, type BoletoDoc, type BoletoSituacao } from "./interBoletoTypes";
import {
  buscarPorSeuNumero,
  cancelarCobranca,
  consultarCobranca,
  emitirCobranca,
  InterHttpError,
  InterRedeError,
  pdfCobranca,
  transporteMtls,
  type CobrancaInter,
  type Transporte,
} from "./interCobranca";
import { decryptInterSecrets, type EncryptedInterSecrets, type InterSecrets } from "./interCrypto";
import { MAX_FINE_RATE, MAX_INTEREST_RATE } from "./receivableCharge";
import { todayKey } from "./rh/datas";
import { validarEndereco } from "./pagadorEndereco";

// ---------- erros ----------

export type BoletoErroKind = "validacao" | "nao-encontrado" | "conflito" | "nao-conectado" | "config" | "inter";

/** Erro com mensagem legível (pode ir para a tela) e o tipo, para a rota escolher o status HTTP. */
export class BoletoError extends Error {
  kind: BoletoErroKind;
  constructor(message: string, kind: BoletoErroKind) {
    super(message);
    this.name = "BoletoError";
    this.kind = kind;
  }
}

const MSG_NAO_CONECTADO = "O Banco Inter não está conectado.";
const MSG_CONFIG = "Integração com o Banco Inter indisponível no momento (configuração do servidor). Avise o suporte.";
const MSG_FALHA = "Falha ao falar com o Banco Inter. Tente novamente mais tarde.";
const MSG_NAO_CONFIRMADA =
  "Não foi possível confirmar a emissão com o Banco Inter. O boleto ficou em processamento: use \"Atualizar\" em alguns minutos antes de emitir outro.";
const MSG_CODIGO_NAO_GRAVADO = "Emitido no Banco Inter, mas o código não foi gravado; use \"Atualizar\".";
const MSG_NAO_ACHADO_NO_INTER = "Ainda não encontrado no Banco Inter; confira no Internet Banking.";

/** Mensagens das libs do Inter já são nossas; por garantia, nada longo ou com cara de PEM passa. */
function mensagemSegura(e: unknown): string {
  const m = e instanceof Error ? e.message : "";
  if (!m || m.length > 200 || m.includes("-----BEGIN")) return MSG_FALHA;
  return m;
}

/**
 * Recusa clara = a cobrança com certeza NÃO foi criada: 4xx do Inter (o 401 já
 * passou pela renovação do token) ou falha ao obter o token (nada foi enviado).
 * Erro de rede na chamada, 5xx ou resposta ilegível após 2xx são ambíguos.
 */
const recusaClara = (e: unknown) =>
  (e instanceof InterHttpError && e.status >= 400 && e.status < 500) || (e instanceof InterRedeError && e.fase === "token");

// ---------- dependências ----------

export type BoletoDeps = {
  /** Injetável nos testes; padrão = transporte mTLS com as credenciais da conta. */
  transporte?: Transporte;
  /** Consulta após emitir até ter a linha digitável. */
  aguardar?: { tentativas: number; intervaloMs: number };
  /** Relógio (epoch ms), injetável nos testes. */
  now?: number;
};

const AGUARDAR_PADRAO = { tentativas: 3, intervaloMs: 1500 };
/** Consultas por rodada do "Atualizar" (a API do Inter limita chamadas por minuto). */
const MAX_POR_RODADA = 25;
const ABERTAS: readonly BoletoSituacao[] = ["EM_PROCESSAMENTO", "A_RECEBER", "ATRASADO"];
const PAGAS: ReadonlySet<BoletoSituacao> = new Set(["RECEBIDO", "MARCADO_RECEBIDO"]);
const ENCERRADAS: ReadonlySet<BoletoSituacao> = new Set(["CANCELADO", "EXPIRADO", "FALHA_EMISSAO"]);
const DAY = 86_400_000;

const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
const ID_RE = /^[0-9a-z]{1,15}$/;

/** Lê e decifra a conexão do dono (integracoesBanco/{ownerUid}); `conta` fica em claro, fora do envelope. */
async function transporteDe(db: Firestore, ownerUid: string, deps: BoletoDeps): Promise<Transporte> {
  if (deps.transporte) return deps.transporte;
  const snap = await db.doc(`integracoesBanco/${ownerUid}`).get();
  if (!snap.exists) throw new BoletoError(MSG_NAO_CONECTADO, "nao-conectado");
  const conexao = snap.data() ?? {};
  let secrets: InterSecrets;
  try {
    secrets = decryptInterSecrets(conexao as unknown as EncryptedInterSecrets);
  } catch {
    throw new BoletoError(MSG_CONFIG, "config");
  }
  if (typeof conexao.conta === "string" && conexao.conta) secrets.conta = conexao.conta;
  return transporteMtls(secrets);
}

// ---------- validação ----------

export type EmitirBoletoInput = {
  receivableId?: string;
  payer: unknown;
  amount: unknown;
  dueDate: unknown;
  fineRate?: unknown;
  interestRate?: unknown;
};

const txt = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function dataValida(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function taxa(v: unknown, max: number, nome: string): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > max) throw new BoletoError(`${nome} inválida: use um percentual entre 0 e ${max}.`, "validacao");
  return n > 0 ? Math.round(n * 100) / 100 : undefined;
}

type Validado = {
  receivableId?: string;
  payer: BoletoDoc["payer"];
  amount: number;
  dueDate: string;
  fineRate?: number;
  interestRate?: number;
};

function validar(i: EmitirBoletoInput, hoje: string): Validado {
  const erro = (m: string) => new BoletoError(m, "validacao");
  if (typeof i !== "object" || i === null) throw erro("Dados do boleto inválidos.");

  let receivableId: string | undefined;
  if (i.receivableId !== undefined && i.receivableId !== null && i.receivableId !== "") {
    receivableId = txt(i.receivableId);
    if (!receivableId || receivableId.length > 200 || receivableId.includes("/")) throw erro("Conta a receber inválida.");
  }

  const p = i.payer;
  if (typeof p !== "object" || p === null || Array.isArray(p)) throw erro("Informe os dados do pagador.");
  const pr = p as Record<string, unknown>;
  const nome = txt(pr.nome);
  if (!nome) throw erro("Informe o nome do pagador.");
  if (nome.length > 100) throw erro("Nome do pagador muito longo (máximo 100 caracteres).");
  const doc = txt(pr.doc).replace(/\D/g, "");
  if (!(doc.length === 11 ? isValidCpf(doc) : doc.length === 14 ? isValidCnpj(doc) : false)) {
    throw erro("CPF ou CNPJ do pagador inválido.");
  }
  if (pr.endereco === undefined || pr.endereco === null) throw erro("Informe o endereço do pagador.");
  const end = validarEndereco(pr.endereco);
  if (!end.ok) throw erro(end.error);
  const email = txt(pr.email);
  if (email && !EMAIL_RE.test(email)) throw erro("E-mail do pagador inválido.");
  const telefone = txt(pr.telefone);

  const amount = typeof i.amount === "number" ? i.amount : Number.NaN;
  if (!Number.isFinite(amount) || amount <= 0) throw erro("O valor do boleto precisa ser maior que zero.");
  const valor = Math.round(amount * 100) / 100;
  // ASSUNÇÃO (não verificado no sandbox): faixa aceita pelo Inter em valorNominal (R$ 2,50 a 99.999.999,99).
  if (valor < 2.5) throw erro("O valor mínimo do boleto no Banco Inter é R$ 2,50.");
  if (valor > 99_999_999.99) throw erro("Valor do boleto acima do permitido.");

  const dueDate = txt(i.dueDate);
  if (!dataValida(dueDate)) throw erro("Data de vencimento inválida.");
  if (dueDate < hoje) throw erro("O vencimento não pode ser anterior a hoje.");

  const fineRate = taxa(i.fineRate, MAX_FINE_RATE, "Multa");
  const interestRate = taxa(i.interestRate, MAX_INTEREST_RATE, "Taxa de juros");

  return {
    ...(receivableId ? { receivableId } : {}),
    payer: {
      nome,
      doc,
      ...(email ? { email } : {}),
      ...(telefone ? { telefone } : {}),
      endereco: end.value,
    },
    amount: valor,
    dueDate,
    ...(fineRate !== undefined ? { fineRate } : {}),
    ...(interestRate !== undefined ? { interestRate } : {}),
  };
}

// ---------- conta a receber ← boleto ----------

/**
 * Espelha o boleto em receivables/{id}.boleto (formato BoletoData de lib/boleto.ts,
 * usado pelo e-mail de cobrança): grava quando há linha digitável e o boleto está
 * vigente; limpa quando ele foi cancelado/expirou/falhou — só se o boleto gravado
 * na conta for ESTE (nunca apaga outro).
 */
async function espelharNaConta(db: Firestore, ownerUid: string, boletoId: string, now: number): Promise<void> {
  const boletoRef = db.doc(`users/${ownerUid}/boletos/${boletoId}`);
  await db.runTransaction(async (t) => {
    const bs = await t.get(boletoRef);
    if (!bs.exists) return;
    const b = bs.data() as BoletoDoc;
    if (!b.receivableId || !b.codigoSolicitacao) return;
    const recRef = db.doc(`users/${ownerUid}/receivables/${b.receivableId}`);
    const rs = await t.get(recRef);
    if (!rs.exists) return;
    const atual = (rs.data() ?? {}).boleto as Partial<BoletoData> | null | undefined;
    const eDeste = !!atual && atual.provider === "inter" && atual.externalId === b.codigoSolicitacao;

    if ((b.situacao === "A_RECEBER" || b.situacao === "ATRASADO") && b.linhaDigitavel) {
      if (eDeste && atual?.linhaDigitavel === b.linhaDigitavel) return;
      const data: BoletoData = {
        provider: "inter",
        externalId: b.codigoSolicitacao,
        bankCode: "077",
        bankName: "Inter",
        linhaDigitavel: b.linhaDigitavel,
        ...(b.codigoBarras ? { codigoBarras: b.codigoBarras } : {}),
        ...(b.nossoNumero ? { nossoNumero: b.nossoNumero } : {}),
        ...(b.pixCopiaECola ? { pixCopiaECola: b.pixCopiaECola } : {}),
        issuedAt: now,
        dueDate: b.dueDate,
        amount: b.amount,
      };
      t.update(recRef, { boleto: data });
    } else if (ENCERRADAS.has(b.situacao) && eDeste) {
      t.update(recRef, { boleto: null });
    }
  });
}

/**
 * Preenche linha digitável/código de barras/nosso número/Pix que faltarem no doc
 * (a situação pode ter mudado antes de os dados ficarem prontos no Inter).
 */
async function completarDados(db: Firestore, ownerUid: string, boletoId: string, r: CobrancaInter): Promise<void> {
  const ref = db.doc(`users/${ownerUid}/boletos/${boletoId}`);
  await db.runTransaction(async (t) => {
    const s = await t.get(ref);
    if (!s.exists) return;
    const b = s.data() as BoletoDoc;
    const upd: Record<string, unknown> = {};
    if (!b.linhaDigitavel && r.linhaDigitavel) upd.linhaDigitavel = r.linhaDigitavel;
    if (!b.codigoBarras && r.codigoBarras) upd.codigoBarras = r.codigoBarras;
    if (!b.nossoNumero && r.nossoNumero) upd.nossoNumero = r.nossoNumero;
    if (!b.pixCopiaECola && r.pixCopiaECola) upd.pixCopiaECola = r.pixCopiaECola;
    if (Object.keys(upd).length) t.update(ref, upd);
  });
}

/** Aplica a situação remota (núcleo idempotente) + completa dados + espelha na conta a receber. */
async function aplicarTudo(
  db: Firestore,
  ownerUid: string,
  boletoId: string,
  remoto: CobrancaInter,
  actor: Actor,
  now: number,
): Promise<{ pago: boolean }> {
  const r = await aplicarSituacao(db, ownerUid, boletoId, remoto, actor, now);
  await completarDados(db, ownerUid, boletoId, remoto);
  await espelharNaConta(db, ownerUid, boletoId, now);
  return { pago: r.pago };
}

/** Dados prontos = saiu de EM_PROCESSAMENTO e, se vigente, já tem linha digitável. */
const pronto = (r: CobrancaInter) =>
  r.situacao !== "EM_PROCESSAMENTO" && (!(r.situacao === "A_RECEBER" || r.situacao === "ATRASADO") || !!r.linhaDigitavel);

// ---------- emitir ----------

export async function emitirBoleto(
  db: Firestore,
  ownerUid: string,
  input: EmitirBoletoInput,
  actor: Actor,
  deps: BoletoDeps = {},
): Promise<{ id: string; situacao: BoletoSituacao }> {
  const now = deps.now ?? Date.now();
  const v = validar(input, todayKey(new Date(now)));
  const base = `users/${ownerUid}`;
  const recRef = v.receivableId ? db.doc(`${base}/receivables/${v.receivableId}`) : null;

  // Conferência prévia (sem escrita) para recusar cedo; a definitiva é na transação abaixo.
  if (recRef) await conferirConta(db, base, recRef, null);

  const t = await transporteDe(db, ownerUid, deps);

  const id = newBoletoId();
  const seuNumero = seuNumeroDe(id);
  const boletoRef = db.doc(`${base}/boletos/${id}`);
  const doc: BoletoDoc = {
    id,
    ...(v.receivableId ? { receivableId: v.receivableId } : {}),
    payer: v.payer,
    amount: v.amount,
    dueDate: v.dueDate,
    ...(v.fineRate !== undefined ? { fineRate: v.fineRate } : {}),
    ...(v.interestRate !== undefined ? { interestRate: v.interestRate } : {}),
    situacao: "EM_PROCESSAMENTO",
    createdAt: new Date(now).toISOString(),
    createdBy: actor.uid,
  };

  // Doc local PRIMEIRO. Com conta a receber: na MESMA transação relê a conta e os
  // boletos dela e grava um marcador na conta — duas emissões simultâneas para a
  // mesma conta conflitam e a segunda vê o boleto da primeira.
  await db.runTransaction(async (tx) => {
    if (recRef) await conferirConta(db, base, recRef, tx);
    tx.create(boletoRef, doc);
    if (recRef) tx.update(recRef, { ultimoBoletoId: id });
  });

  // Inter: UMA chamada, sem retry.
  let codigo: string;
  try {
    ({ codigoSolicitacao: codigo } = await emitirCobranca(t, {
      seuNumero,
      valorNominal: v.amount,
      dataVencimento: v.dueDate,
      pagador: v.payer,
      ...(v.fineRate !== undefined ? { multaPercentual: v.fineRate } : {}),
      ...(v.interestRate !== undefined ? { moraPercentualMensal: v.interestRate } : {}),
    }));
  } catch (e) {
    const msg = mensagemSegura(e);
    if (recusaClara(e)) {
      await boletoRef.update({ situacao: "FALHA_EMISSAO", lastError: msg }).catch(() => undefined);
      throw new BoletoError(msg, "inter");
    }
    await boletoRef.update({ lastError: MSG_NAO_CONFIRMADA }).catch(() => undefined);
    throw new BoletoError(MSG_NAO_CONFIRMADA, "inter");
  }

  try {
    await boletoRef.update({ codigoSolicitacao: codigo });
  } catch {
    // O Inter aceitou: o doc segue EM_PROCESSAMENTO e o atualizar o acha pelo seuNumero.
    await boletoRef.update({ lastError: MSG_CODIGO_NAO_GRAVADO }).catch(() => undefined);
    return { id, situacao: "EM_PROCESSAMENTO" };
  }

  // Emissão é assíncrona no Inter: consulta algumas vezes até ter a linha digitável.
  const { tentativas, intervaloMs } = deps.aguardar ?? AGUARDAR_PADRAO;
  let ultimo: CobrancaInter | null = null;
  for (let k = 0; k < tentativas; k++) {
    await sleep(intervaloMs);
    try {
      ultimo = await consultarCobranca(t, codigo);
    } catch {
      break; // fica para o "Atualizar"/cron; nada de martelar o Inter
    }
    if (pronto(ultimo)) break;
  }
  if (ultimo && ultimo.situacao !== "EM_PROCESSAMENTO") {
    await aplicarTudo(db, ownerUid, id, ultimo, actor, now).catch(() => undefined);
  }

  const final = await boletoRef.get();
  return { id, situacao: ((final.data() as BoletoDoc | undefined)?.situacao ?? "EM_PROCESSAMENTO") };
}

type Tx = Parameters<Parameters<Firestore["runTransaction"]>[0]>[0];
type DocRef = ReturnType<Firestore["doc"]>;

/** Conta a receber existe, não está recebida e não tem boleto vigente. Lê na transação quando `tx` vem. */
async function conferirConta(db: Firestore, base: string, recRef: DocRef, tx: Tx | null): Promise<void> {
  const q = db.collection(`${base}/boletos`).where("receivableId", "==", recRef.id);
  const recSnap = tx ? await tx.get(recRef) : await recRef.get();
  if (!recSnap.exists) throw new BoletoError("Conta a receber não encontrada.", "nao-encontrado");
  if ((recSnap.data() ?? {}).status === "recebido") throw new BoletoError("Esta conta a receber já foi recebida.", "validacao");
  const bs = tx ? await tx.get(q) : await q.get();
  const vigente = bs.docs.some((d) => ABERTAS.includes((d.data() ?? {}).situacao as BoletoSituacao));
  if (vigente) {
    throw new BoletoError("Esta conta a receber já tem um boleto vigente. Cancele o atual para emitir outro.", "conflito");
  }
}

// ---------- cancelar ----------

const MOTIVO_CANCELAMENTO = "Cancelado pelo emissor";

async function lerBoleto(db: Firestore, ownerUid: string, boletoId: string): Promise<BoletoDoc> {
  if (typeof boletoId !== "string" || !ID_RE.test(boletoId)) throw new BoletoError("Boleto inválido.", "validacao");
  const s = await db.doc(`users/${ownerUid}/boletos/${boletoId}`).get();
  if (!s.exists) throw new BoletoError("Boleto não encontrado.", "nao-encontrado");
  return s.data() as BoletoDoc;
}

/** Janela da busca por seuNumero: do dia anterior à criação até hoje. */
function janelaDe(b: BoletoDoc, now: number): { de: string; ate: string } {
  const criado = Date.parse(b.createdAt);
  const ref = Number.isFinite(criado) ? criado : now;
  return { de: todayKey(new Date(ref - DAY)), ate: todayKey(new Date(now)) };
}

/** Grava o codigoSolicitacao achado pelo seuNumero (só se ainda faltar). */
async function gravarCodigo(db: Firestore, ownerUid: string, boletoId: string, codigo: string): Promise<void> {
  const ref = db.doc(`users/${ownerUid}/boletos/${boletoId}`);
  await db.runTransaction(async (t) => {
    const s = await t.get(ref);
    if (!s.exists || (s.data() as BoletoDoc).codigoSolicitacao) return;
    t.update(ref, { codigoSolicitacao: codigo, lastError: null });
  });
}

export async function cancelarBoleto(
  db: Firestore,
  ownerUid: string,
  boletoId: string,
  actor: Actor,
  deps: BoletoDeps = {},
): Promise<void> {
  const now = deps.now ?? Date.now();
  const b = await lerBoleto(db, ownerUid, boletoId);
  if (PAGAS.has(b.situacao)) throw new BoletoError("Este boleto já foi pago e não pode ser cancelado.", "validacao");
  if (b.situacao === "CANCELADO") throw new BoletoError("Este boleto já está cancelado.", "validacao");
  if (ENCERRADAS.has(b.situacao)) throw new BoletoError("Este boleto não está mais vigente.", "validacao");

  const t = await transporteDe(db, ownerUid, deps);
  const ref = db.doc(`users/${ownerUid}/boletos/${boletoId}`);

  let codigo = b.codigoSolicitacao;
  if (!codigo) {
    // Emissão sem confirmação: procura no Inter. Achou → cancela lá; não achou →
    // descarta só aqui (o Inter não tem essa cobrança).
    let achada: CobrancaInter | null;
    const { de, ate } = janelaDe(b, now);
    try {
      achada = await buscarPorSeuNumero(t, boletoId, de, ate);
    } catch (e) {
      throw new BoletoError(mensagemSegura(e), "inter");
    }
    if (!achada) {
      await db.runTransaction(async (tx) => {
        const s = await tx.get(ref);
        const atual = s.data() as BoletoDoc | undefined;
        if (!atual || atual.codigoSolicitacao || atual.situacao !== "EM_PROCESSAMENTO") return;
        tx.update(ref, { situacao: "FALHA_EMISSAO", cancelledBy: actor.uid, lastError: "Descartado: o Banco Inter não registrou este boleto." });
      });
      return;
    }
    codigo = achada.codigoSolicitacao;
    await gravarCodigo(db, ownerUid, boletoId, codigo);
  }

  // Confere no Inter antes: pago lá (e ainda não aqui) → aplica o pagamento e recusa.
  let remoto: CobrancaInter;
  try {
    remoto = await consultarCobranca(t, codigo);
  } catch (e) {
    throw new BoletoError(mensagemSegura(e), "inter");
  }
  if (PAGAS.has(remoto.situacao)) {
    await aplicarTudo(db, ownerUid, boletoId, remoto, actor, now);
    throw new BoletoError("Este boleto já foi pago e não pode ser cancelado.", "validacao");
  }

  if (!ENCERRADAS.has(remoto.situacao)) {
    try {
      await cancelarCobranca(t, codigo, MOTIVO_CANCELAMENTO);
    } catch (e) {
      throw new BoletoError(mensagemSegura(e), "inter");
    }
  }

  await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) return;
    const atual = s.data() as BoletoDoc;
    if (PAGAS.has(atual.situacao)) return; // um webhook pago chegou no meio: não desfaz o pagamento
    const recRef = atual.receivableId ? db.doc(`users/${ownerUid}/receivables/${atual.receivableId}`) : null;
    const rs = recRef ? await tx.get(recRef) : null;
    const situacao: BoletoSituacao = ENCERRADAS.has(remoto.situacao) ? remoto.situacao : "CANCELADO";
    // Já encerrado no Inter (ex.: EXPIRADO): só reflete; cancelledBy só quando cancelamos de fato.
    tx.update(ref, { situacao, ...(situacao === "CANCELADO" ? { cancelledBy: actor.uid } : {}), lastError: null });
    const bd = rs?.exists ? ((rs.data() ?? {}).boleto as Partial<BoletoData> | null | undefined) : null;
    if (recRef && bd && bd.provider === "inter" && bd.externalId === codigo) tx.update(recRef, { boleto: null });
  });
}

// ---------- PDF ----------

export async function pdfBoleto(db: Firestore, ownerUid: string, boletoId: string, deps: BoletoDeps = {}): Promise<Buffer> {
  const b = await lerBoleto(db, ownerUid, boletoId);
  if (!b.codigoSolicitacao || b.situacao === "EM_PROCESSAMENTO" || b.situacao === "FALHA_EMISSAO") {
    throw new BoletoError("O PDF ainda não está disponível: o boleto está em processamento ou não foi emitido.", "validacao");
  }
  const t = await transporteDe(db, ownerUid, deps);
  try {
    return await pdfCobranca(t, b.codigoSolicitacao);
  } catch (e) {
    throw new BoletoError(mensagemSegura(e), "inter");
  }
}

// ---------- atualizar ----------

/** Erro que vale para a conta toda (credencial, escopo, limite, rede, Inter fora): para a rodada. */
const erroGeral = (e: unknown) =>
  e instanceof InterRedeError ||
  (e instanceof InterHttpError && (e.status === 401 || e.status === 403 || e.status === 429 || e.status >= 500));

/**
 * "Consulta de segurança" (botão e cron): consulta cada boleto em aberto e aplica
 * a situação pelo núcleo idempotente. Boleto sem codigoSolicitacao é procurado
 * pelo seuNumero. Erro geral (token, rede, 401/403/429/5xx) interrompe a rodada
 * e é lançado; erro de um boleto só (404, resposta ilegível ou que não
 * corresponde) vira lastError nele e a rodada segue.
 */
export async function atualizarBoletos(
  db: Firestore,
  ownerUid: string,
  actor: Actor,
  deps: BoletoDeps = {},
): Promise<{ consultados: number; pagos: number }> {
  const now = deps.now ?? Date.now();
  const col = db.collection(`users/${ownerUid}/boletos`);
  const abertos: BoletoDoc[] = [];
  for (const s of ABERTAS) {
    const snap = await col.where("situacao", "==", s).get();
    for (const d of snap.docs) abertos.push({ ...(d.data() as BoletoDoc), id: d.id });
  }
  if (abertos.length === 0) return { consultados: 0, pagos: 0 };

  // EM_PROCESSAMENTO primeiro, depois os de vencimento mais antigo.
  abertos.sort((a, b) =>
    (a.situacao === "EM_PROCESSAMENTO" ? 0 : 1) - (b.situacao === "EM_PROCESSAMENTO" ? 0 : 1) || a.dueDate.localeCompare(b.dueDate),
  );

  const t = await transporteDe(db, ownerUid, deps);
  let consultados = 0;
  let pagos = 0;
  for (const b of abertos.slice(0, MAX_POR_RODADA)) {
    let remoto: CobrancaInter | null;
    try {
      if (b.codigoSolicitacao) {
        remoto = await consultarCobranca(t, b.codigoSolicitacao);
      } else {
        const { de, ate } = janelaDe(b, now);
        remoto = await buscarPorSeuNumero(t, b.id, de, ate);
        if (remoto) await gravarCodigo(db, ownerUid, b.id, remoto.codigoSolicitacao);
      }
    } catch (e) {
      const msg = mensagemSegura(e);
      if (erroGeral(e)) throw new BoletoError(msg, "inter");
      await col.doc(b.id).update({ lastError: msg }).catch(() => undefined);
      continue;
    }
    consultados++;
    if (!remoto) {
      if (b.lastError !== MSG_NAO_ACHADO_NO_INTER) {
        await col.doc(b.id).update({ lastError: MSG_NAO_ACHADO_NO_INTER }).catch(() => undefined);
      }
      continue;
    }
    if (remoto.situacao === "EM_PROCESSAMENTO") continue;
    const r = await aplicarTudo(db, ownerUid, b.id, remoto, actor, now);
    if (r.pago) pagos++;
  }
  return { consultados, pagos };
}
