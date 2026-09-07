# Plano de implementação — i18n multi-idioma (pt-BR / en / es)

Spec de referência: [2026-09-06-i18n-multi-idioma-design.md](2026-09-06-i18n-multi-idioma-design.md).

Cada fase é um lote fechável e testável por si só (`npm run lint` +
`tsc --noEmit` + verificação no navegador) antes de passar pra próxima.
Checkboxes marcam progresso.

**Regra que vale pra todas as fases:**
- pt-BR é a fonte da verdade. Toda chave nasce em `messages/pt-BR/<ns>.json`;
  `en` e `es` recebem exatamente o mesmo conjunto de chaves.
- Ao migrar um arquivo, mover **todo** texto visível pra mensagens — não deixar
  string pela metade.
- Nada de tradução "de improviso" em português: o texto pt-BR das mensagens é
  cópia literal do que já estava no JSX.
- Rodar o teste de paridade de chaves (Fase 1) ao fim de cada fase.

---

## Fase 1 — Infra (nenhuma tela traduzida ainda)

Objetivo: app 100% funcional e 100% em pt-BR, mas já rodando sobre o next-intl.

> **Status (commit inicial da branch `feat/i18n-multi-idioma`):** 1.1–1.5,
> 1.6 (só o `lib/format.ts`), 1.7 (só o hook cookie-only), 1.8, 1.9 e o build
> de 1.10 concluídos e verificados (build de produção limpo, 71 páginas;
> `tsc` limpo; `eslint app/` idêntico ao master: 164/94). Desvios do plano
> original:
> - `middleware.ts` → **`proxy.ts`** (nome novo do Next 16).
> - `next-intl` v4 não valida locale com `notFound()` em `request.ts`; a
>   validação fica no `LocaleLayout` (`hasLocale` + `notFound()`), e o
>   fallback de chave é feito por **deep-merge com pt-BR** em vez de
>   `getMessageFallback`.
> - Mensagens importadas **estaticamente** via `messages/<locale>/index.ts`
>   (o `import()` dinâmico com template string corria com o Turbopack em dev).
> - Nova rota **`app/[locale]/[...rest]/page.tsx`** (`notFound()`) pro 404
>   estilizado dentro do locale + **`app/not-found.tsx`** mínimo na raiz.
> - Swap dos `toBRL`/`toLocale*` das páginas: **adiado** pras fases de cada
>   área (o locale vira dinâmico lá). Persistência do idioma no Firestore:
>   **movida pra Fase 3** (junto da UI de "Idioma").
> - Quirk conhecido, só em dev (Turbopack): o **primeiro** request a cada
>   rota `/[locale]` durante o cold-compile loga `SyntaxError: Unexpected end
>   of JSON input` e responde 500; o retry imediato responde 200. Não ocorre
>   em produção (`next build` + `next start` limpos).

### 1.1 Dependências e config

- [ ] `npm i next-intl`
- [ ] `next.config.js` → converter pra usar `createNextIntlPlugin('./i18n/request.ts')`
      envolvendo o `nextConfig` atual (manter o bloco `headers()` / CSP intacto).
- [ ] Nenhuma mudança de CSP necessária (next-intl não carrega recurso externo).

### 1.2 Arquivos base de i18n

- [ ] `i18n/routing.ts`:
  ```ts
  import { defineRouting } from 'next-intl/routing';
  export const routing = defineRouting({
    locales: ['pt-BR', 'en', 'es'],
    defaultLocale: 'pt-BR',
    localePrefix: 'as-needed',
    localeCookie: { name: 'NEXT_LOCALE', maxAge: 60 * 60 * 24 * 365 },
  });
  ```
- [ ] `i18n/navigation.ts`: `createNavigation(routing)` → exporta `Link`,
      `useRouter`, `usePathname`, `redirect`, `getPathname`.
- [ ] `i18n/request.ts`: `getRequestConfig` que:
  - valida o `locale` recebido contra `routing.locales` (senão `notFound()`);
  - carrega e faz merge dos namespaces JSON do locale
    (`messages/<locale>/*.json` — usar `import` dinâmico glob ou lista
    explícita de namespaces);
  - `onError`: em dev, `console.warn` para `MISSING_MESSAGE`; em prod, silencia;
  - `getMessageFallback`: cai para a mensagem pt-BR da mesma chave.
- [ ] `middleware.ts` (raiz):
  ```ts
  import createMiddleware from 'next-intl/middleware';
  import { routing } from './i18n/routing';
  export default createMiddleware(routing);
  export const config = {
    matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
  };
  ```

### 1.3 Reorganização de pastas

- [ ] `git mv` de cada pasta/arquivo de rota de `app/` para `app/[locale]/`:
      `page.tsx`, `not-found.tsx`, `acessibilidade/`, `assinatura/`,
      `configuracoes/`, `contasPagar/`, `contasReceber/`, `costCenter/`,
      `dashboard/`, `debug/`, `design-system/`, `developer/`, `estoque/`,
      `fluxo-caixa/`, `impostos/`, `login/`, `privacidade/`, `register/`,
      `relatorios/`, `users/`, `vendas/`.
- [ ] **Não** mover: `api/`, `components/`, `hooks/`, `lib/`, `types/`,
      `globals.css`, favicons/ícones, `layout.tsx` (será tratado a seguir).
- [ ] Conferir imports relativos quebrados pós-move. A maioria usa alias
      `@/` — checar os poucos `../` que cruzavam a fronteira
      (ex. `page.tsx` → `./components/...` vira `../components/...`).
      Preferir trocar por `@/app/components/...` onde aparecer.
- [ ] `app/layout.tsx` novo, mínimo:
  ```tsx
  export default function RootLayout({ children }: { children: React.ReactNode }) {
    return children;
  }
  ```
  (Next 16 exige um layout na raiz de `app/`; ele não pode renderizar
  `<html>` porque o `[locale]/layout.tsx` é que conhece o idioma.)
- [ ] `app/[locale]/layout.tsx` = o layout atual, com:
  - `export function generateStaticParams()` → `routing.locales.map(locale => ({locale}))`;
  - `params: Promise<{ locale: string }>` → `const { locale } = await params`;
  - `if (!hasLocale(routing.locales, locale)) notFound()`;
  - `setRequestLocale(locale)` (habilita render estático);
  - `<html lang={locale} suppressHydrationWarning>` (era `"pt-BR"` fixo);
  - envolver `{children}` (ou o `AppShell`) com
    `<NextIntlClientProvider>` (sem prop `messages` — o provider puxa do
    contexto do request; passar só o necessário se algum client component
    exigir).
  - manter `ThemeInitializer`, `ForceMotion`, `AppShell`, `CookieConsent`,
    `AccessibilityWidget`, o skip link e o `<script>` inline.
- [ ] `metadata` estático do layout atual → `generateMetadata` recebendo
      `locale` (ainda lendo strings pt-BR fixas nesta fase; migra na Fase 2).

### 1.4 Script inline pré-hidratação (`app/[locale]/layout.tsx`)

- [ ] Adicionar, no topo da IIFE, o strip do prefixo de idioma antes de
      qualquer comparação com `location.pathname`:
  ```js
  var seg = location.pathname.split('/')[1];
  var path = (seg === 'en' || seg === 'es')
    ? location.pathname.slice(seg.length + 1) || '/'
    : location.pathname;
  ```
  e trocar os usos de `location.pathname` por `path` na checagem de
  `internalPrefixes` / `data-has-nav`.

### 1.5 Wrappers de navegação

- [ ] Trocar `import ... from 'next/link'` / `'next/navigation'` por
      `'@/i18n/navigation'` nos arquivos que fazem navegação/roteamento:
  - `app/hooks/useAuth.ts`
  - `app/components/AppShell.tsx`
  - `app/components/Navbar.tsx`
  - `app/components/CookieConsent.tsx`
  - `app/components/Paywall.tsx`
  - `app/components/SubscriptionGate.tsx`
  - + os demais `.tsx` que importam `next/link` / `next/navigation`
    (levantar com `grep -rl "next/link\|next/navigation" app`).
  - **Exceção:** onde só se usa `useSearchParams` / `useParams`, manter
    `next/navigation` (o wrapper não cobre esses; podem coexistir no mesmo
    import de `next/navigation`).
- [ ] `useAuth.ts`: `PUBLIC_ROUTES` e a lógica de redirect passam a usar o
      `usePathname` do wrapper (retorna sem locale) — `PUBLIC_ROUTES`
      inalterado. `router.replace('/login')` do wrapper já re-prefixa.
- [ ] `AppShell.tsx`: `INTERNAL_PREFIXES` inalterado (mesmo motivo).

### 1.6 `lib/format.ts`

- [x] Criar com: `formatMoney`, `formatMoneyFromCents`, `formatNumber`,
      `formatDate`, `formatDateLong`, `formatDateTime` — todas
      `(value, locale = 'pt-BR')`.
  - Moeda: `Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL' })`.
  - Cache dos formatadores por `locale` (Map) — `Intl.*` é caro de instanciar.
- [ ] **Adiado pras fases de cada área (4–7):** substituir as 12 cópias
      locais de `toBRL`/`BRL`/`fmt` (`CashFlow.tsx`, `dashboard`, `contasPagar`,
      `contasReceber`, `estoque`, `impostos`, `relatorios`, `vendas`,
      `costCenter`) e as ~44 chamadas soltas de `toLocale*` por `lib/format.ts`.
      Fazer agora, com `'pt-BR'` fixo, seria só churn que a fase da área
      reescreve de novo quando o locale vira dinâmico — então o swap acontece
      junto da migração de string de cada tela.
- [ ] **Fase 8:** `lib/billingPlans.ts` `formatBRLFromCents`,
      `lib/reportPdf.ts`, `lib/emailTemplates.ts` → delegam pra `lib/format.ts`.

### 1.7 Preferência de idioma do usuário

- [x] `app/hooks/useLocalePreference.ts` (novo) — **só cookie nesta fase**.
      `locale` via `useLocale()`; `setLocale(next)` faz
      `router.replace(pathname, { locale: next })` (o next-intl grava o cookie
      NEXT_LOCALE). Nenhuma tela consome ainda — é base pros seletores das
      Fases 2 e 3.
- [ ] **Movido pra Fase 3** (junto da UI de "Idioma" em Configurações, que já
      mexe no doc do membro): persistir `locale` no doc do membro no Firestore
      + sincronização Firestore→cookie no bootstrap de auth. Levantar o caminho
      exato do doc a partir de `useAccountScope.ts` / `teamAuth.ts`.

### 1.8 Estrutura de mensagens vazia

- [x] Criar `messages/{pt-BR,en,es}/` com os 17 namespaces, cada um `{}`.
- [x] `i18n/request.ts` carrega todos e faz deep-merge com pt-BR como base
      (fallback automático de chave não traduzida).

### 1.9 Teste de paridade de chaves

- [x] `scripts/i18n-check.mjs`: namespaces presentes nos 3 locales; conjunto
      de chaves (flatten) idêntico entre `pt-BR`/`en`/`es`; toda mensagem
      parseia como ICU válido (`@formatjs/icu-messageformat-parser`, agora
      devDependency explícita).
- [x] `package.json` → script `"i18n:check"`. Rodar no fim de cada fase.

### 1.10 Fechamento da fase

- [x] `npm run build` passa (move de pastas + rota pega-tudo
      `app/[locale]/[...rest]/page.tsx` pro 404 estilizado dentro do locale).
- [ ] `tsc --noEmit` limpo.
- [ ] `npm run lint` sem erros novos vs. baseline (164 erros / 94 avisos em
      `app/`, iguais ao master — `@next/next/no-html-link-for-pages` neutralizado
      por override em `eslint.config.mjs`, lista que encolhe por fase).
- [x] Navegador: `/` e rotas internas em pt-BR sem prefixo; `/en`, `/es` com
      prefixo servindo as MESMAS telas ainda em português; `<html lang>`
      dinâmico + cookie `NEXT_LOCALE`; redirect de não-logado
      (`/dashboard` → `/en/login` ou `/login`); 404 estilizado em
      `/en/rota-inexistente`; `data-has-nav` correto com prefixo de idioma.
- [ ] `tsc --noEmit` limpo.
- [ ] `npm run lint` sem erros novos vs. baseline (`git stash`).
- [ ] Navegador: `/` e `/dashboard` (logado) carregam em pt-BR sem prefixo;
      `/en` e `/es` carregam a MESMA tela ainda em português (sem tradução,
      esperado); `/en/dashboard` idem; navegação client-side via `<Link>`
      mantém o prefixo; `/api/*` intacto; troca manual do cookie
      `NEXT_LOCALE` + reload redireciona pro prefixo certo.
- [ ] Confirmar que o script inline não quebrou `data-has-nav` em `/en/*`.

---

## Fase 2 — Site público + autenticação ✅ concluída

Namespaces: `landing`, `plans` (novo, compartilhado), `auth`, `legal`.
Commits: `703923c` (2a), `d9313cb` (2b), `7858cd2` (2c+2d).

- [x] **2a — `app/[locale]/page.tsx`** (landing) — todo texto em
      `landing.json`; listas via `t.raw()`; preços via `lib/format`
      (formatação segue o locale, moeda BRL). `messages/*/plans.json` novo:
      rótulo/blurb/features de cada nível e período (`billingPlans.ts` segue
      canônico p/ preço/id e o `label` usado em contrato/webhook).
- [x] **2a — `LocaleSwitcher`** (`PT · EN · ES`) no header da landing e no
      `Footer.tsx`. Hook `useLocalePreference` (`router.replace(pathname, {locale})`).
- [x] **2a — `Footer.tsx`** — `useTranslations`; `<a>` internos → `<Link>`.
- [x] **2b — `login/page.tsx` e `register/page.tsx`** — `auth.json` (login,
      cadastro, regras de senha, mapa de erros Firebase por chave em
      `auth.errors`). `<a>` → `<Link>`. `passwordRules` renderiza via
      `tRules(rule.key)` (o `.label` do lib segue como fallback p/ o
      `CreatePasswordGate`, que migra na Fase 3). Reset de senha: a tela usa
      `auth.login.resetSent`/`resetNeedsEmail`; a msg de erro da API
      (`/api/auth/reset-password`) fica pra Fase 8.
- [x] **2c — `/acessibilidade`** traduzida por completo (pt-BR/en/es) + aviso
      de tradução automática.
- [x] **2c — `/privacidade`** — cabeçalho + `generateMetadata` traduzidos;
      **corpo integral fica em pt-BR** por citar a LGPD (art. 7º/18), com
      aviso explicando — mesmo racional do contrato, revisão jurídica é
      trabalho à parte. `CATEGORY_INFO` de `lib/consent` idem (Fase 3, junto
      do `CookieConsent`).
- [x] **2d — SEO**: `lib/seo.ts` (`SITE_URL`, `localePath`, `alternatesFor`);
      `generateMetadata` por locale no layout + páginas legais com canonical +
      `hreflang` (`pt-BR`/`en`/`es`/`x-default`); `app/sitemap.ts` (5 rotas
      públicas × 3 idiomas, hreflang recíproco); `app/robots.ts`.
- [x] `i18n:check` + `tsc` + `build` limpos; `eslint app/` 162/79
      (baixou de 164/94 — sem regressão, 2 erros a menos).
- [ ] **Pendências arrastadas pra fases seguintes:** navbar pública é
      inline em `page.tsx` (sem componente `Navbar` público separado — ok);
      `login`/`register` sem `generateMetadata` próprio (são client + têm
      `<title>` do layout; SEO de tela de login é baixa prioridade).
- [ ] Navegador: landing em `/`, `/en`, `/es` com texto traduzido; seletor
      troca idioma e persiste (cookie); `hreflang` no `<head>`; login/cadastro
      traduzidos; erro de senha errada aparece traduzido.

---

## Fase 3 — Chrome da área logada ✅ concluída

Namespaces: `nav`, `common`, `configuracoes`, `onboarding`, `billing` (novo),
`plans` (reusado).
Commits: `e9d4911` (3a), `5d6ee6b` (3b), `0c93f63`/`9bc32bb`/`a9aec00` (3c),
`b7b9875`/`d2175b6` (3d).

- [x] **3a — `Navbar.tsx`** — sidebar, rótulos de rota (por `key` estável, não
      pelo texto), menu do usuário, notificações demo, `aria-label`s, rodapé
      → `nav.json`. **`MonthPickerModal.tsx`** (meses + rótulos).
      **`usePeriod.tsx`** — rótulo do mês segue o locale. **`PageLoader`** —
      label padrão via `common.loading`.
- [x] **3b — `configuracoes/page.tsx`** (título, abas por `id`) +
      **`AparenciaTab.tsx`** (todas as linhas + toasts) → `configuracoes.json`.
- [x] **3b — Nova linha "Idioma"** em `AparenciaTab` (`Segmented`
      PT-BR/EN/ES) ligada a `useLocalePreference`.
- [x] **3c — `CookieConsent.tsx`** — banner curto + card expandido + botões
      → `common.cookies`. `CATEGORY_INFO` (label/descrição das 3 categorias,
      citam art. da LGPD) segue em pt-BR, como `/privacidade`.
- [x] **3c — `SubscriptionGate.tsx`** (banner de trial, plural ICU) +
      **`Paywall.tsx`** (títulos por status, planos via `plans.json`,
      preços/datas via `lib/format`) → `billing.json` (novo namespace,
      compartilhado com `/assinatura`).
- [x] **3c — `CreatePasswordGate.tsx`** → `auth.createPasswordGate` +
      `auth.passwordRules`. **`AccessibilityWidget.tsx`** painel →
      `common.a11yWidget`.
- [x] **3c — Persistência do idioma no Firestore:** `useLocalePreference`
      grava `users/{authUid}/profile/settings.locale` (best-effort);
      `app/components/LocaleSync.tsx` (novo, no layout) aplica o do Firestore
      no bootstrap de auth se diferir do ativo. `LOCALE_COOKIE` exportado de
      `i18n/routing.ts`. Regra `profile/{doc}` já permitia o write.
      **Sync cross-device não testado ao vivo** (precisa conta logada).
- [x] **3d — `PerfilTab.tsx`** (`configuracoes.perfil`),
      **`FeedbackTab.tsx` / `FeedbackAdminTab.tsx`** (`configuracoes.feedback`;
      `FEEDBACK_TYPE_LABEL`/`feedbackFieldLabels` de `lib/feedback` ficaram sem
      uso — retomam na Fase 8 p/ e-mail de retorno).
- [x] **3d — `OnboardingModal.tsx`** → `onboarding.json`; STEPS reestruturado
      com `value` (gravado no Firestore, não traduzido) + `key` de tradução.
- [x] `i18n:check` + `tsc` + `build` limpos; `eslint app/` 162/77.
      Navbar/Configurações/Paywall/Onboarding não testados ao vivo (atrás de
      login); CookieConsent e AccessibilityWidget verificados no site público.
- [ ] **Não migrado (fica pra Fase 8):** `app/[locale]/users/page.tsx`
      ("Minha conta", 37 KB) ainda usa `passwordRules.label`; `CATEGORY_INFO`
      de `lib/consent` segue em pt-BR.

---

## Fase 4 — Dashboard + Fluxo de Caixa 🚧 em andamento

Namespaces: `dashboard`, `fluxoCaixa`.
Commit: `3f65a15` (4a).

- [x] **4a — `app/[locale]/dashboard/page.tsx`** → `dashboard.json` — KPIs,
      gráfico Receita vs Despesas (+ tabela `sr-only` + `aria-label`s),
      vencimentos, transações, centro de custos, projeção. `toBRL`/`months`/
      datas seguem o locale. **`AccessDenied.tsx`** → `common.accessDenied`
      (o `category` chega já traduzido).
- [ ] **4b — `app/components/CashFlow.tsx`** (1834 linhas, ~142 sites de
      string + modal de transação, importação CSV, scan de NF por IA, bloco
      de orçamento, previstos) → `fluxoCaixa.json`. Ainda NÃO feito.
- [ ] **Categorias (`lib/cashflowCategories.ts`, 25 nomes)** — decisão
      transversal: são valores GRAVADOS no Firestore (`tx.category`) e casados
      por string em `costCenterSync`, `contasPagar`, `relatorios`, e agrupados
      no dashboard. Migrar pra `{key, storedValue}` + namespace `categories`
      compartilhado, feito de uma vez junto com Fase 5/7 (ou num passo
      dedicado antes da 4b). Enquanto isso, os nomes de categoria aparecem em
      pt-BR mesmo nas outras línguas.
- [ ] **`app/components/CategoryBreakdown.tsx`** (80 linhas) → pendente.
- [x] `dashboard` verificado: `i18n:check` + `tsc` + `build` limpos;
      `eslint app/` 162/76. Não testado ao vivo (atrás de login).

---

## Fase 5 — Contas a Pagar + Contas a Receber

Namespaces: `contasPagar`, `contasReceber` (compartilham muita chave — o que
for idêntico vai pra `common` ou um `contas` comum).

- [ ] **`app/[locale]/contasPagar/page.tsx`** (~104 KB) — quebrar a extração
      em blocos: tabela/colunas, filtros, modal de cadastro/edição, badges de
      status, recorrência/parcelas, anexos de nota fiscal, toasts. Cada bloco
      é um commit.
- [ ] **`app/[locale]/contasReceber/page.tsx`** (~100 KB) — idem; reaproveitar
      chaves comuns.
- [ ] `locale` real em `lib/format.ts`; datas de vencimento localizadas.
- [ ] Termos financeiros/fiscais (regime, competência, baixa, conciliação) —
      traduzir com cuidado; marcar no PR os que precisam de revisão.
- [ ] `i18n:check` + `tsc` + `lint`.
- [ ] Navegador: criar/editar uma conta nos 3 idiomas; modal, validações e
      toasts traduzidos.

---

## Fase 6 — Estoque + Vendas

Namespaces: `estoque`, `vendas`.

- [ ] **`app/[locale]/estoque/page.tsx`** (~87 KB) — produtos, movimentações,
      integração Mercado Livre / Shopee (telas de config, status de sync,
      repasse/escrow), estados de erro das integrações.
- [ ] **`app/[locale]/vendas/page.tsx`** (~42 KB) — painel de vendas, origem
      (ML/Shopee/manual), vínculo com caixa.
- [ ] Mensagens de erro das integrações que hoje vêm de `lib/mercadolivre.ts`
      / `lib/shopee.ts` / rotas `api/` — decidir por caso: string de UI →
      `errors.json`; erro cru de API externa → não traduzir (logar como está).
- [ ] `locale` real em `lib/format.ts`.
- [ ] `i18n:check` + `tsc` + `lint`.
- [ ] Navegador: estoque/vendas nos 3 idiomas; telas de integração traduzidas.

---

## Fase 7 — Impostos + Centro de Custo + Relatórios

Namespaces: `impostos`, `costCenter`, `relatorios`.

- [ ] **`app/[locale]/impostos/page.tsx`** (~85 KB) — apurações, regimes,
      alíquotas, vínculo com contas a pagar. Traduzir rótulos; **não** mexer
      na lógica fiscal BR.
- [ ] **`app/[locale]/costCenter/page.tsx`** (~73 KB) — centros de custo,
      rateio, período/baixa.
- [ ] **`app/[locale]/relatorios/page.tsx`** (~88 KB) + **`lib/reportPdf.ts`** —
      o PDF recebe `locale` de quem gera; cabeçalhos/rótulos do relatório
      traduzidos; `BRL`/datas via `lib/format.ts` com o locale.
- [ ] `i18n:check` + `tsc` + `lint`.
- [ ] Navegador: as 3 telas nos 3 idiomas; gerar um PDF de relatório em `en` e
      conferir números/datas/rótulos.

---

## Fase 8 — Varredura final

- [ ] **`messages/*/errors.json`** — consolidar toasts e mensagens de erro
      remanescentes de todo o app (grep por `showToast(` / `throw new Error(`
      com string literal em `app/`).
- [ ] **`lib/emailTemplates.ts`** — todos os templates traduzidos; disparo lê
      `locale` do doc do membro destinatário (fallback `pt-BR`). Conferir
      `lib/contractFinalize.ts` / rotas que disparam e-mail.
- [ ] **Contrato** (`lib/contractText.ts`) — confirmar que permanece pt-BR;
      adicionar só a frase traduzida de aviso na tela
      `app/[locale]/assinatura/contrato/page.tsx` (`legal.json`).
- [ ] **Telas internas** `debug/`, `developer/`, `design-system/`,
      `users/page.tsx`, `assinatura/**` — decidir: traduzir ou registrar como
      fora de escopo no spec/`/acessibilidade`. (Recomendo: `users` e
      `assinatura` traduzir; `debug`/`developer`/`design-system` fora de
      escopo, são internas.)
- [ ] **Regra de lint anti-string-literal** — ligar
      `@formatjs/no-literal-string` (ou `react/jsx-no-literals` com allowlist)
      para todos os diretórios `app/[locale]/**` migrados; ajustar exceções
      (números, símbolos, nomes próprios).
- [ ] `i18n:check` + `tsc` + `npm run lint` + `npm run build` limpos.
- [ ] Atualizar o spec (seção "Fora de escopo") com o que de fato ficou de fora.
- [ ] Atualizar a memória do projeto (nota de i18n).
- [ ] Varredura final no navegador: percorrer as rotas principais nos 3
      idiomas procurando string em português vazada.

---

## Riscos e pontos de atenção

- **Move de `app/` → `app/[locale]/`** (Fase 1.3) é a maior fonte de quebra:
  fazer com `git mv` (preserva histórico), rodar `npm run build` logo depois,
  resolver imports antes de qualquer outra coisa.
- **`export const dynamic = "force-dynamic"`** em 13 páginas: combinar com
  `setRequestLocale` — confirmar que o build não reclama de página dinâmica
  com `generateStaticParams`. Se conflitar, `setRequestLocale` pode ser
  omitido nessas (perde só o benefício de estático, que elas já não têm).
- **`useSearchParams`** (`?plano=` no login, retorno de checkout): continua
  vindo de `next/navigation`, não do wrapper — não quebrar isso ao trocar
  imports.
- **`CookieConsent`** já mexe em cookie/consentimento: o cookie `NEXT_LOCALE`
  é funcional (necessário pra navegação), não precisa de consentimento, mas
  documentar isso na política se a lista de cookies for detalhada lá.
- **Volume das Fases 5–7**: cada página de 100 KB tem ordem de centenas a
  ~mil strings. Extração é mecânica; o gargalo é revisão. Cada fase pode ser
  dividida em sub-PRs por bloco funcional sem perder testabilidade.
- **Qualidade en/es**: as traduções saem desta implementação; marcar nos PRs
  os termos financeiros/fiscais de baixa confiança pra revisão do dono do
  produto.
