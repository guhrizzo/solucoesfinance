import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const userId = searchParams.get("state"); // O state contém o userId que passamos no redirect
  const isMockParam = searchParams.get("mock") === "true";

  if (!code || !userId) {
    return NextResponse.json({ error: "Parâmetros code e state são obrigatórios" }, { status: 400 });
  }

  const clientId = process.env.MERCADOLIVRE_CLIENT_ID;
  const clientSecret = process.env.MERCADOLIVRE_CLIENT_SECRET;
  const redirectUri = process.env.MERCADOLIVRE_REDIRECT_URI;

  const isMock = isMockParam || !clientId || clientId === "SEU_CLIENT_ID_AQUI";

  try {
    const { getFirebase } = await import("@/lib/firebase");
    const { db } = await getFirebase();
    const { collection, addDoc, getDocs, query, where, doc, setDoc } = await import("firebase/firestore");

    let accountId = "mock_ml_user_999";
    let accountName = "Loja Simulação Mercado Livre";
    let accessToken = "mock_access_token_ml";
    let refreshToken = "mock_refresh_token_ml";
    let expiresAt = Date.now() + 6 * 60 * 60 * 1000; // 6 horas

    if (!isMock) {
      // Modo Real: Troca o code por token real na API do Mercado Livre
      const tokenResponse = await fetch("https://api.mercadolibre.com/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: clientId || "",
          client_secret: clientSecret || "",
          code,
          redirect_uri: redirectUri || "",
        }),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json();
        console.error("Erro OAuth Mercado Livre:", errorData);
        return NextResponse.redirect(
          new URL(`/estoque?integration=ml_error&message=${encodeURIComponent(errorData.message || "Erro na autenticação")}`, request.url)
        );
      }

      const tokenData = await tokenResponse.json();
      accessToken = tokenData.access_token;
      refreshToken = tokenData.refresh_token;
      expiresAt = Date.now() + tokenData.expires_in * 1000;
      accountId = String(tokenData.user_id);

      // Busca dados básicos da conta integrada no Mercado Livre
      const userResponse = await fetch(`https://api.mercadolibre.com/users/${accountId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (userResponse.ok) {
        const userData = await userResponse.json();
        accountName = userData.nickname || userData.first_name || `Conta ML (${accountId})`;
      } else {
        accountName = `Conta ML (${accountId})`;
      }
    }

    // Salvar/Atualizar a integração na coleção `/integracoes`
    // Procurar se já existe essa integração para evitar duplicados
    const integracoesRef = collection(db, "integracoes");
    const qIntegracao = query(
      integracoesRef,
      where("userId", "==", userId),
      where("platform", "==", "mercadolivre"),
      where("accountId", "==", accountId)
    );
    const snapIntegracao = await getDocs(qIntegracao);

    let integrationId = "";
    const integracaoData = {
      userId,
      platform: "mercadolivre",
      accountId,
      accountName,
      accessToken,
      refreshToken,
      expiresAt,
      updatedAt: Date.now(),
    };

    if (!snapIntegracao.empty) {
      integrationId = snapIntegracao.docs[0].id;
      await setDoc(doc(db, "integracoes", integrationId), integracaoData, { merge: true });
    } else {
      const docRef = await addDoc(integracoesRef, {
        ...integracaoData,
        createdAt: Date.now(),
      });
      integrationId = docRef.id;
    }

    // Processo de importação e vínculo automático de produtos
    if (isMock) {
      // Cria produtos e vínculos mockados para simulação
      const mockAds = [
        { sku: "MLA-1001", title: "Fone de Ouvido Bluetooth SoundMax", price: 199.9, quantity: 45, adId: "MLB40001001" },
        { sku: "MLA-1002", title: "Teclado Mecânico RGB Gamer", price: 349.9, quantity: 12, adId: "MLB40001002" },
        { sku: "MLA-1003", title: "Mouse Sem Fio Office Slim", price: 89.9, quantity: 85, adId: "MLB40001003" },
      ];

      for (const ad of mockAds) {
        // 1. Verificar se o produto já existe no estoque central daquele usuário por SKU
        const estoqueRef = collection(db, "estoque");
        const qEstoque = query(estoqueRef, where("userId", "==", userId), where("sku", "==", ad.sku));
        const snapEstoque = await getDocs(qEstoque);

        if (snapEstoque.empty) {
          // Se não existe, cria o produto centralizado
          await addDoc(estoqueRef, {
            userId,
            sku: ad.sku,
            name: ad.title,
            price: ad.price,
            quantity: ad.quantity,
            minQuantity: 15, // Alerta padrão de estoque baixo
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }

        // 2. Criar ou atualizar o vínculo do anúncio com o SKU do estoque
        const vinculosRef = collection(db, "vinculos");
        const qVinculo = query(
          vinculosRef,
          where("userId", "==", userId),
          where("platform", "==", "mercadolivre"),
          where("adId", "==", ad.adId)
        );
        const snapVinculo = await getDocs(qVinculo);

        const vinculoData = {
          userId,
          sku: ad.sku,
          platform: "mercadolivre",
          adId: ad.adId,
          title: ad.title,
          price: ad.price,
          quantity: ad.quantity,
          connectionId: integrationId,
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
      }
    } else {
      // Modo Real: Buscar anúncios ativos da conta vinculada e criar vínculos automáticos
      // Vamos rodar a importação básica.
      // Em produção real, você listaria os anúncios do usuário via ML API `/users/${accountId}/items/search`
      // e depois buscaria os detalhes de cada um deles (`/items?ids=MLB123,MLB456`).
      // Criaremos uma importação leve aqui.
      try {
        const searchItemsRes = await fetch(`https://api.mercadolibre.com/users/${accountId}/items/search?status=active`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!searchItemsRes.ok) {
          console.error("Erro ao buscar itens do Mercado Livre:", {
            status: searchItemsRes.status,
            statusText: searchItemsRes.statusText,
          });
          
          // Se não conseguir buscar itens (permissão insuficiente), redireciona normalmente
          // Isso permite que o usuário continuar mesmo com limitações de API
          return NextResponse.redirect(new URL("/estoque?integration=ml_success&warning=limited_permissions", request.url));
        }

        const searchData = await searchItemsRes.json();
        const itemIds: string[] = searchData.results || [];

        if (itemIds.length > 0) {
          // ML API permite buscar até 20 itens em lote
          const batchIds = itemIds.slice(0, 20).join(",");
          const detailsRes = await fetch(`https://api.mercadolibre.com/items?ids=${batchIds}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });

          if (detailsRes.ok) {
            const itemsDetails = await detailsRes.json();

              for (const itemWrapper of itemsDetails) {
                if (itemWrapper.code === 200 && itemWrapper.body) {
                  const item = itemWrapper.body;
                  const adId = item.id;
                  const title = item.title;
                  const price = item.price;
                  const quantity = item.available_quantity;
                  // O SKU no Mercado Livre normalmente fica no campo "seller_custom_field" ou no atributo de SKU
                  let sku = item.seller_custom_field || "";

                  // Tenta achar SKU nos atributos técnicos (normalmente o atributo com ID 'SELLER_SKU')
                  if (!sku && item.attributes) {
                    const skuAttr = item.attributes.find((attr: any) => attr.id === "SELLER_SKU");
                    if (skuAttr) sku = skuAttr.value_name || skuAttr.value_id || "";
                  }

                  // Se o anúncio não tiver SKU definido, criamos um baseado no ID do anúncio
                  if (!sku) {
                    sku = `ML-${adId}`;
                  }

                  // Salvar ou vincular no estoque central
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
                  }

                  // Criar vínculo
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
                    quantity,
                    connectionId: integrationId,
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
                }
              }
            }
          }
      } catch (err) {
        console.error("Erro ao importar anúncios reais do ML:", err);
        // Não quebra a rota, apenas continua redirecionando
      }
    }

    // Redireciona de volta para a tela de estoque com parâmetro de sucesso
    return NextResponse.redirect(new URL("/estoque?integration=ml_success", request.url));
  } catch (error: any) {
    console.error("Erro interno no Callback do Mercado Livre:", error);
    return NextResponse.redirect(
      new URL(`/estoque?integration=ml_error&message=${encodeURIComponent(error.message || "Erro desconhecido")}`, request.url)
    );
  }
}
