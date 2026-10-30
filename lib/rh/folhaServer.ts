// lib/rh/folhaServer.ts
// Folha de pagamento — acesso a dados e apuração (Admin SDK). SOMENTE servidor.
//
// users/{owner}/...
//   rhConfig/folha                 parâmetros da empresa (horas/mês, % de hora extra, FGTS…)
//   rhRubricas/{id}                rubricas (proventos/descontos) e incidência INSS/IRRF/FGTS
//   rhTabelasLegais/{id}           tabelas de INSS e IRRF, com vigência e histórico
//   rhFolhas/{comp}                estado da folha do mês (aberta/fechada), cabeçalho, reaberturas
//   rhFolhaLancamentos/{c}_{colab} lançamentos variáveis do mês (horas extras, faltas, extras)
//   rhFolhaConferencias/{c}_{colab} conferência manual (guarda o hash do cálculo conferido)
//   rhFolhaItens/{c}_{colab}       retrato congelado no fechamento
//   rhEventos/{id}                 férias, 13º e rescisão

import { createHash } from "node:crypto";
import {
  calcularFolhaColab, LANCAMENTO_VAZIO, PARAMETROS_SUGERIDOS, PARAMETROS_VAZIOS, RUBRICAS_PADRAO, TABELAS_SUGERIDAS,
  type CategoriaFgts, type LancamentoMes, type ParametrosFolha, type ResultadoFolha, type Rubrica, type TabelaInss, type TabelaIrrf,
} from "./folha";
import { diasAtivos, valorProporcional, vigenciaEm, type Vigencia } from "./vigencia";
import { firstDay, lastDay } from "./datas";
import { apurarComissoes } from "./comissaoServer";
import { rhCol, type RhBase } from "./server";

export async function carregarParametros(ctx: RhBase): Promise<ParametrosFolha> {
  const s = await rhCol(ctx, "rhConfig").doc("folha").get();
  const x = (s.exists ? s.data() : {}) as Record<string, unknown>;
  const out = { ...PARAMETROS_VAZIOS };
  for (const k of Object.keys(out) as (keyof ParametrosFolha)[]) {
    const v = x[k];
    out[k] = typeof v === "number" && Number.isFinite(v) ? v : null;
  }
  return out;
}

/**
 * Primeiro uso da folha: preenche sozinho o que ainda não existe — parâmetros em
 * branco, rubricas (só se não houver nenhuma) e as tabelas de INSS/IRRF (só se
 * não houver nenhuma). Nunca sobrescreve nada que você já tenha informado; ids
 * fixos evitam duplicar em chamadas simultâneas. Tudo continua editável.
 */
export async function garantirPadroesFolha(ctx: RhBase): Promise<void> {
  const cfgRef = rhCol(ctx, "rhConfig").doc("folha");
  const [cfg, rubs, tInss, tIrrf] = await Promise.all([
    cfgRef.get(), rhCol(ctx, "rhRubricas").limit(1).get(), carregarTabelas(ctx, "inss"), carregarTabelas(ctx, "irrf"),
  ]);
  const atual = (cfg.exists ? cfg.data() : {}) as Record<string, unknown>;
  const faltam = Object.entries(PARAMETROS_SUGERIDOS).filter(([k]) => !(typeof atual[k] === "number" && Number.isFinite(atual[k] as number)));
  const batch = ctx.db.batch();
  let mudou = false;
  if (faltam.length > 0) { batch.set(cfgRef, Object.fromEntries(faltam), { merge: true }); mudou = true; }
  if (rubs.empty) {
    RUBRICAS_PADRAO.forEach((r) => batch.set(rhCol(ctx, "rhRubricas").doc(`padrao_${r.tipo}`), { ...r, createdAt: Date.now() }));
    mudou = true;
  }
  if (tInss.length === 0) {
    const t = TABELAS_SUGERIDAS.inss;
    batch.set(rhCol(ctx, "rhTabelasLegais").doc("padrao_inss"), { tipo: "inss", inicio: t.inicio, fim: null, faixas: t.faixas, obs: "Valores sugeridos — conferir com o contador", createdAt: Date.now() });
    mudou = true;
  }
  if (tIrrf.length === 0) {
    const t = TABELAS_SUGERIDAS.irrf;
    batch.set(rhCol(ctx, "rhTabelasLegais").doc("padrao_irrf"), { tipo: "irrf", inicio: t.inicio, fim: null, faixas: t.faixas, deducaoDependente: t.deducaoDependente, descontoSimplificado: t.descontoSimplificado, obs: "Valores sugeridos — conferir com o contador", createdAt: Date.now() });
    mudou = true;
  }
  if (mudou) await batch.commit();
}

export async function carregarRubricas(ctx: RhBase): Promise<Rubrica[]> {
  const snap = await rhCol(ctx, "rhRubricas").get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Rubrica, "id">) }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }));
}

export interface TabelaDoc<T> { id: string; inicio: string; fim: string | null; dados: T; obs: string }

export async function carregarTabelas(ctx: RhBase, tipo: "inss" | "irrf"): Promise<TabelaDoc<TabelaInss | TabelaIrrf>[]> {
  const snap = await rhCol(ctx, "rhTabelasLegais").where("tipo", "==", tipo).get();
  return snap.docs
    .map((d) => {
      const x = d.data();
      const dados = tipo === "inss"
        ? ({ faixas: x.faixas } as TabelaInss)
        : ({ faixas: x.faixas, deducaoDependente: Number(x.deducaoDependente) || 0, descontoSimplificado: Number(x.descontoSimplificado) || 0 } as TabelaIrrf);
      return { id: d.id, inicio: String(x.inicio), fim: (x.fim as string | null) ?? null, dados, obs: String(x.obs ?? "") };
    })
    .sort((a, b) => b.inicio.localeCompare(a.inicio));
}

/** Tabela vigente no primeiro dia da competência. */
export function tabelaDaCompetencia<T>(lista: TabelaDoc<T>[], comp: string): TabelaDoc<T> | null {
  const v = vigenciaEm(lista.map((t) => ({ inicio: t.inicio, fim: t.fim, dados: t })), firstDay(comp));
  return v ? v.dados : null;
}

export async function folhasFechadas(ctx: RhBase): Promise<string[]> {
  const snap = await rhCol(ctx, "rhFolhas").where("status", "==", "fechada").get();
  return snap.docs.map((d) => d.id);
}

export function hashResultado(r: Pick<ResultadoFolha, "itens" | "inss" | "irrf" | "fgts" | "liquido">): string {
  return createHash("sha256").update(JSON.stringify([r.itens, r.inss, r.irrf, r.fgts, r.liquido])).digest("hex");
}

export interface LinhaFolha {
  colaboradorId: string;
  nome: string;
  cargo: string;
  admissao: string;
  dependentes: number;
  lanc: LancamentoMes;
  comissao: number;
  bonus: number;
  resultado: ResultadoFolha;
  hash: string;
  conferido: boolean;
  conferidoPorNome?: string;
}

export interface FolhaApurada {
  comp: string;
  fechada: boolean;
  cabecalho: { diasUteis: number; domingosFeriados: number };
  linhas: LinhaFolha[];
  /** Erros que valem para a folha toda (tabela/parâmetro faltando) — sem repetir por pessoa. */
  erros: string[];
  foraDaFolha: number;
  tabelas: { inssId: string | null; irrfId: string | null };
  fechadaPorNome?: string | null;
  fechadaEm?: number | null;
  vencimentos?: Record<string, string>;
  reaberturas: { em: number; porNome: string; motivo: string }[];
}

export async function apurarFolha(ctx: RhBase, comp: string): Promise<FolhaApurada> {
  const folhaSnap = await rhCol(ctx, "rhFolhas").doc(comp).get();
  const f = folhaSnap.exists ? folhaSnap.data()! : {};
  const fechada = f.status === "fechada";
  const cabecalho = { diasUteis: Number(f.diasUteis) || 0, domingosFeriados: Number(f.domingosFeriados) || 0 };
  const base = { comp, cabecalho, reaberturas: (f.reaberturas ?? []) as FolhaApurada["reaberturas"], fechadaPorNome: f.fechadaPorNome ?? null, fechadaEm: f.fechadaEm ?? null, vencimentos: f.vencimentos as Record<string, string> | undefined };

  const colabSnap = await rhCol(ctx, "rhColaboradores").get();
  const clt = colabSnap.docs.filter((d) => d.data().vinculo === "CLT");
  const foraDaFolha = colabSnap.size - clt.length;

  if (fechada) {
    const snap = await rhCol(ctx, "rhFolhaItens").where("comp", "==", comp).get();
    const linhas = snap.docs
      .map((d) => d.data() as Omit<LinhaFolha, "conferido"> & { tabelas?: FolhaApurada["tabelas"] })
      .map((x) => ({ ...x, conferido: true } as LinhaFolha))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return { ...base, fechada, linhas, erros: [], foraDaFolha, tabelas: (f.tabelas as FolhaApurada["tabelas"]) ?? { inssId: null, irrfId: null } };
  }

  await garantirPadroesFolha(ctx);
  const [params, rubricas, tInss, tIrrf, vigSnap, varSnap, lancSnap, confSnap, comissoes] = await Promise.all([
    carregarParametros(ctx), carregarRubricas(ctx), carregarTabelas(ctx, "inss"), carregarTabelas(ctx, "irrf"),
    rhCol(ctx, "rhVigencias").get(),
    rhCol(ctx, "rhVariaveis").where("comp", "==", comp).get(),
    rhCol(ctx, "rhFolhaLancamentos").where("comp", "==", comp).get(),
    rhCol(ctx, "rhFolhaConferencias").where("comp", "==", comp).get(),
    apurarComissoes(ctx, comp),
  ]);
  const inss = tabelaDaCompetencia(tInss, comp);
  const irrf = tabelaDaCompetencia(tIrrf, comp);

  const salarios = new Map<string, Vigencia<{ valor: number }>[]>();
  const vts = new Map<string, Vigencia<{ valor: number }>[]>();
  for (const d of vigSnap.docs) {
    const v = d.data();
    const cid = String(v.colaboradorId);
    const item = { id: d.id, inicio: String(v.inicio), fim: (v.fim as string | null) ?? null, dados: { valor: Number(v.valor) || 0 } };
    if (v.tipo === "salario") salarios.set(cid, [...(salarios.get(cid) ?? []), item]);
    else if (v.tipo === "beneficio" && v.tipoBeneficio === "vt") vts.set(cid, [...(vts.get(cid) ?? []), item]);
  }
  const bonus = new Map(varSnap.docs.map((d) => [String(d.data().colaboradorId), Number(d.data().bonus) || 0]));
  const lancs = new Map(lancSnap.docs.map((d) => [String(d.data().colaboradorId), d.data() as Partial<LancamentoMes>]));
  const confs = new Map(confSnap.docs.map((d) => [String(d.data().colaboradorId), d.data()]));

  const linhas: LinhaFolha[] = [];
  const errosGlobais = new Set<string>();
  for (const d of clt) {
    const c = d.data();
    const dias = diasAtivos(comp, String(c.dataEntrada), (c.dataSaida as string | null) ?? null);
    if (dias.length === 0) continue;
    const sal = salarios.get(d.id) ?? [];
    const ultimo = dias[dias.length - 1] ?? lastDay(comp);
    const salarioMensal = vigenciaEm(sal, ultimo)?.dados.valor ?? 0;
    const salarioPeriodo = Math.round(valorProporcional(sal, dias, comp, (x) => x.valor) * 100) / 100;
    const l = lancs.get(d.id);
    const lanc: LancamentoMes = { ...LANCAMENTO_VAZIO, ...(l ? { he50: l.he50 ?? 0, he100: l.he100 ?? 0, noturnas: l.noturnas ?? 0, faltasDias: l.faltasDias ?? 0, atrasosHoras: l.atrasosHoras ?? 0, adiantamento: l.adiantamento ?? 0, extras: l.extras ?? [] } : {}) };
    const comissao = comissoes.porColab.get(d.id)?.total ?? 0;
    const resultado = calcularFolhaColab({
      nomeColaborador: String(c.nome), dependentes: Number(c.dependentes) || 0, salarioMensal, salarioPeriodo, lanc, comissao,
      bonus: bonus.get(d.id) ?? 0,
      insalubridadePct: Number(c.insalubridade) || 0, periculosidade: c.periculosidade === true,
      categoriaFgts: (c.categoriaFgts as CategoriaFgts | undefined) ?? "geral",
      vtBeneficio: Math.round(valorProporcional(vts.get(d.id) ?? [], dias, comp, (x) => x.valor) * 100) / 100,
      diasUteis: cabecalho.diasUteis, domingosFeriados: cabecalho.domingosFeriados,
      rubricas, params, inss: inss?.dados as TabelaInss | null ?? null, irrf: irrf?.dados as TabelaIrrf | null ?? null,
    });
    resultado.erros.forEach((e) => errosGlobais.add(e));
    const hash = hashResultado(resultado);
    const cf = confs.get(d.id);
    linhas.push({
      colaboradorId: d.id, nome: String(c.nome), cargo: String(c.cargo ?? ""), admissao: String(c.dataEntrada), dependentes: Number(c.dependentes) || 0,
      lanc, comissao, bonus: bonus.get(d.id) ?? 0, resultado, hash,
      conferido: !!cf && cf.hash === hash, conferidoPorNome: cf?.porNome,
    });
  }
  linhas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return { ...base, fechada, linhas, erros: [...errosGlobais], foraDaFolha, tabelas: { inssId: inss?.id ?? null, irrfId: irrf?.id ?? null } };
}

/** Salário-base que o custo gerencial usa de uma folha FECHADA (colab → valor). */
export async function salariosDaFolhaFechada(ctx: RhBase, comp: string): Promise<Map<string, number> | null> {
  const f = await rhCol(ctx, "rhFolhas").doc(comp).get();
  if (!f.exists || f.data()?.status !== "fechada") return null;
  const snap = await rhCol(ctx, "rhFolhaItens").where("comp", "==", comp).get();
  return new Map(snap.docs.map((d) => [String(d.data().colaboradorId), Number(d.data().resultado?.custoSalarioBase) || 0]));
}
