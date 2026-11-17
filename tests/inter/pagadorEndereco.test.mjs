// Validação do endereço do pagador (lib/pagadorEndereco.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { validarEndereco } from "../../lib/pagadorEndereco";

const base = { cep: "01310-100", logradouro: "Av. Paulista", numero: "1000", bairro: "Bela Vista", cidade: "São Paulo", uf: "sp" };

test("validarEndereco: normaliza CEP e UF", () => {
  const r = validarEndereco(base);
  assert.equal(r.ok, true);
  assert.equal(r.value.cep, "01310100");
  assert.equal(r.value.uf, "SP");
  assert.equal(r.value.complemento, undefined);
});

test("validarEndereco: mantém complemento quando informado", () => {
  const r = validarEndereco({ ...base, complemento: " sala 2 " });
  assert.equal(r.ok, true);
  assert.equal(r.value.complemento, "sala 2");
});

test("validarEndereco: rejeita CEP de 7 dígitos, UF inválida e logradouro vazio", () => {
  assert.equal(validarEndereco({ ...base, cep: "1310100" }).ok, false);
  assert.equal(validarEndereco({ ...base, uf: "XX" }).ok, false);
  assert.equal(validarEndereco({ ...base, logradouro: "  " }).ok, false);
  assert.equal(validarEndereco({ ...base, numero: "" }).ok, false);
  assert.equal(validarEndereco({ ...base, bairro: "" }).ok, false);
  assert.equal(validarEndereco({ ...base, cidade: "" }).ok, false);
  assert.equal(validarEndereco(null).ok, false);
  assert.equal(validarEndereco("x").ok, false);
});
