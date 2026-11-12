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

/** Alimentação fica fora por enquanto (texto e foto seguem prontos). Troque para true para voltar. */
const ALIMENTACAO_VISIVEL = false;
const HIDDEN_INDEXES = new Set(ALIMENTACAO_VISIVEL ? [] : [0]);

/** Tempo de cada grupo na rolagem automática (ms). */
const AUTOPLAY_MS = 5500;

/**
 * Carrossel "uma solução pensada para o seu segmento": cartões com foto,
 * rolagem com snap (arrasta no toque, roda no mouse), pontos de paginação por
 * grupo visível (3 no desktop, 2 no tablet, 1 no celular), entrada animada ao
 * rolar até a seção e avanço automático (pausa no hover/foco/toque). O avanço
 * é dirigido pela barra de progresso do ponto ativo (onAnimationEnd), então a
 * pausa e o reinício a cada troca vêm de graça do CSS.
 */
export default function SegmentsCarousel() {
  const t = useTranslations("landing.segments");
  const all = t.raw("items") as SegmentItem[];
  const items = all
    .map((it, i) => ({ it, img: IMAGES[i] ?? IMAGES[0], i }))
    .filter((x) => !HIDDEN_INDEXES.has(x.i));

  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLUListElement>(null);
  const [pages, setPages] = useState(1);
  const [active, setActive] = useState(0);
  const [inView, setInView] = useState(false);
  const [paused, setPaused] = useState(false);

  // Dispara a entrada animada uma vez, quando a seção aparece.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const metrics = useCallback(() => {
    const el = trackRef.current;
    if (!el || el.children.length < 2) return null;
    const first = el.children[0] as HTMLElement;
    const second = el.children[1] as HTMLElement;
    const step = second.offsetLeft - first.offsetLeft;
    if (step <= 0) return null;
    const gap = step - first.offsetWidth;
    const perView = Math.max(1, Math.round((el.clientWidth + gap) / step));
    return { el, step, perView, total: Math.max(1, Math.ceil(items.length / perView)) };
  }, [items.length]);

  const measure = useCallback(() => {
    const m = metrics();
    if (!m) return;
    const { el, step, perView, total } = m;
    setPages(total);
    const atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 2;
    const page = atEnd ? total - 1 : Math.min(total - 1, Math.round(el.scrollLeft / step / perView));
    setActive(page);
  }, [metrics]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    // O ResizeObserver dispara uma vez ao observar, o que faz a medida inicial.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  const goTo = (page: number) => {
    const m = metrics();
    if (!m) return;
    m.el.scrollTo({ left: page * m.perView * m.step, behavior: "smooth" });
  };

  return (
    <section
      ref={sectionRef}
      className="seg-sec py-20 bg-white"
      aria-label={t("carouselLabel")}
      data-in={inView ? "1" : undefined}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
    >
      <div className="max-w-7xl mx-auto px-6">
        <h2
          className="seg-reveal text-3xl sm:text-4xl font-extrabold text-blue-950 text-center leading-tight mb-12"
          style={{ ["--d" as string]: "0ms" }}
        >
          {t("title")}
        </h2>

        <ul
          ref={trackRef}
          onScroll={measure}
          className="flex gap-6 overflow-x-auto snap-x snap-mandatory pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map(({ it, img, i }, n) => (
            <li
              key={it.title}
              className="seg-reveal seg-card snap-start shrink-0 basis-[85%] sm:basis-[calc((100%-1.5rem)/2)] lg:basis-[calc((100%-3rem)/3)]"
              style={{ ["--d" as string]: `${140 + n * 110}ms` }}
            >
              <Link
                href="/register"
                aria-label={t("cta", { segment: it.title })}
                className="group relative block aspect-[393/340] overflow-hidden rounded-3xl"
                style={{ background: "rgb(10 26 61)" }}
              >
                <Image
                  src={img}
                  alt={it.alt}
                  fill
                  sizes="(min-width: 1024px) 380px, (min-width: 640px) 45vw, 85vw"
                  className="seg-img object-cover"
                />
                {/* degradê inferior: garante contraste do texto sobre qualquer foto */}
                <div
                  aria-hidden="true"
                  className="seg-shade absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(to top, rgba(6,16,38,0.92) 0%, rgba(6,16,38,0.6) 38%, rgba(6,16,38,0) 70%)",
                  }}
                />
                {i === 1 && (
                  <div className="absolute inset-x-4 top-4 flex flex-wrap items-center gap-2">
                    <span
                      className="inline-flex h-10 items-center justify-center rounded-lg px-3 shadow-lg"
                      style={{ background: "rgb(255 255 255)" }}
                    >
                      <Image
                        src="/Logotipo_MercadoLivre.png"
                        alt="Mercado Livre"
                        width={100}
                        height={28}
                        className="h-7 w-[100px] object-contain"
                      />
                    </span>
                    <Image
                      src="/Shein.svg"
                      alt="SHEIN"
                      width={80}
                      height={40}
                      className="h-10 w-20 rounded-lg shadow-lg"
                    />
                  </div>
                )}
                <div className="seg-text absolute inset-x-0 bottom-0 p-5 pr-16" style={{ color: "white" }}>
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
                  className="seg-arrow absolute bottom-5 right-5 flex h-8 w-8 items-center justify-center rounded-full"
                  style={{ background: "white", color: "rgb(10 26 61)" }}
                >
                  <ArrowUpRight size={16} />
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {pages > 1 && (
          <div className="seg-reveal mt-6 flex items-center justify-center gap-2" style={{ ["--d" as string]: "700ms" }}>
            {Array.from({ length: pages }, (_, p) => {
              const on = p === active;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => goTo(p)}
                  aria-label={t("pageDot", { n: p + 1 })}
                  aria-current={on}
                  className="seg-dot relative h-3 overflow-hidden rounded-full"
                  style={{
                    width: on ? 80 : 18,
                    background: "color-mix(in srgb, var(--text-subtle) 35%, transparent)",
                  }}
                >
                  {on && (
                    <span
                      // key por página: reinicia a barra a cada troca (clique, arraste ou automática)
                      key={`${p}-${pages}`}
                      className="seg-progress absolute inset-0 rounded-full"
                      data-paused={paused ? "1" : undefined}
                      style={{ animationDuration: `${AUTOPLAY_MS}ms` }}
                      onAnimationEnd={() => goTo((p + 1) % pages)}
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
