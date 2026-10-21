"use client";

export const dynamic = "force-dynamic";

// Compras — submódulo de Contas a Pagar: visão geral, pedidos (com filtros e
// aprovação), fornecedores (cadastro + portal) e o log de envios. Leitura em
// tempo real pelo client SDK; toda escrita passa pelas rotas /api/compras/**
// (ver lib/compras/*). Permissões: "contasPagar" = ver/ajustar/cadastrar;
// dono ou "comprasAprovacao" = aprovar/recusar/cancelar/gerar lançamento.

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { LayoutGrid, ClipboardList, Building2, Send, Plus, ArrowLeft } from "lucide-react";
import Navbar from "@/app/components/Navbar";
import AccessDenied from "@/app/components/AccessDenied";
import { PageLoader, PageHeader, Button } from "@/app/components/ui";
import { useToast } from "@/app/components/useToast";
import { ToastContainer } from "@/app/components/ToastContainer";
import { useAuth } from "@/app/hooks/useAuth";
import { Link } from "@/i18n/navigation";
import type { PurchaseOrderDoc, SupplierDoc } from "@/lib/compras/types";
import { useComprasData } from "./_components/useComprasData";
import { Overview } from "./_components/Overview";
import { OrdersList, EMPTY_FILTERS, type OrderFilters } from "./_components/OrdersList";
import { SuppliersTab } from "./_components/SuppliersTab";
import { SupplierFormModal } from "./_components/SupplierFormModal";
import { SupplierDetailModal } from "./_components/SupplierDetailModal";
import { OrderDetailModal } from "./_components/OrderDetailModal";
import { BillsModal } from "./_components/BillsModal";
import { LogTab } from "./_components/LogTab";

type Tab = "overview" | "orders" | "suppliers" | "log";

export default function ComprasPage() {
  const t = useTranslations("compras");
  const tNav = useTranslations("nav");
  const { user, loading: authLoading } = useAuth();
  const { toasts, show, remove } = useToast();

  const [ownerUid, setOwnerUid] = useState("");
  const [perms, setPerms] = useState<{ canEdit: boolean; canApprove: boolean } | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [filters, setFilters] = useState<OrderFilters>(EMPTY_FILTERS);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierDoc | null>(null);
  const [billsFor, setBillsFor] = useState<PurchaseOrderDoc | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { getFirebase } = await import("@/lib/firebase");
      const { db } = await getFirebase();
      const { resolveAccountScope, hasPermission } = await import("@/lib/accountScope");
      const scope = await resolveAccountScope(db, user.uid);
      if (cancelled) return;
      const canEdit = hasPermission(scope, "contasPagar");
      const canApprove = scope.isOwner || hasPermission(scope, "comprasAprovacao");
      setPerms({ canEdit, canApprove });
      if (canEdit || canApprove) setOwnerUid(scope.ownerUid);
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Link do e-mail ("Revisar pedido"): /contasPagar/compras?pedido={id}
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("pedido");
    if (p && /^[A-Za-z0-9_-]{1,64}$/.test(p)) { setOrderId(p); setTab("orders"); }
  }, []);

  const d = useComprasData(ownerUid);

  const order = useMemo(() => d.orders.find((o) => o.id === orderId) ?? null, [d.orders, orderId]);
  const supplier = useMemo(() => d.suppliers.find((s) => s.id === supplierId) ?? null, [d.suppliers, supplierId]);
  const orderSupplier = useMemo(() => (order ? d.suppliers.find((s) => s.id === order.supplierId) ?? null : null), [order, d.suppliers]);
  const cnpjMap = useMemo(() => new Map(d.suppliers.map((s) => [s.cnpj, s.id])), [d.suppliers]);
  const orderCount = useMemo(() => {
    const m = new Map<string, number>();
    d.orders.forEach((o) => m.set(o.supplierId, (m.get(o.supplierId) ?? 0) + 1));
    return m;
  }, [d.orders]);
  const pendingCount = d.orders.filter((o) => o.status === "enviado" || o.status === "em_analise").length;

  async function handleLogout() {
    const { getFirebase } = await import("@/lib/firebase");
    const { signOut } = await import("firebase/auth");
    const { auth } = await getFirebase();
    await signOut(auth);
    window.location.href = "/login";
  }

  if (perms && !perms.canEdit && !perms.canApprove) return <AccessDenied category={`${tNav("items.contasPagar")} › ${t("meta.title")}`} />;
  if (authLoading || !perms || (ownerUid && d.loading)) return <PageLoader />;
  if (!user) return null;

  const tabs: { id: Tab; label: string; icon: typeof LayoutGrid; badge?: number }[] = [
    { id: "overview", label: t("tabs.overview"), icon: LayoutGrid },
    { id: "orders", label: t("tabs.orders"), icon: ClipboardList, badge: pendingCount },
    { id: "suppliers", label: t("tabs.suppliers"), icon: Building2 },
    { id: "log", label: t("tabs.log"), icon: Send },
  ];

  return (
    <div className="flex min-h-screen flex-col" style={{ background: "var(--bg)" }}>
      <Navbar activePath="/contasPagar" user={user} onLogout={handleLogout} hidePeriod />
      <ToastContainer toasts={toasts} onRemove={remove} />

      <main className="mx-auto w-full max-w-7xl space-y-4 px-4 py-6 pb-24 sm:px-6">
        <nav aria-label={t("breadcrumb.label")} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-subtle)" }}>
          <Link href="/contasPagar" className="inline-flex items-center gap-1 hover:underline" style={{ color: "var(--text-muted)" }}>
            <ArrowLeft size={12} /> {t("breadcrumb.root")}
          </Link>
          <span aria-hidden="true">/</span>
          <span style={{ color: "var(--text)" }}>{t("breadcrumb.current")}</span>
        </nav>

        <PageHeader
          title={t("meta.title")}
          subtitle={t("meta.subtitle")}
          actions={perms.canEdit ? (
            <Button icon={Plus} onClick={() => { setEditingSupplier(null); setFormOpen(true); }}>{t("supplier.new")}</Button>
          ) : undefined}
        />

        {d.error && (
          <p role="alert" className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--neg-weak)", color: "var(--neg)" }}>{d.error}</p>
        )}

        <div role="tablist" className="flex items-center gap-1 overflow-x-auto" style={{ borderBottom: "1px solid var(--border)" }}>
          {tabs.map((x) => (
            <button key={x.id} role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)}
              className="-mb-px flex cursor-pointer items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-semibold transition-colors"
              style={{ color: tab === x.id ? "var(--brand)" : "var(--text-muted)", borderColor: tab === x.id ? "var(--brand)" : "transparent" }}>
              <x.icon size={15} />
              {x.label}
              {!!x.badge && (
                <span className="rounded-full px-1.5 text-[11px] font-bold" style={{ background: "var(--warn-weak)", color: "var(--warn)" }}>{x.badge}</span>
              )}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <Overview
            orders={d.orders}
            suppliers={d.suppliers}
            onOpen={(o) => setOrderId(o.id)}
            onSeePending={() => { setFilters({ ...EMPTY_FILTERS, status: "pendentes" }); setTab("orders"); }}
            onSeeApproved={() => { setFilters({ ...EMPTY_FILTERS, status: "aprovado" }); setTab("orders"); }}
          />
        )}
        {tab === "orders" && (
          <OrdersList orders={d.orders} suppliers={d.suppliers} filters={filters} onFilters={setFilters} onOpen={(o) => setOrderId(o.id)} />
        )}
        {tab === "suppliers" && (
          <SuppliersTab suppliers={d.suppliers} orderCount={orderCount} onOpen={(s) => setSupplierId(s.id)} />
        )}
        {tab === "log" && <LogTab logs={d.logs} />}
      </main>

      <SupplierFormModal
        open={formOpen}
        editing={editingSupplier}
        existingCnpjs={cnpjMap}
        onClose={() => setFormOpen(false)}
        onSaved={(msg) => show(msg, "success")}
      />

      {supplier && !formOpen && (
        <SupplierDetailModal
          supplier={supplier}
          orders={d.orders}
          canEdit={perms.canEdit}
          canApprove={perms.canApprove}
          onClose={() => setSupplierId(null)}
          onEdit={(s) => { setEditingSupplier(s); setFormOpen(true); }}
          onOpenOrder={(o) => { setSupplierId(null); setOrderId(o.id); }}
          toast={show}
        />
      )}

      {order && !billsFor && (
        <OrderDetailModal
          ownerUid={ownerUid}
          order={order}
          supplier={orderSupplier}
          canEdit={perms.canEdit}
          canApprove={perms.canApprove}
          onClose={() => setOrderId(null)}
          onGenerateBills={(o) => setBillsFor(o)}
          toast={show}
        />
      )}

      {billsFor && (
        <BillsModal order={billsFor} costCenters={d.costCenters} onClose={() => setBillsFor(null)} toast={show} />
      )}
    </div>
  );
}
