export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Pode disparar chamadas às APIs dos marketplaces ao propagar o estoque.
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { FieldValue, type Transaction } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { requireScope, isScopeError } from "@/lib/apiScope";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { isProAccess } from "@/lib/billing";
import { resolveScopeSubscription } from "@/lib/scopeSubscription";
import { registrarVendaAdmin } from "@/lib/vendas";
import { baixarEstoqueEPropagar } from "@/lib/estoqueSync";
import {
  FORMAS_PAGAMENTO, MAX_PARCELAS, UNIDADES, localDateKey, notaPagamento, r2, r3,
  type FormaPagamento, type PdvItem, type Unidade,
} from "@/lib/pdv";

const RATE_LIMIT = { windowMs: 60_000, max: 60 }; // frente de caixa: vendas seguidas
const MAX_ITENS = 200;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[A-Za-z0-9-]{8,64}$/;

/**
 * Finaliza uma venda do PDV (/vendas/pdv) — ver lib/pdv.ts.
 *
 *   1. Numa transação: confere que o caixa está aberto, numera a venda, grava
 *      users/{ownerUid}/pdvVendas/{vendaId} e soma o total no caixa, na forma
 *      de pagamento usada (é o que o fechamento confere depois).
 *   2. Lança cada item como ENTRADA no Fluxo de Caixa (ou fora dele, se o
 *      usuário desmarcou) via registrarVendaAdmin — dedupe por orderId.
 *   3. Baixa o estoque dos itens que vieram do estoque (com SKU).
 *
 * O vendaId vem do cliente: reenviar a mesma venda devolve a já gravada.
 * Totais e troco são recalculados aqui — o cliente não decide valor.
 */
export async function POST(request: Request) {
  try {
    const scope = await requireScope(request, "vendas");
    if (isScopeError(scope)) {
      return NextResponse.json({ error: scope.error }, { status: scope.status });
    }
    const ownerUid = scope.ownerUid;

    // PDV é recurso do plano Pro (trial não conta — ver isProAccess).
    const proState = await resolveScopeSubscription(await getAdminDb(), scope);
    if (!isProAccess(proState)) {
      return NextResponse.json({ error: "A frente de caixa (PDV) é exclusiva do plano Pro." }, { status: 403 });
    }

    const { limited, retryAfterSec } = checkRateLimit(
      `pdv:${getClientIp(request)}:${ownerUid}`,
      RATE_LIMIT,
      scope.isSupremeAdmin
    );
    if (limited) {
      return NextResponse.json(
        { error: "Muitas vendas em pouco tempo. Aguarde um instante e tente de novo." },
        { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
      );
    }

    const body = await request.json().catch(() => ({}));
    const vendaId = String(body.vendaId ?? "");
    const caixaId = String(body.caixaId ?? "");
    if (!ID_RE.test(vendaId) || !caixaId || caixaId.includes("/")) {
      return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
    }

    // ── Itens (recalculados) ──
    const rawItens: unknown[] = Array.isArray(body.itens) ? body.itens : [];
    if (rawItens.length === 0) {
      return NextResponse.json({ error: "Adicione ao menos um item." }, { status: 400 });
    }
    if (rawItens.length > MAX_ITENS) {
      return NextResponse.json({ error: `Máximo de ${MAX_ITENS} itens por venda.` }, { status: 400 });
    }
    const itens: PdvItem[] = [];
    for (const raw of rawItens) {
      const it = (raw ?? {}) as Record<string, unknown>;
      const sku = String(it.sku ?? "").trim().slice(0, 64);
      const descricao = String(it.descricao ?? "").trim().slice(0, 120);
      const unidade = (UNIDADES as readonly string[]).includes(String(it.unidade)) ? (it.unidade as Unidade) : "UN";
      // Item do estoque baixa unidades inteiras; avulso aceita fração (KG, L…).
      const quantidade = sku ? Math.round(Number(it.quantidade) || 0) : r3(Number(it.quantidade) || 0);
      const precoUnitario = r2(Number(it.precoUnitario) || 0);
      if (!descricao || quantidade <= 0 || precoUnitario < 0) {
        return NextResponse.json({ error: "Há um item com descrição, quantidade ou preço inválido." }, { status: 400 });
      }
      itens.push({ sku, descricao, quantidade, unidade, precoUnitario, subtotal: r2(quantidade * precoUnitario) });
    }
    const total = r2(itens.reduce((s, i) => s + i.subtotal, 0));
    if (total <= 0) {
      return NextResponse.json({ error: "O total da venda precisa ser maior que zero." }, { status: 400 });
    }

    // ── Pagamento ──
    const forma: FormaPagamento = FORMAS_PAGAMENTO.includes(body.forma) ? body.forma : "dinheiro";
    const parcelas = forma === "credito"
      ? Math.min(MAX_PARCELAS, Math.max(1, Math.round(Number(body.parcelas) || 1)))
      : 1;
    let valorRecebido = total;
    let troco = 0;
    if (forma === "dinheiro") {
      valorRecebido = r2(Number(body.valorRecebido) || total);
      if (valorRecebido < total) {
        return NextResponse.json({ error: "O valor recebido é menor que o total da venda." }, { status: 400 });
      }
      troco = r2(valorRecebido - total);
    }

    const lancarNoCaixa = body.lancarNoCaixa !== false;
    const date = DATE_RE.test(String(body.date)) ? String(body.date) : localDateKey();
    const operador = String(body.operador ?? "").trim().slice(0, 60);

    let nome = scope.email || scope.uid;
    try {
      const u = await (await getAdminAuth()).getUser(scope.uid);
      nome = u.displayName || u.email || nome;
    } catch { /* fica o e-mail */ }

    const db = await getAdminDb();
    const userRef = db.collection("users").doc(ownerUid);
    const vendaRef = userRef.collection("pdvVendas").doc(vendaId);
    const caixaRef = userRef.collection("caixas").doc(caixaId);
    const cfgRef = userRef.collection("profile").doc("pdv");

    // 1. Numeração + gravação + soma no caixa, tudo ou nada.
    const tr = await db.runTransaction(async (tx: Transaction) => {
      const [vendaSnap, caixaSnap, cfgSnap] = await Promise.all([tx.get(vendaRef), tx.get(caixaRef), tx.get(cfgRef)]);
      if (vendaSnap.exists) return { duplicated: true, numero: vendaSnap.data()?.numero as number };
      if (!caixaSnap.exists || caixaSnap.data()?.status !== "aberto") {
        return { error: "O caixa está fechado. Abra o caixa para vender." };
      }
      const numero = Math.max(1, Number(cfgSnap.exists ? cfgSnap.data()?.nextNumero : 1) || 1);
      tx.set(vendaRef, {
        caixaId, numero, itens, total, forma, parcelas, valorRecebido, troco,
        lancarNoCaixa, date, createdAt: Date.now(),
        operador: operador || caixaSnap.data()?.operador || nome,
        createdBy: scope.uid, createdByName: nome,
      });
      tx.set(cfgRef, { nextNumero: numero + 1 }, { merge: true });
      tx.update(caixaRef, {
        [`totais.${forma}`]: FieldValue.increment(total),
        qtdVendas: FieldValue.increment(1),
        totalVendas: FieldValue.increment(total),
      });
      return { numero };
    });

    if ("error" in tr) {
      return NextResponse.json({ error: tr.error }, { status: 409 });
    }
    if ("duplicated" in tr) {
      return NextResponse.json({ ok: true, duplicated: true, vendaId, numero: tr.numero, total, troco });
    }

    // 2. Um lançamento por item (o painel de vendas soma por SKU).
    const pdv = {
      saleId: vendaId,
      numero: tr.numero,
      caixaId,
      paymentMethod: forma,
      installments: parcelas,
      paymentLabel: notaPagamento(forma, parcelas),
    };
    // Item de R$ 0 (brinde) não vira lançamento de R$ 0 no caixa, mas baixa o estoque.
    const registrados = await Promise.all(itens.map((it, i) => it.subtotal <= 0 ? Promise.resolve("brinde") :
      registrarVendaAdmin(db, ownerUid, {
        channel: "manual",
        sku: it.sku,
        productName: it.descricao,
        adId: "",
        quantity: it.quantidade,
        unitPrice: it.precoUnitario,
        orderId: `pdv-${vendaId}-${i}`,
        fractionalQty: true,
        date,
        pdv: { ...pdv, unit: it.unidade },
      }, { foraDoCaixa: !lancarNoCaixa })
    ));
    const falhas = registrados.filter((id) => !id).length;
    if (falhas > 0) console.error(`[pdv] ${falhas} item(ns) da venda ${vendaId} não entraram no caixa`);

    // 3. Baixa de estoque (best-effort, só itens com SKU que acabaram de ser lançados).
    const porSku = new Map<string, number>();
    itens.forEach((it, i) => {
      if (it.sku && registrados[i]) porSku.set(it.sku, (porSku.get(it.sku) ?? 0) + it.quantidade);
    });
    for (const [sku, qty] of porSku) {
      try {
        await baixarEstoqueEPropagar(db, ownerUid, sku, qty, { platform: "manual", adId: "" });
      } catch (err) {
        console.error("[pdv] falha ao baixar/propagar estoque:", sku, err);
      }
    }

    return NextResponse.json({ ok: true, vendaId, numero: tr.numero, total, troco });
  } catch (error) {
    console.error("Erro na rota do PDV:", error);
    return NextResponse.json({ error: "Erro ao finalizar a venda." }, { status: 500 });
  }
}
