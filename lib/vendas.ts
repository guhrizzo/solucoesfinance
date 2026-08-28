// lib/vendas.ts
// ─────────────────────────────────────────────────────────────────────────────
// Registro de venda de marketplace (Mercado Livre / Shopee) como ENTRADA no
// Fluxo de Caixa.
//
// Toda venda processada pelos webhooks (pedido real ou "Simular Venda") vira um
// lançamento em `users/{ownerUid}/cashflow` com `type: "entrada"` e
// `category: "Vendas"` — é isso que o Dashboard, o Fluxo de Caixa e o Painel de
// Vendas (`/vendas`) leem. Nenhuma coleção nova: a venda é o próprio lançamento
// de caixa, só com metadados extras (`saleChannel`, `saleSku`, `saleQty`,
// `saleUnitPrice`, `saleAdId`, `orderId`, `source: "marketplace"`).
//
// Idempotência: o ML reenvia o mesmo webhook várias vezes. Antes de gravar,
// procura um lançamento com o mesmo `orderId` (quando houver) e, se já existir,
// não duplica.
// ─────────────────────────────────────────────────────────────────────────────

export interface VendaInput {
  channel: "mercadolivre" | "shopee";
  sku: string;
  productName: string;
  adId: string;
  quantity: number;
  /** Preço unitário no canal (R$). O total do lançamento é quantity * unitPrice. */
  unitPrice: number;
  /** Id do pedido no marketplace — usado pra não duplicar em reenvio de webhook. */
  orderId?: string | null;
  /** Momento da venda (ms). Default: agora. Define a `date` (YYYY-MM-DD) do lançamento. */
  occurredAt?: number;
}

const CHANNEL_LABEL: Record<VendaInput["channel"], string> = {
  mercadolivre: "Mercado Livre",
  shopee: "Shopee",
};

function buildCashflowEntry(v: VendaInput) {
  const quantity = Math.max(1, Math.round(v.quantity || 1));
  const unitPrice = Math.max(0, Number(v.unitPrice) || 0);
  const amount = Math.round(unitPrice * quantity * 100) / 100;
  const when = v.occurredAt ? new Date(v.occurredAt) : new Date();
  const date = when.toISOString().split("T")[0];
  const orderId = (v.orderId || "").toString().trim();
  const name = (v.productName || v.sku || "Produto").toString().trim();

  return {
    type: "entrada" as const,
    description: `Venda ${CHANNEL_LABEL[v.channel]} · ${name}`.slice(0, 120),
    category: "Vendas",
    amount,
    date,
    note: orderId ? `Pedido ${orderId}` : "",
    createdAt: Date.now(),
    // ── metadados da venda ──
    source: "marketplace",
    saleChannel: v.channel,
    saleSku: (v.sku || "").toString().trim().toUpperCase(),
    saleQty: quantity,
    saleUnitPrice: unitPrice,
    saleAdId: (v.adId || "").toString(),
    orderId,
  };
}

// ─── Admin SDK (rotas migradas: webhook do Mercado Livre) ────────────────────

/**
 * Grava a venda como entrada no caixa usando o Firestore do Admin SDK
 * (getAdminDb()). Retorna o id do lançamento, ou null se já existia (dedupe por
 * orderId) ou se algo falhou — nunca lança, pra não derrubar o webhook.
 */
export async function registrarVendaAdmin(
  db: any,
  ownerUid: string,
  venda: VendaInput
): Promise<string | null> {
  try {
    const col = db.collection("users").doc(ownerUid).collection("cashflow");
    const entry = buildCashflowEntry(venda);

    if (entry.orderId) {
      const existing = await col
        .where("orderId", "==", entry.orderId)
        .where("saleChannel", "==", venda.channel)
        .limit(1)
        .get();
      if (!existing.empty) return null;
    }

    const ref = await col.add(entry);
    return ref.id;
  } catch (err) {
    console.error("[vendas] falha ao registrar venda (admin) no caixa:", err);
    return null;
  }
}

// ─── SDK cliente modular (webhook da Shopee ainda roda com getFirebase) ──────

/**
 * Mesma coisa, mas com o SDK modular do firebase/firestore (o webhook da Shopee
 * ainda não foi migrado pro Admin SDK). `db` é o Firestore de getFirebase().
 */
export async function registrarVendaClient(
  db: import("firebase/firestore").Firestore,
  ownerUid: string,
  venda: VendaInput
): Promise<string | null> {
  try {
    const { collection, addDoc, query, where, getDocs, limit } = await import("firebase/firestore");
    const col = collection(db, "users", ownerUid, "cashflow");
    const entry = buildCashflowEntry(venda);

    if (entry.orderId) {
      const existing = await getDocs(
        query(
          col,
          where("orderId", "==", entry.orderId),
          where("saleChannel", "==", venda.channel),
          limit(1)
        )
      );
      if (!existing.empty) return null;
    }

    const ref = await addDoc(col, entry);
    return ref.id;
  } catch (err) {
    console.error("[vendas] falha ao registrar venda (client) no caixa:", err);
    return null;
  }
}
