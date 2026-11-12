// lib/restaurante/alertas.ts
// Alertas de falta de insumo: sem saldo, abaixo do mínimo, "não cobre os
// pedidos em aberto" e pratos indisponíveis. Puro e testado — a tela calcula
// ao vivo com os mesmos dados que a rota /api/restaurante/alertas.

import type { Ingrediente, Pedido, Prato } from "./tipos";
import { necessidadeFicha, necessidadeItens } from "./ficha";
import { nivelAlerta } from "./estoque";
import { r3 } from "./unidades";

export type TipoAlerta = "sem_saldo" | "abaixo_minimo" | "nao_cobre_pedidos";

export interface AlertaIngrediente {
  tipo: TipoAlerta;
  ingredienteId: string;
  nome: string;
  unidadeBase: Ingrediente["unidadeBase"];
  saldo: number;
  minimo: number;
  /** Só em "nao_cobre_pedidos": total que os pedidos recebidos precisam. */
  necessario?: number;
}

export interface PratoIndisponivel {
  pratoId: string;
  nome: string;
  /** Ingredientes que não dão nem para 1 porção (ou estão inativos). */
  faltam: { ingredienteId: string; nome: string }[];
}

export interface Alertas {
  ingredientes: AlertaIngrediente[];
  pratosIndisponiveis: PratoIndisponivel[];
  total: number;
}

const ORDEM: Record<TipoAlerta, number> = { sem_saldo: 0, nao_cobre_pedidos: 1, abaixo_minimo: 2 };

/**
 * Um ingrediente pode gerar mais de um alerta (ex.: abaixo do mínimo E não
 * cobre os pedidos). "Sem saldo" já engloba "abaixo do mínimo".
 * Ingredientes inativos são ignorados (exceto quando derrubam um prato ativo).
 */
export function calcularAlertas(
  ingredientes: Ingrediente[],
  pratos: Prato[],
  pedidos: Pick<Pedido, "status" | "itens" | "baixaFeita">[],
): Alertas {
  const porId = new Map(ingredientes.map((i) => [i.id, i]));
  const out: AlertaIngrediente[] = [];

  // Necessidade dos pedidos que ainda não tiveram baixa (status "recebido").
  const pendentes = pedidos.filter((p) => p.status === "recebido" && !p.baixaFeita);
  const nec = necessidadeItens(pendentes.flatMap((p) => p.itens));

  for (const ing of ingredientes) {
    if (!ing.ativo) continue;
    const base = { ingredienteId: ing.id, nome: ing.nome, unidadeBase: ing.unidadeBase, saldo: r3(ing.saldo), minimo: r3(ing.minimo) };
    const nivel = nivelAlerta(ing.saldo, ing.minimo);
    if (nivel === "zerado") out.push({ tipo: "sem_saldo", ...base });
    else if (nivel === "baixo") out.push({ tipo: "abaixo_minimo", ...base });
    const precisa = nec.get(ing.id) ?? 0;
    if (precisa > Math.max(0, ing.saldo) + 1e-9) out.push({ tipo: "nao_cobre_pedidos", ...base, necessario: r3(precisa) });
  }
  out.sort((a, b) => ORDEM[a.tipo] - ORDEM[b.tipo] || a.nome.localeCompare(b.nome, "pt-BR"));

  const pratosIndisponiveis = pratos
    .filter((p) => p.ativo)
    .map((p) => ({ pratoId: p.id, nome: p.nome, faltam: faltasPrato(p, porId) }))
    .filter((p) => p.faltam.length > 0)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return { ingredientes: out, pratosIndisponiveis, total: out.length + pratosIndisponiveis.length };
}

/** Ingredientes que impedem fazer 1 porção do prato agora. */
export function faltasPrato(
  prato: Pick<Prato, "ficha" | "rendimento">,
  porId: Map<string, Pick<Ingrediente, "id" | "nome" | "saldo" | "ativo">>,
): { ingredienteId: string; nome: string }[] {
  const out: { ingredienteId: string; nome: string }[] = [];
  for (const [id, q] of necessidadeFicha(prato.ficha, prato.rendimento, 1)) {
    const ing = porId.get(id);
    if (!ing || !ing.ativo || q > Math.max(0, ing.saldo) + 1e-9) out.push({ ingredienteId: id, nome: ing?.nome ?? "(removido)" });
  }
  return out;
}
