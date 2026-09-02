# Recorrência "numeral" (parcelas mensais) — Contas a Pagar / Receber

**Data:** 2026-09-01
**Status:** aprovado, aguardando plano de implementação

## Problema

Em `/contasPagar` e `/contasReceber` existe um seletor **RECORRÊNCIA** com 4 opções
(`Única`, `Mensal`, `Trimestral`, `Anual`). Hoje é **puramente cosmético** — o valor
`recurrence` só vira um badge no card; não há nenhuma lógica de repetição, nem
reflexo no Fluxo de Caixa.

## Objetivo

Trocar por **2 opções — `Única` e `Numeral`** — e dar lógica real ao Numeral:
o usuário informa uma quantidade `N` de parcelas mensais; o sistema cria `N`
cobranças/contas, uma por mês a partir do vencimento escolhido; enquanto não
quitadas, essas parcelas aparecem no Fluxo de Caixa como **lançamentos previstos**
(informativos), e viram lançamento realizado quando marcadas como pagas/recebidas
pelo fluxo que já existe.

## Decisões de design (definidas no brainstorming)

| Pergunta | Decisão |
|---|---|
| Como as parcelas aparecem no caixa | **Previstas desde já** (linha na lista do mês, visual distinto), realizadas ao quitar |
| Modelo de dados | **N documentos reais**, um por mês, agrupados por `seriesId` |
| Editar/excluir série | **Dialog "só esta" / "esta e as próximas não pagas"** |
| Escopo dos previstos no caixa | **Só séries numeral** não quitadas (contas avulsas continuam entrando só ao quitar) |
| Previsto conta no Saldo? | **Não** — Entradas/Saídas/Saldo/Resultado seguem só com realizado; previsto é informativo |

## 1. UI da Recorrência

Vale igual para `app/contasPagar/page.tsx` (`BillModal`) e
`app/contasReceber/page.tsx` (`ReceivableModal`) — os dois modais têm estrutura
praticamente idêntica.

- `type Recurrence = "unica" | "numeral"` (era `"unica" | "mensal" | "trimestral" | "anual"`)
- O grid de 4 botões vira **2 botões**: `Única` | `Numeral`
- Ao selecionar **Numeral**, renderiza abaixo um campo numérico
  **"Parcelas mensais"**:
  - `<input type="number">`, `min=2`, `max=60`, default `2`
  - valor inválido (< 2, vazio, > 60) desabilita o salvar com hint
- Quando Numeral está ativo:
  - o label do campo de valor passa de "Valor" para **"Valor por parcela"**
  - texto auxiliar abaixo do campo: `"{N} parcelas de {toBRL(valor)} · total {toBRL(valor * N)}"`
  - o seletor **"Status inicial"** é forçado em `"pendente"` e fica desabilitado
    (visualmente esmaecido) — não se pré-quita uma série
- **Modo edição** de um doc que **não** tem `seriesId`: o botão "Numeral" fica
  desabilitado com tooltip *"Parcelamento só na criação"*. (Editar um doc de série
  não mexe na recorrência — ver seção 4.)
- No card da lista (`bill.recurrence !== "unica"` / `receivable.recurrence !== "unica"`):
  o badge com `<Repeat/>` mostra **`Parcela {installmentIndex}/{installmentCount}`**
  em vez do label da recorrência.

## 2. Modelo de dados

`Bill` e `Receivable` ganham 3 campos opcionais, **preenchidos só quando
`recurrence === "numeral"`**:

```ts
seriesId?: string;         // uuid — agrupa as parcelas da mesma série
installmentIndex?: number; // 1..N (posição desta parcela)
installmentCount?: number; // N (tamanho da série)
```

`recurrence` continua no doc (`"numeral"`), então dá pra identificar uma conta
parcelada sem carregar a série inteira. `Única` = 1 documento, nenhum desses
campos.

Sem migração de dados: docs antigos com `recurrence` `"mensal"/"trimestral"/"anual"`
continuam no banco; na UI o `RECURRENCE_LABEL` não terá mais essas chaves, então
o badge trata qualquer valor desconhecido como "Única" (badge some). Nenhum
desses tinha lógica, então não há perda.

## 3. Geração da série (ao criar)

No `handleSave` de cada página, quando `recurrence === "numeral"` **e não é edição**:

1. `seriesId = crypto.randomUUID()`
2. Monta `N` objetos de parcela e grava num **`writeBatch`** (Firestore, ≤ 500 ops):
   - parcela `i` (0-based, `i` de `0` a `N-1`):
     - `dueDate` = data escolhida **+ `i` meses**. Cálculo: pega ano/mês/dia da
       data base; soma `i` ao mês; se o dia não existe no mês alvo (31 → fev),
       **clampeia pro último dia do mês alvo**. Helper novo `addMonthsClamped(iso, i)`.
     - `amount` = valor por parcela (idêntico em todas)
     - `installmentIndex = i + 1`, `installmentCount = N`, `seriesId`
     - `status = "pendente"`
     - `title` = título do usuário, **sem sufixo** (o "x/N" vem de `installmentIndex`)
     - copiados de forma idêntica: `category`, `notes`, `photos`, `partyName`,
       `partyDoc`, `paymentMethod` (previsto), `recurrence: "numeral"`
     - `createdAt`, carimbos de auditoria (`stampCreate`) em todas
3. Continua sendo **1 verificação de PIN** (o fluxo de PIN do modal roda antes de
   `onSave`; nada muda ali)
4. Toast: `"{N} parcelas criadas ({mês/ano da 1ª} → {mês/ano da última})"`
5. **Sync com o caixa:** `syncBillCashflow` roda por doc como hoje. Como todas
   nascem `"pendente"`, nenhuma cria espelho — correto (o "previsto" é derivado,
   ver seção 5).

`Única` (ou edição): comportamento atual intacto — 1 `addDoc`/`updateDoc`.

### Contas a Receber

`app/contasReceber/page.tsx` não tem helper de sync (`syncReceivableCashflow` não
existe) — hoje o lançamento no caixa é criado inline no `handleReceive` quando a
cobrança é marcada como recebida. **Isso não muda.** A geração da série cria `N`
docs em `receivables` com os mesmos campos; cada parcela, ao ser recebida, cria
seu lançamento pelo fluxo atual.

## 4. Editar / excluir parcela de série

Novo componente **`app/components/SeriesScopeDialog.tsx`** — modal pequeno no
estilo do `ConfirmModal` já existente, com 2 ações:

- **"Só esta parcela"**
- **"Esta e as próximas não pagas"**

(+ Cancelar). Props: `open`, `title`, `message`, `onPick(scope: "one" | "forward")`,
`onCancel`, `loading`.

### Quando abre

Só quando o doc alvo tem `seriesId`. Sem `seriesId` → fluxo atual direto (sem dialog).

### Editar

O modal de edição salva normalmente para o doc atual. **Depois** do save, se o
doc tem `seriesId`, abre o `SeriesScopeDialog`:

- **"Só esta"**: nada além do save já feito.
- **"Esta e as próximas não pagas"**: `writeBatch` aplicando os campos
  **`title`, `amount`, `category`, `notes`, `paymentMethod`** (não `dueDate`, não
  `status`) a todos os docs da série com:
  - mesmo `seriesId`
  - `installmentIndex > installmentIndex` do doc editado
  - `status` ∉ {`"pago"`, `"recebido"`}
  Para cada um afetado, roda `syncBillCashflow` (contasPagar) — como estão
  pendentes, é no-op, mas mantém a idempotência.

> Nota de implementação: fazer o dialog **antes** do save daria pra evitar salvar
> duas vezes o doc atual, mas quebra o fluxo de PIN (que já dispara `onSave`).
> Salvar o atual e depois propagar é mais simples e o custo (1 write extra) é
> irrelevante.

### Excluir

O `handleDeleteConfirm` (que já roda atrás de PIN) passa a checar `seriesId`:

- Sem `seriesId`: fluxo atual (apaga o doc + `syncBillCashflow` com status
  `"removido"` pra limpar espelho).
- Com `seriesId`: abre `SeriesScopeDialog`:
  - **"Só esta"**: apaga só o doc atual (+ limpa espelho no caixa se estava pago).
  - **"Esta e as próximas não pagas"**: `writeBatch` apagando os docs da série com
    `installmentIndex >= atual` e `status` ∉ {`"pago"`, `"recebido"`}. Para cada
    um, `syncBillCashflow` status `"removido"` (no-op se pendente). **Parcelas já
    pagas/recebidas ficam** — são histórico real com lançamento no caixa.

## 5. Fluxo de Caixa — parcelas previstas

`app/components/CashFlow.tsx`.

### Listeners

Hoje há um listener em `users/{ownerUid}/bills` que guarda só `{ amount, dueDate }`
(pro KPI "Orçamento"). Mudanças:

- O listener de `bills` passa a guardar também
  `{ id, title, category, status, recurrence, seriesId, installmentIndex, installmentCount }`
- **Novo** listener em `users/{ownerUid}/receivables` guardando os mesmos campos
- Ambos continuam sem `where`/`orderBy` (coleção inteira, filtro client-side) —
  sem índice novo

### Derivação dos previstos

`useMemo` novo, `previstos`, recortado pelo `monthKey` em foco:

```
bills  → recurrence === "numeral" && status ∉ {pago}     && dueDate no mês  → saída prevista
receb. → recurrence === "numeral" && status ∉ {recebido} && dueDate no mês  → entrada prevista
```

Cada item prevê `{ type, description: `${title}`, amount, installmentIndex,
installmentCount, kind: "aPagar" | "aReceber" }`. **Nada é escrito na coleção
`cashflow`.**

### Render

Na lista do mês em foco, **acima** do primeiro grupo de dias com lançamentos
realizados, um bloco **"Previstos"**:

- cabeçalho com o rótulo "Previstos" + **subtotal**:
  `+ {toBRL(soma entradas previstas)}  ·  − {toBRL(soma saídas previstas)}`
- cada linha: visual esmaecido (opacity ~0.7), ícone de relógio (`CalendarClock`),
  tag pequena "a pagar" / "a receber", `"Parcela 3/6"`, o valor com sinal
- linha **não** abre o modal de edição de lançamento (é derivada, não existe em
  `cashflow`). Clique leva para `/contasPagar` ou `/contasReceber` (link simples).
- se não há previstos no mês, o bloco não aparece

### KPIs

- **Entradas / Saídas / Saldo / Resultado**: inalterados — só `monthTxs` (realizado).
- **Orçamento** (`previsao`): inalterado — ele já soma *todas* as bills do mês
  (pagas ou não); as parcelas numeral entram aí naturalmente, sem mudança.
- Nenhum 6º KPI. O total previsto vive no cabeçalho do bloco "Previstos".

### Transição previsto → realizado

Ao marcar a parcela como paga (contasPagar) o `syncBillCashflow` cria o
lançamento-espelho real; ao receber (contasReceber) o `handleReceive` cria a
entrada. Nos dois casos o `status` do doc sai de "pendente", então o filtro de
`previstos` deixa de pegá-lo — a linha "previsto" some e a "realizada" aparece,
sem código extra.

## 6. Fora de escopo

- Script de migração de `recurrence` antigo (mensal/trimestral/anual)
- `/impostos` (usa `frequency`, modelo separado — não muda)
- Previsão no caixa de contas **avulsas** (não-numeral)
- Trocar `recurrence` de um doc já existente para "numeral" na edição (bloqueado na UI)
- Parcelamento com valores diferentes por parcela / entrada + parcelas
- Reajuste automático (índice) entre parcelas

## Arquivos tocados

| Arquivo | Mudança |
|---|---|
| `app/contasPagar/page.tsx` | `Recurrence` type; UI toggle 2 opções + campo N + "valor por parcela"; `BillModal` trava status; `handleSave` gera série em batch; `handleDeleteConfirm` + edição abrem `SeriesScopeDialog`; badge "Parcela x/N" |
| `app/contasReceber/page.tsx` | idem, adaptado a `Receivable` / `handleReceive` |
| `app/components/CashFlow.tsx` | listener `bills` completo + listener `receivables` novo; `useMemo previstos`; bloco "Previstos" na lista |
| `lib/billTaxSync.ts` | `RECURRENCE_LABEL` sem trimestral/anual; `note` do espelho vira `"Parcela {i}/{N}"` quando série |
| `app/components/SeriesScopeDialog.tsx` | **novo** — modal "só esta / esta e as próximas" |
| helper de datas | `addMonthsClamped(iso, n)` — em `lib/` ou inline nas duas páginas (decidir no plano) |

## Riscos / pontos de atenção

- **Consistência entre as duas páginas:** contasPagar e contasReceber têm modais
  quase idênticos mas duplicados. O plano deve aplicar a mesma mudança nos dois e
  conferir divergências (nomes de estado, `handleReceive` vs `handlePay`).
- **`writeBatch` + carimbo de auditoria:** garantir que `stampCreate` roda em cada
  parcela e que o PIN não é pedido N vezes.
- **Parcela paga no meio da série + "excluir esta e as próximas":** a parcela paga
  fica; confirmar que o texto do dialog deixa isso claro.
- **Fuso horário:** `addMonthsClamped` opera na string `YYYY-MM-DD` sem `Date`
  local pra não escorregar o dia por timezone (o resto do código usa `d + "T12:00:00"`).
