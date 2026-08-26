// ─── Sincronização Centro de Custo ⇄ Fluxo de Caixa ────────────────────────────
//
// Duas direções, cada uma com seu gatilho:
//
// 1) Centro de Custo → Fluxo de Caixa (`syncExpenseCashflow`): já existia —
//    despesa marcada "pago" no Centro de Custo cria/atualiza o lançamento
//    espelho em `users/{uid}/cashflow`, linkado por `sourceExpenseId`.
//
// 2) Fluxo de Caixa → Centro de Custo (`syncCashflowExpense` +
//    `settleCenterIfBudgetReached`): um lançamento de saída no Fluxo de
//    Caixa pode ser vinculado a um Centro de Custo (`costCenterId`); ao
//    salvar, isso lança automaticamente a despesa correspondente em
//    `expenses` (sempre "pago", qualquer que seja o valor pago — pagamento
//    parcial inclusive), linkada pelo mesmo `sourceExpenseId` gravado no
//    lançamento do cashflow (convenção inversa da direção 1, pro mesmo
//    despesa/lançamento nunca duplicar dos dois lados). Depois de cada
//    lançamento, confere se a soma paga do centro no mês já bateu o
//    orçamento — se sim, quita (marca "pago" + espelha no cashflow) as
//    despesas pendentes/agendadas restantes daquele centro no mês.
//
// Compartilhado entre `app/costCenter/page.tsx` e `app/components/CashFlow.tsx`
// pra não duplicar (e desalinhar) a lógica de vínculo nos dois lados.

import type { Firestore } from "firebase/firestore";

/** Categoria do Centro de Custo → categoria equivalente do Fluxo de Caixa. */
export function mapCategoryToCashflow(cat: string): string {
  const l = cat.toLowerCase();
  if (l.includes("almoço") || l.includes("almoco") || l.includes("alimento") || l.includes("refeição") || l.includes("refeicao") || l.includes("restaurante")) return "Outros gastos";
  if (l.includes("uber") || l.includes("táxi") || l.includes("taxi") || l.includes("combustível") || l.includes("combustivel") || l.includes("passagem") || l.includes("frete") || l.includes("logística") || l.includes("logistica") || l.includes("deslocamento")) return "Outros gastos";
  if (l.includes("hotel") || l.includes("hospedagem") || l.includes("hostel") || l.includes("airbnb")) return "Outros gastos";
  if (l.includes("salário") || l.includes("salario") || l.includes("folha") || l.includes("mão de obra") || l.includes("mao de obra")) return "Folha de pagamento";
  if (l.includes("aluguel")) return "Aluguel";
  if (l.includes("fornec") || l.includes("compra") || l.includes("mercadoria") || l.includes("matéria-prima") || l.includes("materia-prima") || l.includes("embalagens")) return "Fornecedores";
  if (l.includes("imposto") || l.includes("tributo")) return "Impostos";
  if (l.includes("marketing") || l.includes("anúncio") || l.includes("publicidade")) return "Marketing";
  if (l.includes("ti") || l.includes("softw") || l.includes("assinatura") || l.includes("plataforma") || l.includes("marketplace")) return "TI / Software";
  return "Outros gastos";
}

/**
 * Cria/atualiza/remove o lançamento espelho em users/{uid}/cashflow de uma
 * despesa do Centro de Custo, mantendo o vínculo por `sourceExpenseId`.
 * Compartilhada entre o modal de despesa (criar/editar) e o botão rápido
 * "Marcar como pago" — evita duplicar a lógica de sincronização.
 */
export async function syncExpenseCashflow(
  db: Firestore,
  uid: string,
  expenseId: string,
  data: { description?: string; category: string; center: string; amount: number; date: string; status: "pago" | "pendente" | "agendado" }
) {
  const { collection, addDoc, updateDoc, doc, query, where, getDocs, deleteDoc } = await import("firebase/firestore");
  const cfSnap = await getDocs(
    query(collection(db, "users", uid, "cashflow"), where("sourceExpenseId", "==", expenseId))
  );

  if (data.status === "pago") {
    const cfData = {
      type: "saida",
      description: data.description || `${data.category} – ${data.center}`,
      category: mapCategoryToCashflow(data.category),
      amount: data.amount,
      date: data.date,
      note: `Centro: ${data.center} | ${data.category}`,
      sourceExpenseId: expenseId,
      createdAt: Date.now(),
    };
    if (!cfSnap.empty) {
      await updateDoc(doc(db, "users", uid, "cashflow", cfSnap.docs[0].id), cfData);
    } else {
      await addDoc(collection(db, "users", uid, "cashflow"), cfData);
    }
  } else {
    await Promise.all(cfSnap.docs.map((d) => deleteDoc(doc(db, "users", uid, "cashflow", d.id))));
  }
}

/**
 * Direção inversa: um lançamento de saída no Fluxo de Caixa vinculado a um
 * Centro de Custo lança (cria/atualiza) a despesa espelho em `expenses`,
 * sempre como "pago" — qualquer que seja o valor (pagamento parcial
 * inclusive). Se o vínculo com o centro for removido (`costCenterId`
 * vazio) e já existia uma despesa espelho, remove essa despesa.
 *
 * Retorna o id da despesa vinculada (ou null se nada ficou vinculado).
 */
export async function syncCashflowExpense(
  db: Firestore,
  uid: string,
  existingExpenseId: string | undefined,
  data: { description: string; category: string; costCenterId: string; costCenterName: string; amount: number; date: string }
): Promise<string | null> {
  const { addDoc, updateDoc, deleteDoc, doc, collection } = await import("firebase/firestore");

  if (!data.costCenterId || !data.costCenterName) {
    if (existingExpenseId) await deleteDoc(doc(db, "expenses", existingExpenseId)).catch(() => {});
    return null;
  }

  const expenseData = {
    description: data.description,
    category: data.category || "Outros",
    center: data.costCenterName,
    amount: data.amount,
    date: data.date,
    status: "pago" as const,
    paidAt: data.date,
    userId: uid,
  };

  if (existingExpenseId) {
    await updateDoc(doc(db, "expenses", existingExpenseId), expenseData);
    return existingExpenseId;
  }

  const ref = await addDoc(collection(db, "expenses"), { ...expenseData, createdAt: new Date() });
  return ref.id;
}

/**
 * Orçamento de um centro num mês — mesma regra de `getBudgetForMonth` do
 * Centro de Custo: `budgetsByMonth` é a fonte da verdade; o campo legado
 * `budget` só vale como fallback pro mês atual, nunca retroage nem projeta.
 */
export function budgetForCenterMonth(
  center: { budget?: number; budgetsByMonth?: Record<string, number> },
  monthKey: string,
  currentMonthKey: string
): number {
  if (center.budgetsByMonth && monthKey in center.budgetsByMonth) return center.budgetsByMonth[monthKey];
  if (!center.budgetsByMonth && typeof center.budget === "number" && monthKey === currentMonthKey) return center.budget;
  return 0;
}

/**
 * Depois de lançar/atualizar uma despesa vinda do Fluxo de Caixa, confere
 * se o total pago do centro naquele mês já bateu o orçamento — se sim,
 * quita (marca "pago" + espelha no cashflow) todas as despesas
 * pendentes/agendadas restantes daquele centro no mês, fechando o
 * orçamento por completo de uma vez.
 */
export async function settleCenterIfBudgetReached(
  db: Firestore,
  uid: string,
  centerName: string,
  monthKey: string,
  budgetForMonth: number
) {
  if (!(budgetForMonth > 0)) return;
  const { collection, query, where, getDocs, doc, updateDoc } = await import("firebase/firestore");

  const snap = await getDocs(
    query(collection(db, "expenses"), where("userId", "==", uid), where("center", "==", centerName))
  );
  const monthDocs = snap.docs.filter((d) => (d.data().date as string || "").startsWith(monthKey));
  const paidTotal = monthDocs
    .filter((d) => d.data().status === "pago")
    .reduce((s, d) => s + (Number(d.data().amount) || 0), 0);
  if (paidTotal < budgetForMonth) return;

  const today = new Date().toISOString().split("T")[0];
  const pending = monthDocs.filter((d) => d.data().status === "pendente" || d.data().status === "agendado");

  await Promise.all(pending.map(async (d) => {
    const data = d.data();
    await updateDoc(doc(db, "expenses", d.id), { status: "pago", paidAt: today });
    await syncExpenseCashflow(db, uid, d.id, {
      description: data.description, category: data.category, center: data.center,
      amount: data.amount, date: data.date, status: "pago",
    });
  }));
}
