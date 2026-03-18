"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  TrendingUp, Plus, X, Check, ArrowUpRight, ArrowDownRight,
  Search, Calendar, ChevronDown, Trash2, Edit3, ClipboardList,
  LayoutDashboard, FileText, CreditCard, Settings, BarChart2,
  Users, DollarSign, LogOut, Menu, Bell, Loader2, Wallet,
  ShoppingCart, Briefcase, UserCheck, PiggyBank, CircleDollarSign,
  Truck, UsersRound, Building2, Receipt, Megaphone, Monitor, Package,
  BanknoteArrowUp, BanknoteArrowDown, Sparkles, Upload, CheckCircle2,
  Paperclip, ExternalLink, FileScan,
  type LucideIcon,
} from "lucide-react";

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
  saida:   ["Fornecedores", "Folha de pagamento", "Aluguel", "Impostos", "Marketing", "TI / Software", "Outros gastos"],
};

const CAT_ICON: Record<string, LucideIcon> = {
  "Vendas":                  ShoppingCart,
  "Serviços prestados":      Briefcase,
  "Recebimento de clientes": UserCheck,
  "Investimentos":           PiggyBank,
  "Outros recebimentos":     CircleDollarSign,
  "Fornecedores":            Truck,
  "Folha de pagamento":      UsersRound,
  "Aluguel":                 Building2,
  "Impostos":                Receipt,
  "Marketing":               Megaphone,
  "TI / Software":           Monitor,
  "Outros gastos":           Package,
};

const NAV = [
  { icon: LayoutDashboard, label: "Dashboard",       href: "/dashboard"    },
  { icon: TrendingUp,      label: "Fluxo de caixa",  href: "/fluxo-caixa", active: true },
  { icon: FileText,        label: "Relatórios",       href: "#"             },
  { icon: CreditCard,      label: "Contas a pagar",   href: "#"             },
  { icon: DollarSign,      label: "Contas a receber", href: "#"             },
  { icon: BarChart2,       label: "Centro de custos", href: "#"             },
  { icon: Users,           label: "Usuários",         href: "#"             },
];

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

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function Sidebar({ collapsed, open, onClose, onLogout }: {
  collapsed: boolean; open: boolean; onClose: () => void; onLogout: () => void;
}) {
  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={onClose} />
      )}
      <aside
        id="cf-sidebar"
        style={{ width: collapsed ? 72 : 230 }}
        className={`fixed lg:sticky top-0 left-0 h-screen z-50 flex flex-col transition-all duration-300 overflow-hidden
          ${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
      >
        <div className="flex items-center gap-3 px-4 py-5 border-b border-white/5 shrink-0">
          <div className="w-8 h-8 rounded-xl bg-blue-500 flex items-center justify-center shrink-0">
            <ClipboardList size={15} className="text-white" />
          </div>
          {!collapsed && (
            <span className="text-white font-bold text-base truncate">
              Nexus<span className="text-blue-400">Fi</span>
            </span>
          )}
          <button onClick={onClose} className="lg:hidden text-white/40 hover:text-white ml-auto shrink-0 cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
          {NAV.map((item) => (
            <a key={item.label} href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer
                ${"active" in item
                  ? "bg-blue-500/20 text-white"
                  : "text-blue-200/50 hover:text-white hover:bg-white/5"}`}
            >
              <item.icon size={17} className="shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
              {"active" in item && !collapsed && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
              )}
            </a>
          ))}
        </nav>

        <div className="px-2 pb-5 pt-3 border-t border-white/5 shrink-0 space-y-0.5">
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-blue-200/50 hover:text-white hover:bg-white/5 text-sm cursor-pointer transition-all">
            <Settings size={17} className="shrink-0" />
            {!collapsed && "Configurações"}
          </button>
          <button onClick={onLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-blue-200/50 hover:text-rose-400 hover:bg-rose-500/5 text-sm cursor-pointer transition-all">
            <LogOut size={17} className="shrink-0" />
            {!collapsed && "Sair"}
          </button>
        </div>
      </aside>
    </>
  );
}

// ─── Modal de transação manual (com NF) ──────────────────────────────────────

function Modal({ open, editing, uid, onClose, onSave }: {
  open: boolean; editing: Tx | null; uid: string | null;
  onClose: () => void; onSave: (data: Omit<Tx, "id">) => Promise<void>;
}) {
  const [type,      setType]      = useState<TxType>("entrada");
  const [desc,      setDesc]      = useState("");
  const [cat,       setCat]       = useState("");
  const [rawAmt,    setRawAmt]    = useState("");
  const [date,      setDate]      = useState(TODAY);
  const [note,      setNote]      = useState("");
  const [saving,    setSaving]    = useState(false);
  const [err,       setErr]       = useState("");
  // NF states
  const [nfFile,    setNfFile]    = useState<File | null>(null);
  const [nfPreview, setNfPreview] = useState<string>("");   // URL de preview local
  const [nfUrl,     setNfUrl]     = useState<string>("");   // URL Firebase já salva
  const [nfName,    setNfName]    = useState<string>("");
  const [scanning,  setScanning]  = useState(false);
  const nfRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setType(editing?.type ?? "entrada");
    setDesc(editing?.description ?? "");
    setCat(editing?.category ?? "");
    setRawAmt(editing ? editing.amount.toFixed(2).replace(".", ",") : "");
    setDate(editing?.date ?? TODAY);
    setNote(editing?.note ?? "");
    setNfFile(null);
    setNfPreview("");
    setNfUrl(editing?.nfUrl ?? "");
    setNfName(editing?.nfName ?? "");
    setSaving(false);
    setErr("");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const amount  = parseAmount(rawAmt);
  const descOk  = desc.trim().length >= 2;
  const catOk   = cat !== "";
  const amtOk   = amount > 0;
  const dateOk  = date !== "";
  const canSave = descOk && catOk && amtOk && dateOk;
  const missing = [!descOk && "descrição", !catOk && "categoria", !amtOk && "valor", !dateOk && "data"].filter(Boolean).join(", ");

  // Seleciona arquivo NF
  const handleNfSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNfFile(file);
    setNfName(file.name);
    // Preview local
    const url = URL.createObjectURL(file);
    setNfPreview(url);
    setNfUrl("");
  };

  // Lê NF com IA e preenche campos automaticamente
  const scanNf = async () => {
    if (!nfFile) return;
    setScanning(true);
    setErr("");
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
        // XML: lê como texto
        const xmlText = await nfFile.text();
        body = { type: "xml", content: xmlText };
      } else {
        // PDF ou imagem: envia base64
        const mediaType = nfFile.type || (nfFile.name.endsWith(".pdf") ? "application/pdf" : "image/jpeg");
        body = { type: "file", base64, mediaType };
      }

      const res = await fetch("/api/analyze-nf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Erro na API");

      // Preenche campos com dados da NF
      if (data.description) setDesc(data.description.slice(0, 60));
      if (data.amount)      setRawAmt(String(data.amount).replace(".", ","));
      if (data.date)        setDate(data.date);
      if (data.note)        setNote(data.note);
      if (data.type)        setType(data.type);
      // Tenta achar categoria
      const cats = data.type === "entrada" ? CAT.entrada : CAT.saida;
      const match = cats.find(c =>
        c.toLowerCase().includes((data.category ?? "").toLowerCase()) ||
        (data.category ?? "").toLowerCase().includes(c.toLowerCase())
      );
      if (match) setCat(match);

    } catch (e: any) {
      setErr(`Erro ao ler NF: ${e.message}`);
    }
    setScanning(false);
  };

  // Upload NF para Firebase Storage (com timeout de 15s)
  const uploadNf = async (): Promise<{ url: string; name: string }> => {
    if (!nfFile || !uid) return { url: nfUrl, name: nfName };

    const timeout = new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error("Timeout: Firebase Storage pode não estar ativado no console.")), 15000)
    );

    const upload = async () => {
      const [{ getFirebase }, { ref, uploadBytes, getDownloadURL }] = await Promise.all([
        import("../../lib/firebase"),
        import("firebase/storage"),
      ]);
      const { storage } = await getFirebase();
      const path = `users/${uid}/nfs/${Date.now()}_${nfFile.name}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, nfFile);
      const url = await getDownloadURL(storageRef);
      return { url, name: nfFile.name };
    };

    return Promise.race([upload(), timeout]);
  };

  async function submit() {
    if (!canSave || saving) return;
    setSaving(true); setErr("");
    try {
      let nfData = { url: nfUrl, name: nfName };
      if (nfFile) {
        try {
          nfData = await uploadNf();
        } catch (uploadErr: any) {
          setErr(`NF nao anexada: ${uploadErr.message}. Salvando sem arquivo.`);
          await new Promise(r => setTimeout(r, 2500));
          setErr("");
        }
      }
      const saveData: any = {
        type, description: desc.trim(), category: cat, amount, date,
        note: note.trim(), createdAt: editing?.createdAt ?? Date.now(),
      };
      if (nfData.url)  saveData.nfUrl  = nfData.url;
      if (nfData.name) saveData.nfName = nfData.name;
      await onSave(saveData);
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao salvar");
      setSaving(false);
    }
  }

  const hasNf = nfPreview || nfUrl;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(10,22,40,0.75)", backdropFilter: "blur(6px)" }}>
      <div className="w-full sm:max-w-md bg-white sm:rounded-2xl rounded-t-3xl overflow-hidden"
        style={{ boxShadow: "0 32px 80px rgba(10,22,40,0.3)", animation: "mIn .25s cubic-bezier(.22,.68,0,1.2)" }}>

        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1.5 rounded-full bg-slate-200" />
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <p className="text-blue-950 font-extrabold text-base">{editing ? "Editar transação" : "Nova transação"}</p>
            <p className="text-slate-400 text-xs">Preencha os campos ou anexe uma NF</p>
          </div>
          <button onClick={() => !saving && onClose()}
            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors cursor-pointer">
            <X size={15} />
          </button>
        </div>

        <div className="px-5 pt-4 pb-6 space-y-4 overflow-y-auto" style={{ maxHeight: "82vh" }}>
          {err && <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5 text-rose-600 text-xs">⚠ {err}</div>}

          {/* ── Anexo de NF ── */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
              <Paperclip size={12} /> Nota Fiscal <span className="text-slate-300 font-normal normal-case">(opcional)</span>
            </label>

            {hasNf ? (
              <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                  <FileText size={16} className="text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-blue-950 text-xs font-semibold truncate">{nfName || "Nota Fiscal"}</p>
                  <p className="text-blue-400 text-xs">Anexada ✓</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {(nfPreview || nfUrl) && (
                    <a href={nfPreview || nfUrl} target="_blank" rel="noreferrer"
                      className="w-7 h-7 rounded-lg bg-blue-100 hover:bg-blue-200 flex items-center justify-center text-blue-600 transition-colors cursor-pointer">
                      <ExternalLink size={12} />
                    </a>
                  )}
                  <button onClick={() => { setNfFile(null); setNfPreview(""); setNfUrl(""); setNfName(""); }}
                    className="w-7 h-7 rounded-lg bg-blue-100 hover:bg-rose-100 hover:text-rose-500 flex items-center justify-center text-blue-400 transition-colors cursor-pointer">
                    <X size={12} />
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => nfRef.current?.click()}
                className="w-full border-2 border-dashed border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 rounded-xl p-4 flex items-center gap-3 transition-all cursor-pointer group">
                <div className="w-9 h-9 rounded-lg bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center shrink-0 transition-colors">
                  <Upload size={15} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-slate-600 group-hover:text-blue-700 transition-colors">Anexar NF</p>
                  <p className="text-xs text-slate-400">PDF, imagem ou XML</p>
                </div>
                <input ref={nfRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.xml" className="hidden" onChange={handleNfSelect} />
              </button>
            )}

            {/* Botão de leitura IA */}
            {nfFile && (
              <button onClick={scanNf} disabled={scanning}
                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold border-2 transition-all
                  ${scanning
                    ? "border-violet-200 bg-violet-50 text-violet-400 cursor-not-allowed"
                    : "border-violet-300 bg-violet-50 hover:bg-violet-100 text-violet-700 cursor-pointer"}`}>
                {scanning
                  ? <><Loader2 size={14} className="animate-spin" /> Lendo NF com IA…</>
                  : <><FileScan size={14} /> Ler NF com IA e preencher campos</>}
              </button>
            )}
          </div>

          <div className="h-px bg-slate-100" />

          {/* Tipo */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
            {(["entrada", "saida"] as TxType[]).map((t) => (
              <button key={t} onClick={() => { setType(t); setCat(""); }}
                className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-bold transition-all cursor-pointer
                  ${type === t ? t === "entrada" ? "bg-emerald-500 text-white shadow-md" : "bg-rose-500 text-white shadow-md" : "text-slate-400 hover:text-slate-600"}`}>
                {t === "entrada" ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
                {t === "entrada" ? "Entrada" : "Saída"}
              </button>
            ))}
          </div>

          {/* Descrição */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Descrição *</label>
            <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ex: Cliente XYZ, Aluguel…"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-blue-950 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all" />
          </div>

          {/* Categoria */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Categoria *</label>
            <div className="relative">
              <select value={cat} onChange={(e) => setCat(e.target.value)}
                className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 pr-9 text-sm text-blue-950 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer">
                <option value="">— Selecione —</option>
                {CAT[type].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Valor + Data */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Valor (R$) *</label>
              <input inputMode="decimal" value={rawAmt} onChange={(e) => setRawAmt(e.target.value)} placeholder="0,00"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-blue-950 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all" />
              {rawAmt.length > 0 && !amtOk && <p className="text-xs text-rose-400">Valor inválido</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Data *</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-blue-950 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer" />
            </div>
          </div>

          {/* Nota */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
              Observação <span className="text-slate-300 font-normal normal-case">(opcional)</span>
            </label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="NF, contrato, parcela…"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-blue-950 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all" />
          </div>

          {/* Salvar */}
          <button onClick={submit} disabled={!canSave || saving}
            className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all
              ${canSave && !saving
                ? type === "entrada" ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-100 cursor-pointer"
                                     : "bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-100 cursor-pointer"
                : "bg-slate-200 text-slate-400 cursor-not-allowed"}`}>
            {saving ? <><Loader2 size={15} className="animate-spin" /> Salvando…</>
                    : <><Check size={15} /> {editing ? "Salvar alterações" : type === "entrada" ? "Registrar entrada" : "Registrar saída"}</>}
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
  open: boolean;
  onClose: () => void;
  onImport: (txs: ImportedTx[]) => Promise<void>;
}) {
  const [step,     setStep]     = useState<ImportStep>("input");
  const [text,     setText]     = useState("");
  const [preview,  setPreview]  = useState<ImportedTx[]>([]);
  const [errMsg,   setErrMsg]   = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setStep("input"); setText(""); setPreview([]); setErrMsg(""); setSelected(new Set());
    }
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
      const res = await fetch("/api/analyze-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Erro na API");

      const rawText = (data.content as any[])?.map((c: any) => c.text || "").join("") ?? "";
      const clean   = rawText.replace(/```json|```/g, "").trim();
      const parsed  = JSON.parse(clean);

      if (!parsed.transactions?.length) {
        setErrMsg("Nenhuma transação encontrada. Verifique se o texto contém dados bancários.");
        setStep("input"); return;
      }

      const normalized: ImportedTx[] = parsed.transactions.map((t: any) => ({
        type:        (t.type === "entrada" || t.type === "saida") ? t.type : "saida",
        description: String(t.description ?? "Sem descrição").slice(0, 60),
        category:    normalizeCategory(String(t.category ?? ""), t.type === "entrada" ? "entrada" : "saida"),
        amount:      Math.abs(Number(t.amount) || 0),
        date:        String(t.date ?? TODAY),
        note:        String(t.note ?? ""),
      }));

      setPreview(normalized);
      setSelected(new Set(normalized.map((_, i) => i)));
      setStep("preview");
    } catch (e: any) {
      setErrMsg(`Erro ao interpretar: ${e.message}`);
      setStep("input");
    }
  };

  const confirmImport = async () => {
    const toImport = preview.filter((_, i) => selected.has(i));
    if (!toImport.length) return;
    setStep("saving");
    try { await onImport(toImport); setStep("done"); }
    catch (e: any) { setErrMsg(e.message); setStep("preview"); }
  };

  const toggleAll = () => {
    if (selected.size === preview.length) setSelected(new Set());
    else setSelected(new Set(preview.map((_, i) => i)));
  };
  const toggle = (i: number) => {
    const s = new Set(selected); s.has(i) ? s.delete(i) : s.add(i); setSelected(s);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(10,22,40,0.80)", backdropFilter: "blur(8px)" }}>
      <div className="w-full sm:max-w-lg bg-white sm:rounded-2xl rounded-t-3xl overflow-hidden"
        style={{ boxShadow: "0 32px 80px rgba(10,22,40,0.35)", animation: "mIn .25s cubic-bezier(.22,.68,0,1.2)", maxHeight: "92vh", display: "flex", flexDirection: "column" }}>

        <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
          <div className="w-10 h-1.5 rounded-full bg-slate-200" />
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
              <Sparkles size={15} className="text-blue-600" />
            </div>
            <div>
              <p className="text-blue-950 font-extrabold text-base leading-tight">Importar com IA</p>
              <p className="text-slate-400 text-xs">
                {step === "input"   && "Cole ou faça upload do extrato"}
                {step === "loading" && "Analisando…"}
                {step === "preview" && `${preview.length} transações encontradas`}
                {step === "saving"  && "Salvando…"}
                {step === "done"    && "Importado com sucesso!"}
              </p>
            </div>
          </div>
          {step !== "saving" && (
            <button onClick={onClose}
              className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors cursor-pointer">
              <X size={15} />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {step === "input" && (
            <>
              {errMsg && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5 text-rose-600 text-xs flex items-start gap-2">
                  <span className="shrink-0 mt-0.5">⚠</span> {errMsg}
                </div>
              )}
              <button onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 rounded-xl p-5 flex flex-col items-center gap-2 transition-all cursor-pointer group">
                <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center transition-colors">
                  <Upload size={18} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
                </div>
                <p className="text-sm font-semibold text-slate-600 group-hover:text-blue-700 transition-colors">Upload de arquivo</p>
                <p className="text-xs text-slate-400">.txt ou .csv</p>
                <input ref={fileRef} type="file" accept=".txt,.csv" className="hidden" onChange={handleFile} />
              </button>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-slate-100" />
                <span className="text-xs text-slate-400 font-medium">ou cole o texto</span>
                <div className="flex-1 h-px bg-slate-100" />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Texto do extrato</label>
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7}
                  placeholder={`Exemplo:\n01/03/2026  PIX RECEBIDO CLIENTE ABC    CR  R$ 3.500,00\n05/03/2026  ALUGUEL SALA COMERCIAL       DB  R$ 2.200,00\n10/03/2026  FORNECEDOR XYZ LTDA          DB  R$   870,00`}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-blue-950 font-mono outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all resize-none placeholder-slate-300" />
                <p className="text-xs text-slate-400">{text.length} caracteres</p>
              </div>
            </>
          )}

          {step === "loading" && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center">
                  <Sparkles size={28} className="text-blue-500" />
                </div>
                <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-white flex items-center justify-center">
                  <Loader2 size={13} className="text-blue-500 animate-spin" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-blue-950 font-bold text-sm">IA analisando extrato…</p>
                <p className="text-slate-400 text-xs mt-1">Identificando transações, valores e categorias</p>
              </div>
              <div className="w-48 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: "60%" }} />
              </div>
            </div>
          )}

          {(step === "preview" || step === "saving") && (
            <>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Entradas", val: preview.filter(t => t.type === "entrada").length, color: "text-emerald-600", bg: "bg-emerald-50" },
                  { label: "Saídas",   val: preview.filter(t => t.type === "saida").length,   color: "text-rose-600",    bg: "bg-rose-50"    },
                  { label: "Selecionados", val: selected.size,                                  color: "text-blue-700",    bg: "bg-blue-50"    },
                ].map(({ label, val, color, bg }) => (
                  <div key={label} className={`${bg} rounded-xl p-2.5 text-center`}>
                    <p className={`text-lg font-extrabold ${color}`}>{val}</p>
                    <p className="text-xs text-slate-500">{label}</p>
                  </div>
                ))}
              </div>

              <button onClick={toggleAll}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer text-sm text-slate-600 font-medium">
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${selected.size === preview.length ? "bg-blue-600 border-blue-600" : "border-slate-300"}`}>
                  {selected.size === preview.length && <Check size={10} className="text-white" />}
                </div>
                {selected.size === preview.length ? "Desmarcar todos" : "Selecionar todos"}
                <span className="ml-auto text-xs text-slate-400">{selected.size}/{preview.length}</span>
              </button>

              <div className="space-y-1.5">
                {preview.map((tx, i) => {
                  const CatIcon = CAT_ICON[tx.category] ?? (tx.type === "entrada" ? ArrowUpRight : ArrowDownRight);
                  const isSel = selected.has(i);
                  return (
                    <button key={i} onClick={() => toggle(i)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all cursor-pointer text-left
                        ${isSel ? tx.type === "entrada" ? "border-emerald-200 bg-emerald-50/60" : "border-rose-200 bg-rose-50/60" : "border-slate-100 bg-slate-50/60 opacity-50"}`}>
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${isSel ? "bg-blue-600 border-blue-600" : "border-slate-300"}`}>
                        {isSel && <Check size={9} className="text-white" />}
                      </div>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tx.type === "entrada" ? "bg-emerald-100" : "bg-rose-100"}`}>
                        <CatIcon size={14} className={tx.type === "entrada" ? "text-emerald-600" : "text-rose-600"} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-blue-950 text-xs font-semibold truncate">{tx.description}</p>
                        <p className="text-slate-400 text-xs truncate">{tx.category} · {labelDate(tx.date)}</p>
                      </div>
                      <span className={`text-xs font-bold mono shrink-0 ${tx.type === "entrada" ? "text-emerald-600" : "text-rose-500"}`}>
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
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 size={32} className="text-emerald-500" />
              </div>
              <p className="text-blue-950 font-bold text-base">Importado com sucesso!</p>
              <p className="text-slate-400 text-sm text-center">
                {selected.size} transação{selected.size !== 1 ? "ões" : ""} adicionada{selected.size !== 1 ? "s" : ""} ao fluxo de caixa.
              </p>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 shrink-0 flex gap-2">
          {step === "input" && (
            <>
              <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-500 text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer">Cancelar</button>
              <button onClick={analyze} disabled={!text.trim()}
                className={`flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all
                  ${text.trim() ? "bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-100 cursor-pointer" : "bg-slate-200 text-slate-400 cursor-not-allowed"}`}>
                <Sparkles size={14} /> Analisar com IA
              </button>
            </>
          )}
          {step === "preview" && (
            <>
              <button onClick={() => setStep("input")} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-500 text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer">← Voltar</button>
              <button onClick={confirmImport} disabled={selected.size === 0}
                className={`flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all
                  ${selected.size > 0 ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-100 cursor-pointer" : "bg-slate-200 text-slate-400 cursor-not-allowed"}`}>
                <Check size={14} /> Importar {selected.size}
              </button>
            </>
          )}
          {step === "saving" && (
            <button disabled className="flex-1 py-3 rounded-xl bg-slate-200 text-slate-400 text-sm font-bold flex items-center justify-center gap-2 cursor-not-allowed">
              <Loader2 size={14} className="animate-spin" /> Salvando…
            </button>
          )}
          {step === "done" && (
            <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer">
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
  const [uid,        setUid]        = useState<string | null>(null);
  const [userName,   setUserName]   = useState("");
  const [txs,        setTxs]        = useState<Tx[]>([]);
  const [pageState,  setPageState]  = useState<"loading" | "ready" | "error">("loading");
  const [errMsg,     setErrMsg]     = useState("");
  const [collapsed,  setCollapsed]  = useState(false);
  const [sideOpen,   setSideOpen]   = useState(false);
  const [modal,      setModal]      = useState(false);
  const [editing,    setEditing]    = useState<Tx | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [filter,     setFilter]     = useState<"all" | TxType>("all");
  const [search,     setSearch]     = useState("");
  const [confirmId,  setConfirmId]  = useState<string | null>(null);
  const [deleting,   setDeleting]   = useState(false);

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
          setUid(u.uid);
          setUserName(u.displayName ?? u.email ?? "Usuário");
          snapUnsub?.();
          const q = query(collection(db, "users", u.uid, "cashflow"), orderBy("createdAt", "desc"));
          snapUnsub = onSnapshot(q,
            (snap) => { setTxs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Tx))); setPageState("ready"); },
            (err)  => { setErrMsg(`${err.message} (${err.code})`); setPageState("error"); }
          );
        });
      } catch (e: any) {
        setErrMsg(e.message); setPageState("error");
      }
    })();

    return () => { authUnsub?.(); snapUnsub?.(); };
  }, []);

  async function handleLogout() {
    const { getFirebase } = await import("../../lib/firebase");
    const { signOut }     = await import("firebase/auth");
    const { auth }        = await getFirebase();
    await signOut(auth);
    window.location.href = "/login";
  }

  async function handleSave(data: Omit<Tx, "id">) {
    if (!uid) throw new Error("Usuário não autenticado");
    const [{ getFirebase }, { doc, updateDoc, collection, addDoc }] = await Promise.all([
      import("../../lib/firebase"), import("firebase/firestore"),
    ]);
    const { db } = await getFirebase();
    // Remove campos undefined para o Firestore não rejeitar
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    if (editing) await updateDoc(doc(db, "users", uid, "cashflow", editing.id), clean as any);
    else         await addDoc(collection(db, "users", uid, "cashflow"), clean);
  }

  async function handleImport(importedTxs: ImportedTx[]) {
    if (!uid) throw new Error("Usuário não autenticado");
    const [{ getFirebase }, { collection, addDoc }] = await Promise.all([
      import("../../lib/firebase"), import("firebase/firestore"),
    ]);
    const { db } = await getFirebase();
    const col = collection(db, "users", uid, "cashflow");
    await Promise.all(importedTxs.map((tx) => addDoc(col, { ...tx, createdAt: Date.now() })));
  }

  async function handleDelete() {
    if (!confirmId || !uid || deleting) return;
    setDeleting(true);
    try {
      const [{ getFirebase }, { doc, deleteDoc }] = await Promise.all([
        import("../../lib/firebase"), import("firebase/firestore"),
      ]);
      const { db } = await getFirebase();
      await deleteDoc(doc(db, "users", uid, "cashflow", confirmId));
      setConfirmId(null);
    } catch (e: any) {
      alert("Erro ao deletar: " + e.message);
    } finally {
      setDeleting(false);
    }
  }

  const entradas = useMemo(() => txs.filter(t => t.type === "entrada").reduce((s, t) => s + t.amount, 0), [txs]);
  const saidas   = useMemo(() => txs.filter(t => t.type === "saida").reduce((s, t) => s + t.amount, 0), [txs]);
  const saldo    = entradas - saidas;

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

  if (pageState === "loading") return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3">
      <div className="w-10 h-10 border-2 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
      <p className="text-slate-400 text-sm">Carregando…</p>
    </div>
  );

  if (pageState === "error") return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-rose-500 font-bold text-lg">Erro ao conectar</p>
      <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 max-w-sm w-full text-left">
        <p className="text-rose-700 text-xs font-mono break-all">{errMsg || "Erro desconhecido"}</p>
      </div>
      <button onClick={() => window.location.reload()}
        className="mt-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors cursor-pointer">
        Tentar novamente
      </button>
    </div>
  );

  return (
    <div className="flex bg-slate-50 min-h-screen">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
        *{font-family:'Sora',sans-serif;box-sizing:border-box}
        .mono{font-family:'JetBrains Mono',monospace}
        #cf-sidebar{background:linear-gradient(180deg,#0a1628 0%,#0d2247 60%,#0e3372 100%);border-right:1px solid rgba(255,255,255,.05)}
        .card{background:white;border:1px solid #e8eef8;border-radius:16px;box-shadow:0 1px 3px rgba(13,34,71,.06),0 4px 16px rgba(13,34,71,.04)}
        .hline{box-shadow:0 1px 0 #e8eef8}
        .tx{border-bottom:1px solid #f1f5f9;transition:background .12s}
        .tx:last-child{border-bottom:none}
        .tx:hover{background:#f8faff}
        .tx:hover .txa{opacity:1;pointer-events:auto}
        .txa{opacity:0;pointer-events:none;transition:opacity .12s}
        @media(max-width:639px){.txa{opacity:1;pointer-events:auto}}
        @keyframes mIn{from{opacity:0;transform:translateY(24px) scale(.97)}to{opacity:1;transform:none}}
        @keyframes kIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
        .kin{animation:kIn .45s ease both}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-thumb{background:#d0daf0;border-radius:4px}
        .scrollbar-none{scrollbar-width:none}
        .scrollbar-none::-webkit-scrollbar{display:none}
      `}</style>

      <div className="hidden lg:block shrink-0" style={{ width: collapsed ? 72 : 230 }}>
        <Sidebar collapsed={collapsed} open={false} onClose={() => {}} onLogout={handleLogout} />
      </div>
      <div className="lg:hidden">
        <Sidebar collapsed={false} open={sideOpen} onClose={() => setSideOpen(false)} onLogout={handleLogout} />
      </div>

      <Modal open={modal} editing={editing} uid={uid}
        onClose={() => { setModal(false); setEditing(null); }}
        onSave={handleSave} />

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImport={handleImport} />

      {/* Confirmar exclusão */}
      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(10,22,40,0.65)", backdropFilter: "blur(4px)" }}>
          <div className="card p-6 w-full max-w-xs text-center">
            <div className="w-11 h-11 rounded-full bg-rose-50 flex items-center justify-center mx-auto mb-3">
              <Trash2 size={18} className="text-rose-500" />
            </div>
            <p className="text-blue-950 font-bold mb-1 text-sm">Excluir transação?</p>
            <p className="text-slate-400 text-xs mb-4">Esta ação não pode ser desfeita.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmId(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-500 text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer">
                Cancelar
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-sm font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
                {deleting ? <Loader2 size={13} className="animate-spin" /> : <><Trash2 size={13} /> Excluir</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden pb-16 lg:pb-0">

        {/* Header */}
        <header className="sticky top-0 z-20 bg-white hline flex items-center justify-between px-3 sm:px-4 md:px-6 py-3 shrink-0 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={() => setSideOpen(true)}
              className="lg:hidden w-9 h-9 rounded-lg border border-slate-200 bg-white shadow-sm flex items-center justify-center shrink-0 cursor-pointer">
              <Menu size={16} className="text-blue-800" />
            </button>
            <button onClick={() => setCollapsed(c => !c)}
              className="hidden lg:flex w-8 h-8 rounded-lg border border-slate-200 bg-white shadow-sm items-center justify-center shrink-0 cursor-pointer hover:bg-slate-50 transition-colors">
              <BarChart2 size={14} className="text-blue-800" />
            </button>
            <div className="min-w-0">
              <p className="text-blue-950 font-bold text-sm sm:text-base leading-tight">Fluxo de caixa</p>
              <p className="text-slate-400 text-xs hidden sm:block truncate">Olá, {userName} 👋</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button onClick={() => setImportOpen(true)}
              className="hidden sm:flex items-center gap-1.5 border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold px-3 py-2 rounded-xl transition-colors cursor-pointer">
              <Sparkles size={13} /> Importar extrato
            </button>
            <button onClick={() => { setEditing(null); setModal(true); }}
              className="hidden sm:flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors cursor-pointer">
              <Plus size={14} /> Nova transação
            </button>
            <button className="relative w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center cursor-pointer hover:bg-slate-100 transition-colors">
              <Bell size={16} className="text-slate-500" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full" />
            </button>
            <div className="w-9 h-9 rounded-xl bg-linear-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-sm shrink-0 select-none">
              {userName[0]?.toUpperCase() ?? "U"}
            </div>
          </div>
        </header>

        <main className="flex-1 p-3 sm:p-4 md:p-6 space-y-3 sm:space-y-4 overflow-y-auto overflow-x-hidden">

          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
            {[
              { label: "Total entradas", val: entradas, Icon: ArrowUpRight,   ibg: "#dcfce7", color: "#15803d", delay: "0ms",   sub: `${txs.filter(t => t.type==="entrada").length} lançamentos` },
              { label: "Total saídas",   val: saidas,   Icon: ArrowDownRight, ibg: "#ffe4e6", color: "#be123c", delay: "80ms",  sub: `${txs.filter(t => t.type==="saida").length} lançamentos`   },
              { label: "Saldo atual",    val: saldo,    Icon: Wallet,
                ibg: saldo >= 0 ? "#dbeafe" : "#ffe4e6", color: saldo >= 0 ? "#1d4ed8" : "#be123c",
                delay: "160ms", sub: saldo >= 0 ? "Resultado positivo ✓" : "Resultado negativo ⚠" },
            ].map(({ label, val, Icon, ibg, color, delay, sub }) => (
              <div key={label} className="card kin p-3 sm:p-4 flex items-center gap-3" style={{ animationDelay: delay }}>
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: ibg }}>
                  <Icon size={20} style={{ color }} strokeWidth={2.5} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-slate-400 text-xs truncate">{label}</p>
                  <p className="font-extrabold text-base sm:text-lg mono leading-tight" style={{ color }}>{toBRL(val)}</p>
                  <p className="text-slate-400 text-xs truncate">{sub}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Banner importação IA mobile */}
          <button onClick={() => setImportOpen(true)}
            className="sm:hidden w-full card p-3 flex items-center gap-3 cursor-pointer hover:border-blue-200 transition-colors">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
              <Sparkles size={16} className="text-blue-600" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-blue-950 text-sm font-bold leading-tight">Importar extrato bancário</p>
              <p className="text-slate-400 text-xs">A IA preenche tudo automaticamente</p>
            </div>
            <ArrowUpRight size={16} className="text-blue-400 shrink-0" />
          </button>

          {/* Toolbar */}
          <div className="card p-3 space-y-2.5 sm:space-y-3">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm text-blue-950 placeholder-slate-400 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all"
                placeholder="Buscar por descrição ou categoria…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-none">
              {([
                { f: "all",     label: "Todos",    icon: null              },
                { f: "entrada", label: "Entradas", icon: BanknoteArrowUp   },
                { f: "saida",   label: "Saídas",   icon: BanknoteArrowDown },
              ] as const).map(({ f, label, icon: Icon }) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border-2 cursor-pointer transition-all select-none
                    ${filter === f
                      ? f === "all" ? "bg-slate-800 text-white border-transparent"
                      : f === "entrada" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-rose-50 text-rose-700 border-rose-200"
                      : "bg-white text-slate-400 border-slate-200 hover:border-slate-300"}`}>
                  {Icon && <Icon size={13} />}
                  {label}
                </button>
              ))}
              <span className="ml-auto text-xs text-slate-400 shrink-0 pl-1">
                {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          {/* Lista */}
          {grouped.length === 0 ? (
            <div className="card p-8 sm:p-10 flex flex-col items-center text-center gap-2">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mb-1">
                <TrendingUp size={22} className="text-blue-200" />
              </div>
              <p className="text-blue-950 font-bold text-sm">
                {search || filter !== "all" ? "Nenhum resultado" : "Nenhuma transação ainda"}
              </p>
              <p className="text-slate-400 text-xs">
                {search || filter !== "all" ? "Tente mudar os filtros." : "Adicione manualmente ou importe seu extrato bancário."}
              </p>
              {!search && filter === "all" && (
                <div className="flex gap-2 mt-2">
                  <button onClick={() => { setEditing(null); setModal(true); }}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors cursor-pointer">
                    <Plus size={14} /> Adicionar
                  </button>
                  <button onClick={() => setImportOpen(true)}
                    className="flex items-center gap-2 border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-bold px-4 py-2.5 rounded-xl transition-colors cursor-pointer">
                    <Sparkles size={14} /> Importar extrato
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {grouped.map(([date, items]) => {
                const net = items.reduce((s, t) => t.type === "entrada" ? s + t.amount : s - t.amount, 0);
                return (
                  <div key={date} className="card overflow-hidden">
                    <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <Calendar size={12} className="text-slate-400" />
                        <span className="text-slate-600 text-xs font-semibold">{labelDate(date)}</span>
                        <span className="text-slate-300 text-xs">· {items.length}</span>
                      </div>
                      <span className={`mono text-xs font-bold ${net >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                        {net >= 0 ? "+" : ""}{toBRL(net)}
                      </span>
                    </div>

                    {items.map((tx) => {
                      const CatIcon = CAT_ICON[tx.category] ?? (tx.type === "entrada" ? ArrowUpRight : ArrowDownRight);
                      return (
                        <div key={tx.id} className="tx flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3">
                          <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 ${tx.type === "entrada" ? "bg-emerald-50" : "bg-rose-50"}`}>
                            <CatIcon size={16} className={tx.type === "entrada" ? "text-emerald-500" : "text-rose-500"} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start sm:items-center gap-1 flex-col sm:flex-row sm:gap-2">
                              <span className="text-blue-950 text-sm font-semibold truncate max-w-32.5 sm:max-w-none">{tx.description}</span>
                              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${tx.type === "entrada" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                                {tx.category}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              {tx.note && <p className="text-slate-400 text-xs truncate">{tx.note}</p>}
                              {/* Ícone de NF clicável */}
                              {tx.nfUrl && (
                                <a href={tx.nfUrl} target="_blank" rel="noreferrer"
                                  className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 font-medium shrink-0 transition-colors"
                                  title={tx.nfName ?? "Ver Nota Fiscal"}>
                                  <Paperclip size={11} />
                                  <span className="hidden sm:inline truncate max-w-24">{tx.nfName ?? "NF"}</span>
                                  <span className="sm:hidden">NF</span>
                                </a>
                              )}
                            </div>
                          </div>
                          <span className={`mono text-sm font-bold shrink-0 ${tx.type === "entrada" ? "text-emerald-600" : "text-rose-500"}`}>
                            {tx.type === "entrada" ? "+" : "-"}{toBRL(tx.amount)}
                          </span>
                          <div className="txa flex items-center gap-1 shrink-0">
                            <button onClick={() => { setEditing(tx); setModal(true); }}
                              className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-600 flex items-center justify-center text-slate-400 transition-colors cursor-pointer">
                              <Edit3 size={12} />
                            </button>
                            <button onClick={() => setConfirmId(tx.id)}
                              className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-rose-50 hover:text-rose-500 flex items-center justify-center text-slate-400 transition-colors cursor-pointer">
                              <Trash2 size={12} />
                            </button>
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
      </div>

      {/* FAB mobile */}
      <div className="lg:hidden fixed z-20 flex flex-col gap-2" style={{ bottom: 74, right: 18 }}>
        <button onClick={() => setImportOpen(true)}
          className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center active:scale-95 transition-transform cursor-pointer"
          style={{ boxShadow: "0 4px 16px rgba(21,101,192,.2)" }}>
          <Sparkles size={18} />
        </button>
        <button onClick={() => { setEditing(null); setModal(true); }}
          className="bg-blue-600 text-white rounded-2xl flex items-center justify-center active:scale-95 transition-transform cursor-pointer"
          style={{ width: 54, height: 54, boxShadow: "0 8px 28px rgba(21,101,192,.5)" }}>
          <Plus size={24} />
        </button>
      </div>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 lg:hidden bg-white border-t border-slate-100 flex justify-around items-center py-1.5"
        style={{ boxShadow: "0 -4px 20px rgba(13,34,71,.06)" }}>
        {[
          { icon: LayoutDashboard, label: "Início",     href: "/dashboard",   active: false },
          { icon: TrendingUp,      label: "Caixa",      href: "/fluxo-caixa", active: true  },
          { icon: FileText,        label: "Relatórios", href: "#",            active: false },
          { icon: CreditCard,      label: "Contas",     href: "#",            active: false },
          { icon: Settings,        label: "Config.",    href: "#",            active: false },
        ].map((item) => (
          <a key={item.label} href={item.href}
            className={`flex flex-col items-center gap-0.5 px-2 sm:px-3 py-1.5 rounded-xl transition-all cursor-pointer ${item.active ? "text-blue-600" : "text-slate-400"}`}>
            <item.icon size={20} strokeWidth={item.active ? 2.5 : 1.8} />
            <span className="text-xs font-medium">{item.label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}