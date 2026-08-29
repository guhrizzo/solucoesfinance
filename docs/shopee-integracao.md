# Integração Shopee — aba Estoque

Mesma arquitetura do Mercado Livre: **itens da Shopee → estoque central (Firestore) →
sincroniza de volta pra todos os canais**. Uma venda em qualquer canal baixa o SKU central
e empurra a nova quantidade pros demais anúncios/itens. Cada venda também vira uma
**entrada no Fluxo de Caixa** (`category: "Vendas"`, ver `lib/vendas.ts` e o painel `/vendas`).

## Arquivos

| Arquivo | Papel |
|---|---|
| `lib/shopee.ts` | Assinatura HMAC, URL de auth, troca/refresh de token, listagem de itens, push de estoque, detalhe de pedido, validação do push |
| `lib/estoqueSync.ts` | Baixa de estoque central + propagação multi-canal (ML + Shopee) — compartilhado pelos dois webhooks |
| `app/api/auth/shopee/redirect/route.ts` | Inicia o OAuth (gera `state`, grava cookie `shopee_oauth`, redireciona pra Shopee) |
| `app/api/auth/shopee/callback/route.ts` | Troca `code` por token, salva integração, importa itens |
| `app/api/webhooks/shopee/route.ts` | Recebe push de pedido (`code: 3`), baixa e propaga o estoque, lança a venda no caixa |
| `app/api/estoque/sincronizar/route.ts` | Sincronização manual (botão de refresh na tabela) — trata ML e Shopee |
| `app/api/shopee/repasse/route.ts` | Resumo de estoque Shopee (itens/unidades) + **valor líquido a receber** (escrow) |

## Fluxo de autorização (Shopee Open Platform — Developer Guide)

Ref.: <https://open.shopee.com/developer-guide/4> (Authorization). Resumo mapeado pro código:

| Passo do guia | Onde no código | Detalhe |
|---|---|---|
| **1. Gerar link de autorização** (`GET /api/v2/shop/auth_partner`) | `buildShopeeAuthUrl` em `lib/shopee.ts` | `sign = HMAC-SHA256(partner_id + path + timestamp, partner_key)` (base **pública**, sem token). Query: `partner_id`, `timestamp`, `sign`, `redirect`. |
| **2. Vendedor autoriza e volta** | `app/api/auth/shopee/callback/route.ts` | A Shopee redireciona pro `redirect` com `?code=...&shop_id=...` (ou `&main_account_id=` no fluxo merchant). O `state` (CSRF) viaja dentro do `redirect` + cookie `shopee_oauth`. |
| **3. Trocar `code` por token** (`POST /api/v2/auth/token/get`) | `exchangeShopeeToken` | Body: `{ code, shop_id, partner_id }`. Assinatura **pública**. Resposta: `access_token`, `refresh_token`, `expire_in` (~14400s = 4h). |
| **4. Renovar token** (`POST /api/v2/auth/access_token/get`) | `refreshShopeeToken` / `getValidShopeeToken` | Body: `{ refresh_token, shop_id, partner_id }`. `refresh_token` vale ~30 dias e **a Shopee devolve um novo a cada refresh** — persistimos o novo no Firestore. Renova quando falta < 10 min. |
| **Assinar chamadas de loja** | `shopSignedUrl` | `sign = HMAC-SHA256(partner_id + path + timestamp + access_token + shop_id, partner_key)`. Query: `partner_id`, `timestamp`, `access_token`, `shop_id`, `sign` + params da chamada. |
| **Host** | `shopeeHost()` | Produção `partner.shopeemobile.com` · Sandbox `partner.test-stable.shopeemobile.com` (`SHOPEE_SANDBOX="true"`). Cada ambiente tem seu próprio partner_id/key e loja. |

> ⚠️ **Auth só shop-level.** O callback trata `shop_id`. Contas que gerenciam várias lojas
> (merchant/`main_account_id`) precisam de um passo extra pra listar as `shop_id` da conta
> (`/api/v2/merchant/get_merchant_shop_list`) — ainda não implementado.

## O que configurar no console da Shopee

<https://open.shopee.com> → Console → sua **App** (é preciso ter conta de desenvolvedor aprovada).

1. **Partner ID / Partner Key** — copie os dois pro `.env.local`.

2. **Redirect URL** — cadastre **exatamente**:
   ```
   https://nexusfi.com.br/api/auth/shopee/callback
   ```
   Qualquer diferença (barra final, http/https, subdomínio) → erro de autenticação.

3. **Permissões / escopos da App** — habilite pelo menos:
   - `Shop` (get_shop_info)
   - `Product` (get_item_list, get_item_base_info, update_stock)
   - `Order` (get_order_detail, get_order_list)
   - `Payment` (get_escrow_detail, get_escrow_list) — para o valor líquido a receber

4. **Push (webhooks)** — na aba de Push Configuration:
   - Push URL:
     ```
     https://nexusfi.com.br/api/webhooks/shopee
     ```
   - Marque o evento **`Order Status Push` (code 3)**.
   - A validação usa `HMAC-SHA256(url + "|" + body, partner_key)` no header `Authorization`
     — a `partner_key` já cobre isso, não há segredo separado.

5. **Ambiente** — a Shopee tem host separado pra testes:
   - Produção: `partner.shopeemobile.com`
   - Sandbox: `partner.test-stable.shopeemobile.com` → ligue `SHOPEE_SANDBOX="true"`.
   Cada ambiente tem seu próprio Partner ID/Key e sua própria loja.

## Variáveis de ambiente (`.env.local` / envs do deploy)

```env
SHOPEE_PARTNER_ID="..."          # Partner ID do console
SHOPEE_PARTNER_KEY="..."         # Partner Key do console
SHOPEE_REDIRECT_URI="https://nexusfi.com.br/api/auth/shopee/callback"
SHOPEE_SANDBOX=""                # "true" = host de testes; vazio = produção
SHOPEE_PUSH_STRICT=""            # deixe vazio até ver "assinatura valid" no log; depois "true"
```

> Sem `SHOPEE_PARTNER_ID`/`KEY` (ou com os placeholders) a integração cai em **modo simulado
> (mock)** automaticamente — cria 3 itens fake pra testar a UI e o simulador de vendas.

## Como testar em produção

1. Deploy com as envs acima.
2. Estoque → **Integrações** → **Conectar Conta** no card da Shopee.
3. Autoriza na Shopee → volta pra `/estoque?integration=shopee_success&imported=N`.
4. Confere se os itens ativos viraram produtos + vínculos na tabela.
5. Faz (ou simula) uma venda → o webhook baixa o SKU central e atualiza os outros canais.
   Log do servidor: `[sync] Shopee item ... → N un`.
6. Botão de **refresh** na tabela = sincronização manual (`/api/estoque/sincronizar`).
7. Confere a venda como entrada em **Fluxo de Caixa** e no **Painel de Vendas**.

### Validar a assinatura do push

Deixe `SHOPEE_PUSH_STRICT` vazio no começo. Nos logs vai aparecer
`[Shopee push] assinatura valid|invalid`. Quando estiver saindo `valid` de forma
consistente, ligue `SHOPEE_PUSH_STRICT="true"` pra rejeitar chamadas forjadas.

## Estoque cadastrado + valor líquido a receber

`GET /api/shopee/repasse?userId=<ownerUid>` devolve:

```jsonc
{
  "configured": true,          // false = mock ou sem loja conectada
  "mock": false,
  "estoque": { "itens": 12, "unidades": 340, "skus": 11 },  // dos vínculos platform=shopee
  "repasse": {
    "pendente": 3240.55,       // escrow de pedidos pagos ainda NÃO liberados (a receber)
    "liberado": 8110.00,       // escrow já repassado nos últimos 60 dias
    "taxas": 1920.30,          // comissão + serviço + transação + frete da loja
    "pedidosLidos": 47,
    "truncado": false          // true = varredura bateu no teto (120 pedidos)
  }
}
```

- **Real**: `fetchShopeePayoutSummary` (lib/shopee.ts):
  - **liberado** = `get_escrow_list` (`release_time_from`/`release_time_to`, janelas de 15 dias,
    `page_size` 100, `page_no`) — soma de `payout_amount`. 1 chamada paginada, barata.
  - **pendente** (líquido a receber) = `get_order_list` últimos 30 dias, status
    `READY_TO_SHIP/PROCESSED/SHIPPED/TO_CONFIRM_RECEIVE`, + `get_escrow_detail` por pedido
    (teto de 80 pra não estourar o tempo da função). `taxas` sai desse conjunto.
  - Precisa do escopo **`Payment`** habilitado no app.
  - ⚠️ `get_escrow_detail` de pedido ainda não concluído devolve projeção — pode divergir
    um pouco do repasse final se houver reembolso/ajuste.
- **Mock**: estima o líquido a partir das vendas Shopee já lançadas no caixa
  (taxa média fixa de 18%; < 14 dias = pendente, resto = liberado).
- Exibido em **Estoque** (painel "Shopee — estoque e repasse", botão *Atualizar*) e no
  **Painel de Vendas** (bloco "Vendas por canal").
- A rota é rate-limited (6 chamadas/min por IP+usuário) porque dispara dezenas de
  requisições à Shopee.

## Taxas da venda no Fluxo de Caixa

Quando o webhook processa um pedido real, ele busca o `get_escrow_detail` e, além da
**ENTRADA** bruta (`preço × qtd`, categoria "Vendas"), lança uma **SAÍDA** com as taxas
(categoria **"Taxas Marketplace"**, `isMarketplaceFee: true`, `orderId: "<sn>:fee"`).
Assim o saldo do caixa reflete o líquido a receber, mas os KPIs de receita bruta do
`/vendas` continuam certos (eles só somam `type: "entrada"`). Dedupe por `orderId:fee`.
Vendas simuladas e o mock do webhook não têm dado de taxa — entram só com o bruto.

## Limitações conhecidas / próximos passos

- **Itens com variação (models)**: `updateShopeeStock` cobre o caso sem variação (`model_id: 0`).
  Pra variações é preciso atualizar cada `model_id`.
- **Auth só shop-level**: o callback trata `shop_id`. Contas que gerenciam várias lojas
  (merchant-level, `main_account_id`) precisam de um passo extra pra listar as lojas.
- **Refresh concorrente**: dois pushes simultâneos podem tentar renovar o mesmo token.
  Em escala, mover pra um lock (Firestore transaction).
- **Status de pedido**: o webhook só baixa estoque em `READY_TO_SHIP`/`PROCESSED`/`SHIPPED`/
  `TO_CONFIRM_RECEIVE`/`COMPLETED`. Ajuste `STATUS_BAIXA` se o seu fluxo for diferente.
