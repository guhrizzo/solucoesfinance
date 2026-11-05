# Banco Inter (extrato + conciliação) — guia de implantação

Specs:
- [Extrato + conciliação](superpowers/specs/2026-11-03-inter-extrato-conciliar-design.md)
- [Aba Integrações + conexão pelo adm](superpowers/specs/2026-11-05-aba-integracoes-admin-design.md)

Planos:
- [Extrato + conciliação](superpowers/plans/2026-11-03-inter-extrato-conciliar.md)
- [Aba Integrações + conexão pelo adm](superpowers/plans/2026-11-05-aba-integracoes-admin.md)

Recurso **somente Pro/cortesia** (gate `isProAccess` nas rotas de sincronização e nas rotas do adm de conectar/atualizar/testar).

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
| `CRON_SECRET` | Já usada pelos outros crons; o cron do Inter exige o mesmo header `Authorization: Bearer`. |

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

## 3. Cron

`vercel.json` registra `/api/cron/inter-sync` com agenda `30 9 * * *` (diário, 09:30 UTC). Ele sincroniza as contas conectadas em lotes com concorrência limitada e informa quantas ficaram para a próxima execução. Também existe sincronização sob demanda (`/api/inter/sincronizar`, botão no Fluxo de Caixa). Rota e cron não mudaram.

## 4. Credenciais do cliente

O cliente gera, no Internet Banking do Inter Empresas, uma integração de API com **escopo de leitura de extrato** e obtém Client ID, Client Secret e o par certificado + chave privada (`.crt`/`.key`). Escopos de Pix/Cobrança **não** são necessários. Os nomes exatos de menus mudam; a referência oficial é developers.inter.co.

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
- **Mês fechado**: um mês é fechado quando **todos** os seus lançamentos estão conciliados (mesma regra do Fechamento de Caixa por Mês). **Só a fila "A conciliar" aplica** isso: criar/vincular em mês fechado é bloqueado ali; o restante do app não muda de comportamento.
- Ações da fila: criar, vincular, ignorar, desfazer.

## 9. Limitações conhecidas

- Conta **PF não coberta** (a API direta é só Inter Empresas). Open Finance via agregador seria um projeto futuro.
- Formato da API do Inter baseado em suposições, ainda não validado com conta real.
- A identidade do adm depende do claim de e-mail do token.
- O rate limit das rotas do adm é em memória (por instância).
- Sem tela para ler `auditoriaIntegracoes`.
- Sem webhooks: só sincronização manual e diária.
- Uma conexão por conta (dono).
- O painel do adm não consegue limpar um valor de `conta` já existente: dá para alterar, mas só remover desconectando e reconectando.
- Fechar a aba no meio de "criar" pode deixar uma baixa (settlement) órfã.
- A reserva de um item expira em 15 min usando o relógio do cliente.
