# Aba Integrações e conexão bancária só por adm supremo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reunir as integrações numa aba "Integrações" (marketplaces duplicados da Estoque + bancos), e fazer com que só adm supremo conecte/atualize/teste/desconecte o Inter, em nome do cliente.

**Architecture:** O núcleo de conexão do Inter sai das rotas de cliente para `lib/interConexaoServer.ts`; rotas novas `/api/admin/inter/*` (só adm supremo, alvo = dono de conta resolvido pelo e-mail) o usam e gravam auditoria; as rotas de cliente passam a responder 403. A UI ganha a aba Integrações com um componente de marketplaces extraído da Estoque, cartões bancários somente leitura e o painel do adm.

**Tech Stack:** Next.js (App Router, `app/[locale]`), Firebase Admin/Firestore, next-intl (pt-BR/en/es), testes `npm test` (`node --test`, `--experimental-strip-types`).

**Spec:** `docs/superpowers/specs/2026-11-05-aba-integracoes-admin-design.md` (depende de `docs/superpowers/specs/2026-11-03-inter-extrato-conciliar-design.md`). Trabalho como acréscimo na branch `feat/inter-extrato` (PR 31).

## Global Constraints

- Adm supremo = `isSupremeAdminEmail` (`lib/compAccounts.ts`), verificado **no servidor** pelo ID token via `requireScope`; nunca por corpo/cliente. `scope.isSupremeAdmin` já existe em `lib/apiScope.ts`.
- Imports sem extensão `.ts` (relativos sem extensão ou `@/...`), em código do app e em testes; rodar `npx tsc --noEmit` (limpo) antes de reportar.
- Segredos (client secret, certificado, chave) nunca voltam ao navegador, nem ao adm; nunca em log nem em auditoria.
- Textos em `messages/{pt-BR,en,es}` com chaves idênticas; sem cores hex (tokens do design system); comentários em português; regra do usuário: CRUD completo na interface.
- O adm só atua em **donos de conta**: recusar membro (existe `users/{uid}/profile/access`), login de portal (`customClaims.portalOnly === true`) e e-mail inexistente.
- Conectar/atualizar/testar exigem cliente Pro ou cortesia; **desconectar não exige Pro**.
- Auditoria uma vez ao final da ação, inclusive em falha (`ok:false`); falha de gravação da auditoria não desfaz a ação.
- Retorno do OAuth: só caminhos `/estoque` ou `/configuracoes` (com ou sem prefixo de idioma `/pt-BR|/en|/es`), sem query; qualquer outra coisa → `/estoque`.
- A Estoque **não muda de comportamento**; Shopee continua oculta pela flag atual; `/api/inter/sincronizar` e o cron não mudam.
- Commits locais na branch `feat/inter-extrato` com trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; sem push.

## Review Focus

- E-mail de **membro** ou de login de portal na busca/escrita do adm → recusado (T3 testa `resolveTarget`).
- E-mail com maiúsculas/espaços ou lixo → normalizado/recusado (T3 testa `normalizeEmail`).
- Tentativas de open redirect no `returnTo` (`//evil.com`, `https://x`, `/estoque/../x`, `/estoque?x=1`, `\\evil`) → `/estoque` (T1 testa `parseReturnTo`).
- Cookie de retorno ausente/expirado/adulterado → `/estoque` (T1).
- Chamada de rota de adm por não adm → 403 (T3 testa `assertAdmin`; T4 aplica em todas as rotas).
- Dono chamando `/api/inter/conexao` ou `/testar` → 403 com mensagem clara (T4).
- Auditoria nunca contém segredo/PEM e é gravada também em falha (T3 testa `writeAuditoria`).

---

### Task 1: Retorno do OAuth por rota permitida

**Files:**
- Create: `lib/oauthReturn.ts`
- Modify: `app/api/auth/{mercadolivre,shopee,tiktokshop,shein}/redirect/route.ts` (ler `returnTo`, gravar cookie), `app/api/auth/{mercadolivre,shopee,tiktokshop,shein}/callback/route.ts` (o helper `redirectEstoque` de cada um passa a usar a base vinda do cookie)
- Test: `tests/inter/oauthReturn.test.mjs`

**Interfaces:**
- Produces: `RETURN_COOKIE = "oauth_return"`; `parseReturnTo(raw: string | null | undefined): string` (devolve o caminho normalizado, ex.: `/configuracoes` ou `/en/configuracoes`, ou `/estoque`); `returnBaseFromCookieHeader(cookieHeader: string | null): string`.

- [ ] **Step 1: Testes** (nomes e asserções): `parseReturnTo aceita /estoque e /configuracoes`; `aceita prefixo de idioma pt-BR/en/es`; `rejeita //evil.com, https://x.com, /estoque/../x, /estoque?x=1, \\evil, "", null, undefined, /outra` → todos `"/estoque"`; `returnBaseFromCookieHeader lê oauth_return`, `sem cookie → /estoque`, `valor adulterado → /estoque`.
- [ ] **Step 2:** rodar `npm test` filtrando o arquivo; FALHA (módulo inexistente).
- [ ] **Step 3: Implementar** `lib/oauthReturn.ts` (puro, lista permitida por comparação exata do caminho depois de remover prefixo de idioma opcional).
- [ ] **Step 4:** nos 4 `redirect`, ler `returnTo` da query, `parseReturnTo`, gravar cookie `RETURN_COOKIE` (httpOnly, SameSite=Lax, path "/", 10 min); nos 4 `callback`, o helper `redirectEstoque` usa `returnBaseFromCookieHeader(request.headers.get("cookie"))` como caminho base (mantendo os mesmos parâmetros `integration`/`message`) e limpa o cookie na resposta. Sem cookie o comportamento é idêntico ao atual (`/estoque`). Cobrir também o ramo mock dos redirects.
- [ ] **Step 5:** `npm test` (tudo) e `npx tsc --noEmit` limpos; commit `feat(integracoes): retorno do OAuth por rota permitida`.

### Task 2: Núcleo de conexão do Inter fora das rotas

**Files:**
- Create: `lib/interConexaoServer.ts`
- Modify: `app/api/inter/conexao/route.ts`, `app/api/inter/testar/route.ts` (passam a chamar o núcleo; comportamento idêntico por enquanto)
- Modify: `lib/interTypes.ts` (`InterStatus.configuradoPelaEquipe?: boolean`)
- Test: `tests/inter/conexaoServer.test.mjs`

**Interfaces:**
- Consumes: `ConexaoInput`, `validateConexaoBody`, `maskConta` (`lib/interConexao.ts`); `encryptInterSecrets/decryptInterSecrets` (`lib/interCrypto.ts`); `interTestConnection`, `certExpiresAt` (`lib/inter.ts`); `SERVER_CONFIG_ERROR` (`app/api/inter/_guard.ts`).
- Produces: `type InterAccountResult = { ok: true; certExpiresAt?: number; contaMasked?: string } | { ok: false; status: number; error: string }`; `connectInter(db: Firestore, ownerUid: string, input: ConexaoInput, opts?: { configuradoPelaEquipe?: boolean }): Promise<InterAccountResult>`; `updateInter(db, ownerUid, input: ConexaoInput, opts?): Promise<InterAccountResult>`; `disconnectInter(db, ownerUid): Promise<InterAccountResult>`; `testInter(db, ownerUid): Promise<InterAccountResult>`.

- [ ] **Step 1: Testes** com Firestore falso (`tests/support/fakeFirestore.mjs` ou fake local como em `tests/inter/sync.test.mjs`) e `INTER_ENC_KEY` de teste: `connectInter grava segredos cifrados e interStatus.connected=true sem lastSyncAt`; `connectInter com configuradoPelaEquipe grava interStatus.configuradoPelaEquipe=true`; `updateInter parcial (só conta) preserva cert/key e atualiza contaMasked`; `updateInter cert sem key → erro 400`; `disconnectInter apaga integracoesBanco e deixa interStatus.connected=false e sem lastSyncAt`; `INTER_ENC_KEY ausente → {ok:false,status:500,error:SERVER_CONFIG_ERROR}`; nenhum retorno contém clientSecret/PEM.
- [ ] **Step 2:** rodar; FALHA.
- [ ] **Step 3: Implementar** movendo para o núcleo a lógica hoje em `conexao/route.ts` (POST/PUT/DELETE, `checkCertKey`) e `testar/route.ts` (teste de conexão e `lastSyncError`), sem mudar mensagens nem regras (inclui resetar `lastSyncAt` no POST/DELETE e a transação/`batch.update` do PUT). As rotas ficam finas: guarda → validação do corpo → núcleo → resposta.
- [ ] **Step 4:** `npm test` (tudo) e `tsc` limpos; commit `refactor(inter): nucleo de conexao fora das rotas`.

### Task 3: Alvo do adm, auditoria e regras

**Files:**
- Create: `lib/interAdminTarget.ts`
- Modify: `firestore.rules` (coleção `auditoriaIntegracoes`)
- Test: `tests/inter/adminTarget.test.mjs`

**Interfaces:**
- Produces: `normalizeEmail(raw: unknown): string | null` (trim, minúsculas, ≤254, formato básico); `assertAdmin(scope: { isSupremeAdmin: boolean }): { ok: true } | { ok: false; status: 403; error: string }`; `type AdminTargetDeps = { getUserByEmail(email: string): Promise<{ uid: string; email?: string; displayName?: string; customClaims?: Record<string, unknown> } | null>; hasAccessDoc(uid: string): Promise<boolean>; isPro(uid: string, email: string | null): Promise<boolean> }`; `resolveTarget(rawEmail: unknown, deps: AdminTargetDeps): Promise<{ ok: true; ownerUid: string; email: string; nome: string; pro: boolean } | { ok: false; status: number; error: string }>` (e-mail inválido 400, inexistente 404 "Cliente não encontrado.", membro 422, portal 422); `type AuditoriaEntry = { adminUid: string; adminEmail: string; alvoOwnerUid: string; alvoEmail: string; provider: "inter"; acao: "conectar" | "atualizar" | "testar" | "desconectar"; ok: boolean; erro?: string }`; `writeAuditoria(db: Firestore, entry: AuditoriaEntry): Promise<void>` (nunca lança; grava `at: Date.now()`; `erro` truncado a 200 caracteres e sem trechos de PEM).

- [ ] **Step 1: Testes**: `normalizeEmail aceita " Foo@Bar.com " e devolve "foo@bar.com"; rejeita "", "x", 300 chars, não-string`; `assertAdmin nega isSupremeAdmin=false com 403 e aceita true`; `resolveTarget rejeita e-mail inexistente (404)`, `rejeita membro (hasAccessDoc=true) com 422`, `rejeita portalOnly=true com 422`, `aceita dono e devolve pro conforme isPro`, `não devolve uid fora de ownerUid`; `writeAuditoria grava uma vez com ok:false e erro truncado`, `remove PEM do erro` (entrada com `-----BEGIN` → não aparece), `não lança se o Firestore falhar`.
- [ ] **Step 2:** rodar; FALHA.
- [ ] **Step 3: Implementar** o módulo (puro exceto `writeAuditoria`, que recebe `db`). Em `firestore.rules`: `match /auditoriaIntegracoes/{id} { allow read, write: if false; }` com comentário em português (o dono do documento é só o servidor); conferir que nenhum match genérico a reabre.
- [ ] **Step 4:** `npm test` e `tsc` limpos; commit `feat(inter): alvo do adm, auditoria e regras`.

### Task 4: Rotas de adm e bloqueio das rotas de cliente

**Files:**
- Create: `app/api/admin/inter/_guard.ts`, `app/api/admin/inter/cliente/route.ts`, `app/api/admin/inter/conexao/route.ts`, `app/api/admin/inter/testar/route.ts`
- Modify: `app/api/inter/conexao/route.ts`, `app/api/inter/testar/route.ts` (todos os métodos respondem 403)

**Interfaces:**
- Consumes: `requireScope` (`lib/apiScope.ts`), `assertAdmin`, `resolveTarget`, `writeAuditoria`, `normalizeEmail` (Task 3), `connectInter/updateInter/disconnectInter/testInter` (Task 2), `validateConexaoBody` (`lib/interConexao.ts`), `checkRateLimit`, `resolveScopeSubscription` + `isProAccess`/cortesia como em `app/api/inter/_guard.ts`.
- Produces: `guardAdmin(req: Request): Promise<{ scope: ApiScope } | NextResponse>` (requireScope → `assertAdmin` → rate limit `admin-inter:${scope.uid}` 30/10 min); `POST /api/admin/inter/cliente` body `{ email }` → `{ ok: true, nome, email, pro, conexao: InterStatus | null }` (sem uid); `POST|PUT|DELETE /api/admin/inter/conexao` body `{ clienteEmail, ...campos de ConexaoInput }`; `POST /api/admin/inter/testar` body `{ clienteEmail }`. Respostas: `{ ok: true, ... }` ou `{ error }`.

- [ ] **Step 1: Implementar** `guardAdmin` e as 3 rotas: em cada chamada **re-resolver** o e-mail (`resolveTarget` com deps reais: `getAdminAuth().getUserByEmail`, doc `users/{uid}/profile/access`, Pro do alvo); POST/PUT/testar exigem `pro`, DELETE não; chamar o núcleo com `{ configuradoPelaEquipe: true }` em POST/PUT; `writeAuditoria` ao final, com `ok` conforme o resultado; nunca devolver uid nem segredo; `INTER_ENC_KEY` ausente → `SERVER_CONFIG_ERROR`.
- [ ] **Step 2:** as rotas `/api/inter/conexao` e `/api/inter/testar` de cliente passam a responder 403 `{ error: "A conexão bancária é feita pela equipe NexusFi. Fale com o suporte." }` em POST/PUT/DELETE (e POST de testar); `/api/inter/sincronizar` intocada.
- [ ] **Step 3: Verificação:** `npx tsc --noEmit` limpo; `npm test` verde; checagem de leitura: nenhuma rota de adm lê `uid` do corpo; grep confirma que nenhuma resposta inclui `clientSecret|certPem|keyPem|secretEnc`.
- [ ] **Step 4:** commit `feat(inter): rotas de adm para conectar banco em nome do cliente`.

### Task 5: Componente compartilhado de marketplaces

**Files:**
- Create: `app/components/integracoes/MarketplaceConnections.tsx`
- Modify: `app/[locale]/estoque/page.tsx` (o conteúdo do modal de integrações, ~linhas 1374-1574, e os handlers de conectar/desconectar passam a vir do componente; **sem mudança de comportamento**)

**Interfaces:**
- Consumes: Task 1 (`returnTo` na URL de redirect: `/api/auth/${platform}/redirect?userId=...&returnTo=...`); coleção `integracoes` (`where userId == ownerUid`); flags `SHOPEE_UI_VISIVEL`/`SHEIN_UI_VISIVEL` (mover para constantes exportadas de um arquivo comum).
- Produces: `default function MarketplaceConnections(props: { ownerUid: string; returnTo: "/estoque" | "/configuracoes"; showToast: (msg: string, type?: "success" | "error") => void }): JSX.Element` (lista os canais com status do token, conectar e desconectar com a mesma confirmação/mensagens de hoje); `useIntegrationReturnToast(showToast): void` (trata `?integration=…&message=…` ao voltar do OAuth, com os mesmos toasts; usado pela Estoque no lugar do efeito inline e pela aba nova).

- [ ] **Step 1:** ler os trechos da Estoque (estado `integracoes`, `statusToken`, handlers de conectar ~linhas 740-780 e desconectar ~576-602, efeito dos toasts ~296-350, JSX do modal) e extrair para o componente; a Estoque continua dona do modal e do botão que o abre, e renderiza `<MarketplaceConnections returnTo="/estoque" .../>` dentro dele.
- [ ] **Step 2: Verificação de equivalência:** `tsc` limpo; eslint nos arquivos tocados sem erros novos (a Estoque pode ter erros antigos: comparar contagem); `npm test` verde; diff revisado confirmando que nenhuma regra de negócio mudou (mesmas chamadas, mesmos textos/chaves `estoque.integrationsModal.*` e `estoque.toast.*`). Se houver ambiente com login, abrir Estoque → Integrações e conferir; senão registrar que não foi possível.
- [ ] **Step 3:** commit `refactor(estoque): conexoes de marketplace em componente compartilhado`.

### Task 6: Aba Integrações (cliente) e cartões bancários

**Files:**
- Create: `app/[locale]/configuracoes/IntegracoesTab.tsx`, `app/[locale]/configuracoes/BancosPagamentosSection.tsx`
- Modify: `app/[locale]/configuracoes/page.tsx` (aba `integracoes` no lugar de `bancoInter`; visível só para dono com escopo e assinatura carregados, como `showInter` hoje), `messages/{pt-BR,en,es}/configuracoes.json`

**Interfaces:**
- Consumes: `MarketplaceConnections` (Task 5, `returnTo="/configuracoes"`), `InterStatus` com `configuradoPelaEquipe` (Task 2), listener de `users/{ownerUid}/profile/interStatus` (como em `BancoInterTab.tsx`), `INSTITUICOES_EM_BREVE`.
- Produces: `IntegracoesTab(props: { ownerUid: string; isPro: boolean; isAdmin: boolean; showToast: ... })` com seção Marketplaces, seção Bancos e pagamentos (cartão do Inter somente leitura: conectado/desconectado, conta mascarada, última sincronização, erro, aviso de certificado ≤30 dias/vencido, "configurado pela equipe", atalho para a fila "A conciliar" no Fluxo de Caixa; desconectado → texto "Fale com a equipe NexusFi para conectar seu banco"; não-Pro → aviso de plano) e cartões "Em breve" sem ação para `INSTITUICOES_EM_BREVE = ["pagbank", "mercadopago", "stone", "cielo"]`; quando `isAdmin`, renderiza o painel da Task 7 (slot por prop `adminSlot?: ReactNode`).

- [ ] **Step 1:** implementar seguindo `WhatsAppTab.tsx`/`BancoInterTab.tsx` (design system, sem hex); reaproveitar a lógica de status/validade do certificado já existente; i18n nos 3 idiomas com chaves idênticas (namespace `integracoes`).
- [ ] **Step 2:** substituir a aba `bancoInter` por `integracoes` em `page.tsx`; membros nunca veem a aba.
- [ ] **Step 3: Verificação:** `tsc` limpo; eslint dos arquivos novos limpo; paridade das chaves nos 3 idiomas conferida por script; se houver como logar, checar renderização; senão registrar.
- [ ] **Step 4:** commit `feat(integracoes): aba Integracoes com marketplaces e bancos somente leitura`.

### Task 7: Painel "Conectar em nome do cliente" (adm)

**Files:**
- Create: `app/[locale]/configuracoes/AdminConectarCliente.tsx`
- Delete: `app/[locale]/configuracoes/BancoInterTab.tsx` (o formulário migra para o painel; manter helpers de leitura de arquivo reaproveitados)
- Modify: `messages/{pt-BR,en,es}/configuracoes.json` (mover/renomear chaves `bancoInter.*` do formulário para o namespace do painel, sem sobras nem faltas)

**Interfaces:**
- Consumes: rotas da Task 4 via `authedFetch` (`/api/admin/inter/cliente`, `/conexao`, `/testar`); `IntegracoesTab` slot `adminSlot` (Task 6).
- Produces: `AdminConectarCliente(props: { showToast: ... })`: campo de e-mail → Buscar (mostra nome, e-mail, plano Pro sim/não, status da conexão atual) → formulário (clientId, clientSecret como password, conta opcional, upload `.crt`/`.key` lidos como texto) com Conectar, Atualizar (só campos preenchidos; cert+key juntos), Testar, Desconectar (confirmação padrão do app). Segredos nunca pré-preenchidos, limpos após sucesso e ao trocar de cliente; erro do servidor mostrado como veio.

- [ ] **Step 1:** implementar mantendo as proteções do formulário atual (limites de tamanho, leitura de arquivo com tratamento de erro, trava de duplo clique com `useRef`, limpeza de segredos).
- [ ] **Step 2:** ligar no `IntegracoesTab` apenas quando `isAdmin`; remover `BancoInterTab.tsx` e referências; paridade das chaves de i18n.
- [ ] **Step 3: Verificação:** `tsc` limpo; eslint limpo nos arquivos novos; grep confirmando que nenhum componente de leitura referencia `clientSecret|keyPem|certPem`; se houver como logar como adm, testar Buscar com e-mail de membro (recusa), de dono Pro (aceita) e Conectar→Testar→Desconectar contra um ambiente de teste; senão registrar o que não foi verificado.
- [ ] **Step 4:** commit `feat(integracoes): painel do adm para conectar banco em nome do cliente`.

### Task 8: Documentação e verificação final

**Files:**
- Modify: `docs/inter-setup.md`

- [ ] **Step 1:** atualizar o guia: a conexão agora é feita pelo adm supremo em Configurações → Integrações → "Conectar em nome do cliente"; o cliente só vê o status; rotas de cliente bloqueadas; auditoria em `auditoriaIntegracoes` (deploy das regras novamente); seção de checagem de segredos.
- [ ] **Step 2:** `npm test`, `npx tsc --noEmit` e `npm run lint` (separar erros antigos dos novos); varredura de segredos (`clientSecret|keyPem|certPem|secretEnc`) só em servidor/painel do adm.
- [ ] **Step 3:** commit `docs(inter): conexao feita por adm supremo`.

## Self-Review (spec × plano)

- Aba Integrações, marketplaces duplicados sem mexer na Estoque, Shopee oculta: Tasks 5-6.
- Bancos só leitura para o cliente, "em breve", atalho para a fila, "configurado pela equipe": Tasks 2, 6.
- Só adm supremo; alvo = dono, recusa membro/portal/inexistente; Pro do cliente (desconectar livre); sem uid nem segredo no navegador; busca e escrita re-resolvem o e-mail: Tasks 3-4, 7.
- Rotas de cliente 403, `sincronizar`/cron intactos: Task 4.
- Auditoria (uma vez, inclusive em falha, sem segredo) + regra do Firestore: Task 3 (gravação) e Task 4 (uso).
- Retorno do OAuth por lista permitida, padrão `/estoque`: Task 1 (e uso na Task 5).
- Atualizar parcial, aba "Banco Inter" removida, i18n em 3 idiomas: Tasks 2, 6-7.
