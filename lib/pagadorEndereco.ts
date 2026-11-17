// Endereço do pagador de um boleto.
export type PagadorEndereco = {
  cep: string;
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  uf: string;
};

const UFS = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
]);

const txt = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Valida e normaliza o endereço (CEP só dígitos, UF maiúscula). */
export function validarEndereco(e: unknown): { ok: true; value: PagadorEndereco } | { ok: false; error: string } {
  if (typeof e !== "object" || e === null || Array.isArray(e)) return { ok: false, error: "Endereço do pagador inválido." };
  const r = e as Record<string, unknown>;
  const cep = txt(r.cep).replace(/\D/g, "");
  if (cep.length !== 8) return { ok: false, error: "CEP inválido: informe 8 dígitos." };
  const uf = txt(r.uf).toUpperCase();
  if (!UFS.has(uf)) return { ok: false, error: "UF inválida." };
  const logradouro = txt(r.logradouro);
  if (!logradouro) return { ok: false, error: "Informe o logradouro." };
  const numero = txt(r.numero);
  if (!numero) return { ok: false, error: "Informe o número do endereço." };
  const bairro = txt(r.bairro);
  if (!bairro) return { ok: false, error: "Informe o bairro." };
  const cidade = txt(r.cidade);
  if (!cidade) return { ok: false, error: "Informe a cidade." };
  const complemento = txt(r.complemento);
  return { ok: true, value: { cep, logradouro, numero, ...(complemento ? { complemento } : {}), bairro, cidade, uf } };
}
