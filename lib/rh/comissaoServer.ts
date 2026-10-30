// lib/rh/comissaoServer.ts
// Comissões — acesso a dados (Admin SDK). SOMENTE servidor.
//
// A comissão é LANÇADA À MÃO (base e valor), por colaborador e competência, e não
// depende de vendas, relatório de vendas, regras ou estornos. Onde mora cada coisa
// (users/{owner}/...):
//   rhComissaoManual/{comp}_{colab}  lançamento manual { base, comissao }
//   rhComissoes/{comp}_{colab}       retrato da comissão congelado no fechamento

import { r2 } from "./comissao";
import { rhCol, type RhBase } from "./server";

export interface ResultadoComissao {
  colaboradorId: string;
  regraId: null;
  regraNome: null;
  baseTipo: null;
  base: number;
  comissao: number;
  pctEfetivo: number;
  qtdVendas: number;
  semCusto: string[];
  ajustes: { valor: number; estornoId: string; vendaKey: string }[];
  ajusteTotal: number;
  /** Comissão lançada na competência. */
  total: number;
}

export const idComissaoManual = (comp: string, colaboradorId: string) => `${comp}_${colaboradorId}`;

/** Comissão lançada de cada colaborador numa competência (competência fechada usa o retrato congelado). */
export async function apurarComissoes(ctx: RhBase, comp: string): Promise<{ porColab: Map<string, ResultadoComissao> }> {
  const snap = await rhCol(ctx, "rhComissaoManual").where("comp", "==", comp).get();
  const porColab = new Map<string, ResultadoComissao>();
  for (const d of snap.docs) {
    const x = d.data();
    const colaboradorId = String(x.colaboradorId);
    const base = r2(Number(x.base) || 0);
    const comissao = r2(Number(x.comissao) || 0);
    porColab.set(colaboradorId, {
      colaboradorId, regraId: null, regraNome: null, baseTipo: null, base, comissao,
      pctEfetivo: base > 0 ? comissao / base : 0, qtdVendas: 0, semCusto: [], ajustes: [], ajusteTotal: 0, total: comissao,
    });
  }
  return { porColab };
}
