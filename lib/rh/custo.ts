// lib/rh/custo.ts
// Custo mensal gerencial de um colaborador, por COMPETÊNCIA (mês em que o
// custo foi gerado, não o do pagamento). Função pura.
//
// Premissas (documentadas na tela):
//  • Encargos e provisões (13º, férias + 1/3) só existem para vínculo CLT.
//  • Salário e benefícios são pro-rata pelos dias em que o colaborador esteve
//    ativo no mês (admissão/saída/mudança de salário no meio do mês).
//  • Provisão de 13º = 1/12 do salário do mês; férias + 1/3 = 1/12 × 4/3.
//  • Base dos encargos = salário + 13º + férias + comissão + bônus.
//    Benefícios ficam fora da base.
//  • O percentual de encargos é o vigente no último dia ativo do mês.

import { daysInMonth, lastDay } from "./datas";
import { diasAtivos, valorProporcional, vigenciaEm, type Vigencia } from "./vigencia";

export type Vinculo = "CLT" | "PJ" | "estagio" | "outro";

export interface BeneficioVig {
  nome: string;
  tipo: string; // vt | vr | saude | outro
  valor: number;
}

export interface CustoInput {
  comp: string;
  entrada: string;
  saida: string | null;
  vinculo: Vinculo;
  salarios: Vigencia<{ valor: number }>[];
  encargos: Vigencia<{ pct: number }>[];
  beneficios: Vigencia<BeneficioVig>[];
  comissao: number;
  bonus: number;
  /** Folha fechada: remuneração-base real do mês (substitui o salário do contrato). */
  salarioOverride?: number;
}

export interface CustoMes {
  comp: string;
  diasAtivos: number;
  diasMes: number;
  salario: number;
  prov13: number;
  provFerias: number;
  comissao: number;
  bonus: number;
  encargosPct: number;
  encargos: number;
  beneficios: { nome: string; tipo: string; valor: number }[];
  beneficiosTotal: number;
  total: number;
  semSalario: boolean;
  /** true quando o salário veio da folha fechada (e não do contrato). */
  salarioDaFolha?: boolean;
}

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function calcularCustoMes(i: CustoInput): CustoMes {
  const dias = diasAtivos(i.comp, i.entrada, i.saida);
  const diasMes = daysInMonth(i.comp);
  const base = {
    comp: i.comp,
    diasAtivos: dias.length,
    diasMes,
    comissao: r2(i.comissao), // pode ser negativa: ajuste de estorno de mês fechado
    bonus: r2(Math.max(0, i.bonus)),
  };

  if (dias.length === 0) {
    return { ...base, salario: 0, prov13: 0, provFerias: 0, encargosPct: 0, encargos: 0, beneficios: [], beneficiosTotal: 0, total: 0, semSalario: false };
  }

  const daFolha = i.salarioOverride !== undefined;
  const salario = r2(daFolha ? (i.salarioOverride as number) : valorProporcional(i.salarios, dias, i.comp, (d) => d.valor));
  const semSalario = salario === 0;
  const clt = i.vinculo === "CLT";

  const prov13 = clt ? r2(salario / 12) : 0;
  const provFerias = clt ? r2((salario / 12) * (4 / 3)) : 0;

  const ultimoDia = dias[dias.length - 1] ?? lastDay(i.comp);
  const encargosPct = clt ? Math.max(0, vigenciaEm(i.encargos, ultimoDia)?.dados.pct ?? 0) : 0;
  const baseEncargos = salario + prov13 + provFerias + base.comissao + base.bonus;
  const encargos = clt ? r2((baseEncargos * encargosPct) / 100) : 0;

  // Benefícios: agrupa por nome (cada nome é uma "linha" com seu histórico).
  const porNome = new Map<string, Vigencia<BeneficioVig>[]>();
  for (const b of i.beneficios) {
    const k = b.dados.nome.trim().toLowerCase();
    porNome.set(k, [...(porNome.get(k) ?? []), b]);
  }
  const beneficios: CustoMes["beneficios"] = [];
  for (const lista of porNome.values()) {
    const valor = r2(valorProporcional(lista, dias, i.comp, (d) => d.valor));
    if (valor > 0) beneficios.push({ nome: lista[0].dados.nome, tipo: lista[0].dados.tipo, valor });
  }
  const beneficiosTotal = r2(beneficios.reduce((s, b) => s + b.valor, 0));

  const total = r2(salario + prov13 + provFerias + encargos + beneficiosTotal + base.comissao + base.bonus);
  return { ...base, salario, prov13, provFerias, encargosPct, encargos, beneficios, beneficiosTotal, total, semSalario, ...(daFolha ? { salarioDaFolha: true } : {}) };
}
