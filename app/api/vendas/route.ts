export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Pode disparar chamadas à API do Mercado Livre / Shopee ao propagar o estoque.
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireScope, isScopeError } from "@/lib/apiScope";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { registrarVendaAdmin, type VendaChannel } from "@/lib/vendas";
import { baixarEstoqueEPropagar } from "@/lib/estoqueSync";

const CHANNELS: VendaChannel[] = ["manual", "mercadolivre", "shopee", "tiktokshop"];
const RATE_LIMIT = { windowMs: 60_000, max: 20 }; // 20 vendas / min por IP+conta

/**
 * Registra uma venda feita à mão no Painel de Vendas:
 *   1. lança a venda como ENTRADA no Fluxo de Caixa (lib/vendas → dedupe por orderId);
 *   2. baixa o estoque central do SKU e propaga a nova quantidade pros anúncios
 *      vinculados (Mercado Livre / Shopee) via API.
 *
 * O ownerUid vem SEMPRE do ID token (lib/apiScope) — nunca do corpo.
 */
export async function POST(request: Request) {
  try {
    const scope = await requireScope(request, "vendas");
    if (isScopeError(scope)) {
      return NextResponse.json({ error: scope.error }, { status: scope.status });
    }
    const ownerUid = scope.ownerUid;

    const { limited, retryAfterSec } = checkRateLimit(
      `vendas:${getClientIp(request)}:${ownerUid}`,
      RATE_LIMIT
    );
    if (limited) {
      return NextResponse.json(
        { error: "Muitas vendas em pouco tempo. Aguarde um instante e tente de novo." },
        { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
      );
    }

    const body = await request.json().catch(() => ({}));
    const sku = String(body.sku ?? "").trim();
    const channel: VendaChannel = CHANNELS.includes(body.channel) ? body.channel : "manual";
    const quantity = Math.max(1, Math.round(Number(body.quantity) || 0));
    const unitPrice = Math.max(0, Number(body.unitPrice) || 0);
    const productName = String(body.productName ?? sku).trim();
    const orderId = String(body.orderId ?? "").trim() || null;

    if (!sku) {
      return NextResponse.json({ error: "Selecione um produto." }, { status: 400 });
    }
    if (unitPrice <= 0) {
      return NextResponse.json({ error: "Informe um preço unitário válido." }, { status: 400 });
    }

    const db = await getAdminDb();

    // 1. Lança a venda no caixa PRIMEIRO. registrarVendaAdmin deduplica por
    //    orderId — num reenvio (mesmo orderId) retorna null e NÃO baixamos o
    //    estoque de novo.
    const vendaId = await registrarVendaAdmin(db, ownerUid, {
      channel,
      sku,
      productName,
      adId: "",
      quantity,
      unitPrice,
      orderId,
    });

    if (!vendaId) {
      return NextResponse.json({ ok: true, duplicated: true });
    }

    // 2. Baixa o estoque central e propaga pros canais vinculados ao SKU.
    //    origem "manual" nunca casa com um vínculo → empurra pra TODOS os
    //    marketplaces conectados (a unidade saiu do estoque físico).
    let newStock: number | null = null;
    try {
      newStock = await baixarEstoqueEPropagar(db, ownerUid, sku, quantity, {
        platform: "manual",
        adId: "",
      });
    } catch (err) {
      // A venda já foi registrada no caixa; a baixa de estoque é best-effort.
      console.error("[vendas] falha ao baixar/propagar estoque:", err);
    }

    return NextResponse.json({ ok: true, vendaId, newStock });
  } catch (error) {
    console.error("Erro na rota de venda manual:", error);
    const msg = error instanceof Error ? error.message : "Erro ao registrar a venda.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
