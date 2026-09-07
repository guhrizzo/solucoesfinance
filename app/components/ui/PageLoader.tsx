"use client";

// Loader padrão único do projeto — use SEMPRE este para telas de carregamento.
// Não crie spinners de página soltos em cada rota.

import { useTranslations } from "next-intl";

type PageLoaderProps = {
  /** Texto abaixo do spinner. Omita para o padrão traduzido; passe `null` para esconder. */
  label?: string | null;
  /** Cor de fundo da tela cheia — combine com o fundo da página. */
  background?: string;
};

export function PageLoader({ label, background = "var(--bg)" }: PageLoaderProps) {
  const t = useTranslations("common");
  const text = label === null ? null : (label ?? t("loading"));
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ background }}>
      <div
        className="w-8 h-8 border-2 rounded-full animate-spin"
        style={{ borderColor: "var(--border)", borderTopColor: "var(--brand)" }}
      />
      {text && (
        <p className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
          {text}
        </p>
      )}
    </div>
  );
}
