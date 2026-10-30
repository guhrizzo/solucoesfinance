// lib/rh/irpf.ts
// Demonstrativo anual de IRPF (rendimentos e imposto retido na fonte) de um
// colaborador, montado SÓ com folhas e eventos FECHADOS. Funções puras.
// É um demonstrativo gerencial para conferência: não substitui o Informe de
// Rendimentos oficial que o contador emite.

import { r2 } from "./custo";

export interface FolhaFechadaIrpf {
  comp: string;
  dependentes: number;
  /** Remuneração tributável (base do IRRF antes das deduções). */
  baseIrrf: number;
  inss: number;
  irrf: number;
  metodo: "legal" | "simplificado" | null;
}

export interface EventoFechadoIrpf {
  id: string;
  tipo: string;
  comp: string;
  /** Rendimento tributável do mês e do 13º (tributação exclusiva). */
  rendimentoNormal: number;
  rendimento13: number;
  inss: number;
  irrf: number;
}

export interface LinhaMesIrpf {
  comp: string;
  rendimento: number;
  inss: number;
  dependentes: number;
  irrf: number;
  metodo: "legal" | "simplificado" | null;
}

export interface DemonstrativoIrpf {
  ano: number;
  meses: LinhaMesIrpf[];
  eventos: EventoFechadoIrpf[];
  totais: { rendimentos: number; rendimentos13: number; inss: number; irrf: number };
}

export function montarDemonstrativoIrpf(ano: number, folhas: FolhaFechadaIrpf[], eventos: EventoFechadoIrpf[]): DemonstrativoIrpf {
  const prefixo = `${ano}-`;
  const meses: LinhaMesIrpf[] = folhas
    .filter((f) => f.comp.startsWith(prefixo))
    .sort((a, b) => a.comp.localeCompare(b.comp))
    .map((f) => ({ comp: f.comp, rendimento: r2(f.baseIrrf), inss: r2(f.inss), dependentes: f.dependentes, irrf: r2(f.irrf), metodo: f.metodo }));
  const evs = eventos.filter((e) => e.comp.startsWith(prefixo)).sort((a, b) => a.comp.localeCompare(b.comp) || a.tipo.localeCompare(b.tipo));
  const soma = (xs: number[]) => r2(xs.reduce((s, n) => s + n, 0));
  return {
    ano, meses, eventos: evs,
    totais: {
      rendimentos: soma([...meses.map((m) => m.rendimento), ...evs.map((e) => e.rendimentoNormal)]),
      rendimentos13: soma(evs.map((e) => e.rendimento13)),
      inss: soma([...meses.map((m) => m.inss), ...evs.map((e) => e.inss)]),
      irrf: soma([...meses.map((m) => m.irrf), ...evs.map((e) => e.irrf)]),
    },
  };
}
