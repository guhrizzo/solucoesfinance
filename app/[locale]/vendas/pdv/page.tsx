"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, X } from "lucide-react";
import { useAuth } from "@/app/hooks/useAuth";
import { useSubscription } from "@/app/hooks/useSubscription";
import { isProAccess } from "@/lib/billing";
import Navbar from "@/app/components/Navbar";
import AccessDenied from "@/app/components/AccessDenied";
import { PageLoader } from "@/app/components/ui";
import type { Caixa, PdvVenda } from "@/lib/pdv";
import type { ProdutoEstoque } from "../_components/shared";
import { AbrirCaixa } from "./_components/AbrirCaixa";
import { PdvTerminal } from "./_components/PdvTerminal";
import { PdvProLock } from "./_components/PdvProLock";

// PDV (frente de caixa) do Painel de Vendas — ver lib/pdv.ts.
// Sem caixa aberto: tela de abertura (troco inicial) + fechamentos anteriores.
// Com caixa aberto: o terminal de venda (itens → pagamento → comprovante) e o
// fechamento do caixa conferindo cada forma de pagamento.
export default function PdvPage() {
  const t = useTranslations("vendas.pdv");
  const { user, loading: authLoading } = useAuth();
  const sub = useSubscription();
  const isPro = isProAccess(sub);

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

  const [caixaAbertoId, setCaixaAbertoId] = useState<string | null>(null);
  const [proximoNumero, setProximoNumero] = useState(1);
  // Caixa recém-fechado nesta tela: a abertura mostra o atalho pro relatório.
  const [recemFechadoId, setRecemFechadoId] = useState<string | null>(null);
  const [cfgLoaded, setCfgLoaded] = useState(false);
  const [caixas, setCaixas] = useState<Caixa[]>([]);
  const [caixasLoaded, setCaixasLoaded] = useState(false);
  const [vendasCaixa, setVendasCaixa] = useState<PdvVenda[]>([]);
  const [produtos, setProdutos] = useState<ProdutoEstoque[]>([]);
  const [empresa, setEmpresa] = useState("NexusFi");

  // Configuração do PDV (caixa aberto), caixas recentes, estoque e nome da empresa.
  useEffect(() => {
    if (!ownerUid) return;
    const unsubs: (() => void)[] = [];
    let cancelled = false;
    (async () => {
      const { getFirebase } = await import("@/lib/firebase");
      const { db } = await getFirebase();
      const { collection, doc, getDoc, limit, onSnapshot, orderBy, query, where } = await import("firebase/firestore");
      if (cancelled) return;

      unsubs.push(onSnapshot(doc(db, "users", ownerUid, "profile", "pdv"), (snap) => {
        setCaixaAbertoId((snap.data()?.caixaAbertoId as string) || null);
        setProximoNumero(Math.max(1, Number(snap.data()?.nextNumero) || 1));
        setCfgLoaded(true);
      }, (err) => { console.error("Erro PDV/config:", err); setCfgLoaded(true); }));

      unsubs.push(onSnapshot(
        query(collection(db, "users", ownerUid, "caixas"), orderBy("openedAt", "desc"), limit(15)),
        (snap) => { setCaixas(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Caixa))); setCaixasLoaded(true); },
        (err) => { console.error("Erro PDV/caixas:", err); setCaixasLoaded(true); },
      ));

      unsubs.push(onSnapshot(
        query(collection(db, "estoque"), where("userId", "==", ownerUid)),
        (snap) => setProdutos(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProdutoEstoque))),
        (err) => console.error("Erro PDV/estoque:", err),
      ));

      try {
        const snap = await getDoc(doc(db, "users", ownerUid, "profile", "company"));
        const c = snap.data();
        const nome = String(c?.nomeFantasia || c?.razaoSocial || "").trim();
        if (!cancelled && nome) setEmpresa(nome);
      } catch { /* fica o padrão */ }
    })();
    return () => { cancelled = true; unsubs.forEach((u) => u()); };
  }, [ownerUid]);

  // Vendas do caixa aberto (pro contador, lista e relatório parcial).
  useEffect(() => {
    if (!ownerUid || !caixaAbertoId) { setVendasCaixa([]); return; }
    let unsub: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const { getFirebase } = await import("@/lib/firebase");
      const { db } = await getFirebase();
      const { collection, onSnapshot, query, where } = await import("firebase/firestore");
      if (cancelled) return;
      unsub = onSnapshot(
        query(collection(db, "users", ownerUid, "pdvVendas"), where("caixaId", "==", caixaAbertoId)),
        (snap) => setVendasCaixa(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as PdvVenda)).sort((a, b) => b.numero - a.numero),
        ),
        (err) => console.error("Erro PDV/vendas:", err),
      );
    })();
    return () => { cancelled = true; unsub?.(); };
  }, [ownerUid, caixaAbertoId]);

  const caixaAberto = useMemo(
    () => caixas.find((c) => c.id === caixaAbertoId && c.status === "aberto") ?? null,
    [caixas, caixaAbertoId],
  );
  const fechados = useMemo(() => caixas.filter((c) => c.status === "fechado"), [caixas]);

  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Caixa aberto = tela cheia: tira o recuo da sidebar (data-has-nav=0) e
  // restaura ao fechar o caixa ou sair da tela.
  const emTelaCheia = !!caixaAberto;
  useEffect(() => {
    if (!emTelaCheia) return;
    const html = document.documentElement;
    html.setAttribute("data-has-nav", "0");
    return () => html.setAttribute("data-has-nav", "1");
  }, [emTelaCheia]);

  async function handleLogout() {
    const { getFirebase } = await import("@/lib/firebase");
    const { signOut } = await import("firebase/auth");
    const { auth } = await getFirebase();
    await signOut(auth);
    window.location.href = "/login";
  }

  if (blocked) return <AccessDenied category={t("title")} />;
  if (authLoading || sub.loading) return <PageLoader />;
  if (!user) return null;
  if (!isPro) return <PdvProLock user={user} onLogout={handleLogout} />;
  if (!ownerUid || !cfgLoaded || !caixasLoaded) return <PageLoader />;

  const nomeUsuario = user.displayName || user.email || "";

  return (
    <div className="flex min-h-screen flex-col" style={{ background: "var(--bg)" }}>
      {!caixaAberto && <Navbar activePath="/vendas" user={user} onLogout={handleLogout} />}

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

      <main className={caixaAberto ? "w-full px-4 py-6 sm:px-8" : "mx-auto w-full max-w-7xl px-4 py-6 pb-24 sm:px-6"}>
        {caixaAberto ? (
          <PdvTerminal
            caixa={caixaAberto}
            vendas={vendasCaixa}
            produtos={produtos}
            empresa={empresa}
            authUid={user.uid}
            proximoNumero={proximoNumero}
            onToast={showToast}
            onClosed={setRecemFechadoId}
          />
        ) : (
          <AbrirCaixa
            nomeUsuario={nomeUsuario}
            authUid={user.uid}
            ownerUid={ownerUid}
            fechados={fechados}
            recemFechadoId={recemFechadoId}
            empresa={empresa}
            onToast={showToast}
          />
        )}
      </main>
    </div>
  );
}
