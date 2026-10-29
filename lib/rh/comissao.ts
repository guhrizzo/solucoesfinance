// lib/rh/comissao.ts
// Comissões: regras (percentual fixo ou por faixa, sobre receita ou margem),
// atribuição de venda a uma ou mais pessoas e ajuste por estorno. Funções puras.
//
// Margem (base "margem") = receita − custo do produto − impostos − taxa de
// cartão − taxa do marketplace − outros custos (frete etc.). Impostos, taxa de
// cartão e outros custos são ESTIMATIVAS por percentual (configuráveis); a taxa
// do marketplace é a real, lançada junto do pedido. Venda sem custo cadastrado
// nunca entra como custo zero: fica fora da base de margem e é sinalizada.

import { firstDay, isValidDate, lastDay } from "./datas";

export type BaseComissao = "receita" | "margem";
export interface Faixa { de: number; pct: number }

export interface RegraComissao {
  id: string;
  nome: string;
  escopo: "todos" | "lista";
  colaboradorIds: string[];
  tipo: "fixo" | "faixa";
  base: BaseComissao;
  pct: number;
  faixas: Faixa[];
  /** marginal: cada faixa vale só para a parte do valor dentro dela. total: o % da faixa atingida vale para tudo. */
  faixaModo: "marginal" | "total";
  inicio: string;
  fim: string | null;
  ativa: boolean;
}

export interface ConfigMargem {
  aliquotaImpostoPct: number;
  taxaDebitoPct: number;
  taxaCreditoPct: number;
  outrosCustosPct: number;
}

export const CONFIG_MARGEM_VAZIA: ConfigMargem = { aliquotaImpostoPct: 0, taxaDebitoPct: 0, taxaCreditoPct: 0, outrosCustosPct: 0 };

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ── Validação ──────────────────────────────────────────────────────────────

const pctOk = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100;

export function validarRegra(body: Record<string, unknown>): { ok: true; regra: Omit<RegraComissao, "id"> } | { ok: false; erro: string } {
  const nome = String(body.nome ?? "").trim().slice(0, 60);
  if (nome.length < 2) return { ok: false, erro: "Informe o nome da regra." };
  const escopo = body.escopo === "lista" ? "lista" : "todos";
  const colaboradorIds = escopo === "lista" ? [...new Set((Array.isArray(body.colaboradorIds) ? body.colaboradorIds : []).map(String))].filter((x) => x && !x.includes("/")) : [];
  if (escopo === "lista" && colaboradorIds.length === 0) return { ok: false, erro: "Escolha ao menos um colaborador para a regra." };
  const tipo = body.tipo === "faixa" ? "faixa" : body.tipo === "fixo" ? "fixo" : null;
  if (!tipo) return { ok: false, erro: "Tipo de regra inválido." };
  const base: BaseComissao | null = body.base === "margem" ? "margem" : body.base === "receita" ? "receita" : null;
  if (!base) return { ok: false, erro: "Base de cálculo inválida." };
  const inicio = String(body.inicio ?? "");
  if (!isValidDate(inicio)) return { ok: false, erro: "Data de início inválida." };
  const fim = body.fim ? String(body.fim) : null;
  if (fim !== null && (!isValidDate(fim) || fim < inicio)) return { ok: false, erro: "Data de fim inválida." };

  let pct = 0;
  let faixas: Faixa[] = [];
  if (tipo === "fixo") {
    pct = Number(body.pct);
    if (!pctOk(pct) || pct <= 0) return { ok: false, erro: "Percentual deve estar entre 0 e 100." };
    pct = r2(pct);
  } else {
    const bruto = Array.isArray(body.faixas) ? body.faixas : [];
    faixas = bruto.map((f) => ({ de: Number((f as Faixa)?.de), pct: Number((f as Faixa)?.pct) }));
    if (faixas.length === 0 || faixas.length > 10) return { ok: false, erro: "Informe de 1 a 10 faixas." };
    if (faixas[0].de !== 0) return { ok: false, erro: "A primeira faixa deve começar em 0." };
    for (let i = 0; i < faixas.length; i++) {
      const f = faixas[i];
      if (!Number.isFinite(f.de) || f.de < 0 || !pctOk(f.pct)) return { ok: false, erro: "Faixa inválida: valor inicial e percentual (0 a 100)." };
      if (i > 0 && f.de <= faixas[i - 1].de) return { ok: false, erro: "Os valores iniciais das faixas devem ser crescentes." };
    }
    faixas = faixas.map((f) => ({ de: r2(f.de), pct: r2(f.pct) }));
  }
  const faixaModo = body.faixaModo === "total" ? "total" : "marginal";
  return { ok: true, regra: { nome, escopo, colaboradorIds, tipo, base, pct, faixas, faixaModo, inicio, fim, ativa: body.ativa !== false } };
}

/** Atribuição de uma venda: pessoas + percentuais que somam 100%. */
export function validarAtribuicao(itens: unknown): string | null {
  if (!Array.isArray(itens) || itens.length === 0) return "Escolha ao menos um vendedor.";
  if (itens.length > 10) return "Máximo de 10 vendedores por venda.";
  const ids = new Set<string>();
  let soma = 0;
  for (const it of itens) {
    const id = String((it as { colaboradorId?: string })?.colaboradorId ?? "");
    const pct = Number((it as { pct?: number })?.pct);
    if (!id || id.includes("/")) return "Colaborador inválido.";
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return "Cada percentual deve estar entre 0 e 100.";
    if (ids.has(id)) return "O mesmo colaborador aparece mais de uma vez.";
    ids.add(id);
    soma += pct;
  }
  return Math.abs(soma - 100) > 0.01 ? `A divisão deve somar 100% (hoje: ${r2(soma)}%).` : null;
}

// ── Regra aplicável e valor ────────────────────────────────────────────────

/** A regra que vale para o colaborador na competência (específica vence a geral; depois a de início mais recente). */
export function regraDaCompetencia(regras: RegraComissao[], colaboradorId: string, comp: string): RegraComissao | null {
  const ini = firstDay(comp);
  const fimMes = lastDay(comp);
  const candidatas = regras.filter(
    (r) => r.ativa && r.inicio <= fimMes && (r.fim == null || r.fim >= ini) && (r.escopo === "todos" || r.colaboradorIds.includes(colaboradorId)),
  );
  if (candidatas.length === 0) return null;
  candidatas.sort((a, b) => (a.escopo === b.escopo ? b.inicio.localeCompare(a.inicio) : a.escopo === "lista" ? -1 : 1));
  return candidatas[0];
}

export function comissaoPorRegra(regra: Pick<RegraComissao, "tipo" | "pct" | "faixas" | "faixaModo">, base: number): number {
  if (!(base > 0)) return 0;
  if (regra.tipo === "fixo") return r2((base * regra.pct) / 100);
  const faixas = [...regra.faixas].sort((a, b) => a.de - b.de);
  if (faixas.length === 0) return 0;
  if (regra.faixaModo === "total") {
    let atingida = faixas[0];
    for (const f of faixas) if (base >= f.de) atingida = f;
    return r2((base * atingida.pct) / 100);
  }
  let total = 0;
  faixas.forEach((f, i) => {
    const teto = i + 1 < faixas.length ? faixas[i + 1].de : Infinity;
    const parte = Math.min(base, teto) - f.de;
    if (parte > 0) total += (parte * f.pct) / 100;
  });
  return r2(total);
}

// ── Margem da venda ────────────────────────────────────────────────────────

export interface VendaCalc {
  key: string;
  date: string;
  amount: number;
  /** Custo total do produto na venda (custo unitário × qtd); null = sem custo cadastrado. */
  custoProduto: number | null;
  /** Taxas reais do marketplace do pedido (R$). */
  taxaMarketplace: number;
  forma?: string | null;
  itens: { colaboradorId: string; pct: number }[];
  /** Receita já estornada que afeta ESTA competência (R$). */
  estornadoReceita: number;
}

export function margemDaVenda(v: Pick<VendaCalc, "amount" | "custoProduto" | "taxaMarketplace" | "forma">, cfg: ConfigMargem): number | null {
  if (v.custoProduto === null) return null;
  const taxaCartao = v.forma === "debito" ? cfg.taxaDebitoPct : v.forma === "credito" ? cfg.taxaCreditoPct : 0;
  const pctTotal = cfg.aliquotaImpostoPct + taxaCartao + cfg.outrosCustosPct;
  return r2(v.amount - v.custoProduto - (v.amount * pctTotal) / 100 - v.taxaMarketplace);
}

export interface ResultadoColab {
  colaboradorId: string;
  regraId: string | null;
  regraNome: string | null;
  baseTipo: BaseComissao | null;
  base: number;
  comissao: number;
  pctEfetivo: number;
  qtdVendas: number;
  semCusto: string[];
}

export function calcularComissoes(input: {
  comp: string;
  regras: RegraComissao[];
  vendas: VendaCalc[];
  cfg: ConfigMargem;
}): Map<string, ResultadoColab> {
  const acc = new Map<string, { receita: number; margem: number; qtd: number; semCusto: string[] }>();
  for (const v of input.vendas) {
    if (!(v.amount > 0)) continue;
    const receitaEf = Math.max(0, v.amount - v.estornadoReceita);
    const fator = receitaEf / v.amount;
    const margem = margemDaVenda(v, input.cfg);
    for (const it of v.itens) {
      const a = acc.get(it.colaboradorId) ?? { receita: 0, margem: 0, qtd: 0, semCusto: [] };
      a.receita += (receitaEf * it.pct) / 100;
      if (margem === null) a.semCusto.push(v.key);
      else a.margem += (margem * fator * it.pct) / 100;
      a.qtd += 1;
      acc.set(it.colaboradorId, a);
    }
  }
  const out = new Map<string, ResultadoColab>();
  for (const [colaboradorId, a] of acc) {
    const regra = regraDaCompetencia(input.regras, colaboradorId, input.comp);
    const base = regra ? r2(regra.base === "margem" ? a.margem : a.receita) : 0;
    const comissao = regra ? comissaoPorRegra(regra, base) : 0;
    out.set(colaboradorId, {
      colaboradorId,
      regraId: regra?.id ?? null,
      regraNome: regra?.nome ?? null,
      baseTipo: regra?.base ?? null,
      base,
      comissao,
      pctEfetivo: base > 0 ? comissao / base : 0,
      qtdVendas: a.qtd,
      semCusto: a.semCusto,
    });
  }
  return out;
}

/**
 * Ajuste negativo, na competência atual, de um estorno de venda cuja
 * competência já foi fechada: desfaz a parte proporcional da comissão, usando
 * a base e o percentual efetivo congelados no fechamento daquele mês.
 */
export function ajustesDoEstorno(
  e: { itens: { colaboradorId: string; pct: number }[]; baseReceita: number; baseMargem: number | null },
  snap: Record<string, { baseTipo: BaseComissao; pctEfetivo: number } | undefined>,
): { colaboradorId: string; valor: number }[] {
  const out: { colaboradorId: string; valor: number }[] = [];
  for (const it of e.itens) {
    const s = snap[it.colaboradorId];
    if (!s) continue;
    const base = s.baseTipo === "margem" ? (e.baseMargem ?? 0) : e.baseReceita;
    const valor = -r2((base * it.pct * s.pctEfetivo) / 100);
    if (valor !== 0) out.push({ colaboradorId: it.colaboradorId, valor });
  }
  return out;
}
