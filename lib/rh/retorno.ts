// lib/rh/retorno.ts
// Relatório "Retorno por pessoa": quanto cada vendedor trouxe e quanto custou.
// Funções puras — a leitura dos dados fica em app/api/rh/retorno.
//
// Definições (por colaborador, no período):
//   receita atribuída      = Σ (valor da venda − estornos) × % do vendedor
//   margem bruta atribuída = Σ margem da venda × % (receita − custo do produto −
//                            impostos − taxa de cartão − taxa do marketplace −
//                            outros custos). Venda sem custo cadastrado fica fora.
//   comissão               = comissão apurada nas competências do período
//   margem de contribuição = margem bruta − comissão          (indicador principal)
//   custo total alocado    = custo mensal (salário, encargos, provisões, benefícios,
//                            bônus) SEM a comissão, que já foi descontada acima
//   resultado líquido      = contribuição − custo alocado      (complementar)
//   retorno s/ comissão    = contribuição ÷ comissão

import { r2 } from "./comissao";

export const FAIXAS_MARGEM = ["negativa", "ate10", "ate20", "ate30", "acima30", "semCusto"] as const;
export type FaixaMargem = (typeof FAIXAS_MARGEM)[number];

export function faixaDeMargem(margem: number | null, amount: number): FaixaMargem {
  if (margem === null || !(amount > 0)) return "semCusto";
  const p = (margem / amount) * 100;
  if (p < 0) return "negativa";
  if (p < 10) return "ate10";
  if (p < 20) return "ate20";
  if (p < 30) return "ate30";
  return "acima30";
}

export interface VendaRetorno {
  key: string;
  comp: string;
  sku: string;
  amount: number;
  /** Margem bruta da venda inteira; null = sem custo cadastrado. */
  margem: number | null;
  /** Desconto concedido (R$): preço de tabela × qtd − valor cobrado, quando positivo. */
  desconto: number;
  estornado: number;
  itens: { colaboradorId: string; pct: number }[];
}

export interface CustoPessoaMes {
  comp: string;
  colaboradorId: string;
  total: number;
  comissao: number;
  rateio: { itens: { centroId: string; valor: number }[]; naoAlocado: number };
  /** Base e % efetivo da comissão (pra repartir por produto). */
  pctEfetivo: number;
  baseTipo: "receita" | "margem" | null;
}

export interface FiltrosRetorno {
  colaboradorIds?: string[];
  centroId?: string | null;
  sku?: string | null;
  /** Visão do próprio vendedor: sem custo de pessoal (dado de gestão). */
  semCustoPessoal?: boolean;
}

export interface LinhaRetorno {
  colaboradorId: string;
  nome: string;
  receita: number;
  vendas: number;
  ticket: number | null;
  margemBruta: number;
  /** % da margem sobre a receita das vendas que têm custo. */
  margemPct: number | null;
  comissao: number;
  contribuicao: number;
  custoAlocado: number | null;
  resultado: number | null;
  retornoComissao: number | null;
  semCusto: number;
  desconto: number;
  descontoPct: number | null;
  mix: Record<FaixaMargem, { receita: number; vendas: number }>;
}

const mixVazio = () => Object.fromEntries(FAIXAS_MARGEM.map((f) => [f, { receita: 0, vendas: 0 }])) as LinhaRetorno["mix"];

export function calcularRetorno(input: {
  vendas: VendaRetorno[];
  custos: CustoPessoaMes[];
  nomes: Map<string, string>;
  filtros: FiltrosRetorno;
}): { linhas: LinhaRetorno[]; totais: Omit<LinhaRetorno, "colaboradorId" | "nome"> } {
  const { filtros } = input;
  const permitido = (id: string) => !filtros.colaboradorIds || filtros.colaboradorIds.length === 0 || filtros.colaboradorIds.includes(id);
  const sku = filtros.sku ? filtros.sku.toUpperCase() : null;

  const acc = new Map<string, {
    receita: number; vendas: number; margem: number; receitaComCusto: number; comissaoProduto: number;
    semCusto: number; desconto: number; tabela: number; mix: LinhaRetorno["mix"];
  }>();
  const get = (id: string) => {
    let a = acc.get(id);
    if (!a) { a = { receita: 0, vendas: 0, margem: 0, receitaComCusto: 0, comissaoProduto: 0, semCusto: 0, desconto: 0, tabela: 0, mix: mixVazio() }; acc.set(id, a); }
    return a;
  };
  const meta = new Map(input.custos.map((c) => [`${c.comp}|${c.colaboradorId}`, c]));
  const distintas = new Set<string>();
  const tot = { receita: 0, receitaComCusto: 0, margem: 0, desconto: 0, tabela: 0, semCusto: 0, mix: mixVazio() };

  for (const v of input.vendas) {
    if (sku && v.sku.toUpperCase() !== sku) continue;
    if (!(v.amount > 0)) continue;
    const receitaEf = Math.max(0, v.amount - v.estornado);
    if (receitaEf <= 0) continue;
    const fator = receitaEf / v.amount;
    const faixa = faixaDeMargem(v.margem, v.amount);
    let contou = false;
    for (const it of v.itens) {
      if (!permitido(it.colaboradorId)) continue;
      const s = it.pct / 100;
      const a = get(it.colaboradorId);
      a.receita += receitaEf * s;
      a.vendas += 1;
      a.mix[faixa].receita += receitaEf * s;
      a.mix[faixa].vendas += 1;
      a.desconto += v.desconto * fator * s;
      a.tabela += (v.amount + v.desconto) * fator * s;
      let margemParte = 0;
      if (v.margem === null) a.semCusto += 1;
      else { margemParte = v.margem * fator * s; a.margem += margemParte; a.receitaComCusto += receitaEf * s; }
      // Comissão por produto: % efetivo do mês × base da regra (estimada).
      if (sku) {
        const m = meta.get(`${v.comp}|${it.colaboradorId}`);
        if (m && m.baseTipo) a.comissaoProduto += m.pctEfetivo * (m.baseTipo === "margem" ? margemParte : receitaEf * s);
      }
      contou = true;
    }
    if (contou) {
      distintas.add(v.key);
      tot.receita += receitaEf; tot.desconto += v.desconto * fator; tot.tabela += (v.amount + v.desconto) * fator;
      tot.mix[faixa].receita += receitaEf; tot.mix[faixa].vendas += 1;
      if (v.margem === null) tot.semCusto += 1; else { tot.margem += v.margem * fator; tot.receitaComCusto += receitaEf; }
    }
  }

  // Comissão e custo por colaborador (competências do período).
  const comissaoPor = new Map<string, number>();
  const custoPor = new Map<string, number>();
  const centroOk = new Set<string>();
  for (const c of input.custos) {
    if (!permitido(c.colaboradorId)) continue;
    let fracao = 1;
    if (filtros.centroId) {
      const parte = c.rateio.itens.find((i) => i.centroId === filtros.centroId)?.valor ?? 0;
      if (parte <= 0) continue;
      centroOk.add(c.colaboradorId);
      fracao = c.total !== 0 ? parte / c.total : 0;
    }
    comissaoPor.set(c.colaboradorId, (comissaoPor.get(c.colaboradorId) ?? 0) + c.comissao);
    custoPor.set(c.colaboradorId, (custoPor.get(c.colaboradorId) ?? 0) + (c.total - c.comissao) * fracao);
  }

  const ids = new Set<string>([...acc.keys(), ...[...comissaoPor].filter(([, v]) => v !== 0).map(([k]) => k)]);
  const linhas: LinhaRetorno[] = [];
  const semCusto = !!filtros.semCustoPessoal || !!sku;
  for (const id of ids) {
    if (filtros.centroId && !centroOk.has(id)) continue;
    const a = acc.get(id) ?? get(id);
    const comissao = r2(sku ? a.comissaoProduto : comissaoPor.get(id) ?? 0);
    const margemBruta = r2(a.margem);
    const contribuicao = r2(margemBruta - comissao);
    const custoAlocado = semCusto ? null : r2(custoPor.get(id) ?? 0);
    linhas.push({
      colaboradorId: id, nome: input.nomes.get(id) ?? "—",
      receita: r2(a.receita), vendas: a.vendas, ticket: a.vendas > 0 ? r2(a.receita / a.vendas) : null,
      margemBruta, margemPct: a.receitaComCusto > 0 ? (margemBruta / a.receitaComCusto) * 100 : null,
      comissao, contribuicao, custoAlocado, resultado: custoAlocado === null ? null : r2(contribuicao - custoAlocado),
      retornoComissao: comissao > 0 ? contribuicao / comissao : null, semCusto: a.semCusto,
      desconto: r2(a.desconto), descontoPct: a.tabela > 0 ? (a.desconto / a.tabela) * 100 : null, mix: a.mix,
    });
  }
  linhas.sort((x, y) => y.contribuicao - x.contribuicao);

  const soma = <K extends keyof LinhaRetorno>(k: K) => r2(linhas.reduce((s, l) => s + ((l[k] as number | null) ?? 0), 0));
  const comissaoT = soma("comissao");
  const margemT = r2(tot.margem);
  const contribT = r2(margemT - comissaoT);
  const custoT = semCusto ? null : soma("custoAlocado");
  return {
    linhas,
    totais: {
      receita: r2(tot.receita), vendas: distintas.size, ticket: distintas.size > 0 ? r2(tot.receita / distintas.size) : null,
      margemBruta: margemT, margemPct: tot.receitaComCusto > 0 ? (margemT / tot.receitaComCusto) * 100 : null,
      comissao: comissaoT, contribuicao: contribT, custoAlocado: custoT,
      resultado: custoT === null ? null : r2(contribT - custoT),
      retornoComissao: comissaoT > 0 ? contribT / comissaoT : null, semCusto: tot.semCusto,
      desconto: r2(tot.desconto), descontoPct: tot.tabela > 0 ? (tot.desconto / tot.tabela) * 100 : null, mix: tot.mix,
    },
  };
}
