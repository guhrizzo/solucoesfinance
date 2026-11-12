"use client";

import { useEffect, useState } from "react";
import type { Ingrediente, Lote, Movimento, Pedido, Prato } from "@/lib/restaurante/tipos";
import { toIngrediente, toLote, toMovimento, toPedido, toPrato } from "@/lib/restaurante/docs";

export interface RestauranteData {
  ingredientes: Ingrediente[];
  pratos: Prato[];
  /** Abertos (recebido/em preparo/pronto) + os 60 mais recentes, sem repetição. */
  pedidos: Pedido[];
  movimentos: Movimento[];
  lotes: Lote[];
  loading: boolean;
  erro: string;
}

const VAZIO: RestauranteData = { ingredientes: [], pratos: [], pedidos: [], movimentos: [], lotes: [], loading: true, erro: "" };

/**
 * Leitura em tempo real (onSnapshot) de users/{ownerUid}/rest*. O client só
 * LÊ — toda escrita passa pelas rotas /api/restaurante/** (firestore.rules
 * bloqueia escrita direta). Sem índice composto: consultas de 1 campo.
 */
export function useRestauranteData(ownerUid: string | null): RestauranteData {
  const [data, setData] = useState<RestauranteData>(VAZIO);

  useEffect(() => {
    if (!ownerUid) return;
    let ativo = true;
    const unsubs: (() => void)[] = [];
    // Cada fonte chega separada; `pend` some quando todas responderam uma vez.
    const pend = new Set(["ing", "pratos", "abertos", "recentes", "mov", "lotes"]);
    const abertos = new Map<string, Pedido>();
    const recentes = new Map<string, Pedido>();

    const patch = (fonte: string, p: Partial<RestauranteData>) => {
      if (!ativo) return;
      pend.delete(fonte);
      setData((d) => ({ ...d, ...p, loading: pend.size > 0 }));
    };
    const juntarPedidos = () => {
      const m = new Map<string, Pedido>([...recentes, ...abertos]);
      return [...m.values()].sort((a, b) => b.criadoEm - a.criadoEm);
    };
    const falhou = (e: unknown) => {
      console.error("Restaurante: leitura em tempo real falhou:", e);
      // A tela traduz (restaurante.comum.erroCarregar).
      if (ativo) setData((d) => ({ ...d, loading: false, erro: "load" }));
    };

    (async () => {
      const { getFirebase } = await import("@/lib/firebase");
      const { db } = await getFirebase();
      const { collection, query, where, orderBy, limit, onSnapshot } = await import("firebase/firestore");
      if (!ativo) return;
      const c = (nome: string) => collection(db, "users", ownerUid, nome);

      unsubs.push(onSnapshot(c("restIngredientes"), (s) => {
        patch("ing", { ingredientes: s.docs.map((d) => toIngrediente(d.id, d.data())).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")) });
      }, falhou));
      unsubs.push(onSnapshot(c("restPratos"), (s) => {
        patch("pratos", { pratos: s.docs.map((d) => toPrato(d.id, d.data())).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")) });
      }, falhou));
      unsubs.push(onSnapshot(query(c("restPedidos"), where("status", "in", ["recebido", "em_preparo", "pronto"])), (s) => {
        abertos.clear();
        s.docs.forEach((d) => abertos.set(d.id, toPedido(d.id, d.data())));
        patch("abertos", { pedidos: juntarPedidos() });
      }, falhou));
      unsubs.push(onSnapshot(query(c("restPedidos"), orderBy("criadoEm", "desc"), limit(60)), (s) => {
        recentes.clear();
        s.docs.forEach((d) => recentes.set(d.id, toPedido(d.id, d.data())));
        // Um pedido que saiu de "aberto" pode ainda constar no mapa de abertos até o próximo snapshot dele.
        for (const [id, p] of recentes) if (abertos.has(id) && !["recebido", "em_preparo", "pronto"].includes(p.status)) abertos.delete(id);
        patch("recentes", { pedidos: juntarPedidos() });
      }, falhou));
      unsubs.push(onSnapshot(query(c("restMovimentos"), orderBy("em", "desc"), limit(300)), (s) => {
        patch("mov", { movimentos: s.docs.map((d) => toMovimento(d.id, d.data())) });
      }, falhou));
      unsubs.push(onSnapshot(query(c("restLotes"), orderBy("em", "desc"), limit(30)), (s) => {
        patch("lotes", { lotes: s.docs.map((d) => toLote(d.id, d.data())) });
      }, falhou));
    })().catch(falhou);

    return () => {
      ativo = false;
      unsubs.forEach((u) => u());
    };
  }, [ownerUid]);

  return data;
}
