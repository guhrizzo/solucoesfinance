# Centro de Custo — Orçamento mensal + baixa sincronizada com o Fluxo de Caixa

## Contexto geral

Pedido do usuário: cinco frentes de melhoria, uma por módulo do app interno (Centro de Custo, Impostos, Faturamento, Precificação, Estoque). São subsistemas independentes — cada um vira sua própria spec → plano → implementação. Esta é a primeira: **Centro de Custo**, escolhida por ter menor ambiguidade e por já existir, em Contas a Pagar, o padrão exato de sincronização que a segunda parte do pedido precisa.

Pedido original para este módulo:
1. "Incluir data para cada período."
2. "Incluir baixa no centro das despesas pagas no fluxo de caixa de forma sincronizada."

## Problema — achados técnicos

Levantados por exploração direta do código antes do brainstorming:

- **"Período" é só um texto fixo**: `const [period] = useState("Abr 2025")` em [costCenter/page.tsx](../../../app/costCenter/page.tsx) nunca muda — é passado pro `Navbar` só como label. O botão de período no `Navbar` (`.nxfi-period-btn`) não tem `onClick` em lugar nenhum do app; é puramente decorativo hoje, em qualquer página.
- **Orçamento e gasto são totais vitalícios, não mensais**: `CostCenter.budget` é um número único; `CostCenter.spent`/`categories[].spent` é um acumulador que só cresce a cada despesa salva (em `handleSubmit`), nunca reseta por mês. Não existe hoje nenhuma forma de saber "quanto foi orçado/gasto em Outubro" separado de "quanto foi orçado/gasto desde sempre".
- **A sincronização com o Fluxo de Caixa já existe — só falta o gatilho rápido**: `handleSubmit` (linhas ~358-380 de `costCenter/page.tsx`) já cria/atualiza/remove o lançamento em `users/{uid}/cashflow` via um campo `sourceExpenseId`, condicionado a `status === "pago"`. Isso roda hoje só quando o usuário salva a despesa pelo modal (criação ou edição). Não existe um botão de "marcar como pago" direto no card da despesa — ao contrário de Contas a Pagar, que tem exatamente esse botão (`handlePay`, em `contasPagar/page.tsx:842-858`), fazendo `updateDoc` do status + `addDoc`/`updateDoc` no cashflow.
- **Consumidor cruzado do campo `budget`**: o KPI "Orçamento" do Fluxo de Caixa ([CashFlow.tsx:724-737](../../../app/components/CashFlow.tsx)) soma `budget` de todos os centros de custo do usuário via `onSnapshot` na coleção `costCenters`, e usa essa soma na fórmula da Previsão (`Orçamento + Contas a pagar - Contas a receber pendentes`, exibida no modal que foi renomeado de "Meta de gastos" para "Orçamento"). Qualquer mudança na forma como `budget` é armazenado precisa manter esse consumidor funcionando.
- **Código morto adjacente**: `app/components/CategoryBreakdown.tsx` e `lib/cost-center-categories.ts` definem um modelo próprio (`CostCenterExpanded`, `CategorySpend`) que não é usado por nenhuma página — não é o `CostCenter` real do módulo. Não serão tocados nem reaproveitados nesta spec.

## Solução

### 1. Orçamento por mês (`app/costCenter/page.tsx`)

- `CostCenter.budget: number` vira `CostCenter.budgetsByMonth: Record<string, number>`, chave no formato `"YYYY-MM"`. Cada centro passa a ter um valor de orçamento independente por mês.
- A página ganha um seletor de mês/ano local (`< Ago 2026 >`), guardado em estado do componente (não precisa persistir — sempre abre no mês atual). Esse seletor filtra:
  - o orçamento exibido por centro (`budgetsByMonth[mêsSelecionado]`);
  - o "gasto" exibido por centro;
  - a lista de despesas mostrada.
- **Gasto por período deixa de ser um acumulador armazenado** e passa a ser calculado a cada render: soma de `amount` das despesas daquele centro com `status === "pago"` e `date` dentro do mês selecionado. Isso substitui `CostCenter.spent` e `categories[].spent` como fonte da verdade para a visão por período — os campos antigos deixam de ser lidos/escritos pela página (a lógica em `handleSubmit` que os mantinha é removida junto).
- **Mês sem orçamento definido**: mostra R$ 0,00 com indicação visual de "orçamento não definido" e um atalho para defini-lo ali mesmo (input inline ou abrir o modal de orçamento do centro pré-focado nesse mês) — nunca herda valor de outro mês silenciosamente.

### 2. Baixa rápida (`app/costCenter/page.tsx`)

- Card de despesa com `status` `"pendente"` ou `"agendado"` ganha um botão "Marcar como pago", visualmente equivalente ao já existente em Contas a Pagar.
- Ao clicar: `updateDoc` do status da despesa para `"pago"` (com `paidAt`) + a mesma lógica de sincronização com `users/{uid}/cashflow` via `sourceExpenseId` que `handleSubmit` já usa (criar se não existe lançamento para essa despesa, senão atualizar) — extraída para uma função compartilhada (`syncExpenseCashflow` ou similar) reaproveitada tanto pelo salvamento via modal quanto por esse botão rápido, para não duplicar a lógica.
- Como o "gasto por período" agora é sempre derivado das despesas reais (item 1), a baixa reflete automaticamente no orçamento do mês certo — não precisa de nenhum passo extra de reconciliação.

### 3. Ajuste no consumidor cruzado (`app/components/CashFlow.tsx`)

- O listener de `costCenters` que hoje soma `doc.data().budget` (linha ~730) passa a somar `doc.data().budgetsByMonth?.[mêsAtualNoFormatoYYYY-MM] ?? 0` — mantém o KPI "Orçamento" do Fluxo de Caixa correto, sempre refletindo o orçamento do mês corrente (a Previsão é, por natureza, uma projeção do período atual, então usar o mês atual aqui é a leitura certa desse KPI — diferente da tela de Centro de Custo, que deixa o usuário navegar por qualquer mês).

### Escopo desta etapa (arquivos tocados)

- `app/costCenter/page.tsx` — modelo de dados, seletor de período, gasto derivado, botão de baixa rápida, função compartilhada de sync com cashflow
- `app/components/CashFlow.tsx` — ajusta o listener do KPI "Orçamento" para ler `budgetsByMonth` no mês atual

### Migração de dados existentes

Centros de custo já criados têm `budget` (número) e não têm `budgetsByMonth`. Na primeira leitura de um centro sem `budgetsByMonth`, a página trata `budget` (se existir) como o valor do mês atual apenas (não retroage para meses passados nem projeta pros futuros) e grava isso em `budgetsByMonth` na primeira edição — não é feita nenhuma migração em lote no Firestore; a compatibilidade é resolvida em runtime, na leitura.

## Fora de escopo

- Migrar `CategoryBreakdown.tsx`/`lib/cost-center-categories.ts` ou adotá-los — permanecem código morto, não tocados.
- Reaproveitar/consertar o botão de período do `Navbar` — o seletor desta spec vive só dentro da página de Centro de Custo.
- Impostos, Faturamento, Precificação, Estoque — specs futuras e independentes.
- Qualquer alteração no fluxo de criação/edição de despesa pelo modal além de reaproveitar a lógica de sync já existente numa função compartilhada.

## Validação planejada

- `tsc --noEmit` e lint limpos nos dois arquivos tocados.
- No browser: criar um centro de custo, definir orçamento em dois meses diferentes, confirmar que trocar o seletor de mês troca orçamento/gasto/lista corretamente; criar despesa `pendente`, clicar "Marcar como pago", confirmar que aparece em `users/{uid}/cashflow` e que o gasto do mês do centro reflete o valor; confirmar que o KPI "Orçamento" do Fluxo de Caixa continua mostrando o valor correto do mês atual após a migração do campo.
