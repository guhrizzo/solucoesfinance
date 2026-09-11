export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Troca de token + fetchAuthorizedShop + importação produto a produto (loja
// grande = lento).
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  tiktokShopCredentials,
  exchangeTiktokToken,
  fetchAuthorizedShop,
  fetchTiktokListings,
  type TiktokListing,
} from "@/lib/tiktokshop";

const OAUTH_COOKIE = "tiktokshop_oauth";

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
  const returnedState = searchParams.get("state");
  const isMockParam = searchParams.get("mock") === "true";

  if (!code) {
    return redirectEstoque(request, { integration: "tiktok_error", message: "Código de autorização ausente" });
  }

  const { configured } = tiktokShopCredentials();
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
        integration: "tiktok_error",
        message: "Sessão de autorização expirada. Tente conectar novamente.",
      });
    }
    try {
      const parsed = JSON.parse(raw) as { s: string; u: string };
      if (returnedState && parsed.s && parsed.s !== returnedState) {
        return redirectEstoque(request, { integration: "tiktok_error", message: "Falha na verificação de segurança (state)" });
      }
      userId = parsed.u;
    } catch {
      return redirectEstoque(request, { integration: "tiktok_error", message: "Sessão de autorização inválida" });
    }
  }

  if (!userId) {
    return redirectEstoque(request, { integration: "tiktok_error", message: "Usuário não identificado" });
  }

  try {
    const db = await getAdminDb();

    let accountId = "998877";
    let shopCipher = "mock_shop_cipher";
    let accountName = "Loja Simulação TikTok Shop (Testes)";
    let accessToken = "mock_access_token_tiktokshop";
    let refreshToken = "mock_refresh_token_tiktokshop";
    let expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 dias

    if (!isMock) {
      const token = await exchangeTiktokToken(code);
      accessToken = token.access_token;
      refreshToken = token.refresh_token;
      expiresAt = Date.now() + (token.access_token_expire_in || 7 * 24 * 60 * 60) * 1000;
      const shop = await fetchAuthorizedShop(accessToken);
      accountId = shop.shopId;
      shopCipher = shop.shopCipher;
      accountName = shop.shopName;
    }

    // ── Salvar/atualizar a integração (mesma coleção/campos do ML/Shopee) ───
    const integracoesRef = db.collection("integracoes");
    const snapIntegracao = await integracoesRef
      .where("userId", "==", userId)
      .where("platform", "==", "tiktokshop")
      .where("accountId", "==", accountId)
      .get();

    const integracaoData = {
      userId,
      platform: "tiktokshop" as const,
      accountId,
      accountName,
      accessToken,
      refreshToken,
      shopCipher,
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

    // ── Importar produtos e vincular ao estoque central ─────────────────────
    let listings: TiktokListing[];
    if (isMock) {
      listings = [
        { adId: "TTS90001:SKU1", sku: "MLA-1001", title: "Fone Bluetooth SoundMax Pro", price: 189.9, quantity: 45 },
        { adId: "TTS90002:SKU1", sku: "TTS-2001", title: "Ring Light 26cm com Tripé", price: 79.9, quantity: 60 },
        { adId: "TTS90002:SKU2", sku: "TTS-2002", title: "Case Transparente iPhone", price: 24.9, quantity: 15 },
      ];
    } else {
      try {
        listings = await fetchTiktokListings(accessToken, accountId, shopCipher);
      } catch (err) {
        console.error("Erro ao importar produtos da TikTok Shop (permissão/limite?):", err);
        return redirectEstoque(request, { integration: "tiktok_success", warning: "limited_permissions" });
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
        .where("platform", "==", "tiktokshop")
        .where("adId", "==", ad.adId)
        .get();

      const vinculoData = {
        userId,
        sku: ad.sku,
        platform: "tiktokshop" as const,
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

    return redirectEstoque(request, { integration: "tiktok_success", imported: String(importados) });
  } catch (error: any) {
    console.error("Erro interno no callback da TikTok Shop:", error);
    return redirectEstoque(request, {
      integration: "tiktok_error",
      message: error?.message || "Erro desconhecido na integração",
    });
  }
}
