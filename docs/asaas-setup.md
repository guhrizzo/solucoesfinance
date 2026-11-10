# Asaas — boleto e cartão recorrente (assinatura do NexusFi)

Com `ASAAS_API_KEY` definida, `/api/billing/checkout` cria uma **assinatura** no Asaas
(`billingType` = `CREDIT_CARD` ou `BOLETO`, ciclo mensal/anual conforme o plano) e devolve a
`invoiceUrl` (fatura hospedada) para o cliente pagar. Nenhum dado de cartão passa pelo NexusFi.
Sem a variável, o checkout continua usando a InfinitePay (link avulso).

## Variáveis de ambiente

| Variável | Valor |
|---|---|
| `ASAAS_API_KEY` | Chave de API (produção `$aact_prod_…` ou sandbox `$aact_hmlg_…`; o ambiente é detectado pelo prefixo) |
| `ASAAS_WEBHOOK_TOKEN` | Token de autenticação que você define ao cadastrar o webhook (recebido no header `asaas-access-token`) |
| `ASAAS_ENV` / `ASAAS_BASE_URL` | Opcionais: forçar sandbox / host customizado |
| `NEXT_PUBLIC_APP_URL` | Já usada; precisa ser o domínio cadastrado na conta Asaas (callback pós-pagamento) |

## Painel do Asaas

1. **Integrações → Webhooks**: URL `${APP_URL}/api/webhooks/asaas`, token = `ASAAS_WEBHOOK_TOKEN`,
   API versão v3, fila sequencial ligada. Eventos: `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`,
   `SUBSCRIPTION_CREATED`, `SUBSCRIPTION_UPDATED`, `SUBSCRIPTION_DELETED`, `SUBSCRIPTION_INACTIVATED`,
   `CHECKOUT_PAID`, `CHECKOUT_CANCELED`, `CHECKOUT_EXPIRED` (os 5 novos são do teste grátis com cartão).
2. **Minha conta → Informações → Dados comerciais**: cadastrar o domínio do site (exigido para o
   redirecionamento `successUrl` → `/assinatura/retorno?gateway=asaas`).
3. Ligar o envio de e-mails de cobrança ao cliente (boleto/fatura).

## Como o acesso é liberado

- `PAYMENT_CONFIRMED` (cartão) / `PAYMENT_RECEIVED` (boleto compensado) → `lib/billingApplyAsaas.ts`
  reconfere a cobrança na API, estende `currentPeriodEnd` (idempotente por `billingEvents/asaas_{id}`) e
  marca a assinatura como `authorized`.
- Boleto leva 1–2 dias úteis para compensar; a carência de 3 dias (`RENEWAL_GRACE_DAYS`) vale nas renovações.
- Cancelar renovação: `/api/billing/cancel` faz `DELETE /subscriptions/{id}`; o acesso pago segue até o fim do período.

## Teste grátis de 7 dias com cartão (CTA do Midas)

O botão "COMEÇAR MEU TESTE GRATUITO" do chatbot Midas leva a `/register?lead=…&trial=cartao`.
Nesse caminho **não há teste sem cartão**: os 7 dias só começam quando o Asaas valida o cartão.
O cadastro comum (`/register` sem `trial=cartao`) continua com o teste padrão de 7 dias sem cartão.

Fluxo de ponta a ponta:

1. **Cadastro** (`register/page.tsx`) → `POST /api/billing/trial-card` → `requireCardTrial()`
   (`lib/billingCardTrial.ts`): conta criada há < 30 min, sem pagamento/assinatura e não cortesia
   ganha `trialKind: "card_required"` e `trialEndsAt = agora` (acesso travado no paywall).
2. **Plano** (`/assinatura?trial=cartao` → Paywall com "Ative seus 7 dias grátis") →
   **Contrato** (`/assinatura/contrato?plano=…&trial=cartao`): aceite eletrônico obrigatório, com as
   cláusulas 2.4/2.5 do teste (`trialDays: 7` entra no hash; `CONTRACT_VERSION = 3`). Só cartão.
3. **Checkout** (`POST /api/billing/checkout` com `trial: true`): confere elegibilidade, contrato com
   `trialDays`, e se o CNPJ já usou o teste (`trialClaims/{cnpj}`). Cancela checkout/assinatura
   pendente anterior, cria o cliente e um **Asaas Checkout** `POST /v3/checkouts` com
   `billingTypes: [CREDIT_CARD]`, `chargeTypes: [RECURRENT]`, `subscription.nextDueDate = hoje+7`,
   `minutesToExpire: 60`, `externalReference = owner__plano__contrato__ts`. Grava o índice
   `asaasCheckouts/{checkoutId}` **antes** de redirecionar e devolve o `link` do checkout.
4. **Cartão** na página do Asaas (nenhum dado passa pelo NexusFi). Ao concluir, o Asaas valida o
   cartão e cria a assinatura (`subscription.checkoutSession = checkoutId`); nada é cobrado agora.
5. **Ativação** (`activateCardTrial`): `SUBSCRIPTION_CREATED`/`UPDATED` (relê `GET /subscriptions/{id}`),
   `CHECKOUT_PAID` (lista `GET /subscriptions?customer=…` e casa pelo `checkoutSession`) ou o retorno
   do cliente (`/assinatura/retorno?gateway=asaas&trial=1` → `/api/billing/confirm`). Nunca usa o corpo
   do webhook como verdade. Em transação: confere conta elegível, checkout atual e claim do CNPJ;
   grava `trialKind: "card"`, `subscriptionStatus: "authorized"`, `trialEndsAt` = fim do dia (Brasília)
   da 1ª cobrança (teto: validação + 8 dias) e cria `trialClaims/{cnpj}`. Idempotente. Também grava o
   `externalReference` na assinatura (a doc não garante que o checkout o copie; `orderNsuOf()` cai no
   índice se faltar).
6. **Recusa**: conta não elegível, CNPJ já usado, checkout substituído, valor/meio divergente →
   a assinatura do teste é **cancelada** no Asaas (nada foi cobrado; a 1ª cobrança seria em D+7).
7. **D+7**: o Asaas cobra o cartão; `PAYMENT_CONFIRMED` segue o caminho normal (`applyAsaasPayment`
   estende `currentPeriodEnd`, finaliza o contrato e envia o PDF). Durante o teste com cartão vale a
   mesma carência de 3 dias da renovação, para a cobrança do dia não travar o cliente.
8. **Cancelar no teste**: Assinatura → "Cancelar renovação automática" (`DELETE /subscriptions/{id}`);
   o acesso segue até o fim do teste e nada é cobrado.
9. **Abandono**: o checkout expira em 60 min; `CHECKOUT_EXPIRED`/`CANCELED` limpa o `pending` (só se a
   API não mostrar assinatura daquele checkout). Novo checkout cancela o anterior. Quem desistir e
   assinar pelo fluxo normal tem o checkout do teste cancelado e o vínculo solto.
10. **Cartão recusado** no cadastro: o Asaas não cria a assinatura; o teste não é liberado e o cliente
    pode tentar outro cartão na mesma página (até expirar) ou recomeçar pelo paywall.

Coleções novas (só Admin SDK; o fallback das rules já nega acesso do client):
`asaasCheckouts/{checkoutId}`, `trialClaims/{cnpjDigits}`. Opcional: `ASAAS_CHECKOUT_IMAGE_BASE64`
(imagem do item no checkout; `items[].imageBase64` é obrigatório no schema — hoje vai um PNG 1×1).

## A validar no sandbox antes de ir pra produção

- **Teste com cartão (nada disso foi testado ao vivo — a chave do `.env.local` é de produção):**
  - O Checkout RECURRENT com `nextDueDate` futuro **não cobra** no cadastro e o cartão é validado.
    A doc de assinatura via API diz "Na criação, o cartão é validado", mas a doc do Checkout não detalha
    a validação nem diz se há pré-autorização; confirmar no extrato do cartão de teste.
  - O campo `customer` é aceito no `POST /v3/checkouts` (está na prosa da doc, não no schema OpenAPI).
  - A resposta traz `link`; se não, o padrão `…/checkoutSession/show?id=` funciona no host do sandbox.
  - A assinatura criada traz `checkoutSession` e se herda o `externalReference` do checkout.
  - Quais eventos chegam e em que ordem (`CHECKOUT_PAID` com data futura? `SUBSCRIPTION_CREATED`?).
  - A `successUrl` (domínio cadastrado) redireciona para `/assinatura/retorno?gateway=asaas&trial=1`.
  - Cartão recusado no cadastro: confirmar que nenhuma assinatura é criada.
  - No D+7, a cobrança automática acontece e dispara `PAYMENT_CONFIRMED` (simular mudando a data no sandbox).

- Cartão: confirmar que, após pagar a 1ª fatura, o Asaas passa a cobrar sozinho nos ciclos seguintes.
- Formato exato do payload dos eventos `SUBSCRIPTION_*` e do header do webhook.
- Cláusula 3.2 do contrato ainda cita só InfinitePay/Pix/cartão pré-pago — ajustar com o jurídico (e subir `CONTRACT_VERSION`).
- `app/[locale]/privacidade/page.tsx` ainda lista a InfinitePay como processador de pagamentos.
