import { formatMoney } from "@/lib/format";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type Canal = "mercadolivre" | "shopee" | "tiktokshop" | "shein" | "manual";

// ─────────────────────────────────────────────────────────────────────────────
// Shopee OCULTA da interface por enquanto (mesma flag do Estoque). A
// integração de backend continua no ar; aqui só escondemos os elementos
// visíveis do painel de vendas que citam a Shopee. Para voltar a exibir,
// troque para `true`.
export const SHOPEE_UI_VISIVEL = false;

// TikTok Shop: visível desde o lançamento (ao contrário da Shopee acima).
export const TIKTOKSHOP_UI_VISIVEL = true;

// Shein: integração nova, backend pronto mas ainda sem credenciais reais —
// mesma lógica da Shopee acima (ver app/[locale]/estoque/page.tsx).
export const SHEIN_UI_VISIVEL = false;

// Canais de MARKETPLACE exibidos na interface.
export const CANAIS_VISIVEIS: Canal[] = [
  "mercadolivre",
  ...(SHOPEE_UI_VISIVEL ? (["shopee"] as Canal[]) : []),
  ...(TIKTOKSHOP_UI_VISIVEL ? (["tiktokshop"] as Canal[]) : []),
  ...(SHEIN_UI_VISIVEL ? (["shein"] as Canal[]) : []),
];

// Canais mostrados na quebra por canal, no gráfico e no filtro — inclui a
// venda manual (balcão), registrada aqui no painel.
export const CANAIS_QUEBRA: Canal[] = [...CANAIS_VISIVEIS, "manual"];

// Todo canal que conta como venda (independe da visibilidade na UI: uma venda
// real de um canal oculto continua sendo receita).
export const TODOS_CANAIS: Canal[] = ["mercadolivre", "shopee", "tiktokshop", "shein", "manual"];

export interface CashflowTx {
  id: string;
  type: "entrada" | "saida";
  description: string;
  category: string;
  amount: number;
  date: string;            // YYYY-MM-DD
  createdAt: number;
  saleChannel?: Canal;
  saleSku?: string;
  saleQty?: number;
  saleUnitPrice?: number;
  saleAdId?: string;
  orderId?: string;
  source?: string;
  isMarketplaceFee?: boolean;
}

export interface ProdutoEstoque {
  id: string;
  sku: string;
  name: string;
  price: number;
  quantity: number;
  minQuantity: number;
}

export interface Integracao {
  id: string;
  platform: Canal;
  accountName?: string;
}

// Filtros globais da barra (SAP "filter bar"): valem pra página inteira.
export interface VendasFiltros {
  canal: Canal | "todos";
  sku: string; // "" = todos
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const toBRL = (n: number, locale: string) => formatMoney(n, locale);

// Nomes de marca — não traduzir. "manual" tem o rótulo traduzido via
// canalLabel(); o `label` aqui é só um fallback.
export const CANAL_INFO: Record<Canal, { label: string; bg: string; fg: string; solid: string }> = {
  mercadolivre: { label: "Mercado Livre", bg: "var(--brand-ml-bg)", fg: "var(--brand-ml-fg)", solid: "var(--brand-ml-solid)" },
  shopee: { label: "Shopee", bg: "var(--brand-shopee-bg)", fg: "var(--brand-shopee-fg)", solid: "var(--brand-shopee-bg)" },
  tiktokshop: { label: "TikTok Shop", bg: "var(--brand-tiktok-bg)", fg: "var(--brand-tiktok-fg)", solid: "var(--brand-tiktok-solid)" },
  shein: { label: "Shein", bg: "var(--brand-shein-bg)", fg: "var(--brand-shein-fg)", solid: "var(--brand-shein-solid)" },
  manual: { label: "Venda manual", bg: "var(--sunken)", fg: "var(--text-muted)", solid: "var(--text-subtle)" },
};

export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** "YYYY-MM" do mês anterior a `key`. */
export const prevMonthKey = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m - 2, 1));
};

/** Variação percentual (null quando não há base de comparação). */
export const pctChange = (cur: number, prev: number): number | null =>
  prev > 0 ? ((cur - prev) / prev) * 100 : null;

/** Nome do produto a partir da descrição do lançamento ("Venda · Nome"). */
export const nomeDaVenda = (description: string) =>
  description.replace(/^Venda(?: (?:Mercado Livre|Shopee|TikTok Shop|Shein))? · /, "");
