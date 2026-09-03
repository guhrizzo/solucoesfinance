# Redesign de UI/UX — Unificação visual do app interno

## Contexto

Retoma e conclui o roadmap de UI iniciado em agosto:

- [2026-08-01-ui-fundacao-design.md](2026-08-01-ui-fundacao-design.md) — consolidou tokens e criou `app/components/ui/` (Button, Badge, Card, Modal, Input/MoneyInput, PageLoader, Sensitive). Adotado só por Navbar/Footer.
- [2026-08-02-ui-dashboard-fluxocaixa-design.md](2026-08-02-ui-dashboard-fluxocaixa-design.md) — migração rasa de Dashboard + CashFlow (corrigiu nomes de token quebrados, trocou modais). As páginas continuam com centenas de `style={{}}` inline.

As etapas 3–5 (contas, estoque, relatórios/impostos/centro de custos/usuários) nunca foram feitas. Aquele trabalho **explicitamente não redesenhou nada** — só unificou. Resultado hoje: metade das telas no sistema novo, metade no antigo, nenhuma com tratamento visual coerente. Medições atuais:

- **888** ocorrências de hex/`STATUS_META`/`colorMap`/`@import` de fonte/`var(--*-textN)` espalhadas
- **~1390** objetos `style={{}}` inline (dashboard 83, CashFlow 170, contas ~110 cada, estoque 149, relatórios 166)
- **3 escalas de token** coexistindo: `--db-*`, `--cf-*` (globals.css) e `--nav-*` (conceitualmente do Navbar, hoje já em globals.css mas ainda tratado como conjunto à parte)

Decisões do usuário nesta rodada (brainstorming, 2026-09-03):

- **Objetivo**: redesign visual **+** design system unificado (não só unificação).
- **Escopo**: só as telas internas. Landing (`app/page.tsx`), login, registro, criação de senha e onboarding **ficam como estão**.
- **Entrega**: construir a base nova e **migrar todas** as telas em escopo, faseado, com o app funcionando a cada fase.
- **Direção visual**: "você decide" — proposta apresentada e aceita via o artifact `direcao-visual.html`.
- **Fonte / navegação**: decisão delegada — resolvido nesta spec (ver abaixo).

## Direção visual

"Fintech limpa": fundo neutro de viés frio, um único azul de marca, verde/vermelho reservados a dinheiro e status, cartão gasto por papel (não carimbado em tudo), tabelas sem cartão — só divisória de 1px.

### Tokens (`app/globals.css`)

Um conjunto único de tokens semânticos substitui `--db-*`, `--cf-*` e `--nav-*`. Cada token tem par claro/escuro no `:root` / `[data-theme="dark"]`. Nomes:

| Papel | Token | Claro | Escuro |
|---|---|---|---|
| Fundo da página | `--bg` | `#f6f7f9` | `#0b0f17` |
| Superfície (card, painel) | `--surface` | `#ffffff` | `#141a24` |
| Superfície rebaixada (input, hover) | `--sunken` | `#eef0f4` | `#0f151e` |
| Borda | `--border` | `#e2e5ea` | `#232b38` |
| Borda forte (foco, divisor) | `--border-strong` | `#cfd4dc` | `#363f4e` |
| Texto | `--text` | `#16202e` | `#e6e9ee` |
| Texto secundário | `--text-muted` | `#5a6675` | `#99a3b2` |
| Texto terciário | `--text-subtle` | `#8a94a2` | `#67717e` |
| Marca | `--brand` | `#1f6feb` | `#4d92ff` |
| Marca (hover) | `--brand-hover` | `#1a5fd0` | `#6aa4ff` |
| Marca (fundo fraco) | `--brand-weak` | `#e9f1fd` | `rgba(77,146,255,.13)` |
| Entrada / positivo | `--pos` + `--pos-weak` | `#12854a` | `#3ecf7f` |
| Saída / negativo | `--neg` + `--neg-weak` | `#cf3d3d` | `#f2695f` |
| Atenção | `--warn` + `--warn-weak` | `#b0751a` | `#e0a53d` |
| Sombra de elevação | `--shadow-pop` | (só modal/dropdown) | idem |

Raio: card `12px`, controle `8px`, pill `999px`. Sombra: praticamente ausente — só `--shadow-pop` em modal e dropdown; separação é feita por borda.

**Compatibilidade durante a migração**: `--db-*` e `--cf-*` **permanecem definidos** como alias para os tokens novos até a última fase, para não quebrar telas ainda não migradas. São removidos na fase final.

Os `--status-*` e `--entrada-*`/`--saida-*` existentes são mantidos e realinhados aos novos `--pos`/`--neg`/`--warn`.

### Tipografia

- **Títulos e rótulos curtos**: Sora (mantida — é a identidade atual), só em `h1`–`h4` e labels caps.
- **Corpo, tabelas, formulários**: **Hanken Grotesk** (nova, via `next/font`). Mais legível que Sora a 13–14px em tabela densa.
- **Todo valor monetário e data**: JetBrains Mono, `font-variant-numeric: tabular-nums` (colunas de R$ alinham na vírgula).

Remove todos os `<style>@import url(fonts.googleapis…)</style>` restantes nas telas em escopo. `body` usa a pilha `--font-hanken`.

### Componentes (`app/components/ui/`)

A pasta cresce e vira **obrigatória** — nenhuma tela em escopo pode ter `style={{}}` de cor/layout ad-hoc ao terminar sua fase. Além dos existentes (revisados para os tokens novos):

| Componente | Substitui | API essencial |
|---|---|---|
| `Button` (revisar) | gradientes inline + `.btn-*` do globals.css | `variant`: primary/secondary/ghost/danger · `size` · `icon` · `loading`. **Sem gradiente** — cor sólida. |
| `Pill` (novo, absorve `Badge`) | `STATUS_META`, `colorMap`, `.badge-*` | `tone`: pos/neg/warn/info/muted · ponto opcional |
| `Field` (novo) + `Input`/`MoneyInput` (revisar) | `<label>`+`<input>` manuais repetidos | `label` · `hint` · `error` · agrupa em `<Field>` |
| `Table` (novo) | `<table>`/`<div>` de linha estilizados por página | `columns` + `rows` render-props · alinhamento de número · hover · header caps · scroll-x próprio |
| `KpiTile` (novo, absorve `Card variant="kpi"`) | tiles de KPI reimplementados por página | `label` · `value` · `delta` · `tone` |
| `PageHeader` (novo) | cabeçalho de página (título + ações) copiado por tela | `title` · `subtitle` · `badge` · `actions` |
| `Modal` (manter) | — | já ok; só re-tokenizar |
| `EmptyState` (novo) | telas vazias improvisadas | `icon` · `title` · `description` · `action` |

Regra: componentes de `ui/` **só** leem tokens — zero hex. ESLint (ver abaixo) passa a barrar hex em `app/**/page.tsx` e componentes de conteúdo.

### Navegação (`Navbar.tsx` + `AppShell.tsx`)

Re-skin completo para os tokens novos **+ limpeza estrutural contida**:

- O `<style>{css}` gigante embutido em `Navbar.tsx` (≈300 linhas) sai para uma folha dedicada / módulo, consumindo só tokens.
- Mantém o toggle horizontal ↔ vertical e todo o comportamento (não foi pedido para mudar).
- Mantém o mecanismo já corrigido na Fundação (offset via CSS `data-nav-layout`, sem MutationObserver).
- `user` mock default (`"Carlos Mendes"`), `notifications` hardcoded e a busca decorativa **permanecem como estão** — não são objeto deste trabalho.

## Arquitetura de código

Cada página em escopo é quebrada durante sua fase:

- Página (`app/<rota>/page.tsx`) fica só com: auth/scope gate, wiring de dados, composição de seções. Alvo < 300 linhas.
- Lógica de dados (listeners Firestore, derivações, cálculos) sai para `app/<rota>/use<Rota>Data.ts` (ou vários hooks se fizer sentido).
- Blocos visuais grandes viram componentes locais em `app/<rota>/components/` — cada um < 300 linhas, uma responsabilidade.
- **Zero mudança de lógica de negócio, cálculo, listener ou endpoint** durante a migração. É refactor de apresentação + extração, verificável por diff de comportamento.

Nada de reorganização de pastas fora do que serve a migração.

## Fases

Cada fase: própria entrada de plano, implementação, validação em browser, commit. O app compila e funciona ao fim de cada uma.

0. **Base** ✅ — tokens novos em `globals.css` (com alias de compat), `Hanken_Grotesk` no `layout.tsx`, revisar `ui/` existentes + criar `Pill`/`Field`/`Table`/`KpiTile`/`PageHeader`/`EmptyState`, regra ESLint anti-hex, rota de QA `app/design-system/page.tsx`.
1. **Navegação** ✅ — `Navbar` re-skinado, `<style>{css}` de ~290 linhas → `app/components/Navbar.css` (só tokens). Comportamento (toggle h/v, drawer, bottom nav) intacto. `AppShell` já estava ok; `Footer` não é usado nas telas internas.
2. **Dashboard** ✅ — sweep de cor: `<style>` → `app/dashboard/dashboard.css`; `colorMap`, rampa do donut, literais Tailwind de cor → tokens. Extração de `useDashboardData`/componentes **não feita** (ver nota).
3. **Fluxo de caixa** ✅ — sweep de cor: `<style>` redundante removido (sobrou `app/components/cashflow.css` com `.cf-group-*`); ~55 hex/gradientes → tokens. Quebra de `CashFlow.tsx` **não feita**.
4. **Contas a pagar + receber + `CadastroPanel`** ✅ — `<style>` (com `@import` de fonte) removidos; ~200 hex → tokens; `CadastroPanel` `accent + "18"` → `color-mix`.
5–6. **Impostos + Centro de custos** ✅ — `<style>` removidos; cores semânticas → tokens; paletas categóricas de imposto/centro → `--cat-1..8`.
7–10. **Estoque, Vendas, Relatórios, Usuários, Configurações** ✅ — sweep de cor; marcas ML/Shopee → tokens `--brand-ml-*`/`--brand-shopee-*`; logo Google mantido (trademark, `eslint-disable` pontual).
   - Correção transversal: 201 usos de `var(--cf-text2/3)` / `var(--db-text2/3)` (nomes sem hífen, variáveis inexistentes) em 10 arquivos.
11. **Trava** ✅ — regra ESLint anti-hex elevada a `error` para as telas migradas (`ignores` cobre landing/auth/dev). Alias `--db-*`/`--cf-*` **mantidos** (ver nota).

### O que ficou de fora (execução conservadora)

Sem sessão de login no ambiente, as telas internas (auth-gated) não puderam ter QA
visual. Para não quebrar telas invisíveis, a migração foi **sweep de cor + extração de
`<style>`**, não a refatoração arquitetural completa:

- **Alias `--db-*`/`--cf-*` mantidos**: as páginas ainda referenciam `var(--cf-card)`
  etc. estruturalmente. Os alias apontam para os tokens novos, então o sistema **está**
  unificado; trocar cada `var(--cf-*)` pelo nome novo é cosmético e fica para depois.
- **Páginas gigantes não quebradas**: `useDashboardData`, `TransactionTable` etc. não
  foram extraídos. Requer QA rodando local.
- **Componentes `ui/` novos** (`PageHeader`, `KpiTile`, `Table`, `EmptyState`) criados e
  validados em `/design-system`, mas **ainda não adotados** pelas páginas — a adoção
  troca markup e precisa de olho humano.
- `STATUS_META`/`colorMap` continuam como objetos, mas agora com **valores em token**.
- Classes `.btn-*` legadas mantidas (agora sólidas, sem gradiente) — algumas páginas usam.

## Validação (feita)

- `npx tsc --noEmit`: **0 erros** novos (baseline: só stale `.next/types`).
- `npm run build`: compila; warning de CSS do Lightning corrigido.
- `npx eslint app`: **0 erros** novos (165 pré-existentes `no-explicit-any` etc.
  inalterados); warnings de hex: 705 → 93 (as 93 restantes são telas fora do escopo).
- `/design-system` conferido em tema claro **e** escuro; tokens computados no DOM ok;
  alias `--cf-*`/`--db-*` resolvendo para os valores novos.
- **Telas internas não conferidas visualmente** (auth-gated, sem sessão no ambiente) —
  conferir rodando local: `/dashboard`, `/fluxo-caixa`, `/contasPagar`, `/contasReceber`,
  `/impostos`, `/costCenter`, `/estoque`, `/vendas`, `/relatorios`, `/users`,
  `/configuracoes`, em claro e escuro.

## Fora de escopo

- Landing page, login, registro, criação de senha, onboarding (`OnboardingModal.tsx`).
- Qualquer mudança de lógica de negócio, cálculo, listener Firestore, regras do Firestore, endpoints de IA, geração de PDF, sync ML/Shopee.
- Rebrand (nome NexusFi, logo) — mantidos.
- Mudança de comportamento da navegação (toggle horizontal/vertical fica).
- `app/debug`, `app/developer` (páginas internas de diagnóstico).
- Substituir o `user` mock / `notifications` hardcoded do Navbar por dados reais.
