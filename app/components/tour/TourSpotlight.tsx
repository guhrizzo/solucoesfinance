"use client";

import { useEffect, useState } from "react";

export interface SpotRect { top: number; left: number; width: number; height: number }

function findVisible(target: string): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>(`[data-tour-target="${CSS.escape(target)}"]`);
  for (const el of nodes) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && el.getClientRects().length > 0) return el;
  }
  return null;
}

/** Acompanha o retângulo do elemento real (data-tour-target) enquanto a página rola/redimensiona/navega. */
export function useSpotRect(target: string | null, active: boolean): SpotRect | null {
  const [rect, setRect] = useState<SpotRect | null>(null);

  useEffect(() => {
    if (!active || !target) {
      setRect(null);
      return;
    }
    let el: HTMLElement | null = null;
    let raf = 0;
    const PAD = 6;

    const measure = () => {
      if (!el || !el.isConnected) el = findVisible(target);
      if (!el) return setRect(null);
      const r = el.getBoundingClientRect();
      const next = { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
      setRect((p) => (p && p.top === next.top && p.left === next.left && p.width === next.width && p.height === next.height ? p : next));
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };

    // A página pode ainda estar montando (navegação do tour): tenta por ~2s.
    let tries = 0;
    const poll = window.setInterval(() => {
      tries++;
      if (!el || !el.isConnected) {
        el = findVisible(target);
        if (el) {
          el.scrollIntoView({ block: "nearest", inline: "nearest" });
          schedule();
        }
      }
      if ((el && tries > 6) || tries > 20) window.clearInterval(poll);
    }, 100);

    schedule();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      window.clearInterval(poll);
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [target, active]);

  return rect;
}

/** Camadas do spotlight: bloqueador de cliques, fundo escurecido com "furo" e anel luminoso.
 *  O furo é feito com 4 painéis ao redor do alvo (em vez de clip-path), pra o item
 *  destacado ficar nítido e sem escurecimento em qualquer navegador. */
export function TourSpotlight({ rect }: { rect: SpotRect | null }) {
  let panes: React.CSSProperties[] | null = null;
  if (rect && typeof window !== "undefined") {
    const x1 = Math.max(0, rect.left), y1 = Math.max(0, rect.top);
    const x2 = Math.min(window.innerWidth, rect.left + rect.width), y2 = Math.min(window.innerHeight, rect.top + rect.height);
    panes = [
      { top: 0, left: 0, right: 0, height: y1 },
      { top: y2, left: 0, right: 0, bottom: 0 },
      { top: y1, left: 0, width: x1, height: y2 - y1 },
      { top: y1, left: x2, right: 0, height: y2 - y1 },
    ];
  }
  return (
    <>
      <div className="nxt-blocker" aria-hidden="true" />
      {panes ? (
        panes.map((style, i) => <div key={i} className="nxt-dim" aria-hidden="true" style={style} />)
      ) : (
        <div className="nxt-dim" aria-hidden="true" />
      )}
      {rect && <div className="nxt-ring" aria-hidden="true" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />}
    </>
  );
}
