# Aba Integrações e conexão bancária feita só por adm supremo

**Data:** 2026-11-05
**Status:** rascunho para aprovação
**Base:** acréscimo na branch `feat/inter-extrato` (PR 31). Depende de `docs/superpowers/specs/2026-11-03-inter-extrato-conciliar-design.md`.

## Intenção e porquê

Hoje o cliente conecta o Banco Inter sozinho em Configurações → Banco Inter, colando
certificado e credenciais, e os marketplaces são conectados na aba Estoque. O usuário decidiu
que **cada cliente terá as credenciais de banco/pagamento coletadas e configuradas pela equipe**
(os adms supremos), e quer **todas as integrações visíveis numa aba só**. O cliente passa a
ver o resultado (status e a fila "A conciliar"), não a configuração bancária.

## Metas

- Nova aba **Integrações** em Configurações, para donos de conta, com duas seções:
  - **Marketplaces** (Mercado Livre, TikTok Shop, Shein; Shopee continua oculta pela flag atual):
    o cliente continua conectando sozinho por login (OAuth), exatamente como na aba Estoque.
    Eles **aparecem nos dois lugares** (duplicados): a Estoque continua funcionando igual.
  - **Bancos e pagamentos**: o Inter, com status somente leitura para o cliente; PagBank e
    outras instituições aparecem como **"em breve"**, sem configuração e sem ação.
- **Só adm supremo conecta, atualiza, testa e desconecta** banco/instituição de pagamento,
  **em nome do cliente**, escolhido pelo e-mail dele.
- Registro de auditoria de cada ação do adm (quem, em qual cliente, o quê, quando).
- A aba separada "Banco Inter" do PR 31 deixa de existir; seu formulário passa a ser o painel
  do adm dentro da aba Integrações.

## Não-metas

- Implementar PagBank ou qualquer outra instituição (cada uma é um projeto futuro).
- Retirar os marketplaces da aba Estoque ou mudar o fluxo de conexão deles.
- Open Finance / contas de pessoa física (a API do Inter Empresas é para CNPJ; PF só numa
  etapa futura, ainda não decidida).
- Modo "suporte" em que o adm entra na conta do cliente.

## Anti-metas

- Qualquer cliente (dono ou membro) conseguir conectar, alterar, testar ou desconectar um banco.
- O adm conseguir agir em conta de **membro convidado** ou ler/alterar outros dados do cliente.
- Segredo (client secret, certificado, chave) ser devolvido ao navegador, inclusive ao adm,
  depois de salvo; ou aparecer em log/auditoria.
- Lógica de marketplace duplicada em dois lugares (tem de ser um componente compartilhado).
- A Estoque mudar de comportamento por causa da extração.

## Restrições

- Adm supremo = `isSupremeAdminEmail` (`lib/compAccounts.ts`), sempre verificado **no servidor**
  pelo ID token (`requireScope`/Admin SDK); nunca pelo corpo da requisição nem só pelo cliente.
- Imports sem extensão `.ts`; textos em pt-BR/en/es com chaves idênticas; sem cores hex (tokens);
  regra do usuário: toda entidade com CRUD completo na interface.
- Firestore: nova coleção de auditoria só-servidor (regra `allow read, write: if false`).
- Continua valendo a restrição ao plano Pro para usar o recurso (ver decisões).

## Abordagens consideradas

1. **Rotas de adm separadas (escolhida pelo usuário).** `/api/admin/inter/*` recebem o e-mail do
   cliente; o servidor confere adm supremo, resolve o e-mail para uma conta de dono e grava as
   credenciais nela. As rotas do cliente (`/api/inter/conexao`, `/testar`) deixam de aceitar
   escrita. Menor acesso possível; nenhuma rota de cliente ganha caminho novo.
2. Parâmetro "em nome de" nas rotas atuais: menos código, mas mistura as duas autorizações; um
   erro deixaria um cliente agir na conta de outro. Descartada.
3. Modo suporte (adm "vira" o cliente): poder amplo demais só para conectar um banco. Descartada.

## Design

### 1. Servidor

- **Extrair o núcleo** das rotas atuais de conexão em funções puras de servidor
  (`connectInter / updateInter / disconnectInter / testInter` recebendo `db` e `ownerUid`),
  reaproveitando `lib/interConexao.ts` e `lib/interCrypto.ts`. As rotas de cliente e de adm
  chamam o mesmo núcleo (uma só validação de PEM/tamanhos/chave).
- **Rotas de adm** (`app/api/admin/inter/conexao` POST/PUT/DELETE e `app/api/admin/inter/testar`
  POST): corpo traz `clienteEmail` + os campos atuais. Fluxo: `requireScope` → exigir
  `scope.isSupremeAdmin` (senão 403) → `getAdminAuth().getUserByEmail(clienteEmail)` → rejeitar se
  o usuário não existe, se tem doc `users/{uid}/profile/access` (é membro) ou se é login de portal
  de fornecedor → `ownerUid = uid` do cliente → Pro do **cliente** (mesma checagem das outras
  rotas: `resolveScopeSubscription` + `isProAccess`/cortesia; sem Pro, recusar com mensagem
  legível) → rate limit por uid do adm → núcleo → auditoria.
- **Rota de busca de cliente** (`POST /api/admin/inter/cliente`): recebe e-mail, devolve só
  `{ ownerUid mascarado?, nome, e-mail, plano Pro sim/não, status da conexão Inter }` para o
  painel confirmar o alvo antes de salvar. Mesmas guardas de adm.
- **Rotas de cliente** `/api/inter/conexao` e `/api/inter/testar`: passam a responder 403 com
  mensagem "A conexão bancária é feita pela equipe NexusFi". `/api/inter/sincronizar` e o cron
  **não mudam** (o dono/membros com permissão continuam podendo "Sincronizar agora").
- **Auditoria:** coleção raiz `auditoriaIntegracoes` (só Admin SDK): `{ at, adminUid, adminEmail,
  alvoOwnerUid, alvoEmail, provider: "inter", acao: conectar|atualizar|testar|desconectar, ok,
  erro? }`. Nunca grava segredo nem conteúdo de extrato. Regra do Firestore: negar tudo ao cliente.
- `profile/interStatus` ganha `configuradoPelaEquipe: true` (só um booleano) para a UI do cliente
  poder dizer "configurado pela equipe NexusFi".

### 2. Interface

- **Configurações → Integrações** (donos de conta; membros não veem):
  - Seção **Marketplaces**: componente compartilhado `MarketplaceConnections` extraído do modal de
    integrações de `app/[locale]/estoque/page.tsx` (cards de conexão, status, conectar, desconectar,
    respeitando `SHOPEE_UI_VISIVEL`/`SHEIN_UI_VISIVEL`). A Estoque passa a usá-lo e **não muda de
    comportamento**. Redirecionamento do OAuth: hoje volta para `/estoque?integration=…`; quando a
    conexão é iniciada na aba Integrações, deve voltar para Configurações (parâmetro de retorno
    validado por lista de rotas permitidas; padrão continua `/estoque`).
  - Seção **Bancos e pagamentos**: cartão do Inter (somente leitura: conectado/desconectado,
    conta mascarada, última sincronização, erro, aviso de certificado, "configurado pela equipe",
    atalho para a fila "A conciliar" do Fluxo de Caixa; se desconectado, texto "Fale com a equipe
    NexusFi para conectar seu banco"); cartões **"Em breve"** para PagBank e demais instituições
    (lista de configuração simples, sem ação).
  - Painel **"Conectar em nome do cliente"**, só para adm supremo: campo de e-mail → Buscar
    (confirma nome, e-mail, plano e status atual) → formulário atual do `BancoInterTab` (client id,
    secret, conta, `.crt`, `.key`) com Conectar, Atualizar, Testar e Desconectar (confirmação).
    Segredos nunca pré-preenchidos nem devolvidos.
- A aba "Banco Inter" do PR 31 é removida; `BancoInterTab` vira o formulário do painel do adm.

## Decisões minhas (para você conferir)

- Aba Integrações só para **donos**; membros não veem (hoje a conexão de marketplace na Estoque
  segue disponível a membros com a permissão de estoque, como já é).
- O adm só conecta banco para cliente **Pro ou cortesia**; para os demais a rota recusa com aviso
  (o recurso é Pro, então não vale configurar antes).
- Rotas de cliente `conexao`/`testar` respondem 403 em vez de serem apagadas, para qualquer
  cache/aba antiga falhar de forma clara.
- A auditoria fica numa coleção raiz só-servidor, sem tela de consulta nesta etapa.
- Retorno do OAuth por parâmetro validado, mantendo `/estoque` como padrão.
- **Conexões já feitas pelo cliente (PR 31):** o PR ainda não foi mergeado nem implantado em
  produção, então não há migração. Se existir alguma, continua funcionando; a UI só mostra
  "configurado pela equipe" quando `configuradoPelaEquipe` for verdadeiro, senão mostra apenas
  "conectado". Se o Pro do cliente vencer depois da conexão, a sincronização e o cron já pulam a
  conta (comportamento atual); os dados e a fila ficam preservados.
- **Login de portal de fornecedor:** é marcado pela custom claim `portalOnly` (a mesma que
  `lib/apiScope.ts` já usa). A rota de adm lê as claims do usuário alvo
  (`getUserByEmail(...).customClaims`) e recusa se `portalOnly === true`; recusa também se existir
  `users/{uid}/profile/access` (membro) ou se o usuário não existir.
- **Atualizar:** parcial. O adm pode trocar só a conta, ou só Client ID/Secret; certificado e
  chave só juntos (como já é no PR 31). Segredos nunca voltam ao navegador.
- **Busca do cliente:** só adm; devolve nome, e-mail, plano Pro (sim/não) e status da conexão;
  **não devolve uid**. As rotas de escrita **não confiam em token de busca**: re-resolvem o e-mail
  e refazem todas as checagens a cada chamada. "Não encontrado" é exposto ao adm (é adm).
- **Auditoria:** gravada **uma vez, ao final da ação, inclusive em falha** (`ok: false` + erro
  legível, sem segredo). Se a gravação da auditoria falhar, a ação não é desfeita, mas o erro é
  registrado no log do servidor.
- **Parâmetro de retorno do OAuth:** só caminhos de rota (sem query), com ou sem prefixo de idioma,
  dentro de uma lista permitida (`/estoque`, `/configuracoes`). Provedor que não consiga carregar o
  parâmetro no `state` cai no padrão `/estoque`.

## Perguntas em aberto

Nenhuma.

## Deixado para quem constrói

- Layout exato dos cartões, textos e ícones (seguir o design system `ui/`).
- Nome final das funções do núcleo e dos arquivos; lista exata de instituições "em breve".
- Testes: validação de autorização do adm (mock de escopo) e o núcleo extraído; sem regressão
  nos testes existentes de `tests/inter`.
