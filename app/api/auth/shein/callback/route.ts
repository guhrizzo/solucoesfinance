export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Troca de tempToken + importação produto a produto (loja grande = lento).
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  sheinCredentials,
  exchangeSheinToken,
  fetchSheinListings,
  type SheinListing,
} from "@/lib/shein";

const OAUTH_COOKIE = "shein_oauth";

function redirectEstoque(request: Request, params: Record<string, string>) {
  const url = new URL("/estoque", request.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = NextResponse.redirect(url);
  res.cookies.delete(OAUTH_COOKIE);
  return res;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tempToken = searchParams.get("tempToken");
  const returnedState = searchParams.get("state");
  const isMockParam = searchParams.get("mock") === "true";

  if (!tempToken) {
    return redirectEstoque(request, { integration: "shein_error", message: "tempToken ausente" });
  }

  const { configured } = sheinCredentials();
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
        integration: "shein_error",
        message: "Sessão de autorização expirada. Tente conectar novamente.",
      });
    }
    try {
      const parsed = JSON.parse(raw) as { s: string; u: string };
      if (returnedState && parsed.s && parsed.s !== returnedState) {
        return redirectEstoque(request, { integration: "shein_error", message: "Falha na verificação de segurança (state)" });
      }
      userId = parsed.u;
    } catch {
      return redirectEstoque(request, { integration: "shein_error", message: "Sessão de autorização inválida" });
    }
  }

  if (!userId) {
    return redirectEstoque(request, { integration: "shein_error", message: "Usuário não identificado" });
  }

  try {
    const db = await getAdminDb();

    let accountId = "998877";
    let accountName = "Loja Simulação Shein (Testes)";
    let openKeyId = "mock_openkeyid_shein";
    let secretKey = "mock_secretkey_shein";

    if (!isMock) {
      const auth = await exchangeSheinToken(tempToken);
      openKeyId = auth.openKeyId;
      secretKey = auth.secretKey;
      accountId = auth.supplierId;
      accountName = `Loja Shein ${auth.supplierId}`;
    }

    // ── Salvar/atualizar a integração (mesma coleção/campos do ML/Shopee/TikTok) ─
    const integracoesRef = db.collection("integracoes");
    const snapIntegracao = await integracoesRef
      .where("userId", "==", userId)
      .where("platform", "==", "shein")
      .where("accountId", "==", accountId)
      .get();

    const integracaoData = {
      userId,
      platform: "shein" as const,
      accountId,
      accountName,
      accessToken: openKeyId, // ver comentário no topo de lib/shein.ts
      refreshToken: secretKey,
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
    let listings: SheinListing[];
    if (isMock) {
      listings = [
        { adId: "I065MOCKA", sku: "SHEIN-I065MOCKA", title: "Produto Shein Simulação A", price: 49.9, quantity: 30 },
        { adId: "I065MOCKB", sku: "SHEIN-I065MOCKB", title: "Produto Shein Simulação B", price: 89.9, quantity: 12 },
      ];
    } else {
      try {
        listings = await fetchSheinListings(openKeyId, secretKey);
      } catch (err) {
        console.error("Erro ao importar produtos da Shein (permissão/limite?):", err);
        return redirectEstoque(request, { integration: "shein_success", warning: "limited_permissions" });
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
        .where("platform", "==", "shein")
        .where("adId", "==", ad.adId)
        .get();

      const vinculoData = {
        userId,
        sku: ad.sku,
        platform: "shein" as const,
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

    return redirectEstoque(request, { integration: "shein_success", imported: String(importados) });
  } catch (error: any) {
    console.error("Erro interno no callback da Shein:", error);
    return redirectEstoque(request, {
      integration: "shein_error",
      message: error?.message || "Erro desconhecido na integração",
    });
  }
}
