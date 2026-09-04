// app/api/feedback/route.ts
// POST  → qualquer usuário logado abre um bug / sugestão de melhoria.
// GET   → lista os chamados. Adm supremo (lib/compAccounts) vê TODOS;
//         qualquer outro vê só os próprios.
//
// A coleção `feedback` só é tocada aqui (Admin SDK) — firestore.rules nega
// acesso direto do client.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { requireScope, isScopeError } from "@/lib/apiScope";
import { isCompedEmail } from "@/lib/compAccounts";
import { checkRateLimit } from "@/lib/rateLimit";
import {
  FEEDBACK_LIMITS,
  isFeedbackType,
  type FeedbackDoc,
} from "@/lib/feedback";

const MAX_LIST = 500;

/** e-mail + nome verificados do requisitante (nunca do corpo do request). */
async function identify(uid: string): Promise<{ email: string | null; name: string | null }> {
  try {
    const rec = await (await getAdminAuth()).getUser(uid);
    return { email: rec.email ?? null, name: rec.displayName ?? null };
  } catch {
    return { email: null, name: null };
  }
}

export async function POST(request: Request) {
  const scope = await requireScope(request);
  if (isScopeError(scope)) {
    return NextResponse.json({ error: scope.error }, { status: scope.status });
  }

  const { limited, retryAfterSec } = checkRateLimit(`feedback:${scope.uid}`, {
    windowMs: 60 * 60 * 1000,
    max: 15,
  });
  if (limited) {
    return NextResponse.json(
      { error: "Você enviou muitos relatos em pouco tempo. Aguarde um pouco." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const type = body?.type;
  if (!isFeedbackType(type)) {
    return NextResponse.json({ error: "Selecione se é um bug ou uma melhoria." }, { status: 400 });
  }

  const local = String(body?.local ?? "").trim().slice(0, FEEDBACK_LIMITS.local);
  const atual = String(body?.atual ?? "").trim().slice(0, FEEDBACK_LIMITS.atual);
  const esperado = String(body?.esperado ?? "").trim().slice(0, FEEDBACK_LIMITS.esperado);

  if (!local) {
    return NextResponse.json({ error: "Diga onde isso acontece / deveria acontecer." }, { status: 400 });
  }
  if (!esperado) {
    return NextResponse.json({ error: "Diga o que deveria acontecer." }, { status: 400 });
  }
  if (type === "bug" && !atual) {
    return NextResponse.json({ error: "Diga o que aconteceu." }, { status: 400 });
  }

  const { email, name } = await identify(scope.uid);
  const now = Date.now();

  const doc: Omit<FeedbackDoc, "id"> = {
    type,
    local,
    atual,
    esperado,
    status: "aberto",
    userId: scope.uid,
    userEmail: email ?? "",
    userName: name ?? "",
    ownerId: scope.ownerUid,
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
    resolvedByEmail: null,
    resolution: null,
    notifiedAt: null,
  };

  try {
    const db = await getAdminDb();
    const ref = await db.collection("feedback").add(doc);
    return NextResponse.json({ ok: true, id: ref.id });
  } catch (err) {
    console.error("Erro ao salvar feedback:", err);
    return NextResponse.json({ error: "Não foi possível registrar agora. Tente de novo." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const scope = await requireScope(request);
  if (isScopeError(scope)) {
    return NextResponse.json({ error: scope.error }, { status: scope.status });
  }

  const { email } = await identify(scope.uid);
  const isAdmin = isCompedEmail(email);

  try {
    const db = await getAdminDb();
    let items: FeedbackDoc[];

    if (isAdmin) {
      const snap = await db
        .collection("feedback")
        .orderBy("createdAt", "desc")
        .limit(MAX_LIST)
        .get();
      items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FeedbackDoc, "id">) }));
    } else {
      // Sem orderBy pra não exigir índice composto — ordena em memória.
      const snap = await db
        .collection("feedback")
        .where("userId", "==", scope.uid)
        .limit(MAX_LIST)
        .get();
      items = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<FeedbackDoc, "id">) }))
        .sort((a, b) => b.createdAt - a.createdAt);
    }

    return NextResponse.json({ items, isAdmin });
  } catch (err) {
    console.error("Erro ao listar feedback:", err);
    return NextResponse.json({ error: "Não foi possível carregar agora." }, { status: 500 });
  }
}
