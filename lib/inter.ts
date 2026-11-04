// Banco Inter (API Empresas): extrato via mTLS. Formato conferido numa cópia de terceiros do
// OpenAPI do Inter (edusouza/inter-pj-cli, spec/), NÃO contra a documentação oficial ao vivo
// (developers.inter.co) nem contra uma conta real. Endpoint: GET /banking/v2/extrato/completo,
// escopo extrato.read, máx. 90 dias por consulta, 10 chamadas/min (token: 5/min, validade 60 min).
import https from "node:https";
import { createHash, X509Certificate } from "node:crypto";
import type { InterSecrets } from "./interCrypto";

export type InterTx = {
  txKey: string;
  date: string; // YYYY-MM-DD
  amount: number; // positivo
  type: "entrada" | "saida";
  description: string;
  counterparty?: string;
};

const HOST = "cdpj.partners.bancointer.com.br";
const MAX_DAYS = 90;
// ASSUNÇÃO (não verificado contra conta real): tamanhoPagina=1000 é aceito pela API.
const PAGE_SIZE = 1000;
const MAX_PAGES = 50;

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// ---------- puras ----------

/** Nome da contraparte a partir de `detalhes` (Pix, transferência, pagamento, boleto, compra no débito). */
function counterpartyOf(detalhes: unknown, entrada: boolean): string | undefined {
  if (!isRec(detalhes)) return undefined;
  const ordem = entrada
    ? ["nomePagador", "nomeEmpresaPagador", "nomeOrigem", "nome"]
    : ["nomeRecebedor", "nomeEmpresaRecebedor", "nomeDestinatario", "estabelecimento", "nomeEmpresa", "nome"];
  for (const k of ordem) {
    const v = str(detalhes[k]);
    if (v) return v;
  }
  return undefined;
}

/**
 * Valor monetário → número positivo. Aceita number, "150.50" e pt-BR ("1.234,56": com vírgula,
 * pontos são milhar). Negativo vira positivo (o sinal vem de tipoOperacao). Valor ausente ou
 * ilegível lança erro em português (nunca some em silêncio); 0 é válido e o chamador descarta.
 * ASSUNÇÃO (não verificado contra conta real): formato do `valor` (string decimal com ponto).
 */
function parseValor(v: unknown): number {
  let n = NaN;
  if (typeof v === "number") n = v;
  else if (typeof v === "string" && v.trim()) {
    const t = v.trim();
    n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  }
  if (!Number.isFinite(n)) throw new Error("O Banco Inter devolveu um lançamento com valor ausente ou ilegível. Nada foi importado.");
  return Math.abs(n);
}

/**
 * Converte a resposta do extrato (simples ou completo) em transações.
 * `txKey`: usa `idTransacao` quando existe; senão um hash de data+tipo+valor+descrição
 * com um contador de ordem (para transações idênticas no mesmo dia). O contador vale por chamada:
 * para o fallback ser estável, passe TODAS as linhas da janela de uma vez (ver fetchExtrato).
 */
export function parseExtrato(raw: unknown): InterTx[] {
  if (!isRec(raw) || !Array.isArray(raw.transacoes)) return [];
  const vistos = new Map<string, number>();
  const out: InterTx[] = [];
  for (const item of raw.transacoes) {
    if (!isRec(item)) continue;
    const op = str(item.tipoOperacao).toUpperCase();
    if (op !== "C" && op !== "D") continue;
    const amount = parseValor(item.valor);
    if (amount === 0) continue;
    // ASSUNÇÃO (não verificado contra conta real): prioridade dataEntrada → dataInclusao → dataTransacao.
    const date = (str(item.dataEntrada) || str(item.dataInclusao) || str(item.dataTransacao)).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const type = op === "C" ? "entrada" : "saida";
    const description = str(item.descricao) || str(item.titulo) || str(item.tipoTransacao) || "Movimento Inter";
    const id = str(item.idTransacao);
    let txKey: string;
    if (id) {
      txKey = `id:${id}`;
    } else {
      const base = `${date}|${type}|${Math.round(amount * 100)}|${description}`;
      const n = (vistos.get(base) ?? 0) + 1;
      vistos.set(base, n);
      txKey = "h:" + createHash("sha1").update(`${base}|${n}`).digest("hex").slice(0, 24);
    }
    const counterparty = counterpartyOf(item.detalhes, type === "entrada");
    out.push({ txKey, date, amount, type, description, ...(counterparty ? { counterparty } : {}) });
  }
  return out;
}

const DAY = 86400000;
const toMs = (iso: string) => Date.parse(iso + "T00:00:00Z");
const toISO = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Divide [from, to] (inclusive) em janelas consecutivas de até `maxDays` dias. */
export function windowsBetween(from: string, to: string, maxDays = MAX_DAYS): Array<{ from: string; to: string }> {
  const a = toMs(from), b = toMs(to);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a > b) return [];
  const out: Array<{ from: string; to: string }> = [];
  for (let s = a; s <= b; s += maxDays * DAY) {
    out.push({ from: toISO(s), to: toISO(Math.min(s + (maxDays - 1) * DAY, b)) });
  }
  return out;
}

/** Validade do certificado (epoch ms). */
export function certExpiresAt(certPem: string): number {
  try {
    return Date.parse(new X509Certificate(certPem).validTo);
  } catch {
    throw new Error("Certificado do Banco Inter inválido. Envie o arquivo .crt (PEM) gerado no Internet Banking.");
  }
}

// ---------- HTTP (mTLS) ----------

type Resp = { status: number; body: string };

function request(agent: https.Agent, method: string, path: string, headers: Record<string, string>, body?: string): Promise<Resp> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { host: HOST, port: 443, method, path, agent, headers: body ? { ...headers, "Content-Length": String(Buffer.byteLength(body)) } : headers, timeout: 20000 },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

/** Erros de rede/TLS → mensagem em português, sem vazar certificado, chave ou segredo. */
function mapNetworkError(e: unknown): Error {
  const code = isRec(e) ? str(e.code) : "";
  const msg = e instanceof Error ? e.message : "";
  if (/timeout|ETIMEDOUT|ECONN|ENOTFOUND|EAI_AGAIN/i.test(code + " " + msg)) {
    return new Error("Não foi possível falar com o Banco Inter agora. Tente novamente em instantes.");
  }
  if (/CERT|SSL|TLS|PEM|key|DECODER|handshake/i.test(code + " " + msg)) {
    return new Error("Certificado ou chave do Banco Inter inválidos, expirados ou não correspondem à aplicação.");
  }
  return new Error("Falha ao consultar o Banco Inter.");
}

function mapStatus(status: number): Error {
  if (status === 400 || status === 401) return new Error("Credenciais do Banco Inter inválidas (Client ID/Secret) ou sem o escopo extrato.read.");
  if (status === 403) return new Error("Acesso negado pelo Banco Inter: verifique se a aplicação tem o escopo extrato.read e a conta correta.");
  if (status === 429) return new Error("Limite de requisições do Banco Inter atingido. Aguarde um minuto e tente novamente.");
  if (status >= 500) return new Error("O Banco Inter está indisponível no momento. Tente novamente mais tarde.");
  return new Error(`O Banco Inter recusou a consulta (HTTP ${status}).`);
}

function makeAgent(s: InterSecrets): https.Agent {
  try {
    return new https.Agent({ cert: s.certPem, key: s.keyPem, keepAlive: false });
  } catch {
    throw new Error("Certificado ou chave do Banco Inter inválidos.");
  }
}

async function getToken(agent: https.Agent, s: InterSecrets): Promise<string> {
  const form = new URLSearchParams({
    client_id: s.clientId,
    client_secret: s.clientSecret,
    grant_type: "client_credentials",
    scope: "extrato.read",
  }).toString();
  let r: Resp;
  try {
    r = await request(agent, "POST", "/oauth/v2/token", { "Content-Type": "application/x-www-form-urlencoded" }, form);
  } catch (e) {
    throw mapNetworkError(e);
  }
  if (r.status !== 200) throw mapStatus(r.status);
  try {
    const t = str((JSON.parse(r.body) as Rec).access_token);
    if (t) return t;
  } catch { /* cai no erro abaixo */ }
  throw new Error("Resposta inesperada do Banco Inter ao autenticar.");
}

async function getJson(agent: https.Agent, s: InterSecrets, token: string, path: string): Promise<unknown> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  // ASSUNÇÃO (não verificado contra conta real): x-conta-corrente só dígitos, sem zeros à esquerda.
  const conta = str(s.conta).replace(/\D/g, "").replace(/^0+/, "");
  if (conta) headers["x-conta-corrente"] = conta;
  let r: Resp;
  try {
    r = await request(agent, "GET", path, headers);
  } catch (e) {
    throw mapNetworkError(e);
  }
  if (r.status !== 200) throw mapStatus(r.status);
  try {
    return JSON.parse(r.body);
  } catch {
    throw new Error("Resposta inesperada do Banco Inter.");
  }
}

/** Busca o extrato completo (com contraparte) entre duas datas, dividindo em janelas de 90 dias e paginando. */
export async function fetchExtrato(secrets: InterSecrets, from: string, to: string): Promise<InterTx[]> {
  const agent = makeAgent(secrets);
  try {
    const token = await getToken(agent, secrets);
    const all: InterTx[] = [];
    for (const w of windowsBetween(from, to)) {
      // Junta as linhas de todas as páginas da janela e faz UM parse: o contador de ordem do txKey
      // (fallback sem idTransacao) fica único na janela e independe do tamanho de página.
      const linhas: unknown[] = [];
      // ASSUNÇÃO (não verificado contra conta real): `pagina` é 0-based e totalPaginas conta páginas.
      for (let pagina = 0; pagina < MAX_PAGES; pagina++) {
        const q = new URLSearchParams({ dataInicio: w.from, dataFim: w.to, pagina: String(pagina), tamanhoPagina: String(PAGE_SIZE) });
        const raw = await getJson(agent, secrets, token, `/banking/v2/extrato/completo?${q}`);
        if (isRec(raw) && Array.isArray(raw.transacoes)) linhas.push(...raw.transacoes);
        const total = isRec(raw) ? Number(raw.totalPaginas) : 0;
        if (!Number.isFinite(total) || pagina + 1 >= total) break;
      }
      all.push(...parseExtrato({ transacoes: linhas }));
    }
    return all;
  } finally {
    agent.destroy();
  }
}

/** Valida certificado + credenciais obtendo um token (sem consultar o extrato). */
export async function interTestConnection(secrets: InterSecrets): Promise<void> {
  if (certExpiresAt(secrets.certPem) < Date.now()) {
    throw new Error("O certificado do Banco Inter está expirado. Gere um novo no Internet Banking.");
  }
  const agent = makeAgent(secrets);
  try {
    await getToken(agent, secrets);
  } finally {
    agent.destroy();
  }
}
