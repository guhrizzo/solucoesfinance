// app/api/webhooks/inter-boletos/[token]/route.ts
//
// POST — webhook PÚBLICO (sem login) de boletos do Banco Inter. Registrado por
// conta pelo adm supremo (POST /api/admin/inter/boletos) na URL
//   ${NEXT_PUBLIC_APP_URL}/api/webhooks/inter-boletos/{token}
// O token (32 bytes aleatórios) é o único segredo: só o sha256 dele fica no
// banco. O corpo não é confiado: cada callback só aponta o boleto, e a situação
// aplicada vem de uma consulta nossa ao Inter (lib/interBoletoWebhook.ts).
//
// Respostas: token desconhecido ou fora do formato → 404 com corpo genérico
// (o formato é conferido ANTES de ler o corpo); token válido → 200
// { ok, processados } mesmo se algum callback falhou (o cron cobre); rodada
// interrompida por erro geral (credencial, rede, Inter fora) → 503 genérico para
// o Inter reenviar; Firestore fora antes de processar → 500; corpo grande → 413
// (lido com limite de bytes); abuso → 429. Logs: só contagens e códigos (nunca o token, a
// URL nem o corpo). Não usa withWebhookLog de propósito: ele gravaria a URL
// com o token.
//
// Não dá para testar de ponta a ponta no localhost: o Inter só chama HTTPS público.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { hashWebhookToken, lerTextoLimitado, processarCallbacks, tokenComFormato } from "@/lib/interBoletoWebhook";
import { errCode } from "@/lib/interErrors";

const MAX_BYTES = 256 * 1024;
const RATE_IP = { windowMs: 60 * 1000, max: 120 };
const RATE_TOKEN = { windowMs: 60 * 1000, max: 60 };

const naoEncontrado = () => NextResponse.json({ error: "Não encontrado." }, { status: 404 });

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const ip = checkRateLimit(`inter-boletos-webhook-ip:${getClientIp(req)}`, RATE_IP);
  if (ip.limited) {
    return NextResponse.json({ error: "Muitas requisições." }, { status: 429, headers: { "Retry-After": String(ip.retryAfterSec) } });
  }

  const { token } = await ctx.params;
  // Fora do formato: o mesmo 404 genérico, sem ler o corpo.
  if (!tokenComFormato(token)) return naoEncontrado();
  // Chave do limite = prefixo do hash (nunca o token).
  const porToken = checkRateLimit(`inter-boletos-webhook:${hashWebhookToken(token).slice(0, 32)}`, RATE_TOKEN);
  if (porToken.limited) {
    return NextResponse.json({ error: "Muitas requisições." }, { status: 429, headers: { "Retry-After": String(porToken.retryAfterSec) } });
  }

  const declarado = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declarado) && declarado > MAX_BYTES) {
    return NextResponse.json({ error: "Corpo muito grande." }, { status: 413 });
  }
  const texto = await lerTextoLimitado(req, MAX_BYTES);
  if (texto === null) {
    return NextResponse.json({ error: "Corpo muito grande." }, { status: 413 });
  }
  let corpo: unknown = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    corpo = null;
  }

  try {
    const db = await getAdminDb();
    const r = await processarCallbacks(db, token, corpo);
    if (r.status === 404) return naoEncontrado();
    if (r.falhas || r.ignorados) {
      console.warn("[Inter boletos webhook]", { processados: r.processados, ignorados: r.ignorados, falhas: r.falhas, motivos: r.motivos });
    }
    // Parou num erro geral: o que ficou sem processar volta no reenvio do Inter (idempotente).
    if (r.parouPorErroGeral) return NextResponse.json({ error: "Falha temporária." }, { status: 503 });
    return NextResponse.json({ ok: true, processados: r.processados });
  } catch (e) {
    // Falha antes de processar (ex.: Firestore fora): 500 para o Inter reenviar.
    console.error("[Inter boletos webhook] falha:", errCode(e));
    return NextResponse.json({ error: "Falha temporária." }, { status: 500 });
  }
}
