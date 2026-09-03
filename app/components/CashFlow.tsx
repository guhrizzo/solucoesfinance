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
import { usePeriod } from "../hooks/usePeriod";
import { Modal, Button, MoneyInput, parseAmount, Sensitive } from "./ui";
import { syncCashflowExpense, settleCenterIfBudgetReached, budgetForCenterMonth } from "@/lib/costCenterSync";
import AccessDenied from "./AccessDenied";
import { PageLoader } from "./ui";
import { CASHFLOW_CATEGORIES, CUSTOM_CATEGORY, isCustomCategory } from "@/lib/cashflowCategories";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type TxType = "entrada" | "saida";

/** Espelho local de uma conta a pagar / cobrança, o suficiente pro Orçamento
 *  do mês e pro bloco de lançamentos previstos (parcelas de série "numeral"). */
interface ForecastDoc {
  id: string;
  title: string;
  amount: number;
  dueDate: string;
  status: string;
  category?: string;
  recurrence?: string;
  installmentIndex?: number;
  installmentCount?: number;
}

/** Linha do bloco "Previstos" — derivada de bills/receivables, nunca gravada. */
interface Previsto {
  id: string;
  kind: "aPagar" | "aReceber";
  description: string;
  amount: number;
  dueDate: string;
  installmentIndex?: number;
  installmentCount?: number;
}

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
  /** Id da despesa vinculada no Centro de Custo (nas duas direções da sincronização, ver lib/costCenterSync). */
  sourceExpenseId?: string;
  /** Centro de Custo ao qual esta saída se refere — opcional, só faz sentido pra type "saida". */
  costCenterId?: string;
  costCenterName?: string;
  /** true quando a despesa em `sourceExpenseId` foi criada A PARTIR desta saída (não apenas casada com uma despesa pré-existente) — define se ela deve ser removida junto ao deletar este lançamento. */
  expenseAutoCreated?: boolean;
}

interface CostCenterOption {
  id: string;
  name: string;
  budget?: number;
  budgetsByMonth?: Record<string, number>;
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

const CAT = CASHFLOW_CATEGORIES;

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

if (typeof window !== "undefined") {
  import("@/lib/firebase");
  import("firebase/auth");
  import("firebase/firestore");
}

/**
 * Caminho contrário da sincronização do Centro de Custo: quando uma saída é
 * lançada direto aqui no Fluxo de Caixa (manual ou por importação, sem vir
 * de lá), procura uma despesa pendente/agendada com a mesma descrição e
 * valor e dá baixa nela automaticamente — espelhando o vínculo por
 * `sourceExpenseId` que o Centro de Custo já usa na direção oposta.
 * Só age quando encontra exatamente 1 correspondência; ambíguo ou nenhum
 * resultado não arrisca vincular errado, o lançamento fica só no cashflow.
 */
async function autoSettleMatchingCostCenterExpense(
  db: import("firebase/firestore").Firestore,
  uid: string,
  tx: { description: string; amount: number }
): Promise<string | null> {
  const desc = (tx.description || "").trim().toLowerCase();
  if (!desc) return null;

  try {
    const { collection, query, where, getDocs, doc, updateDoc } = await import("firebase/firestore");
    // Só filtro simples (== userId) — igual ao resto do app já faz nessa
    // coleção. Combinar == com "in" em campos diferentes aqui exigiria um
    // índice composto que não existe, e a busca falhava sem avisar. Status
    // e comparação de texto ficam no cliente, sem depender de índice nenhum.
    const snap = await getDocs(query(collection(db, "expenses"), where("userId", "==", uid)));

    const matches = snap.docs.filter((d) => {
      const data = d.data();
      if (data.status !== "pendente" && data.status !== "agendado") return false;
      const expDesc = (data.description || `${data.category} – ${data.center}`).trim().toLowerCase();
      return expDesc === desc && Number(data.amount) === Number(tx.amount);
    });
    if (matches.length !== 1) return null;

    const matched = matches[0];
    await updateDoc(doc(db, "expenses", matched.id), { status: "pago", paidAt: TODAY });
    return matched.id;
  } catch (err) {
    // Nunca deixa a baixa automática travar o salvamento da transação em si.
    console.error("Erro ao tentar dar baixa automática no Centro de Custo:", err);
    return null;
  }
}

// ─── Modal de transação ───────────────────────────────────────────────────────

function TransactionModal({ open, editing, uid, costCenters, onClose, onSave }: {
  open: boolean; editing: Tx | null; uid: string | null; costCenters: CostCenterOption[];
  onClose: () => void; onSave: (data: Omit<Tx, "id">) => Promise<void>;
}) {
  const [type, setType] = useState<TxType>("entrada");
  const [desc, setDesc] = useState("");
  const [cat, setCat] = useState("");
  // "custom" = categoria digitada à mão (opção "Descrição" do select).
  const [catMode, setCatMode] = useState<"list" | "custom">("list");
  const [rawAmt, setRawAmt] = useState("");
  const [date, setDate] = useState(TODAY);
  const [note, setNote] = useState("");
  const [costCenterId, setCostCenterId] = useState("");
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
    setCatMode(isCustomCategory(editing?.category ?? "", editing?.type ?? "entrada") ? "custom" : "list");
    setRawAmt(editing ? editing.amount.toFixed(2).replace(".", ",") : "");
    setDate(editing?.date ?? TODAY);
    setNote(editing?.note ?? "");
    setCostCenterId(editing?.costCenterId ?? "");
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
      const [{ getFirebase }, { ref, uploadBytes, getDownloadURL }] = await Promise.all([import("@/lib/firebase"), import("firebase/storage")]);
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
      if (type === "saida") {
        const center = costCenters.find(c => c.id === costCenterId);
        saveData.costCenterId = center ? center.id : "";
        saveData.costCenterName = center ? center.name : "";
      } else {
        saveData.costCenterId = "";
        saveData.costCenterName = "";
      }
      await onSave(saveData);
      onClose();
    } catch (e: any) { setErr(e?.message ?? "Erro ao salvar"); setSaving(false); }
  }

  const hasNf = nfPreview || nfUrl;

  return (
    <Modal open={open} onClose={onClose} size="md" mobileSheet closeDisabled={saving}>
      <>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--cf-border)" }}>
          <div>
            <p className="font-heading text-base font-bold" style={{ color: "var(--cf-text)" }}>{editing ? "Editar transação" : "Nova transação"}</p>
            <p className="text-xs mt-1" style={{ color: "var(--cf-text-2)" }}>Preencha ou anexe uma nota fiscal</p>
          </div>
          <button onClick={() => !saving && onClose()} className="p-1.5 hover:bg-opacity-50 rounded-lg transition-colors cursor-pointer"
            style={{ background: "var(--cf-input)", color: "var(--cf-text-2)" }}>
            <X size={16} />
          </button>
        </div>
        <div className="px-5 pt-4 pb-6 space-y-4 overflow-y-auto" style={{ maxHeight: "82vh" }}>
          {err && (
            <div className="rounded-xl px-4 py-3 text-xs flex items-start gap-2"
              style={{ background: "var(--status-danger-bg)", border: "1px solid var(--status-danger-border)", color: "var(--status-danger-text)" }}>
              <span className="mt-0.5">⚠</span> {err}
            </div>
          )}
          {/* NF */}
          <div className="space-y-2.5">
            <label className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "var(--cf-text-2)" }}>
              <Paperclip size={12} /> Anexar nota fiscal
            </label>
            {hasNf ? (
              <div className="flex items-center gap-3 p-3.5 rounded-xl" style={{ background: "var(--status-info-bg)", border: "1px solid var(--status-info-border)" }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--status-info-bg)" }}>
                  <FileText size={16} style={{ color: "var(--status-info-text)" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: "var(--status-info-text)" }}>{nfName || "Nota Fiscal"}</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--cf-text-2)" }}>Anexada ✓</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {(nfPreview || nfUrl) && (
                    <a href={nfPreview || nfUrl} target="_blank" rel="noreferrer"
                      className="p-1.5 rounded-lg hover:bg-opacity-70 cursor-pointer"
                      style={{ background: "var(--status-info-bg)", color: "var(--status-info-text)" }}>
                      <ExternalLink size={12} />
                    </a>
                  )}
                  <button onClick={() => { setNfFile(null); setNfPreview(""); setNfUrl(""); setNfName(""); }}
                    className="p-1.5 rounded-lg hover:bg-opacity-70 cursor-pointer"
                    style={{ background: "var(--status-info-bg)", color: "var(--cf-text-2)" }}>
                    <X size={12} />
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => nfRef.current?.click()}
                className="w-full border-2 border-dashed rounded-xl p-4 flex items-center gap-3 transition-all hover:border-opacity-100 cursor-pointer"
                style={{ borderColor: "var(--cf-border)", background: "var(--cf-input)" }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--cf-border)" }}>
                  <Upload size={15} style={{ color: "var(--cf-text-2)" }} />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold" style={{ color: "var(--cf-text)" }}>PDF, imagem ou XML</p>
                  <p className="text-xs" style={{ color: "var(--cf-text-2)" }}>Clique para anexar</p>
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
                  : { background: "transparent", color: "var(--cf-text-2)" }}>
                {t === "entrada" ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
                {t === "entrada" ? "Entrada" : "Saída"}
              </button>
            ))}
          </div>
          {/* Descrição */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text-2)" }}>Descrição</label>
            <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Cliente XYZ, Aluguel…"
              className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors cursor-text"
              style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }} />
          </div>
          {/* Categoria */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text-2)" }}>Categoria</label>
            <div className="relative">
              <select
                value={catMode === "custom" ? CUSTOM_CATEGORY : cat}
                onChange={(e) => {
                  if (e.target.value === CUSTOM_CATEGORY) { setCatMode("custom"); setCat(""); }
                  else { setCatMode("list"); setCat(e.target.value); }
                }}
                className="w-full appearance-none rounded-xl px-4 py-3 pr-9 text-sm outline-none cursor-pointer transition-colors"
                style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }}>
                <option value="">— Selecione —</option>
                {CAT[type].map((c) => <option key={c} value={c}>{c}</option>)}
                <option value={CUSTOM_CATEGORY}>Descrição (especificar)…</option>
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--cf-text-2)" }} />
            </div>
            {catMode === "custom" && (
              <input value={cat} onChange={(e) => setCat(e.target.value)} placeholder="Descreva a categoria"
                className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors cursor-text"
                style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }} />
            )}
          </div>
          {/* Centro de custo — só faz sentido pra saída; vincula o pagamento a um
              centro pra lançar a despesa automaticamente lá e acompanhar o
              orçamento (ver lib/costCenterSync). */}
          {type === "saida" && costCenters.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text-2)" }}>
                Centro de custo <span className="normal-case font-normal">(opcional)</span>
              </label>
              <div className="relative">
                <select value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)}
                  className="w-full appearance-none rounded-xl px-4 py-3 pr-9 text-sm outline-none cursor-pointer transition-colors"
                  style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }}>
                  <option value="">— Nenhum —</option>
                  {costCenters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--cf-text-2)" }} />
              </div>
              {costCenterId && (
                <p className="text-xs flex items-center gap-1" style={{ color: "var(--success)" }}>
                  <Check size={11} /> Lança a despesa automaticamente nesse centro
                </p>
              )}
            </div>
          )}
          {/* Valor + Data */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text-2)" }}>Valor (R$)</label>
              <MoneyInput value={rawAmt} onValueChange={setRawAmt} />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text-2)" }}>Data</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl px-4 py-3 text-sm outline-none cursor-pointer transition-colors"
                style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }} />
            </div>
          </div>
          {/* Observação */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text-2)" }}>Observação (opcional)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="NF #123, parcela 1/5…"
              className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors cursor-text"
              style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }} />
          </div>
          <Button
            onClick={submit}
            disabled={!canSave}
            loading={saving}
            icon={Check}
            variant={type === "entrada" ? "success" : "danger"}
            size="lg"
            className="w-full"
          >
            {editing ? "Salvar alterações" : type === "entrada" ? "Registrar entrada" : "Registrar saída"}
          </Button>
        </div>
      </>
    </Modal>
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
    <Modal open={open} onClose={onClose} size="md" mobileSheet closeDisabled={step === "saving"}>
      <div style={{ maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: "1px solid var(--cf-border)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)" }}>
              <Sparkles size={16} className="text-white" />
            </div>
            <div>
              <p className="font-heading text-base font-bold" style={{ color: "var(--cf-text)" }}>Importar com IA</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--cf-text-2)" }}>
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
              style={{ background: "var(--cf-input)", color: "var(--cf-text-2)" }}>
              <X size={16} />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {step === "input" && (
            <>
              {errMsg && (
                <div className="rounded-xl px-4 py-3 text-xs flex items-start gap-2"
                  style={{ background: "var(--status-danger-bg)", border: "1px solid var(--status-danger-border)", color: "var(--status-danger-text)" }}>
                  <span className="shrink-0">⚠</span> {errMsg}
                </div>
              )}
              <button onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed rounded-xl p-5 flex flex-col items-center gap-2 transition-all hover:border-opacity-100 cursor-pointer"
                style={{ borderColor: "var(--cf-border)" }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "var(--cf-input)" }}>
                  <Upload size={18} style={{ color: "var(--cf-text-2)" }} />
                </div>
                <p className="text-sm font-semibold" style={{ color: "var(--cf-text)" }}>Fazer upload</p>
                <p className="text-xs" style={{ color: "var(--cf-text-2)" }}>.txt ou .csv do seu banco</p>
                <input ref={fileRef} type="file" accept=".txt,.csv" className="hidden" onChange={handleFile} />
              </button>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px" style={{ background: "var(--cf-border)" }} />
                <span className="text-xs font-medium" style={{ color: "var(--cf-text-2)" }}>ou cole o texto</span>
                <div className="flex-1 h-px" style={{ background: "var(--cf-border)" }} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text-2)" }}>Extrato bancário</label>
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8}
                  placeholder={`01/03/2026  PIX RECEBIDO ABC    CR  R$ 3.500,00\n05/03/2026  ALUGUEL SALA         DB  R$ 2.200,00`}
                  className="w-full rounded-xl px-4 py-3 text-xs font-mono outline-none resize-none cursor-text"
                  style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }} />
                <p className="text-xs" style={{ color: "var(--cf-text-2)" }}>{text.length} caracteres</p>
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
                <p className="text-xs mt-2" style={{ color: "var(--cf-text-2)" }}>Extraindo transações, valores e categorias</p>
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
                    <p className="text-xs" style={{ color: "var(--cf-text-2)" }}>{label}</p>
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
                <span className="ml-auto text-xs font-normal" style={{ color: "var(--cf-text-2)" }}>{selected.size}/{preview.length}</span>
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
                        <p className="text-xs truncate" style={{ color: "var(--cf-text-2)" }}>{tx.category} · {shortDate(tx.date)}</p>
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
              <p className="text-sm text-center" style={{ color: "var(--cf-text-2)" }}>
                {selected.size} transação{selected.size !== 1 ? "ões" : ""} importada{selected.size !== 1 ? "s" : ""}.
              </p>
            </div>
          )}
        </div>
        <div className="px-5 py-4 shrink-0 flex gap-2" style={{ borderTop: "1px solid var(--cf-border)" }}>
          {step === "input" && (
            <>
              <Button variant="secondary" onClick={onClose} className="flex-1">Cancelar</Button>
              <Button variant="primary" icon={Sparkles} onClick={analyze} disabled={!text.trim()} className="flex-1">Analisar</Button>
            </>
          )}
          {step === "preview" && (
            <>
              <Button variant="secondary" onClick={() => setStep("input")} className="flex-1">← Voltar</Button>
              <Button variant="success" icon={Check} onClick={confirmImport} disabled={selected.size === 0} className="flex-1">Importar</Button>
            </>
          )}
          {step === "saving" && (
            <Button variant="secondary" disabled loading className="flex-1">Salvando…</Button>
          )}
          {step === "done" && (
            <Button variant="primary" icon={Check} onClick={onClose} className="flex-1">Concluir</Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ─── Detalhamento do Orçamento ────────────────────────────────────────────────
// O modal que abre ao clicar no KPI "Orçamento" abre a conta linha a linha:
// centros de custo (orçado × realizado), contas a pagar e impostos — estes dois
// agrupados por categoria e com status de cada item. A soma continua batendo
// exatamente com o KPI.

type LineStatus = "pago" | "aberto" | "vencido" | "agendado";

const STATUS_META: Record<LineStatus, { label: string; fg: string; bg: string }> = {
  pago:     { label: "Pago",      fg: "#15803d", bg: "#dcfce7" },
  aberto:   { label: "Em aberto", fg: "#b45309", bg: "#fef3c7" },
  vencido:  { label: "Vencido",   fg: "#b91c1c", bg: "#fee2e2" },
  agendado: { label: "Agendado",  fg: "#1d4ed8", bg: "#dbeafe" },
};

const normalizeBillStatus = (s: string): LineStatus =>
  s === "pago" ? "pago" : s === "vencido" ? "vencido" : s === "agendado" ? "agendado" : "aberto";
const normalizeTaxStatus = (s: string): LineStatus =>
  s === "pago" ? "pago" : s === "atraso" ? "vencido" : s === "agendado" ? "agendado" : "aberto";

// type do imposto → esfera, pro agrupamento (a esfera não é gravada no doc).
const TAX_SPHERE: Record<string, string> = {
  simples_nacional: "Federais", irpf: "Federais", irpj: "Federais", pis: "Federais",
  cofins: "Federais", csll: "Federais", ipi: "Federais", iof: "Federais", itr: "Federais",
  inss: "Federais", fgts: "Federais",
  icms: "Estaduais", ipva: "Estaduais", itcmd: "Estaduais",
  iss: "Municipais", iptu: "Municipais", itbi: "Municipais",
};

interface BudgetLine {
  key: string;
  label: string;
  sub: string | null;
  amount: number;
  status: LineStatus;
  href: string;
  category: string;
}
interface BudgetCatGroup {
  category: string;
  total: number;
  pago: number;
  items: BudgetLine[];
}

function groupBudgetLines(rows: BudgetLine[]): BudgetCatGroup[] {
  const m = new Map<string, BudgetLine[]>();
  for (const r of rows) {
    const arr = m.get(r.category) ?? [];
    arr.push(r);
    m.set(r.category, arr);
  }
  return [...m.entries()]
    .map(([category, items]) => ({
      category,
      items: items.sort((a, b) => (a.sub ?? "").localeCompare(b.sub ?? "")),
      total: items.reduce((s, i) => s + i.amount, 0),
      pago: items.filter(i => i.status === "pago").reduce((s, i) => s + i.amount, 0),
    }))
    .sort((a, b) => b.total - a.total);
}

function StatusBadge({ status }: { status: LineStatus }) {
  const m = STATUS_META[status];
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: m.bg, color: m.fg }}>
      {m.label}
    </span>
  );
}

function BudgetLineRow({ line, hideValues }: { line: BudgetLine; hideValues: boolean }) {
  return (
    <a
      href={line.href}
      className="flex items-center gap-2.5 px-4 py-2.5 border-b last:border-b-0 transition-colors hover:bg-[var(--cf-hover)]"
      style={{ borderColor: "var(--cf-border)" }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium truncate" style={{ color: "var(--cf-text)" }}>{line.label}</p>
          <StatusBadge status={line.status} />
        </div>
        {line.sub && <p className="text-[11px] mt-0.5" style={{ color: "var(--cf-text-3)" }}>{line.sub}</p>}
      </div>
      <span className="text-sm font-semibold mono shrink-0" style={{ color: "var(--cf-text)" }}>
        <Sensitive hidden={hideValues}>{toBRL(line.amount)}</Sensitive>
      </span>
      <ExternalLink size={12} className="shrink-0" style={{ color: "var(--cf-text-3)" }} />
    </a>
  );
}

function BudgetCategoryBlock({ group, hideValues }: { group: BudgetCatGroup; hideValues: boolean }) {
  return (
    <div className="cf-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2" style={{ background: "var(--cf-txhdr)", borderBottom: "1px solid var(--cf-border)" }}>
        <span className="text-xs font-bold" style={{ color: "var(--cf-text-2)" }}>{group.category} · {group.items.length}</span>
        <span className="text-xs font-bold mono" style={{ color: "var(--cf-text-2)" }}>
          <Sensitive hidden={hideValues}>{toBRL(group.total)}</Sensitive>
        </span>
      </div>
      {group.items.map(it => <BudgetLineRow key={it.key} line={it} hideValues={hideValues} />)}
    </div>
  );
}

function BudgetSection({ icon: Icon, title, hint, subtotal, pago, hideValues, children }: {
  icon: LucideIcon; title: string; hint: string; subtotal: number; pago: number;
  hideValues: boolean; children: React.ReactNode;
}) {
  const aberto = subtotal - pago;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon size={14} style={{ color: "var(--cf-text-2)" }} />
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-2)" }}>{title}</span>
        </div>
        <span className="text-sm font-bold mono" style={{ color: "var(--cf-text)" }}>
          <Sensitive hidden={hideValues}>{toBRL(subtotal)}</Sensitive>
        </span>
      </div>
      <div className="flex items-center gap-3 text-[11px]">
        <span style={{ color: "var(--cf-text-3)" }}>{hint}</span>
        <span className="ml-auto shrink-0" style={{ color: "#15803d" }}>Pago <Sensitive hidden={hideValues}>{toBRL(pago)}</Sensitive></span>
        <span className="shrink-0" style={{ color: "#b45309" }}>Aberto <Sensitive hidden={hideValues}>{toBRL(aberto)}</Sensitive></span>
      </div>
      {children}
    </div>
  );
}

function CenterBudgetRow({ name, orcado, realizado, hideValues }: {
  name: string; orcado: number; realizado: number; hideValues: boolean;
}) {
  const pct = orcado > 0 ? Math.min((realizado / orcado) * 100, 100) : 0;
  const over = orcado > 0 && realizado > orcado;
  const restante = orcado - realizado;
  return (
    <div className="px-4 py-3 border-b last:border-b-0" style={{ borderColor: "var(--cf-border)" }}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className="text-sm font-medium truncate" style={{ color: "var(--cf-text)" }}>{name}</p>
        <span className="text-sm font-semibold mono shrink-0" style={{ color: "var(--cf-text)" }}>
          <Sensitive hidden={hideValues}>{toBRL(orcado)}</Sensitive>
        </span>
      </div>
      <div className="cf-progress">
        <div className="cf-progress-fill" style={{ width: `${pct}%`, background: over ? "#dc2626" : "#3b82f6" }} />
      </div>
      <div className="flex items-center justify-between mt-1 text-[11px]" style={{ color: "var(--cf-text-3)" }}>
        <span>Realizado <b style={{ color: over ? "#b91c1c" : "#15803d" }}><Sensitive hidden={hideValues}>{toBRL(realizado)}</Sensitive></b></span>
        <span>{over ? "Estourou " : "Falta "}
          <b style={{ color: over ? "#b91c1c" : "var(--cf-text-2)" }}><Sensitive hidden={hideValues}>{toBRL(Math.abs(restante))}</Sensitive></b>
        </span>
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
  const [costCenters, setCostCenters] = useState<CostCenterOption[]>([]);
  const [pageState, setPageState] = useState<"loading" | "ready" | "error" | "blocked">("loading");
  const [errMsg, setErrMsg] = useState("");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Tx | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | TxType>("all");
  const [search, setSearch] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [hideValues, setHideValues] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  // Contas a pagar / a receber / impostos do dono. O Orçamento do mês só precisa
  // de valor + vencimento; os campos de parcela alimentam o bloco "Previstos".
  const [bills, setBills] = useState<ForecastDoc[]>([]);
  const [receivables, setReceivables] = useState<ForecastDoc[]>([]);
  const [taxes, setTaxes] = useState<{ id: string; name: string; type: string; status: string; amount: number; dueDate: string }[]>([]);
  // Despesas reais dos centros de custo — só pra mostrar "realizado" (pago) vs
  // orçado no detalhamento do Orçamento. Não entra em nenhum total da tela.
  const [expenses, setExpenses] = useState<{ center: string; amount: number; status: string; date: string }[]>([]);

  // Mês em foco = seletor global da Navbar (usePeriod). Tudo nesta tela —
  // KPIs (Orçamento/Entradas/Saídas/Saldo/Resultado) e a lista — é recortado
  // por este mês.
  const { monthKey, label: periodLabel } = usePeriod();
  const currentMonthKey = useMemo(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
  }, []);

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

  // Abre o card do mês em foco (a lista mostra só ele).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reage à troca de mês no seletor global
    setOpenMonths(new Set([monthKey]));
  }, [monthKey]);

    useEffect(() => {
      let snapUnsub: (() => void) | undefined;
      let snapCenterUnsub: (() => void) | undefined;
      let snapBillsUnsub: (() => void) | undefined;
      let snapReceivablesUnsub: (() => void) | undefined;
      let snapTaxesUnsub: (() => void) | undefined;
      let snapExpensesUnsub: (() => void) | undefined;
      let authUnsub: (() => void) | undefined;
      (async () => {
        try {
          const [{ getFirebase }, { onAuthStateChanged }, { collection, query, orderBy, onSnapshot, where }] = await Promise.all([
            import("@/lib/firebase"),
            import("firebase/auth"),
            import("firebase/firestore"),
          ]);
          const { auth, db } = await getFirebase();
          authUnsub = onAuthStateChanged(auth, async (u) => {
            if (!u) { window.location.href = "/login"; return; }

            // Resolve de quem são os dados que este login deve ver: o
            // próprio uid (dono) ou o do dono da conta (membro convidado)
            // — ver lib/accountScope.ts. Membro sem "fluxoCaixa" liberado
            // nem chega a assinar as coleções abaixo.
            const { resolveAccountScope, hasPermission } = await import("@/lib/accountScope");
            const scope = await resolveAccountScope(db, u.uid);
            if (!hasPermission(scope, "fluxoCaixa")) {
              setPageState("blocked");
              return;
            }
            const ownerUid = scope.ownerUid;

            setUid(ownerUid);
            setUserName(u.displayName ?? u.email ?? "Usuário");
            setUserEmail(u.email ?? "");

            // ── Listener de transações ──
            snapUnsub?.();
            const q = query(collection(db, "users", ownerUid, "cashflow"), orderBy("createdAt", "desc"));
            snapUnsub = onSnapshot(q,
              (snap) => { setTxs(snap.docs.map(d => ({ id: d.id, ...d.data() } as Tx))); setPageState("ready"); },
              (err) => { setErrMsg(`${err.message} (${err.code})`); setPageState("error"); }
            );

            // ── Listener de centros de custo ──
            // Guarda os docs crus (com budgetsByMonth); o Orçamento do mês em
            // foco é somado no useMemo `previsao`, não aqui.
            snapCenterUnsub?.();
            const centerQ = query(collection(db, "costCenters"), where("userId", "==", ownerUid));
            snapCenterUnsub = onSnapshot(
              centerQ,
              (snap) => {
                // Mesmo snapshot alimenta o seletor "Centro de custo" do modal de
                // saída — evita um segundo listener na mesma coleção.
                setCostCenters(snap.docs.map((d) => {
                  const data = d.data();
                  return { id: d.id, name: data.name, budget: data.budget, budgetsByMonth: data.budgetsByMonth };
                }));
              },
              (err) => {
                console.debug("Aviso ao sincronizar orçamento:", err.code);
              }
            );

            // ── Listener de contas a pagar (TODAS, pagas ou não) ──
            // O Orçamento não desconta pagamento; os campos de parcela alimentam
            // o bloco "Previstos". O useMemo filtra pelo mês em foco.
            const toForecastDoc = (d: any): ForecastDoc => {
              const x = d.data();
              return {
                id: d.id,
                title: x.title || x.description || "",
                amount: Number(x.amount) || 0,
                dueDate: (x.dueDate as string) || "",
                status: String(x.status || ""),
                category: (x.category as string) || undefined,
                recurrence: x.recurrence as string | undefined,
                installmentIndex: x.installmentIndex as number | undefined,
                installmentCount: x.installmentCount as number | undefined,
              };
            };

            snapBillsUnsub?.();
            snapBillsUnsub = onSnapshot(
              collection(db, "users", ownerUid, "bills"),
              (snap) => setBills(snap.docs.map(toForecastDoc)),
              (err) => {
                console.debug("Aviso ao sincronizar contas a pagar:", err.code);
              }
            );

            // ── Listener de contas a receber (TODAS) — só pro bloco "Previstos" ──
            snapReceivablesUnsub?.();
            snapReceivablesUnsub = onSnapshot(
              collection(db, "users", ownerUid, "receivables"),
              (snap) => setReceivables(snap.docs.map(toForecastDoc)),
              (err) => {
                console.debug("Aviso ao sincronizar contas a receber:", err.code);
              }
            );

            // ── Listener de impostos (TODOS, pagos ou não) ──
            snapTaxesUnsub?.();
            snapTaxesUnsub = onSnapshot(
              collection(db, "users", ownerUid, "taxes"),
              (snap) => {
                setTaxes(snap.docs.map((d) => {
                  const x = d.data();
                  return {
                    id: d.id,
                    name: (x.name as string) || "Imposto",
                    type: (x.type as string) || "outro",
                    status: String(x.status || ""),
                    amount: x.amount || 0,
                    dueDate: (x.dueDate as string) || "",
                  };
                }));
              },
              (err) => {
                console.debug("Aviso ao sincronizar impostos:", err.code);
              }
            );

            // ── Listener de despesas dos centros de custo ──
            // Só pra calcular o "realizado" (despesas pagas) por centro no
            // detalhamento do Orçamento. Mesma query que a tela de Centro de Custo.
            snapExpensesUnsub?.();
            snapExpensesUnsub = onSnapshot(
              query(collection(db, "expenses"), where("userId", "==", ownerUid)),
              (snap) => {
                setExpenses(snap.docs.map((d) => {
                  const x = d.data();
                  return {
                    center: (x.center as string) || "",
                    amount: Number(x.amount) || 0,
                    status: String(x.status || ""),
                    date: (x.date as string) || "",
                  };
                }));
              },
              (err) => {
                console.debug("Aviso ao sincronizar despesas:", err.code);
              }
            );
          });
        } catch (e: any) { setErrMsg(e.message); setPageState("error"); }
      })();
      return () => { authUnsub?.(); snapUnsub?.(); snapCenterUnsub?.(); snapBillsUnsub?.(); snapReceivablesUnsub?.(); snapTaxesUnsub?.(); snapExpensesUnsub?.(); };
    }, []);

  async function handleLogout() {
    const { getFirebase } = await import("@/lib/firebase");
    const { signOut } = await import("firebase/auth");
    const { auth } = await getFirebase();
    await signOut(auth);
    window.location.href = "/login";
  }

  async function handleSave(data: Omit<Tx, "id">) {
    if (!uid) throw new Error("Usuário não autenticado");
    const [{ getFirebase }, { doc, updateDoc, collection, addDoc }] = await Promise.all([import("@/lib/firebase"), import("firebase/firestore")]);
    const { db } = await getFirebase();
    const clean: Record<string, unknown> = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));

    const hasCenter = data.type === "saida" && !!data.costCenterId && !!data.costCenterName;

    // Depois de salvar uma saída vinculada a um centro, confere se o total
    // pago do centro no mês bateu o orçamento — se sim, quita o resto das
    // despesas pendentes/agendadas daquele centro automaticamente.
    const checkCenterBudget = async () => {
      if (!hasCenter) return;
      const center = costCenters.find(c => c.id === data.costCenterId);
      if (!center) return;
      const monthKey = data.date.slice(0, 7);
      const currentMonthKey = new Date().toISOString().slice(0, 7);
      const budget = budgetForCenterMonth(center, monthKey, currentMonthKey);
      await settleCenterIfBudgetReached(db, uid, data.costCenterName!, monthKey, budget);
    };

    if (editing) {
      if (data.type === "saida") {
        if (hasCenter) {
          // Lança/atualiza a despesa espelho no centro selecionado (qualquer
          // que seja o valor pago — pagamento parcial inclusive).
          const linkedExpenseId = await syncCashflowExpense(db, uid, editing.sourceExpenseId, {
            description: data.description, category: data.category,
            costCenterId: data.costCenterId!, costCenterName: data.costCenterName!,
            amount: data.amount, date: data.date,
          });
          clean.sourceExpenseId = linkedExpenseId ?? "";
          clean.expenseAutoCreated = true;
        } else if (editing.expenseAutoCreated && editing.sourceExpenseId) {
          // Centro foi desvinculado nesta edição — remove a despesa que essa
          // saída tinha criado automaticamente.
          await syncCashflowExpense(db, uid, editing.sourceExpenseId, {
            description: data.description, category: data.category,
            costCenterId: "", costCenterName: "", amount: data.amount, date: data.date,
          });
          clean.sourceExpenseId = "";
          clean.expenseAutoCreated = false;
        }
      }
      await updateDoc(doc(db, "users", uid, "cashflow", editing.id), clean as any);
      await checkCenterBudget();
    } else if (data.type === "saida" && hasCenter) {
      // Saída nova já vinculada a um centro: lança a despesa automaticamente lá.
      const expenseId = await syncCashflowExpense(db, uid, undefined, {
        description: data.description, category: data.category,
        costCenterId: data.costCenterId!, costCenterName: data.costCenterName!,
        amount: data.amount, date: data.date,
      });
      if (expenseId) { clean.sourceExpenseId = expenseId; clean.expenseAutoCreated = true; }
      await addDoc(collection(db, "users", uid, "cashflow"), clean);
      await checkCenterBudget();
    } else {
      // Lançamento novo sem centro selecionado — tenta dar baixa automática
      // numa despesa pendente correspondente por descrição+valor (comportamento
      // anterior, mantido como fallback pra quem não usa o seletor de centro).
      if (data.type === "saida") {
        const matchedId = await autoSettleMatchingCostCenterExpense(db, uid, { description: data.description, amount: data.amount });
        if (matchedId) clean.sourceExpenseId = matchedId;
      }
      await addDoc(collection(db, "users", uid, "cashflow"), clean);
    }
  }

  async function handleImport(importedTxs: ImportedTx[]) {
    if (!uid) throw new Error("Usuário não autenticado");
    const [{ getFirebase }, { collection, addDoc }] = await Promise.all([import("@/lib/firebase"), import("firebase/firestore")]);
    const { db } = await getFirebase();
    await Promise.all(importedTxs.map(async (tx) => {
      const entry: Record<string, unknown> = { ...tx, createdAt: Date.now() };
      if (tx.type === "saida") {
        const matchedId = await autoSettleMatchingCostCenterExpense(db, uid, { description: tx.description, amount: tx.amount });
        if (matchedId) entry.sourceExpenseId = matchedId;
      }
      await addDoc(collection(db, "users", uid, "cashflow"), entry);
    }));
  }

  async function handleDelete() {
    if (!confirmId || !uid || deleting) return;
    setDeleting(true);
    try {
      const [{ getFirebase }, { doc, deleteDoc }] = await Promise.all([import("@/lib/firebase"), import("firebase/firestore")]);
      const { db } = await getFirebase();
      // Se essa saída tinha lançado uma despesa automaticamente num centro de
      // custo, remove a despesa junto — ela não existia antes desse pagamento.
      const tx = txs.find(t => t.id === confirmId);
      if (tx?.expenseAutoCreated && tx.sourceExpenseId) {
        await deleteDoc(doc(db, "expenses", tx.sourceExpenseId)).catch(() => {});
      }
      await deleteDoc(doc(db, "users", uid, "cashflow", confirmId));
      setConfirmId(null);
    } catch (e: any) { alert("Erro ao deletar: " + e.message); }
    finally { setDeleting(false); }
  }

  // ─── Métricas ────────────────────────────────────────────────────────────────

  // Transações do mês em foco — base de tudo nesta tela.
  const monthTxs = useMemo(
    () => txs.filter(t => (t.date ?? "").slice(0, 7) === monthKey),
    [txs, monthKey]
  );

  const entradas = useMemo(() => monthTxs.filter(t => t.type === "entrada").reduce((s, t) => s + t.amount, 0), [monthTxs]);
  const saidas = useMemo(() => monthTxs.filter(t => t.type === "saida").reduce((s, t) => s + t.amount, 0), [monthTxs]);
  const saldo = entradas - saidas;

  // Orçamento do mês em foco: orçamento dos centros de custo naquele mês +
  // contas a pagar que vencem naquele mês + impostos que vencem naquele mês.
  const previsao = useMemo(() => {
    const centers = costCenters.reduce((s, c) => s + budgetForCenterMonth(c, monthKey, currentMonthKey), 0);
    const billsM = bills.filter(b => (b.dueDate ?? "").slice(0, 7) === monthKey).reduce((s, b) => s + b.amount, 0);
    const taxesM = taxes.filter(t => (t.dueDate ?? "").slice(0, 7) === monthKey).reduce((s, t) => s + t.amount, 0);
    return centers + billsM + taxesM;
  }, [costCenters, bills, taxes, monthKey, currentMonthKey]);

  const superavitDeficit = saldo - previsao;

  // Quebra do Orçamento linha a linha — alimenta o modal que abre ao clicar no
  // KPI "Orçamento". A soma dos três grupos bate exatamente com `previsao`.
  const previsaoDetalhe = useMemo(() => {
    const doMes = (iso: string) => (iso ?? "").slice(0, 7) === monthKey;

    // Centros de custo: orçado no mês × realizado (soma das despesas pagas do
    // centro naquele mês). O orçado é o que entra no total do Orçamento.
    const centros = costCenters
      .map(c => {
        const orcado = budgetForCenterMonth(c, monthKey, currentMonthKey);
        const realizado = expenses
          .filter(e => e.center === c.name && e.status === "pago" && doMes(e.date))
          .reduce((s, e) => s + e.amount, 0);
        return { id: c.id, name: c.name, orcado, realizado };
      })
      .filter(c => c.orcado > 0)
      .sort((a, b) => b.orcado - a.orcado);
    const centrosOrcado = centros.reduce((s, c) => s + c.orcado, 0);
    const centrosRealizado = centros.reduce((s, c) => s + c.realizado, 0);

    // Contas a pagar do mês, agrupadas por categoria, com status por item.
    const contasLines: BudgetLine[] = bills
      .filter(b => doMes(b.dueDate))
      .map(b => ({
        key: `b-${b.id}`,
        label: b.title || "Conta a pagar",
        sub: labelDate(b.dueDate) + (b.installmentIndex ? ` · Parcela ${b.installmentIndex}/${b.installmentCount}` : ""),
        amount: b.amount,
        status: normalizeBillStatus(b.status),
        href: "/contasPagar",
        category: b.category || "Sem categoria",
      }));
    const contas = groupBudgetLines(contasLines);
    const contasTotal = contasLines.reduce((s, l) => s + l.amount, 0);
    const contasPago = contasLines.filter(l => l.status === "pago").reduce((s, l) => s + l.amount, 0);

    // Impostos do mês, agrupados por esfera (Federais / Estaduais / Municipais).
    const impostosLines: BudgetLine[] = taxes
      .filter(t => doMes(t.dueDate))
      .map((t, i) => ({
        key: `t-${t.id || i}`,
        label: t.name || "Imposto",
        sub: labelDate(t.dueDate),
        amount: t.amount,
        status: normalizeTaxStatus(t.status),
        href: "/impostos",
        category: TAX_SPHERE[t.type] || "Outros",
      }));
    const impostos = groupBudgetLines(impostosLines);
    const impostosTotal = impostosLines.reduce((s, l) => s + l.amount, 0);
    const impostosPago = impostosLines.filter(l => l.status === "pago").reduce((s, l) => s + l.amount, 0);

    return {
      centros, centrosOrcado, centrosRealizado,
      contas, contasTotal, contasPago,
      impostos, impostosTotal, impostosPago,
    };
  }, [costCenters, bills, taxes, expenses, monthKey, currentMonthKey]);

  // ─── Lançamentos PREVISTOS (informativo) ────────────────────────────────────
  // Só parcelas de série "numeral" ainda não quitadas, com vencimento no mês em
  // foco. Nada é gravado na coleção cashflow — é derivado de bills/receivables.
  // Não entra em Entradas/Saídas/Saldo; some sozinho quando a parcela é quitada.
  const previstos = useMemo<Previsto[]>(() => {
    const naoQuitada = (s: string, quitado: string) => s !== quitado;
    const doMes = (iso: string) => (iso ?? "").slice(0, 7) === monthKey;

    const saidas = bills
      .filter(b => b.recurrence === "numeral" && b.installmentCount && doMes(b.dueDate) && naoQuitada(b.status, "pago"))
      .map<Previsto>(b => ({
        id: b.id, kind: "aPagar", description: b.title, amount: b.amount, dueDate: b.dueDate,
        installmentIndex: b.installmentIndex, installmentCount: b.installmentCount,
      }));

    const entradas = receivables
      .filter(r => r.recurrence === "numeral" && r.installmentCount && doMes(r.dueDate) && naoQuitada(r.status, "recebido"))
      .map<Previsto>(r => ({
        id: r.id, kind: "aReceber", description: r.title, amount: r.amount, dueDate: r.dueDate,
        installmentIndex: r.installmentIndex, installmentCount: r.installmentCount,
      }));

    return [...entradas, ...saidas].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [bills, receivables, monthKey]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return monthTxs.filter(t => filter === "all" || t.type === filter).filter(t => !q || t.description.toLowerCase().includes(q) || t.category.toLowerCase().includes(q));
  }, [monthTxs, filter, search]);

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

  const displayValue = (val: number) => <Sensitive hidden={hideValues}>{toBRL(val)}</Sensitive>;

  const kpis = [
    { label: "Orçamento", val: previsao, Icon: ClipboardList, ibg: "#eff6ff", color: "#3b82f6" },
    { label: "Entradas", val: entradas, Icon: ArrowUpRight, ibg: "#dcfce7", color: "#059669", sub: `${monthTxs.filter(t => t.type === "entrada").length} lançamentos` },
    { label: "Saídas", val: saidas, Icon: ArrowDownRight, ibg: "#fee2e2", color: "#dc2626", sub: `${monthTxs.filter(t => t.type === "saida").length} lançamentos` },
    { label: "Saldo", val: saldo, Icon: Wallet, ibg: saldo >= 0 ? "#dbeafe" : "#fee2e2", color: saldo >= 0 ? "#3b82f6" : "#dc2626", sub: saldo >= 0 ? "Positivo" : "Negativo" },
    { label: "Resultado", val: superavitDeficit, Icon: TrendingUp, ibg: superavitDeficit >= 0 ? "#dcfce7" : "#fee2e2", color: superavitDeficit >= 0 ? "#059669" : "#dc2626", sub: superavitDeficit >= 0 ? "Acima da meta" : "Abaixo da meta" },
  ];

  if (pageState === "blocked") return <AccessDenied category="Fluxo de Caixa" />;

  if (pageState === "loading") return <PageLoader background="var(--cf-bg)" />;

  if (pageState === "error") return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center" style={{ background: "var(--cf-bg)" }}>
      <p className="font-heading text-lg font-bold text-rose-500">Erro ao conectar</p>
      <div className="rounded-xl p-4 max-w-sm w-full text-left cf-card" style={{ background: "var(--status-danger-bg)", border: "1px solid var(--status-danger-border)" }}>
        <p className="text-xs font-mono break-all text-rose-700">{errMsg || "Erro desconhecido"}</p>
      </div>
      <Button variant="primary" onClick={() => window.location.reload()} className="mt-2">Tentar novamente</Button>
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--cf-bg)" }}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }

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
        ::-webkit-scrollbar-thumb:hover { background: var(--cf-text-3); }
        .scrollbar-none { scrollbar-width: none; }
        .scrollbar-none::-webkit-scrollbar { display: none; }

        .cf-progress { height: 4px; border-radius: 2px; background: var(--cf-border); overflow: hidden; margin-top: 8px; }
        .cf-progress-fill { height: 100%; border-radius: 2px; transition: width .4s cubic-bezier(.4,0,.2,1); }

        button, a, input, select, textarea { transition: all .12s cubic-bezier(.4, 0, .2, 1) !important; }
        input:focus, select:focus, textarea:focus { border-color: #3b82f6 !important; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1) !important; }
      `}</style>

      <Navbar user={{ displayName: userName, email: userEmail }} activePath="/fluxo-caixa" onLogout={handleLogout} />

      <TransactionModal open={modal} editing={editing} uid={uid} costCenters={costCenters} onClose={() => { setModal(false); setEditing(null); }} onSave={handleSave} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImport={handleImport} />

      <Modal open={!!confirmId} onClose={() => setConfirmId(null)} size="sm" closeDisabled={deleting}>
        <div className="p-6 text-center">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: "var(--status-danger-bg)" }}>
            <Trash2 size={20} style={{ color: "var(--status-danger-text)" }} />
          </div>
          <p className="font-heading text-base font-bold mb-1" style={{ color: "var(--cf-text)" }}>Excluir transação?</p>
          <p className="text-xs mb-5" style={{ color: "var(--cf-text-2)" }}>Esta ação não pode ser desfeita.</p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setConfirmId(null)} className="flex-1">Cancelar</Button>
            <Button variant="danger" icon={Trash2} onClick={handleDelete} loading={deleting} className="flex-1">Excluir</Button>
          </div>
        </div>
      </Modal>

      {/* Detalhamento do Orçamento */}
      <Modal open={budgetOpen} onClose={() => setBudgetOpen(false)} size="md" mobileSheet>
        <div style={{ maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
          <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: "1px solid var(--cf-border)" }}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#eff6ff" }}>
                <ClipboardList size={16} style={{ color: "#3b82f6" }} />
              </div>
              <div className="min-w-0">
                <p className="font-heading text-base font-bold truncate" style={{ color: "var(--cf-text)" }}>Orçamento · {periodLabel}</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--cf-text-2)" }}>Tudo que compõe o valor previsto do mês</p>
              </div>
            </div>
            <button onClick={() => setBudgetOpen(false)} className="p-1.5 rounded-lg cursor-pointer shrink-0"
              style={{ background: "var(--cf-input)", color: "var(--cf-text-2)" }}>
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {previsao === 0 ? (
              <p className="text-sm text-center py-10" style={{ color: "var(--cf-text-2)" }}>
                Sem orçamento de centro de custo, contas a pagar ou impostos com vencimento em {periodLabel}.
              </p>
            ) : (
              <>
                {previsaoDetalhe.centros.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Building2 size={14} style={{ color: "var(--cf-text-2)" }} />
                        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-2)" }}>Centros de custo</span>
                      </div>
                      <span className="text-sm font-bold mono" style={{ color: "var(--cf-text)" }}>
                        <Sensitive hidden={hideValues}>{toBRL(previsaoDetalhe.centrosOrcado)}</Sensitive>
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px]">
                      <span style={{ color: "var(--cf-text-3)" }}>Orçado do mês × já gasto (despesas pagas)</span>
                      <span className="ml-auto shrink-0" style={{ color: "#15803d" }}>
                        Realizado <Sensitive hidden={hideValues}>{toBRL(previsaoDetalhe.centrosRealizado)}</Sensitive>
                      </span>
                    </div>
                    <div className="cf-card overflow-hidden">
                      {previsaoDetalhe.centros.map(c => (
                        <CenterBudgetRow key={c.id} name={c.name} orcado={c.orcado} realizado={c.realizado} hideValues={hideValues} />
                      ))}
                    </div>
                    <a href="/costCenter" className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: "#3b82f6" }}>
                      Abrir centros de custo <ExternalLink size={11} />
                    </a>
                  </div>
                )}

                {previsaoDetalhe.contas.length > 0 && (
                  <BudgetSection
                    icon={Truck} title="Contas a pagar" hint="Vencem neste mês"
                    subtotal={previsaoDetalhe.contasTotal} pago={previsaoDetalhe.contasPago} hideValues={hideValues}
                  >
                    {previsaoDetalhe.contas.map(g => <BudgetCategoryBlock key={g.category} group={g} hideValues={hideValues} />)}
                  </BudgetSection>
                )}

                {previsaoDetalhe.impostos.length > 0 && (
                  <BudgetSection
                    icon={Receipt} title="Impostos" hint="Vencem neste mês"
                    subtotal={previsaoDetalhe.impostosTotal} pago={previsaoDetalhe.impostosPago} hideValues={hideValues}
                  >
                    {previsaoDetalhe.impostos.map(g => <BudgetCategoryBlock key={g.category} group={g} hideValues={hideValues} />)}
                  </BudgetSection>
                )}
              </>
            )}
          </div>
          <div className="px-5 py-4 shrink-0 flex items-center justify-between" style={{ borderTop: "1px solid var(--cf-border)" }}>
            <span className="text-sm font-semibold" style={{ color: "var(--cf-text-2)" }}>Total do orçamento</span>
            <span className="font-heading text-lg font-bold mono" style={{ color: "#3b82f6" }}>{displayValue(previsao)}</span>
          </div>
        </div>
      </Modal>

      <main className="flex-1 p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-5 overflow-y-auto overflow-x-hidden pb-24 lg:pb-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-bold leading-tight" style={{ color: "var(--cf-text)" }}>Fluxo de caixa</h1>
            <p className="text-xs mt-1" style={{ color: "var(--cf-text-2)" }}>
              {periodLabel} · troque o mês no seletor da Navbar
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <button onClick={() => setHideValues(!hideValues)}
              className="p-2 hover:bg-opacity-50 rounded-xl transition-colors cursor-pointer"
              style={{ background: "var(--cf-input)", color: "var(--cf-text-2)" }} title="Ocultar valores">
              {hideValues ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
            <Button variant="primary" size="sm" icon={Sparkles} onClick={() => setImportOpen(true)}>Importar extrato</Button>
            <Button variant="success" size="sm" icon={Plus} onClick={() => { setEditing(null); setModal(true); }}>Nova transação</Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
          {kpis.map(({ label, val, Icon, ibg, color, sub}) => {
            const total = entradas + saidas;
            const pct = total > 0 ? (Math.abs(val) / total) * 100 : 0;
            const showBar = label === "Entradas" || label === "Saídas";
            const isSaldo = label === "Saldo" || label === "Resultado";
            const clickable = label === "Orçamento";
            return (
              <div
                key={label}
                className={`cf-kpi kin p-3 sm:p-4 flex flex-col gap-2 ${clickable ? "clickable" : ""}`}
                onClick={clickable ? () => setBudgetOpen(true) : undefined}
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setBudgetOpen(true); } } : undefined}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold" style={{ color: "var(--cf-text-2)" }}>{label}</p>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: ibg }}>
                    <Icon size={15} style={{ color }} strokeWidth={2} />
                  </div>
                </div>
                <div>
                  <p className="font-heading font-bold text-base sm:text-[17px] mono leading-tight tracking-tight" style={{ color }}>
                    {isSaldo && val > 0 ? "+" : ""}{displayValue(val)}
                  </p>
                  <p className="text-xs mt-1" style={{ color: clickable ? "#3b82f6" : "var(--cf-text-3)" }}>
                    {clickable ? "Ver detalhamento →" : sub}
                  </p>
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
            <p className="text-xs" style={{ color: "var(--cf-text-2)" }}>Extraia dados do seu extrato automaticamente</p>
          </div>
          <ArrowUpRight size={16} style={{ color: "var(--cf-text-3)" }} />
        </button>

        {/* Toolbar */}
        <div className="cf-card p-3.5 space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--cf-text-3)" }} />
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
                  : { background: "transparent", color: "var(--cf-text-2)", borderColor: "var(--cf-border)" }}>
                {Icon && <Icon size={12} />}
                {label}
              </button>
            ))}
            <span className="ml-auto text-xs shrink-0 pl-2 font-medium" style={{ color: "var(--cf-text-3)" }}>
              {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Lista */}
        {grouped.length === 0 && previstos.length === 0 ? (
          <div className="cf-card p-12 flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "var(--cf-input)" }}>
              <TrendingUp size={24} style={{ color: "var(--cf-text-3)" }} />
            </div>
            <p className="font-heading text-base font-bold" style={{ color: "var(--cf-text)" }}>
              {search || filter !== "all" ? "Nenhum resultado" : `Nada em ${periodLabel}`}
            </p>
            <p className="text-xs max-w-xs" style={{ color: "var(--cf-text-2)" }}>
              {search || filter !== "all" ? "Tente ajustar os filtros." : "Nenhuma movimentação neste mês. Troque o mês no seletor da Navbar, adicione manualmente ou importe do extrato."}
            </p>
            {!search && filter === "all" && (
              <div className="flex gap-2 mt-2">
                <Button variant="primary" icon={Plus} onClick={() => { setEditing(null); setModal(true); }}>Adicionar</Button>
                <Button variant="secondary" icon={Sparkles} onClick={() => setImportOpen(true)}>Importar</Button>
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
                        <Calendar size={18} style={{ color: "var(--cf-text-2)" }} />
                      </div>
                      <div>
                        <p className="text-base font-heading font-bold" style={{ color: "var(--cf-text)" }}>{labelMonthYear(yearMonth)}</p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--cf-text-2)" }}>
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
                          <Sensitive hidden={hideValues}>{(monthTotal >= 0 ? "+" : "") + toBRL(monthTotal)}</Sensitive>
                        </span>
                      </div>
                      <ChevronDown
                        size={18}
                        className={`cf-chevron transition-transform ${isMonthOpen ? "open" : ""}`}
                        style={{ color: "var(--cf-text-3)" }}
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
                                  <Calendar size={14} style={{ color: "var(--cf-text-3)" }} />
                                </div>
                                <div className="text-left">
                                  <p className="text-sm font-semibold" style={{ color: "var(--cf-text)" }}>{labelDate(date)}</p>
                                  <p className="text-xs mt-0.5" style={{ color: "var(--cf-text-2)" }}>
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
                                    <Sensitive hidden={hideValues}>{(dayNet >= 0 ? "+" : "") + toBRL(dayNet)}</Sensitive>
                                  </span>
                                </div>
                                <ChevronDown
                                  size={14}
                                  className={`cf-chevron ${isDayOpen ? "open" : ""}`}
                                  style={{ color: "var(--cf-text-3)" }}
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
                                        {tx.costCenterName && (
                                          <span className="text-xs font-medium truncate" style={{ color: "var(--cf-text-2)" }} title="Centro de custo vinculado">
                                            🏷 {tx.costCenterName}
                                          </span>
                                        )}
                                        {tx.note && <p className="text-xs truncate" style={{ color: "var(--cf-text-2)" }}>📝 {tx.note}</p>}
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
                                      <Sensitive hidden={hideValues}>{(tx.type === "entrada" ? "+" : "-") + toBRL(tx.amount)}</Sensitive>
                                    </span>
                                    <div className="cf-txa flex items-center gap-1 shrink-0">
                                      <button onClick={() => { setEditing(tx); setModal(true); }}
                                        className="p-1.5 hover:bg-opacity-70 rounded-lg transition-colors cursor-pointer"
                                        style={{ background: "var(--cf-input)", color: "var(--cf-text-2)" }}>
                                        <Edit3 size={13} />
                                      </button>
                                      <button onClick={() => setConfirmId(tx.id)}
                                        className="p-1.5 hover:bg-opacity-70 rounded-lg transition-colors cursor-pointer"
                                        style={{ background: "var(--cf-input)", color: "var(--cf-text-2)" }}>
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