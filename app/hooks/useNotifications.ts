"use client";

// app/hooks/useNotifications.ts
// Notificações reais do sino da Navbar — ver
// docs/superpowers/specs/2026-09-14-notificacoes-reais-navbar-design.md.
//
// Agrega, ao vivo, vencimentos/atrasos (impostos, contas a pagar, contas a
// receber), transações de valor alto e vendas de marketplace (do Fluxo de
// Caixa) e chamados de suporte respondidos (poll — a coleção `feedback` só é
// legível pelo Admin SDK). Cada item carrega um timestamp ESTÁVEL (`at`,
// nunca `Date.now()` no corpo do hook) usado só pra ordenar e decidir se é
// "novo" desde a última vez que a pessoa abriu o sino (`lastSeenAt`,
// sincronizado em `users/{uid}/profile/notifications`).

import { useEffect, useMemo, useState } from "react";
import { hasPermission, type AccountScope } from "@/lib/accountScope";
import { authedFetch } from "@/lib/authedFetch";

export type NotifKind =
  | "impostoVencimento" | "impostoAtraso"
  | "contaPagarVencimento" | "contaPagarAtraso"
  | "contaReceberVencimento" | "contaReceberAtraso"
  | "transacaoAlta" | "vendaMarketplace" | "feedbackResolvido";

export interface NotifItem {
  id: string;
  kind: NotifKind;
  urgent: boolean;
  /** Parâmetros pra interpolar na mensagem traduzida (ver messages/<locale>/nav.json → notifications.kinds.*). */
  params: Record<string, string | number>;
  /** epoch ms estável — ordena a lista e decide "não lido" (> lastSeenAt). */
  at: number;
  href: string;
}

interface ScopeLike extends Pick<AccountScope, "uid" | "ownerUid" | "isOwner" | "permissions"> {
  loading: boolean;
}

interface DueDoc { name: string; dueDate: string; status: string }

const DAY_MS = 86_400_000;
const HIGH_VALUE_MIN = 1000;
const HIGH_VALUE_WINDOW_MS = 48 * 60 * 60 * 1000;
const MAX_ITEMS = 8;
const FEEDBACK_POLL_MS = 60_000;

function readAlertDays(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = Number(localStorage.getItem(key));
  return raw > 0 ? raw : fallback;
}

function dueDateMs(dateStr: string): number {
  // Meio-dia local evita off-by-one perto da virada de fuso.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? new Date(dateStr + "T12:00:00") : new Date(0);
  return d.getTime();
}

function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? new Date(dateStr + "T00:00:00") : today;
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / DAY_MS);
}

/** Docs pendentes (status != pago/recebido) em até 2 baldes: vencendo em breve e atrasado. */
function bucketize(docs: DueDoc[], paidStatus: string, alertDays: number) {
    const pending = docs.filter(d => d.status !== paidStatus);
    const overdue = pending.filter(d => daysUntil(d.dueDate) < 0);
    const dueSoon = pending.filter(d => { const n = daysUntil(d.dueDate); return n >= 0 && n <= alertDays; });
    return { overdue, dueSoon };
}

function bucketItem(kind: NotifKind, bucket: DueDoc[], href: string, extraParams?: Record<string, string | number>): NotifItem | null {
    if (bucket.length === 0) return null;
    const at = Math.max(...bucket.map(d => dueDateMs(d.dueDate)));
    const params: Record<string, string | number> = { count: bucket.length, ...extraParams };
    if (bucket.length === 1) params.name = bucket[0].name;
    return { id: kind, kind, urgent: kind.toLowerCase().endsWith("atraso"), params, at, href };
}

interface CashflowDoc {
    id: string;
    type: "entrada" | "saida";
    description: string;
    amount: number;
    createdAt: number;
    source?: string;
    saleChannel?: string;
}

interface FeedbackItem { local: string; resolution: string | null; resolvedAt: number | null; userId: string; status: string }

export function useNotifications(scope: ScopeLike) {
    const [taxes, setTaxes] = useState<DueDoc[]>([]);
    const [bills, setBills] = useState<DueDoc[]>([]);
    const [receivables, setReceivables] = useState<DueDoc[]>([]);
    const [cashflowDocs, setCashflowDocs] = useState<CashflowDoc[]>([]);
    const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([]);
    const [lastSeenAt, setLastSeenAt] = useState(0);
    const [ready, setReady] = useState({ taxes: false, bills: false, receivables: false, cashflow: false, seen: false });

    const canImpostos = !scope.loading && hasPermission(scope, "impostos");
    const canContasPagar = !scope.loading && hasPermission(scope, "contasPagar");
    const canContasReceber = !scope.loading && hasPermission(scope, "contasReceber");
    const canFluxoCaixa = !scope.loading && hasPermission(scope, "fluxoCaixa");
    const ownerUid = scope.ownerUid;

    // ── Impostos ──
    useEffect(() => {
        if (!canImpostos || !ownerUid) { setTaxes([]); setReady(r => ({ ...r, taxes: true })); return; }
        let unsub: (() => void) | undefined;
        (async () => {
            const [{ getFirebase }, { collection, onSnapshot }] = await Promise.all([
                import("@/lib/firebase"), import("firebase/firestore"),
            ]);
            const { db } = await getFirebase();
            unsub = onSnapshot(collection(db, "users", ownerUid, "taxes"), snap => {
                setTaxes(snap.docs.map(d => {
                    const v = d.data() as any;
                    return { name: String(v.name ?? ""), dueDate: String(v.dueDate ?? ""), status: String(v.status ?? "") };
                }));
                setReady(r => ({ ...r, taxes: true }));
            }, () => setReady(r => ({ ...r, taxes: true })));
        })();
        return () => unsub?.();
    }, [canImpostos, ownerUid]);

    // ── Contas a pagar ──
    useEffect(() => {
        if (!canContasPagar || !ownerUid) { setBills([]); setReady(r => ({ ...r, bills: true })); return; }
        let unsub: (() => void) | undefined;
        (async () => {
            const [{ getFirebase }, { collection, onSnapshot }] = await Promise.all([
                import("@/lib/firebase"), import("firebase/firestore"),
            ]);
            const { db } = await getFirebase();
            unsub = onSnapshot(collection(db, "users", ownerUid, "bills"), snap => {
                setBills(snap.docs.map(d => {
                    const v = d.data() as any;
                    return { name: String(v.title ?? ""), dueDate: String(v.dueDate ?? ""), status: String(v.status ?? "") };
                }));
                setReady(r => ({ ...r, bills: true }));
            }, () => setReady(r => ({ ...r, bills: true })));
        })();
        return () => unsub?.();
    }, [canContasPagar, ownerUid]);

    // ── Contas a receber ──
    useEffect(() => {
        if (!canContasReceber || !ownerUid) { setReceivables([]); setReady(r => ({ ...r, receivables: true })); return; }
        let unsub: (() => void) | undefined;
        (async () => {
            const [{ getFirebase }, { collection, onSnapshot }] = await Promise.all([
                import("@/lib/firebase"), import("firebase/firestore"),
            ]);
            const { db } = await getFirebase();
            unsub = onSnapshot(collection(db, "users", ownerUid, "receivables"), snap => {
                setReceivables(snap.docs.map(d => {
                    const v = d.data() as any;
                    return { name: String(v.title ?? ""), dueDate: String(v.dueDate ?? ""), status: String(v.status ?? "") };
                }));
                setReady(r => ({ ...r, receivables: true }));
            }, () => setReady(r => ({ ...r, receivables: true })));
        })();
        return () => unsub?.();
    }, [canContasReceber, ownerUid]);

    // ── Fluxo de caixa (últimos 20 — transação alta + venda de marketplace) ──
    useEffect(() => {
        if (!canFluxoCaixa || !ownerUid) { setCashflowDocs([]); setReady(r => ({ ...r, cashflow: true })); return; }
        let unsub: (() => void) | undefined;
        (async () => {
            const [{ getFirebase }, { collection, query, orderBy, limit, onSnapshot }] = await Promise.all([
                import("@/lib/firebase"), import("firebase/firestore"),
            ]);
            const { db } = await getFirebase();
            unsub = onSnapshot(
                query(collection(db, "users", ownerUid, "cashflow"), orderBy("createdAt", "desc"), limit(20)),
                snap => {
                    setCashflowDocs(snap.docs.map(d => {
                        const v = d.data() as any;
                        return {
                            id: d.id,
                            type: v.type === "entrada" ? "entrada" : "saida",
                            description: String(v.description ?? ""),
                            amount: Number(v.amount) || 0,
                            createdAt: Number(v.createdAt) || 0,
                            source: v.source,
                            saleChannel: v.saleChannel,
                        } as CashflowDoc;
                    }));
                    setReady(r => ({ ...r, cashflow: true }));
                },
                () => setReady(r => ({ ...r, cashflow: true }))
            );
        })();
        return () => unsub?.();
    }, [canFluxoCaixa, ownerUid]);

    // ── Chamados de suporte respondidos (poll — feedback não é legível pelo client) ──
    useEffect(() => {
        if (scope.loading || !scope.uid) { setFeedbackItems([]); return; }
        let cancelled = false;
        const load = async () => {
            try {
                const res = await authedFetch("/api/feedback");
                if (!res.ok) return;
                const data = await res.json();
                if (cancelled || !Array.isArray(data.items)) return;
                setFeedbackItems(data.items);
            } catch {
                // silencioso — não deixa o sino quebrar por causa de um poll falho
            }
        };
        load();
        const interval = setInterval(load, FEEDBACK_POLL_MS);
        return () => { cancelled = true; clearInterval(interval); };
    }, [scope.loading, scope.uid]);

    // ── Estado de leitura (sincronizado entre dispositivos do mesmo login) ──
    useEffect(() => {
        if (scope.loading || !scope.uid) { setLastSeenAt(0); setReady(r => ({ ...r, seen: true })); return; }
        let unsub: (() => void) | undefined;
        (async () => {
            const [{ getFirebase }, { doc, onSnapshot }] = await Promise.all([
                import("@/lib/firebase"), import("firebase/firestore"),
            ]);
            const { db } = await getFirebase();
            unsub = onSnapshot(doc(db, "users", scope.uid, "profile", "notifications"), snap => {
                setLastSeenAt(snap.exists() ? Number(snap.data()?.lastSeenAt) || 0 : 0);
                setReady(r => ({ ...r, seen: true }));
            }, () => setReady(r => ({ ...r, seen: true })));
        })();
        return () => unsub?.();
    }, [scope.loading, scope.uid]);

    const items = useMemo((): NotifItem[] => {
        const alertDaysTax = readAlertDays("nexusfi:taxAlertDays", 7);
        const alertDaysBill = readAlertDays("nexusfi:alertDays", 5);
        const alertDaysReceivable = readAlertDays("nexusfi:alertDaysReceivable", 5);

        const taxBuckets = bucketize(taxes, "pago", alertDaysTax);
        const billBuckets = bucketize(bills, "pago", alertDaysBill);
        const receivableBuckets = bucketize(receivables, "recebido", alertDaysReceivable);

        const list: (NotifItem | null)[] = [
            bucketItem("impostoAtraso", taxBuckets.overdue, "/impostos"),
            bucketItem("impostoVencimento", taxBuckets.dueSoon, "/impostos", { days: alertDaysTax }),
            bucketItem("contaPagarAtraso", billBuckets.overdue, "/contasPagar"),
            bucketItem("contaPagarVencimento", billBuckets.dueSoon, "/contasPagar", { days: alertDaysBill }),
            bucketItem("contaReceberAtraso", receivableBuckets.overdue, "/contasReceber"),
            bucketItem("contaReceberVencimento", receivableBuckets.dueSoon, "/contasReceber", { days: alertDaysReceivable }),
        ];

        // Vendas de marketplace: 1 item por canal presente nas últimas 48h.
        const now = Date.now();
        const recentCashflow = cashflowDocs.filter(d => now - d.createdAt <= HIGH_VALUE_WINDOW_MS);
        const salesByChannel = new Map<string, CashflowDoc[]>();
        for (const d of recentCashflow) {
            if (d.source !== "marketplace" || !d.saleChannel) continue;
            const arr = salesByChannel.get(d.saleChannel) ?? [];
            arr.push(d);
            salesByChannel.set(d.saleChannel, arr);
        }
        for (const [channel, docs] of salesByChannel) {
            const total = docs.reduce((s, d) => s + (d.type === "entrada" ? d.amount : 0), 0);
            list.push({
                id: `vendaMarketplace:${channel}`,
                kind: "vendaMarketplace",
                urgent: false,
                params: { count: docs.length, channel, total },
                at: Math.max(...docs.map(d => d.createdAt)),
                href: "/vendas",
            });
        }

        // Transação de valor alto (não-marketplace): 1 item por transação.
        for (const d of recentCashflow) {
            if (d.source === "marketplace" || d.amount < HIGH_VALUE_MIN) continue;
            list.push({
                id: `transacaoAlta:${d.id}`,
                kind: "transacaoAlta",
                urgent: false,
                params: { type: d.type, amount: d.amount, description: d.description },
                at: d.createdAt,
                href: "/fluxo-caixa",
            });
        }

        // Chamados respondidos: só os do próprio login (o adm supremo vê TODOS
        // via GET /api/feedback — filtra aqui pra não virar mural geral).
        for (const f of feedbackItems) {
            if (f.status !== "resolvido" || f.userId !== scope.uid || !f.resolvedAt) continue;
            list.push({
                id: `feedbackResolvido:${f.local}:${f.resolvedAt}`,
                kind: "feedbackResolvido",
                urgent: false,
                params: { local: f.local, resolution: f.resolution ?? "" },
                at: f.resolvedAt,
                href: "/configuracoes",
            });
        }

        return list
            .filter((i): i is NotifItem => i !== null)
            .sort((a, b) => b.at - a.at)
            .slice(0, MAX_ITEMS);
    }, [taxes, bills, receivables, cashflowDocs, feedbackItems, scope.uid]);

    const unreadCount = items.filter(i => i.at > lastSeenAt).length;
    const loading = scope.loading || !ready.taxes || !ready.bills || !ready.receivables || !ready.cashflow || !ready.seen;

    const markAllRead = async () => {
        if (!scope.uid) return;
        const [{ getFirebase }, { doc, setDoc }] = await Promise.all([
            import("@/lib/firebase"), import("firebase/firestore"),
        ]);
        const { db } = await getFirebase();
        await setDoc(doc(db, "users", scope.uid, "profile", "notifications"), { lastSeenAt: Date.now() }, { merge: true });
    };

    return { items, unreadCount, loading, markAllRead };
}
