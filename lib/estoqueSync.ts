// lib/estoqueSync.ts
// Baixa de estoque central + propagação pros outros canais vinculados ao SKU.
// SOMENTE rotas de servidor (Admin SDK). Usado pelos webhooks do Mercado Livre
// e da Shopee — uma venda em QUALQUER canal baixa o SKU central e empurra a
// nova quantidade pros anúncios/itens dos demais canais.

import {
  isMockToken,
  getValidAccessToken,
  updateListingQuantity,
  fetchActiveListings,
  fetchItem,
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
 * Define a quantidade ABSOLUTA do SKU no estoque central (e o preço, se mudou)
 * e propaga pros outros canais. Diferente de `baixarEstoqueEPropagar`, que
 * subtrai. Usado quando o canal é a fonte da verdade: edição manual do anúncio
 * (webhook `items`) ou botão "Puxar do Mercado Livre".
 *
 * Guarda anti-eco: se a quantidade já bate com a central e o preço não mudou,
 * não faz nada (`mudou: false`) — evita loop quando a notificação `items` é só
 * o reflexo de um push que nós mesmos acabamos de fazer.
 *
 * Retorna `null` se o SKU não tem item no estoque central.
 */
export async function definirEstoqueEPropagar(
  db: any,
  userId: string,
  sku: string,
  novaQuantidade: number,
  origem: OrigemVenda,
  opts?: { price?: number }
): Promise<{ mudou: boolean; quantidade: number } | null> {
  const snapEstoque = await db
    .collection("estoque")
    .where("userId", "==", userId)
    .where("sku", "==", sku)
    .get();
  if (snapEstoque.empty) return null;

  const estoqueDoc = snapEstoque.docs[0];
  const dados = estoqueDoc.data();
  const atual = dados.quantity || 0;
  const q = Math.max(0, Math.floor(novaQuantidade || 0));
  const precoMudou =
    typeof opts?.price === "number" && Math.abs((dados.price || 0) - opts.price) > 0.001;

  if (q === atual && !precoMudou) return { mudou: false, quantidade: atual };

  const patch: Record<string, any> = { quantity: q, updatedAt: Date.now() };
  if (precoMudou) patch.price = opts!.price;
  await db.collection("estoque").doc(estoqueDoc.id).update(patch);

  await propagarEstoque(db, userId, sku, q, origem);
  return { mudou: true, quantidade: q };
}

/**
 * "Puxar do Mercado Livre": lê os anúncios ATIVOS da conta e joga o estoque +
 * preço deles pro estoque central (ML manda), propagando pros outros canais.
 * Também reconcilia: vínculo de anúncio que sumiu do ML (404) é removido.
 *
 * Retorna um resumo pra UI. NÃO lança — acumula avisos.
 */
export async function puxarCanalMercadoLivre(
  db: any,
  userId: string,
  integracao: MlIntegracao
): Promise<{ atualizados: number; semMudanca: number; vinculosRemovidos: string[]; avisos: string[] }> {
  const avisos: string[] = [];
  const vinculosRemovidos: string[] = [];
  let atualizados = 0;
  let semMudanca = 0;

  const token = await getValidAccessToken(db, integracao);
  const listings = await fetchActiveListings(token, integracao.accountId || "");
  const ativos = new Set(listings.map((l) => l.adId));

  for (const ad of listings) {
    const snapEstoque = await db
      .collection("estoque")
      .where("userId", "==", userId)
      .where("sku", "==", ad.sku)
      .get();

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
      atualizados++;
    } else {
      const r = await definirEstoqueEPropagar(
        db,
        userId,
        ad.sku,
        ad.quantity,
        { platform: "mercadolivre", adId: ad.adId },
        { price: ad.price }
      );
      if (r?.mudou) atualizados++;
      else semMudanca++;
    }

    // upsert do vínculo (espelho local do anúncio)
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
      price: ad.price,
      quantity: ad.quantity,
      connectionId: integracao.id,
      updatedAt: Date.now(),
    };
    if (!snapVinculo.empty) {
      await db.collection("vinculos").doc(snapVinculo.docs[0].id).set(vinculoData, { merge: true });
    } else {
      await db.collection("vinculos").add({ ...vinculoData, createdAt: Date.now() });
    }
  }

  // Reconcile: vínculo ML de anúncio que não está mais ativo. Só remove se o
  // anúncio realmente sumiu (404) — anúncio pausado continua existindo.
  const snapTodos = await db
    .collection("vinculos")
    .where("userId", "==", userId)
    .where("platform", "==", "mercadolivre")
    .get();
  for (const dv of snapTodos.docs) {
    const adId = dv.data().adId as string;
    if (ativos.has(adId)) continue;
    try {
      const existe = await fetchItem(token, adId);
      if (existe === null) {
        await db.collection("vinculos").doc(dv.id).delete();
        vinculosRemovidos.push(adId);
      }
    } catch (err: any) {
      avisos.push(`Não deu pra checar o anúncio ${adId}: ${err?.message || "erro"}`);
    }
  }

  return { atualizados, semMudanca, vinculosRemovidos, avisos };
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
