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

## Fase 3 — Área logada

- [ ] Auditoria por página (repetir o checklist abaixo em cada uma; marcar
      conforme migrar — mesma mecânica de "lista que encolhe" do
      `eslint.config.mjs`):
  - [ ] `app/dashboard/page.tsx`
  - [ ] `app/fluxo-caixa/page.tsx`
  - [ ] `app/contasPagar/page.tsx`
  - [ ] `app/contasReceber/page.tsx`
  - [ ] `app/costCenter/page.tsx`
  - [ ] `app/estoque/page.tsx`
  - [ ] `app/vendas/page.tsx`
  - [ ] `app/impostos/page.tsx`
  - [ ] `app/relatorios/page.tsx`
  - [ ] `app/configuracoes/**`

  Checklist por página: formulário local usa `Field`/`Input` (ou tem
  `htmlFor`/`id` próprios)? botão só-com-ícone tem `aria-label`? heading
  não pula nível? gráfico tem o dado equivalente em tabela/texto por
  perto?
- [ ] **`app/components/CashFlow.tsx`** e KPIs do dashboard — confirmar
      que o dado plotado também existe como tabela/texto acessível na
      mesma tela (não precisa reconstruir o gráfico).
- [ ] **Reduzir animações** (controle manual, não segue o SO):
  - [ ] `app/layout.tsx` — no mesmo script inline que já seta
        `data-theme`, ler `localStorage['nexusfi-reduced-motion']` e
        aplicar `data-reduced-motion="1"` no `<html>` antes da hidratação.
  - [ ] `app/globals.css` — regra sob
        `html[data-reduced-motion="1"]` zerando duração de
        animação/transição (`0.001ms !important` no padrão já conhecido)
        e forçando `scroll-behavior: auto`.
  - [ ] `app/components/ForceMotion.tsx` / `app/lib/motion.ts` —
        `installForcedSmoothScroll()` só roda quando o atributo está
        ausente/`"0"`; reagir a mudança do atributo em tempo real (sem
        precisar recarregar a página) igual o `MutationObserver` do
        `useTheme.ts`.
  - [ ] **`app/hooks/useReducedMotion.ts`** (novo) — cópia do padrão de
        `app/hooks/useTheme.ts` (mesmo `MutationObserver` + listener de
        `storage`), chave `nexusfi-reduced-motion`, atributo
        `data-reduced-motion`.
  - [ ] **`app/configuracoes/AparenciaTab.tsx`** — nova `Row` "Movimento"
        com `Segmented` "Padrão"/"Reduzido", igual ao de Tema; default
        Padrão.
- [ ] `npm run lint` limpo + teste manual de teclado por página migrada.
- [ ] Ampliar o escopo `error` do `eslint.config.mjs` (Fase 1) conforme
      cada página é migrada, até cobrir `app/**` inteiro.

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
