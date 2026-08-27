# Sincronização Contas a Pagar / Impostos → Fluxo de Caixa

**Data:** 2026-08-26
**Status:** aprovado

## Objetivo

Quando uma **conta a pagar** ou um **imposto** está com status **pago**, ele
deve aparecer como um lançamento de **saída** no Fluxo de Caixa. Quando deixa de
estar pago (edição) ou é excluído, esse lançamento deve sumir junto.

Sincronização de mão única: a conta / o imposto é a fonte da verdade; o Fluxo de
Caixa apenas reflete. Nada que o usuário faça no lançamento do Fluxo de Caixa
volta para a conta / imposto.

## Estado atual

- `app/contasPagar/page.tsx` → `handlePay` já cria um lançamento em
  `users/{uid}/cashflow` com `sourceBillId`, formato correto. Mas:
  - excluir a conta deixa o lançamento órfão;
  - editar uma conta paga (valor, título, data, categoria) não atualiza o
    lançamento;
  - criar / editar uma conta já com status `pago` (sem passar pelo botão
    "Marcar como pago") não gera lançamento;
  - `bill.cashflowId` é lido em `handleUpdateCategory` mas nunca é gravado
    (código morto).
- `app/impostos/page.tsx` → `handlePay` grava um lançamento **malformado**:
  usa `title` em vez de `description`, `category: "impostos"` (minúsculo, fora
  da lista `CAT.saida` do Fluxo de Caixa), `ref` em vez de um vínculo
  `sourceTaxId`, e sem `note`. Resultado: aparece em branco / sem categoria no
  Fluxo de Caixa.
- `app/components/CashFlow.tsx` → já soma contas e impostos pendentes no card
  "Orçamento / Previsão". Isso não muda.

## Solução

### Arquivo novo: `lib/billTaxSync.ts`

Duas funções idempotentes — podem ser chamadas quantas vezes for, o resultado
final é sempre o mesmo (0 ou 1 lançamento-espelho).

```
syncBillCashflow(db, uid, bill): Promise<void>
syncTaxCashflow(db, uid, tax): Promise<void>
```

Comportamento de cada uma:

1. Localiza o lançamento-espelho:
   `query(collection(db,"users",uid,"cashflow"), where("sourceBillId","==",bill.id))`
   (ou `sourceTaxId` para imposto). Filtro simples de igualdade — não exige
   índice composto, igual ao resto do app.
2. Se o item está **pago**
   (`bill.status === "pago"` / `tax.status === "pago"`):
   - se já existe lançamento → `updateDoc` com os campos abaixo;
   - se não existe → `addDoc`.
3. Se **não** está pago → `deleteDoc` de todos os lançamentos encontrados
   (normalmente 0 ou 1).

Nunca deixa o erro da sincronização travar a operação principal — envolve em
`try/catch` e loga no `console`, mesmo padrão de `autoSettleMatchingCostCenterExpense`
em `CashFlow.tsx`.

### Formato do lançamento-espelho

| campo           | conta a pagar                                   | imposto                                   |
|-----------------|-------------------------------------------------|-------------------------------------------|
| `type`          | `"saida"`                                        | `"saida"`                                  |
| `description`   | `bill.title`                                     | `"Imposto: " + tax.name`                   |
| `category`      | `CAT_TO_CASHFLOW[bill.category] ?? "Outros gastos"` | `"Impostos"`                            |
| `amount`        | `bill.amount`                                    | `tax.amount`                               |
| `date`          | `bill.paidAt || bill.dueDate || hoje`            | `tax.paidAt || tax.dueDate || hoje`        |
| `note`          | `"Conta a pagar · " + RECURRENCE_LABEL[recurrence]` | `"Imposto · " + FREQUENCY_LABEL[frequency]` |
| `paymentMethod` | `bill.paidPaymentMethod` se houver (senão omite) | `tax.paidPaymentMethod` se houver          |
| vínculo         | `sourceBillId: bill.id`                          | `sourceTaxId: tax.id`                      |
| `createdAt`     | `Date.now()` (só na criação; mantém no update)   | idem                                       |

`CAT_TO_CASHFLOW` já existe em `contasPagar/page.tsx`; move para o novo arquivo
e importa de volta na página (ou exporta de lá — decidir na implementação; o
mapa some da lista de constantes locais se movido).

`RECURRENCE_LABEL` / `FREQUENCY_LABEL` são passados como parte do objeto `bill` /
`tax` já resolvidos, ou o helper recebe a string pronta — evita o `lib` importar
constante de página.

### Onde chamar

**`app/contasPagar/page.tsx`**

- `handlePay` — remove o `addDoc` manual do cashflow; troca por
  `updateDoc(bill → pago)` seguido de `syncBillCashflow(db, uid, {...bill, status:"pago", paidAt, paidPaymentMethod: method})`.
- `handleSave` — no fim, depois do `addDoc` / `updateDoc` da conta, chama
  `syncBillCashflow` com o estado final da conta. Cobre "criar já como pago" e
  "editar mudando o status".
- `handleDeleteConfirm` — antes (ou depois) do `deleteDoc`, chama
  `syncBillCashflow(db, uid, {...bill, status:"excluido"})` ou uma variante que
  força a remoção do espelho. Mais simples: `deleteBillCashflow(db, uid, billId)`
  auxiliar, ou passar um flag. Decidir na implementação — resultado: espelho some.
- `handleUpdateCategory` — remove o ramo morto de `bill.cashflowId`; a
  sincronização de categoria passa a sair de graça de `syncBillCashflow`.

**`app/impostos/page.tsx`**

- `handlePay` — remove o `addDoc` malformado; troca por
  `updateDoc(tax → pago)` + `syncTaxCashflow(db, uid, {...tax, status:"pago", paidAt, paidPaymentMethod: method})`.
- `handleSave` — chama `syncTaxCashflow` no fim.
- `handleDelete` — limpa o espelho antes / depois do `deleteDoc`.

**`app/components/CashFlow.tsx`** — nenhuma mudança.

## Fora de escopo

- Reverter a conta / imposto quando o usuário mexe no lançamento do Fluxo de
  Caixa (mão única, decidido).
- Corrigir lançamentos históricos já gravados errados (impostos antigos com
  `title` / `ref`). Só vale para pagamentos novos; os antigos podem ser
  re-salvos manualmente pelo usuário se quiser corrigir.
- Botão "Desmarcar pagamento" — não solicitado. O status já pode ser mudado
  pela edição da conta / imposto, e a sincronização cobre esse caminho.
- Geração automática da próxima conta recorrente ao pagar.

## Riscos

- **Espelho duplicado** se `sourceBillId` / `sourceTaxId` não estiver indexado e
  a query falhar silenciosamente — mitigado pelo `try/catch` que não trava a
  operação e por a query ser de igualdade simples (sempre funciona sem índice).
- **Categoria inválida** se `bill.category` não estiver em `CAT_TO_CASHFLOW` —
  fallback `"Outros gastos"`.
- **Impostos antigos** continuam com o lançamento malformado até serem
  re-salvos. Aceitável (fora de escopo).
