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
//  • Adicional noturno (só CLT, do cadastro): horas/mês × dias ativos/dias do
//    mês × (salário ÷ divisor de horas) × %. Integra provisões e encargos.
//  • Insalubridade (grau % × salário mínimo) e periculosidade (% × salário-base
//    do período), só CLT, proporcionais ao mês — mesma regra da folha.
//    Todos os adicionais integram provisões e encargos.
//    Com folha fechada nenhum soma: o salário-base apurado já os contém.

import { daysInMonth, lastDay } from "./datas";
import { diasAtivos, valorProporcional, vigenciaEm, type Vigencia } from "./vigencia";

export type Vinculo = "CLT" | "PJ" | "estagio" | "outro";

export const ENCARGOS_PATRONAIS = ["inssPatronal", "rat", "terceiros", "outros"] as const;
export type AliquotasPatronais = Record<(typeof ENCARGOS_PATRONAIS)[number], number>;
export type DetalheEncargos = Partial<AliquotasPatronais & { fgts: number; fgtsRescisorio: number }>;
export interface DadosEncargos {
  pct: number;
  aliquotas?: AliquotasPatronais;
}

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
  encargos: Vigencia<DadosEncargos>[];
  fgts?: {
    aliquota: number | null;
    rescisorio: number;
    folha?: { fgts: number; fgtsRescisorio: number };
  };
  beneficios: Vigencia<BeneficioVig>[];
  comissao: number;
  bonus: number;
  /** Adicional noturno fixo do cadastro; divisorHoras = horas/mês da folha (ex.: 220). */
  adicionalNoturno?: { horasMes: number; pct: number; divisorHoras: number };
  /** Grau de insalubridade (% sobre o salário mínimo vigente). */
  insalubridade?: { pct: number; salarioMinimo: number };
  /** Periculosidade (% sobre o salário-base). */
  periculosidade?: { pct: number };
  /** Folha fechada: remuneração-base real do mês (substitui o salário do contrato). */
  salarioOverride?: number;
}

export interface CustoMes {
  comp: string;
  diasAtivos: number;
  diasMes: number;
  salario: number;
  /** Adicional noturno estimado do mês (0 quando não tem ou quando veio da folha fechada). */
  adNoturno: number;
  insalubridade: number;
  periculosidade: number;
  prov13: number;
  provFerias: number;
  comissao: number;
  bonus: number;
  encargosPct: number;
  encargos: number;
  detalheEncargos?: DetalheEncargos;
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
    return { ...base, salario: 0, adNoturno: 0, insalubridade: 0, periculosidade: 0, prov13: 0, provFerias: 0, encargosPct: 0, encargos: 0, beneficios: [], beneficiosTotal: 0, total: 0, semSalario: false };
  }

  const daFolha = i.salarioOverride !== undefined;
  const salario = r2(daFolha ? (i.salarioOverride as number) : valorProporcional(i.salarios, dias, i.comp, (d) => d.valor));
  const semSalario = salario === 0;
  const clt = i.vinculo === "CLT";

  const ultimoDia = dias[dias.length - 1] ?? lastDay(i.comp);
  const an = i.adicionalNoturno;
  let adNoturno = 0;
  if (clt && !daFolha && an && an.horasMes > 0 && an.pct > 0 && an.divisorHoras > 0) {
    const salarioMensal = vigenciaEm(i.salarios, ultimoDia)?.dados.valor ?? 0;
    const horas = (an.horasMes * dias.length) / diasMes;
    adNoturno = r2(horas * (salarioMensal / an.divisorHoras) * (an.pct / 100));
  }
  const salarioMensalVig = vigenciaEm(i.salarios, ultimoDia)?.dados.valor ?? 0;
  const proporcao = salarioMensalVig > 0 ? Math.min(1, salario / salarioMensalVig) : 1;
  const ins = i.insalubridade;
  const insalubridade = clt && !daFolha && ins && ins.pct > 0 && ins.salarioMinimo > 0
    ? r2(ins.salarioMinimo * (ins.pct / 100) * proporcao) : 0;
  const per = i.periculosidade;
  const periculosidade = clt && !daFolha && per && per.pct > 0 ? r2(salario * (per.pct / 100)) : 0;
  const remuneracao = salario + adNoturno + insalubridade + periculosidade;

  const prov13 = clt ? r2(remuneracao / 12) : 0;
  const provFerias = clt ? r2((remuneracao / 12) * (4 / 3)) : 0;

  const vigenciaEncargos = clt ? vigenciaEm(i.encargos, ultimoDia)?.dados : undefined;
  const aliquotas = vigenciaEncargos?.aliquotas;
  const encargosPct = aliquotas ? 0 : Math.max(0, vigenciaEncargos?.pct ?? 0);
  const baseEncargos = remuneracao + prov13 + provFerias + base.comissao + base.bonus;
  let encargos = r2((baseEncargos * encargosPct) / 100);
  let detalheEncargos: DetalheEncargos | undefined;
  if (clt && (aliquotas || (i.fgts && encargosPct === 0))) {
    detalheEncargos = {};
    if (aliquotas) {
      for (const encargo of ENCARGOS_PATRONAIS) {
        detalheEncargos[encargo] = r2((baseEncargos * aliquotas[encargo]) / 100);
      }
    }
    const fgts = i.fgts;
    if (fgts && (fgts.aliquota !== null || fgts.folha)) {
      const baseFgts = fgts.folha ? prov13 + provFerias : Math.max(0, baseEncargos);
      detalheEncargos.fgts = r2((fgts.folha?.fgts ?? 0) + (baseFgts * (fgts.aliquota ?? 0)) / 100);
      if (fgts.rescisorio > 0 || (fgts.folha?.fgtsRescisorio ?? 0) > 0) {
        detalheEncargos.fgtsRescisorio = r2((fgts.folha?.fgtsRescisorio ?? 0) + (baseFgts * fgts.rescisorio) / 100);
      }
    }
    encargos = r2(Object.values(detalheEncargos).reduce((soma, valor) => soma + valor, 0));
  }

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

  const total = r2(salario + adNoturno + insalubridade + periculosidade + prov13 + provFerias + encargos + beneficiosTotal + base.comissao + base.bonus);
  return { ...base, salario, adNoturno, insalubridade, periculosidade, prov13, provFerias, encargosPct, encargos, beneficios, beneficiosTotal, total, semSalario, ...(detalheEncargos ? { detalheEncargos } : {}), ...(daFolha ? { salarioDaFolha: true } : {}) };
}
