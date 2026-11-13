// lib/interConexaoServer.ts
//
// Núcleo da conexão com o Banco Inter (SOMENTE servidor). Antes morava dentro
// de app/api/inter/conexao e app/api/inter/testar; saiu daqui pra que as rotas
// do dono e as do adm supremo (/api/admin/inter/*) usem EXATAMENTE a mesma
// lógica, recebendo a conta-alvo (ownerUid) de quem chama.
//
// Quem chama cuida do portão (token, dono/adm, plano Pro, rate limit) e da
// leitura do corpo; aqui ficam validação final, conferência de certificado e
// chave, cifragem (INTER_ENC_KEY) e gravação em integracoesBanco/{ownerUid} +
// users/{ownerUid}/profile/interStatus. Os retornos NUNCA trazem segredo, PEM
// nem campo *Enc, e os logs só levam o código do erro.

import { X509Certificate, createPrivateKey } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import { certExpiresAt, interTestConnection } from "./inter";
import { decryptInterSecrets, encryptInterSecrets, type EncryptedInterSecrets, type InterSecrets } from "./interCrypto";
import { maskConta, validateConexaoBody, type ConexaoInput } from "./interConexao";
import { errCode, interKeyConfigured, SERVER_CONFIG_ERROR } from "./interErrors";

export type InterAccountResult =
  | { ok: true; certExpiresAt?: number; contaMasked?: string }
  | { ok: false; status: number; error: string };

export type InterConexaoOpts = {
  /** true quando a equipe (adm supremo) configurou a conexão pelo cliente. */
  configuradoPelaEquipe?: boolean;
  /** uid de quem fez a alteração (gravado em updatedBy). Padrão: o próprio dono. */
  updatedBy?: string;
};

const secretsPath = (ownerUid: string) => `integracoesBanco/${ownerUid}`;
const statusPath = (ownerUid: string) => `users/${ownerUid}/profile/interStatus`;

const FALLBACK_TEST_ERROR = "Falha ao testar a conexão com o Banco Inter.";

function fail(error: string, status = 400): InterAccountResult {
  return { ok: false, status, error };
}

/** Só grava o marcador quando pedido: documentos de hoje continuam iguais. */
function equipeField(opts?: InterConexaoOpts): { configuradoPelaEquipe?: true } {
  return opts?.configuradoPelaEquipe ? { configuradoPelaEquipe: true } : {};
}

/**
 * Confere certificado + chave: legíveis, certificado dentro da validade e chave
 * correspondente ao certificado. Devolve a validade (epoch ms) ou uma mensagem
 * de erro legível — nunca o conteúdo dos arquivos.
 */
function checkCertKey(certPem: string, keyPem: string): { expiresAt: number } | { error: string } {
  let expiresAt: number;
  try {
    expiresAt = certExpiresAt(certPem);
  } catch (e) {
    // certExpiresAt já lança mensagem nossa, em português e sem conteúdo do PEM.
    return { error: e instanceof Error ? e.message : "Certificado do Banco Inter inválido." };
  }
  if (!Number.isFinite(expiresAt)) return { error: "Não foi possível ler a validade do certificado do Banco Inter." };
  if (expiresAt < Date.now()) {
    return { error: "O certificado do Banco Inter está expirado. Gere um novo no Internet Banking." };
  }

  let key;
  try {
    key = createPrivateKey(keyPem);
  } catch {
    return { error: "Chave privada inválida ou protegida por senha. Envie o arquivo .key gerado no Internet Banking." };
  }
  try {
    if (!new X509Certificate(certPem).checkPrivateKey(key)) {
      return { error: "A chave privada não corresponde ao certificado enviado." };
    }
  } catch {
    return { error: "A chave privada não corresponde ao certificado enviado." };
  }
  return { expiresAt };
}

/**
 * As mensagens de lib/inter.ts já são nossas e legíveis; mesmo assim, por
 * garantia, nada que pareça PEM ou seja longo demais vai para o status/resposta.
 */
function safeMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : "";
  if (!m || m.length > 300 || m.includes("-----BEGIN")) return FALLBACK_TEST_ERROR;
  return m;
}

// ---------- conectar ----------

/**
 * Conecta (ou reconecta) o Banco Inter da conta: substitui por completo os
 * segredos e zera o cursor da sincronização.
 */
export async function connectInter(
  db: Firestore,
  ownerUid: string,
  input: ConexaoInput,
  opts?: InterConexaoOpts
): Promise<InterAccountResult> {
  if (!interKeyConfigured()) return fail(SERVER_CONFIG_ERROR, 500);

  // Revalida (idempotente pra quem já validou o corpo): o núcleo não confia em quem chama.
  const v = validateConexaoBody(input, "create");
  if (!v.ok) return fail(v.error);
  const { clientId, clientSecret, certPem, keyPem, conta } = v.value;

  const ck = checkCertKey(certPem!, keyPem!);
  if ("error" in ck) return fail(ck.error);

  let enc: EncryptedInterSecrets;
  try {
    enc = encryptInterSecrets({ clientId: clientId!, clientSecret: clientSecret!, certPem: certPem!, keyPem: keyPem! });
  } catch {
    return fail(SERVER_CONFIG_ERROR, 500);
  }

  try {
    const now = Date.now();
    const batch = db.batch();
    // set sem merge: reconectar substitui por completo os segredos antigos.
    batch.set(db.doc(secretsPath(ownerUid)), {
      provider: "inter",
      ...enc,
      conta: conta ?? null,
      createdAt: now,
      updatedAt: now,
      updatedBy: opts?.updatedBy ?? ownerUid,
    });
    // Conexão NOVA: o cursor da sincronização zera (o set acima já não traz
    // lastSyncAt; aqui sai do status), pra primeira sincronização buscar 30 dias.
    batch.set(
      db.doc(statusPath(ownerUid)),
      {
        connected: true,
        contaMasked: maskConta(conta) ?? FieldValue.delete(),
        certExpiresAt: ck.expiresAt,
        lastSyncAt: FieldValue.delete(),
        lastSyncError: null,
        ...equipeField(opts),
      },
      { merge: true }
    );
    await batch.commit();
    return { ok: true, certExpiresAt: ck.expiresAt, contaMasked: maskConta(conta) };
  } catch (e) {
    console.error("[inter/conexao POST] falha ao gravar:", errCode(e));
    return fail("Não foi possível salvar a conexão com o Banco Inter. Tente novamente.", 500);
  }
}

// ---------- atualizar credenciais ----------

/**
 * Atualiza parte das credenciais (certificado e chave sempre juntos). O que
 * não veio é mantido; o par final é sempre revalidado. O cursor não muda.
 */
export async function updateInter(
  db: Firestore,
  ownerUid: string,
  input: ConexaoInput,
  opts?: InterConexaoOpts
): Promise<InterAccountResult> {
  if (!interKeyConfigured()) return fail(SERVER_CONFIG_ERROR, 500);

  const v = validateConexaoBody(input, "update");
  if (!v.ok) return fail(v.error);
  const val = v.value;

  try {
    const ref = db.doc(secretsPath(ownerUid));
    const snap = await ref.get();
    if (!snap.exists) return fail("O Banco Inter não está conectado. Conecte primeiro.", 404);
    const data = snap.data() ?? {};

    // Só decifra o que já existe se algum segredo não veio no corpo.
    const precisaAtuais = !val.clientId || !val.clientSecret || !val.certPem || !val.keyPem;
    let atuais: InterSecrets | null = null;
    if (precisaAtuais) {
      try {
        atuais = decryptInterSecrets(data as EncryptedInterSecrets);
      } catch {
        return fail(SERVER_CONFIG_ERROR, 500);
      }
    }
    const merged: InterSecrets = {
      clientId: val.clientId ?? atuais!.clientId,
      clientSecret: val.clientSecret ?? atuais!.clientSecret,
      certPem: val.certPem ?? atuais!.certPem,
      keyPem: val.keyPem ?? atuais!.keyPem,
    };
    const conta = val.conta !== undefined ? val.conta : (typeof data.conta === "string" ? data.conta : "");

    // Revalida sempre o par final (mesmo sem troca: o certificado guardado pode ter vencido).
    const ck = checkCertKey(merged.certPem, merged.keyPem);
    if ("error" in ck) return fail(ck.error);

    let enc: EncryptedInterSecrets;
    try {
      enc = encryptInterSecrets(merged);
    } catch {
      return fail(SERVER_CONFIG_ERROR, 500);
    }

    const batch = db.batch();
    batch.update(ref, { ...enc, conta: conta || null, updatedAt: Date.now(), updatedBy: opts?.updatedBy ?? ownerUid });
    batch.set(
      db.doc(statusPath(ownerUid)),
      {
        connected: true,
        contaMasked: maskConta(conta) ?? FieldValue.delete(),
        certExpiresAt: ck.expiresAt,
        lastSyncError: null,
        ...equipeField(opts),
      },
      { merge: true }
    );
    await batch.commit();
    return { ok: true, certExpiresAt: ck.expiresAt, contaMasked: maskConta(conta) };
  } catch (e) {
    console.error("[inter/conexao PUT] falha ao atualizar:", errCode(e));
    return fail("Não foi possível atualizar a conexão com o Banco Inter. Tente novamente.", 500);
  }
}

// ---------- desconectar ----------

/** Apaga os segredos (não precisa de INTER_ENC_KEY). interPendentes ficam intactos. */
export async function disconnectInter(db: Firestore, ownerUid: string): Promise<InterAccountResult> {
  try {
    const batch = db.batch();
    batch.delete(db.doc(secretsPath(ownerUid)));
    // interPendentes não é tocado. O cursor lastSyncAt NÃO sobrevive ao
    // desconectar (o doc de segredos some e o status perde o campo): uma
    // reconexão começa do zero, com a busca de 30 dias.
    batch.set(
      db.doc(statusPath(ownerUid)),
      {
        connected: false,
        contaMasked: FieldValue.delete(),
        certExpiresAt: FieldValue.delete(),
        lastSyncAt: FieldValue.delete(),
        lastSyncError: null,
        configuradoPelaEquipe: FieldValue.delete(),
      },
      { merge: true }
    );
    await batch.commit();
    return { ok: true };
  } catch (e) {
    console.error("[inter/conexao DELETE] falha ao desconectar:", errCode(e));
    return fail("Não foi possível desconectar o Banco Inter. Tente novamente.", 500);
  }
}

// ---------- testar ----------

/**
 * Testa as credenciais guardadas (certificado + token). O resultado vai para
 * interStatus.lastSyncError (null = ok). `tester` só é trocado nos testes.
 */
export async function testInter(
  db: Firestore,
  ownerUid: string,
  tester: (s: InterSecrets) => Promise<void> = interTestConnection
): Promise<InterAccountResult> {
  if (!interKeyConfigured()) return fail(SERVER_CONFIG_ERROR, 500);

  let secrets: InterSecrets;
  try {
    const snap = await db.doc(secretsPath(ownerUid)).get();
    if (!snap.exists) return fail("O Banco Inter não está conectado.", 404);
    const data = snap.data() ?? {};
    try {
      secrets = decryptInterSecrets(data as EncryptedInterSecrets);
    } catch {
      return fail(SERVER_CONFIG_ERROR, 500);
    }
    if (typeof data.conta === "string" && data.conta) secrets.conta = data.conta;
  } catch (e) {
    console.error("[inter/testar] falha ao ler conexão:", errCode(e));
    return fail("Não foi possível ler a conexão com o Banco Inter.", 500);
  }

  const statusRef = db.doc(statusPath(ownerUid));
  try {
    await tester(secrets);
  } catch (e) {
    const error = safeMessage(e);
    await statusRef.set({ lastSyncError: error }, { merge: true }).catch((err) => {
      console.error("[inter/testar] falha ao gravar status:", errCode(err));
    });
    return fail(error, 502);
  }

  try {
    await statusRef.set({ lastSyncError: null }, { merge: true });
  } catch (e) {
    console.error("[inter/testar] falha ao gravar status:", errCode(e));
  }
  return { ok: true };
}
