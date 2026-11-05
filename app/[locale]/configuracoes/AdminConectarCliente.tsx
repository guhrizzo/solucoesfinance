"use client";

// app/configuracoes/AdminConectarCliente.tsx
// Painel do adm supremo: conectar o Banco Inter EM NOME do cliente (dono da conta).
// O servidor é quem manda: aqui só se coleta o e-mail e as credenciais, e tudo
// vai por /api/admin/inter/* (o uid do cliente nunca chega ao navegador).
// Higiene de segredos: clientSecret/certificado/chave nunca são pré-preenchidos,
// são enviados uma vez e descartados (estado E inputs de arquivo) após sucesso,
// ao desconectar, ao trocar de cliente e ao desmontar. O status mostrado vem de
// /cliente (não se lê o Firestore de outro usuário pelo client). Nada é logado.

import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, FileKey2, Plug, RefreshCw, Search, ShieldCheck, Unplug } from "lucide-react";
import { Button, Card, Input, Pill } from "@/app/components/ui";
import ConfirmModal from "@/app/components/ConfirmModal";
import { authedFetch } from "@/lib/authedFetch";
import { formatDate, formatDateTime } from "@/lib/format";
import type { InterStatus } from "@/lib/interTypes";
import { createGenerationToken } from "@/lib/generationToken";

type ShowToast = (message: string, type?: "success" | "error" | "warning" | "info") => void;

// Limites iguais aos do servidor (lib/interConexao.ts).
const MAX_PEM_CHARS = 20 * 1024;
const MAX_ID_CHARS = 200;
const MAX_CONTA_CHARS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

type Busy = null | "search" | "connect" | "update" | "test" | "disconnect";
type PemField = { name: string; text: string };
type Target = { nome: string; email: string; pro: boolean; conexao: InterStatus | null };

/** Lê o arquivo escolhido como TEXTO (PEM). Erro de leitura rejeita sem conteúdo. */
function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === "string" ? r.result : "");
    r.onerror = () => reject(new Error("read"));
    r.readAsText(file);
  });
}

export default function AdminConectarCliente({ showToast }: { showToast: ShowToast }) {
  const t = useTranslations("configuracoes.integracoes.admin");
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [target, setTarget] = useState<Target | null>(null);
  const [searchError, setSearchError] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [conta, setConta] = useState("");
  const [cert, setCert] = useState<PemField | null>(null);
  const [key, setKey] = useState<PemField | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [formError, setFormError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [now] = useState(() => Date.now()); // referência estável p/ validade do certificado
  // Geração do alvo: nova busca/edição do e-mail invalida lookups, refreshes e leituras de arquivo em voo.
  const genRef = useRef(createGenerationToken());
  const busyRef = useRef(false); // trava síncrona contra duplo envio
  const mountedRef = useRef(true);
  const certRef = useRef<HTMLInputElement>(null);
  const keyRef = useRef<HTMLInputElement>(null);
  const emailId = useId();
  const idId = useId();
  const secretId = useId();
  const contaId = useId();
  const certId = useId();
  const keyId = useId();

  /** Zera TODOS os campos sensíveis: estado do React e os inputs de arquivo. */
  function clearSecrets() {
    setClientId("");
    setClientSecret("");
    setConta("");
    setCert(null);
    setKey(null);
    if (certRef.current) certRef.current.value = "";
    if (keyRef.current) keyRef.current.value = "";
  }

  // Ao desmontar, descarta o que ainda estiver nos inputs de arquivo.
  useEffect(() => {
    mountedRef.current = true;
    const certInput = certRef;
    const keyInput = keyRef;
    return () => {
      mountedRef.current = false;
      if (certInput.current) certInput.current.value = "";
      if (keyInput.current) keyInput.current.value = "";
    };
  }, []);

  /** Chamada autenticada; devolve a mensagem do servidor como veio, ou a genérica. */
  async function call(method: "POST" | "PUT" | "DELETE", path: string, body: Record<string, string>) {
    try {
      const res = await authedFetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        return { ok: false as const, error: typeof data.error === "string" && data.error ? data.error : t("errors.generic") };
      }
      return { ok: true as const, data };
    } catch {
      return { ok: false as const, error: t("errors.network") };
    }
  }

  /** Consulta o cliente por e-mail (também usada para atualizar o status). */
  async function lookup(rawEmail: string): Promise<{ ok: true; target: Target } | { ok: false; error: string }> {
    const r = await call("POST", "/api/admin/inter/cliente", { email: rawEmail });
    if (!r.ok) return r;
    const d = r.data;
    return {
      ok: true,
      target: {
        nome: typeof d.nome === "string" ? d.nome : "",
        email: typeof d.email === "string" ? d.email : rawEmail,
        pro: d.pro === true,
        conexao: d.conexao && typeof d.conexao === "object" ? (d.conexao as InterStatus) : null,
      },
    };
  }

  async function search() {
    if (busyRef.current) return;
    const value = email.trim();
    if (!value) {
      setSearchError(t("errors.emailRequired"));
      return;
    }
    busyRef.current = true;
    const gen = genRef.current.bump();
    setBusy("search");
    // Novo alvo: nada do cliente anterior pode sobrar na tela.
    setTarget(null);
    setSearchError("");
    setFormError("");
    setConfirmOpen(false);
    clearSecrets();
    const r = await lookup(value);
    busyRef.current = false;
    if (!mountedRef.current) return;
    setBusy(null);
    if (!genRef.current.isCurrent(gen)) return; // o e-mail/alvo mudou durante a busca
    if (!r.ok) {
      setSearchError(r.error);
      return;
    }
    setTarget(r.target);
  }

  /** Recarrega o status do cliente atual depois de uma ação. */
  async function refreshStatus(current: Target, gen: number) {
    const r = await lookup(current.email);
    if (!mountedRef.current || !genRef.current.isCurrent(gen)) return; // alvo trocou: descarta
    if (r.ok) setTarget(r.target);
    else showToast(r.error, "error");
  }

  function onEmailChange(value: string) {
    genRef.current.bump(); // qualquer edição invalida o que estiver em voo
    setEmail(value);
    // Editar o e-mail invalida o cliente mostrado (e seus campos).
    if (target && value.trim().toLowerCase() !== target.email.toLowerCase()) {
      setTarget(null);
      setFormError("");
      setConfirmOpen(false);
      clearSecrets();
    }
  }

  async function pickFile(e: React.ChangeEvent<HTMLInputElement>, set: (v: PemField | null) => void) {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return set(null);
    const gen = genRef.current.current();
    // Tamanho checado ANTES de ler o conteúdo.
    if (file.size > MAX_PEM_CHARS) {
      setFormError(t("errors.fileTooBig"));
      input.value = "";
      return set(null);
    }
    try {
      const text = await readText(file);
      if (!mountedRef.current || !genRef.current.isCurrent(gen)) return;
      setFormError("");
      set({ name: file.name, text });
    } catch {
      if (!mountedRef.current || !genRef.current.isCurrent(gen)) return;
      setFormError(t("errors.fileRead"));
      input.value = "";
      set(null);
    }
  }

  async function submit(mode: "connect" | "update") {
    if (busyRef.current || !target || !target.pro) return;
    setFormError("");
    const body: Record<string, string> = {};
    if (clientId.trim()) body.clientId = clientId.trim();
    if (clientSecret.trim()) body.clientSecret = clientSecret.trim();
    if (conta.trim()) body.conta = conta.trim();
    if (cert?.text) body.certPem = cert.text;
    if (key?.text) body.keyPem = key.text;

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

    busyRef.current = true;
    const gen = genRef.current.current();
    setBusy(mode);
    const r = await call(mode === "connect" ? "POST" : "PUT", "/api/admin/inter/conexao", {
      clienteEmail: target.email,
      ...body,
    });
    if (!mountedRef.current) {
      busyRef.current = false;
      return;
    }
    if (!r.ok) {
      busyRef.current = false;
      setBusy(null);
      setFormError(r.error);
      showToast(r.error, "error");
      return;
    }
    clearSecrets(); // segredos saem da memória do React após o sucesso
    showToast(t(mode === "connect" ? "connectedOk" : "updatedOk"), "success");
    await refreshStatus(target, gen);
    busyRef.current = false;
    if (mountedRef.current) setBusy(null);
  }

  async function test() {
    if (busyRef.current || !target || !target.pro) return;
    busyRef.current = true;
    const gen = genRef.current.current();
    setBusy("test");
    const r = await call("POST", "/api/admin/inter/testar", { clienteEmail: target.email });
    if (!mountedRef.current) {
      busyRef.current = false;
      return;
    }
    showToast(r.ok ? t("testOk") : r.error, r.ok ? "success" : "error");
    await refreshStatus(target, gen); // o servidor grava o último erro no status
    busyRef.current = false;
    if (mountedRef.current) setBusy(null);
  }

  async function disconnect() {
    if (busyRef.current || !target) return;
    busyRef.current = true;
    const gen = genRef.current.current();
    setBusy("disconnect");
    const r = await call("DELETE", "/api/admin/inter/conexao", { clienteEmail: target.email });
    if (!mountedRef.current) {
      busyRef.current = false;
      return;
    }
    setConfirmOpen(false);
    if (!r.ok) {
      busyRef.current = false;
      setBusy(null);
      showToast(r.error, "error");
      return;
    }
    clearSecrets();
    setFormError("");
    showToast(t("disconnectedOk"), "success");
    await refreshStatus(target, gen);
    busyRef.current = false;
    if (mountedRef.current) setBusy(null);
  }

  const labelCls = "block text-xs font-semibold mb-1.5";
  const labelStyle = { color: "var(--cf-text-2)" };
  const working = busy !== null;
  const status = target?.conexao ?? null;
  const connected = !!status?.connected;
  const expiresAt = status?.certExpiresAt;
  const daysLeft = expiresAt ? Math.ceil((expiresAt - now) / DAY_MS) : null;
  const expired = daysLeft !== null && daysLeft <= 0;
  const expiring = daysLeft !== null && daysLeft > 0 && daysLeft <= 30;

  return (
    <div className="space-y-5">
      {/* ── Busca do cliente ── */}
      <Card padding="lg" className="space-y-3">
        <div>
          <h3 className="text-sm font-bold" style={{ color: "var(--db-text)" }}>{t("title")}</h3>
          <p className="text-xs mt-0.5" style={{ color: "var(--cf-text-3)" }}>{t("desc")}</p>
        </div>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <div className="min-w-[14rem] flex-1">
            <label htmlFor={emailId} className={labelCls} style={labelStyle}>{t("emailLabel")}</label>
            <Input
              id={emailId}
              type="email"
              value={email}
              autoComplete="off"
              spellCheck={false}
              placeholder={t("emailPlaceholder")}
              disabled={working}
              onChange={(e) => onEmailChange(e.target.value)}
            />
          </div>
          <Button type="submit" size="sm" icon={Search} loading={busy === "search"} disabled={working}>
            {t("search")}
          </Button>
        </form>
        {searchError && (
          <p role="alert" className="text-xs" style={{ color: "var(--neg)" }}>{searchError}</p>
        )}
      </Card>

      {target && (
        <>
          {/* ── Cliente e estado da conexão ── */}
          <Card padding="lg" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold" style={{ color: "var(--db-text)" }}>{target.nome || target.email}</h3>
                <p className="text-xs mt-0.5" style={{ color: "var(--cf-text-3)" }}>{target.email}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={target.pro ? "pos" : "muted"}>{target.pro ? t("planPro") : t("planNotPro")}</Pill>
                <Pill tone={connected ? "pos" : "muted"} dot>
                  {connected ? t("badgeConnected") : t("badgeDisconnected")}
                </Pill>
              </div>
            </div>

            {!target.pro && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-xl px-4 py-3 text-xs"
                style={{ background: "var(--warn-weak)", color: "var(--warn)" }}
              >
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>{t("notProWarning")}</span>
              </div>
            )}

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

            {connected && status && (
              <dl className="grid gap-3 text-xs sm:grid-cols-4">
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
                <div>
                  <dt style={{ color: "var(--cf-text-3)" }}>{t("configuredBy")}</dt>
                  <dd className="font-semibold" style={{ color: "var(--text)" }}>
                    {status.configuradoPelaEquipe ? t("configuredByTeam") : t("configuredByClient")}
                  </dd>
                </div>
              </dl>
            )}

            {connected && status?.lastSyncError && (
              <div role="alert" className="rounded-xl px-4 py-3 text-xs" style={{ background: "var(--neg-weak)", color: "var(--neg)" }}>
                <strong className="font-semibold">{t("lastError")}</strong> {status.lastSyncError}
              </div>
            )}

            {connected && (
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={ShieldCheck}
                  loading={busy === "test"}
                  disabled={working || !target.pro}
                  onClick={test}
                >
                  {t("test")}
                </Button>
              </div>
            )}
          </Card>

          {/* ── Credenciais (conectar / atualizar) ── */}
          <Card padding="lg" className="space-y-4">
            <div>
              <h3 className="text-sm font-bold" style={{ color: "var(--db-text)" }}>
                {connected ? t("formTitleUpdate") : t("formTitleConnect")}
              </h3>
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
                <Button
                  size="sm"
                  icon={RefreshCw}
                  loading={busy === "update"}
                  disabled={working || !target.pro}
                  onClick={() => submit("update")}
                >
                  {t("update")}
                </Button>
              ) : (
                <Button
                  size="sm"
                  icon={Plug}
                  loading={busy === "connect"}
                  disabled={working || !target.pro}
                  onClick={() => submit("connect")}
                >
                  {t("connect")}
                </Button>
              )}
            </div>
          </Card>

          {/* Desconectar não exige Pro: permite apagar os segredos de quem perdeu o plano. */}
          {connected && (
            <Card padding="lg" className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold" style={{ color: "var(--db-text)" }}>{t("disconnectTitle")}</h3>
                <p className="text-xs mt-0.5" style={{ color: "var(--cf-text-3)" }}>{t("disconnectDesc")}</p>
              </div>
              <Button size="sm" variant="danger" icon={Unplug} disabled={working} onClick={() => setConfirmOpen(true)}>
                {t("disconnect")}
              </Button>
            </Card>
          )}
        </>
      )}

      <ConfirmModal
        open={confirmOpen}
        title={t("confirmTitle")}
        message={t("confirmMessage", { email: target?.email ?? "" })}
        confirmText={t("disconnect")}
        isDangerous
        loading={busy === "disconnect"}
        onConfirm={disconnect}
        onCancel={() => !working && setConfirmOpen(false)}
      />
    </div>
  );
}
