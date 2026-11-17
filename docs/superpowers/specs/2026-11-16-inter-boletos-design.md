# Banco Inter — emissão e controle de boletos (design)

Data: 2026-11-16. Etapa 2 da integração Inter (a etapa 1 é o extrato + fila "A conciliar").
Status: rascunho para aprovação.

## Intenção e porquê

O cliente Pro emite boletos (boleto com Pix) pelo próprio app, direto na conta Inter Empresas dele, e acompanha tudo num resumo: **a receber, aguardando pagamento, vencidos e pagos**. Quando um boleto é pago, **a entrada vai para o Fluxo de Caixa sozinha**. Hoje o e-mail de cobrança sai em layout de boleto sem linha digitável (`lib/boleto.ts` tem o ponto de encaixe `BoletoProvider`, hoje `null`); o cliente precisa emitir o boleto em outro lugar e dar baixa à mão.

Boleto pode nascer de duas formas, as duas decididas pelo usuário:
1. de uma **conta a receber** existente (botão "Emitir boleto" nela);
2. **avulso**, sem conta a receber.

## Objetivos

- Emitir, consultar, baixar o PDF e cancelar boletos pelo app (API Cobrança V3 do Inter, "Boleto com Pix").
- Resumo com 4 grupos e lista filtrável; cancelados/expirados/falhas ficam num filtro à parte.
- Pagou → entrada no Fluxo de Caixa + baixa na conta a receber (quando houver), sem duplicar com o extrato do Inter.
- Status do banco chega por **webhook com consulta de segurança** (decisão do usuário): o webhook dá agilidade, a consulta (botão e cron diário) cobre aviso perdido.
- Boleto emitido para uma conta a receber alimenta o e-mail de cobrança já existente (linha digitável, nosso número, PDF, Pix copia-e-cola) via `getBoletoProvider()`.
- Toda entidade com CRUD na interface (regra do usuário): criar = emitir; ler = lista/detalhe/PDF; excluir = cancelar; editar = cancelar e reemitir na v1 (chamada minha, ver "Decisões minhas").

## Não objetivos (v1)

- Conta pessoa física (a API do Inter é só Empresas).
- Emissão em lote, boleto parcelado/recorrente do Inter, protesto, desconto por antecipação (multa e juros sim, reaproveitando `fineRate`/`interestRate` da conta a receber).
- Editar boleto emitido (`PATCH`); marcar como pago manualmente no Inter (`/pagar`).
- Cobrança por WhatsApp além do que já existe.

## Anti-objetivos (falha mesmo que "funcione")

- A mesma entrada aparecer duas vezes no caixa (boleto pago + item do extrato), em qualquer ordem de chegada.
- Emitir ou cancelar boleto sem PIN e sem registrar quem fez.
- Um pago que nunca entra no caixa (aviso perdido, falha no meio da gravação).
- Confiar no corpo do webhook sem conferir com o Inter, ou expor credenciais/segredo em log, resposta ou e-mail.
- Valor lançado no caixa diferente do valor que o banco recebeu.

## Restrições (verificadas na documentação oficial em 2026-11-16)

- Só V3 (`/cobranca/v3`); a API Boleto V2 foi descontinuada em 04/05/2026.
- Escopos novos na integração de API do cliente: `boleto-cobranca.write` e `boleto-cobranca.read` (hoje a conexão pede só `extrato.read`). O token é por escopo; clientes já conectados precisam gerar credencial com os escopos novos.
- **Emissão é assíncrona**: `POST /cobrancas` devolve só `codigoSolicitacao`; linha digitável, código de barras, nosso número e Pix copia-e-cola vêm numa consulta posterior (`GET /cobrancas/{codigoSolicitacao}`). Situação `EM_PROCESSAMENTO` até criar.
- Situações na consulta: `RECEBIDO, A_RECEBER, MARCADO_RECEBIDO, ATRASADO, CANCELADO, EXPIRADO, FALHA_EMISSAO, EM_PROCESSAMENTO, PROTESTO`. No **webhook** só chegam: `RECEBIDO, A_RECEBER, MARCADO_RECEBIDO, CANCELADO, EXPIRADO, FALHA_EMISSAO`. Logo, "vencido" no app é **calculado** pelo vencimento (e confirmado por `ATRASADO` na consulta), não vem do webhook.
- Payload do webhook: `codigoSolicitacao`, `seuNumero` (≤15 caracteres, é o nosso identificador), `situacao`, `dataHoraSituacao`, `valorTotalRecebido` (string decimal), `origemRecebimento` (`BOLETO`|`PIX`), `nossoNumero`, código de barras.
- Webhook: cadastrado por conta no Inter (`PUT /cobrancas/webhook`), exige URL pública HTTPS; não dá para testar de ponta a ponta no localhost.
- Pedido de emissão exige dados completos do pagador (documento, nome, **endereço: CEP, logradouro, número, bairro, cidade, UF**, tipo de pessoa). A conta a receber hoje só guarda nome, documento, e-mail e telefone do cliente: precisa de endereço (ver Decisões).
- Valores monetários da API: tratar formato com cautela (o extrato devolve string decimal; conferir no sandbox).
- Limites de chamadas por minuto da API; sem retry cego em 429.
- Só plano Pro/cortesia; conexão do Inter continua feita só pelo adm supremo; o cliente (dono) usa a funcionalidade, membros só com a permissão equivalente à de Contas a Receber.
- Sandbox do Inter existe (`cdpj-sandbox.partners.uatinter.co`); usar para o primeiro teste antes de emitir boleto real.

## Abordagens consideradas (como o status de pago chega)

1. Só consulta (botão + cron diário): simples e testável no localhost, mas a baixa pode demorar até um dia.
2. **Webhook + consulta de segurança (escolhida pelo usuário):** baixa em segundos, aviso perdido é coberto pela consulta; exige URL pública, então o webhook só se testa pós-deploy.
3. Só webhook: descartada, um aviso perdido deixa pago fora do caixa.

Ordem de construção sugerida: emissão + consulta + painel (testável local) → conciliação com o extrato → webhook.

## Decisões do usuário (como foram tomadas)

- Boleto direto pelo app, nas duas origens (conta a receber e avulso).
- Painel com vencidos, pagos, a receber e aguardando pagamento.
- Pago sempre entra no Fluxo de Caixa.
- Webhook + consulta.

## Decisões minhas (o usuário ainda não viu; marcar na revisão)

1. **Onde mora:** nova aba "Boletos" dentro de Contas a Receber (não uma página nova), com botão "Emitir boleto avulso"; o botão "Emitir boleto" fica também em cada conta a receber.
2. **Significado dos 4 grupos** (a lista do usuário tinha "a receber" e "aguardando pagamento" separados; interpretei assim):
   - *Aguardando pagamento*: emitido, `A_RECEBER`, ainda no prazo (inclui `EM_PROCESSAMENTO`).
   - *Vencidos*: `A_RECEBER`/`ATRASADO` com vencimento passado.
   - *Pagos*: `RECEBIDO` e `MARCADO_RECEBIDO`.
   - *A receber*: total em R$ ainda não pago (aguardando + vencidos), como número de destaque.
   - Cancelados, expirados e falhas de emissão: filtro à parte, fora dos 4 cards.
3. **Editar = cancelar e reemitir** na v1; sem `PATCH`.
4. **Endereço do cliente:** acrescentar campos de endereço ao cliente vinculado (conta a receber e cadastro de pagador do boleto avulso); o app pede o que faltar na hora de emitir e salva para a próxima.
5. **Identificador:** `seuNumero` = id curto (≤15) do documento local, para casar webhook com boleto sem depender do `codigoSolicitacao`.
6. **PIN** para emitir e para cancelar; carimbo de quem/quando como nas outras ações com PIN (ver auditoria-pin).
7. Pago de boleto avulso: lançamento de entrada em categoria padrão "Outros recebimentos" (a pessoa pode reclassificar depois); pago de conta a receber: usa o caminho de baixa automática já existente.
8. Valor lançado no caixa = `valorTotalRecebido` (já com juros/multa), data = dia do pagamento; se diferente do valor da conta a receber, a baixa registra o recebido (parcial se menor).

## Desenho (nível de arquitetura; detalhes ficam com quem constrói)

**Dados.** Coleção `users/{ownerUid}/boletos/{id}`: origem (`receivableId?`), snapshot do pagador, valor, vencimento, multa/juros, `codigoSolicitacao`, `situacao`, linha digitável/código de barras/nosso número/Pix copia-e-cola, valor e origem do recebimento, datas (emissão, pago), `cashflowId?`, vínculo com a transação do extrato (`interTxKey?`), quem emitiu/cancelou. Escrita só pelo servidor (Admin SDK); o cliente lê pelas regras. A conta a receber guarda o `boleto` no formato `BoletoData` existente para o e-mail de cobrança.

**Emitir.** Rota autenticada com PIN e permissão: valida dados do pagador, chama `POST /cobrancas`, grava o doc como `EM_PROCESSAMENTO`, consulta até `CRIADA`/dados completos (poucos segundos, com limite), preenche linha digitável e Pix, e liga ao `BoletoProvider` para a cobrança por e-mail.

**Atualizar status.** Um único núcleo idempotente "aplicar situação" usado pelo webhook, pelo botão e pelo cron. O webhook nunca confia só no corpo: confere o boleto com `GET /cobrancas/{codigoSolicitacao}` antes de aplicar. Token secreto na URL do webhook, por conta, comparado em tempo constante; resposta 200 rápida.

**Pago → caixa.** Em transação/lote atômico e idempotente (chave = `codigoSolicitacao` + situação): marca o boleto, cria a entrada no Fluxo de Caixa pelo mesmo caminho do formulário/baixa automática, dá baixa na conta a receber (`amountReceived`), e cuida do extrato: se o item do Inter já está na fila "A conciliar", vincula; se ainda não chegou, o lançamento fica marcado para o sync do extrato vincular automaticamente ao chegar (casando tipo entrada, valor, janela de dias e origem boleto/Pix). Nunca duas entradas, em nenhuma ordem de chegada.

**Resumo e lista.** Cards dos grupos acima, filtros por situação e período, busca por pagador, ações por linha (PDF, copiar linha digitável / Pix, reenviar por e-mail, cancelar), vencimento em destaque.

**Cancelar.** PIN, `POST /cobrancas/{codigo}/cancelar`, reflete `CANCELADO`; se há conta a receber ligada, ela volta a ficar sem boleto vigente. Cancelar não apaga histórico.

**Conexão.** O painel do adm passa a pedir/validar os escopos novos; o "Testar" confirma também `boleto-cobranca.read`; cliente sem os escopos vê aviso claro, não erro cru.

**Segurança.** Credenciais continuam cifradas (`INTER_ENC_KEY`); nada de segredo em log/e-mail/resposta; rate limit nas rotas; erros do Inter mapeados em português sem vazar corpo. Rules novas só leitura para o dono/membro permitido.

## Decisões complementares (da revisão do documento)

Respondidas pelo que o projeto já faz:
- **Onde ficam credenciais e webhook:** por dono da conta, como no extrato (`integracoesBanco/{ownerUid}`, cifradas). O webhook não tem login: o token secreto da URL é gravado cifrado/derivado por dono e consultado num índice token → `ownerUid`; o cron percorre os donos com Inter conectado. Membros usam a funcionalidade com a mesma permissão de Contas a Receber; dados sempre do ninho do dono (accountScope).
- **Categoria do boleto avulso:** "Outros recebimentos" já existe no app (é a sugestão atual da fila "A conciliar" para entradas); usar a mesma.

Decididas por mim (marcar na revisão):
- **Dedup com o extrato:** o lançamento criado pelo boleto pago é a fonte; o item do extrato só é **vinculado** a ele. Casa por tipo entrada, valor igual a `valorTotalRecebido` (o que o banco de fato recebeu, então juros/multa não atrapalham), janela de dias e origem boleto/Pix. Se houver **mais de um candidato** (vários boletos de mesmo valor/dia), nada é vinculado sozinho: o item fica na fila "A conciliar" para decisão manual. Nunca por palpite.
- **Escopos novos são opcionais:** cliente conectado só com `extrato.read` segue com o extrato normal; a aba Boletos mostra aviso para reconectar com os escopos de cobrança. O "Testar" informa cada escopo separadamente.
- **Valor e unicidade:** valor sugerido do boleto = saldo restante da conta a receber (editável); **um boleto vigente por conta a receber**, para emitir outro é preciso cancelar o atual.
- **Mês "fechado":** não bloqueia (mesma decisão já tomada na fila do Inter); a entrada entra na data real do pagamento.
- **Documento do pagador:** CPF/CNPJ e endereço completos são obrigatórios para emitir; sem fallback, o app bloqueia e pede os dados.
- **Eventos fora de ordem:** `RECEBIDO` e `MARCADO_RECEBIDO` são terminais; `CANCELADO`/`EXPIRADO`/`FALHA_EMISSAO` só se aplicam a boleto ainda não pago; eventos repetidos ou atrasados são ignorados com registro. A situação é sempre confirmada por `GET` antes de aplicar.

## O que fica com quem constrói

Nomes de campos e rotas, formato exato do corpo de emissão e da consulta (validar no sandbox), política de espera/limite no polling da emissão, layout do painel dentro do design system atual, mensagens (pt-BR/en/es como o resto do app), testes (padrão `tests/inter`).

## Riscos e pontos a validar no sandbox

- Formato real de `valorNominal` e `valorTotalRecebido` (número vs string decimal).
- Se `seuNumero` ≤15 caracteres basta para casar o webhook.
- Como o pagamento via boleto aparece no extrato (`tipoTransacao`, descrição, data) para o casamento automático.
- Cadastro do webhook por conta e se o Inter assina/autentica a chamada (senão o token na URL + conferência por `GET` é a defesa).
- Clientes Inter com mais de uma conta corrente (`x-conta-corrente`).
