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
   `SUBSCRIPTION_DELETED`, `SUBSCRIPTION_INACTIVATED`.
2. **Minha conta → Informações → Dados comerciais**: cadastrar o domínio do site (exigido para o
   redirecionamento `successUrl` → `/assinatura/retorno?gateway=asaas`).
3. Ligar o envio de e-mails de cobrança ao cliente (boleto/fatura).

## Como o acesso é liberado

- `PAYMENT_CONFIRMED` (cartão) / `PAYMENT_RECEIVED` (boleto compensado) → `lib/billingApplyAsaas.ts`
  reconfere a cobrança na API, estende `currentPeriodEnd` (idempotente por `billingEvents/asaas_{id}`) e
  marca a assinatura como `authorized`.
- Boleto leva 1–2 dias úteis para compensar; a carência de 3 dias (`RENEWAL_GRACE_DAYS`) vale nas renovações.
- Cancelar renovação: `/api/billing/cancel` faz `DELETE /subscriptions/{id}`; o acesso pago segue até o fim do período.

## A validar no sandbox antes de ir pra produção

- Cartão: confirmar que, após pagar a 1ª fatura, o Asaas passa a cobrar sozinho nos ciclos seguintes.
- Formato exato do payload dos eventos `SUBSCRIPTION_*` e do header do webhook.
- Cláusula 3.2 do contrato ainda cita só InfinitePay/Pix/cartão pré-pago — ajustar com o jurídico (e subir `CONTRACT_VERSION`).
- `app/[locale]/privacidade/page.tsx` ainda lista a InfinitePay como processador de pagamentos.
