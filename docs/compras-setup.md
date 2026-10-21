# Módulo de Compras + portal do fornecedor — setup

Especificação: `docs/compras-spec.md`. Código: `lib/compras/*`, rotas `app/api/compras/**`,
telas `app/[locale]/contasPagar/compras` (equipe) e `app/[locale]/fornecedor/**` (portal).

## 1. O que precisa estar configurado

| Item | Onde | Obrigatório? | Para quê |
|---|---|---|---|
| `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY` | env (já existem) | Sim | Todas as rotas de Compras usam o Admin SDK |
| `NEXT_PUBLIC_APP_URL` | env (já existe) | Sim | Links do convite, do portal e dos e-mails (`https://…`, sem barra final) |
| `RESEND_API_KEY`, `RESET_EMAIL_FROM` | env (já existem) | Sim p/ e-mail | Convite, confirmação de e-mail, avisos de pedido/status. Sem a chave o envio é registrado como **falhou** no log (nada é simulado) |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | env (Meta Cloud API) | Não | Convite e avisos por WhatsApp. Sem eles → status `not_configured` + botão **wa.me** com a mensagem pronta |
| `WHATSAPP_TEMPLATE_SUPPLIER` | env | Não | Template aprovado pro fornecedor (3 variáveis: `{{1}}` nome, `{{2}}` empresa, `{{3}}` texto). Sem ele usa `WHATSAPP_TEMPLATE_ALERT` / `aviso_nexusfi` |
| Aviso "Pedido de compra recebido" | Configurações › WhatsApp | Não | Liga o WhatsApp do dono quando o fornecedor envia um pedido (plano Pro, mesma regra dos demais avisos) |

Nenhuma variável nova é obrigatória — o módulo reaproveita as integrações existentes.
Passo a passo da Meta: `docs/whatsapp-meta-setup.md` (crie também o template do fornecedor,
categoria UTILITY, idioma `pt_BR`).

## 2. Deploy das regras (OBRIGATÓRIO antes de usar)

```bash
firebase deploy --only firestore:rules,storage
```

O que mudou:

- **firestore.rules**
  - `signedIn()` passa a recusar tokens com a claim `portalOnly` (login criado pelo convite do
    portal): esse login não lê/escreve **nada** pelo client, nem o próprio ninho.
  - `users/{uid}/suppliers`, `purchaseOrders` (+ `history`) e `comprasNotifications`: **leitura**
    pela conta (dono/membros), **escrita só pelo servidor**.
  - `supplierCnpjIndex` e `counters` ficam fora do bloco genérico (só Admin SDK).
  - `supplierInvites/*` e `supplierPortalUsers/*` (raiz) caem no fallback de negação.
- **storage.rules**: `compras/**` negado ao client (anexos só via API).

Sem o deploy o módulo funciona, mas **inseguro**: as coleções novas cairiam no bloco genérico do
ninho (membros poderiam escrever pedidos/totais direto pelo client, sem passar pelo servidor) e o
login `portalOnly` ainda conseguiria usar o próprio ninho (vazio). Faça o deploy junto com o código.

Índices: nenhum índice composto novo (consultas usam igualdade simples ou `orderBy` de um campo).

## 3. Permissões

| Papel | Como ganha | Pode |
|---|---|---|
| Editor | dono ou membro com **Contas a pagar** | ver Compras, cadastrar/editar fornecedores, convidar, iniciar análise, ajustar pedido, anexar |
| Aprovador | dono ou membro com **Compras — aprovar pedidos** (nova categoria em Usuários) | aprovar, recusar, cancelar, concluir, gerar lançamento no Contas a Pagar, revogar portal |
| Fornecedor | convite aceito (login próprio) | só os próprios pedidos e os dados comerciais permitidos |

A matriz está em `lib/compras/status.ts` e é aplicada **no servidor** em toda rota.

## 4. Fluxo ponta a ponta (teste manual)

1. Contas a pagar › **Compras** › *Novo fornecedor* (CNPJ válido; duplicado é barrado).
2. Abra o fornecedor › *Convidar para o portal* (e-mail e/ou WhatsApp). Sem Meta configurada,
   use o botão **Abrir WhatsApp com a mensagem**.
3. Fornecedor abre `/fornecedor/convite?t=…` → cria a senha (ou entra, se já tiver login com o
   mesmo e-mail). Se o convite foi só por WhatsApp, o portal pede a confirmação do e-mail.
4. Portal: *Novo pedido* → itens, descontos/impostos/frete, condições, anexos → *Salvar rascunho*
   → *Enviar para análise*. Empresa recebe e-mail (e WhatsApp, se ligado); fornecedor recebe a
   confirmação de recebimento.
5. Equipe: aba Pedidos → abrir → *Iniciar análise* / *Ajustar pedido* → *Aprovar* (ou recusar
   com motivo). Fornecedor é avisado a cada mudança.
6. *Gerar lançamento no Contas a Pagar* (parcelas, 1º vencimento, categoria, centro de custo).
   Repetir não duplica (IDs `bills/po_{pedido}_{n}` + vínculo no pedido).

Recuperação de acesso do fornecedor: *Esqueci minha senha* em `/fornecedor/entrar`
(`/api/auth/reset-password` com `target: "portal"` volta pro login do portal).

## 5. Testes

```bash
npm test          # node --test + strip-types, sem dependência nova (tests/compras/*)
npx tsc --noEmit
npm run i18n:check
```

Os testes rodam a lógica do servidor contra um Firestore em memória
(`tests/support/fakeFirestore.mjs`, que também exige leituras antes das escritas nas transações).
As regras do Firestore/Storage **não** têm teste automatizado (o projeto não tem emulador
configurado) — validar no Rules Playground do console após o deploy:

- login com claim `portalOnly` lendo `users/{qualquer}/bills/x` → negado;
- membro da conta lendo `users/{dono}/purchaseOrders/x` → permitido; escrevendo → negado;
- qualquer login lendo `supplierInvites/x` → negado.

## 6. Limitações conhecidas

- Rate limit em memória (`lib/rateLimit.ts`) é por instância serverless, não global.
- Anexos até 4 MB (limite de corpo da Vercel); upload passa pela API.
- E-mails saem em pt-BR (como o restante do app); as telas estão em pt-BR/en/es.
- Leitura de `suppliers`/`purchaseOrders` pelo client vale pra qualquer membro da conta (a
  checagem por categoria é feita no app e nas rotas, igual às demais coleções do ninho).
