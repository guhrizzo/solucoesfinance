"use client";

// components/CookieConsent.tsx
//
// Banner de consentimento de cookies / tratamento de dados, exigido pela LGPD
// (Lei 13.709/2018). Aparece na primeira visita e sempre que CONSENT_VERSION
// mudar. O usuário pode aceitar tudo, recusar o que é opcional ou escolher
// categoria por categoria.
//
// Para reabrir depois (ex.: link "Preferências de cookies" no rodapé ou na
// Política de Privacidade):
//   window.dispatchEvent(new Event("nexusfi-open-cookie-preferences"))

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Cookie, ChevronDown, ExternalLink } from "lucide-react";
import {
  getConsentSnapshot,
  subscribeConsent,
  acceptAll,
  rejectOptional,
  writeConsent,
  CATEGORY_INFO,
  type ConsentCategory,
} from "@/lib/consent";

const OPTIONAL: ConsentCategory[] = ["preferences", "analytics"];

// Rotas do app autenticado — nelas o banner acompanha o tema (claro ou escuro).
// Fora delas (landing, login, cadastro, política) o banner é sempre claro, já
// que essas páginas públicas são desenhadas em fundo claro.
// Mantém em sincronia com a lista em AppShell.tsx.
const APP_PREFIXES = [
  "/dashboard",
  "/fluxo-caixa",
  "/contasPagar",
  "/contasReceber",
  "/costCenter",
  "/estoque",
  "/vendas",
  "/impostos",
  "/relatorios",
  "/configuracoes",
];

// Fora das rotas do app, o wrapper recebe .cookie-consent--light, que reaplica
// os tokens claros de :root mesmo sob [data-theme="dark"] (ver globals.css).

// `false` no SSR e durante a hidratação, `true` só depois de montar — sem
// setState em effect (lint: react-hooks/set-state-in-effect). Enquanto for
// `false` o componente renderiza `null`, então o banner NÃO vai no HTML do
// servidor e não pisca a cada carga de página pra quem já registrou a escolha.
const emptySubscribe = () => () => {};

export function CookieConsent() {
  const pathname = usePathname();
  const themed = APP_PREFIXES.some((p) => pathname.startsWith(p));

  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  const consent = useSyncExternalStore(
    subscribeConsent,
    getConsentSnapshot,
    () => null,
  );

  const [forceOpen, setForceOpen] = useState(false);
  // Mini: só o aviso curto + Aceitar/Recusar. "Saiba mais" aumenta pra este
  // card completo (texto da LGPD + categorias). Quem prefere, pode abrir a
  // Política de Privacidade completa numa aba nova em vez de expandir aqui.
  const [expanded, setExpanded] = useState(false);
  const [customize, setCustomize] = useState(false);
  const [choice, setChoice] = useState<Record<ConsentCategory, boolean>>({
    essential: true,
    preferences: true,
    analytics: true,
  });

  useEffect(() => {
    const reopen = () => {
      const cur = getConsentSnapshot();
      if (cur) setChoice(cur.categories);
      setExpanded(true);
      setCustomize(true);
      setForceOpen(true);
    };
    window.addEventListener("nexusfi-open-cookie-preferences", reopen);
    return () =>
      window.removeEventListener("nexusfi-open-cookie-preferences", reopen);
  }, []);

  // Antes de montar não sabemos o que há no localStorage — não renderiza nada
  // (evita o flash do banner em quem já decidiu).
  const open = mounted && (forceOpen || consent === null);
  if (!open) return null;

  const close = () => {
    setForceOpen(false);
    setExpanded(false);
    setCustomize(false);
  };

  const handleAcceptAll = () => {
    acceptAll();
    close();
  };
  const handleRejectOptional = () => {
    rejectOptional();
    close();
  };
  const handleSave = () => {
    writeConsent(choice);
    close();
  };

  const wrapperClass = `fixed inset-x-0 bottom-0 p-3 sm:p-4 ${
    themed ? "" : "cookie-consent--light"
  }`;

  // ── Mini: aviso curto, cabe numa linha. "Saiba mais" aumenta o card;
  // o link de política abre a página completa numa aba nova. ──────────────
  if (!expanded) {
    return (
      <div
        role="dialog"
        aria-label="Aviso de cookies e privacidade"
        aria-modal="false"
        style={{ zIndex: 970 }}
        className={wrapperClass}
      >
        <div className="mx-auto flex max-w-xl flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow-pop)]">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{ background: "var(--brand-weak)", color: "var(--brand)" }}
          >
            <Cookie size={16} />
          </span>

          <p className="min-w-[180px] flex-1 text-xs leading-snug text-[var(--text-muted)]">
            Usamos cookies essenciais e, com sua permissão, de preferências e
            análise.{" "}
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="font-semibold text-[var(--brand)] underline underline-offset-2"
            >
              Saiba mais
            </button>
          </p>

          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={handleRejectOptional}
              className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] transition-colors hover:bg-[var(--sunken)]"
            >
              Recusar
            </button>
            <button
              type="button"
              onClick={handleAcceptAll}
              className="rounded-lg border border-transparent bg-[var(--brand)] px-3 py-1.5 text-xs font-semibold text-[var(--brand-on)] transition-colors hover:bg-[var(--brand-hover)]"
            >
              Aceitar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Expandida: texto completo (LGPD) + categorias, pra quem clicou em
  // "Saiba mais" no card mini. ─────────────────────────────────────────────
  return (
    <div
      role="dialog"
      aria-label="Aviso de cookies e privacidade"
      aria-modal="false"
      style={{ zIndex: 970 }}
      className={wrapperClass}
    >
      <div className="mx-auto max-w-3xl rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-pop)] sm:p-5">
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ background: "var(--brand-weak)", color: "var(--brand)" }}
          >
            <Cookie size={18} />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-heading text-sm font-semibold text-[var(--text)]">
                Sua privacidade
              </h2>
              {!forceOpen && (
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="shrink-0 text-xs font-semibold text-[var(--text-subtle)] hover:text-[var(--text)]"
                >
                  Recolher
                </button>
              )}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
              Usamos cookies e tecnologias semelhantes para{" "}
              <strong className="font-semibold text-[var(--text)]">
                manter você conectado com segurança
              </strong>
              , lembrar suas preferências (como tema e layout) e entender de
              forma agregada como a plataforma é usada, para melhorá-la. O
              tratamento desses dados segue a{" "}
              <strong className="font-semibold text-[var(--text)]">
                Lei Geral de Proteção de Dados (Lei nº 13.709/2018)
              </strong>
              . Os cookies essenciais são sempre ativos; os demais dependem do
              seu consentimento, que você pode retirar quando quiser.
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              <button
                type="button"
                onClick={() => setCustomize((c) => !c)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--brand)]"
              >
                Personalizar
                <ChevronDown
                  size={13}
                  style={{
                    transform: customize ? "rotate(180deg)" : "none",
                    transition: "transform 0.2s",
                  }}
                />
              </button>
              <Link
                href="/privacidade"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--brand)] underline underline-offset-2"
              >
                Ver política completa
                <ExternalLink size={12} />
              </Link>
            </div>

            {customize && (
              <div className="mt-3 space-y-2 border-t border-[var(--border)] pt-3">
                {(["essential", ...OPTIONAL] as ConsentCategory[]).map((cat) => {
                  const info = CATEGORY_INFO[cat];
                  const checked = info.required || choice[cat];
                  return (
                    <label
                      key={cat}
                      className="flex items-start gap-2.5"
                      style={{ cursor: info.required ? "default" : "pointer" }}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]"
                        checked={checked}
                        disabled={info.required}
                        onChange={(e) =>
                          setChoice((c) => ({ ...c, [cat]: e.target.checked }))
                        }
                      />
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-[var(--text)]">
                          {info.label}
                          {info.required && (
                            <span className="ml-1.5 font-normal text-[var(--text-subtle)]">
                              (sempre ativos)
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-relaxed text-[var(--text-muted)]">
                          {info.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleAcceptAll}
                className="rounded-lg border border-transparent bg-[var(--brand)] px-4 py-2 text-xs font-semibold text-[var(--brand-on)] transition-colors hover:bg-[var(--brand-hover)]"
              >
                Aceitar todos
              </button>
              <button
                type="button"
                onClick={handleRejectOptional}
                className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2 text-xs font-semibold text-[var(--text)] transition-colors hover:bg-[var(--sunken)]"
              >
                Recusar opcionais
              </button>
              {customize && (
                <button
                  type="button"
                  onClick={handleSave}
                  className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2 text-xs font-semibold text-[var(--text)] transition-colors hover:bg-[var(--sunken)]"
                >
                  Salvar preferências
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
