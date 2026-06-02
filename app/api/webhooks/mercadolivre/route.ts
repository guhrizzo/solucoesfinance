import { NextResponse } from "next/server";

// Função para atualizar estoque nas plataformas vinculadas
async function sincronizarEstoquePlataformas(db: any, userId: string, sku: string, novaQuantidade: number, platformOrigin: string, adIdOrigin: string) {
  const { collection, getDocs, query, where, doc, updateDoc } = await import("firebase/firestore");
  
  const vinculosRef = collection(db, "vinculos");
  const qVinculos = query(vinculosRef, where("userId", "==", userId), where("sku", "==", sku));
  const snapVinculos = await getDocs(qVinculos);

  for (const docVinculo of snapVinculos.docs) {
    const vinculo = docVinculo.data();
    
    // Não precisa atualizar a própria plataforma/anúncio de onde veio a venda
    if (vinculo.platform === platformOrigin && vinculo.adId === adIdOrigin) {
      // Mas atualizamos a quantidade localmente registrada no vínculo para manter coerência
      await updateDoc(doc(db, "vinculos", docVinculo.id), {
        quantity: novaQuantidade,
        updatedAt: Date.now()
      });
      continue;
    }

    console.log(`[Sincronização] SKU ${sku}: Sincronizando novo estoque (${novaQuantidade}) na plataforma ${vinculo.platform} para o anúncio ${vinculo.adId}`);

    // Atualiza a quantidade registrada no vínculo
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
        // Chamada real Mercado Livre para atualizar estoque
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
          console.error(`Erro ao atualizar estoque real ML do anúncio ${vinculo.adId}:`, err);
        }
      } else if (vinculo.platform === "shopee" && !accessToken.startsWith("mock_")) {
        // Chamada real Shopee para atualizar estoque (API v2 /api/v2/product/update_stock)
        // Requer assinaturas, etc. Implementação real seria aqui.
      }
    }
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("[Webhook Mercado Livre] Recebido evento:", body);

    const { getFirebase } = await import("../../../../lib/firebase");
    const { db } = await getFirebase();
    const { collection, getDocs, query, where, doc, updateDoc, increment } = await import("firebase/firestore");

    // Caso de simulação de venda disparada localmente pelo painel de teste
    if (body.mock === true) {
      const { adId, quantitySold, userId } = body;
      
      // Buscar o vínculo para descobrir o SKU
      const vinculosRef = collection(db, "vinculos");
      const qVinculo = query(vinculosRef, where("userId", "==", userId), where("platform", "==", "mercadolivre"), where("adId", "==", adId));
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

      // Sincroniza com outros canais vinculados ao mesmo SKU (ex: Shopee)
      await sincronizarEstoquePlataformas(db, userId, sku, novaQuantidade, "mercadolivre", adId);

      return NextResponse.json({
        success: true,
        message: `Venda simulada processada. SKU ${sku} atualizado para quantidade ${novaQuantidade}.`
      });
    }

    // Fluxo Real do Mercado Livre Webhook
    // O Mercado Livre envia o tópico "orders" e o recurso "/orders/ID"
    if (body.topic === "orders" && body.resource) {
      const resourceId = body.resource.split("/").pop(); // Extrai o ID do pedido
      const mlUserId = String(body.user_id);

      // 1. Achar a integração correspondente
      const integracoesRef = collection(db, "integracoes");
      const qIntegracao = query(integracoesRef, where("platform", "==", "mercadolivre"), where("accountId", "==", mlUserId));
      const snapIntegracao = await getDocs(qIntegracao);

      if (snapIntegracao.empty) {
        return NextResponse.json({ error: "Integração correspondente não encontrada no Firestore" }, { status: 200 });
      }

      const integracaoDoc = snapIntegracao.docs[0];
      const integracao = integracaoDoc.data();
      const userId = integracao.userId;
      const accessToken = integracao.accessToken;

      // 2. Buscar detalhes do pedido no Mercado Livre
      const orderResponse = await fetch(`https://api.mercadolibre.com${body.resource}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!orderResponse.ok) {
        console.error(`Erro ao obter pedido ${resourceId} no ML:`, await orderResponse.text());
        return NextResponse.json({ error: "Erro ao buscar detalhes do pedido na API" }, { status: 500 });
      }

      const orderData = await orderResponse.json();
      const items = orderData.order_items || [];

      for (const orderItem of items) {
        const adId = orderItem.item.id;
        const quantitySold = orderItem.quantity || 1;

        // 3. Buscar vínculo do anúncio
        const vinculosRef = collection(db, "vinculos");
        const qVinculo = query(vinculosRef, where("userId", "==", userId), where("platform", "==", "mercadolivre"), where("adId", "==", adId));
        const snapVinculo = await getDocs(qVinculo);

        if (!snapVinculo.empty) {
          const vinculo = snapVinculo.docs[0].data();
          const sku = vinculo.sku;

          // 4. Buscar e atualizar produto no estoque central
          const estoqueRef = collection(db, "estoque");
          const qEstoque = query(estoqueRef, where("userId", "==", userId), where("sku", "==", sku));
          const snapEstoque = await getDocs(qEstoque);

          if (!snapEstoque.empty) {
            const estoqueDoc = snapEstoque.docs[0];
            const estoqueData = estoqueDoc.data();
            const novaQuantidade = Math.max(0, (estoqueData.quantity || 0) - quantitySold);

            // Atualiza estoque central
            await updateDoc(doc(db, "estoque", estoqueDoc.id), {
              quantity: novaQuantidade,
              updatedAt: Date.now()
            });

            // Sincroniza com as outras plataformas
            await sincronizarEstoquePlataformas(db, userId, sku, novaQuantidade, "mercadolivre", adId);
          }
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Erro no processamento do webhook do Mercado Livre:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
