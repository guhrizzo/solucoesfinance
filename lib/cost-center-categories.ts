// ─── Types para categorias dentro de centros de custo ──────────────────────

export interface CategorySpend {
  id: string; // auto-generated
  name: string; // "Alimentação", "Transporte", etc
  spent: number; // total gasto nesta categoria
  color?: string;
}

export interface CostCenterExpanded {
  id: string;
  name: string;
  budget: number;
  spent: number; // total gasto em todas as categorias
  employees: number;
  color: string;
  userId: string;
  createdAt: any;
  categories?: CategorySpend[]; // Nova estrutura aninhada
}

export interface ExpenseWithCategory {
  id: string;
  category: string; // ex: "Alimentação"
  subcategory?: string; // ex: "Almoço" (opcional)
  center: string;
  amount: number;
  date: string;
  status: "pago" | "pendente" | "agendado";
  description?: string;
  userId: string;
  createdAt: any;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

export const EXPENSE_CATEGORIES = [
  "Alimentação",
  "Transporte",
  "Hospedagem",
  "Comunicação",
  "Equipamentos",
  "Consultoria",
  "Treinamento",
  "Marketing",
  "Utilities",
  "Manutenção",
  "Outros",
];

export const CATEGORY_COLORS: Record<string, string> = {
  "Alimentação": "#f97316",
  "Transporte": "#06b6d4",
  "Hospedagem": "#ec4899",
  "Comunicação": "#8b5cf6",
  "Equipamentos": "#10b981",
  "Consultoria": "#3b82f6",
  "Treinamento": "#f59e0b",
  "Marketing": "#ef4444",
  "Utilities": "#6366f1",
  "Manutenção": "#14b8a6",
  "Outros": "#6b7280",
};

/**
 * Inicializa um centro de custo com categorias vazias
 */
export function initCostCenterWithCategories(
  centerData: Omit<CostCenterExpanded, "categories">
): CostCenterExpanded {
  return {
    ...centerData,
    categories: EXPENSE_CATEGORIES.map((name, idx) => ({
      id: `cat_${Date.now()}_${idx}`,
      name,
      spent: 0,
      color: CATEGORY_COLORS[name],
    })),
  };
}

/**
 * Adiciona gasto a uma categoria específica de um centro
 */
export function addSpendToCategory(
  center: CostCenterExpanded,
  categoryName: string,
  amount: number
): CostCenterExpanded {
  const categories = center.categories?.map((cat) =>
    cat.name === categoryName
      ? { ...cat, spent: cat.spent + amount }
      : cat
  ) || [];

  const newSpent = categories.reduce((sum, cat) => sum + cat.spent, 0);

  return {
    ...center,
    spent: newSpent,
    categories,
  };
}

/**
 * Remove gasto de uma categoria
 */
export function removeSpendFromCategory(
  center: CostCenterExpanded,
  categoryName: string,
  amount: number
): CostCenterExpanded {
  const categories = center.categories?.map((cat) =>
    cat.name === categoryName
      ? { ...cat, spent: Math.max(0, cat.spent - amount) }
      : cat
  ) || [];

  const newSpent = categories.reduce((sum, cat) => sum + cat.spent, 0);

  return {
    ...center,
    spent: newSpent,
    categories,
  };
}

/**
 * Calcula percentual de uso de uma categoria
 */
export function getCategoryUtilization(
  category: CategorySpend,
  centerBudget: number,
  categoryBudget?: number
): number {
  const budget = categoryBudget || centerBudget / (12); // Divide orçamento entre 12 categorias padrão
  return budget > 0 ? (category.spent / budget) * 100 : 0;
}

/**
 * Map de categoria de cashflow para categoria de despesa
 */
export function mapCashflowToCostCategory(cashflowCategory: string): string {
  const l = cashflowCategory.toLowerCase();
  
  if (l.includes("almoço") || l.includes("almoco") || l.includes("alimento") || l.includes("refeição") || l.includes("refeicao") || l.includes("restaurante")) {
    return "Alimentação";
  }
  if (l.includes("uber") || l.includes("táxi") || l.includes("taxi") || l.includes("combustível") || l.includes("combustivel") || l.includes("passagem")) {
    return "Transporte";
  }
  if (l.includes("hotel") || l.includes("hospedagem") || l.includes("hostel") || l.includes("airbnb")) {
    return "Hospedagem";
  }
  if (l.includes("telefone") || l.includes("internet") || l.includes("whatsapp") || l.includes("sms")) {
    return "Comunicação";
  }
  if (l.includes("notebook") || l.includes("pc") || l.includes("computador") || l.includes("mouse") || l.includes("teclado")) {
    return "Equipamentos";
  }
  if (l.includes("consultoria") || l.includes("consultora") || l.includes("contador") || l.includes("advogado")) {
    return "Consultoria";
  }
  if (l.includes("curso") || l.includes("treinamento") || l.includes("certificado") || l.includes("workshop")) {
    return "Treinamento";
  }
  if (l.includes("marketing") || l.includes("anúncio") || l.includes("anuncio") || l.includes("publicidade")) {
    return "Marketing";
  }
  if (l.includes("energia") || l.includes("água") || l.includes("agua") || l.includes("gás") || l.includes("aluguel")) {
    return "Utilities";
  }
  if (l.includes("reparo") || l.includes("manutenção") || l.includes("manutencao") || l.includes("conserto")) {
    return "Manutenção";
  }
  
  return "Outros";
}