# Analytics de visitantes da plataforma (aba admin em /configuracoes)

**Data:** 2026-09-15
**Status:** aprovado

## Objetivo

Uma aba nova em `/configuracoes`, visível só pro adm supremo
(`lib/compAccounts.ts` → `isSupremeAdminEmail`), mostrando quantas pessoas
acessam o Soluções Finance: visitantes únicos e pageviews de hoje/do mês,
gráfico dos últimos 30 dias, e as páginas mais acessadas.

**Arquitetura de referência**: `C:\Users\Gustavo\Desktop\grupo_liberty`
(Liberty Car), que tem exatamente essa funcionalidade em `app/api/track` +
`app/dashboard/analytics`. Esta spec porta essa arquitetura quase 1:1 — a
única adaptação obrigatória é como detectar "logado" (ver seção 4), porque
este projeto não tem cookie de sessão server-side.

## Decisões já tomadas (não reabrir)

- **O que conta como visita**: TUDO — app logado inteiro (dashboard, fluxo
  de caixa, impostos...) + site público (landing, login, cadastro). Ao
  contrário do Liberty Car, que ignora `/dashboard` (lá o produto É o site
  público de carros; aqui o uso real está dentro do app logado).
- **Ranking de páginas**: incluído (equivalente ao "Veículos mais vistos" do
  Liberty Car, aqui por rota).

## Estado atual (referência, `grupo_liberty`)

- `proxy.ts`: seta cookie `liberty_vid` (UUID, httpOnly, 1 ano) se ausente e
  não for bot (`utils/analytics/bots.ts`, regex de User-Agent).
- `app/components/Analytics.tsx` (client, montado 1x em `app/layout.tsx`):
  a cada troca de `usePathname()`, `fetch('/api/track', {keepalive:true})`
  com `{path}`. Ignora navegação interna (`/dashboard`, `/login`,
  `/entrar-dispositivo`).
- `app/api/track/route.ts` (Node runtime): valida path e cookie de
  visitante, ignora bot, verifica sessão (`adminAuth.verifySessionCookie`)
  pra saber se está "logado", e numa transação do Firestore incrementa
  `pageviews`/`uniqueVisitors`/`loggedVisitors` em `analytics_daily/{dia}` e
  `analytics_monthly/{mês}` — unicidade via um doc-marcador
  `.../visitors/{vid}` com TTL (60/400 dias). Se o path bate
  `/veiculos/:id`, também incrementa `analytics_vehicle_daily/{dia}.views.{id}`.
- `app/dashboard/analytics/data.ts` (`getAnalyticsOverview`, server-only,
  Admin SDK): lê os últimos 30 `analytics_daily`, o `analytics_monthly` do
  mês corrente, soma `analytics_vehicle_daily` dos últimos 30 dias e resolve
  nome dos veículos. `page.tsx` é Server Component, checa
  `hasPageAccess(user,'analytics',['admin'])`, redireciona se não for admin.
- `AnalyticsView.tsx` + `VisitorsChart.tsx`: 4 KPI cards, gráfico de linha
  em SVG puro (sem lib) comparando visitantes únicos vs. logados, e tabela
  de top-10 veículos.

## Solução (Soluções Finance)

### 1. Cookie de visitante — `proxy.ts`

```ts
import createMiddleware from "next-intl/middleware";
import { randomUUID } from "node:crypto";
import { routing } from "./i18n/routing";
import { isBotUserAgent } from "@/lib/analytics/bots";

const VISITOR_COOKIE = "nxfi_vid";
const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const intlMiddleware = createMiddleware(routing);

export default function proxy(request: NextRequest) {
  const response = intlMiddleware(request);
  if (!request.cookies.get(VISITOR_COOKIE) && !isBotUserAgent(request.headers.get("user-agent"))) {
    response.cookies.set(VISITOR_COOKIE, randomUUID(), {
      httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: VISITOR_COOKIE_MAX_AGE,
    });
  }
  return response;
}

export const config = { matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"] }; // inalterado
```

`lib/analytics/bots.ts`: porta `isBotUserAgent` literalmente (mesma regex —
lista ampla de propósito, "melhor descartar um acesso duvidoso do que
inflar o número de pessoas").

`lib/analytics/dates.ts`: porta `dayKey()`/`monthKey()` (fuso
`America/Sao_Paulo` fixo, mesma técnica de `Intl.DateTimeFormat("en-CA")` já
usada em `lib/billing.ts` → `calendarDateKey`).

### 2. Tracker client — `<PlatformAnalytics />`

Novo `app/components/PlatformAnalytics.tsx`, montado em
`app/[locale]/layout.tsx` ao lado de `<LocaleSync />`/`<ThemeInitializer />`.
Igual ao `Analytics.tsx` de referência, mas:

- usa `usePathname` de **`@/i18n/navigation`** (não `next/navigation`) — já
  vem sem o prefixo de idioma, então pt-BR/en/es contam na mesma rota;
- **sem lista de exclusão** (decisão: conta tudo);
- decide logado/anônimo checando `auth.currentUser` (import dinâmico de
  `@/lib/firebase`, mesmo padrão usado em outros componentes deste arquivo
  como `Navbar.tsx`): se houver usuário, usa `authedFetch` (Bearer do ID
  token); senão, `fetch` puro. Nunca bloqueia navegação (erro engolido,
  `keepalive: true`).

```ts
"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "@/i18n/navigation";
import { authedFetch } from "@/lib/authedFetch";

export function PlatformAnalytics() {
  const pathname = usePathname();
  const ultimoEnviado = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || ultimoEnviado.current === pathname) return;
    ultimoEnviado.current = pathname;
    (async () => {
      try {
        const { getFirebase } = await import("@/lib/firebase");
        const { auth } = await getFirebase();
        const body = JSON.stringify({ path: pathname });
        const init: RequestInit = { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body };
        if (auth.currentUser) await authedFetch("/api/track", init).catch(() => {});
        else fetch("/api/track", init).catch(() => {});
      } catch { /* nunca quebra a navegação */ }
    })();
  }, [pathname]);

  return null;
}
```

### 3. `app/api/track/route.ts`

```
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
```

Corpo do POST:

1. Lê `{ path }` do body; valida `path.startsWith("/")`, `length <= 512`,
   corta query/hash. Rejeita se vazio.
2. `isBotUserAgent(req.headers.get("user-agent"))` → `204` sem gravar.
3. Lê o cookie `nxfi_vid` (`next/headers` → `cookies()`); sem cookie válido
   (regex UUID) → `204` sem gravar (visita antes do proxy setar o cookie —
   raríssimo, próxima pageview já grava).
4. **Logado**: lê `Authorization: Bearer <token>` (opcional — diferente das
   rotas normais, aqui a AUSÊNCIA é um caso válido, não erro). Se presente,
   tenta `getAdminAuth().verifyIdToken(token)` num `try/catch` local (não
   usa `requireScope`, que falha sem token); sucesso = logado, senão
   anônimo. Fica inline no arquivo — não é um padrão reusável em outro
   lugar do app.
5. Transação no Firestore (mesma lógica de `aplicar()` do original,
   portada): `analytics_daily/{dayKey()}` e `analytics_monthly/{monthKey()}`
   — `pageviews` sempre `FieldValue.increment(1)`; `uniqueVisitors` só se o
   marcador `.../visitors/{vid}` (subcoleção) não existir ainda pro
   dia/mês; `loggedVisitors` só na primeira vez que aquele `vid` aparece
   logado. TTL do marcador: 60 dias (diário) / 400 dias (mensal) — mesmo
   valor do original, só documentativo por enquanto (sem TTL policy
   configurada no Firestore desta conta; limpeza automática fica de fora do
   escopo, ver "Fora de escopo").
6. Incrementa `analytics_page_daily/{dayKey()}.views.<path>` (map, merge) —
   `path` usado como chave literal do objeto (não é um field-path com
   pontos interpretados — Firestore só interpreta pontos em field paths
   passados como string em `.update()`, nunca em chaves de objeto literal
   dentro de `.set(..., {merge:true})`, que é o que usamos aqui).
7. Sempre responde `204`, erro nunca vaza pro caller (`try/catch` externo
   como no original).

Coleções (`analytics_daily`, `analytics_monthly`, `analytics_page_daily`)
são globais (não sob `users/{uid}`) — são métricas da PLATAFORMA, não de
uma conta. Ficam cobertas pelo `allow read, write: if false` que já é o
fallback padrão no fim de `firestore.rules` (mesma proteção que `feedback`
já tem hoje) — acrescento só um comentário explicativo perto do bloco do
`feedback`, sem regra nova necessária.

### 4. `app/api/analytics/route.ts` (GET)

Autenticado: verifica o Bearer, resolve o e-mail via
`getAdminAuth().getUser(uid)` (mesmo padrão de `identify()` em
`app/api/feedback/route.ts`), confere `isSupremeAdminEmail(email)` — senão
`403`. Corpo: porta `getAnalyticsOverview()` quase literal
(`lib/analytics/overview.ts`), trocando `analytics_vehicle_daily` +
resolução de nome de veículo por `analytics_page_daily` (sem precisar
resolver nome — o path já É o rótulo). Retorna:

```ts
interface AnalyticsOverview {
  hoje: { uniqueVisitors: number; loggedVisitors: number; pageviews: number };
  mes: { uniqueVisitors: number; loggedVisitors: number; pageviews: number; label: string };
  serie30: { date: string; uniqueVisitors: number; loggedVisitors: number; pageviews: number }[];
  topPaginas: { path: string; views: number }[];
  erro: boolean;
}
```

### 5. Aba "Analytics" em `/configuracoes`

- `messages/{pt-BR,en,es}/configuracoes.json`: `tabs.analytics` = "Analytics"
  (mesmo nome do original — não é uma palavra que precise tradução) +
  namespace `configuracoes.analytics.*` com os textos da aba.
- `app/[locale]/configuracoes/page.tsx`: mesmo padrão de `ADMIN_TAB`
  (`feedbackAdmin`) — acrescenta `{ id: "analytics", icon: BarChart3 }` à
  lista quando `isAdmin`, e `{tab === "analytics" && isAdmin && <AnalyticsAdminTab />}`.
- `app/[locale]/configuracoes/AnalyticsAdminTab.tsx` (client, novo):
  `useEffect` chama `authedFetch("/api/analytics")` no mount (mesmo padrão
  de fetch client-side já usado em `FeedbackAdminTab.tsx` — Configurações
  aqui é `"use client"`, diferente do Server Component `page.tsx` do
  Liberty Car), guarda `overview` + `loading` + `erro` em estado, renderiza:
  - 4 `KpiTile` (`app/components/ui`): visitantes hoje, visitantes no mês,
    pageviews hoje, pageviews no mês — cada um com `delta` mostrando
    "X logados · Y anônimos" (igual ao rodapé dos cards do original);
  - `VisitorsChart.tsx` (novo, sob a mesma pasta): porta o SVG do original
    quase literal, trocando as classes Tailwind por `var(--brand)` /
    `var(--pos)` / `var(--border)` / `var(--text-muted)` (tokens deste
    projeto, ver `redesign-ui-2026-09`);
  - `Table` (`app/components/ui`) com as páginas mais acessadas — colunas
    `#`, `Página`, `Visualizações`; `empty` com `<EmptyState>` quando não
    há dados ainda.

## Fora de escopo

- Limpeza automática dos docs-marcadores de unicidade (`.../visitors/{vid}`)
  vencidos pelo TTL — o campo `expiresAt` é gravado (igual ao original,
  pronto pra uma TTL policy do Firestore no futuro), mas configurar a TTL
  policy em si fica fora desta spec (é uma config do console do Firebase,
  não código).
- Página de histórico/detalhamento além dos últimos 30 dias.
- Qualquer PII no rastreamento — o cookie é um UUID aleatório sem relação
  com o uid da conta; a única coisa vinculada à conta é o boolean "logado".
- Aplicar esse mesmo rastreamento nas rotas de API (`/api/**`) — só páginas
  navegáveis contam, igual ao original (o `matcher` do `proxy.ts` já exclui
  `/api`, então o cookie de visitante nem é setado lá, e o tracker client só
  roda em componentes de página).

## Riscos

- **Custo de escrita**: 1 transação Firestore (2 gets + 2 sets) + 1 set
  adicional por pageview navegável — em uso normal do produto (não é um
  site de alto tráfego anônimo), o volume é baixo. Mesmo perfil de custo
  que o Liberty Car já roda em produção.
- **Verificação de ID token a cada pageview**: `verifyIdToken` faz uma
  chamada de rede pra validar a assinatura na primeira vez por processo
  (cacheia as chaves públicas do Google depois) — custo pequeno, mesma
  operação que outras rotas autenticadas já pagam a cada chamada.
- **Cookie perdido em navegação privada / bloqueio de terceiros**: como é
  `first-party` (mesmo domínio, setado pelo próprio `proxy.ts`), não sofre
  os bloqueios de cookie de terceiro dos navegadores modernos — mesmo
  comportamento do original.
