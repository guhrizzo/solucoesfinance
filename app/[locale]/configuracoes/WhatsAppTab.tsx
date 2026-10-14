"use client";

// app/configuracoes/WhatsAppTab.tsx
// Avisos por WhatsApp pro dono da conta (lib/ownerAlerts.ts): número,
// quais avisos receber e uma mensagem de teste. Recurso do plano Pro.

import { useEffect, useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Send, Sparkles } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button, Card, Input } from "@/app/components/ui";
import { authedFetch } from "@/lib/authedFetch";
import { formatDateTime } from "@/lib/format";

type ShowToast = (message: string, type?: "success" | "error" | "warning" | "info") => void;
type Kind = "caixa" | "estoque" | "contas" | "receber" | "saldo" | "categorizar" | "orcamento" | "resumo";
const KINDS: Kind[] = ["caixa", "estoque", "contas", "receber", "saldo", "categorizar", "orcamento", "resumo"];
const ALL_ON = Object.fromEntries(KINDS.map((k) => [k, true])) as Record<Kind, boolean>;

interface Status {
  configured: boolean;
  pro: boolean;
  isOwner: boolean;
  config: {
    phone?: string;
    name?: string;
    enabled?: Partial<Record<Kind, boolean>>;
    minBalance?: number;
    horizonDays?: number;
    resumoFreq?: "semanal" | "mensal";
    lastResult?: { at: number; kind: string; ok: boolean; reason?: string; detail?: string };
  };
}

/** (11) 91234-5678 enquanto digita. */
function maskPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "").slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export default function WhatsAppTab({ showToast, defaultName }: { showToast: ShowToast; defaultName: string }) {
  const t = useTranslations("configuracoes.whatsapp");
  const locale = useLocale();
  const [status, setStatus] = useState<Status | null>(null);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState<Record<Kind, boolean>>(ALL_ON);
  const [minBalance, setMinBalance] = useState("");
  const [horizonDays, setHorizonDays] = useState("15");
  const [resumoFreq, setResumoFreq] = useState<"semanal" | "mensal">("semanal");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const phoneId = useId();
  const nameId = useId();
  const kindId = useId();
  const minId = useId();
  const horizonId = useId();
  const freqId = useId();

  async function load() {
    try {
      const res = await authedFetch("/api/whatsapp/alerts");
      const data = (await res.json()) as Status;
      if (!res.ok) throw new Error();
      setStatus(data);
      setPhone(maskPhone(data.config.phone ?? ""));
      setName(data.config.name ?? defaultName);
      if (data.config.enabled) {
        setEnabled(Object.fromEntries(KINDS.map((k) => [k, !!data.config.enabled?.[k]])) as Record<Kind, boolean>);
      }
      setMinBalance(data.config.minBalance ? String(data.config.minBalance) : "");
      setHorizonDays(String(data.config.horizonDays ?? 15));
      setResumoFreq(data.config.resumoFreq === "mensal" ? "mensal" : "semanal");
      setDirty(false);
    } catch {
      showToast(t("loadError"), "error");
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await authedFetch("/api/whatsapp/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save", phone, name, enabled, resumoFreq,
          minBalance: Number(minBalance.replace(",", ".")) || 0,
          horizonDays: Number(horizonDays) || 15,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t("saveError"));
      showToast(t("saved"), "success");
      await load();
    } catch (e) {
      showToast(e instanceof Error && e.message ? e.message : t("saveError"), "error");
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    try {
      const res = await authedFetch("/api/whatsapp/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error([data.error, data.detail].filter(Boolean).join(" — ") || t("testError"));
      showToast(t("testSent"), "success");
    } catch (e) {
      showToast(e instanceof Error && e.message ? e.message : t("testError"), "error");
    } finally {
      setTesting(false);
      load();
    }
  }

  const labelCls = "block text-xs font-semibold mb-1.5";
  const labelStyle = { color: "var(--cf-text-2)" };

  if (!status) {
    return <Card padding="lg"><p className="text-sm" style={{ color: "var(--cf-text-3)" }}>{t("loading")}</p></Card>;
  }

  if (!status.pro) {
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

  const podeEditar = status.isOwner;
  const last = status.config.lastResult;
  const salvo = !!status.config.phone;

  return (
    <div className="space-y-5">
      {!status.configured && (
        <div className="rounded-xl px-4 py-3 text-xs" style={{ background: "var(--warn-weak)", color: "var(--warn)" }}>
          {t("notConfigured")}
        </div>
      )}

      <Card padding="lg" className="space-y-4">
        <div>
          <h2 className="text-sm font-bold" style={{ color: "var(--db-text)" }}>{t("title")}</h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--cf-text-3)" }}>{podeEditar ? t("desc") : t("descMember")}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={phoneId} className={labelCls} style={labelStyle}>{t("phone")}</label>
            <Input
              id={phoneId}
              inputMode="tel"
              value={phone}
              disabled={!podeEditar}
              placeholder="(11) 91234-5678"
              onChange={(e) => { setPhone(maskPhone(e.target.value)); setDirty(true); }}
            />
          </div>
          <div>
            <label htmlFor={nameId} className={labelCls} style={labelStyle}>{t("name")}</label>
            <Input
              id={nameId}
              value={name}
              maxLength={60}
              disabled={!podeEditar}
              onChange={(e) => { setName(e.target.value); setDirty(true); }}
            />
          </div>
        </div>

        <fieldset className="m-0 space-y-2 border-0 p-0">
          <legend className={labelCls} style={labelStyle}>{t("kindsTitle")}</legend>
          {KINDS.map((k) => (
            <label
              key={k}
              htmlFor={`${kindId}-${k}`}
              aria-label={t(`kinds.${k}.title`)}
              className="flex cursor-pointer items-start gap-2.5 rounded-xl px-3 py-2.5"
              style={{ background: "var(--sunken)", border: "1px solid var(--border)" }}
            >
              <input
                id={`${kindId}-${k}`}
                type="checkbox"
                checked={enabled[k]}
                disabled={!podeEditar}
                onChange={(e) => { setEnabled((s) => ({ ...s, [k]: e.target.checked })); setDirty(true); }}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--brand)]"
              />
              <span className="text-xs leading-snug">
                <span className="block font-semibold" style={{ color: "var(--text)" }}>{t(`kinds.${k}.title`)}</span>
                <span style={{ color: "var(--text-subtle)" }}>{t(`kinds.${k}.desc`)}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {(enabled.saldo || enabled.resumo) && (
          <div className="grid gap-4 sm:grid-cols-3">
            {enabled.saldo && (
              <>
                <div>
                  <label htmlFor={minId} className={labelCls} style={labelStyle}>{t("minBalance")}</label>
                  <Input id={minId} inputMode="decimal" value={minBalance} disabled={!podeEditar} placeholder="0"
                    onChange={(e) => { setMinBalance(e.target.value.replace(/[^\d.,]/g, "")); setDirty(true); }} />
                </div>
                <div>
                  <label htmlFor={horizonId} className={labelCls} style={labelStyle}>{t("horizonDays")}</label>
                  <Input id={horizonId} inputMode="numeric" value={horizonDays} disabled={!podeEditar} placeholder="15"
                    onChange={(e) => { setHorizonDays(e.target.value.replace(/\D/g, "").slice(0, 2)); setDirty(true); }} />
                </div>
              </>
            )}
            {enabled.resumo && (
              <div>
                <label htmlFor={freqId} className={labelCls} style={labelStyle}>{t("resumoFreq")}</label>
                <select
                  id={freqId}
                  value={resumoFreq}
                  disabled={!podeEditar}
                  onChange={(e) => { setResumoFreq(e.target.value === "mensal" ? "mensal" : "semanal"); setDirty(true); }}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ background: "var(--sunken)", border: "1px solid var(--border)", color: "var(--text)" }}
                >
                  <option value="semanal">{t("freq.semanal")}</option>
                  <option value="mensal">{t("freq.mensal")}</option>
                </select>
              </div>
            )}
          </div>
        )}

        <p className="text-[11px]" style={{ color: "var(--cf-text-3)" }}>{t("consent")}</p>

        {podeEditar && (
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              size="sm"
              variant="secondary"
              icon={Send}
              loading={testing}
              disabled={!salvo || dirty || !status.configured}
              onClick={test}
              title={dirty ? t("saveFirst") : undefined}
            >
              {t("test")}
            </Button>
            <Button size="sm" icon={Check} loading={saving} disabled={!dirty} onClick={save}>
              {t("save")}
            </Button>
          </div>
        )}

        {last && (
          <p className="text-xs" style={{ color: last.ok ? "var(--pos)" : "var(--neg)" }}>
            {last.ok
              ? t("lastOk", { when: formatDateTime(last.at, locale) })
              : t("lastError", { when: formatDateTime(last.at, locale), detail: last.detail || last.reason || "" })}
          </p>
        )}
      </Card>
    </div>
  );
}
