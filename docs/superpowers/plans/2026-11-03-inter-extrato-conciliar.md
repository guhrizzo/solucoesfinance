# Integração Banco Inter (etapa 1: conexão e extrato "a conciliar") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada usuário Pro conecta a própria conta Inter Empresas; o extrato é puxado (botão + cron diário) para uma fila "A conciliar" no Fluxo de Caixa, e só o que o usuário aprova vira lançamento.

**Architecture:** Segredos cifrados (AES-256-GCM, `INTER_ENC_KEY`) numa coleção raiz só-servidor; rotas Next (Node runtime) falam com o Inter via mTLS e gravam itens pendentes idempotentes; a conciliação roda no cliente em `writeBatch`, reaproveitando o caminho de gravação do Fluxo de Caixa (baixa automática + auditoria).

**Tech Stack:** Next.js (App Router, `app/[locale]`), Firebase Admin/Firestore, `node:https`/`node:crypto`, next-intl (pt-BR/en/es), testes `node --test` com `--experimental-strip-types` (`npm test`).

**Spec:** `docs/superpowers/specs/2026-11-03-inter-extrato-conciliar-design.md`

## Global Constraints

- Libs puras testadas em `tests/inter/*.test.mjs` importam por caminho **relativo com extensão** (`../../lib/x.ts`), sem alias `@/` (padrão de `tests/dashboard`).
- Rotas: `export const runtime = "nodejs"`; autorização por `requireScope` (`lib/apiScope.ts`), usando `scope.ownerUid`, nunca uid do corpo; gate `isProAccess` em todas (e no cron, pulando contas sem Pro).
- Segredos só no servidor: nenhuma resposta/log contém `secret`, `*Enc`, cert ou key.
- Chave: `INTER_ENC_KEY` (32 bytes base64 ou 64 hex), formato `v1:<iv>:<tag>:<cifrado>` de `lib/rh/crypto.ts`.
- Coleção `integracoesBanco/{ownerUid}`: regra `allow read, write: if false`. Status público em `users/{ownerUid}/profile/interStatus`. Fila em `users/{ownerUid}/interPendentes/{txKey}`.
- Primeira sincronização: últimos 30 dias; seguintes: desde `lastSyncAt` menos 3 dias. Sugestão: valor exato, data ±3 dias.
- Mês fechado: `criar`/`vincular` bloqueados; `ignorar` permitido.
- Textos novos em `messages/{pt-BR,en,es}`; navegação via `@/i18n/navigation`. CRUD completo na interface.
- Commit só quando o usuário pedir (regra do ambiente); os passos "Commit" abaixo viram "preparar para commit" até lá.

## Review Focus

- Sincronizar duas vezes seguidas não duplica itens (mesmo `txKey`).
- Item já resolvido (`conciliado`/`ignorado`) não volta a `pendente` numa nova sincronização.
- Extrato vazio, valor 0 e valor negativo/sinal invertido do Inter não quebram o parse.
- Lançamento manual idêntico já existente vira sugestão de **vincular**, nunca de criar.
- Dois lançamentos manuais candidatos para o mesmo item: a sugestão escolhe o mais próximo em data e não vincula o mesmo lançamento a dois itens.
- Certificado/credencial inválidos produzem erro legível e gravam `lastSyncError` sem apagar pendentes.

---

### Task 1: Criptografia dos segredos do Inter

**Files:**
- Create: `lib/interCrypto.ts`
- Test: `tests/inter/crypto.test.mjs`

**Interfaces:**
- Produces: `encryptInterSecrets(s: InterSecrets): EncryptedInterSecrets`, `decryptInterSecrets(e: EncryptedInterSecrets): InterSecrets`, tipos `InterSecrets = { clientId: string; clientSecret: string; certPem: string; keyPem: string; conta?: string }` e `EncryptedInterSecrets = { clientIdEnc: string; secretEnc: string; certEnc: string; keyEnc: string }`.

- [ ] **Step 1: Teste** `interCrypto roundtrip`: cifra e decifra um `InterSecrets` com `process.env.INTER_ENC_KEY` = 64 hex; afirma igualdade e que nenhum campo `*Enc` contém o texto original. `sem INTER_ENC_KEY lança`: sem a env, `encryptInterSecrets` lança erro com `/INTER_ENC_KEY/`.
- [ ] **Step 2:** `npm test` filtrando o arquivo; esperar FALHA (módulo inexistente).
- [ ] **Step 3: Implementar** em `lib/interCrypto.ts` usando `loadKey(process.env.INTER_ENC_KEY)`, `encryptText`, `decryptText` de `lib/rh/crypto.ts` (importar relativo com `.ts`); mensagem de erro troca "RH_ENC_KEY" por "INTER_ENC_KEY".
- [ ] **Step 4:** rodar; esperar PASS.
- [ ] **Step 5:** `git add lib/interCrypto.ts tests/inter/crypto.test.mjs` (commit quando o usuário pedir).

### Task 2: Parse do extrato e cliente mTLS

**Files:**
- Create: `lib/inter.ts`
- Test: `tests/inter/parse.test.mjs`

**Interfaces:**
- Produces: `type InterTx = { txKey: string; date: string /* YYYY-MM-DD */; amount: number /* positivo */; type: "entrada"|"saida"; description: string; counterparty?: string }`; `parseExtrato(raw: unknown): InterTx[]` (pura); `windowsBetween(from: string, to: string, maxDays?: number): Array<{ from: string; to: string }>` (pura, padrão 90); `fetchExtrato(secrets: InterSecrets, from: string, to: string): Promise<InterTx[]>`; `interTestConnection(secrets: InterSecrets): Promise<void>`; `certExpiresAt(certPem: string): number` (epoch ms, via `X509Certificate`).
- Consumes: `InterSecrets` da Task 1.

- [ ] **Step 1: Testes** (com fixtures inline no formato de resposta do Inter, **conferido na documentação oficial antes de escrever a fixture**): `parseExtrato mapeia crédito→entrada e débito→saida`; `txKey estável entre chamadas e distinto para transações iguais do mesmo dia (usa ordem)`; `extrato vazio → []`; `valor 0 é descartado`; `windowsBetween divide 200 dias em 3 janelas de ≤90 dias sem sobreposição nem buraco`.
- [ ] **Step 2:** rodar; FALHA.
- [ ] **Step 3: Implementar** `parseExtrato`, `windowsBetween`, `certExpiresAt` (puras) e `fetchExtrato`/`interTestConnection`. HTTP: `node:https` com `Agent({ cert, key })`, host `cdpj.partners.bancointer.com.br`; token em `/oauth/v2/token` (`client_credentials`, escopo de leitura de extrato), extrato em `/banking/v2/extrato` (usar `/extrato/completo` se for o paginado) e header `x-conta-corrente` quando `conta` existir. Confirmar caminhos/escopos na documentação oficial; erros mapeados para mensagens PT legíveis (certificado, credencial, limite).
- [ ] **Step 4:** rodar; PASS.
- [ ] **Step 5:** `git add lib/inter.ts tests/inter/parse.test.mjs`.

### Task 3: Motor de sugestão

**Files:**
- Create: `lib/interMatch.ts`
- Test: `tests/inter/match.test.mjs`

**Interfaces:**
- Produces: `type CashEntryLite = { id: string; type: "entrada"|"saida"; amount: number; date: string; description: string; category?: string; interTxId?: string }`; `type Suggestion = { kind: "vincular"; cashflowId: string } | { kind: "criar"; category: string }`; `suggestAll(txs: InterTx[], entries: CashEntryLite[]): Map<string, Suggestion>` (chave = `txKey`).
- Consumes: `InterTx` (Task 2); `CASHFLOW_CATEGORIES` de `lib/cashflowCategories.ts` (importar relativo com `.ts`).

- [ ] **Step 1: Testes**: `vincula quando tipo, valor e data ±3 dias batem`; `não vincula lançamento que já tem interTxId`; `com dois candidatos escolhe o de data mais próxima`; `dois itens iguais não vinculam o mesmo lançamento`; `sem candidato sugere criar com categoria válida de CASHFLOW_CATEGORIES (fallback "Outros recebimentos"/"Outros gastos")`; `tipo diferente nunca casa`.
- [ ] **Step 2:** rodar; FALHA.
- [ ] **Step 3: Implementar** guloso por proximidade de data, consumindo cada lançamento uma vez; descrição só desempata. Categoria sugerida por palavra-chave simples (ex.: "tarifa"→"Outros gastos"), sempre dentro da lista oficial.
- [ ] **Step 4:** rodar; PASS.
- [ ] **Step 5:** `git add lib/interMatch.ts tests/inter/match.test.mjs`.

### Task 4: Regras do Firestore e tipos compartilhados

**Files:**
- Modify: `firestore.rules`
- Create: `lib/interTypes.ts` (tipos `InterPendente`, `InterStatus`)
- Test: revisão manual das regras (sem emulador no repo)

**Interfaces:**
- Produces: `InterPendente = InterTx & { status: "pendente"|"conciliado"|"ignorado"; suggestion?: Suggestion; cashflowId?: string; createdAt: number; resolvedAt?: number; resolvedBy?: string }`; `InterStatus = { connected: boolean; contaMasked?: string; lastSyncAt?: number; lastSyncError?: string | null; certExpiresAt?: number }`.

- [ ] **Step 1:** adicionar `match /integracoesBanco/{id} { allow read, write: if false; }`.
- [ ] **Step 2:** em `users/{uid}/interPendentes/{id}`: ler e deletar nunca; `update` do cliente permitido só se `affectedKeys().hasOnly(["status","cashflowId","resolvedAt","resolvedBy","suggestion"])` e o usuário estiver no escopo da conta (mesmo helper dos demais ninhos); `create` negado. `profile/interStatus`: leitura pelo ninho, escrita negada ao cliente.
- [ ] **Step 3:** criar `lib/interTypes.ts`. Conferir sintaxe lendo as regras vizinhas (`accountScope`).
- [ ] **Step 4:** avisar na entrega que as regras precisam de deploy (`firebase deploy --only firestore:rules`).

### Task 5: Rotas de conexão e teste

**Files:**
- Create: `app/api/inter/conexao/route.ts`, `app/api/inter/testar/route.ts`

**Interfaces:**
- Produces: `POST /api/inter/conexao` (body: `clientId, clientSecret, certPem, keyPem, conta?`; grava `integracoesBanco/{ownerUid}` com `encryptInterSecrets`, escreve `profile/interStatus`); `PUT` (mesmos campos, todos opcionais exceto que cert+key vêm juntos); `DELETE` (apaga o documento de segredos e zera o status; mantém `interPendentes`); `POST /api/inter/testar` (chama `interTestConnection`, grava `lastSyncError`). Todas retornam `{ ok: true }` ou `{ error }`, nunca segredos.
- Consumes: Tasks 1, 2, 4; `requireScope`, `isProAccess`/estado de assinatura como as rotas Pro existentes (copiar o padrão de `app/api/analyze-nf-retencao/route.ts`), `checkRateLimit`.

- [ ] **Step 1:** Implementar as rotas: só dono (`scope.isOwner`), Pro, rate limit em `testar`; validar PEM (começa com `-----BEGIN`), calcular `certExpiresAt`; `contaMasked` mostra só os 4 últimos dígitos.
- [ ] **Step 2:** `npx tsc --noEmit` sem erros novos; teste manual com `curl` sem token → 401, e membro não-dono → 403.
- [ ] **Step 3:** `git add app/api/inter`.

### Task 6: Sincronização e cron

**Files:**
- Create: `lib/interSync.ts`, `app/api/inter/sincronizar/route.ts`, `app/api/cron/inter-sync/route.ts`
- Modify: `vercel.json` (novo cron diário, ex.: `"30 9 * * *"` → `/api/cron/inter-sync`)
- Test: `tests/inter/sync.test.mjs`

**Interfaces:**
- Produces: `planSync(args: { lastSyncAt?: number; now: number }): { from: string; to: string }` (pura; 30 dias na primeira vez, `lastSyncAt` − 3 dias depois); `mergePendentes(existing: Map<string, InterPendente>, incoming: InterTx[], suggestions: Map<string, Suggestion>, now: number): InterPendente[]` (pura; devolve só itens **novos**, nunca reabre existentes); `syncOwner(db: any, ownerUid: string, now?: number): Promise<{ novos: number }>` (grava via Admin SDK, atualiza `interStatus`, em erro grava `lastSyncError`).
- Consumes: Tasks 1–4; entradas do Fluxo de Caixa do período lidas de `users/{ownerUid}/cashflow` para as sugestões.

- [ ] **Step 1: Testes**: `planSync primeira vez = 30 dias`; `planSync seguinte = lastSyncAt-3d`; `mergePendentes ignora txKey já existente em qualquer status`; `mergePendentes com existente ignorado não reabre`; `duas execuções seguidas → segunda devolve []`.
- [ ] **Step 2:** rodar; FALHA.
- [ ] **Step 3: Implementar** `planSync`, `mergePendentes`, `syncOwner` (lê segredos, `decryptInterSecrets`, `windowsBetween` + `fetchExtrato`, `suggestAll`, grava com `set` em lote usando `txKey` como id). Rota `sincronizar`: `requireScope(req, <permissão do Fluxo de Caixa>)` (usar a chave que `CashFlow.tsx` já usa), Pro, rate limit. Cron: exige `Authorization: Bearer ${CRON_SECRET}` como `app/api/cron/rh-custos`; percorre `integracoesBanco` ordenando por `lastSyncAt` crescente, pula contas sem Pro, respeita um orçamento de tempo (para antes do `maxDuration`) e segue na próxima execução.
- [ ] **Step 4:** rodar; PASS. `npx tsc --noEmit`.
- [ ] **Step 5:** `git add lib/interSync.ts app/api/inter/sincronizar app/api/cron/inter-sync vercel.json tests/inter/sync.test.mjs`.

### Task 7: Aba "Banco Inter" em Configurações

**Files:**
- Create: `app/[locale]/configuracoes/BancoInterTab.tsx`
- Modify: `app/[locale]/configuracoes/page.tsx` (registrar a aba, visível só para dono Pro), `messages/pt-BR/configuracoes.json`, `messages/en/configuracoes.json`, `messages/es/configuracoes.json`

**Interfaces:**
- Consumes: rotas da Task 5 e `profile/interStatus` (leitura em tempo real); `authedFetch` de `lib/authedFetch.ts`.

- [ ] **Step 1:** Implementar a aba seguindo `WhatsAppTab.tsx` (estrutura, componentes `ui/`): estado da conexão, formulário (clientId, secret, conta, upload `.crt`/`.key` lidos como texto no navegador e enviados uma vez), Testar, Atualizar credenciais, Desconectar com confirmação, última sincronização, erro e banner de certificado perto de vencer (≤30 dias). Campos de segredo nunca pré-preenchidos.
- [ ] **Step 2:** Textos nos 3 idiomas (mesmas chaves).
- [ ] **Step 3:** Verificar no dev server (`preview_start dev`): aba aparece só para dono Pro, estados vazio/erro/conectado, sem erro no console; sem segredo no corpo das respostas (`read_network_requests`).
- [ ] **Step 4:** `git add` dos arquivos.

### Task 8: Fila "A conciliar" no Fluxo de Caixa

**Files:**
- Create: `app/components/InterConciliar.tsx`, `lib/interConciliar.ts`
- Modify: `app/components/CashFlow.tsx` (botão/badge "A conciliar" e render do painel), `messages/{pt-BR,en,es}/fluxoCaixa.json`
- Test: `tests/inter/conciliar.test.mjs`

**Interfaces:**
- Produces (`lib/interConciliar.ts`, pura): `canResolve(action: "criar"|"vincular"|"ignorar"|"desfazer", dateISO: string, closedMonths: Set<string>): boolean` (mês fechado bloqueia `criar`/`vincular`); `buildCashEntry(p: InterPendente, category: string): Omit<CashEntryLite, "id"> & { interTxId: string }`.
- Consumes: Tasks 3 e 4; o caminho de gravação de lançamento de `CashFlow.tsx` (extrair/exportar a função de gravação existente em vez de duplicar, para manter baixa automática e carimbos de auditoria); lista de meses fechados que o app já usa.

- [ ] **Step 1: Testes**: `canResolve bloqueia criar e vincular em mês fechado`; `canResolve permite ignorar em mês fechado`; `buildCashEntry copia tipo, valor, data e define interTxId = txKey`.
- [ ] **Step 2:** rodar; FALHA.
- [ ] **Step 3: Implementar** a lib pura e o componente: lista de pendentes (listener Firestore `interPendentes` com `status == "pendente"`), por data, com a sugestão; ações Confirmar, Vincular a outro… (seletor de lançamentos sem `interTxId`), Ignorar, aba "Ignorados" com Desfazer, "Confirmar sugestões" em lote, "Sincronizar agora" (chama `/api/inter/sincronizar`) e estado vazio/erro. Cada ação em **um** `writeBatch` (lançamento/vínculo + `status`, `cashflowId`, `resolvedAt`, `resolvedBy = authUid`). `criar` dispara a mesma baixa automática do formulário.
- [ ] **Step 4:** rodar; PASS. Verificar no dev server: criar baixa uma conta a receber homônima; vincular não duplica; mês fechado bloqueia; badge atualiza.
- [ ] **Step 5:** `git add` dos arquivos.

### Task 9: Verificação final

- [ ] **Step 1:** `npm test` (tudo verde) e `npx tsc --noEmit`, `npm run lint` sem erros novos.
- [ ] **Step 2:** Checar que nenhum arquivo ou resposta de API contém segredo (`grep -rn "clientSecret\|keyPem" app lib` só em rotas/libs esperadas, nunca em componentes de leitura nem logs).
- [ ] **Step 3:** Documentar pendências de implantação em `docs/inter-setup.md`: env `INTER_ENC_KEY`, `CRON_SECRET`, deploy de `firestore.rules`, como gerar a integração/certificado no Internet Banking Inter Empresas.
- [ ] **Step 4:** Rodar `/code-review` na branch antes de entregar.

## Self-Review (spec × plano)

- Conexão/CRUD, criptografia, status separado, regras: Tasks 1, 4, 5, 7.
- Sync sob demanda + cron, idempotência, janelas, primeira vez 30 dias: Tasks 2, 6.
- Fila, sugestão, mês fechado, `writeBatch`, `resolvedBy`, baixa automática: Tasks 3, 8.
- Pro-only, só dono na conexão, rate limit, i18n, validade do certificado, docs: Tasks 5–7, 9.
