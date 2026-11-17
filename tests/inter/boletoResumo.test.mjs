// Banco Inter: lógica pura da aba Boletos (lib/boletoTela.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  valorSugerido,
  vencimentoSugerido,
  podeEmitir,
  boletoVigenteDe,
  filtrarBoletos,
  podeDescartar,
  enderecoVazio,
  validarPagadorForm,
  erroVisivel,
  podeReenviarBoleto,
} from "../../lib/boletoTela";

const HOJE = "2026-11-16";
const END = { cep: "01310100", logradouro: "Av. Paulista", numero: "1", bairro: "Bela Vista", cidade: "São Paulo", uf: "SP" };
const bol = (o) => ({
  id: "a", payer: { nome: "Maria Silva", doc: "12345678909", endereco: END }, amount: 100,
  dueDate: "2026-11-20", situacao: "A_RECEBER", createdAt: "2026-11-10T10:00:00.000Z", createdBy: "u", ...o,
});

test("valorSugerido: saldo restante com 2 casas", () => {
  assert.equal(valorSugerido({ amount: 100 }), 100);
  assert.equal(valorSugerido({ amount: 100, amountReceived: 30.1 }), 69.9);
  assert.equal(valorSugerido({ amount: 0.3, amountReceived: 0.1 }), 0.2);
  assert.equal(valorSugerido({ amount: 100, amountReceived: 100 }), 0);
  assert.equal(valorSugerido({ amount: 100, amountReceived: 150 }), 0);
});

test("vencimentoSugerido: mantém o vencimento futuro, hoje se já passou", () => {
  assert.equal(vencimentoSugerido("2026-11-20", HOJE), "2026-11-20");
  assert.equal(vencimentoSugerido(HOJE, HOJE), HOJE);
  assert.equal(vencimentoSugerido("2026-11-01", HOJE), HOJE);
  assert.equal(vencimentoSugerido("", HOJE), HOJE);
});

test("podeEmitir: falso com boleto vigente da conta; verdadeiro com cancelado/pago/de outra conta", () => {
  const r = { id: "r1" };
  assert.equal(podeEmitir(r, []), true);
  for (const situacao of ["EM_PROCESSAMENTO", "A_RECEBER", "ATRASADO"]) {
    assert.equal(podeEmitir(r, [bol({ receivableId: "r1", situacao })]), false, situacao);
  }
  for (const situacao of ["CANCELADO", "EXPIRADO", "FALHA_EMISSAO", "RECEBIDO", "MARCADO_RECEBIDO", "PROTESTO"]) {
    assert.equal(podeEmitir(r, [bol({ receivableId: "r1", situacao })]), true, situacao);
  }
  assert.equal(podeEmitir(r, [bol({ receivableId: "outra" })]), true);
  assert.equal(podeEmitir(r, [bol({})]), true);
});

test("boletoVigenteDe devolve o vigente da conta", () => {
  const v = bol({ id: "v", receivableId: "r1" });
  assert.equal(boletoVigenteDe("r1", [bol({ id: "c", receivableId: "r1", situacao: "CANCELADO" }), v])?.id, "v");
  assert.equal(boletoVigenteDe("r2", [v]), undefined);
});

const LISTA = [
  bol({ id: "1", payer: { nome: "Maria Silva", doc: "12345678909", endereco: END }, dueDate: "2026-11-20" }),
  bol({ id: "2", payer: { nome: "João Souza", doc: "98765432100", endereco: END }, dueDate: "2026-11-01" }),
  bol({ id: "3", situacao: "RECEBIDO", dueDate: "2026-10-10", receivableId: "rX" }),
  bol({ id: "4", situacao: "CANCELADO", dueDate: "2026-12-10" }),
  bol({ id: "5", situacao: "PROTESTO", dueDate: "2026-09-10" }),
  bol({ id: "6", situacao: "FALHA_EMISSAO", dueDate: "2026-11-16" }),
];
const ids = (r) => r.map((b) => b.id).sort().join(",");
const F = { situacao: "todos", de: "", ate: "", busca: "", receivableId: "", hoje: HOJE };

test("filtrarBoletos: por grupo (protesto aparece em Outros)", () => {
  assert.equal(ids(filtrarBoletos(LISTA, F)), "1,2,3,4,5,6");
  assert.equal(ids(filtrarBoletos(LISTA, { ...F, situacao: "aguardando" })), "1");
  assert.equal(ids(filtrarBoletos(LISTA, { ...F, situacao: "vencido" })), "2");
  assert.equal(ids(filtrarBoletos(LISTA, { ...F, situacao: "pago" })), "3");
  assert.equal(ids(filtrarBoletos(LISTA, { ...F, situacao: "outros" })), "4,5,6");
});

test("filtrarBoletos: período por vencimento (inclusivo)", () => {
  assert.equal(ids(filtrarBoletos(LISTA, { ...F, de: "2026-11-01", ate: "2026-11-20" })), "1,2,6");
  assert.equal(ids(filtrarBoletos(LISTA, { ...F, de: "2026-11-20" })), "1,4");
  assert.equal(ids(filtrarBoletos(LISTA, { ...F, ate: "2026-10-10" })), "3,5");
});

test("filtrarBoletos: busca por nome (sem acento/caixa) ou documento, e por conta a receber", () => {
  assert.equal(ids(filtrarBoletos(LISTA, { ...F, busca: "joao" })), "2");
  assert.equal(ids(filtrarBoletos(LISTA, { ...F, busca: "  SILVA " })), "1,3,4,5,6");
  assert.equal(ids(filtrarBoletos(LISTA, { ...F, busca: "987.654" })), "2");
  assert.equal(ids(filtrarBoletos(LISTA, { ...F, receivableId: "rX" })), "3");
});

test("podeDescartar: sem código, em processamento, 24h ou mais", () => {
  const agora = Date.parse("2026-11-16T12:00:00.000Z");
  const antigo = bol({ situacao: "EM_PROCESSAMENTO", createdAt: "2026-11-15T11:59:00.000Z" });
  assert.equal(podeDescartar(antigo, agora), true);
  assert.equal(podeDescartar({ ...antigo, createdAt: "2026-11-15T12:30:00.000Z" }, agora), false);
  assert.equal(podeDescartar({ ...antigo, codigoSolicitacao: "abc" }, agora), false);
  assert.equal(podeDescartar({ ...antigo, situacao: "A_RECEBER" }, agora), false);
  assert.equal(podeDescartar({ ...antigo, createdAt: "lixo" }, agora), false);
});

test("validarPagadorForm: exige nome, CPF/CNPJ válido, endereço completo e confere e-mail/telefone", () => {
  const ok = { nome: "Maria", doc: "529.982.247-25", email: "", telefone: "", endereco: { ...END, cep: "01310-100" } };
  const r = validarPagadorForm(ok);
  assert.equal(r.ok, true);
  assert.equal(r.value.doc, "52998224725");
  assert.equal(r.value.endereco.cep, "01310100");
  assert.equal(validarPagadorForm({ ...ok, nome: " " }).error, "nome");
  assert.equal(validarPagadorForm({ ...ok, doc: "111.111.111-11" }).error, "doc");
  assert.equal(validarPagadorForm({ ...ok, doc: "" }).error, "doc");
  assert.equal(validarPagadorForm({ ...ok, email: "x@" }).error, "email");
  assert.equal(validarPagadorForm({ ...ok, telefone: "123" }).error, "telefone");
  assert.equal(validarPagadorForm({ ...ok, endereco: { ...END, cep: "123" } }).error, "endereco");
  assert.equal(validarPagadorForm({ ...ok, endereco: enderecoVazio() }).error, "endereco");
  assert.equal(validarPagadorForm({ ...ok, email: "a@b.co", telefone: "(11) 91234-5678" }).ok, true);
});

// ---------- erro visível na linha (F5) e reenviar por e-mail (F8) ----------

test("erroVisivel: só em processamento/aberto/vencido/falha, sem revisarCaixa, e com texto", () => {
  const msg = "Não foi possível confirmar a emissão.";
  for (const situacao of ["EM_PROCESSAMENTO", "A_RECEBER", "ATRASADO", "FALHA_EMISSAO"]) {
    assert.equal(erroVisivel(bol({ situacao, lastError: msg })), msg, situacao);
  }
  for (const situacao of ["RECEBIDO", "MARCADO_RECEBIDO", "CANCELADO", "EXPIRADO", "PROTESTO"]) {
    assert.equal(erroVisivel(bol({ situacao, lastError: msg })), null, situacao);
  }
  assert.equal(erroVisivel(bol({ lastError: msg, revisarCaixa: true })), null);
  assert.equal(erroVisivel(bol({ lastError: null })), null);
  assert.equal(erroVisivel(bol({ lastError: "   " })), null);
  assert.equal(erroVisivel(bol({})), null);
});

test("podeReenviarBoleto: linha digitável, mesmo saldo e mesmo vencimento da conta", () => {
  const rec = { amount: 100, amountReceived: 0, dueDate: "2026-11-20" };
  const b = (o) => bol({ linhaDigitavel: "0779", ...o });
  assert.equal(podeReenviarBoleto(b({}), rec), true);
  assert.equal(podeReenviarBoleto(b({ situacao: "ATRASADO" }), rec), true);
  // Saldo após recebimento parcial (com centavos).
  assert.equal(podeReenviarBoleto(b({ amount: 59.9 }), { amount: 100, amountReceived: 40.1, dueDate: "2026-11-20" }), true);
  assert.equal(podeReenviarBoleto(b({ amount: 100.004 }), rec), true);
  // Sem linha digitável (em processamento) → não.
  assert.equal(podeReenviarBoleto(bol({ situacao: "EM_PROCESSAMENTO" }), rec), false);
  assert.equal(podeReenviarBoleto(b({ situacao: "EM_PROCESSAMENTO" }), rec), false);
  // Valor editado ou vencimento diferente (sugestão "hoje" para conta vencida) → o e-mail iria só com Pix.
  assert.equal(podeReenviarBoleto(b({ amount: 90 }), rec), false);
  assert.equal(podeReenviarBoleto(b({ amount: 100 }), { ...rec, amountReceived: 10 }), false);
  assert.equal(podeReenviarBoleto(b({ dueDate: "2026-11-16" }), rec), false);
  assert.equal(podeReenviarBoleto(b({}), { amount: 100 }), false);
  // Pago/cancelado → não.
  assert.equal(podeReenviarBoleto(b({ situacao: "RECEBIDO" }), rec), false);
  assert.equal(podeReenviarBoleto(b({ situacao: "CANCELADO" }), rec), false);
});
