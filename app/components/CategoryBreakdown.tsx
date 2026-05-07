// ─── CategoryBreakdown.tsx - Exibir categorias de um centro ─────────────────

"use client";

import React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { CostCenterExpanded, CategorySpend } from "@/lib/cost-center-categories";

interface CategoryBreakdownProps {
  center: CostCenterExpanded;
  isExpanded: boolean;
  onToggle: () => void;
}

export default function CategoryBreakdown({ center, isExpanded, onToggle }: CategoryBreakdownProps) {
  const categories = center.categories || [];
  const totalSpent = categories.reduce((sum, cat) => sum + cat.spent, 0);
  
  // Apenas mostrar categorias com gasto
  const withSpend = categories.filter(cat => cat.spent > 0);
  const empty = categories.length - withSpend.length;

  if (totalSpent === 0) return null; // Não mostrar se sem gastos

  return (
    <div className="mt-3 border-t" style={{ borderColor: "var(--db-border)" }}>
      <button
        onClick={onToggle}
        className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-semibold hover:bg-opacity-50 transition-all"
        style={{ color: "var(--db-text2)", background: "var(--db-sub)" }}
      >
        <span>Breakdown por categoria ({withSpend.length}/{categories.length})</span>
        {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {isExpanded && (
        <div className="p-3 space-y-2">
          {withSpend.length > 0 ? (
            withSpend.map((cat) => {
              const pct = totalSpent > 0 ? (cat.spent / totalSpent) * 100 : 0;
              const color = cat.color || "#6b7280";
              return (
                <div key={cat.id} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold" style={{ color: "var(--db-text)" }}>
                        {cat.name}
                      </span>
                      <span className="text-xs mono font-bold" style={{ color: "var(--db-text2)" }}>
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "var(--db-border)" }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min(pct, 100)}%`, background: color, opacity: 0.7 }}
                      />
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: "var(--db-text3)" }}>
                      R$ {cat.spent.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-xs text-center" style={{ color: "var(--db-text3)" }}>
              Nenhuma categoria com gastos registrados
            </p>
          )}
          {empty > 0 && (
            <p className="text-xs px-2 py-1 rounded text-center" style={{ background: "var(--db-input)", color: "var(--db-text3)" }}>
              +{empty} categorias sem movimento
            </p>
          )}
        </div>
      )}
    </div>
  );
}