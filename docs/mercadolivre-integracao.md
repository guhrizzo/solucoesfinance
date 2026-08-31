# Integração Mercado Livre — aba Estoque

Fluxo: **anúncios do ML → estoque central (Firestore) → sincroniza de volta pra todos os canais**.
Uma venda em qualquer canal baixa o SKU central e empurra a nova quantidade pros demais anúncios.

## Arquivos

| Arquivo | Papel |
|---|---|
| `lib/mercadolivre.ts` | PKCE, troca/refresh de token, listagem de anúncios, push de estoque, validação do webhook |
| `app/api/auth/mercadolivre/redirect/route.ts` | Inicia o OAuth (gera PKCE, grava cookie `ml_oauth`, redireciona pro ML) |
| `app/api/auth/mercadolivre/callback/route.ts` | Troca `code` por token, salva integração, importa anúncios |
| `app/api/webhooks/mercadolivre/route.ts` | Recebe notificação de venda (`orders_v2`), baixa e propaga o estoque |
| `app/api/estoque/sincronizar/route.ts` | Sincronização manual (botão de refresh na tabela) |
| `app/api/auth/mercadolivre/status/route.ts` | Diagnóstico: `GET .../status[?userId=]` diz quais envs faltam e se o Firebase Admin sobe (sem vazar valores) |

## O que configurar no painel do Mercado Livre

<https://developers.mercadolivre.com.br/devcenter> → sua aplicação.

1. **URIs de redirect** — adicione **exatamente**:
   ```
   https://nexusfi.com.br/api/auth/mercadolivre/callback
   ```
   Qualquer diferença (barra final, http/https, subdomínio) → `invalid redirect_uri`.

2. **PKCE** — deixe habilitado (é o padrão hoje). O código já manda `code_challenge` S256.

3. **Scopes** — marque `offline_access` (dá o `refresh_token`), `read` e `write`
   (write é necessário pra atualizar `available_quantity` dos anúncios).

4. **Notificações / Webhooks**:
   - Callback URL:
     ```
     https://nexusfi.com.br/api/webhooks/mercadolivre
     ```
   - Tópico: **`orders_v2`** (vendas). Opcional: `items` se quiser reagir a mudança de anúncio.
   - Copie a **"Assinatura secreta"** mostrada nessa tela.

## Variáveis de ambiente (`.env.local` / envs do deploy)

```env
MERCADOLIVRE_CLIENT_ID="..."            # App ID
MERCADOLIVRE_CLIENT_SECRET="..."        # Secret Key
MERCADOLIVRE_REDIRECT_URI="https://nexusfi.com.br/api/auth/mercadolivre/callback"
MERCADOLIVRE_WEBHOOK_SECRET="..."       # Assinatura secreta da aba Notificações
MERCADOLIVRE_WEBHOOK_STRICT=""          # deixe vazio até confirmar que a validação bate; depois "true"
```

> Sem `MERCADOLIVRE_CLIENT_ID`/`SECRET`/`REDIRECT_URI` a integração cai em **modo simulado (mock)**
> automaticamente — útil pra testar a UI sem conta real.

## Como testar em produção

0. **Confira a config primeiro**: abra `https://nexusfi.com.br/api/auth/mercadolivre/status`.
   `ok: true` (ou só o aviso do webhook secret) = ambiente pronto. Se listar env faltando
   ou `firebaseAdmin.ok: false`, resolva na Vercel e faça *Redeploy* antes de continuar.
1. Deploy com as envs acima.
2. Estoque → **Integrações** → **Conectar Conta** no card do Mercado Livre.
3. Autoriza no ML → volta pra `/estoque?integration=ml_success&imported=N`.
4. Confere se os anúncios ativos viraram produtos + vínculos na tabela.
5. Faz (ou simula) uma venda no ML → o webhook baixa o SKU central e atualiza os outros canais.
   Log do servidor: `[ML] estoque do anúncio ... atualizado para ...`.
6. Botão de **refresh** na tabela = sincronização manual (`/api/estoque/sincronizar`).

### Validar a assinatura do webhook

Deixe `MERCADOLIVRE_WEBHOOK_STRICT` vazio no começo. Nos logs vai aparecer
`[ML webhook] assinatura valid|invalid`. Quando estiver saindo `valid` de forma
consistente, ligue `MERCADOLIVRE_WEBHOOK_STRICT="true"` pra rejeitar chamadas forjadas.

## Limitações conhecidas / próximos passos

- **Anúncios com variação**: `updateListingQuantity` só cobre o caso sem variação.
  Pra variações é preciso atualizar cada `variations[].available_quantity`.
- **Refresh concorrente**: dois webhooks simultâneos podem tentar renovar o mesmo
  token e o ML invalida o `refresh_token` antigo (uso único). Em escala, mover pra
  um lock (Firestore transaction / Redis).
- **Firestore rules**: as rotas usam o SDK client no servidor. Idealmente migrar as
  4 rotas pro `firebaseAdmin` e trancar as coleções `integracoes`/`vinculos`/`estoque`
  pra escrita só via Admin — hoje os tokens de acesso ficam graváveis pelo client.
- **Token de app (webhook)**: se a conta ficar > 6 meses sem uso, o `refresh_token`
  expira e o usuário precisa reconectar (o callback já trata isso).
