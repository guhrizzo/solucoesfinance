// RH — custo mensal por competência, vigências (sem reescrever meses fechados)
// e criptografia dos dados sensíveis. Só dados FICTÍCIOS.
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularCustoMes } from "../../lib/rh/custo.ts";
import { aplicarNovaVigencia, validarNovaVigencia, validarEncerramento, vigenciaEm } from "../../lib/rh/vigencia.ts";
import { encryptText, decryptText, loadKey, isValidCpf, maskCpf } from "../../lib/rh/crypto.ts";

const vig = (inicio, dados, fim = null) => ({ inicio, fim, dados });
const base = (o = {}) => ({
  comp: "2026-10",
  entrada: "2025-01-10",
  saida: null,
  vinculo: "CLT",
  salarios: [vig("2025-01-10", { valor: 3000 })],
  encargos: [vig("2020-01-01", { pct: 30 })],
  beneficios: [],
  comissao: 0,
  bonus: 0,
  ...o,
});

test("CLT: provisões 1/12 e férias+1/3, encargos sobre salário+provisões", () => {
  const c = calcularCustoMes(base());
  assert.equal(c.salario, 3000);
  assert.equal(c.prov13, 250);
  assert.equal(c.provFerias, 333.33);
  // base = 3000 + 250 + 333.33 = 3583.33 → 30% = 1075
  assert.equal(c.encargos, 1075);
  assert.equal(c.total, 3000 + 250 + 333.33 + 1075);
});

test("PJ e estágio: sem encargos nem provisões", () => {
  for (const vinculo of ["PJ", "estagio", "outro"]) {
    const c = calcularCustoMes(base({ vinculo }));
    assert.equal(c.prov13, 0);
    assert.equal(c.provFerias, 0);
    assert.equal(c.encargos, 0);
    assert.equal(c.total, 3000);
  }
});

test("benefícios, comissão e bônus entram no total; benefício fica fora da base de encargos", () => {
  const c = calcularCustoMes(base({
    vinculo: "PJ",
    beneficios: [vig("2025-01-01", { nome: "VR", tipo: "vr", valor: 500 }), vig("2025-01-01", { nome: "Saúde", tipo: "saude", valor: 300 })],
    comissao: 200, bonus: 100,
  }));
  assert.equal(c.beneficiosTotal, 800);
  assert.equal(c.total, 3000 + 800 + 200 + 100);
  const clt = calcularCustoMes(base({ beneficios: [vig("2025-01-01", { nome: "VR", tipo: "vr", valor: 500 })] }));
  assert.equal(clt.encargos, 1075); // VR não altera a base
});

test("admissão no meio do mês: pro-rata pelos dias ativos", () => {
  const c = calcularCustoMes(base({ entrada: "2026-10-16", salarios: [vig("2026-10-16", { valor: 3100 })] }));
  assert.equal(c.diasAtivos, 16);
  assert.equal(c.salario, 1600); // 3100/31 × 16
});

test("saída no meio do mês e mês antes da admissão", () => {
  const sai = calcularCustoMes(base({ saida: "2026-10-10" }));
  assert.equal(sai.diasAtivos, 10);
  assert.equal(sai.salario, 967.74);
  const antes = calcularCustoMes(base({ comp: "2024-12" }));
  assert.equal(antes.total, 0);
  assert.equal(antes.diasAtivos, 0);
});

test("mudança de salário no meio do mês é pro-rata por dia", () => {
  const salarios = [vig("2025-01-10", { valor: 3100 }, "2026-10-15"), vig("2026-10-16", { valor: 6200 })];
  const c = calcularCustoMes(base({ salarios, vinculo: "PJ" }));
  // 15 dias × 100 + 16 dias × 200 = 1500 + 3200
  assert.equal(c.salario, 4700);
});

test("sem salário cadastrado sinaliza semSalario", () => {
  assert.equal(calcularCustoMes(base({ salarios: [] })).semSalario, true);
});

test("nova vigência encerra a anterior no dia anterior e não deixa sobreposição", () => {
  const lista = [vig("2025-01-10", { valor: 3000 })];
  assert.equal(validarNovaVigencia(lista, "2026-11-01", []), null);
  const nova = aplicarNovaVigencia(lista, { inicio: "2026-11-01", dados: { valor: 3500 } });
  assert.equal(nova[0].fim, "2026-10-31");
  assert.equal(nova[1].fim, null);
  assert.equal(vigenciaEm(nova, "2026-10-31").dados.valor, 3000);
  assert.equal(vigenciaEm(nova, "2026-11-01").dados.valor, 3500);
});

test("não permite vigência retroativa/igual a uma existente nem tocar mês fechado", () => {
  const lista = [vig("2025-01-10", { valor: 3000 }), vig("2026-06-01", { valor: 3300 })];
  assert.equal(validarNovaVigencia(lista, "2026-06-01", []), "sobreposicao");
  assert.equal(validarNovaVigencia(lista, "2026-03-01", []), "sobreposicao");
  assert.equal(validarNovaVigencia(lista, "2026-09-15", ["2026-09"]), "competencia_fechada");
  assert.equal(validarNovaVigencia(lista, "2026-09-15", ["2026-12"]), "competencia_fechada");
  assert.equal(validarNovaVigencia(lista, "2026-10-01", ["2026-09"]), null);
  assert.equal(validarNovaVigencia(lista, "26-10-01", []), "inicio_invalido");
});

test("mês fechado fica intacto: reaplicar salário novo só vale dali pra frente", () => {
  const lista = [vig("2025-01-10", { valor: 3000 })];
  const antes = calcularCustoMes(base({ comp: "2026-09", salarios: lista }));
  const nova = aplicarNovaVigencia(lista, { inicio: "2026-10-01", dados: { valor: 4000 } });
  const depois = calcularCustoMes(base({ comp: "2026-09", salarios: nova }));
  assert.deepEqual(antes, depois);
});

test("encerrar benefício respeita competência fechada", () => {
  const v = vig("2025-01-01", { nome: "VR", tipo: "vr", valor: 500 });
  assert.equal(validarEncerramento(v, "2026-09-30", []), null);
  assert.equal(validarEncerramento(v, "2026-09-30", ["2026-10"]), "competencia_fechada");
  assert.equal(validarEncerramento(v, "2024-12-31", []), "inicio_invalido");
});

test("criptografia AES-GCM: ida e volta, IV aleatório, chave errada e adulteração falham", () => {
  const key = loadKey("a".repeat(64));
  const a = encryptText("52998224725", key);
  const b = encryptText("52998224725", key);
  assert.notEqual(a, b);
  assert.equal(decryptText(a, key), "52998224725");
  assert.throws(() => decryptText(a, loadKey("b".repeat(64))));
  const partes = a.split(":");
  partes[3] = Buffer.from("xxxxxxxxxxx").toString("base64");
  assert.throws(() => decryptText(partes.join(":"), key));
  assert.throws(() => loadKey(""));
  assert.throws(() => loadKey("curta"));
});

test("CPF: validação por dígitos verificadores e máscara", () => {
  assert.equal(isValidCpf("529.982.247-25"), true);
  assert.equal(isValidCpf("111.111.111-11"), false);
  assert.equal(isValidCpf("529.982.247-24"), false);
  assert.equal(maskCpf("52998224725"), "•••.•••.•••-25");
});

test("cadastro: valida CPF, vínculo, datas, dependentes e coerência de inativação", async () => {
  const { validarColaborador, validarCoerencia } = await import("../../lib/rh/validate.ts");
  const ok = { nome: "Maria Teste", cpf: "529.982.247-25", cargo: "Analista", vinculo: "CLT", dataEntrada: "2026-01-05", status: "ativo", dependentes: 2 };
  const r = validarColaborador(ok);
  assert.equal(r.ok, true);
  assert.equal(r.dados.cpf, "52998224725");
  assert.equal(validarColaborador({ ...ok, cpf: "111.111.111-11" }).ok, false);
  assert.equal(validarColaborador({ ...ok, vinculo: "X" }).ok, false);
  assert.equal(validarColaborador({ ...ok, dataEntrada: "2026-02-30" }).ok, false);
  assert.equal(validarColaborador({ ...ok, dependentes: -1 }).ok, false);
  assert.equal(validarColaborador({ cargo: "Gerente" }, true).ok, true); // PATCH parcial
  assert.match(validarCoerencia({ dataEntrada: "2026-05-01", dataSaida: "2026-04-01", status: "ativo" }), /anterior/);
  assert.match(validarCoerencia({ dataEntrada: "2026-05-01", dataSaida: null, status: "inativo" }), /saída/);
  assert.equal(validarCoerencia({ dataEntrada: "2026-05-01", dataSaida: "2026-08-01", status: "inativo" }), null);
});

test("mudar entrada/saída não pode alcançar competência fechada", async () => {
  const { validarMudancaDeData } = await import("../../lib/rh/vigencia.ts");
  assert.equal(validarMudancaDeData("2026-01-05", "2026-01-05", ["2026-01"]), null);
  assert.equal(validarMudancaDeData("2026-01-05", "2026-03-01", ["2026-02"]), "competencia_fechada");
  assert.equal(validarMudancaDeData("2026-01-05", "2026-03-01", ["2025-12"]), null);
  assert.equal(validarMudancaDeData(null, "2026-06-10", ["2026-09"]), "competencia_fechada"); // saída em aberto → passa a encerrar em jun
  assert.equal(validarMudancaDeData(null, "2026-06-10", ["2026-05"]), null);
});

test("alocação: soma precisa fechar 100%, sem centro repetido", async () => {
  const { validarItens } = await import("../../lib/rh/alocacao.ts");
  assert.equal(validarItens([{ centroId: "a", pct: 60 }, { centroId: "b", pct: 40 }]), null);
  assert.match(validarItens([{ centroId: "a", pct: 60 }, { centroId: "b", pct: 30 }]), /100%/);
  assert.match(validarItens([{ centroId: "a", pct: 50 }, { centroId: "a", pct: 50 }]), /mais de uma vez/);
  assert.match(validarItens([]), /ao menos um/);
  assert.match(validarItens([{ centroId: "a", pct: 0 }, { centroId: "b", pct: 100 }]), /entre 0 e 100/);
  assert.equal(validarItens([{ centroId: "a", pct: 33.33 }, { centroId: "b", pct: 33.33 }, { centroId: "c", pct: 33.34 }]), null);
});

test("rateio: reparte por percentual, fecha os centavos e manda dia sem alocação para 'não alocado'", async () => {
  const { ratear } = await import("../../lib/rh/alocacao.ts");
  const { diasAtivos } = await import("../../lib/rh/vigencia.ts");
  const dias = diasAtivos("2026-10", "2025-01-01", null);
  const aloc = [vig("2025-01-01", { itens: [{ centroId: "com", pct: 60 }, { centroId: "ope", pct: 40 }] })];
  const r = ratear(1000, dias, aloc);
  assert.deepEqual(r.itens.sort((a, b) => a.centroId.localeCompare(b.centroId)), [{ centroId: "com", valor: 600 }, { centroId: "ope", valor: 400 }]);
  assert.equal(r.naoAlocado, 0);

  const sem = ratear(1000, dias, []);
  assert.equal(sem.naoAlocado, 1000);
  assert.equal(sem.itens.length, 0);

  // alocação começa dia 16: 15 dias sem alocação + 16 dias no centro "com"
  const meio = ratear(3100, dias, [vig("2026-10-16", { itens: [{ centroId: "com", pct: 100 }] })]);
  assert.equal(meio.naoAlocado, 1500);
  assert.equal(meio.itens[0].valor, 1600);

  // 3 centros em terços: a soma sempre fecha com o total
  const t = ratear(100, dias, [vig("2025-01-01", { itens: [{ centroId: "a", pct: 33.33 }, { centroId: "b", pct: 33.33 }, { centroId: "c", pct: 33.34 }] })]);
  assert.equal(Math.round((t.itens.reduce((s, i) => s + i.valor, 0) + t.naoAlocado) * 100) / 100, 100);
});

test("rateio acompanha mudança de alocação no meio do mês", async () => {
  const { ratear } = await import("../../lib/rh/alocacao.ts");
  const { diasAtivos } = await import("../../lib/rh/vigencia.ts");
  const dias = diasAtivos("2026-10", "2025-01-01", null);
  const aloc = [
    vig("2025-01-01", { itens: [{ centroId: "com", pct: 100 }] }, "2026-10-15"),
    vig("2026-10-16", { itens: [{ centroId: "ope", pct: 100 }] }),
  ];
  const r = ratear(3100, dias, aloc);
  const por = Object.fromEntries(r.itens.map((i) => [i.centroId, i.valor]));
  assert.equal(por.com, 1500);
  assert.equal(por.ope, 1600);
});

test("centro duplicado: igual, sem acento/caixa, contido ou quase igual", async () => {
  const { centrosSimilares } = await import("../../lib/rh/alocacao.ts");
  const ex = [{ id: "1", nome: "Operação" }, { id: "2", nome: "Comercial" }, { id: "3", nome: "Financeiro" }];
  assert.deepEqual(centrosSimilares("operacao", ex).map((c) => c.id), ["1"]);
  assert.deepEqual(centrosSimilares("  COMERCIAL  ", ex).map((c) => c.id), ["2"]);
  assert.deepEqual(centrosSimilares("Comercial Sul", ex).map((c) => c.id), ["2"]);
  assert.deepEqual(centrosSimilares("Finaceiro", ex).map((c) => c.id), ["3"]);
  assert.deepEqual(centrosSimilares("Marketing", ex), []);
  assert.deepEqual(centrosSimilares("", ex), []);
});

// ── Comissões ───────────────────────────────────────────────────────────────
const regra = (o = {}) => ({
  id: "r1", nome: "Padrão", escopo: "todos", colaboradorIds: [], tipo: "fixo", base: "receita", pct: 5,
  faixas: [], faixaModo: "marginal", inicio: "2026-01-01", fim: null, ativa: true, ...o,
});
const venda = (o = {}) => ({
  key: "cf_1", date: "2026-10-10", amount: 1000, custoProduto: 600, taxaMarketplace: 0, forma: null,
  itens: [{ colaboradorId: "ana", pct: 100 }], estornadoReceita: 0, ...o,
});
const CFG0 = { aliquotaImpostoPct: 0, taxaDebitoPct: 0, taxaCreditoPct: 0, outrosCustosPct: 0 };

test("comissão: fixo sobre receita e faixas (marginal x total)", async () => {
  const { comissaoPorRegra } = await import("../../lib/rh/comissao.ts");
  assert.equal(comissaoPorRegra(regra(), 10000), 500);
  assert.equal(comissaoPorRegra(regra(), 0), 0);
  const faixas = [{ de: 0, pct: 2 }, { de: 10000, pct: 3 }, { de: 20000, pct: 5 }];
  // marginal: 10000×2% + 5000×3% = 200 + 150
  assert.equal(comissaoPorRegra(regra({ tipo: "faixa", faixas }), 15000), 350);
  // acima da última faixa: 200 + 300 + 5000×5%
  assert.equal(comissaoPorRegra(regra({ tipo: "faixa", faixas }), 25000), 750);
  // total: o % da faixa atingida vale para tudo
  assert.equal(comissaoPorRegra(regra({ tipo: "faixa", faixas, faixaModo: "total" }), 15000), 450);
  assert.equal(comissaoPorRegra(regra({ tipo: "faixa", faixas, faixaModo: "total" }), 9999.99), 200);
});

test("margem: desconta custo, impostos, taxa de cartão, taxa do marketplace; sem custo não vira zero", async () => {
  const { margemDaVenda } = await import("../../lib/rh/comissao.ts");
  const cfg = { aliquotaImpostoPct: 6, taxaDebitoPct: 1.5, taxaCreditoPct: 3, outrosCustosPct: 1 };
  // 1000 − 600 − (6%+3%+1%)=100 − 50 (taxa mkt)
  assert.equal(margemDaVenda({ amount: 1000, custoProduto: 600, taxaMarketplace: 50, forma: "credito" }, cfg), 250);
  assert.equal(margemDaVenda({ amount: 1000, custoProduto: 600, taxaMarketplace: 0, forma: "pix" }, cfg), 330);
  assert.equal(margemDaVenda({ amount: 1000, custoProduto: null, taxaMarketplace: 0 }, cfg), null);
});

test("apuração: divide venda entre pessoas, base margem ignora venda sem custo e sinaliza", async () => {
  const { calcularComissoes } = await import("../../lib/rh/comissao.ts");
  const vendas = [
    venda({ key: "a", amount: 1000, custoProduto: 600, itens: [{ colaboradorId: "ana", pct: 70 }, { colaboradorId: "beto", pct: 30 }] }),
    venda({ key: "b", amount: 500, custoProduto: null, itens: [{ colaboradorId: "ana", pct: 100 }] }),
  ];
  const rec = calcularComissoes({ comp: "2026-10", regras: [regra({ base: "receita", pct: 10 })], vendas, cfg: CFG0 });
  assert.equal(rec.get("ana").base, 1200); // 1000×70% + 500
  assert.equal(rec.get("ana").comissao, 120);
  assert.equal(rec.get("beto").comissao, 30);
  const mar = calcularComissoes({ comp: "2026-10", regras: [regra({ base: "margem", pct: 10 })], vendas, cfg: CFG0 });
  assert.equal(mar.get("ana").base, 280); // (1000−600)×70%
  assert.deepEqual(mar.get("ana").semCusto, ["b"]);
  assert.equal(mar.get("ana").comissao, 28);
});

test("estorno na mesma competência reduz a base (e reaplica as faixas)", async () => {
  const { calcularComissoes } = await import("../../lib/rh/comissao.ts");
  const faixas = [{ de: 0, pct: 2 }, { de: 1000, pct: 10 }];
  const r = regra({ tipo: "faixa", faixas, faixaModo: "total" });
  const cheio = calcularComissoes({ comp: "2026-10", regras: [r], vendas: [venda({ amount: 1000 })], cfg: CFG0 });
  assert.equal(cheio.get("ana").comissao, 100);
  const parcial = calcularComissoes({ comp: "2026-10", regras: [r], vendas: [venda({ amount: 1000, estornadoReceita: 400 })], cfg: CFG0 });
  assert.equal(parcial.get("ana").base, 600);
  assert.equal(parcial.get("ana").comissao, 12); // caiu para a faixa de 2%
});

test("regra da competência: específica vence a geral, respeita vigência e 'ativa'", async () => {
  const { regraDaCompetencia } = await import("../../lib/rh/comissao.ts");
  const geral = regra({ id: "g", pct: 3 });
  const dela = regra({ id: "e", escopo: "lista", colaboradorIds: ["ana"], pct: 8 });
  assert.equal(regraDaCompetencia([geral, dela], "ana", "2026-10").id, "e");
  assert.equal(regraDaCompetencia([geral, dela], "beto", "2026-10").id, "g");
  assert.equal(regraDaCompetencia([regra({ inicio: "2026-11-01" })], "ana", "2026-10"), null);
  assert.equal(regraDaCompetencia([regra({ fim: "2026-09-30" })], "ana", "2026-10"), null);
  assert.equal(regraDaCompetencia([regra({ ativa: false })], "ana", "2026-10"), null);
});

test("ajuste de estorno após fechamento: desfaz a comissão proporcional pelo % efetivo congelado", async () => {
  const { ajustesDoEstorno } = await import("../../lib/rh/comissao.ts");
  const e = { itens: [{ colaboradorId: "ana", pct: 70 }, { colaboradorId: "beto", pct: 30 }], baseReceita: 400, baseMargem: 160 };
  const aj = ajustesDoEstorno(e, { ana: { baseTipo: "receita", pctEfetivo: 0.1 }, beto: { baseTipo: "margem", pctEfetivo: 0.2 } });
  assert.deepEqual(aj, [{ colaboradorId: "ana", valor: -28 }, { colaboradorId: "beto", valor: -9.6 }]);
  assert.deepEqual(ajustesDoEstorno(e, {}), []);
});

test("validação de regra e atribuição", async () => {
  const { validarRegra, validarAtribuicao } = await import("../../lib/rh/comissao.ts");
  const ok = { nome: "Vendas", tipo: "fixo", base: "receita", pct: 5, inicio: "2026-10-01" };
  assert.equal(validarRegra(ok).ok, true);
  assert.equal(validarRegra({ ...ok, pct: 0 }).ok, false);
  assert.equal(validarRegra({ ...ok, escopo: "lista", colaboradorIds: [] }).ok, false);
  assert.equal(validarRegra({ ...ok, tipo: "faixa", faixas: [{ de: 100, pct: 1 }] }).ok, false);
  assert.equal(validarRegra({ ...ok, tipo: "faixa", faixas: [{ de: 0, pct: 1 }, { de: 0, pct: 2 }] }).ok, false);
  assert.equal(validarRegra({ ...ok, tipo: "faixa", faixas: [{ de: 0, pct: 1 }, { de: 5000, pct: 2 }] }).ok, true);
  assert.equal(validarAtribuicao([{ colaboradorId: "a", pct: 60 }, { colaboradorId: "b", pct: 40 }]), null);
  assert.match(validarAtribuicao([{ colaboradorId: "a", pct: 60 }]), /100%/);
  assert.match(validarAtribuicao([{ colaboradorId: "a", pct: 50 }, { colaboradorId: "a", pct: 50 }]), /mais de uma vez/);
});

// ── Retorno por pessoa ──────────────────────────────────────────────────────
const vr = (o = {}) => ({ key: "v1", comp: "2026-10", sku: "A", amount: 1000, margem: 400, desconto: 0, estornado: 0, itens: [{ colaboradorId: "ana", pct: 100 }], ...o });
const cm = (o = {}) => ({ comp: "2026-10", colaboradorId: "ana", total: 5000, comissao: 100, rateio: { itens: [{ centroId: "com", valor: 3000 }, { centroId: "ope", valor: 2000 }], naoAlocado: 0 }, pctEfetivo: 0.1, baseTipo: "receita", ...o });
const nomes = new Map([["ana", "Ana"], ["beto", "Beto"]]);

test("retorno: receita, ticket, margem, comissão, contribuição, custo (sem a comissão), resultado e retorno s/ comissão", async () => {
  const { calcularRetorno } = await import("../../lib/rh/retorno.ts");
  const r = calcularRetorno({
    vendas: [vr({ key: "v1" }), vr({ key: "v2", amount: 500, margem: 100 })],
    custos: [cm()], nomes, filtros: {},
  });
  const ana = r.linhas[0];
  assert.equal(ana.receita, 1500);
  assert.equal(ana.vendas, 2);
  assert.equal(ana.ticket, 750);
  assert.equal(ana.margemBruta, 500);
  assert.equal(ana.comissao, 100);
  assert.equal(ana.contribuicao, 400);
  assert.equal(ana.custoAlocado, 4900); // 5000 − 100 de comissão
  assert.equal(ana.resultado, -4500);
  assert.equal(ana.retornoComissao, 4);
  assert.equal(r.totais.contribuicao, 400);
});

test("retorno: venda dividida e estornada; sem custo fica fora da margem e é contada", async () => {
  const { calcularRetorno } = await import("../../lib/rh/retorno.ts");
  const r = calcularRetorno({
    vendas: [
      vr({ key: "a", itens: [{ colaboradorId: "ana", pct: 60 }, { colaboradorId: "beto", pct: 40 }], estornado: 500 }),
      vr({ key: "b", margem: null, amount: 200 }),
    ],
    custos: [], nomes, filtros: {},
  });
  const por = Object.fromEntries(r.linhas.map((l) => [l.colaboradorId, l]));
  assert.equal(por.ana.receita, 500); // (1000−500)×60% + 200
  assert.equal(por.ana.margemBruta, 120); // 400×50%×60%
  assert.equal(por.ana.semCusto, 1);
  assert.equal(por.beto.receita, 200);
  assert.equal(por.beto.margemBruta, 80);
  assert.equal(r.totais.vendas, 2); // vendas distintas, não 3
  assert.equal(r.totais.receita, 700);
});

test("retorno: mix por faixa de margem e descontos concedidos", async () => {
  const { calcularRetorno, faixaDeMargem } = await import("../../lib/rh/retorno.ts");
  assert.equal(faixaDeMargem(-5, 100), "negativa");
  assert.equal(faixaDeMargem(5, 100), "ate10");
  assert.equal(faixaDeMargem(25, 100), "ate30");
  assert.equal(faixaDeMargem(40, 100), "acima30");
  assert.equal(faixaDeMargem(null, 100), "semCusto");
  const r = calcularRetorno({
    vendas: [vr({ key: "a", amount: 900, margem: 90, desconto: 100 }), vr({ key: "b", amount: 100, margem: 40 })],
    custos: [], nomes, filtros: {},
  });
  const ana = r.linhas[0];
  assert.equal(ana.mix.ate20.vendas, 1); // 90/900 = 10%
  assert.equal(ana.mix.ate20.receita, 900);
  assert.equal(ana.mix.acima30.receita, 100); // 40/100 = 40%
  assert.equal(ana.desconto, 100);
  assert.equal(Math.round(ana.descontoPct * 100) / 100, 9.09); // 100 / (1000 + 100)
});

test("retorno: filtros de centro, colaborador e produto; visão do próprio sem custo de pessoal", async () => {
  const { calcularRetorno } = await import("../../lib/rh/retorno.ts");
  const vendas = [vr({ key: "a", sku: "A" }), vr({ key: "b", sku: "B", margem: 200, amount: 500, itens: [{ colaboradorId: "beto", pct: 100 }] })];
  const custos = [cm(), cm({ colaboradorId: "beto", total: 2000, comissao: 0, rateio: { itens: [{ centroId: "ope", valor: 2000 }], naoAlocado: 0 } })];
  const centro = calcularRetorno({ vendas, custos, nomes, filtros: { centroId: "com" } });
  assert.deepEqual(centro.linhas.map((l) => l.colaboradorId), ["ana"]); // beto não está em "com"
  assert.equal(centro.linhas[0].custoAlocado, 2940); // (5000−100) × 3000/5000
  const so = calcularRetorno({ vendas, custos, nomes, filtros: { colaboradorIds: ["beto"] } });
  assert.deepEqual(so.linhas.map((l) => l.colaboradorId), ["beto"]);
  const prod = calcularRetorno({ vendas, custos, nomes, filtros: { sku: "a" } });
  assert.deepEqual(prod.linhas.map((l) => l.colaboradorId), ["ana"]);
  assert.equal(prod.linhas[0].custoAlocado, null); // custo de pessoa não se reparte por produto
  assert.equal(prod.linhas[0].comissao, 100); // 10% efetivo × 1000
  const proprio = calcularRetorno({ vendas, custos, nomes, filtros: { colaboradorIds: ["ana"], semCustoPessoal: true } });
  assert.equal(proprio.linhas[0].custoAlocado, null);
  assert.equal(proprio.linhas[0].resultado, null);
  assert.equal(proprio.linhas[0].comissao, 100);
});
