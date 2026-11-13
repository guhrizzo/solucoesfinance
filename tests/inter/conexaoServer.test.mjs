// Banco Inter: núcleo de conexão do servidor (lib/interConexaoServer.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { FieldValue } from "firebase-admin/firestore";
import { connectInter, updateInter, disconnectInter, testInter } from "../../lib/interConexaoServer";
import { decryptInterSecrets } from "../../lib/interCrypto";
import { SERVER_CONFIG_ERROR } from "../../lib/interErrors";

// Par certificado/chave EC autoassinado, só pra teste (válido até 2126).
const CERT = `-----BEGIN CERTIFICATE-----
MIIBhDCCASmgAwIBAgIUf2QcuIjvGCYOn0BhCWajgp7lC+wwCgYIKoZIzj0EAwIw
FjEUMBIGA1UEAwwLdGVzdGUtaW50ZXIwIBcNMjYxMTA1MDMwNzU2WhgPMjEyNjEw
MTIwMzA3NTZaMBYxFDASBgNVBAMMC3Rlc3RlLWludGVyMFkwEwYHKoZIzj0CAQYI
KoZIzj0DAQcDQgAE1eYFmrpCBT/9hx1uDliovlE8RgMNgHZ08MyGVziYBaiKBKYq
QuWD1HS5sxNrzzQnSLasqD7n35NMMNkZDpp8ZaNTMFEwHQYDVR0OBBYEFD9Z3Uet
zsqZ1+ZSkIMFH4x/3TI5MB8GA1UdIwQYMBaAFD9Z3UetzsqZ1+ZSkIMFH4x/3TI5
MA8GA1UdEwEB/wQFMAMBAf8wCgYIKoZIzj0EAwIDSQAwRgIhANVUtliheWZUBo4P
7lYRlwaUrILG29zyqLyIlytP4UOWAiEA6ix6xDhhkOvYbXE90vuJ8ROp/hoJMV8C
125WSm6JIJM=
-----END CERTIFICATE-----`;
const KEY = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg2Dn4nxFceq9a2iHE
PDFEPbepouzzvl69Q0/wFeX/Hm+hRANCAATV5gWaukIFP/2HHW4OWKi+UTxGAw2A
dnTwzIZXOJgFqIoEpipC5YPUdLmzE2vPNCdItqyoPuffk0ww2RkOmnxl
-----END PRIVATE KEY-----`;

const OWNER = "dono1";
const SECRETS_PATH = `integracoesBanco/${OWNER}`;
const STATUS_PATH = `users/${OWNER}/profile/interStatus`;
const FULL = { clientId: "cid-fake", clientSecret: "csecret-fake", certPem: CERT, keyPem: KEY, conta: "12345678" };
const TEST_KEY = "c".repeat(64);

// Firestore falso: doc/get/set/update/delete + batch, com FieldValue.delete() aplicado de verdade.
function fakeDb() {
  const store = new Map();
  const isDelete = (v) => v instanceof FieldValue && v.isEqual(FieldValue.delete());
  const strip = (data) => {
    const out = {};
    for (const [k, v] of Object.entries(data)) if (!isDelete(v)) out[k] = structuredClone(v);
    return out;
  };
  const merge = (base, data) => {
    const out = { ...base };
    for (const [k, v] of Object.entries(data)) {
      if (isDelete(v)) delete out[k];
      else out[k] = structuredClone(v);
    }
    return out;
  };
  const applySet = (path, data, opts) => {
    store.set(path, opts?.merge && store.has(path) ? merge(store.get(path), data) : strip(data));
  };
  const applyUpdate = (path, data) => {
    if (!store.has(path)) throw Object.assign(new Error("NOT_FOUND"), { code: 5 });
    store.set(path, merge(store.get(path), data));
  };
  const snap = (path) => {
    const data = store.get(path);
    return { id: path.split("/").pop(), exists: data !== undefined, data: () => (data === undefined ? undefined : structuredClone(data)) };
  };
  const doc = (path) => ({
    path,
    async get() { return snap(path); },
    async set(d, o) { applySet(path, d, o); },
    async update(d) { applyUpdate(path, d); },
    async delete() { store.delete(path); },
  });
  return {
    store,
    doc,
    batch() {
      const writes = [];
      const b = {
        set(ref, d, o) { writes.push(() => applySet(ref.path, d, o)); return b; },
        update(ref, d) { writes.push(() => applyUpdate(ref.path, d)); return b; },
        delete(ref) { writes.push(() => store.delete(ref.path)); return b; },
        async commit() { for (const w of writes) w(); },
      };
      return b;
    },
  };
}

function semSegredo(r) {
  const s = JSON.stringify(r);
  assert.ok(!s.includes(FULL.clientSecret), "resultado contém clientSecret");
  assert.ok(!s.includes("-----BEGIN"), "resultado contém PEM");
  assert.ok(!s.includes("Enc"), "resultado contém campo cifrado");
}

function setup() {
  process.env.INTER_ENC_KEY = TEST_KEY;
  return fakeDb();
}

test("connectInter grava segredos cifrados e interStatus.connected=true sem lastSyncAt", async () => {
  const db = setup();
  // Status antigo com cursor: a conexão nova zera o cursor.
  db.store.set(STATUS_PATH, { connected: false, lastSyncAt: 123, lastSyncError: "x" });
  const r = await connectInter(db, OWNER, FULL);
  assert.equal(r.ok, true);
  assert.equal(r.contaMasked, "••••5678");
  assert.equal(typeof r.certExpiresAt, "number");
  semSegredo(r);

  const sec = db.store.get(SECRETS_PATH);
  assert.equal(sec.provider, "inter");
  assert.equal(sec.conta, "12345678");
  assert.ok(!JSON.stringify(sec).includes(FULL.clientSecret));
  assert.ok(!JSON.stringify(sec).includes("-----BEGIN"));
  const dec = decryptInterSecrets(sec);
  assert.equal(dec.clientId, FULL.clientId);
  assert.equal(dec.clientSecret, FULL.clientSecret);
  assert.equal(dec.certPem, CERT);
  assert.equal(dec.keyPem, KEY);
  // Sem updatedBy explícito, quem alterou é o próprio dono (rota do dono: uid === ownerUid).
  assert.equal(sec.updatedBy, OWNER);
  assert.equal(sec.createdAt, sec.updatedAt);

  const st = db.store.get(STATUS_PATH);
  assert.equal(st.connected, true);
  assert.equal(st.contaMasked, "••••5678");
  assert.equal(st.certExpiresAt, r.certExpiresAt);
  assert.equal(st.lastSyncError, null);
  assert.equal("lastSyncAt" in st, false);
  assert.equal("configuradoPelaEquipe" in st, false);
});

test("connectInter com configuradoPelaEquipe grava interStatus.configuradoPelaEquipe=true", async () => {
  const db = setup();
  const r = await connectInter(db, OWNER, FULL, { configuradoPelaEquipe: true });
  assert.equal(r.ok, true);
  assert.equal(db.store.get(STATUS_PATH).configuradoPelaEquipe, true);
});

test("connectInter sem conta não grava contaMasked", async () => {
  const db = setup();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { conta: _conta, ...semConta } = FULL;
  const r = await connectInter(db, OWNER, semConta);
  assert.equal(r.ok, true);
  assert.equal(r.contaMasked, undefined);
  assert.equal(db.store.get(SECRETS_PATH).conta, null);
  assert.equal("contaMasked" in db.store.get(STATUS_PATH), false);
});

test("connectInter com chave que não corresponde ao certificado → 400 sem gravar", async () => {
  const db = setup();
  const { generateKeyPairSync } = await import("node:crypto");
  const outra = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({ type: "pkcs8", format: "pem" });
  const r = await connectInter(db, OWNER, { ...FULL, keyPem: outra });
  assert.deepEqual(r, { ok: false, status: 400, error: "A chave privada não corresponde ao certificado enviado." });
  assert.equal(db.store.size, 0);
});

test("updateInter parcial (só conta) preserva cert/key e atualiza contaMasked", async () => {
  const db = setup();
  await connectInter(db, OWNER, FULL);
  const antes = db.store.get(SECRETS_PATH);
  const r = await updateInter(db, OWNER, { conta: "99998888" });
  assert.equal(r.ok, true);
  assert.equal(r.contaMasked, "••••8888");
  semSegredo(r);
  const depois = db.store.get(SECRETS_PATH);
  assert.equal(depois.conta, "99998888");
  assert.equal(depois.createdAt, antes.createdAt);
  const dec = decryptInterSecrets(depois);
  assert.equal(dec.certPem, CERT);
  assert.equal(dec.keyPem, KEY);
  assert.equal(dec.clientSecret, FULL.clientSecret);
  assert.equal(db.store.get(STATUS_PATH).contaMasked, "••••8888");
});

test("updateInter com conta vazia limpa conta e contaMasked", async () => {
  const db = setup();
  await connectInter(db, OWNER, FULL);
  const r = await updateInter(db, OWNER, { conta: "" });
  assert.equal(r.ok, true);
  assert.equal(r.contaMasked, undefined);
  assert.equal(db.store.get(SECRETS_PATH).conta, null);
  assert.equal("contaMasked" in db.store.get(STATUS_PATH), false);
});

test("updateInter preserva lastSyncAt e grava configuradoPelaEquipe só quando pedido", async () => {
  const db = setup();
  await connectInter(db, OWNER, FULL);
  db.store.set(STATUS_PATH, { ...db.store.get(STATUS_PATH), lastSyncAt: 555 });
  await updateInter(db, OWNER, { clientSecret: "novo-segredo" });
  assert.equal(db.store.get(STATUS_PATH).lastSyncAt, 555);
  assert.equal("configuradoPelaEquipe" in db.store.get(STATUS_PATH), false);
  assert.equal(decryptInterSecrets(db.store.get(SECRETS_PATH)).clientSecret, "novo-segredo");
  await updateInter(db, OWNER, { conta: "1" }, { configuradoPelaEquipe: true });
  assert.equal(db.store.get(STATUS_PATH).configuradoPelaEquipe, true);
});

test("updateInter com cert sem key → erro 400", async () => {
  const db = setup();
  await connectInter(db, OWNER, FULL);
  const r = await updateInter(db, OWNER, { certPem: CERT });
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
  assert.equal(r.error, "Envie o certificado e a chave privada juntos.");
});

test("updateInter sem conexão → 404", async () => {
  const db = setup();
  const r = await updateInter(db, OWNER, { conta: "1" });
  assert.deepEqual(r, { ok: false, status: 404, error: "O Banco Inter não está conectado. Conecte primeiro." });
});

test("disconnectInter apaga integracoesBanco e deixa interStatus.connected=false sem lastSyncAt/configuradoPelaEquipe", async () => {
  const db = setup();
  await connectInter(db, OWNER, FULL, { configuradoPelaEquipe: true });
  db.store.set(STATUS_PATH, { ...db.store.get(STATUS_PATH), lastSyncAt: 777 });
  db.store.set(`users/${OWNER}/interPendentes/id:1`, { status: "pendente" });
  const r = await disconnectInter(db, OWNER);
  assert.deepEqual(r, { ok: true });
  assert.equal(db.store.has(SECRETS_PATH), false);
  assert.deepEqual(db.store.get(STATUS_PATH), { connected: false, lastSyncError: null });
  assert.ok(db.store.has(`users/${OWNER}/interPendentes/id:1`));
});

test("disconnectInter funciona mesmo sem INTER_ENC_KEY", async () => {
  const db = setup();
  await connectInter(db, OWNER, FULL);
  delete process.env.INTER_ENC_KEY;
  const r = await disconnectInter(db, OWNER);
  assert.deepEqual(r, { ok: true });
  assert.equal(db.store.has(SECRETS_PATH), false);
});

test("INTER_ENC_KEY ausente → {ok:false,status:500,error:SERVER_CONFIG_ERROR}", async () => {
  const db = setup();
  await connectInter(db, OWNER, FULL);
  delete process.env.INTER_ENC_KEY;
  const esperado = { ok: false, status: 500, error: SERVER_CONFIG_ERROR };
  assert.deepEqual(await connectInter(fakeDb(), OWNER, FULL), esperado);
  assert.deepEqual(await updateInter(db, OWNER, { conta: "1" }), esperado);
  assert.deepEqual(await testInter(db, OWNER, async () => {}), esperado);
  process.env.INTER_ENC_KEY = "   ";
  assert.deepEqual(await connectInter(fakeDb(), OWNER, FULL), esperado);
});

test("testInter ok limpa lastSyncError e passa a conta ao testador", async () => {
  const db = setup();
  await connectInter(db, OWNER, FULL);
  db.store.set(STATUS_PATH, { ...db.store.get(STATUS_PATH), lastSyncError: "antigo" });
  let recebido;
  const r = await testInter(db, OWNER, async (s) => { recebido = s; });
  assert.deepEqual(r, { ok: true });
  assert.equal(recebido.conta, "12345678");
  assert.equal(recebido.clientSecret, FULL.clientSecret);
  assert.equal(db.store.get(STATUS_PATH).lastSyncError, null);
});

test("testInter em falha grava lastSyncError e devolve 502, sem PEM", async () => {
  const db = setup();
  await connectInter(db, OWNER, FULL);
  const r = await testInter(db, OWNER, async () => { throw new Error("Credenciais inválidas."); });
  assert.deepEqual(r, { ok: false, status: 502, error: "Credenciais inválidas." });
  assert.equal(db.store.get(STATUS_PATH).lastSyncError, "Credenciais inválidas.");

  const vaza = await testInter(db, OWNER, async () => { throw new Error("falhou " + KEY); });
  assert.deepEqual(vaza, { ok: false, status: 502, error: "Falha ao testar a conexão com o Banco Inter." });
  semSegredo(vaza);
  assert.ok(!db.store.get(STATUS_PATH).lastSyncError.includes("BEGIN"));
});

test("testInter sem conexão → 404", async () => {
  const db = setup();
  assert.deepEqual(await testInter(db, OWNER, async () => {}), { ok: false, status: 404, error: "O Banco Inter não está conectado." });
});
