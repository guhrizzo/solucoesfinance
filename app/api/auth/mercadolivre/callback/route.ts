export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  mlCredentials,
  exchangeCodeForToken,
  fetchAccountInfo,
  fetchActiveListings,
  type MlListing,
} from "@/lib/mercadolivre";

const OAUTH_COOKIE = "ml_oauth";

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
  const oauthError = searchParams.get("error");
  const isMockParam = searchParams.get("mock") === "true";

  if (oauthError) {
    return redirectEstoque(request, { integration: "ml_error", message: oauthError });
  }
  if (!code) {
    return redirectEstoque(request, { integration: "ml_error", message: "Código de autorização ausente" });
  }

  const { configured } = mlCredentials();
  const isMock = isMockParam || !configured;

  // ── Descobrir userId + code_verifier ──────────────────────────────────────
  let userId = "";
  let codeVerifier = "";

  if (isMock) {
    userId = returnedState || "";
  } else {
    const jar = await cookies();
    const raw = jar.get(OAUTH_COOKIE)?.value;
    if (!raw) {
      return redirectEstoque(request, {
        integration: "ml_error",
        message: "Sessão de autorização expirada. Tente conectar novamente.",
      });
    }
    try {
      const parsed = JSON.parse(raw) as { v: string; s: string; u: string };
      if (!parsed.s || parsed.s !== returnedState) {
        return redirectEstoque(request, { integration: "ml_error", message: "Falha na verificação de segurança (state)" });
      }
      codeVerifier = parsed.v;
      userId = parsed.u;
    } catch {
      return redirectEstoque(request, { integration: "ml_error", message: "Sessão de autorização inválida" });
    }
  }

  if (!userId) {
    return redirectEstoque(request, { integration: "ml_error", message: "Usuário não identificado" });
  }

  try {
    // Admin SDK: as rotas de servidor gravam nas coleções integracoes/estoque/
    // vinculos sem passar pelas Firestore rules (o SDK client no servidor não
    // carrega auth → "Missing or insufficient permissions").
    const db = await getAdminDb();

    let accountId = "mock_ml_user_999";
    let accountName = "Loja Simulação Mercado Livre";
    let accessToken = "mock_access_token_ml";
    let refreshToken = "mock_refresh_token_ml";
    let expiresAt = Date.now() + 6 * 60 * 60 * 1000;

    if (!isMock) {
      const token = await exchangeCodeForToken({ code, codeVerifier });
      accessToken = token.access_token;
      refreshToken = token.refresh_token;
      expiresAt = Date.now() + token.expires_in * 1000;
      accountId = String(token.user_id);

      const info = await fetchAccountInfo(accessToken, accountId);
      accountName = info.nickname;
    }

    // ── Salvar/atualizar a integração ───────────────────────────────────────
    const integracoesRef = db.collection("integracoes");
    const snapIntegracao = await integracoesRef
      .where("userId", "==", userId)
      .where("platform", "==", "mercadolivre")
      .where("accountId", "==", accountId)
      .get();

    const integracaoData = {
      userId,
      platform: "mercadolivre" as const,
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

    // ── Importar anúncios e vincular ao estoque central ─────────────────────
    let listings: MlListing[];
    if (isMock) {
      listings = [
        { adId: "MLB40001001", sku: "MLA-1001", title: "Fone de Ouvido Bluetooth SoundMax", price: 199.9, quantity: 45 },
        { adId: "MLB40001002", sku: "MLA-1002", title: "Teclado Mecânico RGB Gamer", price: 349.9, quantity: 12 },
        { adId: "MLB40001003", sku: "MLA-1003", title: "Mouse Sem Fio Office Slim", price: 89.9, quantity: 85 },
      ];
    } else {
      try {
        listings = await fetchActiveListings(accessToken, accountId);
      } catch (err) {
        console.error("Erro ao importar anúncios do ML (permissão/limite?):", err);
        return redirectEstoque(request, { integration: "ml_success", warning: "limited_permissions" });
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
        .where("platform", "==", "mercadolivre")
        .where("adId", "==", ad.adId)
        .get();

      const vinculoData = {
        userId,
        sku: ad.sku,
        platform: "mercadolivre" as const,
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

    return redirectEstoque(request, { integration: "ml_success", imported: String(importados) });
  } catch (error: any) {
    console.error("Erro interno no callback do Mercado Livre:", error);
    return redirectEstoque(request, {
      integration: "ml_error",
      message: error?.message || "Erro desconhecido na integração",
    });
  }
}
