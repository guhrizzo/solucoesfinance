// Retorno do OAuth por rota permitida (lib/oauthReturn.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { RETURN_COOKIE, parseReturnTo, returnBaseFromCookieHeader } from "../../lib/oauthReturn";

test("parseReturnTo aceita /estoque e /configuracoes", () => {
  assert.equal(parseReturnTo("/estoque"), "/estoque");
  assert.equal(parseReturnTo("/configuracoes"), "/configuracoes");
});

test("parseReturnTo aceita prefixo de idioma pt-BR/en/es", () => {
  assert.equal(parseReturnTo("/pt-BR/configuracoes"), "/pt-BR/configuracoes");
  assert.equal(parseReturnTo("/en/configuracoes"), "/en/configuracoes");
  assert.equal(parseReturnTo("/es/estoque"), "/es/estoque");
});

test("parseReturnTo rejeita valores fora da lista", () => {
  for (const v of ["//evil.com", "https://x.com", "/estoque/../x", "/estoque?x=1", "\\evil", "/\\evil.com", "/%2Fevil.com", "", null, undefined, "/outra", "/fr/estoque"]) {
    assert.equal(parseReturnTo(v), "/estoque", String(v));
  }
});

test("returnBaseFromCookieHeader lê oauth_return", () => {
  assert.equal(RETURN_COOKIE, "oauth_return");
  assert.equal(returnBaseFromCookieHeader("a=1; oauth_return=%2Fconfiguracoes; b=2"), "/configuracoes");
  assert.equal(returnBaseFromCookieHeader("oauth_return=/en/configuracoes"), "/en/configuracoes");
});

test("returnBaseFromCookieHeader sem cookie → /estoque", () => {
  assert.equal(returnBaseFromCookieHeader(null), "/estoque");
  assert.equal(returnBaseFromCookieHeader("a=1"), "/estoque");
});

test("returnBaseFromCookieHeader valor adulterado → /estoque", () => {
  assert.equal(returnBaseFromCookieHeader("oauth_return=//evil.com"), "/estoque");
  assert.equal(returnBaseFromCookieHeader("oauth_return=%E0%A4%A"), "/estoque");
});
