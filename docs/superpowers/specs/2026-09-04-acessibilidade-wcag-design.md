# Acessibilidade digital (WCAG 2.1 AA) — site público + área logada

## Contexto e motivação

Não há uma exigência jurídica imediata (notificação, cliente exigindo, licitação) —
isso é trabalho proativo pra seguir a Lei Brasileira de Inclusão (Lei nº
13.146/2015, art. 63) e ampliar o alcance da NexusFi pra pessoas com
deficiência. Sem urgência de prazo, mas com padrão técnico definido: **WCAG
2.1, nível AA** — é o padrão de referência usado no Brasil (base do eMAG e da
ABNT NBR 17225) e não há lei brasileira que aponte outro.

O trabalho cobre as duas frentes da plataforma:
- **Site público**: landing (`/`), cadastro (`/register`), login (`/login`),
  política de privacidade (`/privacidade`).
- **Área logada**: dashboard, fluxo de caixa, contas a pagar/receber, centro
  de custo, estoque, vendas, impostos, relatórios, configurações.

## Achados do diagnóstico inicial

Uma varredura no código já revelou problemas concretos, usados aqui como
guia de prioridade (o que corrige mais tela de uma vez só primeiro):

| Onde | Problema | Critério WCAG |
|---|---|---|
| [`app/components/ui/Table.tsx`](../../../app/components/ui/Table.tsx) | Linha clicável (`<tr onClick>`) sem suporte a teclado — usado em quase toda tabela financeira do app | 2.1.1 Keyboard |
| [`app/components/ui/Modal.tsx`](../../../app/components/ui/Modal.tsx) | Sem `role="dialog"`/`aria-modal`, sem prender foco, sem devolver foco ao fechar | 2.4.3, 4.1.2 |
| [`app/components/Navbar.tsx`](../../../app/components/Navbar.tsx) | Botões só-com-ícone sem `aria-label` (hambúrguer, tema no desktop, notificações, avatar); dropdowns sem `aria-expanded`/`role`, sem fechar no Esc | 4.1.2, 2.1.1 |
| [`app/register/page.tsx`](../../../app/register/page.tsx), [`app/login/page.tsx`](../../../app/login/page.tsx) | `<label>` sem `htmlFor`, `<input>` sem `id` — rótulo não associado ao campo | 1.3.1, 4.1.2 |
| Todo o app | Nenhum skip link pra pular a navegação | 2.4.1 |
| [`app/lib/motion.ts`](../../../app/lib/motion.ts), [`app/components/ForceMotion.tsx`](../../../app/components/ForceMotion.tsx) | Ignora `prefers-reduced-motion` do SO (decisão deliberada anterior) | 2.3.3 |
| [`app/components/Footer.tsx`](../../../app/components/Footer.tsx) | Rodapé da landing não linka Política de Privacidade nem nada real (links "Suporte"/"Empresa" são `href="#"`) | 2.4.4 (achado lateral, corrigido de passagem ao adicionar o link da Declaração) |
| `eslint.config.mjs` | `jsx-a11y` já vem embutido via `eslint-config-next`, mas só 6 regras básicas em `warn` — não barra nada | — (prevenção) |

## Abordagem

**Componentes compartilhados primeiro, depois página por página.** Corrigir
`Table`, `Modal`, `Navbar`, `Field`/`Input` uma vez só resolve a maioria das
telas da área logada de um golpe, porque são usados em quase todo lugar. O
que sobrar (conteúdo específico de cada página: texto alternativo, ordem de
heading, contraste, formulários que ainda não usam os componentes
compartilhados) vira uma auditoria manual por página, guiada por checklist.

Alternativas consideradas e descartadas:
- *Auditoria automatizada primeiro (axe-core/Lighthouse CI)*: adiaria toda
  correção real atrás da construção de uma ferramenta de varredura, além de a
  maior parte das telas estar atrás de login (precisaria autenticar o
  crawler) — desproporcional pra uma motivação de "boa prática", sem prazo.
- *Só os componentes de `ui/`, sem tocar página específica*: mais rápido e
  seguro, mas deixaria login/cadastro e a Navbar — as telas que **todo**
  usuário toca sempre — sem correção. Login quebrado pra quem usa leitor de
  tela é o pior lugar possível pra deixar de fora.

## Fases

### Fase 1 — Fundação (componentes compartilhados + porta de entrada)

- `Table.tsx`: linha com `onRowClick` ganha `tabIndex={0}`, `role="button"`,
  `aria-label` descritivo, e `onKeyDown` disparando em Enter/Espaço.
- `Modal.tsx`: `role="dialog"` + `aria-modal="true"` + `aria-labelledby`
  apontando pro título; foco move pro modal ao abrir (primeiro elemento
  focável, ou o próprio card se não houver nenhum) e volta pro elemento que
  abriu ao fechar; `Tab`/`Shift+Tab` ficam presos dentro do modal enquanto
  aberto.
- `Navbar.tsx`: `aria-label` em todo botão só-com-ícone (hambúrguer, alternar
  tema no desktop, sino, avatar); `aria-expanded` + `aria-haspopup="menu"`
  nos botões que abrem os dropdowns de notificação/usuário; Esc fecha os
  dois dropdowns e devolve o foco pro botão que abriu.
- `register/page.tsx` e `login/page.tsx`: liga cada `<label>` ao seu
  `<input>` via `htmlFor`/`id` (`useId()` como em `Field.tsx`).
- Skip link ("Pular para o conteúdo") no `layout.tsx`, antes da Navbar —
  invisível até ganhar foco via Tab, pula pro `<main>` de cada página (as
  páginas que ainda não tiverem um `<main>` identificável ganham um).
- `eslint.config.mjs`: adiciona o preset `recommended` do
  `eslint-plugin-jsx-a11y` (já é dependência transitiva do
  `eslint-config-next`, sem instalar nada pesado novo) e sobe pra `error`
  as regras `jsx-a11y/click-events-have-key-events`,
  `jsx-a11y/no-static-element-interactions` e
  `jsx-a11y/label-has-associated-control` — as três que pegariam os bugs
  encontrados nesta auditoria antes de irem pro ar.

### Fase 2 — Site público

- Landing (`app/page.tsx`): `alt` correto em toda imagem (decorativa =
  `alt=""`, informativa = descrição), conferir contraste mínimo 4.5:1 nos
  textos sobre fundo degradê/colorido, ordem de headings.
- `Footer.tsx`: troca os links mortos (`href="#"`) da coluna "Suporte" por
  link real da Política de Privacidade e da nova Declaração de
  Acessibilidade (não reescreve o resto do rodapé — copy genérica de
  "investimentos"/"Banco Central" é um problema de conteúdo à parte, fora
  deste escopo).
- Nova página **`/acessibilidade`** (Declaração de Acessibilidade), mesmo
  layout/estilo de `/privacidade`: compromisso, padrão seguido (WCAG 2.1 AA),
  o que foi feito nesta rodada, limitações conhecidas (ver abaixo), contato
  pra reportar barreira reaproveitando `privacidade@nexusfi.com.br` (sem
  criar canal novo).

### Fase 3 — Área logada

- Auditoria manual, página por página, do que sobra fora dos componentes já
  corrigidos na Fase 1: formulários locais que não usam `Field`/`Input`,
  botões de ícone soltos, ordem de heading em cada tela.
- Gráficos (`CashFlow.tsx`, KPIs do dashboard): garantir que o dado por trás
  de cada gráfico também está acessível como texto/tabela pra quem usa
  leitor de tela — sem reconstruir o gráfico em si.
- Nova opção **"Reduzir animações"** em Configurações → Aparência (ver
  detalhe técnico abaixo).

### Fase 4 — Fechamento

- Checklist manual: navegação 100% por teclado (Tab/Enter/Esc) nos fluxos
  alterados; teste com leitor de tela (Narrador do Windows ou NVDA) em três
  fluxos: login → dashboard, abrir um lançamento numa tabela, preencher e
  salvar um formulário.
- `npm run lint` limpo com as regras novas.

## Reduzir animações — controle manual do usuário (não do SO)

Decisão explícita: **não** seguir `prefers-reduced-motion` do sistema
operacional — o usuário liga/desliga direto no app, sem depender de
configuração do SO. Replica o padrão já usado pelo tema claro/escuro:

- `localStorage["nexusfi-reduced-motion"]` (`"1"` | `"0"`) +
  `data-reduced-motion="1"` no `<html>`, aplicado por um script inline em
  `layout.tsx` (igual ao script que já aplica `data-theme`) — evita flash de
  animação antes do React hidratar.
- Regra CSS nova em `globals.css`: sob `html[data-reduced-motion="1"]`, zera
  duração de toda animação/transição e força `scroll-behavior: auto`. É o
  reset padrão de `@media (prefers-reduced-motion: reduce)`, só que
  amarrado no atributo em vez da media query.
- `ForceMotion.tsx` só chama `installForcedSmoothScroll()` quando o atributo
  está ausente/`"0"`. Ligado, a rolagem forçada não é instalada — a rolagem
  fica instantânea (`scroll-behavior: auto` nativo) e as animações CSS
  somem via regra acima.
- Novo hook `app/hooks/useReducedMotion.ts`, cópia do padrão de
  `useTheme.ts` (mesmo `MutationObserver` + listener de `storage` pra
  sincronizar entre abas).
- Nova linha em `AparenciaTab.tsx`, reaproveitando o componente `Segmented`
  já existente: "Movimento" — "Padrão" / "Reduzido". Default **Padrão** —
  ninguém tem o comportamento de hoje alterado até escolher ativar.

## Fora de escopo / limitações conhecidas (documentadas na Declaração)

- Relatórios exportados em PDF não são auditados nesta rodada.
- Gráficos financeiros continuam sem uma alternativa nativa além da tabela
  de dados subjacente (não viram, por exemplo, sonificação de dados).
- Cópia genérica/desatualizada do `Footer.tsx` (menções a "investimentos" e
  "Banco Central" que não correspondem ao produto) não é reescrita — é um
  problema de conteúdo, não de acessibilidade; só os links mortos que
  afetam este trabalho são corrigidos.
- Auditoria de contraste feita visualmente com os tokens de cor existentes;
  não inclui uma varredura automatizada de todas as combinações
  cor-de-fundo/cor-de-texto do sistema.

## Testes / QA

- `npm run lint` (pega as regras `jsx-a11y` novas em `error`).
- Navegação só-com-teclado nos fluxos alterados (Tab, Shift+Tab, Enter,
  Espaço, Esc).
- Smoke test com leitor de tela (Narrador do Windows/NVDA) em: login →
  dashboard; abrir um lançamento numa tabela (fluxo de caixa ou contas a
  pagar); preencher e salvar um formulário.
- Verificação manual de contraste (WebAIM Contrast Checker ou DevTools) nos
  textos tocados nas Fases 1 e 2.
