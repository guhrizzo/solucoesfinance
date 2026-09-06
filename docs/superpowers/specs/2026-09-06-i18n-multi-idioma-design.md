# Suporte a múltiplos idiomas (i18n) — pt-BR, inglês e espanhol

## Contexto e motivação

Hoje **todo o texto da plataforma é português hardcoded** no JSX. Uma varredura
rápida encontrou 69 arquivos `.tsx`, dos quais várias páginas passam de 100 KB
([`app/contasPagar/page.tsx`](../../../app/contasPagar/page.tsx),
[`app/components/CashFlow.tsx`](../../../app/components/CashFlow.tsx),
[`app/contasReceber/page.tsx`](../../../app/contasReceber/page.tsx),
[`app/relatorios/page.tsx`](../../../app/relatorios/page.tsx),
[`app/estoque/page.tsx`](../../../app/estoque/page.tsx),
[`app/impostos/page.tsx`](../../../app/impostos/page.tsx)), e ~211 usos de
`pt-BR` / `R$` / `Intl` para formatação. Não há nenhuma biblioteca de i18n.

Não há cliente estrangeiro concreto. O objetivo é **montar a fundação de
internacionalização e traduzir o app inteiro** (pt-BR como base, mais inglês e
espanhol), para que a plataforma esteja pronta quando a necessidade aparecer e
não haja retrabalho de extração de strings depois.

Stack atual relevante: Next.js 16 (App Router + Turbopack), autenticação
100% client-side via Firebase ([`app/hooks/useAuth.ts`](../../../app/hooks/useAuth.ts)),
sem `middleware.ts`, sem route groups. Preferências "deste dispositivo" (tema,
movimento, widget de acessibilidade) seguem um padrão consolidado:
`localStorage` + atributo em `<html>` + script inline em
[`app/layout.tsx`](../../../app/layout.tsx) que aplica antes da hidratação.

## Decisões já tomadas (com o dono do produto)

| Tema | Decisão |
|---|---|
| Idiomas | pt-BR (padrão/fonte da verdade) + `en` + `es` |
| Cobertura | O app inteiro (~70 telas), em fases |
| Biblioteca | `next-intl` |
| URL | Prefixo de idioma com `localePrefix: 'as-needed'` — pt-BR sem prefixo, `/en/*` e `/es/*` prefixados |
| Formatação | Data e número seguem o locale ativo; **moeda continua sempre BRL** (símbolo R$), sem conversão de câmbio |
| Origem das traduções | Geradas nesta implementação (pt-BR + en + es por string), para revisão posterior do dono do produto |
| Persistência do idioma | Cookie `NEXT_LOCALE` (fonte da verdade para roteamento) **+** campo `locale` no doc do membro no Firestore (acompanha a conta entre dispositivos) — diferente do tema, que é intencionalmente por dispositivo |
| Conteúdo jurídico | Contrato do checkout permanece **só em pt-BR**; `/privacidade` e `/acessibilidade` traduzidas com aviso de que a versão em português prevalece |

## Abordagem

`next-intl` é o padrão de fato para i18n no App Router: funciona com React
Server Components e Turbopack, traz negociação de locale por middleware,
formatação (wrapper de `Intl`), plural/select via ICU e wrappers de navegação
que aplicam o prefixo de idioma automaticamente.

Alternativas descartadas:
- **`react-i18next` / `i18next`**: ecossistema maior, porém desenhado para
  componentes client; no App Router com RSC obriga a marcar tudo como
  `"use client"` ou adicionar shims, indo contra a estrutura atual (layouts
  RSC).
- **Solução caseira** (Context + `getDictionary` + hook `useT`): zero
  dependências, mas reconstrói à mão roteamento de locale, plural,
  interpolação, formatação, fallback e extração de strings — dívida de
  manutenção incompatível com "app inteiro".

## Arquitetura

### Roteamento e reorganização de pastas

`localePrefix: 'as-needed'`:

| Hoje | pt-BR | en | es |
|---|---|---|---|
| `/dashboard` | `/dashboard` | `/en/dashboard` | `/es/dashboard` |
| `/` | `/` | `/en` | `/es` |

Todas as URLs atuais e links já compartilhados continuam funcionando; as
variantes `en`/`es` são novas.

As pastas de rota migram para `app/[locale]/`. Ficam **fora**: `app/api/`
(23 rotas, intactas), `app/components/`, `app/hooks/`, `app/lib/`,
`app/types/`, `app/globals.css`, favicons/ícones.

```
app/
├── [locale]/
│   ├── layout.tsx          ← o layout root atual vem para cá, agora com
│   │                          <NextIntlClientProvider> e <html lang={locale}>
│   ├── page.tsx            ← landing
│   ├── not-found.tsx
│   ├── dashboard/page.tsx
│   ├── contasPagar/page.tsx
│   └── ... (todas as rotas de página existentes)
├── layout.tsx              ← novo, mínimo (Next exige um layout raiz);
│                              só repassa children
├── api/                    ← intacto
├── components/ hooks/ lib/ types/   ← intactos
├── globals.css             ← intacto
└── sitemap.ts              ← novo
middleware.ts               ← novo (raiz do projeto)
i18n/
├── routing.ts              ← defineRouting({ locales, defaultLocale, localePrefix })
├── navigation.ts           ← createNavigation(routing): Link, useRouter, usePathname, redirect, getPathname
└── request.ts              ← getRequestConfig: carrega messages do locale
```

**`middleware.ts`**: usa `createMiddleware(routing)` do next-intl. Ordem de
detecção do locale: prefixo da URL → cookie `NEXT_LOCALE` → header
`Accept-Language` → `defaultLocale` (pt-BR). `matcher` exclui `/api`,
`/_next`, `/_vercel` e arquivos com extensão.

**Wrappers de navegação** (`i18n/navigation.ts`): reexportam `Link`,
`useRouter`, `usePathname`, `redirect` já cientes do locale. Ao trocar os
imports de `next/link` / `next/navigation` para `@/i18n/navigation` nos ~14
arquivos `.tsx` que os usam:
- links passam a carregar o prefixo de idioma automaticamente;
- `usePathname()` passa a devolver o caminho **sem** o locale, o que conserta
  as listas de rota hardcoded (ver "Rotas hardcoded" abaixo).

### Arquivos de mensagens

Um diretório por idioma, JSON por namespace (carregamento sob demanda por
rota via `getRequestConfig`):

```
messages/
├── pt-BR/
│   ├── common.json         ← ações e labels genéricos (Salvar, Cancelar, …)
│   ├── nav.json            ← Navbar, sidebar, menu do usuário
│   ├── auth.json           ← login, cadastro, reset de senha
│   ├── dashboard.json
│   ├── fluxoCaixa.json
│   ├── contasPagar.json
│   ├── contasReceber.json
│   ├── estoque.json
│   ├── vendas.json
│   ├── impostos.json
│   ├── relatorios.json
│   ├── costCenter.json
│   ├── configuracoes.json
│   ├── landing.json        ← site público
│   ├── onboarding.json
│   ├── legal.json          ← avisos de /privacidade, /acessibilidade, contrato
│   └── errors.json         ← mensagens de erro e toasts
├── en/  (mesmos arquivos)
└── es/  (mesmos arquivos)
```

**Convenções de chave:**
- Nomeadas por significado, aninhadas por contexto:
  `contasPagar.form.dueDate.label`, nunca `contasPagar.text1`.
- Interpolação: `"Bem-vindo, {name}"` → `t('welcome', { name })`.
- Plural (ICU): `"{count, plural, =0 {Nenhuma conta} one {# conta} other {# contas}}"`.
- Rich text: `t.rich` para trechos com `<strong>` / `<link>` embutidos.
- **pt-BR é a fonte da verdade** — toda chave nasce em pt-BR; en/es espelham
  exatamente o mesmo conjunto.
- Fallback: chave ausente em en/es → usa pt-BR + `console.warn` em dev
  (configurado em `getRequestConfig` / `onError`).

### Detecção, troca e persistência de idioma

**Fonte da verdade para roteamento:** cookie `NEXT_LOCALE` (max-age 1 ano),
lido pelo middleware.

**Primeira visita (sem cookie):** middleware negocia via `Accept-Language`;
`en*` → `/en`, `es*` → `/es`, senão pt-BR. O cookie é gravado na resposta.

**Troca de idioma — dois pontos de entrada:**

1. **Site público**: seletor `PT / EN / ES` no header da landing e no
   [`app/components/Footer.tsx`](../../../app/components/Footer.tsx). Navega
   para a mesma rota no novo prefixo (`router.replace` do wrapper, que
   preserva o pathname sem locale).

2. **Área logada**: nova linha **"Idioma"** em
   [`app/configuracoes/AparenciaTab.tsx`](../../../app/configuracoes/AparenciaTab.tsx),
   componente `Segmented` com 3 opções (mesmo padrão visual de Tema /
   Movimento / Widget de acessibilidade). Novo hook
   `app/hooks/useLocalePreference.ts`:
   - lê o locale ativo via `useLocale()` do next-intl;
   - ao trocar: grava cookie `NEXT_LOCALE`, grava `locale` no doc do membro
     no Firestore (mesmo doc onde vivem as preferências do usuário — ver
     [`app/hooks/useAccountScope.ts`](../../../app/hooks/useAccountScope.ts) /
     estrutura de membro), e faz `router.replace` para o novo locale.

**Sincronização Firestore → cookie:** no bootstrap de autenticação
([`app/hooks/useAuth.ts`](../../../app/hooks/useAuth.ts) ou um efeito
adjacente), se o doc do membro tiver `locale` e ele diferir do cookie,
atualiza o cookie e navega uma vez para o locale do Firestore. Custo: uma
escrita no Firestore por troca de idioma (evento raríssimo).

**`<html lang>`** passa a refletir o locale ativo (hoje fixo em `pt-BR` no
[`app/layout.tsx`](../../../app/layout.tsx)).

### Formatação (datas, números, moeda)

Hoje cada página gigante redefine localmente o mesmo `formatBRL`
(`n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })` — 12
cópias) e faz `toLocaleDateString("pt-BR")` avulso (44 chamadas de
`toLocale*` no total).

**Novo `lib/format.ts`** centraliza tudo. Funções puras que recebem o locale:

| Função | pt-BR | en | es |
|---|---|---|---|
| `formatMoney(1234.5, locale)` | `R$ 1.234,50` | `R$ 1,234.50` | `R$ 1.234,50` |
| `formatMoneyFromCents(123450, locale)` | `R$ 1.234,50` | `R$ 1,234.50` | `R$ 1.234,50` |
| `formatNumber(1234.5, locale)` | `1.234,50` | `1,234.50` | `1.234,50` |
| `formatDate(d, locale)` | `06/09/2026` | `09/06/2026` | `06/09/2026` |
| `formatDateLong(d, locale)` | `6 de setembro de 2026` | `September 6, 2026` | `6 de septiembre de 2026` |

- **Moeda:** `Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL' })`
  — o símbolo é sempre R$; o locale só afeta agrupamento e separador decimal.
  O valor **nunca** é convertido.
- **Em componentes**, o caminho padrão é o `useFormatter()` do next-intl (já
  conhece o locale). `lib/format.ts` é para contextos sem React (PDFs,
  e-mails, helpers puros), onde o locale é passado como argumento.
- **PDFs e e-mails** ([`lib/reportPdf.ts`](../../../lib/reportPdf.ts),
  [`lib/contractPdf.ts`](../../../lib/contractPdf.ts),
  [`lib/emailTemplates.ts`](../../../lib/emailTemplates.ts)): recebem o locale
  de quem dispara a ação. Exceção: contrato — ver "Conteúdo jurídico".
- **Gráficos** ([`app/components/CashFlow.tsx`](../../../app/components/CashFlow.tsx),
  dashboard): eixos e tooltips passam pelas mesmas funções.
- As 12 cópias locais de `formatBRL` são substituídas por import de
  `lib/format.ts` (ou pelo `useFormatter` quando em componente).

### Rotas hardcoded

Três lugares comparam `pathname` com caminhos literais e quebrariam com
prefixo de idioma:

| Lugar | O que tem | Solução |
|---|---|---|
| [`app/hooks/useAuth.ts`](../../../app/hooks/useAuth.ts) | `PUBLIC_ROUTES = ["/", "/login", "/register"]` | trocar import para `usePathname` de `@/i18n/navigation` (retorna sem locale) → lista inalterada |
| [`app/components/AppShell.tsx`](../../../app/components/AppShell.tsx) | `INTERNAL_PREFIXES` (10 rotas) | idem |
| [`app/layout.tsx`](../../../app/layout.tsx) script inline | `internalPrefixes` + aplica tema/nav-layout antes da hidratação | roda antes do React, sem acesso ao wrapper: adicionar 2 linhas que removem o 1º segmento de `location.pathname` quando for `/en` ou `/es` antes das comparações |

O `SubscriptionGate` / `Paywall` / `CookieConsent` que também usam navegação
são cobertos pela troca de import.

### SEO e metadata

- `export const metadata` estático em
  [`app/layout.tsx`](../../../app/layout.tsx),
  [`app/privacidade/page.tsx`](../../../app/privacidade/page.tsx),
  [`app/acessibilidade/page.tsx`](../../../app/acessibilidade/page.tsx) →
  `generateMetadata({ params: { locale } })`, puxando título/descrição das
  mensagens (`landing.json` / `legal.json`).
- **`hreflang`**: páginas públicas emitem `alternates.languages` com `pt-BR`,
  `en`, `es` e `x-default` → pt-BR.
- **`app/sitemap.ts`** novo: 3 variantes de cada rota pública (não existe
  sitemap hoje).
- Área logada: `robots: { index: false }` — sem mudança de comportamento.

### Conteúdo jurídico

- **Contrato** ([`lib/contractText.ts`](../../../lib/contractText.ts), exibido
  em [`app/assinatura/contrato/page.tsx`](../../../app/assinatura/contrato/page.tsx)
  e no PDF): **permanece só em pt-BR**, em qualquer idioma de UI. É
  instrumento sob lei brasileira; tradução exigiria revisão jurídica própria
  e não agrega valor agora. A tela do contrato ganha uma frase curta
  (traduzida, em `legal.json`) explicando que o contrato é apresentado em
  português.
- **`/privacidade` e `/acessibilidade`**: traduzidas, com uma linha de aviso
  ("em caso de divergência, prevalece a versão em português").
- **E-mails transacionais** ([`lib/emailTemplates.ts`](../../../lib/emailTemplates.ts)):
  traduzidos; disparados no locale do usuário destinatário (lido do doc do
  membro; fallback pt-BR).

## Fases

Cada fase é um PR fechado e testável. Fases 1–3 primeiro; 4–7 são o grosso do
volume (extração de strings das páginas de 100 KB) e viram sub-tarefas
detalhadas no plano de implementação.

### Fase 1 — Infra (nada traduzido ainda)

- Instalar `next-intl`; `i18n/routing.ts`, `i18n/navigation.ts`,
  `i18n/request.ts`; `middleware.ts`; `next.config` com o plugin
  `createNextIntlPlugin`.
- Mover pastas de rota para `app/[locale]/`; novo `app/layout.tsx` mínimo; o
  layout atual vira `app/[locale]/layout.tsx` com `NextIntlClientProvider`,
  `setRequestLocale` e `<html lang={locale}>`.
- Criar `messages/{pt-BR,en,es}/` com os namespaces vazios (`{}`), exceto o
  que a Fase 1 precisar.
- `lib/format.ts` + substituir as 12 cópias de `formatBRL` e padronizar as
  chamadas `toLocale*` existentes (ainda em pt-BR).
- Trocar imports de navegação para `@/i18n/navigation` nos ~14 arquivos;
  ajustar o script inline de `layout.tsx` (strip do prefixo de idioma).
- `app/hooks/useLocalePreference.ts`; adicionar campo `locale` ao doc do
  membro; sincronização Firestore→cookie no bootstrap de auth.
- App continua 100% em pt-BR e funcional.

### Fase 2 — Site público + autenticação

- `landing.json`, `auth.json`, `legal.json`.
- [`app/page.tsx`](../../../app/page.tsx),
  [`app/login/page.tsx`](../../../app/login/page.tsx),
  [`app/register/page.tsx`](../../../app/register/page.tsx),
  reset de senha, [`app/privacidade/page.tsx`](../../../app/privacidade/page.tsx),
  [`app/acessibilidade/page.tsx`](../../../app/acessibilidade/page.tsx),
  [`app/components/Footer.tsx`](../../../app/components/Footer.tsx), Navbar
  pública.
- Seletor de idioma no header público e no Footer.
- `generateMetadata` + `hreflang` + `app/sitemap.ts`.

### Fase 3 — Chrome da área logada

- `nav.json`, `common.json`, `configuracoes.json`, `onboarding.json`.
- [`app/components/Navbar.tsx`](../../../app/components/Navbar.tsx) (sidebar,
  menu do usuário), [`app/components/OnboardingModal.tsx`](../../../app/components/OnboardingModal.tsx),
  [`app/components/Paywall.tsx`](../../../app/components/Paywall.tsx),
  componentes de `app/components/ui/`, Configurações inteira (todas as abas,
  incluindo a nova linha "Idioma" em `AparenciaTab`).

### Fase 4 — Dashboard + Fluxo de Caixa

- `dashboard.json`, `fluxoCaixa.json`.
- [`app/dashboard/page.tsx`](../../../app/dashboard/page.tsx),
  [`app/fluxo-caixa/page.tsx`](../../../app/fluxo-caixa/page.tsx),
  [`app/components/CashFlow.tsx`](../../../app/components/CashFlow.tsx),
  [`app/components/CategoryBreakdown.tsx`](../../../app/components/CategoryBreakdown.tsx).

### Fase 5 — Contas a Pagar + Contas a Receber

- `contasPagar.json`, `contasReceber.json`.
- [`app/contasPagar/page.tsx`](../../../app/contasPagar/page.tsx),
  [`app/contasReceber/page.tsx`](../../../app/contasReceber/page.tsx).

### Fase 6 — Estoque + Vendas

- `estoque.json`, `vendas.json`.
- [`app/estoque/page.tsx`](../../../app/estoque/page.tsx),
  [`app/vendas/page.tsx`](../../../app/vendas/page.tsx), telas de integração
  Mercado Livre / Shopee.

### Fase 7 — Impostos + Centro de Custo + Relatórios

- `impostos.json`, `costCenter.json`, `relatorios.json`.
- [`app/impostos/page.tsx`](../../../app/impostos/page.tsx),
  [`app/costCenter/page.tsx`](../../../app/costCenter/page.tsx),
  [`app/relatorios/page.tsx`](../../../app/relatorios/page.tsx),
  [`lib/reportPdf.ts`](../../../lib/reportPdf.ts).

### Fase 8 — Varredura final

- `errors.json`, toasts e mensagens de erro remanescentes,
  [`lib/emailTemplates.ts`](../../../lib/emailTemplates.ts).
- Telas internas de baixa prioridade: `debug`, `developer`, `design-system`
  (traduzir ou marcar explicitamente como fora de escopo).
- Ativar a regra de lint anti-string-literal em todos os diretórios.
- Teste de paridade de chaves + `npm run lint` limpos.

## Testes / QA

- **Paridade de chaves**: teste (Node script ou `*.test.ts`) que falha se o
  conjunto de chaves de `pt-BR`, `en` e `es` divergir em qualquer namespace.
- **ICU válido**: todas as mensagens parseiam (plural/select bem formados) —
  reusar o parser do next-intl / `@formatjs/icu-messageformat-parser`.
- **Sem string órfã**: regra de lint (`@formatjs/no-literal-string` ou
  equivalente) ligada por diretório conforme a fase avança, barrando texto
  JSX fora de `t()` nos arquivos já migrados.
- **Middleware**: pt-BR sem prefixo resolve; `/en/*` e `/es/*` resolvem;
  cookie tem prioridade sobre `Accept-Language`; primeiro acesso negocia por
  `Accept-Language`; `/api/*` não é tocado.
- **E2E manual por fase**: trocar idioma em Configurações → recarregar →
  conferir persistência (cookie + Firestore); navegação client-side via
  `<Link>` mantém o locale; `<html lang>` correto; formatação de
  data/número muda, R$ permanece.
- **`npm run lint`** limpo ao fim de cada fase (sem novos erros nos arquivos
  tocados).

## Fora de escopo / limitações conhecidas

- **Sem conversão de câmbio.** Todos os valores permanecem em BRL; o idioma
  só muda formatação, nunca o número ou a moeda.
- **Módulo de Impostos, CNPJ, regime tributário, contrato** continuam
  específicos do Brasil — traduz-se a interface, não a lógica de negócio nem
  a validade jurídica.
- **Contrato do checkout** não é traduzido (só pt-BR).
- **Qualidade das traduções**: geradas nesta implementação, pendentes de
  revisão do dono do produto — termos financeiros/fiscais em en/es podem
  precisar de ajuste.
- **Telas `debug` / `developer` / `design-system`**: tradução opcional,
  decidida na Fase 8.
- **Conteúdo dinâmico do usuário** (nomes de categorias, descrições de
  lançamentos, etc.) não é traduzido — é dado, não interface.
