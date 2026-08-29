"use client";

// app/configuracoes/AparenciaTab.tsx

import { useEffect, useState } from "react";
import { Sun, Moon, PanelLeft, PanelTop, BarChart2, LineChart, PieChart } from "lucide-react";
import { Card } from "../components/ui";
import { useTheme } from "../hooks/useTheme";
import { useNavbarLayout } from "../hooks/useNavbarLayout";

type ShowToast = (message: string, type?: "success" | "error" | "warning" | "info") => void;

type ChartType = "bar" | "line" | "pie";
const CHART_KEY = "dashboard_chart_type";

interface Option<T extends string> {
  value: T;
  label: string;
  icon: React.ElementType;
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
            <o.icon size={15} />
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
        <h3 className="text-sm font-bold" style={{ color: "var(--db-text)" }}>
          {title}
        </h3>
        <p className="text-xs mt-0.5" style={{ color: "var(--cf-text-3)" }}>
          {desc}
        </p>
      </div>
      {children}
    </div>
  );
}

export default function AparenciaTab({ showToast }: { showToast: ShowToast }) {
  const { dark, setTheme } = useTheme();
  const { layout, toggle: toggleLayout } = useNavbarLayout();

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

  const changeChart = (t: ChartType) => {
    setChartType(t);
    try {
      localStorage.setItem(CHART_KEY, t);
    } catch {
      /* noop */
    }
    showToast("Preferência de gráfico salva.", "success");
  };

  const changeTheme = (next: "light" | "dark") => {
    if ((next === "dark") === dark) return;
    setTheme(next === "dark");
    showToast(next === "dark" ? "Modo escuro ativado." : "Modo claro ativado.", "success");
  };

  const changeLayout = (next: "horizontal" | "vertical") => {
    if (next === layout) return;
    toggleLayout();
    showToast(
      next === "vertical" ? "Menu lateral ativado." : "Menu no topo ativado.",
      "success"
    );
  };

  return (
    <Card padding="lg" className="space-y-6">
      <Row title="Tema" desc="Vale para este dispositivo.">
        <Segmented
          value={dark ? "dark" : "light"}
          onChange={changeTheme}
          options={[
            { value: "light", label: "Claro", icon: Sun },
            { value: "dark", label: "Escuro", icon: Moon },
          ]}
        />
      </Row>

      <div style={{ height: 1, background: "var(--cf-border)" }} />

      <Row title="Posição do menu" desc="Barra de navegação no topo ou na lateral esquerda.">
        <Segmented
          value={layout}
          onChange={changeLayout}
          options={[
            { value: "horizontal", label: "Topo", icon: PanelTop },
            { value: "vertical", label: "Lateral", icon: PanelLeft },
          ]}
        />
      </Row>

      <div style={{ height: 1, background: "var(--cf-border)" }} />

      <Row
        title="Gráfico padrão do dashboard"
        desc='Estilo inicial do gráfico "Receita vs. Despesas".'
      >
        <Segmented
          value={chartType}
          onChange={changeChart}
          options={[
            { value: "bar", label: "Barras", icon: BarChart2 },
            { value: "line", label: "Linha", icon: LineChart },
            { value: "pie", label: "Pizza", icon: PieChart },
          ]}
        />
      </Row>
    </Card>
  );
}
