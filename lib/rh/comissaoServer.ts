// lib/rh/comissaoServer.ts
// Comissões — acesso a dados (Admin SDK). SOMENTE servidor.
//
// Onde mora cada coisa (users/{owner}/...):
//   rhComissaoRegras/{id}      regras (fixo/faixa, receita/margem, vigência)
//   rhConfig/margem            premissas da margem (imposto, cartão, outros %)
//   rhAtribuicoes/{key}        venda → vendedores (key = "<origem>_<id da venda>")
//   rhEstornos/{id}            estorno/cancelamento/devolução de uma venda atribuída
//   rhComissoes/{comp}_{colab} retrato da comissão congelado no fechamento
// A venda em si continua sendo o lançamento de `cashflow` (ou `vendas`, quando
// fica fora do caixa) — nada é alterado nelas.

import type { DocumentData } from "firebase-admin/firestore";
import { resolveUnitCost, type CostHistory } from "@/lib/salesReport";
import { ajustesDoEstorno, calcularComissoes, margemDaVenda, r2, type BaseComissao, type ConfigMargem, type RegraComissao, type ResultadoColab, type VendaCalc } from "./comissao";
import { monthOf } from "./datas";
import { competenciasFechadas, rhCol, type RhBase } from "./server";

export type OrigemVenda = "cashflow" | "vendas";

export interface VendaLida {
  key: string;
  origem: OrigemVenda;
  refId: string;
  date: string;
  descricao: string;
  canal: string;
  sku: string;
  qty: number;
  valor: number;
  forma: string | null;
  orderId: string;
  foraDoCaixa: boolean;
}

export interface EstornoDoc {
  id: string;
  vendaKey: string;
  compVenda: string;
  data: string;
  valor: number;
  tipo: "estorno" | "cancelamento" | "devolucao";
  motivo: string;
  itens: { colaboradorId: string; pct: number }[];
  baseReceita: number;
  baseMargem: number | null;
  incluidoEm?: string;
}

export interface AtribuicaoDoc {
  key: string;
  origem: OrigemVenda;
  refId: string;
  comp: string;
  date: string;
  itens: { colaboradorId: string; pct: number }[];
}

export interface ResultadoComissao extends ResultadoColab {
  ajustes: { valor: number; estornoId: string; vendaKey: string }[];
  ajusteTotal: number;
  /** Comissão do mês + ajustes de estornos de meses fechados. */
  total: number;
}

export const chaveVenda = (origem: OrigemVenda, refId: string) => `${origem}_${refId}`;

export async function carregarRegras(ctx: RhBase): Promise<RegraComissao[]> {
  const snap = await rhCol(ctx, "rhComissaoRegras").get();
  return snap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id, nome: String(x.nome ?? ""), escopo: x.escopo === "lista" ? "lista" : "todos",
      colaboradorIds: Array.isArray(x.colaboradorIds) ? x.colaboradorIds : [],
      tipo: x.tipo === "faixa" ? "faixa" : "fixo", base: x.base === "margem" ? "margem" : "receita",
      pct: Number(x.pct) || 0, faixas: Array.isArray(x.faixas) ? x.faixas : [],
      faixaModo: x.faixaModo === "total" ? "total" : "marginal",
      inicio: String(x.inicio), fim: (x.fim as string | null) ?? null, ativa: x.ativa !== false,
    } satisfies RegraComissao;
  });
}

export async function carregarConfigMargem(ctx: RhBase): Promise<ConfigMargem> {
  const s = await rhCol(ctx, "rhConfig").doc("margem").get();
  const x = (s.exists ? s.data() : {}) as Partial<ConfigMargem>;
  return {
    aliquotaImpostoPct: Number(x.aliquotaImpostoPct) || 0,
    taxaDebitoPct: Number(x.taxaDebitoPct) || 0,
    taxaCreditoPct: Number(x.taxaCreditoPct) || 0,
    outrosCustosPct: Number(x.outrosCustosPct) || 0,
  };
}

/** Tabela de custo por SKU do relatório de vendas (profile/relatorioVendasCustos). */
export async function carregarCustos(ctx: RhBase): Promise<CostHistory> {
  const s = await ctx.db.collection("users").doc(ctx.ownerUid).collection("profile").doc("relatorioVendasCustos").get();
  const raw = (s.exists ? s.data()?.costs : null) as Record<string, unknown> | null;
  const out: CostHistory = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    if (k.startsWith("s_") && Array.isArray(v)) out[k.slice(2)] = v as CostHistory[string];
  }
  return out;
}

export async function carregarEstornos(ctx: RhBase): Promise<EstornoDoc[]> {
  const snap = await rhCol(ctx, "rhEstornos").get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<EstornoDoc, "id">) }));
}

export async function carregarAtribuicoes(ctx: RhBase, comp?: string): Promise<AtribuicaoDoc[]> {
  const col = rhCol(ctx, "rhAtribuicoes");
  const snap = await (comp ? col.where("comp", "==", comp).get() : col.get());
  return snap.docs.map((d) => ({ key: d.id, ...(d.data() as Omit<AtribuicaoDoc, "key">) }));
}

function lerDoc(origem: OrigemVenda, id: string, x: DocumentData): VendaLida | null {
  if (x.type !== "entrada" || x.category !== "Vendas" || !(Number(x.amount) > 0)) return null;
  return {
    key: chaveVenda(origem, id), origem, refId: id, date: String(x.date ?? ""),
    descricao: String(x.description ?? ""), canal: String(x.saleChannel ?? ""), sku: String(x.saleSku ?? ""),
    qty: Number(x.saleQty) || 0, valor: Number(x.amount) || 0,
    forma: (x.paymentMethod as string | undefined) ?? null, orderId: String(x.orderId ?? ""), foraDoCaixa: origem === "vendas",
  };
}

export async function lerVenda(ctx: RhBase, origem: OrigemVenda, refId: string): Promise<VendaLida | null> {
  const s = await ctx.db.collection("users").doc(ctx.ownerUid).collection(origem).doc(refId).get();
  return s.exists ? lerDoc(origem, s.id, s.data()!) : null;
}

/** Vendas do mês (caixa + fora do caixa). Filtra em memória: evita índice composto. */
export async function listarVendasDoMes(ctx: RhBase, comp: string): Promise<VendaLida[]> {
  const user = ctx.db.collection("users").doc(ctx.ownerUid);
  const [a, b] = await Promise.all(
    (["cashflow", "vendas"] as const).map((n) => user.collection(n).where("date", ">=", `${comp}-01`).where("date", "<=", `${comp}-31`).limit(2000).get()),
  );
  const out: VendaLida[] = [];
  a.docs.forEach((d) => { const v = lerDoc("cashflow", d.id, d.data()); if (v) out.push(v); });
  b.docs.forEach((d) => { const v = lerDoc("vendas", d.id, d.data()); if (v) out.push(v); });
  return out.sort((x, y) => y.date.localeCompare(x.date));
}

/** Taxas reais do marketplace por pedido ("canal|pedido"), das saídas "<pedido>:fee". */
export async function taxasPorPedido(ctx: RhBase, vendas: VendaLida[]): Promise<Map<string, number>> {
  const ids = [...new Set(vendas.filter((v) => v.orderId).map((v) => `${v.orderId}:fee`))];
  const out = new Map<string, number>();
  const user = ctx.db.collection("users").doc(ctx.ownerUid);
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10);
    for (const nome of ["cashflow", "vendas"]) {
      const snap = await user.collection(nome).where("orderId", "in", chunk).get();
      snap.docs.forEach((d) => {
        const x = d.data();
        const k = `${x.saleChannel}|${String(x.orderId).replace(/:fee$/, "")}`;
        out.set(k, (out.get(k) ?? 0) + (Number(x.amount) || 0));
      });
    }
  }
  return out;
}

export function vendaCalc(
  v: VendaLida,
  taxas: Map<string, number>,
  custos: CostHistory,
  itens: { colaboradorId: string; pct: number }[],
  estornadoReceita = 0,
): VendaCalc {
  const { unitCost } = v.sku ? resolveUnitCost(v.sku, v.date, custos) : { unitCost: null };
  return {
    key: v.key, date: v.date, amount: v.valor,
    custoProduto: unitCost === null ? null : r2(unitCost * v.qty),
    taxaMarketplace: v.orderId ? taxas.get(`${v.canal}|${v.orderId}`) ?? 0 : 0,
    forma: v.forma, itens, estornadoReceita,
  };
}

/**
 * Comissão de cada colaborador numa competência ABERTA (competência fechada usa
 * o retrato congelado). Soma ao resultado do mês os ajustes (negativos) de
 * estornos de vendas de competências já fechadas. Ver `incluidoEm`: cada
 * estorno só afeta UMA competência.
 */
export async function apurarComissoes(ctx: RhBase, comp: string): Promise<{ porColab: Map<string, ResultadoComissao>; estornosAplicados: string[] }> {
  const [regras, atribs, estornos, fechadasArr] = await Promise.all([
    carregarRegras(ctx), carregarAtribuicoes(ctx, comp), carregarEstornos(ctx), competenciasFechadas(ctx),
  ]);
  const fechadas = new Set(fechadasArr);
  const cfg = await carregarConfigMargem(ctx);
  const out = new Map<string, ResultadoComissao>();
  const novo = (colaboradorId: string): ResultadoComissao => ({
    colaboradorId, regraId: null, regraNome: null, baseTipo: null, base: 0, comissao: 0, pctEfetivo: 0, qtdVendas: 0,
    semCusto: [], ajustes: [], ajusteTotal: 0, total: 0,
  });

  // Estornos que afetam esta competência: (a) da própria competência da venda,
  // enquanto ela está aberta; (b) de venda de competência fechada, na data do estorno.
  const vale = (e: EstornoDoc) => !e.incluidoEm || e.incluidoEm === comp;
  const mesmaComp = estornos.filter((e) => vale(e) && e.compVenda === comp);
  const deFechada = estornos.filter((e) => vale(e) && e.compVenda !== comp && fechadas.has(e.compVenda) && monthOf(e.data) === comp);

  if (atribs.length > 0 && regras.length > 0) {
    const custos = await carregarCustos(ctx);
    const lidas = (await Promise.all(atribs.map((a) => lerVenda(ctx, a.origem, a.refId)))).filter((v): v is VendaLida => !!v);
    const porKey = new Map(atribs.map((a) => [a.key, a]));
    const taxas = await taxasPorPedido(ctx, lidas);
    const estornadoPor = new Map<string, number>();
    mesmaComp.forEach((e) => estornadoPor.set(e.vendaKey, (estornadoPor.get(e.vendaKey) ?? 0) + e.valor));
    const vendas = lidas.map((v) => vendaCalc(v, taxas, custos, porKey.get(v.key)!.itens, estornadoPor.get(v.key) ?? 0));
    for (const [id, r] of calcularComissoes({ comp, regras, vendas, cfg })) {
      out.set(id, { ...novo(id), ...r, total: r.comissao });
    }
  }
  for (const e of deFechada) {
    const snaps = await Promise.all(e.itens.map((i) => rhCol(ctx, "rhComissoes").doc(`${e.compVenda}_${i.colaboradorId}`).get()));
    const snap: Record<string, { baseTipo: BaseComissao; pctEfetivo: number }> = {};
    snaps.forEach((s, k) => {
      const x = s.data();
      if (x?.baseTipo) snap[e.itens[k].colaboradorId] = { baseTipo: x.baseTipo, pctEfetivo: Number(x.pctEfetivo) || 0 };
    });
    for (const aj of ajustesDoEstorno(e, snap)) {
      const r = out.get(aj.colaboradorId) ?? novo(aj.colaboradorId);
      r.ajustes.push({ valor: aj.valor, estornoId: e.id, vendaKey: e.vendaKey });
      r.ajusteTotal = r2(r.ajusteTotal + aj.valor);
      out.set(aj.colaboradorId, r);
    }
  }
  for (const r of out.values()) r.total = r2(r.comissao + r.ajusteTotal);
  return { porColab: out, estornosAplicados: [...mesmaComp, ...deFechada].map((e) => e.id) };
}

/** Margem de uma venda (pra mostrar na lista e congelar no estorno). */
export async function margemDaVendaLida(ctx: RhBase, v: VendaLida): Promise<number | null> {
  const [custos, cfg, taxas] = await Promise.all([carregarCustos(ctx), carregarConfigMargem(ctx), taxasPorPedido(ctx, [v])]);
  return margemDaVenda(vendaCalc(v, taxas, custos, []), cfg);
}

/** Lê várias vendas de uma vez (Admin getAll). Venda removida some da lista. */
export async function lerVendasEmLote(ctx: RhBase, atribs: AtribuicaoDoc[]): Promise<VendaLida[]> {
  const user = ctx.db.collection("users").doc(ctx.ownerUid);
  const out: VendaLida[] = [];
  for (let i = 0; i < atribs.length; i += 300) {
    const chunk = atribs.slice(i, i + 300);
    const snaps = await ctx.db.getAll(...chunk.map((a) => user.collection(a.origem).doc(a.refId)));
    snaps.forEach((s, k) => {
      if (!s.exists) return;
      const v = lerDoc(chunk[k].origem, s.id, s.data()!);
      if (v) out.push(v);
    });
  }
  return out;
}
