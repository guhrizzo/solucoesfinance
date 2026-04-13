"use client";

import { useState, useEffect } from "react";

type NavbarLayout = "horizontal" | "vertical";

export function useNavbarLayout() {
  const [layout, setLayout] = useState<NavbarLayout>("horizontal");
  const [mounted, setMounted] = useState(false);

  // Carrega a preferência do localStorage
  useEffect(() => {
    const savedLayout = localStorage.getItem("nexusfi-navbar-layout") as NavbarLayout | null;
    if (savedLayout && (savedLayout === "horizontal" || savedLayout === "vertical")) {
      setLayout(savedLayout);
    }
    setMounted(true);
  }, []);

  // Alterna o layout
  const toggle = () => {
    const newLayout: NavbarLayout = layout === "horizontal" ? "vertical" : "horizontal";
    setLayout(newLayout);
    localStorage.setItem("nexusfi-navbar-layout", newLayout);
  };

  return { layout, toggle, mounted };
}
