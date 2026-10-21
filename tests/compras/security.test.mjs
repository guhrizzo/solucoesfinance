// Peças de segurança isoladas: token do convite, chaves de idempotência e
// checagem de anexos (assinatura do conteúdo, não só a extensão).
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateInviteToken, hashToken, isTokenShape, deterministicId, isRequestKey } from "../../lib/compras/token.ts";
import { checkFile, sanitizeFileName } from "../../lib/compras/storage.ts";
import { MAX_ATTACHMENT_BYTES } from "../../lib/compras/types.ts";

test("token do convite: 256 bits, formato validado e hash estável", () => {
  const a = generateInviteToken();
  const b = generateInviteToken();
  assert.notEqual(a.token, b.token);
  assert.equal(isTokenShape(a.token), true);
  assert.equal(a.hash, hashToken(a.token));
  assert.match(a.hash, /^[0-9a-f]{64}$/);
  assert.equal(isTokenShape("../../etc"), false);
  assert.equal(isTokenShape("abc"), false);
});

test("ID determinístico muda com qualquer parte da chave", () => {
  const x = deterministicId("po_", "owner", "sup", "uid", "key1");
  assert.equal(x, deterministicId("po_", "owner", "sup", "uid", "key1"));
  assert.notEqual(x, deterministicId("po_", "owner", "sup", "uid2", "key1"));
  assert.match(x, /^po_[0-9a-f]{24}$/);
  assert.equal(isRequestKey("3f2a9c1e-aaaa"), true);
  assert.equal(isRequestKey("a/b"), false);
});

test("anexo: aceita PDF/PNG reais e recusa conteúdo disfarçado", () => {
  const pdf = Buffer.from("%PDF-1.7\n...");
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const exe = Buffer.from("MZ\x90\x00 executável");
  assert.deepEqual(checkFile("proposta.pdf", pdf), { ok: true, contentType: "application/pdf", name: "proposta.pdf" });
  assert.equal(checkFile("foto.png", png).ok, true);
  assert.deepEqual(checkFile("proposta.pdf", exe), { ok: false, code: "fileType" });
  assert.deepEqual(checkFile("virus.exe", exe), { ok: false, code: "fileType" });
  assert.deepEqual(checkFile("vazio.pdf", Buffer.alloc(0)), { ok: false, code: "fileEmpty" });
  assert.deepEqual(checkFile("grande.pdf", Buffer.concat([pdf, Buffer.alloc(MAX_ATTACHMENT_BYTES)])), { ok: false, code: "fileTooLarge" });
});

test("nome do arquivo é saneado (sem caminho nem caracteres de controle)", () => {
  assert.equal(sanitizeFileName("../../etc/passwd"), ".._.._etc_passwd");
  assert.equal(sanitizeFileName("Orçamento nº 1.pdf"), "Orcamento no 1.pdf");
});
