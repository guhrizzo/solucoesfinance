// RH — folha mensal, férias, 13º e rescisão. Tabelas e parâmetros abaixo são
// FICTÍCIOS (só pra testar o motor; o sistema não traz valor legal embutido).
import { test } from "node:test";
import assert from "node:assert/strict";

const INSS_T = { faixas: [{ ate: 1000, aliquota: 10 }, { ate: 2000, aliquota: 20 }, { ate: 3000, aliquota: 30 }] };
const IRRF_T = { faixas: [{ ate: 1000, aliquota: 0, deduzir: 0 }, { ate: 2000, aliquota: 10, deduzir: 100 }, { ate: null, aliquota: 20, deduzir: 300 }], deducaoDependente: 100, descontoSimplificado: 0 };
const PARAMS = { horasMes: 200, pctHE50: 50, pctHE100: 100, pctAdNoturno: 20, diasBaseMes: 30, pctVT: 6, aliquotaFgts: 8, pctTercoFerias: 33.33, pct1aParcela13: 50 };
const arred = (n) => Math.round(n * 100) / 100;

const rub = async () => {
  const { RUBRICAS_PADRAO } = await import("../../lib/rh/folha.ts");
  return RUBRICAS_PADRAO.map((r, i) => ({ ...r, id: `r${i}` }));
};
const entradaFolha = async (o = {}) => {
  const { LANCAMENTO_VAZIO } = await import("../../lib/rh/folha.ts");
  return {
    nomeColaborador: "Ana", dependentes: 0, salarioMensal: 2000, salarioPeriodo: 2000, lanc: { ...LANCAMENTO_VAZIO },
    comissao: 0, bonus: 0, vtBeneficio: 0, diasUteis: 25, domingosFeriados: 5, rubricas: await rub(), params: PARAMS,
    inss: INSS_T, irrf: IRRF_T, ...o,
  };
};

test("INSS progressivo com teto e IRRF com dependentes / desconto simplificado", async () => {
  const { calcularInss, calcularIrrf } = await import("../../lib/rh/folha.ts");
  assert.equal(calcularInss(INSS_T, 500), 50);
  assert.equal(calcularInss(INSS_T, 1500), 200); // 10% x 1000 + 20% x 500
  assert.equal(calcularInss(INSS_T, 9999), 600); // teto = 3000
  assert.equal(calcularIrrf(IRRF_T, 2000, { inss: 300, dependentes: 1 }).imposto, 60);
  assert.equal(calcularIrrf(IRRF_T, 2000, { inss: 300, dependentes: 0 }).imposto, 70);
  const simp = calcularIrrf({ ...IRRF_T, descontoSimplificado: 900 }, 2000, { inss: 300, dependentes: 0 });
  assert.equal(simp.metodo, "simplificado");
  assert.equal(simp.imposto, 10);
});

test("tabelas inválidas são recusadas", async () => {
  const { validarTabelaInss, validarTabelaIrrf } = await import("../../lib/rh/folha.ts");
  assert.equal(validarTabelaInss(INSS_T), null);
  assert.match(validarTabelaInss({ faixas: [{ ate: 2000, aliquota: 10 }, { ate: 1000, aliquota: 20 }] }), /crescentes/);
  assert.equal(validarTabelaIrrf(IRRF_T), null);
  assert.match(validarTabelaIrrf({ ...IRRF_T, faixas: [{ ate: 1000, aliquota: 0, deduzir: 0 }, { ate: 2000, aliquota: 10, deduzir: 0 }] }), /última faixa/);
});

test("folha: salário, INSS, IRRF, FGTS e líquido", async () => {
  const { calcularFolhaColab } = await import("../../lib/rh/folha.ts");
  const r = calcularFolhaColab(await entradaFolha());
  assert.deepEqual(r.erros, []);
  assert.equal(r.bases.inss, 2000);
  assert.equal(r.inss, 300);
  assert.equal(r.irrf, 70);
  assert.equal(r.fgts, 160);
  assert.equal(r.proventos, 2000);
  assert.equal(r.liquido, 1630);
  assert.equal(r.custoSalarioBase, 2000);
});

test("folha: horas extras, noturno, DSR, faltas, atrasos, comissão, bônus, VT e extras", async () => {
  const { calcularFolhaColab } = await import("../../lib/rh/folha.ts");
  const manual = { id: "m1", codigo: "0900", nome: "Adiantamento", natureza: "desconto", tipo: "manual", incidencia: { inss: false, irrf: false, fgts: false }, ativa: true };
  const e = await entradaFolha({
    rubricas: [...(await rub()), manual],
    lanc: { he50: 10, he100: 0, noturnas: 10, faltasDias: 1, atrasosHoras: 2, extras: [{ rubricaId: "m1", valor: 100 }] },
    comissao: 200, bonus: 50, vtBeneficio: 150,
  });
  const r = calcularFolhaColab(e);
  assert.deepEqual(r.erros, []);
  const v = (tipo) => r.itens.filter((i) => i.tipo === tipo).reduce((s, i) => s + i.valor, 0);
  assert.equal(v("he50"), 150); // 10h x (2000/200) x 1,5
  assert.equal(v("adnoturno"), 20);
  assert.equal(v("dsr"), 34); // (150+20)/25 x 5
  assert.equal(arred(v("faltas")), 66.67);
  assert.equal(v("atrasos"), 20);
  assert.equal(v("vt"), 120); // min(150, 6% de 2000)
  assert.equal(v("comissao"), 200);
  assert.equal(r.bases.inss, arred(2000 + 150 + 20 + 34 + 200 + 50 - 66.67 - 20));
  assert.equal(r.itens.some((i) => i.tipo === "manual"), true);
  // adiantamento (manual) e VT não mudam o custo da empresa; faltas e atrasos reduzem
  assert.equal(r.custoSalarioBase, arred(2000 + 150 + 20 + 34 - 66.67 - 20));
});

test("folha: sem tabela, parâmetro ou rubrica devolve erro em vez de assumir valor", async () => {
  const { calcularFolhaColab, PARAMETROS_VAZIOS, LANCAMENTO_VAZIO } = await import("../../lib/rh/folha.ts");
  const r = calcularFolhaColab(await entradaFolha({ inss: null, irrf: null, params: PARAMETROS_VAZIOS, lanc: { ...LANCAMENTO_VAZIO, he50: 5 }, vtBeneficio: 100, rubricas: [] }));
  const txt = r.erros.join(" | ");
  assert.match(txt, /INSS/);
  assert.match(txt, /IRRF/);
  assert.match(txt, /FGTS/);
  assert.match(txt, /hora/i);
  assert.match(txt, /rubrica/i);
});

test("comissão negativa (ajuste de estorno) vira desconto", async () => {
  const { calcularFolhaColab } = await import("../../lib/rh/folha.ts");
  const r = calcularFolhaColab(await entradaFolha({ comissao: -80 }));
  const c = r.itens.find((i) => i.tipo === "comissao");
  assert.equal(c.natureza, "desconto");
  assert.equal(c.valor, 80);
});

test("férias: gozo + 1/3; abono sem incidência; impostos pelas tabelas", async () => {
  const { sugerirLinhas, calcularEvento } = await import("../../lib/rh/eventos.ts");
  const { linhas, erros } = sugerirLinhas("ferias", { salarioMensal: 3000, mediaVariaveis: 0, params: PARAMS, diasGozo: 20, diasAbono: 10 });
  assert.deepEqual(erros, []);
  const por = Object.fromEntries(linhas.map((l) => [l.codigo, l]));
  assert.equal(por.F01.valor, 2000);
  assert.equal(por.F02.valor, 666.6);
  assert.equal(por.F03.valor, 1000);
  assert.equal(por.F03.inss, false);
  const r = calcularEvento({ linhas, dependentes: 0, inss: INSS_T, irrf: IRRF_T, aliquotaFgts: 8 });
  assert.equal(r.bases.inssNormal, 2666.6);
  assert.equal(r.fgts, arred(2666.6 * 0.08));
  assert.equal(r.proventos, arred(2000 + 666.6 + 1000 + 333.3));
});

test("13º: 1ª parcela sem descontos; 2ª parcela desconta o adiantamento e calcula INSS/IRRF sobre o integral", async () => {
  const { sugerirLinhas, calcularEvento } = await import("../../lib/rh/eventos.ts");
  const d1 = sugerirLinhas("decimo1", { salarioMensal: 3000, mediaVariaveis: 0, params: PARAMS, avos: 12 });
  const r1 = calcularEvento({ linhas: d1.linhas, dependentes: 0, inss: INSS_T, irrf: IRRF_T, aliquotaFgts: 8 });
  assert.equal(r1.proventos, 1500);
  assert.equal(r1.inss, 0);
  assert.equal(r1.liquido, 1500);
  assert.equal(r1.fgts, 120);
  const d2 = sugerirLinhas("decimo2", { salarioMensal: 3000, mediaVariaveis: 0, params: PARAMS, avos: 12, valor1aParcela: 1500 });
  const r2 = calcularEvento({ linhas: d2.linhas, dependentes: 0, inss: INSS_T, irrf: IRRF_T, aliquotaFgts: 8 });
  assert.equal(r2.bases.inssDecimo, 3000);
  assert.equal(r2.inss, 600);
  assert.equal(r2.fgts, 120); // base FGTS = 3000 - 1500
  assert.equal(r2.liquido, arred(3000 - 1500 - 600 - r2.irrf));
});

test("rescisão: justa causa só paga saldo e férias vencidas; multa do FGTS é informativa", async () => {
  const { sugerirLinhas, calcularEvento } = await import("../../lib/rh/eventos.ts");
  const base = { salarioMensal: 3000, mediaVariaveis: 0, params: PARAMS, diasSaldoSalario: 10, diasAvisoIndenizado: 30, avosDecimo: 6, avosFerias: 6, periodosFeriasVencidas: 1, saldoFgts: 10000, pctMultaFgts: 40 };
  const justa = sugerirLinhas("rescisao", { ...base, motivo: "justa_causa" }).linhas;
  assert.deepEqual(justa.map((l) => l.codigo), ["R01", "R04", "R05"]);
  const sem = sugerirLinhas("rescisao", { ...base, motivo: "sem_justa_causa" }).linhas;
  assert.ok(sem.some((l) => l.codigo === "R02") && sem.some((l) => l.codigo === "R03") && sem.some((l) => l.codigo === "R06"));
  assert.equal(sem.find((l) => l.codigo === "R08").valor, 4000);
  const r = calcularEvento({ linhas: sem, dependentes: 0, inss: INSS_T, irrf: IRRF_T, aliquotaFgts: 8 });
  assert.equal(r.proventos, arred(sem.filter((l) => !l.informativo).reduce((s, l) => s + l.valor, 0)));
  const pedido = sugerirLinhas("rescisao", { ...base, motivo: "pedido_demissao" }).linhas;
  assert.equal(pedido.some((l) => l.codigo === "R02" || l.codigo === "R08"), false);
});

test("evento: INSS do 13º é calculado à parte da remuneração normal", async () => {
  const { calcularEvento } = await import("../../lib/rh/eventos.ts");
  const mk = (codigo, valor, grupo) => ({ codigo, descricao: codigo, natureza: "provento", valor, inss: true, irrf: true, fgts: true, grupo });
  const junto = calcularEvento({ linhas: [mk("a", 2000, "normal"), mk("b", 2000, "normal")], dependentes: 0, inss: INSS_T, irrf: IRRF_T, aliquotaFgts: 8 });
  const separado = calcularEvento({ linhas: [mk("a", 2000, "normal"), mk("b", 2000, "decimo")], dependentes: 0, inss: INSS_T, irrf: IRRF_T, aliquotaFgts: 8 });
  assert.equal(junto.inss, 600);
  assert.equal(separado.inss, 600); // 300 + 300
  assert.equal(junto.bases.inssNormal, 4000);
  assert.equal(separado.bases.inssNormal, 2000);
  assert.equal(separado.bases.inssDecimo, 2000);
});
