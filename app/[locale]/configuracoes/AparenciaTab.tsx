"use client";

// app/configuracoes/AparenciaTab.tsx

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Sun, Moon, PanelLeft, PanelTop, BarChart2, LineChart, PieChart,
  Zap, ZapOff, Eye, EyeOff,
} from "lucide-react";
import { Card } from "@/app/components/ui";
import { useTheme } from "@/app/hooks/useTheme";
import { useNavbarLayout } from "@/app/hooks/useNavbarLayout";
import { useReducedMotion } from "@/app/hooks/useReducedMotion";
import { useAccessibilityWidget } from "@/app/hooks/useAccessibilityWidget";
import { useLocalePreference } from "@/app/hooks/useLocalePreference";
import type { AppLocale } from "@/i18n/routing";

type ShowToast = (message: string, type?: "success" | "error" | "warning" | "info") => void;

type ChartType = "bar" | "line" | "pie";
const CHART_KEY = "dashboard_chart_type";

interface Option<T extends string> {
  value: T;
  label: string;
  icon?: React.ElementType;
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      className="flex gap-1 rounded-xl p-1"
      style={{ background: "var(--cf-input)", border: "1.5px solid var(--cf-border)" }}
    >
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer"
            style={{
              background: active ? "var(--cf-card)" : "transparent",
              color: active ? "var(--brand-500)" : "var(--cf-text-2)",
              boxShadow: active ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
            }}
          >
            {o.icon && <o.icon size={15} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Row({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div>
        <h2 className="text-sm font-bold" style={{ color: "var(--db-text)" }}>
          {title}
        </h2>
        <p className="text-xs mt-0.5" style={{ color: "var(--cf-text-3)" }}>
          {desc}
        </p>
      </div>
      {children}
    </div>
  );
}

const Divider = () => <div style={{ height: 1, background: "var(--cf-border)" }} />;

export default function AparenciaTab({ showToast }: { showToast: ShowToast }) {
  const t = useTranslations("configuracoes.aparencia");
  const { dark, setTheme } = useTheme();
  const { layout, toggle: toggleLayout } = useNavbarLayout();
  const { reduced, setReducedMotion } = useReducedMotion();
  const { enabled: a11yWidget, setEnabled: setA11yWidget } = useAccessibilityWidget();
  const { locale, locales, setLocale } = useLocalePreference();

  const [chartType, setChartType] = useState<ChartType>("bar");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CHART_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- corrige o default SSR-safe com o valor do localStorage após a hidratação
      if (saved === "bar" || saved === "line" || saved === "pie") setChartType(saved);
    } catch {
      /* ambientes sem localStorage */
    }
  }, []);

  const changeChart = (next: ChartType) => {
    setChartType(next);
    try {
      localStorage.setItem(CHART_KEY, next);
    } catch {
      /* noop */
    }
    showToast(t("chart.saved"), "success");
  };

  const changeTheme = (next: "light" | "dark") => {
    if ((next === "dark") === dark) return;
    setTheme(next === "dark");
    showToast(next === "dark" ? t("theme.toDark") : t("theme.toLight"), "success");
  };

  const changeLayout = (next: "horizontal" | "vertical") => {
    if (next === layout) return;
    toggleLayout();
    showToast(next === "vertical" ? t("menuPosition.toSide") : t("menuPosition.toTop"), "success");
  };

  const changeMotion = (next: "padrao" | "reduzido") => {
    const nextReduced = next === "reduzido";
    if (nextReduced === reduced) return;
    setReducedMotion(nextReduced);
    showToast(nextReduced ? t("motion.toReduced") : t("motion.toDefault"), "success");
  };

  const changeA11yWidget = (next: "ativado" | "desativado") => {
    const on = next === "ativado";
    if (on === a11yWidget) return;
    setA11yWidget(on);
    showToast(on ? t("a11yWidget.toOn") : t("a11yWidget.toOff"), "success");
  };

  const LOCALE_LABEL: Record<AppLocale, string> = {
    "pt-BR": "Português",
    en: "English",
    es: "Español",
  };

  return (
    <Card padding="lg" className="space-y-6">
      <Row title={t("theme.title")} desc={t("thisDevice")}>
        <Segmented
          value={dark ? "dark" : "light"}
          onChange={changeTheme}
          options={[
            { value: "light", label: t("theme.light"), icon: Sun },
            { value: "dark", label: t("theme.dark"), icon: Moon },
          ]}
        />
      </Row>

      <Divider />

      <Row title={t("menuPosition.title")} desc={t("menuPosition.desc")}>
        <Segmented
          value={layout}
          onChange={changeLayout}
          options={[
            { value: "horizontal", label: t("menuPosition.top"), icon: PanelTop },
            { value: "vertical", label: t("menuPosition.side"), icon: PanelLeft },
          ]}
        />
      </Row>

      <Divider />

      <Row title={t("motion.title")} desc={t("motion.desc")}>
        <Segmented
          value={reduced ? "reduzido" : "padrao"}
          onChange={changeMotion}
          options={[
            { value: "padrao", label: t("motion.default"), icon: Zap },
            { value: "reduzido", label: t("motion.reduced"), icon: ZapOff },
          ]}
        />
      </Row>

      <Divider />

      <Row title={t("a11yWidget.title")} desc={t("a11yWidget.desc")}>
        <Segmented
          value={a11yWidget ? "ativado" : "desativado"}
          onChange={changeA11yWidget}
          options={[
            { value: "ativado", label: t("a11yWidget.on"), icon: Eye },
            { value: "desativado", label: t("a11yWidget.off"), icon: EyeOff },
          ]}
        />
      </Row>

      <Divider />

      <Row title={t("language.title")} desc={t("language.desc")}>
        <Segmented
          value={locale}
          onChange={(next) => {
            if (next === locale) return;
            showToast(t("language.changed"), "success");
            setLocale(next as AppLocale);
          }}
          options={locales.map((l) => ({ value: l, label: LOCALE_LABEL[l] ?? l }))}
        />
      </Row>

      <Divider />

      <Row title={t("chart.title")} desc={t("chart.desc")}>
        <Segmented
          value={chartType}
          onChange={changeChart}
          options={[
            { value: "bar", label: t("chart.bar"), icon: BarChart2 },
            { value: "line", label: t("chart.line"), icon: LineChart },
            { value: "pie", label: t("chart.pie"), icon: PieChart },
          ]}
        />
      </Row>
    </Card>
  );
}
