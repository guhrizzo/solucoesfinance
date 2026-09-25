// app/api/receivables/charge-email/route.ts
// POST { receivableId } → envia ao cliente o e-mail de aviso de cobrança de
// uma conta a receber (recurso do plano Pro). Os dados do cliente (nome,
// e-mail, CPF/CNPJ) e as regras de multa/juros vêm do próprio documento — o
// corpo da requisição só diz QUAL conta, nunca o destinatário, pra rota não
// virar um disparador de e-mail genérico. Registra o envio no documento.
// O e-mail sai no layout de boleto (beneficiário = empresa em Configurações,
// pagador = cliente); a emissão do boleto em si fica plugável em lib/boleto.ts.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireScope, isScopeError } from "@/lib/apiScope";
import { isProAccess } from "@/lib/billing";
import { resolveScopeSubscription } from "@/lib/scopeSubscription";
import { checkRateLimit } from "@/lib/rateLimit";
import { sendReceivableCharge } from "@/lib/receivableChargeSend";

const RATE_LIMIT = { windowMs: 10 * 60 * 1000, max: 30 }; // 30 e-mails / 10 min por conta

export async function POST(request: Request) {
  const scope = await requireScope(request, "contasReceber");
  if (isScopeError(scope)) {
    return NextResponse.json({ error: scope.error }, { status: scope.status });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }
  const receivableId = String(body?.receivableId ?? "").trim();
  if (!receivableId || receivableId.includes("/")) {
    return NextResponse.json({ error: "Cobrança não informada." }, { status: 400 });
  }

  const db = await getAdminDb();

  const state = await resolveScopeSubscription(db, scope);
  if (!isProAccess(state)) {
    return NextResponse.json({ error: "O envio de cobrança por e-mail é exclusivo do plano Pro." }, { status: 403 });
  }

  const { limited } = checkRateLimit(`charge-email:${scope.ownerUid}`, RATE_LIMIT, scope.isSupremeAdmin);
  if (limited) {
    return NextResponse.json({ error: "Muitos envios em pouco tempo. Aguarde alguns minutos." }, { status: 429 });
  }

  const res = await sendReceivableCharge({
    db, ownerUid: scope.ownerUid, receivableId, stage: "manual",
    channels: { email: true, whatsapp: false },
  });
  if (res.notFound) return NextResponse.json({ error: "Cobrança não encontrada." }, { status: 404 });
  if (res.received) return NextResponse.json({ error: "Esta cobrança já foi recebida." }, { status: 400 });
  if (!res.email?.ok) {
    const error = res.email && !res.email.ok ? res.email.error : "Não foi possível enviar o e-mail agora.";
    return NextResponse.json({ error }, { status: error.startsWith("Cadastre") ? 400 : 502 });
  }

  return NextResponse.json({ ok: true, sentAt: Date.now(), to: res.email.to });
}
