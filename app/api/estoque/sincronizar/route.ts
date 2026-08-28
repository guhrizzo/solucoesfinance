export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  isMockToken,
  getValidAccessToken,
  fetchActiveListings,
  updateListingQuantity,
  type MlIntegracao,
} from "@/lib/mercadolivre";
import {
  getValidShopeeToken,
  fetchShopeeListings,
  updateShopeeStock,
  type ShopeeIntegracao,
} from "@/lib/shopee";

// Cada chamada aqui pode disparar várias requisições à API do Mercado Livre
// (e grava no Firestore) sem exigir autenticação — sem limite, dava pra
// martelar a API do ML repetidamente (risco de a integração real do
// vendedor ser limitada/bloqueada pela própria plataforma).
const RATE_LIMIT = { windowMs: 5 * 60 * 1000, max: 5 }; // 5 sincronizações / 5 min por IP+userId

export async function POST(request: Request) {
  try {
    const { userId, platform } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "userId é obrigatório" }, { status: 400 });
    }

    const { limited, retryAfterSec } = checkRateLimit(
      `estoque-sync:${getClientIp(request)}:${userId}`,
      RATE_LIMIT
    );
    if (limited) {
      return NextResponse.json(
        { error: "Muitas sincronizações em pouco tempo. Aguarde alguns minutos e tente novamente." },
        { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
      );
    }

    const db = await getAdminDb();

    const integracoesRef = db.collection("integracoes");
    const snapIntegracoes = platform
      ? await integracoesRef.where("userId", "==", userId).where("platform", "==", platform).get()
      : await integracoesRef.where("userId", "==", userId).get();

    if (snapIntegracoes.empty) {
      return NextResponse.json({ success: true, message: "Nenhuma integração encontrada para sincronizar." });
    }

    let totalSincronizados = 0;
    const erros: string[] = [];

    for (const docInt of snapIntegracoes.docs) {
      const integracao = { id: docInt.id, ...docInt.data() } as MlIntegracao & { platform: string };

      // ── Modo simulado: só espelha o estoque central nos vínculos ──────────
      if (isMockToken(integracao.accessToken)) {
        const snapVinculos = await db
          .collection("vinculos")
          .where("userId", "==", userId)
          .where("platform", "==", integracao.platform)
          .get();
        for (const dv of snapVinculos.docs) {
          const vinculo = dv.data();
          const snapEstoque = await db
            .collection("estoque")
            .where("userId", "==", userId)
            .where("sku", "==", vinculo.sku)
            .get();
          if (!snapEstoque.empty) {
            const e = snapEstoque.docs[0].data();
            await db.collection("vinculos").doc(dv.id).update({
              quantity: e.quantity,
              price: e.price,
              updatedAt: Date.now(),
            });
            totalSincronizados++;
          }
        }
        continue;
      }

      // ── Mercado Livre real ───────────────────────────────────────────────
      if (integracao.platform === "mercadolivre") {
        try {
          const token = await getValidAccessToken(db, integracao);
          const listings = await fetchActiveListings(token, integracao.accountId || "");

          for (const ad of listings) {
            const snapEstoque = await db
              .collection("estoque")
              .where("userId", "==", userId)
              .where("sku", "==", ad.sku)
              .get();

            // Fonte da verdade = estoque central (quando o produto já existe aqui).
            let quantidadeFinal = ad.quantity;
            let precoFinal = ad.price;

            if (snapEstoque.empty) {
              await db.collection("estoque").add({
                userId,
                sku: ad.sku,
                name: ad.title,
                price: ad.price,
                quantity: ad.quantity,
                minQuantity: 10,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              });
            } else {
              const e = snapEstoque.docs[0].data();
              quantidadeFinal = e.quantity ?? ad.quantity;
              precoFinal = e.price ?? ad.price;

              // Empurra o estoque central de volta pro anúncio se divergir.
              if (typeof e.quantity === "number" && e.quantity !== ad.quantity) {
                try {
                  await updateListingQuantity(token, ad.adId, e.quantity);
                } catch (err: any) {
                  erros.push(`Anúncio ${ad.adId}: ${err?.message || "erro ao atualizar"}`);
                }
              }
            }

            const snapVinculo = await db
              .collection("vinculos")
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
              price: precoFinal,
              quantity: quantidadeFinal,
              connectionId: docInt.id,
              updatedAt: Date.now(),
            };

            if (!snapVinculo.empty) {
              await db.collection("vinculos").doc(snapVinculo.docs[0].id).set(vinculoData, { merge: true });
            } else {
              await db.collection("vinculos").add({ ...vinculoData, createdAt: Date.now() });
            }
            totalSincronizados++;
          }
        } catch (err: any) {
          console.error("Erro na sincronização real do Mercado Livre:", err);
          erros.push(err?.message || "Falha ao sincronizar com o Mercado Livre");
        }
      }
      // ── Shopee real ──────────────────────────────────────────────────────
      if (integracao.platform === "shopee") {
        try {
          const token = await getValidShopeeToken(db, integracao as ShopeeIntegracao);
          const listings = await fetchShopeeListings(token, integracao.accountId || "");

          for (const ad of listings) {
            const snapEstoque = await db
              .collection("estoque")
              .where("userId", "==", userId)
              .where("sku", "==", ad.sku)
              .get();

            // Fonte da verdade = estoque central (quando o produto já existe aqui).
            let quantidadeFinal = ad.quantity;
            let precoFinal = ad.price;

            if (snapEstoque.empty) {
              await db.collection("estoque").add({
                userId,
                sku: ad.sku,
                name: ad.title,
                price: ad.price,
                quantity: ad.quantity,
                minQuantity: 10,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              });
            } else {
              const e = snapEstoque.docs[0].data();
              quantidadeFinal = e.quantity ?? ad.quantity;
              precoFinal = e.price ?? ad.price;

              // Empurra o estoque central de volta pro item se divergir.
              if (typeof e.quantity === "number" && e.quantity !== ad.quantity) {
                try {
                  await updateShopeeStock(token, integracao.accountId || "", ad.adId, e.quantity);
                } catch (err: any) {
                  erros.push(`Item ${ad.adId}: ${err?.message || "erro ao atualizar"}`);
                }
              }
            }

            const snapVinculo = await db
              .collection("vinculos")
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
              price: precoFinal,
              quantity: quantidadeFinal,
              connectionId: docInt.id,
              updatedAt: Date.now(),
            };

            if (!snapVinculo.empty) {
              await db.collection("vinculos").doc(snapVinculo.docs[0].id).set(vinculoData, { merge: true });
            } else {
              await db.collection("vinculos").add({ ...vinculoData, createdAt: Date.now() });
            }
            totalSincronizados++;
          }
        } catch (err: any) {
          console.error("Erro na sincronização real da Shopee:", err);
          erros.push(err?.message || "Falha ao sincronizar com a Shopee");
        }
      }
    }

    return NextResponse.json({
      success: true,
      message:
        erros.length > 0
          ? `Sincronização parcial: ${totalSincronizados} anúncio(s). ${erros.length} aviso(s).`
          : `Sincronização concluída: ${totalSincronizados} anúncio(s).`,
      totalSincronizados,
      erros: erros.slice(0, 10),
    });
  } catch (error: any) {
    console.error("Erro na rota de sincronização manual:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
