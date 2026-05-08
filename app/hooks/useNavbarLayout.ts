"use client";

import { useState } from "react";

type NavbarLayout = "horizontal" | "vertical";

export function useNavbarLayout() {
  const [layout, setLayout] = useState<NavbarLayout>(() => {
    if (typeof window === "undefined") return "horizontal";
    const saved = localStorage.getItem("nexusfi-navbar-layout") as NavbarLayout | null;
    return saved === "horizontal" || saved === "vertical" ? saved : "horizontal";
  });

  const toggle = () => {
    const next: NavbarLayout = layout === "horizontal" ? "vertical" : "horizontal";
    setLayout(next);
    localStorage.setItem("nexusfi-navbar-layout", next);
  };

  return { layout, toggle };
}