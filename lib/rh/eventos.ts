// lib/rh/eventos.ts
// Férias, 13º salário (1ª e 2ª parcelas) e rescisão. Cada um é uma etapa
// separada, com conferência manual obrigatória antes de fechar. Funções puras.
//
// Como a legislação tem muitas exceções, o motor trabalha com LINHAS: o sistema
// SUGERE as verbas (com a incidência de INSS/IRRF/FGTS que costuma valer) e o
// usuário confere e ajusta valor e incidência antes de conferir/fechar. Os
// percentuais e dias-base vêm dos parâmetros da empresa (nada fixo aqui).
//
// Linha de PROVENTO soma nas bases marcadas; linha de DESCONTO com a marca
// subtrai da base (ex.: adiantamento de 13º reduz a base do FGTS). INSS e IRRF
// do grupo "decimo" (13º) são calculados à parte da remuneração normal.

import { r2 } from "./custo";
import { calcularInss, calcularIrrf, type ParametrosFolha, type TabelaInss, type TabelaIrrf } from "./folha";

export type TipoEvento = "ferias" | "decimo1" | "decimo2" | "rescisao";
export type Motivo = "sem_justa_causa" | "pedido_demissao" | "justa_causa" | "acordo";

export interface LinhaEvento {
  codigo: string;
  descricao: string;
  natureza: "provento" | "desconto";
  valor: number;
  inss: boolean;
  irrf: boolean;
  fgts: boolean;
  grupo: "normal" | "decimo";
  /** Valor apenas informativo (ex.: multa do FGTS, depositada na conta do FGTS): fora do líquido. */
  informativo?: boolean;
  ref?: string;
}

export interface ResultadoEvento {
  linhas: LinhaEvento[];
  bases: { inssNormal: number; irrfNormal: number; inssDecimo: number; irrfDecimo: number; fgts: number };
  inss: number;
  irrf: number;
  fgts: number;
  proventos: number;
  descontos: number;
  liquido: number;
  erros: string[];
}

export function calcularEvento(i: {
  linhas: LinhaEvento[];
  dependentes: number;
  inss: TabelaInss | null;
  irrf: TabelaIrrf | null;
  aliquotaFgts: number | null;
}): ResultadoEvento {
  const erros: string[] = [];
  const reais = i.linhas.filter((l) => !l.informativo && l.valor > 0);
  const soma = (campo: "inss" | "irrf" | "fgts", grupo?: "normal" | "decimo") =>
    Math.max(0, r2(reais.filter((l) => !grupo || l.grupo === grupo).reduce((s, l) => (l[campo] ? s + (l.natureza === "provento" ? l.valor : -l.valor) : s), 0)));
  const bases = {
    inssNormal: soma("inss", "normal"), irrfNormal: soma("irrf", "normal"),
    inssDecimo: soma("inss", "decimo"), irrfDecimo: soma("irrf", "decimo"), fgts: soma("fgts"),
  };

  let inss = 0;
  let irrf = 0;
  if (bases.inssNormal + bases.inssDecimo + bases.irrfNormal + bases.irrfDecimo > 0) {
    if (!i.inss) erros.push("Tabela de INSS não cadastrada para a competência.");
    if (!i.irrf) erros.push("Tabela de IRRF não cadastrada para a competência.");
  }
  if (i.inss && i.irrf) {
    const grupos: [number, number][] = [[bases.inssNormal, bases.irrfNormal], [bases.inssDecimo, bases.irrfDecimo]];
    for (const [bi, br] of grupos) {
      const iv = calcularInss(i.inss, bi);
      inss += iv;
      irrf += calcularIrrf(i.irrf, br, { inss: iv, dependentes: i.dependentes }).imposto;
    }
  }
  let fgts = 0;
  if (bases.fgts > 0) {
    if (i.aliquotaFgts === null) erros.push("Informe a alíquota do FGTS nos parâmetros.");
    else fgts = r2((bases.fgts * i.aliquotaFgts) / 100);
  }
  const proventos = r2(reais.filter((l) => l.natureza === "provento").reduce((s, l) => s + l.valor, 0));
  const descontosLinhas = r2(reais.filter((l) => l.natureza === "desconto").reduce((s, l) => s + l.valor, 0));
  inss = r2(inss); irrf = r2(irrf);
  const descontos = r2(descontosLinhas + inss + irrf);
  return { linhas: i.linhas, bases, inss, irrf, fgts, proventos, descontos, liquido: r2(proventos - descontos), erros };
}

// ── Sugestão de verbas ─────────────────────────────────────────────────────

export interface EntradaEvento {
  salarioMensal: number;
  /** Média de variáveis (comissões, horas extras…) a integrar nas verbas. */
  mediaVariaveis: number;
  params: ParametrosFolha;
  // férias
  diasGozo?: number;
  diasAbono?: number;
  // 13º
  avos?: number;
  valor1aParcela?: number;
  // rescisão
  motivo?: Motivo;
  diasSaldoSalario?: number;
  diasAvisoIndenizado?: number;
  avosDecimo?: number;
  avosFerias?: number;
  periodosFeriasVencidas?: number;
  saldoFgts?: number;
  pctMultaFgts?: number;
}

const linha = (l: Omit<LinhaEvento, "natureza" | "grupo"> & Partial<Pick<LinhaEvento, "natureza" | "grupo">>): LinhaEvento => ({
  natureza: "provento", grupo: "normal", ...l, valor: r2(l.valor),
});

/** Gera as linhas sugeridas; `erros` lista parâmetro faltando. */
export function sugerirLinhas(tipo: TipoEvento, e: EntradaEvento): { linhas: LinhaEvento[]; erros: string[] } {
  const erros: string[] = [];
  const base = e.salarioMensal + e.mediaVariaveis;
  const dias = e.params.diasBaseMes;
  const need = (v: number | null, msg: string) => { if (v === null || !(v > 0)) { erros.push(msg); return false; } return true; };
  const valorDia = () => (need(dias, "Informe os dias-base do mês nos parâmetros.") ? base / (dias as number) : 0);
  const terco = () => (need(e.params.pctTercoFerias, "Informe o % do terço de férias nos parâmetros.") ? (e.params.pctTercoFerias as number) / 100 : 0);
  const L: LinhaEvento[] = [];

  if (tipo === "ferias") {
    const gozo = (e.diasGozo ?? 0) * valorDia();
    const abono = (e.diasAbono ?? 0) * valorDia();
    if (gozo > 0) {
      L.push(linha({ codigo: "F01", descricao: "Férias", valor: gozo, inss: true, irrf: true, fgts: true, ref: `${e.diasGozo} dia(s)` }));
      L.push(linha({ codigo: "F02", descricao: "1/3 constitucional de férias", valor: gozo * terco(), inss: true, irrf: true, fgts: true }));
    }
    if (abono > 0) {
      L.push(linha({ codigo: "F03", descricao: "Abono pecuniário", valor: abono, inss: false, irrf: false, fgts: false, ref: `${e.diasAbono} dia(s)` }));
      L.push(linha({ codigo: "F04", descricao: "1/3 sobre abono pecuniário", valor: abono * terco(), inss: false, irrf: false, fgts: false }));
    }
  } else if (tipo === "decimo1") {
    if (need(e.params.pct1aParcela13, "Informe o % da 1ª parcela do 13º nos parâmetros.")) {
      const bruto = (base / 12) * (e.avos ?? 0);
      L.push(linha({ codigo: "D01", descricao: "13º salário — 1ª parcela", valor: (bruto * (e.params.pct1aParcela13 as number)) / 100, inss: false, irrf: false, fgts: true, grupo: "decimo", ref: `${e.avos}/12` }));
    }
  } else if (tipo === "decimo2") {
    const bruto = (base / 12) * (e.avos ?? 0);
    L.push(linha({ codigo: "D02", descricao: "13º salário — valor integral", valor: bruto, inss: true, irrf: true, fgts: true, grupo: "decimo", ref: `${e.avos}/12` }));
    if ((e.valor1aParcela ?? 0) > 0) {
      L.push(linha({ codigo: "D03", descricao: "(-) Adiantamento da 1ª parcela", natureza: "desconto", valor: e.valor1aParcela ?? 0, inss: false, irrf: false, fgts: true, grupo: "decimo" }));
    }
  } else {
    const motivo = e.motivo ?? "sem_justa_causa";
    const justa = motivo === "justa_causa";
    const saldo = (e.diasSaldoSalario ?? 0) * valorDia();
    if (saldo > 0) L.push(linha({ codigo: "R01", descricao: "Saldo de salário", valor: saldo, inss: true, irrf: true, fgts: true, ref: `${e.diasSaldoSalario} dia(s)` }));
    if ((e.diasAvisoIndenizado ?? 0) > 0 && !justa && motivo !== "pedido_demissao") {
      L.push(linha({ codigo: "R02", descricao: "Aviso prévio indenizado", valor: (e.diasAvisoIndenizado ?? 0) * valorDia(), inss: false, irrf: false, fgts: true, ref: `${e.diasAvisoIndenizado} dia(s)` }));
    }
    if ((e.avosDecimo ?? 0) > 0 && !justa) {
      L.push(linha({ codigo: "R03", descricao: "13º salário proporcional", valor: (base / 12) * (e.avosDecimo ?? 0), inss: true, irrf: true, fgts: true, grupo: "decimo", ref: `${e.avosDecimo}/12` }));
    }
    if ((e.periodosFeriasVencidas ?? 0) > 0) {
      const v = base * (e.periodosFeriasVencidas ?? 0);
      L.push(linha({ codigo: "R04", descricao: "Férias vencidas", valor: v, inss: false, irrf: false, fgts: false, ref: `${e.periodosFeriasVencidas} período(s)` }));
      L.push(linha({ codigo: "R05", descricao: "1/3 sobre férias vencidas", valor: v * terco(), inss: false, irrf: false, fgts: false }));
    }
    if ((e.avosFerias ?? 0) > 0 && !justa) {
      const v = (base / 12) * (e.avosFerias ?? 0);
      L.push(linha({ codigo: "R06", descricao: "Férias proporcionais", valor: v, inss: false, irrf: false, fgts: false, ref: `${e.avosFerias}/12` }));
      L.push(linha({ codigo: "R07", descricao: "1/3 sobre férias proporcionais", valor: v * terco(), inss: false, irrf: false, fgts: false }));
    }
    if ((e.saldoFgts ?? 0) > 0 && (e.pctMultaFgts ?? 0) > 0 && (motivo === "sem_justa_causa" || motivo === "acordo")) {
      L.push(linha({ codigo: "R08", descricao: "Multa do FGTS (depositada na conta do FGTS — informativo)", valor: ((e.saldoFgts ?? 0) * (e.pctMultaFgts ?? 0)) / 100, inss: false, irrf: false, fgts: false, informativo: true }));
    }
  }
  return { linhas: L, erros };
}

/** Texto de apoio do hash de conferência: muda se qualquer valor/linha mudar. */
export function assinaturaEvento(r: Pick<ResultadoEvento, "linhas" | "inss" | "irrf" | "fgts" | "liquido">): string {
  return JSON.stringify([r.linhas.map((l) => [l.codigo, l.descricao, l.natureza, l.valor, l.inss, l.irrf, l.fgts, l.grupo, !!l.informativo]), r.inss, r.irrf, r.fgts, r.liquido]);
}
