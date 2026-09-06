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

## Fase 2 — Site público + autenticação

Namespaces: `landing`, `auth`, `legal`, `common` (parcial), `nav` (parcial p/ header público).

- [ ] **`app/[locale]/page.tsx`** (landing) — extrair todo texto pra
      `landing.json`; `useTranslations('landing')`; formatação de números via
      `useFormatter`. Gerar `en` + `es`.
- [ ] **Seletor de idioma público** — componente `LocaleSwitcher`
      (`PT / EN / ES`) no header da landing e em `app/components/Footer.tsx`.
      Usa `usePathname` do wrapper + `<Link locale=...>`.
- [ ] **`app/components/Footer.tsx`** — extrair pra `landing.json` (ou
      `common`); traduzir.
- [ ] **`app/[locale]/login/page.tsx`**, **`register/page.tsx`**, fluxo de
      reset de senha (`app/api/auth/reset-password` só server; a tela) —
      `auth.json`; traduzir. Cuidar de mensagens de erro do Firebase
      (mapear códigos → chaves em `auth.json`/`errors.json`).
- [ ] **`app/[locale]/privacidade/page.tsx`** e
      **`app/[locale]/acessibilidade/page.tsx`** — `legal.json`; traduzir
      corpo; adicionar linha "em caso de divergência prevalece a versão em
      português". `generateMetadata` por locale.
- [ ] **SEO**:
  - `generateMetadata` com `locale` em layout + páginas públicas;
  - `alternates.languages` (`pt-BR`/`en`/`es`/`x-default`) nas páginas públicas;
  - `app/sitemap.ts` novo — 3 variantes de cada rota pública
    (`/`, `/login`, `/register`, `/privacidade`, `/acessibilidade`).
- [ ] `i18n:check` + `tsc` + `lint` limpos.
- [ ] Navegador: landing em `/`, `/en`, `/es` com texto traduzido; seletor
      troca idioma e persiste (cookie); `hreflang` no `<head>`; login/cadastro
      traduzidos; erro de senha errada aparece traduzido.

---

## Fase 3 — Chrome da área logada

Namespaces: `nav`, `common`, `configuracoes`, `onboarding`.

- [ ] **`app/components/Navbar.tsx`** — sidebar, rótulos de rota, menu do
      usuário, notificações, tooltips/`aria-label` → `nav.json`.
- [ ] **`app/components/OnboardingModal.tsx`** → `onboarding.json`.
- [ ] **`app/components/Paywall.tsx`**, **`SubscriptionGate.tsx`** →
      `common`/`configuracoes`.
- [ ] **`app/components/ui/**`** — qualquer texto embutido (estados vazios,
      placeholders de `Table`, `EmptyState`, `PageHeader`) → `common.json`.
- [ ] **`app/[locale]/configuracoes/**`** — `page.tsx`, `PerfilTab.tsx`,
      `AparenciaTab.tsx`, `FeedbackTab.tsx`, `FeedbackAdminTab.tsx` →
      `configuracoes.json`.
- [ ] **Nova linha "Idioma"** em `AparenciaTab.tsx` — `Segmented` com
      `PT-BR / EN / ES`, ligada a `useLocalePreference` (Fase 1.7); toast de
      confirmação traduzido.
- [ ] **`AccessibilityWidget.tsx`** — textos do painel → `common`/`nav`.
- [ ] `i18n:check` + `tsc` + `lint`.
- [ ] Navegador (conta de teste): trocar idioma em Configurações → recarregar
      → persiste (cookie + Firestore); sidebar/menu traduzidos; `<html lang>`
      correto; entrar de outro "dispositivo" (limpar cookie) puxa o idioma do
      Firestore.

---

## Fase 4 — Dashboard + Fluxo de Caixa

Namespaces: `dashboard`, `fluxoCaixa`.

- [ ] **`app/[locale]/dashboard/page.tsx`** — KPIs, rótulos, estados vazios,
      `aria-label` dos gráficos, tabela `sr-only` de detalhamento → `dashboard.json`.
- [ ] **`app/[locale]/fluxo-caixa/page.tsx`** + **`app/components/CashFlow.tsx`**
      (conteúdo real) → `fluxoCaixa.json`.
- [ ] **`app/components/CategoryBreakdown.tsx`** → `dashboard`/`fluxoCaixa`.
- [ ] Trocar o `locale` fixo das chamadas de `lib/format.ts` nesses arquivos
      pelo `useLocale()` real; eixos/tooltips dos gráficos idem.
- [ ] Meses/dias de semana dos gráficos: usar `useFormatter().dateTime` em vez
      de arrays de nomes hardcoded.
- [ ] `i18n:check` + `tsc` + `lint`.
- [ ] Navegador: dashboard nos 3 idiomas; número `1.234,56` vira `1,234.56`
      em `en`; `R$` permanece; datas dos gráficos localizadas.

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
