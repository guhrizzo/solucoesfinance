"use client";

import { useState } from "react";

interface AvatarProps {
  /** URL da foto, ou null para cair na inicial. */
  src: string | null;
  /** Letra mostrada quando não há foto. */
  initial: string;
  /** Lado do quadrado, em px. */
  size?: number;
  /** Raio da borda, em px. Default: ~28% do tamanho. */
  radius?: number;
  className?: string;
}

/**
 * Avatar do usuário. Com `src`, mostra a foto recortada ao centro; sem `src`
 * (ou se a imagem falhar ao carregar), mostra a `initial` sobre o gradiente
 * azul da marca. A resolução de qual `src`/`initial` usar vem de
 * `resolveAvatar()` / `useProfilePhoto()`.
 */
export function Avatar({ src, initial, size = 40, radius, className }: AvatarProps) {
  // Guarda a URL que falhou (em vez de um booleano) pra que trocar de `src`
  // volte a tentar carregar sem precisar de useEffect.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const borderRadius = radius ?? Math.round(size * 0.28);

  if (src && src !== failedSrc) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        onError={() => setFailedSrc(src)}
        className={className}
        style={{ width: size, height: size, borderRadius, objectFit: "cover", display: "block", flexShrink: 0 }}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`grid place-items-center text-white font-bold shrink-0 ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        borderRadius,
        fontSize: Math.round(size * 0.4),
        background: "linear-gradient(135deg, var(--brand-500), var(--brand-400))",
      }}
    >
      {initial}
    </div>
  );
}
