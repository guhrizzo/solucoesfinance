# Conciliação linha a linha no Fechamento de Caixa por Dia

**Data:** 2026-08-31
**Área:** `app/relatorios/page.tsx` (aba Fluxo de Caixa → card "Fechamento de Caixa por Dia/Mês")

## Problema

Hoje o card **Fechamento de Caixa** agrupa os lançamentos do `cashflow` do período
por dia (visão Mensal) ou por mês (visão Anual). O botão **Conferir** apenas grava
`reconciled = true` em todos os lançamentos daquele dia de uma vez (`writeBatch`).

Não há:
- visão dos lançamentos individuais de cada dia dentro desse card;
- forma de conciliar um lançamento por vez;
- forma de corrigir a categoria de um lançamento a partir daqui;
- total do que já foi efetivamente conciliado.

O usuário quer conferir **linha a linha**, ajustar a **categoria** de cada lançamento
(refletindo no Fluxo de Caixa) e ver o **total conciliado** do período.

## Escopo

Alterações apenas em:
- `lib/cashflowCategories.ts` — **novo** módulo compartilhado.
- `app/components/CashFlow.tsx` — passa a importar as categorias do módulo novo.
- `app/relatorios/page.tsx` — toda a UI e lógica de conciliação linha a linha.

Fora de escopo: alterações no PDF (`lib/reportPdf.ts`), PIN/auditoria, mudanças na
aba Faturamento/DRE, mudança no modelo de dados do `cashflow` além dos campos já
existentes (`category`, `reconciled`, `reconciledAt`).

## Design

### 1. Módulo compartilhado de categorias — `lib/cashflowCategories.ts`

Extrai a constante `CAT` que hoje vive em `app/components/CashFlow.tsx:68`:

```ts
export type TxType = "entrada" | "saida";

export const CASHFLOW_CATEGORIES: Record<TxType, string[]> = {
  entrada: ["Vendas", "Serviços prestados", "Recebimento de clientes", "Investimentos", "Outros recebimentos"],
  saida:   ["Fornecedores", "Folha de pagamento", "Aluguel", "Impostos", "Marketing", "TI / Software", "Outros gastos"],
};
```

- `app/components/CashFlow.tsx`: remove a constante local `CAT`, importa
  `CASHFLOW_CATEGORIES` e substitui as referências `CAT.entrada` / `CAT.saida`
  (linhas ~230 e ~476). `CAT_ICON` continua local ao CashFlow (não é compartilhado).
- `app/relatorios/page.tsx`: importa `CASHFLOW_CATEGORIES` para popular os
  `<select>` de categoria.

Objetivo: o seletor de categoria no Fechamento de Caixa oferece exatamente as
mesmas opções que o formulário do Fluxo de Caixa.

### 2. `periodClosings` carrega os lançamentos do grupo

No `useMemo` de `periodClosings` (`app/relatorios/page.tsx:281`), além dos
agregados atuais (`ids`, `count`, `entradas`, `saidas`, `saldo`, `done`), cada
row passa a incluir:

- `txs: Tx[]` — os lançamentos daquele dia/mês, ordenados por `date` desc e
  depois `createdAt` desc.

O restante do cálculo (`doneCount`, `total`, `done`) permanece igual — `done`
continua sendo `count > 0 && reconciledCount === count`, ou seja, o status do
período segue derivado do estado individual dos lançamentos.

### 3. Linha do dia expansível

Estado novo no componente:

```ts
const [expandedKey, setExpandedKey] = useState<string | null>(null);
```

- A célula **Lançamentos** vira um botão: `{count}` + ícone chevron
  (`ChevronDown`, rotaciona quando aberto). Clique alterna
  `expandedKey === row.key ? null : row.key`. Um dia aberto por vez.
- Quando `expandedKey === row.key`, renderiza **uma `<tr>` extra** logo abaixo da
  linha do dia, com um `<td colSpan={7}>` contendo uma sub-tabela dos lançamentos.

Cada linha da sub-tabela mostra:

| Coluna | Conteúdo |
|---|---|
| Descrição | `tx.description` + `tx.date` curto abaixo (dd/mm) |
| Tipo | seta ↑ verde (entrada) / ↓ vermelha (saída) |
| Categoria | `<select>` com `CASHFLOW_CATEGORIES[tx.type]`, valor atual = `tx.category` |
| Valor | `+`/`-` + `toBRL(tx.amount)`, respeitando `hideValues` |
| Conciliado | `<input type="checkbox" checked={!!tx.reconciled}>` |

Se `tx.category` não estiver na lista (dado legado), o `<select>` inclui a opção
atual como primeiro item para não perder o valor.

### 4. Auto-save (gravação imediata)

Sem botão Salvar. Cada interação grava direto no doc
`users/{uid}/cashflow/{tx.id}` via `updateDoc`:

- **Troca de categoria** (`onChange` do `<select>`):
  `updateDoc(ref, { category: novaCategoria })`.
- **Checkbox de conciliado** (`onChange`):
  `updateDoc(ref, { reconciled: checked, reconciledAt: checked ? Date.now() : null })`.
  Mesma semântica de campos que o `writeBatch` atual do botão Conferir.

Padrão de implementação (espelha `handleToggleClosing`):

```ts
const [lineBusy, setLineBusy] = useState<string | null>(null); // `${txId}:cat` | `${txId}:rec`

async function updateLine(txId: string, patch: Record<string, unknown>, busyTag: string) {
  if (!uid || lineBusy) return;
  setLineBusy(busyTag);
  try {
    const { getFirebase } = await import("@/lib/firebase");
    const { doc, updateDoc } = await import("firebase/firestore");
    const { db } = await getFirebase();
    await updateDoc(doc(db, "users", uid, "cashflow", txId), patch);
  } catch (err) {
    console.error("Erro ao atualizar lançamento:", err);
  } finally {
    setLineBusy(null);
  }
}
```

O `onSnapshot` já ativo em `txs` repinta a tabela automaticamente após cada
gravação — não há estado local de lançamento para sincronizar. O controle
(`<select>` / checkbox) fica `disabled` enquanto `lineBusy` referente a ele
estiver setado.

### 5. Botão Conferir / Reabrir do dia — inalterado

Mantido exatamente como hoje: mesmo rótulo (**Conferir** / **Reabrir**), mesma
posição na coluna Ação, mesma função `handleToggleClosing` fazendo `writeBatch`
sobre todos os `ids` do período. Continua sendo o atalho para conferir/reabrir o
dia inteiro; agora convive com as checkboxes individuais. Como `done` é derivado,
marcar todas as checkboxes manualmente também deixa o dia "Conferido", e o botão
passa a exibir "Reabrir".

### 6. Totais da conciliação

Novo `useMemo` (ou campos adicionais em `periodClosings`) somando **apenas
lançamentos com `reconciled === true`** dentro de `filteredTxs`:

```ts
const conciliado = useMemo(() => {
  let entradas = 0, saidas = 0, count = 0;
  filteredTxs.forEach(tx => {
    if (!tx.reconciled) return;
    count++;
    if (tx.type === "entrada") entradas += tx.amount; else saidas += tx.amount;
  });
  return { entradas, saidas, saldo: entradas - saidas, count, total: filteredTxs.length };
}, [filteredTxs]);
```

Exibição:

- **`<tfoot>` na tabela do Fechamento**, linha "Total conciliado":
  colunas Entradas / Saídas / Saldo preenchidas com
  `conciliado.entradas` / `conciliado.saidas` / `conciliado.saldo`
  (formato `toBRL`, respeitando `hideValues`, cores verde/vermelha/condicional
  como nas linhas normais). Colunas Dia/Status/Ação ficam com o rótulo
  "Total conciliado" na primeira célula.
- Perto do contador `{doneCount}/{total}` "Períodos conferidos" no cabeçalho do
  card, adicionar uma linha menor:
  `{conciliado.count} de {conciliado.total} lançamentos conciliados`.

### Fluxo de dados

```
onSnapshot(users/{uid}/cashflow)  ──▶  txs  ──▶  filteredTxs  ──┬──▶ periodClosings.rows[].txs  ──▶ sub-tabela expandida
                                                                └──▶ conciliado (totais)         ──▶ tfoot + contador
       ▲
       │ updateDoc({category}) / updateDoc({reconciled, reconciledAt})   ◀── <select> / checkbox (auto-save)
       │ writeBatch({reconciled, reconciledAt})                          ◀── botão Conferir/Reabrir (inalterado)
```

## Erros e casos de borda

- **Sem `uid`** ou gravação em andamento (`lineBusy`): interação ignorada.
- **Falha de `updateDoc`**: `console.error`, controle volta ao estado do snapshot
  (nada muda localmente porque não há estado otimista).
- **Categoria legada** fora de `CASHFLOW_CATEGORIES`: incluída como primeira
  `<option>` do `<select>` daquele lançamento.
- **Dia sem lançamentos**: não ocorre — grupos só existem se houver `tx`.
- **Troca de período (Mensal/Anual) ou busca** com um dia expandido: `expandedKey`
  pode apontar para uma `key` que não existe mais; o render simplesmente não acha
  a row e nada é exibido. Opcional: `useEffect` que zera `expandedKey` quando
  `filterPeriod` ou `searchQuery` muda.
- **`hideValues`**: sub-tabela e `tfoot` respeitam, exibindo `•••`.

## Testes / verificação manual

Via preview (dev server) na aba Relatórios → Fluxo de Caixa:

1. Expandir um dia pendente → lista de lançamentos aparece com categoria e checkbox.
2. Trocar a categoria de um lançamento → recarregar a aba Fluxo de Caixa
   (`app/components/CashFlow.tsx`) e confirmar que a categoria mudou lá.
3. Marcar todas as checkboxes de um dia → status vira "Conferido", botão vira
   "Reabrir", sem clicar em Conferir.
4. Botão Conferir/Reabrir continua marcando/desmarcando o dia inteiro.
5. Linha "Total conciliado" no rodapé bate com a soma manual dos lançamentos
   marcados; contador "N de M lançamentos conciliados" correto.
6. `Ocultar valores` mascara a sub-tabela e o rodapé.
7. Sem erros no console / network.
