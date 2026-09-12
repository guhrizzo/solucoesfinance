# Integração TikTok Shop — aba Estoque

Mesma arquitetura do Mercado Livre e da Shopee: **produtos da TikTok Shop → estoque
central (Firestore) → sincroniza de volta pra todos os canais**. Uma venda em qualquer
canal baixa o SKU central e empurra a nova quantidade pros demais anúncios/itens/produtos.
Cada venda também vira uma **entrada no Fluxo de Caixa** (`category: "Vendas"`, ver
`lib/vendas.ts` e o painel `/vendas`).

> ⚠️ **Origem da integração**: o pedido inicial linkava a *Research API* do TikTok
> (`research-api-specs-query-tiktok-shop-info`) — essa API é só consulta pública de
> dados de shop/produto/review pra pesquisa acadêmica, **sem** OAuth de vendedor nem
> estoque/pedidos/webhook. O que está implementado aqui é a **TikTok Shop Partner
> Center API** (Open API de vendedor), que cumpre o mesmo papel do ML/Shopee.

## Arquivos

| Arquivo | Papel |
|---|---|
| `lib/tiktokshop.ts` | Assinatura HMAC, URL de auth, troca/refresh de token, loja autorizada, listagem de produtos, push de estoque, detalhe de pedido, validação do webhook |
| `lib/estoqueSync.ts` | Baixa de estoque central + propagação multi-canal (ML + Shopee + TikTok Shop) — compartilhado pelos três webhooks |
| `app/api/auth/tiktokshop/redirect/route.ts` | `POST` autenticado: gera `state`, grava cookie `tiktokshop_oauth`, devolve `{ authUrl }` pro client navegar |
| `app/api/auth/tiktokshop/callback/route.ts` | Troca `code` por token, busca a loja autorizada, salva integração, importa produtos |
| `app/api/auth/tiktokshop/status/route.ts` | Diagnóstico (envs, Firebase Admin, integrações salvas) — rodar em produção |
| `app/api/webhooks/tiktokshop/route.ts` | Recebe o evento `ORDER_STATUS_CHANGE`, baixa e propaga o estoque, lança a venda no caixa |
| `app/api/estoque/sincronizar/route.ts` | Sincronização manual (botão de refresh na tabela) — trata ML, Shopee e TikTok Shop |

## Fluxo de autorização (TikTok Shop Partner API v2)

✅ Confirmado em 2026-09-11 contra a documentação pública oficial
(`partner.tiktokshop.com/docv2` — a doc em si não é a SPA bloqueada, deu pra ler
via browser). Os 3 pontos que antes estavam marcados como não confirmados (⚠️)
agora estão fechados — ver tabela abaixo.

| Passo | Onde no código | Detalhe |
|---|---|---|
| **1. Gerar link de autorização** (`GET /open/authorize`) | `buildTiktokAuthUrl` em `lib/tiktokshop.ts` | Query: **`service_id`** (não `app_key`) + `state`. Host por mercado: `services.tiktokshop.com` (Rest of World, padrão — NexusFi é BR) ou `services.us.tiktokshop.com` (`TIKTOKSHOP_MARKET="US"`). `service_id` vem da mesma página do app no Partner Center (App & Service), abaixo do nome do app. |
| **2. Vendedor autoriza e volta** | `app/api/auth/tiktokshop/callback/route.ts` | A TikTok Shop redireciona pro `redirect_uri` cadastrado no console com `?code=...&state=...`. O `state` (CSRF) viaja no cookie `tiktokshop_oauth`. |
| **3. Trocar `code` por token** (`GET /api/v2/token/get`) | `exchangeTiktokToken` | Host `auth.tiktok-shops.com` (esse continua sendo por `app_key`, não `service_id`). Query: `app_key`, `app_secret`, `auth_code`, `grant_type=authorized_code`. Endpoint de auth — **sem** assinatura HMAC. Resposta: `access_token`, `refresh_token`, `access_token_expire_in` (~7 dias). |
| **4. Renovar token** (`GET /api/v2/token/refresh`) | `refreshTiktokToken` / `getValidTiktokToken` | Query: `app_key`, `app_secret`, `refresh_token`, `grant_type=refresh_token`. A TikTok Shop devolve um novo `refresh_token` a cada renovação — persistimos no Firestore. Renova quando falta < 30 min. |
| **5. Loja autorizada** (`GET /authorization/202309/shops`) | `fetchAuthorizedShop` | Devolve `shop_id`, `shop_cipher` (necessário nas chamadas seguintes) e `shop_name`. |
| **Assinar chamadas de API** | `signedRequest` (interno) | `sign = HMAC-SHA256(app_secret, app_secret + path + params_ordenados + body + app_secret)`, hex. Headers: `x-tts-access-token` (token) e `x-tts-shop-cipher` (loja). Confirmado: path no formato `/{categoria}/202309/{recurso}` é o estilo atual (doc "API versioning"). |
| **Host** | `API_HOST` / `AUTH_HOST` / `SELLER_AUTH_HOST_ROW`/`_US` | API: `open-api.tiktokglobalshop.com`. Token: `auth.tiktok-shops.com`. Autorização de seller: `services(.us).tiktokshop.com`. Não há sandbox público equivalente ao da Shopee — testar com uma loja de testes do próprio Partner Center. |

> ⚠️ **Estoque assume um único armazém.** `updateTiktokStock` busca o `warehouse_id`
> padrão da loja (`fetchDefaultWarehouseId`) e usa o mesmo pra todo update — lojas com
> múltiplos centros de distribuição precisam escolher o armazém por SKU (fora de escopo
> aqui, mesma simplificação que o ML/Shopee fazem pra itens sem variação; não confirmado
> contra o Partner Center real, sem forma de checar isso na doc pública).

> ✅ **Header de assinatura do webhook confirmado: `Authorization`** (não
> `x-tts-signature`, que era a suposição anterior). `verifyTiktokPush`
> (lib/tiktokshop.ts) já lê `Authorization` e calcula
> `HMAC-SHA256(app_key + corpo_bruto, app_secret)` em hex minúsculo — sem
> segredo de webhook separado (doc "TikTok Shop webhooks → Overview").

## O que configurar no TikTok Shop Partner Center

<https://partner.tiktokshop.com> → seu **App** (conta de desenvolvedor aprovada).

1. **App Key / App Secret / Service ID** — na página do app (App & Service), copie
   os três pro `.env.local`. O `service_id` fica abaixo do nome do app — é
   diferente do App Key e só é usado no link de autorização do seller.

2. **Redirect URL** — cadastre **exatamente**:
   ```
   https://nexusfi.com.br/api/auth/tiktokshop/callback
   ```
   Qualquer diferença (barra final, http/https, subdomínio) → erro de autenticação.

3. **Permissões / escopos da App** — habilite pelo menos:
   - `Shop` / `Authorized shops` (`authorization/shops`)
   - `Product` (`products/search`, `inventory/update`)
   - `Order` (`orders/search`, `orders`)
   - `Logistics` (`warehouses`) — pro update de estoque saber o armazém padrão

4. **Webhook (eventos)** — na aba de Event Subscriptions (App & Service → seu app →
   Basic Information → Developing):
   - URL:
     ```
     https://nexusfi.com.br/api/webhooks/tiktokshop
     ```
   - Marque o evento **`ORDER_STATUS_CHANGE`**.
   - Não precisa confirmar nome de header nem segredo separado — a TikTok Shop
     sempre manda a assinatura no header `Authorization`, calculada com o
     mesmo App Key/Secret (ver `verifyTiktokPush`).

## Variáveis de ambiente (`.env.local` / envs do deploy)

```env
TIKTOKSHOP_APP_KEY="..."          # App Key do Partner Center
TIKTOKSHOP_APP_SECRET="..."       # App Secret do Partner Center
TIKTOKSHOP_SERVICE_ID="..."       # Service ID (abaixo do nome do app) — só pro link de autorização
TIKTOKSHOP_MARKET=""              # vazio/"ROW" = services.tiktokshop.com (BR); "US" = services.us.tiktokshop.com
TIKTOKSHOP_REDIRECT_URI="https://nexusfi.com.br/api/auth/tiktokshop/callback"
TIKTOKSHOP_WEBHOOK_STRICT=""      # deixe vazio até ver "assinatura valid" no log; depois "true"
TIKTOKSHOP_PUSH_URL="https://nexusfi.com.br/api/webhooks/tiktokshop"  # idêntica à URL cadastrada no painel
```

> `TIKTOKSHOP_WEBHOOK_SECRET` foi removida — a assinatura do webhook usa
> `TIKTOKSHOP_APP_KEY`/`APP_SECRET` diretamente (algoritmo oficial confirmado),
> nunca precisou de um segredo separado.

> **`TIKTOKSHOP_PUSH_URL`** — mesmo motivo do `SHOPEE_PUSH_URL`: atrás do proxy da
> Vercel, `request.url` pode não bater com a URL que a TikTok Shop usou pra assinar o
> evento. (Hoje o webhook ainda não usa essa env pra reconstruir a URL de verificação —
> a assinatura é feita só sobre o corpo bruto; a env fica reservada caso o Partner
> Center exija a URL na base da assinatura, como a Shopee faz.)

> Sem `TIKTOKSHOP_APP_KEY`/`APP_SECRET` (ou com os placeholders) a integração cai em
> **modo simulado (mock)** automaticamente — cria 3 produtos fake pra testar a UI e o
> simulador de vendas.

## Como testar em produção

1. Deploy com as envs acima.
2. Estoque → **Integrações** → **Conectar Conta** no card da TikTok Shop.
3. Autoriza na TikTok Shop → volta pra `/estoque?integration=tiktok_success&imported=N`.
4. Confere se os produtos ativos viraram itens de estoque + vínculos na tabela.
5. Faz (ou simula) uma venda → o webhook baixa o SKU central e atualiza os outros canais.
   Log do servidor: `[sync] TikTok Shop SKU ... → N un`.
6. Botão de **refresh** na tabela = sincronização manual (`/api/estoque/sincronizar`).
7. Confere a venda como entrada em **Fluxo de Caixa** e no **Painel de Vendas**.
8. `GET /api/auth/tiktokshop/status[?userId=]` — diagnóstico sem login, espelha o
   `.../shopee/status` e o `.../mercadolivre/status`.

### Validar a assinatura do webhook

Deixe `TIKTOKSHOP_WEBHOOK_STRICT` vazio no começo. Nos logs vai aparecer
`[TikTok Shop push] assinatura valid|invalid`. Quando estiver saindo `valid` de forma
consistente, ligue `TIKTOKSHOP_WEBHOOK_STRICT="true"` pra rejeitar chamadas forjadas.

## Autenticação das rotas

`POST /api/estoque/sincronizar` e `POST /api/auth/tiktokshop/redirect` exigem o
header `Authorization: Bearer <ID token do Firebase>`. O servidor
(`lib/apiScope.ts` → `requireScope`) verifica o token, resolve o escopo em
`users/{uid}/profile/access` e usa o **ownerUid do token** — nunca um `userId` vindo
do cliente. O client usa `lib/authedFetch.ts`.

- `sincronizar` e `redirect`: precisam da permissão `estoque`.
- O webhook (`/api/webhooks/tiktokshop`) continua sem auth — é a assinatura HMAC que
  o protege.

## Idempotência do estoque

A TikTok Shop reenvia o evento `ORDER_STATUS_CHANGE` a cada transição de status do
pedido (mesmo comportamento do ML/Shopee). Pra não baixar o mesmo pedido várias
vezes, o webhook chama `registrarVendaAdmin` **primeiro** — ele deduplica por
`orderId`+canal e devolve `null` num reenvio. A baixa de estoque
(`baixarEstoqueEPropagar`) só roda quando o retorno é um id (pedido inédito). `null`
também cobre falha transitória: nada foi gravado e o próximo evento reprocessa. As
vendas simuladas usam `orderId` único a cada clique, então continuam baixando
normalmente.

## Timeout das funções

`callback`, `webhooks/tiktokshop` e `estoque/sincronizar` declaram
`export const maxDuration = 60` — o default da Vercel (10s) não cobre troca de
token + varredura de produtos + escritas sequenciais no Firestore.

## Fora de escopo desta leva (pendências)

- **Painel de repasse/financeiro** (tipo o "Shopee — estoque e repasse"): a API de
  Finance/Settlement da TikTok Shop tem formato diferente do escrow da Shopee — fica
  pra quando o usuário tiver credenciais reais e der pra validar contra o painel ao vivo.
- **Sincronização "pull"** (TikTok Shop manda, central atualiza): não implementada —
  a Shopee também não tem, só o ML (`puxarCanalMercadoLivre`).
- **Itens com variação/SKU múltiplo por warehouse**: `updateTiktokStock` assume um
  único armazém padrão (ver aviso acima) — esse ponto continua sem confirmação real,
  a doc pública não cobre lojas multi-armazém em detalhe.
- **Refresh concorrente**: dois eventos simultâneos podem tentar renovar o mesmo
  token. Em escala, mover pra um lock (Firestore transaction) — mesma dívida técnica
  do ML/Shopee.
