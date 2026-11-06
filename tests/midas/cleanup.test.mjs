// Limpeza de leads vencidos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createFakeFirestore } from "../support/fakeFirestore.mjs";
import { deleteExpiredLeads } from "../../lib/midas/leadServer.ts";

test("deleteExpiredLeads apaga só os vencidos, em mais de um lote", async () => {
  const db = createFakeFirestore();
  const now = 1_000_000;
  for (let i = 0; i < 850; i++) await db.doc(`demoLeads/old${i}`).set({ expiresAt: now - 1 - i });
  await db.doc("demoLeads/fresh1").set({ expiresAt: now + 1 });
  await db.doc("demoLeads/edge").set({ expiresAt: now });
  const n = await deleteExpiredLeads(db, now);
  assert.equal(n, 850);
  const left = (await db.collection("demoLeads").get()).docs.map((d) => d.id).sort();
  assert.deepEqual(left, ["edge", "fresh1"]);
  assert.equal(await deleteExpiredLeads(db, now), 0);
});

test("doc sem expiresAt não é apagado (documentado: lead sempre nasce com expiresAt)", async () => {
  const db = createFakeFirestore();
  await db.doc("demoLeads/semExpira").set({ status: "started" });
  assert.equal(await deleteExpiredLeads(db, 1_000_000), 0);
  assert.equal((await db.doc("demoLeads/semExpira").get()).exists, true);
});
