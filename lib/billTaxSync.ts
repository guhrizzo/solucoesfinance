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
import type { Actor } from "@/lib/audit";
import { stampSettle } from "@/lib/audit";

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
  numeral: "Parcelada",
};

const FREQUENCY_LABEL: Record<string, string> = {
  mensal: "Mensal",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
};

const today = () => new Date().toISOString().split("T")[0];
const round2 = (n: number) => Math.round(n * 100) / 100;
const CENTS_EPSILON = 0.005;

interface BillLike {
  id: string;
  title: string;
  amount: number;
  dueDate: string;
  category: string;
  status: string;
  recurrence?: string;
  installmentIndex?: number;
  installmentCount?: number;
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
  /** Já pago via extrato importado (baixa automática no Fluxo de Caixa) — essas saídas já estão no caixa, o espelho só cobre o que faltava. */
  amountPaid?: number;
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
      note:
        bill.installmentIndex && bill.installmentCount
          ? `Conta a pagar · Parcela ${bill.installmentIndex}/${bill.installmentCount}`
          : `Conta a pagar · ${RECURRENCE_LABEL[bill.recurrence ?? "unica"] ?? "Única"}`,
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

    // Parte já paga por saídas do extrato (vinculadas por `settledTaxId`, não
    // por `sourceTaxId`) não entra no espelho — senão contaria em dobro no caixa.
    const remaining = Math.round((tax.amount - (tax.amountPaid ?? 0)) * 100) / 100;

    if (tax.status !== "pago" || remaining <= 0.005) {
      await Promise.all(snap.docs.map((d) => deleteDoc(doc(db, "users", uid, "cashflow", d.id))));
      return;
    }

    const data: Record<string, unknown> = {
      type: "saida",
      description: `Imposto: ${tax.name}`,
      category: "Impostos",
      amount: remaining,
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

/**
 * Sentido contrário de `autoSettleMatchingBill` (CashFlow.tsx): em vez de uma
 * saída nova procurar uma conta pra baixar, aqui é a CONTA (recém salva/editada
 * em contasPagar/page.tsx) que procura saídas do Fluxo de Caixa já lançadas
 * anteriormente — do extrato importado, por exemplo — que não bateram na hora
 * porque a descrição da saída ainda não era igual ao título/fornecedor da
 * conta. Útil quando o usuário corrige o título da conta pra igualar o nome
 * que já sai no extrato: essa correção agora dispara a baixa retroativa.
 *
 * Só considera saídas "soltas" (sem `sourceBillId`/`settledTaxId`/`sourceTaxId`
 * — ou seja, que ainda não estão vinculadas a nenhuma conta ou imposto) e nunca
 * mexe se houver outra conta pendente com o mesmo título/fornecedor (mesma
 * cautela contra ambiguidade da direção original). Pode consumir mais de uma
 * saída em sequência (mais antiga primeiro) até quitar o saldo restante —
 * cada uma só entra se não estourar o que falta pagar.
 */
export async function autoSettleBillFromCashflow(
  db: Firestore,
  uid: string,
  bill: { id: string; title: string; partyName?: string; amount: number; amountPaid?: number },
  actor: Actor
): Promise<void> {
  try {
    const titulo = (bill.title || "").trim().toLowerCase();
    const fornecedor = (bill.partyName || "").trim().toLowerCase();
    if (!titulo && !fornecedor) return;

    let remaining = round2(bill.amount - (bill.amountPaid || 0));
    if (remaining <= CENTS_EPSILON) return;

    const { collection, query, where, getDocs, doc, updateDoc } = await import("firebase/firestore");

    // Ambiguidade: outra conta pendente com o mesmo título/fornecedor — não arrisca vincular.
    const billsSnap = await getDocs(collection(db, "users", uid, "bills"));
    const hasAmbiguity = billsSnap.docs.some((d) => {
      if (d.id === bill.id) return false;
      const data = d.data();
      if (data.status !== "pendente" && data.status !== "vencido" && data.status !== "agendado") return false;
      const t = (data.title || "").trim().toLowerCase();
      const f = (data.partyName || "").trim().toLowerCase();
      return t === titulo || (!!fornecedor && f === fornecedor);
    });
    if (hasAmbiguity) return;

    const snap = await getDocs(query(collection(db, "users", uid, "cashflow"), where("type", "==", "saida")));
    const candidates = snap.docs
      .filter((d) => {
        const data = d.data();
        if (data.sourceBillId || data.settledTaxId || data.sourceTaxId) return false;
        const desc = (data.description || "").trim().toLowerCase();
        return desc === titulo || (!!fornecedor && desc === fornecedor);
      })
      .sort((a, b) => String(a.data().date || "").localeCompare(String(b.data().date || "")));

    let linked = false;
    for (const d of candidates) {
      if (remaining <= CENTS_EPSILON) break;
      const amt = Number(d.data().amount);
      if (amt > remaining + CENTS_EPSILON) continue; // nunca aceita saída maior do que falta pagar
      await updateDoc(doc(db, "users", uid, "cashflow", d.id), { sourceBillId: bill.id });
      remaining = round2(remaining - amt);
      linked = true;
    }
    if (!linked) return;

    const totalPaid = round2(bill.amount - remaining);
    if (remaining <= CENTS_EPSILON) {
      await updateDoc(doc(db, "users", uid, "bills", bill.id), {
        status: "pago", paidAt: today(), amountPaid: bill.amount, ...stampSettle(actor),
      });
    } else {
      await updateDoc(doc(db, "users", uid, "bills", bill.id), {
        amountPaid: totalPaid, ...stampSettle(actor),
      });
    }
  } catch (err) {
    console.error("Erro ao tentar dar baixa retroativa em Contas a Pagar:", err);
  }
}

/**
 * Mesma ideia da `autoSettleBillFromCashflow`, agora para Impostos — sentido
 * contrário de `autoSettleMatchingTax` (CashFlow.tsx). Casa pelo `name` do
 * imposto (ou o espelho "Imposto: {name}").
 */
export async function autoSettleTaxFromCashflow(
  db: Firestore,
  uid: string,
  tax: { id: string; name: string; amount: number; amountPaid?: number },
  actor: Actor
): Promise<void> {
  try {
    const nome = (tax.name || "").trim().toLowerCase();
    if (!nome) return;

    let remaining = round2(tax.amount - (tax.amountPaid || 0));
    if (remaining <= CENTS_EPSILON) return;

    const { collection, query, where, getDocs, doc, updateDoc } = await import("firebase/firestore");

    const taxesSnap = await getDocs(collection(db, "users", uid, "taxes"));
    const hasAmbiguity = taxesSnap.docs.some((d) => {
      if (d.id === tax.id) return false;
      const data = d.data();
      if (data.status === "pago") return false;
      return (data.name || "").trim().toLowerCase() === nome;
    });
    if (hasAmbiguity) return;

    const snap = await getDocs(query(collection(db, "users", uid, "cashflow"), where("type", "==", "saida")));
    const candidates = snap.docs
      .filter((d) => {
        const data = d.data();
        if (data.sourceBillId || data.settledTaxId || data.sourceTaxId) return false;
        const desc = (data.description || "").trim().toLowerCase();
        return desc === nome || desc === `imposto: ${nome}`;
      })
      .sort((a, b) => String(a.data().date || "").localeCompare(String(b.data().date || "")));

    let linked = false;
    for (const d of candidates) {
      if (remaining <= CENTS_EPSILON) break;
      const amt = Number(d.data().amount);
      if (amt > remaining + CENTS_EPSILON) continue;
      await updateDoc(doc(db, "users", uid, "cashflow", d.id), { settledTaxId: tax.id });
      remaining = round2(remaining - amt);
      linked = true;
    }
    if (!linked) return;

    const totalPaid = round2(tax.amount - remaining);
    if (remaining <= CENTS_EPSILON) {
      await updateDoc(doc(db, "users", uid, "taxes", tax.id), {
        status: "pago", paidAt: today(), amountPaid: tax.amount, ...stampSettle(actor),
      });
    } else {
      await updateDoc(doc(db, "users", uid, "taxes", tax.id), {
        amountPaid: totalPaid, ...stampSettle(actor),
      });
    }
  } catch (err) {
    console.error("Erro ao tentar dar baixa retroativa em Impostos:", err);
  }
}
