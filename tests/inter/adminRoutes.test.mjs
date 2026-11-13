// Banco Inter: peças puras das rotas de adm (lib/interAdminRoutes.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isUserNotFoundError,
  buildAdminDeps,
  splitAdminBody,
  buildAuditEntry,
  adminResponse,
  pickInterStatus,
  PRO_REQUIRED_ERROR,
} from "../../lib/interAdminRoutes";
import { resolveTarget } from "../../lib/interAdminTarget";

function io(over = {}) {
  return {
    getUserByEmail: async (email) => ({ uid: "dono1", email, displayName: "Maria", customClaims: {} }),
    docExists: async () => false,
    isPro: async () => true,
    ...over,
  };
}

function authError(code) {
  const e = new Error("mensagem crua do SDK com detalhe interno");
  e.code = code;
  return e;
}

test("isUserNotFoundError só aceita o código exato auth/user-not-found", () => {
  assert.equal(isUserNotFoundError(authError("auth/user-not-found")), true);
  assert.equal(isUserNotFoundError(authError("auth/internal-error")), false);
  assert.equal(isUserNotFoundError(new Error("auth/user-not-found")), false);
  assert.equal(isUserNotFoundError(null), false);
  assert.equal(isUserNotFoundError(undefined), false);
});

test("auth/user-not-found vira null → resolveTarget devolve 404", async () => {
  const deps = buildAdminDeps(io({ getUserByEmail: async () => { throw authError("auth/user-not-found"); } }));
  assert.equal(await deps.getUserByEmail("x@y.com"), null);
  const r = await resolveTarget("x@y.com", deps);
  assert.deepEqual(r, { ok: false, status: 404, error: "Cliente não encontrado." });
});

test("outros erros do getUserByEmail NÃO viram null (sobem)", async () => {
  const deps = buildAdminDeps(io({ getUserByEmail: async () => { throw authError("auth/internal-error"); } }));
  await assert.rejects(() => deps.getUserByEmail("x@y.com"));
  await assert.rejects(() => resolveTarget("x@y.com", deps));
  const deps2 = buildAdminDeps(io({ getUserByEmail: async () => { throw new Error("rede"); } }));
  await assert.rejects(() => deps2.getUserByEmail("x@y.com"));
});

test("hasAccessDoc consulta users/{uid}/profile/access", async () => {
  const paths = [];
  const deps = buildAdminDeps(io({ docExists: async (p) => { paths.push(p); return true; } }));
  assert.equal(await deps.hasAccessDoc("abc"), true);
  assert.deepEqual(paths, ["users/abc/profile/access"]);
  const r = await resolveTarget("membro@y.com", deps);
  assert.equal(r.ok, false);
  assert.equal(r.status, 422);
});

test("splitAdminBody descarta uid/ownerUid do corpo e separa clienteEmail", () => {
  const p = splitAdminBody({ clienteEmail: "c@y.com", uid: "atacante", ownerUid: "outro", clientId: "id", conta: "123" });
  assert.equal(p.clienteEmail, "c@y.com");
  assert.deepEqual(p.campos, { clientId: "id", conta: "123" });
  assert.equal("uid" in p.campos, false);
  assert.equal("ownerUid" in p.campos, false);
  assert.equal(splitAdminBody(null), null);
  assert.equal(splitAdminBody("x"), null);
  assert.equal(splitAdminBody([1]), null);
});

test("ownerUid do alvo sai só de resolveTarget, nunca do corpo", async () => {
  const p = splitAdminBody({ clienteEmail: "c@y.com", ownerUid: "outro", uid: "outro" });
  const r = await resolveTarget(p.clienteEmail, buildAdminDeps(io()));
  assert.equal(r.ok, true);
  assert.equal(r.ownerUid, "dono1");
});

test("auditoria de falha do núcleo leva só a mensagem fixa", () => {
  const e = buildAuditEntry(
    { uid: "adm1", email: "adm@x.com" },
    { ownerUid: "dono1", email: "c@y.com" },
    "conectar",
    { ok: false, status: 400, error: "A chave privada não corresponde ao certificado enviado." },
  );
  assert.deepEqual(e, {
    adminUid: "adm1",
    adminEmail: "adm@x.com",
    alvoOwnerUid: "dono1",
    alvoEmail: "c@y.com",
    provider: "inter",
    acao: "conectar",
    ok: false,
    erro: "A chave privada não corresponde ao certificado enviado.",
  });
  const s = JSON.stringify(e);
  for (const k of ["clientSecret", "certPem", "keyPem", "Enc", "BEGIN"]) assert.equal(s.includes(k), false);
});

test("auditoria de sucesso não tem erro; adminEmail null vira ''", () => {
  const e = buildAuditEntry({ uid: "adm1", email: null }, { ownerUid: "d", email: "c@y.com" }, "testar", { ok: true });
  assert.equal(e.ok, true);
  assert.equal("erro" in e, false);
  assert.equal(e.adminEmail, "");
});

test("adminResponse: só campos permitidos", () => {
  assert.deepEqual(adminResponse("conectar", { ok: true, certExpiresAt: 5, contaMasked: "••12" }), {
    status: 200,
    body: { ok: true, certExpiresAt: 5, contaMasked: "••12" },
  });
  assert.deepEqual(adminResponse("desconectar", { ok: true }), { status: 200, body: { ok: true } });
  assert.deepEqual(adminResponse("testar", { ok: false, status: 403, error: PRO_REQUIRED_ERROR }), {
    status: 403,
    body: { error: PRO_REQUIRED_ERROR },
  });
});

test("pickInterStatus filtra campos fora da lista branca", () => {
  assert.equal(pickInterStatus(undefined), null);
  assert.deepEqual(
    pickInterStatus({ connected: true, contaMasked: "••12", clientSecretEnc: "x", certExpiresAt: 9, configuradoPelaEquipe: true, lastSyncError: null }),
    { connected: true, contaMasked: "••12", certExpiresAt: 9, configuradoPelaEquipe: true, lastSyncError: null },
  );
});
