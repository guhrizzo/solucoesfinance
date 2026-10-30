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

export interface Endereco {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
}

export const JORNADAS = ["5x2", "6x1", "12x36", "parcial", "outra"] as const;
export interface Jornada {
  tipo: (typeof JORNADAS)[number] | "";
  /** Carga horária semanal (horas). */
  cargaSemanal: number | null;
  /** Texto livre: "08:00–17:00, 1h de intervalo". */
  horario: string;
}

/** Grau de insalubridade (% sobre o salário mínimo): 0 = não tem. */
export const GRAUS_INSALUBRIDADE = [0, 10, 20, 40] as const;
/** Categoria para o FGTS: geral (CLT), aprendiz ou doméstico. */
export const CATEGORIAS_FGTS = ["geral", "aprendiz", "domestico"] as const;

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
  endereco: Endereco;
  jornada: Jornada;
  insalubridade: (typeof GRAUS_INSALUBRIDADE)[number];
  periculosidade: boolean;
  categoriaFgts: (typeof CATEGORIAS_FGTS)[number];
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

export function sanitizarEndereco(e: unknown): Endereco {
  const o = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
  return {
    cep: onlyDigits(txt(o.cep, 12)).slice(0, 8),
    logradouro: txt(o.logradouro, 120), numero: txt(o.numero, 12), complemento: txt(o.complemento, 60),
    bairro: txt(o.bairro, 60), cidade: txt(o.cidade, 60), uf: txt(o.uf, 2).toUpperCase(),
  };
}

export function sanitizarJornada(j: unknown): Jornada | string {
  const o = (j && typeof j === "object" ? j : {}) as Record<string, unknown>;
  const tipo = JORNADAS.includes(o.tipo as never) ? (o.tipo as Jornada["tipo"]) : "";
  let cargaSemanal: number | null = null;
  if (o.cargaSemanal !== null && o.cargaSemanal !== undefined && o.cargaSemanal !== "") {
    const n = Number(o.cargaSemanal);
    if (!Number.isFinite(n) || n <= 0 || n > 60) return "Carga horária semanal inválida (1 a 60 horas).";
    cargaSemanal = Math.round(n * 100) / 100;
  }
  return { tipo, cargaSemanal, horario: txt(o.horario, 80) };
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
  if (!parcial || tem("endereco")) d.endereco = sanitizarEndereco(body.endereco);
  if (!parcial || tem("jornada")) {
    const j = sanitizarJornada(body.jornada);
    if (typeof j === "string") return { ok: false, erro: j };
    d.jornada = j;
  }
  if (!parcial || tem("insalubridade")) {
    const g = Number(body.insalubridade ?? 0);
    if (!GRAUS_INSALUBRIDADE.includes(g as never)) return { ok: false, erro: "Grau de insalubridade inválido (0, 10, 20 ou 40%)." };
    d.insalubridade = g as ColaboradorInput["insalubridade"];
  }
  if (!parcial || tem("periculosidade")) d.periculosidade = body.periculosidade === true;
  if (!parcial || tem("categoriaFgts")) {
    const c = body.categoriaFgts ?? "geral";
    if (!CATEGORIAS_FGTS.includes(c as never)) return { ok: false, erro: "Categoria de FGTS inválida." };
    d.categoriaFgts = c as ColaboradorInput["categoriaFgts"];
  }
  if (d.insalubridade && d.periculosidade) return { ok: false, erro: "Insalubridade e periculosidade não se acumulam: escolha só uma." };
  return { ok: true, dados: d };
}

/** Regras que dependem de mais de um campo, sobre o estado FINAL do cadastro. */
export function validarCoerencia(c: { dataEntrada: string; dataSaida: string | null; status: string }): string | null {
  if (c.dataSaida && c.dataSaida < c.dataEntrada) return "A data de saída não pode ser anterior à entrada.";
  if (c.status === "inativo" && !c.dataSaida) return "Para inativar, informe a data de saída.";
  return null;
}
