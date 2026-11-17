// lib/interBoletoWebhook.ts
// Banco Inter: webhook PÚBLICO de boletos (sem login) e a ativação da cobrança
// pelo adm supremo. SOMENTE servidor (Admin SDK).
//
// Webhook — defesa em camadas (o corpo do Inter NUNCA é confiado):
//  1. token secreto de 32 bytes na URL, por conta. Só o sha256 dele é guardado:
//     índice interWebhookTokens/{sha256} → { ownerUid } e
//     integracoesBanco/{ownerUid}.cobranca.token = sha256 (comparado em tempo
//     constante). Token desconhecido, rotacionado ou conta desconectada → 404,
//     sem processar nada;
//  2. cada callback só serve para ACHAR o boleto (seuNumero = id validado) e
//     conferir o codigoSolicitacao; a situação e o valor aplicados vêm SEMPRE
//     do GET /cobrancas/{codigo} feito por nós no Inter;
//  3. o núcleo aplicarSituacao é idempotente: repetição não duplica entrada.
// Erro de um callback não derruba os outros; a consulta de segurança (cron)
// cobre o que ficar para trás. Logs e retornos só com contagens.
//
// Ativação — testa os escopos de cobrança pedindo um token de cada; grava as
// flags (mesmo sem os escopos: o extrato continua intacto, nenhum campo da
// conexão é tocado além de `cobranca`); com escopo de escrita e URL pública
// HTTPS, gera um token novo, registra o webhook no Inter e só então troca o
// hash (rotação: o anterior deixa de valer).

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import type { Actor } from "./audit";
import type { BoletoDoc } from "./interBoletoTypes";
import { aplicarTudo, erroGeral, transporteDe } from "./interBoletoServer";
import { consultarCobranca, registrarWebhook, transporteMtls, type Transporte } from "./interCobranca";
import { getToken, interApiHost, makeAgent } from "./inter";
import { decryptInterSecrets, type EncryptedInterSecrets, type InterSecrets } from "./interCrypto";
import { writeAuditoria } from "./interAdminTarget";
import { errCode, SERVER_CONFIG_ERROR } from "./interErrors";

// ---------- token ----------

export const WEBHOOK_PATH = "/api/webhooks/inter-boletos";
export const TOKENS_COL = "interWebhookTokens";
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/; // 32 bytes em base64url
const HASH_RE = /^[0-9a-f]{64}$/;
const ID_RE = /^[0-9a-z]{1,15}$/;

export const SCOPE_WRITE = "boleto-cobranca.write";
export const SCOPE_READ = "boleto-cobranca.read";

export function hashWebhookToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function mesmoHash(a: unknown, b: string): boolean {
  if (typeof a !== "string" || !HASH_RE.test(a)) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/** Hash guardado em integracoesBanco/{ownerUid}.cobranca.token (ou null). */
export function hashDaConexao(conexao: Record<string, unknown> | undefined): string | null {
  const c = conexao?.cobranca as Record<string, unknown> | undefined;
  return c && typeof c.token === "string" && HASH_RE.test(c.token) ? c.token : null;
}

// ---------- webhook ----------

export const MAX_CALLBACKS = 50;
const WEBHOOK_ACTOR: Actor = { uid: "inter-webhook", name: "Banco Inter (aviso automático)" };

export type WebhookDeps = {
  /** Injetável nos testes; padrão = transporte mTLS com as credenciais da conta. */
  transporte?: Transporte;
  now?: number;
};

export type WebhookResultado = {
  status: 200 | 404;
  processados: number;
  ignorados: number;
  falhas: number;
  /** Só para log: contagem por motivo (nunca dado do corpo). */
  motivos: Record<string, number>;
};

const NAO_ACHADO = (): WebhookResultado => ({ status: 404, processados: 0, ignorados: 0, falhas: 0, motivos: {} });

/** Resolve o token → ownerUid. null = desconhecido, rotacionado ou conta sem cobrança ativa/conexão. */
async function donoDoToken(db: Firestore, token: unknown): Promise<string | null> {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return null;
  const hash = hashWebhookToken(token);
  const idx = await db.doc(`${TOKENS_COL}/${hash}`).get();
  if (!idx.exists) return null;
  const ownerUid = (idx.data() ?? {}).ownerUid;
  if (typeof ownerUid !== "string" || !ownerUid || ownerUid.includes("/")) return null;
  const con = await db.doc(`integracoesBanco/${ownerUid}`).get();
  if (!con.exists) return null;
  const c = (con.data() ?? {}).cobranca as Record<string, unknown> | undefined;
  if (!c || !mesmoHash(c.token, hash)) return null;
  return ownerUid;
}

/**
 * Processa o corpo do webhook (array de callbacks; objeto único é tolerado).
 * Token inválido → 404 sem tocar em nada. Token válido → 200 sempre (o Inter
 * só reenvia em falha; o cron cobre o que não deu certo aqui).
 */
export async function processarCallbacks(
  db: Firestore,
  token: string,
  corpo: unknown,
  deps: WebhookDeps = {},
): Promise<WebhookResultado> {
  const ownerUid = await donoDoToken(db, token);
  if (!ownerUid) return NAO_ACHADO();

  const now = deps.now ?? Date.now();
  const lista = Array.isArray(corpo) ? corpo : corpo && typeof corpo === "object" ? [corpo] : [];
  const out: WebhookResultado = { status: 200, processados: 0, ignorados: 0, falhas: 0, motivos: {} };
  const conta = (motivo: string, campo: "ignorados" | "falhas") => {
    out[campo]++;
    out.motivos[motivo] = (out.motivos[motivo] ?? 0) + 1;
  };

  const vistos = new Set<string>();
  let t: Transporte | null = null;
  for (const item of lista.slice(0, MAX_CALLBACKS)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      conta("formato", "ignorados");
      continue;
    }
    const cbk = item as Record<string, unknown>;
    const id = cbk.seuNumero;
    if (typeof id !== "string" || !ID_RE.test(id)) {
      conta("seu-numero-invalido", "ignorados");
      continue;
    }
    if (vistos.has(id)) {
      conta("repetido", "ignorados");
      continue;
    }
    vistos.add(id);

    try {
      const snap = await db.doc(`users/${ownerUid}/boletos/${id}`).get();
      if (!snap.exists) {
        conta("desconhecido", "ignorados");
        continue;
      }
      const b = snap.data() as BoletoDoc;
      const codigoCb = typeof cbk.codigoSolicitacao === "string" ? cbk.codigoSolicitacao.trim() : "";
      if (!b.codigoSolicitacao || codigoCb !== b.codigoSolicitacao) {
        // Sem código local (emissão não confirmada) ou divergente: não confia no
        // corpo. O "Atualizar"/cron recupera pelo seuNumero.
        conta("codigo-divergente", "ignorados");
        continue;
      }
      if (!t) t = await transporteDe(db, ownerUid, deps);
      const remoto = await consultarCobranca(t, b.codigoSolicitacao);
      if (remoto.situacao === "EM_PROCESSAMENTO") {
        conta("em-processamento", "ignorados");
        continue;
      }
      await aplicarTudo(db, ownerUid, id, remoto, WEBHOOK_ACTOR, now);
      out.processados++;
    } catch (e) {
      conta(e instanceof Error && e.name ? e.name : errCode(e), "falhas");
      // Credencial/rede/limite/Inter fora: os próximos falhariam igual. Para aqui; o cron cobre.
      if (erroGeral(e) || (e as { kind?: unknown })?.kind === "config" || (e as { kind?: unknown })?.kind === "nao-conectado") break;
    }
  }
  if (lista.length > MAX_CALLBACKS) out.motivos["acima-do-limite"] = lista.length - MAX_CALLBACKS;
  return out;
}

// ---------- ativação (adm supremo) ----------

export type EscopoTeste = "ok" | "sem-escopo" | "falha";

export type AtivarDeps = {
  /** Pede um token do escopo; padrão = token real no Inter com as credenciais da conta. */
  testarEscopo?: (scope: string) => Promise<EscopoTeste>;
  /** Transporte para registrar o webhook; padrão = mTLS com as credenciais da conta. */
  transporte?: Transporte;
  /** Padrão: process.env.NEXT_PUBLIC_APP_URL. */
  appUrl?: string;
  /** Padrão: NODE_ENV === "production". */
  producao?: boolean;
  /** Dados extras da auditoria (e-mails). */
  auditoria?: { adminEmail?: string | null; alvoEmail?: string };
  now?: number;
};

export type AtivarResultado =
  | { ok: true; escopos: { write: boolean; read: boolean }; webhook: boolean }
  | { ok: false; status: number; error: string };

const MSG_URL =
  "Configure NEXT_PUBLIC_APP_URL com o endereço público HTTPS do app (ex.: https://app.seudominio.com.br) para registrar o webhook do Banco Inter. O localhost não recebe avisos do Inter.";
const MSG_NAO_CONECTADO = "O Banco Inter não está conectado. Conecte primeiro.";
const MSG_FALHA_ESCOPO = "Não foi possível falar com o Banco Inter para conferir os escopos de cobrança. Tente novamente em instantes.";
const MSG_GRAVAR = "Não foi possível salvar a ativação dos boletos. Tente novamente.";

/** Origem HTTPS pública a partir de NEXT_PUBLIC_APP_URL; null quando não serve para webhook. */
export function origemPublica(appUrl: string | undefined): string | null {
  if (!appUrl || !appUrl.trim()) return null;
  let u: URL;
  try {
    u = new URL(appUrl.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h === "127.0.0.1" || h === "[::1]" || h === "::1") return null;
  return u.origin;
}

/** Classifica a falha ao pedir token: recusa por credencial/escopo vs. falha transitória. */
function classificar(e: unknown): EscopoTeste {
  const m = e instanceof Error ? e.message : "";
  // Mensagens de lib/inter.ts mapStatus: 400/401 "Credenciais ... sem o escopo", 403 "Acesso negado ... escopo".
  if (/escopo|Credenciais|Acesso negado/i.test(m)) return "sem-escopo";
  return "falha";
}

function testadorReal(secrets: InterSecrets) {
  return async (scope: string): Promise<EscopoTeste> => {
    let agent: ReturnType<typeof makeAgent>;
    try {
      agent = makeAgent(secrets);
    } catch {
      return "falha";
    }
    try {
      await getToken(agent, secrets, scope);
      return "ok";
    } catch (e) {
      return classificar(e);
    } finally {
      agent.destroy();
    }
  };
}

export async function ativarBoletos(
  db: Firestore,
  ownerUid: string,
  adminUid: string,
  deps: AtivarDeps = {},
): Promise<AtivarResultado> {
  const now = deps.now ?? Date.now();
  const producao = deps.producao ?? process.env.NODE_ENV === "production";
  const appUrl = "appUrl" in deps ? deps.appUrl : process.env.NEXT_PUBLIC_APP_URL;

  const auditar = async (r: AtivarResultado) => {
    await writeAuditoria(db, {
      adminUid,
      adminEmail: deps.auditoria?.adminEmail ?? "",
      alvoOwnerUid: ownerUid,
      alvoEmail: deps.auditoria?.alvoEmail ?? "",
      provider: "inter",
      acao: "ativar-boletos",
      ok: r.ok,
      ...(r.ok ? { detalhe: { write: r.escopos.write, read: r.escopos.read, webhook: r.webhook } } : { erro: r.error }),
    });
    return r;
  };
  const falhar = (status: number, error: string) => auditar({ ok: false, status, error });

  const origem = origemPublica(appUrl);
  if (!origem && producao) return falhar(400, MSG_URL);

  const conRef = db.doc(`integracoesBanco/${ownerUid}`);
  let testar = deps.testarEscopo;
  let transporte = deps.transporte;
  try {
    const snap = await conRef.get();
    if (!snap.exists) return falhar(404, MSG_NAO_CONECTADO);
    if (!testar || !transporte) {
      const data = snap.data() ?? {};
      let secrets: InterSecrets;
      try {
        secrets = decryptInterSecrets(data as unknown as EncryptedInterSecrets);
      } catch {
        return falhar(500, SERVER_CONFIG_ERROR);
      }
      if (typeof data.conta === "string" && data.conta) secrets.conta = data.conta;
      // INTER_API_HOST inválido: erro de configuração (500), nunca "sem escopo" nem falha do Inter.
      try {
        interApiHost();
      } catch {
        return falhar(500, SERVER_CONFIG_ERROR);
      }
      testar ??= testadorReal(secrets);
      transporte ??= transporteMtls(secrets);
    }
  } catch (e) {
    console.error("[inter/boletos ativar] falha ao ler conexão:", errCode(e));
    return falhar(500, "Não foi possível ler a conexão com o Banco Inter.");
  }

  // Um de cada vez (o Inter limita a emissão de tokens por minuto).
  const w = await testar(SCOPE_WRITE);
  const r = await testar(SCOPE_READ);
  if (w === "falha" || r === "falha") return falhar(502, MSG_FALHA_ESCOPO);
  const escopos = { write: w === "ok", read: r === "ok" };

  // Webhook: só com escopo de escrita e URL pública HTTPS.
  let novoHash: string | null = null;
  if (escopos.write && origem) {
    const bruto = randomBytes(32).toString("base64url");
    try {
      await registrarWebhook(transporte!, `${origem}${WEBHOOK_PATH}/${bruto}`);
      novoHash = hashWebhookToken(bruto);
    } catch (e) {
      // Mantém o token anterior (o Inter continua com a URL antiga).
      console.error("[inter/boletos ativar] falha ao registrar webhook:", e instanceof Error ? e.name : errCode(e));
    }
  }

  try {
    await db.runTransaction(async (tx) => {
      const s = await tx.get(conRef);
      if (!s.exists) throw Object.assign(new Error("desconectado"), { code: "nao-conectado" });
      const data = s.data() ?? {};
      const antigo = hashDaConexao(data);
      const c = (data.cobranca ?? {}) as Record<string, unknown>;
      const token = novoHash ?? antigo;
      const temWebhook = novoHash ? true : !!antigo && c.webhook === true;
      if (novoHash) {
        tx.set(db.doc(`${TOKENS_COL}/${novoHash}`), { ownerUid, createdAt: now });
        if (antigo && antigo !== novoHash) tx.delete(db.doc(`${TOKENS_COL}/${antigo}`));
      }
      // Só o campo `cobranca`: credenciais, conta e cursor do extrato ficam como estão.
      tx.update(conRef, {
        cobranca: {
          ativo: escopos.write && escopos.read,
          token: token ?? null,
          escopos,
          webhook: temWebhook,
          atualizadoEm: now,
          atualizadoPor: adminUid,
        },
      });
      tx.set(
        db.doc(`users/${ownerUid}/profile/interStatus`),
        { cobrancaAtiva: escopos.write && escopos.read, cobrancaEscopos: escopos },
        { merge: true },
      );
    });
  } catch (e) {
    console.error("[inter/boletos ativar] falha ao gravar:", errCode(e));
    if ((e as { code?: unknown })?.code === "nao-conectado") return falhar(404, MSG_NAO_CONECTADO);
    return falhar(500, MSG_GRAVAR);
  }

  // `webhook` = registrado AGORA (a URL anterior, se houver, continua guardada na conexão).
  return auditar({ ok: true, escopos, webhook: novoHash !== null });
}
