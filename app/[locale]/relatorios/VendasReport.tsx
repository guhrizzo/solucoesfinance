"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Printer, Download, PackageSearch, Coins, AlertTriangle, ArrowUp, ArrowDown, ArrowUpDown,
  Sparkles, Upload, FileText, Trash2, FolderOpen,
} from "lucide-react";
import { Button, Card, EmptyState, KpiTile, Modal, Pill, Sensitive, AreaLineChart } from "@/app/components/ui";
import { formatMoney } from "@/lib/format";
import { authedFetch } from "@/lib/authedFetch";
import { importFingerprint, MAX_IMPORT_ROWS, parseMoneyLike, type CleanSale } from "@/lib/salesReportImport";
import {
  buildChannels, buildProducts, buildSaleLines, buildSeries, autoGranularity, computeMetrics, isCancelledSale,
  filterLines, parseCostCsv, pctVariation, presetRange, previousPeriod, productsToCsv,
  sortProducts, upsertCost,
  type CostHistory, type Granularity, type ImportedSale, type Metrics, type PeriodPreset, type ProductRow, type SortKey,
} from "@/lib/salesReport";

// Relatório de Vendas (aba de /relatorios). NÃO lê nada do resto do sistema
// (vendas, caixa, contas, estoque): os números vêm só dos relatórios que o
// usuário importa aqui, lidos pela IA (/api/analyze-sales-report) e guardados na
// coleção própria users/{uid}/salesReports, mais a tabela de custos do próprio
// relatório (users/{uid}/profile/relatorioVendasCustos). Fórmulas: lib/salesReport.ts.

const COSTS_DOC = "relatorioVendasCustos";
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const CHANNEL_NAMES: Record<string, string> = {
  mercadolivre: "Mercado Livre", shopee: "Shopee", tiktokshop: "TikTok Shop", shein: "Shein",
};

interface ImportDoc { id: string; label: string; createdAt: number; fingerprint: string; skipped: number; rows: CleanSale[] }
type ImportStep = "input" | "loading" | "preview" | "saving";

/** Barra horizontal simples para os rankings. */
function RankList({ rows, tone }: { rows: { key: string; label: string; value: number; display: React.ReactNode }[]; tone: "brand" | "pos" | "neg" }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 0) || 1;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate font-medium" style={{ color: "var(--text)" }} title={r.label}>{r.label}</span>
            <span className="mono shrink-0" style={{ color: r.value < 0 ? "var(--neg)" : "var(--text-muted)" }}>{r.display}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full" style={{ background: "var(--sunken)" }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(3, (Math.abs(r.value) / max) * 100)}%`,
                background: r.value < 0 ? "var(--neg)" : tone === "pos" ? "var(--pos)" : "var(--brand)",
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function VendasReport({ ownerUid, hideValues }: { ownerUid: string; hideValues: boolean }) {
  const t = useTranslations("relatorios.vendasReport");
  const locale = useLocale();

  const money = (n: number) => <Sensitive hidden={hideValues}>{formatMoney(n, locale)}</Sensitive>;
  const moneyText = (n: number) => formatMoney(n, locale);
  const pct = (n: number | null, digits = 1) =>
    n === null ? null : `${new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n)}%`;
  const int = (n: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(n);
  const na = <span title={t("naFull")}>{t("na")}</span>;

  // ── Dados: só os relatórios importados + tabela de custos do relatório ─────
  const [imports, setImports] = useState<ImportDoc[]>([]);
  const [costs, setCosts] = useState<CostHistory>({});
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!ownerUid) return;
    const unsubs: (() => void)[] = [];
    let cancelled = false;
    (async () => {
      try {
        const { getFirebase } = await import("@/lib/firebase");
        const { db } = await getFirebase();
        const { collection, doc, onSnapshot } = await import("firebase/firestore");
        if (cancelled) return;
        unsubs.push(onSnapshot(collection(db, "users", ownerUid, "salesReports"),
          (s) => setImports(
            s.docs
              .map((d) => ({ id: d.id, ...d.data() } as ImportDoc))
              .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
          ),
          () => setLoadError(true)));
        unsubs.push(onSnapshot(doc(db, "users", ownerUid, "profile", COSTS_DOC),
          (s) => {
            const raw = (s.data()?.costs || {}) as Record<string, { from?: string; unitCost?: number }[]>;
            const out: CostHistory = {};
            for (const [k, v] of Object.entries(raw)) {
              if (!k.startsWith("s_") || !Array.isArray(v)) continue;
              out[k.slice(2)] = v
                .filter((e) => typeof e?.unitCost === "number" && e.unitCost >= 0)
                .map((e) => ({ from: e.from || "", unitCost: e.unitCost as number }));
            }
            setCosts(out);
            setReady(true);
          },
          () => { setLoadError(true); setReady(true); }));
      } catch {
        if (!cancelled) { setLoadError(true); setReady(true); }
      }
    })();
    return () => { cancelled = true; unsubs.forEach((u) => u()); };
  }, [ownerUid]);

  const importedRows = useMemo<ImportedSale[]>(
    () => imports.flatMap((im) => (im.rows || []).map((r, i) => ({ ...r, id: `${im.id}_${i}` }))),
    [imports],
  );
  const allLines = useMemo(() => buildSaleLines(importedRows, costs), [importedRows, costs]);
  const hasData = imports.length > 0;

  // ── Filtros ────────────────────────────────────────────────────────────────
  const today = useMemo(todayIso, []);
  const bounds = useMemo(() => {
    if (allLines.length === 0) return { from: today, to: today };
    let from = allLines[0].date, to = allLines[0].date;
    for (const l of allLines) { if (l.date < from) from = l.date; if (l.date > to) to = l.date; }
    return { from, to };
  }, [allLines, today]);
  const [rangeState, setRange] = useState(() => presetRange("mes", todayIso()));
  const [preset, setPreset] = useState<PeriodPreset | "custom" | "tudo">("tudo");
  const range = preset === "tudo" ? bounds : rangeState;
  const [sku, setSku] = useState("");
  const [channel, setChannel] = useState("");
  const [compare, setCompare] = useState<"prev" | "custom" | "off">("prev");
  const [cmpRange, setCmpRange] = useState(() => previousPeriod(presetRange("mes", todayIso()).from, presetRange("mes", todayIso()).to));
  const [granOverride, setGranOverride] = useState<Granularity | "">("");

  const applyPreset = (p: PeriodPreset) => { setPreset(p); setRange(presetRange(p, today)); };
  const validRange = range.from && range.to && range.from <= range.to;
  const gran = granOverride || autoGranularity(range.from, range.to);

  const lines = useMemo(() => (validRange ? filterLines(allLines, { ...range, sku, channel }) : []), [allLines, range, sku, channel, validRange]);
  const m = useMemo(() => computeMetrics(lines), [lines]);

  const prevRange = compare === "custom" ? cmpRange : previousPeriod(range.from, range.to);
  const prevM: Metrics | null = useMemo(() => {
    if (compare === "off" || !validRange || !prevRange.from || prevRange.from > prevRange.to) return null;
    return computeMetrics(filterLines(allLines, { ...prevRange, sku, channel }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLines, compare, prevRange.from, prevRange.to, sku, channel, validRange]);

  const products = useMemo(() => buildProducts(lines), [lines]);
  const series = useMemo(() => buildSeries(lines, gran), [lines, gran]);
  const channels = useMemo(() => buildChannels(lines), [lines]);

  const skuOptions = useMemo(() => {
    const map = new Map<string, string>();
    allLines.forEach((l) => l.sku && !map.has(l.sku) && map.set(l.sku, l.name));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [allLines]);

  const channelOptions = useMemo(() => [...new Set(allLines.map((l) => l.channel))].sort(), [allLines]);
  const channelName = (c: string) => CHANNEL_NAMES[c] || (c === "n/d" ? t("channelUnknown") : c);

  // ── Cards ──────────────────────────────────────────────────────────────────
  const delta = (cur: number | null, prev: number | null | undefined, goodWhenUp = true) => {
    if (compare === "off") return { text: undefined, tone: "neutral" as const };
    const v = prev === undefined ? null : pctVariation(cur, prev);
    if (v === null) return { text: t("noBase"), tone: "neutral" as const };
    const arrow = v > 0 ? "▲" : v < 0 ? "▼" : "•";
    const tone = v === 0 ? "neutral" : goodWhenUp === (v > 0) ? "pos" : "neg";
    return { text: `${arrow} ${pct(Math.abs(v))} ${t("vsPrev")}`, tone: tone as "pos" | "neg" | "neutral" };
  };
  const salesVar = prevM ? pctVariation(m.totalVendas, prevM.totalVendas) : null;
  const tone = (n: number | null): "pos" | "neg" | "neutral" => (n === null || n === 0 ? "neutral" : n > 0 ? "pos" : "neg");

  const cards: { key: string; label: string; value: React.ReactNode; d?: ReturnType<typeof delta>; valueTone?: "pos" | "neg" | "neutral"; hint?: string }[] = [
    { key: "total", label: t("cardTotalSales"), value: money(m.totalVendas), d: delta(m.totalVendas, prevM?.totalVendas) },
    { key: "count", label: t("cardSalesCount"), value: int(m.qtdVendas), d: delta(m.qtdVendas, prevM?.qtdVendas) },
    { key: "units", label: t("cardUnits"), value: int(m.unidades), d: delta(m.unidades, prevM?.unidades) },
    { key: "ticket", label: t("cardAvgTicket"), value: m.ticketMedio === null ? na : money(m.ticketMedio), d: delta(m.ticketMedio, prevM?.ticketMedio) },
    { key: "cmv", label: t("cardCmv"), value: m.cmv === null ? na : money(m.cmv), d: delta(m.cmv, prevM?.cmv, false), hint: t("hintCmv") },
    { key: "profit", label: t("cardGrossProfit"), value: m.lucroBruto === null ? na : money(m.lucroBruto), valueTone: tone(m.lucroBruto), d: delta(m.lucroBruto, prevM?.lucroBruto), hint: t("hintProfit") },
    { key: "margin", label: t("cardGrossMargin"), value: m.margemBruta === null ? na : pct(m.margemBruta), valueTone: tone(m.margemBruta), d: delta(m.margemBruta, prevM?.margemBruta), hint: t("hintMargin") },
    { key: "roi", label: t("cardRoi"), value: m.roiCmv === null ? na : pct(m.roiCmv), valueTone: tone(m.roiCmv), d: delta(m.roiCmv, prevM?.roiCmv), hint: t("hintRoi") },
    { key: "markup", label: t("cardMarkup"), value: m.markupMedio === null ? na : pct(m.markupMedio), valueTone: tone(m.markupMedio), d: delta(m.markupMedio, prevM?.markupMedio), hint: t("hintMarkup") },
    {
      key: "var", label: t("cardSalesVariation"),
      value: salesVar === null ? na : `${salesVar > 0 ? "+" : ""}${pct(salesVar)}`,
      valueTone: tone(salesVar),
      d: { text: compare === "off" ? undefined : salesVar === null ? t("noBase") : `${moneyText(prevM?.totalVendas ?? 0)} ${t("inPrevPeriod")}`, tone: "neutral" },
    },
  ];

  // ── Gráficos ───────────────────────────────────────────────────────────────
  const fmtKey = (k: string) => {
    if (gran === "mes") { const [y, mo] = k.split("-"); return `${mo}/${y.slice(2)}`; }
    const [, mo, d] = k.split("-");
    return gran === "semana" ? `${d}/${mo}` : `${d}/${mo}`;
  };
  const axisMoney = (v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v)));
  const chartFrom = (pick: (p: (typeof series)[number]) => number | null) => {
    const pts = series.filter((p) => pick(p) !== null);
    return { categories: pts.map((p) => fmtKey(p.key)), data: pts.map((p) => pick(p) as number) };
  };
  const cRevenue = chartFrom((p) => p.receita);
  const cProfit = chartFrom((p) => p.lucro);
  const cRoi = chartFrom((p) => (p.roi === null ? null : Math.round(p.roi * 10) / 10));

  // ── Tabela ─────────────────────────────────────────────────────────────────
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "receitaLiquida", dir: "desc" });
  const sorted = useMemo(() => sortProducts(products, sort.key, sort.dir), [products, sort]);
  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: key === "name" ? "asc" : "desc" }));

  const top = (rows: ProductRow[], pick: (r: ProductRow) => number | null, dir: "asc" | "desc", n = 5) =>
    rows.filter((r) => pick(r) !== null).sort((a, b) => ((pick(a) as number) - (pick(b) as number)) * (dir === "asc" ? 1 : -1)).slice(0, n);
  const label = (r: ProductRow) => (r.name && r.name !== r.sku ? `${r.name} · ${r.sku}` : r.sku);

  // ── Exportação ─────────────────────────────────────────────────────────────
  const exportCsv = () => {
    const csv = productsToCsv(sorted, [
      "SKU", t("colProduct"), t("colQty"), t("colNet"), t("colUnitCost"), t("colCmv"), t("colProfit"), `${t("colMargin")}`, `${t("colRoi")}`, t("colShare"),
    ]);
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-vendas_${range.from}_${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Custos (única escrita: a tabela do próprio relatório) ──────────────────
  const [costsOpen, setCostsOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, { cost: string; from: string }>>({});
  const [importText, setImportText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const costRows = useMemo(() => {
    const names = new Map<string, string>();
    allLines.forEach((l) => l.sku && names.set(l.sku, l.name));
    const missing = new Set(m.semCusto.skus);
    return [...names.entries()]
      .map(([k, name]) => ({ sku: k, name, hist: costs[k] || [], missing: missing.has(k) }))
      .sort((a, b) => Number(b.missing) - Number(a.missing) || a.name.localeCompare(b.name));
  }, [allLines, costs, m.semCusto.skus]);

  const parsedImport = useMemo(() => parseCostCsv(importText), [importText]);

  const saveCosts = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      let next = costs;
      const t0 = todayIso();
      // Venda mais antiga de cada SKU: custo sem data só vira "a partir de hoje"
      // se o histórico já cobre essas vendas; senão vale desde o início (do
      // contrário as vendas já importadas continuam "sem custo").
      const firstSale: Record<string, string> = {};
      allLines.forEach((l) => { if (l.sku && (!firstSale[l.sku] || l.date < firstSale[l.sku])) firstSale[l.sku] = l.date; });
      const defaultFrom = (k: string) => {
        const covered = (next[k] || []).some((e) => e.from === "" || e.from <= (firstSale[k] ?? t0));
        return covered ? t0 : "";
      };
      for (const [k, d] of Object.entries(drafts)) {
        const c = parseMoneyLike(d.cost);
        if (c === null || c < 0) continue;
        next = upsertCost(next, k, { from: d.from || defaultFrom(k), unitCost: c });
      }
      for (const e of parsedImport.entries) {
        next = upsertCost(next, e.sku, { from: e.from || defaultFrom(e.sku), unitCost: e.unitCost });
      }
      const payload: Record<string, { from: string; unitCost: number }[]> = {};
      for (const [k, v] of Object.entries(next)) payload[`s_${k}`] = v;
      const { getFirebase } = await import("@/lib/firebase");
      const { db } = await getFirebase();
      const { doc, setDoc } = await import("firebase/firestore");
      await setDoc(doc(db, "users", ownerUid, "profile", COSTS_DOC), { costs: payload, updatedAt: Date.now() });
      setDrafts({});
      setImportText("");
      setSaveMsg({ ok: true, text: t("saved") });
    } catch {
      setSaveMsg({ ok: false, text: t("saveError") });
    } finally {
      setSaving(false);
    }
  };

  // ── Importação por IA (lê o relatório; grava só na coleção do relatório) ───
  const [importOpen, setImportOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [step, setStep] = useState<ImportStep>("input");
  const [rawText, setRawText] = useState("");
  const [pdf, setPdf] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [importLabel, setImportLabel] = useState("");
  const [preview, setPreview] = useState<CleanSale[]>([]);
  const [skippedRows, setSkippedRows] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importErr, setImportErr] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const openImport = () => {
    setStep("input"); setRawText(""); setPdf(null); setFileName(""); setImportLabel("");
    setPreview([]); setSkippedRows(0); setSelected(new Set()); setImportErr("");
    setImportOpen(true);
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setImportErr("");
    setFileName(f.name);
    if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
      if (f.size > 5 * 1024 * 1024) { setImportErr(t("pdfTooBig")); return; }
      setPdf(f); setRawText("");
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => { setRawText(String(ev.target?.result ?? "")); setPdf(null); };
      reader.readAsText(f, "UTF-8");
    }
  };

  const analyze = async () => {
    if (!rawText.trim() && !pdf) return;
    setStep("loading"); setImportErr("");
    try {
      let body: { text?: string; storagePath?: string } = { text: rawText };
      if (pdf) {
        const [{ getFirebase }, { ref, uploadBytes }] = await Promise.all([import("@/lib/firebase"), import("firebase/storage")]);
        const { auth, storage } = await getFirebase();
        const authUid = auth.currentUser?.uid;
        if (!authUid) throw new Error(t("importApiError"));
        const storagePath = `users/${authUid}/extract-tmp/${Date.now()}-${pdf.name}`;
        await uploadBytes(ref(storage, storagePath), pdf);
        body = { storagePath };
      }
      const res = await authedFetch("/api/analyze-sales-report", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error ?? t("importApiError"));
      const rows = (data.rows || []) as CleanSale[];
      if (rows.length === 0) { setImportErr(t("noneFound")); setStep("input"); return; }
      setPreview(rows);
      setSkippedRows(Number(data.skipped) || 0);
      setSelected(new Set(rows.map((_, i) => i)));
      setImportLabel((l) => l || fileName || t("pastedLabel", { date: new Date().toLocaleDateString(locale) }));
      setStep("preview");
    } catch (e) {
      setImportErr(t("importParseError", { message: e instanceof Error ? e.message : "" }));
      setStep("input");
    }
  };

  const previewStats = useMemo(() => {
    const chosen = preview.filter((_, i) => selected.has(i));
    const valid = chosen.filter((r) => !isCancelledSale(r));
    return {
      count: chosen.length,
      cancelled: chosen.length - valid.length,
      total: valid.reduce((a, r) => a + r.amount, 0),
      withCost: valid.filter((r) => r.unitCost !== null).length,
      valid: valid.length,
    };
  }, [preview, selected]);

  const saveImport = async () => {
    const chosen = preview.filter((_, i) => selected.has(i));
    if (chosen.length === 0) return;
    if (chosen.length > MAX_IMPORT_ROWS) { setImportErr(t("tooManyRows", { max: MAX_IMPORT_ROWS })); return; }
    const name = importLabel.trim() || fileName || t("importDefaultLabel");
    const fingerprint = importFingerprint(name, chosen);
    if (imports.some((im) => im.fingerprint === fingerprint)) { setImportErr(t("importDuplicate")); return; }
    setStep("saving"); setImportErr("");
    try {
      const { getFirebase } = await import("@/lib/firebase");
      const { db } = await getFirebase();
      const { addDoc, collection } = await import("firebase/firestore");
      await addDoc(collection(db, "users", ownerUid, "salesReports"), {
        label: name, createdAt: Date.now(), fingerprint, skipped: skippedRows, rows: chosen,
      });
      setImportOpen(false);
      setPreset("tudo");
    } catch {
      setImportErr(t("importSaveError"));
      setStep("preview");
    }
  };

  const deleteImport = async (id: string) => {
    setDeleting(id);
    try {
      const { getFirebase } = await import("@/lib/firebase");
      const { db } = await getFirebase();
      const { deleteDoc, doc } = await import("firebase/firestore");
      await deleteDoc(doc(db, "users", ownerUid, "salesReports", id));
    } catch {
      setLoadError(true);
    } finally {
      setDeleting(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text)", borderRadius: 8,
  };
  const presetBtn = (p: PeriodPreset, text: string) => (
    <button
      key={p}
      onClick={() => applyPreset(p)}
      className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
      style={preset === p ? { background: "var(--brand-weak)", color: "var(--brand)" } : { background: "var(--sunken)", color: "var(--text-muted)" }}
    >
      {text}
    </button>
  );

  const th = (key: SortKey, text: string, right = true) => {
    const active = sort.key === key;
    const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <th className={`px-3 py-2 font-semibold ${right ? "text-right" : "text-left"}`} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
        <button onClick={() => toggleSort(key)} className="inline-flex items-center gap-1 cursor-pointer" style={{ color: active ? "var(--brand)" : "inherit" }}>
          {text}<Icon size={12} />
        </button>
      </th>
    );
  };

  if (!ready) {
    return <p className="text-sm" style={{ color: "var(--text-muted)" }}>{t("loading")}</p>;
  }

  const importModals = (
    <>
      <Modal open={importOpen} onClose={() => step !== "saving" && setImportOpen(false)} title={t("importTitle")} size="lg" closeDisabled={step === "saving" || step === "loading"}>
        <div className="space-y-4 text-xs" style={{ color: "var(--text)" }}>
          {importErr && (
            <div className="rounded-lg px-3 py-2" style={{ background: "var(--neg-weak)", color: "var(--neg)" }}>⚠ {importErr}</div>
          )}
          {(step === "input" || step === "loading") && (
            <>
              <p style={{ color: "var(--text-muted)" }}>{t("importIntro")}</p>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={step === "loading"}
                className="w-full border-2 border-dashed rounded-xl p-5 flex flex-col items-center gap-2 cursor-pointer"
                style={{ borderColor: pdf ? "var(--brand)" : "var(--border-strong)" }}
              >
                {pdf ? <FileText size={20} style={{ color: "var(--brand)" }} /> : <Upload size={20} style={{ color: "var(--text-muted)" }} />}
                <span className="text-sm font-semibold">{pdf ? pdf.name : fileName && rawText ? fileName : t("upload")}</span>
                <span style={{ color: "var(--text-muted)" }}>{t("uploadHint")}</span>
                <input ref={fileRef} type="file" accept=".txt,.csv,.pdf" className="hidden" onChange={onFile} />
              </button>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                <span style={{ color: "var(--text-muted)" }}>{t("orPaste")}</span>
                <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
              </div>
              <textarea
                value={rawText}
                onChange={(e) => { setRawText(e.target.value); if (e.target.value) { setPdf(null); setFileName(""); } }}
                rows={7}
                disabled={step === "loading"}
                placeholder={"15/10/2026  Camiseta Preta M   2   R$ 119,80\n16/10/2026  Boné Aba Reta      1   R$ 49,90"}
                className="w-full px-3 py-2 mono"
                style={inputStyle}
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setImportOpen(false)} disabled={step === "loading"}>{t("close")}</Button>
                <Button size="sm" icon={Sparkles} loading={step === "loading"} disabled={!rawText.trim() && !pdf} onClick={analyze}>
                  {step === "loading" ? t("analyzing") : t("analyze")}
                </Button>
              </div>
            </>
          )}
          {(step === "preview" || step === "saving") && (
            <>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <span><strong>{previewStats.count}</strong> {t("pvLines")}</span>
                <span>{t("pvTotal")} <strong className="mono">{moneyText(previewStats.total)}</strong></span>
                <span>{t("pvWithCost", { n: previewStats.withCost, total: previewStats.valid })}</span>
                {previewStats.cancelled > 0 && <span style={{ color: "var(--warn)" }}>{t("pvCancelled", { n: previewStats.cancelled })}</span>}
                {skippedRows > 0 && <span style={{ color: "var(--warn)" }}>{t("pvSkipped", { n: skippedRows })}</span>}
              </div>
              <label className="flex flex-col gap-1" style={{ color: "var(--text-muted)" }}>{t("importName")}
                <input value={importLabel} onChange={(e) => setImportLabel(e.target.value)} maxLength={80} className="px-2 py-1.5" style={inputStyle} />
              </label>
              <div className="max-h-72 overflow-auto border rounded-lg" style={{ borderColor: "var(--border)" }}>
                <table className="w-full">
                  <thead className="sticky top-0" style={{ background: "var(--sunken)", color: "var(--text-muted)" }}>
                    <tr>
                      <th className="px-2 py-2 w-8">
                        <input type="checkbox" aria-label={t("pvSelectAll")} checked={selected.size === preview.length}
                          onChange={() => setSelected(selected.size === preview.length ? new Set() : new Set(preview.map((_, i) => i)))} />
                      </th>
                      <th className="px-2 py-2 text-left">{t("pvDate")}</th>
                      <th className="px-2 py-2 text-left">{t("colProduct")}</th>
                      <th className="px-2 py-2 text-right">{t("colQty")}</th>
                      <th className="px-2 py-2 text-right">{t("pvAmount")}</th>
                      <th className="px-2 py-2 text-right">{t("colUnitCost")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={i} className="border-t" style={{ borderColor: "var(--border)", opacity: isCancelledSale(r) ? 0.5 : 1 }}>
                        <td className="px-2 py-1.5 text-center">
                          <input type="checkbox" checked={selected.has(i)} aria-label={`${r.name} ${r.date}`}
                            onChange={() => setSelected((cur) => { const n = new Set(cur); if (n.has(i)) n.delete(i); else n.add(i); return n; })} />
                        </td>
                        <td className="px-2 py-1.5 mono">{r.date}</td>
                        <td className="px-2 py-1.5">
                          {r.name}
                          {isCancelledSale(r) && <Pill tone="warn" className="ml-1.5">{r.status}</Pill>}
                        </td>
                        <td className="px-2 py-1.5 text-right mono">{int(r.qty)}</td>
                        <td className="px-2 py-1.5 text-right mono">{moneyText(r.amount)}</td>
                        <td className="px-2 py-1.5 text-right mono">{r.unitCost === null ? "—" : moneyText(r.unitCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ color: "var(--text-muted)" }}>{t("pvHint")}</p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" disabled={step === "saving"} onClick={() => { setStep("input"); setImportErr(""); }}>{t("back")}</Button>
                <Button size="sm" loading={step === "saving"} disabled={previewStats.count === 0} onClick={saveImport}>{t("saveImport", { n: previewStats.count })}</Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <Modal open={manageOpen} onClose={() => setManageOpen(false)} title={t("manageTitle")} size="lg">
        <div className="space-y-3 text-xs" style={{ color: "var(--text)" }}>
          <p style={{ color: "var(--text-muted)" }}>{t("manageIntro")}</p>
          {imports.length === 0 ? (
            <p className="py-6 text-center" style={{ color: "var(--text-muted)" }}>{t("noImports")}</p>
          ) : (
            <ul className="divide-y border rounded-lg" style={{ borderColor: "var(--border)" }}>
              {imports.map((im) => (
                <li key={im.id} className="flex items-center justify-between gap-3 px-3 py-2.5" style={{ borderColor: "var(--border)" }}>
                  <div className="min-w-0">
                    <p className="font-semibold truncate" title={im.label}>{im.label}</p>
                    <p style={{ color: "var(--text-muted)" }}>
                      {t("manageMeta", {
                        n: (im.rows || []).length,
                        total: moneyText((im.rows || []).filter((r) => !isCancelledSale(r)).reduce((a, r) => a + r.amount, 0)),
                        date: new Date(im.createdAt).toLocaleDateString(locale),
                      })}
                    </p>
                  </div>
                  <Button variant="danger" size="sm" icon={Trash2} loading={deleting === im.id} onClick={() => deleteImport(im.id)}>{t("delete")}</Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => setManageOpen(false)}>{t("close")}</Button>
          </div>
        </div>
      </Modal>
    </>
  );

  const header = (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
      <p className="text-xs max-w-2xl" style={{ color: "var(--text-muted)" }}>{t("readOnlyNote")}</p>
      <div className="flex flex-wrap gap-2 print:hidden">
        <Button size="sm" icon={Sparkles} onClick={openImport}>{t("importButton")}</Button>
        {hasData && (
          <>
            <Button variant="secondary" size="sm" icon={FolderOpen} onClick={() => setManageOpen(true)}>{t("manageButton", { n: imports.length })}</Button>
            <Button variant="secondary" size="sm" icon={Coins} onClick={() => { setSaveMsg(null); setCostsOpen(true); }}>{t("costs")}</Button>
            <Button variant="secondary" size="sm" icon={Download} onClick={exportCsv} disabled={products.length === 0}>{t("exportCsv")}</Button>
            <Button variant="secondary" size="sm" icon={Printer} onClick={() => window.print()}>{t("print")}</Button>
          </>
        )}
      </div>
    </div>
  );

  if (!hasData) {
    return (
      <div className="space-y-6 vendas-report">
        {header}
        {loadError && <Card padding="sm"><p className="text-xs" style={{ color: "var(--neg)" }}>{t("loadError")}</p></Card>}
        <EmptyState
          icon={Sparkles}
          title={t("noImports")}
          description={t("noImportsHint")}
          action={<Button icon={Sparkles} onClick={openImport}>{t("importButton")}</Button>}
        />
        {importModals}
      </div>
    );
  }

  return (
    <div className="space-y-6 vendas-report">
      {header}

      {loadError && (
        <Card padding="sm"><p className="text-xs" style={{ color: "var(--neg)" }}>{t("loadError")}</p></Card>
      )}

      {/* Filtros */}
      <Card className="space-y-3 print:hidden">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setPreset("tudo")}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
            style={preset === "tudo" ? { background: "var(--brand-weak)", color: "var(--brand)" } : { background: "var(--sunken)", color: "var(--text-muted)" }}
          >
            {t("presetAll")}
          </button>
          {presetBtn("hoje", t("presetToday"))}
          {presetBtn("7d", t("presetLast7"))}
          {presetBtn("mes", t("presetThisMonth"))}
          {presetBtn("mesAnterior", t("presetLastMonth"))}
          {presetBtn("ano", t("presetThisYear"))}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 text-xs">
          <label className="flex flex-col gap-1" style={{ color: "var(--text-muted)" }}>{t("from")}
            <input type="date" value={range.from} max={range.to || undefined} onChange={(e) => { setPreset("custom"); setRange({ ...range, from: e.target.value }); }} className="px-2 py-1.5" style={inputStyle} />
          </label>
          <label className="flex flex-col gap-1" style={{ color: "var(--text-muted)" }}>{t("to")}
            <input type="date" value={range.to} min={range.from || undefined} onChange={(e) => { setPreset("custom"); setRange({ ...range, to: e.target.value }); }} className="px-2 py-1.5" style={inputStyle} />
          </label>
          <label className="flex flex-col gap-1" style={{ color: "var(--text-muted)" }}>{t("product")}
            <select value={sku} onChange={(e) => setSku(e.target.value)} className="px-2 py-1.5" style={inputStyle}>
              <option value="">{t("allProducts")}</option>
              {skuOptions.map(([k, name]) => <option key={k} value={k}>{name === k ? k : `${name} · ${k}`}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1" style={{ color: "var(--text-muted)" }}>{t("channel")}
            <select value={channel} onChange={(e) => setChannel(e.target.value)} className="px-2 py-1.5" style={inputStyle}>
              <option value="">{t("allChannels")}</option>
              {channelOptions.map((c) => <option key={c} value={c}>{channelName(c)}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1" style={{ color: "var(--text-muted)" }}>{t("compare")}
            <select value={compare} onChange={(e) => setCompare(e.target.value as typeof compare)} className="px-2 py-1.5" style={inputStyle}>
              <option value="prev">{t("comparePrev")}</option>
              <option value="custom">{t("compareCustom")}</option>
              <option value="off">{t("compareOff")}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1" style={{ color: "var(--text-muted)" }}>{t("granularity")}
            <select value={granOverride} onChange={(e) => setGranOverride(e.target.value as Granularity | "")} className="px-2 py-1.5" style={inputStyle}>
              <option value="">{t("granAuto")}</option>
              <option value="dia">{t("granDay")}</option>
              <option value="semana">{t("granWeek")}</option>
              <option value="mes">{t("granMonth")}</option>
            </select>
          </label>
          {compare === "custom" && (
            <>
              <label className="flex flex-col gap-1" style={{ color: "var(--text-muted)" }}>{t("cmpFrom")}
                <input type="date" value={cmpRange.from} onChange={(e) => setCmpRange((r) => ({ ...r, from: e.target.value }))} className="px-2 py-1.5" style={inputStyle} />
              </label>
              <label className="flex flex-col gap-1" style={{ color: "var(--text-muted)" }}>{t("cmpTo")}
                <input type="date" value={cmpRange.to} onChange={(e) => setCmpRange((r) => ({ ...r, to: e.target.value }))} className="px-2 py-1.5" style={inputStyle} />
              </label>
            </>
          )}
        </div>
        {!validRange && <p className="text-xs" style={{ color: "var(--neg)" }}>{t("invalidRange")}</p>}
        {validRange && compare !== "off" && (
          <p className="text-[11px]" style={{ color: "var(--text-subtle)" }}>{t("comparingWith", { from: prevRange.from, to: prevRange.to })}</p>
        )}
      </Card>

      {validRange && lines.length === 0 ? (
        <EmptyState icon={PackageSearch} title={t("empty")} description={t("emptyHint")} />
      ) : (
        <>
          {/* Cobertura de custo */}
          {m.semCusto.linhas > 0 && (
            <Card padding="sm" style={{ borderColor: "var(--warn)" }}>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <AlertTriangle size={18} style={{ color: "var(--warn)" }} className="shrink-0" />
                <div className="flex-1 text-xs" style={{ color: "var(--text)" }}>
                  <p className="font-semibold">
                    {t("coverageTitle", { pct: pct(m.cobertura, 0) ?? "0%" })}
                  </p>
                  <p className="mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {t("coverageBody", { count: m.semCusto.linhas, amount: moneyText(m.semCusto.receita) })}{" "}
                    <span className="mono">{m.semCusto.skus.slice(0, 8).join(", ")}{m.semCusto.skus.length > 8 ? "…" : ""}</span>
                  </p>
                </div>
                <Button size="sm" variant="secondary" icon={Coins} className="print:hidden" onClick={() => { setSaveMsg(null); setCostsOpen(true); }}>{t("setCosts")}</Button>
              </div>
            </Card>
          )}

          {/* Indicadores */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {cards.map((c) => (
              <div key={c.key} title={c.hint}>
                <KpiTile label={c.label} value={c.value} valueTone={c.valueTone} delta={c.d?.text} deltaTone={c.d?.tone} />
              </div>
            ))}
          </div>
          <p className="text-[11px] -mt-3" style={{ color: "var(--text-subtle)" }}>
            {t("netLine", {
              gross: moneyText(m.totalVendas), fees: moneyText(m.taxas), returns: moneyText(m.devolucoes), net: moneyText(m.receitaLiquida),
            })}
          </p>

          {/* Evolução */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {[
              { k: "rev", title: t("chartRevenue"), c: cRevenue, color: "var(--brand)", fmt: moneyText, axis: axisMoney },
              { k: "profit", title: t("chartProfit"), c: cProfit, color: "var(--pos)", fmt: moneyText, axis: axisMoney },
              { k: "roi", title: t("chartRoi"), c: cRoi, color: "var(--warn)", fmt: (v: number) => pct(v) ?? "", axis: (v: number) => `${Math.round(v)}%` },
            ].map((ch) => (
              <Card key={ch.k}>
                <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--text)" }}>{ch.title}</h3>
                {ch.c.data.length === 0 ? (
                  <p className="text-xs py-10 text-center" style={{ color: "var(--text-muted)" }}>{t("noPoints")}</p>
                ) : (
                  <AreaLineChart
                    categories={ch.c.categories}
                    series={[{ name: ch.title, data: ch.c.data, color: ch.color }]}
                    height={200}
                    formatValue={ch.fmt}
                    formatAxis={ch.axis}
                    hideValues={hideValues && ch.k !== "roi"}
                    ariaLabel={ch.title}
                  />
                )}
              </Card>
            ))}
          </div>

          {/* Rankings */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <Card>
              <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text)" }}>{t("topVolume")}</h3>
              <RankList tone="brand" rows={top(products, (r) => r.qty, "desc").map((r) => ({ key: r.sku, label: label(r), value: r.qty, display: int(r.qty) }))} />
            </Card>
            <Card>
              <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text)" }}>{t("topProfit")}</h3>
              {top(products, (r) => r.lucro, "desc").length === 0 ? <p className="text-xs" style={{ color: "var(--text-muted)" }}>{t("needCosts")}</p> :
                <RankList tone="pos" rows={top(products, (r) => r.lucro, "desc").map((r) => ({ key: r.sku, label: label(r), value: r.lucro as number, display: money(r.lucro as number) }))} />}
            </Card>
            <Card>
              <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text)" }}>{t("topRoi")}</h3>
              {top(products, (r) => r.roi, "desc").length === 0 ? <p className="text-xs" style={{ color: "var(--text-muted)" }}>{t("needCosts")}</p> :
                <RankList tone="pos" rows={top(products, (r) => r.roi, "desc").map((r) => ({ key: r.sku, label: label(r), value: r.roi as number, display: pct(r.roi) }))} />}
            </Card>
            <Card>
              <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text)" }}>{t("lowMargin")}</h3>
              {top(products, (r) => r.margem, "asc").length === 0 ? <p className="text-xs" style={{ color: "var(--text-muted)" }}>{t("needCosts")}</p> :
                <RankList tone="brand" rows={top(products, (r) => r.margem, "asc").map((r) => ({ key: r.sku, label: label(r), value: r.margem as number, display: pct(r.margem) }))} />}
            </Card>
            <Card className="md:col-span-1 xl:col-span-2">
              <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text)" }}>{t("byChannel")}</h3>
              <RankList tone="brand" rows={channels.map((c) => ({
                key: c.channel, label: channelName(c.channel), value: c.receitaLiquida,
                display: <>{money(c.receitaLiquida)} · {pct(c.share)}</>,
              }))} />
              <p className="text-[11px] mt-3" style={{ color: "var(--text-subtle)" }}>{t("noCategoryNote")}</p>
            </Card>
          </div>

          {/* Tabela por produto */}
          <Card padding="none" className="overflow-hidden">
            <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
              <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>{t("tableTitle")}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead style={{ background: "var(--sunken)", color: "var(--text-muted)" }}>
                  <tr>
                    {th("name", t("colProduct"), false)}
                    {th("qty", t("colQty"))}
                    {th("receitaLiquida", t("colNet"))}
                    {th("custoUnit", t("colUnitCost"))}
                    {th("cmv", t("colCmv"))}
                    {th("lucro", t("colProfit"))}
                    {th("margem", t("colMargin"))}
                    {th("roi", t("colRoi"))}
                    {th("share", t("colShare"))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.sku} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="px-3 py-2">
                        <div className="font-medium" style={{ color: "var(--text)" }}>{r.name}</div>
                        <div className="flex items-center gap-1.5 mono" style={{ color: "var(--text-subtle)" }}>
                          {r.sku}
                          {r.semCusto && <Pill tone="warn">{t("noCost")}</Pill>}
                          {r.parcial && <Pill tone="muted">{t("partialCost")}</Pill>}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right mono">{int(r.qty)}</td>
                      <td className="px-3 py-2 text-right mono">{money(r.receitaLiquida)}</td>
                      <td className="px-3 py-2 text-right mono">{r.custoUnit === null ? na : money(r.custoUnit)}</td>
                      <td className="px-3 py-2 text-right mono">{r.cmv === null ? na : money(r.cmv)}</td>
                      <td className="px-3 py-2 text-right mono" style={{ color: r.lucro === null ? undefined : r.lucro < 0 ? "var(--neg)" : "var(--pos)" }}>{r.lucro === null ? na : money(r.lucro)}</td>
                      <td className="px-3 py-2 text-right mono" style={{ color: r.margem !== null && r.margem < 0 ? "var(--neg)" : undefined }}>{r.margem === null ? na : pct(r.margem)}</td>
                      <td className="px-3 py-2 text-right mono" style={{ color: r.roi !== null && r.roi < 0 ? "var(--neg)" : undefined }}>{r.roi === null ? na : pct(r.roi)}</td>
                      <td className="px-3 py-2 text-right mono">{pct(r.share)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot style={{ background: "var(--sunken)" }}>
                  <tr className="border-t font-semibold" style={{ borderColor: "var(--border)" }}>
                    <td className="px-3 py-2">{t("totalRow")}</td>
                    <td className="px-3 py-2 text-right mono">{int(m.unidades)}</td>
                    <td className="px-3 py-2 text-right mono">{money(m.receitaLiquida)}</td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2 text-right mono">{m.cmv === null ? na : money(m.cmv)}</td>
                    <td className="px-3 py-2 text-right mono">{m.lucroBruto === null ? na : money(m.lucroBruto)}</td>
                    <td className="px-3 py-2 text-right mono">{m.margemBruta === null ? na : pct(m.margemBruta)}</td>
                    <td className="px-3 py-2 text-right mono">{m.roiCmv === null ? na : pct(m.roiCmv)}</td>
                    <td className="px-3 py-2 text-right mono">{pct(100)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </>
      )}

      {importModals}

      {/* Custos dos produtos */}
      <Modal open={costsOpen} onClose={() => !saving && setCostsOpen(false)} title={t("costsTitle")} size="lg" closeDisabled={saving}>
        <div className="space-y-5 text-xs px-6 py-5" style={{ color: "var(--text)" }}>
          <p style={{ color: "var(--text-muted)" }}>{t("costsIntro")}</p>
          <div className="max-h-72 overflow-y-auto border rounded-lg" style={{ borderColor: "var(--border)" }}>
            <table className="w-full">
              <thead className="sticky top-0" style={{ background: "var(--sunken)", color: "var(--text-muted)" }}>
                <tr>
                  <th className="px-3 py-2 text-left">{t("colProduct")}</th>
                  <th className="px-3 py-2 text-right">{t("costColCurrent")}</th>
                  <th className="px-3 py-2 text-right">{t("costColNew")}</th>
                  <th className="px-3 py-2 text-right">{t("costColFrom")}</th>
                </tr>
              </thead>
              <tbody>
                {costRows.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-6 text-center" style={{ color: "var(--text-muted)" }}>{t("noProducts")}</td></tr>
                )}
                {costRows.map((r) => {
                  const last = r.hist.length ? r.hist[r.hist.length - 1] : null;
                  const d = drafts[r.sku] || { cost: "", from: "" };
                  return (
                    <tr key={r.sku} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.name}</div>
                        <div className="mono" style={{ color: "var(--text-subtle)" }}>{r.sku}</div>
                      </td>
                      <td className="px-3 py-2 text-right mono">{last ? moneyText(last.unitCost) : <Pill tone="warn">{t("noCost")}</Pill>}</td>
                      <td className="px-3 py-2 text-right">
                        <input inputMode="decimal" placeholder="0,00" value={d.cost}
                          onChange={(e) => setDrafts((s) => ({ ...s, [r.sku]: { ...d, cost: e.target.value } }))}
                          className="w-24 px-2 py-1 text-right mono" style={inputStyle} aria-label={`${t("costColNew")} ${r.sku}`} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input type="date" value={d.from} title={r.hist.length ? t("fromPlaceholderNew") : t("fromPlaceholderFirst")}
                          onChange={(e) => setDrafts((s) => ({ ...s, [r.sku]: { ...d, from: e.target.value } }))}
                          className="px-2 py-1" style={inputStyle} aria-label={`${t("costColFrom")} ${r.sku}`} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div>
            <p className="font-semibold mb-1">{t("importTitle")}</p>
            <p className="mb-1" style={{ color: "var(--text-muted)" }}>{t("importHint")}</p>
            <textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={4}
              placeholder={"SKU-001;12,50\nSKU-002;7,90;2026-10-01"} className="w-full px-2 py-1.5 mono" style={inputStyle} />
            {importText && (
              <p className="mt-1" style={{ color: parsedImport.errors.length ? "var(--neg)" : "var(--text-muted)" }}>
                {t("importResult", { ok: parsedImport.entries.length })}
                {parsedImport.errors.length > 0 && ` ${t("importErrors", { lines: parsedImport.errors.join(", ") })}`}
              </p>
            )}
          </div>
          {saveMsg && <p style={{ color: saveMsg.ok ? "var(--pos)" : "var(--neg)" }}>{saveMsg.text}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setCostsOpen(false)} disabled={saving}>{t("close")}</Button>
            <Button size="sm" loading={saving} onClick={saveCosts}
              disabled={!Object.values(drafts).some((d) => d.cost.trim()) && parsedImport.entries.length === 0}>{t("save")}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
