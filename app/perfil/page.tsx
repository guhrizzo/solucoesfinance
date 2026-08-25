"use client";

// app/perfil/page.tsx
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import {
  Shield, Lock, Mail, Eye, EyeOff, Check, AlertCircle, Trash2, Plus,
} from "lucide-react";
import Navbar from "../components/Navbar";
import { Card, Button, Input } from "../components/ui";
import { useToast } from "../components/useToast";
import { ToastContainer } from "../components/ToastContainer";
import {
  linkGoogleToCurrentUser,
  linkPasswordToCurrentUser,
  unlinkProvider,
} from "@/lib/authLink";

// ── Erros Firebase → PT-BR ────────────────────────────────────────────────────
const firebaseErrorMap: Record<string, string> = {
  "auth/weak-password": "Senha fraca. Use ao menos 6 caracteres.",
  "auth/requires-recent-login": "Por segurança, saia e entre novamente antes de alterar seus métodos de login.",
  "auth/credential-already-in-use": "Essa conta do Google já está vinculada a outro usuário.",
  "auth/popup-closed-by-user": "Janela fechada antes de concluir. Tente novamente.",
  "auth/cancelled-popup-request": "Login cancelado. Tente novamente.",
  "auth/network-request-failed": "Falha de rede. Verifique sua conexão.",
};
const getErrorMessage = (code: string) =>
  firebaseErrorMap[code] ?? "Ocorreu um erro inesperado. Tente novamente.";

const passwordRules = [
  { label: "Mínimo 8 caracteres", test: (p: string) => p.length >= 8 },
  { label: "Letra maiúscula", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Número", test: (p: string) => /\d/.test(p) },
];

interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  providerIds: string[];
}

export default function PerfilPage() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [linkingGoogle, setLinkingGoogle] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  const { toasts, show: showToast, remove: removeToast } = useToast();

  const activePath = "/perfil";

  async function handleLogout() {
    const { getFirebase } = await import("@/lib/firebase");
    const { signOut } = await import("firebase/auth");
    const { auth } = await getFirebase();
    await signOut(auth);
    window.location.href = "/login";
  }

  // Recarrega os provedores de login vinculados a partir do Firebase.
  async function refreshProviders() {
    const { getFirebase } = await import("@/lib/firebase");
    const { auth } = await getFirebase();
    const u = auth.currentUser;
    if (!u) return;
    await u.reload();
    setUser({
      uid: u.uid,
      email: u.email,
      displayName: u.displayName,
      providerIds: u.providerData.map((p) => p.providerId),
    });
  }

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
        setUser({
          uid: u.uid,
          email: u.email,
          displayName: u.displayName,
          providerIds: u.providerData.map((p) => p.providerId),
        });
        setLoading(false);
      });
    })();
    return () => unsub?.();
  }, []);

  const hasPassword = user?.providerIds.includes("password") ?? false;
  const hasGoogle = user?.providerIds.includes("google.com") ?? false;
  const methodCount = user?.providerIds.length ?? 0;

  // ── Vincular Google à conta atual ───────────────────────────────────────
  const handleLinkGoogle = async () => {
    if (!user) return;
    setLinkingGoogle(true);
    try {
      const { getFirebase } = await import("@/lib/firebase");
      const { auth } = await getFirebase();
      if (!auth.currentUser) return;
      await linkGoogleToCurrentUser(auth.currentUser);
      await refreshProviders();
      showToast("Google vinculado com sucesso.", "success");
    } catch (err: any) {
      showToast(getErrorMessage(err.code), "error");
    } finally {
      setLinkingGoogle(false);
    }
  };

  // ── Definir senha para a conta atual (quem entrou só com Google) ───────
  const passOk = passwordRules.every((r) => r.test(newPassword));
  const confirmOk = newPassword === confirmPassword && confirmPassword.length > 0;

  const handleAddPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email || !passOk || !confirmOk) return;
    setPasswordError(null);
    setSavingPassword(true);
    try {
      const { getFirebase } = await import("@/lib/firebase");
      const { auth } = await getFirebase();
      if (!auth.currentUser) return;
      await linkPasswordToCurrentUser(auth.currentUser, user.email, newPassword);
      await refreshProviders();
      setShowPasswordForm(false);
      setNewPassword("");
      setConfirmPassword("");
      showToast("Senha criada com sucesso.", "success");
    } catch (err: any) {
      setPasswordError(getErrorMessage(err.code));
    } finally {
      setSavingPassword(false);
    }
  };

  // ── Remover um método (mantém sempre pelo menos 1) ──────────────────────
  const handleUnlink = async (providerId: string, label: string) => {
    if (!user || methodCount <= 1) return;
    setUnlinkingId(providerId);
    try {
      const { getFirebase } = await import("@/lib/firebase");
      const { auth } = await getFirebase();
      if (!auth.currentUser) return;
      await unlinkProvider(auth.currentUser, providerId);
      await refreshProviders();
      showToast(`${label} removido.`, "info");
    } catch (err: any) {
      showToast(getErrorMessage(err.code), "error");
    } finally {
      setUnlinkingId(null);
    }
  };

  if (loading || !user) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center" style={{ background: "var(--db-bg)" }}>
        <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: "var(--cf-border)", borderTopColor: "var(--brand-500)" }} />
      </div>
    );
  }

  const initial = user.displayName?.[0]?.toUpperCase() ?? user.email?.[0]?.toUpperCase() ?? "U";

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--db-bg)" }}>
      <Navbar
        user={{ displayName: user.displayName, email: user.email, uid: user.uid }}
        activePath={activePath}
        onLogout={handleLogout}
      />

      <main className="flex-1 p-4 md:p-6 lg:p-8 pb-20 lg:pb-8">
        <div className="max-w-2xl mx-auto space-y-5">

          <div>
            <h1 className="text-xl md:text-2xl font-extrabold" style={{ color: "var(--db-text)" }}>Minha conta</h1>
            <p className="text-sm mt-1" style={{ color: "var(--db-text-2)" }}>Dados pessoais e métodos de login.</p>
          </div>

          {/* ── Cabeçalho do perfil ── */}
          <Card padding="lg" className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-lg shrink-0"
              style={{ background: "linear-gradient(135deg, var(--brand-500), var(--brand-400))" }}
            >
              {initial}
            </div>
            <div className="min-w-0">
              <p className="font-bold truncate" style={{ color: "var(--db-text)" }}>{user.displayName ?? "Usuário"}</p>
              <p className="text-sm truncate" style={{ color: "var(--db-text-2)" }}>{user.email}</p>
            </div>
          </Card>

          {/* ── Métodos de login ── */}
          <Card padding="lg">
            <div className="flex items-center gap-2 mb-1">
              <Shield size={16} style={{ color: "var(--brand-500)" }} />
              <h2 className="font-bold text-sm" style={{ color: "var(--db-text)" }}>Métodos de login</h2>
            </div>
            <p className="text-xs mb-5" style={{ color: "var(--db-text-2)" }}>
              Ambos os métodos acessam a mesma conta — nenhum deles cria um usuário novo.
            </p>

            {/* Senha */}
            <div className="flex items-center justify-between py-3" style={{ borderBottom: "1px solid var(--cf-border)" }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--cf-card-3)" }}>
                  <Lock size={15} style={{ color: "var(--db-text-2)" }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--db-text)" }}>E-mail e senha</p>
                  <p className="text-xs" style={{ color: hasPassword ? "var(--success)" : "var(--db-text-3)" }}>
                    {hasPassword ? "Ativo" : "Não configurado"}
                  </p>
                </div>
              </div>
              {hasPassword ? (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Trash2}
                  disabled={methodCount <= 1 || unlinkingId === "password"}
                  loading={unlinkingId === "password"}
                  onClick={() => handleUnlink("password", "Login por senha")}
                  title={methodCount <= 1 ? "Mantenha ao menos um método de login" : undefined}
                >
                  Remover
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Plus}
                  onClick={() => setShowPasswordForm((s) => !s)}
                >
                  Definir senha
                </Button>
              )}
            </div>

            {/* Formulário para definir senha (só aparece se ainda não existir) */}
            {!hasPassword && showPasswordForm && (
              <form onSubmit={handleAddPassword} className="pt-4 pb-1 space-y-3">
                {passwordError && (
                  <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-sm" style={{ background: "rgba(239,68,68,0.08)", color: "#dc2626" }}>
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    {passwordError}
                  </div>
                )}
                <div className="relative">
                  <Input
                    type={showPass ? "text" : "password"}
                    placeholder="Nova senha"
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setPasswordError(null); }}
                    className="pr-10"
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: "var(--db-text-3)" }}
                  >
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <Input
                  type={showPass ? "text" : "password"}
                  placeholder="Confirmar senha"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(null); }}
                  autoComplete="new-password"
                  required
                />

                {newPassword && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 px-1">
                    {passwordRules.map((rule) => {
                      const ok = rule.test(newPassword);
                      return (
                        <div key={rule.label} className="flex items-center gap-1.5 text-xs" style={{ color: ok ? "var(--success)" : "var(--db-text-3)" }}>
                          <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0" style={{ background: ok ? "var(--success)" : "var(--cf-border)" }}>
                            {ok && <Check size={8} color="white" strokeWidth={3} />}
                          </div>
                          {rule.label}
                        </div>
                      );
                    })}
                  </div>
                )}
                {confirmPassword && !confirmOk && (
                  <p className="text-xs px-1" style={{ color: "#dc2626" }}>As senhas não coincidem.</p>
                )}

                <div className="flex gap-2 pt-1">
                  <Button type="submit" size="sm" disabled={!passOk || !confirmOk} loading={savingPassword}>
                    Salvar senha
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setShowPasswordForm(false); setNewPassword(""); setConfirmPassword(""); setPasswordError(null); }}>
                    Cancelar
                  </Button>
                </div>
              </form>
            )}

            {/* Google */}
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--cf-card-3)" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--db-text)" }}>Google</p>
                  <p className="text-xs" style={{ color: hasGoogle ? "var(--success)" : "var(--db-text-3)" }}>
                    {hasGoogle ? "Vinculado" : "Não vinculado"}
                  </p>
                </div>
              </div>
              {hasGoogle ? (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Trash2}
                  disabled={methodCount <= 1 || unlinkingId === "google.com"}
                  loading={unlinkingId === "google.com"}
                  onClick={() => handleUnlink("google.com", "Google")}
                  title={methodCount <= 1 ? "Mantenha ao menos um método de login" : undefined}
                >
                  Remover
                </Button>
              ) : (
                <Button variant="secondary" size="sm" icon={Plus} loading={linkingGoogle} onClick={handleLinkGoogle}>
                  Vincular Google
                </Button>
              )}
            </div>
          </Card>

          <div className="flex items-start gap-2 px-1">
            <Mail size={13} className="shrink-0 mt-0.5" style={{ color: "var(--db-text-3)" }} />
            <p className="text-xs" style={{ color: "var(--db-text-3)" }}>
              Senha e Google vinculados ao mesmo e-mail sempre acessam esta única conta ({user.uid.slice(0, 8)}…).
            </p>
          </div>
        </div>
      </main>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
