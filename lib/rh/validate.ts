// lib/rh/validate.ts
// Validação/saneamento da entrada do cadastro de colaborador (corpo da API).
// Função pura: devolve os campos limpos ou a mensagem de erro em português.

import { isValidCpf, onlyDigits } from "./crypto";
import { isValidDate } from "./datas";

export const VINCULOS = ["CLT", "PJ", "estagio", "outro"] as const;
export const STATUS = ["ativo", "inativo"] as const;

export interface Banco {
  banco: string;
  agencia: string;
  conta: string;
  tipoConta: "corrente" | "poupanca" | "";
  pix: string;
}

export interface ColaboradorInput {
  nome: string;
  cpf: string;
  cargo: string;
  vinculo: (typeof VINCULOS)[number];
  dataEntrada: string;
  dataSaida: string | null;
  status: (typeof STATUS)[number];
  dependentes: number;
  comissionado: boolean;
  banco: Banco;
}

const txt = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

export function sanitizarBanco(b: unknown): Banco {
  const o = (b && typeof b === "object" ? b : {}) as Record<string, unknown>;
  return {
    banco: txt(o.banco, 60),
    agencia: txt(o.agencia, 20),
    conta: txt(o.conta, 30),
    tipoConta: o.tipoConta === "corrente" || o.tipoConta === "poupanca" ? o.tipoConta : "",
    pix: txt(o.pix, 80),
  };
}

/** `parcial` = PATCH: só valida o que veio. */
export function validarColaborador(
  body: Record<string, unknown>,
  parcial = false,
): { ok: true; dados: Partial<ColaboradorInput> } | { ok: false; erro: string } {
  const d: Partial<ColaboradorInput> = {};
  const tem = (k: string) => k in body;

  if (!parcial || tem("nome")) {
    d.nome = txt(body.nome, 120);
    if (d.nome.length < 2) return { ok: false, erro: "Informe o nome do colaborador." };
  }
  if (!parcial || tem("cpf")) {
    const cpf = onlyDigits(txt(body.cpf, 20));
    if (!isValidCpf(cpf)) return { ok: false, erro: "CPF inválido." };
    d.cpf = cpf;
  }
  if (!parcial || tem("cargo")) d.cargo = txt(body.cargo, 80);
  if (!parcial || tem("vinculo")) {
    if (!VINCULOS.includes(body.vinculo as never)) return { ok: false, erro: "Vínculo inválido." };
    d.vinculo = body.vinculo as ColaboradorInput["vinculo"];
  }
  if (!parcial || tem("dataEntrada")) {
    if (!isValidDate(String(body.dataEntrada ?? ""))) return { ok: false, erro: "Data de entrada inválida." };
    d.dataEntrada = String(body.dataEntrada);
  }
  if (!parcial || tem("dataSaida")) {
    const s = body.dataSaida ? String(body.dataSaida) : null;
    if (s !== null && !isValidDate(s)) return { ok: false, erro: "Data de saída inválida." };
    d.dataSaida = s;
  }
  if (!parcial || tem("status")) {
    if (!STATUS.includes(body.status as never)) return { ok: false, erro: "Status inválido." };
    d.status = body.status as ColaboradorInput["status"];
  }
  if (!parcial || tem("dependentes")) {
    const n = Number(body.dependentes ?? 0);
    if (!Number.isInteger(n) || n < 0 || n > 20) return { ok: false, erro: "Número de dependentes inválido." };
    d.dependentes = n;
  }
  if (!parcial || tem("comissionado")) d.comissionado = body.comissionado === true;
  if (!parcial || tem("banco")) d.banco = sanitizarBanco(body.banco);
  return { ok: true, dados: d };
}

/** Regras que dependem de mais de um campo, sobre o estado FINAL do cadastro. */
export function validarCoerencia(c: { dataEntrada: string; dataSaida: string | null; status: string }): string | null {
  if (c.dataSaida && c.dataSaida < c.dataEntrada) return "A data de saída não pode ser anterior à entrada.";
  if (c.status === "inativo" && !c.dataSaida) return "Para inativar, informe a data de saída.";
  return null;
}
