import { NextResponse } from "next/server";
import crypto from "crypto";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const shopId = searchParams.get("shop_id");
  const userId = searchParams.get("state"); // O state contém o userId
  const isMockParam = searchParams.get("mock") === "true";

  if (!code || !shopId || !userId) {
    return NextResponse.json({ error: "Parâmetros code, shop_id e state são obrigatórios" }, { status: 400 });
  }

  const partnerId = process.env.SHOPEE_PARTNER_ID;
  const partnerKey = process.env.SHOPEE_PARTNER_KEY;

  const isMock = isMockParam || !partnerId || partnerId === "SEU_PARTNER_ID_AQUI";

  try {
    const { getFirebase } = await import("../../../../lib/firebase");
    const { db } = await getFirebase();
    const { collection, addDoc, getDocs, query, where, doc, setDoc } = await import("firebase/firestore");

    let accountId = shopId;
    let accountName = `Loja Shopee (${shopId})`;
    let accessToken = "mock_access_token_shopee";
    let refreshToken = "mock_refresh_token_shopee";
    let expiresAt = Date.now() + 4 * 60 * 60 * 1000; // 4 horas

    if (!isMock) {
      // Modo Real Shopee: Troca o code pelo token real na API da Shopee
      const path = "/api/v2/public/get_token_by_code";
      const timestamp = Math.floor(Date.now() / 1000);
      
      const body = {
        code,
        partner_id: Number(partnerId),
        shop_id: Number(shopId),
      };

      const signString = `${partnerId}${path}${timestamp}`;
      const sign = crypto
        .createHmac("sha256", partnerKey || "")
        .update(signString)
        .digest("hex");

      const tokenResponse = await fetch(`https://partner.shopeesz.com${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json();
        console.error("Erro OAuth Shopee:", errorData);
        return NextResponse.redirect(
          new URL(`/estoque?integration=shopee_error&message=${encodeURIComponent(errorData.message || "Erro na autenticação")}`, request.url)
        );
      }

      const tokenData = await tokenResponse.json();
      accessToken = tokenData.access_token;
      refreshToken = tokenData.refresh_token;
      expiresAt = Date.now() + tokenData.expires_in * 1000;
      accountId = String(tokenData.shop_id || shopId);
      accountName = `Loja Shopee ID ${accountId}`;
    } else {
      accountName = "Loja Simulação Shopee (Testes)";
    }

    // Salvar/Atualizar a integração na coleção `/integracoes`
    const integracoesRef = collection(db, "integracoes");
    const qIntegracao = query(
      integracoesRef,
      where("userId", "==", userId),
      where("platform", "==", "shopee"),
      where("accountId", "==", accountId)
    );
    const snapIntegracao = await getDocs(qIntegracao);

    let integrationId = "";
    const integracaoData = {
      userId,
      platform: "shopee",
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

    // Importação e Vínculo Automático
    if (isMock) {
      // Cria produtos e vínculos mockados da Shopee para simulação
      const mockAds = [
        // Fone Bluetooth SoundMax Pro tem o SKU MLA-1001, mesmo do fone do ML!
        { sku: "MLA-1001", title: "Fone Bluetooth SoundMax Pro", price: 189.9, quantity: 45, adId: "SHP90001001" },
        { sku: "SHP-2001", title: "Garrafa Térmica Inox 500ml", price: 59.9, quantity: 120, adId: "SHP90002001" },
        { sku: "SHP-2002", title: "Suporte Veicular Celular Articulado", price: 29.9, quantity: 8, adId: "SHP90002002" },
      ];

      for (const ad of mockAds) {
        // 1. Verificar se o produto já existe no estoque central por SKU
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
            minQuantity: 15,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        } else {
          // Se já existe (ex: Fone de ouvido MLA-1001 importado antes do Mercado Livre)
          // Nós mantemos a quantidade já cadastrada como central, mas podemos atualizar o preço médio
          // ou simplesmente manter o registro sem alterar a quantidade para garantir consistência.
        }

        // 2. Criar ou atualizar o vínculo do anúncio com o SKU do estoque
        const vinculosRef = collection(db, "vinculos");
        const qVinculo = query(
          vinculosRef,
          where("userId", "==", userId),
          where("platform", "==", "shopee"),
          where("adId", "==", ad.adId)
        );
        const snapVinculo = await getDocs(qVinculo);

        const vinculoData = {
          userId,
          sku: ad.sku,
          platform: "shopee",
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
      // Modo Real Shopee: Sincronizar anúncios reais.
      // Em produção real, você buscaria itens via `/api/v2/product/get_item_list`
      // e depois buscaria detalhes com `/api/v2/product/get_item_base_info`.
      // Implementaremos um esboço seguro.
      try {
        const pathList = "/api/v2/product/get_item_list";
        const timestampList = Math.floor(Date.now() / 1000);
        const signStringList = `${partnerId}${pathList}${timestampList}${accessToken}${shopId}`;
        const signList = crypto
          .createHmac("sha256", partnerKey || "")
          .update(signStringList)
          .digest("hex");

        const itemListRes = await fetch(
          `https://partner.shopeesz.com${pathList}?partner_id=${partnerId}&timestamp=${timestampList}&sign=${signList}&access_token=${accessToken}&shop_id=${shopId}&page_size=20&item_status=NORMAL`,
          { method: "GET" }
        );

        if (itemListRes.ok) {
          const itemListData = await itemListRes.json();
          const items = itemListData.response?.item || [];

          if (items.length > 0) {
            const itemIds = items.map((i: any) => i.item_id);
            const pathInfo = "/api/v2/product/get_item_base_info";
            const timestampInfo = Math.floor(Date.now() / 1000);
            const signStringInfo = `${partnerId}${pathInfo}${timestampInfo}${accessToken}${shopId}`;
            const signInfo = crypto
              .createHmac("sha256", partnerKey || "")
              .update(signStringInfo)
              .digest("hex");

            const infoRes = await fetch(
              `https://partner.shopeesz.com${pathInfo}?partner_id=${partnerId}&timestamp=${timestampInfo}&sign=${signInfo}&access_token=${accessToken}&shop_id=${shopId}&item_id_list=${itemIds.join(",")}`,
              { method: "GET" }
            );

            if (infoRes.ok) {
              const infoData = await infoRes.json();
              const itemsDetails = infoData.response?.item_list || [];

              for (const item of itemsDetails) {
                const adId = String(item.item_id);
                const title = item.item_name;
                const price = item.price_info?.[0]?.original_price || item.price_info?.[0]?.current_price || 0;
                const quantity = item.stock_info?.[0]?.normal_stock || 0;
                let sku = item.item_sku || "";

                if (!sku) {
                  sku = `SHP-${adId}`;
                }

                // Salvar/vincular no estoque central
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
                  where("platform", "==", "shopee"),
                  where("adId", "==", adId)
                );
                const snapVinculo = await getDocs(qVinculo);

                const vinculoData = {
                  userId,
                  sku,
                  platform: "shopee",
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
        console.error("Erro ao importar produtos da Shopee:", err);
      }
    }

    // Redireciona com sucesso
    return NextResponse.redirect(new URL("/estoque?integration=shopee_success", request.url));
  } catch (error: any) {
    console.error("Erro interno no Callback da Shopee:", error);
    return NextResponse.redirect(
      new URL(`/estoque?integration=shopee_error&message=${encodeURIComponent(error.message || "Erro desconhecido")}`, request.url)
    );
  }
}
