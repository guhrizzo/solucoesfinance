"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Keep in sync with the internalPrefixes list in the inline script in
// layout.tsx (that copy provides the pre-hydration value for the first paint;
// this one keeps data-has-nav correct across client-side <Link> navigation,
// which the inline script — it only runs once, on document load — can't see).
const INTERNAL_PREFIXES = [
  "/dashboard",
  "/fluxo-caixa",
  "/contasPagar",
  "/contasReceber",
  "/costCenter",
  "/estoque",
  "/vendas",
  "/impostos",
  "/relatorios",
];

/**
 * Applies the content offset for the vertical navbar layout purely via CSS
 * (see html[data-nav-layout="vertical"][data-has-nav="1"] .app-shell in
 * globals.css), replacing the previous approach of a MutationObserver
 * injecting inline marginLeft on every direct child of <body>.
 *
 * This intentionally does NOT read useNavbarLayout() to decide whether to
 * render the offset itself: the offset is driven by the data-nav-layout
 * attribute the inline script in layout.tsx sets on <html> before hydration,
 * so it's correct on first paint with no flash and no server/client render
 * mismatch. What this component does own is data-has-nav — whether the
 * *current route* renders Navbar's sidebar at all — since that depends on
 * the pathname, which can change via client-side navigation without the
 * pre-hydration script ever running again.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    const hasNav = INTERNAL_PREFIXES.some((p) => pathname.startsWith(p));
    document.documentElement.setAttribute("data-has-nav", hasNav ? "1" : "0");
  }, [pathname]);

  return <div className="app-shell">{children}</div>;
}
