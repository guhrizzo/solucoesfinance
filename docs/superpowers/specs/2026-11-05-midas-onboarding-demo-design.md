# Midas — demonstração conversacional guiada (design)

Data: 2026-11-05 · Status: aguardando aprovação

## Intenção e porquê
Visitante da landing conversa com a **Midas** (mesmo nome do chatbot atual) em tela cheia, no estilo da Eva da Omie. Ela entende o negócio, diagnostica a dor, mostra só módulos reais do NexusFi e leva ao cadastro do teste de 7 dias. O objetivo é converter visitantes em cadastros e gerar leads qualificados.

## Metas
- Conversa fluida de ~9 etapas, com chips de resposta rápida + texto livre, progresso, digitação, cards de módulos.
- Personalização por segmento, dor, ferramenta atual e consequência.
- Lead persistido no Firestore (estrutura pronta para um futuro painel admin).
- Funciona **sem IA configurada** (fluxo estruturado completo); com `ANTHROPIC_API_KEY` ganha interpretação de texto livre e respostas a dúvidas.
- pt-BR, en, es. Mobile completo.

## Não-metas / anti-metas
- Não criar autenticação nova (CTA leva ao `/register` existente, Firebase Auth).
- Não pedir e-mail na conversa (e-mail nasce no cadastro). Nome é opcional.
- Não citar preços, descontos, integrações ou resultados que não existam. Só "teste grátis de 7 dias" (`TRIAL_DAYS`).
- Não mexer nas áreas logadas. Não construir o painel admin de leads agora.
- Anti-meta: soar como vendedora insistente ou chatbot genérico.

## Decisões do usuário
- Nome da assistente: **Midas** (não "Nexus").
- Abordagem **C**: tela dedicada `/[locale]/demo`; o ícone flutuante da landing (`WhatsAppFab`) passa a abrir essa tela em vez do chat curto.

## Abordagens consideradas
A) tela dedicada com FAB intacto; B) FAB vira modal com o fluxo; **C) tela dedicada aberta também pelo FAB (escolhida)**: uma assistente, espaço para cards, reaproveita o backend de chat.

## Arquitetura
- **UI** `app/[locale]/demo/page.tsx` + `app/components/midas/*` (cabeçalho com avatar/progresso, lista de mensagens, chips, input, cards de módulo, CTA). Estilo com tokens existentes (`globals.css`, `ui/`), ícones Lucide, camada `.mkt` do tema claro/escuro. Fonts e `ForceMotion` já existentes; animações leves.
- **Motor do fluxo** `lib/midas/flow.ts` (puro, testável): máquina de estados com `context` {segmento, dor, ferramenta, consequência, interesses, dúvidas, nome}. Etapas: recepção → (nome opcional) → segmento → dor → ferramenta atual (varia por dor) → aprofundamento → diagnóstico → módulos → confirmação → CTA. Nunca repete pergunta já respondida. "Quero conhecer a plataforma primeiro" mostra visão geral e volta à conversa.
- **Interpretação de texto livre** `lib/midas/interpret.ts`: sem IA, dicionário de sinônimos (excel/sheets/planilha → planilha; "não sei quanto ganho" → visibilidade financeira). Com IA, `POST /api/midas/turn` (Claude, saída estruturada JSON `{intent, slots, reply?}`, prompt de sistema com lista fechada de módulos e proibições). Falha/limite → cai no dicionário. Chave só no servidor, rate limit via `lib/rateLimit`.
- **Catálogo de módulos** `lib/midas/modules.ts`: lista fechada derivada dos ids reais de `lib/tour/catalog.ts` (fluxoCaixa, contasPagar, contasReceber, relatorios, estoque, vendas, integracoes, impostos, centroCustos...). Cards: ícone Lucide, nome, descrição, benefício, "ver prévia" usando `TourIllustration`/animações existentes (nada de imagens inventadas). Módulos só com recursos que existem; Pro (ex.: leitor de NF, PDV, RH) apresentados só se marcados como tais, sem prometer.
- **i18n** `messages/{pt-BR,en,es}/midas.json` (registrar em `messages/index.ts`). Textos do fluxo, chips, diagnósticos, cards. Prompt de sistema responde no idioma do visitante.
- **Lead** coleção raiz `demoLeads/{sessionId}`, escrita só pelo Admin SDK (`firestore.rules`: `allow read, write: if false`, igual a `feedback`). Campos: sessionId, locale, name?, segment, mainPain, currentTools[], painPoints[], interestedModules[], transcript[] (role, text truncado, ts), status (`started|in_progress|completed|converted`), startedAt, updatedAt, completedAt?, startedTrial (bool), convertedUid?, consent (aceite do aviso LGPD + versão). Rotas: `POST /api/midas/lead` (upsert idempotente, valida/trunca, rate limit por IP) e `POST /api/midas/convert` (autenticado via `requireScope`; marca `converted` + `convertedUid` ao concluir cadastro com `?lead=<sessionId>`).
- **Conversão**: CTA → `/register?lead=<sessionId>` (+ `plano` se houver). `register/page.tsx` guarda o `lead` e, após criar conta, chama `/api/midas/convert`. Trial segue o fluxo atual.
- **FAB**: `WhatsAppFab` deixa de abrir o chat curto e navega para `/demo`; botão de WhatsApp humano continua dentro da demo. CTAs principais da landing permanecem apontando ao cadastro (não mexer na conversão atual); adiciona-se link secundário "Ver demonstração guiada".
- **LGPD**: aviso curto antes da 1ª mensagem (dados da conversa usados pela NexusFi, link Política de Privacidade), respeita `lib/consent`; sem PII além do nome opcional.

## Estados e erros
Digitando (delay curto proporcional), carregando, erro de rede com retry sem perder o histórico, sessão retomável via `localStorage` (try/catch), botão voltar uma etapa.

## Testes
Unitários do motor e do interpretador (caminhos: cada dor × cada segmento, texto livre equivalente, sem repetição). Teste manual no navegador de ponta a ponta até o `/register` nos 3 idiomas e mobile, com e sem `ANTHROPIC_API_KEY`.

## Decisões minhas (a conferir)
Rota `/demo`; coleção `demoLeads`; CTAs principais da landing intactos; `/api/chat` antigo mantido (sem uso pelo FAB); prévias usam as ilustrações do tour em vez de screenshots reais; sem preços na conversa; nome opcional logo após a recepção.

## Esclarecimentos da revisão (decisões minhas, salvo indicação)
- **Convert no cadastro**: `lead` vem na query e é copiado para `sessionStorage` como reserva; vale para e-mail/senha, Google (popup e pending-link) e login. A chamada a `/api/midas/convert` é fire-and-forget, só depois de existir usuário com token; falha nunca bloqueia o cadastro. Verificar que `requireScope` aceita usuário recém-criado (sem perfil/assinatura).
- **Idioma**: o chat segue o locale da URL (`/demo`, `/en/demo`, `/es/demo`); o interpretador de texto livre usa um dicionário combinado dos 3 idiomas; a IA responde no idioma digitado. `locale` no lead = locale da URL.
- **Catálogo e Pro**: `modules.ts` é a lista fechada da Midas, com flag `pro` própria. Módulos Pro (confirmados via `isProAccess`): cobrança por e-mail em Contas a Receber, leitor de NF em Impostos, RH, PDV e alertas de WhatsApp. Midas pode dizer "recurso do plano Pro" sem citar preço.
- **Prévia**: animação do tour + descrição; módulos Pro sem etapa de tour reutilizam a animação mais próxima (`TourIllustration` pode ganhar `animation` direto, refactor mínimo). Sem screenshots reais.
- **IA**: `/api/midas/turn` é rota nova que reaproveita o padrão de `/api/chat` (modelo, rate limit, fallback), com prompt próprio. Não unifica com `mentor-lead`.
- **Privacidade**: o clique em "Ok, vamos lá" após o aviso é o aceite; a IA só roda depois dele; o aviso informa que o texto é processado por um provedor de IA. Cookie consent continua independente.
- **FAB**: eventos custom que abriam o chat com tópico viram deep-link `/demo?topic=<id>`. Link secundário "Ver demonstração guiada" entra perto do hero, sem trocar os CTAs de cadastro.

## Decididas pelo usuário (2026-11-05)
- **Aviso no WhatsApp**: ao concluir a demonstração (status `completed`), a equipe recebe aviso no WhatsApp via `lib/whatsapp.ts`, no mesmo padrão do `mentor-lead` (destino `MENTOR_LEAD_WHATSAPP`/número comercial; sem Cloud API configurada, o lead fica salvo com `whatsapp: "not_configured"`). Um aviso por sessão.
- **Retenção**: 12 meses. Cada lead recebe `expiresAt = startedAt + 12 meses`; um cron (`app/api/cron/`, padrão dos existentes) apaga os expirados. O aviso de privacidade informa o prazo.

## Fica para quem constrói
Copy final dos 3 idiomas, visual exato do avatar da Midas, limites de rate limit, mapeamento fino dor×módulos.
