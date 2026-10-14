# WhatsApp (Meta Cloud API): passo a passo da configuração

A NexusFi manda WhatsApp por **um número oficial da plataforma**, pela API oficial da Meta (WhatsApp Cloud API). O código já está pronto. Falta criar a conta na Meta, aprovar os modelos de mensagem e colocar as credenciais na Vercel.

O que sai por WhatsApp (tudo é recurso do plano Pro):

| Mensagem | Para quem | Quando | Template |
|---|---|---|---|
| Lembrete de cobrança (com Pix copia e cola) | Cliente de uma conta a receber | 5 dias antes e no dia do vencimento, 8h | `lembrete_cobranca` |
| Fechamento de caixa | Dono da conta | Quando um caixa do PDV é fechado | `aviso_nexusfi` |
| Estoque baixo | Dono da conta | Quando um produto chega no mínimo ou acaba | `aviso_nexusfi` |
| Contas a pagar / impostos | Dono da conta | 3 dias antes, 1 dia antes, no dia e atrasadas há 1 e 7 dias, 8h | `aviso_nexusfi` |
| Contas a receber | Dono da conta | Mesmas janelas | `aviso_nexusfi` |
| Alerta de caixa | Dono da conta | Saldo projetado negativo nos próximos X dias, ou saldo abaixo do mínimo (no máximo a cada 3 dias) | `aviso_nexusfi` |
| Lançamentos sem categoria | Dono da conta | Toda segunda | `aviso_nexusfi` |
| Orçamento de centro de custo | Dono da conta | Ao chegar em 90% e ao estourar, 1 vez por mês/centro | `aviso_nexusfi` |
| Resumo financeiro | Dono da conta | Segunda (semanal) ou dia 1 (mensal) | `aviso_nexusfi` |

O dono escolhe o número e os avisos em **Configurações > WhatsApp**.

---

## 1. Número de telefone

Separe um número que **não esteja em uso** no app do WhatsApp nem no WhatsApp Business. Pode ser um chip novo ou um fixo. Se o número estiver em algum app, apague a conta dele no app antes. Ele precisa receber SMS ou ligação para a verificação.

## 2. Portfólio empresarial na Meta

1. Entre em <https://business.facebook.com> e crie (ou escolha) o portfólio empresarial da NexusFi.
2. Em **Configurações > Central de segurança**, faça a **verificação da empresa** (CNPJ e documento). Sem isso a conta funciona, mas fica limitada a 250 conversas iniciadas pela empresa por dia e o nome de exibição demora mais pra ser aprovado.

## 3. App no Meta for Developers

1. Entre em <https://developers.facebook.com/apps> e clique em **Criar app**.
2. Tipo de uso: **Outro**. Tipo de app: **Empresa**. Vincule ao portfólio do passo 2.
3. No painel do app, adicione o produto **WhatsApp** e clique em **Configurar**. A Meta cria uma conta do WhatsApp Business (WABA) e um número de teste.

## 4. Adicionar o número real

1. No app, abra **WhatsApp > Configuração da API** e clique em **Adicionar número de telefone**.
2. Preencha o nome de exibição (ex.: "NexusFi"), a categoria e verifique o número pelo código.
3. Anote o **Identificador do número de telefone** (Phone number ID) que aparece nessa tela. É o `WHATSAPP_PHONE_NUMBER_ID`.

## 5. Forma de pagamento

Em **WhatsApp Manager > Configurações da conta > Pagamento** (<https://business.facebook.com/wa/manage/>), cadastre um cartão. Mensagens de modelo "Utilidade" são cobradas por mensagem entregue. Sem forma de pagamento, a Meta recusa os envios.

## 6. Token permanente (usuário do sistema)

O token que aparece na tela de Configuração da API expira em 24h. Use um token de **usuário do sistema**, que não expira:

1. Em <https://business.facebook.com/settings>, abra **Usuários > Usuários do sistema** e clique em **Adicionar**. Nome: "nexusfi-api", função: **Administrador**.
2. Clique em **Atribuir ativos**:
   - **Apps:** o app do passo 3, com controle total.
   - **Contas do WhatsApp:** a conta do passo 3, com controle total.
3. Clique em **Gerar novo token**, escolha o app, validade **Nunca** e marque as permissões:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
4. Copie o token (ele só aparece uma vez). É o `WHATSAPP_TOKEN`. Guarde como senha.

## 7. Modelos de mensagem (templates)

Em **WhatsApp Manager > Modelos de mensagem > Criar modelo**, crie os dois abaixo. Categoria **Utilidade**, idioma **Português (BR)**. O nome precisa ser exatamente este. A aprovação costuma levar de minutos a algumas horas.

### `lembrete_cobranca`

Corpo:

```text
Olá, {{1}}! {{2}}: a cobrança de {{3}} de {{4}} vence {{5}}.
Pague com Pix copia e cola: {{6}}
```

Exemplos pedidos pela Meta: `{{1}}` Maria · `{{2}}` Lembrete · `{{3}}` R$ 150,00 · `{{4}}` Loja Exemplo · `{{5}}` em 05/10/2026 · `{{6}}` 00020126580014br.gov.bcb.pix…

### `aviso_nexusfi`

Corpo:

```text
Olá, {{1}}! Aviso da NexusFi sobre {{2}}: {{3}}. Acesse o painel para ver os detalhes.
```

Exemplos: `{{1}}` Felipe · `{{2}}` Loja Exemplo · `{{3}}` caixa fechado por Felipe com 12 vendas, total R$ 1.234,00, sem diferença na conferência

Se você der outro nome aos modelos, informe nas variáveis `WHATSAPP_TEMPLATE_CHARGE` e `WHATSAPP_TEMPLATE_ALERT`.

## 8. Variáveis de ambiente na Vercel

Em **Vercel > projeto > Settings > Environment Variables** (Production), adicione:

| Variável | Valor |
|---|---|
| `WHATSAPP_TOKEN` | token do passo 6 |
| `WHATSAPP_PHONE_NUMBER_ID` | identificador do passo 4 |
| `WHATSAPP_TEMPLATE_CHARGE` | opcional, padrão `lembrete_cobranca` |
| `WHATSAPP_TEMPLATE_ALERT` | opcional, padrão `aviso_nexusfi` |
| `WHATSAPP_TEMPLATE_LANG` | opcional, padrão `pt_BR` |

Confira também se `CRON_SECRET` existe (os envios diários das 8h dependem dele). Depois faça um **Redeploy** para as variáveis valerem. Para testar localmente, coloque as mesmas no `.env.local`.

## 9. Índices do Firestore

Os avisos diários localizam quem tem aviso ligado pelo campo `alertsActive` (gravado ao salvar em Configurações > WhatsApp; contas que salvaram antes disso precisam salvar de novo). Publique os índices uma vez:

```bash
firebase deploy --only firestore:indexes
```

## 10. Testar

1. Entre numa conta Pro e abra **Configurações > WhatsApp**.
2. Digite o seu número, marque os avisos e clique em **Salvar**.
3. Clique em **Enviar teste**. A mensagem deve chegar em segundos. Se falhar, a tela mostra o motivo que a Meta devolveu.

Erros comuns da Meta:
- **Template name does not exist in the translation:** o modelo ainda não foi aprovado, ou o nome/idioma está diferente.
- **Recipient phone number not in allowed list:** você está usando o número de teste da Meta. Troque pelo número real (passo 4) ou adicione o destinatário na lista de teste.
- **Invalid OAuth access token:** token expirado ou sem as permissões do passo 6.
- **Payment method required / account restricted:** falta a forma de pagamento do passo 5.

---

## 11. Respostas pelo WhatsApp (webhook de entrada)

O dono pode responder ao número da NexusFi: **paguei** (dá baixa na conta), foto/PDF de nota ou comprovante (vira lançamento depois de ele confirmar com **sim**), **quanto gastei com combustível este mês?** e **saldo**. Só vale para o número cadastrado em Configurações > WhatsApp, de conta Pro. A baixa por aqui não pede o PIN do app e fica carimbada como "WhatsApp".

1. Na Vercel, adicione `WHATSAPP_VERIFY_TOKEN` (uma senha qualquer que você inventa) e `WHATSAPP_APP_SECRET` (Meta for Developers > seu app > Configurações > Básico > Chave secreta do app). `ANTHROPIC_API_KEY` já usada pelo chat também lê as notas. Faça Redeploy.
2. No app da Meta, abra **WhatsApp > Configuração** > **Webhook** > **Editar**. URL de retorno: `https://SEU-DOMINIO/api/webhooks/whatsapp`. Token de verificação: o `WHATSAPP_VERIFY_TOKEN`. Clique em **Verificar e salvar**.
3. Em **Campos do webhook**, assine **messages**.
4. Publique o índice novo (`phoneE164`): `firebase deploy --only firestore:indexes`. Quem já salvou o número precisa salvar de novo em Configurações > WhatsApp.

### Botões no aviso de contas (opcional)

Crie um terceiro modelo, categoria **Utilidade**, com o mesmo corpo do `aviso_nexusfi` e dois botões de **Resposta rápida**: "Marcar como pago" e "Ver detalhes" (nessa ordem). Informe o nome dele em `WHATSAPP_TEMPLATE_ALERT_ACTIONS`. Sem essa variável, o aviso sai sem botões. Os botões usam os códigos `PAGO` e `DETALHES` (já enviados pelo sistema).
