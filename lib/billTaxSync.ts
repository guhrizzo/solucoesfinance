// ─── Sincronização Contas a Pagar / Impostos → Fluxo de Caixa ──────────────────
//
// Mão única: a conta / o imposto é a fonte da verdade; o Fluxo de Caixa só
// reflete. Regra: item com status "pago" tem EXATAMENTE um lançamento de saída
// espelho em users/{uid}/cashflow (linkado por sourceBillId / sourceTaxId).
// Qualquer outro status — ou item excluído — não tem lançamento nenhum.
//
// As duas funções abaixo são idempotentes: pode chamar quantas vezes quiser em
// qualquer um dos gatilhos (pagar, salvar, editar, excluir) que o resultado
// final é sempre 0 ou 1 lançamento. Nunca deixam o erro da sincronização
// travar a operação principal.
//
// Compartilhado entre app/contasPagar/page.tsx e app/impostos/page.tsx.

import type { Firestore } from "firebase/firestore";

// Categoria da conta a pagar → categoria equivalente do Fluxo de Caixa
// (precisa bater com uma das opções de CAT.saida em app/components/CashFlow.tsx).
export const CAT_TO_CASHFLOW: Record<string, string> = {
  "Aluguel": "Aluguel",
  "Fornecedores": "Fornecedores",
  "Folha": "Folha de pagamento",
  "Impostos": "Impostos",
  "Serviços": "TI / Software",
  "Outros": "Outros gastos",
};

const RECURRENCE_LABEL: Record<string, string> = {
  unica: "Única",
  mensal: "Mensal",
  trimestral: "Trimestral",
  anual: "Anual",
};

const FREQUENCY_LABEL: Record<string, string> = {
  mensal: "Mensal",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
};

const today = () => new Date().toISOString().split("T")[0];

interface BillLike {
  id: string;
  title: string;
  amount: number;
  dueDate: string;
  category: string;
  status: string;
  recurrence?: string;
  paidAt?: string;
  paidPaymentMethod?: string;
}

interface TaxLike {
  id: string;
  name: string;
  amount: number;
  dueDate: string;
  status: string;
  frequency?: string;
  paidAt?: string;
  paidPaymentMethod?: string;
}

/**
 * Garante que o lançamento-espelho de uma conta a pagar exista (status "pago")
 * ou não exista (qualquer outro status). Chamar em qualquer gatilho: pagar,
 * salvar (criar/editar), excluir (passando o status atual — ou "pendente" pra
 * forçar a remoção).
 */
export async function syncBillCashflow(db: Firestore, uid: string, bill: BillLike): Promise<void> {
  try {
    const { collection, query, where, getDocs, doc, addDoc, updateDoc, deleteDoc } =
      await import("firebase/firestore");

    const snap = await getDocs(
      query(collection(db, "users", uid, "cashflow"), where("sourceBillId", "==", bill.id))
    );

    if (bill.status !== "pago") {
      await Promise.all(snap.docs.map((d) => deleteDoc(doc(db, "users", uid, "cashflow", d.id))));
      return;
    }

    const data: Record<string, unknown> = {
      type: "saida",
      description: bill.title,
      category: CAT_TO_CASHFLOW[bill.category] ?? "Outros gastos",
      amount: bill.amount,
      date: bill.paidAt || bill.dueDate || today(),
      note: `Conta a pagar · ${RECURRENCE_LABEL[bill.recurrence ?? "unica"] ?? "Única"}`,
      sourceBillId: bill.id,
    };
    if (bill.paidPaymentMethod) data.paymentMethod = bill.paidPaymentMethod;

    if (!snap.empty) {
      await updateDoc(doc(db, "users", uid, "cashflow", snap.docs[0].id), data);
      // Espelhos duplicados (não deveria acontecer) — remove os excedentes.
      await Promise.all(
        snap.docs.slice(1).map((d) => deleteDoc(doc(db, "users", uid, "cashflow", d.id)))
      );
    } else {
      await addDoc(collection(db, "users", uid, "cashflow"), { ...data, createdAt: Date.now() });
    }
  } catch (err) {
    console.error("Erro ao sincronizar conta a pagar com o Fluxo de Caixa:", err);
  }
}

/**
 * Mesma regra da `syncBillCashflow`, para impostos (linkado por sourceTaxId).
 */
export async function syncTaxCashflow(db: Firestore, uid: string, tax: TaxLike): Promise<void> {
  try {
    const { collection, query, where, getDocs, doc, addDoc, updateDoc, deleteDoc } =
      await import("firebase/firestore");

    const snap = await getDocs(
      query(collection(db, "users", uid, "cashflow"), where("sourceTaxId", "==", tax.id))
    );

    if (tax.status !== "pago") {
      await Promise.all(snap.docs.map((d) => deleteDoc(doc(db, "users", uid, "cashflow", d.id))));
      return;
    }

    const data: Record<string, unknown> = {
      type: "saida",
      description: `Imposto: ${tax.name}`,
      category: "Impostos",
      amount: tax.amount,
      date: tax.paidAt || tax.dueDate || today(),
      note: `Imposto · ${FREQUENCY_LABEL[tax.frequency ?? "anual"] ?? "Anual"}`,
      sourceTaxId: tax.id,
    };
    if (tax.paidPaymentMethod) data.paymentMethod = tax.paidPaymentMethod;

    if (!snap.empty) {
      await updateDoc(doc(db, "users", uid, "cashflow", snap.docs[0].id), data);
      await Promise.all(
        snap.docs.slice(1).map((d) => deleteDoc(doc(db, "users", uid, "cashflow", d.id)))
      );
    } else {
      await addDoc(collection(db, "users", uid, "cashflow"), { ...data, createdAt: Date.now() });
    }
  } catch (err) {
    console.error("Erro ao sincronizar imposto com o Fluxo de Caixa:", err);
  }
}
