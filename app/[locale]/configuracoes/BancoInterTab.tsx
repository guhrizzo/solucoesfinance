"use client";

// app/configuracoes/BancoInterTab.tsx
// Conexão com o Banco Inter (extrato -> conciliação). Só o dono da conta, Pro.
// O status é lido ao vivo de users/{ownerUid}/profile/interStatus (somente
// leitura pelo client). Os segredos só vão do navegador pro servidor: o campo
// nunca é pré-preenchido e os arquivos .crt/.key são lidos como texto, enviados
// uma vez e descartados do estado.

import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, FileKey2, Plug, RefreshCw, ShieldCheck, Sparkles, Unplug } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button, Card, Input, Pill } from "@/app/components/ui";
import ConfirmModal from "@/app/components/ConfirmModal";
import { authedFetch } from "@/lib/authedFetch";
import { formatDate, formatDateTime } from "@/lib/format";
import type { InterStatus } from "@/lib/interTypes";

type ShowToast = (message: string, type?: "success" | "error" | "warning" | "info") => void;

// Limites iguais aos do servidor (lib/interConexao.ts).
const MAX_PEM_CHARS = 20 * 1024;
const MAX_ID_CHARS = 200;
const MAX_CONTA_CHARS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

type Busy = null | "connect" | "update" | "test" | "disconnect";
type PemField = { name: string; text: string };

/** Lê o arquivo escolhido como TEXTO (PEM). Erro de leitura rejeita sem conteúdo. */
function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === "string" ? r.result : "");
    r.onerror = () => reject(new Error("read"));
    r.readAsText(file);
  });
}

export default function BancoInterTab({
  showToast,
  ownerUid,
  isPro,
}: {
  showToast: ShowToast;
  ownerUid: string;
  isPro: boolean;
}) {
  const t = useTranslations("configuracoes.bancoInter");
  const locale = useLocale();
  const [status, setStatus] = useState<InterStatus | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [conta, setConta] = useState("");
  const [cert, setCert] = useState<PemField | null>(null);
  const [key, setKey] = useState<PemField | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [formError, setFormError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const certRef = useRef<HTMLInputElement>(null);
  const keyRef = useRef<HTMLInputElement>(null);
  const idId = useId();
  const secretId = useId();
  const contaId = useId();
  const certId = useId();
  const keyId = useId();

  // Status ao vivo (somente leitura).
  useEffect(() => {
    if (!ownerUid) return;
    let unsub: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const [{ getFirebase }, { doc, onSnapshot }] = await Promise.all([
          import("@/lib/firebase"),
          import("firebase/firestore"),
        ]);
        const { db } = await getFirebase();
        if (cancelled) return;
        unsub = onSnapshot(
          doc(db, "users", ownerUid, "profile", "interStatus"),
          (snap) => {
            setLoadFailed(false);
            setStatus(snap.exists() ? (snap.data() as InterStatus) : { connected: false });
          },
          () => setLoadFailed(true)
        );
      } catch {
        setLoadFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [ownerUid]);

  function clearSecrets() {
    setClientId("");
    setClientSecret("");
    setCert(null);
    setKey(null);
    if (certRef.current) certRef.current.value = "";
    if (keyRef.current) keyRef.current.value = "";
  }

  async function pickFile(e: React.ChangeEvent<HTMLInputElement>, set: (v: PemField | null) => void) {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return set(null);
    if (file.size > MAX_PEM_CHARS) {
      setFormError(t("errors.fileTooBig"));
      input.value = "";
      return set(null);
    }
    try {
      const text = await readText(file);
      setFormError("");
      set({ name: file.name, text });
    } catch {
      setFormError(t("errors.fileRead"));
      set(null);
    }
  }

  /** Chamada autenticada; devolve a mensagem do servidor (legível) ou a genérica. */
  async function call(method: "POST" | "PUT" | "DELETE", path: string, body?: Record<string, string>) {
    try {
      const res = await authedFetch(path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = (await res.json().catch(() => ({}))) as { error?: unknown };
      if (!res.ok) {
        return { ok: false as const, error: typeof data.error === "string" && data.error ? data.error : t("errors.generic") };
      }
      return { ok: true as const };
    } catch {
      return { ok: false as const, error: t("errors.network") };
    }
  }

  const connected = !!status?.connected;

  async function submit(mode: "connect" | "update") {
    setFormError("");
    const body: Record<string, string> = {};
    if (clientId.trim()) body.clientId = clientId.trim();
    if (clientSecret.trim()) body.clientSecret = clientSecret.trim();
    if (conta.trim()) body.conta = conta.trim();
    if (cert) body.certPem = cert.text;
    if (key) body.keyPem = key.text;

    if (mode === "connect") {
      if (!body.clientId || !body.clientSecret || !body.certPem || !body.keyPem) {
        setFormError(t("errors.requiredAll"));
        return;
      }
    } else {
      if (Object.keys(body).length === 0) {
        setFormError(t("errors.nothingToUpdate"));
        return;
      }
      if (!!body.certPem !== !!body.keyPem) {
        setFormError(t("errors.certAndKey"));
        return;
      }
    }

    setBusy(mode);
    const r = await call(mode === "connect" ? "POST" : "PUT", "/api/inter/conexao", body);
    setBusy(null);
    if (!r.ok) {
      setFormError(r.error);
      showToast(r.error, "error");
      return;
    }
    clearSecrets(); // segredos saem da memória do React após o sucesso
    setConta("");
    showToast(t(mode === "connect" ? "connectedOk" : "updatedOk"), "success");
  }

  async function test() {
    setBusy("test");
    const r = await call("POST", "/api/inter/testar");
    setBusy(null);
    if (r.ok) showToast(t("testOk"), "success");
    else showToast(r.error, "error"); // o servidor também grava em interStatus.lastSyncError
  }

  async function disconnect() {
    setBusy("disconnect");
    const r = await call("DELETE", "/api/inter/conexao");
    setBusy(null);
    setConfirmOpen(false);
    if (!r.ok) {
      showToast(r.error, "error");
      return;
    }
    clearSecrets();
    setConta("");
    setFormError("");
    showToast(t("disconnectedOk"), "success");
  }

  const labelCls = "block text-xs font-semibold mb-1.5";
  const labelStyle = { color: "var(--cf-text-2)" };

  if (!status) {
    return (
      <Card padding="lg">
        <p className="text-sm" style={{ color: "var(--cf-text-3)" }}>
          {loadFailed ? t("loadError") : t("loading")}
        </p>
      </Card>
    );
  }

  // Sem Pro: aviso de upgrade. Quem já está conectado ainda pode desconectar
  // (a rota DELETE não exige Pro), para poder apagar os segredos.
  if (!isPro && !connected) {
    return (
      <Card padding="lg" className="space-y-3 text-center">
        <h2 className="text-sm font-bold" style={{ color: "var(--db-text)" }}>{t("proTitle")}</h2>
        <p className="text-xs" style={{ color: "var(--cf-text-3)" }}>{t("proBody")}</p>
        <Link
          href="/assinatura"
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold no-underline"
          style={{ background: "var(--brand)", color: "var(--brand-on)" }}
        >
          <Sparkles size={14} /> {t("proCta")}
        </Link>
      </Card>
    );
  }

  const expiresAt = status.certExpiresAt;
  const daysLeft = expiresAt ? Math.ceil((expiresAt - Date.now()) / DAY_MS) : null;
  const expired = daysLeft !== null && daysLeft <= 0;
  const expiring = daysLeft !== null && daysLeft > 0 && daysLeft <= 30;
  const working = busy !== null;

  return (
    <div className="space-y-5">
      {connected && (expired || expiring) && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl px-4 py-3 text-xs"
          style={{ background: expired ? "var(--neg-weak)" : "var(--warn-weak)", color: expired ? "var(--neg)" : "var(--warn)" }}
        >
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            {expired
              ? t("certExpired", { date: formatDate(expiresAt!, locale) })
              : t("certExpiring", { days: daysLeft!, date: formatDate(expiresAt!, locale) })}
          </span>
        </div>
      )}

      {/* ── Estado da conexão ── */}
      <Card padding="lg" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold" style={{ color: "var(--db-text)" }}>{t("title")}</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--cf-text-3)" }}>{t("desc")}</p>
          </div>
          <Pill tone={connected ? "pos" : "muted"} dot>
            {connected ? t("badgeConnected") : t("badgeDisconnected")}
          </Pill>
        </div>

        {connected && (
          <dl className="grid gap-3 text-xs sm:grid-cols-3">
            <div>
              <dt style={{ color: "var(--cf-text-3)" }}>{t("account")}</dt>
              <dd className="font-semibold" style={{ color: "var(--text)" }}>{status.contaMasked || t("accountDefault")}</dd>
            </div>
            <div>
              <dt style={{ color: "var(--cf-text-3)" }}>{t("lastSync")}</dt>
              <dd className="font-semibold" style={{ color: "var(--text)" }}>
                {status.lastSyncAt ? formatDateTime(status.lastSyncAt, locale) : t("neverSynced")}
              </dd>
            </div>
            <div>
              <dt style={{ color: "var(--cf-text-3)" }}>{t("certValidUntil")}</dt>
              <dd className="font-semibold" style={{ color: "var(--text)" }}>
                {expiresAt ? formatDate(expiresAt, locale) : "—"}
              </dd>
            </div>
          </dl>
        )}

        {connected && status.lastSyncError && (
          <div role="alert" className="rounded-xl px-4 py-3 text-xs" style={{ background: "var(--neg-weak)", color: "var(--neg)" }}>
            <strong className="font-semibold">{t("lastError")}</strong> {status.lastSyncError}
          </div>
        )}

        {connected && isPro && (
          <div className="flex justify-end">
            <Button size="sm" variant="secondary" icon={ShieldCheck} loading={busy === "test"} disabled={working} onClick={test}>
              {t("test")}
            </Button>
          </div>
        )}
      </Card>

      {/* ── Credenciais (conectar / atualizar) ── */}
      {isPro && (
        <Card padding="lg" className="space-y-4">
          <div>
            <h2 className="text-sm font-bold" style={{ color: "var(--db-text)" }}>
              {connected ? t("formTitleUpdate") : t("formTitleConnect")}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--cf-text-3)" }}>
              {connected ? t("formDescUpdate") : t("formDescConnect")}
            </p>
          </div>

          <div
            className="rounded-xl px-4 py-3 text-xs space-y-1"
            style={{ background: "var(--sunken)", border: "1px solid var(--border)", color: "var(--text-subtle)" }}
          >
            <p className="font-semibold" style={{ color: "var(--text)" }}>{t("helpTitle")}</p>
            <p>{t("helpBody")}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={idId} className={labelCls} style={labelStyle}>{t("clientId")}</label>
              <Input
                id={idId}
                value={clientId}
                maxLength={MAX_ID_CHARS}
                autoComplete="off"
                spellCheck={false}
                placeholder={connected ? t("keepPlaceholder") : undefined}
                onChange={(e) => setClientId(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor={secretId} className={labelCls} style={labelStyle}>{t("clientSecret")}</label>
              <Input
                id={secretId}
                type="password"
                value={clientSecret}
                maxLength={MAX_ID_CHARS}
                autoComplete="new-password"
                spellCheck={false}
                placeholder={connected ? t("keepPlaceholder") : undefined}
                onChange={(e) => setClientSecret(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor={certId} className={labelCls} style={labelStyle}>{t("certFile")}</label>
              <Input
                id={certId}
                ref={certRef}
                type="file"
                accept=".crt,.pem,.cer"
                className="text-xs"
                onChange={(e) => pickFile(e, setCert)}
              />
              {cert && (
                <p className="mt-1 flex items-center gap-1 text-[11px]" style={{ color: "var(--cf-text-3)" }}>
                  <FileKey2 size={11} /> {cert.name}
                </p>
              )}
            </div>
            <div>
              <label htmlFor={keyId} className={labelCls} style={labelStyle}>{t("keyFile")}</label>
              <Input
                id={keyId}
                ref={keyRef}
                type="file"
                accept=".key,.pem"
                className="text-xs"
                onChange={(e) => pickFile(e, setKey)}
              />
              {key && (
                <p className="mt-1 flex items-center gap-1 text-[11px]" style={{ color: "var(--cf-text-3)" }}>
                  <FileKey2 size={11} /> {key.name}
                </p>
              )}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor={contaId} className={labelCls} style={labelStyle}>{t("conta")}</label>
              <Input
                id={contaId}
                value={conta}
                inputMode="numeric"
                maxLength={MAX_CONTA_CHARS}
                autoComplete="off"
                onChange={(e) => setConta(e.target.value)}
              />
              <p className="mt-1 text-[11px]" style={{ color: "var(--cf-text-3)" }}>{t("contaHint")}</p>
            </div>
          </div>

          {formError && (
            <p role="alert" className="text-xs" style={{ color: "var(--neg)" }}>{formError}</p>
          )}
          <p className="text-[11px]" style={{ color: "var(--cf-text-3)" }}>{t("secretsNote")}</p>

          <div className="flex flex-wrap justify-end gap-2">
            {connected ? (
              <Button size="sm" icon={RefreshCw} loading={busy === "update"} disabled={working} onClick={() => submit("update")}>
                {t("update")}
              </Button>
            ) : (
              <Button size="sm" icon={Plug} loading={busy === "connect"} disabled={working} onClick={() => submit("connect")}>
                {t("connect")}
              </Button>
            )}
          </div>
        </Card>
      )}

      {connected && (
        <Card padding="lg" className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold" style={{ color: "var(--db-text)" }}>{t("disconnectTitle")}</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--cf-text-3)" }}>{t("disconnectDesc")}</p>
          </div>
          <Button size="sm" variant="danger" icon={Unplug} disabled={working} onClick={() => setConfirmOpen(true)}>
            {t("disconnect")}
          </Button>
        </Card>
      )}

      <ConfirmModal
        open={confirmOpen}
        title={t("confirmTitle")}
        message={t("confirmMessage")}
        confirmText={t("disconnect")}
        isDangerous
        loading={busy === "disconnect"}
        onConfirm={disconnect}
        onCancel={() => !working && setConfirmOpen(false)}
      />
    </div>
  );
}
