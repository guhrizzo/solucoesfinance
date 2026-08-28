// lib/estoqueSync.ts
// Baixa de estoque central + propagação pros outros canais vinculados ao SKU.
// SOMENTE rotas de servidor (Admin SDK). Usado pelos webhooks do Mercado Livre
// e da Shopee — uma venda em QUALQUER canal baixa o SKU central e empurra a
// nova quantidade pros anúncios/itens dos demais canais.

import {
  isMockToken,
  getValidAccessToken,
  updateListingQuantity,
  type MlIntegracao,
} from "@/lib/mercadolivre";
import {
  getValidShopeeToken,
  updateShopeeStock,
  type ShopeeIntegracao,
} from "@/lib/shopee";

export interface OrigemVenda {
  platform: string;
  adId: string;
}

/**
 * Espelha `novaQuantidade` em todo vínculo do SKU (Firestore) e, pros canais
 * reais diferentes da origem, chama a API pra atualizar o anúncio/item.
 */
async function propagarEstoque(
  db: any,
  userId: string,
  sku: string,
  novaQuantidade: number,
  origem: OrigemVenda
): Promise<void> {
  const snapVinculos = await db
    .collection("vinculos")
    .where("userId", "==", userId)
    .where("sku", "==", sku)
    .get();

  for (const dv of snapVinculos.docs) {
    const vinculo = dv.data();

    // Espelha a quantidade em todo vínculo do SKU (inclusive o de origem).
    await db.collection("vinculos").doc(dv.id).update({ quantity: novaQuantidade, updatedAt: Date.now() });

    // Não precisa empurrar de volta pro anúncio que originou a venda.
    if (vinculo.platform === origem.platform && vinculo.adId === origem.adId) continue;
    if (!vinculo.connectionId) continue;

    try {
      const intSnap = await db.collection("integracoes").doc(vinculo.connectionId).get();
      if (!intSnap.exists) continue;
      const integracao = { id: intSnap.id, ...intSnap.data() } as (MlIntegracao & ShopeeIntegracao);
      if (isMockToken(integracao.accessToken)) continue;

      if (vinculo.platform === "mercadolivre") {
        const token = await getValidAccessToken(db, integracao);
        await updateListingQuantity(token, vinculo.adId, novaQuantidade);
        console.log(`[sync] ML anúncio ${vinculo.adId} → ${novaQuantidade} un`);
      } else if (vinculo.platform === "shopee") {
        const token = await getValidShopeeToken(db, integracao);
        await updateShopeeStock(token, integracao.accountId || "", vinculo.adId, novaQuantidade);
        console.log(`[sync] Shopee item ${vinculo.adId} → ${novaQuantidade} un`);
      }
    } catch (err) {
      console.error(`[sync] falha ao propagar estoque p/ ${vinculo.platform}:${vinculo.adId}:`, err);
    }
  }
}

/**
 * Baixa `quantitySold` do estoque central do SKU e propaga pros outros canais.
 * Retorna a nova quantidade, ou null se o SKU não existe no estoque central.
 */
export async function baixarEstoqueEPropagar(
  db: any,
  userId: string,
  sku: string,
  quantitySold: number,
  origem: OrigemVenda
): Promise<number | null> {
  const snapEstoque = await db
    .collection("estoque")
    .where("userId", "==", userId)
    .where("sku", "==", sku)
    .get();
  if (snapEstoque.empty) return null;

  const estoqueDoc = snapEstoque.docs[0];
  const atual = estoqueDoc.data().quantity || 0;
  const nova = Math.max(0, atual - Math.max(0, quantitySold || 0));

  await db.collection("estoque").doc(estoqueDoc.id).update({ quantity: nova, updatedAt: Date.now() });
  await propagarEstoque(db, userId, sku, nova, origem);
  return nova;
}
