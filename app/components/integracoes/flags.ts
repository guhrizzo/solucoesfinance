// Visibilidade dos canais de marketplace na interface. Compartilhado entre o
// Estoque (abas, vínculo manual, modal de integrações) e a aba Integrações de
// Configurações (componente MarketplaceConnections), pra que os dois lugares
// mostrem sempre os mesmos canais.

// Shopee: sem flag fixa. A visibilidade é POR CONTA (e-mails liberados) — veja
// `useShopeeUi` em lib/shopeeAccess.ts; a integração de backend continua existindo
// (rotas /api/shopee/*, lib/shopee.ts, webhooks, tipos).

// TikTok Shop: visível desde o lançamento (ao contrário da Shopee acima).
export const TIKTOKSHOP_UI_VISIVEL = true;

// Shein: visível desde 2026-10 por decisão do dono, MESMO antes da aprovação do
// app na Shein — até haver SHEIN_APP_ID/APP_SECRET reais a conexão não
// funciona. Volte para `false` (aqui e em vendas/_components/shared.ts) se
// precisar esconder de novo.
export const SHEIN_UI_VISIVEL = true;

export type Plataforma = "mercadolivre" | "shopee" | "tiktokshop" | "shein";
