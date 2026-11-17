// Banco Inter: casamento do boleto pago com o extrato (lib/interBoletoExtrato.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { candidatoUnico } from "../../lib/interBoletoExtrato";

const ALVO = { amount: 150.5, date: "2026-11-10" };
const item = (o) => ({ id: "x", amount: 150.5, date: "2026-11-10", ...o });

test("um candidato e nenhum concorrente → o candidato", () => {
  const c = item({ id: "a" });
  assert.equal(candidatoUnico(ALVO, [c], []), c);
});

test("dois candidatos com mesmo valor/janela → null", () => {
  assert.equal(candidatoUnico(ALVO, [item({ id: "a" }), item({ id: "b", date: "2026-11-11" })], []), null);
});

test("um candidato mas outro concorrente de mesmo valor/janela → null", () => {
  assert.equal(candidatoUnico(ALVO, [item({ id: "a" })], [{ amount: 150.5, date: "2026-11-12" }]), null);
});

test("o próprio alvo na lista de concorrentes não conta", () => {
  const c = item({ id: "a" });
  assert.equal(candidatoUnico(ALVO, [c], [ALVO]), c);
});

test("concorrente de outro valor ou fora da janela não atrapalha", () => {
  const c = item({ id: "a" });
  const conc = [{ amount: 150.51, date: "2026-11-10" }, { amount: 150.5, date: "2026-11-14" }];
  assert.equal(candidatoUnico(ALVO, [c], conc), c);
});

test("valor diferente por 1 centavo → null", () => {
  assert.equal(candidatoUnico(ALVO, [item({ amount: 150.49 })], []), null);
  assert.equal(candidatoUnico(ALVO, [item({ amount: 150.51 })], []), null);
});

test("compara em centavos (sem erro de ponto flutuante)", () => {
  const c = item({ amount: 0.1 + 0.2 });
  assert.equal(candidatoUnico({ amount: 0.3, date: "2026-11-10" }, [c], []), c);
});

test("4 dias de distância → null; 3 dias → casa (antes e depois)", () => {
  assert.equal(candidatoUnico(ALVO, [item({ date: "2026-11-14" })], []), null);
  assert.equal(candidatoUnico(ALVO, [item({ date: "2026-11-06" })], []), null);
  const depois = item({ date: "2026-11-13" });
  assert.equal(candidatoUnico(ALVO, [depois], []), depois);
  const antes = item({ date: "2026-11-07" });
  assert.equal(candidatoUnico(ALVO, [antes], []), antes);
});

test("janela atravessa a virada do mês", () => {
  const c = item({ date: "2026-12-01" });
  assert.equal(candidatoUnico({ amount: 150.5, date: "2026-11-29" }, [c], []), c);
});

test("candidatos fora do valor/janela são descartados antes de contar", () => {
  const c = item({ id: "a" });
  assert.equal(candidatoUnico(ALVO, [c, item({ id: "b", amount: 10 }), item({ id: "c", date: "2026-11-20" })], []), c);
});
