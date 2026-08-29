"use client";

// app/configuracoes/page.tsx
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { User as UserIcon, Palette } from "lucide-react";
import Navbar from "../components/Navbar";
import { PageLoader } from "../components/ui";
import { useToast } from "../components/useToast";
import { ToastContainer } from "../components/ToastContainer";
import { useAccountScope } from "../hooks/useAccountScope";
import PerfilTab from "./PerfilTab";
import AparenciaTab from "./AparenciaTab";

interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
}

type TabId = "perfil" | "aparencia";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "perfil", label: "Perfil & Empresa", icon: UserIcon },
  { id: "aparencia", label: "Aparência", icon: Palette },
];

export default function ConfiguracoesPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>("perfil");

  const scope = useAccountScope();
  const { toasts, show: showToast, remove: removeToast } = useToast();

  const activePath = "/configuracoes";

  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      const { getFirebase } = await import("@/lib/firebase");
      const { onAuthStateChanged } = await import("firebase/auth");
      const { auth } = await getFirebase();
      unsub = onAuthStateChanged(auth, (u) => {
        if (!u) {
          window.location.href = "/login";
          return;
        }
        setUser({ uid: u.uid, email: u.email, displayName: u.displayName });
        setLoading(false);
      });
    })();
    return () => unsub?.();
  }, []);

  async function handleLogout() {
    const { getFirebase } = await import("@/lib/firebase");
    const { signOut } = await import("firebase/auth");
    const { auth } = await getFirebase();
    await signOut(auth);
    window.location.href = "/login";
  }

  if (loading || !user) return <PageLoader label={null} />;

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--db-bg)" }}>
      <Navbar
        user={{ displayName: user.displayName, email: user.email, uid: user.uid }}
        activePath={activePath}
        onLogout={handleLogout}
        hidePeriod
      />

      <main className="flex-1 p-4 md:p-6 lg:p-8 pb-20 lg:pb-8">
        <div className="max-w-3xl mx-auto space-y-5">
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold" style={{ color: "var(--db-text)" }}>
              Configurações
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--db-text-2)" }}>
              Preferências da sua conta e do aplicativo.
            </p>
          </div>

          {/* ── Abas ── */}
          <div
            className="flex gap-1 overflow-x-auto rounded-xl p-1"
            style={{ background: "var(--cf-input)", border: "1.5px solid var(--cf-border)" }}
            role="tablist"
          >
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.id)}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all cursor-pointer"
                  style={{
                    background: active ? "var(--cf-card)" : "transparent",
                    color: active ? "var(--brand-500)" : "var(--cf-text-2)",
                    boxShadow: active ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                  }}
                >
                  <t.icon size={15} />
                  {t.label}
                </button>
              );
            })}
          </div>

          {tab === "perfil" && (
            <PerfilTab user={user} scope={scope} showToast={showToast} onUserChange={setUser} />
          )}
          {tab === "aparencia" && <AparenciaTab showToast={showToast} />}
        </div>
      </main>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
