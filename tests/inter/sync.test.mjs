// Banco Inter: sincronização do extrato (lib/interSync.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { planSync, mergePendentes, syncOwner, pendenteDocId, InterSyncError } from "../../lib/interSync";
import { encryptInterSecrets } from "../../lib/interCrypto";

const DAY = 86400000;
const NOW = Date.parse("2026-11-03T12:00:00Z");

const tx = (o) => ({ txKey: "id:1", date: "2026-11-01", amount: 100, type: "entrada", description: "PIX recebido", ...o });

// ---------- planSync ----------

test("planSync primeira vez = últimos 30 dias", () => {
  assert.deepEqual(planSync({ now: NOW }), { from: "2026-10-04", to: "2026-11-03" });
});

test("planSync seguinte = lastSyncAt − 3 dias até hoje", () => {
  const lastSyncAt = Date.parse("2026-10-30T09:30:00Z");
  assert.deepEqual(planSync({ lastSyncAt, now: NOW }), { from: "2026-10-27", to: "2026-11-03" });
});

test("planSync com cursor no futuro não inverte o período", () => {
  const r = planSync({ lastSyncAt: NOW + 10 * DAY, now: NOW });
  assert.deepEqual(r, { from: "2026-11-03", to: "2026-11-03" });
});

// ---------- mergePendentes ----------

test("mergePendentes ignora txKey já existente em qualquer status", () => {
  const existing = new Map([
    ["a", { ...tx({ txKey: "a" }), status: "pendente", createdAt: 1 }],
    ["b", { ...tx({ txKey: "b" }), status: "conciliado", createdAt: 1 }],
    ["c", { ...tx({ txKey: "c" }), status: "ignorado", createdAt: 1 }],
  ]);
  const incoming = ["a", "b", "c", "d"].map((k) => tx({ txKey: k }));
  const out = mergePendentes(existing, incoming, new Map(), NOW);
  assert.deepEqual(out.map((p) => p.txKey), ["d"]);
});

test("mergePendentes com existente ignorado não reabre", () => {
  const existing = new Map([["c", { ...tx({ txKey: "c" }), status: "ignorado", createdAt: 1 }]]);
  assert.deepEqual(mergePendentes(existing, [tx({ txKey: "c" })], new Map(), NOW), []);
  assert.equal(existing.get("c").status, "ignorado");
});

test("novos itens: status pendente, sugestão do mapa e createdAt = now", () => {
  const sug = new Map([
    ["n1", { kind: "vincular", cashflowId: "cf1" }],
    ["n2", { kind: "criar", category: "Outros recebimentos" }],
  ]);
  const out = mergePendentes(new Map(), [tx({ txKey: "n1" }), tx({ txKey: "n2" }), tx({ txKey: "n1" })], sug, NOW);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { ...tx({ txKey: "n1" }), status: "pendente", suggestion: { kind: "vincular", cashflowId: "cf1" }, createdAt: NOW });
  assert.deepEqual(out[1].suggestion, { kind: "criar", category: "Outros recebimentos" });
  assert.equal(out[1].status, "pendente");
});

test("duas execuções seguidas → segunda devolve []", () => {
  const incoming = [tx({ txKey: "x" }), tx({ txKey: "y" })];
  const primeira = mergePendentes(new Map(), incoming, new Map(), NOW);
  const existing = new Map(primeira.map((p) => [p.txKey, p]));
  assert.deepEqual(mergePendentes(existing, incoming, new Map(), NOW + 1000), []);
});

test("incoming vazio → []", () => {
  assert.deepEqual(mergePendentes(new Map(), [], new Map(), NOW), []);
});

test("pendenteDocId mantém txKey seguro e faz hash determinístico do resto", () => {
  assert.equal(pendenteDocId("id:abc-123"), "id:abc-123");
  assert.equal(pendenteDocId("h:0123456789abcdef01234567"), "h:0123456789abcdef01234567");
  const a = pendenteDocId("id:com/barra");
  assert.match(a, /^x:[0-9a-f]{40}$/);
  assert.equal(a, pendenteDocId("id:com/barra"));
  assert.notEqual(a, pendenteDocId("id:com/barra2"));
  assert.match(pendenteDocId("__x__"), /^x:/);
});

// ---------- syncOwner (Firestore falso + extrato injetado) ----------

function fakeDb() {
  const store = new Map();
  const clone = (v) => (v === undefined ? undefined : structuredClone(v));
  const snap = (path) => {
    const data = store.get(path);
    return { id: path.split("/").pop(), exists: data !== undefined, data: () => clone(data), get: (k) => data?.[k] };
  };
  const applySet = (path, data, opts) => {
    if (opts?.merge && store.has(path)) store.set(path, { ...store.get(path), ...clone(data) });
    else store.set(path, clone(data));
  };
  const applyUpdate = (path, data) => {
    if (!store.has(path)) throw Object.assign(new Error("NOT_FOUND"), { code: 5 });
    store.set(path, { ...store.get(path), ...clone(data) });
  };
  const doc = (path) => ({
    path,
    id: path.split("/").pop(),
    async get() { return snap(path); },
    async set(d, o) { applySet(path, d, o); },
    async update(d) { applyUpdate(path, d); },
  });
  const query = (path, filtros) => ({
    where(campo, op, valor) { return query(path, [...filtros, [campo, op, valor]]); },
    select() { return this; },
    async get() {
      const depth = path.split("/").length + 1;
      const docs = [...store.keys()]
        .filter((p) => p.startsWith(path + "/") && p.split("/").length === depth)
        .filter((p) => filtros.every(([c, op, v]) => {
          const x = store.get(p)[c];
          return op === ">=" ? x >= v : op === "<=" ? x <= v : x === v;
        }))
        .map(snap);
      return { docs };
    },
  });
  return {
    store,
    doc,
    collection: (path) => ({ ...query(path, []), doc: (id) => doc(`${path}/${id}`) }),
    async runTransaction(fn) {
      const writes = [];
      const t = {
        async get(ref) { return snap(ref.path); },
        async getAll(...refs) { return refs.map((r) => snap(r.path)); },
        set(ref, d, o) { writes.push(() => applySet(ref.path, d, o)); return t; },
        update(ref, d) { writes.push(() => applyUpdate(ref.path, d)); return t; },
      };
      const r = await fn(t);
      for (const w of writes) w();
      return r;
    },
  };
}

const OWNER = "dono1";
const SECRETS = {
  clientId: "cid-fake",
  clientSecret: "csecret-fake",
  certPem: "-----BEGIN CERTIFICATE-----\nAAA\n-----END CERTIFICATE-----",
  keyPem: "-----BEGIN PRIVATE KEY-----\nBBB\n-----END PRIVATE KEY-----",
};

function setup() {
  process.env.INTER_ENC_KEY = "b".repeat(64);
  const db = fakeDb();
  db.store.set(`integracoesBanco/${OWNER}`, { provider: "inter", ...encryptInterSecrets(SECRETS), conta: "12345", createdAt: 1, updatedAt: 1 });
  db.store.set(`users/${OWNER}/cashflow/cf1`, { type: "entrada", amount: 100, date: "2026-11-01", description: "Venda", category: "Vendas" });
  return db;
}

const EXTRATO = [
  tx({ txKey: "id:1", amount: 100 }),
  tx({ txKey: "id:2", amount: 55.5, type: "saida", description: "Tarifa pacote de servicos", date: "2026-11-02" }),
];

test("syncOwner grava os novos, com sugestão, e avança o cursor", async () => {
  const db = setup();
  let chamada;
  const fetchExtrato = async (s, from, to) => { chamada = { s, from, to }; return EXTRATO; };
  const r = await syncOwner(db, OWNER, NOW, { fetchExtrato });
  assert.deepEqual(r, { novos: 2 });
  // Primeira vez: 30 dias; conta em claro somada aos segredos decifrados.
  assert.equal(chamada.from, "2026-10-04");
  assert.equal(chamada.to, "2026-11-03");
  assert.equal(chamada.s.conta, "12345");
  assert.equal(chamada.s.clientSecret, SECRETS.clientSecret);

  const p1 = db.store.get(`users/${OWNER}/interPendentes/id:1`);
  assert.equal(p1.status, "pendente");
  assert.equal(p1.txKey, "id:1");
  assert.deepEqual(p1.suggestion, { kind: "vincular", cashflowId: "cf1" });
  assert.equal(p1.createdAt, NOW);
  const p2 = db.store.get(`users/${OWNER}/interPendentes/id:2`);
  assert.deepEqual(p2.suggestion, { kind: "criar", category: "Taxas bancárias" });

  assert.equal(db.store.get(`integracoesBanco/${OWNER}`).lastSyncAt, NOW);
  assert.deepEqual(db.store.get(`users/${OWNER}/profile/interStatus`), { lastSyncAt: NOW, lastSyncError: null });
});

test("syncOwner segunda execução é idempotente e não reabre resolvidos", async () => {
  const db = setup();
  const fetchExtrato = async () => EXTRATO;
  await syncOwner(db, OWNER, NOW, { fetchExtrato });
  const ref = `users/${OWNER}/interPendentes/id:2`;
  db.store.set(ref, { ...db.store.get(ref), status: "ignorado", resolvedAt: NOW, resolvedBy: "u" });

  const depois = NOW + DAY;
  let from;
  const r = await syncOwner(db, OWNER, depois, { fetchExtrato: async (s, f) => { from = f; return EXTRATO; } });
  assert.deepEqual(r, { novos: 0 });
  assert.equal(from, "2026-10-31"); // lastSyncAt (03/11) − 3 dias
  assert.equal(db.store.get(ref).status, "ignorado");
  assert.equal(db.store.get(`users/${OWNER}/interPendentes/id:1`).createdAt, NOW);
  assert.equal(db.store.get(`integracoesBanco/${OWNER}`).lastSyncAt, depois);
});

test("syncOwner com txKey inválido como id usa hash e guarda o txKey no campo", async () => {
  const db = setup();
  await syncOwner(db, OWNER, NOW, { fetchExtrato: async () => [tx({ txKey: "id:a/b" })] });
  const id = pendenteDocId("id:a/b");
  assert.equal(db.store.get(`users/${OWNER}/interPendentes/${id}`).txKey, "id:a/b");
});

test("syncOwner em erro grava lastSyncError, não avança o cursor e não apaga pendentes", async () => {
  const db = setup();
  await syncOwner(db, OWNER, NOW, { fetchExtrato: async () => EXTRATO });
  const falha = async () => { throw new Error("Credenciais do Banco Inter inválidas (Client ID/Secret) ou sem o escopo extrato.read."); };
  await assert.rejects(syncOwner(db, OWNER, NOW + DAY, { fetchExtrato: falha }), (e) => {
    assert.ok(e instanceof InterSyncError);
    assert.equal(e.kind, "falha");
    assert.match(e.message, /Credenciais do Banco Inter/);
    return true;
  });
  assert.equal(db.store.get(`integracoesBanco/${OWNER}`).lastSyncAt, NOW);
  const st = db.store.get(`users/${OWNER}/profile/interStatus`);
  assert.equal(st.lastSyncAt, NOW);
  assert.match(st.lastSyncError, /Credenciais do Banco Inter/);
  assert.ok(db.store.has(`users/${OWNER}/interPendentes/id:1`));
  assert.ok(db.store.has(`users/${OWNER}/interPendentes/id:2`));
});

test("syncOwner nunca grava mensagem com PEM no status", async () => {
  const db = setup();
  const vaza = async () => { throw new Error("falhou com " + SECRETS.keyPem); };
  await assert.rejects(syncOwner(db, OWNER, NOW, { fetchExtrato: vaza }), InterSyncError);
  const st = db.store.get(`users/${OWNER}/profile/interStatus`);
  assert.ok(!st.lastSyncError.includes("BEGIN"));
  assert.equal(db.store.get(`integracoesBanco/${OWNER}`).lastSyncAt, undefined);
});

test("syncOwner sem conexão lança nao-conectado sem criar status", async () => {
  const db = fakeDb();
  await assert.rejects(syncOwner(db, "ninguem", NOW, { fetchExtrato: async () => [] }), (e) => e.kind === "nao-conectado");
  assert.equal(db.store.has("users/ninguem/profile/interStatus"), false);
});

test("syncOwner não herda cursor se a conexão foi trocada no meio", async () => {
  const db = setup();
  const fetchExtrato = async () => {
    // Reconexão durante a busca: novo doc, novo createdAt, sem lastSyncAt.
    db.store.set(`integracoesBanco/${OWNER}`, { ...db.store.get(`integracoesBanco/${OWNER}`), createdAt: 2 });
    return [];
  };
  await syncOwner(db, OWNER, NOW, { fetchExtrato });
  assert.equal(db.store.get(`integracoesBanco/${OWNER}`).lastSyncAt, undefined);
});
