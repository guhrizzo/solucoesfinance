// Persistência do lead do Midas: sanitização, upsert idempotente e conversão.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createFakeFirestore } from "../support/fakeFirestore.mjs";
import { sanitizeLeadInput, upsertLead, markConverted, LEAD_RETENTION_MS, MIN_SESSION_MS } from "../../lib/midas/leadServer.ts";

const SID = "3f2b8c1e-5a4d-4e7b-9c1a-0d2e4f6a8b1c";
const convo = Array.from({ length: 4 }, (_, i) => ({ role: i % 2 ? "bot" : "user", text: `m${i}`, ts: i }));
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
  assert.equal(d.status, "in_progress"); // novo nunca nasce completed
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

test("novo lead em 'completed' vira in_progress e não avisa", async () => {
  const db = createFakeFirestore();
  const r = await upsertLead(db, sanitizeLeadInput(base({ status: "completed", transcript: convo })), 1000);
  assert.deepEqual(r, { status: "in_progress", justCompleted: false });
  assert.equal(db.store.get(`demoLeads/${SID}`).completedAt, undefined);
});

test("transcript curto ou sessão rápida não gera aviso", async () => {
  const db = createFakeFirestore();
  await upsertLead(db, sanitizeLeadInput(base({ status: "in_progress" })), 0);
  const short = await upsertLead(db, sanitizeLeadInput(base({ status: "completed", transcript: convo.slice(0, 3) })), MIN_SESSION_MS + 1);
  assert.deepEqual(short, { status: "in_progress", justCompleted: false });
  const fast = await upsertLead(db, sanitizeLeadInput(base({ status: "completed", transcript: convo })), MIN_SESSION_MS - 1);
  assert.deepEqual(fast, { status: "in_progress", justCompleted: false });
  const onlyBot = convo.map((m) => ({ ...m, role: "bot" }));
  const db2 = createFakeFirestore();
  await upsertLead(db2, sanitizeLeadInput(base({ status: "in_progress" })), 0);
  const bots = await upsertLead(db2, sanitizeLeadInput(base({ status: "completed", transcript: onlyBot })), MIN_SESSION_MS + 1);
  assert.equal(bots.justCompleted, false);
});

test("started→in_progress→completed legítimo avisa exatamente uma vez e não regride", async () => {
  const db = createFakeFirestore();
  const r0 = await upsertLead(db, sanitizeLeadInput(base()), 1000);
  assert.deepEqual(r0, { status: "started", justCompleted: false });
  const r1 = await upsertLead(db, sanitizeLeadInput(base({ status: "in_progress" })), 2000);
  assert.deepEqual(r1, { status: "in_progress", justCompleted: false });
  const t = 1000 + MIN_SESSION_MS;
  const r2 = await upsertLead(db, sanitizeLeadInput(base({ status: "completed", transcript: convo })), t);
  assert.deepEqual(r2, { status: "completed", justCompleted: true });
  const r3 = await upsertLead(db, sanitizeLeadInput(base({ status: "completed", transcript: convo })), t + 1);
  assert.deepEqual(r3, { status: "completed", justCompleted: false });
  const r4 = await upsertLead(db, sanitizeLeadInput(base({ status: "started" })), t + 2);
  assert.deepEqual(r4, { status: "completed", justCompleted: false });
  assert.equal([...db.store.keys()].filter((k) => k.startsWith("demoLeads/")).length, 1);
  assert.equal(db.store.get(`demoLeads/${SID}`).completedAt, t);
});

test("lead convertido fica intocado (só updatedAt) e 2º uid não sobrescreve", async () => {
  const db = createFakeFirestore();
  await upsertLead(db, sanitizeLeadInput(base({ status: "in_progress", transcript: convo })), 1000);
  assert.equal(await markConverted(db, SID, "uid1"), true);
  const r = await upsertLead(db, sanitizeLeadInput(base({ status: "in_progress", name: "Novo", transcript: [] })), 2000);
  assert.deepEqual(r, { status: "converted", justCompleted: false });
  let d = db.store.get(`demoLeads/${SID}`);
  assert.equal(d.name, undefined);
  assert.equal(d.transcript.length, 4);
  assert.equal(d.updatedAt, 2000);
  assert.equal(await markConverted(db, SID, "uid2"), true);
  d = db.store.get(`demoLeads/${SID}`);
  assert.equal(d.convertedUid, "uid1");
  assert.equal(d.startedTrial, true);
});

test("transcript mantém as ÚLTIMAS 40 mensagens", () => {
  const t = Array.from({ length: 60 }, (_, i) => ({ role: "user", text: `m${i}`, ts: i }));
  const out = sanitizeLeadInput(base({ transcript: t }));
  assert.equal(out.transcript.length, 40);
  assert.equal(out.transcript[0].text, "m20");
  assert.equal(out.transcript[39].text, "m59");
});

test("sem consentimento aceito, nada é aceito", () => {
  assert.equal(sanitizeLeadInput(base({ consent: { accepted: false, version: "v1" } })), null);
  assert.equal(sanitizeLeadInput(base({ consent: undefined })), null);
  assert.equal(sanitizeLeadInput(base({ consent: { accepted: "true", version: "v1" } })), null);
});

test("markConverted com id inexistente ou inválido → false sem lançar", async () => {
  const db = createFakeFirestore();
  assert.equal(await markConverted(db, SID, "u"), false);
  assert.equal(await markConverted(db, "nope", "u"), false);
});
