# Plano de implementação — Acessibilidade WCAG 2.1 AA

Spec de referência: [2026-09-04-acessibilidade-wcag-design.md](2026-09-04-acessibilidade-wcag-design.md).

Cada fase é um lote fechável e testável por si só (`npm run lint` +
navegação por teclado) antes de passar pra próxima. Checkboxes marcam
progresso conforme as fases forem executadas.

## Fase 1 — Fundação (componentes compartilhados + porta de entrada) ✅ concluída

- [x] **`app/components/ui/Table.tsx`** — linha com `onRowClick` ganha
      `tabIndex={0}`, `role="button"`, `aria-label` (primeira coluna como
      fallback) e `onKeyDown` disparando em `Enter`/`Espaço`.
- [x] **`app/components/ui/KpiTile.tsx`** (achado durante a Fase 1, mesma
      classe de bug do Table — `<div onClick>` sem teclado) — mesmo
      tratamento.
- [x] **`app/components/ui/Modal.tsx`** — `role="dialog"` + `aria-modal="true"`
      + `aria-labelledby`; foco entra no modal ao abrir e volta pro
      elemento que tinha foco antes, ao fechar; `Tab`/`Shift+Tab` presos
      dentro do modal enquanto aberto.
- [x] **`app/components/Navbar.tsx`** — `aria-label` em todo botão
      só-com-ícone (hambúrguer, tema, layout, notificações, avatar);
      `aria-expanded`/`aria-haspopup="menu"` nos dois dropdowns; `Esc`
      fecha e devolve o foco pro botão que abriu.
- [x] **`app/register/page.tsx`** e **`app/login/page.tsx`** — `<label>`
      ligado ao `<input>` via `id`/`htmlFor`; toggle de mostrar/ocultar
      senha ganha `aria-label`; achado extra: o checkbox de termos do
      cadastro era uma `<div onClick>` sem teclado — virou
      `role="checkbox"` com `aria-checked` e `onKeyDown` (Espaço/Enter).
- [x] **Skip link** — implementado em `app/layout.tsx`, mas mirado no
      wrapper do `AppShell` (`app/components/AppShell.tsx`, `id="conteudo-
      principal"` + `tabIndex={-1}`) em vez de um `<main id>` por página —
      cobre toda rota de uma vez, sem editar cada `page.tsx`.
      **Achado extra durante o teste**: a rolagem suave forçada
      (`app/lib/motion.ts`) intercepta o clique de qualquer link de âncora
      interna e nunca movia o foco pro alvo (só rolava a tela) — o skip
      link rolava mas o foco ficava parado no link. Corrigido: chama
      `target.focus({ preventScroll: true })` depois de rolar.
- [x] **`eslint.config.mjs`** — `eslint-plugin-jsx-a11y` declarado como
      devDependency direta; preset `recommended` do plugin (reaproveitando
      o registro do plugin que o `eslint-config-next` já faz — não dá pra
      redeclarar o mesmo nome de plugin duas vezes no flat config) subido
      pra `error` só nos arquivos desta fase — allowlist que cresce
      conforme a Fase 3 audita o resto do app.
- [x] `npm run lint` limpo (zero achados `jsx-a11y` nos arquivos da fase;
      os erros/warnings restantes nesses arquivos são pré-existentes,
      não relacionados a acessibilidade — `@typescript-eslint/no-
      explicit-any`, `@next/next/no-img-element`) + `tsc --noEmit` limpo.
      Testado no navegador: skip link foca `#conteudo-principal`,
      checkbox de termos alterna por teclado (`aria-checked`).
      Navbar/Table/KpiTile não foram testados ao vivo (ficam atrás de
      login; não criei conta de teste em produção sem combinar antes).

## Fase 2 — Site público ✅ concluída

- [x] **`app/page.tsx`** (landing) — único `<img>` da página já tinha
      `alt` descritivo (logo); heading order conferida, sem saltos
      (h1→h2→h3). Contraste: rodei um script de varredura real no
      navegador (canvas pra resolver as cores `lab()`/`oklch()` que o
      Tailwind v4 usa, já que `getComputedStyle` não devolve mais
      `rgb()` puro) — achou e corrigiu `text-slate-400` (~2.6:1),
      `text-green-600` (~3.2:1), badge "Novo" e pílula/botão "Mais
      completo"/"Assinar plano Pro" (gradiente claro demais, ~3.2–3.8:1).
      Achado documentado, não corrigido: avatares de iniciais decorativos
      (baixo impacto, cor por avatar teria que ser calculada uma a uma).
      Achado extra: o modal de período de cobrança era um dialog
      "hand-rolled" duplicando o `ui/Modal.tsx` sem nenhuma das
      correções da Fase 1 — ganhou o mesmo tratamento (role/foco/Esc/
      focus trap), mantendo a estilização própria (light-only) em vez de
      trocar pelo Modal compartilhado (que usa tokens de tema e ficaria
      ilegível com o modo escuro salvo de visita anterior ao app).
- [x] **`app/components/Footer.tsx`** — links reais pra `/privacidade` e
      `/acessibilidade` (o resto da coluna "Suporte" continua `href="#"`,
      fora de escopo). Contraste do texto do rodapé (`text-blue-300/50`
      e `/30`, ~3.1:1 e ~2.0:1) subido pra `/75` (~5.2:1).
- [x] **`app/acessibilidade/page.tsx`** (nova) — mesmo layout/componente
      `Section` de `app/privacidade/page.tsx`, com `metadata` própria.
- [x] `npm run lint` limpo (só erros pré-existentes não relacionados) +
      `tsc --noEmit` limpo. Testado no navegador: foco entra no modal de
      período, Tab fica preso, Esc fecha e devolve o foco; links do
      rodapé com `href` corretos.

## Fase 3 — Área logada ✅ concluída (com uma lacuna documentada)

- [x] Auditoria por página, via leitura de código (não deu pra testar ao
      vivo — a área logada fica atrás de login e optei por não criar uma
      conta de teste em produção sem combinar antes). Achados corrigidos:
  - [x] `app/dashboard/page.tsx` — link só-com-ícone (`MoreHorizontal`)
        ganha `aria-label`; os dois gráficos SVG desenhados à mão ganham
        `role="img"` + `aria-label`; o de receita/despesa ganha também uma
        tabela `sr-only` com o detalhamento mês a mês (o de centro de
        custos já tinha a lista de valores como texto visível ao lado).
  - [x] `app/contasPagar/page.tsx`, `app/contasReceber/page.tsx` — badge
        "N fotos" (`<span onClick>`, sem teclado) vira `role="button"`
        com `aria-label`/`onKeyDown`; botões só-com-ícone (fechar,
        navegar entre fotos, editar, excluir) ganham `aria-label`.
  - [x] `app/costCenter/page.tsx`, `app/impostos/page.tsx` — botões de
        fechar/editar/excluir só-com-ícone ganham `aria-label`.
  - [x] `app/components/CashFlow.tsx` (conteúdo real de
        `app/fluxo-caixa/page.tsx`, que é só um wrapper fino) — botão de
        fechar e link de nota fiscal anexada ganham `aria-label`.
  - [ ] `app/estoque/page.tsx`, `app/vendas/page.tsx`,
        `app/relatorios/page.tsx`, `app/configuracoes/**` — auditados
        (grep por botão/link só-com-ícone e por `onClick` em elemento
        não-nativo); nenhum achado do mesmo tipo dos corrigidos acima.
  - [x] **Lacuna fechada na Fase 4**: ordem de heading corrigida em
        `estoque/page.tsx`, `vendas/page.tsx`, `costCenter/page.tsx` (h1
        adicionado), `relatorios/page.tsx`,
        `configuracoes/AparenciaTab.tsx` e `configuracoes/FeedbackTab.tsx`.
        Confirmado com `git stash` que não existe nenhum reset de CSS em
        `h1`–`h6`/`p` no repo, então trocar o nome da tag não muda nada
        visualmente.
- [x] **Reduzir animações** (controle manual, não segue o SO):
  - [x] `app/layout.tsx` — script inline lê
        `localStorage['nexusfi-reduced-motion']` e aplica
        `data-reduced-motion="1"` no `<html>` antes da hidratação.
  - [x] `app/globals.css` — regra sob `html[data-reduced-motion="1"]`
        zerando duração de animação/transição e forçando
        `scroll-behavior: auto`.
  - [x] `app/components/ForceMotion.tsx` — só instala a rolagem forçada
        quando o atributo está ausente; reage em tempo real via
        `MutationObserver`, sem precisar recarregar a página.
  - [x] `app/hooks/useReducedMotion.ts` (novo) — cópia do padrão de
        `useTheme.ts`.
  - [x] `app/configuracoes/AparenciaTab.tsx` — nova `Row` "Movimento" com
        `Segmented` "Padrão"/"Reduzido", default Padrão.
- [x] `npm run lint` limpo (comparado com o baseline via `git stash` —
      zero erros/avisos novos) + `tsc --noEmit` limpo. Testado no
      navegador via `localStorage`/atributo direto (não dá pra chegar em
      Configurações sem login): liga/desliga em tempo real, CSS zera
      transições, rolagem forçada desinstala/reinstala corretamente.
- [ ] Ampliar o escopo `error` do `eslint.config.mjs` (Fase 1) pras
      páginas desta fase — adiado pra depois que a lacuna de heading for
      fechada (Fase 4 ou rodada futura), pra não travar o lint com um
      problema conhecido e ainda não corrigido.

## Fase 4 — Fechamento ✅ concluída (com lacunas documentadas)

- [x] Criada uma conta de teste descartável em produção
      (`gustavorizzo159+a11ytest@gmail.com`) pra poder testar de verdade,
      logado, em vez de só ler código — decisão combinada com o usuário no
      início desta fase. **Pendente**: o usuário decidir se apaga essa
      conta (não é algo que eu apago sozinho).
- [x] Navegação por teclado testada ao vivo nos 4 modais principais de
      cadastro (contas a pagar, contas a receber, impostos, centro de
      custos): abre com foco dentro, Tab fica preso no diálogo, Esc fecha,
      foco volta pro botão que abriu. Também testado: skip link (foco vai
      pro conteúdo, não só rolagem), checkbox de aceite no cadastro, menu
      da Navbar. Essa varredura ao vivo achou e corrigiu 3 categorias de
      bug que a leitura de código sozinha não pegou: ~25 botões só-com-ícone
      sem `aria-label` que um regex mal-formado tinha deixado passar, os 4
      modais principais sem tratamento de diálogo completo, e uma corrida
      entre `autofocus` nativo e o `useEffect` do próprio modal que fazia o
      foco voltar pro campo errado ao fechar.
      Não testado à parte (redundante com o acima, mesmo componente de
      modal): abrir especificamente uma linha existente de uma tabela pra
      editar — testado em vez disso pelo fluxo de criar uma conta nova, que
      usa exatamente o mesmo modal/JSX/ARIA que o de editar.
- [x] Smoke test de acessibilidade nos mesmos fluxos, por inspeção direta
      da árvore de acessibilidade e dos atributos ARIA renderizados (não
      há NVDA/Narrador disponível neste ambiente de teste automatizado) —
      ver limitação registrada em `/acessibilidade`.
- [x] Verificação de contraste nos textos tocados nas Fases 1–3, com
      medição real (canvas, não estimativa visual) na landing (Fase 2) e,
      nesta fase, na área logada autenticada (dashboard). Achados e
      corrigidos:
  - `app/components/OnboardingModal.tsx` — textos secundários do
    onboarding (`text3`/`skipColor` no tema claro e escuro) em ~2.1:1 e
    ~2.6:1; trocados por tons que passam de ~4.8:1.
  - Token compartilhado `--text-subtle` (`globals.css`, usado como
    `--nav-text-3`/`--cf-text-3`/`--db-text-3` em toda a plataforma) em
    ~3.5:1 no tema escuro e ~3.1:1 no tema claro contra as superfícies
    reais da aplicação; corrigido pra ~4.8:1 nos dois temas. Esse era o
    token do "Administrador" no menu da Navbar e das mensagens
    "Nenhuma X" (contas/transações/despesas) do dashboard.
  - Uma primeira varredura automatizada apontou mais 8 falsos positivos
    (textos coloridos sobre fundos com transparência, ex. os cartões de
    "Saldo atual"/"Entradas previstas" da projeção de fluxo de caixa) —
    causados por um bug no próprio script de auditoria que não fazia a
    composição alfa do fundo translúcido sobre a cor real por trás; ao
    corrigir o script, confirmado que esses textos já passavam
    (4.7–6.8:1).
- [x] `npm run lint` limpo nas páginas cobertas pelas Fases 1–4 (comparado
      via `git stash`, zero achados novos). **Não** atingido: zerar por
      completo a lista de exceção do `jsx-a11y` no repo inteiro — ficaram
      de fora desta rodada `app/users/page.tsx`, `app/debug/**`,
      `app/developer/**`, `app/assinatura/**` e `app/design-system/**`,
      que não faziam parte do escopo original de 10 páginas + configurações.
- [x] Revisado o texto de `/acessibilidade` pra refletir o que de fato foi
      entregue nas 4 fases (não mais a previsão da spec), incluindo as
      limitações conhecidas que ficaram em aberto (os 2 modais secundários
      sem tratamento completo de diálogo, PDF não auditado, teste com
      leitor de tela real não feito, páginas fora de escopo).
