// lib/restaurante/service.ts
// Regras de negócio do módulo Restaurante que GRAVAM — SOMENTE server-side
// (Admin SDK). As rotas app/api/restaurante/** autenticam (guardRestaurante)
// e delegam pra cá. Tudo que mexe em saldo roda em TRANSAÇÃO (todas as
// leituras antes das escritas): lê os saldos, chama o cálculo puro
// (estoque.ts / ficha.ts / pedido.ts) e grava movimentos + saldos + status de
// uma vez. Isso garante:
//   • baixa ÚNICA na transição recebido→em_preparo (flag `baixaFeita` no
//     pedido; reenvio da mesma transição é "noop");
//   • estorno exato do que a baixa tirou (lista `baixa` gravada no pedido);
//   • nº do pedido sequencial por conta (restContadores/pedidos);
//   • estado anti-spam do aviso de WhatsApp (`alertaNivel`) consistente.
//
// `db` é tipado como o Firestore do Admin SDK, mas só usamos
// doc/collection/get/runTransaction — os testes (tests/restaurante) passam o
// Firestore em memória de tests/support/fakeFirestore.mjs.

import type { DocumentReference, Firestore, Transaction } from "firebase-admin/firestore";
import type { Carimbo, Falta, Ingrediente, Lote, NivelAlerta, Pedido, Prato, StatusPedido, TipoMovimento, UnidadeBase } from "./tipos";
import { STATUS_PEDIDO } from "./tipos";
import { toIngrediente, toPedido, toPrato } from "./docs";
import { deveAvisar, nivelAlerta, planejarAjuste, planejarBaixa, planejarEntrada, planejarEstorno, planejarLote, type LinhaMov } from "./estoque";
import { isOrigem, montarItens, necessidadePedido, validarTransicao } from "./pedido";
import { quantidadeBase, validarIngrediente, validarPrato } from "./validate";
import type { ErroFicha } from "./ficha";

// ─── Erros ───────────────────────────────────────────────────────────────────

export class RestError extends Error {
  code: string;
  status: number;
  faltas?: Falta[];
  erros?: ErroFicha[];
  constructor(code: string, status: number, message: string, extra: { faltas?: Falta[]; erros?: ErroFicha[] } = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.faltas = extra.faltas;
    this.erros = extra.erros;
  }
}

const naoEncontrado = (o: string) => new RestError("notFound", 404, `${o} não encontrado.`);

// ─── Caminhos ────────────────────────────────────────────────────────────────

export const COL = {
  ingredientes: "restIngredientes",
  pratos: "restPratos",
  pedidos: "restPedidos",
  movimentos: "restMovimentos",
  lotes: "restLotes",
  contadores: "restContadores",
} as const;

export interface Ctx {
  db: Firestore;
  ownerUid: string;
  actor: { uid: string; name: string };
  /** Relógio injetável (testes). */
  agora?: () => number;
}

const col = (ctx: Ctx, nome: keyof typeof COL) => ctx.db.collection(`users/${ctx.ownerUid}/${COL[nome]}`);
/** IDs vêm do client: só aceita o formato de id do Firestore (sem "/", que mudaria o caminho). */
const ID_OK = /^[A-Za-z0-9_-]{1,128}$/;
const ref = (ctx: Ctx, nome: keyof typeof COL, id: string) => {
  if (!ID_OK.test(id)) throw new RestError("notFound", 404, "Registro não encontrado.");
  return col(ctx, nome).doc(id) as DocumentReference;
};
const now = (ctx: Ctx) => (ctx.agora ? ctx.agora() : Date.now());
const carimbo = (ctx: Ctx): Carimbo => ({ em: now(ctx), uid: ctx.actor.uid, nome: ctx.actor.name });

async function listarIngredientes(ctx: Ctx): Promise<Ingrediente[]> {
  const snap = await col(ctx, "ingredientes").get();
  return snap.docs.map((d) => toIngrediente(d.id, d.data()));
}

async function listarPratos(ctx: Ctx): Promise<Prato[]> {
  const snap = await col(ctx, "pratos").get();
  return snap.docs.map((d) => toPrato(d.id, d.data()));
}

/** Ingredientes lidos DENTRO da transação (para saldo consistente). */
async function lerIngredientesTx(ctx: Ctx, tx: Transaction, ids: string[]): Promise<Map<string, Ingrediente>> {
  const unicos = [...new Set(ids)];
  const snaps = await Promise.all(unicos.map((id) => tx.get(ref(ctx, "ingredientes", id))));
  const out = new Map<string, Ingrediente>();
  snaps.forEach((s, i) => { if (s.exists) out.set(unicos[i], toIngrediente(unicos[i], s.data())); });
  return out;
}

/** Ingrediente que cruzou para baixo/zerado nesta operação — a rota avisa o dono. */
export interface Cruzamento {
  ingredienteId: string;
  nome: string;
  nivel: NivelAlerta;
  saldo: number;
  minimo: number;
  unidadeBase: UnidadeBase;
}

/**
 * Grava as linhas planejadas: 1 movimento por linha + saldo/custo/estado de
 * alerta no ingrediente. Devolve os cruzamentos de nível (anti-spam: só
 * quando piora; ao melhorar o estado reseta).
 */
function gravarLinhas(
  ctx: Ctx,
  tx: Transaction,
  ings: Map<string, Ingrediente>,
  linhas: LinhaMov[],
  tipo: TipoMovimento,
  extra: { motivo: string; pedidoId?: string; pedidoNumero?: number; loteId?: string },
): Cruzamento[] {
  const cruz: Cruzamento[] = [];
  const quem = carimbo(ctx);
  const nivelAtual = new Map<string, NivelAlerta>();
  for (const l of linhas) {
    const ing = ings.get(l.ingredienteId);
    if (!ing) continue;
    const anterior = nivelAtual.get(l.ingredienteId) ?? ing.alertaNivel ?? "ok";
    const novo = nivelAlerta(l.saldoDepois, ing.minimo);
    let alertaNivel: NivelAlerta = anterior;
    if (deveAvisar(anterior, novo)) {
      alertaNivel = novo;
      cruz.push({ ingredienteId: ing.id, nome: ing.nome, nivel: novo, saldo: l.saldoDepois, minimo: ing.minimo, unidadeBase: ing.unidadeBase });
    } else if (novo !== anterior) {
      alertaNivel = novo; // melhorou: reseta para avisar de novo num próximo cruzamento
    }
    nivelAtual.set(l.ingredienteId, alertaNivel);

    const movRef = col(ctx, "movimentos").doc();
    tx.set(movRef, {
      tipo,
      ingredienteId: l.ingredienteId,
      ingredienteNome: l.nome,
      unidadeBase: l.unidadeBase,
      delta: l.delta,
      quantidade: l.quantidade,
      saldoAntes: l.saldoAntes,
      saldoDepois: l.saldoDepois,
      custoUnit: l.custoUnit,
      motivo: extra.motivo.slice(0, 200),
      ...(extra.pedidoId ? { pedidoId: extra.pedidoId, pedidoNumero: extra.pedidoNumero ?? 0 } : {}),
      ...(extra.loteId ? { loteId: extra.loteId } : {}),
      ator: quem,
      em: quem.em,
    });
    tx.update(ref(ctx, "ingredientes", l.ingredienteId), {
      saldo: l.saldoDepois,
      custoMedio: l.custoMedioDepois,
      alertaNivel,
      temMovimentos: true,
      atualizadoEm: quem.em,
    });
    // Linhas seguintes do mesmo ingrediente partem do saldo já atualizado.
    ings.set(l.ingredienteId, { ...ing, saldo: l.saldoDepois, custoMedio: l.custoMedioDepois, alertaNivel });
  }
  return cruz;
}

const motivoValido = (m: unknown) => String(m ?? "").trim().length >= 3;

// ─── Ingredientes ────────────────────────────────────────────────────────────

export async function criarIngrediente(ctx: Ctx, body: Record<string, unknown>): Promise<{ id: string }> {
  const catalogo = new Map((await listarIngredientes(ctx)).map((i) => [i.id, i]));
  const v = validarIngrediente(body, catalogo);
  if (!v.ok) throw new RestError("validation", 400, v.erro, { erros: v.erros });
  const { saldoInicial, ...dados } = v.dados;
  if ([...catalogo.values()].some((i) => i.nome.toLowerCase() === dados.nome.toLowerCase())) {
    throw new RestError("duplicate", 409, "Já existe um ingrediente com esse nome.");
  }
  const novoRef = col(ctx, "ingredientes").doc();
  const em = now(ctx);
  await ctx.db.runTransaction(async (tx) => {
    // Nasce "zerado" (saldo 0): não dispara aviso na criação; o saldo inicial só melhora o nível.
    const ing: Ingrediente = { id: novoRef.id, ...dados, saldo: 0, alertaNivel: "zerado", temMovimentos: false, criadoEm: em, atualizadoEm: em };
    tx.set(novoRef, { ...dados, saldo: 0, alertaNivel: "zerado", temMovimentos: false, criadoEm: em, atualizadoEm: em });
    if (saldoInicial > 0) {
      // Saldo inicial entra como movimento (auditável), com o custo informado no cadastro.
      const linha = planejarEntrada(ing, saldoInicial, saldoInicial * dados.custoMedio);
      gravarLinhas(ctx, tx, new Map([[ing.id, ing]]), [{ ...linha, custoMedioDepois: dados.custoMedio }], "entrada", { motivo: "Saldo inicial" });
    }
  });
  return { id: novoRef.id };
}

export async function atualizarIngrediente(ctx: Ctx, id: string, body: Record<string, unknown>): Promise<void> {
  const todos = await listarIngredientes(ctx);
  const atual = todos.find((i) => i.id === id);
  if (!atual) throw naoEncontrado("Ingrediente");
  const catalogo = new Map(todos.map((i) => [i.id, i]));
  const v = validarIngrediente(body, catalogo, atual);
  if (!v.ok) throw new RestError("validation", 400, v.erro, { erros: v.erros });
  // Saldo não se edita aqui (só por movimento de ajuste).
  const { saldoInicial: _semSaldo, ...dados } = v.dados;
  void _semSaldo;
  if (todos.some((i) => i.id !== id && i.nome.toLowerCase() === dados.nome.toLowerCase())) {
    throw new RestError("duplicate", 409, "Já existe um ingrediente com esse nome.");
  }
  // Virar preparo não pode criar aninhamento: preparo dentro da receita de outro preparo.
  if (dados.preparo && !atual.preparo) {
    const usa = todos.filter((i) => i.preparo && i.id !== id && (i.receita ?? []).some((r) => r.ingredienteId === id));
    if (usa.length) throw new RestError("conflict", 409, `Não dá para virar preparo: ${atual.nome} é insumo da receita de ${usa.map((u) => u.nome).join(", ")}.`);
  }
  await ctx.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref(ctx, "ingredientes", id));
    if (!snap.exists) throw naoEncontrado("Ingrediente");
    const cur = toIngrediente(id, snap.data());
    // O estado anti-spam só melhora numa edição (ex.: baixou o mínimo); piorar
    // fica para a próxima baixa avisar.
    const novo = nivelAlerta(cur.saldo, dados.minimo);
    const PESO = { ok: 0, baixo: 1, zerado: 2 } as const;
    const alertaNivel = PESO[novo] < PESO[cur.alertaNivel ?? "ok"] ? novo : cur.alertaNivel ?? "ok";
    tx.update(ref(ctx, "ingredientes", id), { ...dados, alertaNivel, atualizadoEm: now(ctx) });
  });
}

/** Excluir só sem movimento e sem ficha/receita apontando; senão, inativar. */
export async function excluirIngrediente(ctx: Ctx, id: string): Promise<void> {
  const [todos, pratos] = await Promise.all([listarIngredientes(ctx), listarPratos(ctx)]);
  const ing = todos.find((i) => i.id === id);
  if (!ing) throw naoEncontrado("Ingrediente");
  const emPratos = pratos.filter((p) => p.ficha.some((f) => f.ingredienteId === id)).map((p) => p.nome);
  const emPreparos = todos.filter((i) => i.id !== id && (i.receita ?? []).some((r) => r.ingredienteId === id)).map((i) => i.nome);
  if (emPratos.length || emPreparos.length) {
    throw new RestError("inUse", 409, `${ing.nome} está na ficha de: ${[...emPratos, ...emPreparos].join(", ")}. Tire das fichas ou inative o ingrediente.`);
  }
  await ctx.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref(ctx, "ingredientes", id));
    if (!snap.exists) throw naoEncontrado("Ingrediente");
    if (toIngrediente(id, snap.data()).temMovimentos) {
      throw new RestError("inUse", 409, `${ing.nome} já tem movimentos de estoque (histórico). Inative em vez de excluir.`);
    }
    tx.delete(ref(ctx, "ingredientes", id));
  });
}

// ─── Movimentos manuais (entrada de compra, ajuste, perda) ───────────────────

export async function registrarEntrada(ctx: Ctx, body: Record<string, unknown>): Promise<{ cruzamentos: Cruzamento[] }> {
  const id = String(body.ingredienteId ?? "");
  return ctx.db.runTransaction(async (tx) => {
    const ings = await lerIngredientesTx(ctx, tx, [id]);
    const ing = ings.get(id);
    if (!ing) throw naoEncontrado("Ingrediente");
    const q = quantidadeBase(body.quantidade, body.unidade, ing.unidadeBase);
    if (typeof q === "string") throw new RestError("validation", 400, q);
    const custoTotal = Number(body.custoTotal);
    if (!Number.isFinite(custoTotal) || custoTotal < 0 || custoTotal > 1e9) throw new RestError("validation", 400, "Custo total da compra inválido.");
    const linha = planejarEntrada(ing, q, custoTotal);
    const motivo = String(body.motivo ?? "").trim() || "Compra";
    return { cruzamentos: gravarLinhas(ctx, tx, ings, [linha], "entrada", { motivo }) };
  });
}

/**
 * Ajuste de inventário (`novoSaldo`, contagem física) ou perda/desperdício
 * (`perda`, quantidade que saiu). Motivo obrigatório.
 */
export async function registrarAjuste(ctx: Ctx, body: Record<string, unknown>): Promise<{ cruzamentos: Cruzamento[] }> {
  const id = String(body.ingredienteId ?? "");
  const tipo: TipoMovimento = body.tipo === "perda" ? "perda" : "ajuste";
  if (!motivoValido(body.motivo)) throw new RestError("reasonRequired", 400, "Informe o motivo (mínimo de 3 caracteres).");
  return ctx.db.runTransaction(async (tx) => {
    const ings = await lerIngredientesTx(ctx, tx, [id]);
    const ing = ings.get(id);
    if (!ing) throw naoEncontrado("Ingrediente");
    const q = quantidadeBase(body.quantidade, body.unidade, ing.unidadeBase, { permitirZero: tipo === "ajuste" });
    if (typeof q === "string") throw new RestError("validation", 400, q);
    const linha = planejarAjuste(ing, tipo === "perda" ? { perda: q } : { novoSaldo: q });
    if (linha.delta === 0) throw new RestError("validation", 400, "O saldo informado é igual ao atual.");
    return { cruzamentos: gravarLinhas(ctx, tx, ings, [linha], tipo, { motivo: String(body.motivo).trim() }) };
  });
}

// ─── Pratos ──────────────────────────────────────────────────────────────────

export async function criarPrato(ctx: Ctx, body: Record<string, unknown>): Promise<{ id: string }> {
  const [ings, pratos] = await Promise.all([listarIngredientes(ctx), listarPratos(ctx)]);
  const v = validarPrato(body, new Map(ings.map((i) => [i.id, i])));
  if (!v.ok) throw new RestError("validation", 400, v.erro, { erros: v.erros });
  if (pratos.some((p) => p.nome.toLowerCase() === v.dados.nome.toLowerCase())) throw new RestError("duplicate", 409, "Já existe um prato com esse nome.");
  const r = col(ctx, "pratos").doc();
  const em = now(ctx);
  await r.set({ ...v.dados, jaPedido: false, criadoEm: em, atualizadoEm: em });
  return { id: r.id };
}

export async function atualizarPrato(ctx: Ctx, id: string, body: Record<string, unknown>): Promise<void> {
  const [ings, pratos] = await Promise.all([listarIngredientes(ctx), listarPratos(ctx)]);
  if (!pratos.some((p) => p.id === id)) throw naoEncontrado("Prato");
  const v = validarPrato(body, new Map(ings.map((i) => [i.id, i])));
  if (!v.ok) throw new RestError("validation", 400, v.erro, { erros: v.erros });
  if (pratos.some((p) => p.id !== id && p.nome.toLowerCase() === v.dados.nome.toLowerCase())) throw new RestError("duplicate", 409, "Já existe um prato com esse nome.");
  await ref(ctx, "pratos", id).update({ ...v.dados, atualizadoEm: now(ctx) });
}

export async function excluirPrato(ctx: Ctx, id: string): Promise<void> {
  await ctx.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref(ctx, "pratos", id));
    if (!snap.exists) throw naoEncontrado("Prato");
    const p = toPrato(id, snap.data());
    if (p.jaPedido) throw new RestError("inUse", 409, `${p.nome} já aparece em pedidos (histórico). Inative em vez de excluir.`);
    tx.delete(ref(ctx, "pratos", id));
  });
}

// ─── Pedidos ─────────────────────────────────────────────────────────────────

function dadosCabecalho(body: Record<string, unknown>) {
  const origem = isOrigem(body.origem) ? body.origem : "balcao";
  return {
    origem,
    mesa: String(body.mesa ?? "").trim().slice(0, 20),
    cliente: String(body.cliente ?? "").trim().slice(0, 80),
    observacao: String(body.observacao ?? "").trim().slice(0, 300),
  };
}

async function itensDoCardapio(ctx: Ctx, entrada: unknown) {
  const [ings, pratos] = await Promise.all([listarIngredientes(ctx), listarPratos(ctx)]);
  const r = montarItens(entrada, new Map(pratos.map((p) => [p.id, p])), new Map(ings.map((i) => [i.id, i])));
  if (!r.ok) throw new RestError("validation", 400, r.erro);
  return r;
}

export async function criarPedido(ctx: Ctx, body: Record<string, unknown>): Promise<{ id: string; numero: number }> {
  const cab = dadosCabecalho(body);
  if (cab.origem === "mesa" && !cab.mesa) throw new RestError("validation", 400, "Informe a mesa.");
  const m = await itensDoCardapio(ctx, body.itens);
  const pedRef = col(ctx, "pedidos").doc();
  const contRef = ref(ctx, "contadores", "pedidos");
  const pratoIds = [...new Set(m.itens.map((i) => i.pratoId))];
  return ctx.db.runTransaction(async (tx) => {
    const [cont, ...pratosSnap] = await Promise.all([contRef, ...pratoIds.map((id) => ref(ctx, "pratos", id))].map((r) => tx.get(r)));
    const numero = (Number(cont.exists ? cont.data()?.ultimo : 0) || 0) + 1;
    const quem = carimbo(ctx);
    tx.set(contRef, { ultimo: numero }, { merge: true });
    tx.set(pedRef, {
      numero,
      ...cab,
      itens: m.itens,
      total: m.total,
      custoTotal: m.custoTotal,
      status: "recebido",
      transicoes: { recebido: quem },
      baixaFeita: false,
      criadoEm: quem.em,
      atualizadoEm: quem.em,
    });
    // Marca o prato como "já pedido" (bloqueia exclusão; histórico).
    pratosSnap.forEach((s, i) => {
      if (s.exists && s.data()?.jaPedido !== true) tx.update(ref(ctx, "pratos", pratoIds[i]), { jaPedido: true });
    });
    return { id: pedRef.id, numero };
  });
}

/** Edição só enquanto "recebido" (antes da baixa). */
export async function editarPedido(ctx: Ctx, id: string, body: Record<string, unknown>): Promise<void> {
  const cab = dadosCabecalho(body);
  if (cab.origem === "mesa" && !cab.mesa) throw new RestError("validation", 400, "Informe a mesa.");
  const m = await itensDoCardapio(ctx, body.itens);
  const pratoIds = [...new Set(m.itens.map((i) => i.pratoId))];
  await ctx.db.runTransaction(async (tx) => {
    const [snap, ...pratosSnap] = await Promise.all([ref(ctx, "pedidos", id), ...pratoIds.map((pid) => ref(ctx, "pratos", pid))].map((r) => tx.get(r)));
    if (!snap.exists) throw naoEncontrado("Pedido");
    const p = toPedido(id, snap.data());
    if (p.status !== "recebido" || p.baixaFeita) throw new RestError("invalidStatus", 409, "Só dá para editar pedidos ainda em \"recebido\".");
    tx.update(ref(ctx, "pedidos", id), { ...cab, itens: m.itens, total: m.total, custoTotal: m.custoTotal, atualizadoEm: now(ctx) });
    pratosSnap.forEach((s, i) => {
      if (s.exists && s.data()?.jaPedido !== true) tx.update(ref(ctx, "pratos", pratoIds[i]), { jaPedido: true });
    });
  });
}

export interface ResultadoStatus {
  pedido: Pedido;
  /** true = já estava no destino; nada foi feito (reenvio). */
  noop: boolean;
  cruzamentos: Cruzamento[];
}

/**
 * Transição de status. A BAIXA acontece aqui, uma única vez, em
 * recebido→em_preparo. Cancelar depois da baixa devolve o estoque (estorno)
 * ou registra perda (`perda: true`). Baixa com falta de insumo só com
 * `forcar: true` + motivo.
 */
export async function mudarStatus(
  ctx: Ctx,
  id: string,
  para: unknown,
  opts: { forcar?: boolean; perda?: boolean; motivo?: string } = {},
): Promise<ResultadoStatus> {
  if (!(STATUS_PEDIDO as readonly string[]).includes(String(para))) throw new RestError("validation", 400, "Status inválido.");
  const destino = para as StatusPedido;
  const motivo = String(opts.motivo ?? "").trim().slice(0, 200);

  return ctx.db.runTransaction(async (tx) => {
    const pedRef = ref(ctx, "pedidos", id);
    const snap = await tx.get(pedRef);
    if (!snap.exists) throw naoEncontrado("Pedido");
    const p = toPedido(id, snap.data());

    const v = validarTransicao(p.status, destino);
    if (v === "noop") return { pedido: p, noop: true, cruzamentos: [] };
    if (v === "invalida") throw new RestError("invalidStatus", 409, "Mudança de status não permitida (o pedido não pula nem volta etapas).");

    const quem = carimbo(ctx);
    const base = { status: destino, transicoes: { ...p.transicoes, [destino]: quem }, atualizadoEm: quem.em };
    let extra: Record<string, unknown> = {};
    let cruzamentos: Cruzamento[] = [];

    if (destino === "em_preparo" && !p.baixaFeita) {
      const nec = necessidadePedido(p);
      const ings = await lerIngredientesTx(ctx, tx, [...nec.keys()]);
      const plano = planejarBaixa(nec, ings, { forcar: opts.forcar === true });
      if (!plano.ok) {
        throw new RestError("faltaInsumo", 409, "Faltam insumos para preparar este pedido.", { faltas: plano.faltas });
      }
      if (plano.forcada && !motivoValido(motivo)) {
        throw new RestError("reasonRequired", 400, "Para forçar a baixa com falta de insumo, informe o motivo.");
      }
      cruzamentos = gravarLinhas(ctx, tx, ings, plano.linhas, plano.forcada ? "baixa_forcada" : "baixa_pedido", {
        motivo: plano.forcada ? motivo : `Pedido #${p.numero}`,
        pedidoId: id,
        pedidoNumero: p.numero,
      });
      extra = { baixaFeita: true, baixa: plano.baixa, baixaForcada: plano.forcada, ...(plano.forcada ? { motivoForcado: motivo } : {}) };
    } else if (destino === "cancelado") {
      if (p.baixaFeita && !p.destinoBaixa) {
        const baixa = p.baixa ?? [];
        const ings = await lerIngredientesTx(ctx, tx, baixa.map((b) => b.ingredienteId));
        const perda = opts.perda === true;
        const { linhas } = planejarEstorno(baixa, ings, { perda });
        cruzamentos = gravarLinhas(ctx, tx, ings, linhas, perda ? "perda_pedido" : "estorno", {
          motivo: motivo || (perda ? `Pedido #${p.numero} cancelado — descartado` : `Pedido #${p.numero} cancelado — estorno`),
          pedidoId: id,
          pedidoNumero: p.numero,
        });
        extra = { destinoBaixa: perda ? "perda" : "estorno" };
      }
      extra = { ...extra, motivoCancelamento: motivo };
    }

    tx.update(pedRef, { ...base, ...extra });
    return { pedido: toPedido(id, { ...snap.data(), ...base, ...extra }), noop: false, cruzamentos };
  });
}

// ─── Produção (lotes de preparo) ─────────────────────────────────────────────

export async function registrarLote(ctx: Ctx, body: Record<string, unknown>): Promise<{ id: string; cruzamentos: Cruzamento[] }> {
  const id = String(body.ingredienteId ?? "");
  const motivo = String(body.motivo ?? "").trim().slice(0, 200);
  const loteRef = col(ctx, "lotes").doc();
  return ctx.db.runTransaction(async (tx) => {
    const primeiro = await lerIngredientesTx(ctx, tx, [id]);
    const preparo = primeiro.get(id);
    if (!preparo) throw naoEncontrado("Preparo");
    if (!preparo.ativo) throw new RestError("validation", 400, `${preparo.nome} está inativo.`);
    const ings = await lerIngredientesTx(ctx, tx, [id, ...(preparo.receita ?? []).map((r) => r.ingredienteId)]);
    const q = quantidadeBase(body.quantidade, body.unidade, preparo.unidadeBase);
    if (typeof q === "string") throw new RestError("validation", 400, q);
    const plano = planejarLote(preparo, q, ings, { forcar: body.forcar === true });
    if (!plano.ok) {
      throw plano.faltas.length
        ? new RestError("faltaInsumo", 409, plano.erro, { faltas: plano.faltas })
        : new RestError("validation", 400, plano.erro);
    }
    if (plano.consumo.forcada && !motivoValido(motivo)) throw new RestError("reasonRequired", 400, "Para produzir com falta de insumo, informe o motivo.");

    const texto = motivo || `Lote de ${preparo.nome}`;
    const c1 = gravarLinhas(ctx, tx, ings, plano.consumo.linhas, "producao_consumo", { motivo: texto, loteId: loteRef.id });
    const c2 = gravarLinhas(ctx, tx, ings, [plano.entrada], "producao_entrada", { motivo: texto, loteId: loteRef.id });
    const quem = carimbo(ctx);
    const lote: Omit<Lote, "id"> = {
      ingredienteId: id,
      ingredienteNome: preparo.nome,
      unidadeBase: preparo.unidadeBase,
      quantidade: plano.entrada.quantidade,
      consumos: plano.consumo.baixa,
      custoLote: plano.custoLote,
      custoUnit: plano.custoUnit,
      forcado: plano.consumo.forcada,
      motivo,
      ator: quem,
      em: quem.em,
    };
    tx.set(loteRef, lote);
    return { id: loteRef.id, cruzamentos: [...c1, ...c2] };
  });
}

// ─── Leitura (rotas GET / alertas) ───────────────────────────────────────────

export async function carregarTudo(ctx: Ctx): Promise<{ ingredientes: Ingrediente[]; pratos: Prato[]; pedidosAbertos: Pedido[] }> {
  const [ingredientes, pratos, ped] = await Promise.all([
    listarIngredientes(ctx),
    listarPratos(ctx),
    col(ctx, "pedidos").where("status", "in", ["recebido", "em_preparo", "pronto"]).get(),
  ]);
  return { ingredientes, pratos, pedidosAbertos: ped.docs.map((d) => toPedido(d.id, d.data())) };
}
