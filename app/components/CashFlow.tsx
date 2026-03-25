"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  TrendingUp, Plus, X, Check, ArrowUpRight, ArrowDownRight,
  Search, Calendar, ChevronDown, Trash2, Edit3, ClipboardList,
  LayoutDashboard, FileText, CreditCard, Settings, BarChart2,
  Users, DollarSign, LogOut, Bell, Loader2, Wallet,
  ShoppingCart, Briefcase, UserCheck, PiggyBank, CircleDollarSign,
  Truck, UsersRound, Building2, Receipt, Megaphone, Monitor, Package,
  BanknoteArrowUp, BanknoteArrowDown, Sparkles, Upload, CheckCircle2,
  Paperclip, ExternalLink, FileScan, Moon, Sun,
  type LucideIcon,
} from "lucide-react";
import Navbar from "./Navbar";
import { useTheme } from "../hooks/useTheme";
// ─── Tipos ───────────────────────────────────────────────────────────────────

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

// ─── Constantes ──────────────────────────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

const toBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const labelDate = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

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

// ─── Modal de transação manual ────────────────────────────────────────────────

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
  const [nfPreview, setNfPreview] = useState<string>("");
  const [nfUrl, setNfUrl] = useState<string>("");
  const [nfName, setNfName] = useState<string>("");
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
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const amount = parseAmount(rawAmt);
  const descOk = desc.trim().length >= 2;
  const catOk = cat !== "";
  const amtOk = amount > 0;
  const dateOk = date !== "";
  const canSave = descOk && catOk && amtOk && dateOk;
  const missing = [!descOk && "descrição", !catOk && "categoria", !amtOk && "valor", !dateOk && "data"].filter(Boolean).join(", ");

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
      if (isXml) { const xmlText = await nfFile.text(); body = { type: "xml", content: xmlText }; }
      else { const mediaType = nfFile.type || (nfFile.name.endsWith(".pdf") ? "application/pdf" : "image/jpeg"); body = { type: "file", base64, mediaType }; }
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
          setErr(`NF nao anexada: ${uploadErr.message}. Salvando sem arquivo.`);
          await new Promise(r => setTimeout(r, 2500)); setErr("");
        }
      }
      const saveData: any = { type, description: desc.trim(), category: cat, amount, date, note: note.trim(), createdAt: editing?.createdAt ?? Date.now() };
      if (nfData.url) saveData.nfUrl = nfData.url;
      if (nfData.name) saveData.nfName = nfData.name;
      await onSave(saveData); onClose();
    } catch (e: any) { setErr(e?.message ?? "Erro ao salvar"); setSaving(false); }
  }

  const hasNf = nfPreview || nfUrl;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(10,22,40,0.75)", backdropFilter: "blur(6px)" }}>
      <div className="w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl overflow-hidden"
        style={{ background: "var(--cf-card)", boxShadow: "0 32px 80px rgba(10,22,40,0.3)", animation: "mIn .25s cubic-bezier(.22,.68,0,1.2)" }}>
        <div className="flex justify-center pt-3 pb-1 sm:hidden"><div className="w-10 h-1.5 rounded-full" style={{ background: "var(--cf-border)" }} /></div>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--cf-border)" }}>
          <div>
            <p className="font-extrabold text-base" style={{ color: "var(--cf-text)" }}>{editing ? "Editar transação" : "Nova transação"}</p>
            <p className="text-xs" style={{ color: "var(--cf-text2)" }}>Preencha os campos ou anexe uma NF</p>
          </div>
          <button onClick={() => !saving && onClose()} className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer" style={{ background: "var(--cf-input)", color: "var(--cf-text2)" }}><X size={15} /></button>
        </div>
        <div className="px-5 pt-4 pb-6 space-y-4 overflow-y-auto" style={{ maxHeight: "82vh" }}>
          {err && <div className="rounded-xl px-3 py-2.5 text-xs" style={{ background: "#fff1f2", border: "1px solid #fecdd3", color: "#be123c" }}>⚠ {err}</div>}

          {/* NF */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wide flex items-center gap-1.5" style={{ color: "var(--cf-text2)" }}>
              <Paperclip size={12} /> Nota Fiscal <span className="font-normal normal-case" style={{ color: "var(--cf-text3)" }}>(opcional)</span>
            </label>
            {hasNf ? (
              <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "#eff6ff", border: "1px solid #bfdbfe" }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#dbeafe" }}><FileText size={16} style={{ color: "#1d4ed8" }} /></div>
                <div className="flex-1 min-w-0"><p className="text-xs font-semibold truncate" style={{ color: "#1e3a5f" }}>{nfName || "Nota Fiscal"}</p><p className="text-xs" style={{ color: "#60a5fa" }}>Anexada ✓</p></div>
                <div className="flex items-center gap-1 shrink-0">
                  {(nfPreview || nfUrl) && (
                    <a href={nfPreview || nfUrl} target="_blank" rel="noreferrer" className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer" style={{ background: "#dbeafe", color: "#1d4ed8" }}><ExternalLink size={12} /></a>
                  )}
                  <button onClick={() => { setNfFile(null); setNfPreview(""); setNfUrl(""); setNfName(""); }} className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer" style={{ background: "#dbeafe", color: "#60a5fa" }}><X size={12} /></button>
                </div>
              </div>
            ) : (
              <button onClick={() => nfRef.current?.click()} className="w-full border-2 border-dashed rounded-xl p-4 flex items-center gap-3 transition-all cursor-pointer" style={{ borderColor: "var(--cf-border)", background: "transparent" }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--cf-input)" }}><Upload size={15} style={{ color: "var(--cf-text3)" }} /></div>
                <div className="text-left">
                  <p className="text-sm font-semibold" style={{ color: "var(--cf-text)" }}>Anexar NF</p>
                  <p className="text-xs" style={{ color: "var(--cf-text2)" }}>PDF, imagem ou XML</p>
                </div>
                <input ref={nfRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.xml" className="hidden" onChange={handleNfSelect} />
              </button>
            )}
            {nfFile && (
              <button onClick={scanNf} disabled={scanning}
                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${scanning ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                style={{ borderColor: "#c4b5fd", background: "#f5f3ff", color: "#6d28d9" }}>
                {scanning ? <><Loader2 size={14} className="animate-spin" /> Lendo NF com IA…</> : <><FileScan size={14} /> Ler NF com IA e preencher campos</>}
              </button>
            )}
          </div>

          <div className="h-px" style={{ background: "var(--cf-border)" }} />

          {/* Tipo */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl" style={{ background: "var(--cf-input)" }}>
            {(["entrada", "saida"] as TxType[]).map((t) => (
              <button key={t} onClick={() => { setType(t); setCat(""); }}
                className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-bold transition-all cursor-pointer`}
                style={type === t ? { background: t === "entrada" ? "#10b981" : "#ef4444", color: "white" } : { background: "transparent", color: "var(--cf-text2)" }}>
                {t === "entrada" ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
                {t === "entrada" ? "Entrada" : "Saída"}
              </button>
            ))}
          </div>

          {/* Campos */}
          {[
            { label: "Descrição *", input: <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ex: Cliente XYZ, Aluguel…" className="w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all" style={{ background: "var(--cf-input)", border: "1px solid var(--cf-border)", color: "var(--cf-text)" }} /> },
          ].map(({ label, input }) => (
            <div key={label} className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--cf-text2)" }}>{label}</label>
              {input}
            </div>
          ))}

          {/* Categoria */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--cf-text2)" }}>Categoria *</label>
            <div className="relative">
              <select value={cat} onChange={(e) => setCat(e.target.value)} className="w-full appearance-none rounded-xl px-3 py-2.5 pr-9 text-sm outline-none cursor-pointer transition-all" style={{ background: "var(--cf-input)", border: "1px solid var(--cf-border)", color: "var(--cf-text)" }}>
                <option value="">— Selecione —</option>
                {CAT[type].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--cf-text2)" }} />
            </div>
          </div>

          {/* Valor + Data */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--cf-text2)" }}>Valor (R$) *</label>
              <input inputMode="decimal" value={rawAmt} onChange={(e) => setRawAmt(e.target.value)} placeholder="0,00" className="w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all" style={{ background: "var(--cf-input)", border: "1px solid var(--cf-border)", color: "var(--cf-text)" }} />
              {rawAmt.length > 0 && !amtOk && <p className="text-xs text-rose-400">Valor inválido</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--cf-text2)" }}>Data *</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none cursor-pointer transition-all" style={{ background: "var(--cf-input)", border: "1px solid var(--cf-border)", color: "var(--cf-text)" }} />
            </div>
          </div>

          {/* Observação */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--cf-text2)" }}>Observação <span className="font-normal normal-case" style={{ color: "var(--cf-text3)" }}>(opcional)</span></label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="NF, contrato, parcela…" className="w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all" style={{ background: "var(--cf-input)", border: "1px solid var(--cf-border)", color: "var(--cf-text)" }} />
          </div>

          <button onClick={submit} disabled={!canSave || saving}
            className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${canSave && !saving ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
            style={canSave && !saving ? { background: type === "entrada" ? "#10b981" : "#ef4444", color: "white" } : { background: "var(--cf-input)", color: "var(--cf-text2)" }}>
            {saving ? <><Loader2 size={15} className="animate-spin" /> Salvando…</> : <><Check size={15} /> {editing ? "Salvar alterações" : type === "entrada" ? "Registrar entrada" : "Registrar saída"}</>}
          </button>
          {!canSave && <p className="text-center text-rose-400 text-xs font-medium">Faltando: {missing}</p>}
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
    const file = e.target.files?.[0]; if (!file) return;
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
      setPreview(normalized); setSelected(new Set(normalized.map((_, i) => i))); setStep("preview");
    } catch (e: any) { setErrMsg(`Erro ao interpretar: ${e.message}`); setStep("input"); }
  };

  const confirmImport = async () => {
    const toImport = preview.filter((_, i) => selected.has(i));
    if (!toImport.length) return;
    setStep("saving");
    try { await onImport(toImport); setStep("done"); }
    catch (e: any) { setErrMsg(e.message); setStep("preview"); }
  };

  const toggleAll = () => { if (selected.size === preview.length) setSelected(new Set()); else setSelected(new Set(preview.map((_, i) => i))); };
  const toggle = (i: number) => { const s = new Set(selected); s.has(i) ? s.delete(i) : s.add(i); setSelected(s); };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(10,22,40,0.80)", backdropFilter: "blur(8px)" }}>
      <div className="w-full sm:max-w-lg sm:rounded-2xl rounded-t-3xl overflow-hidden"
        style={{ background: "var(--cf-card)", boxShadow: "0 32px 80px rgba(10,22,40,0.35)", animation: "mIn .25s cubic-bezier(.22,.68,0,1.2)", maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
        <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0"><div className="w-10 h-1.5 rounded-full" style={{ background: "var(--cf-border)" }} /></div>
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: "1px solid var(--cf-border)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "var(--cf-input)" }}><Sparkles size={15} style={{ color: "#3b82f6" }} /></div>
            <div>
              <p className="font-extrabold text-base leading-tight" style={{ color: "var(--cf-text)" }}>Importar com IA</p>
              <p className="text-xs" style={{ color: "var(--cf-text2)" }}>
                {step === "input" && "Cole ou faça upload do extrato"}
                {step === "loading" && "Analisando…"}
                {step === "preview" && `${preview.length} transações encontradas`}
                {step === "saving" && "Salvando…"}
                {step === "done" && "Importado com sucesso!"}
              </p>
            </div>
          </div>
          {step !== "saving" && (
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-colors" style={{ background: "var(--cf-input)", color: "var(--cf-text2)" }}><X size={15} /></button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {step === "input" && (
            <>
              {errMsg && <div className="rounded-xl px-3 py-2.5 text-xs flex items-start gap-2" style={{ background: "#fff1f2", border: "1px solid #fecdd3", color: "#be123c" }}><span className="shrink-0 mt-0.5">⚠</span> {errMsg}</div>}
              <button onClick={() => fileRef.current?.click()} className="w-full border-2 border-dashed rounded-xl p-5 flex flex-col items-center gap-2 transition-all cursor-pointer" style={{ borderColor: "var(--cf-border)" }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors" style={{ background: "var(--cf-input)" }}><Upload size={18} style={{ color: "var(--cf-text2)" }} /></div>
                <p className="text-sm font-semibold" style={{ color: "var(--cf-text)" }}>Upload de arquivo</p>
                <p className="text-xs" style={{ color: "var(--cf-text2)" }}>.txt ou .csv</p>
                <input ref={fileRef} type="file" accept=".txt,.csv" className="hidden" onChange={handleFile} />
              </button>
              <div className="flex items-center gap-3"><div className="flex-1 h-px" style={{ background: "var(--cf-border)" }} /><span className="text-xs font-medium" style={{ color: "var(--cf-text2)" }}>ou cole o texto</span><div className="flex-1 h-px" style={{ background: "var(--cf-border)" }} /></div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--cf-text2)" }}>Texto do extrato</label>
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7}
                  placeholder={`Exemplo:\n01/03/2026  PIX RECEBIDO CLIENTE ABC    CR  R$ 3.500,00\n05/03/2026  ALUGUEL SALA COMERCIAL       DB  R$ 2.200,00`}
                  className="w-full rounded-xl px-3 py-2.5 text-xs font-mono outline-none resize-none" style={{ background: "var(--cf-input)", border: "1px solid var(--cf-border)", color: "var(--cf-text)" }} />
                <p className="text-xs" style={{ color: "var(--cf-text2)" }}>{text.length} caracteres</p>
              </div>
            </>
          )}

          {step === "loading" && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "var(--cf-input)" }}><Sparkles size={28} style={{ color: "#3b82f6" }} /></div>
                <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "var(--cf-card)" }}><Loader2 size={13} className="animate-spin" style={{ color: "#3b82f6" }} /></div>
              </div>
              <div className="text-center">
                <p className="font-bold text-sm" style={{ color: "var(--cf-text)" }}>IA analisando extrato…</p>
                <p className="text-xs mt-1" style={{ color: "var(--cf-text2)" }}>Identificando transações, valores e categorias</p>
              </div>
              <div className="w-48 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--cf-border)" }}><div className="h-full rounded-full animate-pulse" style={{ width: "60%", background: "#3b82f6" }} /></div>
            </div>
          )}

          {(step === "preview" || step === "saving") && (
            <>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Entradas", val: preview.filter(t => t.type === "entrada").length, color: "#15803d", bg: "#dcfce7" },
                  { label: "Saídas", val: preview.filter(t => t.type === "saida").length, color: "#be123c", bg: "#ffe4e6" },
                  { label: "Selecionados", val: selected.size, color: "#1d4ed8", bg: "#dbeafe" },
                ].map(({ label, val, color, bg }) => (
                  <div key={label} className="rounded-xl p-2.5 text-center" style={{ background: bg }}>
                    <p className="text-lg font-extrabold" style={{ color }}>{val}</p>
                    <p className="text-xs text-slate-500">{label}</p>
                  </div>
                ))}
              </div>
              <button onClick={toggleAll} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer text-sm font-medium transition-colors" style={{ border: "1px solid var(--cf-border)", color: "var(--cf-text)" }}>
                <div className="w-4 h-4 rounded border-2 flex items-center justify-center transition-colors" style={selected.size === preview.length ? { background: "#2563eb", borderColor: "#2563eb" } : { borderColor: "var(--cf-border)" }}>
                  {selected.size === preview.length && <Check size={10} className="text-white" />}
                </div>
                {selected.size === preview.length ? "Desmarcar todos" : "Selecionar todos"}
                <span className="ml-auto text-xs" style={{ color: "var(--cf-text2)" }}>{selected.size}/{preview.length}</span>
              </button>
              <div className="space-y-1.5">
                {preview.map((tx, i) => {
                  const CatIcon = CAT_ICON[tx.category] ?? (tx.type === "entrada" ? ArrowUpRight : ArrowDownRight);
                  const isSel = selected.has(i);
                  return (
                    <button key={i} onClick={() => toggle(i)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all cursor-pointer text-left ${!isSel ? "opacity-50" : ""}`}
                      style={isSel ? { borderColor: tx.type === "entrada" ? "#6ee7b7" : "#fca5a5", background: tx.type === "entrada" ? "#f0fdf4" : "#fff1f2" } : { borderColor: "var(--cf-border)", background: "var(--cf-input)" }}>
                      <div className="w-4 h-4 rounded border-2 flex items-center justify-center shrink-0" style={isSel ? { background: "#2563eb", borderColor: "#2563eb" } : { borderColor: "var(--cf-border)" }}>
                        {isSel && <Check size={9} className="text-white" />}
                      </div>
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: tx.type === "entrada" ? "#d1fae5" : "#fee2e2" }}>
                        <CatIcon size={14} style={{ color: tx.type === "entrada" ? "#059669" : "#dc2626" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate" style={{ color: "var(--cf-text)" }}>{tx.description}</p>
                        <p className="text-xs truncate" style={{ color: "var(--cf-text2)" }}>{tx.category} · {labelDate(tx.date)}</p>
                      </div>
                      <span className="text-xs font-bold mono shrink-0" style={{ color: tx.type === "entrada" ? "#059669" : "#dc2626" }}>
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
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "#d1fae5" }}><CheckCircle2 size={32} style={{ color: "#059669" }} /></div>
              <p className="font-bold text-base" style={{ color: "var(--cf-text)" }}>Importado com sucesso!</p>
              <p className="text-sm text-center" style={{ color: "var(--cf-text2)" }}>{selected.size} transação{selected.size !== 1 ? "ões" : ""} adicionada{selected.size !== 1 ? "s" : ""}.</p>
            </div>
          )}
        </div>

        <div className="px-5 py-4 shrink-0 flex gap-2" style={{ borderTop: "1px solid var(--cf-border)" }}>
          {step === "input" && (
            <><button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm font-semibold cursor-pointer transition-colors" style={{ border: "1px solid var(--cf-border)", color: "var(--cf-text2)" }}>Cancelar</button>
              <button onClick={analyze} disabled={!text.trim()} className={`flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${text.trim() ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
                style={{ background: "#2563eb", color: "white" }}>
                <Sparkles size={14} /> Analisar com IA
              </button></>
          )}
          {step === "preview" && (
            <><button onClick={() => setStep("input")} className="flex-1 py-3 rounded-xl text-sm font-semibold cursor-pointer" style={{ border: "1px solid var(--cf-border)", color: "var(--cf-text2)" }}>← Voltar</button>
              <button onClick={confirmImport} disabled={selected.size === 0} className={`flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${selected.size > 0 ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
                style={{ background: "#10b981", color: "white" }}>
                <Check size={14} /> Importar {selected.size}
              </button></>
          )}
          {step === "saving" && <button disabled className="flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 cursor-not-allowed opacity-50" style={{ background: "var(--cf-input)", color: "var(--cf-text2)" }}><Loader2 size={14} className="animate-spin" /> Salvando…</button>}
          {step === "done" && <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 cursor-pointer" style={{ background: "#2563eb", color: "white" }}><Check size={14} /> Concluir</button>}
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

  const { dark } = useTheme();

  useEffect(() => {
    let snapUnsub: (() => void) | undefined;
    let authUnsub: (() => void) | undefined;
    (async () => {
      try {
        const [{ getFirebase }, { onAuthStateChanged }, { collection, query, orderBy, onSnapshot }] = await Promise.all([
          import("../../lib/firebase"), import("firebase/auth"), import("firebase/firestore"),
        ]);
        const { auth, db } = await getFirebase();
        authUnsub = onAuthStateChanged(auth, (u) => {
          if (!u) { window.location.href = "/login"; return; }
          setUid(u.uid); setUserName(u.displayName ?? u.email ?? "Usuário"); setUserEmail(u.email ?? "");
          snapUnsub?.();
          const q = query(collection(db, "users", u.uid, "cashflow"), orderBy("createdAt", "desc"));
          snapUnsub = onSnapshot(q,
            (snap) => { setTxs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Tx))); setPageState("ready"); },
            (err) => { setErrMsg(`${err.message} (${err.code})`); setPageState("error"); }
          );
        });
      } catch (e: any) { setErrMsg(e.message); setPageState("error"); }
    })();
    return () => { authUnsub?.(); snapUnsub?.(); };
  }, []);

  async function handleLogout() {
    const { getFirebase } = await import("../../lib/firebase");
    const { signOut } = await import("firebase/auth");
    const { auth } = await getFirebase();
    await signOut(auth); window.location.href = "/login";
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
    await Promise.all(importedTxs.map((tx) => addDoc(collection(db, "users", uid, "cashflow"), { ...tx, createdAt: Date.now() })));
  }

  async function handleDelete() {
    if (!confirmId || !uid || deleting) return;
    setDeleting(true);
    try {
      const [{ getFirebase }, { doc, deleteDoc }] = await Promise.all([import("../../lib/firebase"), import("firebase/firestore")]);
      const { db } = await getFirebase();
      await deleteDoc(doc(db, "users", uid, "cashflow", confirmId)); setConfirmId(null);
    } catch (e: any) { alert("Erro ao deletar: " + e.message); }
    finally { setDeleting(false); }
  }

  const entradas = useMemo(() => txs.filter(t => t.type === "entrada").reduce((s, t) => s + t.amount, 0), [txs]);
  const saidas = useMemo(() => txs.filter(t => t.type === "saida").reduce((s, t) => s + t.amount, 0), [txs]);
  const saldo = entradas - saidas;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return txs.filter(t => filter === "all" || t.type === filter)
      .filter(t => !q || t.description.toLowerCase().includes(q) || t.category.toLowerCase().includes(q));
  }, [txs, filter, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, Tx[]>();
    filtered.forEach(t => { const arr = map.get(t.date) ?? []; arr.push(t); map.set(t.date, arr); });
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  // CSS variables baseadas no dark mode da Navbar
  const theme = dark ? {
    "--cf-bg": "#0d1117",
    "--cf-card": "#1c2230",
    "--cf-input": "#131922",
    "--cf-border": "#2a3548",
    "--cf-text": "#e2e8f0",
    "--cf-text2": "#8899b4",
    "--cf-text3": "#4a5568",
    "--cf-hover": "#1e2a3a",
    "--cf-txhdr": "#161b22",
  } : {
    "--cf-bg": "#f8fafc",
    "--cf-card": "#ffffff",
    "--cf-input": "#f8fafc",
    "--cf-border": "#e8eef8",
    "--cf-text": "#0f1f40",
    "--cf-text2": "#64748b",
    "--cf-text3": "#94a3b8",
    "--cf-hover": "#f8faff",
    "--cf-txhdr": "#f8fafc",
  };

  if (pageState === "loading") return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ background: "var(--cf-bg)", ...theme as any }}>
      <div className="w-10 h-10 border-2 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
      <p className="text-sm" style={{ color: "var(--cf-text2)" }}>Carregando…</p>
    </div>
  );

  if (pageState === "error") return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center" style={{ background: "var(--cf-bg)", ...theme as any }}>
      <p className="font-bold text-lg text-rose-500">Erro ao conectar</p>
      <div className="rounded-xl p-4 max-w-sm w-full text-left" style={{ background: "#fff1f2", border: "1px solid #fecdd3" }}>
        <p className="text-xs font-mono break-all text-rose-700">{errMsg || "Erro desconhecido"}</p>
      </div>
      <button onClick={() => window.location.reload()} className="mt-2 px-5 py-2.5 rounded-xl text-sm font-semibold cursor-pointer" style={{ background: "#2563eb", color: "white" }}>Tentar novamente</button>
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--cf-bg)", ...(theme as any) }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
        *{font-family:'Sora',sans-serif;box-sizing:border-box}
        .mono{font-family:'JetBrains Mono',monospace}
        .cf-card{background:var(--cf-card);border:1px solid var(--cf-border);border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,.06),0 4px 16px rgba(0,0,0,.04)}
        .cf-tx{border-bottom:1px solid var(--cf-border);transition:background .12s}
        .cf-tx:last-child{border-bottom:none}
        .cf-tx:hover{background:var(--cf-hover)}
        .cf-tx:hover .cf-txa{opacity:1;pointer-events:auto}
        .cf-txa{opacity:0;pointer-events:none;transition:opacity .12s}
        @media(max-width:639px){.cf-txa{opacity:1;pointer-events:auto}}
        @keyframes mIn{from{opacity:0;transform:translateY(24px) scale(.97)}to{opacity:1;transform:none}}
        @keyframes kIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
        .kin{animation:kIn .45s ease both}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-thumb{background:var(--cf-border);border-radius:4px}
        .scrollbar-none{scrollbar-width:none}
        .scrollbar-none::-webkit-scrollbar{display:none}
        *{transition:background-color .2s,border-color .2s,color .15s}
        button,a,input,select,textarea{transition:background-color .15s,border-color .15s,color .1s,opacity .15s!important}
      `}</style>

      {/* ── Navbar (controla o dark mode) ── */}
      <Navbar user={{ displayName: userName, email: userEmail }} activePath="/fluxo-caixa" onLogout={handleLogout} />

      {/* ── Modals ── */}
      <Modal open={modal} editing={editing} uid={uid} onClose={() => { setModal(false); setEditing(null); }} onSave={handleSave} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImport={handleImport} />

      {/* Confirmar exclusão */}
      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(10,22,40,0.65)", backdropFilter: "blur(4px)" }}>
          <div className="cf-card p-6 w-full max-w-xs text-center">
            <div className="w-11 h-11 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: "#fff1f2" }}><Trash2 size={18} style={{ color: "#ef4444" }} /></div>
            <p className="font-bold mb-1 text-sm" style={{ color: "var(--cf-text)" }}>Excluir transação?</p>
            <p className="text-xs mb-4" style={{ color: "var(--cf-text2)" }}>Esta ação não pode ser desfeita.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmId(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold cursor-pointer" style={{ border: "1px solid var(--cf-border)", color: "var(--cf-text2)" }}>Cancelar</button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-60" style={{ background: "#ef4444", color: "white" }}>
                {deleting ? <Loader2 size={13} className="animate-spin" /> : <><Trash2 size={13} /> Excluir</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main ── */}
      <main className="flex-1 p-3 sm:p-4 md:p-6 space-y-3 sm:space-y-4 overflow-y-auto overflow-x-hidden pb-24 lg:pb-6">

        {/* Título + ações */}
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="font-bold text-lg leading-tight" style={{ color: "var(--cf-text)" }}>Fluxo de caixa</h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--cf-text2)" }}>Olá, {userName} 👋</p>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <button onClick={() => setImportOpen(true)} className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl transition-colors cursor-pointer" style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8" }}>
              <Sparkles size={13} /> Importar extrato
            </button>
            <button onClick={() => { setEditing(null); setModal(true); }} className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl transition-colors cursor-pointer" style={{ background: "#2563eb", color: "white" }}>
              <Plus size={14} /> Nova transação
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
          {[
            { label: "Total entradas", val: entradas, Icon: ArrowUpRight, ibg: "#dcfce7", color: "#15803d", delay: "0ms", sub: `${txs.filter(t => t.type === "entrada").length} lançamentos` },
            { label: "Total saídas", val: saidas, Icon: ArrowDownRight, ibg: "#ffe4e6", color: "#be123c", delay: "80ms", sub: `${txs.filter(t => t.type === "saida").length} lançamentos` },
            {
              label: "Saldo atual", val: saldo, Icon: Wallet,
              ibg: saldo >= 0 ? "#dbeafe" : "#ffe4e6", color: saldo >= 0 ? "#1d4ed8" : "#be123c",
              delay: "160ms", sub: saldo >= 0 ? "Resultado positivo ✓" : "Resultado negativo ⚠"
            },
          ].map(({ label, val, Icon, ibg, color, delay, sub }) => (
            <div key={label} className="cf-card kin p-3 sm:p-4 flex items-center gap-3" style={{ animationDelay: delay }}>
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: ibg }}>
                <Icon size={20} style={{ color }} strokeWidth={2.5} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs truncate" style={{ color: "var(--cf-text2)" }}>{label}</p>
                <p className="font-extrabold text-base sm:text-lg mono leading-tight" style={{ color }}>{toBRL(val)}</p>
                <p className="text-xs truncate" style={{ color: "var(--cf-text2)" }}>{sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Banner importação mobile */}
        <button onClick={() => setImportOpen(true)} className="sm:hidden w-full cf-card p-3 flex items-center gap-3 cursor-pointer transition-colors">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#eff6ff" }}><Sparkles size={16} style={{ color: "#2563eb" }} /></div>
          <div className="flex-1 text-left">
            <p className="text-sm font-bold leading-tight" style={{ color: "var(--cf-text)" }}>Importar extrato bancário</p>
            <p className="text-xs" style={{ color: "var(--cf-text2)" }}>A IA preenche tudo automaticamente</p>
          </div>
          <ArrowUpRight size={16} style={{ color: "var(--cf-text3)" }} />
        </button>

        {/* Toolbar */}
        <div className="cf-card p-3 space-y-2.5 sm:space-y-3">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--cf-text3)" }} />
            <input className="w-full rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none transition-all"
              style={{ background: "var(--cf-input)", border: "1px solid var(--cf-border)", color: "var(--cf-text)" }}
              placeholder="Buscar por descrição ou categoria…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-none">
            {([
              { f: "all", label: "Todos", icon: null },
              { f: "entrada", label: "Entradas", icon: BanknoteArrowUp },
              { f: "saida", label: "Saídas", icon: BanknoteArrowDown },
            ] as const).map(({ f, label, icon: Icon }) => (
              <button key={f} onClick={() => setFilter(f)}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border-2 cursor-pointer transition-all select-none"
                style={filter === f
                  ? f === "all" ? { background: "var(--cf-text)", color: "var(--cf-bg)", borderColor: "transparent" }
                    : f === "entrada" ? { background: "#f0fdf4", color: "#15803d", borderColor: "#86efac" }
                      : { background: "#fff1f2", color: "#be123c", borderColor: "#fca5a5" }
                  : { background: "var(--cf-card)", color: "var(--cf-text2)", borderColor: "var(--cf-border)" }}>
                {Icon && <Icon size={13} />}
                {label}
              </button>
            ))}
            <span className="ml-auto text-xs shrink-0 pl-1" style={{ color: "var(--cf-text2)" }}>{filtered.length} resultado{filtered.length !== 1 ? "s" : ""}</span>
          </div>
        </div>

        {/* Lista */}
        {grouped.length === 0 ? (
          <div className="cf-card p-8 sm:p-10 flex flex-col items-center text-center gap-2">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-1" style={{ background: "var(--cf-input)" }}><TrendingUp size={22} style={{ color: "var(--cf-border)" }} /></div>
            <p className="font-bold text-sm" style={{ color: "var(--cf-text)" }}>{search || filter !== "all" ? "Nenhum resultado" : "Nenhuma transação ainda"}</p>
            <p className="text-xs" style={{ color: "var(--cf-text2)" }}>{search || filter !== "all" ? "Tente mudar os filtros." : "Adicione manualmente ou importe seu extrato bancário."}</p>
            {!search && filter === "all" && (
              <div className="flex gap-2 mt-2">
                <button onClick={() => { setEditing(null); setModal(true); }} className="flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-xl cursor-pointer" style={{ background: "#2563eb", color: "white" }}><Plus size={14} /> Adicionar</button>
                <button onClick={() => setImportOpen(true)} className="flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-xl cursor-pointer" style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8" }}><Sparkles size={14} /> Importar extrato</button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {grouped.map(([date, items]) => {
              const net = items.reduce((s, t) => t.type === "entrada" ? s + t.amount : s - t.amount, 0);
              return (
                <div key={date} className="cf-card overflow-hidden">
                  <div className="flex items-center justify-between px-3 sm:px-4 py-2.5" style={{ background: "var(--cf-txhdr)", borderBottom: "1px solid var(--cf-border)" }}>
                    <div className="flex items-center gap-2">
                      <Calendar size={12} style={{ color: "var(--cf-text2)" }} />
                      <span className="text-xs font-semibold" style={{ color: "var(--cf-text2)" }}>{labelDate(date)}</span>
                      <span className="text-xs" style={{ color: "var(--cf-text3)" }}>· {items.length}</span>
                    </div>
                    <span className="mono text-xs font-bold" style={{ color: net >= 0 ? "#059669" : "#dc2626" }}>{net >= 0 ? "+" : ""}{toBRL(net)}</span>
                  </div>
                  {items.map((tx) => {
                    const CatIcon = CAT_ICON[tx.category] ?? (tx.type === "entrada" ? ArrowUpRight : ArrowDownRight);
                    return (
                      <div key={tx.id} className="cf-tx flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: tx.type === "entrada" ? "#d1fae5" : "#fee2e2" }}>
                          <CatIcon size={16} style={{ color: tx.type === "entrada" ? "#059669" : "#dc2626" }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start sm:items-center gap-1 flex-col sm:flex-row sm:gap-2">
                            <span className="text-sm font-semibold truncate max-w-32.5 sm:max-w-none" style={{ color: "var(--cf-text)" }}>{tx.description}</span>
                            <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: tx.type === "entrada" ? "#d1fae5" : "#fee2e2", color: tx.type === "entrada" ? "#059669" : "#dc2626" }}>{tx.category}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {tx.note && <p className="text-xs truncate" style={{ color: "var(--cf-text2)" }}>{tx.note}</p>}
                            {tx.nfUrl && (
                              <a href={tx.nfUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-medium shrink-0 transition-colors" style={{ color: "#3b82f6" }} title={tx.nfName ?? "Ver Nota Fiscal"}>
                                <Paperclip size={11} />
                                <span className="hidden sm:inline truncate max-w-24">{tx.nfName ?? "NF"}</span>
                                <span className="sm:hidden">NF</span>
                              </a>
                            )}
                          </div>
                        </div>
                        <span className="mono text-sm font-bold shrink-0" style={{ color: tx.type === "entrada" ? "#059669" : "#dc2626" }}>{tx.type === "entrada" ? "+" : "-"}{toBRL(tx.amount)}</span>
                        <div className="cf-txa flex items-center gap-1 shrink-0">
                          <button onClick={() => { setEditing(tx); setModal(true); }} className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-colors" style={{ background: "var(--cf-input)", color: "var(--cf-text2)" }}><Edit3 size={12} /></button>
                          <button onClick={() => setConfirmId(tx.id)} className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-colors" style={{ background: "var(--cf-input)", color: "var(--cf-text2)" }}><Trash2 size={12} /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* FAB mobile */}
      <div className="lg:hidden fixed z-20 flex flex-col gap-2" style={{ bottom: 74, right: 18 }}>
        <button onClick={() => setImportOpen(true)} className="w-12 h-12 rounded-xl flex items-center justify-center active:scale-95 transition-transform cursor-pointer" style={{ background: "#eff6ff", border: "1px solid #bfdbfe", color: "#2563eb", boxShadow: "0 4px 16px rgba(37,99,235,.2)" }}>
          <Sparkles size={18} />
        </button>
        <button onClick={() => { setEditing(null); setModal(true); }} className="rounded-2xl flex items-center justify-center active:scale-95 transition-transform cursor-pointer" style={{ width: 54, height: 54, background: "#2563eb", color: "white", boxShadow: "0 8px 28px rgba(37,99,235,.5)" }}>
          <Plus size={24} />
        </button>
      </div>
    </div>
  );
}