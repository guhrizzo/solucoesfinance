// app/api/inter/conexao/route.ts
//
// Conexão com o Banco Inter (ver docs/superpowers/specs/2026-11-03-inter-extrato-conciliar-design.md):
//   POST   — conectar: recebe clientId, clientSecret, certPem, keyPem e conta (opcional).
//   PUT    — atualizar credenciais: campos opcionais; certificado e chave vêm juntos.
//   DELETE — desconectar: apaga os segredos (interPendentes ficam intactos).
//
// Só o DONO da conta, plano Pro (exceto DELETE). Os segredos são cifrados com
// INTER_ENC_KEY e gravados em integracoesBanco/{ownerUid} (só Admin SDK); o
// resumo público vai para users/{ownerUid}/profile/interStatus. As respostas
// NUNCA ecoam segredo, PEM nem campo *Enc, e nada do corpo é logado.

import { NextRequest, NextResponse } from "next/server";
import { X509Certificate, createPrivateKey } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { certExpiresAt } from "@/lib/inter";
import { decryptInterSecrets, encryptInterSecrets, type EncryptedInterSecrets, type InterSecrets } from "@/lib/interCrypto";
import { maskConta, validateConexaoBody } from "@/lib/interConexao";
import { errCode, guardInter, interKeyConfigured, SERVER_CONFIG_ERROR } from "../_guard";

export const runtime = "nodejs";

const RATE = { windowMs: 10 * 60 * 1000, max: 10 }; // 10 alterações / 10 min por conta

const secretsPath = (ownerUid: string) => `integracoesBanco/${ownerUid}`;
const statusPath = (ownerUid: string) => `users/${ownerUid}/profile/interStatus`;

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
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

async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

// ---------- POST: conectar ----------

export async function POST(req: NextRequest) {
  const scope = await guardInter(req, { rateKey: "inter-conexao", rate: RATE });
  if (scope instanceof NextResponse) return scope;
  if (!interKeyConfigured()) return bad(SERVER_CONFIG_ERROR, 500);

  const v = validateConexaoBody(await readJson(req), "create");
  if (!v.ok) return bad(v.error);
  const { clientId, clientSecret, certPem, keyPem, conta } = v.value;

  const ck = checkCertKey(certPem!, keyPem!);
  if ("error" in ck) return bad(ck.error);

  let enc: EncryptedInterSecrets;
  try {
    enc = encryptInterSecrets({ clientId: clientId!, clientSecret: clientSecret!, certPem: certPem!, keyPem: keyPem! });
  } catch {
    return bad(SERVER_CONFIG_ERROR, 500);
  }

  try {
    const db = await getAdminDb();
    const now = Date.now();
    const batch = db.batch();
    // set sem merge: reconectar substitui por completo os segredos antigos.
    batch.set(db.doc(secretsPath(scope.ownerUid)), {
      provider: "inter",
      ...enc,
      conta: conta ?? null,
      createdAt: now,
      updatedAt: now,
      updatedBy: scope.uid,
    });
    // merge: preserva lastSyncAt (cursor da sincronização) de uma conexão anterior.
    batch.set(
      db.doc(statusPath(scope.ownerUid)),
      {
        connected: true,
        contaMasked: maskConta(conta) ?? FieldValue.delete(),
        certExpiresAt: ck.expiresAt,
        lastSyncError: null,
      },
      { merge: true }
    );
    await batch.commit();
    return NextResponse.json({ ok: true, certExpiresAt: ck.expiresAt, contaMasked: maskConta(conta) ?? null });
  } catch (e) {
    console.error("[inter/conexao POST] falha ao gravar:", errCode(e));
    return bad("Não foi possível salvar a conexão com o Banco Inter. Tente novamente.", 500);
  }
}

// ---------- PUT: atualizar credenciais ----------

export async function PUT(req: NextRequest) {
  const scope = await guardInter(req, { rateKey: "inter-conexao", rate: RATE });
  if (scope instanceof NextResponse) return scope;
  if (!interKeyConfigured()) return bad(SERVER_CONFIG_ERROR, 500);

  const v = validateConexaoBody(await readJson(req), "update");
  if (!v.ok) return bad(v.error);
  const input = v.value;

  try {
    const db = await getAdminDb();
    const ref = db.doc(secretsPath(scope.ownerUid));
    const snap = await ref.get();
    if (!snap.exists) return bad("O Banco Inter não está conectado. Conecte primeiro.", 404);
    const data = snap.data() ?? {};

    // Só decifra o que já existe se algum segredo não veio no corpo.
    const precisaAtuais = !input.clientId || !input.clientSecret || !input.certPem || !input.keyPem;
    let atuais: InterSecrets | null = null;
    if (precisaAtuais) {
      try {
        atuais = decryptInterSecrets(data as EncryptedInterSecrets);
      } catch {
        return bad(SERVER_CONFIG_ERROR, 500);
      }
    }
    const merged: InterSecrets = {
      clientId: input.clientId ?? atuais!.clientId,
      clientSecret: input.clientSecret ?? atuais!.clientSecret,
      certPem: input.certPem ?? atuais!.certPem,
      keyPem: input.keyPem ?? atuais!.keyPem,
    };
    const conta = input.conta !== undefined ? input.conta : (typeof data.conta === "string" ? data.conta : "");

    // Revalida sempre o par final (mesmo sem troca: o certificado guardado pode ter vencido).
    const ck = checkCertKey(merged.certPem, merged.keyPem);
    if ("error" in ck) return bad(ck.error);

    let enc: EncryptedInterSecrets;
    try {
      enc = encryptInterSecrets(merged);
    } catch {
      return bad(SERVER_CONFIG_ERROR, 500);
    }

    const batch = db.batch();
    batch.update(ref, { ...enc, conta: conta || null, updatedAt: Date.now(), updatedBy: scope.uid });
    batch.set(
      db.doc(statusPath(scope.ownerUid)),
      {
        connected: true,
        contaMasked: maskConta(conta) ?? FieldValue.delete(),
        certExpiresAt: ck.expiresAt,
        lastSyncError: null,
      },
      { merge: true }
    );
    await batch.commit();
    return NextResponse.json({ ok: true, certExpiresAt: ck.expiresAt, contaMasked: maskConta(conta) ?? null });
  } catch (e) {
    console.error("[inter/conexao PUT] falha ao atualizar:", errCode(e));
    return bad("Não foi possível atualizar a conexão com o Banco Inter. Tente novamente.", 500);
  }
}

// ---------- DELETE: desconectar ----------

export async function DELETE(req: NextRequest) {
  // Sem exigir Pro: quem saiu do plano ainda precisa conseguir apagar os segredos.
  const scope = await guardInter(req, { rateKey: "inter-conexao", rate: RATE, requirePro: false });
  if (scope instanceof NextResponse) return scope;

  try {
    const db = await getAdminDb();
    const batch = db.batch();
    batch.delete(db.doc(secretsPath(scope.ownerUid)));
    // interPendentes não é tocado; lastSyncAt fica como histórico.
    batch.set(
      db.doc(statusPath(scope.ownerUid)),
      {
        connected: false,
        contaMasked: FieldValue.delete(),
        certExpiresAt: FieldValue.delete(),
        lastSyncError: null,
      },
      { merge: true }
    );
    await batch.commit();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[inter/conexao DELETE] falha ao desconectar:", errCode(e));
    return bad("Não foi possível desconectar o Banco Inter. Tente novamente.", 500);
  }
}
