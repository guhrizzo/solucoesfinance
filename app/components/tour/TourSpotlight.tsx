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

/** Camadas do spotlight: bloqueador de cliques, fundo escurecido com "furo" e anel luminoso. */
export function TourSpotlight({ rect }: { rect: SpotRect | null }) {
  let clip: string | undefined;
  if (rect && typeof window !== "undefined") {
    const x1 = Math.max(0, rect.left), y1 = Math.max(0, rect.top);
    const x2 = Math.min(window.innerWidth, rect.left + rect.width), y2 = Math.min(window.innerHeight, rect.top + rect.height);
    clip = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${x1}px ${y1}px, ${x1}px ${y2}px, ${x2}px ${y2}px, ${x2}px ${y1}px, ${x1}px ${y1}px)`;
  }
  return (
    <>
      <div className="nxt-blocker" aria-hidden="true" />
      <div className="nxt-dim" aria-hidden="true" style={clip ? { clipPath: clip } : undefined} />
      {rect && <div className="nxt-ring" aria-hidden="true" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />}
    </>
  );
}
