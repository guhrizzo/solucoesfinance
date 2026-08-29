"use client";

// app/configuracoes/PerfilTab.tsx

import { useEffect, useState } from "react";
import { Check, Lock } from "lucide-react";
import { Card, Button, Input } from "../components/ui";
import type { AccountScope } from "../hooks/useAccountScope";

type ShowToast = (message: string, type?: "success" | "error" | "warning" | "info") => void;

interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
}

interface CompanyData {
  nomeFantasia: string;
  razaoSocial: string;
  cnpj: string;
}

const EMPTY_COMPANY: CompanyData = { nomeFantasia: "", razaoSocial: "", cnpj: "" };

const errMsg = (err: unknown, fallback: string) =>
  err instanceof Error && err.message ? err.message : fallback;

/** Máscara simples de CNPJ (00.000.000/0000-00) aplicada enquanto digita. */
function maskCnpj(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export default function PerfilTab({
  user,
  scope,
  showToast,
  onUserChange,
}: {
  user: AuthUser;
  scope: AccountScope & { loading: boolean };
  showToast: ShowToast;
  onUserChange: (u: AuthUser) => void;
}) {
  const canEditCompany = !scope.loading && scope.isOwner;

  // ── Nome de exibição ──
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [savingName, setSavingName] = useState(false);
  const nameDirty = displayName.trim() !== (user.displayName ?? "").trim();

  // ── Dados da empresa ──
  const [company, setCompany] = useState<CompanyData>(EMPTY_COMPANY);
  const [companyLoaded, setCompanyLoaded] = useState<CompanyData>(EMPTY_COMPANY);
  const [savingCompany, setSavingCompany] = useState(false);
  const companyDirty =
    company.nomeFantasia !== companyLoaded.nomeFantasia ||
    company.razaoSocial !== companyLoaded.razaoSocial ||
    company.cnpj !== companyLoaded.cnpj;

  // ── Ramo (somente leitura, vem do onboarding) ──
  const [ramo, setRamo] = useState<string[]>([]);

  useEffect(() => {
    if (scope.loading || !scope.ownerUid) return;
    let cancelled = false;
    (async () => {
      try {
        const { getFirebase } = await import("@/lib/firebase");
        const { doc, getDoc } = await import("firebase/firestore");
        const { db } = await getFirebase();

        const [companySnap, onboardingSnap] = await Promise.all([
          getDoc(doc(db, "users", scope.ownerUid, "profile", "company")),
          getDoc(doc(db, "users", scope.ownerUid, "profile", "onboarding")),
        ]);
        if (cancelled) return;

        if (companySnap.exists()) {
          const d = companySnap.data();
          const loaded: CompanyData = {
            nomeFantasia: d.nomeFantasia ?? "",
            razaoSocial: d.razaoSocial ?? "",
            cnpj: d.cnpj ?? "",
          };
          setCompany(loaded);
          setCompanyLoaded(loaded);
        }
        if (onboardingSnap.exists()) {
          setRamo(onboardingSnap.data()?.answers?.ramo ?? []);
        }
      } catch (err) {
        console.error("Erro ao carregar dados da empresa:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scope.loading, scope.ownerUid]);

  const initial =
    user.displayName?.[0]?.toUpperCase() ?? user.email?.[0]?.toUpperCase() ?? "U";

  async function handleSaveName() {
    if (!nameDirty || savingName) return;
    setSavingName(true);
    try {
      const { getFirebase } = await import("@/lib/firebase");
      const { updateProfile } = await import("firebase/auth");
      const { auth } = await getFirebase();
      if (!auth.currentUser) throw new Error("Sessão expirada.");
      await updateProfile(auth.currentUser, { displayName: displayName.trim() });
      onUserChange({ ...user, displayName: displayName.trim() });
      showToast("Nome atualizado.", "success");
    } catch (err: unknown) {
      showToast(errMsg(err, "Não foi possível salvar o nome."), "error");
    } finally {
      setSavingName(false);
    }
  }

  async function handleSaveCompany() {
    if (!companyDirty || savingCompany || !canEditCompany) return;
    setSavingCompany(true);
    try {
      const { getFirebase } = await import("@/lib/firebase");
      const { doc, setDoc } = await import("firebase/firestore");
      const { db } = await getFirebase();
      await setDoc(
        doc(db, "users", scope.ownerUid, "profile", "company"),
        { ...company, updatedAt: Date.now() },
        { merge: true }
      );
      setCompanyLoaded(company);
      showToast("Dados da empresa salvos.", "success");
    } catch (err: unknown) {
      showToast(errMsg(err, "Não foi possível salvar os dados da empresa."), "error");
    } finally {
      setSavingCompany(false);
    }
  }

  const labelCls = "text-xs font-semibold mb-1.5 block";
  const labelStyle = { color: "var(--cf-text-2)" };

  return (
    <div className="space-y-5">
      {/* ── Cabeçalho do perfil ── */}
      <Card padding="lg" className="flex items-center gap-4">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-lg shrink-0"
          style={{ background: "linear-gradient(135deg, var(--brand-500), var(--brand-400))" }}
        >
          {initial}
        </div>
        <div className="min-w-0">
          <p className="font-bold truncate" style={{ color: "var(--db-text)" }}>
            {user.displayName ?? "Usuário"}
          </p>
          <p className="text-sm truncate" style={{ color: "var(--db-text-2)" }}>
            {user.email}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--cf-text-3)" }}>
            {scope.loading ? "" : scope.isOwner ? "Administrador da conta" : "Membro de equipe"}
          </p>
        </div>
      </Card>

      {/* ── Dados pessoais ── */}
      <Card padding="lg" className="space-y-4">
        <div>
          <h2 className="text-sm font-bold" style={{ color: "var(--db-text)" }}>
            Dados pessoais
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--cf-text-3)" }}>
            Como você aparece no app para a sua equipe.
          </p>
        </div>

        <div>
          <label className={labelCls} style={labelStyle}>
            Nome de exibição
          </label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Seu nome"
            maxLength={80}
          />
        </div>

        <div>
          <label className={labelCls} style={labelStyle}>
            E-mail
          </label>
          <div className="flex items-center gap-2">
            <Input value={user.email ?? ""} disabled style={{ opacity: 0.7 }} />
            <span
              className="flex items-center gap-1 text-xs whitespace-nowrap"
              style={{ color: "var(--cf-text-3)" }}
            >
              <Lock size={12} /> login
            </span>
          </div>
          <p className="text-xs mt-1.5" style={{ color: "var(--cf-text-3)" }}>
            Para trocar métodos de login, use{" "}
            <a href="/users" className="underline" style={{ color: "var(--brand-500)" }}>
              Minha conta
            </a>
            .
          </p>
        </div>

        <div className="flex justify-end">
          <Button
            size="sm"
            icon={Check}
            loading={savingName}
            disabled={!nameDirty}
            onClick={handleSaveName}
          >
            Salvar
          </Button>
        </div>
      </Card>

      {/* ── Empresa ── */}
      <Card padding="lg" className="space-y-4">
        <div>
          <h2 className="text-sm font-bold" style={{ color: "var(--db-text)" }}>
            Empresa
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--cf-text-3)" }}>
            {canEditCompany
              ? "Usado nos relatórios e documentos exportados."
              : "Somente o administrador da conta pode editar estes dados."}
          </p>
        </div>

        <div>
          <label className={labelCls} style={labelStyle}>
            Nome fantasia
          </label>
          <Input
            value={company.nomeFantasia}
            onChange={(e) => setCompany((c) => ({ ...c, nomeFantasia: e.target.value }))}
            disabled={!canEditCompany}
            placeholder="Ex.: NexusFi"
            maxLength={120}
          />
        </div>

        <div>
          <label className={labelCls} style={labelStyle}>
            Razão social
          </label>
          <Input
            value={company.razaoSocial}
            onChange={(e) => setCompany((c) => ({ ...c, razaoSocial: e.target.value }))}
            disabled={!canEditCompany}
            placeholder="Ex.: NexusFi Tecnologia Ltda."
            maxLength={160}
          />
        </div>

        <div>
          <label className={labelCls} style={labelStyle}>
            CNPJ
          </label>
          <Input
            value={company.cnpj}
            onChange={(e) => setCompany((c) => ({ ...c, cnpj: maskCnpj(e.target.value) }))}
            disabled={!canEditCompany}
            placeholder="00.000.000/0000-00"
            inputMode="numeric"
            className="mono"
          />
        </div>

        <div>
          <label className={labelCls} style={labelStyle}>
            Ramo de atuação
          </label>
          <div
            className="rounded-xl px-3.5 py-2.5 text-sm"
            style={{
              background: "var(--cf-input)",
              border: "1.5px solid var(--cf-border)",
              color: "var(--cf-text-3)",
            }}
          >
            {ramo.length ? ramo.join(", ") : "Não definido"}
          </div>
          <p className="text-xs mt-1.5" style={{ color: "var(--cf-text-3)" }}>
            Definido no primeiro acesso — controla quais módulos aparecem no menu.
          </p>
        </div>

        {canEditCompany && (
          <div className="flex justify-end">
            <Button
              size="sm"
              icon={Check}
              loading={savingCompany}
              disabled={!companyDirty}
              onClick={handleSaveCompany}
            >
              Salvar
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
