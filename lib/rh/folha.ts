// lib/rh/folha.ts
// Motor de cálculo da folha mensal. Funções puras.
//
// NENHUM valor legal está fixado aqui: faixas/alíquotas de INSS e IRRF vêm das
// tabelas cadastradas (com vigência) e percentuais como hora extra, adicional
// noturno, FGTS e desconto de vale-transporte vêm dos parâmetros da empresa.
// Se algo necessário não estiver cadastrado, o cálculo devolve um ERRO em vez
// de assumir um número — e a folha não pode ser fechada com erro.
//
// Limites conhecidos (a conferência do contador cobre): o INSS patronal não é
// calculado (o custo dele está no % de encargos do custo gerencial); o IRRF usa
// tabela com parcela a deduzir, dedução por dependente e, se informado, o
// desconto simplificado (vale o mais vantajoso). Redutores e demais regras
// especiais devem ser tratados com rubrica manual.

import { r2 } from "./custo";

// ── Tabelas legais ─────────────────────────────────────────────────────────

/** INSS progressivo: cada alíquota vale só para a parte da base dentro da faixa; o teto é o `ate` da última faixa. */
export interface TabelaInss { faixas: { ate: number; aliquota: number }[] }

export interface TabelaIrrf {
  /** `ate: null` = última faixa (sem teto). */
  faixas: { ate: number | null; aliquota: number; deduzir: number }[];
  deducaoDependente: number;
  /** 0 = não usa. Se > 0, calcula também com ele e fica com o imposto menor. */
  descontoSimplificado: number;
}

export function validarTabelaInss(t: unknown): string | null {
  const faixas = (t as TabelaInss)?.faixas;
  if (!Array.isArray(faixas) || faixas.length === 0 || faixas.length > 12) return "Informe de 1 a 12 faixas de INSS.";
  let ant = 0;
  for (const f of faixas) {
    if (!Number.isFinite(f.ate) || f.ate <= ant) return "Os tetos das faixas de INSS devem ser crescentes.";
    if (!Number.isFinite(f.aliquota) || f.aliquota < 0 || f.aliquota > 100) return "Alíquota de INSS inválida (0 a 100).";
    ant = f.ate;
  }
  return null;
}

export function validarTabelaIrrf(t: unknown): string | null {
  const x = t as TabelaIrrf;
  if (!Array.isArray(x?.faixas) || x.faixas.length === 0 || x.faixas.length > 12) return "Informe de 1 a 12 faixas de IRRF.";
  let ant = 0;
  for (let i = 0; i < x.faixas.length; i++) {
    const f = x.faixas[i];
    const ultima = i === x.faixas.length - 1;
    if (ultima ? f.ate !== null : f.ate === null || !Number.isFinite(f.ate) || f.ate <= ant) {
      return ultima ? "A última faixa de IRRF não tem teto (deixe o limite em branco)." : "Os tetos das faixas de IRRF devem ser crescentes.";
    }
    if (f.ate !== null) ant = f.ate;
    if (!Number.isFinite(f.aliquota) || f.aliquota < 0 || f.aliquota > 100 || !Number.isFinite(f.deduzir) || f.deduzir < 0) return "Alíquota ou parcela a deduzir de IRRF inválida.";
  }
  if (!Number.isFinite(x.deducaoDependente) || x.deducaoDependente < 0) return "Dedução por dependente inválida.";
  if (!Number.isFinite(x.descontoSimplificado) || x.descontoSimplificado < 0) return "Desconto simplificado inválido.";
  return null;
}

export function calcularInss(t: TabelaInss, base: number): number {
  if (!(base > 0)) return 0;
  let ant = 0;
  let total = 0;
  for (const f of t.faixas) {
    const parte = Math.min(base, f.ate) - ant;
    if (parte > 0) total += (parte * f.aliquota) / 100;
    ant = f.ate;
    if (base <= f.ate) break;
  }
  return r2(total);
}

function impostoDaTabela(t: TabelaIrrf, base: number): number {
  if (!(base > 0)) return 0;
  const f = t.faixas.find((x) => x.ate === null || base <= x.ate) ?? t.faixas[t.faixas.length - 1];
  return Math.max(0, r2((base * f.aliquota) / 100 - f.deduzir));
}

export function calcularIrrf(
  t: TabelaIrrf,
  baseBruta: number,
  o: { inss: number; dependentes: number },
): { imposto: number; base: number; metodo: "legal" | "simplificado" } {
  const baseLegal = Math.max(0, r2(baseBruta - o.inss - o.dependentes * t.deducaoDependente));
  const legal = impostoDaTabela(t, baseLegal);
  if (t.descontoSimplificado > 0) {
    const baseSimp = Math.max(0, r2(baseBruta - t.descontoSimplificado));
    const simp = impostoDaTabela(t, baseSimp);
    if (simp < legal) return { imposto: simp, base: baseSimp, metodo: "simplificado" };
  }
  return { imposto: legal, base: baseLegal, metodo: "legal" };
}

// ── Rubricas e parâmetros ──────────────────────────────────────────────────

export type TipoRubrica =
  | "salario" | "he50" | "he100" | "adnoturno" | "dsr" | "faltas" | "atrasos" | "comissao" | "bonus"
  | "insalubridade" | "periculosidade" | "adiantamento"
  | "inss" | "irrf" | "vt" | "manual";

export const TIPOS_RUBRICA: TipoRubrica[] = [
  "salario", "he50", "he100", "adnoturno", "dsr", "faltas", "atrasos", "comissao", "bonus",
  "insalubridade", "periculosidade", "adiantamento", "inss", "irrf", "vt", "manual",
];

export interface Rubrica {
  id: string;
  codigo: string;
  nome: string;
  natureza: "provento" | "desconto";
  tipo: TipoRubrica;
  incidencia: { inss: boolean; irrf: boolean; fgts: boolean };
  ativa: boolean;
}

export interface ParametrosFolha {
  horasMes: number | null;
  pctHE50: number | null;
  pctHE100: number | null;
  pctAdNoturno: number | null;
  /** Dias-base para valor do dia (faltas, férias, saldo de salário). */
  diasBaseMes: number | null;
  pctVT: number | null;
  aliquotaFgts: number | null;
  /** Fração do 1/3 constitucional de férias, em % (ex.: um terço = 33,333...). */
  pctTercoFerias: number | null;
  pct1aParcela13: number | null;
  /** Salário mínimo vigente: base da insalubridade. */
  salarioMinimo: number | null;
  /** Periculosidade, em % do salário-base (ex.: 30). */
  pctPericulosidade: number | null;
  /** FGTS do jovem aprendiz (ex.: 2) e do doméstico (ex.: 8). */
  aliquotaFgtsAprendiz: number | null;
  aliquotaFgtsDomestico: number | null;
  /** Doméstico: % extra, em conta separada, pra cobrir a multa de rescisão (ex.: 3,2). */
  pctFgtsRescisorioDomestico: number | null;
  /** Multa do FGTS na demissão sem justa causa (40) e no acordo entre as partes (20). */
  multaFgtsPct: number | null;
  multaFgtsAcordoPct: number | null;
}

export const PARAMETROS_VAZIOS: ParametrosFolha = {
  horasMes: null, pctHE50: null, pctHE100: null, pctAdNoturno: null, diasBaseMes: null,
  pctVT: null, aliquotaFgts: null, pctTercoFerias: null, pct1aParcela13: null,
  salarioMinimo: null, pctPericulosidade: null, aliquotaFgtsAprendiz: null, aliquotaFgtsDomestico: null,
  pctFgtsRescisorioDomestico: null, multaFgtsPct: null, multaFgtsAcordoPct: null,
};

/** Valores sugeridos (CLT e informados pelo cliente). Entram sozinhos nos campos em branco; tudo é editável. */
export const PARAMETROS_SUGERIDOS: { [K in keyof ParametrosFolha]: number } = {
  horasMes: 220, diasBaseMes: 30, pctHE50: 50, pctHE100: 100, pctAdNoturno: 20, pctVT: 6, aliquotaFgts: 8,
  pctTercoFerias: 33.3333, pct1aParcela13: 50, salarioMinimo: 1621, pctPericulosidade: 30,
  aliquotaFgtsAprendiz: 2, aliquotaFgtsDomestico: 8, pctFgtsRescisorioDomestico: 3.2, multaFgtsPct: 40, multaFgtsAcordoPct: 20,
};

/** Tabelas sugeridas. As parcelas a deduzir do IRRF seguem a tabela mensal oficial: conferir com o contador. */
export const TABELAS_SUGERIDAS = {
  inss: { inicio: "2026-01-01", faixas: [{ ate: 1621, aliquota: 7.5 }, { ate: 2902.84, aliquota: 9 }, { ate: 4354.27, aliquota: 12 }, { ate: 8475.55, aliquota: 14 }] },
  irrf: {
    inicio: "2025-05-01",
    faixas: [{ ate: 2428.8, aliquota: 0, deduzir: 0 }, { ate: 2826.65, aliquota: 7.5, deduzir: 182.16 }, { ate: 3751.05, aliquota: 15, deduzir: 394.16 }, { ate: 4664.68, aliquota: 22.5, deduzir: 675.49 }, { ate: null, aliquota: 27.5, deduzir: 908.73 }],
    deducaoDependente: 189.59, descontoSimplificado: 607.2,
  },
} as const;

export type CategoriaFgts = "geral" | "aprendiz" | "domestico";

/** Alíquota do FGTS do mês (e o extra do doméstico) conforme a categoria; null = parâmetro faltando. */
export function fgtsDaCategoria(p: ParametrosFolha, categoria: CategoriaFgts): { aliquota: number | null; rescisorio: number } {
  if (categoria === "aprendiz") return { aliquota: p.aliquotaFgtsAprendiz, rescisorio: 0 };
  if (categoria === "domestico") return { aliquota: p.aliquotaFgtsDomestico, rescisorio: p.pctFgtsRescisorioDomestico ?? 0 };
  return { aliquota: p.aliquotaFgts, rescisorio: 0 };
}

/** Multa do FGTS na rescisão: 40% sem justa causa, 20% em acordo, nada nos demais casos. */
export function pctMultaDoMotivo(p: ParametrosFolha, motivo: string): number | null {
  if (motivo === "sem_justa_causa") return p.multaFgtsPct;
  if (motivo === "acordo") return p.multaFgtsAcordoPct;
  return 0;
}

/** Rubricas sugeridas (o usuário confirma antes de criar; tudo é editável). */
export const RUBRICAS_PADRAO: Omit<Rubrica, "id">[] = [
  { codigo: "0001", nome: "Salário", natureza: "provento", tipo: "salario", incidencia: { inss: true, irrf: true, fgts: true }, ativa: true },
  { codigo: "0002", nome: "Horas extras 50%", natureza: "provento", tipo: "he50", incidencia: { inss: true, irrf: true, fgts: true }, ativa: true },
  { codigo: "0003", nome: "Horas extras 100%", natureza: "provento", tipo: "he100", incidencia: { inss: true, irrf: true, fgts: true }, ativa: true },
  { codigo: "0004", nome: "Adicional noturno", natureza: "provento", tipo: "adnoturno", incidencia: { inss: true, irrf: true, fgts: true }, ativa: true },
  { codigo: "0005", nome: "DSR sobre horas extras e adicional noturno", natureza: "provento", tipo: "dsr", incidencia: { inss: true, irrf: true, fgts: true }, ativa: true },
  { codigo: "0006", nome: "Comissões", natureza: "provento", tipo: "comissao", incidencia: { inss: true, irrf: true, fgts: true }, ativa: true },
  { codigo: "0007", nome: "Bônus", natureza: "provento", tipo: "bonus", incidencia: { inss: true, irrf: true, fgts: true }, ativa: true },
  { codigo: "0008", nome: "Insalubridade", natureza: "provento", tipo: "insalubridade", incidencia: { inss: true, irrf: true, fgts: true }, ativa: true },
  { codigo: "0009", nome: "Periculosidade", natureza: "provento", tipo: "periculosidade", incidencia: { inss: true, irrf: true, fgts: true }, ativa: true },
  { codigo: "0101", nome: "Faltas", natureza: "desconto", tipo: "faltas", incidencia: { inss: true, irrf: true, fgts: true }, ativa: true },
  { codigo: "0102", nome: "Atrasos", natureza: "desconto", tipo: "atrasos", incidencia: { inss: true, irrf: true, fgts: true }, ativa: true },
  { codigo: "0201", nome: "INSS", natureza: "desconto", tipo: "inss", incidencia: { inss: false, irrf: false, fgts: false }, ativa: true },
  { codigo: "0202", nome: "IRRF", natureza: "desconto", tipo: "irrf", incidencia: { inss: false, irrf: false, fgts: false }, ativa: true },
  { codigo: "0203", nome: "Vale-transporte", natureza: "desconto", tipo: "vt", incidencia: { inss: false, irrf: false, fgts: false }, ativa: true },
  { codigo: "0204", nome: "Adiantamento salarial", natureza: "desconto", tipo: "adiantamento", incidencia: { inss: false, irrf: false, fgts: false }, ativa: true },
];

export function validarRubrica(b: Record<string, unknown>): { ok: true; rubrica: Omit<Rubrica, "id"> } | { ok: false; erro: string } {
  const codigo = String(b.codigo ?? "").trim().slice(0, 10);
  const nome = String(b.nome ?? "").trim().slice(0, 60);
  if (!codigo) return { ok: false, erro: "Informe o código da rubrica." };
  if (nome.length < 2) return { ok: false, erro: "Informe o nome da rubrica." };
  const natureza = b.natureza === "desconto" ? "desconto" : b.natureza === "provento" ? "provento" : null;
  if (!natureza) return { ok: false, erro: "Natureza inválida." };
  if (!TIPOS_RUBRICA.includes(b.tipo as TipoRubrica)) return { ok: false, erro: "Tipo inválido." };
  const inc = (b.incidencia ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    rubrica: { codigo, nome, natureza, tipo: b.tipo as TipoRubrica, incidencia: { inss: inc.inss === true, irrf: inc.irrf === true, fgts: inc.fgts === true }, ativa: b.ativa !== false },
  };
}

// ── Cálculo da folha de um colaborador ─────────────────────────────────────

export interface LancamentoMes {
  he50: number;
  he100: number;
  noturnas: number;
  faltasDias: number;
  atrasosHoras: number;
  /** Adiantamento de salário pago no mês (R$): desconta do líquido, sem incidência. */
  adiantamento: number;
  extras: { rubricaId: string; valor: number; obs?: string }[];
}

export const LANCAMENTO_VAZIO: LancamentoMes = { he50: 0, he100: 0, noturnas: 0, faltasDias: 0, atrasosHoras: 0, adiantamento: 0, extras: [] };

export interface ItemFolha {
  codigo: string;
  nome: string;
  natureza: "provento" | "desconto";
  tipo: TipoRubrica;
  /** Referência legível (horas, dias, %). */
  ref?: string;
  valor: number;
}

export interface ResultadoFolha {
  itens: ItemFolha[];
  bases: { inss: number; irrf: number; fgts: number };
  inss: number;
  irrf: number;
  irrfMetodo: "legal" | "simplificado" | null;
  fgts: number;
  /** Doméstico: FGTS extra (conta separada da multa de rescisão). */
  fgtsRescisorio: number;
  proventos: number;
  descontos: number;
  liquido: number;
  /** Remuneração-base que o custo gerencial passa a usar quando a folha fecha (sem comissão e bônus). */
  custoSalarioBase: number;
  erros: string[];
  avisos: string[];
}

export interface EntradaFolha {
  nomeColaborador: string;
  dependentes: number;
  /** Salário do mês cheio (vigente no último dia ativo) — base de valor-hora e valor-dia. */
  salarioMensal: number;
  /** Salário proporcional aos dias ativos no mês. */
  salarioPeriodo: number;
  lanc: LancamentoMes;
  comissao: number;
  bonus: number;
  /** Grau de insalubridade em % do salário mínimo (0, 10, 20 ou 40). */
  insalubridadePct: number;
  periculosidade: boolean;
  categoriaFgts: CategoriaFgts;
  /** Valor mensal do benefício vale-transporte vigente (0 = sem VT). */
  vtBeneficio: number;
  diasUteis: number;
  domingosFeriados: number;
  rubricas: Rubrica[];
  params: ParametrosFolha;
  inss: TabelaInss | null;
  irrf: TabelaIrrf | null;
}

export function calcularFolhaColab(e: EntradaFolha): ResultadoFolha {
  const erros: string[] = [];
  const avisos: string[] = [];
  const itens: ItemFolha[] = [];
  const porTipo = (tipo: TipoRubrica) => e.rubricas.find((r) => r.ativa && r.tipo === tipo);
  const incidencia = new Map<ItemFolha, Rubrica["incidencia"]>();

  const lanca = (tipo: TipoRubrica, valor: number, ref?: string, natureza?: "provento" | "desconto") => {
    const v = r2(Math.abs(valor));
    if (v <= 0) return;
    const rb = porTipo(tipo);
    if (!rb) { erros.push(`Cadastre a rubrica "${tipo}" (aba Rubricas) para lançar este valor.`); return; }
    const item: ItemFolha = { codigo: rb.codigo, nome: rb.nome, natureza: natureza ?? rb.natureza, tipo, ref, valor: v };
    itens.push(item);
    incidencia.set(item, rb.incidencia);
  };
  const exige = (ok: boolean, msg: string) => { if (!ok) erros.push(msg); return ok; };

  const p = e.params;
  const l = e.lanc;
  const valorHora = p.horasMes ? e.salarioMensal / p.horasMes : 0;
  const temHoras = l.he50 > 0 || l.he100 > 0 || l.noturnas > 0 || l.atrasosHoras > 0;
  if (temHoras) exige(!!p.horasMes, "Informe as horas por mês nos parâmetros da folha.");

  lanca("salario", e.salarioPeriodo);
  let valHE = 0;
  if (l.he50 > 0 && exige(p.pctHE50 !== null, "Informe o % de hora extra 50% nos parâmetros.")) {
    const v = l.he50 * valorHora * (1 + (p.pctHE50 as number) / 100); valHE += v; lanca("he50", v, `${l.he50} h`);
  }
  if (l.he100 > 0 && exige(p.pctHE100 !== null, "Informe o % de hora extra 100% nos parâmetros.")) {
    const v = l.he100 * valorHora * (1 + (p.pctHE100 as number) / 100); valHE += v; lanca("he100", v, `${l.he100} h`);
  }
  if (l.noturnas > 0 && exige(p.pctAdNoturno !== null, "Informe o % de adicional noturno nos parâmetros.")) {
    const v = l.noturnas * valorHora * ((p.pctAdNoturno as number) / 100); valHE += v; lanca("adnoturno", v, `${l.noturnas} h`);
  }
  if (valHE > 0) {
    if (exige(e.diasUteis > 0, "Informe os dias úteis do mês para calcular o DSR.")) {
      lanca("dsr", (valHE / e.diasUteis) * e.domingosFeriados, `${e.domingosFeriados} dia(s)`);
    }
  }
  if (l.faltasDias > 0 && exige(!!p.diasBaseMes, "Informe os dias-base do mês nos parâmetros (faltas).")) {
    lanca("faltas", (e.salarioMensal / (p.diasBaseMes as number)) * l.faltasDias, `${l.faltasDias} dia(s)`);
  }
  if (l.atrasosHoras > 0) lanca("atrasos", valorHora * l.atrasosHoras, `${l.atrasosHoras} h`);
  // Adicionais sobre a parte do mês em que a pessoa esteve ativa (mesma proporção do salário).
  const proporcao = e.salarioMensal > 0 ? Math.min(1, e.salarioPeriodo / e.salarioMensal) : 1;
  if (e.insalubridadePct > 0 && exige(p.salarioMinimo !== null && p.salarioMinimo > 0, "Informe o salário mínimo nos parâmetros da folha (base da insalubridade).")) {
    lanca("insalubridade", (p.salarioMinimo as number) * (e.insalubridadePct / 100) * proporcao, `${e.insalubridadePct}% s/ mínimo`);
  }
  if (e.periculosidade && exige(p.pctPericulosidade !== null, "Informe o % de periculosidade nos parâmetros da folha.")) {
    lanca("periculosidade", e.salarioPeriodo * ((p.pctPericulosidade as number) / 100), `${p.pctPericulosidade}%`);
  }
  if (e.comissao !== 0) lanca("comissao", e.comissao, undefined, e.comissao < 0 ? "desconto" : "provento");
  if (e.bonus > 0) lanca("bonus", e.bonus);
  for (const x of l.extras) {
    const rb = e.rubricas.find((r) => r.id === x.rubricaId && r.ativa);
    if (!rb) { erros.push("Há lançamento extra com rubrica inexistente ou inativa."); continue; }
    const v = r2(Math.abs(x.valor));
    if (v <= 0) continue;
    const item: ItemFolha = { codigo: rb.codigo, nome: rb.nome, natureza: rb.natureza, tipo: rb.tipo, ref: x.obs, valor: v };
    itens.push(item);
    incidencia.set(item, rb.incidencia);
  }

  // Bases: proventos com incidência somam; descontos com incidência (faltas, atrasos…) subtraem.
  const base = (campo: "inss" | "irrf" | "fgts") =>
    Math.max(0, r2(itens.reduce((s, it) => (incidencia.get(it)?.[campo] ? s + (it.natureza === "provento" ? it.valor : -it.valor) : s), 0)));
  const bases = { inss: base("inss"), irrf: base("irrf"), fgts: base("fgts") };

  let inss = 0;
  if (!e.inss) erros.push("Tabela de INSS não cadastrada para a competência.");
  else inss = calcularInss(e.inss, bases.inss);
  lanca("inss", inss, "tabela");

  let irrf = 0;
  let irrfMetodo: ResultadoFolha["irrfMetodo"] = null;
  if (!e.irrf) erros.push("Tabela de IRRF não cadastrada para a competência.");
  else {
    const r = calcularIrrf(e.irrf, bases.irrf, { inss, dependentes: e.dependentes });
    irrf = r.imposto; irrfMetodo = r.metodo;
  }
  lanca("irrf", irrf, e.dependentes > 0 ? `${e.dependentes} dep.` : undefined);

  if (e.vtBeneficio > 0) {
    if (exige(p.pctVT !== null, "Informe o % de desconto do vale-transporte nos parâmetros.")) {
      lanca("vt", Math.min(e.vtBeneficio, (e.salarioPeriodo * (p.pctVT as number)) / 100), `${p.pctVT}%`);
    }
  }

  // Adiantamento de salário: só desconta do líquido (sem incidência).
  if (l.adiantamento > 0) lanca("adiantamento", l.adiantamento);

  let fgts = 0;
  let fgtsRescisorio = 0;
  const fg = fgtsDaCategoria(p, e.categoriaFgts);
  const msgFgts = e.categoriaFgts === "aprendiz" ? "Informe a alíquota do FGTS do jovem aprendiz nos parâmetros." : e.categoriaFgts === "domestico" ? "Informe a alíquota do FGTS do doméstico nos parâmetros." : "Informe a alíquota do FGTS nos parâmetros.";
  if (exige(fg.aliquota !== null, msgFgts)) {
    fgts = r2((bases.fgts * (fg.aliquota as number)) / 100);
    fgtsRescisorio = r2((bases.fgts * fg.rescisorio) / 100);
  }

  const proventos = r2(itens.filter((i) => i.natureza === "provento").reduce((s, i) => s + i.valor, 0));
  const descontos = r2(itens.filter((i) => i.natureza === "desconto").reduce((s, i) => s + i.valor, 0));
  const custoSalarioBase = r2(
    itens.reduce((s, i) => {
      if (i.tipo === "comissao" || i.tipo === "bonus") return s;
      // Só falta e atraso reduzem o custo da empresa; INSS, IRRF, VT e demais
      // descontos saem do bolso do colaborador e não mudam o custo.
      if (i.natureza === "desconto") return i.tipo === "faltas" || i.tipo === "atrasos" ? s - i.valor : s;
      return s + i.valor;
    }, 0),
  );
  if (e.salarioPeriodo <= 0) avisos.push(`${e.nomeColaborador}: sem salário no mês.`);
  return { itens, bases, inss, irrf, irrfMetodo, fgts, fgtsRescisorio, proventos, descontos, liquido: r2(proventos - descontos), custoSalarioBase, erros, avisos };
}
