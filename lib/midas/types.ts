// lib/midas/types.ts
// Tipos da demonstração guiada do Midas (landing).

export type Segment = "loja" | "ecommerce" | "servicos" | "industria" | "distribuidora" | "outro";
export type Pain = "financeiro" | "contas" | "estoque" | "vendas" | "impostos" | "relatorios" | "canais" | "tudo";
export type Tool = "planilha" | "caderno" | "sistema" | "app_banco" | "memoria" | "contagem" | "marketplace" | "nenhum";

export type StepId =
  | "welcome"
  | "name"
  | "segment"
  | "pain"
  | "tool"
  | "deepen"
  | "diagnosis"
  | "modules"
  | "confirm"
  | "doubts"
  | "cta";

export interface Context {
  name?: string;
  segment?: Segment;
  pain?: Pain;
  tool?: Tool;
  visibilityGap?: boolean;
  interestedModules: string[];
  doubts: string[];
  retry?: boolean;
}

export interface Lead {
  sessionId: string;
  locale: string;
  name?: string;
  segment?: Segment;
  mainPain?: Pain;
  currentTools: string[];
  painPoints: string[];
  interestedModules: string[];
  transcript: { role: "user" | "bot"; text: string; ts: number }[];
  status: "started" | "in_progress" | "completed" | "converted";
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
  expiresAt: number;
  startedTrial: boolean;
  convertedUid?: string;
  consent: { accepted: boolean; version: string };
}
