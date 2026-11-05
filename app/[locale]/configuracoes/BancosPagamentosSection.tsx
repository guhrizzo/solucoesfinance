"use client";

// app/configuracoes/BancosPagamentosSection.tsx
// Seção "Bancos e pagamentos" da aba Integrações. Cartão do Banco Inter SOMENTE
// LEITURA para o cliente: a conexão é feita pela equipe NexusFi (painel de adm).
// O status é lido ao vivo de users/{ownerUid}/profile/interStatus (somente
// leitura pelo client), como em BancoInterTab.

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, Landmark, Sparkles } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Card, Pill } from "@/app/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import type { InterStatus } from "@/lib/interTypes";

const DAY_MS = 24 * 60 * 60 * 1000;

// Instituições planejadas: cartões "Em breve", sem ação.
export const INSTITUICOES_EM_BREVE = ["pagbank", "mercadopago", "stone", "cielo"] as const;

export default function BancosPagamentosSection({ ownerUid, isPro }: { ownerUid: string; isPro: boolean }) {
  const t = useTranslations("configuracoes.integracoes");
  const locale = useLocale();
  const [status, setStatus] = useState<InterStatus | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

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

  const connected = !!status?.connected;
  const expiresAt = status?.certExpiresAt;
  const daysLeft = expiresAt ? Math.ceil((expiresAt - Date.now()) / DAY_MS) : null;
  const expired = daysLeft !== null && daysLeft <= 0;
  const expiring = daysLeft !== null && daysLeft > 0 && daysLeft <= 30;

  function interCard() {
    if (!status) {
      return (
        <p className="text-sm" style={{ color: "var(--cf-text-3)" }}>
          {loadFailed ? t("loadError") : t("loading")}
        </p>
      );
    }

    // Sem Pro e sem conexão: aviso do plano (o cliente não conecta por conta própria).
    if (!isPro && !connected) {
      return (
        <div className="space-y-3 text-center">
          <h3 className="text-sm font-bold" style={{ color: "var(--db-text)" }}>{t("proTitle")}</h3>
          <p className="text-xs" style={{ color: "var(--cf-text-3)" }}>{t("proBody")}</p>
          <Link
            href="/assinatura"
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold no-underline"
            style={{ background: "var(--brand)", color: "var(--brand-on)" }}
          >
            <Sparkles size={14} /> {t("proCta")}
          </Link>
        </div>
      );
    }

    return (
      <div className="space-y-3">
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

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-bold" style={{ color: "var(--db-text)" }}>
              <Landmark size={14} /> {t("interName")}
            </h3>
            <p className="text-xs mt-0.5" style={{ color: "var(--cf-text-3)" }}>{t("interDesc")}</p>
          </div>
          <Pill tone={connected ? "pos" : "muted"} dot>
            {connected ? t("badgeConnected") : t("badgeDisconnected")}
          </Pill>
        </div>

        {connected ? (
          <>
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

            {status.lastSyncError && (
              <div role="alert" className="rounded-xl px-4 py-3 text-xs" style={{ background: "var(--neg-weak)", color: "var(--neg)" }}>
                <strong className="font-semibold">{t("lastError")}</strong> {status.lastSyncError}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              {status.configuradoPelaEquipe ? (
                <span className="text-[11px]" style={{ color: "var(--cf-text-3)" }}>{t("configuredByTeam")}</span>
              ) : (
                <span />
              )}
              <Link href="/fluxo-caixa" className="text-xs font-semibold no-underline" style={{ color: "var(--brand-500)" }}>
                {t("openQueue")}
              </Link>
            </div>
          </>
        ) : (
          <p className="text-xs" style={{ color: "var(--cf-text-2)" }}>{t("contactTeam")}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card padding="lg">{interCard()}</Card>

      {/* Instituições planejadas: sem ação. */}
      <div className="grid gap-3 sm:grid-cols-2">
        {INSTITUICOES_EM_BREVE.map((id) => (
          <Card key={id} padding="md" className="flex items-center justify-between gap-2 opacity-70" aria-disabled="true">
            <span className="text-sm font-semibold" style={{ color: "var(--db-text)" }}>{t(`institutions.${id}`)}</span>
            <Pill tone="muted">{t("soonBadge")}</Pill>
          </Card>
        ))}
      </div>
    </div>
  );
}
