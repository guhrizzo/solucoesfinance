// Persistência do lead do Midas: sanitização, upsert idempotente e conversão.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createFakeFirestore } from "../support/fakeFirestore.mjs";
import { sanitizeLeadInput, upsertLead, markConverted, LEAD_RETENTION_MS } from "../../lib/midas/leadServer.ts";

const SID = "3f2b8c1e-5a4d-4e7b-9c1a-0d2e4f6a8b1c";
const base = (over = {}) => ({ sessionId: SID, consent: { accepted: true, version: "v1" }, ...over });

test("sanitize rejeita sessionId inválido e não-objeto", () => {
  assert.equal(sanitizeLeadInput(null), null);
  assert.equal(sanitizeLeadInput("x"), null);
  assert.equal(sanitizeLeadInput(base({ sessionId: "abc" })), null);
  assert.equal(sanitizeLeadInput(base({ sessionId: "3f2b8c1e-5a4d-1e7b-9c1a-0d2e4f6a8b1c" })), null); // não é v4
  assert.equal(sanitizeLeadInput(base({ sessionId: undefined })), null);
});

test("sanitize trunca strings, arrays e transcript", () => {
  const out = sanitizeLeadInput(
    base({
      name: "  " + "n".repeat(100) + "  ",
      locale: "fr",
      currentTools: Array.from({ length: 15 }, () => "t".repeat(200)),
      transcript: Array.from({ length: 60 }, (_, i) => ({ role: i % 2 ? "bot" : "user", text: "x".repeat(2000), ts: i })),
      consent: { accepted: true, version: "v".repeat(50) },
    })
  );
  assert.ok(out);
  assert.equal(out.name.length, 60);
  assert.equal(out.locale, "pt-BR");
  assert.equal(out.currentTools.length, 10);
  assert.equal(out.currentTools[0].length, 80);
  assert.equal(out.transcript.length, 40);
  assert.equal(out.transcript[0].text.length, 800);
  assert.equal(out.consent.version.length, 20);
});

test("sanitize descarta enums inválidos e transcript com role inválido", () => {
  const out = sanitizeLeadInput(
    base({ segment: "hacker", mainPain: "x", status: "converted", transcript: [{ role: "admin", text: "oi", ts: 1 }, { role: "user", text: "ok", ts: 2 }] })
  );
  assert.equal(out.segment, undefined);
  assert.equal(out.mainPain, undefined);
  assert.equal(out.status, "started");
  assert.equal(out.transcript.length, 1);
});

test("cliente não consegue injetar converted/expiresAt/whatsapp", async () => {
  const out = sanitizeLeadInput(
    base({ status: "completed", convertedUid: "u1", startedTrial: true, expiresAt: 1, whatsapp: "sent" })
  );
  assert.equal(out.status, "completed");
  for (const k of ["convertedUid", "startedTrial", "expiresAt", "whatsapp"]) assert.equal(k in out, false);
  const db = createFakeFirestore();
  await upsertLead(db, out, 1000);
  const d = db.store.get(`demoLeads/${SID}`);
  assert.equal(d.startedTrial, false);
  assert.equal(d.convertedUid, undefined);
  assert.equal(d.expiresAt, 1000 + LEAD_RETENTION_MS);
  assert.equal(d.whatsapp, undefined);
});

test("expiresAt = startedAt + 12 meses, definido uma vez", async () => {
  const db = createFakeFirestore();
  await upsertLead(db, sanitizeLeadInput(base()), 5000);
  await upsertLead(db, sanitizeLeadInput(base({ status: "in_progress" })), 9000);
  const d = db.store.get(`demoLeads/${SID}`);
  assert.equal(d.startedAt, 5000);
  assert.equal(d.expiresAt, 5000 + 365 * 24 * 60 * 60 * 1000);
  assert.equal(d.updatedAt, 9000);
});

test("upsert 2x não duplica e não regride status; justCompleted só na 1ª transição", async () => {
  const db = createFakeFirestore();
  const r1 = await upsertLead(db, sanitizeLeadInput(base({ status: "in_progress" })), 1000);
  assert.deepEqual(r1, { status: "in_progress", justCompleted: false });
  const r2 = await upsertLead(db, sanitizeLeadInput(base({ status: "completed" })), 2000);
  assert.deepEqual(r2, { status: "completed", justCompleted: true });
  const r3 = await upsertLead(db, sanitizeLeadInput(base({ status: "completed" })), 3000);
  assert.deepEqual(r3, { status: "completed", justCompleted: false });
  const r4 = await upsertLead(db, sanitizeLeadInput(base({ status: "started" })), 4000);
  assert.deepEqual(r4, { status: "completed", justCompleted: false });
  assert.equal([...db.store.keys()].filter((k) => k.startsWith("demoLeads/")).length, 1);
  assert.equal(db.store.get(`demoLeads/${SID}`).completedAt, 2000);
});

test("lead convertido continua convertido", async () => {
  const db = createFakeFirestore();
  await upsertLead(db, sanitizeLeadInput(base({ status: "completed" })), 1000);
  assert.equal(await markConverted(db, SID, "uid1"), true);
  const r = await upsertLead(db, sanitizeLeadInput(base({ status: "in_progress" })), 2000);
  assert.deepEqual(r, { status: "converted", justCompleted: false });
  const d = db.store.get(`demoLeads/${SID}`);
  assert.equal(d.convertedUid, "uid1");
  assert.equal(d.startedTrial, true);
});

test("markConverted com id inexistente ou inválido → false sem lançar", async () => {
  const db = createFakeFirestore();
  assert.equal(await markConverted(db, SID, "u"), false);
  assert.equal(await markConverted(db, "nope", "u"), false);
});
