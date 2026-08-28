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
   - `Order` (get_order_detail)

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

## Limitações conhecidas / próximos passos

- **Itens com variação (models)**: `updateShopeeStock` cobre o caso sem variação (`model_id: 0`).
  Pra variações é preciso atualizar cada `model_id`.
- **Auth só shop-level**: o callback trata `shop_id`. Contas que gerenciam várias lojas
  (merchant-level, `main_account_id`) precisam de um passo extra pra listar as lojas.
- **Refresh concorrente**: dois pushes simultâneos podem tentar renovar o mesmo token.
  Em escala, mover pra um lock (Firestore transaction).
- **Status de pedido**: o webhook só baixa estoque em `READY_TO_SHIP`/`PROCESSED`/`SHIPPED`/
  `TO_CONFIRM_RECEIVE`/`COMPLETED`. Ajuste `STATUS_BAIXA` se o seu fluxo for diferente.
