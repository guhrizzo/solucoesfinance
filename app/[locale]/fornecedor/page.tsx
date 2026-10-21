"use client";

export const dynamic = "force-dynamic";

// Portal do fornecedor — início: pedidos do próprio fornecedor (com status e
// histórico) e os dados comerciais que ele mesmo pode atualizar.

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ClipboardList, FileEdit, Hourglass, CheckCircle2, Wallet, Plus, Building2 } from "lucide-react";
import { Button, Card, EmptyState, Field, Input, KpiTile, PageHeader, Table } from "@/app/components/ui";
import { useToast } from "@/app/components/useToast";
import { ToastContainer } from "@/app/components/ToastContainer";
import { useRouter } from "@/i18n/navigation";
import { formatMoney } from "@/lib/format";
import { maskCep, maskPhone, validateSupplierSelf } from "@/lib/compras/validate";
import { UFS, type OrderStatus } from "@/lib/compras/types";
import type { SupplierOrderView } from "@/lib/compras/service";
import { PortalShell } from "@/app/components/compras/PortalShell";
import { usePortalSession, type PortalSupplier } from "@/app/components/compras/usePortalSession";
import { newRequestKey, portalApi } from "@/app/components/compras/api";
import { StatusPill, errorText, fieldErrors, fmtCnpj, fmtDate, controlClass, controlStyle } from "@/app/components/compras/shared";

type Tab = "orders" | "profile";
const FILTERS: ("todos" | OrderStatus)[] = ["todos", "rascunho", "enviado", "em_analise", "aprovado", "recusado", "cancelado", "concluido"];

export default function FornecedorHome() {
  const session = usePortalSession();
  return (
    <PortalShell session={session}>
      {session.state === "ready" && <Home session={session} />}
    </PortalShell>
  );
}

function Home({ session }: { session: ReturnType<typeof usePortalSession> }) {
  const t = useTranslations("compras");
  const tErr = useTranslations("compras.errors");
  const locale = useLocale();
  const router = useRouter();
  const { toasts, show, remove } = useToast();
  const [tab, setTab] = useState<Tab>("orders");
  const [orders, setOrders] = useState<SupplierOrderView[] | null>(null);
  const [filter, setFilter] = useState<"todos" | OrderStatus>("todos");
  const [creating, setCreating] = useState(false);

  // Recarrega ao trocar de empresa (vínculo atual do portal).
  const current = session.me?.current ?? "";
  useEffect(() => {
    let cancelled = false;
    portalApi<{ orders: SupplierOrderView[] }>("/orders")
      .then((r) => { if (!cancelled) setOrders(r.orders); })
      .catch((err) => { if (!cancelled) { show(errorText(tErr, err), "error"); setOrders([]); } });
    return () => { cancelled = true; };
  }, [current, show, tErr]);

  const k = useMemo(() => {
    const l = orders ?? [];
    const approved = l.filter((o) => o.status === "aprovado" || o.status === "concluido");
    return {
      drafts: l.filter((o) => o.status === "rascunho").length,
      review: l.filter((o) => o.status === "enviado" || o.status === "em_analise").length,
      approved: approved.length,
      approvedValue: approved.reduce((s, o) => s + o.total, 0),
    };
  }, [orders]);

  const rows = (orders ?? []).filter((o) => filter === "todos" || o.status === filter);

  async function newOrder() {
    setCreating(true);
    try {
      const r = await portalApi<{ id: string }>("/orders", { method: "POST", json: { requestKey: newRequestKey(), data: {} } });
      router.push(`/fornecedor/pedidos/${r.id}`);
    } catch (err) {
      show(errorText(tErr, err), "error");
      setCreating(false);
    }
  }

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={remove} />
      <PageHeader
        title={t("portal.home.title")}
        subtitle={t("portal.home.subtitle", { company: session.company })}
        actions={<Button icon={Plus} loading={creating} onClick={newOrder} disabled={session.me?.supplier?.status !== "ativo"}>{t("portal.home.newOrder")}</Button>}
      />
      {session.me?.supplier?.status !== "ativo" && (
        <p className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--warn-weak)", color: "var(--warn)" }}>{t("errors.supplierInactive")}</p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile icon={FileEdit} label={t("portal.home.kpi.drafts")} value={String(k.drafts)} onClick={() => { setTab("orders"); setFilter("rascunho"); }} />
        <KpiTile icon={Hourglass} label={t("portal.home.kpi.inReview")} value={String(k.review)} onClick={() => { setTab("orders"); setFilter("em_analise"); }} />
        <KpiTile icon={CheckCircle2} label={t("portal.home.kpi.approved")} value={String(k.approved)} onClick={() => { setTab("orders"); setFilter("aprovado"); }} />
        <KpiTile icon={Wallet} label={t("portal.home.kpi.approvedValue")} value={formatMoney(k.approvedValue, locale)} valueTone="pos" />
      </div>

      <div role="tablist" className="flex items-center gap-1 overflow-x-auto" style={{ borderBottom: "1px solid var(--border)" }}>
        {([["orders", t("portal.home.tabs.orders"), ClipboardList], ["profile", t("portal.home.tabs.profile"), Building2]] as const).map(([id, label, Icon]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className="-mb-px flex cursor-pointer items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-semibold"
            style={{ color: tab === id ? "var(--brand)" : "var(--text-muted)", borderColor: tab === id ? "var(--brand)" : "transparent" }}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {tab === "orders" && (
        <>
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
            {FILTERS.map((f) => (
              <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
                className="shrink-0 cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold"
                style={filter === f
                  ? { background: "var(--brand-weak)", color: "var(--brand)", borderColor: "var(--brand)" }
                  : { background: "transparent", color: "var(--text-muted)", borderColor: "var(--border)" }}>
                {f === "todos" ? t("portal.home.filterAll") : t(`status.${f}`)}
              </button>
            ))}
          </div>
          <Card padding="sm">
            {orders === null ? (
              <p className="px-3 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>…</p>
            ) : (
              <Table
                columns={[
                  { key: "number", header: t("table.number"), width: "110px" },
                  { key: "issueDate", header: t("table.issueDate"), width: "110px" },
                  { key: "items", header: t("order.items") },
                  { key: "total", header: t("table.total"), align: "right", width: "140px" },
                  { key: "status", header: t("table.status"), width: "130px" },
                ]}
                rows={rows}
                rowKey={(o) => o.id}
                onRowClick={(o) => router.push(`/fornecedor/pedidos/${o.id}`)}
                renderCell={(o, key) => {
                  switch (key) {
                    case "number": return <span className="mono font-semibold">{o.numberLabel}</span>;
                    case "issueDate": return fmtDate(o.issueDate, locale);
                    case "items": return <span className="line-clamp-1 text-xs" style={{ color: "var(--text-muted)" }}>{o.items.map((i) => i.description).join(", ") || "—"}</span>;
                    case "total": return <span className="mono">{formatMoney(o.total, locale)}</span>;
                    case "status": return <StatusPill status={o.status} />;
                    default: return null;
                  }
                }}
                empty={<EmptyState icon={ClipboardList} title={t("portal.home.empty")} description={t("portal.home.emptyHint")} />}
              />
            )}
          </Card>
        </>
      )}

      {tab === "profile" && session.me?.supplier && (
        <ProfileForm supplier={session.me.supplier} onSaved={() => { show(t("portal.profile.saved"), "success"); session.reload(); }} onError={(m) => show(m, "error")} />
      )}
    </>
  );
}

function ProfileForm({ supplier, onSaved, onError }: { supplier: PortalSupplier; onSaved: () => void; onError: (m: string) => void }) {
  const t = useTranslations("compras");
  const tErr = useTranslations("compras.errors");
  const [f, setF] = useState(() => ({
    nomeFantasia: supplier.nomeFantasia, ie: supplier.ie, responsavel: supplier.responsavel,
    telefone: maskPhone(supplier.telefone), whatsapp: maskPhone(supplier.whatsapp), categoria: supplier.categoria,
    endereco: { ...supplier.endereco, cep: maskCep(supplier.endereco.cep) },
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const setAddr = (k: keyof PortalSupplier["endereco"], v: string) => setF((s) => ({ ...s, endereco: { ...s.endereco, [k]: v } }));

  async function save() {
    const v = validateSupplierSelf(f);
    if (!v.ok) {
      setErrors(Object.fromEntries(Object.entries(v.errors).map(([k, c]) => [k, tErr.has(c) ? tErr(c) : c])));
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await portalApi("/me", { method: "PATCH", json: { data: f } });
      onSaved();
    } catch (err) {
      setErrors(fieldErrors(tErr, err));
      onError(errorText(tErr, err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-display text-base font-bold" style={{ color: "var(--text)" }}>{t("portal.profile.title")}</h2>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>{t("portal.profile.desc")}</p>
      </div>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[[t("supplier.fields.razaoSocial"), supplier.razaoSocial], [t("supplier.fields.cnpj"), fmtCnpj(supplier.cnpj)], [t("supplier.fields.email"), supplier.email]].map(([k, v]) => (
          <div key={k}>
            <dt className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>{k}</dt>
            <dd className="text-sm" style={{ color: "var(--text)" }}>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
        <Field label={t("supplier.fields.nomeFantasia")} className="sm:col-span-3"><Input value={f.nomeFantasia} maxLength={120} onChange={(e) => set("nomeFantasia", e.target.value)} /></Field>
        <Field label={t("supplier.fields.ie")} error={errors.ie} className="sm:col-span-3"><Input value={f.ie} maxLength={20} onChange={(e) => set("ie", e.target.value)} /></Field>
        <Field label={t("supplier.fields.responsavel")} error={errors.responsavel} className="sm:col-span-2"><Input value={f.responsavel} maxLength={120} onChange={(e) => set("responsavel", e.target.value)} /></Field>
        <Field label={t("supplier.fields.telefone")} error={errors.telefone} className="sm:col-span-2"><Input inputMode="tel" value={f.telefone} onChange={(e) => set("telefone", maskPhone(e.target.value))} /></Field>
        <Field label={t("supplier.fields.whatsapp")} error={errors.whatsapp} className="sm:col-span-2"><Input inputMode="tel" value={f.whatsapp} onChange={(e) => set("whatsapp", maskPhone(e.target.value))} /></Field>
        <Field label={t("supplier.fields.categoria")} error={errors.categoria} className="sm:col-span-6"><Input value={f.categoria} maxLength={80} onChange={(e) => set("categoria", e.target.value)} /></Field>
        <Field label={t("supplier.fields.cep")} error={errors["endereco.cep"]} className="sm:col-span-2"><Input inputMode="numeric" value={f.endereco.cep} onChange={(e) => setAddr("cep", maskCep(e.target.value))} /></Field>
        <Field label={t("supplier.fields.logradouro")} error={errors["endereco.logradouro"]} className="sm:col-span-4"><Input value={f.endereco.logradouro} maxLength={160} onChange={(e) => setAddr("logradouro", e.target.value)} /></Field>
        <Field label={t("supplier.fields.numero")} error={errors["endereco.numero"]} className="sm:col-span-1"><Input value={f.endereco.numero} maxLength={20} onChange={(e) => setAddr("numero", e.target.value)} /></Field>
        <Field label={t("supplier.fields.complemento")} className="sm:col-span-2"><Input value={f.endereco.complemento} maxLength={80} onChange={(e) => setAddr("complemento", e.target.value)} /></Field>
        <Field label={t("supplier.fields.bairro")} className="sm:col-span-3"><Input value={f.endereco.bairro} maxLength={80} onChange={(e) => setAddr("bairro", e.target.value)} /></Field>
        <Field label={t("supplier.fields.cidade")} error={errors["endereco.cidade"]} className="sm:col-span-4"><Input value={f.endereco.cidade} maxLength={80} onChange={(e) => setAddr("cidade", e.target.value)} /></Field>
        <Field label={t("supplier.fields.uf")} error={errors["endereco.uf"]} className="sm:col-span-2">
          <select value={f.endereco.uf} onChange={(e) => setAddr("uf", e.target.value)} className={controlClass} style={controlStyle}>
            <option value="">—</option>
            {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </Field>
      </div>
      <div className="flex justify-end">
        <Button type="button" loading={saving} onClick={save}>{t("portal.profile.save")}</Button>
      </div>
    </Card>
  );
}
