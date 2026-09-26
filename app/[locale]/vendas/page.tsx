"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/app/hooks/useAuth";
import { usePeriod } from "@/app/hooks/usePeriod";
import Navbar from "@/app/components/Navbar";
import AccessDenied from "@/app/components/AccessDenied";
import { PageLoader, PageHeader, Button } from "@/app/components/ui";
import { LayoutGrid, Calculator, Plus, X, Check } from "lucide-react";
import type { VendasFiltros } from "./_components/shared";
import { useVendasData } from "./_components/useVendasData";
import { FilterBar } from "./_components/FilterBar";
import { VendasKpis } from "./_components/VendasKpis";
import { VendasChart } from "./_components/VendasChart";
import { ChannelBreakdown } from "./_components/ChannelBreakdown";
import { TopProdutos, ResumoEstoque } from "./_components/ProdutosEstoque";
import { SalesList } from "./_components/SalesList";
import { PrecificacaoTab } from "./_components/PrecificacaoTab";
import { NovaVendaModal } from "./_components/NovaVendaModal";

type Aba = "geral" | "precificacao";

// Painel de vendas no padrão SAP Fiori (overview + list report): cabeçalho com
// ações, barra de filtros global, KPIs com comparação ao mês anterior, análise
// (gráfico diário + canais), rankings e a lista completa de vendas. Os dados e
// derivados moram em useVendasData; cada bloco é um componente em _components/.
export default function VendasPage() {
  const t = useTranslations("vendas");
  const { user, loading: authLoading } = useAuth();
  const { monthKey: mesSelecionado, label: labelPeriodo, isCurrentMonth, goPrevMonth, goNextMonth } = usePeriod();

  const [ownerUid, setOwnerUid] = useState("");
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { getFirebase } = await import("@/lib/firebase");
      const { db } = await getFirebase();
      const { resolveAccountScope, hasPermission } = await import("@/lib/accountScope");
      const scope = await resolveAccountScope(db, user.uid);
      if (cancelled) return;
      if (!hasPermission(scope, "vendas")) { setBlocked(true); return; }
      setOwnerUid(scope.ownerUid);
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Ramo "Serviço" não usa vendas de marketplace — manda pro dashboard.
  useEffect(() => {
    if (!user || !ownerUid) return;
    const cached = typeof window !== "undefined" ? localStorage.getItem(`onboarding_ramo_${ownerUid}`) : null;
    if (cached) {
      try {
        if (JSON.parse(cached).includes("Serviço")) { window.location.href = "/dashboard"; }
      } catch { /* noop */ }
    }
  }, [user, ownerUid]);

  async function handleLogout() {
    const { getFirebase } = await import("@/lib/firebase");
    const { signOut } = await import("firebase/auth");
    const { auth } = await getFirebase();
    await signOut(auth);
    window.location.href = "/login";
  }

  const [aba, setAba] = useState<Aba>("geral");
  const [filtros, setFiltros] = useState<VendasFiltros>({ canal: "todos", sku: "" });
  const [novaVendaOpen, setNovaVendaOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const d = useVendasData(ownerUid, mesSelecionado, filtros);

  if (blocked) return <AccessDenied category={t("meta.title")} />;
  if (authLoading || (user && !blocked && d.loading)) return <PageLoader />;
  if (!user) return null;

  return (
    <div className="flex min-h-screen flex-col" style={{ background: "var(--bg)" }}>
      <Navbar activePath="/vendas" user={user} onLogout={handleLogout} />

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-[10000] flex -translate-x-1/2 items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg"
          style={{ background: toast.type === "success" ? "var(--pos)" : "var(--neg)", color: "var(--on-accent)" }}
        >
          {toast.type === "success" ? <Check size={16} /> : <X size={16} />}
          {toast.msg}
        </div>
      )}

      <NovaVendaModal
        open={novaVendaOpen}
        onClose={() => setNovaVendaOpen(false)}
        produtos={d.produtos}
        authUid={user?.uid ?? null}
        canaisConectados={d.canaisConectados}
        onDone={(msg, type) => { showToast(msg, type); if (type === "success") setNovaVendaOpen(false); }}
      />

      <main className="mx-auto w-full max-w-7xl space-y-4 px-4 py-6 pb-24 sm:px-6">
        <nav aria-label={t("breadcrumb.label")} className="text-xs" style={{ color: "var(--text-subtle)" }}>
          {t("breadcrumb.root")} <span aria-hidden="true">/</span>{" "}
          <span style={{ color: "var(--text-muted)" }}>{aba === "geral" ? t("tabs.geral") : t("tabs.precificacao")}</span>
        </nav>

        <PageHeader
          title={t("meta.title")}
          subtitle={t.rich("meta.subtitle", { strong: (c) => <span className="font-semibold" style={{ color: "var(--text)" }}>{c}</span> })}
          actions={
            <Button icon={Plus} onClick={() => setNovaVendaOpen(true)} disabled={d.produtos.length === 0}>
              {t("newSale.cta")}
            </Button>
          }
        />

        {/* Abas (Fiori "icon tab bar") */}
        <div role="tablist" className="flex items-center gap-1 overflow-x-auto" style={{ borderBottom: "1px solid var(--border)" }}>
          {([
            { id: "geral", label: t("tabs.geral"), icon: LayoutGrid },
            { id: "precificacao", label: t("tabs.precificacao"), icon: Calculator },
          ] as { id: Aba; label: string; icon: typeof LayoutGrid }[]).map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={aba === tab.id}
              onClick={() => setAba(tab.id)}
              className="-mb-px flex cursor-pointer items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-semibold transition-colors"
              style={{
                color: aba === tab.id ? "var(--brand)" : "var(--text-muted)",
                borderColor: aba === tab.id ? "var(--brand)" : "transparent",
              }}
            >
              <tab.icon size={15} />
              {tab.label}
            </button>
          ))}
        </div>

        {aba === "geral" && (
          <>
            <FilterBar
              periodLabel={labelPeriodo}
              isCurrentMonth={isCurrentMonth}
              onPrevMonth={goPrevMonth}
              onNextMonth={goNextMonth}
              filtros={filtros}
              onChange={setFiltros}
              produtos={d.opcoesProduto}
            />

            <VendasKpis atual={d.resumo} anterior={d.resumoAnterior} pe={d.pontoEquilibrio} />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="min-w-0 lg:col-span-2">
                <VendasChart buckets={d.serie.buckets} metaDiaria={filtros.canal === "todos" && !filtros.sku ? d.serie.metaDiaria : 0} />
              </div>
              <ChannelBreakdown
                linhas={d.porCanal}
                conectados={d.canaisConectados}
                selecionado={filtros.canal}
                onSelect={(canal) => setFiltros((f) => ({ ...f, canal }))}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="min-w-0 lg:col-span-2">
                <TopProdutos rows={d.topProdutos} />
              </div>
              <ResumoEstoque r={d.estoqueResumo} />
            </div>

            <SalesList vendas={d.vendas} mes={mesSelecionado} />
          </>
        )}

        {aba === "precificacao" && <PrecificacaoTab />}
      </main>
    </div>
  );
}
