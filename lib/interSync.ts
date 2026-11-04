// lib/interSync.ts
// Sincronização do extrato do Banco Inter → users/{ownerUid}/interPendentes.
// SOMENTE servidor (Admin SDK). Usado pela rota /api/inter/sincronizar e pelo
// cron /api/cron/inter-sync.
//
// - planSync / mergePendentes: puras (testáveis).
// - syncOwner: lê e decifra a conexão, puxa o extrato, calcula as sugestões e
//   grava só os txKey INÉDITOS (nunca reabre item conciliado/ignorado). O cursor
//   lastSyncAt só avança quando tudo deu certo; em erro grava
//   interStatus.lastSyncError (mensagem legível, nunca segredo) e lança
//   InterSyncError. Nada de segredo, PEM ou conteúdo do extrato vai para log.

import { createHash } from "node:crypto";
import { fetchExtrato, type InterTx } from "./inter";
import { decryptInterSecrets, type EncryptedInterSecrets, type InterSecrets } from "./interCrypto";
import { suggestAll, type CashEntryLite, type Suggestion } from "./interMatch";
import type { InterPendente } from "./interTypes";
import { todayKey } from "./rh/datas";

const DAY = 86_400_000;
const PRIMEIRA_VEZ_DIAS = 30;
const SOBREPOSICAO_DIAS = 3;
/** Folga de datas na leitura do Fluxo de Caixa: o casamento aceita ±3 dias. */
const FOLGA_MATCH_DIAS = 3;
/** Escritas por transação (limite do Firestore é 500). */
const LOTE = 400;

const toISO = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const isoMs = (iso: string) => Date.parse(iso + "T00:00:00Z");

// ---------- puras ----------

/**
 * Período a buscar (YYYY-MM-DD, dia de Brasília). Primeira vez: últimos 30 dias.
 * Depois: desde lastSyncAt − 3 dias (sobreposição pega lançamentos que o banco
 * registra com atraso) até hoje.
 */
export function planSync(args: { lastSyncAt?: number; now: number }): { from: string; to: string } {
  // "Hoje" é o dia civil de Brasília (UTC-3), como no resto do app: entre 21h e
  // 23h59 o dia UTC já virou e mandaria dataFim = amanhã para o Inter.
  const to = todayKey(new Date(args.now));
  const temCursor = typeof args.lastSyncAt === "number" && Number.isFinite(args.lastSyncAt);
  const from = temCursor
    ? todayKey(new Date(args.lastSyncAt! - SOBREPOSICAO_DIAS * DAY))
    : toISO(isoMs(to) - PRIMEIRA_VEZ_DIAS * DAY);
  // Cursor no futuro (relógio torto): nunca devolve um período invertido.
  return { from: from > to ? to : from, to };
}

/**
 * Itens NOVOS a gravar: só txKey que não existe em `existing` em NENHUM status
 * (pendente, conciliado ou ignorado — ignorado não reabre). Novos entram como
 * "pendente", com a sugestão do mapa e createdAt = now. Repetições do mesmo
 * txKey dentro de `incoming` contam uma vez só.
 */
export function mergePendentes(
  existing: Map<string, InterPendente>,
  incoming: InterTx[],
  suggestions: Map<string, Suggestion>,
  now: number
): InterPendente[] {
  const out: InterPendente[] = [];
  const vistos = new Set<string>();
  for (const tx of incoming) {
    if (existing.has(tx.txKey) || vistos.has(tx.txKey)) continue;
    vistos.add(tx.txKey);
    const suggestion = suggestions.get(tx.txKey);
    out.push({ ...tx, status: "pendente", ...(suggestion ? { suggestion } : {}), createdAt: now });
  }
  return out;
}

/**
 * Id do documento em interPendentes. O txKey ("id:<idTransacao>" ou "h:<hash>")
 * vira o id quando é seguro para o Firestore; senão (barra, tamanho, "__x__",
 * caractere estranho vindo do banco) usa um hash determinístico — o txKey
 * original sempre fica no campo `txKey` do documento.
 */
export function pendenteDocId(txKey: string): string {
  if (/^[A-Za-z0-9:_\-.]{1,200}$/.test(txKey) && !/^__.*__$/.test(txKey) && txKey !== "." && txKey !== "..") {
    return txKey;
  }
  return "x:" + createHash("sha256").update(txKey).digest("hex").slice(0, 40);
}

// ---------- impura ----------

export type InterSyncErrorKind = "nao-conectado" | "config" | "falha";

/** Falha da sincronização com mensagem legível (pode ir para a tela). */
export class InterSyncError extends Error {
  kind: InterSyncErrorKind;
  constructor(message: string, kind: InterSyncErrorKind) {
    super(message);
    this.name = "InterSyncError";
    this.kind = kind;
  }
}

const MSG_NAO_CONECTADO = "O Banco Inter não está conectado.";
const MSG_CONFIG = "Integração com o Banco Inter indisponível no momento (configuração do servidor). Avise o suporte.";
const MSG_FALHA = "Falha ao sincronizar o extrato do Banco Inter. Tente novamente mais tarde.";

/** Mensagens de lib/inter.ts já são nossas; por garantia, nada longo ou com cara de PEM passa. */
function mensagemSegura(e: unknown): string {
  const m = e instanceof Error ? e.message : "";
  if (!m || m.length > 300 || m.includes("-----BEGIN")) return MSG_FALHA;
  return m;
}

type Fetcher = (secrets: InterSecrets, from: string, to: string) => Promise<InterTx[]>;

export type SyncDeps = {
  /** Injetável nos testes; padrão = fetchExtrato real (mTLS). */
  fetchExtrato?: Fetcher;
};

/** Lançamentos do Fluxo de Caixa no período (com folga de ±3 dias) no formato do motor de sugestão. */
async function lerCashflow(db: any, ownerUid: string, from: string, to: string): Promise<CashEntryLite[]> {
  const de = toISO(isoMs(from) - FOLGA_MATCH_DIAS * DAY);
  const ate = toISO(isoMs(to) + FOLGA_MATCH_DIAS * DAY);
  const snap = await db
    .collection(`users/${ownerUid}/cashflow`)
    .where("date", ">=", de)
    .where("date", "<=", ate)
    .select("type", "amount", "date", "description", "category", "interTxId")
    .get();
  const out: CashEntryLite[] = [];
  for (const d of snap.docs) {
    const x = d.data() ?? {};
    if (x.type !== "entrada" && x.type !== "saida") continue;
    const amount = Number(x.amount);
    if (!Number.isFinite(amount) || typeof x.date !== "string") continue;
    out.push({
      id: d.id,
      type: x.type,
      amount,
      date: x.date.slice(0, 10),
      description: typeof x.description === "string" ? x.description : "",
      ...(typeof x.category === "string" ? { category: x.category } : {}),
      ...(typeof x.interTxId === "string" && x.interTxId ? { interTxId: x.interTxId } : {}),
    });
  }
  return out;
}

/**
 * Sincroniza uma conta. Devolve quantos itens novos entraram em "A conciliar".
 * Lança InterSyncError (mensagem legível) em qualquer falha.
 */
export async function syncOwner(
  db: any,
  ownerUid: string,
  now: number = Date.now(),
  deps: SyncDeps = {}
): Promise<{ novos: number }> {
  const fetcher = deps.fetchExtrato ?? fetchExtrato;
  const conexaoRef = db.doc(`integracoesBanco/${ownerUid}`);
  const statusRef = db.doc(`users/${ownerUid}/profile/interStatus`);

  // Conexão ausente: nada a registrar no status (a conta está desconectada).
  let conexao: Record<string, any>;
  try {
    const snap = await conexaoRef.get();
    if (!snap.exists) throw new InterSyncError(MSG_NAO_CONECTADO, "nao-conectado");
    conexao = snap.data() ?? {};
  } catch (e) {
    if (e instanceof InterSyncError) throw e;
    throw new InterSyncError(MSG_FALHA, "falha");
  }

  try {
    let secrets: InterSecrets;
    try {
      secrets = decryptInterSecrets(conexao as EncryptedInterSecrets);
    } catch {
      throw new InterSyncError(MSG_CONFIG, "config");
    }
    // `conta` fica em claro no documento, fora do envelope cifrado.
    if (typeof conexao.conta === "string" && conexao.conta) secrets.conta = conexao.conta;

    const lastSyncAt = typeof conexao.lastSyncAt === "number" ? conexao.lastSyncAt : undefined;
    const { from, to } = planSync({ lastSyncAt, now });

    let txs: InterTx[];
    try {
      txs = await fetcher(secrets, from, to);
    } catch (e) {
      throw new InterSyncError(mensagemSegura(e), "falha");
    }

    let novos = 0;
    if (txs.length > 0) {
      const entries = await lerCashflow(db, ownerUid, from, to);
      const suggestions = suggestAll(txs, entries);
      const pendCol = db.collection(`users/${ownerUid}/interPendentes`);

      // Em lotes: cada lote é uma transação que LÊ os ids e só grava os que não
      // existem. Ler dentro da transação (e não antes) impede que uma
      // sincronização concorrente (botão + cron) sobrescreva um item que o
      // usuário acabou de conciliar/ignorar.
      for (let i = 0; i < txs.length; i += LOTE) {
        const lote = txs.slice(i, i + LOTE);
        const refs = lote.map((t) => pendCol.doc(pendenteDocId(t.txKey)));
        novos += await db.runTransaction(async (t: any) => {
          const snaps = await t.getAll(...refs);
          const existing = new Map<string, InterPendente>();
          snaps.forEach((s: any, k: number) => {
            if (s.exists) existing.set(lote[k].txKey, s.data() as InterPendente);
          });
          const novosLote = mergePendentes(existing, lote, suggestions, now);
          for (const p of novosLote) t.set(pendCol.doc(pendenteDocId(p.txKey)), p);
          return novosLote.length;
        });
      }
    }

    // Cursor só avança se a conexão ainda é a mesma (desconectar/reconectar no
    // meio da sincronização não pode herdar o cursor desta).
    await db.runTransaction(async (t: any) => {
      const atual = await t.get(conexaoRef);
      if (!atual.exists || (atual.data() ?? {}).createdAt !== conexao.createdAt) return;
      t.update(conexaoRef, { lastSyncAt: now });
      t.set(statusRef, { lastSyncAt: now, lastSyncError: null }, { merge: true });
    });
    return { novos };
  } catch (e) {
    const err = e instanceof InterSyncError ? e : new InterSyncError(MSG_FALHA, "falha");
    // Pendentes já gravados ficam; o cursor NÃO avança (a próxima rodada refaz a janela).
    await statusRef.set({ lastSyncError: err.message }, { merge: true }).catch(() => undefined);
    throw err;
  }
}
