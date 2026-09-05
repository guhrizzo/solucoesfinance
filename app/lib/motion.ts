// ────────────────────────────────────────────────────────────────────
// Rolagem suave forçada por JS
// ────────────────────────────────────────────────────────────────────
// Quando o SO/navegador está em "desempenho melhorado" / "reduzir
// animações" (prefers-reduced-motion: reduce), o navegador IGNORA
// `scroll-behavior: smooth` e trata todo `behavior: "smooth"` como
// `"auto"` (salto instantâneo). O usuário pediu explicitamente para
// manter a suavização — então animamos o scroll na mão, com
// requestAnimationFrame, sem depender daquela configuração.

const DEFAULT_DURATION = 620; // ms

let currentAnimation = 0;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

/** Cancela qualquer animação de scroll em andamento (ex.: o usuário mexeu na roda). */
export function cancelSmoothScroll(): void {
  currentAnimation++;
}

/** Anima o scroll da janela até `targetY` (px), respeitando os limites do documento. */
export function smoothScrollTo(
  targetY: number,
  duration = DEFAULT_DURATION,
): void {
  if (typeof window === "undefined") return;

  const startY = window.scrollY;
  const maxY = Math.max(
    0,
    document.documentElement.scrollHeight - window.innerHeight,
  );
  const endY = clamp(targetY, 0, maxY);
  const distance = endY - startY;

  const id = ++currentAnimation;

  if (Math.abs(distance) < 2 || duration <= 0) {
    window.scrollTo(0, endY);
    return;
  }

  const startTime = performance.now();

  const step = (now: number) => {
    if (id !== currentAnimation) return; // outro scroll assumiu o controle
    const progress = clamp((now - startTime) / duration, 0, 1);
    window.scrollTo(0, startY + distance * easeInOutCubic(progress));
    if (progress < 1) requestAnimationFrame(step);
  };

  requestAnimationFrame(step);
}

/**
 * Rola até um elemento, compensando o `scroll-margin-top` computado
 * (mesma semântica do scroll nativo) mais um `extraOffset` opcional.
 */
export function smoothScrollToElement(
  el: Element,
  extraOffset = 0,
  duration = DEFAULT_DURATION,
): void {
  if (typeof window === "undefined") return;
  const marginTop =
    parseFloat(getComputedStyle(el).scrollMarginTop || "0") || 0;
  const top =
    el.getBoundingClientRect().top + window.scrollY - marginTop - extraOffset;
  smoothScrollTo(top, duration);
}

// ────────────────────────────────────────────────────────────────────
// Instalação global (chamada uma vez, pelo <ForceMotion/>)
// ────────────────────────────────────────────────────────────────────

const CANCEL_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  " ",
  "Spacebar",
]);

function isSmoothOptions(arg: unknown): arg is ScrollToOptions {
  return (
    typeof arg === "object" &&
    arg !== null &&
    (arg as ScrollToOptions).behavior === "smooth"
  );
}

/**
 * Faz o navegador voltar a suavizar rolagem mesmo sob reduce-motion:
 * substitui `scroll-behavior` por controle nosso, intercepta
 * `window.scrollTo` / `scrollIntoView` com `behavior: "smooth"` e as
 * âncoras internas (`<a href="#id">`). Retorna a função de limpeza.
 */
export function installForcedSmoothScroll(): () => void {
  if (typeof window === "undefined") return () => {};

  const htmlStyle = document.documentElement.style;
  const prevScrollBehavior = htmlStyle.scrollBehavior;
  htmlStyle.scrollBehavior = "auto";

  const nativeScrollTo = window.scrollTo.bind(window);
  const nativeScroll = window.scroll.bind(window);
  const nativeScrollIntoView = Element.prototype.scrollIntoView;

  const patchedScrollTo = ((
    xOrOptions?: number | ScrollToOptions,
    y?: number,
  ) => {
    if (isSmoothOptions(xOrOptions)) {
      smoothScrollTo(xOrOptions.top ?? window.scrollY);
      return;
    }
    nativeScrollTo(xOrOptions as number, y as number);
  }) as typeof window.scrollTo;

  window.scrollTo = patchedScrollTo;
  window.scroll = patchedScrollTo as typeof window.scroll;

  Element.prototype.scrollIntoView = function patchedScrollIntoView(
    this: Element,
    arg?: boolean | ScrollIntoViewOptions,
  ) {
    if (typeof arg === "object" && arg !== null && arg.behavior === "smooth") {
      const rect = this.getBoundingClientRect();
      const block = arg.block ?? "start";
      let top = rect.top + window.scrollY;
      if (block === "center") top -= (window.innerHeight - rect.height) / 2;
      else if (block === "end") top -= window.innerHeight - rect.height;
      const marginTop =
        parseFloat(getComputedStyle(this).scrollMarginTop || "0") || 0;
      smoothScrollTo(top - marginTop);
      return;
    }
    return nativeScrollIntoView.call(this, arg as ScrollIntoViewOptions);
  };

  const onClick = (e: MouseEvent) => {
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    )
      return;
    const link = (e.target as HTMLElement | null)?.closest?.(
      'a[href*="#"]',
    ) as HTMLAnchorElement | null;
    if (!link || link.target === "_blank") return;

    const url = new URL(link.href, location.href);
    if (url.pathname !== location.pathname || url.search !== location.search)
      return; // navegação para outra página — deixa o router agir

    const id = decodeURIComponent(url.hash.slice(1));
    if (id) {
      const target = document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      // Se a seção-alvo ainda está "escondida" por uma animação de reveal
      // (opacity/blur/translateY inline), revela antes de medir — assim o
      // deep-link chega no ponto certo e a seção aparece na hora.
      const el = target as HTMLElement;
      if (el.style.opacity === "0") {
        // `transition: none` para o reveal valer na hora — senão o
        // getBoundingClientRect() a seguir mede a posição no meio da
        // animação de transform e o scroll erra o alvo.
        el.style.transition = "none";
        el.style.opacity = "1";
        el.style.filter = "none";
        el.style.transform = "none";
      }
      history.pushState(null, "", url.hash);
      smoothScrollToElement(target);
      // Navegação nativa por âncora move o foco pro alvo quando ele é
      // focável (essencial pro skip link — sem isso a rolagem acontece
      // mas quem usa teclado/leitor de tela continua "parado" no link).
      // `e.preventDefault()` acima suprime esse comportamento padrão do
      // navegador, então repomos aqui. Alvo sem tabindex/foco nativo: no-op.
      target.focus({ preventScroll: true });
    } else {
      e.preventDefault();
      history.pushState(null, "", url.pathname + url.search);
      smoothScrollTo(0);
    }
  };

  const onWheel = () => cancelSmoothScroll();
  const onTouchStart = () => cancelSmoothScroll();
  const onKeyDown = (e: KeyboardEvent) => {
    if (CANCEL_KEYS.has(e.key)) cancelSmoothScroll();
  };

  document.addEventListener("click", onClick);
  window.addEventListener("wheel", onWheel, { passive: true });
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("keydown", onKeyDown);

  return () => {
    htmlStyle.scrollBehavior = prevScrollBehavior;
    window.scrollTo = nativeScrollTo as typeof window.scrollTo;
    window.scroll = nativeScroll as typeof window.scroll;
    Element.prototype.scrollIntoView = nativeScrollIntoView;
    document.removeEventListener("click", onClick);
    window.removeEventListener("wheel", onWheel);
    window.removeEventListener("touchstart", onTouchStart);
    window.removeEventListener("keydown", onKeyDown);
  };
}
