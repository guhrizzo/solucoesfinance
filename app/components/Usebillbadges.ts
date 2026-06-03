"use client";

import { useState, useEffect } from "react";

interface BillSummary {
  totalPending: number;
  overdueBills: number;
  dueSoonBills: number;
  alertDays: number;
}

export function useBillBadges() {
  const [billSummary, setBillSummary] = useState<BillSummary>({
    totalPending: 0,
    overdueBills: 0,
    dueSoonBills: 0,
    alertDays: 5,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBillSummary = async () => {
      try {
        // Carrega o alerta de dias do localStorage
        const savedAlertDays = Number(localStorage.getItem("nexusfi:alertDays")) || 5;

        const [{ getFirebase }, { collection, query, getDocs }] = await Promise.all([
          import("@/lib/firebase"),
          import("firebase/firestore"),
        ]);

        const { db } = await getFirebase();
        
        // Simula obter o UID (você pode passar como prop se necessário)
        const [{ getAuth }] = await Promise.all([
          import("firebase/auth"),
        ]);
        const { auth } = await getFirebase();
        const user = auth.currentUser;

        if (!user) {
          setLoading(false);
          return;
        }

        // Busca as contas
        const billsRef = collection(db, "users", user.uid, "bills");
        const billsSnap = await getDocs(query(billsRef));

        const bills = billsSnap.docs.map(d => ({
          id: d.id,
          ...d.data()
        })) as any[];

        // Calcula as métricas
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const daysUntil = (dateStr: string): number => {
          const due = new Date(dateStr + "T00:00:00");
          due.setHours(0, 0, 0, 0);
          return Math.round((due.getTime() - today.getTime()) / 86400000);
        };

        let totalPending = 0;
        let overdueBills = 0;
        let dueSoonBills = 0;

        bills.forEach(bill => {
          if (bill.status !== "pago") {
            totalPending++;
            const days = daysUntil(bill.dueDate);
            if (days < 0) {
              overdueBills++;
            } else if (days <= savedAlertDays) {
              dueSoonBills++;
            }
          }
        });

        setBillSummary({
          totalPending,
          overdueBills,
          dueSoonBills,
          alertDays: savedAlertDays,
        });
      } catch (error) {
        console.error("Erro ao buscar resumo de contas:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchBillSummary();

    // Atualiza a cada 30 segundos para dados mais frescos
    const interval = setInterval(fetchBillSummary, 30000);
    return () => clearInterval(interval);
  }, []);

  return { billSummary, loading };
}