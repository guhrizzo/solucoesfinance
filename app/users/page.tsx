"use client";

// app/perfil/page.tsx
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import {
  Shield, Lock, Mail, Eye, EyeOff, Check, AlertCircle, Trash2, Plus,
  UsersRound, UserPlus, Edit2, RotateCw, ShieldOff, ShieldCheck,
} from "lucide-react";
import Navbar from "../components/Navbar";
import { Card, Button, Input, Modal, PageLoader } from "../components/ui";
import { useToast } from "../components/useToast";
import { ToastContainer } from "../components/ToastContainer";
import {
  linkGoogleToCurrentUser,
  linkPasswordToCurrentUser,
  unlinkProvider,
} from "@/lib/authLink";
import { passwordRules } from "@/lib/passwordRules";
import PinModal from "../components/PinModal";
import { loadPinHash, savePinHash } from "../hooks/usePin";
import { useAccountScope } from "../hooks/useAccountScope";
import { PERMISSION_CATEGORIES, type PermissionKey } from "@/lib/accountScope";

// ── Equipe: tipos e chamada às rotas de API (app/api/team/**) ──────────────
interface TeamMember {
  id: string; // == memberUid
  memberUid: string;
  email: string;
  displayName: string;
  permissions: PermissionKey[];
  status: "active" | "revoked";
  createdAt: number;
}

/** POST autenticado (Bearer do ID token do Firebase) numa rota /api/team/**; lança com a mensagem de erro do servidor em caso de falha. */
async function callTeamApi(path: string, body: unknown): Promise<any> {
  const { getFirebase } = await import("@/lib/firebase");
  const { auth } = await getFirebase();
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Sessão expirada. Recarregue a página.");
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Ocorreu um erro inesperado.");
  return data;
}

// ── Erros Firebase → PT-BR ────────────────────────────────────────────────────
const firebaseErrorMap: Record<string, string> = {
  "auth/weak-password": "Senha fraca. Siga os requisitos indicados abaixo do campo de senha.",
  "auth/password-does-not-meet-requirements": "Senha não atende aos requisitos mínimos de segurança.",
  "auth/requires-recent-login": "Por segurança, saia e entre novamente antes de alterar seus métodos de login.",
  "auth/credential-already-in-use": "Essa conta do Google já está vinculada a outro usuário.",
  "auth/popup-closed-by-user": "Janela fechada antes de concluir. Tente novamente.",
  "auth/cancelled-popup-request": "Login cancelado. Tente novamente.",
  "auth/network-request-failed": "Falha de rede. Verifique sua conexão.",
};
const getErrorMessage = (code: string) =>
  firebaseErrorMap[code] ?? "Ocorreu um erro inesperado. Tente novamente.";

interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  providerIds: string[];
}

// ── Modal de criar/editar membro de equipe ──────────────────────────────────
function TeamMemberModal({
  open, editing, onClose, onSaved,
}: {
  open: boolean;
  editing: TeamMember | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [permissions, setPermissions] = useState<Set<PermissionKey>>(new Set());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setDisplayName(editing?.displayName ?? "");
    setEmail(editing?.email ?? "");
    setPermissions(new Set(editing?.permissions ?? []));
    setSaving(false);
    setErr("");
  }, [open, editing?.id]);

  if (!open) return null;

  const togglePerm = (key: PermissionKey) => {
    setPermissions((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const canSave = editing
    ? true
    : displayName.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    setErr("");
    try {
      if (editing) {
        await callTeamApi("/api/team/update-member", {
          memberUid: editing.memberUid,
          permissions: Array.from(permissions),
        });
        onSaved("Permissões atualizadas!");
      } else {
        await callTeamApi("/api/team/create-member", {
          displayName: displayName.trim(),
          email: email.trim(),
          permissions: Array.from(permissions),
        });
        onSaved("Membro criado! Um e-mail foi enviado para definir a senha.");
      }
      onClose();
    } catch (e: any) {
      setErr(e.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Editar permissões" : "Adicionar membro"} size="sm" closeDisabled={saving}>
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        {err && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-sm" style={{ background: "rgba(239,68,68,0.08)", color: "var(--neg)" }}>
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            {err}
          </div>
        )}

        {!editing && (
          <>
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: "var(--db-text-2)" }}>Nome</label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Ex: Ana Ribeiro" required />
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: "var(--db-text-2)" }}>E-mail</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ana@empresa.com" required />
              <p className="text-xs mt-1.5" style={{ color: "var(--db-text-3)" }}>
                Ela recebe um e-mail para definir a própria senha — ninguém, nem você, fica sabendo qual é.
              </p>
            </div>
          </>
        )}

        {editing && (
          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "var(--db-sub)" }}>
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0"
              style={{ background: "linear-gradient(135deg, var(--brand-500), var(--brand-400))" }}
            >
              {editing.displayName?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: "var(--db-text)" }}>{editing.displayName}</p>
              <p className="text-xs truncate" style={{ color: "var(--db-text-2)" }}>{editing.email}</p>
            </div>
          </div>
        )}

        <div>
          <label className="text-xs font-semibold block mb-2" style={{ color: "var(--db-text-2)" }}>
            Categorias liberadas
          </label>
          <div className="space-y-1.5">
            {PERMISSION_CATEGORIES.map((cat) => {
              const checked = permissions.has(cat.key);
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => togglePerm(cat.key)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 cursor-pointer transition-all text-left"
                  style={checked
                    ? { borderColor: "var(--brand-500)", background: "rgba(21,101,192,0.06)" }
                    : { borderColor: "var(--db-border)", background: "transparent" }}
                >
                  <div
                    className="w-4.5 h-4.5 rounded-md flex items-center justify-center shrink-0"
                    style={checked ? { background: "var(--brand-500)" } : { border: "1.5px solid var(--db-border)" }}
                  >
                    {checked && <Check size={10} color="white" strokeWidth={3} />}
                  </div>
                  <span className="text-sm font-medium" style={{ color: "var(--db-text)" }}>{cat.label}</span>
                </button>
              );
            })}
          </div>
          {permissions.size === 0 && (
            <p className="text-xs mt-2 flex items-center gap-1.5" style={{ color: "var(--db-text-3)" }}>
              <AlertCircle size={11} /> Sem nenhuma categoria marcada, a pessoa não vê nada além da própria conta.
            </p>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving} className="flex-1">
            Cancelar
          </Button>
          <Button type="submit" disabled={!canSave} loading={saving} icon={Check} className="flex-1">
            {editing ? "Salvar" : "Criar e convidar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
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

  // ── PIN Setup States
  const [hasPin, setHasPin] = useState(false);
  const [pinSetupOpen, setPinSetupOpen] = useState(false);
  const [pinSetupStep, setPinSetupStep] = useState<1 | 2>(1);
  const [pinTemp, setPinTemp] = useState("");

  // ── Equipe (só o dono da conta vê/gerencia) ──────────────────────────────
  const scope = useAccountScope();
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<TeamMember | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const { toasts, show: showToast, remove: removeToast } = useToast();

  const activePath = "/users";

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

      unsub = onAuthStateChanged(auth, async (u) => {
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
        
        // Verifica se tem PIN
        const pinHash = await loadPinHash(u.uid);
        setHasPin(!!pinHash);
        
        setLoading(false);
      });
    })();
    return () => unsub?.();
  }, []);

  // Lista de equipe — só o dono da conta assina isso; um membro nunca lê
  // `users/{ownerUid}/team` (não é dele) nem precisa, já que não gerencia
  // ninguém.
  useEffect(() => {
    if (scope.loading || !scope.isOwner || !scope.ownerUid) { setTeam([]); return; }
    let unsub: (() => void) | undefined;
    (async () => {
      const { getFirebase } = await import("@/lib/firebase");
      const { db } = await getFirebase();
      const { collection, onSnapshot, orderBy, query } = await import("firebase/firestore");
      unsub = onSnapshot(
        query(collection(db, "users", scope.ownerUid, "team"), orderBy("createdAt", "desc")),
        (snap) => setTeam(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TeamMember))),
        (err) => console.error("Erro ao carregar equipe:", err)
      );
    })();
    return () => unsub?.();
  }, [scope.loading, scope.isOwner, scope.ownerUid]);

  const handleRevokeMember = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await callTeamApi("/api/team/remove-member", { memberUid: revokeTarget.memberUid });
      showToast("Acesso revogado.", "info");
      setRevokeTarget(null);
    } catch (e: any) {
      showToast(e.message || "Erro ao revogar acesso.", "error");
    } finally {
      setRevoking(false);
    }
  };

  const handleResendInvite = async (member: TeamMember) => {
    setResendingId(member.id);
    try {
      await callTeamApi("/api/team/resend-invite", { memberUid: member.memberUid });
      showToast("Convite reenviado!", "success");
    } catch (e: any) {
      showToast(e.message || "Erro ao reenviar.", "error");
    } finally {
      setResendingId(null);
    }
  };

  const hasPassword = user?.providerIds.includes("password") ?? false;
  const hasGoogle = user?.providerIds.includes("google.com") ?? false;
  const methodCount = user?.providerIds.length ?? 0;

  // ── Configuração do PIN ────────────────────────────────────────────────
  const handlePinSubmit = async (pin: string) => {
    if (!user) return;
    if (pinSetupStep === 1) {
      setPinTemp(pin);
      setPinSetupStep(2);
    } else {
      if (pin === pinTemp) {
        await savePinHash(user.uid, pin);
        setHasPin(true);
        setPinSetupOpen(false);
        setPinSetupStep(1);
        setPinTemp("");
        showToast("PIN configurado com sucesso!", "success"); // Toast success in this UI
      } else {
        (window as any).__pinModalShake?.("Os PINs não coincidem. Tente novamente.");
        setTimeout(() => {
          setPinSetupStep(1);
          setPinTemp("");
        }, 500);
      }
    }
  };

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

  if (loading || !user) return <PageLoader label={null} />;

  const initial = user.displayName?.[0]?.toUpperCase() ?? user.email?.[0]?.toUpperCase() ?? "U";

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--db-bg)" }}>
      <Navbar
        user={{ displayName: user.displayName, email: user.email, uid: user.uid }}
        activePath={activePath}
        onLogout={handleLogout}
        hidePeriod
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
                  <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-sm" style={{ background: "rgba(239,68,68,0.08)", color: "var(--neg)" }}>
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
                  <p className="text-xs px-1" style={{ color: "var(--neg)" }}>As senhas não coincidem.</p>
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

          {/* ── PIN de Segurança ── */}
          <Card padding="lg">
            <div className="flex items-center gap-2 mb-1">
              <Lock size={16} style={{ color: "var(--brand-500)" }} />
              <h2 className="font-bold text-sm" style={{ color: "var(--db-text)" }}>PIN de Segurança</h2>
            </div>
            <p className="text-xs mb-5" style={{ color: "var(--db-text-2)" }}>
              Utilizado para confirmar ações financeiras sensíveis (como criar, baixar ou excluir lançamentos).
            </p>

            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--cf-card-3)" }}>
                  <Shield size={15} style={{ color: "var(--db-text-2)" }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--db-text)" }}>PIN de 4 dígitos</p>
                  <p className="text-xs" style={{ color: hasPin ? "var(--success)" : "var(--db-text-3)" }}>
                    {hasPin ? "Ativo" : "Não configurado"}
                  </p>
                </div>
              </div>
              <Button
                variant={hasPin ? "secondary" : "primary"}
                size="sm"
                onClick={() => { setPinSetupStep(1); setPinSetupOpen(true); }}
              >
                {hasPin ? "Alterar PIN" : "Configurar PIN"}
              </Button>
            </div>
          </Card>

          {/* ── Equipe (só o dono da conta) ── */}
          {!scope.loading && scope.isOwner && (
            <Card padding="lg">
              <div className="flex items-start justify-between gap-3 mb-1">
                <div className="flex items-center gap-2">
                  <UsersRound size={16} style={{ color: "var(--brand-500)" }} />
                  <h2 className="font-bold text-sm" style={{ color: "var(--db-text)" }}>Equipe</h2>
                </div>
                <Button size="sm" icon={UserPlus} onClick={() => { setEditingMember(null); setShowTeamModal(true); }}>
                  Adicionar membro
                </Button>
              </div>
              <p className="text-xs mb-5" style={{ color: "var(--db-text-2)" }}>
                Convide pessoas para acessar sua conta com permissão só nas categorias que você liberar. Você continua com acesso total a tudo.
              </p>

              {team.length === 0 ? (
                <p className="text-sm text-center py-6" style={{ color: "var(--db-text-3)" }}>
                  Nenhum membro de equipe ainda.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {team.map((m) => {
                    const labels = PERMISSION_CATEGORIES.filter((c) => m.permissions?.includes(c.key));
                    const revoked = m.status === "revoked";
                    return (
                      <div
                        key={m.id}
                        className="flex flex-col sm:flex-row sm:items-center gap-3 p-3.5 rounded-xl border"
                        style={{ borderColor: "var(--db-border)", opacity: revoked ? 0.6 : 1 }}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0"
                            style={{ background: revoked ? "var(--db-text-3)" : "linear-gradient(135deg, var(--brand-500), var(--brand-400))" }}
                          >
                            {m.displayName?.[0]?.toUpperCase() ?? "?"}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate" style={{ color: "var(--db-text)" }}>{m.displayName}</p>
                            <p className="text-xs truncate" style={{ color: "var(--db-text-2)" }}>{m.email}</p>
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {revoked ? (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "var(--db-sub)", color: "var(--db-text-3)" }}>
                                  Acesso revogado
                                </span>
                              ) : labels.length === 0 ? (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "var(--db-sub)", color: "var(--db-text-3)" }}>
                                  Sem categorias liberadas
                                </span>
                              ) : (
                                labels.map((l) => (
                                  <span key={l.key} className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "rgba(21,101,192,0.08)", color: "var(--brand-500)" }}>
                                    {l.label}
                                  </span>
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
                          {!revoked && (
                            <Button
                              variant="ghost" size="sm" icon={RotateCw}
                              loading={resendingId === m.id}
                              onClick={() => handleResendInvite(m)}
                              title="Reenviar link de acesso"
                            >
                              <span className="hidden sm:inline">Reenviar</span>
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" icon={Edit2} onClick={() => { setEditingMember(m); setShowTeamModal(true); }} title="Editar permissões" />
                          {!revoked && (
                            <Button variant="ghost" size="sm" icon={ShieldOff} onClick={() => setRevokeTarget(m)} title="Revogar acesso" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          )}

          {/* ── Seu acesso (membro convidado, somente leitura) ── */}
          {!scope.loading && !scope.isOwner && (
            <Card padding="lg">
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck size={16} style={{ color: "var(--brand-500)" }} />
                <h2 className="font-bold text-sm" style={{ color: "var(--db-text)" }}>Seu acesso</h2>
              </div>
              <p className="text-xs mb-4" style={{ color: "var(--db-text-2)" }}>
                Sua conta foi convidada por um administrador, com acesso liberado só nas categorias abaixo.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(scope.permissions === "all" ? [] : scope.permissions).length === 0 ? (
                  <span className="text-xs" style={{ color: "var(--db-text-3)" }}>Nenhuma categoria liberada ainda.</span>
                ) : (
                  PERMISSION_CATEGORIES.filter((c) => scope.permissions !== "all" && scope.permissions.includes(c.key)).map((c) => (
                    <span key={c.key} className="text-xs font-semibold px-2 py-1 rounded-lg" style={{ background: "rgba(21,101,192,0.08)", color: "var(--brand-500)" }}>
                      {c.label}
                    </span>
                  ))
                )}
              </div>
            </Card>
          )}

          <div className="flex items-start gap-2 px-1">
            <Mail size={13} className="shrink-0 mt-0.5" style={{ color: "var(--db-text-3)" }} />
            <p className="text-xs" style={{ color: "var(--db-text-3)" }}>
              Senha e Google vinculados ao mesmo e-mail sempre acessam esta única conta ({user.uid.slice(0, 8)}…).
            </p>
          </div>
        </div>
      </main>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
      
      <PinModal
        key={pinSetupStep}
        open={pinSetupOpen}
        collectOnly={true}
        title={pinSetupStep === 1 ? (hasPin ? "Novo PIN" : "Configurar PIN") : "Confirmar PIN"}
        subtitle={pinSetupStep === 1 ? "Digite um PIN de 4 dígitos" : "Digite novamente o PIN de 4 dígitos"}
        onClose={() => { setPinSetupOpen(false); setPinSetupStep(1); setPinTemp(""); }}
        onSuccess={handlePinSubmit}
      />

      <TeamMemberModal
        open={showTeamModal}
        editing={editingMember}
        onClose={() => { setShowTeamModal(false); setEditingMember(null); }}
        onSaved={(msg) => showToast(msg, "success")}
      />

      <Modal open={!!revokeTarget} onClose={() => !revoking && setRevokeTarget(null)} title="Revogar acesso?" size="sm" closeDisabled={revoking}>
        <div className="p-5 space-y-4">
          <p className="text-sm" style={{ color: "var(--db-text-2)" }}>
            <strong style={{ color: "var(--db-text)" }}>{revokeTarget?.displayName}</strong> perde o acesso imediatamente e não consegue mais entrar na conta. Você pode liberar de novo depois, editando as permissões.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setRevokeTarget(null)} disabled={revoking} className="flex-1">
              Cancelar
            </Button>
            <Button variant="danger" icon={ShieldOff} onClick={handleRevokeMember} loading={revoking} className="flex-1">
              Revogar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
