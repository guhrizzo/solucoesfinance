// Banco Inter: lógica pura da aba Boletos e do modal de emissão (sem I/O,
// sem node:*; roda no client). Regras de negócio ficam em interBoletoRegras.ts.

import { EMAIL_RE, isValidCnpj, isValidCpf } from "./contract";
import { grupoDe, type BoletoDoc, type BoletoGrupo, type BoletoSituacao } from "./interBoletoRegras";
import { validarEndereco, type PagadorEndereco } from "./pagadorEndereco";

/** Situações em que o boleto ainda vale (igual ao servidor: um vigente por conta a receber). */
const VIGENTES: ReadonlySet<BoletoSituacao> = new Set(["EM_PROCESSAMENTO", "A_RECEBER", "ATRASADO"]);

export const isVigente = (b: Pick<BoletoDoc, "situacao">) => VIGENTES.has(b.situacao);

const DESCARTE_MIN_MS = 24 * 60 * 60 * 1000;

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Hoje em São Paulo (YYYY-MM-DD). */
export const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

/** Valor sugerido do boleto = saldo restante da conta a receber, 2 casas, nunca negativo. */
export function valorSugerido(r: { amount: number; amountReceived?: number }): number {
  return Math.max(0, r2(r.amount - (r.amountReceived ?? 0)));
}

/** Vencimento sugerido: o da conta se ainda não passou; senão hoje. */
export function vencimentoSugerido(dueDate: string | undefined, hoje: string): string {
  return dueDate && dueDate >= hoje ? dueDate : hoje;
}

/** Boleto vigente (EM_PROCESSAMENTO/A_RECEBER/ATRASADO) ligado à conta a receber. */
export function boletoVigenteDe(receivableId: string, boletos: BoletoDoc[]): BoletoDoc | undefined {
  return boletos.find((b) => b.receivableId === receivableId && isVigente(b));
}

/** Um boleto vigente por conta a receber: só pode emitir se não houver nenhum. */
export function podeEmitir(receivable: { id: string }, boletos: BoletoDoc[]): boolean {
  return boletoVigenteDe(receivable.id, boletos) === undefined;
}

export type FiltroBoletos = {
  situacao: "todos" | BoletoGrupo;
  /** Vencimento inicial/final (YYYY-MM-DD, inclusivo); vazio = sem limite. */
  de: string;
  ate: string;
  busca: string;
  /** Mostra só os boletos desta conta a receber (vazio = todos). */
  receivableId: string;
  hoje: string;
};

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

export function filtrarBoletos(bs: BoletoDoc[], f: FiltroBoletos): BoletoDoc[] {
  const q = semAcento(f.busca);
  const qDigitos = f.busca.replace(/\D/g, "");
  return bs.filter((b) => {
    if (f.receivableId && b.receivableId !== f.receivableId) return false;
    if (f.situacao !== "todos" && grupoDe(b, f.hoje) !== f.situacao) return false;
    if (f.de && b.dueDate < f.de) return false;
    if (f.ate && b.dueDate > f.ate) return false;
    if (q) {
      const porNome = semAcento(b.payer.nome).includes(q);
      const porDoc = qDigitos.length > 0 && b.payer.doc.replace(/\D/g, "").includes(qDigitos);
      if (!porNome && !porDoc) return false;
    }
    return true;
  });
}

/** Boleto sem código do Inter, ainda em processamento há 24 h ou mais: o dono pode descartar à força. */
export function podeDescartar(b: Pick<BoletoDoc, "situacao" | "codigoSolicitacao" | "createdAt">, agora: number): boolean {
  if (b.codigoSolicitacao || b.situacao !== "EM_PROCESSAMENTO") return false;
  const criado = Date.parse(b.createdAt);
  return Number.isFinite(criado) && agora - criado >= DESCARTE_MIN_MS;
}

export const enderecoVazio = (): PagadorEndereco => ({
  cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "",
});

export type CampoEndereco = "cep" | "uf" | "logradouro" | "numero" | "bairro" | "cidade";
const ORDEM_ENDERECO: CampoEndereco[] = ["cep", "uf", "logradouro", "numero", "bairro", "cidade"];
const ENDERECO_OK: PagadorEndereco = {
  cep: "01310100", logradouro: "x", numero: "1", bairro: "x", cidade: "x", uf: "SP",
};

/** Qual campo do endereço está inválido (o 1º na ordem do servidor), sem repetir as regras dele. */
export function campoEnderecoInvalido(e: Partial<PagadorEndereco>): CampoEndereco | null {
  for (const c of ORDEM_ENDERECO) {
    if (!validarEndereco({ ...ENDERECO_OK, [c]: e[c] ?? "" }).ok) return c;
  }
  return null;
}

export type PagadorForm = {
  nome: string;
  doc: string;
  email: string;
  telefone: string;
  endereco: Partial<PagadorEndereco>;
};

export type PagadorValido = {
  nome: string;
  doc: string;
  email?: string;
  telefone?: string;
  endereco: PagadorEndereco;
};

export type ErroPagador = "nome" | "doc" | "email" | "telefone" | "endereco";

/** Mesmas regras do servidor (lib/interBoletoServer.ts): nome ≤100, CPF/CNPJ válido, e-mail ≤120, fone 10-13 dígitos, endereço completo. */
export function validarPagadorForm(
  f: PagadorForm,
): { ok: true; value: PagadorValido } | { ok: false; error: ErroPagador; campo?: CampoEndereco } {
  const nome = f.nome.trim();
  if (!nome || nome.length > 100) return { ok: false, error: "nome" };
  const doc = f.doc.replace(/\D/g, "");
  if (!(doc.length === 11 ? isValidCpf(doc) : doc.length === 14 ? isValidCnpj(doc) : false)) {
    return { ok: false, error: "doc" };
  }
  const email = f.email.trim();
  if (email && (email.length > 120 || !EMAIL_RE.test(email))) return { ok: false, error: "email" };
  const telefone = f.telefone.replace(/\D/g, "");
  if (telefone && (telefone.length < 10 || telefone.length > 13)) return { ok: false, error: "telefone" };
  const end = validarEndereco(f.endereco);
  if (!end.ok) return { ok: false, error: "endereco", campo: campoEnderecoInvalido(f.endereco) ?? undefined };
  return {
    ok: true,
    value: { nome, doc, ...(email ? { email } : {}), ...(telefone ? { telefone } : {}), endereco: end.value },
  };
}
