# Revisão de UI/UX — Etapa 1: Fundação (App Interno)

## Contexto geral do projeto

O pedido original foi "revisar e aprimorar toda a UI/UX do site". O site tem dois universos visuais distintos:

1. **App interno** (dashboard, fluxo-caixa, contasPagar, contasReceber, costCenter, estoque, impostos, relatorios, users) — usa os tokens `--db-*`/`--cf-*` de `globals.css`.
2. **Landing page pública** (`app/page.tsx`) — já tem um visual mais maduro (gradiente azul, glass cards).

Dado o tamanho (~7.300 linhas só nas páginas do app interno), o trabalho foi decomposto em sub-projetos, cada um com sua própria spec → plano → implementação:

**Ordem acordada:**
1. **App interno** (esta frente — maior volume de uso, maior inconsistência)
   1. **Fundação** ← *esta spec*
   2. Dashboard + Fluxo de caixa
   3. Contas a pagar + Contas a receber
   4. Estoque
   5. Relatórios + Impostos + Centro de custos + Usuários
2. Login / Cadastro / Onboarding
3. Landing page (ajustes finos)

**Motivação do usuário** (confirmada em brainstorming): inconsistência visual entre telas, visual datado/pouco profissional, e usabilidade — especificamente navegação/menu, cadastro de lançamentos/contas, e o módulo de estoque.

**Direção visual**: manter a identidade atual (azul `#1565c0` + fonte Sora), sem redesenho de marca — o trabalho é de unificação e refino, não de reinvenção.

## Problema — achados técnicos

Levantados por exploração direta do código antes do brainstorming:

- **Três sistemas de tokens coexistindo**: `globals.css` define `--db-*`/`--cf-*`; `Navbar.tsx` define seu próprio conjunto `--nav-*` com valores hardcoded (`#1565c0` etc.) desconectado de `globals.css`; páginas individuais cravam hex diretamente em objetos JS (`STATUS_META` em `contasPagar/page.tsx`, `CATEGORIES`, `colorMap` em `dashboard/page.tsx`).
- **Bug de dark mode**: badges de status (`STATUS_META.pendente.bg = "#fef9c3"` etc.) usam hex fixo — não trocam no tema escuro, ao contrário dos tokens `--db-*`/`--cf-*` que têm variante `[data-theme="dark"]`.
- **Fonte duplicada**: cada página injeta `<style>@import url(fonts.googleapis.com/.../Sora...)</style>`, apesar de `layout.tsx` já carregar Sora via `next/font` (`--font-sora`). O `body` em `globals.css` nem usa essa variável — usa uma pilha de fontes de sistema.
- **Hack de layout via DOM**: o toggle horizontal↔vertical do Navbar (`useNavbarLayout.ts` + efeito em `Navbar.tsx:434-456`) usa `MutationObserver` para injetar `marginLeft` inline em todo filho direto de `<body>`. Frágil — qualquer elemento novo escapa do ajuste, e não é uma solução CSS.
- **Nenhum componente primitivo compartilhado**: botões, badges, cards, modais e inputs monetários são reimplementados com estilo inline em cada página, o que é a causa raiz da inconsistência visual relatada.

## Solução

### 1. Tokens (`app/globals.css`)

- Paleta de marca consolidada em torno de `#1565c0` (valor hoje usado na landing/navbar/dashboard, prevalece sobre o `#3b82f6` isolado do `globals.css`), expressa como escala `--brand-400/500/600` etc.
- `--db-*` e `--cf-*` passam a ser vistos como um conjunto único de tokens de superfície/texto/borda, com variantes claro/escuro preservadas. **Não é uma renomeação destrutiva nesta etapa** — as variáveis `--db-*`/`--cf-*` continuam existindo e resolvendo para os mesmos valores consolidados, para não quebrar páginas que ainda não foram migradas (etapas 2–5).
- Cores de status viram tokens semânticos (ex.: `--status-success-bg`, `--status-warning-bg`, `--status-danger-bg`, `--status-info-bg`, cada um com par claro/escuro), preparados para substituir `STATUS_META`, `CATEGORIES` e `colorMap` quando cada página for migrada.
- `--nav-*` (hoje só dentro de `Navbar.tsx`) é removido; `Navbar.tsx` passa a consumir os tokens globais diretamente.
- Remove os `<style>@import googleapis...</style>` duplicados nos arquivos tocados nesta etapa (`Navbar.tsx`, `Footer.tsx`); `body` em `globals.css` passa a usar `var(--font-sora)`.

### 2. Componentes primitivos (`app/components/ui/`)

Novo diretório com componentes pequenos e isolados, todos consumindo exclusivamente os tokens da seção 1 (zero cor hardcoded):

| Componente | Substitui | API essencial |
|---|---|---|
| `Button` | `.btn-primary/success/danger/secondary` (globals.css) e variantes inline duplicadas | `variant`: primary/success/danger/secondary/ghost · `size` · `icon` · `loading` |
| `Badge` / `StatusPill` | `STATUS_META`, `.badge-pago/recebido/pendente`, `colorMap` | `status` semântico (`"pago"`, `"vencido"`, `"entrada"` etc.) resolve cor via token |
| `Card` | `.cf-card`, `.kpi-card`, `.chart-card`, `.side-card` (hoje quase idênticos) | `variant`: default/kpi/interactive · `padding` |
| `Modal` | modais duplicados em contasPagar/contasReceber/OnboardingModal | `open` · `onClose` · `size` — resolve overlay/blur/animação uma única vez |
| `Input` / `MoneyInput` | inputs manuais + `parseAmount`/`formatAmount` duplicados | `MoneyInput` centraliza a máscara BRL hoje copiada por página |

Estes componentes são criados e testados nesta etapa, mas **só são adotados pelo Navbar/Footer aqui**. A adoção nas páginas de conteúdo (dashboard, contas, estoque...) acontece nas etapas 2–5, quando cada uma for revisada.

### 3. Shell de navegação

Mantém o Navbar visualmente como está e preserva a funcionalidade do toggle horizontal↔vertical (não foi pedido para mudar o comportamento). Corrige o mecanismo:

- Remove o `MutationObserver`/injeção de `marginLeft` via JS.
- Introduz um novo componente cliente `AppShell` (`app/components/AppShell.tsx`) que lê `useNavbarLayout()` e renderiza `<div className="app-shell" data-layout={layout}>{children}</div>`. `layout.tsx` (Server Component) passa a envolver `{children}` com `<AppShell>{children}</AppShell>` — único ponto que já envolve todas as páginas. O recuo do conteúdo é feito via CSS condicional (`[data-layout="vertical"] { padding-left: 260px }` ou equivalente), eliminando o risco de layout shift e a fragilidade de depender de observar mutações do DOM. `Navbar.tsx` deixa de gerenciar o recuo do conteúdo — só emite o próprio menu/sidebar.

### Escopo desta etapa (arquivos tocados)

- `app/globals.css`
- `app/components/ui/*.tsx` (novo)
- `app/components/AppShell.tsx` (novo)
- `app/components/Navbar.tsx`
- `app/components/Footer.tsx`
- `app/layout.tsx`

Dashboard, contasPagar, contasReceber, estoque, relatorios, impostos, costCenter, users **não são alterados nesta etapa** — continuam funcionando exatamente como hoje, consumindo os tokens legados que permanecem compatíveis.

### Validação

Mudança de UI — validada visualmente no browser após a implementação:
- Navbar em tema claro e escuro
- Toggle de layout horizontal ↔ vertical (desktop)
- Menu mobile (hambúrguer + bottom nav)
- Footer
- Passada rápida por Dashboard e Contas a Pagar para confirmar que a consolidação de tokens não quebrou nada visualmente (mesmo sem serem migrados ainda)

## Fora de escopo (nesta etapa)

- Migrar o conteúdo de qualquer página de módulo para os novos componentes `ui/` (etapas 2–5)
- Remover os tokens legados `--db-*`/`--cf-*`/`STATUS_META`/`colorMap` (só depois que todas as páginas migrarem, na etapa 5)
- Redesenhar o padrão de navegação (manter horizontal↔vertical como está)
- Qualquer mudança na landing page pública ou nas telas de login/cadastro (frentes 2 e 3 do roadmap geral)
