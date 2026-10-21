"use client";

// Assinaturas em tempo real do módulo de Compras (leitura pelo client SDK —
// firestore.rules libera LEITURA pra conta; toda escrita passa pelas rotas
// /api/compras/**). Rascunhos do fornecedor ficam fora das telas internas:
// só ele vê enquanto não envia.

import { useEffect, useState } from "react";
import type { NotificationLog, PurchaseOrderDoc, SupplierDoc } from "@/lib/compras/types";

export interface CostCenterLite { id: string; name: string }
export type LogRow = NotificationLog & { id: string };

export function useComprasData(ownerUid: string) {
  const [suppliers, setSuppliers] = useState<SupplierDoc[]>([]);
  const [orders, setOrders] = useState<PurchaseOrderDoc[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenterLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ownerUid) return;
    const unsubs: (() => void)[] = [];
    let cancelled = false;
    (async () => {
      try {
        const [{ getFirebase }, fs] = await Promise.all([import("@/lib/firebase"), import("firebase/firestore")]);
        const { db } = await getFirebase();
        if (cancelled) return;
        const { collection, query, orderBy, onSnapshot, limit, where, getDocs } = fs;
        let pending = 2;
        const done = () => { pending -= 1; if (pending <= 0) setLoading(false); };
        const fail = (e: { message: string }) => { setError(e.message); setLoading(false); };

        unsubs.push(onSnapshot(collection(db, "users", ownerUid, "suppliers"), (snap) => {
          setSuppliers(snap.docs.map((d) => ({ ...(d.data() as SupplierDoc), id: d.id }))
            .sort((a, b) => (a.nomeFantasia || a.razaoSocial).localeCompare(b.nomeFantasia || b.razaoSocial)));
          done();
        }, fail));

        unsubs.push(onSnapshot(query(collection(db, "users", ownerUid, "purchaseOrders"), orderBy("createdAt", "desc")), (snap) => {
          setOrders(snap.docs.map((d) => ({ ...(d.data() as PurchaseOrderDoc), id: d.id })).filter((o) => o.status !== "rascunho"));
          done();
        }, fail));

        unsubs.push(onSnapshot(query(collection(db, "users", ownerUid, "comprasNotifications"), orderBy("at", "desc"), limit(100)), (snap) => {
          setLogs(snap.docs.map((d) => ({ ...(d.data() as NotificationLog), id: d.id })));
        }, () => undefined));

        // Centros de custo (seletor da conversão em Contas a Pagar).
        getDocs(query(collection(db, "costCenters"), where("userId", "==", ownerUid)))
          .then((snap) => {
            if (cancelled) return;
            setCostCenters(snap.docs.map((d) => ({ id: d.id, name: String(d.data().name ?? d.data().nome ?? d.id) })));
          })
          .catch(() => undefined);
      } catch (e) {
        setError((e as Error).message);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; unsubs.forEach((u) => u()); };
  }, [ownerUid]);

  return { suppliers, orders, logs, costCenters, loading, error };
}
