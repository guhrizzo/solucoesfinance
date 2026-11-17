// Banco Inter: cliente da API Cobrança V3 (boleto com Pix) via mTLS.
// Conferido na documentação oficial: emissão é ASSÍNCRONA (POST /cobrancas devolve só
// { codigoSolicitacao }; a situação vem depois por consulta/webhook). Host: interApiHost() em lib/inter.ts
// (produção por padrão; sandbox via INTER_API_HOST), prefixo /cobranca/v3, escopos boleto-cobranca.write / boleto-cobranca.read.
// A FORMA EXATA da resposta de consulta (campos aninhados em cobranca/boleto/pix) NÃO foi verificada
// no sandbox: todo mapeamento incerto está marcado com "ASSUNÇÃO (não verificado no sandbox)".
import type { InterSecrets } from "./interCrypto";
import type { BoletoSituacao } from "./interBoletoTypes";
import type { PagadorEndereco } from "./pagadorEndereco";
import { getToken, InterConfigError, makeAgent, mapNetworkError, request } from "./inter";

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
  /** Nosso identificador (id do boleto), quando o Inter o repete na resposta. */
  seuNumero?: string;
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

/** Erro HTTP do Inter: mensagem em português (sem o corpo) + o status, para o chamador distinguir recusa de falha. */
export class InterHttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "InterHttpError";
    this.status = status;
  }
}

/** Mensagem em português por status HTTP, sem vazar o corpo da resposta. */
function erroHttp(status: number): InterHttpError {
  const e = (m: string) => new InterHttpError(m, status);
  // 400 na chamada de cobrança é dado recusado (o 400/401 do token é tratado em getToken).
  if (status === 400) return e("O Banco Inter recusou os dados da cobrança (HTTP 400). Confira documento, endereço e valores.");
  if (status === 401) return e("Credenciais do Banco Inter inválidas (Client ID/Secret). Reconecte o Banco Inter.");
  if (status === 403) return e("A aplicação do Banco Inter está sem o escopo de cobrança (boleto-cobranca). Ative-o no Internet Banking e reconecte.");
  if (status === 404) return e("Cobrança não encontrada no Banco Inter.");
  if (status === 429) return e("Limite de requisições do Banco Inter atingido. Aguarde um minuto e tente novamente.");
  if (status >= 500) return e("O Banco Inter está indisponível no momento. Tente novamente mais tarde.");
  return e(`O Banco Inter recusou a solicitação de cobrança (HTTP ${status}).`);
}

/**
 * Falha do próprio transporte, antes de haver resposta HTTP (mensagem nossa, em português).
 * fase "token": nada foi enviado ao endpoint de cobrança; fase "chamada": a requisição
 * pode ter chegado ao Inter (ambíguo para uma emissão).
 */
export class InterRedeError extends Error {
  fase: "token" | "chamada";
  constructor(message: string, fase: "token" | "chamada") {
    super(message);
    this.name = "InterRedeError";
    this.fase = fase;
  }
}

const msgDe = (e: unknown) => (e instanceof Error && e.message ? e.message : "Falha ao consultar o Banco Inter.");

type Agente = { destroy(): void };

/** Primitivas de rede (injetáveis só nos testes; padrão = lib/inter.ts). */
export type RedeInter = {
  makeAgent: (s: InterSecrets) => Agente;
  getToken: (agent: Agente, s: InterSecrets, scope: string) => Promise<string>;
  request: (agent: Agente, method: string, path: string, headers: Record<string, string>, body?: string) => Promise<{ status: number; body: string }>;
};

const REDE_REAL = { makeAgent, getToken, request } as unknown as RedeInter;

/**
 * Transporte real: por chamada abre o agente mTLS, faz a chamada e destrói o agente.
 * O token fica guardado POR ESCOPO durante a vida desta instância (o Inter limita a
 * emissão de tokens a 5/min): consultas/emissões em lote reaproveitam o mesmo.
 * Um 401 na chamada renova o token uma única vez e repete (sem laço).
 */
export function transporteMtls(secrets: InterSecrets, rede: RedeInter = REDE_REAL): Transporte {
  const tokens = new Map<string, Promise<string>>();
  const tokenDe = (agent: Agente, scope: string, renovar: boolean): Promise<string> => {
    if (renovar) tokens.delete(scope);
    let p = tokens.get(scope);
    if (!p) {
      const novo = rede.getToken(agent, secrets, scope);
      p = novo;
      tokens.set(scope, novo);
      // Falha não fica em cache: a próxima chamada tenta de novo.
      novo.catch(() => {
        if (tokens.get(scope) === novo) tokens.delete(scope);
      });
    }
    return p;
  };
  return async ({ method, path, scope, body }) => {
    const agent = rede.makeAgent(secrets);
    try {
      const headers: Record<string, string> = { Accept: "application/json" };
      // ASSUNÇÃO (não verificado no sandbox): x-conta-corrente só dígitos, sem zeros à esquerda (igual ao extrato).
      const conta = str(secrets.conta).replace(/\D/g, "").replace(/^0+/, "");
      if (conta) headers["x-conta-corrente"] = conta;
      let payload: string | undefined;
      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
        payload = JSON.stringify(body);
      }
      let r: { status: number; body: string } | undefined;
      for (let tentativa = 0; tentativa < 2; tentativa++) {
        let token: string;
        try {
          token = await tokenDe(agent, scope, tentativa > 0);
        } catch (e) {
          // Host inválido (INTER_API_HOST) é configuração do servidor, não rede: passa intacto.
          if (e instanceof InterConfigError) throw e;
          // getToken já devolve mensagens nossas (credencial, escopo, rede).
          throw new InterRedeError(msgDe(e), "token");
        }
        try {
          r = await rede.request(agent, method, path, { ...headers, Authorization: `Bearer ${token}` }, payload);
        } catch (e) {
          if (e instanceof InterConfigError) throw e;
          throw new InterRedeError(mapNetworkError(e).message, "chamada");
        }
        // 401 = token recusado: a chamada não foi processada, repetir com token novo é seguro.
        if (r.status !== 401) break;
      }
      if (!r) throw new Error("Falha ao consultar o Banco Inter.");
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
  if (!Number.isFinite(n) || n < 0) throw new Error("O Banco Inter devolveu um valor ilegível na cobrança.");
  return n;
}

/** Corpo do POST /cobrancas. */
export function buildEmitBody(i: EmitirInput): Record<string, unknown> {
  const doc = i.pagador.doc.replace(/\D/g, "");
  if (doc.length !== 11 && doc.length !== 14) throw new Error("Documento do pagador inválido: informe CPF (11 dígitos) ou CNPJ (14 dígitos).");
  if (!Number.isFinite(i.valorNominal) || i.valorNominal <= 0) throw new Error("O valor do boleto precisa ser maior que zero.");
  const tel = (i.pagador.telefone ?? "").replace(/\D/g, "");
  // ASSUNÇÃO (não verificado no sandbox): ddd = 2 primeiros dígitos e telefone = restante (sem DDI 55).
  const semDdi = tel.length > 11 && tel.startsWith("55") ? tel.slice(2) : tel;
  const ddd = semDdi.length >= 10 ? semDdi.slice(0, 2) : "";
  const numero = semDdi.length >= 10 ? semDdi.slice(2) : semDdi;
  const e = i.pagador.endereco;
  const pagador: Record<string, unknown> = {
    cnpjCpf: doc,
    nome: i.pagador.nome,
    tipoPessoa: doc.length === 14 ? "JURIDICA" : "FISICA",
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
  const seu = str(achar(objs, "seuNumero"));
  if (seu) out.seuNumero = seu;
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

const MSG_NAO_CORRESPONDE = "O Banco Inter devolveu uma cobrança que não corresponde à solicitada.";

export async function emitirCobranca(t: Transporte, i: EmitirInput): Promise<{ codigoSolicitacao: string }> {
  const json = await chamar(t, { method: "POST", path: `${BASE}/cobrancas`, scope: SCOPE_WRITE, body: buildEmitBody(i) });
  const codigo = isRec(json) ? str(json.codigoSolicitacao) : "";
  if (!codigo) throw new Error("Resposta inesperada do Banco Inter ao emitir a cobrança.");
  // O POST devolve só o código; se o Inter repetir o seuNumero, tem de ser o nosso.
  const seu = isRec(json) ? str(json.seuNumero) : "";
  if (seu && seu !== i.seuNumero) throw new Error(MSG_NAO_CORRESPONDE);
  return { codigoSolicitacao: codigo };
}

export async function consultarCobranca(t: Transporte, codigo: string): Promise<CobrancaInter> {
  const json = await chamar(t, { method: "GET", path: `${BASE}/cobrancas/${encodeURIComponent(codigo)}`, scope: SCOPE_READ });
  const c = parseCobranca(json);
  if (c.codigoSolicitacao && c.codigoSolicitacao !== codigo) throw new Error(MSG_NAO_CORRESPONDE);
  // A consulta é pelo código: usa-o quando a resposta não o repete.
  return c.codigoSolicitacao ? c : { ...c, codigoSolicitacao: codigo };
}

/**
 * Procura a cobrança pelo nosso seuNumero na listagem (recupera um boleto cujo
 * codigoSolicitacao não chegou a ser gravado). null = não encontrada; mais de
 * uma com o mesmo seuNumero lança (nunca escolhe por palpite).
 * ASSUNÇÃO (não verificado no sandbox): GET /cobrancas com dataInicial/dataFinal
 * obrigatórios, filtrarDataPor=EMISSAO e filtro seuNumero; resposta { cobrancas: [...] }
 * com cada item no mesmo formato da consulta individual.
 */
export async function buscarPorSeuNumero(
  t: Transporte,
  seuNumero: string,
  dataInicial: string,
  dataFinal: string,
): Promise<CobrancaInter | null> {
  const q = new URLSearchParams({ dataInicial, dataFinal, filtrarDataPor: "EMISSAO", seuNumero, itensPorPagina: "10", paginaAtual: "0" });
  const json = await chamar(t, { method: "GET", path: `${BASE}/cobrancas?${q}`, scope: SCOPE_READ });
  const lista = isRec(json) && Array.isArray(json.cobrancas) ? json.cobrancas : [];
  const achadas = lista.map((x) => parseCobranca(x)).filter((c) => c.seuNumero === seuNumero && c.codigoSolicitacao);
  if (achadas.length > 1) throw new Error("O Banco Inter tem mais de uma cobrança com o mesmo identificador. Confira no Internet Banking.");
  return achadas[0] ?? null;
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
  const buf = Buffer.from(b64, "base64");
  if (buf.length === 0 || buf.subarray(0, 4).toString("latin1") !== "%PDF") {
    throw new Error("O Banco Inter devolveu um arquivo que não é um PDF válido.");
  }
  return buf;
}

export async function registrarWebhook(t: Transporte, url: string): Promise<void> {
  // ASSUNÇÃO (não verificado no sandbox): corpo { webhookUrl }.
  await chamar(t, { method: "PUT", path: `${BASE}/cobrancas/webhook`, scope: SCOPE_WRITE, body: { webhookUrl: url } });
}
