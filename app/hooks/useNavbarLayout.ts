"use client";

import { useState, useEffect, useRef } from "react";

type NavbarLayout = "horizontal" | "vertical";

const ATTR = "data-nav-layout";
const STORAGE_KEY = "nexusfi-navbar-layout";

function readSaved(): NavbarLayout {
  const attr = document.documentElement.getAttribute(ATTR) as NavbarLayout | null;
  if (attr === "horizontal" || attr === "vertical") return attr;
  const saved = localStorage.getItem(STORAGE_KEY) as NavbarLayout | null;
  return saved === "horizontal" || saved === "vertical" ? saved : "horizontal";
}

/**
 * Multiple components (Navbar, AppShell) read this hook independently. To keep
 * every instance in sync — mirroring the useTheme pattern — the source of truth
 * is a DOM attribute on <html>, watched via MutationObserver, instead of only
 * local React state.
 *
 * The initial state is always "horizontal", matching what the server (which has
 * no access to localStorage) renders. Reading the saved value synchronously during
 * the first client render — as this used to do — makes that first render diverge
 * from the server-rendered HTML for any user with "vertical" saved, which React
 * reports as a hydration mismatch and reacts to by discarding and re-rendering the
 * affected subtree on the client. The real value is applied in the mount effect
 * below, after hydration has already reconciled against the SSR-safe default.
 */
export function useNavbarLayout() {
  const [layout, setLayout] = useState<NavbarLayout>("horizontal");
  const internalChangeRef = useRef(false);

  useEffect(() => {
    const saved = readSaved();
    document.documentElement.setAttribute(ATTR, saved);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: corrects the SSR-safe "horizontal" default to the saved value once we're past hydration, not a computation that belongs in render
    setLayout(saved);
  }, []);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      if (internalChangeRef.current) {
        internalChangeRef.current = false;
        return;
      }
      const next = document.documentElement.getAttribute(ATTR) as NavbarLayout | null;
      if (next === "horizontal" || next === "vertical") setLayout(next);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: [ATTR] });
    return () => observer.disconnect();
  }, []);

  const toggle = () => {
    const next: NavbarLayout = layout === "horizontal" ? "vertical" : "horizontal";
    internalChangeRef.current = true;
    document.documentElement.setAttribute(ATTR, next);
    localStorage.setItem(STORAGE_KEY, next);
    setLayout(next);
  };

  return { layout, toggle };
}
