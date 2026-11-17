# Inter — emissão e controle de boletos: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emitir boletos (boleto com Pix) pelo Inter direto do app, mostrar o resumo (aguardando, vencidos, pagos, a receber) e lançar cada pagamento no Fluxo de Caixa sem duplicar com o extrato.

**Architecture:** Cliente da API Cobrança V3 sobre o mTLS que já existe em `lib/inter.ts`; um núcleo idempotente "aplicar situação" (usado por webhook, botão e cron) que marca o boleto, cria a entrada no caixa com id determinístico, dá baixa na conta a receber e vincula o item do extrato; UI como aba "Boletos" dentro de Contas a Receber. Escritas só pelo servidor (Admin SDK); o cliente só lê.

**Tech Stack:** Next.js (App Router), TypeScript, Firebase Admin/Firestore, `node:test` com `tests/support/fakeFirestore.mjs`, next-intl (pt-BR/en/es).

**Spec:** `docs/superpowers/specs/2026-11-16-inter-boletos-design.md`

## Global Constraints

- Só API Cobrança **V3** do Inter; escopos `boleto-cobranca.write` e `boleto-cobranca.read` são **opcionais** (extrato continua sem eles).
- Emissão é assíncrona: `POST /cobrancas` devolve só `codigoSolicitacao`; dados vêm por `GET /cobrancas/{codigoSolicitacao}`.
- `seuNumero` ≤ 15 caracteres = **id do doc local** (gerado por nós, 12 caracteres `[0-9a-z]`).
- Situações do webhook: `RECEBIDO, A_RECEBER, MARCADO_RECEBIDO, CANCELADO, EXPIRADO, FALHA_EMISSAO`; "vencido" é calculado pelo vencimento.
- `RECEBIDO` e `MARCADO_RECEBIDO` são terminais; o webhook nunca é confiado sozinho: sempre `GET` antes de aplicar.
- Valor lançado no caixa = `valorTotalRecebido`; data = dia do pagamento; mês "fechado" não bloqueia.
- Um boleto vigente por conta a receber; valor sugerido = saldo restante; CPF/CNPJ e endereço completos obrigatórios.
- Pro/cortesia; permissão `contasReceber` para membros; credenciais cifradas (`INTER_ENC_KEY`); nunca segredo/PEM/corpo do Inter em log, resposta ou e-mail.
- PIN (client-side, `usePin`/`PinModal`, padrão do app) para emitir e cancelar; servidor grava quem fez (`stamp` do ator).
- Texto de interface em pt-BR, en e es (`messages/*/contasReceber.json`); CRUD completo (emitir, ver, cancelar; editar = cancelar e reemitir).
- Teste de uma suíte: `node --experimental-strip-types --no-warnings --import ./tests/support/register.mjs --test tests/inter/<arquivo>.test.mjs`; tudo: `npm test`; tipos: `npx tsc --noEmit`.
- Commits pequenos, mensagem em português no estilo do repositório, terminando com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Webhook repetido ou fora de ordem** (`RECEBIDO` duas vezes; `CANCELADO` depois de `RECEBIDO`): uma só entrada no caixa, estado final correto.
2. **Pago com valor diferente** do nominal (juros/multa, ou menor): entra o valor recebido; conta a receber fica parcial se menor.
3. **Dois boletos de mesmo valor no mesmo dia e um item no extrato:** nada é vinculado sozinho; o item fica na fila.
4. **Falha no meio** (boleto marcado pago, caixa não gravado): reaplicar conserta sem duplicar.
5. **Emissão que falha depois do POST** (timeout, 429, queda ao gravar): sem boleto duplicado no Inter e sem doc órfão sem rastro.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `lib/interBoletoTypes.ts` (novo) | Tipos compartilhados, grupos do resumo, máquina de estados, id/`seuNumero`. Puro. |
| `lib/interCobranca.ts` (novo) | Cliente da API Cobrança V3 (emitir, consultar, cancelar, PDF, webhook) + parsers. Servidor. |
| `lib/inter.ts` (editar) | Exportar o transporte mTLS e o token por escopo, sem mudar o extrato. |
| `lib/interBoletoExtrato.ts` (novo) | Casamento único boleto-pago ↔ item do extrato. Puro. |
| `lib/interBoletoApply.ts` (novo) | `aplicarSituacao`: transação idempotente (boleto + caixa + conta a receber + extrato). |
| `lib/interSync.ts` (editar) | No sync do extrato, vincular sozinho item que casa com entrada de boleto. |
| `lib/pagadorEndereco.ts` (novo) | Tipo e validação do endereço do pagador. Puro. |
| `app/api/inter/boletos/**` (novo) | Emitir, cancelar, PDF, atualizar (consulta). |
| `app/api/webhooks/inter-boletos/[token]/route.ts` (novo) | Webhook público. |
| `app/api/admin/inter/boletos/route.ts` (novo) | Adm: ativar boletos (gera token, registra webhook, testa escopos). |
| `app/api/cron/inter-boletos/route.ts` + `vercel.json` (novo/editar) | Consulta de segurança diária. |
| `firestore.rules` (editar) | `boletos` só leitura; `interWebhookTokens` só servidor. |
| `app/[locale]/contasReceber/_components/` (novo) | `BoletosTab.tsx`, `EmitirBoletoModal.tsx`, `useBoletos.ts`. |
| `messages/{pt-BR,en,es}/contasReceber.json`, `docs/inter-setup.md` (editar) | Textos e guia de implantação/sandbox. |

---

### Task 1: Tipos e regras puras dos boletos

**Files:**
- Create: `lib/interBoletoTypes.ts`
- Test: `tests/inter/boletoTypes.test.mjs`

**Interfaces:**
- Produces:
  - `type BoletoSituacao = "EM_PROCESSAMENTO" | "A_RECEBER" | "ATRASADO" | "RECEBIDO" | "MARCADO_RECEBIDO" | "CANCELADO" | "EXPIRADO" | "FALHA_EMISSAO" | "PROTESTO"`
  - `type BoletoGrupo = "aguardando" | "vencido" | "pago" | "outros"`
  - `type BoletoDoc` = `{ id; receivableId?; payer: { nome; doc; email?; telefone?; endereco: PagadorEndereco }; amount; dueDate (YYYY-MM-DD); fineRate?; interestRate?; codigoSolicitacao?; situacao; linhaDigitavel?; codigoBarras?; nossoNumero?; pixCopiaECola?; valorRecebido?; origemRecebimento?: "BOLETO" | "PIX"; paidAt?: string; cashflowId?; interTxKey?; createdAt; createdBy; cancelledBy?; lastError?: string }`
  - `newBoletoId(): string` (12 chars `[0-9a-z]`), `seuNumeroDe(id: string): string` (= id, lança se >15)
  - `grupoDe(b: Pick<BoletoDoc, "situacao" | "dueDate">, hoje: string): BoletoGrupo`
  - `resumo(bs: BoletoDoc[], hoje: string): { aguardando; vencido; pago; aReceber: { qtd: number; total: number } }` (`aReceber` = aguardando + vencido; total em reais, 2 casas)
  - `podeAplicar(atual: BoletoSituacao, nova: BoletoSituacao): boolean`

- [ ] **Step 1: Write the failing tests** em `tests/inter/boletoTypes.test.mjs`:
  - `grupoDe`: `A_RECEBER` com vencimento futuro ou hoje → `aguardando`; `A_RECEBER` com vencimento ontem → `vencido`; `ATRASADO` → `vencido`; `EM_PROCESSAMENTO` → `aguardando`; `RECEBIDO` e `MARCADO_RECEBIDO` → `pago`; `CANCELADO/EXPIRADO/FALHA_EMISSAO/PROTESTO` → `outros`.
  - `resumo`: 3 boletos (100 aguardando, 50 vencido, 70 pago) → `aReceber` `{ qtd: 2, total: 150 }`, `pago.total` 70; soma em centavos sem erro de ponto flutuante (0.1 + 0.2 → 0.3).
  - `podeAplicar`: `RECEBIDO` → qualquer outra = `false`; `RECEBIDO` → `RECEBIDO` = `false` (já aplicado); `MARCADO_RECEBIDO` terminal; `A_RECEBER` → `RECEBIDO` = `true`; `EM_PROCESSAMENTO` → `A_RECEBER` = `true`; `CANCELADO` → `RECEBIDO` = `false`; `A_RECEBER` → `CANCELADO` = `true`.
  - `newBoletoId`: 12 caracteres, só `[0-9a-z]`, 1000 chamadas sem repetir; `seuNumeroDe("x".repeat(16))` lança.
- [ ] **Step 2: Run** `... --test tests/inter/boletoTypes.test.mjs` — Expected: FAIL (módulo inexistente).
- [ ] **Step 3: Implement** `lib/interBoletoTypes.ts` com as assinaturas acima (soma em centavos inteiros; id com `crypto.randomBytes`, base36).
- [ ] **Step 4: Run** a suíte — Expected: PASS.
- [ ] **Step 5: Commit** `feat(inter): tipos e regras puras dos boletos`.

---

### Task 2: Cliente da API Cobrança V3

**Files:**
- Modify: `lib/inter.ts` (exportar `request`, `makeAgent`, `mapNetworkError`, `mapStatus`; `getToken(agent, secrets, scope = "extrato.read")` — comportamento do extrato idêntico)
- Create: `lib/interCobranca.ts`, `lib/pagadorEndereco.ts`
- Test: `tests/inter/cobranca.test.mjs`, `tests/inter/pagadorEndereco.test.mjs`

**Interfaces:**
- Consumes: `InterSecrets` (`lib/interCrypto.ts`), `BoletoSituacao` (Task 1).
- Produces:
  - `type PagadorEndereco = { cep: string; logradouro: string; numero: string; complemento?: string; bairro: string; cidade: string; uf: string }`; `validarEndereco(e: unknown): { ok: true; value: PagadorEndereco } | { ok: false; error: string }` (CEP 8 dígitos, UF ∈ 27 UFs, resto não vazio).
  - `type EmitirInput = { seuNumero: string; valorNominal: number; dataVencimento: string; pagador: { nome; doc; email?; telefone?; endereco: PagadorEndereco }; multaPercentual?: number; moraPercentualMensal?: number; mensagem?: string[] }`
  - `type CobrancaInter = { codigoSolicitacao: string; situacao: BoletoSituacao; linhaDigitavel?: string; codigoBarras?: string; nossoNumero?: string; pixCopiaECola?: string; valorTotalRecebido?: number; dataPagamento?: string; origemRecebimento?: "BOLETO" | "PIX" }`
  - `type Transporte = (req: { method: string; path: string; scope: string; body?: unknown }) => Promise<{ status: number; json: unknown }>`; `transporteMtls(secrets: InterSecrets): Transporte` (real; abre agente mTLS, pega token do escopo, destrói o agente).
  - `buildEmitBody(i: EmitirInput): Record<string, unknown>` (puro; `valorNominal` como número com 2 casas; `numDiasAgenda` 30; tipo de pessoa pelo tamanho do documento; multa/mora só quando > 0, em `TAXA`/`TAXAMENSAL`)
  - `parseCobranca(raw: unknown): CobrancaInter` (puro; valor aceita número ou string decimal; lança mensagem em português em formato inesperado)
  - `emitirCobranca(t: Transporte, i: EmitirInput): Promise<{ codigoSolicitacao: string }>`
  - `consultarCobranca(t: Transporte, codigo: string): Promise<CobrancaInter>`
  - `cancelarCobranca(t: Transporte, codigo: string, motivo: string): Promise<void>`
  - `pdfCobranca(t: Transporte, codigo: string): Promise<Buffer>`
  - `registrarWebhook(t: Transporte, url: string): Promise<void>` (`PUT /cobrancas/webhook`)
  - Escopo: `write` para emitir/cancelar/webhook, `read` para consultar/PDF; erros HTTP mapeados em português (403 → "sem o escopo de cobrança, reconecte"; 429; 5xx) sem vazar corpo.

- [ ] **Step 1: Write the failing tests.** `cobranca.test.mjs` com transporte falso (grava a chamada e devolve resposta fixa): `emitirCobranca` chama `POST /cobrancas` com escopo `boleto-cobranca.write` e devolve `codigoSolicitacao`; `consultarCobranca` chama `GET /cobrancas/{codigo}` com `boleto-cobranca.read`; `parseCobranca` com `valorTotalRecebido: "150.50"` e `150.5` → `150.5`; situação desconhecida → lança; 403 → mensagem pedindo escopo, 429 → "aguarde", nenhuma mensagem contém o corpo da resposta; `buildEmitBody` sem multa/mora não inclui os campos, com `fineRate` 2 inclui `multa` taxa 2. `pagadorEndereco.test.mjs`: CEP `"01310-100"` normaliza para `01310100`; CEP de 7 dígitos, UF `"XX"` e logradouro vazio rejeitam.
- [ ] **Step 2: Run** as duas suítes — Expected: FAIL.
- [ ] **Step 3: Implement** os módulos acima. Em `lib/inter.ts` só exportar e parametrizar o escopo; rodar `tests/inter/parse.test.mjs` e `sync.test.mjs` para provar que o extrato não mudou.
- [ ] **Step 4: Run** `npm test` — Expected: tudo PASS.
- [ ] **Step 5: Commit** `feat(inter): cliente da API de cobranca V3 e validacao de endereco`.

---

### Task 3: Casamento com o extrato e núcleo "aplicar situação"

**Files:**
- Create: `lib/interBoletoExtrato.ts`, `lib/interBoletoApply.ts`
- Test: `tests/inter/boletoExtrato.test.mjs`, `tests/inter/boletoApply.test.mjs`

**Interfaces:**
- Consumes: Tasks 1–2 (`BoletoDoc`, `podeAplicar`, `CobrancaInter`), `CAT_TO_CASHFLOW` (`lib/receivableCashflowSync.ts`), `pendenteDocId` (`lib/interSync.ts`), `fakeFirestore`.
- Produces:
  - `candidatoUnico<T extends { amount: number; date: string }>(alvo: { amount: number; date: string }, candidatos: T[], concorrentes: { amount: number; date: string }[]): T | null` — mesmo valor em centavos, janela ±3 dias, e **exatamente 1** candidato **e** nenhum concorrente com mesmo valor/janela além do próprio alvo; senão `null`.
  - `aplicarSituacao(db: Firestore, ownerUid: string, boletoId: string, remoto: CobrancaInter, actor: { uid: string; name: string }, now?: number): Promise<{ aplicada: boolean; pago: boolean }>`:
    1. Lê o boleto numa transação; se `!podeAplicar(atual, remoto.situacao)` devolve `{ aplicada: false, pago: false }` sem gravar.
    2. Atualiza situação e os dados do boleto (linha digitável, nosso número, Pix, valor/origem/data de pagamento).
    3. Se pago: cria `users/{ownerUid}/cashflow/boleto_{boletoId}` com `create()` (entrada, `amount = valorRecebido`, `date = dataPagamento`, `boletoId`, categoria "Outros recebimentos" para avulso ou `CAT_TO_CASHFLOW` da conta a receber, `settledReceivableId` quando houver), grava `cashflowId` no boleto; atualiza a conta a receber (`amountReceived` somado; `status: "recebido"` e `receivedAt` quando cobre o total; parcial se menor).
    4. Vincula o extrato: procura em `interPendentes` (status `pendente`, entrada) com `candidatoUnico`; se achar, marca `conciliado` com `cashflowId` e grava `interTxId` no lançamento e `interTxKey` no boleto.
  - Idempotência: reaplicar o mesmo pago não cria segunda entrada nem soma duas vezes na conta a receber (a existência do doc `boleto_{id}` é a trava, dentro da transação).

- [ ] **Step 1: Write the failing tests.**
  - `boletoExtrato.test.mjs`: um candidato e nenhum concorrente → o candidato; dois candidatos com mesmo valor/janela → `null`; um candidato mas outro item do extrato de mesmo valor/janela → `null`; valor diferente por 1 centavo → `null`; 4 dias de distância → `null`; 3 dias → casa.
  - `boletoApply.test.mjs` (fake Firestore): `RECEBIDO` cria 1 entrada de `valorRecebido` com `boletoId`; **mesmo `RECEBIDO` aplicado 2×** → 1 entrada, `amountReceived` somado 1×; **`RECEBIDO` depois `CANCELADO`** → continua pago; **valor recebido maior que o nominal** → entrada com o valor recebido e conta a receber `recebido`; **menor** → conta `amountReceived` parcial e status não vira `recebido`; avulso → categoria "Outros recebimentos", sem `settledReceivableId`; item de extrato pendente único → vira `conciliado` com `cashflowId` e o lançamento ganha `interTxId`; **dois pendentes iguais** → ambos continuam `pendente`; **falha simulada ao gravar a conta a receber** (fake lança) → nada gravado (transação inteira), reaplicar depois conserta.
- [ ] **Step 2: Run** as suítes — Expected: FAIL.
- [ ] **Step 3: Implement** os dois módulos. Admin SDK (`FieldValue`, transação); ator carimbado como nas outras ações com PIN.
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(inter): aplicar situacao do boleto (pago vira entrada no caixa sem duplicar)`.

---

### Task 4: Sync do extrato vincula sozinho a entrada de boleto

**Files:**
- Modify: `lib/interSync.ts` (`lerCashflow` inclui `boletoId`; `syncOwner` usa `candidatoUnico` para itens de entrada novos)
- Modify: `tests/inter/sync.test.mjs`

**Interfaces:**
- Consumes: `candidatoUnico` (Task 3). Entradas elegíveis: lançamentos com `boletoId` e **sem** `interTxId`.
- Produces: item novo do extrato que casa de forma única com uma entrada de boleto nasce `status: "conciliado"` com `cashflowId`, e o lançamento ganha `interTxId = txKey`; qualquer ambiguidade mantém o fluxo atual (pendente com sugestão).

- [ ] **Step 1: Write the failing tests** em `sync.test.mjs`: (a) extrato chega **depois** do pago: item entrada de R$ 150,50 e uma entrada com `boletoId` de R$ 150,50 no mesmo dia → pendente nasce `conciliado`, lançamento recebe `interTxId`, `novos` não conta o item conciliado como "a conciliar"; (b) duas entradas de boleto de mesmo valor → item nasce `pendente`; (c) entrada sem `boletoId` não é vinculada por essa regra; (d) rodar o sync 2× não altera nada.
- [ ] **Step 2: Run** `sync.test.mjs` — Expected: FAIL nos novos casos.
- [ ] **Step 3: Implement** a mudança em `syncOwner` (dentro da transação de cada lote, para continuar seguro contra sync concorrente).
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(inter): extrato vincula sozinho a entrada de boleto pago`.

---

### Task 5: Rotas de emitir, cancelar, PDF e atualizar + regras

**Files:**
- Create: `app/api/inter/boletos/route.ts` (POST emitir), `app/api/inter/boletos/[id]/cancelar/route.ts`, `app/api/inter/boletos/[id]/pdf/route.ts`, `app/api/inter/boletos/atualizar/route.ts`, `lib/interBoletoServer.ts` (núcleos testáveis: `emitirBoleto`, `cancelarBoleto`, `atualizarBoletos`)
- Modify: `app/api/inter/_guard.ts` (aceitar permissão `contasReceber`), `firestore.rules`
- Test: `tests/inter/boletoServer.test.mjs`

**Interfaces:**
- Consumes: Tasks 1–3, `guardInter` com `permission: "contasReceber"`, `decryptInterSecrets`, `transporteMtls` (injetável nos testes).
- Produces:
  - `emitirBoleto(db, ownerUid, input: { receivableId?: string; payer; amount; dueDate; fineRate?; interestRate? }, actor, deps?: { transporte?: Transporte; aguardar?: { tentativas: number; intervaloMs: number } }): Promise<{ id: string; situacao: BoletoSituacao }>`
    - Ordem: valida (documento, endereço, valor > 0, vencimento ≥ hoje, **um boleto vigente por conta a receber**: existe boleto `EM_PROCESSAMENTO|A_RECEBER|ATRASADO` para o `receivableId` → erro); **grava o doc local primeiro** (`EM_PROCESSAMENTO`, sem `codigoSolicitacao`); chama o Inter **uma vez, sem retry**; sucesso → grava `codigoSolicitacao` e tenta buscar os dados algumas vezes; falha no POST → doc vira `FALHA_EMISSAO` com `lastError` curto; falha só ao gravar o código → doc fica com `lastError` e é recuperável pelo `atualizar` (consulta por `seuNumero` na listagem do Inter).
    - Com `receivableId`: grava em `receivables/{id}.boleto` o `BoletoData` existente (`lib/boleto.ts`, provider `"inter"`) para o e-mail de cobrança já mostrar linha digitável.
  - `cancelarBoleto(db, ownerUid, boletoId, actor, deps?): Promise<void>` — recusa se já pago; chama o Inter; grava `CANCELADO` e `cancelledBy`; limpa `receivables/{id}.boleto`.
  - `atualizarBoletos(db, ownerUid, actor, deps?): Promise<{ consultados: number; pagos: number }>` — consulta cada boleto em aberto e chama `aplicarSituacao` (a "consulta de segurança" do botão e do cron).
  - Regras: `users/{userId}/boletos/{id}` → `allow read: if inAccount(userId); allow write: if false;` e excluir `boletos` do bloco genérico (como `interPendentes`).
  - Rate limit por conta; resposta nunca traz segredo/corpo do Inter; rotas devolvem mensagens em português.

- [ ] **Step 1: Write the failing tests** (`boletoServer.test.mjs`, transporte falso + fake Firestore): emitir feliz cria doc `A_RECEBER` com linha digitável e grava `receivables/{id}.boleto`; emitir com POST falhando (429) → doc `FALHA_EMISSAO`, **uma** chamada ao Inter; dois emitir para a mesma conta a receber → segundo recusado; documento sem endereço → recusado antes de qualquer chamada; cancelar boleto pago → recusado; cancelar feliz limpa o `boleto` da conta; `atualizarBoletos` com um pago remoto cria a entrada no caixa (1×) e rodar de novo não duplica.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** os núcleos e as 4 rotas finas (guard → núcleo → JSON). PDF devolve `application/pdf`.
- [ ] **Step 4: Run** `npm test` e `npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(inter): rotas de emitir, cancelar, PDF e atualizar boletos`.

---

### Task 6: Webhook, ativação pelo adm e cron

**Files:**
- Create: `app/api/webhooks/inter-boletos/[token]/route.ts`, `app/api/admin/inter/boletos/route.ts`, `app/api/cron/inter-boletos/route.ts`, `lib/interBoletoWebhook.ts`
- Modify: `vercel.json` (cron diário `/api/cron/inter-boletos`, ex.: `45 9 * * *`), `firestore.rules` (`interWebhookTokens` fechada ao cliente)
- Test: `tests/inter/boletoWebhook.test.mjs`

**Interfaces:**
- Consumes: Tasks 2, 3, 5; guard do adm supremo já usado em `app/api/admin/inter/*`.
- Produces:
  - `ativarBoletos(db, ownerUid, adminUid, deps?): Promise<{ ok: true; escopos: { write: boolean; read: boolean }; webhook: boolean } | { ok: false; error: string }>` — testa os dois escopos pedindo token; gera token aleatório de 32 bytes, grava **só o hash** em `interWebhookTokens/{sha256}` = `{ ownerUid }` e `integracoesBanco/{ownerUid}.cobranca = { ativo, token(hash), escoposOk }`; registra no Inter `${NEXT_PUBLIC_APP_URL}/api/webhooks/inter-boletos/{token}`; registra auditoria em `auditoriaIntegracoes` (sem segredo). Sem os escopos → `ok: true` com flags falsas e extrato intacto.
  - `processarCallbacks(db, token: string, corpo: unknown, deps?): Promise<{ status: 200 | 404; processados: number }>` — token desconhecido → 404; corpo é array de callbacks; para cada um acha o boleto por `seuNumero` (= id), consulta o Inter (`GET`) e chama `aplicarSituacao`; desconhecido ou erro de um callback não derruba os outros e a resposta continua 200 (o Inter reenvia só se falhar).
  - Cron: percorre contas com `cobranca.ativo` e Pro, chama `atualizarBoletos` com orçamento de tempo e concorrência como no `cron/inter-sync`; header `Authorization: Bearer ${CRON_SECRET}`.

- [ ] **Step 1: Write the failing tests:** token inválido → 404 sem tocar em dados; callback `RECEBIDO` com `GET` remoto confirmando pago → 1 entrada; **mesmo callback 2×** → 1 entrada; callback `RECEBIDO` mas `GET` remoto diz `A_RECEBER` → nada muda (não confia no corpo); callback de boleto inexistente → 200, 0 processados; `ativarBoletos` sem escopo de escrita → `escopos.write false` e nada gravado de token; token gravado é hash (o valor bruto nunca aparece no doc).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** (comparação do token por hash/lookup; resposta curta; logs só com contagem e código).
- [ ] **Step 4: Run** `npm test` e `npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(inter): webhook de boletos, ativacao pelo adm e cron de seguranca`.

---

### Task 7: Painel do adm — escopos e ativação

**Files:**
- Modify: `app/[locale]/configuracoes/AdminConectarCliente.tsx`, `BancosPagamentosSection.tsx`, `messages/{pt-BR,en,es}/configuracoes.json`
- Test: `tests/inter/adminRoutes.test.mjs` (casos da rota nova)

**Interfaces:**
- Consumes: `POST /api/admin/inter/boletos` (Task 6).
- Produces: botão "Ativar boletos" no painel do adm (cliente conectado), mostrando por escopo (extrato, cobrança leitura, cobrança escrita) ok/faltando e se o webhook foi registrado; o cliente (dono) vê no cartão do Inter se "Boletos" está ativo ou pede reconexão com escopos de cobrança. Texto nos 3 idiomas.

- [ ] **Step 1: Write the failing tests** (rota do adm): só adm supremo (403 para dono comum); alvo membro recusado; resposta nunca traz token nem segredo.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** a UI e os textos.
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit`; conferir no navegador (adm logado) que o botão aparece e o estado muda.
- [ ] **Step 5: Commit** `feat(inter): ativacao de boletos no painel do adm`.

---

### Task 8: Aba "Boletos" em Contas a Receber

**Files:**
- Create: `app/[locale]/contasReceber/_components/BoletosTab.tsx`, `EmitirBoletoModal.tsx`, `useBoletos.ts`
- Modify: `app/[locale]/contasReceber/page.tsx` (alternar para a aba; botão "Emitir boleto" por conta a receber; campos de endereço do cliente), `messages/{pt-BR,en,es}/contasReceber.json`
- Test: `tests/inter/boletoResumo.test.mjs` (lógica de tela que for pura)

**Interfaces:**
- Consumes: `resumo`, `grupoDe` (Task 1); `usePin`/`PinModal`; rotas da Task 5 via `authedFetch`.
- Produces: `useBoletos(ownerUid): { boletos: BoletoDoc[]; loading: boolean }` (onSnapshot em `users/{ownerUid}/boletos`); aba com 4 cartões (Aguardando pagamento, Vencidos, Pagos, A receber em destaque), filtros por situação (inclui "Cancelados/expirados/falhas") e período, busca por pagador, e por linha: PDF, copiar linha digitável, copiar Pix, reenviar e-mail de cobrança, cancelar (PIN, confirmação). "Emitir boleto avulso" abre o modal com dados do pagador e endereço; "Emitir boleto" na conta a receber pré-preenche cliente e valor sugerido (saldo restante), pede o que faltar (endereço) e salva o endereço no cliente. Cliente sem escopos de cobrança vê aviso para falar com a equipe, sem erro cru. Plano não Pro vê o aviso de plano.

- [ ] **Step 1: Write the failing tests** para a lógica pura extraída (ex.: `valorSugerido(receivable)` = `amount - amountReceived` com 2 casas; `podeEmitir(receivable, boletos)` falso com boleto vigente), em `boletoResumo.test.mjs`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** componentes e hook seguindo o design system atual (tokens `var(--...)`, `Button`/`Pill`/`KpiTile` de `app/components/ui`), textos nos 3 idiomas, estados vazio/carregando/erro, mobile.
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit`, `npx eslint` nos arquivos novos; verificar no navegador logado (Pro): emitir no sandbox, ver o cartão mudar, cancelar.
- [ ] **Step 5: Commit** `feat(inter): aba Boletos em Contas a Receber`.

---

### Task 9: Documentação e validação no sandbox

**Files:**
- Modify: `docs/inter-setup.md`

**Interfaces:** nenhuma.

- [ ] **Step 1:** Documentar: escopos novos na credencial do cliente; "Ativar boletos"; URL pública do webhook (`NEXT_PUBLIC_APP_URL`) e que só funciona após deploy; cron novo; regras novas (`boletos`, `interWebhookTokens`) a publicar; limitações.
- [ ] **Step 2:** Acrescentar o checklist de validação no sandbox (`cdpj-sandbox.partners.uatinter.co`): formato real de `valorNominal`/`valorTotalRecebido`; se `seuNumero` ≤ 15 casa o callback; como o pagamento aparece no extrato (`tipoTransacao`, descrição, data) para o casamento; assinatura/autenticação do webhook; conta com mais de uma conta corrente. Cada divergência vira ajuste marcado `ASSUNÇÃO` em `lib/interCobranca.ts`.
- [ ] **Step 3: Commit** `docs(inter): guia de boletos, webhook e checklist do sandbox`.

---

## Self-Review

- **Cobertura da spec:** emissão (T5), consulta e webhook (T5–T6), 4 grupos e resumo (T1, T8), pago → caixa + baixa (T3), duplicidade com extrato nas duas ordens (T3, T4), escopos opcionais e ativação (T6–T7), CRUD (T5, T8), PIN e auditoria (T5, T6, T8), um boleto vigente e valor sugerido (T5, T8), endereço obrigatório (T2, T8), máquina de estados (T1, T3), regras do Firestore (T5, T6), docs e sandbox (T9). Cobertos pelo desenho e **sem tarefa**: nenhum.
- **Desvio da spec, para você ver:** a spec dizia que o boleto da conta a receber alimenta o e-mail "via `getBoletoProvider()`". A emissão é assíncrona e exige PIN no app, então o plano grava o `BoletoData` direto em `receivables/{id}.boleto` ao emitir; `getBoletoProvider()` segue `null` (o e-mail de cobrança já reaproveita `boleto` gravado).
- **Consistência de tipos:** `BoletoDoc`, `CobrancaInter`, `Transporte`, `aplicarSituacao` e `candidatoUnico` têm a mesma assinatura em todas as tarefas que os usam.
- **Proporção:** tarefas só com assinaturas, nomes de teste e valores da spec; corpos de função ficam com quem constrói.
