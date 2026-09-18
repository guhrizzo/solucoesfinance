# Centro de Custo — regime de competência (paralelo ao regime de caixa)

## Contexto geral

Pedido do usuário: manter a sincronização atual do Centro de Custo com o Fluxo de Caixa (regime de caixa) exatamente como está, e acrescentar uma segunda forma de lançamento — regime de competência — onde a despesa é reconhecida no mês do fato gerador (quando foi incorrida/contratada), independente de quando é paga em dinheiro. Exemplo dado pelo usuário: uma empresa contrata um produto no mês atual para pagar no mês seguinte — o fato gerador é o mês atual.

Decisões já fechadas na conversa de brainstorming (perguntas feitas e respondidas):
1. Um lançamento de competência é **só reconhecimento contábil** — não gera Conta a Pagar, não gera nenhum lançamento no Fluxo de Caixa.
2. Ele aparece **na mesma lista de despesas do mês**, com uma badge própria diferenciando do regime de caixa. Os KPIs de orçamento/gasto real da página continuam somando só despesas em regime de caixa com `status === "pago"` — sem nenhuma mudança de comportamento aí.
3. O modal de despesa ganha uma aba pra escolher o regime ao criar uma despesa nova.

## Problema — achados técnicos

- `Expense.status` hoje é estritamente `"pago" | "pendente" | "agendado"`, e essa é a variável que dirige praticamente tudo nesta tela: cor da badge (`badge-${status}` em `costCenter.css`), o filtro de status na toolbar, o cálculo de gasto real/orçamento (`centerSpentForMonth`/`expensesForCenterMonth` em `costCenter/page.tsx`, que só contam `status === "pago"`), a quitação automática por orçamento batido (`settleCenterIfBudgetReached` em `lib/costCenterSync.ts`, que só mexe em `pendente`/`agendado`), o botão "Marcar como pago" (só aparece quando `status !== "pago"`) e o gatilho de sincronização com o Fluxo de Caixa (`syncExpenseCashflow`, chamado sempre que a despesa é salva, e que cria/atualiza o espelho quando `status === "pago"` ou remove o espelho caso contrário).
- `ExpenseModal` (mesmo arquivo, `app/[locale]/costCenter/page.tsx`) hoje é um formulário único, sem abas: descrição, categoria, centro, valor, data e status (Pago/Pendente/Agendado). Ao salvar, sempre chama `syncExpenseCashflow`.
- A lista mensal de despesas (`filteredExpenses`) já filtra só por `exp.date.startsWith(selectedMonth)` mais busca/status — não depende de nada específico de regime de caixa, então um lançamento de competência aparece nela automaticamente desde que tenha uma `date` dentro do mês.
- Não existe hoje nenhum conceito de "regime" em nenhum lugar do código (confirmado por busca — zero ocorrências de "competência"/"regime de caixa" no repositório).

## Solução

### 1. `status` ganha um 4º valor: `"competencia"`

Em vez de um campo `regime` paralelo, o discriminador de regime **é** o próprio `status`. Isso evita duplicar checagem em cada um dos consumidores listados acima — um valor de status que não é `"pago"`, `"pendente"` nem `"agendado"` já fica automaticamente fora de:
- `centerSpentForMonth` / `expensesForCenterMonth` (só contam `"pago"`) → orçamento/gasto real não mudam.
- `settleCenterIfBudgetReached` (só mexe em `"pendente"`/`"agendado"`) → nunca quitado automaticamente.
- O botão "Marcar como pago" (hoje `exp.status !== "pago"` — passa a ser `exp.status !== "pago" && exp.status !== "competencia"`).
- `autoSettleMatchingCostCenterExpense` em `app/components/CashFlow.tsx` (já exige `status === "pendente" || "agendado"` pra considerar a despesa candidata a baixa vinda do Fluxo de Caixa) → nunca é alvo de baixa automática pelo lado do caixa.

`Expense.status` (tipo local em `costCenter/page.tsx`) passa de `"pago" | "pendente" | "agendado"` para `"pago" | "pendente" | "agendado" | "competencia"`.

### 2. Salvamento — `ExpenseModal` nunca chama `syncExpenseCashflow` para competência

Quando a despesa é salva com `status: "competencia"`, o `handleSubmit` do modal pula a chamada a `syncExpenseCashflow` inteiramente (não é uma questão de passar um status que a função já trata como "remover espelho" — simplesmente não há necessidade de nenhuma leitura/escrita em `users/{uid}/cashflow` pra esse caminho). A assinatura de `syncExpenseCashflow` (`lib/costCenterSync.ts`) não muda.

Despesas existentes nunca têm `status === "competencia"` (valor novo, nunca gravado antes) — não há migração a fazer.

### 3. `ExpenseModal` — aba de regime

Adiciona um seletor de 2 abas no topo do formulário, acima do campo Descrição: **Regime de Caixa** (padrão, comportamento atual) / **Regime de Competência**.

- **Só aparece escolhível ao criar uma despesa nova.** Editando uma despesa existente, a aba correspondente ao `status` atual já vem selecionada e a troca de aba fica desabilitada — evita o caso ambíguo de "mudar o regime de uma despesa depois de criada" (ex: uma despesa de competência não tem histórico de status pago/pendente pra reverter pra caixa de forma sã).
- **Aba Regime de Caixa**: formulário idêntico ao de hoje — descrição, categoria, centro, valor, data, status (Pago/Pendente/Agendado), nota de sincronização atual ("Despesas 'Pago' sincronizam com fluxo de caixa"). Nenhuma mudança de comportamento.
- **Aba Regime de Competência**: descrição, categoria, centro, valor e um único campo de data rotulado "Data de competência (fato gerador)" — sem seletor de status (é sempre automaticamente reconhecida). Nota própria substituindo a de sincronização: algo como "Reconhecida no mês do fato gerador — não gera lançamento no Fluxo de Caixa." Ao salvar, grava `status: "competencia"` direto.

### 4. Lista, filtro e badge

- A lista mensal (mobile e desktop) não muda de filtro — já mostra qualquer despesa cuja `date` caia no mês selecionado, então lançamentos de competência aparecem nela na posição cronológica normal.
- Badge de status ganha uma variante `.badge-competencia` em `costCenter.css`, usando `--cat-3` (roxo, já usado como cor de categoria em outro contexto — aqui reaproveitado só pela distinção visual, não como categoria) via `color-mix(in srgb, var(--cat-3) 15%, transparent)` de fundo e `var(--cat-3)` de texto — segue o mesmo mecanismo `badge-${exp.status}` que já existe, sem CSS condicional novo em JSX.
- O selo "FC ✓" (lançado no fluxo de caixa) não aparece pra `status === "competencia"` — já é condicionado a `exp.status === "pago"`, então não precisa de mudança.
- O `<select>` de filtro de status ganha uma 4ª opção, "Competência" — mapeada em `costCenter.status.competencia`.

### Escopo desta etapa (arquivos tocados)

- `app/[locale]/costCenter/page.tsx` — tipo `Expense.status`, abas no `ExpenseModal`, exclusão de `"competencia"` do botão "Marcar como pago", nova opção no filtro, badge na lista (mobile + desktop).
- `app/[locale]/costCenter/costCenter.css` — nova classe `.badge-competencia`.
- `app/components/CashFlow.tsx` — nenhuma mudança de lógica; `autoSettleMatchingCostCenterExpense` já exclui `"competencia"` por já checar `status === "pendente" || "agendado"` (confirmar com um comentário no código apontando essa exclusão implícita, já que hoje o comentário não menciona o valor "competencia" por não existir ainda).
- `lib/costCenterSync.ts` — nenhuma mudança de assinatura; só não é chamado nesse caminho novo.
- `messages/{pt-BR,en,es}/costCenter.json` — novas chaves: aba de regime, nota da aba de competência, rótulo do campo de data de competência, `status.competencia`.

## Fora de escopo

- Nenhum KPI/relatório específico de competência — orçamento e "gasto real" da página continuam somando só regime de caixa (`status === "pago"`), sem nenhuma visão agregada de competência nesta etapa.
- Nenhuma geração de Conta a Pagar a partir de um lançamento de competência.
- Nenhuma forma de converter/trocar o regime de uma despesa já criada.
- Nenhuma mudança em Relatórios, Dashboard ou DRE — este é só o lançamento na origem (Centro de Custo); consumo desses dados em regime de competência em outras telas fica pra uma spec futura, se vier a ser pedido.

## Validação planejada

- `npx tsc --noEmit` depois da mudança de tipos.
- Teste manual no navegador (login real necessário — Firebase + PIN): criar uma despesa em cada aba, confirmar que a de competência aparece na lista com a badge nova e sem afetar os KPIs de orçamento/gasto real do centro, e que não cria nada em `users/{uid}/cashflow`; confirmar que a de caixa continua se comportando exatamente como antes (inclusive baixa automática vinda de uma saída no Fluxo de Caixa, que já existia).
