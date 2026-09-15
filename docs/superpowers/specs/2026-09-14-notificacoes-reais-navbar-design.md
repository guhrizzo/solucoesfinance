# Notificações reais no sino da Navbar

**Data:** 2026-09-14
**Status:** aprovado

## Objetivo

O sino de notificações da Navbar (`app/components/Navbar.tsx`) hoje mostra 3
itens fixos de demonstração ("Vencimento próximo", "Nova transação", "Meta
atingida"), com contador sempre em 3 e "Marcar como lido" que só dispara um
toast (não muda estado nenhum). Esta spec troca isso por notificações
derivadas de dados reais da conta, com contador de não lidas de verdade,
sincronizado entre dispositivos.

## Estado atual

- `NOTIF_META` (array fixo `{id, urgent}`) + `nav.notifications.items` (textos
  fixos) em `Navbar.tsx`/`messages/*/nav.json`. `unreadCount =
  NOTIF_META.length` — sempre 3, nunca muda.
- `handleMarkAsRead` só mostra um toast e fecha o dropdown.
- Botão "Ver todas as notificações" não faz nada (sem `onClick`).
- Já existem duas fontes de alerta "de verdade" no app, mas cada uma isolada
  na sua página, sem aparecer no sino:
  - `/impostos`: toast de vencendo/atrasado ao carregar, janela configurável
    em `localStorage: nexusfi:taxAlertDays` (padrão 7).
  - `/contasPagar` (via `app/components/Usebillbadges.ts`) e `/contasReceber`:
    mesma ideia, com `localStorage: nexusfi:alertDays` (padrão 5, contas a
    pagar) e `nexusfi:alertDaysReceivable` (padrão 5, contas a receber).
- Vendas de marketplace e vendas manuais são lançadas como **entradas em
  `users/{ownerUid}/cashflow`** por `lib/vendas.ts` → `registrarVendaAdmin`,
  marcadas com `source: "marketplace" | "manual"` e `saleChannel:
  "mercadolivre" | "shopee" | "tiktokshop" | "manual"`. Não existe coleção
  `vendas` separada — `/vendas` lê do próprio `cashflow`.
- Chamados de bug/melhoria (`feedback-bugs-sugestoes`, ver memória) moram na
  coleção raiz `feedback`, só acessível via Admin SDK
  (`app/api/feedback/route.ts`) — `firestore.rules` nega acesso direto do
  client. `GET /api/feedback` (autenticado) já devolve só os tickets do
  próprio usuário quando quem chama não é o adm supremo, com `status:
  "aberto" | "resolvido"` e `resolvedAt`.
- `useAccountScope()` (`app/hooks/useAccountScope.ts`) já dá, ao vivo,
  `{ uid (authUid), ownerUid, isOwner, permissions }` — é o que `Navbar.tsx`
  já usa (`scope`) pra filtrar o menu por permissão. `useBillBadges` e
  `useReceivableBadges` reimplementam a mesma resolução de escopo
  (`resolveAccountScope`) por conta própria — o hook novo desta spec recebe
  `scope` pronto em vez de resolver de novo.
- `firestore.rules`: `users/{uid}/profile/{doc}` (qualquer nome exceto
  `access`/`billing`) já permite leitura/escrita de quem está `inAccount`
  daquele uid — escrever em `users/{authUid}/profile/notifications` (o
  PRÓPRIO uid de quem está logado) já é permitido sem mudar regra nenhuma.

## Solução

### 1. Novo hook: `app/hooks/useNotifications.ts`

```ts
export interface NotifItem {
  id: string;        // estável: `${kind}:${bucketKeyOuEntityId}`
  kind: "impostoVencimento" | "impostoAtraso"
      | "contaPagarVencimento" | "contaPagarAtraso"
      | "contaReceberVencimento" | "contaReceberAtraso"
      | "transacaoAlta" | "vendaMarketplace" | "feedbackResolvido";
  urgent: boolean;    // true pros "*Atraso" — cor do dot
  count?: number;     // pra interpolar plural na tradução (ex.: "{count} impostos...")
  params: Record<string, string | number>; // demais placeholders da tradução (canal, valor, nome do cliente, resolução...)
  at: number;         // epoch ms ESTÁVEL — usado pra ordenar e decidir não-lido (nunca Date.now() no corpo do hook)
  href: string;       // rota ao clicar
}

export function useNotifications(scope: AccountScope & { loading: boolean }): {
  items: NotifItem[];       // já ordenados, mais recente primeiro, no máx. 8
  unreadCount: number;
  loading: boolean;
  markAllRead: () => Promise<void>;
}
```

Internamente:

- **Vencimento/atraso** (impostos, contas a pagar, contas a receber): 3
  listeners `onSnapshot` em paralelo (`taxes`, `bills`, `receivables` de
  `scope.ownerUid`), só ligados se `hasPermission(scope, "impostos" |
  "contasPagar" | "contasReceber")`. Cada snapshot é reduzido a até 2 buckets
  (vencendo em breve / atrasado), usando o `alertDays` do `localStorage`
  correspondente (lidos 1x no mount, mesmos defaults das páginas). `at` do
  bucket = a MAIOR `dueDate` (convertida pra ms, meio-dia local) entre os
  itens do bucket — estável entre renders, só sobe se um vencimento mais
  novo entrar no grupo. `params` carrega `count` e, se `count === 1`, o nome
  do item (pra mensagem no singular poder citar o nome, ex.: "Simples
  Nacional vence em 2 dias" quando só tem 1).
- **Transação alta / venda de marketplace**: 1 listener `onSnapshot` em
  `cashflow` (`orderBy("createdAt","desc"), limit(20)`), só ligado se
  `hasPermission(scope, "fluxoCaixa")`. Do resultado:
  - agrupa por `saleChannel` os docs com `source === "marketplace"` e
    `createdAt` dentro de 48h → 1 item por canal presente
    (`vendaMarketplace`, `params: {channel, count, total}`, `at = maior
    createdAt do grupo`);
  - dos restantes (não-marketplace) dentro de 48h com `amount >= 1000`,
    1 item POR TRANSAÇÃO (`transacaoAlta`, `at = createdAt`, `params:
    {description, amount, type}`) — são raras, não precisa agrupar.
- **Chamado respondido**: sem `onSnapshot` (coleção não é legível pelo
  client) — `authedFetch("/api/feedback")` no mount + `setInterval` de 60s
  (mesmo padrão de poll de `useBillBadges`), filtra `status === "resolvido"
  && item.userId === scope.uid` (o filtro por `userId` é redundante pra
  conta comum — a rota já só devolve os próprios — mas necessário pro adm
  supremo: `isAdmin` faz a rota devolver TODOS os chamados do sistema, e o
  sino dele deve mostrar só os que ELE abriu, não os de todo mundo), 1 item
  por ticket (`feedbackResolvido`, `at = resolvedAt`, `params: {local,
  resolution}`).
- **Estado de leitura**: `onSnapshot(doc(db,"users",scope.uid,"profile","notifications"))`
  pra ler `lastSeenAt` ao vivo (sincroniza entre abas/dispositivos do mesmo
  login). `markAllRead()` faz `setDoc(..., { lastSeenAt: Date.now() }, {
  merge: true })`. Sem doc ainda → trata como `lastSeenAt: 0` (tudo não lido).
- Junta os itens de todas as fontes, ordena por `at` desc, corta em 8.
  `unreadCount` = quantos desses 8 têm `at > lastSeenAt`.
- Cada `useEffect` de listener limpa o anterior ao re-executar (mesmo padrão
  de `syncTaxCashflow`/`useReceivableBadges`) e nunca deixa erro de uma fonte
  quebrar as outras (cada listener com seu próprio `try/catch` /
  `onSnapshot(..., errorCallback)` isolado).

### 2. `messages/{pt-BR,en,es}/nav.json` — namespace `notifications`

Troca o array fixo `items` por mensagens paramétricas por `kind`, com plural
ICU (`{count, plural, ...}`) e placeholders (`{channel}`, `{amount}`,
`{name}`, `{local}`). Exemplo (pt-BR):

```json
"kinds": {
  "impostoVencimento": "{count, plural, one {# imposto vence} other {# impostos vencem}} nos próximos {days} dias",
  "impostoAtraso": "{count, plural, one {# imposto em atraso} other {# impostos em atraso}}",
  "contaPagarVencimento": "...", "contaPagarAtraso": "...",
  "contaReceberVencimento": "...", "contaReceberAtraso": "...",
  "transacaoAlta": "{type, select, entrada {Entrada} other {Saída}} de {amount} · {description}",
  "vendaMarketplace": "{count, plural, one {# nova venda} other {# novas vendas}} · {channel}",
  "feedbackResolvido": "Seu chamado sobre \"{local}\" foi resolvido"
}
```
`title` de cada item vem de uma chave curta por `kind` (ex.: "Vencimento
próximo" / "Em atraso" / "Nova venda" / "Chamado respondido"), igual ao
padrão atual de `title` + `desc` — o texto acima vira o `desc`. `empty`:
"Nenhuma notificação por enquanto." Reaproveita `useFormatter().relativeTime()`
do next-intl (já é a recomendação do projeto — ver memória i18n) pro "há N
min/h" no lugar do `time` fixo que existia.

### 3. `Navbar.tsx`

- Troca `NOTIF_META`/`notifItems`/`unreadCount = NOTIF_META.length` pelo
  hook: `const { items, unreadCount, loading, markAllRead } =
  useNotifications(scope);` (o `scope` já existe na Navbar).
- Cada item do dropdown vira um `<a href={item.href}>` (ou `router.push` +
  fechar o dropdown, seguindo o padrão de navegação interna do arquivo —
  decidir na implementação qual é mais simples aqui) — clicar navega.
- `handleMarkAsRead` chama `markAllRead()` de verdade (mantém o toast de
  confirmação).
- Lista vazia → mostra `t("notifications.empty")` no lugar dos itens.
- Remove o botão "Ver todas as notificações" (decisão: sem página de
  histórico nesta versão).
- Dot de urgência (`nxfi-notif-dot2`) usa `item.urgent` no lugar de
  `n.urgent` do array fixo.

## Fora de escopo

- Página `/notificacoes` de histórico completo — o botão "Ver todas" some.
- Recalcular "não lido" quando um item vencendo-em-breve vira atrasado sem
  que a data de vencimento mude (mesmo `dueDate` → mesmo `at` → não
  re-notifica). Só conta como novo se a data mudar ou um item novo entrar no
  grupo.
- Notificação de resposta a chamado em tempo real (é poll de 60s, não
  `onSnapshot` — a coleção `feedback` não é legível pelo client).
- Preferência de "silenciar" um tipo de notificação — tudo ou nada por
  categoria, controlado só pela permissão da conta (quem não tem acesso a
  Contas a Pagar não recebe essas notificações, mas não dá pra desligar só
  "vendas de marketplace" mantendo o resto, por exemplo).

## Riscos

- **Custo de leitura**: 3 `onSnapshot` (taxes/bills/receivables) + 1
  (cashflow, `limit(20)`) + 1 (doc de leitura) por sessão logada — mesma
  ordem de grandeza do que a Navbar já paga hoje via `useBillBadges`/
  `useReceivableBadges` (que já assinam `bills`/`receivables` inteiros sem
  limite). Não piora sensivelmente o padrão existente.
- **`cashflow` sem índice composto**: a query usa só `orderBy("createdAt")`
  + `limit(20)`, sem `where`, então não exige índice novo — a filtragem por
  `source`/`saleChannel`/`amount`/janela de 48h acontece em memória depois
  de buscar os 20 mais recentes. Consequência aceita: numa conta com MUITO
  volume de lançamentos, uma venda/transação alta pode "cair fora" dos 20
  mais recentes antes de completar 48h e sumir da notificação mais cedo do
  que o esperado — aceitável pro caso de uso (dá pra subir o `limit` depois
  se virar problema real).
- **Poll do feedback**: mais uma chamada de rede a cada 60s por sessão
  logada — mesmo padrão que `useBillBadges` já faz hoje.
