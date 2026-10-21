# Módulo de Compras (Contas a Pagar) — especificação

Objetivo: submódulo **Compras** dentro de Contas a Pagar + **portal do fornecedor**, ponta a ponta (nada de protótipo estático).
Primeiro analise o projeto (Next.js app router em `app/[locale]/`, Firebase Auth/Firestore/Storage, `firestore.rules` e `storage.rules` no repo, `lib/accountScope.ts` para membros/dono, `lib/audit.ts`, `lib/whatsapp.ts` + `lib/ownerAlerts.ts` (WhatsApp Meta), e-mail via Resend (`lib/emailTemplates.ts`, `app/api/receivables/charge-email`), `lib/rateLimit.ts`, componentes `app/components/ui`, i18n next-intl pt-BR/en/es em `messages/`, `app/[locale]/contasPagar/page.tsx`, baixa automática em Contas a Pagar). Reaproveite padrões; não duplique nem quebre o que funciona; sem migrações destrutivas; sem hex fixo (usar tokens semânticos de globals.css).

## 1. Subcategoria Compras (dentro do menu Contas a Pagar)
Dashboard resumido; cadastro/gestão de fornecedores; lista de pedidos; pendentes de aprovação; aprovados/recusados/cancelados; histórico; filtros por fornecedor, CNPJ, período, status e valor; busca por nº do pedido ou nome do fornecedor. Visual consistente com os demais módulos.

## 2. Fornecedores
Campos: razão social, nome fantasia, CNPJ (validar formato + dígitos verificadores), IE (opcional), responsável comercial, e-mail comercial, telefone, WhatsApp, endereço completo, CEP, cidade/UF, categoria de produtos/serviços, observações internas, status ativo/inativo. ID único, histórico de pedidos, bloqueio de CNPJ duplicado (por conta), validação cliente+servidor, mensagens claras.

## 3. Portal do fornecedor
Convite por e-mail ou WhatsApp com link seguro, individual, com expiração e uso único (guardar só o hash do token). Após ativar, o fornecedor entra numa área exclusiva (sem acesso a dados financeiros internos nem de outros fornecedores). Pode: ver/atualizar dados comerciais permitidos; criar pedidos; itens (descrição, qtd, unidade, preço unitário); descontos, impostos/custos adicionais; observações; anexos (propostas, orçamentos); ver total; salvar rascunho; enviar para análise; acompanhar status; histórico próprio.
Autenticação segura vinculada ao fornecedor (NÃO usar só CNPJ/telefone/e-mail como credencial): usar o mecanismo já existente (Firebase Auth) com verificação de e-mail e recuperação de acesso; autorização validada no servidor (custom claims ou checagem de vínculo fornecedor↔uid nas rotas /api e nas rules). Cuidado: o fornecedor NÃO pode ganhar acesso ao ninho do dono (accountScope) nem às coleções internas.

## 4. Pedidos de compra
Nº único gerado automaticamente (contador transacional por conta). Campos: nº, fornecedor, CNPJ, data de emissão, validade da proposta, itens (qtd/unidade/preço), descontos, frete/outros custos, total, prazo de entrega, condições de pagamento propostas, observações, anexos, status. **Totais calculados no servidor** (nunca confiar no cliente). Enviar o pedido NÃO cria obrigação financeira.

## 5. Fluxo de status
Rascunho → Enviado pelo fornecedor → Em análise → Aprovado | Recusado | Cancelado → Concluído. Equipe interna revisa itens/valores/condições antes de aprovar/recusar; recusa exige motivo; aprovação registra responsável, data e hora. Pedido aprovado não é alterado silenciosamente: alterações relevantes ficam registradas e exigem nova aprovação. Proteção contra envio duplicado (idempotência).

## 6. Integração com Contas a Pagar
Após aprovado, ação "Gerar lançamento no Contas a Pagar" (etapa separada da aprovação) aproveitando fornecedor, nº do pedido, descrição, valor aprovado, vencimento, condições, categoria, centro de custo (se existir) e anexo. Se houver parcelas, gerar os vencimentos. **Idempotente**: o mesmo pedido nunca gera a mesma obrigação duas vezes (guardar o vínculo no pedido e usar transação/ID determinístico). Respeitar as regras existentes (baixa automática pelo Fluxo de Caixa, nomes, impostos etc.).

## 7. Notificações
E-mail (serviço já integrado — Resend): convite ao portal; aviso à empresa quando o fornecedor envia pedido; aviso ao fornecedor de aprovação/recusa/mudança de status; confirmação de recebimento; link de acompanhamento.
WhatsApp: usar a integração oficial já existente (Meta Cloud API em lib/whatsapp.ts). Nunca simular envio nem marcar como enviado sem confirmação da API. Se não estiver configurado, deixar a arquitetura pronta, informar claramente o que depende de credenciais e oferecer fallback `wa.me` com mensagem pré-preenchida. Registrar canal, destinatário, data, status e erro de cada envio (log).

## 8. UX
Moderna, responsiva (desktop e celular), tabelas organizadas, filtros, formulários em etapas quando fizer sentido, totais automáticos, indicadores de status, confirmação em ações críticas, feedback de loading/sucesso/erro. Portal do fornecedor com interface simplificada e independente do app interno. Textos nos 3 idiomas (pt-BR/en/es).

## 9. Segurança e auditoria
Controle de acesso por papel e por fornecedor validado no servidor; rules do Firestore/Storage atualizadas (e testadas se houver emulador); validação cliente+servidor; auditoria de criação/edição/aprovação/recusa/cancelamento com histórico de alterações; anexos protegidos (Storage com regras por fornecedor/conta); convites com expiração e uso controlado; rate limit; registro de falhas de integração. Fornecedor nunca vê lançamentos internos, dados bancários da empresa, outros fornecedores ou pedidos alheios.

## 10. Entrega
Implementar completo, criar testes dos fluxos principais (permissões, cálculos, duplicidade, idempotência da conversão), rodar tsc/lint/testes/build, corrigir erros, documentar variáveis de ambiente e credenciais em `docs/compras-setup.md` (sem segredos) e listar o que está pronto vs. o que depende de configuração externa.
Critério de conclusão: fornecedor cadastrado recebe convite, acessa o portal com segurança, emite e envia pedido, acompanha e recebe notificações; a empresa revisa, aprova/recusa e gera o lançamento no Contas a Pagar sem duplicidade.
