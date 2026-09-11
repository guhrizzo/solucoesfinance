# Chatbot no lugar do ícone de zap — design

Data: 2026-09-10

## Contexto

A landing pública tem um botão flutuante verde estilo WhatsApp ("zap",
`app/components/WhatsAppFab.tsx`) que, ao clicar, abre um modal com uma
lista de assuntos (`landing.whatsapp.topics`); escolher um assunto abre o
WhatsApp real (`wa.me`) com uma mensagem pronta. Ver [[whatsapp-fab]].

Pedido: transformar isso num chatbot simples, no mesmo lugar/ícone, sem
tirar a opção de cair no WhatsApp quando preciso.

## Decisão

Mantém o ícone, posição e CSS do FAB (`.wa-fab`) intactos. O que abre ao
clicar deixa de ser um menu que redireciona e passa a ser um painel de
chat (`.wa-modal` reaproveitado como shell) com:

1. **Saudação inicial** + os tópicos atuais como chips de resposta rápida.
2. **Resposta pronta por tópico** — clicar num chip mostra na hora o texto
   correspondente (mesmo conteúdo que hoje ia pro WhatsApp, adaptado pra
   1ª pessoa do bot), sem custo e sem chamada de rede.
3. **Campo de texto livre** — pergunta livre chama `POST /api/chat`:
   - sem `ANTHROPIC_API_KEY` no servidor → resposta de fallback fixa;
   - com a chave → chama a API da Anthropic (`claude-sonnet-5`) com um
     system prompt curto sobre o NexusFi e devolve a resposta;
   - erro/rate-limit na chamada → mesmo fallback.
4. **Botão "Falar no WhatsApp"** sempre visível no rodapé do chat — mesma
   mecânica de hoje (`wa.me` com a última pergunta do visitante).

## Componentes

- `app/components/WhatsAppFab.tsx` — mesmo arquivo, conteúdo interno
  trocado: estado de mensagens, chips de tópico, input, chamada à API.
- `app/api/chat/route.ts` (novo) — rota pública `POST`, sem autenticação,
  rate-limit por IP via `lib/rateLimit.ts` (10 msgs / 5 min), `fetch`
  direto pra API da Anthropic (sem SDK novo). Nunca expõe erro técnico
  pro visitante — qualquer falha vira a mensagem de fallback.
- `messages/{pt-BR,en,es}/landing.json` — novas chaves em
  `landing.whatsapp` (saudação, placeholder do input, fallback, label do
  botão de WhatsApp, texto de "digitando..."). `topics` existentes são
  reaproveitados como respostas prontas.

## Fora de escopo

- Histórico persistente de conversa (cada visita começa do zero).
- Painel de administração pra editar as respostas prontas (continuam
  vindo dos arquivos de tradução, como os tópicos já vêm hoje).
- Moderação/guardrails avançados do lado da IA além do system prompt.
