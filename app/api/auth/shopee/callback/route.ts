export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  shopeeCredentials,
  exchangeShopeeToken,
  fetchShopInfo,
  fetchShopeeListings,
  type ShopeeListing,
} from "@/lib/shopee";

const OAUTH_COOKIE = "shopee_oauth";

function redirectEstoque(request: Request, params: Record<string, string>) {
  const url = new URL("/estoque", request.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = NextResponse.redirect(url);
  res.cookies.delete(OAUTH_COOKIE);
  return res;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const shopId = searchParams.get("shop_id");
  const returnedState = searchParams.get("state");
  const isMockParam = searchParams.get("mock") === "true";

  if (!code) {
    return redirectEstoque(request, { integration: "shopee_error", message: "Código de autorização ausente" });
  }

  const { configured } = shopeeCredentials();
  const isMock = isMockParam || !configured;

  // ── Descobrir userId (cookie no fluxo real, state no mock) ────────────────
  let userId = "";
  if (isMock) {
    userId = returnedState || "";
  } else {
    const jar = await cookies();
    const raw = jar.get(OAUTH_COOKIE)?.value;
    if (!raw) {
      return redirectEstoque(request, {
        integration: "shopee_error",
        message: "Sessão de autorização expirada. Tente conectar novamente.",
      });
    }
    try {
      const parsed = JSON.parse(raw) as { s: string; u: string };
      // A Shopee nem sempre devolve o `state`; quando devolve, precisa bater.
      if (returnedState && parsed.s && parsed.s !== returnedState) {
        return redirectEstoque(request, { integration: "shopee_error", message: "Falha na verificação de segurança (state)" });
      }
      userId = parsed.u;
    } catch {
      return redirectEstoque(request, { integration: "shopee_error", message: "Sessão de autorização inválida" });
    }
  }

  if (!userId) {
    return redirectEstoque(request, { integration: "shopee_error", message: "Usuário não identificado" });
  }
  if (!shopId) {
    return redirectEstoque(request, { integration: "shopee_error", message: "shop_id ausente no retorno da Shopee" });
  }

  try {
    const db = await getAdminDb();

    const accountId = String(shopId);
    let accountName = `Loja Shopee ${shopId}`;
    let accessToken = "mock_access_token_shopee";
    let refreshToken = "mock_refresh_token_shopee";
    let expiresAt = Date.now() + 4 * 60 * 60 * 1000; // 4 horas

    if (!isMock) {
      const token = await exchangeShopeeToken({ code, shopId: String(shopId) });
      accessToken = token.access_token;
      refreshToken = token.refresh_token;
      expiresAt = Date.now() + (token.expire_in || 14400) * 1000;
      try {
        const info = await fetchShopInfo(accessToken, accountId);
        if (info.shopName) accountName = info.shopName;
      } catch { /* nome é cosmético */ }
    } else {
      accountName = "Loja Simulação Shopee (Testes)";
    }

    // ── Salvar/atualizar a integração (mesma coleção/campos do ML) ───────────
    const integracoesRef = db.collection("integracoes");
    const snapIntegracao = await integracoesRef
      .where("userId", "==", userId)
      .where("platform", "==", "shopee")
      .where("accountId", "==", accountId)
      .get();

    const integracaoData = {
      userId,
      platform: "shopee" as const,
      accountId,
      accountName,
      accessToken,
      refreshToken,
      expiresAt,
      updatedAt: Date.now(),
    };

    let integrationId: string;
    if (!snapIntegracao.empty) {
      integrationId = snapIntegracao.docs[0].id;
      await integracoesRef.doc(integrationId).set(integracaoData, { merge: true });
    } else {
      const docRef = await integracoesRef.add({ ...integracaoData, createdAt: Date.now() });
      integrationId = docRef.id;
    }

    // ── Importar itens e vincular ao estoque central ────────────────────────
    let listings: ShopeeListing[];
    if (isMock) {
      listings = [
        { adId: "SHP90001001", sku: "MLA-1001", title: "Fone Bluetooth SoundMax Pro", price: 189.9, quantity: 45 },
        { adId: "SHP90002001", sku: "SHP-2001", title: "Garrafa Térmica Inox 500ml", price: 59.9, quantity: 120 },
        { adId: "SHP90002002", sku: "SHP-2002", title: "Suporte Veicular Celular Articulado", price: 29.9, quantity: 8 },
      ];
    } else {
      try {
        listings = await fetchShopeeListings(accessToken, accountId);
      } catch (err) {
        console.error("Erro ao importar itens da Shopee (permissão/limite?):", err);
        return redirectEstoque(request, { integration: "shopee_success", warning: "limited_permissions" });
      }
    }

    let importados = 0;
    for (const ad of listings) {
      const estoqueRef = db.collection("estoque");
      const snapEstoque = await estoqueRef
        .where("userId", "==", userId)
        .where("sku", "==", ad.sku)
        .get();

      if (snapEstoque.empty) {
        await estoqueRef.add({
          userId,
          sku: ad.sku,
          name: ad.title,
          price: ad.price,
          quantity: ad.quantity,
          minQuantity: 10,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }

      const vinculosRef = db.collection("vinculos");
      const snapVinculo = await vinculosRef
        .where("userId", "==", userId)
        .where("platform", "==", "shopee")
        .where("adId", "==", ad.adId)
        .get();

      const vinculoData = {
        userId,
        sku: ad.sku,
        platform: "shopee" as const,
        adId: ad.adId,
        title: ad.title,
        price: ad.price,
        quantity: ad.quantity,
        connectionId: integrationId,
        updatedAt: Date.now(),
      };

      if (!snapVinculo.empty) {
        await vinculosRef.doc(snapVinculo.docs[0].id).set(vinculoData, { merge: true });
      } else {
        await vinculosRef.add({ ...vinculoData, createdAt: Date.now() });
      }
      importados++;
    }

    return redirectEstoque(request, { integration: "shopee_success", imported: String(importados) });
  } catch (error: any) {
    console.error("Erro interno no callback da Shopee:", error);
    return redirectEstoque(request, {
      integration: "shopee_error",
      message: error?.message || "Erro desconhecido na integração",
    });
  }
}
