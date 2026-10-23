// lib/salesReportImport.ts
// ─────────────────────────────────────────────────────────────────────────────
// Normalização do que a IA extrai de um relatório de vendas (PDF/CSV/texto).
// Puro e sem imports — usado pela rota /api/analyze-sales-report (servidor) e
// testado em tests/relatorios. A IA só LÊ o documento: aqui tudo é validado e
// o que não dá pra confiar é descartado (e contado), nunca chutado.
// ─────────────────────────────────────────────────────────────────────────────

/** Linha como a IA devolve (campos opcionais, tipos soltos). */
export interface RawSale {
  date?: unknown;
  sku?: unknown;
  name?: unknown;
  qty?: unknown;
  amount?: unknown;
  unitCost?: unknown;
  fees?: unknown;
  returnedQty?: unknown;
  returnedValue?: unknown;
  channel?: unknown;
  orderId?: unknown;
  status?: unknown;
}

export interface CleanSale {
  date: string;
  sku: string;
  name: string;
  qty: number;
  amount: number;
  unitCost: number | null;
  fees: number | null;
  returnedQty: number | null;
  returnedValue: number | null;
  channel: string;
  orderId: string;
  status: string;
}

/** Teto de linhas por importação (cada importação é um documento do Firestore, ≤ 1 MB). */
export const MAX_IMPORT_ROWS = 1500;

const pad = (n: number) => String(n).padStart(2, "0");

/** "1.234,56" · "R$ 12,50" · "12.5" · 12.5 → número; vazio/inválido → null. */
export function parseMoneyLike(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let s = v.trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-");
  s = s.replace(/[()-]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, "");
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/** YYYY-MM-DD, DD/MM/YYYY, DD/MM/YY, DD-MM-YYYY → ISO; inválida → null. */
export function parseDateLike(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  let y: number, m: number, d: number;
  let mt = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (mt) { y = +mt[1]; m = +mt[2]; d = +mt[3]; }
  else if ((mt = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/))) {
    d = +mt[1]; m = +mt[2]; y = +mt[3];
    if (mt[3].length === 2) y += 2000;
  } else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > last) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Marketplaces conhecidos viram a chave interna; o resto fica como o relatório escreveu. */
export function normalizeChannel(v: unknown): string {
  const raw = typeof v === "string" ? v.trim() : "";
  if (!raw) return "";
  const f = raw.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (f.includes("mercado")) return "mercadolivre";
  if (f.includes("shopee")) return "shopee";
  if (f.includes("tiktok")) return "tiktokshop";
  if (f.includes("shein")) return "shein";
  return raw.slice(0, 40);
}

const text = (v: unknown, max: number) => (typeof v === "string" || typeof v === "number" ? String(v).trim().slice(0, max) : "");
const nonNeg = (v: unknown): number | null => {
  const n = parseMoneyLike(v);
  return n === null ? null : Math.abs(n);
};

/**
 * Valida e normaliza as linhas da IA. Descarta (e conta em `skipped`) as que
 * não têm data válida ou valor positivo. Custo, taxas e devoluções só entram
 * quando o relatório os trouxe (null = não informado, nunca 0).
 */
export function sanitizeSales(raw: unknown): { rows: CleanSale[]; skipped: number } {
  const list = Array.isArray(raw) ? (raw as RawSale[]) : [];
  const rows: CleanSale[] = [];
  let skipped = 0;
  for (const r of list) {
    if (!r || typeof r !== "object") { skipped++; continue; }
    const date = parseDateLike(r.date);
    const amount = parseMoneyLike(r.amount);
    const sku = text(r.sku, 60);
    const name = text(r.name, 120) || sku;
    if (!date || amount === null || amount <= 0 || !name) { skipped++; continue; }
    const qtyRaw = parseMoneyLike(r.qty);
    const cost = nonNeg(r.unitCost);
    rows.push({
      date,
      sku,
      name,
      qty: qtyRaw !== null && qtyRaw > 0 ? Math.round(qtyRaw * 1000) / 1000 : 1,
      amount: Math.round(amount * 100) / 100,
      unitCost: cost,
      fees: nonNeg(r.fees),
      returnedQty: nonNeg(r.returnedQty),
      returnedValue: nonNeg(r.returnedValue),
      channel: normalizeChannel(r.channel),
      orderId: text(r.orderId, 60),
      status: text(r.status, 30).toLowerCase(),
    });
  }
  return { rows, skipped };
}

/** Marca de reimportação: mesmo nome de arquivo e mesmo total (centavos) = provável duplicata. */
export function importFingerprint(label: string, rows: { amount: number }[]): string {
  const total = Math.round(rows.reduce((a, r) => a + r.amount, 0) * 100);
  return `${label.trim().toLowerCase()}|${rows.length}|${total}`;
}
