// lib/rh/server.ts
// Infra comum das rotas /api/rh/**: autorização (permissão "rh" + plano Pro),
// rate limit, carimbo do ator, log de acesso/alteração (LGPD), apuração do
// custo de uma competência e o lançamento dele nos centros de custo.
// SOMENTE servidor.

import { NextResponse } from "next/server";
import { type Firestore } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { requireScope, isScopeError, type ApiScope } from "@/lib/apiScope";
import type { PermissionKey } from "@/lib/accountScope";
import { createHash, timingSafeEqual } from "node:crypto";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { isProAccess } from "@/lib/billing";
import { resolveScopeSubscription } from "@/lib/scopeSubscription";
import { calcularCustoMes, r2, type BeneficioVig, type CustoMes, type Vinculo } from "./custo";
import { diasAtivos, type Vigencia } from "./vigencia";
import { ratear, type DadosAlocacao, type Rateio } from "./alocacao";
import { monthOf, nextComp, todayKey } from "./datas";
import { apurarComissoes, type ResultadoComissao } from "./comissaoServer";
import { salariosDaFolhaFechada } from "./folhaServer";

export const EMPRESA = "_empresa";

export interface RhCtx {
  scope: ApiScope;
  db: Firestore;
  ownerUid: string;
  actor: { uid: string; name: string };
}

/** Só o que as rotinas de apuração precisam — também serve ao cron (sem usuário logado). */
export type RhBase = Pick<RhCtx, "db" | "ownerUid">;

async function actorName(uid: string, email: string | null): Promise<string> {
  try {
    const u = await (await getAdminAuth()).getUser(uid);
    return u.displayName || u.email || email || uid;
  } catch {
    return email || uid;
  }
}

// Tentativas erradas de PIN por usuário (defesa em profundidade: o bloqueio de
// 3 tentativas da tela é só do navegador). Memória da instância — basta pra
// frear tentativa em sequência.
const pinErros = new Map<string, { n: number; ate: number }>();

/**
 * Toda ação do RH exige o PIN de 4 dígitos do usuário LOGADO (o mesmo de
 * users/{uid}/profile/pin usado no resto do app), enviado no header x-rh-pin.
 * O servidor confere o hash; a tela do navegador é só conveniência.
 */
export async function verificarPin(ctx: Pick<RhCtx, "db" | "actor">, request: Request): Promise<NextResponse | null> {
  const uid = ctx.actor.uid;
  const trava = pinErros.get(uid);
  if (trava && trava.ate > Date.now()) {
    return NextResponse.json({ error: "PIN bloqueado por excesso de tentativas. Aguarde 5 minutos.", pinInvalido: true }, { status: 429 });
  }
  const pin = (request.headers.get("x-rh-pin") ?? "").trim();
  if (!/^\d{4}$/.test(pin)) return NextResponse.json({ error: "Informe o PIN de 4 dígitos para continuar.", pinRequerido: true }, { status: 401 });
  const snap = await ctx.db.doc(`users/${uid}/profile/pin`).get();
  const hash = snap.exists ? String(snap.data()?.hash ?? "") : "";
  if (!hash) return NextResponse.json({ error: "Configure seu PIN de 4 dígitos na página de Usuários antes de usar o RH.", pinNaoCadastrado: true }, { status: 403 });
  const enviado = createHash("sha256").update(pin).digest("hex");
  const ok = enviado.length === hash.length && timingSafeEqual(Buffer.from(enviado), Buffer.from(hash));
  if (ok) { pinErros.delete(uid); return null; }
  const n = (trava?.n ?? 0) + 1;
  pinErros.set(uid, { n, ate: n >= 5 ? Date.now() + 5 * 60_000 : 0 });
  return NextResponse.json({ error: "PIN incorreto. Tente novamente.", pinInvalido: true }, { status: 401 });
}

/**
 * Autoriza a chamada. Devolve o contexto ou a resposta de erro pronta.
 * `pin`: exige o PIN de 4 dígitos. Padrão: sim para qualquer método que grava
 * (POST/PUT/PATCH/DELETE), não para leituras — que pedem `pin: true` quando
 * mostram dado sensível (CPF, remuneração, PDF).
 */
export async function guardRh(
  request: Request,
  rateKey: string,
  max = 60,
  need: PermissionKey | PermissionKey[] = "rh",
  pin?: boolean,
): Promise<RhCtx | NextResponse> {
  const scope = await requireScope(request, need);
  if (isScopeError(scope)) return NextResponse.json({ error: scope.error }, { status: scope.status });

  const db = await getAdminDb();
  if (!isProAccess(await resolveScopeSubscription(db, scope))) {
    return NextResponse.json({ error: "O módulo de RH é exclusivo do plano Pro." }, { status: 403 });
  }
  const { limited, retryAfterSec } = checkRateLimit(
    `rh-${rateKey}:${getClientIp(request)}:${scope.ownerUid}`,
    { windowMs: 60_000, max },
    scope.isSupremeAdmin,
  );
  if (limited) {
    return NextResponse.json(
      { error: "Muitas tentativas em pouco tempo. Aguarde um instante." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
    );
  }
  const ctx: RhCtx = { scope, db, ownerUid: scope.ownerUid, actor: { uid: scope.uid, name: await actorName(scope.uid, scope.email) } };
  if (pin ?? !["GET", "HEAD"].includes(request.method)) {
    const erro = await verificarPin(ctx, request);
    if (erro) return erro;
  }
  return ctx;
}

export const isCtx = (r: RhCtx | NextResponse): r is RhCtx => !(r instanceof NextResponse);

export const rhCol = (ctx: RhBase, name: string) =>
  ctx.db.collection("users").doc(ctx.ownerUid).collection(name);

/** Registro de quem acessou/alterou dados de colaborador. Nunca grava valores sensíveis. */
export async function logRh(
  ctx: RhCtx,
  acao: string,
  detalhe: { colaboradorId?: string; colaboradorNome?: string; campos?: string[]; info?: string } = {},
): Promise<void> {
  try {
    await rhCol(ctx, "rhLog").add({
      em: Date.now(),
      uid: ctx.actor.uid,
      nome: ctx.actor.name,
      acao,
      ...detalhe,
    });
  } catch (e) {
    console.error("Falha ao gravar log do RH:", e);
  }
}

export async function competenciasFechadas(ctx: RhBase): Promise<string[]> {
  const snap = await rhCol(ctx, "rhCompetencias").where("status", "==", "fechada").get();
  return snap.docs.map((d) => d.id);
}

interface ColabDoc {
  id: string;
  nome: string;
  cargo: string;
  vinculo: Vinculo;
  dataEntrada: string;
  dataSaida: string | null;
  status: string;
  comissionado: boolean;
}

export interface RateioNomeado {
  itens: { centroId: string; centroNome: string; valor: number }[];
  naoAlocado: number;
}

export interface LinhaCusto {
  colaboradorId: string;
  nome: string;
  cargo: string;
  vinculo: Vinculo;
  custo: CustoMes;
  rateio: RateioNomeado;
  /** Detalhe da comissão apurada (regra, base, ajustes) — congelado no fechamento. */
  comissao?: ResultadoComissao;
}

export interface CentroDoc {
  id: string;
  nome: string;
  ativo: boolean;
  rhAlocados: number;
}

export async function listarCentros(ctx: RhBase): Promise<CentroDoc[]> {
  const snap = await ctx.db.collection("costCenters").where("userId", "==", ctx.ownerUid).get();
  return snap.docs
    .map((d) => ({ id: d.id, nome: String(d.data().name ?? ""), ativo: d.data().ativo !== false, rhAlocados: Number(d.data().rhAlocados) || 0 }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Alocações (vigências) agrupadas por colaborador. */
export async function carregarAlocacoes(ctx: RhBase): Promise<Map<string, Vigencia<DadosAlocacao>[]>> {
  const snap = await rhCol(ctx, "rhVigencias").where("tipo", "==", "alocacao").get();
  const out = new Map<string, Vigencia<DadosAlocacao>[]>();
  for (const d of snap.docs) {
    const v = d.data();
    const cid = String(v.colaboradorId);
    out.set(cid, [...(out.get(cid) ?? []), { id: d.id, inicio: String(v.inicio), fim: (v.fim as string | null) ?? null, dados: { itens: v.itens ?? [] } }]);
  }
  return out;
}

/** Apura o custo de todos os colaboradores ativos na competência (cálculo vivo). */
export async function apurarCompetencia(ctx: RhBase, comp: string): Promise<LinhaCusto[]> {
  const [colabSnap, vigSnap, varSnap, aloc, centros, comissoes, salariosFolha] = await Promise.all([
    rhCol(ctx, "rhColaboradores").get(),
    rhCol(ctx, "rhVigencias").get(),
    rhCol(ctx, "rhVariaveis").where("comp", "==", comp).get(),
    carregarAlocacoes(ctx),
    listarCentros(ctx),
    apurarComissoes(ctx, comp),
    salariosDaFolhaFechada(ctx, comp),
  ]);
  const nomeCentro = new Map(centros.map((c) => [c.id, c.nome]));

  const salarios = new Map<string, Vigencia<{ valor: number }>[]>();
  const beneficios = new Map<string, Vigencia<BeneficioVig>[]>();
  const encargos: Vigencia<{ pct: number }>[] = [];
  for (const d of vigSnap.docs) {
    const v = d.data();
    const base = { id: d.id, inicio: String(v.inicio), fim: (v.fim as string | null) ?? null };
    const cid = String(v.colaboradorId);
    if (v.tipo === "salario") {
      salarios.set(cid, [...(salarios.get(cid) ?? []), { ...base, dados: { valor: Number(v.valor) || 0 } }]);
    } else if (v.tipo === "beneficio") {
      beneficios.set(cid, [...(beneficios.get(cid) ?? []), { ...base, dados: { nome: String(v.nome ?? ""), tipo: String(v.tipoBeneficio ?? "outro"), valor: Number(v.valor) || 0 } }]);
    } else if (v.tipo === "encargos" && cid === EMPRESA) {
      encargos.push({ ...base, dados: { pct: Number(v.pct) || 0 } });
    }
  }
  const variaveis = new Map<string, { bonus: number; comissao: number }>();
  for (const d of varSnap.docs) {
    const v = d.data();
    variaveis.set(String(v.colaboradorId), { bonus: Number(v.bonus) || 0, comissao: Number(v.comissao) || 0 });
  }

  const linhas: LinhaCusto[] = [];
  for (const d of colabSnap.docs) {
    const c = { id: d.id, ...d.data() } as ColabDoc;
    const vr = variaveis.get(c.id);
    const custo = calcularCustoMes({
      comp,
      entrada: c.dataEntrada,
      saida: c.dataSaida ?? null,
      vinculo: c.vinculo,
      salarios: salarios.get(c.id) ?? [],
      encargos,
      beneficios: beneficios.get(c.id) ?? [],
      comissao: comissoes.porColab.get(c.id)?.total ?? 0,
      // Folha fechada: o custo passa a refletir o que foi de fato apurado (faltas, horas extras…).
      salarioOverride: salariosFolha?.has(c.id) ? salariosFolha.get(c.id) : undefined,
      bonus: vr?.bonus ?? 0,
    });
    if (custo.diasAtivos === 0) continue;
    const r: Rateio = ratear(custo.total, diasAtivos(comp, c.dataEntrada, c.dataSaida ?? null), aloc.get(c.id) ?? []);
    linhas.push({
      colaboradorId: c.id, nome: c.nome, cargo: c.cargo, vinculo: c.vinculo, custo, comissao: comissoes.porColab.get(c.id),
      rateio: {
        itens: r.itens.map((i) => ({ ...i, centroNome: nomeCentro.get(i.centroId) ?? "—" })),
        naoAlocado: r.naoAlocado,
      },
    });
  }
  return linhas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * A alocação do colaborador NÃO lança nada no Centro de Custo: o custo de
 * pessoas fica só no RH (aba Custo mensal). Esta rotina apura os totais da
 * competência e REMOVE lançamentos antigos de origem "rh" (o orçamento que
 * versões anteriores criavam em `expenses`), pra não aparecerem como baixa no
 * centro. Competência fechada usa o retrato congelado (rhCustos).
 */
export async function sincronizarCentros(ctx: RhBase, comp: string): Promise<{ total: number; naoAlocado: number }> {
  const compRef = rhCol(ctx, "rhCompetencias").doc(comp);
  const compSnap = await compRef.get();
  const fechada = compSnap.exists && compSnap.data()?.status === "fechada";

  let linhas: { rateio: RateioNomeado; total: number }[];
  if (fechada) {
    const snap = await rhCol(ctx, "rhCustos").where("comp", "==", comp).get();
    linhas = snap.docs.map((d) => {
      const x = d.data();
      const total = Number(x.custo?.total) || 0;
      return { rateio: (x.rateio as RateioNomeado) ?? { itens: [], naoAlocado: total }, total };
    });
  } else {
    linhas = (await apurarCompetencia(ctx, comp)).map((l) => ({ rateio: l.rateio, total: l.custo.total }));
  }

  let naoAlocado = 0;
  let total = 0;
  for (const l of linhas) {
    total += l.total;
    naoAlocado += l.rateio.naoAlocado;
  }

  const expCol = ctx.db.collection("expenses");
  const existentes = await expCol.where("userId", "==", ctx.ownerUid).where("rhComp", "==", comp).get();
  const batch = ctx.db.batch();
  existentes.docs.forEach((d) => { if (d.data().origem === "rh") batch.delete(d.ref); });
  batch.set(compRef, { totalPessoal: r2(total), totalNaoAlocado: r2(naoAlocado), sincronizadoEm: Date.now() }, { merge: true });
  await batch.commit();
  return { total: r2(total), naoAlocado: r2(naoAlocado) };
}

/** Competências abertas de `desde` até o mês atual (teto de 24 meses). */
export async function sincronizarDesde(ctx: RhBase, desde: string): Promise<void> {
  const atual = monthOf(todayKey());
  const fechadas = new Set(await competenciasFechadas(ctx));
  let comp = desde;
  for (let i = 0; i < 24 && comp <= atual; i++, comp = nextComp(comp)) {
    if (!fechadas.has(comp)) await sincronizarCentros(ctx, comp);
  }
}

/** Nunca derruba a rota que a chamou: o dado principal já foi gravado. */
export async function sincronizarSeguro(ctx: RhBase, desde: string): Promise<void> {
  try {
    await sincronizarDesde(ctx, desde);
  } catch (e) {
    console.error("RH: falha ao sincronizar centros de custo:", e);
  }
}

/**
 * Mantém em costCenters/{id}.rhAlocados quantos colaboradores têm alocação
 * vigente (ou futura) no centro — a tela de Centro de custo usa isso pra
 * bloquear a exclusão sem precisar ler dado sensível do RH.
 */
export async function recomputarUsoCentros(ctx: RhBase): Promise<void> {
  try {
    const hoje = todayKey();
    const [colabSnap, aloc, centros] = await Promise.all([
      rhCol(ctx, "rhColaboradores").get(),
      carregarAlocacoes(ctx),
      listarCentros(ctx),
    ]);
    const uso = new Map<string, number>();
    for (const c of colabSnap.docs) {
      const saida = (c.data().dataSaida as string | null) ?? null;
      if (saida && saida < hoje) continue;
      const ids = new Set<string>();
      for (const v of aloc.get(c.id) ?? []) {
        if (v.fim == null || v.fim >= hoje) v.dados.itens.forEach((i) => ids.add(i.centroId));
      }
      ids.forEach((id) => uso.set(id, (uso.get(id) ?? 0) + 1));
    }
    const batch = ctx.db.batch();
    let n = 0;
    for (const c of centros) {
      const novo = uso.get(c.id) ?? 0;
      if (novo !== c.rhAlocados) { batch.update(ctx.db.collection("costCenters").doc(c.id), { rhAlocados: novo }); n++; }
    }
    if (n > 0) await batch.commit();
  } catch (e) {
    console.error("RH: falha ao atualizar uso dos centros:", e);
  }
}
