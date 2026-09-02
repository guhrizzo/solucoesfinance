export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Varre get_order_list + até ~80 get_escrow_detail sequenciais.
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireScope, isScopeError } from "@/lib/apiScope";
import {
  isMockToken,
  getValidShopeeToken,
  fetchShopeePayoutSummary,
  type ShopeeIntegracao,
  type ShopeePayoutSummary,
} from "@/lib/shopee";

// Cada chamada pode disparar dezenas de requisições à API da Shopee
// (get_order_list + get_escrow_detail por pedido) sem exigir autenticação.
const RATE_LIMIT = { windowMs: 60 * 1000, max: 6 };

// Taxa média estimada da Shopee (comissão + serviço) usada só no modo simulado
// pra derivar um "líquido" plausível a partir das vendas já lançadas no caixa.
const TAXA_MOCK = 0.18;

interface RepasseResponse {
  configured: boolean;
  mock: boolean;
  estoque: { itens: number; unidades: number; skus: number };
  repasse: ShopeePayoutSummary;
  atualizadoEm: number;
  aviso?: string;
}

export async function GET(request: Request) {
  const scope = await requireScope(request, ["estoque", "vendas"]);
  if (isScopeError(scope)) {
    return NextResponse.json({ error: scope.error }, { status: scope.status });
  }
  const userId = scope.ownerUid;

  const { limited, retryAfterSec } = checkRateLimit(
    `shopee-repasse:${getClientIp(request)}:${userId}`,
    RATE_LIMIT
  );
  if (limited) {
    return NextResponse.json(
      { error: "Muitas consultas em pouco tempo. Aguarde um instante." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
  }

  try {
    const db = await getAdminDb();

    // ── Resumo de estoque da Shopee (vínculos importados) ────────────────────
    const snapVinculos = await db
      .collection("vinculos")
      .where("userId", "==", userId)
      .where("platform", "==", "shopee")
      .get();

    let unidades = 0;
    const skus = new Set<string>();
    for (const d of snapVinculos.docs) {
      const v = d.data();
      unidades += Number(v.quantity) || 0;
      if (v.sku) skus.add(String(v.sku).toUpperCase());
    }
    const estoque = { itens: snapVinculos.size, unidades, skus: skus.size };

    // ── Integração Shopee ───────────────────────────────────────────────────
    const snapInteg = await db
      .collection("integracoes")
      .where("userId", "==", userId)
      .where("platform", "==", "shopee")
      .get();

    const vazio: ShopeePayoutSummary = {
      pendente: 0, liberado: 0, taxas: 0, pedidosLidos: 0, truncado: false, pedidos: [],
    };

    if (snapInteg.empty) {
      const body: RepasseResponse = {
        configured: false, mock: false, estoque, repasse: vazio, atualizadoEm: Date.now(),
        aviso: "Nenhuma loja Shopee conectada.",
      };
      return NextResponse.json(body);
    }

    const integ = { id: snapInteg.docs[0].id, ...snapInteg.docs[0].data() } as ShopeeIntegracao;

    // ── Modo simulado: deriva o líquido das vendas Shopee já no caixa ────────
    if (isMockToken(integ.accessToken)) {
      const desde = new Date();
      desde.setDate(desde.getDate() - 60);
      const desdeStr = desde.toISOString().split("T")[0];
      const corte = new Date();
      corte.setDate(corte.getDate() - 14);
      const corteStr = corte.toISOString().split("T")[0];

      const snapTx = await db
        .collection("users").doc(userId).collection("cashflow")
        .where("saleChannel", "==", "shopee")
        .where("type", "==", "entrada")
        .get();

      let pendente = 0, liberado = 0, taxas = 0, lidos = 0;
      for (const d of snapTx.docs) {
        const t = d.data();
        const data = String(t.date || "");
        if (data < desdeStr) continue;
        const bruto = Number(t.amount) || 0;
        const liquido = bruto * (1 - TAXA_MOCK);
        taxas += bruto - liquido;
        lidos++;
        if (data >= corteStr) pendente += liquido;
        else liberado += liquido;
      }

      const round2 = (n: number) => Math.round(n * 100) / 100;
      const body: RepasseResponse = {
        configured: false,
        mock: true,
        estoque,
        repasse: {
          pendente: round2(pendente),
          liberado: round2(liberado),
          taxas: round2(taxas),
          pedidosLidos: lidos,
          truncado: false,
          pedidos: [],
        },
        atualizadoEm: Date.now(),
        aviso: "Modo simulado — valores estimados a partir das vendas Shopee no caixa (taxa média 18%).",
      };
      return NextResponse.json(body);
    }

    // ── Real: consulta o escrow na Shopee ──────────────────────────────────
    const token = await getValidShopeeToken(db, integ);
    const repasse = await fetchShopeePayoutSummary(token, integ.accountId || "", {
      dias: 60,
      teto: 80,
    });

    const body: RepasseResponse = {
      configured: true, mock: false, estoque, repasse, atualizadoEm: Date.now(),
      aviso: repasse.truncado
        ? "Varredura limitada aos pedidos mais recentes — o total pode estar incompleto."
        : undefined,
    };
    return NextResponse.json(body);
  } catch (error) {
    console.error("Erro na rota de repasse da Shopee:", error);
    const msg = error instanceof Error ? error.message : "Erro ao consultar repasse";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
