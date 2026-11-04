"use client";

// app/components/InterConciliar.tsx
// Fila "A conciliar" do Banco Inter dentro do Fluxo de Caixa (plano Pro).
//
// Os itens (users/{ownerUid}/interPendentes) são criados só pelo servidor; aqui
// o cliente só muda status/cashflowId/resolvedAt/resolvedBy (ver firestore.rules).
// Cada ação grava numa ÚNICA transação do Firestore (commit atômico, com
// releitura do item e do lançamento antes de gravar):
//   • criar    → lançamento novo (pelo MESMO caminho do formulário do Fluxo de
//                Caixa: baixa automática, SettlePickModal, carimbo) + item conciliado
//   • vincular → interTxId no lançamento existente + item conciliado
//   • ignorar  → item ignorado
//   • desfazer → item volta a pendente (apaga resolvedAt/resolvedBy)
// Criar e vincular gravam no caixa, então pedem o PIN como o formulário.

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Check, EyeOff, Landmark, Link2, Plus, RefreshCw, Undo2, X } from "lucide-react";
import { Button, Modal, Pill } from "./ui";
import PinModal from "./PinModal";
import { loadPinHash, verifyPin, getPinLockStatus } from "../hooks/usePin";
import { useSubscription } from "../hooks/useSubscription";
import { isProAccess } from "@/lib/billing";
import { authedFetch } from "@/lib/authedFetch";
import { stampUpdate } from "@/lib/audit";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { CASHFLOW_CATEGORIES, categoryLabel } from "@/lib/cashflowCategories";
import { buildCashEntry, canResolve, linkCandidates } from "@/lib/interConciliar";
import type { CashEntryLite } from "@/lib/interMatch";
import type { InterPendente, InterStatus } from "@/lib/interTypes";

type Item = InterPendente & { id: string };

/** Formato do lançamento novo — o mesmo que o formulário do Fluxo de Caixa grava. */
export type InterNewEntry = {
  type: "entrada" | "saida";
  description: string;
  category: string;
  amount: number;
  date: string;
  note: string;
  createdAt: number;
  costCenterId: string;
  costCenterName: string;
  interTxId: string;
};

type Firestore = import("firebase/firestore").Firestore;

type ErrCode = "stale" | "missing" | "linked" | "mismatch" | "closed" | "noAuth" | "duplicate";

class ConcError extends Error {
  constructor(public code: ErrCode) { super(code); }
}

type Plan = { kind: "criar"; category: string } | { kind: "vincular"; cashflowId: string };

const DAY_MS = 24 * 60 * 60 * 1000;
const cents = (v: unknown) => Math.round(Number(v) * 100);
const fallbackCategory = (type: "entrada" | "saida") => (type === "entrada" ? "Outros recebimentos" : "Outros gastos");
const sortItems = (a: Item, b: Item) => a.date.localeCompare(b.date) || (a.createdAt ?? 0) - (b.createdAt ?? 0);

export default function InterConciliar({ ownerUid, authUid, actorName, txs, closedMonths, createEntry }: {
  ownerUid: string;
  authUid: string | null;
  actorName: string;
  txs: CashEntryLite[];
  closedMonths: Set<string>;
  /** Caminho de criação do Fluxo de Caixa (CashFlow.tsx `createInterEntry`). */
  createEntry: (data: InterNewEntry, commit: (db: Firestore, entry: Record<string, unknown>) => Promise<void>) => Promise<void>;
}) {
  const t = useTranslations("fluxoCaixa.inter");
  const tf = useTranslations("fluxoCaixa");
  const tCat = useTranslations("categories");
  const tPin = useTranslations("common.pin");
  const locale = useLocale();
  const sub = useSubscription();
  const isPro = !sub.loading && isProAccess(sub);

  const [status, setStatus] = useState<InterStatus | null>(null);
  const [pendentes, setPendentes] = useState<Item[]>([]);
  const [ignorados, setIgnorados] = useState<Item[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"pendentes" | "ignorados">("pendentes");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "pos" | "neg" | "info"; text: string } | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [pickCat, setPickCat] = useState<Record<string, string>>({});
  const [pin, setPin] = useState<{ run: () => Promise<void> } | null>(null);

  // Status da conexão + fila pendente (alimenta o badge mesmo com o painel fechado).
  // Só igualdade em `status` (sem orderBy no servidor): evita índice composto;
  // a ordenação por data é feita aqui.
  useEffect(() => {
    if (!isPro || !ownerUid) return;
    let cancelled = false;
    const unsubs: (() => void)[] = [];
    (async () => {
      try {
        const [{ getFirebase }, { doc, collection, query, where, onSnapshot }] = await Promise.all([
          import("@/lib/firebase"),
          import("firebase/firestore"),
        ]);
        const { db } = await getFirebase();
        if (cancelled) return;
        unsubs.push(onSnapshot(
          doc(db, "users", ownerUid, "profile", "interStatus"),
          (s) => setStatus(s.exists() ? (s.data() as InterStatus) : { connected: false }),
          () => setStatus({ connected: false })
        ));
        unsubs.push(onSnapshot(
          query(collection(db, "users", ownerUid, "interPendentes"), where("status", "==", "pendente")),
          (s) => {
            setLoadError(false);
            setPendentes(s.docs.map(d => ({ ...(d.data() as InterPendente), id: d.id })).sort(sortItems));
          },
          () => setLoadError(true)
        ));
      } catch {
        setLoadError(true);
      }
    })();
    return () => { cancelled = true; unsubs.forEach(u => u()); };
  }, [isPro, ownerUid]);

  // Ignorados: só enquanto a aba está aberta.
  useEffect(() => {
    if (!isPro || !ownerUid || !open || view !== "ignorados") return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    (async () => {
      try {
        const [{ getFirebase }, { collection, query, where, onSnapshot }] = await Promise.all([
          import("@/lib/firebase"),
          import("firebase/firestore"),
        ]);
        const { db } = await getFirebase();
        if (cancelled) return;
        unsub = onSnapshot(
          query(collection(db, "users", ownerUid, "interPendentes"), where("status", "==", "ignorado")),
          (s) => { setLoadError(false); setIgnorados(s.docs.map(d => ({ ...(d.data() as InterPendente), id: d.id })).sort(sortItems)); },
          () => setLoadError(true)
        );
      } catch {
        setLoadError(true);
      }
    })();
    return () => { cancelled = true; unsub?.(); };
  }, [isPro, ownerUid, open, view]);

  const txById = useMemo(() => new Map(txs.map(e => [e.id, e])), [txs]);
  const linkedTxKeys = useMemo(() => new Set(txs.map(e => e.interTxId).filter(Boolean) as string[]), [txs]);

  /** O que "Confirmar" faria com a sugestão do item — ou o motivo de não poder. */
  function planFor(item: Item): { plan: Plan | null; problem: "missing" | "closed" | "none" | null } {
    const s = item.suggestion;
    if (!s) return { plan: null, problem: "none" };
    if (s.kind === "vincular") {
      const e = txById.get(s.cashflowId);
      if (!e || e.interTxId || e.type !== item.type || cents(e.amount) !== cents(item.amount)) return { plan: null, problem: "missing" };
      if (!canResolve("vincular", item.date, closedMonths) || !canResolve("vincular", e.date, closedMonths)) return { plan: null, problem: "closed" };
      return { plan: { kind: "vincular", cashflowId: s.cashflowId }, problem: null };
    }
    if (!canResolve("criar", item.date, closedMonths)) return { plan: null, problem: "closed" };
    return { plan: { kind: "criar", category: s.category }, problem: null };
  }

  function errText(e: unknown): string {
    if (e instanceof ConcError) return t(`errors.${e.code}`);
    return t("errors.generic", { message: e instanceof Error ? e.message : String(e) });
  }

  /** Executa UM plano (criar/vincular) numa transação. Lança ConcError. */
  async function applyPlan(item: Item, plan: Plan) {
    if (!authUid) throw new ConcError("noAuth");
    const [{ getFirebase }, { doc, collection, getDoc, runTransaction }] = await Promise.all([
      import("@/lib/firebase"),
      import("firebase/firestore"),
    ]);
    const { db } = await getFirebase();
    const itemRef = doc(db, "users", ownerUid, "interPendentes", item.id);
    const resolved = () => ({ status: "conciliado", resolvedAt: Date.now(), resolvedBy: authUid });

    if (plan.kind === "criar") {
      if (!canResolve("criar", item.date, closedMonths)) throw new ConcError("closed");
      if (linkedTxKeys.has(item.txKey)) throw new ConcError("duplicate");
      // Releitura antes da baixa automática: não dá baixa numa conta a receber
      // / a pagar por um item que outra pessoa já resolveu.
      const pre = await getDoc(itemRef);
      if (!pre.exists() || pre.data().status !== "pendente") throw new ConcError("stale");
      const base = buildCashEntry(item, plan.category);
      const data: InterNewEntry = { ...base, category: plan.category, note: "", createdAt: Date.now(), costCenterId: "", costCenterName: "" };
      await createEntry(data, async (cdb, entry) => {
        await runTransaction(cdb, async (tr) => {
          const s = await tr.get(itemRef);
          if (!s.exists() || s.data().status !== "pendente") throw new ConcError("stale");
          const newRef = doc(collection(cdb, "users", ownerUid, "cashflow"));
          tr.set(newRef, entry);
          tr.update(itemRef, { ...resolved(), cashflowId: newRef.id });
        });
      });
      return;
    }

    // vincular
    const known = txById.get(plan.cashflowId);
    if (known && (!canResolve("vincular", item.date, closedMonths) || !canResolve("vincular", known.date, closedMonths))) {
      throw new ConcError("closed");
    }
    const entryRef = doc(db, "users", ownerUid, "cashflow", plan.cashflowId);
    await runTransaction(db, async (tr) => {
      const s = await tr.get(itemRef);
      if (!s.exists() || s.data().status !== "pendente") throw new ConcError("stale");
      const es = await tr.get(entryRef);
      if (!es.exists()) throw new ConcError("missing");
      const d = es.data();
      if (d.interTxId) throw new ConcError("linked");
      if (d.type !== item.type || cents(d.amount) !== cents(item.amount)) throw new ConcError("mismatch");
      if (!canResolve("vincular", String(d.date ?? ""), closedMonths)) throw new ConcError("closed");
      tr.update(entryRef, { interTxId: item.txKey, ...stampUpdate({ uid: authUid, name: actorName }) });
      tr.update(itemRef, { ...resolved(), cashflowId: plan.cashflowId });
    });
  }

  /** Ignorar / desfazer: só mexem na fila (sem PIN), com releitura do status. */
  async function setQueueStatus(item: Item, to: "ignorado" | "pendente") {
    if (!authUid) throw new ConcError("noAuth");
    const [{ getFirebase }, { doc, runTransaction, deleteField }] = await Promise.all([
      import("@/lib/firebase"),
      import("firebase/firestore"),
    ]);
    const { db } = await getFirebase();
    const itemRef = doc(db, "users", ownerUid, "interPendentes", item.id);
    await runTransaction(db, async (tr) => {
      const s = await tr.get(itemRef);
      const atual = s.exists() ? s.data().status : null;
      if (atual !== (to === "ignorado" ? "pendente" : "ignorado")) throw new ConcError("stale");
      tr.update(itemRef, to === "ignorado"
        ? { status: "ignorado", resolvedAt: Date.now(), resolvedBy: authUid }
        : { status: "pendente", resolvedAt: deleteField(), resolvedBy: deleteField() });
    });
  }

  // ── PIN (mesma trava do formulário: PIN do usuário LOGADO) ────────────────
  async function withPin(run: () => Promise<void>) {
    if (!authUid) { setMsg({ tone: "neg", text: t("errors.noAuth") }); return; }
    const hash = await loadPinHash(authUid);
    if (!hash) { setMsg({ tone: "neg", text: tPin("notConfigured") }); return; }
    setMsg(null);
    setPin({ run });
  }

  async function handlePinSuccess(value: string) {
    if (!authUid || !pin) return;
    const result = await verifyPin(authUid, value);
    if (result === "ok") { const run = pin.run; setPin(null); await run(); return; }
    if (result === "wrong" && !getPinLockStatus().locked) {
      (window as unknown as { __pinModalShake?: (m: string) => void }).__pinModalShake?.(tPin("wrong"));
      return;
    }
    setPin(null);
    setMsg({ tone: "neg", text: result === "no_pin" ? tPin("notConfigured") : tPin("lockedRetry") });
  }

  // ── Ações ──────────────────────────────────────────────────────────────────
  function runPlan(item: Item, plan: Plan) {
    withPin(async () => {
      setBusy(item.id);
      try {
        await applyPlan(item, plan);
        setMsg({ tone: "pos", text: t(plan.kind === "criar" ? "done.criar" : "done.vincular") });
        setPickerFor(null);
      } catch (e) {
        setMsg({ tone: "neg", text: errText(e) });
      } finally {
        setBusy(null);
      }
    });
  }

  async function runQueue(item: Item, to: "ignorado" | "pendente") {
    setBusy(item.id);
    try {
      await setQueueStatus(item, to);
      setMsg({ tone: "info", text: t(to === "ignorado" ? "done.ignorar" : "done.desfazer") });
    } catch (e) {
      setMsg({ tone: "neg", text: errText(e) });
    } finally {
      setBusy(null);
    }
  }

  const confirmaveis = pendentes.filter(i => planFor(i).plan);

  function confirmAll() {
    const lote = confirmaveis.map(i => ({ item: i, plan: planFor(i).plan! }));
    if (lote.length === 0) return;
    withPin(async () => {
      setBusy("__batch");
      let ok = 0, fail = 0;
      // Em sequência, como a importação: duas baixas na mesma conta em paralelo
      // leriam o saldo antigo e uma sobrescreveria a outra.
      for (const { item, plan } of lote) {
        try { await applyPlan(item, plan); ok++; } catch { fail++; }
      }
      setBusy(null);
      setMsg({ tone: fail ? "neg" : "pos", text: t("batchDone", { ok, fail }) });
    });
  }

  async function sync() {
    setBusy("__sync");
    setMsg(null);
    try {
      const res = await authedFetch("/api/inter/sincronizar", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; novos?: number; error?: unknown };
      if (!res.ok || !data.ok) {
        setMsg({ tone: "neg", text: typeof data.error === "string" && data.error ? data.error : t("syncErrorGeneric") });
      } else {
        setMsg({ tone: "pos", text: t("syncOk", { count: Number(data.novos) || 0 }) });
      }
    } catch {
      setMsg({ tone: "neg", text: t("networkError") });
    } finally {
      setBusy(null);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!isPro || !(status?.connected || pendentes.length > 0)) return null;

  const fmtDay = (iso: string) => (iso ? formatDate(`${iso}T12:00:00`, locale) : "—");
  const count = pendentes.length;
  const working = busy !== null;
  const lista = view === "pendentes" ? pendentes : ignorados;

  const expiresAt = status?.certExpiresAt;
  const daysLeft = expiresAt ? Math.ceil((expiresAt - Date.now()) / DAY_MS) : null;
  const certExpired = daysLeft !== null && daysLeft <= 0;
  const certExpiring = daysLeft !== null && daysLeft > 0 && daysLeft <= 30;

  return (
    <>
      <button type="button" onClick={() => { setOpen(true); setMsg(null); }}
        aria-label={t("buttonAria", { count })}
        className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer transition-colors"
        style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text)" }}>
        <Landmark size={13} />
        <span>{t("button")}</span>
        {count > 0 && (
          <span className="min-w-5 h-5 px-1.5 rounded-full inline-flex items-center justify-center text-[11px] font-bold"
            style={{ background: "var(--brand)", color: "var(--brand-on)" }}>{count}</span>
        )}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} size="lg" mobileSheet closeDisabled={working}>
        <div className="flex items-start justify-between gap-3 px-5 py-4" style={{ borderBottom: "1px solid var(--cf-border)" }}>
          <div className="min-w-0">
            <p className="font-heading text-base font-bold" style={{ color: "var(--cf-text)" }}>{t("title")}</p>
            <p className="text-xs mt-1" style={{ color: "var(--cf-text-2)" }}>{t("subtitle")}</p>
            <p className="text-[11px] mt-1" style={{ color: "var(--cf-text-3)" }}>
              {status?.lastSyncAt ? t("lastSync", { date: formatDateTime(status.lastSyncAt, locale) }) : t("neverSynced")}
            </p>
          </div>
          <button type="button" onClick={() => !working && setOpen(false)} aria-label={t("close")}
            className="p-1.5 rounded-lg cursor-pointer shrink-0" style={{ background: "var(--cf-input)", color: "var(--cf-text-2)" }}>
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pt-4 pb-6 space-y-3 overflow-y-auto" style={{ maxHeight: "78vh" }}>
          {status?.connected && (certExpired || certExpiring) && (
            <div role="alert" className="flex items-start gap-2 rounded-xl px-4 py-3 text-xs"
              style={{ background: certExpired ? "var(--neg-weak)" : "var(--warn-weak)", color: certExpired ? "var(--neg)" : "var(--warn)" }}>
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{certExpired
                ? t("certExpired", { date: formatDate(expiresAt!, locale) })
                : t("certExpiring", { days: daysLeft!, date: formatDate(expiresAt!, locale) })}</span>
            </div>
          )}
          {status?.lastSyncError && (
            <div role="alert" className="flex items-start gap-2 rounded-xl px-4 py-3 text-xs"
              style={{ background: "var(--neg-weak)", color: "var(--neg)" }}>
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{t("lastSyncError", { message: status.lastSyncError })}</span>
            </div>
          )}
          {msg && (
            <div role="status" className="rounded-xl px-4 py-2.5 text-xs"
              style={{
                background: msg.tone === "pos" ? "var(--pos-weak)" : msg.tone === "neg" ? "var(--neg-weak)" : "var(--brand-weak)",
                color: msg.tone === "pos" ? "var(--pos)" : msg.tone === "neg" ? "var(--neg)" : "var(--brand)",
              }}>
              {msg.text}
            </div>
          )}

          {/* Abas + ações gerais */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1 p-1 rounded-xl" style={{ background: "var(--cf-input)" }} role="tablist">
              {(["pendentes", "ignorados"] as const).map(v => (
                <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => { setView(v); setPickerFor(null); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                  style={view === v ? { background: "var(--surface)", color: "var(--text)" } : { background: "transparent", color: "var(--cf-text-2)" }}>
                  {v === "pendentes" ? t("tabPending", { count }) : t("tabIgnored")}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {view === "pendentes" && confirmaveis.length > 0 && (
                <Button variant="success" size="sm" icon={Check} onClick={confirmAll} loading={busy === "__batch"} disabled={working}>
                  {t("confirmAll", { count: confirmaveis.length })}
                </Button>
              )}
              <Button variant="secondary" size="sm" icon={RefreshCw} onClick={sync} loading={busy === "__sync"} disabled={working}>
                {busy === "__sync" ? t("syncing") : t("sync")}
              </Button>
            </div>
          </div>

          {loadError ? (
            <p className="text-xs rounded-xl px-4 py-3" style={{ background: "var(--neg-weak)", color: "var(--neg)" }}>{t("loadError")}</p>
          ) : lista.length === 0 ? (
            <div className="rounded-xl px-4 py-8 text-center" style={{ border: "1px dashed var(--border-strong)" }}>
              <p className="text-sm font-semibold" style={{ color: "var(--cf-text)" }}>
                {view === "pendentes" ? t("emptyPending") : t("emptyIgnored")}
              </p>
              {view === "pendentes" && <p className="text-xs mt-1" style={{ color: "var(--cf-text-2)" }}>{t("emptyPendingHint")}</p>}
            </div>
          ) : (
            <ul className="space-y-2">
              {lista.map(item => {
                const isIn = item.type === "entrada";
                const { plan, problem } = view === "pendentes" ? planFor(item) : { plan: null, problem: null };
                const itemClosed = !canResolve("criar", item.date, closedMonths);
                const sugg = item.suggestion;
                const suggEntry = sugg?.kind === "vincular" ? txById.get(sugg.cashflowId) : undefined;
                const rowBusy = busy === item.id;
                const cands = pickerFor === item.id ? linkCandidates(item, txs) : [];
                const cat = pickCat[item.id] ?? (sugg?.kind === "criar" ? sugg.category : fallbackCategory(item.type));
                return (
                  <li key={item.id} className="rounded-xl px-4 py-3" style={{ background: "var(--cf-surface)", border: "1px solid var(--cf-border)" }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Pill tone={isIn ? "pos" : "neg"}>
                            {isIn ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                            {isIn ? tf("type.inflow") : tf("type.outflow")}
                          </Pill>
                          <span className="text-xs" style={{ color: "var(--cf-text-2)" }}>{fmtDay(item.date)}</span>
                        </div>
                        <p className="text-sm font-semibold mt-1 break-words" style={{ color: "var(--cf-text)" }}>{item.description}</p>
                        {item.counterparty && <p className="text-xs break-words" style={{ color: "var(--cf-text-2)" }}>{item.counterparty}</p>}
                      </div>
                      <p className="font-mono text-sm font-bold shrink-0" style={{ color: isIn ? "var(--pos)" : "var(--neg)" }}>
                        {isIn ? "+" : "−"}{formatMoney(item.amount, locale)}
                      </p>
                    </div>

                    {view === "pendentes" && (
                      <>
                        <p className="text-xs mt-2" style={{ color: "var(--cf-text-2)" }}>
                          {sugg?.kind === "vincular" && suggEntry
                            ? t("suggestLink", { description: suggEntry.description, date: fmtDay(suggEntry.date) })
                            : sugg?.kind === "criar"
                              ? t("suggestCreate", { category: categoryLabel(sugg.category, tCat) })
                              : null}
                        </p>
                        {problem && (
                          <p className="text-xs mt-1" style={{ color: problem === "closed" ? "var(--warn)" : "var(--neg)" }}>
                            {t(problem === "missing" ? "suggestMissing" : problem === "closed" ? "closedMonth" : "noSuggestion")}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2 mt-2.5">
                          <Button variant="success" size="sm" icon={Check} disabled={!plan || working} loading={rowBusy}
                            title={problem === "closed" ? t("closedMonth") : undefined}
                            onClick={() => plan && runPlan(item, plan)}>{t("confirm")}</Button>
                          <Button variant="secondary" size="sm" icon={Link2} disabled={working}
                            onClick={() => setPickerFor(pickerFor === item.id ? null : item.id)}>{t("linkOther")}</Button>
                          <Button variant="ghost" size="sm" icon={EyeOff} disabled={working}
                            onClick={() => runQueue(item, "ignorado")}>{t("ignore")}</Button>
                        </div>

                        {pickerFor === item.id && (
                          <div className="mt-3 rounded-lg p-3 space-y-2" style={{ background: "var(--cf-input)" }}>
                            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text-2)" }}>{t("pickerTitle")}</p>
                            {cands.length === 0 ? (
                              <p className="text-xs" style={{ color: "var(--cf-text-2)" }}>{t("pickerEmpty")}</p>
                            ) : cands.map(e => {
                              const blocked = itemClosed || !canResolve("vincular", e.date, closedMonths);
                              return (
                                <div key={e.id} className="flex items-center justify-between gap-2">
                                  <span className="text-xs min-w-0 truncate" style={{ color: "var(--cf-text)" }}>
                                    {fmtDay(e.date)} · {e.description}
                                  </span>
                                  <Button variant="secondary" size="sm" disabled={blocked || working}
                                    title={blocked ? t("closedMonth") : undefined}
                                    onClick={() => runPlan(item, { kind: "vincular", cashflowId: e.id })}>{t("pickerLink")}</Button>
                                </div>
                              );
                            })}
                            <div className="pt-2 flex flex-wrap items-center gap-2" style={{ borderTop: "1px solid var(--cf-border)" }}>
                              <label className="text-xs" style={{ color: "var(--cf-text-2)" }} htmlFor={`cat-${item.id}`}>{t("pickerCreate")}</label>
                              <select id={`cat-${item.id}`} value={cat}
                                onChange={(ev) => setPickCat(prev => ({ ...prev, [item.id]: ev.target.value }))}
                                className="rounded-lg px-2 py-1.5 text-xs outline-none cursor-pointer"
                                style={{ background: "var(--surface)", border: "1px solid var(--cf-border)", color: "var(--cf-text)" }}>
                                {CASHFLOW_CATEGORIES[item.type].map(c => <option key={c} value={c}>{categoryLabel(c, tCat)}</option>)}
                              </select>
                              <Button variant="primary" size="sm" icon={Plus} disabled={itemClosed || working}
                                title={itemClosed ? t("closedMonth") : undefined}
                                onClick={() => runPlan(item, { kind: "criar", category: cat })}>{t("pickerCreateBtn")}</Button>
                            </div>
                            {itemClosed && <p className="text-xs" style={{ color: "var(--warn)" }}>{t("closedMonth")}</p>}
                          </div>
                        )}
                      </>
                    )}

                    {view === "ignorados" && (
                      <div className="flex mt-2.5">
                        <Button variant="secondary" size="sm" icon={Undo2} disabled={working} loading={rowBusy}
                          onClick={() => runQueue(item, "pendente")}>{t("undo")}</Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Modal>

      <PinModal open={!!pin} title={t("pin.title")} subtitle={t("pin.subtitle")}
        onClose={() => setPin(null)} onSuccess={handlePinSuccess} />
    </>
  );
}
