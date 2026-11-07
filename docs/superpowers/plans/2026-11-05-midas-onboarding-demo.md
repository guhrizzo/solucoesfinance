# Midas — demonstração conversacional guiada: Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tela `/[locale]/demo` onde a Midas conduz o visitante por um diagnóstico guiado até o cadastro do teste grátis de 7 dias, salvando o lead no Firestore.

**Architecture:** Motor de fluxo puro e testável (`lib/midas/*`) + UI cliente (`app/components/midas/*`) + rotas públicas `/api/midas/{lead,turn}` e autenticada `/api/midas/convert` (Admin SDK). IA (Claude) é opcional: sem `ANTHROPIC_API_KEY` o dicionário de sinônimos assume. O ícone flutuante da landing passa a navegar para `/demo`.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind, next-intl (pt-BR/en/es), Firebase Auth + Firestore (Admin SDK), lucide-react, `node:test` (`npm test` → `tests/**/*.test.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-05-midas-onboarding-demo-design.md`

## Global Constraints
- Assistente se chama **Midas** (nunca "Nexus"); produto "NexusFi".
- Teste grátis = `TRIAL_DAYS` (7) de `lib/billingPlans.ts`; nenhum preço, desconto, integração ou resultado inventado.
- Módulos citados só os da lista fechada `lib/midas/modules.ts`; Pro citável sem preço: cobrança por e-mail (Contas a Receber), leitor de NF (Impostos), RH, PDV, alertas de WhatsApp.
- Sem autenticação nova: CTA → `/register?lead=<sessionId>`. E-mail não é pedido na conversa; nome é opcional.
- Chave de IA só no servidor (`ANTHROPIC_API_KEY`); IA só roda após o aceite do aviso LGPD ("Ok, vamos lá").
- Lead em `demoLeads/{sessionId}`, só Admin SDK (`firestore.rules`: `allow read, write: if false`). Retenção 12 meses (`expiresAt`), cron diário apaga vencidos. Aviso de WhatsApp à equipe quando `completed`, 1 por sessão (padrão `app/api/onboarding/mentor-lead/route.ts`).
- Idiomas: textos em `messages/{pt-BR,en,es}/midas.json`, registrados em cada `messages/<locale>/index.ts`. Locale do chat = locale da URL.
- Não alterar áreas logadas nem os CTAs principais de cadastro da landing. `/api/chat` antigo permanece.
- Todo acesso a `localStorage`/`sessionStorage` em try/catch. Identidade visual existente (tokens de `globals.css`, Lucide, camada `.mkt`); sem hex novo (lint anti-hex).

## Review Focus
- Texto livre vazio, só emojis ou 800+ caracteres: Midas pede reformulação, não trava nem repete a etapa.
- Respostas que já respondem etapas futuras ("uso Excel e meu problema é estoque"): não perguntar de novo.
- Usuário volta uma etapa e muda a dor: contexto das etapas seguintes é recalculado, nada fica incoerente.
- Recarregar a página no meio: conversa retomada; sessão corrompida no storage é descartada sem erro.
- IA fora do ar, lenta ou devolvendo JSON inválido: fluxo estruturado continua normalmente.
- Mesmo `sessionId` enviado várias vezes / por outro IP / com payload gigante: upsert idempotente, truncado, com rate limit; não permite sobrescrever lead de outra sessão com `status` regredindo.
- Cadastro com `lead` inválido ou convert falhando: cadastro nunca bloqueia.
- Dois cliques em "Concluir": 1 só aviso de WhatsApp.

---

## File Structure
- `lib/midas/types.ts` — tipos compartilhados (Context, Segment, Pain, Tool, StepId, Lead).
- `lib/midas/modules.ts` — catálogo fechado de módulos + mapeamento dor→módulos.
- `lib/midas/interpret.ts` — texto livre → slots (dicionário 3 idiomas).
- `lib/midas/flow.ts` — máquina de estados: `nextStep`, `applyAnswer`, `progress`, `goBack`.
- `lib/midas/leadServer.ts` — validação/sanitização + upsert + convert (recebe `db`, testável com `tests/support/fakeFirestore.mjs`).
- `messages/*/midas.json` — copy.
- `app/api/midas/{lead,convert,turn}/route.ts`, `app/api/cron/demo-leads-cleanup/route.ts`.
- `app/components/midas/*` e `app/[locale]/demo/page.tsx` — UI.
- Modificar: `app/components/WhatsAppFab.tsx`, `app/[locale]/page.tsx` (link secundário), `app/[locale]/register/page.tsx`, `firestore.rules`, `vercel.json`, `app/components/tour/TourIllustration.tsx`, `messages/*/index.ts`, `app/globals.css`.

---

### Task 1: Tipos e catálogo de módulos

**Files:**
- Create: `lib/midas/types.ts`, `lib/midas/modules.ts`
- Test: `tests/midas/modules.test.mjs`

**Interfaces:**
- Produces: `type Segment = "loja"|"ecommerce"|"servicos"|"industria"|"distribuidora"|"outro"`; `type Pain = "financeiro"|"contas"|"estoque"|"vendas"|"impostos"|"relatorios"|"canais"|"tudo"`; `type Tool = "planilha"|"caderno"|"sistema"|"app_banco"|"memoria"|"contagem"|"marketplace"|"nenhum"`; `interface MidasModule { id: string; icon: string /* nome Lucide */; pro: boolean; tourStepId: string|null; animation: TourAnimation }`; `MIDAS_MODULES: readonly MidasModule[]`; `modulesForPain(pain: Pain): string[]` (2–3 ids, ordenados por relevância).

- [ ] **Step 1: Write failing test** — `modules.test.mjs`: todo `tourStepId` não nulo existe em `TOUR_STEPS`; `modulesForPain` retorna 2–3 ids existentes para cada `Pain`; `pro` é `true` exatamente para `cobrancaEmail`, `leitorNf`, `rh`, `pdv`, `alertasWhatsapp`; `estoque` → inclui `estoque`; `financeiro` → inclui `fluxoCaixa`.
- [ ] **Step 2: Run** `npm test -- tests/midas/modules.test.mjs` (ou `node --experimental-strip-types --no-warnings --import ./tests/support/register.mjs --test tests/midas/modules.test.mjs`); expect FAIL (módulo inexistente).
- [ ] **Step 3: Implement** os dois arquivos. Ids básicos: `fluxoCaixa, contasPagar, contasReceber, relatorios, estoque, vendas, integracoes, impostos, centroCustos, dashboard`. Reusar `TourAnimation` de `lib/tour/catalog.ts`; Pro sem etapa usam `tourStepId: null` e a animação do módulo mais próximo.
- [ ] **Step 4: Run** the test; expect PASS.
- [ ] **Step 5: Commit** `feat(midas): tipos e catalogo de modulos`.

### Task 2: Interpretador de texto livre

**Files:**
- Create: `lib/midas/interpret.ts`
- Test: `tests/midas/interpret.test.mjs`

**Interfaces:**
- Consumes: tipos da Task 1.
- Produces: `interpret(text: string): { segment?: Segment; pain?: Pain; tool?: Tool; visibilityGap?: boolean; wantsOverview?: boolean; yes?: boolean; no?: boolean; empty: boolean }` (dicionário combinado pt/en/es, normalização sem acentos/caixa).

- [ ] **Step 1: Write failing test** — casos: "uso Excel"/"google sheets"/"spreadsheet"/"hoja de cálculo" → `tool:"planilha"`; "não sei quanto ganho nem gasto" → `visibilityGap:true, pain:"financeiro"`; "vendo no mercado livre e shopee" → `segment:"ecommerce"`; "controlo na cabeça" → `tool:"memoria"`; "   "/"😀😀" → `empty:true`; texto de 2000 chars não lança erro; "uso Excel e meu problema é estoque" → `tool:"planilha", pain:"estoque"`.
- [ ] **Step 2: Run** expect FAIL. **Step 3: Implement** `interpret` (listas de regex por slot; sem dependências). **Step 4: Run** expect PASS. **Step 5: Commit** `feat(midas): interpretador de texto livre`.

### Task 3: Motor do fluxo

**Files:**
- Create: `lib/midas/flow.ts`
- Test: `tests/midas/flow.test.mjs`

**Interfaces:**
- Consumes: `interpret`, `modulesForPain`, tipos.
- Produces: `type StepId = "welcome"|"name"|"segment"|"pain"|"tool"|"deepen"|"diagnosis"|"modules"|"confirm"|"doubts"|"cta"`; `interface MidasState { step: StepId; ctx: Context; history: StepId[]; consented: boolean }`; `initialState(): MidasState`; `applyAnswer(state, answer: { chip?: string; text?: string }): MidasState` (preenche slots via chip id ou `interpret`, pula etapas cujos slots já estão preenchidos, nunca repete, texto vazio mantém a etapa com `ctx.retry = true`); `goBack(state): MidasState` (recalcula `ctx` das etapas posteriores); `progress(state): number` (0–1); `chipsFor(state): string[]` (ids de chips para a UI); `serialize/deserialize(state): string/MidasState|null` (descarta JSON inválido).

- [ ] **Step 1: Write failing tests** — percurso feliz financeiro→planilha→deepen→diagnosis→modules→confirm→cta com `ctx` esperado; "uso Excel e meu problema é estoque" na etapa `pain` pula `tool`; `goBack` após mudar dor altera `modulesForPain`; chip "conhecer primeiro" em `welcome` vai a overview e volta; `deserialize("{lixo")` → `null`; `progress` monotônico crescente exceto em `goBack`; 8 dores × 6 segmentos nunca chegam a `diagnosis` sem `segment` e `pain`.
- [ ] **Step 2: Run** expect FAIL. **Step 3: Implement** puramente funcional (sem I/O, sem React). **Step 4: Run** PASS. **Step 5: Commit** `feat(midas): motor do fluxo conversacional`.

### Task 4: Mensagens (3 idiomas)

**Files:**
- Create: `messages/pt-BR/midas.json`, `messages/en/midas.json`, `messages/es/midas.json`
- Modify: `messages/pt-BR/index.ts`, `messages/en/index.ts`, `messages/es/index.ts`
- Test: `tests/midas/messages.test.mjs`

**Interfaces:**
- Produces: namespace `midas` com `header.{title,subtitle}`, `privacy.{notice,link,retention}`, `steps.<StepId>.{bot[],chips{id:label}}`, `diagnosis.<pain>`, `modules.<id>.{name,description,benefit}`, `cta.{button,subtext}`, `errors.{network,retry,empty}`, `overview`. Modelo de texto: tom de consultora, sem preço.

- [ ] **Step 1: Write failing test** — para cada locale: todo `StepId`, todo `Pain` em `diagnosis`, todo `MIDAS_MODULES[].id` em `modules`, todo chip de `chipsFor` existe; en/es têm as mesmas chaves que pt-BR; nenhum texto contém "R$", "$", "desconto"/"discount"/"descuento", "Nexus,"; `cta.subtext` contém "7".
- [ ] **Step 2: Run** FAIL. **Step 3: Escrever** os JSON e registrar import em cada `index.ts` (segue o padrão "crie o .json e a linha aqui"). **Step 4: Run** PASS. **Step 5: Commit** `feat(midas): copy pt/en/es`.

### Task 5: Persistência do lead (lib + rotas + regras)

**Files:**
- Create: `lib/midas/leadServer.ts`, `app/api/midas/lead/route.ts`, `app/api/midas/convert/route.ts`
- Modify: `firestore.rules`
- Test: `tests/midas/lead.test.mjs`

**Interfaces:**
- Consumes: tipos, `getAdminDb`, `requireScope`, `checkRateLimit/getClientIp`, `sendWhatsAppAlert`.
- Produces: `sanitizeLeadInput(raw: unknown): LeadInput | null` (valida `sessionId` UUID, trunca strings/transcript a 40 mensagens × 800 chars, enums fechados); `upsertLead(db, input, now: number): Promise<{ status; justCompleted: boolean }>` (idempotente; status só avança `started→in_progress→completed→converted`; define `startedAt`, `expiresAt = startedAt + 12 meses`, `consent`); `markConverted(db, sessionId, uid): Promise<boolean>`; `POST /api/midas/lead` (público, rate limit 60/5min por IP) → ao `justCompleted` envia 1 aviso WhatsApp e grava `whatsapp` no doc; `POST /api/midas/convert` exige `requireScope`.

- [ ] **Step 1: Write failing tests** (com `tests/support/fakeFirestore.mjs`): sanitize rejeita sessionId inválido e trunca payload; upsert 2× não duplica e não regride status; `justCompleted` verdadeiro só na 1ª transição; `markConverted` com sessionId inexistente → `false` sem lançar; `expiresAt` = 12 meses.
- [ ] **Step 2: Run** FAIL. **Step 3: Implement** lib, rotas (sempre responder `{ ok }` e nunca expor erro técnico) e regra `match /demoLeads/{id} { allow read, write: if false; }` junto de `feedback`. **Step 4: Run** PASS. **Step 5: Commit** `feat(midas): persistencia de leads`.

### Task 6: IA opcional e limpeza de leads vencidos

**Files:**
- Create: `app/api/midas/turn/route.ts`, `lib/midas/prompt.ts`, `app/api/cron/demo-leads-cleanup/route.ts`
- Modify: `vercel.json`
- Test: `tests/midas/prompt.test.mjs`

**Interfaces:**
- Produces: `buildSystemPrompt(locale: string): string` (lista fechada de módulos com flag Pro, regras: sem preço/desconto/promessa, responder no idioma digitado, saída JSON `{ "slots": {...}, "reply": "…" }`); `parseTurn(raw: string): { slots: Partial<Context>; reply?: string } | null` (tolera JSON inválido → `null`); `POST /api/midas/turn` (público, rate limit 20/5min, `{ reply:null }` sem chave/erro, exige `consented:true` no corpo); cron `GET` com `Bearer CRON_SECRET` apagando `demoLeads` com `expiresAt < now` em lotes de 400; schedule `30 9 * * *` em `vercel.json`.

- [ ] **Step 1: Write failing test** — `parseTurn` para JSON válido, JSON com cerca \`\`\`json, lixo e `reply` > 800 chars truncado; `buildSystemPrompt` contém todos os ids de módulos, não contém "R$" e cita `7 dias`.
- [ ] **Step 2: Run** FAIL. **Step 3: Implement** (modelo/headers como em `app/api/chat/route.ts`). **Step 4: Run** PASS. **Step 5: Commit** `feat(midas): rota de IA e limpeza de leads`.

### Task 7: UI da demonstração

**Files:**
- Create: `app/[locale]/demo/page.tsx`, `app/components/midas/{MidasDemo,MidasHeader,MessageList,QuickReplies,ModuleCard,CtaCard}.tsx`
- Modify: `app/components/tour/TourIllustration.tsx` (aceitar `stepId` opcional), `app/globals.css` (classes `.midas-*` com tokens existentes)

**Interfaces:**
- Consumes: `flow.ts`, `modules.ts`, `messages midas`, `/api/midas/{lead,turn}`.
- Produces: `<MidasDemo />` cliente: aviso LGPD antes da 1ª mensagem (botão "Ok, vamos lá" = `consented`); digitação animada curta; rolagem automática; chips + input livre; progresso; voltar; retomada por `serialize/deserialize` (localStorage em try/catch); POST `/api/midas/lead` a cada avanço (fire-and-forget com retry simples) e `status:"completed"` ao chegar em `cta`; erro de rede mostra `errors.network` + retry sem perder histórico; cards de módulos com ícone Lucide, benefício, selo Pro e "ver prévia" usando `TourIllustration`; CTA "COMEÇAR MEU TESTE GRATUITO" → link `/register?lead=<sessionId>` via `@/i18n/navigation`; botão de WhatsApp humano visível; `?topic=<id>` pré-seleciona etapa/dor; página `noindex` não é necessário. Layout responsivo, tema claro/escuro.

- [ ] **Step 1:** Montar a página e componentes seguindo `WhatsAppFab`/`ui/` para estilo; sem teste unitário de UI (coberto na Task 9).
- [ ] **Step 2:** `npx tsc --noEmit` e `npm run lint`; expect sem erros nos arquivos novos.
- [ ] **Step 3:** Subir `preview_start` e abrir `/demo`; conferir primeira tela e um percurso; screenshot.
- [ ] **Step 4: Commit** `feat(midas): tela de demonstracao guiada`.

### Task 8: Integração com landing e cadastro

**Files:**
- Modify: `app/components/WhatsAppFab.tsx`, `app/[locale]/page.tsx`, `app/[locale]/register/page.tsx`
- Test: `tests/midas/leadParam.test.mjs` (função pura `readLeadParam(search: string, stored: string|null): string|null` em `lib/midas/leadParam.ts`)

**Interfaces:**
- Produces: `readLeadParam` valida UUID; FAB: clique navega para `/demo` e o listener `midas:open-topic` passa a navegar para `/demo?topic=<id>`; link secundário "Ver demonstração guiada" perto do hero (chave nova `landing.*` nos 3 idiomas); `register`: guarda `lead` em `sessionStorage` e, após criar a conta (e-mail e Google, incl. pending-link e desktop), chama `/api/midas/convert` com Bearer do ID token, fire-and-forget, nunca bloqueando o `router.push`.

- [ ] **Step 1: Write failing test** de `readLeadParam` (query válida, inválida, só storage, ambos). **Step 2: Run** FAIL. **Step 3: Implement** lib e edições. **Step 4: Run** PASS + `npx tsc --noEmit`. **Step 5: Commit** `feat(midas): FAB, landing e conversao no cadastro`.

### Task 9: Verificação ponta a ponta

- [ ] **Step 1:** `npm test` completo e `npm run lint`; expect tudo verde.
- [ ] **Step 2:** `preview_start`; percorrer `/demo` nos 3 idiomas, no mobile (`resize_window`), com e sem `ANTHROPIC_API_KEY`: ao menos financeiro×planilha, estoque×memória, vendas, "um pouco de tudo", texto livre ("uso Excel"), voltar, recarregar no meio, "quero conhecer primeiro", dúvida (IA off → fallback WhatsApp).
- [ ] **Step 3:** Confirmar no Firestore (emulador ou log) o doc `demoLeads/{id}` com `status:"completed"`, `expiresAt` e 1 só aviso de WhatsApp (`not_configured` sem credenciais); clicar no CTA e checar `/register?lead=<id>`; conferir `converted` após cadastro de teste local.
- [ ] **Step 4:** Rodar `/code-review` ou `superpowers:requesting-code-review` sobre o branch; corrigir; reportar o que não foi verificável (Meta WhatsApp, Claude real).

---
## Self-review
Cobertura da spec: fluxo/UI (T3,T7), módulos reais (T1), i18n (T4), lead+retenção+WhatsApp (T5,T6), IA opcional (T6), FAB/landing/cadastro (T8), testes e2e (T9). Tipos: `Segment/Pain/Tool/StepId/MidasState` definidos em T1/T3 e reutilizados com os mesmos nomes. Review Focus coberto por T2 (vazio/longo), T3 (pular etapa/voltar/estado corrompido), T5 (idempotência/status), T6 (JSON inválido), T8 (lead inválido).
