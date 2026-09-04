# Contrato de prestação de serviços no checkout da assinatura

## Contexto geral

Pedido do usuário: quando o cliente estiver prestes a comprar um plano, apresentar
um **contrato da NexusFi** que ele preenche, assina e só então paga. O contrato
precisa registrar o **CNPJ e o regime tributário** do contratante (MEI, Simples
Nacional, Lucro Presumido ou Lucro Real), além do **prazo de contratação e das
condições de pagamento**. Depois do aceite + pagamento confirmado, enviar uma
**cópia do contrato por e-mail**.

CNPJ da NexusFi para o contrato: **68.919.873/0001-36**.

Decisões tomadas no brainstorming:

- **Regime tributário = só registro cadastral.** O contratante seleciona o regime
  e informa o CNPJ; o valor fica gravado no contrato e no PDF como dado da parte
  CONTRATANTE. O texto/cláusulas do contrato são **idênticos** para todos os
  regimes (não há cláusula fiscal variável nem mudança de preço).
- **Assinatura = aceite eletrônico (clickwrap).** Checkbox "li e aceito" + nome
  completo + CPF do responsável; o sistema carimba data/hora, IP, user-agent e um
  hash SHA-256 do documento. Fundamento: MP 2.200-2 (assinatura eletrônica
  simples). Sem canvas de assinatura desenhada, sem integração e-sign externa.
- **Prazo = pré-pago sem fidelidade.** Mensal = 30 dias, Anual = 365 dias, cada
  pagamento estende o acesso. Sem renovação automática, sem multa rescisória
  (mantém o modelo atual de `lib/billing.ts`).
- **Cancelamento = arrependimento de 7 dias** (art. 49 CDC) com reembolso
  integral; após esse prazo, cancelamento a qualquer tempo impede novas cobranças,
  sem reembolso do período em curso, acesso mantido até o fim do período pago.
- **UX = página dedicada** `/assinatura/contrato?plano=<id>`, não modal.
- Endereço do CONTRATANTE **é** coletado (com prefill de `profile/company`).

### Aviso jurídico

O texto do contrato entregue aqui é um **template** redigido por engenharia, não
por advogado. Precisa de revisão jurídica antes de entrar em produção. Alguns
dados da NexusFi entram como placeholder (ver "Pendências").

## Fluxo atual (antes)

```
Paywall "Assinar"  ─┐
                    ├─> startCheckout(plan) ─> POST /api/billing/checkout
/assinatura?checkout=X ─┘        │
                                 v
                    InfinitePay (Pix/cartão)
                                 │
                                 v
              /assinatura/retorno ─> POST /api/billing/confirm
                                 │           (webhook paralelo:
                                 v            /api/webhooks/infinitepay)
                        applyPaidOrder()  <── ambos convergem aqui
                     (idempotente por transaction_nsu)
```

`order_nsu` = `ownerUid__planId__<ts base36>` (`lib/infinitepay.ts`,
`NSU_SEP = "__"`). Volta intacto no redirect e no webhook.

## Fluxo novo (depois)

Insere a etapa de contrato **antes** de gerar o link de pagamento:

```
Paywall "Assinar"  ─┐
                    ├─> router.push(/assinatura/contrato?plano=X)
/assinatura?checkout=X ─┘        │
                                 v
        app/assinatura/contrato/page.tsx
        - prefill de profile/company + auth
        - form: razão social, CNPJ, regime, endereço,
                nome + CPF + e-mail do responsável
        - prévia do contrato renderizada inline
        - checkbox "Li e aceito"
                                 │  submit
                                 v
             POST /api/billing/contract  (Admin SDK)
        - valida campos
        - monta payload canônico + sha256 + carimba IP/UA/acceptedAt
        - grava users/{ownerUid}/contracts/{contractId}
          status: "pending_payment"
        - retorna { contractId }
                                 │
                                 v
        startCheckout(plan, contractId)
        -> POST /api/billing/checkout { plan, contractId }
        -> buildOrderNsu(owner, plan, contractId)
           = ownerUid__plano__contractId__<ts>
                                 │
                                 v
                    InfinitePay (Pix/cartão)
                                 │
                                 v
              /assinatura/retorno / webhook
                                 │
                                 v
                        applyPaidOrder()
        - parseOrderNsu() agora devolve contractId
        - após estender a assinatura (applied === true):
            finalizeContract(db, ownerUid, contractId, {...})
            - contrato -> status "signed", paidAt, transactionNsu, periodEnd
            - gera PDF (jsPDF, server-side)
            - envia por e-mail (Resend, anexo) ao assinante + dono
            - idempotente: guarda por contract.emailedAt
        - falha de e-mail / contrato ausente NÃO derruba o pagamento
```

## Modelo de dados

### `ContractDoc` — `users/{ownerUid}/contracts/{contractId}`

Escrito **somente** pelo Admin SDK (rotas `app/api/billing/*` + `applyPaidOrder`),
no mesmo espírito de `profile/billing` e `profile/access`.

```ts
interface ContractDoc {
  contractId: string;
  ownerUid: string;
  signatarioUid: string;          // scope.uid de quem preencheu

  contractVersion: number;        // CONTRACT_VERSION, incrementa se o texto mudar
  planId: "mensal" | "anual";
  planLabel: string;              // snapshot no momento do aceite
  priceCents: number;             // snapshot

  contratante: {
    razaoSocial: string;
    cnpj: string;                 // guardado com máscara "00.000.000/0000-00"
    regimeTributario: "mei" | "simples_nacional" | "lucro_presumido" | "lucro_real";
    endereco: string;             // linha única, texto livre
  };
  signatario: {
    nome: string;
    cpf: string;                  // máscara "000.000.000-00"
    email: string;
  };

  hash: string;                   // sha256 hex do payload canônico (ver lib/contract.ts)
  acceptedAt: number;             // ms epoch
  ip: string | null;              // primeiro IP de x-forwarded-for
  userAgent: string | null;

  status: "pending_payment" | "signed" | "void";

  orderNsu: string | null;        // preenchido no checkout
  transactionNsu: string | null;  // preenchido na finalização
  paidAt: number | null;
  periodEnd: number | null;

  emailedAt: number | null;
  emailError: string | null;

  createdAt: number;
  updatedAt: number;
}
```

O **payload canônico** para o hash é um subconjunto determinístico
(`contractVersion`, `planId`, `priceCents`, `contratante`, `signatario`,
`acceptedAt`) serializado com chaves ordenadas. O hash prova que o PDF enviado
corresponde ao que foi aceito.

### `firestore.rules`

Adicionar dentro de `match /users/{userId}`:

```
// profile/billing e contracts — a conta LÊ (pra baixar / conferir) mas
// NUNCA escreve pelo client. Só o Admin SDK.
match /contracts/{contractId} {
  allow read: if inAccount(userId);
  allow write: if false;
}
```

E incluir `collection != 'contracts'` no fallback `match /{collection}/{document=**}`
do mesmo bloco (hoje ele já exclui `profile`, `team`, `billingEvents`).

## Arquivos novos

### `lib/contract.ts`

- `type TaxRegime` + `REGIME_LABEL: Record<TaxRegime, string>`
  (`"MEI"`, `"Simples Nacional"`, `"Lucro Presumido"`, `"Lucro Real"`)
- `type ContractDoc` (acima), `type ContractStatus`
- `CONTRACT_VERSION = 1`
- `isTaxRegime(v): v is TaxRegime`
- `maskCnpj` / `maskCpf` (reaproveitar a lógica de `maskCnpj` que já existe em
  `app/configuracoes/PerfilTab.tsx` — mover pra cá e re-exportar de lá, ou
  duplicar a função pequena; decisão de implementação)
- `isValidCnpj(str)` / `isValidCpf(str)` — validação de **dígitos verificadores**
  (não só formato), porque o contrato é documento legal
- `canonicalContractPayload(input)` → objeto com chaves ordenadas
- `contractHash(input): string` — sha256 hex. No server usa `node:crypto`; a
  função recebe o JSON canônico já pronto e só passa por SHA-256.
- Limites de tamanho de campo (`CONTRACT_LIMITS`), no estilo `FEEDBACK_LIMITS`.

### `lib/contractText.ts`

Função **pura**, sem dependência de React nem de jsPDF, compartilhada pela prévia
na tela e pelo PDF:

```ts
interface ContractParties {
  contratante: ContractDoc["contratante"];
  signatario: ContractDoc["signatario"];
  planLabel: string;
  priceCents: number;
  planId: "mensal" | "anual";
}
interface RenderedContract {
  title: string;
  preamble: string;             // qualificação das partes
  clauses: { heading: string; body: string[] }[];
}
export function renderContractText(p: ContractParties): RenderedContract;
```

Também exporta `NEXUSFI_PARTY` (constante com os dados da CONTRATADA, incluindo
os placeholders) e `ACCEITE_LEGAL_BASIS` (texto sobre MP 2.200-2).

Conteúdo do template v1 (cláusulas):

1. **Objeto** — licença de uso não exclusiva e intransferível da plataforma SaaS
   de gestão financeira NexusFi, na modalidade do Plano `{planLabel}`.
2. **Prazo e vigência** — início na confirmação do pagamento; Mensal = 30 dias
   corridos, Anual = 365 dias corridos; modelo pré-pago, **sem renovação
   automática** e **sem fidelidade**; novo pagamento estende o acesso.
3. **Preço e condições de pagamento** — R$ `{priceCents}` por período, pré-pago,
   processado pela InfinitePay via Pix ou cartão de crédito; acesso liberado após
   a confirmação; ausência de novo pagamento → suspensão do acesso ao fim do
   período vigente, sem multa.
4. **Direito de arrependimento e cancelamento** — 7 dias corridos a contar do
   aceite (art. 49 CDC) com reembolso integral; após esse prazo, cancelamento a
   qualquer tempo impede novas cobranças, sem reembolso do período em curso,
   acesso mantido até o fim do período pago.
5. **Obrigações da CONTRATADA** — disponibilizar a plataforma, empregar medidas
   razoáveis de segurança da informação, prestar suporte pelos canais do
   aplicativo.
6. **Obrigações da CONTRATANTE** — utilizar conforme a legislação, manter sigilo
   das credenciais, responsabilizar-se pelos dados que inserir e pela
   **veracidade das informações cadastrais**, inclusive CNPJ e regime tributário
   declarados.
7. **Proteção de dados pessoais (LGPD, Lei 13.709/2018)** — remete à Política de
   Privacidade em `/privacidade`; papéis de controladora/operadora; finalidade
   restrita à execução do contrato.
8. **Propriedade intelectual** — o software, a marca e o conteúdo são de
   titularidade exclusiva da CONTRATADA; a licença não transfere propriedade.
9. **Limitação de responsabilidade** — a plataforma é ferramenta de apoio à
   gestão e **não substitui contador ou assessoria contábil/jurídica**;
   responsabilidade da CONTRATADA limitada ao valor pago pela CONTRATANTE nos 12
   meses anteriores ao evento.
10. **Rescisão** — por descumprimento não sanado em 10 dias após notificação, ou
    encerramento das atividades de qualquer das partes.
11. **Disposições gerais** — alterações do contrato comunicadas por e-mail com
    30 dias de antecedência; comunicações válidas pelos e-mails cadastrados;
    nulidade parcial não afeta o restante.
12. **Foro** — Comarca de São Paulo/SP, com renúncia a qualquer outro.

**Bloco de aceite eletrônico** (renderizado após as cláusulas, preenchido só
quando há `acceptedAt`): "Aceito eletronicamente em `{data/hora}` por `{nome}`,
CPF `{cpf}`, e-mail `{email}` — IP `{ip}` — identificador do documento (SHA-256):
`{hash}` — versão `{contractVersion}`. Manifestação de vontade válida nos termos
da MP 2.200-2/2001."

### `lib/contractPdf.ts`

`buildContractPdf(doc: ContractDoc): Uint8Array` — server-side, `import("jspdf")`
dinâmico (mesmo padrão de `lib/reportPdf.ts`, sem `doc.save`; retorna
`doc.output("arraybuffer")`). Cabeçalho com "NexusFi", título, preâmbulo,
cláusulas numeradas, bloco de aceite com o hash. Usa `renderContractText()` +
os campos de assinatura do `ContractDoc`.

### `lib/emailTemplates.ts` — adicionar `contractCopyEmail(...)`

Mesma estrutura visual dos templates existentes (`passwordResetEmail`,
`feedbackResolvedEmail`): tabela HTML com CSS inline + versão texto. Assunto:
"Sua via do contrato — NexusFi". Corpo curto: confirma a contratação do Plano X,
resume partes/prazo/valor, informa que o PDF vai **em anexo**, link pra
`/assinatura`. Recebe `{ planLabel, priceCents, contratanteRazao, signatarioNome,
appUrl, logoUrl }`.

### `app/api/billing/contract/route.ts`

**`POST`** — autenticado, só o dono (`requireScope` + `scope.isOwner`, igual ao
checkout). Conta cortesia → 409 (não assina contrato, não paga).

1. Rate limit (`checkRateLimit("contract:" + scope.uid`, janela 1h, max ~10).
2. Lê body: `planId`, `razaoSocial`, `cnpj`, `regimeTributario`, `endereco`,
   `nome`, `cpf`, `email`.
3. Valida: plano existe (`getPlan`); `isTaxRegime`; `isValidCnpj`/`isValidCpf`;
   e-mail formato; campos obrigatórios não vazios; limites de tamanho.
4. Monta `ContractDoc`: `acceptedAt = Date.now()`, `ip` = 1º item de
   `request.headers.get("x-forwarded-for")`, `userAgent` =
   `request.headers.get("user-agent")`, `hash = contractHash(canonical)`,
   `status = "pending_payment"`, snapshots de `planLabel`/`priceCents`.
5. `db.collection("users/{ownerUid}/contracts").add(doc)` → grava também o
   `contractId` dentro do doc.
6. Retorna `{ contractId }`.

**`GET ?id=<contractId>`** — autenticado, `inAccount(ownerUid)` (dono ou membro).
Carrega o doc, gera o PDF com `buildContractPdf`, responde
`application/pdf` com `Content-Disposition: attachment; filename=...`. Serve
para o botão "Baixar contrato" na tela de retorno e no Paywall quando ativo.

### `app/assinatura/contrato/page.tsx`

`"use client"`, `dynamic = "force-dynamic"`. Estrutura análoga a
`app/assinatura/page.tsx` + `Paywall`:

- Lê `?plano=` da URL; se não for `isPlanId` → redireciona pra `/assinatura`.
- `useAuth` + `useSubscription`. Se `!isOwner` ou `comped` ou `status === "active"`
  → redireciona (`/dashboard` ou `/assinatura`).
- Prefill: `getDoc(users/{ownerUid}/profile/company)` para razão social / CNPJ /
  endereço; `auth.currentUser` para e-mail e nome do responsável.
- Formulário (design system: `Card`, `Input`, `Button`, e um `<select>` de
  regime no estilo dos outros): razão social, CNPJ (máscara), regime, endereço,
  nome, CPF (máscara), e-mail. Validação client-side espelhando o server
  (`isValidCnpj`/`isValidCpf` de `lib/contract.ts`).
- Prévia do contrato: `renderContractText({...})` renderizado num painel
  rolável, atualiza conforme digita.
- Checkbox "Li e aceito os termos deste contrato" — botão desabilitado até
  marcar + formulário válido.
- Submit → `POST /api/billing/contract` → com `contractId`, chama
  `startCheckout(plano, contractId)` (que redireciona pra InfinitePay). Erros
  em PT-BR no mesmo padrão do `Paywall`.

## Arquivos alterados

### `lib/infinitepay.ts`

```ts
export function buildOrderNsu(ownerUid: string, planId: string, contractId?: string): string {
  const parts = [ownerUid, planId];
  if (contractId) parts.push(contractId);
  parts.push(Date.now().toString(36));
  return parts.join(NSU_SEP);
}

export function parseOrderNsu(nsu: string):
  | { ownerUid: string; planId: string; contractId: string | null }
  | null {
  const parts = (nsu || "").split(NSU_SEP);
  if (parts.length < 2 || !parts[0] || !parts[1]) return null;
  // [owner, plan, ts]  ou  [owner, plan, contractId, ts]
  const contractId = parts.length >= 4 ? parts[2] : null;
  return { ownerUid: parts[0], planId: parts[1], contractId };
}
```

Retrocompatível: `order_nsu` antigo (3 segmentos) → `contractId = null`.
Verificar todos os call sites de `parseOrderNsu` (`billingApply.ts`,
`api/billing/confirm/route.ts`) — só passam a ter um campo a mais.

### `lib/startCheckout.ts`

`startCheckout(planId: string, contractId?: string)` — inclui `contractId` no
body do `POST /api/billing/checkout` quando presente. `isPlanId` inalterado.

### `app/api/billing/checkout/route.ts`

- Lê `contractId` do body (além de `plan`).
- **Exige** um `contractId` válido: carrega
  `users/{ownerUid}/contracts/{contractId}`, confere `ownerUid`,
  `planId === plan`, `status === "pending_payment"`. Se faltar / não bater →
  400 `"Assine o contrato antes de prosseguir para o pagamento."`
- `buildOrderNsu(scope.ownerUid, plan.id, contractId)`.
- Após criar o link, grava `orderNsu` no doc do contrato (`update`).
- Prefill `customer` da InfinitePay passa a usar `signatario.nome` /
  `signatario.email` do contrato (mais fiel que o displayName do login).

### `lib/billingApply.ts`

- `parseOrderNsu` já devolve `contractId`.
- Após o bloco que retorna `{ applied: true, ... }` (fora da transação, para não
  segurar lock em geração de PDF / envio de e-mail), chamar:
  ```ts
  if (parsed.contractId) {
    await finalizeContract(db, parsed.ownerUid, parsed.contractId, {
      transactionNsu: input.transactionNsu,
      orderNsu: input.orderNsu,
      paidAt: now,
      periodEnd: currentPeriodEnd,
    }).catch((e) => console.error("finalizeContract falhou:", e));
  }
  ```
- `finalizeContract` (nova função — pode morar em `lib/contractFinalize.ts` para
  não inchar `billingApply.ts`, ou no próprio arquivo; decisão de implementação):
  - `get` do contrato; se não existe → loga e retorna (não quebra).
  - Se `status === "signed"` **e** `emailedAt` → já finalizado, retorna
    (idempotência; cobre reentrância webhook × confirm).
  - `update`: `status: "signed"`, `transactionNsu`, `orderNsu`, `paidAt`,
    `periodEnd`, `updatedAt`.
  - `buildContractPdf(doc)` → base64.
  - `resend.emails.send({ from: RESET_EMAIL_FROM, to: [signatario.email, ownerEmail],
    subject, html, text, attachments: [{ filename: "contrato-nexusfi.pdf",
    content: base64 }] })`. `ownerEmail` via `getAdminAuth().getUser(ownerUid)`.
  - Sucesso → `update({ emailedAt: Date.now(), emailError: null })`.
  - Falha → `update({ emailError: String(err) })`, loga, **não lança**.

### `app/components/Paywall.tsx`

`assinar(planId)` deixa de chamar `startCheckout`. Passa a
`router.push("/assinatura/contrato?plano=" + planId)` (adiciona
`useRouter` de `next/navigation`). O estado de loading por plano continua
(feedback do clique) até a navegação.

### `app/assinatura/page.tsx`

O `useEffect` do `?checkout=<plano>` deixa de chamar `startCheckout(autoPlan)`
e passa a `router.replace("/assinatura/contrato?plano=" + autoPlan)`. Mantém
as guardas (`isOwner`, `status !== "active"`, `isPlanId`). O estado
`redirecting` continua exibindo o loader "Redirecionando…".

### `app/assinatura/retorno/page.tsx`

Na fase `"ok"`, se o `order_nsu` tiver `contractId` (parse client-side simples
ou via um campo retornado pelo `/api/billing/confirm`), mostrar link discreto
"Baixar contrato (PDF)" → `GET /api/billing/contract?id=<contractId>`. Também
uma linha: "Enviamos uma cópia para o seu e-mail." Opcional / nice-to-have —
pode ficar de fora do MVP se complicar.

## Casos de borda

- **Abandono após criar o contrato, sem pagar** → fica `pending_payment`,
  inofensivo. Nova tentativa cria um novo contrato (novo `contractId`). Não há
  limpeza automática no MVP.
- **Conta já `active`** → página do contrato redireciona (nada a assinar).
- **`contractId` no `order_nsu` mas contrato sumido / divergente em
  `applyPaidOrder`** → o pagamento **é aplicado assim mesmo** (não punir cliente
  que pagou); loga, pula o e-mail.
- **Checkout sem `contractId`** (links antigos, hit direto na API) → 400.
- **Webhook × confirm em corrida** → `finalizeContract` idempotente por
  `status === "signed" && emailedAt`; o `applyPaidOrder` em si já é idempotente
  por `billingEvents/{transactionNsu}`, então na 2ª passada nem chega em
  `finalizeContract`.
- **Regime / CNPJ não conferem com a realidade** → fora do nosso escopo validar
  além dos dígitos verificadores; o contrato registra o que foi declarado
  (cláusula 6 joga a responsabilidade pela veracidade na CONTRATANTE).
- **Resend sem `RESEND_API_KEY`** → `finalizeContract` loga `emailError`,
  contrato fica `signed` sem `emailedAt`; PDF continua disponível pelo `GET`.
- **Membro não-dono abre `/assinatura/contrato`** → redireciona (só o dono
  contrata, igual ao checkout).

## Pendências (placeholder no template, marcadas com comentário no código)

- `[BAIRRO]` da sede da NexusFi (CEP 08280-350, São Paulo/SP).
- Confirmar a **razão social exata** conforme registro na Junta Comercial
  (usado "NexusFi ME").
- E-mail / telefone oficial de contato da NexusFi (omitido no v1).

Dados já confirmados: CNPJ 68.919.873/0001-36 · R. Sebastião Miguel da Silva,
107 · São Paulo/SP · CEP 08280-350 · representante legal Felipe Augusto de Jesus
Paiva, CPF 392.149.348-00.

## Escopo — arquivos tocados

**Novos:** `lib/contract.ts`, `lib/contractText.ts`, `lib/contractPdf.ts`,
`app/api/billing/contract/route.ts`, `app/assinatura/contrato/page.tsx`
(e possivelmente `lib/contractFinalize.ts`).

**Alterados:** `lib/infinitepay.ts`, `lib/startCheckout.ts`,
`app/api/billing/checkout/route.ts`, `lib/billingApply.ts`,
`lib/emailTemplates.ts`, `app/components/Paywall.tsx`, `app/assinatura/page.tsx`,
`app/assinatura/retorno/page.tsx` (opcional), `firestore.rules`.

## Testes

- **`lib/contract.ts`**: `contractHash` determinístico e estável à ordem das
  chaves de entrada; `isValidCnpj`/`isValidCpf` (casos válidos, dígito errado,
  tamanho errado, tudo igual); `isTaxRegime`; máscaras.
- **`lib/contractText.ts`**: renderiza os 4 regimes × 2 planos sem `undefined`
  no texto; preâmbulo contém CNPJ da NexusFi e da contratante; bloco de aceite
  só aparece com `acceptedAt`.
- **`lib/infinitepay.ts`**: `buildOrderNsu`/`parseOrderNsu` round-trip com e sem
  `contractId`; `order_nsu` legado de 3 segmentos → `contractId: null`.
- **`applyPaidOrder` / `finalizeContract`**: contrato vira `signed` + e-mail
  disparado uma vez; 2ª chamada não reenvia; contrato ausente não impede
  `applied: true`; exceção no envio de e-mail não propaga.
- **Manual (dev, handle de teste InfinitePay)**: fluxo completo Paywall →
  contrato → pagamento → retorno → e-mail com PDF; fluxo pós-cadastro
  `?plano=` → `?checkout=` → `/assinatura/contrato`.
