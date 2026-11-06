// lib/midas/flow.ts
// Motor do fluxo conversacional do Midas: puro, sem I/O nem React.
import { interpret } from "@/lib/midas/interpret.ts";
import { modulesForPain } from "@/lib/midas/modules.ts";
import type { Context, Pain, Segment, StepId, Tool } from "@/lib/midas/types.ts";

export type { StepId } from "@/lib/midas/types.ts";

export interface MidasState {
  step: StepId;
  ctx: Context;
  history: StepId[];
  consented: boolean;
  /** true logo após o visitante pedir a visão geral na recepção. */
  overview?: boolean;
}

export interface Answer {
  chip?: string;
  text?: string;
}

const SEGMENTS: Segment[] = ["loja", "ecommerce", "servicos", "industria", "distribuidora", "outro"];
const PAINS: Pain[] = ["financeiro", "contas", "estoque", "vendas", "impostos", "relatorios", "canais", "tudo"];
const TOOLS: Tool[] = ["planilha", "caderno", "sistema", "app_banco", "memoria", "contagem", "marketplace", "nenhum"];
const STEPS: StepId[] = ["welcome", "name", "segment", "pain", "tool", "deepen", "diagnosis", "modules", "confirm", "doubts", "cta"];
/** Etapas principais, na ordem; "doubts" conta como "confirm". */
const MAIN: StepId[] = ["welcome", "name", "segment", "pain", "tool", "deepen", "diagnosis", "modules", "confirm", "cta"];
const MAX_DOUBTS = 10;
const MAX_TEXT = 200;

const TOOL_CHIPS: Record<string, Tool[]> = {
  financeiro: ["planilha", "caderno", "sistema", "app_banco", "nenhum"],
  estoque: ["planilha", "contagem", "memoria", "sistema", "nenhum"],
  vendas: ["planilha", "marketplace", "sistema", "nenhum"],
  canais: ["planilha", "marketplace", "sistema", "nenhum"],
};

export function initialState(): MidasState {
  return { step: "welcome", ctx: { interestedModules: [], doubts: [] }, history: [], consented: false };
}

export function chipsFor(state: MidasState): string[] {
  switch (state.step) {
    case "welcome": return ["start", "overview"];
    case "name": return ["skip"];
    case "segment": return [...SEGMENTS];
    case "pain": return [...PAINS];
    case "tool": return [...(TOOL_CHIPS[state.ctx.pain ?? ""] ?? ["planilha", "sistema", "nenhum"])];
    case "deepen":
    case "diagnosis":
    case "modules": return ["continue"];
    case "confirm":
    case "doubts": return ["yes", "more", "doubts"];
    default: return [];
  }
}

export function progress(state: MidasState): number {
  const step = state.step === "doubts" ? "confirm" : state.step;
  return MAIN.indexOf(step) / (MAIN.length - 1);
}

/** Primeira pergunta de slot ainda sem resposta; se todas respondidas, "deepen". */
function nextOpen(ctx: Context): StepId {
  if (!ctx.segment) return "segment";
  if (!ctx.pain) return "pain";
  if (!ctx.tool) return "tool";
  return "deepen";
}

function moveTo(state: MidasState, step: StepId, ctx: Context): MidasState {
  const next: MidasState = { ...state, step, ctx: { ...ctx }, history: [...state.history, state.step], overview: undefined };
  delete next.ctx.retry;
  if (step === "modules") next.ctx.interestedModules = ctx.pain ? modulesForPain(ctx.pain) : [];
  if (next.overview === undefined) delete next.overview;
  return next;
}

function stay(state: MidasState, ctx: Context = state.ctx, retry = false): MidasState {
  const next: MidasState = { ...state, ctx: { ...ctx } };
  delete next.overview;
  if (retry) next.ctx.retry = true;
  else delete next.ctx.retry;
  return next;
}

/** Preenche os slots que o texto/chip revelar, sem sobrescrever a etapa de nome. */
function fillSlots(ctx: Context, chip: string | undefined, text: string): { ctx: Context; found: boolean } {
  const out: Context = { ...ctx };
  let found = false;
  if (chip) {
    if ((SEGMENTS as string[]).includes(chip)) { out.segment = chip as Segment; found = true; }
    else if ((PAINS as string[]).includes(chip)) { out.pain = chip as Pain; found = true; }
    else if ((TOOLS as string[]).includes(chip)) { out.tool = chip as Tool; found = true; }
    return { ctx: out, found };
  }
  const r = interpret(text);
  if (r.segment) { out.segment = r.segment; found = true; }
  if (r.pain) { out.pain = r.pain; found = true; }
  if (r.tool) { out.tool = r.tool; found = true; }
  if (r.visibilityGap) { out.visibilityGap = true; found = true; }
  return { ctx: out, found };
}

export function applyAnswer(state: MidasState, answer: Answer): MidasState {
  const chip = answer.chip;
  const text = (answer.text ?? "").slice(0, 800);
  const r = chip ? null : interpret(text);
  if (!chip && r!.empty) return stay(state, state.ctx, state.step !== "cta");

  switch (state.step) {
    case "welcome": {
      if (chip === "overview" || (!chip && r!.wantsOverview)) return { ...stay(state), overview: true };
      const { ctx } = fillSlots(state.ctx, undefined, chip ? "" : text);
      return { ...moveTo(state, "name", ctx), consented: true };
    }
    case "name": {
      if (chip === "skip") return moveTo(state, nextOpen(state.ctx), state.ctx);
      if (chip) return stay(state, state.ctx, true);
      const { ctx, found } = fillSlots(state.ctx, undefined, text);
      if (found) return moveTo(state, nextOpen(ctx), ctx);
      return moveTo(state, nextOpen(ctx), { ...ctx, name: text.trim().slice(0, 40) });
    }
    case "segment":
    case "pain":
    case "tool": {
      const { ctx, found } = fillSlots(state.ctx, chip, text);
      const target = nextOpen(ctx);
      const slot = state.step as "segment" | "pain" | "tool";
      // Só avança se a pergunta atual foi respondida (nunca pula segment/pain).
      if (!found || !ctx[slot]) return stay(state, ctx, true);
      return moveTo(state, target, ctx);
    }
    case "deepen": {
      const { ctx } = fillSlots(state.ctx, undefined, chip ? "" : text);
      return moveTo(state, "diagnosis", ctx);
    }
    case "diagnosis":
      return moveTo(state, "modules", state.ctx);
    case "modules":
      return moveTo(state, "confirm", state.ctx);
    case "confirm":
    case "doubts": {
      if (chip === "yes" || r?.yes) return moveTo({ ...state, step: "confirm" }, "cta", state.ctx);
      if (chip === "more") return moveTo({ ...state, step: "confirm" }, "modules", state.ctx);
      if (chip === "doubts" || r?.no) return stay({ ...state, step: "confirm" });
      const doubts = [...state.ctx.doubts, text.trim().slice(0, MAX_TEXT)].slice(0, MAX_DOUBTS);
      return stay({ ...state, step: "confirm" }, { ...state.ctx, doubts });
    }
    default:
      return state;
  }
}

/** Slots (campos do contexto) que pertencem a cada etapa. */
function clearFrom(ctx: Context, step: StepId): Context {
  const out: Context = { ...ctx };
  delete out.retry;
  const i = MAIN.indexOf(step === "doubts" ? "confirm" : step);
  if (i <= MAIN.indexOf("name")) delete out.name;
  if (i <= MAIN.indexOf("segment")) delete out.segment;
  if (i <= MAIN.indexOf("pain")) { delete out.pain; delete out.visibilityGap; }
  if (i <= MAIN.indexOf("tool")) delete out.tool;
  if (i <= MAIN.indexOf("modules")) out.interestedModules = [];
  if (i <= MAIN.indexOf("confirm")) out.doubts = [];
  return out;
}

export function goBack(state: MidasState): MidasState {
  if (!state.history.length) return state;
  const history = state.history.slice(0, -1);
  const step = state.history[state.history.length - 1];
  return { step, ctx: clearFrom(state.ctx, step), history, consented: state.consented };
}

export function serialize(state: MidasState): string {
  return JSON.stringify(state);
}

const isStr = (v: unknown): v is string => typeof v === "string";
const strList = (v: unknown): string[] | null =>
  Array.isArray(v) && v.every(isStr) ? v.slice(0, MAX_DOUBTS * 3).map((s) => s.slice(0, MAX_TEXT)) : null;

export function deserialize(raw: string): MidasState | null {
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object" || !o.ctx || typeof o.ctx !== "object") return null;
    if (!STEPS.includes(o.step) || typeof o.consented !== "boolean") return null;
    if (!Array.isArray(o.history) || !o.history.every((h: unknown) => STEPS.includes(h as StepId))) return null;
    const c = o.ctx;
    const interestedModules = strList(c.interestedModules);
    const doubts = strList(c.doubts);
    if (!interestedModules || !doubts) return null;
    if (c.segment !== undefined && !SEGMENTS.includes(c.segment)) return null;
    if (c.pain !== undefined && !PAINS.includes(c.pain)) return null;
    if (c.tool !== undefined && !TOOLS.includes(c.tool)) return null;
    if (c.name !== undefined && !isStr(c.name)) return null;
    if (c.visibilityGap !== undefined && typeof c.visibilityGap !== "boolean") return null;
    const ctx: Context = { interestedModules, doubts: doubts.slice(0, MAX_DOUBTS) };
    if (c.name !== undefined) ctx.name = c.name.slice(0, 40);
    if (c.segment) ctx.segment = c.segment;
    if (c.pain) ctx.pain = c.pain;
    if (c.tool) ctx.tool = c.tool;
    if (c.visibilityGap !== undefined) ctx.visibilityGap = c.visibilityGap;
    if (c.retry === true) ctx.retry = true;
    const state: MidasState = { step: o.step, ctx, history: o.history.slice(-30), consented: o.consented };
    if (o.overview === true) state.overview = true;
    return state;
  } catch {
    return null;
  }
}
