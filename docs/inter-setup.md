# Banco Inter (extrato + conciliação) — guia de implantação

Specs:
- [Extrato + conciliação](superpowers/specs/2026-11-03-inter-extrato-conciliar-design.md)
- [Aba Integrações + conexão pelo adm](superpowers/specs/2026-11-05-aba-integracoes-admin-design.md)
- [Boletos (cobrança com Pix) + webhook](superpowers/specs/2026-11-16-inter-boletos-design.md)

Planos:
- [Extrato + conciliação](superpowers/plans/2026-11-03-inter-extrato-conciliar.md)
- [Aba Integrações + conexão pelo adm](superpowers/plans/2026-11-05-aba-integracoes-admin.md)
- [Boletos (cobrança com Pix) + webhook](superpowers/plans/2026-11-16-inter-boletos.md)

Recurso **somente Pro/cortesia** (gate `isProAccess` nas rotas de sincronização, nas rotas do adm de conectar/atualizar/testar/ativar boletos e nas rotas de boleto). As seções 10 a 14 cobrem os **boletos** (emissão pelo app, aviso automático do Inter e checklist do sandbox); as seções 0 a 9 continuam valendo para o extrato.

## 0. Quem conecta (importante)

A conexão **não é mais feita pelo cliente**. Só um **adm supremo** (os e-mails de `SUPREME_ADMIN_EMAILS` em `lib/compAccounts.ts`) conecta, atualiza, testa e desconecta, em **Configurações → Integrações → "Conectar em nome do cliente"**.

- O alvo precisa ser **dono de conta**. Membro convidado, login do portal de fornecedor e e-mail desconhecido são recusados.
- Conectar, atualizar e testar exigem que o **cliente seja Pro ou cortesia**. Desconectar não exige.
- O cliente (dono) vê em **Configurações → Integrações** apenas o status do Inter, somente leitura ("configurado pela equipe NexusFi"), e usa a fila **"A conciliar"** no Fluxo de Caixa. PagBank, Mercado Pago, Stone e Cielo aparecem como "em breve".
- Os marketplaces (Mercado Livre, TikTok Shop, Shein) aparecem na mesma aba (duplicados da Estoque). O cliente continua conectando sozinho via OAuth; o retorno pode voltar para `/configuracoes` pelo `returnTo` da lista permitida.
- Só vale para conta **Inter Empresas (PJ)**: a API direta não cobre pessoa física.

### Passo a passo (adm)

1. Combine com o cliente e colete as credenciais (seção 4) por um canal seguro.
2. Entre como adm supremo → Configurações → Integrações → "Conectar em nome do cliente".
3. Digite o e-mail do **dono da conta** do cliente e clique **Buscar**. Confira o nome/status exibido.
4. Preencha Client ID, Client Secret, conta corrente e anexe o `.crt` e o `.key`.
5. Clique **Conectar** (primeira vez). Depois use **Atualizar** (parcial: só os campos enviados mudam), **Testar** (certificado + token, escopo `extrato.read`) ou **Desconectar**.
6. Apague as cópias locais do `.crt`/`.key` e limpe o secret de onde foi anotado.

## 1. Variáveis de ambiente (Vercel)

| Variável | Para quê |
|---|---|
| `INTER_ENC_KEY` | Chave de 32 bytes (base64) que criptografa `clientSecret`, certificado e chave privada no Firestore. Sem ela, a conexão fica indisponível. |
| `CRON_SECRET` | Já usada pelos outros crons; os crons do Inter (`inter-sync` e `inter-boletos`) exigem o mesmo header `Authorization: Bearer`. |
| `NEXT_PUBLIC_APP_URL` | **Novo para boletos.** Endereço público **https** do app (ex.: `https://app.seudominio.com.br`). É a base da URL do webhook registrada no Inter. Em produção, sem ela (ou com localhost/http) a ativação de boletos é recusada com HTTP 400. |

Gerar a chave (nunca commitar o valor):

```
openssl rand -base64 32
```

Guarde o valor num cofre. **Trocar `INTER_ENC_KEY` invalida todas as conexões já salvas** (é preciso reconectar cada cliente).

## 2. Regras do Firestore

```
firebase deploy --only firestore:rules
```

**Faça o deploy de novo** (as regras mudaram nesta entrega). Resumo:

- `interPendentes` e `profile/interStatus` ficam fora dos matches genéricos (regra própria).
- `integracoesBanco` é **negada ao cliente** (só o servidor, via Admin SDK, lê/grava credenciais).
- `auditoriaIntegracoes` é **negada a qualquer acesso de cliente** (só servidor).

Sem o deploy, a fila "A conciliar" e o status não funcionam para o usuário.

**Regras novas dos boletos (publicar também):**

- `users/{uid}/boletos/{id}`: o dono/membro só **lê**; escrita é sempre negada (só o servidor grava). Sem o deploy, a **aba Boletos não carrega** para o usuário.
- `interWebhookTokens/{sha256}`: negada a qualquer acesso de cliente (só servidor); guarda o índice hash do token do webhook para o dono.
- `users/{uid}/receivables/{id}`: regra própria que **protege os campos `boleto` e `ultimoBoletoId`** (o client não cria nem altera esses campos). Sem o deploy, a proteção contra um membro forjar linha digitável/Pix no e-mail de cobrança **não vale**.
- O bloco genérico agora exclui também `boletos` e `receivables`.

**Atenção:** não há teste automatizado das regras. Antes do deploy, teste no **emulador do Firestore** (ler `boletos`; tentar gravar `boleto`/`ultimoBoletoId` em `receivables`; tentar ler `interWebhookTokens`).

## 3. Cron

`vercel.json` registra `/api/cron/inter-sync` com agenda `30 9 * * *` (diário, 09:30 UTC). Ele sincroniza as contas conectadas em lotes com concorrência limitada e informa quantas ficaram para a próxima execução. Também existe sincronização sob demanda (`/api/inter/sincronizar`, botão no Fluxo de Caixa). Rota e cron do extrato não mudaram.

**Cron novo dos boletos:** `vercel.json` registra `/api/cron/inter-boletos` com agenda `45 9 * * *` (diário, 09:45 UTC). É a "consulta de segurança": para cada conta com a cobrança ativa (`integracoesBanco.cobranca.ativo`) e Pro, consulta os boletos em aberto no Inter e aplica o que mudou (cobre aviso de webhook perdido). Exige `CRON_SECRET` (header `Authorization: Bearer`) e `INTER_ENC_KEY` (sem ela responde 500). Concorrência 3, com orçamento de tempo próprio; uma conta com falha não interrompe as outras. A resposta traz só contagens (`contas`, `atualizadas`, `falhas`, `puladas`, `restantes`, `consultados`, `pagos`). Também existe o botão **Atualizar** na aba Boletos (`/api/inter/boletos/atualizar`).

## 4. Credenciais do cliente

O cliente gera, no Internet Banking do Inter Empresas, uma integração de API com **escopo de leitura de extrato** e obtém Client ID, Client Secret e o par certificado + chave privada (`.crt`/`.key`). Para **boletos**, a mesma credencial precisa também dos escopos **`boleto-cobranca.read`** e **`boleto-cobranca.write`**. Esses escopos de cobrança são **opcionais**: sem eles o extrato continua funcionando normalmente e só os boletos ficam indisponíveis. Os nomes exatos de menus mudam; a referência oficial é developers.inter.co.

O adm informa esses dados no painel. O sistema valida o certificado (guarda a data de validade e avisa antes de vencer).

**Sensível:** o secret e os arquivos `.key`/`.crt` **nunca** por e-mail ou chat comum. Use um canal seguro e apague as cópias locais depois do envio.

## 5. Rotas

| Rota | Quem | Observação |
|---|---|---|
| `/api/admin/inter/cliente` | adm supremo | Busca o dono pelo e-mail e devolve só o status (sem uid, sem segredo). |
| `/api/admin/inter/conexao` | adm supremo | POST conectar, PUT atualizar, DELETE desconectar. |
| `/api/admin/inter/testar` | adm supremo | Certificado + token (escopo `extrato.read`); não consulta o extrato. |
| `/api/inter/conexao`, `/api/inter/testar` | — | **Respondem 403** (rotas antigas do dono). |
| `/api/inter/sincronizar`, cron | dono Pro, ou membro com a permissão `fluxoCaixa` sob o plano Pro do dono / cron | Inalterados. |
| `/api/admin/inter/boletos` | adm supremo | POST `{ clienteEmail }`: "Ativar boletos" (testa os escopos, grava flags, registra o webhook). Resposta só `{ ok, escopos, webhook }`. |
| `/api/inter/boletos` | dono Pro ou membro com a permissão `contasReceber` | POST emite o boleto (20 por 10 min por conta). O PIN é exigido no app antes da chamada. |
| `/api/inter/boletos/[id]/cancelar` | idem | POST cancela (20 por 10 min). Corpo opcional `{ forcarDescarte: true }`: **só o dono**. |
| `/api/inter/boletos/[id]/pdf` | idem | GET baixa o PDF (60 por 10 min). |
| `/api/inter/boletos/atualizar` | idem | POST consulta os boletos em aberto (6 por 10 min), no máximo 25 por rodada. |
| `/api/webhooks/inter-boletos/[token]` | **público** (token na URL) | POST do Inter; ver seção 11. Limite por IP (120/min) e por token (60/min); corpo máx. 256 KB. |
| `/api/cron/inter-boletos` | cron (`CRON_SECRET`) | Consulta diária; ver seção 3. |

## 6. Auditoria

Coleção só de servidor **`auditoriaIntegracoes`**: cada ação do adm grava um registro com **quem** (adm), **qual cliente**, **ação**, **ok/falha** e um **erro curto de texto fixo**. Nunca grava segredo, certificado, chave ou corpo da requisição. Registra uma vez por ação sobre um alvo resolvido, inclusive em falha (Pro, validação, chave). Falhas antes de resolver o alvo (403 do guard, corpo inválido, e-mail desconhecido, membro ou login do portal como alvo) e as buscas de cliente **não** são auditadas. Ainda **não há tela** para ler o log (consulte no console do Firebase).

## 7. Suposições NÃO verificadas com conta real

Estão marcadas como `ASSUNÇÃO` em `lib/inter.ts`:

- **Campo de data** do lançamento: prioridade `dataEntrada` → `dataInclusao` → `dataTransacao`.
- **Formato do `valor`**: string decimal com ponto.
- **Paginação**: `tamanhoPagina=1000` aceito; `pagina` 0-based e `totalPaginas` conta páginas.
- **Header `x-conta-corrente`**: normalizado para só dígitos, sem zeros à esquerda.
- **Limites**: extrato 10 chamadas/min e token 5/min. Não há retry em 429 — o erro é mostrado ("aguarde um minuto") e o cron tenta de novo no dia seguinte.

### Como validar com uma conta real

1. Cliente Pro/cortesia ativo, `INTER_ENC_KEY` definida, regras publicadas (inclui `auditoriaIntegracoes`).
2. Como adm supremo: Integrações → "Conectar em nome do cliente" → e-mail do dono → **Buscar** → preencher e **Conectar**.
3. Clicar **Testar** — deve validar o certificado e obter o token (escopo `extrato.read`) sem erro; não consulta o extrato.
4. Como o cliente (dono): confirmar que a aba Integrações mostra o Inter somente leitura e que **não** há campo de credencial. Rodar **Sincronizar** no Fluxo de Caixa e conferir quantidade, datas e valores dos itens em "A conciliar" contra o app do Inter (atenção a datas deslocadas e centavos).
5. Conciliar **um** item (criar lançamento ou vincular) e conferir o lançamento no Fluxo de Caixa e o saldo.
6. Conferir que o registro apareceu em `auditoriaIntegracoes` (sem segredo) e que `/api/inter/conexao` responde 403 para o dono.
7. Se algo divergir, ajustar a ASSUNÇÃO correspondente em `lib/inter.ts`.

## 8. Regras de negócio

- **Janela**: primeira sincronização busca os últimos **30 dias**; depois, desde `lastSyncAt` menos **3 dias** (sobreposição; a idempotência evita duplicar itens).
- **Mês fechado**: a fila **não bloqueia mais** criar/vincular em mês "fechado" (todos os lançamentos conciliados). Não há fechamento manual, o estado é derivado, e o lançamento criado pela fila entra não conciliado e reabre o mês sozinho (mudança de 2026-11-16, após o teste com conta real). Só data inválida bloqueia criar/vincular.
- Ações da fila: criar, vincular, ignorar, desfazer.

## 9. Limitações conhecidas

- Conta **PF não coberta** (a API direta é só Inter Empresas). Open Finance via agregador seria um projeto futuro.
- Formato da API do Inter baseado em suposições, ainda não validado com conta real.
- A identidade do adm depende do claim de e-mail do token.
- O rate limit das rotas do adm é em memória (por instância).
- Sem tela para ler `auditoriaIntegracoes`.
- **Extrato** sem webhooks: só sincronização manual e diária. (Os **boletos** têm webhook e consulta diária; ver seção 14.)
- Uma conexão por conta (dono).
- O painel do adm não consegue limpar um valor de `conta` já existente: dá para alterar, mas só remover desconectando e reconectando.
- Fechar a aba no meio de "criar" pode deixar uma baixa (settlement) órfã.
- A reserva de um item expira em 15 min usando o relógio do cliente.

## 10. Boletos: ativação pelo adm

Pré-requisitos: Inter já **conectado** para o cliente (seção 0), cliente **Pro/cortesia**, `INTER_ENC_KEY` e `NEXT_PUBLIC_APP_URL` (https) definidas e regras publicadas (seção 2).

1. O cliente, no Internet Banking do Inter Empresas, gera/edita a integração com os escopos `extrato.read`, `boleto-cobranca.read` e `boleto-cobranca.write`. Se a credencial antiga não tinha os escopos de cobrança, é preciso **regenerar** a integração e usar **Atualizar** no painel com o novo Client ID, Secret, certificado e chave.
2. Como adm supremo: **Configurações -> Integrações -> Conectar em nome do cliente** -> e-mail do dono -> **Buscar** -> no cartão **Boletos**, clique **Ativar boletos** (depois da primeira vez o botão vira **Reativar boletos**).
3. O servidor pede um token de cada escopo (um por vez; o Inter limita tokens por minuto), grava as flags e, com escrita e URL https pública, registra o webhook no Inter. Só o campo `cobranca` da conexão é tocado (credenciais, conta e cursor do extrato ficam como estão).

O resultado mostra 4 linhas:

| Linha | Significa |
|---|---|
| Extrato | Sempre "OK" na tela (a conexão já existe; não é testado de novo aqui). |
| Leitura (`boleto-cobranca.read`) | OK = o Inter deu token com esse escopo. "Faltando" = credencial sem o escopo. |
| Escrita (`boleto-cobranca.write`) | Idem. Sem escrita não há emissão nem registro de webhook. |
| Webhook | "Registrado" = registrado **agora**. "Não registrado" = faltou escrita, a URL não é https pública, ou o Inter recusou o registro. |

Os boletos só ficam **ativos** com leitura **e** escrita; com escopo faltando o cartão mostra "escopo faltando" e a mensagem orienta a regerar a credencial. Se o Inter não puder ser contatado, a resposta é HTTP 502 ("tente novamente") e **nada é gravado**. Ativar é seguro de repetir; cada ativação com escrita e URL pública **gira o token** do webhook. A ação é auditada em `auditoriaIntegracoes` (`ativar-boletos`).

## 11. Boletos: webhook

- **URL registrada no Inter:** `${NEXT_PUBLIC_APP_URL}/api/webhooks/inter-boletos/{token}`. O token (32 bytes aleatórios) é o único segredo; só o **sha256** dele é guardado (`interWebhookTokens/{hash}` e `integracoesBanco/{uid}.cobranca.token`).
- **Só https público e só depois do deploy.** Não funciona no localhost (o Inter só chama https público). Fora de produção a ativação grava as flags mas não registra o webhook.
- **O token vai na URL**, portanto aparece nos **logs de acesso da Vercel**. Não compartilhe esses logs. O app não grava a URL nem o corpo nos próprios logs.
- **Reativar gira o token:** o anterior deixa de valer (responde 404). Se o registro do novo token falhar no Inter, o token antigo é mantido.
- O corpo do aviso **não é confiado**: cada item só aponta o boleto (`seuNumero` + `codigoSolicitacao`); a situação e o valor aplicados vêm de uma **consulta nossa** ao Inter. A aplicação é idempotente (repetição não duplica entrada no caixa).
- Token válido responde sempre 200 (mesmo com item que falhou); token desconhecido, rotacionado ou conta desconectada responde 404. Corpo grande: 413; abuso: 429.
- **Aviso perdido:** o cron diário (`45 9 * * *`) e o botão **Atualizar** consultam os boletos em aberto e cobrem o que o webhook não entregou.

## 12. Boletos: como o app se comporta

- **Um boleto vigente por conta a receber.** Vigente = em processamento, a receber ou atrasado. Para emitir outro é preciso cancelar o atual. Conta já recebida não emite.
- **Emissão é assíncrona no Inter.** O app grava o boleto local primeiro (em processamento), chama o Inter **uma vez, sem retry**, e consulta algumas vezes até ter a linha digitável.
- **Falha ambígua** (rede, 5xx, resposta ilegível): o boleto fica **"em processamento"** e conta como vigente. **Não emita de novo**; use **Atualizar** (acha o boleto no Inter pelo `seuNumero`). Recusa clara (HTTP 4xx ou falha de token): vira "falha na emissão" e a conta fica livre.
- **Descarte manual:** um boleto em processamento **sem código** do Inter só pode ser descartado à força **pelo dono**, após **24 h**, e o app avisa para **conferir no Internet Banking** que nenhum boleto foi emitido antes de emitir outro.
- **Cancelar** confere antes no Inter: se já foi pago lá, aplica o pagamento e recusa o cancelamento.
- **Pagamento sempre entra no caixa pelo valor recebido** (`valorTotalRecebido`, que pode incluir juros/multa), na data do pagamento, como entrada `boleto_{id}` (única, nunca duplica). Baixa a conta a receber ligada (parcial é aceita) e ajusta o lançamento-espelho se a conta já tinha sido marcada como recebida à mão.
- **Extrato:** o item do extrato é vinculado ao lançamento do boleto automaticamente **só quando há par único** (mesmo valor em centavos, data a até 3 dias, sem concorrente), nas duas ordens. Se o extrato chegou antes e a entrada foi criada à mão com o mesmo valor, o boleto **adota** essa entrada em vez de criar outra. Qualquer ambiguidade: nada é vinculado sozinho.
- **Flags de revisão** (avisos no boleto): `revisarCaixa` = havia mais de uma entrada à mão com o mesmo valor/janela, então pode haver duplicata no caixa; `pagoAposCancelamento` = o Inter confirmou pagamento de um boleto que já estava cancelado/expirado/com falha. Sem valor ou data no retorno do Inter, nada é lançado e o boleto fica com o erro "Pagamento confirmado sem valor/data; consulte novamente" até a próxima consulta.
- O e-mail de cobrança reaproveita o boleto gravado em `receivables/{id}.boleto` (linha digitável, Pix copia-e-cola).
- Emitir, cancelar e descartar exigem o **PIN** no app; o carimbo de quem fez fica no boleto.

## 13. Checklist de validação no SANDBOX do Inter

Host do sandbox: `cdpj-sandbox.partners.uatinter.co`. **Hoje o código fala só com o host de produção** (`cdpj.partners.bancointer.com.br`, constante `HOST` em `lib/inter.ts`); para o sandbox, aponte essa constante para o host do sandbox em um ambiente de teste (nunca em produção) antes de começar. Use um ambiente publicado com https (o webhook não chega ao localhost).

### Passo a passo

1. **Credencial de sandbox:** no portal de desenvolvedores do Inter, gerar uma aplicação de sandbox com os escopos `extrato.read`, `boleto-cobranca.read` e `boleto-cobranca.write` e obter Client ID, Secret, `.crt` e `.key`.
2. **Conectar** o cliente de teste (Pro/cortesia) pelo painel do adm (seção 0) e clicar **Testar**.
3. **Ativar boletos** (seção 10). Esperado: leitura OK, escrita OK, webhook "Registrado". Conferir em `integracoesBanco/{uid}.cobranca` (`ativo: true`, `webhook: true`, `token` é um hash de 64 hex) e que existe o doc `interWebhookTokens/{hash}`.
4. **Emitir um boleto de teste** em Contas a Receber (valor a partir de R$ 2,50, vencimento futuro, endereço completo). Esperado: o status sai de "em processamento" para "a receber" em segundos, com linha digitável e Pix copia-e-cola.
5. **Conferir a consulta:** em `users/{uid}/boletos/{id}` ver `codigoSolicitacao`, `linhaDigitavel`, `codigoBarras`, `nossoNumero`, `pixCopiaECola`; em `receivables/{id}.boleto` ver o espelho. Campo vazio: ver as suposições 5 e 6 abaixo.
6. **Baixar o PDF** (`/api/inter/boletos/{id}/pdf`): deve abrir um PDF válido.
7. **Simular o pagamento**, se o sandbox oferecer (ferramenta do portal ou rota de simulação da API de Cobrança). Anote o corpo exato devolvido.
8. **Ver a aplicação:** o webhook (ou **Atualizar** / o cron) deve mudar o boleto para "recebido". Conferir: entrada `boleto_{id}` no Fluxo de Caixa com valor e data corretos; conta a receber baixada (`status: recebido`, `amountReceived`); `valorRecebido`, `paidAt` e `cashflowId` no boleto; e, nos logs da Vercel, a linha do webhook (só contagens).
9. **Repetir a aplicação** (Atualizar de novo): não pode criar segunda entrada.
10. **Extrato:** rodar **Sincronizar** no Fluxo de Caixa e ver como o pagamento aparece (`tipoTransacao`, descrição, data, valor). Esperado: o item de entrada é **vinculado sozinho** ao lançamento do boleto (par único) em vez de ir para "A conciliar". Teste também a ordem inversa (item do extrato conciliado à mão antes do pagamento): o boleto deve adotar a entrada, sem duplicar.
11. **Cancelar outro boleto** (com PIN): o Inter aceita, o boleto vira "cancelado", `receivables/{id}.boleto` é limpo e a conta fica livre para emitir de novo.
12. **Webhook de verdade:** conferir que o Inter chamou a URL (200 nos logs) e que um token errado responde 404. Reativar e confirmar que o token anterior passa a responder 404.
13. **Conta com mais de uma conta corrente**, se o sandbox permitir: confirmar que o header `x-conta-corrente` escolhe a conta certa.

### Suposições NÃO verificadas

Todas as marcadas `ASSUNÇÃO (não verificado no sandbox)` no código, mais as implícitas. Divergência = ajustar o ponto indicado e atualizar o comentário `ASSUNÇÃO`.

| # | Suposição | Onde | O que olhar | Se divergir, ajustar |
|---|---|---|---|---|
| 1 | `x-conta-corrente` só dígitos, sem zeros à esquerda (igual ao extrato) | `lib/interCobranca.ts:142` | Chamadas na conta certa; 400/403 de conta | Normalização da conta em `transporteMtls` |
| 2 | Telefone: `ddd` = 2 primeiros dígitos, `telefone` = restante, sem DDI 55 | `lib/interCobranca.ts:212` | Emitir com telefone; o Inter aceita e mostra no boleto | `ddd`/`telefone` em `buildEmitBody` |
| 3 | Multa percentual: `multa = { codigoMulta: "PERCENTUAL", taxa }` | `lib/interCobranca.ts:241` | Emitir com multa e ver se voltou igual | Objeto `multa` |
| 4 | Mora mensal: `mora = { codigoMora: "TAXAMENSAL", taxa }` | `lib/interCobranca.ts:245` | Idem, com juros | Objeto `mora` |
| 5 | Campos da consulta no topo ou dentro de `cobranca`/`boleto`/`pix` | `lib/interCobranca.ts:269` | JSON real do `GET /cobrancas/{codigo}` | Lista de objetos em `parseCobranca` |
| 6 | Nomes `linhaDigitavel`, `codigoBarras`, `nossoNumero`, `pixCopiaECola` (aceita também `pixCopiaCola`) | `lib/interCobranca.ts:282` | Linha digitável e Pix preenchidos no app | Chaves lidas em `parseCobranca` |
| 7 | Data do pagamento em `dataPagamento` ou `dataSituacao` | `lib/interCobranca.ts:293` | Campo real; **formato e fuso** (o código pega os 10 primeiros caracteres e exige `AAAA-MM-DD`; pagamento perto da meia-noite pode cair no dia errado) | Chave e conversão de data |
| 8 | `origemRecebimento` = `BOLETO` ou `PIX` | `lib/interCobranca.ts:296` | Valor real pago por boleto e por Pix | Mapeamento (hoje só informativo) |
| 9 | Listagem: `GET /cobrancas` com `dataInicial`/`dataFinal` obrigatórios, `filtrarDataPor=EMISSAO`, filtro `seuNumero`, `itensPorPagina`/`paginaAtual` (0-based), resposta `{ cobrancas: [...] }` com itens no formato da consulta individual | `lib/interCobranca.ts:328` (`buscarPorSeuNumero`) | Provocar uma falha ambígua (ou chamar a listagem direto) e ver se acha o boleto; paginação; filtro de data | Query e leitura da lista (usada por Atualizar e pelo cancelamento de boleto sem código) |
| 10 | Cancelamento: `POST /cobrancas/{codigo}/cancelar` com corpo `{ motivoCancelamento }` | `lib/interCobranca.ts:347` | HTTP 2xx e situação cancelada | Corpo do cancelamento |
| 11 | Webhook: `PUT /cobrancas/webhook` com corpo `{ webhookUrl }` | `lib/interCobranca.ts:368` | Ativação com "Registrado" e o Inter chamando a URL | Corpo de `registrarWebhook` |
| 12 | Faixa do `valorNominal`: mínimo **R$ 2,50**, máximo 99.999.999,99 | `lib/interBoletoServer.ts:200` | Tentar emitir R$ 1,00 e R$ 2,50 | Limites em `validar` e a mensagem |
| 13 | Formato decimal: `valorNominal` enviado como **número** com 2 casas; `valorTotalRecebido` aceito como número ou string com ponto (com vírgula, pontos viram milhar) | `lib/interCobranca.ts:235` e `:191-204` | JSON real de envio/retorno; valor recebido com juros/multa | `buildEmitBody` / `valorOpcional` |
| 14 | Os callbacks do webhook **sempre** trazem `seuNumero` e `codigoSolicitacao` (sem código local ou divergente o item é ignorado) | `lib/interBoletoWebhook.ts:128-152` | Corpo real de aviso de pagamento e de cancelamento; formato (array ou objeto) | Leitura dos campos do callback (o cron cobre enquanto isso) |
| 15 | `seuNumero` de 12 caracteres `[0-9a-z]` (limite 15) é aceito e devolvido na consulta e no aviso | `lib/interBoletoTypes.ts` | O Inter repete o `seuNumero` | Geração do id / casamento |
| 16 | Autenticação do webhook: só o token na URL (sem assinatura do Inter) | `app/api/webhooks/inter-boletos/[token]/route.ts` | Se o Inter envia cabeçalho de assinatura | Acrescentar verificação se existir |
| 17 | Como o pagamento aparece no **extrato** (`tipoTransacao`, descrição, data, valor) para o casamento automático | `lib/interSync.ts`, `lib/interBoletoExtrato.ts` | Valor igual ao recebido? Data a até 3 dias? | `candidatoUnico` / mapeamento em `lib/inter.ts` |
| 18 | Suposições do extrato já existentes | `lib/inter.ts:21, 48, 95, 219, 246` | Seção 7 | Seção 7 |

Confirme também na primeira emissão que o `POST /cobrancas` devolve só `{ codigoSolicitacao }` (se repetir o `seuNumero`, tem de ser o nosso) e que o `GET /cobrancas/{codigo}/pdf` traz o campo `pdf` em base64.

## 14. Limitações conhecidas dos boletos (esta versão)

- Vencimento, juros e multa só nos campos suportados (percentual de multa e de mora mensal; sem desconto nem outras modalidades).
- **Não edita** boleto emitido: cancelar e emitir outro.
- Sem emissão em lote.
- Boleto **avulso** (sem conta a receber) não tem chave de idempotência: **duplo clique pode emitir dois**. Com conta a receber, a regra de "um boleto vigente" segura.
- O **Atualizar** (e o cron) consulta no máximo **25 boletos por rodada** (limite de chamadas por minuto do Inter); os demais ficam para a próxima.
- Se a gravação do novo token falhar depois de o Inter já ter recebido a URL nova, o webhook responde **404 até reativar**.
- **Cada aviso** do webhook pede um novo token OAuth ao Inter (limite de 5 por minuto); em rajadas, o restante é coberto pela consulta diária.
- O rate limit das rotas (inclusive do webhook) é **em memória, por instância**.
- **Qualquer membro** ainda pode excluir uma conta a receber que tenha boleto (o boleto continua no Inter e no app).
- Sem tela para ler a auditoria (`auditoriaIntegracoes`).
- API de Cobrança **não validada** no sandbox nem com conta real: ver a seção 13.
