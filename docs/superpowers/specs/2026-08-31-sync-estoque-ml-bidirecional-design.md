# Sincronização de estoque ML → central (edição manual do anúncio)

**Data:** 2026-08-31
**Arquivos:** `lib/mercadolivre.ts`, `lib/estoqueSync.ts`,
`app/api/webhooks/mercadolivre/route.ts`, `app/api/estoque/sincronizar/route.ts`,
`app/estoque/page.tsx`

## Problema

1. Quando o vendedor muda estoque/preço direto no anúncio do Mercado Livre, nada
   reflete no estoque central — só `orders_v2` (vendas) tinha webhook.
2. A sincronização manual atual (`/api/estoque/sincronizar`) trata o **central**
   como fonte da verdade e empurra pros canais → clicar nela **sobrescreve** a
   mudança feita no ML.
3. Vínculos órfãos (anúncio que não existe mais no ML) ficam pendurados.

## Solução: A (webhook) + B (botão), com reconcile nos dois

### A — Webhook do tópico `items` (tempo real)

- **DevCenter:** assinar o tópico `items` (passo manual do usuário).
- `lib/mercadolivre.ts`: `fetchItem(token, itemId)` → anúncio normalizado +
  `status` + `hasVariations`; retorna `null` em 404.
- `lib/estoqueSync.ts`: `definirEstoqueEPropagar(db, userId, sku, qtd, origem, {price})`
  — define quantidade **absoluta** (≠ `baixarEstoqueEPropagar` que subtrai),
  atualiza preço central se mudou, propaga pros outros canais.
  **Guarda anti-eco:** se `qtd == atual` e preço não mudou → `mudou:false`, não
  propaga (evita loop quando a notificação é reflexo do nosso próprio push).
- `app/api/webhooks/mercadolivre/route.ts`: `topic === "items"` →
  `tratarNotificacaoItem`:
  - acha o vínculo por `adId`; sem vínculo → 200 e ignora.
  - `fetchItem` → `null` ⇒ apaga o vínculo (reconcile) e 200.
  - `hasVariations` ⇒ 200 e ignora (limitação conhecida).
  - senão: espelha no vínculo + `definirEstoqueEPropagar`.

### B — Botão "Puxar do ML" (fallback manual)

- `lib/estoqueSync.ts`: `puxarCanalMercadoLivre(db, userId, integracao)` →
  lê anúncios ativos, `definirEstoqueEPropagar` por SKU, upsert de vínculos, e
  **reconcile**: vínculo ML cujo `adId` não está nos ativos **e** dá 404 no
  `fetchItem` ⇒ removido (anúncio pausado ≠ removido, então continua).
- `app/api/estoque/sincronizar/route.ts`: body ganha `direction`. `"pull"` →
  usa `puxarCanalMercadoLivre` (só ML real por ora; Shopee fica pra depois).
  Sem `direction` / `"push"` = comportamento atual, intacto.
- `app/estoque/page.tsx`: botão **"Puxar do ML"** ao lado do refresh, visível só
  com integração ML. `handleSincronizarManual(platform?, direction?)`.

## Fora de escopo

- Pull da Shopee (só ML — foi o que o usuário pediu).
- Propagação de **preço** entre canais (só atualiza o preço central pra exibição).
- Anúncios com variação (`model_id` / `variations[]`).
- Assinatura `x-signature` do webhook (rastreada em `docs/mercadolivre-integracao.md`).

## Verificação

- `tsc --noEmit` limpo; `next build` OK.
- `POST /api/estoque/sincronizar {direction:"pull"}` com a conta real (GURIZZO943,
  1 anúncio) → `0 atualizados` (no-op, central já batia), `0 órfãos`, sem erro.
- Limpeza pontual: 2 vínculos-fantasma mock (`MLA-1002`, `MLA-1003`,
  conexão inexistente) removidos via script admin.
- UI logada: pendente de verificação visual pelo usuário (sem credenciais na sessão).

## Risco

Médio-baixo. O webhook `items` só age em anúncio já vinculado; a guarda anti-eco
evita loop; o reconcile confirma 404 antes de apagar. Pior caso: a propagação de
volta pros outros canais dispara chamadas extras à API do ML/Shopee.
