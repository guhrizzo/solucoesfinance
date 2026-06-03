import { NextResponse } from "next/server";

// Função para atualizar estoque nas plataformas vinculadas
async function sincronizarEstoquePlataformas(db: any, userId: string, sku: string, novaQuantidade: number, platformOrigin: string, adIdOrigin: string) {
  const { collection, getDocs, query, where, doc, updateDoc } = await import("firebase/firestore");
  
  const vinculosRef = collection(db, "vinculos");
  const qVinculos = query(vinculosRef, where("userId", "==", userId), where("sku", "==", sku));
  const snapVinculos = await getDocs(qVinculos);

  for (const docVinculo of snapVinculos.docs) {
    const vinculo = docVinculo.data();
    
    // Não precisa atualizar o canal de onde veio a venda
    if (vinculo.platform === platformOrigin && vinculo.adId === adIdOrigin) {
      await updateDoc(doc(db, "vinculos", docVinculo.id), {
        quantity: novaQuantidade,
        updatedAt: Date.now()
      });
      continue;
    }

    console.log(`[Sincronização] SKU ${sku}: Sincronizando novo estoque (${novaQuantidade}) na plataforma ${vinculo.platform} para o anúncio ${vinculo.adId}`);

    // Atualiza a quantidade no vínculo
    await updateDoc(doc(db, "vinculos", docVinculo.id), {
      quantity: novaQuantidade,
      updatedAt: Date.now()
    });

    // Se for modo real, faria a chamada de API correspondente para a plataforma
    const integracoesRef = collection(db, "integracoes");
    const qIntegracao = query(
      integracoesRef,
      where("userId", "==", userId),
      where("platform", "==", vinculo.platform),
      where("id", "==", vinculo.connectionId || "")
    );
    const snapIntegracao = await getDocs(qIntegracao);

    if (!snapIntegracao.empty) {
      const integracao = snapIntegracao.docs[0].data();
      const accessToken = integracao.accessToken;

      if (vinculo.platform === "mercadolivre" && !accessToken.startsWith("mock_")) {
        try {
          await fetch(`https://api.mercadolibre.com/items/${vinculo.adId}`, {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              available_quantity: novaQuantidade
            })
          });
        } catch (err) {
          console.error(`Erro ao atualizar estoque real ML:`, err);
        }
      }
      // Outros canais (como a Shopee real) seriam adicionados aqui
    }
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("[Webhook Shopee] Recebido evento:", body);

    const { getFirebase } = await import("@/lib/firebase");
    const { db } = await getFirebase();
    const { collection, getDocs, query, where, doc, updateDoc } = await import("firebase/firestore");

    // Caso de simulação de venda disparada localmente
    if (body.mock === true) {
      const { adId, quantitySold, userId } = body;
      
      // Buscar o vínculo para descobrir o SKU
      const vinculosRef = collection(db, "vinculos");
      const qVinculo = query(vinculosRef, where("userId", "==", userId), where("platform", "==", "shopee"), where("adId", "==", adId));
      const snapVinculo = await getDocs(qVinculo);

      if (snapVinculo.empty) {
        return NextResponse.json({ error: "Vínculo não encontrado" }, { status: 404 });
      }

      const vinculo = snapVinculo.docs[0].data();
      const sku = vinculo.sku;

      // Buscar e atualizar o produto no estoque central
      const estoqueRef = collection(db, "estoque");
      const qEstoque = query(estoqueRef, where("userId", "==", userId), where("sku", "==", sku));
      const snapEstoque = await getDocs(qEstoque);

      if (snapEstoque.empty) {
        return NextResponse.json({ error: "Produto do estoque não encontrado" }, { status: 404 });
      }

      const estoqueDoc = snapEstoque.docs[0];
      const estoqueData = estoqueDoc.data();
      const novaQuantidade = Math.max(0, (estoqueData.quantity || 0) - quantitySold);

      // Atualiza o estoque central
      await updateDoc(doc(db, "estoque", estoqueDoc.id), {
        quantity: novaQuantidade,
        updatedAt: Date.now()
      });

      // Sincroniza com outros canais vinculados ao mesmo SKU (ex: Mercado Livre)
      await sincronizarEstoquePlataformas(db, userId, sku, novaQuantidade, "shopee", adId);

      return NextResponse.json({
        success: true,
        message: `Venda simulada processada. SKU ${sku} atualizado para quantidade ${novaQuantidade}.`
      });
    }

    // Fluxo Real da Shopee
    // O webhook da Shopee envia notificações de pedidos com o status de alteração (ex: code 3)
    if (body.code === 3 && body.data && body.data.ordersn) {
      const ordersn = body.data.ordersn;
      const shopId = String(body.shop_id);

      // 1. Achar a integração
      const integracoesRef = collection(db, "integracoes");
      const qIntegracao = query(integracoesRef, where("platform", "==", "shopee"), where("accountId", "==", shopId));
      const snapIntegracao = await getDocs(qIntegracao);

      if (snapIntegracao.empty) {
        return NextResponse.json({ error: "Integração Shopee correspondente não encontrada" }, { status: 200 });
      }

      const integracao = snapIntegracao.docs[0].data();
      const userId = integracao.userId;
      const accessToken = integracao.accessToken;

      // 2. Chamar a API da Shopee para pegar os detalhes do pedido e extrair o item_id e a quantidade
      // API v2 Shopee: /api/v2/order/get_order_detail
      // Requer assinatura. Mockaremos o fluxo de chamada de API se for token mockado
      if (accessToken.startsWith("mock_")) {
        return NextResponse.json({ received: true, note: "Token simulado, ignorando chamada API real" });
      }

      // Se for real, faria a requisição HTTP assinada para a API da Shopee:
      // (Seria semelhante ao fluxo de importação)
      // details = await fetchShopeeOrderDetail(ordersn, accessToken, shopId)
      // for item in details.items {
      //    adId = item.item_id
      //    quantitySold = item.model_quantity_purchased
      //    ...
      // }
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Erro no processamento do webhook da Shopee:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
