# Integração Banco Inter — Etapa 1: conexão e extrato "a conciliar"

**Data:** 2026-11-03
**Status:** rascunho para aprovação
**Etapas seguintes (fora deste documento):** 2) cobrança (boleto/Pix Inter em Contas a Receber), 3) pagamentos (Contas a Pagar).

## Intenção e porquê

Hoje o extrato bancário entra no NexusFi por upload (`/api/analyze-extract`, via IA) e o
usuário lança à mão. O objetivo é que cada cliente do NexusFi conecte a **própria** conta
Inter Empresas e o extrato chegue sozinho, para que a baixa automática de Contas a Receber
e a Pagar (já existente, disparada por lançamentos no Fluxo de Caixa) passe a funcionar sem
digitação. É a base das etapas 2 e 3.

## Metas

- Qualquer usuário (dono da conta) conecta, testa, edita e desconecta a sua conta Inter.
- O extrato é puxado sob demanda ("Sincronizar agora") e por cron diário.
- Nada entra no Fluxo de Caixa sem aprovação: os lançamentos do Inter caem numa fila
  **"A conciliar"**; o usuário confirma, vincula a um lançamento existente ou ignora.
- Nunca duplicar: sincronizar duas vezes, ou conciliar algo que o usuário já lançou à mão,
  não gera lançamento repetido.
- Segredos do Inter nunca chegam ao navegador nem ao Firestore em texto puro.

## Não-metas

- Boleto, Pix de cobrança, webhooks do Inter (etapa 2).
- Pagamentos/transferências a partir do app (etapa 3).
- Outros bancos / Open Finance.
- Conciliação automática sem aprovação do usuário.
- Conta pessoal (PF) do Inter: só Inter Empresas, que é a que tem API.

## Anti-metas (seria falha mesmo funcionando)

- Vazar certificado/segredo (log, resposta de API, Firestore legível pelo cliente).
- Um usuário enxergar ou sincronizar a conta de outro (sempre `ownerUid` vindo do token,
  nunca do corpo da requisição — padrão de `lib/apiScope.ts`).
- Lançamento duplicado no Fluxo de Caixa; saldo que não bate com o banco.
- Mexer em mês já fechado sem o bloqueio que o app já aplica.

## Restrições

- Next.js em Vercel (serverless, Node runtime; rotas com `export const runtime = "nodejs"`).
  A chamada mTLS é feita com `node:https` + `Agent({cert, key})`; `fetch` global não serve.
- API do Inter Empresas (confirmar contra a documentação oficial na hora de construir):
  host `cdpj.partners.bancointer.com.br`, token OAuth2 `client_credentials` por mTLS
  (`/oauth/v2/token`, escopo de leitura de extrato), extrato em `/banking/v2/extrato`
  (e `/extrato/completo` paginado), janela máxima de consulta por chamada (≈90 dias),
  header `x-conta-corrente` quando há mais de uma conta. Token dura ~1 h.
- Criptografia em repouso reaproveita `lib/rh/crypto.ts` (AES-256-GCM). Hoje a chave é
  `RH_ENC_KEY`; usar uma chave própria (`INTER_ENC_KEY`) para não acoplar as duas coisas.
- Firestore: regras em `firestore.rules`; precisa deploy das regras novas.
- i18n obrigatório: textos novos em `messages/{pt-BR,en,es}`; navegação via `@/i18n/navigation`.
- Regra do usuário: toda entidade nova tem criar/ler/editar/excluir na interface, com
  bloqueios seguros (mês fechado, vínculos).

## Abordagens consideradas

1. **Só cron (puxar a cada X horas).** Simples, mas sem botão o usuário espera.
2. **Webhook do Inter (empurrar).** Tempo real, mas o Inter só oferece webhook para Pix e
   cobrança, não para o extrato completo. Não atende esta etapa; fica para a etapa 2.
3. **Botão sob demanda + cron diário (escolhida).** Mesma rota atende os dois; cobre o
   extrato inteiro; o webhook entra depois sem retrabalho. **Escolhida pelo usuário.**

Importação: **fila "A conciliar"** (escolhida pelo usuário) em vez de entrada direta no
Fluxo de Caixa, para evitar duplicar com lançamentos já feitos à mão.

## Design

### 1. Dados

- `integracoesBanco/{ownerUid}` (coleção raiz, **só Admin SDK**; regra `allow read, write: if false`
  para clientes): `{ provider: "inter", clientId, secretEnc, certEnc, keyEnc, conta, createdAt,
  updatedAt, lastSyncAt, lastSyncError }`. Campos `*Enc` no formato de `encryptText`.
- `users/{ownerUid}/profile/interStatus` (legível pelo cliente conforme o ninho): `{ connected,
  conta (mascarada), lastSyncAt, lastSyncError, certExpiresAt }`. Nunca contém segredo.
- `users/{ownerUid}/interPendentes/{txKey}`: `{ txKey, date, amount, type: "entrada"|"saida",
  description, counterparty?, status: "pendente"|"conciliado"|"ignorado", suggestion?,
  cashflowId?, createdAt, resolvedAt?, resolvedBy? }`. `txKey` = id da transação do Inter
  (ou hash estável de data+valor+descrição+ordem se o Inter não der id), usado como id do
  documento — é o que torna a sincronização idempotente.
- Lançamento do Fluxo de Caixa criado/vinculado ganha `interTxId` (mesmo `txKey`).

### 2. Servidor

- `lib/inter.ts`: token (cache em memória por execução), `fetchExtrato(conta, de, ate)`
  paginado e fatiado em janelas, parse para `InterTx[]`, tratamento de erro legível
  (certificado inválido/expirado, credencial revogada, rate limit).
- `lib/interCrypto.ts`: fina camada sobre `lib/rh/crypto.ts` com `INTER_ENC_KEY`.
- `lib/interMatch.ts` (**puro, testável**): dado um `InterTx` e os lançamentos do Fluxo de
  Caixa do período, sugere vínculo (mesmo tipo, valor igual, data ±3 dias, descrição
  parecida, lançamento ainda sem `interTxId`) ou categoria para novo lançamento.
- Rotas (todas com `requireScope`, e só dono mexe na conexão):
  - `POST/PUT/DELETE /api/inter/conexao` — conectar (upload de cert+key+clientId+secret),
    atualizar credenciais, desconectar (apaga segredos; pendentes já resolvidos ficam).
  - `POST /api/inter/testar` — pede token e faz uma consulta curta.
  - `POST /api/inter/sincronizar` — puxa o extrato desde `lastSyncAt` menos 3 dias de
    sobreposição (primeira vez: últimos 30 dias), grava só `txKey` inéditos em
    `interPendentes` com sugestão calculada.
  - `GET /api/cron/inter-sync` — mesmo trabalho para todas as contas conectadas, com
    `CRON_SECRET`, em lotes para caber no tempo da função; entra em `vercel.json`.
  - **Conciliar roda no cliente, não em rota.** A baixa automática (`settledReceivableId`) e
    os carimbos de auditoria vivem no cliente (`app/components/CashFlow.tsx`,
    `lib/receivableCashflowSync.ts`, `lib/audit.ts`), então a ação `criar` usa exatamente o
    mesmo caminho de gravação do formulário do Fluxo de Caixa. Cada ação é um `writeBatch`
    único: grava/vincula o lançamento (com `interTxId`) **e** vira o item para `conciliado`
    no mesmo lote, garantindo que nunca fique pela metade. Ações: `criar`, `vincular`
    (marca `interTxId` num lançamento existente), `ignorar`, `desfazer-ignorar`.
    `resolvedBy` vem do membro logado (padrão `authUid`). As regras do Firestore permitem ao
    cliente escrever em `interPendentes` só alterando `status`/`cashflowId`/`resolvedAt`/
    `resolvedBy`; nunca criar itens (só o servidor cria).
    Mês fechado: `criar` e `vincular` ficam bloqueados (item continua pendente até reabrir
    o mês); `ignorar` continua permitido.

### 3. Interface

- **Configurações → aba "Banco Inter"**: estado da conexão, formulário (clientId, secret,
  conta, upload `.crt`/`.key`), Testar, Atualizar credenciais, Desconectar (com
  confirmação), última sincronização e erro.
- **Fluxo de Caixa → "A conciliar"** (badge com contagem): lista por data; cada linha mostra
  valor, descrição e a sugestão (vincular a X / criar em categoria Y); ações Confirmar,
  Vincular a outro…, Ignorar; lote "confirmar sugestões"; filtro por Ignorados com Desfazer.
  Botão "Sincronizar agora".
- Estados vazios e de erro (cert expirado, credencial inválida) com mensagem acionável.

### 4. Segurança

- Segredos só no servidor; resposta das rotas nunca ecoa campo `*Enc` nem o secret.
- Logs sem credenciais nem corpo do extrato.
- Rate limit em `testar` e `sincronizar` (padrão `lib/rateLimit.ts`).
- Avisar o usuário o prazo do certificado do Inter (`certExpiresAt`) para evitar queda silenciosa.

## Decisões minhas (marcadas para você conferir)

- Chave própria `INTER_ENC_KEY` em vez de reaproveitar `RH_ENC_KEY`.
- Primeira sincronização busca 30 dias; sobreposição de 3 dias nas seguintes.
- Segredos em coleção raiz só-servidor, status público separado.
- Tolerância de sugestão: valor exato, data ±3 dias.
- Recurso restrito ao plano Pro, via `isProAccess` (**decidido pelo usuário**). O gate vale
  para as rotas, a aba de Configurações, a fila "A conciliar" e o cron (contas sem Pro são ignoradas).
- Permissões: conexão (aba Configurações) só do dono; a fila "A conciliar" usa a mesma
  permissão do Fluxo de Caixa (sem `PermissionKey` nova); sincronizar exige essa permissão.
- Uma conexão Inter por conta (id do documento = `ownerUid`); várias contas/CNPJs ficam para depois.
- Saldo: informativo apenas. Não há reconciliação de saldo com o banco nesta etapa; a meta
  "saldo que bate" significa não duplicar nem perder lançamentos.
- `certExpiresAt` vem de `X509Certificate` do `node:crypto` no upload; só banner de aviso
  na aba e na fila (sem e-mail/WhatsApp nesta etapa).
- Cron em lotes com cursor simples (`lastSyncAt` por conta + ordenação por ele); quantas
  contas por execução depende do timeout do plano Vercel — medir ao construir.

## Perguntas em aberto

Nenhuma.

## Deixado para quem constrói

- Layout exato da fila e dos componentes (seguir `ui/` do design system atual).
- Formato de paginação/janelas do cliente HTTP do Inter e política de retry.
- Testes: `lib/interMatch.ts` e o parse do extrato com testes unitários (padrão `tests/`).
