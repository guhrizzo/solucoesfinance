// Loader padrão único do projeto — use SEMPRE este para telas de carregamento.
// Não crie spinners de página soltos em cada rota.

type PageLoaderProps = {
  /** Texto abaixo do spinner. Passe `null` para esconder. */
  label?: string | null;
  /** Cor de fundo da tela cheia — combine com o fundo da página. */
  background?: string;
};

export function PageLoader({ label = "Carregando…", background = "var(--bg)" }: PageLoaderProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ background }}>
      <div
        className="w-8 h-8 border-2 rounded-full animate-spin"
        style={{ borderColor: "var(--border)", borderTopColor: "var(--brand)" }}
      />
      {label && (
        <p className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
          {label}
        </p>
      )}
    </div>
  );
}
