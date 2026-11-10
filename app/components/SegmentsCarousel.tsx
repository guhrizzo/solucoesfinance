"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";
import { Link } from "@/i18n/navigation";

interface SegmentItem {
  title: string;
  bullets: string[];
  alt: string;
}

/** Mesma ordem de landing.segments.items. Fotos geradas no Higgsfield (public/segmentos). */
const IMAGES = [
  "/segmentos/alimentacao.png",
  "/segmentos/comercio.png",
  "/segmentos/servicos.png",
  "/segmentos/beleza.png",
  "/segmentos/industria.png",
  "/segmentos/oficina.png",
];

/**
 * Carrossel "uma solução pensada para o seu segmento": cartões com foto,
 * rolagem com snap (arrasta no toque, roda no mouse) e pontos de paginação
 * por grupo visível (3 no desktop, 2 no tablet, 1 no celular).
 */
export default function SegmentsCarousel() {
  const t = useTranslations("landing.segments");
  const items = t.raw("items") as SegmentItem[];

  const trackRef = useRef<HTMLUListElement>(null);
  const [pages, setPages] = useState(1);
  const [active, setActive] = useState(0);

  const measure = useCallback(() => {
    const el = trackRef.current;
    if (!el || el.children.length < 2) return;
    const first = el.children[0] as HTMLElement;
    const second = el.children[1] as HTMLElement;
    const step = second.offsetLeft - first.offsetLeft;
    if (step <= 0) return;
    const gap = step - first.offsetWidth;
    const perView = Math.max(1, Math.round((el.clientWidth + gap) / step));
    const total = Math.max(1, Math.ceil(items.length / perView));
    setPages(total);

    const atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 2;
    const page = atEnd ? total - 1 : Math.min(total - 1, Math.round(el.scrollLeft / step / perView));
    setActive(page);
  }, [items.length]);

  useEffect(() => {
    measure();
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  const goTo = (page: number) => {
    const el = trackRef.current;
    if (!el) return;
    const first = el.children[0] as HTMLElement;
    const second = el.children[1] as HTMLElement;
    const step = second.offsetLeft - first.offsetLeft;
    const gap = step - first.offsetWidth;
    const perView = Math.max(1, Math.round((el.clientWidth + gap) / step));
    el.scrollTo({ left: page * perView * step, behavior: "smooth" });
  };

  return (
    <section className="py-20 bg-white" aria-label={t("carouselLabel")}>
      <div className="max-w-7xl mx-auto px-6">
        <h2 className="text-3xl sm:text-4xl font-extrabold text-blue-950 text-center leading-tight mb-12">
          {t("title")}
        </h2>

        <ul
          ref={trackRef}
          onScroll={measure}
          className="flex gap-6 overflow-x-auto snap-x snap-mandatory pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map((it, i) => (
            <li
              key={it.title}
              className="snap-start shrink-0 basis-[85%] sm:basis-[calc((100%-1.5rem)/2)] lg:basis-[calc((100%-3rem)/3)]"
            >
              <Link
                href="/register"
                aria-label={t("cta", { segment: it.title })}
                className="group relative block aspect-[393/340] overflow-hidden rounded-3xl"
                style={{ background: "rgb(10 26 61)" }}
              >
                <Image
                  src={IMAGES[i] ?? IMAGES[0]}
                  alt={it.alt}
                  fill
                  sizes="(min-width: 1024px) 380px, (min-width: 640px) 45vw, 85vw"
                  className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                />
                {/* degradê inferior: garante contraste do texto sobre qualquer foto */}
                <div
                  aria-hidden="true"
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(to top, rgba(6,16,38,0.92) 0%, rgba(6,16,38,0.6) 38%, rgba(6,16,38,0) 70%)",
                  }}
                />
                <div className="absolute inset-x-0 bottom-0 p-5 pr-16" style={{ color: "white" }}>
                  <h3 className="text-lg font-bold mb-2" style={{ color: "white" }}>
                    {it.title}
                  </h3>
                  <ul className="list-disc pl-5 space-y-0.5 text-sm" style={{ color: "rgba(255,255,255,0.92)" }}>
                    {it.bullets.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </div>
                <span
                  aria-hidden="true"
                  className="absolute bottom-5 right-5 flex h-8 w-8 items-center justify-center rounded-full transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                  style={{ background: "white", color: "rgb(10 26 61)" }}
                >
                  <ArrowUpRight size={16} />
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {pages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            {Array.from({ length: pages }, (_, p) => (
              <button
                key={p}
                type="button"
                onClick={() => goTo(p)}
                aria-label={t("pageDot", { n: p + 1 })}
                aria-current={p === active}
                className="h-3 rounded-full transition-all duration-300"
                style={{
                  width: p === active ? 80 : 18,
                  background:
                    p === active
                      ? "var(--brand-500)"
                      : "color-mix(in srgb, var(--text-subtle) 35%, transparent)",
                }}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
