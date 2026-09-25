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
import type { Actor } from "@/lib/audit";
import { stampSettle } from "@/lib/audit";

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
const round2 = (n: number) => Math.round(n * 100) / 100;
const CENTS_EPSILON = 0.005;

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
  /** Soma já recebida por entradas do Fluxo de Caixa (vinculadas por `settledReceivableId`). */
  amountReceived?: number;
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

    // Parte já recebida por entradas do extrato (vinculadas por
    // `settledReceivableId`, não por `sourceReceivableId`) não entra no
    // espelho — senão contaria em dobro no caixa.
    const remaining = round2((receivable.amount ?? 0) - (receivable.amountReceived ?? 0));

    if (receivable.status !== "recebido" || remaining <= CENTS_EPSILON) {
      await Promise.all(snap.docs.map((d) => deleteDoc(doc(db, "users", uid, "cashflow", d.id))));
      return;
    }

    const data: Record<string, unknown> = {
      type: "entrada",
      description: receivable.title || "Cobrança",
      category: CAT_TO_CASHFLOW[receivable.category ?? ""] ?? "Outros ganhos",
      amount: remaining,
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

/**
 * Sentido contrário da baixa automática do Fluxo de Caixa (CashFlow.tsx →
 * `findSettleCandidates`/`applySettle`): em vez de uma entrada nova procurar
 * uma conta a receber, aqui é a CONTA A RECEBER (recém salva/editada em
 * contasReceber/page.tsx) que procura entradas já lançadas — do extrato
 * importado, por exemplo — que não bateram na hora porque a descrição ainda não
 * era igual ao título/cliente. Mesma regra de `autoSettleBillFromCashflow`
 * (lib/billTaxSync.ts): só entradas soltas (sem `settledReceivableId`/
 * `sourceReceivableId`), nunca mexe se outra conta a receber em aberto bate
 * com o mesmo título/cliente, e nunca aceita entrada maior que o saldo.
 */
export async function autoSettleReceivableFromCashflow(
  db: Firestore,
  uid: string,
  receivable: { id: string; title: string; partyName?: string; amount: number; amountReceived?: number },
  actor: Actor,
): Promise<void> {
  try {
    const titulo = (receivable.title || "").trim().toLowerCase();
    const cliente = (receivable.partyName || "").trim().toLowerCase();
    if (!titulo && !cliente) return;

    let remaining = round2(receivable.amount - (receivable.amountReceived || 0));
    if (remaining <= CENTS_EPSILON) return;

    const { collection, query, where, getDocs, doc, updateDoc } = await import("firebase/firestore");

    // Ambiguidade: outra conta a receber em aberto com o mesmo título/cliente — não arrisca vincular.
    const recSnap = await getDocs(collection(db, "users", uid, "receivables"));
    const hasAmbiguity = recSnap.docs.some((d) => {
      if (d.id === receivable.id) return false;
      const data = d.data();
      if (data.status !== "pendente" && data.status !== "atrasado" && data.status !== "agendado") return false;
      const t = (data.title || "").trim().toLowerCase();
      const c = (data.partyName || "").trim().toLowerCase();
      return (!!titulo && t === titulo) || (!!cliente && c === cliente);
    });
    if (hasAmbiguity) return;

    const snap = await getDocs(query(collection(db, "users", uid, "cashflow"), where("type", "==", "entrada")));
    const candidates = snap.docs
      .filter((d) => {
        const data = d.data();
        if (data.settledReceivableId || data.sourceReceivableId) return false;
        const desc = (data.description || "").trim().toLowerCase();
        return (!!titulo && desc === titulo) || (!!cliente && desc === cliente);
      })
      .sort((a, b) => String(a.data().date || "").localeCompare(String(b.data().date || "")));

    let linked = false;
    let lastDate = "";
    for (const d of candidates) {
      if (remaining <= CENTS_EPSILON) break;
      const amt = Number(d.data().amount);
      if (amt > remaining + CENTS_EPSILON) continue; // nunca aceita entrada maior do que falta receber
      await updateDoc(doc(db, "users", uid, "cashflow", d.id), { settledReceivableId: receivable.id });
      remaining = round2(remaining - amt);
      lastDate = String(d.data().date || "");
      linked = true;
    }
    if (!linked) return;

    const ref = doc(db, "users", uid, "receivables", receivable.id);
    if (remaining <= CENTS_EPSILON) {
      await updateDoc(ref, {
        status: "recebido", receivedAt: lastDate || today(), amountReceived: receivable.amount, ...stampSettle(actor),
      });
    } else {
      await updateDoc(ref, { amountReceived: round2(receivable.amount - remaining), ...stampSettle(actor) });
    }
  } catch (err) {
    console.error("Erro ao tentar dar baixa retroativa em Contas a Receber:", err);
  }
}
