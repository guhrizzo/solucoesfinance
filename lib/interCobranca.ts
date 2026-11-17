// Banco Inter: cliente da API Cobrança V3 (boleto com Pix) via mTLS.
// Conferido na documentação oficial: emissão é ASSÍNCRONA (POST /cobrancas devolve só
// { codigoSolicitacao }; a situação vem depois por consulta/webhook). Host cdpj.partners.bancointer.com.br,
// prefixo /cobranca/v3, escopos boleto-cobranca.write / boleto-cobranca.read.
// A FORMA EXATA da resposta de consulta (campos aninhados em cobranca/boleto/pix) NÃO foi verificada
// no sandbox: todo mapeamento incerto está marcado com "ASSUNÇÃO (não verificado no sandbox)".
import type { InterSecrets } from "./interCrypto";
import type { BoletoSituacao } from "./interBoletoTypes";
import type { PagadorEndereco } from "./pagadorEndereco";
import { getToken, makeAgent, mapNetworkError, request } from "./inter";

export type EmitirInput = {
  seuNumero: string;
  valorNominal: number;
  /** YYYY-MM-DD */
  dataVencimento: string;
  pagador: { nome: string; doc: string; email?: string; telefone?: string; endereco: PagadorEndereco };
  multaPercentual?: number;
  moraPercentualMensal?: number;
  mensagem?: string[];
};

export type CobrancaInter = {
  codigoSolicitacao: string;
  situacao: BoletoSituacao;
  linhaDigitavel?: string;
  codigoBarras?: string;
  nossoNumero?: string;
  pixCopiaECola?: string;
  valorTotalRecebido?: number;
  dataPagamento?: string;
  origemRecebimento?: "BOLETO" | "PIX";
};

export type Transporte = (req: {
  method: string;
  path: string;
  scope: string;
  body?: unknown;
}) => Promise<{ status: number; json: unknown }>;

const BASE = "/cobranca/v3";
const SCOPE_WRITE = "boleto-cobranca.write";
const SCOPE_READ = "boleto-cobranca.read";

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

const SITUACOES: ReadonlySet<string> = new Set<BoletoSituacao>([
  "EM_PROCESSAMENTO",
  "A_RECEBER",
  "ATRASADO",
  "RECEBIDO",
  "MARCADO_RECEBIDO",
  "CANCELADO",
  "EXPIRADO",
  "FALHA_EMISSAO",
  "PROTESTO",
]);

// ---------- transporte real (mTLS) ----------

/** Mensagem em português por status HTTP, sem vazar o corpo da resposta. */
function erroHttp(status: number): Error {
  if (status === 400 || status === 401) return new Error("Credenciais do Banco Inter inválidas (Client ID/Secret). Reconecte o Banco Inter.");
  if (status === 403) return new Error("A aplicação do Banco Inter está sem o escopo de cobrança (boleto-cobranca). Ative-o no Internet Banking e reconecte.");
  if (status === 404) return new Error("Cobrança não encontrada no Banco Inter.");
  if (status === 429) return new Error("Limite de requisições do Banco Inter atingido. Aguarde um minuto e tente novamente.");
  if (status >= 500) return new Error("O Banco Inter está indisponível no momento. Tente novamente mais tarde.");
  return new Error(`O Banco Inter recusou a solicitação de cobrança (HTTP ${status}).`);
}

/** Transporte real: abre o agente mTLS, pega o token do escopo, faz a chamada e destrói o agente. */
export function transporteMtls(secrets: InterSecrets): Transporte {
  return async ({ method, path, scope, body }) => {
    const agent = makeAgent(secrets);
    try {
      const token = await getToken(agent, secrets, scope);
      const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: "application/json" };
      // ASSUNÇÃO (não verificado no sandbox): x-conta-corrente só dígitos, sem zeros à esquerda (igual ao extrato).
      const conta = str(secrets.conta).replace(/\D/g, "").replace(/^0+/, "");
      if (conta) headers["x-conta-corrente"] = conta;
      let payload: string | undefined;
      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
        payload = JSON.stringify(body);
      }
      let r;
      try {
        r = await request(agent, method, path, headers, payload);
      } catch (e) {
        throw mapNetworkError(e);
      }
      let json: unknown = null;
      if (r.body) {
        try {
          json = JSON.parse(r.body);
        } catch {
          json = null;
        }
      }
      return { status: r.status, json };
    } finally {
      agent.destroy();
    }
  };
}

async function chamar(t: Transporte, req: Parameters<Transporte>[0]): Promise<unknown> {
  const r = await t(req);
  if (r.status < 200 || r.status >= 300) throw erroHttp(r.status);
  return r.json;
}

// ---------- puras ----------

const centavos = (v: number) => Math.round(v * 100 + 1e-6) / 100;

/** Valor monetário (número ou string decimal "150.50"; com vírgula, pontos são milhar). */
function valorOpcional(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  let n = NaN;
  if (typeof v === "number") n = v;
  else if (typeof v === "string") {
    const t = v.trim();
    n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  }
  if (!Number.isFinite(n)) throw new Error("O Banco Inter devolveu um valor ilegível na cobrança.");
  return Math.abs(n);
}

/** Corpo do POST /cobrancas. */
export function buildEmitBody(i: EmitirInput): Record<string, unknown> {
  const doc = i.pagador.doc.replace(/\D/g, "");
  const tel = (i.pagador.telefone ?? "").replace(/\D/g, "");
  // ASSUNÇÃO (não verificado no sandbox): ddd = 2 primeiros dígitos e telefone = restante (sem DDI 55).
  const semDdi = tel.length > 11 && tel.startsWith("55") ? tel.slice(2) : tel;
  const ddd = semDdi.length >= 10 ? semDdi.slice(0, 2) : "";
  const numero = semDdi.length >= 10 ? semDdi.slice(2) : semDdi;
  const e = i.pagador.endereco;
  const pagador: Record<string, unknown> = {
    cnpjCpf: doc,
    nome: i.pagador.nome,
    tipoPessoa: doc.length > 11 ? "JURIDICA" : "FISICA",
    cep: e.cep,
    endereco: e.logradouro,
    numero: e.numero,
    bairro: e.bairro,
    cidade: e.cidade,
    uf: e.uf,
  };
  if (e.complemento) pagador.complemento = e.complemento;
  if (i.pagador.email) pagador.email = i.pagador.email;
  if (numero) pagador.telefone = numero;
  if (ddd) pagador.ddd = ddd;

  const body: Record<string, unknown> = {
    seuNumero: i.seuNumero,
    valorNominal: centavos(i.valorNominal),
    dataVencimento: i.dataVencimento,
    numDiasAgenda: 30,
    pagador,
  };
  if (i.multaPercentual && i.multaPercentual > 0) {
    // ASSUNÇÃO (não verificado no sandbox): multa percentual usa `taxa` com codigoMulta PERCENTUAL.
    body.multa = { codigoMulta: "PERCENTUAL", taxa: i.multaPercentual };
  }
  if (i.moraPercentualMensal && i.moraPercentualMensal > 0) {
    // ASSUNÇÃO (não verificado no sandbox): mora mensal usa `taxa` com codigoMora TAXAMENSAL.
    body.mora = { codigoMora: "TAXAMENSAL", taxa: i.moraPercentualMensal };
  }
  const linhas = (i.mensagem ?? []).filter((l) => l.trim()).slice(0, 5);
  if (linhas.length) {
    const m: Record<string, string> = {};
    linhas.forEach((l, k) => (m[`linha${k + 1}`] = l));
    body.mensagem = m;
  }
  return body;
}

/** Primeiro valor não vazio de `chave` entre os objetos (topo, cobranca, boleto, pix). */
function achar(objs: Rec[], chave: string): unknown {
  for (const o of objs) {
    const v = o[chave];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

/** Resposta do GET /cobrancas/{codigo} → CobrancaInter (tolerante ao aninhamento). */
export function parseCobranca(raw: unknown): CobrancaInter {
  if (!isRec(raw)) throw new Error("Resposta inesperada do Banco Inter ao consultar a cobrança.");
  // ASSUNÇÃO (não verificado no sandbox): campos podem estar no topo ou em cobranca/boleto/pix.
  const objs: Rec[] = [raw];
  for (const k of ["cobranca", "boleto", "pix"]) if (isRec(raw[k])) objs.push(raw[k] as Rec);

  const situacao = str(achar(objs, "situacao")).toUpperCase();
  if (!SITUACOES.has(situacao)) throw new Error("Situação de cobrança desconhecida devolvida pelo Banco Inter.");

  const out: CobrancaInter = {
    codigoSolicitacao: str(achar(objs, "codigoSolicitacao")),
    situacao: situacao as BoletoSituacao,
  };
  // ASSUNÇÃO (não verificado no sandbox): nomes dos campos abaixo.
  const linha = str(achar(objs, "linhaDigitavel"));
  if (linha) out.linhaDigitavel = linha;
  const barras = str(achar(objs, "codigoBarras"));
  if (barras) out.codigoBarras = barras;
  const nosso = str(achar(objs, "nossoNumero"));
  if (nosso) out.nossoNumero = nosso;
  const pix = str(achar(objs, "pixCopiaECola")) || str(achar(objs, "pixCopiaCola"));
  if (pix) out.pixCopiaECola = pix;
  const valor = valorOpcional(achar(objs, "valorTotalRecebido"));
  if (valor !== undefined) out.valorTotalRecebido = valor;
  // ASSUNÇÃO (não verificado no sandbox): data do pagamento em dataSituacao/dataPagamento.
  const data = (str(achar(objs, "dataPagamento")) || str(achar(objs, "dataSituacao"))).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(data)) out.dataPagamento = data;
  // ASSUNÇÃO (não verificado no sandbox): origemRecebimento = BOLETO | PIX.
  const origem = str(achar(objs, "origemRecebimento")).toUpperCase();
  if (origem === "BOLETO" || origem === "PIX") out.origemRecebimento = origem;
  return out;
}

// ---------- operações ----------

export async function emitirCobranca(t: Transporte, i: EmitirInput): Promise<{ codigoSolicitacao: string }> {
  const json = await chamar(t, { method: "POST", path: `${BASE}/cobrancas`, scope: SCOPE_WRITE, body: buildEmitBody(i) });
  const codigo = isRec(json) ? str(json.codigoSolicitacao) : "";
  if (!codigo) throw new Error("Resposta inesperada do Banco Inter ao emitir a cobrança.");
  return { codigoSolicitacao: codigo };
}

export async function consultarCobranca(t: Transporte, codigo: string): Promise<CobrancaInter> {
  const json = await chamar(t, { method: "GET", path: `${BASE}/cobrancas/${encodeURIComponent(codigo)}`, scope: SCOPE_READ });
  const c = parseCobranca(json);
  // A consulta é pelo código: usa-o quando a resposta não o repete.
  return c.codigoSolicitacao ? c : { ...c, codigoSolicitacao: codigo };
}

export async function cancelarCobranca(t: Transporte, codigo: string, motivo: string): Promise<void> {
  // ASSUNÇÃO (não verificado no sandbox): corpo { motivoCancelamento }.
  await chamar(t, {
    method: "POST",
    path: `${BASE}/cobrancas/${encodeURIComponent(codigo)}/cancelar`,
    scope: SCOPE_WRITE,
    body: { motivoCancelamento: motivo },
  });
}

export async function pdfCobranca(t: Transporte, codigo: string): Promise<Buffer> {
  const json = await chamar(t, { method: "GET", path: `${BASE}/cobrancas/${encodeURIComponent(codigo)}/pdf`, scope: SCOPE_READ });
  const b64 = isRec(json) ? str(json.pdf) : "";
  if (!b64) throw new Error("Resposta inesperada do Banco Inter ao baixar o PDF.");
  return Buffer.from(b64, "base64");
}

export async function registrarWebhook(t: Transporte, url: string): Promise<void> {
  // ASSUNÇÃO (não verificado no sandbox): corpo { webhookUrl }.
  await chamar(t, { method: "PUT", path: `${BASE}/cobrancas/webhook`, scope: SCOPE_WRITE, body: { webhookUrl: url } });
}
