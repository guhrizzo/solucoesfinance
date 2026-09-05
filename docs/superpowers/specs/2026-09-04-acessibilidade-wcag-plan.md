# Plano de implementação — Acessibilidade WCAG 2.1 AA

Spec de referência: [2026-09-04-acessibilidade-wcag-design.md](2026-09-04-acessibilidade-wcag-design.md).

Cada fase é um lote fechável e testável por si só (`npm run lint` +
navegação por teclado) antes de passar pra próxima. Checkboxes marcam
progresso conforme as fases forem executadas.

## Fase 1 — Fundação (componentes compartilhados + porta de entrada)

- [ ] **`app/components/ui/Table.tsx`** — linha com `onRowClick` ganha
      `tabIndex={0}`, `role="button"`, `aria-label` (algo como "Abrir
      detalhes de {descrição da linha}" — usar a primeira coluna como
      fallback) e `onKeyDown` disparando em `Enter`/`Espaço`. Sem
      `onRowClick`, a linha continua uma `<tr>` normal (não vira botão à
      toa).
- [ ] **`app/components/ui/Modal.tsx`** — `role="dialog"` + `aria-modal="true"`
      no container; `aria-labelledby` apontando pro `id` do `<h2>` do
      título (só quando `title` existe); foco move pro modal ao abrir
      (primeiro elemento focável dentro dele, com fallback pro próprio
      card) e volta pro elemento que tinha foco antes de abrir, ao fechar;
      `Tab`/`Shift+Tab` ficam presos dentro do modal (focus trap) enquanto
      `open`.
- [ ] **`app/components/Navbar.tsx`** —
  - `aria-label` nos botões só-com-ícone: hambúrguer (linhas ~330, ~364),
    alternar tema no desktop (linha ~397 — falta hoje, o da versão mobile
    em ~339 já tem), alternar layout (~393, trocar `title` solto por
    `aria-label` também), sino de notificações (~402), avatar/menu do
    usuário (~432).
  - `aria-expanded={notifOpen}` + `aria-haspopup="menu"` no botão do sino;
    `aria-expanded={userOpen}` + `aria-haspopup="menu"` no botão do avatar.
  - `Esc` fecha o dropdown aberto (notificação ou usuário) e devolve o
    foco pro botão que abriu.
- [ ] **`app/register/page.tsx`** e **`app/login/page.tsx`** — cada
      `<label>` ganha `htmlFor={id}` e o `<input>` correspondente ganha
      esse `id` (usar `useId()` por campo, mesmo padrão de
      `app/components/ui/Field.tsx`).
- [ ] **Skip link** — novo link "Pular para o conteúdo" logo no início do
      `<body>` em `app/layout.tsx`, visualmente oculto e só aparece ao
      receber foco por Tab (`.sr-only` até `:focus`); aponta pro `id`
      do `<main>` de cada página — conferir que toda rota top-level (`/`,
      `/login`, `/register`, `/dashboard`, etc.) tem de fato um `<main
      id="conteudo-principal">` alcançável; adicionar onde faltar.
- [ ] **`eslint.config.mjs`** — adiciona `eslint-plugin-jsx-a11y` (já é
      dependência transitiva do `eslint-config-next`; declarar
      explicitamente como devDependency fixa no `package.json` pra não
      depender de dependência transitiva) com o preset `recommended` em
      `warn` para o repo inteiro, e um bloco adicional só pros arquivos
      desta fase (`app/components/ui/**`, `app/components/Navbar.tsx`,
      `app/register/**`, `app/login/**`, `app/layout.tsx`) subindo
      `jsx-a11y/click-events-have-key-events`,
      `jsx-a11y/no-static-element-interactions` e
      `jsx-a11y/label-has-associated-control` para `error` — mesmo padrão
      de rollout gradual já usado no bloco de cor-hex-crua do arquivo
      (lista de arquivos que ainda não passaram vai encolhendo conforme
      a Fase 3 avança).
- [ ] `npm run lint` limpo + teste manual de teclado nesta fase (abrir um
      modal, tabular por ele, Esc fecha; abrir um dropdown da Navbar,
      Esc fecha; clicar uma linha de tabela só com teclado).

## Fase 2 — Site público

- [ ] **`app/page.tsx`** (landing) — `alt=""` em imagem puramente
      decorativa, `alt` descritivo em imagem informativa (logo, ícones com
      significado); conferir contraste dos textos sobre fundo
      degradê/colorido (mínimo 4.5:1 pra texto normal, 3:1 pra texto
      grande ≥18pt/14pt-bold) com o DevTools ou WebAIM Contrast Checker;
      conferir que não pula nível de heading (h1→h2→h3, sem saltar).
- [ ] **`app/components/Footer.tsx`** — troca os `href="#"` da coluna
      "Suporte" por link real pra `/privacidade` e pro novo
      `/acessibilidade`. Não mexe no resto do conteúdo (copy genérica de
      "investimentos"/"Banco Central" é problema de conteúdo à parte).
- [ ] **`app/acessibilidade/page.tsx`** (nova) — mesmo layout/componente
      `Section` de `app/privacidade/page.tsx`: compromisso da NexusFi,
      padrão seguido (WCAG 2.1 AA), o que foi feito nesta rodada,
      limitações conhecidas (seção "Fora de escopo" da spec), contato via
      `privacidade@nexusfi.com.br`. Adicionar `metadata` (title/description)
      como a página de privacidade já faz.
- [ ] `npm run lint` limpo + teste manual de teclado/contraste nesta fase.

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
