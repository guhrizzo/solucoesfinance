# Integração Shein — aba Estoque

Mesma arquitetura do Mercado Livre, Shopee e TikTok Shop: **produtos da Shein → estoque
central (Firestore) → sincroniza de volta pra todos os canais**. Uma venda em qualquer
canal baixa o SKU central e empurra a nova quantidade pros demais anúncios/itens/produtos.
Cada venda também vira uma **entrada no Fluxo de Caixa** (`category: "Vendas"`, ver
`lib/vendas.ts` e o painel `/vendas`).

> ⚠️ **Oculta da interface.** Ao contrário do TikTok Shop, a Shein entra com
> `SHEIN_UI_VISIVEL = false` (mesma flag da Shopee) em
> `app/[locale]/estoque/page.tsx` e `app/[locale]/vendas/page.tsx` — o backend
> está completo, mas sem `SHEIN_APP_ID`/`SHEIN_APP_SECRET` reais ainda
> (depende da aprovação do app no painel de desenvolvedor da Shein). Troque as
> duas flags pra `true` quando tiver credenciais e puder testar o fluxo de
> autorização de verdade.

## Arquivos

| Arquivo | Papel |
|---|---|
| `lib/shein.ts` | Assinatura HMAC própria, link de autorização, troca do tempToken (+ decifra AES da secretKey), listagem de produtos, consulta/atualização de estoque, detalhe de pedido, verificação + decifra do webhook |
| `lib/estoqueSync.ts` | Baixa de estoque central + propagação multi-canal (ML + Shopee + TikTok Shop + Shein) — compartilhado pelos quatro webhooks |
| `app/api/auth/shein/redirect/route.ts` | `POST` autenticado: gera `state`, grava cookie `shein_oauth`, devolve `{ authUrl }` pro client navegar |
| `app/api/auth/shein/callback/route.ts` | Troca `tempToken` por `openKeyId`+`secretKey`, salva a integração, importa produtos |
| `app/api/auth/shein/status/route.ts` | Diagnóstico (envs, Firebase Admin, integrações salvas) — rodar em produção |
| `app/api/webhooks/shein/route.ts` | Recebe o evento (form-data + `eventData` cifrado), baixa e propaga o estoque, lança a venda no caixa |
| `app/api/estoque/sincronizar/route.ts` | Sincronização manual (botão de refresh na tabela) — trata ML, Shopee, TikTok Shop e Shein |

## Fluxo de autorização — bem diferente de ML/Shopee/TikTok Shop

✅ Confirmado em 2026-09-17 contra a documentação pública oficial
(open.sheincorp.com → Documentos → Documentação da API / Documentação do
desenvolvedor — leitura via browser, sem precisar de app aprovado). A Shein
**não usa OAuth2 padrão**: não há `code`/`access_token`/refresh — a chave da
loja é trocada uma única vez a partir de um `tempToken` e não expira.

| Passo | Onde no código | Detalhe |
|---|---|---|
| **1. Link de autorização** (host "empower") | `buildSheinAuthUrl` em `lib/shein.ts` | `https://{host}/#/empower?appid=...&redirectUrl={base64}&state=...`. Host de **autorização** (`openapi-sem.sheincorp.com` prod / `openapi-sem-test01.dotfashion.cn` teste) é **diferente** do host de **API** (ver linha "Hosts" abaixo). |
| **2. Lojista autoriza e volta** | `app/api/auth/shein/callback/route.ts` | A Shein redireciona o navegador do lojista pro `redirectUri` cadastrado com `?appid=...&tempToken=...&state=...` (`tempToken` válido só **10 minutos**). O `state` (CSRF) viaja no cookie `shein_oauth`. |
| **3. Trocar `tempToken` por chave** (`POST /open-api/auth/get-by-token`) | `exchangeSheinToken` | Assinado com **APP_ID+APP_SECRET** (o desenvolvedor ainda não tem chave da loja nesse passo — diferente de todas as outras chamadas). Resposta traz `openKeyId` + `secretKey` **cifrada** (AES-128-CBC) + `supplierId`. |
| **4. Decifrar a `secretKey`** | `exchangeSheinToken` → `decryptShein` | AES-128-CBC, chave = 16 primeiros bytes da `APP_SECRET`, IV = 16 primeiros bytes do literal `"space-station-default-iv"` (público, não é segredo — vem dos exemplos de código oficiais). |
| **Chave não expira** | `getValidSheinToken` | Ao contrário de ML/Shopee/TikTok Shop, a chave da Shein é **permanentemente válida** (só muda se o lojista desautorizar/reautorizar o app) — não há refresh de verdade; a função só existe pra manter a mesma assinatura usada pelos outros canais nos pontos compartilhados. |
| **Assinar chamadas de API** | `sign` (interno) | `VALUE = openKeyId&timestamp&path`, `KEY = secretKey+randomKey(5)`, `sign = randomKey + base64(hex(HMAC-SHA256(VALUE,KEY)))` — repara que o base64 é sobre a STRING hex, não os bytes crus. Headers: `x-lt-openKeyId`, `x-lt-timestamp`, `x-lt-signature`. |
| **Hosts** | `apiHost()` | API: `openapi.sheincorp.com` (prod, cenário POP/autocontrole — o caso do lojista comum) / `openapi-test01.sheincorp.cn` (teste). Empower: `openapi-sem.sheincorp.com` / `openapi-sem-test01.dotfashion.cn`. Outros tipos de app (semi/totalmente gerenciado) usam `openapi.sheincorp.cn` — fora de escopo aqui. |

> ⚠️ **Webhook assina diferente das chamadas normais.** A Shein confirma na
> própria doc: "Assine com appid e appSercertKey, não com openkey+sercretKey
> do fornecedor" — `verifySheinWebhook` usa `SHEIN_APP_ID`/`SHEIN_APP_SECRET`
> (não a chave da loja). O corpo chega em `multipart/form-data` com um campo
> `eventData` cifrado (mesma cifra AES do passo 4) — `decryptSheinEvent`.

## Pendências confirmadas na doc pública (fora de escopo desta leva)

- **Preço e nome real do produto**: `POST /open-api/openapi-business-backend/product/query`
  (listagem) só devolve os identificadores gerados PELA PRÓPRIA Shein
  (`spuName`/`skcName`/`skuCode`) — nem preço, nem o SKU do lojista
  (`sellerSku`), nem título. `fetchSheinListings` usa `skuCode` como SKU
  interno (prefixo `SHEIN-`) e preço `0`. Precisa confirmar contra
  `/goods/spu-info` ou `/openapi-business-backend/product/full-detail`
  (não abertos ainda) quando tivermos sandbox real.
- **Um único armazém**: `updateSheinStock` não passa `warehouseCode` (mesma
  simplificação do TikTok Shop) — lojista com múltiplos armazéns precisa
  escolher o armazém por SKU no `POST /open-api/stock/change-inventory/v2`.
- **Nome do campo do pedido no webhook**: a doc não mostra um payload de
  exemplo do evento decifrado — `extractOrderNo` (lib/shein.ts) tenta os
  nomes mais prováveis (`orderNo`/`order_no`/`orderSn`). Precisa confirmar
  contra um evento real.
- **Quantidade por SKU no pedido**: `POST /open-api/order/order-detail` não
  tem campo de quantidade — cada unidade física é uma entrada separada em
  `orderGoodsInfoList` (confirmado na doc: "se um SKU tiver várias peças, o
  goodsId de cada peça é único"). `fetchSheinOrder` agrega por `sellerSku`
  contando ocorrências.

## O que configurar no Painel de Desenvolvedor da Shein

<https://open.sheincorp.com> → **Chamados**/Console do desenvolvedor (login
próprio) → seu **App** (depois do processo: Solicitação de Conta → Criar
Aplicativo → Revisão do aplicativo).

1. **App ID / App Secret** — na página do app, copie os dois pro `.env.local`.
2. **Redirect URL** — cadastre **exatamente**:
   ```
   https://nexusfi.com.br/api/auth/shein/callback
   ```
3. **Webhook (eventos)** — cadastre a URL:
   ```
   https://nexusfi.com.br/api/webhooks/shein
   ```
   e assine o evento de mudança de status de pedido (nome exato a confirmar
   no painel — a doc pública fala em "order-change" como exemplo genérico de
   `x-lt-eventCode`, não como o único evento existente).

## Variáveis de ambiente (`.env.local` / envs do deploy)

```env
SHEIN_APP_ID="..."                # App ID do painel do desenvolvedor
SHEIN_APP_SECRET="..."            # App Secret do painel do desenvolvedor
SHEIN_REDIRECT_URI="https://nexusfi.com.br/api/auth/shein/callback"
SHEIN_ENV=""                      # vazio/"produção" = openapi.sheincorp.com; "test" = openapi-test01.sheincorp.cn
SHEIN_WEBHOOK_STRICT=""           # deixe vazio até ver "assinatura valid" no log; depois "true"
SHEIN_PUSH_URL="https://nexusfi.com.br/api/webhooks/shein"  # idêntica à URL cadastrada no painel
```

> Sem `SHEIN_APP_ID`/`APP_SECRET` (ou com os placeholders) a integração cai em
> **modo simulado (mock)** automaticamente — cria 2 produtos fake pra testar a
> UI e o simulador de vendas.

## Como testar (depois de ligar as flags `SHEIN_UI_VISIVEL`)

1. Deploy com as envs acima.
2. Estoque → **Integrações** → **Conectar Conta** no card da Shein.
3. Autoriza no painel de vendedor da Shein → volta pra
   `/estoque?integration=shein_success&imported=N`.
4. Confere se os produtos publicados viraram itens de estoque + vínculos na
   tabela (nome/preço só serão reais depois de fechar a pendência de
   "Preço e nome real do produto" acima).
5. Faz (ou simula) uma venda → o webhook baixa o SKU central e atualiza os
   outros canais. Log do servidor: `[sync] Shein SKU ... → N un`.
6. Botão de **refresh** na tabela = sincronização manual (`/api/estoque/sincronizar`).
7. Confere a venda como entrada em **Fluxo de Caixa** e no **Painel de Vendas**.
8. `GET /api/auth/shein/status[?userId=]` — diagnóstico sem login, espelha o
   `.../tiktokshop/status`.

### Validar a assinatura do webhook

Deixe `SHEIN_WEBHOOK_STRICT` vazio no começo. Nos logs vai aparecer
`[Shein push] assinatura valid|invalid`. Quando estiver saindo `valid` de
forma consistente, ligue `SHEIN_WEBHOOK_STRICT="true"` pra rejeitar chamadas
forjadas.

## Autenticação das rotas

`POST /api/estoque/sincronizar` e `POST /api/auth/shein/redirect` exigem o
header `Authorization: Bearer <ID token do Firebase>`. O servidor
(`lib/apiScope.ts` → `requireScope`) verifica o token, resolve o escopo em
`users/{uid}/profile/access` e usa o **ownerUid do token** — nunca um `userId`
vindo do cliente. O client usa `lib/authedFetch.ts`.

- `sincronizar` e `redirect`: precisam da permissão `estoque`.
- O webhook (`/api/webhooks/shein`) continua sem auth — é a assinatura HMAC
  (`SHEIN_APP_ID`/`APP_SECRET`) que o protege.

## Idempotência do estoque

Mesma lógica do ML/Shopee/TikTok Shop: o webhook chama `registrarVendaAdmin`
**primeiro** — ele deduplica por `orderId`+canal e devolve `null` se o pedido
já foi lançado. A baixa de estoque (`baixarEstoqueEPropagar`) só roda quando o
retorno é um id (pedido inédito).

## Timeout das funções

`callback`, `webhooks/shein` e `estoque/sincronizar` declaram
`export const maxDuration = 60` — o default da Vercel (10s) não cobre a
troca de chave + varredura de produtos + escritas sequenciais no Firestore.

## Fora de escopo desta leva (pendências)

- Ver a seção "Pendências confirmadas na doc pública" acima (preço/nome real,
  múltiplos armazéns, payload do webhook, quantidade por SKU no pedido).
- **Sincronização "pull"** (Shein manda, central atualiza): não implementada
  — nenhuma das outras três integrações tem isso além do ML.
- **Refresh concorrente**: não se aplica aqui (a chave da Shein não expira),
  mas o mesmo cuidado de concorrência das outras integrações vale pras
  escritas no Firestore durante a sincronização manual.
