# Leitor de NFS-e com retenção de impostos (Pro) — `/impostos`

**Data:** 2026-09-14
**Status:** aprovado

## Objetivo

Em `/impostos`, o usuário do plano **Pro** consegue subir o PDF (ou foto) de
uma NFS-e onde ele é o **Tomador de Serviço**, e o sistema:

1. extrai o valor bruto do serviço e cada retenção destacada na nota (INSS,
   IRRF, CSLL, COFINS, PIS/PASEP, ISS);
2. calcula o **valor líquido a pagar** ao prestador (bruto − retenções);
3. cria, após revisão do usuário, **um lançamento em `/impostos` por tributo
   retido** — cada retenção é uma obrigação que o Tomador precisa recolher ao
   governo, não ao prestador.

Motivação: hoje isso é feito manualmente (abrir a nota, ler os valores, criar
um imposto de cada vez). O app já tem toda a infraestrutura de OCR de nota
fiscal via Claude (`app/api/analyze-nf/route.ts`, usado no Fluxo de Caixa) —
esta feature reaproveita o padrão para um caso mais estruturado.

## Estado atual (o que já existe e será reaproveitado)

- `app/api/analyze-nf/route.ts` e `app/api/analyze-extract/route.ts` — já
  mandam PDF/imagem/XML de nota fiscal pro Claude (`claude-haiku-4-5-20251001`)
  e voltam JSON. Não são autenticados (rate-limit só por IP) porque extraem um
  único valor pra prefill de formulário — não servem de gate. A rota nova
  desta spec **precisa ser autenticada**, ver seção "Segurança".
- `app/components/CashFlow.tsx` → `ImportModal` (linha ~562) já implementa
  exatamente o fluxo de estados que esta feature replica: `input → loading →
  preview → saving → done`, upload de PDF em base64, prévia com checkboxes de
  seleção, **1 PIN autoriza o lote inteiro**, grava tudo de uma vez.
- `app/[locale]/impostos/page.tsx` já tem o modelo de dados `Tax`, o enum
  `TaxType`, `TaxModal` (criação manual, com upload de anexo pro Storage em
  `taxes/{timestamp}-{nome}`), `syncTaxCashflow` (não dispara pra status
  diferente de "pago", então os lançamentos novos — que nascem "não pago" —
  não tocam o Fluxo de Caixa até serem pagos).
- **Não existe hoje nenhum travamento por *tier* de plano** (Básico vs Pro) em
  lugar nenhum do app — só existe o gate de assinatura ativa/expirada
  (`SubscriptionGate.tsx`, `useSubscription`). Até `/estoque` (Mercado Livre /
  Shopee / TikTok Shop), que a página de preços vende como exclusivo do Pro,
  não tem esse travamento hoje. Esta feature introduz o primeiro.
- `lib/billingPlans.ts` já expõe `getPlan(planId)?.tier` (`"basico" | "pro"`).
- `lib/apiScope.ts` → `requireScope(req, need?)` já verifica o ID token do
  Firebase (Admin SDK) e resolve `ownerUid`/permissões — é o padrão de toda
  rota autenticada do projeto.

## Solução

### 1. `lib/billing.ts` — helper `isProAccess`

```ts
export function isProAccess(state: Pick<SubscriptionState, "plan" | "comped">): boolean {
  if (state.comped) return true;
  if (!state.plan) return false; // trial (plan===null) NÃO conta como Pro — decisão de produto
  return getPlan(state.plan)?.tier === "pro";
}
```

Reaproveitado tanto no cliente (`useSubscription` já expõe `plan`/`comped`)
quanto no servidor (lendo `users/{ownerUid}/profile/billing` com o Admin SDK).

### 2. Novo tipo de imposto: `irrf`

`TaxType` (em `app/[locale]/impostos/page.tsx`) ganha `"irrf"` — hoje só
existem `irpf`/`irpj` (declarações anuais de pessoa física/jurídica), que são
tributos diferentes da retenção na fonte sobre serviços (IRRF). Entra como
federal em:

- `TAX_TYPES` (ícone `DollarSign`, cor `var(--cat-7)` — cores já se repetem
  entre tipos federais hoje, ex. `inss` reusa a cor de `simples_nacional`,
  então não precisa ser uma cor inédita);
- `TAX_TYPE_TO_CATEGORY["irrf"] = "Impostos"`;
- `messages/{pt-BR,en,es}/impostos.json` → `taxTypes.irrf` e `taxTypeDesc.irrf`.

### 3. Rota nova: `app/api/analyze-nf-retencao/route.ts`

**Autenticada** (Bearer ID token), diferente de `analyze-nf`/`analyze-extract`:

```
const scope = await requireScope(req, "impostos");
if (isScopeError(scope)) return 401/403;

const billingSnap = await db.doc(`users/${scope.ownerUid}/profile/billing`).get();
const state = resolveSubscriptionState(billingSnap.exists ? billingSnap.data() : null);
if (!isProAccess(state)) return 403 "Recurso disponível apenas no plano Pro.";

checkRateLimit(`analyze-nf-retencao:${scope.ownerUid}`, { windowMs: 10*60*1000, max: 10 });
```

Corpo da requisição: `{ base64: string, mediaType: string }` (PDF ou imagem —
sem opção XML nesta feature, uma NFS-e sempre chega como PDF/imagem pro
usuário final). Limite de tamanho: reaproveita `MAX_PDF_BASE64` (~4MB,
mesma constante de `analyze-extract`, movida para `lib/` se ainda não
compartilhada, ou duplicada com o mesmo valor — decidir na implementação pelo
que for mais simples).

Chama a Anthropic API (mesmo modelo `claude-haiku-4-5-20251001`, padrão do
projeto para estas rotas) com um `system` prompt novo:

```
Você analisa Notas Fiscais de Serviço Eletrônicas (NFS-e) brasileiras,
do ponto de vista do TOMADOR do serviço (quem paga e deve reter tributos).
Responda SOMENTE com JSON válido, sem markdown.
Formato:
{
  "numeroNota": "103",
  "prestador": "nome do prestador (razão social)",
  "dataEmissao": "YYYY-MM-DD",
  "valorTotalServico": 6161.65,
  "issRetidoPeloTomador": true,
  "retentions": [
    {"tipo": "inss"|"irrf"|"csll"|"cofins"|"pis"|"iss", "valor": 123.45}
  ]
}
Regras:
- Inclua em "retentions" SOMENTE tributos com valor destacado maior que zero.
- "issRetidoPeloTomador": true se a nota indicar que o ISS é retido pelo
  Tomador (ex: "O ISS desta NFS-e será RETIDO pelo Tomador de Serviço");
  false se indicar que o prestador recolhe, ou se não houver menção.
- Se a nota não tiver nenhuma retenção destacada (ex: NF-e de produto comum),
  responda "retentions": [].
```

**O valor líquido NUNCA é calculado pelo modelo** — o servidor (ou o cliente,
tanto faz, decidir na implementação; mais simples no servidor pra devolver
pronto) soma `retentions[].valor` (excluindo `"iss"` se
`issRetidoPeloTomador === false`) e devolve:

```json
{
  "numeroNota": "103",
  "prestador": "CONTRACTORS SOLUCOES EM SEGURANCA LTDA",
  "dataEmissao": "2025-01-23",
  "valorTotalServico": 6161.65,
  "retentions": [ ... ],
  "valorLiquido": 5012.53
}
```

Se `retentions` vier vazio, devolve do mesmo jeito (o cliente mostra o aviso
de "nenhuma retenção encontrada" — não é erro HTTP).

### 4. UI: `LerNfModal` em `app/[locale]/impostos/page.tsx`

Mesmos 5 estados do `ImportModal` do Fluxo de Caixa: `input → loading →
preview → saving → done`.

- **Botão de entrada**, na toolbar da página, ao lado de "Novo imposto":
  ícone de nota fiscal + texto "Ler NF". Sempre visível.
  - Se `!isProAccess(sub)` → ao clicar, mostra um aviso compacto (não abre o
    modal de upload) com 🔒, texto curto explicando que é recurso do plano Pro,
    e um CTA para `/assinatura`. Mesmo padrão visual dos avisos já existentes
    na página (cor `--brand`/`--warn`).
  - Se Pro → abre o modal normalmente.
- **input**: dropzone `accept=".pdf,.jpg,.jpeg,.png"`, limite de tamanho igual
  ao da rota.
- **loading**: mesma animação/copy do `ImportModal` ("Analisando…").
- **preview**:
  - Cabeçalho: nº da nota, prestador, valor bruto do serviço.
  - Se `retentions.length === 0`: mensagem "Nenhuma retenção destacada nesta
    nota." e botão fica desabilitado (nada a criar).
  - Lista de retenções, uma linha por tributo: checkbox (marcado por padrão,
    permite desmarcar se a IA errou algo), nome do tributo (via
    `impostos.taxTypes.<tipo>`), valor, campo de **vencimento editável**
    (`<input type="date">`, sugestão padrão = dia 20 do mês seguinte a
    `dataEmissao`, exceto a linha `iss` que nasce em branco — regra municipal
    varia e não dá pra advinhar).
  - Valor líquido a pagar ao prestador em destaque, calculado a partir das
    linhas ainda marcadas (recalcula ao desmarcar).
- **saving**: 1 clique em "Criar N lançamentos" → mesmo fluxo de PIN do
  `ImportModal` (`loadPinHash` → `PinModal` → `verifyPin`) autorizando o lote
  inteiro. Ao confirmar:
  1. Sobe o arquivo original uma vez pro Storage, em `taxes/{timestamp}-{nome}`
     (mesmo helper de upload do `TaxModal`).
  2. Para cada retenção marcada, `addDoc` em `users/{uid}/taxes` com:
     - `name`: `` `${label do tributo traduzido} retido · NF ${numeroNota} (${prestador})` ``
       (ex. `"IRRF retido · NF 103 (CONTRACTORS SOLUCOES...)"`, truncado a um
       tamanho razoável, mesmo padrão de outros campos `name`);
     - `type`: o tipo do tributo (`inss`/`irrf`/`csll`/`cofins`/`pis`/`iss`);
     - `amount`: o valor da linha;
     - `dueDate`: a data editada na prévia;
     - `status: "nao_pago"`;
     - `frequency: "mensal"` (default neutro — confirmado que `frequency` é
       só exibição hoje, sem geração automática de recorrência em nenhum
       lugar do código);
     - `notes`: referência à nota, ex. `"NF ${numeroNota} · ${prestador}"`;
     - `attachments`: `[urlDoStorage]`;
     - `...stampCreate(actor)` (mesmo carimbo de autoria dos outros
       lançamentos).
  3. `syncTaxCashflow` **não precisa ser chamado** aqui — só reflete no Fluxo
     de Caixa lançamentos com status `"pago"`, e estes nascem `"nao_pago"`.
- **done**: resumo "N lançamentos criados. Valor líquido a pagar ao
  prestador: R$ X,XX" + botão fechar.

### 5. i18n

Novo namespace `impostos.nfReader` em `messages/{pt-BR,en,es}/impostos.json`
com as strings do modal (título, subtítulos por etapa, labels, mensagens de
erro, aviso de Pro), seguindo a mesma estrutura de `fluxoCaixa.import`. Mais a
entrada `taxTypes.irrf` / `taxTypeDesc.irrf` nos 3 idiomas.

## Fora de escopo

- Não gera lançamento em Contas a Pagar com o valor líquido — o valor líquido
  a pagar ao prestador é só informativo na tela de prévia/resumo.
- Não tenta advinhar a data de vencimento do ISS por município — fica em
  branco pra edição manual.
- Suporte a XML de NFS-e (formato varia por prefeitura, sem padrão nacional
  único) — só PDF/imagem nesta primeira versão.
- Editar/excluir em lote os lançamentos criados por este fluxo — depois de
  criados, são impostos normais, editáveis um a um como qualquer outro.
- Aplicar o mesmo gate de Pro em `/estoque` ou em outras áreas hoje vendidas
  como Pro na página de preços — fica só o helper `isProAccess` pronto para
  reuso futuro; nenhuma outra rota/página muda nesta spec.

## Riscos

- **Extração incorreta da IA** (valor errado, tributo classificado errado, ou
  `issRetidoPeloTomador` mal interpretado) — mitigado pela tela de prévia
  editável (checkbox pra excluir linha, mas não pra corrigir valor/tipo
  diretamente; se a IA errar o valor, a saída é desmarcar a linha e lançar
  manualmente pelo modal de "Novo imposto" já existente). Não há correção
  inline do valor nesta primeira versão — considerar se aparecer como
  problema recorrente no uso real.
- **Custo por chamada à Anthropic**: mitigado pelo rate-limit por conta
  (10/10min) e pelo gate de Pro (só quem paga mais aciona a rota mais cara).
- **PDF grande demais / não é uma NFS-e de verdade**: erro tratado igual ao
  `analyze-extract` (413 se passar do limite; JSON malformado do modelo vira
  erro genérico "não foi possível ler a nota").
