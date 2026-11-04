# Banco Inter (extrato + conciliação) — guia de implantação

Spec: [docs/superpowers/specs/2026-11-03-inter-extrato-conciliar-design.md](superpowers/specs/2026-11-03-inter-extrato-conciliar-design.md)
Plano: [docs/superpowers/plans/2026-11-03-inter-extrato-conciliar.md](superpowers/plans/2026-11-03-inter-extrato-conciliar.md)

Recurso **somente Pro** (gate `isProAccess` nas rotas `/api/inter/*`). Só o dono da conta conecta/desconecta.

## 1. Variáveis de ambiente (Vercel)

| Variável | Para quê |
|---|---|
| `INTER_ENC_KEY` | Chave de 32 bytes (base64) que criptografa `clientSecret`, certificado e chave privada no Firestore. Sem ela, a conexão fica indisponível. |
| `CRON_SECRET` | Já usada pelos outros crons; o cron do Inter exige o mesmo header `Authorization: Bearer`. |

Gerar a chave (nunca commitar o valor):

```
openssl rand -base64 32
```

Guarde o valor num cofre. **Trocar `INTER_ENC_KEY` invalida todas as conexões já salvas** (os clientes precisam reconectar).

## 2. Regras do Firestore

```
firebase deploy --only firestore:rules
```

As regras novas: `interPendentes` e `profile/interStatus` ficam **fora** dos matches genéricos (têm regra própria), e `integracoesBanco` é **negada ao cliente** (só o servidor, via Admin SDK, lê/grava credenciais). Sem o deploy, a fila "A conciliar" e o status não funcionam para o usuário.

## 3. Cron

`vercel.json` registra `/api/cron/inter-sync` com agenda `30 9 * * *` (diário, 09:30 UTC). Ele sincroniza as contas conectadas em lotes com concorrência limitada e informa quantas ficaram para a próxima execução. Também existe sincronização sob demanda (botão na aba Fluxo de Caixa e em Configurações).

## 4. Credenciais do cliente

O cliente gera, no Internet Banking Inter Empresas, uma integração de API com escopo de leitura de extrato, obtendo Client ID, Client Secret e o par certificado + chave privada (.crt/.key). Os nomes exatos de menus mudam; consulte a documentação oficial do Inter (developers.inter.co). Na aba **Configurações > Banco Inter** ele informa esses dados e a conta corrente. O sistema valida o certificado (guarda a data de validade e avisa antes de vencer).

## 5. Suposições NÃO verificadas com conta real

Estão marcadas como `ASSUNÇÃO` em `lib/inter.ts`:

- **Campo de data** do lançamento: prioridade `dataEntrada` → `dataInclusao` → `dataTransacao`.
- **Formato do `valor`**: string decimal com ponto.
- **Paginação**: `tamanhoPagina=1000` aceito; `pagina` 0-based e `totalPaginas` conta páginas.
- **Header `x-conta-corrente`**: normalizado para só dígitos, sem zeros à esquerda.
- **Limites**: extrato 10 chamadas/min e token 5/min. Não há retry em 429 — o erro é mostrado ("aguarde um minuto") e o cron tenta de novo no dia seguinte.

### Como validar com uma conta real

1. Pro ativo, `INTER_ENC_KEY` definida, rules publicadas.
2. Conectar (Client ID/Secret, .crt, .key, conta) em Configurações > Banco Inter.
3. Clicar **Testar** — deve obter token e consultar o extrato sem erro.
4. **Sincronizar** — conferir se a quantidade, datas e valores dos itens em "A conciliar" batem com o extrato do app do Inter (atenção a datas deslocadas e centavos).
5. Conciliar **um** item (criar lançamento ou vincular) e conferir o lançamento no Fluxo de Caixa e o saldo.
6. Se algo divergir, ajustar a ASSUNÇÃO correspondente em `lib/inter.ts`.

## 6. Regras de negócio

- **Janela**: primeira sincronização busca os últimos **30 dias**; depois, desde `lastSyncAt` menos **3 dias** (sobreposição; a idempotência evita duplicar itens).
- **Mês fechado**: um mês é fechado quando **todos** os seus lançamentos estão conciliados (mesma regra do Fechamento de Caixa por Mês). **Só a fila "A conciliar" aplica** isso: criar/vincular em mês fechado é bloqueado ali; o restante do app não muda de comportamento.
- Ações da fila: criar, vincular, ignorar, desfazer.

## 7. Limitações conhecidas

- Sem webhooks: só sincronização manual e diária.
- Uma conexão por conta (dono).
- Fechar a aba no meio de "criar" pode deixar uma baixa (settlement) órfã.
- A reserva de um item expira em 15 min usando o relógio do cliente.
