# NexusFi (solucoesfinance)

Plataforma web de gestão financeira para pequenas empresas: fluxo de caixa, contas a pagar e a receber, impostos, estoque integrado a marketplaces, vendas/PDV e relatórios. Vende por assinatura (planos Básico e Pro).

Produção: https://nexusfi.com.br

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| Estilo | Tailwind CSS 4, tokens semânticos em `globals.css`, componentes em `app/components/ui/` |
| i18n | next-intl (pt-BR, en, es), rotas em `app/[locale]/`, textos em `messages/<locale>/*.json` |
| Backend | Rotas de API do Next (`app/api/*`) + Firebase Admin SDK |
| Banco / Auth / Storage | Firebase (Firestore, Auth, Storage) |
| Gráficos | ApexCharts |
| PDF | jsPDF + jspdf-autotable |
| E-mail | Resend |
| IA | Claude (Anthropic API): leitor de NF, extratos, relatório de vendas, chatbot "Midas" |
| Desktop | Electron (pasta `desktop/`) |
| Deploy | Vercel |

## Módulos (`app/[locale]/`)

- **dashboard**: visão geral filtrada por mês (refDate), com toggle Mensal/Anual.
- **fluxo-caixa**: entradas e saídas, orçamento, categorias.
- **contasPagar**: contas a pagar, baixa automática pelo fluxo de caixa, módulo de Compras e portal do fornecedor (`fornecedor`).
- **contasReceber**: contas a receber, cobrança por e-mail com Pix copia-e-cola, lembretes automáticos (e-mail e WhatsApp).
- **impostos**: controle de impostos; leitor de NF-e/NFS-e com IA (Pro).
- **estoque**: produtos e integrações com Mercado Livre, Shopee, TikTok Shop e Shein.
- **vendas**: painel de vendas e PDV (`/vendas/pdv`, Pro) com abertura e fechamento de caixa.
- **relatorios**: Fluxo de Caixa, Faturamento, Gastos, DRE e Vendas (CMV, lucro, margem, ROI).
- **costCenter**: centros de custo.
- **configuracoes**: perfil e empresa, aparência, WhatsApp, equipe, feedback (bugs e sugestões) e analytics (admin).
- **assinatura**: checkout, contrato eletrônico e retorno de pagamento.
- **login / register / entrar-dispositivo**: autenticação e login no app desktop.
- Páginas públicas: landing, privacidade e termos, com tema claro e escuro.

## Estrutura

```
app/
  [locale]/        páginas por idioma
  api/             rotas de API (billing, webhooks, cron, estoque, vendas, whatsapp, ...)
  components/ui/   design system (Modal, Pill, Field, Table, KpiTile, ...)
lib/               regras de negócio e integrações (billing*, asaas, pix, shopee, ...)
messages/          traduções (pt-BR, en, es)
docs/              guias de setup e integrações
scripts/           utilitários (grant-temp-access, i18n-check, avisos)
tests/             testes (node --test)
desktop/           app Electron
firestore.rules    regras do Firestore
storage.rules      regras do Storage
```

## Billing

- Checkout via **Asaas** (boleto e cartão recorrentes) quando `ASAAS_API_KEY` existe; caso contrário usa InfinitePay (legado). Código do Mercado Pago está dormente.
- Webhook: `POST /api/webhooks/asaas`. Reconfere a cobrança na API do Asaas e aplica o período em `users/{uid}/profile/billing`, de forma idempotente (`billingEvents/asaas_{id}`).
- O webhook no painel do Asaas precisa estar inscrito em `PAYMENT_CONFIRMED`, **`PAYMENT_RECEIVED`** (boleto e Pix compensam por este), `SUBSCRIPTION_DELETED` e `SUBSCRIPTION_INACTIVATED`. Sem `PAYMENT_RECEIVED`, pagamentos por boleto e Pix não liberam o acesso.
- Trial de 7 dias, paywall no `AppShell`, `lib/billing.ts` (`isProAccess()` é o gate de tier).
- Contas cortesia: allowlist em `lib/compAccounts.ts`.
- Contrato aceito antes do pagamento (`/assinatura/contrato`), PDF enviado por e-mail.

## Rodando localmente

```bash
npm install
npm run dev        # http://localhost:3000
npm run build
npm run lint
npm run i18n:check # confere chaves de tradução entre idiomas
npm test
```

Crie um `.env.local` com as variáveis abaixo (valores nunca vão para o repositório).

### Variáveis de ambiente

- **Firebase (cliente):** `NEXT_PUBLIC_FIREBASE_API_KEY`, `..._AUTH_DOMAIN`, `..._PROJECT_ID`, `..._STORAGE_BUCKET`, `..._MESSAGING_SENDER_ID`, `..._APP_ID`
- **Firebase (admin):** `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`
- **App:** `NEXT_PUBLIC_APP_URL`
- **Billing:** `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `INFINITEPAY_HANDLE`
- **E-mail / IA / WhatsApp:** `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, `API_WHATSAPP`
- **Narração do tour guiado (ElevenLabs, só servidor):** `ELEVENLABS_API_KEY` (sem ela o tour funciona só com texto), `ELEVENLABS_VOICE_ID` (opcional; escolha uma voz com bom pt-BR), `ELEVENLABS_MODEL_ID` (opcional; padrão `eleven_multilingual_v2`, `eleven_flash_v2_5` = menor latência/custo)

## Tour guiado (onboarding interativo)

- Catálogo: `lib/tour/catalog.ts` (estrutura) + `messages/<locale>/tour.json` (textos e narração). Nova funcionalidade = 1 item no catálogo + bloco `steps.<id>` nos 3 idiomas.
- UI: `app/components/tour/` (montado no `AppShell` só nas rotas internas); alvos de destaque via `data-tour-target` (hoje os links do menu, em `Navbar.tsx`).
- Estado por login em `users/{uid}/profile/tour` (`never` / `in_progress` / `completed` / `dismissed`); regras em `lib/tour/state.ts`.
- Áudio: `POST /api/tour/audio` (login obrigatório, texto vem do catálogo, 40 req/10 min por usuário, cache em memória + Storage `tour-audio/`).
- **Marketplaces:** `MERCADOLIVRE_*`, `SHOPEE_*`, `TIKTOKSHOP_*`, `SHEIN_*` (client id/secret, redirect URI, secret do webhook)

## Integrações com marketplaces

Mercado Livre, Shopee e TikTok Shop são sincronizadas pela aba Estoque (OAuth em `/api/auth/<marketplace>/*`, webhooks em `/api/webhooks/*`). As vendas viram entrada no caixa e aparecem em `/vendas`. A Shopee está oculta na interface (flag `SHOPEE_UI_VISIVEL`) e a Shein também (`SHEIN_UI_VISIVEL`), até haver credenciais reais. Detalhes em `docs/`.

## Convenções

- Todo texto de interface vai nos arquivos de `messages/`, nos três idiomas. Rode `npm run i18n:check`.
- Use os tokens de `globals.css` e os componentes de `app/components/ui/`; há lint contra cores em hex.
- Fontes são self-hosted (`next/font/local` em `app/fonts`). `next/font/google` quebra o build na Vercel.
- Ações sensíveis são protegidas por PIN e carimbadas com quem fez e quando (auditoria).
- Regras do Firestore ficam em `firestore.rules`; membros de equipe acessam o "ninho" do dono via `accountScope`.

## Documentação adicional

`docs/asaas-setup.md`, `docs/compras-setup.md`, `docs/compras-spec.md`, `docs/whatsapp-meta-setup.md`, `docs/mercadolivre-integracao.md`, `docs/shopee-integracao.md`, `docs/tiktokshop-integracao.md`, `docs/shein-integracao.md`.
