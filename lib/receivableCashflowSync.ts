// ─── Sincronização Contas a Receber → Fluxo de Caixa ──────────────────────────
//
// Mão única: a cobrança é a fonte da verdade; o Fluxo de Caixa só reflete.
// Regra: cobrança com status "recebido" tem EXATAMENTE um lançamento de entrada
// espelho em users/{uid}/cashflow (linkado por sourceReceivableId). Qualquer
// outro status — ou cobrança excluída — não tem lançamento nenhum.
//
// A função abaixo é idempotente: pode chamar quantas vezes quiser em qualquer
// gatilho (receber, salvar, editar, excluir) que o resultado final é sempre
// 0 ou 1 lançamento. Nunca deixa o erro da sincronização travar a operação
// principal.
//
// Espelha lib/billTaxSync.ts (Contas a Pagar / Impostos → Fluxo de Caixa).

import type { Firestore } from "firebase/firestore";

// Categoria da cobrança (valor gravado) → categoria equivalente do Fluxo de
// Caixa (precisa bater com uma das opções de CAT.entrada em
// app/components/CashFlow.tsx) — NÃO traduzir.
export const CAT_TO_CASHFLOW: Record<string, string> = {
  "Clientes": "Vendas",
  "Serviços": "Serviços",
  "Produtos": "Vendas",
  "Devoluções": "Devoluções",
  "Empréstimos": "Empréstimos",
  "Outros": "Outros ganhos",
};

const RECURRENCE_LABEL: Record<string, string> = {
  unica: "Única",
  numeral: "Parcelada",
};

const today = () => new Date().toISOString().split("T")[0];

interface ReceivableLike {
  id: string;
  title?: string;
  amount?: number;
  dueDate?: string;
  category?: string;
  status: string;
  recurrence?: string;
  installmentIndex?: number;
  installmentCount?: number;
  receivedAt?: string;
  paidPaymentMethod?: string;
  paymentMethod?: string;
}

/**
 * Garante que o lançamento-espelho de uma cobrança exista (status "recebido")
 * ou não exista (qualquer outro status). Chamar em qualquer gatilho: receber,
 * salvar (criar/editar), excluir (passando o status atual — ou "removido" pra
 * forçar a remoção).
 */
export async function syncReceivableCashflow(
  db: Firestore,
  uid: string,
  receivable: ReceivableLike,
): Promise<void> {
  try {
    const { collection, query, where, getDocs, doc, addDoc, updateDoc, deleteDoc } =
      await import("firebase/firestore");

    const snap = await getDocs(
      query(collection(db, "users", uid, "cashflow"), where("sourceReceivableId", "==", receivable.id)),
    );

    if (receivable.status !== "recebido") {
      await Promise.all(snap.docs.map((d) => deleteDoc(doc(db, "users", uid, "cashflow", d.id))));
      return;
    }

    const data: Record<string, unknown> = {
      type: "entrada",
      description: receivable.title || "Cobrança",
      category: CAT_TO_CASHFLOW[receivable.category ?? ""] ?? "Outros ganhos",
      amount: receivable.amount ?? 0,
      date: receivable.receivedAt || receivable.dueDate || today(),
      note:
        receivable.installmentIndex && receivable.installmentCount
          ? `Conta a receber · Parcela ${receivable.installmentIndex}/${receivable.installmentCount}`
          : `Conta a receber · ${RECURRENCE_LABEL[receivable.recurrence ?? "unica"] ?? "Única"}`,
      sourceReceivableId: receivable.id,
    };
    const method = receivable.paidPaymentMethod || receivable.paymentMethod;
    if (method) data.paymentMethod = method;

    if (!snap.empty) {
      await updateDoc(doc(db, "users", uid, "cashflow", snap.docs[0].id), data);
      // Espelhos duplicados (não deveria acontecer) — remove os excedentes.
      await Promise.all(
        snap.docs.slice(1).map((d) => deleteDoc(doc(db, "users", uid, "cashflow", d.id))),
      );
    } else {
      await addDoc(collection(db, "users", uid, "cashflow"), { ...data, createdAt: Date.now() });
    }
  } catch (err) {
    console.error("Erro ao sincronizar conta a receber com o Fluxo de Caixa:", err);
  }
}
