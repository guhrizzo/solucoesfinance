"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  TrendingUp, Plus, X, Check, ArrowUpRight, ArrowDownRight,
  Search, Calendar, ChevronDown, Trash2, Edit3, ClipboardList,
  FileText, Wallet, Loader2,
  ShoppingCart, Briefcase, UserCheck, PiggyBank, CircleDollarSign,
  Truck, UsersRound, Building2, Receipt, Megaphone, Monitor, Package,
  BanknoteArrowUp, BanknoteArrowDown, Sparkles, Upload, CheckCircle2,
  Paperclip, ExternalLink, FileScan,
  Eye, EyeOff,
  type LucideIcon,
} from "lucide-react";
import Navbar from "./Navbar";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type TxType = "entrada" | "saida";

interface Tx {
  id: string;
  type: TxType;
  description: string;
  category: string;
  amount: number;
  date: string;
  note: string;
  createdAt: number;
  nfUrl?: string;
  nfName?: string;
}

interface ImportedTx {
  type: TxType;
  description: string;
  category: string;
  amount: number;
  date: string;
  note: string;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().split("T")[0];

const CAT: Record<TxType, string[]> = {
  entrada: ["Vendas", "Serviços prestados", "Recebimento de clientes", "Investimentos", "Outros recebimentos"],
  saida: ["Fornecedores", "Folha de pagamento", "Aluguel", "Impostos", "Marketing", "TI / Software", "Outros gastos"],
};

const CAT_ICON: Record<string, LucideIcon> = {
  "Vendas": ShoppingCart,
  "Serviços prestados": Briefcase,
  "Recebimento de clientes": UserCheck,
  "Investimentos": PiggyBank,
  "Outros recebimentos": CircleDollarSign,
  "Fornecedores": Truck,
  "Folha de pagamento": UsersRound,
  "Aluguel": Building2,
  "Impostos": Receipt,
  "Marketing": Megaphone,
  "TI / Software": Monitor,
  "Outros gastos": Package,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const labelDate = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).replace(/\./g, "");

const labelMonthYear = (yearMonth: string) => {
  const [year, month] = yearMonth.split("-");
  const date = new Date(`${year}-${month}-01T12:00:00`);
  return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }).replace(/^\w/, c => c.toUpperCase());
};

const shortDate = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "numeric" });

function parseAmount(raw: string): number {
  const s = raw.trim().replace(/[^\d,.]/g, "");
  if (!s) return 0;
  if (s.includes(",")) return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
  return parseFloat(s) || 0;
}

if (typeof window !== "undefined") {
  import("../../lib/firebase");
  import("firebase/auth");
  import("firebase/firestore");
}

// ─── Modal de previsão ────────────────────────────────────────────────────────

function PrevisaoModal({ open, value, onClose, onSave }: {
  open: boolean; value: number; onClose: () => void; onSave: (val: number) => void;
}) {
  const [raw, setRaw] = useState("");
  useEffect(() => { if (open) setRaw(value > 0 ? value.toFixed(2).replace(".", ",") : ""); }, [open, value]);
  if (!open) return null;
  const parsed = parseAmount(raw);
  return (
    <div className="fixed inset-0 z-990 flex items-center justify-center p-4"
      style={{ background: "rgba(13,17,23,0.5)", backdropFilter: "blur(8px)" }}>
      <div className="cf-card p-6 w-full max-w-sm" style={{ animation: "slideUp .3s cubic-bezier(.34,.1,.64,.88)" }}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-heading text-base font-bold" style={{ color: "var(--cf-text)" }}>Meta de gastos</h3>
            <p className="text-xs mt-2" style={{ color: "var(--cf-text2)" }}>Orçamento + Contas a pagar - Contas a receber (pendentes)</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-opacity-50 rounded-lg cursor-pointer"
            style={{ background: "var(--cf-input)", color: "var(--cf-text2)" }}>
            <X size={16} />
          </button>
        </div>
        <div className="space-y-3 mb-6">
          <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--cf-text2)" }}>Valor orçado (R$)</label>
          <input inputMode="decimal" value={raw} onChange={(e) => setRaw(e.target.value)}
            placeholder="0,00" autoFocus className="w-full rounded-xl px-4 py-3 text-sm outline-none font-mono cursor-text"
            style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }} />
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm font-semibold cursor-pointer"
            style={{ border: "1px solid var(--cf-border)", color: "var(--cf-text2)" }}>Cancelar</button>
          <button onClick={() => { onSave(parsed); onClose(); }}
            className="flex-1 py-3 rounded-xl text-sm font-bold cursor-pointer"
            style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "white" }}>Salvar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal de transação ───────────────────────────────────────────────────────

function Modal({ open, editing, uid, onClose, onSave }: {
  open: boolean; editing: Tx | null; uid: string | null;
  onClose: () => void; onSave: (data: Omit<Tx, "id">) => Promise<void>;
}) {
  const [type, setType] = useState<TxType>("entrada");
  const [desc, setDesc] = useState("");
  const [cat, setCat] = useState("");
  const [rawAmt, setRawAmt] = useState("");
  const [date, setDate] = useState(TODAY);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [nfFile, setNfFile] = useState<File | null>(null);
  const [nfPreview, setNfPreview] = useState("");
  const [nfUrl, setNfUrl] = useState("");
  const [nfName, setNfName] = useState("");
  const [scanning, setScanning] = useState(false);
  const nfRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setType(editing?.type ?? "entrada");
    setDesc(editing?.description ?? "");
    setCat(editing?.category ?? "");
    setRawAmt(editing ? editing.amount.toFixed(2).replace(".", ",") : "");
    setDate(editing?.date ?? TODAY);
    setNote(editing?.note ?? "");
    setNfFile(null); setNfPreview(""); setNfUrl(editing?.nfUrl ?? ""); setNfName(editing?.nfName ?? "");
    setSaving(false); setErr("");
  }, [open]);

  if (!open) return null;

  const amount = parseAmount(rawAmt);
  const descOk = desc.trim().length >= 2;
  const catOk = cat !== "";
  const amtOk = amount > 0;
  const dateOk = date !== "";
  const canSave = descOk && catOk && amtOk && dateOk;

  const handleNfSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNfFile(file); setNfName(file.name);
    setNfPreview(URL.createObjectURL(file)); setNfUrl("");
  };

  const scanNf = async () => {
    if (!nfFile) return;
    setScanning(true); setErr("");
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res((r.result as string).split(",")[1]);
        r.onerror = () => rej(new Error("Falha ao ler arquivo"));
        r.readAsDataURL(nfFile);
      });
      const isXml = nfFile.name.toLowerCase().endsWith(".xml");
      let body: any;
      if (isXml) {
        body = { type: "xml", content: await nfFile.text() };
      } else {
        const mediaType = nfFile.type || (nfFile.name.endsWith(".pdf") ? "application/pdf" : "image/jpeg");
        body = { type: "file", base64, mediaType };
      }
      const res = await fetch("/api/analyze-nf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Erro na API");
      if (data.description) setDesc(data.description.slice(0, 60));
      if (data.amount) setRawAmt(String(data.amount).replace(".", ","));
      if (data.date) setDate(data.date);
      if (data.note) setNote(data.note);
      const cats = type === "entrada" ? CAT.entrada : CAT.saida;
      const match = cats.find(c => c.toLowerCase().includes((data.category ?? "").toLowerCase()) || (data.category ?? "").toLowerCase().includes(c.toLowerCase()));
      if (match) setCat(match);
    } catch (e: any) { setErr(`Erro ao ler NF: ${e.message}`); }
    setScanning(false);
  };

  const uploadNf = async (): Promise<{ url: string; name: string }> => {
    if (!nfFile || !uid) return { url: nfUrl, name: nfName };
    const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Timeout: Firebase Storage pode não estar ativado.")), 15000));
    const upload = async () => {
      const [{ getFirebase }, { ref, uploadBytes, getDownloadURL }] = await Promise.all([import("../../lib/firebase"), import("firebase/storage")]);
      const { storage } = await getFirebase();
      const storageRef = ref(storage, `users/${uid}/nfs/${Date.now()}_${nfFile.name}`);
      await uploadBytes(storageRef, nfFile);
      return { url: await getDownloadURL(storageRef), name: nfFile.name };
    };
    return Promise.race([upload(), timeout]);
  };

  async function submit() {
    if (!canSave || saving) return;
    setSaving(true); setErr("");
    try {
      let nfData = { url: nfUrl, name: nfName };
      if (nfFile) {
        try { nfData = await uploadNf(); }
        catch (uploadErr: any) {
          setErr(`NF não anexada: ${uploadErr.message}. Salvando sem arquivo.`);
          await new Promise(r => setTimeout(r, 2500));
          setErr("");
        }
      }
      const saveData: any = { type, description: desc.trim(), category: cat, amount, date, note: note.trim(), createdAt: editing?.createdAt ?? Date.now() };
      if (nfData.url) saveData.nfUrl = nfData.url;
      if (nfData.name) saveData.nfName = nfData.name;
      await onSave(saveData);
      onClose();
    } catch (e: any) { setErr(e?.message ?? "Erro ao salvar"); setSaving(false); }
  }

  const hasNf = nfPreview || nfUrl;

  return (
    <div className="fixed inset-0 z-990 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(13,17,23,0.6)", backdropFilter: "blur(8px)" }}>
      <div className="w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl overflow-hidden"
        style={{ background: "var(--cf-card)", boxShadow: "0 25px 50px rgba(0,0,0,0.2)", animation: "slideUp .3s cubic-bezier(.34,.1,.64,.88)" }}>
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1.5 rounded-full" style={{ background: "var(--cf-border)" }} />
        </div>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--cf-border)" }}>
          <div>
            <p className="font-heading text-base font-bold" style={{ color: "var(--cf-text)" }}>{editing ? "Editar transação" : "Nova transação"}</p>
            <p className="text-xs mt-1" style={{ color: "var(--cf-text2)" }}>Preencha ou anexe uma nota fiscal</p>
          </div>
          <button onClick={() => !saving && onClose()} className="p-1.5 hover:bg-opacity-50 rounded-lg transition-colors cursor-pointer"
            style={{ background: "var(--cf-input)", color: "var(--cf-text2)" }}>
            <X size={16} />
          </button>
        </div>
        <div className="px-5 pt-4 pb-6 space-y-4 overflow-y-auto" style={{ maxHeight: "82vh" }}>
          {err && (
            <div className="rounded-xl px-4 py-3 text-xs flex items-start gap-2"
              style={{ background: "#fef2f2", border: "1px solid #fecdd3", color: "#be123c" }}>
              <span className="mt-0.5">⚠</span> {err}
            </div>
          )}
          {/* NF */}
          <div className="space-y-2.5">
            <label className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "var(--cf-text2)" }}>
              <Paperclip size={12} /> Anexar nota fiscal
            </label>
            {hasNf ? (
              <div className="flex items-center gap-3 p-3.5 rounded-xl" style={{ background: "#eff6ff", border: "1px solid #bfdbfe" }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(29,78,216,0.1)" }}>
                  <FileText size={16} style={{ color: "#1d4ed8" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: "#1e40af" }}>{nfName || "Nota Fiscal"}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#60a5fa" }}>Anexada ✓</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {(nfPreview || nfUrl) && (
                    <a href={nfPreview || nfUrl} target="_blank" rel="noreferrer"
                      className="p-1.5 rounded-lg hover:bg-opacity-70 cursor-pointer"
                      style={{ background: "rgba(29,78,216,0.1)", color: "#1d4ed8" }}>
                      <ExternalLink size={12} />
                    </a>
                  )}
                  <button onClick={() => { setNfFile(null); setNfPreview(""); setNfUrl(""); setNfName(""); }}
                    className="p-1.5 rounded-lg hover:bg-opacity-70 cursor-pointer"
                    style={{ background: "rgba(29,78,216,0.1)", color: "#60a5fa" }}>
                    <X size={12} />
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => nfRef.current?.click()}
                className="w-full border-2 border-dashed rounded-xl p-4 flex items-center gap-3 transition-all hover:border-opacity-100 cursor-pointer"
                style={{ borderColor: "var(--cf-border)", background: "var(--cf-input)" }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--cf-border)" }}>
                  <Upload size={15} style={{ color: "var(--cf-text2)" }} />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold" style={{ color: "var(--cf-text)" }}>PDF, imagem ou XML</p>
                  <p className="text-xs" style={{ color: "var(--cf-text2)" }}>Clique para anexar</p>
                </div>
                <input ref={nfRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.xml" className="hidden" onChange={handleNfSelect} />
              </button>
            )}
            {nfFile && (
              <button onClick={scanNf} disabled={scanning}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold border-2 transition-all ${scanning ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                style={{ borderColor: "#c4b5fd", background: "#f5f3ff", color: "#6d28d9" }}>
                {scanning ? <><Loader2 size={14} className="animate-spin" /> Analisando…</> : <><FileScan size={14} /> Extrair dados com IA</>}
              </button>
            )}
          </div>
          <div className="h-px" style={{ background: "var(--cf-border)" }} />
          {/* Tipo */}
          <div className="grid grid-cols-2 gap-2 p-1.5 rounded-xl" style={{ background: "var(--cf-input)" }}>
            {(["entrada", "saida"] as TxType[]).map((t) => (
              <button key={t} onClick={() => { setType(t); setCat(""); }}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-bold transition-all cursor-pointer"
                style={type === t
                  ? { background: t === "entrada" ? "linear-gradient(135deg, #10b981, #059669)" : "linear-gradient(135deg, #ef4444, #dc2626)", color: "white", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }
                  : { background: "transparent", color: "var(--cf-text2)" }}>
                {t === "entrada" ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
                {t === "entrada" ? "Entrada" : "Saída"}
              </button>
            ))}
          </div>
          {/* Descrição */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text2)" }}>Descrição</label>
            <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Cliente XYZ, Aluguel…"
              className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors cursor-text"
              style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }} />
          </div>
          {/* Categoria */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text2)" }}>Categoria</label>
            <div className="relative">
              <select value={cat} onChange={(e) => setCat(e.target.value)}
                className="w-full appearance-none rounded-xl px-4 py-3 pr-9 text-sm outline-none cursor-pointer transition-colors"
                style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }}>
                <option value="">— Selecione —</option>
                {CAT[type].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--cf-text2)" }} />
            </div>
          </div>
          {/* Valor + Data */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text2)" }}>Valor (R$)</label>
              <input inputMode="decimal" value={rawAmt} onChange={(e) => setRawAmt(e.target.value)} placeholder="0,00"
                className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors font-mono cursor-text"
                style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }} />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text2)" }}>Data</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl px-4 py-3 text-sm outline-none cursor-pointer transition-colors"
                style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }} />
            </div>
          </div>
          {/* Observação */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text2)" }}>Observação (opcional)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="NF #123, parcela 1/5…"
              className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors cursor-text"
              style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }} />
          </div>
          <button onClick={submit} disabled={!canSave || saving}
            className={`w-full py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${canSave && !saving ? "cursor-pointer hover:shadow-lg" : "cursor-not-allowed opacity-50"}`}
            style={canSave && !saving
              ? { background: type === "entrada" ? "linear-gradient(135deg, #10b981, #059669)" : "linear-gradient(135deg, #ef4444, #dc2626)", color: "white" }
              : { background: "var(--cf-input)", color: "var(--cf-text2)" }}>
            {saving ? <><Loader2 size={15} className="animate-spin" /> Salvando…</> : <><Check size={15} /> {editing ? "Salvar alterações" : type === "entrada" ? "Registrar entrada" : "Registrar saída"}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal de importação IA ───────────────────────────────────────────────────

type ImportStep = "input" | "loading" | "preview" | "saving" | "done";

function ImportModal({ open, onClose, onImport }: {
  open: boolean; onClose: () => void; onImport: (txs: ImportedTx[]) => Promise<void>;
}) {
  const [step, setStep] = useState<ImportStep>("input");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ImportedTx[]>([]);
  const [errMsg, setErrMsg] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) { setStep("input"); setText(""); setPreview([]); setErrMsg(""); setSelected(new Set()); }
  }, [open]);

  if (!open) return null;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setText(ev.target?.result as string ?? "");
    reader.readAsText(file, "UTF-8");
  };

  const normalizeCategory = (raw: string, type: TxType): string => {
    const cats = type === "entrada" ? CAT.entrada : CAT.saida;
    const match = cats.find(c => c.toLowerCase().includes(raw.toLowerCase()) || raw.toLowerCase().includes(c.toLowerCase()));
    if (match) return match;
    const r = raw.toLowerCase();
    if (type === "entrada") {
      if (r.includes("salário") || r.includes("salario") || r.includes("folha")) return "Recebimento de clientes";
      if (r.includes("venda") || r.includes("pix receb")) return "Vendas";
      if (r.includes("invest")) return "Investimentos";
      if (r.includes("serviç") || r.includes("servic") || r.includes("freela")) return "Serviços prestados";
      return "Outros recebimentos";
    } else {
      if (r.includes("aluguel")) return "Aluguel";
      if (r.includes("fornec") || r.includes("compra") || r.includes("mercado")) return "Fornecedores";
      if (r.includes("folha") || r.includes("salário") || r.includes("salario")) return "Folha de pagamento";
      if (r.includes("imposto") || r.includes("tributo") || r.includes("das")) return "Impostos";
      if (r.includes("market") || r.includes("publi")) return "Marketing";
      if (r.includes("softw") || r.includes("ti ") || r.includes("assinatura")) return "TI / Software";
      return "Outros gastos";
    }
  };

  const analyze = async () => {
    if (!text.trim()) return;
    setStep("loading"); setErrMsg("");
    try {
      const res = await fetch("/api/analyze-extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Erro na API");
      const rawText = (data.content as any[])?.map((c: any) => c.text || "").join("") ?? "";
      const clean = rawText.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      if (!parsed.transactions?.length) { setErrMsg("Nenhuma transação encontrada."); setStep("input"); return; }
      const normalized: ImportedTx[] = parsed.transactions.map((t: any) => ({
        type: (t.type === "entrada" || t.type === "saida") ? t.type : "saida",
        description: String(t.description ?? "Sem descrição").slice(0, 60),
        category: normalizeCategory(String(t.category ?? ""), t.type === "entrada" ? "entrada" : "saida"),
        amount: Math.abs(Number(t.amount) || 0),
        date: String(t.date ?? TODAY),
        note: String(t.note ?? ""),
      }));
      setPreview(normalized);
      setSelected(new Set(normalized.map((_, i) => i)));
      setStep("preview");
    } catch (e: any) { setErrMsg(`Erro ao interpretar: ${e.message}`); setStep("input"); }
  };

  const confirmImport = async () => {
    const toImport = preview.filter((_, i) => selected.has(i));
    if (!toImport.length) return;
    setStep("saving");
    try { await onImport(toImport); setStep("done"); }
    catch (e: any) { setErrMsg(e.message); setStep("preview"); }
  };

  const toggleAll = () => { selected.size === preview.length ? setSelected(new Set()) : setSelected(new Set(preview.map((_, i) => i))); };
  const toggle = (i: number) => { const s = new Set(selected); s.has(i) ? s.delete(i) : s.add(i); setSelected(s); };

  return (
    <div className="fixed inset-0 z-990 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(13,17,23,0.6)", backdropFilter: "blur(8px)" }}>
      <div className="w-full sm:max-w-lg sm:rounded-2xl rounded-t-3xl overflow-hidden"
        style={{ background: "var(--cf-card)", boxShadow: "0 25px 50px rgba(0,0,0,0.2)", animation: "slideUp .3s cubic-bezier(.34,.1,.64,.88)", maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
        <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
          <div className="w-10 h-1.5 rounded-full" style={{ background: "var(--cf-border)" }} />
        </div>
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: "1px solid var(--cf-border)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)" }}>
              <Sparkles size={16} className="text-white" />
            </div>
            <div>
              <p className="font-heading text-base font-bold" style={{ color: "var(--cf-text)" }}>Importar com IA</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--cf-text2)" }}>
                {step === "input" && "Cole ou faça upload de seu extrato"}
                {step === "loading" && "Analisando transações…"}
                {step === "preview" && `${preview.length} transações encontradas`}
                {step === "saving" && "Salvando…"}
                {step === "done" && "Importação concluída!"}
              </p>
            </div>
          </div>
          {step !== "saving" && (
            <button onClick={onClose} className="p-1.5 hover:bg-opacity-50 rounded-lg transition-colors cursor-pointer"
              style={{ background: "var(--cf-input)", color: "var(--cf-text2)" }}>
              <X size={16} />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {step === "input" && (
            <>
              {errMsg && (
                <div className="rounded-xl px-4 py-3 text-xs flex items-start gap-2"
                  style={{ background: "#fef2f2", border: "1px solid #fecdd3", color: "#be123c" }}>
                  <span className="shrink-0">⚠</span> {errMsg}
                </div>
              )}
              <button onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed rounded-xl p-5 flex flex-col items-center gap-2 transition-all hover:border-opacity-100 cursor-pointer"
                style={{ borderColor: "var(--cf-border)" }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "var(--cf-input)" }}>
                  <Upload size={18} style={{ color: "var(--cf-text2)" }} />
                </div>
                <p className="text-sm font-semibold" style={{ color: "var(--cf-text)" }}>Fazer upload</p>
                <p className="text-xs" style={{ color: "var(--cf-text2)" }}>.txt ou .csv do seu banco</p>
                <input ref={fileRef} type="file" accept=".txt,.csv" className="hidden" onChange={handleFile} />
              </button>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px" style={{ background: "var(--cf-border)" }} />
                <span className="text-xs font-medium" style={{ color: "var(--cf-text2)" }}>ou cole o texto</span>
                <div className="flex-1 h-px" style={{ background: "var(--cf-border)" }} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text2)" }}>Extrato bancário</label>
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8}
                  placeholder={`01/03/2026  PIX RECEBIDO ABC    CR  R$ 3.500,00\n05/03/2026  ALUGUEL SALA         DB  R$ 2.200,00`}
                  className="w-full rounded-xl px-4 py-3 text-xs font-mono outline-none resize-none cursor-text"
                  style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }} />
                <p className="text-xs" style={{ color: "var(--cf-text2)" }}>{text.length} caracteres</p>
              </div>
            </>
          )}
          {step === "loading" && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center animate-pulse" style={{ background: "var(--cf-input)" }}>
                  <Sparkles size={28} className="text-blue-500" />
                </div>
              </div>
              <div className="text-center">
                <p className="font-heading text-sm font-bold" style={{ color: "var(--cf-text)" }}>Analisando…</p>
                <p className="text-xs mt-2" style={{ color: "var(--cf-text2)" }}>Extraindo transações, valores e categorias</p>
              </div>
            </div>
          )}
          {(step === "preview" || step === "saving") && (
            <>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Entradas", val: preview.filter(t => t.type === "entrada").length, color: "#059669", bg: "#dcfce7" },
                  { label: "Saídas", val: preview.filter(t => t.type === "saida").length, color: "#dc2626", bg: "#fee2e2" },
                  { label: "Selecionados", val: selected.size, color: "#2563eb", bg: "#dbeafe" },
                ].map(({ label, val, color, bg }) => (
                  <div key={label} className="rounded-xl p-3 text-center" style={{ background: bg }}>
                    <p className="text-lg font-heading font-bold" style={{ color }}>{val}</p>
                    <p className="text-xs" style={{ color: "var(--cf-text2)" }}>{label}</p>
                  </div>
                ))}
              </div>
              <button onClick={toggleAll}
                className="w-full flex items-center gap-2 px-3 py-3 rounded-xl cursor-pointer text-sm font-semibold transition-colors"
                style={{ border: "1px solid var(--cf-border)", background: "var(--cf-input)", color: "var(--cf-text)" }}>
                <div className="w-4 h-4 rounded border-2 flex items-center justify-center"
                  style={selected.size === preview.length ? { background: "#2563eb", borderColor: "#2563eb" } : { borderColor: "var(--cf-border)" }}>
                  {selected.size === preview.length && <Check size={10} className="text-white" />}
                </div>
                {selected.size === preview.length ? "Desmarcar todos" : "Selecionar todos"}
                <span className="ml-auto text-xs font-normal" style={{ color: "var(--cf-text2)" }}>{selected.size}/{preview.length}</span>
              </button>
              <div className="space-y-1.5">
                {preview.map((tx, i) => {
                  const CatIcon = CAT_ICON[tx.category] ?? (tx.type === "entrada" ? ArrowUpRight : ArrowDownRight);
                  const isSel = selected.has(i);
                  return (
                    <button key={i} onClick={() => toggle(i)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all cursor-pointer text-left`}
                      style={isSel
                        ? { borderColor: tx.type === "entrada" ? "#a7f3d0" : "#fca5a5", background: tx.type === "entrada" ? "#f0fdf4" : "#fff1f2" }
                        : { borderColor: "var(--cf-border)", background: "var(--cf-input)", opacity: 0.5 }}>
                      <div className="w-4 h-4 rounded border-2 flex items-center justify-center shrink-0"
                        style={isSel ? { background: "#2563eb", borderColor: "#2563eb" } : { borderColor: "var(--cf-border)" }}>
                        {isSel && <Check size={9} className="text-white" />}
                      </div>
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: tx.type === "entrada" ? "#dcfce7" : "#fee2e2" }}>
                        <CatIcon size={14} style={{ color: tx.type === "entrada" ? "#059669" : "#dc2626" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate" style={{ color: "var(--cf-text)" }}>{tx.description}</p>
                        <p className="text-xs truncate" style={{ color: "var(--cf-text2)" }}>{tx.category} · {shortDate(tx.date)}</p>
                      </div>
                      <span className="text-xs font-mono font-bold shrink-0" style={{ color: tx.type === "entrada" ? "#059669" : "#dc2626" }}>
                        {tx.type === "entrada" ? "+" : "-"}{toBRL(tx.amount)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {step === "done" && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "#dcfce7" }}>
                <CheckCircle2 size={32} className="text-emerald-600" />
              </div>
              <p className="font-heading text-base font-bold" style={{ color: "var(--cf-text)" }}>Pronto!</p>
              <p className="text-sm text-center" style={{ color: "var(--cf-text2)" }}>
                {selected.size} transação{selected.size !== 1 ? "ões" : ""} importada{selected.size !== 1 ? "s" : ""}.
              </p>
            </div>
          )}
        </div>
        <div className="px-5 py-4 shrink-0 flex gap-2" style={{ borderTop: "1px solid var(--cf-border)" }}>
          {step === "input" && (
            <>
              <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm font-semibold cursor-pointer"
                style={{ border: "1px solid var(--cf-border)", color: "var(--cf-text2)" }}>Cancelar</button>
              <button onClick={analyze} disabled={!text.trim()}
                className={`flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${text.trim() ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
                style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "white" }}>
                <Sparkles size={14} /> Analisar
              </button>
            </>
          )}
          {step === "preview" && (
            <>
              <button onClick={() => setStep("input")} className="flex-1 py-3 rounded-xl text-sm font-semibold cursor-pointer"
                style={{ border: "1px solid var(--cf-border)", color: "var(--cf-text2)" }}>← Voltar</button>
              <button onClick={confirmImport} disabled={selected.size === 0}
                className={`flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${selected.size > 0 ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
                style={{ background: "linear-gradient(135deg, #10b981, #059669)", color: "white" }}>
                <Check size={14} /> Importar
              </button>
            </>
          )}
          {step === "saving" && (
            <button disabled className="flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 cursor-not-allowed opacity-50"
              style={{ background: "var(--cf-input)", color: "var(--cf-text2)" }}>
              <Loader2 size={14} className="animate-spin" /> Salvando…
            </button>
          )}
          {step === "done" && (
            <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
              style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "white" }}>
              <Check size={14} /> Concluir
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function CashFlowPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [txs, setTxs] = useState<Tx[]>([]);
  const [pageState, setPageState] = useState<"loading" | "ready" | "error">("loading");
  const [errMsg, setErrMsg] = useState("");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Tx | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | TxType>("all");
  const [search, setSearch] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [previsao, setPrevisao] = useState(0);
  const [previsaoOpen, setPrevisaoOpen] = useState(false);
  const [hideValues, setHideValues] = useState(false);
  const [costCenterBudget, setCostCenterBudget] = useState(0);
  const [pendingBillsTotal, setPendingBillsTotal] = useState(0);
  const [pendingTaxesTotal, setPendingTaxesTotal] = useState(0);

  // ─── Accordion state ──────────────────────────────────────────────────────
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set());
  const [openDays, setOpenDays] = useState<Set<string>>(new Set());

  const toggleMonth = useCallback((yearMonth: string) => {
    setOpenMonths(prev => {
      const next = new Set(prev);
      next.has(yearMonth) ? next.delete(yearMonth) : next.add(yearMonth);
      return next;
    });
  }, []);

  const toggleDay = useCallback((date: string) => {
    setOpenDays(prev => {
      const next = new Set(prev);
      next.has(date) ? next.delete(date) : next.add(date);
      return next;
    });
  }, []);

  // ── Função para atualizar previsão com base em orçamentos, contas a pagar e impostos ──
  const updatePrevisao = useCallback((newCostCenterBudget?: number, newPendingBillsTotal?: number, newPendingTaxesTotal?: number) => {
    if (newCostCenterBudget !== undefined) setCostCenterBudget(newCostCenterBudget);
    if (newPendingBillsTotal !== undefined) setPendingBillsTotal(newPendingBillsTotal);
    if (newPendingTaxesTotal !== undefined) setPendingTaxesTotal(newPendingTaxesTotal);
  }, []);

  // ── Effect para recalcular previsão quando qualquer valor muda ──
  useEffect(() => {
    const newPrevisao = costCenterBudget + pendingBillsTotal + pendingTaxesTotal;
    setPrevisao(newPrevisao);
  }, [costCenterBudget, pendingBillsTotal, pendingTaxesTotal]);

  useEffect(() => {
    if (txs.length > 0) {
      // Abre o mês mais recente automaticamente na primeira carga
      setOpenMonths(prev => {
        if (prev.size > 0) return prev;
        const firstDate = txs.reduce((max, t) => t.date > max ? t.date : max, "");
        const yearMonth = firstDate.substring(0, 7);
        return new Set([yearMonth]);
      });
    }
  }, [txs.length > 0]);

    useEffect(() => {
      let snapUnsub: (() => void) | undefined;
      let snapCenterUnsub: (() => void) | undefined;
      let snapBillsUnsub: (() => void) | undefined;
      let snapTaxesUnsub: (() => void) | undefined;
      let authUnsub: (() => void) | undefined;
      (async () => {
        try {
          const [{ getFirebase }, { onAuthStateChanged }, { collection, query, orderBy, onSnapshot, where }] = await Promise.all([
            import("../../lib/firebase"),
            import("firebase/auth"),
            import("firebase/firestore"),
          ]);
          const { auth, db } = await getFirebase();
          authUnsub = onAuthStateChanged(auth, (u) => {
            if (!u) { window.location.href = "/login"; return; }
            setUid(u.uid);
            setUserName(u.displayName ?? u.email ?? "Usuário");
            setUserEmail(u.email ?? "");

            // ── Listener de transações ──
            snapUnsub?.();
            const q = query(collection(db, "users", u.uid, "cashflow"), orderBy("createdAt", "desc"));
            snapUnsub = onSnapshot(q,
              (snap) => { setTxs(snap.docs.map(d => ({ id: d.id, ...d.data() } as Tx))); setPageState("ready"); },
              (err) => { setErrMsg(`${err.message} (${err.code})`); setPageState("error"); }
            );

            // ── Listener de orçamento total (centros de custo) ──
            snapCenterUnsub?.();
            const centerQ = query(collection(db, "costCenters"), where("userId", "==", u.uid));
            snapCenterUnsub = onSnapshot(
              centerQ,
              (snap) => {
                const totalBudget = snap.docs.reduce((sum, doc) => sum + (doc.data().budget || 0), 0);
                // Calcula previsão com contas pendentes adicionadas
                updatePrevisao(totalBudget);
              },
              (err) => {
                console.debug("Aviso ao sincronizar orçamento:", err.code);
              }
            );

            // ── Listener de contas pendentes (contas a pagar) ──
            snapBillsUnsub?.();
            const billsQ = query(
              collection(db, "users", u.uid, "bills"),
              where("status", "in", ["pendente", "vencido", "agendado"])
            );
            snapBillsUnsub = onSnapshot(
              billsQ,
              (snap) => {
                const billsTotal = snap.docs.reduce((sum, doc) => sum + (doc.data().amount || 0), 0);
                // Atualiza previsão incluindo contas pendentes
                updatePrevisao(undefined, billsTotal);
              },
              (err) => {
                console.debug("Aviso ao sincronizar contas pendentes:", err.code);
              }
            );

            // ── Listener de impostos pendentes ──
            snapTaxesUnsub?.();
            const taxesQ = query(
              collection(db, "users", u.uid, "taxes"),
              where("status", "in", ["nao_pago", "atraso", "agendado"])
            );
            snapTaxesUnsub = onSnapshot(
              taxesQ,
              (snap) => {
                const taxesTotal = snap.docs.reduce((sum, doc) => sum + (doc.data().amount || 0), 0);
                // Atualiza previsão incluindo impostos pendentes
                updatePrevisao(undefined, undefined, taxesTotal);
              },
              (err) => {
                console.debug("Aviso ao sincronizar impostos:", err.code);
              }
            );
          });
        } catch (e: any) { setErrMsg(e.message); setPageState("error"); }
      })();
      return () => { authUnsub?.(); snapUnsub?.(); snapCenterUnsub?.(); snapBillsUnsub?.(); snapTaxesUnsub?.(); };
    }, []);

  async function handleLogout() {
    const { getFirebase } = await import("../../lib/firebase");
    const { signOut } = await import("firebase/auth");
    const { auth } = await getFirebase();
    await signOut(auth);
    window.location.href = "/login";
  }

  async function handleSave(data: Omit<Tx, "id">) {
    if (!uid) throw new Error("Usuário não autenticado");
    const [{ getFirebase }, { doc, updateDoc, collection, addDoc }] = await Promise.all([import("../../lib/firebase"), import("firebase/firestore")]);
    const { db } = await getFirebase();
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    if (editing) await updateDoc(doc(db, "users", uid, "cashflow", editing.id), clean as any);
    else await addDoc(collection(db, "users", uid, "cashflow"), clean);
  }

  async function handleImport(importedTxs: ImportedTx[]) {
    if (!uid) throw new Error("Usuário não autenticado");
    const [{ getFirebase }, { collection, addDoc }] = await Promise.all([import("../../lib/firebase"), import("firebase/firestore")]);
    const { db } = await getFirebase();
    await Promise.all(importedTxs.map(tx => addDoc(collection(db, "users", uid, "cashflow"), { ...tx, createdAt: Date.now() })));
  }

  async function handleDelete() {
    if (!confirmId || !uid || deleting) return;
    setDeleting(true);
    try {
      const [{ getFirebase }, { doc, deleteDoc }] = await Promise.all([import("../../lib/firebase"), import("firebase/firestore")]);
      const { db } = await getFirebase();
      await deleteDoc(doc(db, "users", uid, "cashflow", confirmId));
      setConfirmId(null);
    } catch (e: any) { alert("Erro ao deletar: " + e.message); }
    finally { setDeleting(false); }
  }

  // ─── Métricas ────────────────────────────────────────────────────────────────

  const entradas = useMemo(() => txs.filter(t => t.type === "entrada").reduce((s, t) => s + t.amount, 0), [txs]);
  const saidas = useMemo(() => txs.filter(t => t.type === "saida").reduce((s, t) => s + t.amount, 0), [txs]);
  const saldo = entradas - saidas;
  const superavitDeficit = saldo - previsao;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return txs.filter(t => filter === "all" || t.type === filter).filter(t => !q || t.description.toLowerCase().includes(q) || t.category.toLowerCase().includes(q));
  }, [txs, filter, search]);

  // Agrupar por mês/ano, depois por dia dentro de cada mês
  const grouped = useMemo(() => {
    const monthMap = new Map<string, Map<string, Tx[]>>();
    
    filtered.forEach(t => {
      const yearMonth = t.date.substring(0, 7); // "YYYY-MM" ex: "2026-01"
      
      if (!monthMap.has(yearMonth)) {
        monthMap.set(yearMonth, new Map());
      }
      
      const dayMap = monthMap.get(yearMonth)!;
      const arr = dayMap.get(t.date) ?? [];
      arr.push(t);
      dayMap.set(t.date, arr);
    });
    
    // Converter em estrutura e ordenar (meses mais recentes primeiro)
    const result = [...monthMap.entries()]
      .map(([yearMonth, dayMap]) => ({
        yearMonth,
        days: [...dayMap.entries()].sort((a, b) => b[0].localeCompare(a[0])),
      }))
      .sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));
    
    return result;
  }, [filtered]);

  const displayValue = (val: number) => hideValues ? "• • •" : toBRL(val);

  const kpis = [
    { label: "Meta de gastos", val: previsao, Icon: ClipboardList, ibg: "#eff6ff", color: "#3b82f6" },
    { label: "Entradas", val: entradas, Icon: ArrowUpRight, ibg: "#dcfce7", color: "#059669", sub: `${txs.filter(t => t.type === "entrada").length} lançamentos` },
    { label: "Saídas", val: saidas, Icon: ArrowDownRight, ibg: "#fee2e2", color: "#dc2626", sub: `${txs.filter(t => t.type === "saida").length} lançamentos` },
    { label: "Saldo", val: saldo, Icon: Wallet, ibg: saldo >= 0 ? "#dbeafe" : "#fee2e2", color: saldo >= 0 ? "#3b82f6" : "#dc2626", sub: saldo >= 0 ? "Positivo" : "Negativo" },
    { label: "Resultado", val: superavitDeficit, Icon: TrendingUp, ibg: superavitDeficit >= 0 ? "#dcfce7" : "#fee2e2", color: superavitDeficit >= 0 ? "#059669" : "#dc2626", sub: superavitDeficit >= 0 ? "Acima da meta" : "Abaixo da meta" },
  ];

  if (pageState === "loading") return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ background: "var(--cf-bg)" }}>
      <div className="w-8 h-8 border-2 border-blue-100 border-t-blue-500 rounded-full animate-spin" />
      <p className="text-sm" style={{ color: "var(--cf-text2)" }}>Carregando…</p>
    </div>
  );

  if (pageState === "error") return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center" style={{ background: "var(--cf-bg)" }}>
      <p className="font-heading text-lg font-bold text-rose-500">Erro ao conectar</p>
      <div className="rounded-xl p-4 max-w-sm w-full text-left cf-card" style={{ background: "#fef2f2", border: "1px solid #fecdd3" }}>
        <p className="text-xs font-mono break-all text-rose-700">{errMsg || "Erro desconhecido"}</p>
      </div>
      <button onClick={() => window.location.reload()} className="mt-2 px-5 py-2.5 rounded-xl text-sm font-semibold cursor-pointer"
        style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "white" }}>Tentar novamente</button>
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--cf-bg)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
        *, *::before, *::after { font-family: 'Sora', sans-serif; box-sizing: border-box; }
        .font-heading { font-family: 'Sora', sans-serif; }
        .mono { font-family: 'JetBrains Mono', monospace; }

        .cf-card { background: var(--cf-card); border: 1px solid var(--cf-border); border-radius: 16px; }
         .cf-kpi { background: var(--cf-card); border: 1px solid var(--cf-border); border-radius: 16px;
           transition: all .2s cubic-bezier(.4, 0, .2, 1); }
         .cf-kpi:hover { transform: translateY(-2px); box-shadow: 0 12px 24px rgba(0,0,0,0.08); }
        .cf-kpi.clickable { cursor: pointer; }
        .cf-kpi.clickable:active { transform: translateY(0); }

        .cf-tx { border-bottom: 1px solid var(--cf-border); transition: all .15s; cursor: pointer; }
        .cf-tx:last-child { border-bottom: none; }
        .cf-tx:hover { background: var(--cf-hover); transform: translateX(2px); }
        .cf-tx:hover .cf-txa { opacity: 1; pointer-events: auto; }
        .cf-txa { opacity: 0; pointer-events: none; transition: all .15s; }
        @media (max-width: 639px) { .cf-txa { opacity: 1; pointer-events: auto; } }

        .cf-group-header {
          cursor: pointer;
          transition: background .15s;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          background: var(--cf-txhdr);
          border: none;
          text-align: left;
        }
        .cf-group-header:hover { filter: brightness(0.97); }
        .cf-group-header:active { filter: brightness(0.94); }

        .cf-group-body {
          overflow: hidden;
          transition: max-height .32s cubic-bezier(.4,0,.2,1), opacity .22s ease;
        }
        .cf-group-body.open  { opacity: 1; }
        .cf-group-body.closed { opacity: 0; max-height: 0 !important; }

        .cf-chevron {
          transition: transform .25s cubic-bezier(.4,0,.2,1);
          flex-shrink: 0;
        }
        .cf-chevron.open { transform: rotate(180deg); }

        @keyframes slideUp { from { opacity: 0; transform: translateY(20px) scale(.95) } to { opacity: 1; transform: none } }
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes kIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
        .kin { animation: kIn .35s ease both; }

        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--cf-border); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--cf-text3); }
        .scrollbar-none { scrollbar-width: none; }
        .scrollbar-none::-webkit-scrollbar { display: none; }

        .cf-progress { height: 4px; border-radius: 2px; background: var(--cf-border); overflow: hidden; margin-top: 8px; }
        .cf-progress-fill { height: 100%; border-radius: 2px; transition: width .4s cubic-bezier(.4,0,.2,1); }

        button, a, input, select, textarea { transition: all .12s cubic-bezier(.4, 0, .2, 1) !important; }
        input:focus, select:focus, textarea:focus { border-color: #3b82f6 !important; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1) !important; }
      `}</style>

      <Navbar user={{ displayName: userName, email: userEmail }} activePath="/fluxo-caixa" onLogout={handleLogout} />

      <Modal open={modal} editing={editing} uid={uid} onClose={() => { setModal(false); setEditing(null); }} onSave={handleSave} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImport={handleImport} />
      <PrevisaoModal open={previsaoOpen} value={previsao} onClose={() => setPrevisaoOpen(false)} onSave={setPrevisao} />

      {confirmId && (
        <div className="fixed inset-0 z-990 flex items-center justify-center p-4"
          style={{ background: "rgba(13,17,23,0.5)", backdropFilter: "blur(8px)" }}>
          <div className="cf-card p-6 w-full max-w-xs text-center" style={{ animation: "slideUp .3s cubic-bezier(.34,.1,.64,.88)" }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: "#fee2e2" }}>
              <Trash2 size={20} style={{ color: "#dc2626" }} />
            </div>
            <p className="font-heading text-base font-bold mb-1" style={{ color: "var(--cf-text)" }}>Excluir transação?</p>
            <p className="text-xs mb-5" style={{ color: "var(--cf-text2)" }}>Esta ação não pode ser desfeita.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmId(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold cursor-pointer"
                style={{ border: "1px solid var(--cf-border)", color: "var(--cf-text2)" }}>Cancelar</button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #ef4444, #dc2626)", color: "white" }}>
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <><Trash2 size={14} /> Excluir</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-5 overflow-y-auto overflow-x-hidden pb-24 lg:pb-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-bold leading-tight" style={{ color: "var(--cf-text)" }}>Fluxo de caixa</h1>
            <p className="text-xs mt-1" style={{ color: "var(--cf-text2)" }}>Bem-vindo de volta, {userName.split(" ")[0]}</p>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <button onClick={() => setHideValues(!hideValues)}
              className="p-2 hover:bg-opacity-50 rounded-xl transition-colors cursor-pointer"
              style={{ background: "var(--cf-input)", color: "var(--cf-text2)" }} title="Ocultar valores">
              {hideValues ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
            <button onClick={() => setImportOpen(true)}
              className="flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-xl cursor-pointer transition-all"
              style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "white" }}>
              <Sparkles size={13} /> Importar extrato
            </button>
            <button onClick={() => { setEditing(null); setModal(true); }}
              className="flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-xl cursor-pointer transition-all"
              style={{ background: "linear-gradient(135deg, #10b981, #059669)", color: "white" }}>
              <Plus size={14} /> Nova transação
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
          {kpis.map(({ label, val, Icon, ibg, color, sub}, idx) => {
            const total = entradas + saidas;
            const pct = total > 0 ? (Math.abs(val) / total) * 100 : 0;
            const showBar = label === "Entradas" || label === "Saídas";
            const isSaldo = label === "Saldo" || label === "Resultado";
            return (
              <div key={label} className={`cf-kpi kin p-3 sm:p-4 flex flex-col gap-2`}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold" style={{ color: "var(--cf-text2)" }}>{label}</p>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: ibg }}>
                    <Icon size={15} style={{ color }} strokeWidth={2} />
                  </div>
                </div>
                <div>
                  <p className="font-heading font-bold text-base sm:text-[17px] mono leading-tight tracking-tight" style={{ color }}>
                    {isSaldo && val > 0 ? "+" : ""}{displayValue(val)}
                  </p>
                  <p className="text-xs mt-1" style={{ color: "var(--cf-text3)" }}>{sub}</p>
                </div>
                {showBar && total > 0 && (
                  <div className="cf-progress">
                    <div className="cf-progress-fill" style={{ width: `${Math.min(pct, 100)}%`, background: color, opacity: 0.8 }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Banner importação mobile */}
        <button onClick={() => setImportOpen(true)} className="sm:hidden w-full cf-card p-4 flex items-center gap-3 cursor-pointer hover:shadow-md transition-all">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)" }}>
            <Sparkles size={16} className="text-white" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-heading font-bold" style={{ color: "var(--cf-text)" }}>Importar com IA</p>
            <p className="text-xs" style={{ color: "var(--cf-text2)" }}>Extraia dados do seu extrato automaticamente</p>
          </div>
          <ArrowUpRight size={16} style={{ color: "var(--cf-text3)" }} />
        </button>

        {/* Toolbar */}
        <div className="cf-card p-3.5 space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--cf-text3)" }} />
            <input className="w-full rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none cursor-text"
              style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }}
              placeholder="Buscar descrição ou categoria…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {([
              { f: "all" as const, label: "Todos", icon: null as LucideIcon | null },
              { f: "entrada" as const, label: "Entradas", icon: BanknoteArrowUp as LucideIcon },
              { f: "saida" as const, label: "Saídas", icon: BanknoteArrowDown as LucideIcon },
            ]).map(({ f, label, icon: Icon }) => (
              <button key={f} onClick={() => setFilter(f)}
                className="shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border cursor-pointer transition-all select-none"
                style={filter === f
                  ? f === "all"
                    ? { background: "var(--cf-text)", color: "var(--cf-bg)", borderColor: "transparent" }
                    : f === "entrada"
                      ? { background: "linear-gradient(135deg, #dcfce7, #c6f6d5)", color: "#15803d", borderColor: "transparent", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }
                      : { background: "linear-gradient(135deg, #fee2e2, #fecaca)", color: "#b91c1c", borderColor: "transparent", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }
                  : { background: "transparent", color: "var(--cf-text2)", borderColor: "var(--cf-border)" }}>
                {Icon && <Icon size={12} />}
                {label}
              </button>
            ))}
            <span className="ml-auto text-xs shrink-0 pl-2 font-medium" style={{ color: "var(--cf-text3)" }}>
              {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Lista */}
        {grouped.length === 0 ? (
          <div className="cf-card p-12 flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "var(--cf-input)" }}>
              <TrendingUp size={24} style={{ color: "var(--cf-text3)" }} />
            </div>
            <p className="font-heading text-base font-bold" style={{ color: "var(--cf-text)" }}>
              {search || filter !== "all" ? "Nenhum resultado" : "Nenhuma transação"}
            </p>
            <p className="text-xs max-w-xs" style={{ color: "var(--cf-text2)" }}>
              {search || filter !== "all" ? "Tente ajustar os filtros." : "Adicione manualmente ou importe do seu extrato bancário."}
            </p>
            {!search && filter === "all" && (
              <div className="flex gap-2 mt-2">
                <button onClick={() => { setEditing(null); setModal(true); }}
                  className="flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-xl cursor-pointer"
                  style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "white" }}>
                  <Plus size={14} /> Adicionar
                </button>
                <button onClick={() => setImportOpen(true)}
                  className="flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-xl cursor-pointer"
                  style={{ border: "1px solid var(--cf-border)", background: "var(--cf-input)", color: "var(--cf-text)" }}>
                  <Sparkles size={14} /> Importar
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-5 sm:space-y-6">
            {/* ═══ MESES ═══ */}
            {grouped.map(({ yearMonth, days }) => {
              const isMonthOpen = openMonths.has(yearMonth);
              const monthTotal = days.reduce((sum, [, items]) => {
                return sum + items.reduce((s, t) => t.type === "entrada" ? s + t.amount : s - t.amount, 0);
              }, 0);
              const monthEntradas = days.reduce((sum, [, items]) => {
                return sum + items.filter(t => t.type === "entrada").reduce((s, t) => s + t.amount, 0);
              }, 0);
              const monthSaidas = days.reduce((sum, [, items]) => {
                return sum + items.filter(t => t.type === "saida").reduce((s, t) => s + t.amount, 0);
              }, 0);
              const totalTxs = days.reduce((sum, [, items]) => sum + items.length, 0);

              return (
                <div key={yearMonth} className="space-y-2">
                  {/* ── Header do Mês ── */}
                  <button
                    onClick={() => toggleMonth(yearMonth)}
                    className="w-full flex items-center justify-between p-4 rounded-xl font-semibold transition-all hover:opacity-80 cursor-pointer"
                    style={{
                      background: "var(--cf-card)",
                      color: "var(--cf-text)",
                      border: "none"
                    }}
                  >
                    <div className="flex items-center gap-3 flex-1 text-left">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: "var(--cf-input)" }}>
                        <Calendar size={18} style={{ color: "var(--cf-text2)" }} />
                      </div>
                      <div>
                        <p className="text-base font-heading font-bold" style={{ color: "var(--cf-text)" }}>{labelMonthYear(yearMonth)}</p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--cf-text2)" }}>
                          {totalTxs} {totalTxs === 1 ? "transação" : "transações"}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right hidden sm:block">
                        {monthEntradas > 0 && (
                          <p className="text-xs font-semibold" style={{ color: "#059669" }}>
                            +{displayValue(monthEntradas)}
                          </p>
                        )}
                        {monthSaidas > 0 && (
                          <p className="text-xs font-semibold" style={{ color: "#dc2626" }}>
                            -{displayValue(monthSaidas)}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="mono text-sm font-bold block" style={{ color: monthTotal >= 0 ? "#059669" : "#dc2626" }}>
                          {hideValues ? "• • •" : (monthTotal >= 0 ? "+" : "") + toBRL(monthTotal)}
                        </span>
                      </div>
                      <ChevronDown
                        size={18}
                        className={`cf-chevron transition-transform ${isMonthOpen ? "open" : ""}`}
                        style={{ color: "var(--cf-text3)" }}
                      />
                    </div>
                  </button>

                  {/* ── Dias do Mês (colapsável) ── */}
                  {isMonthOpen && (
                    <div className="space-y-2 ml-2">
                      {days.map(([date, items]) => {
                        const isDayOpen = openDays.has(date);
                        const dayNet = items.reduce((s, t) => t.type === "entrada" ? s + t.amount : s - t.amount, 0);
                        const dayEntradas = items.filter(t => t.type === "entrada").reduce((s, t) => s + t.amount, 0);
                        const daySaidas = items.filter(t => t.type === "saida").reduce((s, t) => s + t.amount, 0);
                        const maxH = `${items.length * 72}px`;

                        return (
                          <div key={date} className="cf-card overflow-hidden">

                            {/* ── Header do Dia ── */}
                            <button
                              className="cf-group-header"
                              onClick={() => toggleDay(date)}
                              aria-expanded={isDayOpen}
                              style={{
                                borderBottom: isDayOpen ? "1px solid var(--cf-border)" : "none",
                                borderRadius: isDayOpen ? "16px 16px 0 0" : "16px",
                                padding: "14px 18px",
                              }}
                            >
                              <div className="flex items-center gap-2.5 flex-1">
                                <div className="flex items-center justify-center w-9 h-9 rounded-lg shrink-0"
                                  style={{ background: "var(--cf-input)" }}>
                                  <Calendar size={14} style={{ color: "var(--cf-text3)" }} />
                                </div>
                                <div className="text-left">
                                  <p className="text-sm font-semibold" style={{ color: "var(--cf-text)" }}>{labelDate(date)}</p>
                                  <p className="text-xs mt-0.5" style={{ color: "var(--cf-text2)" }}>
                                    {items.length} {items.length === 1 ? "transação" : "transações"}
                                  </p>
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-2.5 shrink-0">
                                <div className="text-right hidden sm:block">
                                  {dayEntradas > 0 && (
                                    <p className="text-xs font-semibold" style={{ color: "#059669" }}>
                                      +{displayValue(dayEntradas)}
                                    </p>
                                  )}
                                  {daySaidas > 0 && (
                                    <p className="text-xs font-semibold" style={{ color: "#dc2626" }}>
                                      -{displayValue(daySaidas)}
                                    </p>
                                  )}
                                </div>
                                <div className="text-right">
                                  <span className="mono text-xs font-bold block" style={{ color: dayNet >= 0 ? "#059669" : "#dc2626" }}>
                                    {hideValues ? "• • •" : (dayNet >= 0 ? "+" : "") + toBRL(dayNet)}
                                  </span>
                                </div>
                                <ChevronDown
                                  size={14}
                                  className={`cf-chevron ${isDayOpen ? "open" : ""}`}
                                  style={{ color: "var(--cf-text3)" }}
                                />
                              </div>
                            </button>

                            {/* ── Transações do Dia (colapsável) ── */}
                            <div
                              className={`cf-group-body ${isDayOpen ? "open" : "closed"}`}
                              style={{ maxHeight: isDayOpen ? maxH : "0px" }}
                            >
                              {items.map((tx) => {
                                const CatIcon = CAT_ICON[tx.category] ?? (tx.type === "entrada" ? ArrowUpRight : ArrowDownRight);
                                return (
                                  <div key={tx.id} className="cf-tx flex items-center gap-2 sm:gap-3 px-4 sm:px-5 py-3.5">
                                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center shrink-0"
                                      style={{ background: tx.type === "entrada" ? "#dcfce7" : "#fee2e2" }}>
                                      <CatIcon size={16} style={{ color: tx.type === "entrada" ? "#059669" : "#dc2626" }} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-start sm:items-center gap-1.5 flex-col sm:flex-row sm:gap-2 mb-0.5">
                                        <span className="text-sm font-semibold truncate" style={{ color: "var(--cf-text)" }}>{tx.description}</span>
                                        <span className="text-xs font-medium px-2 py-0.5 rounded-full shrink-0"
                                          style={{ background: tx.type === "entrada" ? "#dcfce7" : "#fee2e2", color: tx.type === "entrada" ? "#15803d" : "#991b1b" }}>
                                          {tx.category}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        {tx.note && <p className="text-xs truncate" style={{ color: "var(--cf-text2)" }}>📝 {tx.note}</p>}
                                        {tx.nfUrl && (
                                          <a href={tx.nfUrl} target="_blank" rel="noreferrer"
                                            className="flex items-center gap-1 text-xs font-medium shrink-0 transition-colors hover:opacity-70 cursor-pointer"
                                            style={{ color: "#3b82f6" }} title={tx.nfName ?? "Ver Nota Fiscal"}>
                                            <Paperclip size={11} />
                                            <span className="hidden sm:inline truncate max-w-24">{tx.nfName ?? "NF"}</span>
                                            <span className="sm:hidden">NF</span>
                                          </a>
                                        )}
                                      </div>
                                    </div>
                                    <span className="mono text-sm font-bold shrink-0" style={{ color: tx.type === "entrada" ? "#059669" : "#dc2626" }}>
                                      {hideValues ? "• • •" : (tx.type === "entrada" ? "+" : "-") + toBRL(tx.amount)}
                                    </span>
                                    <div className="cf-txa flex items-center gap-1 shrink-0">
                                      <button onClick={() => { setEditing(tx); setModal(true); }}
                                        className="p-1.5 hover:bg-opacity-70 rounded-lg transition-colors cursor-pointer"
                                        style={{ background: "var(--cf-input)", color: "var(--cf-text2)" }}>
                                        <Edit3 size={13} />
                                      </button>
                                      <button onClick={() => setConfirmId(tx.id)}
                                        className="p-1.5 hover:bg-opacity-70 rounded-lg transition-colors cursor-pointer"
                                        style={{ background: "var(--cf-input)", color: "var(--cf-text2)" }}>
                                        <Trash2 size={13} />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* FAB mobile */}
      <div className="lg:hidden fixed z-20 flex flex-col gap-2" style={{ bottom: 74, right: 16 }}>
        <button onClick={() => setImportOpen(true)}
          className="w-11 h-11 rounded-xl flex items-center justify-center active:scale-95 transition-transform cursor-pointer"
          style={{ background: "var(--cf-card)", border: "1px solid var(--cf-border)", color: "#3b82f6" }}>
          <Sparkles size={17} />
        </button>
        <button onClick={() => { setEditing(null); setModal(true); }}
          className="rounded-2xl flex items-center justify-center active:scale-95 transition-transform cursor-pointer"
          style={{ width: 52, height: 52, background: "linear-gradient(135deg, #10b981, #059669)", color: "white", boxShadow: "0 8px 24px rgba(16, 185, 129, 0.35)" }}>
          <Plus size={22} />
        </button>
      </div>
    </div>
  );
}