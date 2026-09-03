"use client";

// ─── Cadastro de Fornecedores / Clientes ──────────────────────────────────────
// Aba "Cadastro" dos modais de Contas a Pagar (fornecedores) e Contas a Receber
// (clientes). Guarda apenas CNPJ/CPF + nome, em coleções separadas por conta:
//   users/{uid}/fornecedores   e   users/{uid}/clientes
// O campo de título/descrição da aba "Conta" usa <CadastroField> para vincular
// um cadastro salvo (preenche o título e carrega o documento junto).

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, Building2, User, Check, Search, X } from "lucide-react";

export type CadastroKind = "fornecedor" | "cliente";

export interface Cadastro {
    id: string;
    name: string;
    doc: string;        // somente dígitos (11 = CPF, 14 = CNPJ)
    createdAt: number;
}

const COLL: Record<CadastroKind, string> = {
    fornecedor: "fornecedores",
    cliente: "clientes",
};

const NOUN: Record<CadastroKind, { one: string; many: string }> = {
    fornecedor: { one: "fornecedor", many: "Fornecedores" },
    cliente: { one: "cliente", many: "Clientes" },
};

// ─── Documento: dígitos, máscara e validação ─────────────────────────────────

export const onlyDigits = (s: string) => s.replace(/\D/g, "");

/** Aplica máscara de CPF (000.000.000-00) ou CNPJ (00.000.000/0000-00). */
export function formatDoc(raw: string): string {
    const d = onlyDigits(raw).slice(0, 14);
    if (d.length <= 11) {
        return d
            .replace(/^(\d{3})(\d)/, "$1.$2")
            .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
            .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
    }
    return d
        .replace(/^(\d{2})(\d)/, "$1.$2")
        .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
        .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
        .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
}

function validCPF(d: string): boolean {
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += +d[i] * (10 - i);
    let r = (sum * 10) % 11;
    if (r === 10) r = 0;
    if (r !== +d[9]) return false;
    sum = 0;
    for (let i = 0; i < 10; i++) sum += +d[i] * (11 - i);
    r = (sum * 10) % 11;
    if (r === 10) r = 0;
    return r === +d[10];
}

function validCNPJ(d: string): boolean {
    if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
    const digit = (len: number) => {
        const weights = len === 12
            ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
            : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
        let sum = 0;
        for (let i = 0; i < len; i++) sum += +d[i] * weights[i];
        const r = sum % 11;
        return r < 2 ? 0 : 11 - r;
    };
    return digit(12) === +d[12] && digit(13) === +d[13];
}

export function docKind(raw: string): "CPF" | "CNPJ" | null {
    const len = onlyDigits(raw).length;
    if (len === 11) return "CPF";
    if (len === 14) return "CNPJ";
    return null;
}

/** true quando o documento é um CPF ou CNPJ válido (com dígito verificador). */
export function isValidDoc(raw: string): boolean {
    const d = onlyDigits(raw);
    if (d.length === 11) return validCPF(d);
    if (d.length === 14) return validCNPJ(d);
    return false;
}

// ─── Firestore ──────────────────────────────────────────────────────────────

/** Assina em tempo real a lista de cadastros da conta, ordenada por nome. */
export function useCadastros(uid: string | null, kind: CadastroKind) {
    const [items, setItems] = useState<Cadastro[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!uid) {
            setItems([]);
            setLoading(false);
            return;
        }
        let unsub: (() => void) | undefined;
        (async () => {
            try {
                const [{ getFirebase }, { collection, query, orderBy, onSnapshot }] = await Promise.all([
                    import("@/lib/firebase"),
                    import("firebase/firestore"),
                ]);
                const { db } = await getFirebase();
                unsub = onSnapshot(
                    query(collection(db, "users", uid, COLL[kind]), orderBy("name")),
                    snap => {
                        setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as Cadastro)));
                        setLoading(false);
                    },
                    () => setLoading(false),
                );
            } catch {
                setLoading(false);
            }
        })();
        return () => unsub?.();
    }, [uid, kind]);

    return { items, loading };
}

async function addCadastro(uid: string, kind: CadastroKind, name: string, docRaw: string) {
    const [{ getFirebase }, { collection, addDoc }] = await Promise.all([
        import("@/lib/firebase"),
        import("firebase/firestore"),
    ]);
    const { db } = await getFirebase();
    await addDoc(collection(db, "users", uid, COLL[kind]), {
        name: name.trim(),
        doc: onlyDigits(docRaw),
        createdAt: Date.now(),
    });
}

async function deleteCadastro(uid: string, kind: CadastroKind, id: string) {
    const [{ getFirebase }, { doc, deleteDoc }] = await Promise.all([
        import("@/lib/firebase"),
        import("firebase/firestore"),
    ]);
    const { db } = await getFirebase();
    await deleteDoc(doc(db, "users", uid, COLL[kind], id));
}

// ─── Aba "Cadastro" — CRUD enxuto ───────────────────────────────────────────

export function CadastroManager({ uid, kind, accent, onPick }: {
    uid: string | null;
    kind: CadastroKind;
    accent: string;
    /** Usar este cadastro na conta em edição (volta para a aba "Conta"). */
    onPick?: (c: Cadastro) => void;
}) {
    const { items, loading } = useCadastros(uid, kind);
    const noun = NOUN[kind];

    const [name, setName] = useState("");
    const [docStr, setDocStr] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const [confirmDel, setConfirmDel] = useState<string | null>(null);
    const [q, setQ] = useState("");

    const docDigits = onlyDigits(docStr);
    const docOk = isValidDoc(docStr);
    const dup = items.some(i => i.doc === docDigits && docDigits.length > 0);
    const canAdd = name.trim().length >= 2 && docOk && !dup && !busy;

    async function add() {
        if (!canAdd || !uid) return;
        setBusy(true);
        setErr("");
        try {
            await addCadastro(uid, kind, name, docStr);
            setName("");
            setDocStr("");
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Erro ao salvar cadastro");
        } finally {
            setBusy(false);
        }
    }

    async function del(id: string) {
        if (!uid) return;
        try {
            await deleteCadastro(uid, kind, id);
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Erro ao excluir");
        } finally {
            setConfirmDel(null);
        }
    }

    const filtered = useMemo(() => {
        const term = q.trim().toLowerCase();
        if (!term) return items;
        const termDigits = onlyDigits(q);
        return items.filter(i =>
            i.name.toLowerCase().includes(term) ||
            (termDigits.length > 0 && i.doc.includes(termDigits)),
        );
    }, [items, q]);

    const inputStyle = { background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" } as const;

    return (
        <div className="space-y-4">
            {err && (
                <div className="rounded-xl px-4 py-3 text-xs flex items-start gap-2"
                    style={{ background: "var(--neg-weak)", border: "1px solid var(--neg-weak)", color: "var(--neg)" }}>
                    <span>⚠</span> {err}
                </div>
            )}

            {/* Formulário de novo cadastro */}
            <div className="rounded-xl p-3 space-y-3" style={{ border: "1px solid var(--cf-border)" }}>
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text2)" }}>
                    Novo {noun.one}
                </p>
                <div className="space-y-2">
                    <input
                        value={docStr}
                        onChange={e => setDocStr(formatDoc(e.target.value))}
                        inputMode="numeric"
                        placeholder="CNPJ ou CPF"
                        className="w-full rounded-xl px-4 py-3 text-sm outline-none font-mono cursor-text"
                        style={inputStyle}
                    />
                    <div className="flex items-center justify-between px-1 h-4">
                        {docStr && !docOk && (
                            <span className="text-xs" style={{ color: "var(--neg)" }}>Documento inválido</span>
                        )}
                        {docOk && dup && (
                            <span className="text-xs" style={{ color: "var(--neg)" }}>Já cadastrado</span>
                        )}
                        {docOk && !dup && (
                            <span className="text-xs font-semibold" style={{ color: accent }}>{docKind(docStr)} válido</span>
                        )}
                    </div>
                </div>
                <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder={kind === "fornecedor" ? "Nome / Razão social" : "Nome do cliente / Razão social"}
                    className="w-full rounded-xl px-4 py-3 text-sm outline-none cursor-text"
                    style={inputStyle}
                />
                <button
                    onClick={add}
                    disabled={!canAdd}
                    className={`w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${canAdd ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
                    style={canAdd
                        ? { background: accent, color: "white" }
                        : { background: "var(--cf-input)", color: "var(--cf-text2)" }}>
                    {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                    Adicionar {noun.one}
                </button>
            </div>

            {/* Busca (só quando a lista cresce) */}
            {items.length > 4 && (
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--cf-text3)" }} />
                    <input
                        value={q}
                        onChange={e => setQ(e.target.value)}
                        placeholder="Buscar por nome ou documento…"
                        className="w-full rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none cursor-text"
                        style={inputStyle}
                    />
                </div>
            )}

            {/* Lista */}
            <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text2)" }}>
                    {noun.many} — {items.length}
                </p>

                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 size={18} className="animate-spin" style={{ color: "var(--cf-text3)" }} />
                    </div>
                ) : filtered.length === 0 ? (
                    <p className="text-xs py-6 text-center" style={{ color: "var(--cf-text3)" }}>
                        {items.length === 0
                            ? `Nenhum ${noun.one} cadastrado ainda.`
                            : "Nenhum resultado para a busca."}
                    </p>
                ) : (
                    <div className="space-y-1.5">
                        {filtered.map(c => {
                            const isCNPJ = c.doc.length === 14;
                            const Icon = isCNPJ ? Building2 : User;
                            return (
                                <div key={c.id}
                                    className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                                    style={{ border: "1px solid var(--cf-border)" }}>
                                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                                        style={{ background: `color-mix(in srgb, ${accent} 12%, transparent)` }}>
                                        <Icon size={15} style={{ color: accent }} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold truncate" style={{ color: "var(--cf-text)" }}>{c.name}</p>
                                        <p className="text-xs font-mono truncate" style={{ color: "var(--cf-text3)" }}>{formatDoc(c.doc)}</p>
                                    </div>

                                    {confirmDel === c.id ? (
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <button onClick={() => del(c.id)}
                                                className="px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
                                                style={{ background: "var(--neg-weak)", color: "var(--neg)" }}>
                                                Excluir
                                            </button>
                                            <button onClick={() => setConfirmDel(null)}
                                                className="p-1.5 rounded-lg cursor-pointer"
                                                style={{ background: "var(--cf-input)", color: "var(--cf-text2)" }}>
                                                <X size={13} />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-1 shrink-0">
                                            {onPick && (
                                                <button onClick={() => onPick(c)}
                                                    className="px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1"
                                                    style={{ background: `color-mix(in srgb, ${accent} 12%, transparent)`, color: accent }}>
                                                    <Check size={12} /> Usar
                                                </button>
                                            )}
                                            <button onClick={() => setConfirmDel(c.id)}
                                                className="p-1.5 rounded-lg cursor-pointer"
                                                style={{ background: "var(--cf-input)", color: "var(--cf-text2)" }}>
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Campo de título vinculável a um cadastro (aba "Conta") ──────────────────

export function CadastroField({ uid, kind, accent, label, placeholder, title, partyDoc, onChange, onNewCadastro }: {
    uid: string | null;
    kind: CadastroKind;
    accent: string;
    label: string;
    placeholder: string;
    title: string;
    partyDoc?: string;
    /** Atualiza título e (des)vincula o cadastro. */
    onChange: (v: { title: string; partyName?: string; partyDoc?: string }) => void;
    /** Ir para a aba "Cadastro" para criar um novo. */
    onNewCadastro: () => void;
}) {
    const { items } = useCadastros(uid, kind);
    const noun = NOUN[kind];

    // Cadastro atualmente vinculado (casado pelo documento).
    const linked = partyDoc ? items.find(i => i.doc === onlyDigits(partyDoc)) : undefined;
    const selectValue = linked ? linked.id : "";

    function handleSelect(v: string) {
        if (v === "__new__") {
            onNewCadastro();
            return;
        }
        if (v === "") {
            onChange({ title, partyName: undefined, partyDoc: undefined });
            return;
        }
        const c = items.find(i => i.id === v);
        if (c) onChange({ title: c.name, partyName: c.name, partyDoc: c.doc });
    }

    const inputStyle = { background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" } as const;

    return (
        <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text2)" }}>{label}</label>

            <select
                value={selectValue}
                onChange={e => handleSelect(e.target.value)}
                className="w-full rounded-xl px-4 py-3 text-sm outline-none cursor-pointer appearance-none"
                style={inputStyle}>
                <option value="">— {noun.one} avulso (digitar) —</option>
                {items.map(c => (
                    <option key={c.id} value={c.id}>{c.name} · {formatDoc(c.doc)}</option>
                ))}
                <option value="__new__">＋ Cadastrar novo {noun.one}…</option>
            </select>

            <input
                value={title}
                onChange={e => onChange({ title: e.target.value, partyName: undefined, partyDoc: undefined })}
                placeholder={placeholder}
                autoFocus
                className="w-full rounded-xl px-4 py-3 text-sm outline-none cursor-text"
                style={inputStyle}
            />

            {linked && (
                <p className="text-xs flex items-center gap-1.5 px-1" style={{ color: accent }}>
                    {linked.doc.length === 14 ? <Building2 size={12} /> : <User size={12} />}
                    Vinculado a <strong>{linked.name}</strong> · <span className="font-mono">{formatDoc(linked.doc)}</span>
                </p>
            )}
        </div>
    );
}
