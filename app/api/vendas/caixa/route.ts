export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import type { Transaction } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { requireScope, isScopeError } from "@/lib/apiScope";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { isProAccess } from "@/lib/billing";
import { resolveScopeSubscription } from "@/lib/scopeSubscription";
import { brl, notifyOwner } from "@/lib/ownerAlerts";
import {
  FORMAS_PAGAMENTO, esperadoNoFechamento, localDateKey, r2, somaTotais, zeroTotais,
  type TotaisPorForma,
} from "@/lib/pdv";

const RATE_LIMIT = { windowMs: 60_000, max: 20 };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Nome de quem está logado (pro carimbo) — do Auth, não do corpo da requisição. */
async function actorName(uid: string, email: string | null): Promise<string> {
  try {
    const auth = await getAdminAuth();
    const u = await auth.getUser(uid);
    return u.displayName || u.email || email || uid;
  } catch {
    return email || uid;
  }
}

/**
 * Abre e fecha o caixa (turno) do PDV — ver lib/pdv.ts.
 *
 *   { action: "abrir", operador, trocoInicial, date }
 *   { action: "fechar", caixaId, conferido: { dinheiro, pix, debito, credito }, observacao }
 *
 * Um caixa aberto por conta: o id dele fica em users/{ownerUid}/profile/pdv.
 * O esperado do fechamento é calculado AQUI a partir do que as vendas
 * acumularam no doc do caixa — o cliente só manda o que foi conferido.
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
      `pdv-caixa:${getClientIp(request)}:${ownerUid}`,
      RATE_LIMIT,
      scope.isSupremeAdmin
    );
    if (limited) {
      return NextResponse.json(
        { error: "Muitas tentativas em pouco tempo. Aguarde um instante." },
        { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
      );
    }

    const body = await request.json().catch(() => ({}));
    const db = await getAdminDb();
    const userRef = db.collection("users").doc(ownerUid);
    const cfgRef = userRef.collection("profile").doc("pdv");
    const nome = await actorName(scope.uid, scope.email);

    if (body.action === "abrir") {
      const operador = String(body.operador ?? "").trim().slice(0, 60) || nome;
      const trocoInicial = r2(Math.max(0, Number(body.trocoInicial) || 0));
      const date = DATE_RE.test(String(body.date)) ? String(body.date) : localDateKey();

      const caixaRef = userRef.collection("caixas").doc();
      const result = await db.runTransaction(async (tx: Transaction) => {
        const cfg = await tx.get(cfgRef);
        const abertoId = cfg.exists ? cfg.data()?.caixaAbertoId : null;
        if (abertoId) {
          const aberto = await tx.get(userRef.collection("caixas").doc(abertoId));
          if (aberto.exists && aberto.data()?.status === "aberto") {
            return { conflict: abertoId as string };
          }
        }
        tx.set(caixaRef, {
          status: "aberto",
          operador,
          trocoInicial,
          totais: zeroTotais(),
          qtdVendas: 0,
          totalVendas: 0,
          openedAt: Date.now(),
          openedBy: scope.uid,
          openedByName: nome,
          date,
        });
        tx.set(cfgRef, { caixaAbertoId: caixaRef.id }, { merge: true });
        return { id: caixaRef.id };
      });

      if ("conflict" in result) {
        return NextResponse.json(
          { error: "Já existe um caixa aberto nesta conta. Feche-o antes de abrir outro.", caixaId: result.conflict },
          { status: 409 }
        );
      }
      return NextResponse.json({ ok: true, caixaId: result.id });
    }

    if (body.action === "fechar") {
      const caixaId = String(body.caixaId ?? "").trim();
      if (!caixaId || caixaId.includes("/")) {
        return NextResponse.json({ error: "Caixa inválido." }, { status: 400 });
      }
      const conferido = zeroTotais();
      for (const f of FORMAS_PAGAMENTO) {
        conferido[f] = r2(Math.max(0, Number(body.conferido?.[f]) || 0));
      }
      const observacao = String(body.observacao ?? "").trim().slice(0, 500);
      const caixaRef = userRef.collection("caixas").doc(caixaId);

      const result = await db.runTransaction(async (tx: Transaction) => {
        const snap = await tx.get(caixaRef);
        if (!snap.exists) return { error: "Caixa não encontrado.", status: 404 };
        const c = snap.data() as { status?: string; trocoInicial: number; totais: TotaisPorForma; operador?: string; qtdVendas?: number; totalVendas?: number };
        if (c.status !== "aberto") return { error: "Este caixa já foi fechado.", status: 409 };
        const cfg = await tx.get(cfgRef);

        const esperado = esperadoNoFechamento(c);
        const diferenca = zeroTotais() as TotaisPorForma;
        for (const f of FORMAS_PAGAMENTO) diferenca[f] = r2(conferido[f] - esperado[f]);

        tx.update(caixaRef, {
          status: "fechado",
          closedAt: Date.now(),
          closedBy: scope.uid,
          closedByName: nome,
          esperado,
          conferido,
          diferenca,
          diferencaTotal: r2(somaTotais(conferido) - somaTotais(esperado)),
          observacao,
        });
        if (cfg.exists && cfg.data()?.caixaAbertoId === caixaId) {
          tx.set(cfgRef, { caixaAbertoId: null }, { merge: true });
        }
        return {
          ok: true,
          resumo: {
            operador: c.operador || nome,
            qtdVendas: c.qtdVendas || 0,
            totalVendas: c.totalVendas || 0,
            totais: { ...zeroTotais(), ...(c.totais || {}) },
            diferencaTotal: r2(somaTotais(conferido) - somaTotais(esperado)),
          },
        };
      });

      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }

      // Aviso por WhatsApp pro dono (se ele ligou) — nunca derruba o fechamento.
      const r = result.resumo;
      const dif = r.diferencaTotal === 0 ? "sem diferença na conferência" : `diferença de ${brl(r.diferencaTotal)} na conferência`;
      await notifyOwner(db, ownerUid, "caixa",
        `caixa fechado por ${r.operador} com ${r.qtdVendas} ${r.qtdVendas === 1 ? "venda" : "vendas"}, total ${brl(r.totalVendas)} ` +
        `(Dinheiro ${brl(r.totais.dinheiro)}, Pix ${brl(r.totais.pix)}, Débito ${brl(r.totais.debito)}, Crédito ${brl(r.totais.credito)}), ${dif}`);

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    console.error("Erro na rota do caixa (PDV):", error);
    return NextResponse.json({ error: "Erro ao atualizar o caixa." }, { status: 500 });
  }
}
