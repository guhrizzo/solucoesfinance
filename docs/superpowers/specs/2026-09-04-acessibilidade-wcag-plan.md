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
  - [ ] **Lacuna que ficou aberta**: ordem de heading pula nível em várias
        páginas (ex.: `h1` direto pra `h3` nos cards de KPI, sem `h2` no
        meio — `estoque/page.tsx`, `vendas/page.tsx`, `CashFlow.tsx` entre
        outras). É só troca de nome de tag (o estilo vem de `className`,
        não do tag), mas o volume em páginas grandes que não dá pra ver
        rodando pediu mais cautela do que dava pra exercer só lendo
        código — fica pra uma rodada futura, dedicada só a isso.
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

## Fase 4 — Fechamento

- [ ] Navegação 100% por teclado ponta a ponta: login → dashboard → abrir
      um lançamento numa tabela → editar e salvar num modal.
- [ ] Smoke test com leitor de tela (Narrador do Windows ou NVDA) nos
      mesmos três fluxos.
- [ ] Verificação de contraste nos textos tocados nas Fases 1–3.
- [ ] `npm run lint` limpo no repo inteiro, sem nenhum arquivo restante na
      lista de exceção do `jsx-a11y`.
- [ ] Revisar o texto de `/acessibilidade` pra refletir o que de fato foi
      entregue (atualizar "o que foi feito" e "limitações conhecidas" com
      o resultado real, não a previsão da spec).
