import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

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

    const { getFirebase } = await import("@/lib/firebase");
    const { db } = await getFirebase();
    const { collection, getDocs, query, where, doc, updateDoc, addDoc, setDoc } = await import("firebase/firestore");

    // Buscar as conexões/integrações do usuário
    const integracoesRef = collection(db, "integracoes");
    let qIntegracoes = query(integracoesRef, where("userId", "==", userId));
    if (platform) {
      qIntegracoes = query(integracoesRef, where("userId", "==", userId), where("platform", "==", platform));
    }
    const snapIntegracoes = await getDocs(qIntegracoes);

    if (snapIntegracoes.empty) {
      return NextResponse.json({ success: true, message: "Nenhuma integração encontrada para sincronizar." });
    }

    let totalSincronizados = 0;

    for (const docInt of snapIntegracoes.docs) {
      const integracao = docInt.data();
      const isMock = integracao.accessToken.startsWith("mock_");

      if (isMock) {
        // Simular a sincronização de dados fictícios para fins demonstrativos
        const vinculosRef = collection(db, "vinculos");
        const qVinculos = query(
          vinculosRef,
          where("userId", "==", userId),
          where("platform", "==", integracao.platform)
        );
        const snapVinculos = await getDocs(qVinculos);

        for (const docVinculo of snapVinculos.docs) {
          const vinculo = docVinculo.data();
          
          // Buscar o item no estoque central correspondente
          const estoqueRef = collection(db, "estoque");
          const qEstoque = query(estoqueRef, where("userId", "==", userId), where("sku", "==", vinculo.sku));
          const snapEstoque = await getDocs(qEstoque);

          if (!snapEstoque.empty) {
            const estoqueDoc = snapEstoque.docs[0];
            const estoqueData = estoqueDoc.data();
            
            // Na simulação, sincronizamos as quantidades do vínculo com as do estoque central
            await updateDoc(doc(db, "vinculos", docVinculo.id), {
              quantity: estoqueData.quantity,
              price: estoqueData.price,
              updatedAt: Date.now(),
            });
            totalSincronizados++;
          }
        }
      } else {
        // Integração real
        if (integracao.platform === "mercadolivre") {
          // Busca anúncios ativos do ML e atualiza/vincula no Firestore
          try {
            const searchItemsRes = await fetch(
              `https://api.mercadolibre.com/users/${integracao.accountId}/items/search?status=active`,
              { headers: { Authorization: `Bearer ${integracao.accessToken}` } }
            );

            if (searchItemsRes.ok) {
              const searchData = await searchItemsRes.json();
              const itemIds: string[] = searchData.results || [];

              if (itemIds.length > 0) {
                const batchIds = itemIds.slice(0, 20).join(",");
                const detailsRes = await fetch(
                  `https://api.mercadolibre.com/items?ids=${batchIds}`,
                  { headers: { Authorization: `Bearer ${integracao.accessToken}` } }
                );

                if (detailsRes.ok) {
                  const itemsDetails = await detailsRes.json();

                  for (const itemWrapper of itemsDetails) {
                    if (itemWrapper.code === 200 && itemWrapper.body) {
                      const item = itemWrapper.body;
                      const adId = item.id;
                      const title = item.title;
                      const price = item.price;
                      const quantity = item.available_quantity;
                      let sku = item.seller_custom_field || "";

                      if (!sku && item.attributes) {
                        const skuAttr = item.attributes.find((attr: any) => attr.id === "SELLER_SKU");
                        if (skuAttr) sku = skuAttr.value_name || skuAttr.value_id || "";
                      }

                      if (!sku) sku = `ML-${adId}`;

                      // Sincronizar estoque central
                      const estoqueRef = collection(db, "estoque");
                      const qEstoque = query(estoqueRef, where("userId", "==", userId), where("sku", "==", sku));
                      const snapEstoque = await getDocs(qEstoque);

                      if (snapEstoque.empty) {
                        await addDoc(estoqueRef, {
                          userId,
                          sku,
                          name: title,
                          price,
                          quantity,
                          minQuantity: 10,
                          createdAt: Date.now(),
                          updatedAt: Date.now(),
                        });
                      } else {
                        // Sincronizar o anúncio com o estoque central do sistema
                        const estoqueDoc = snapEstoque.docs[0];
                        const estoqueData = estoqueDoc.data();
                        
                        // Atualizar a quantidade no Mercado Livre com o estoque centralizado do Firestore
                        if (estoqueData.quantity !== quantity) {
                          await fetch(`https://api.mercadolibre.com/items/${adId}`, {
                            method: "PUT",
                            headers: {
                              Authorization: `Bearer ${integracao.accessToken}`,
                              "Content-Type": "application/json",
                            },
                            body: JSON.stringify({ available_quantity: estoqueData.quantity })
                          });
                        }
                      }

                      // Atualizar vínculo no banco
                      const vinculosRef = collection(db, "vinculos");
                      const qVinculo = query(
                        vinculosRef,
                        where("userId", "==", userId),
                        where("platform", "==", "mercadolivre"),
                        where("adId", "==", adId)
                      );
                      const snapVinculo = await getDocs(qVinculo);

                      const vinculoData = {
                        userId,
                        sku,
                        platform: "mercadolivre",
                        adId,
                        title,
                        price,
                        quantity: snapEstoque.empty ? quantity : snapEstoque.docs[0].data().quantity,
                        connectionId: docInt.id,
                        updatedAt: Date.now(),
                      };

                      if (!snapVinculo.empty) {
                        await setDoc(doc(db, "vinculos", snapVinculo.docs[0].id), vinculoData, { merge: true });
                      } else {
                        await addDoc(vinculosRef, {
                          ...vinculoData,
                          createdAt: Date.now(),
                        });
                      }
                      totalSincronizados++;
                    }
                  }
                }
              }
            }
          } catch (err) {
            console.error("Erro na sincronização real do Mercado Livre:", err);
          }
        } else if (integracao.platform === "shopee") {
          // Implementação semelhante para Shopee real...
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: "Sincronização realizada com sucesso.",
      totalSincronizados,
    });
  } catch (error: any) {
    console.error("Erro na rota de sincronização manual:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
