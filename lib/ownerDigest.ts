// lib/ownerDigest.ts
// ─────────────────────────────────────────────────────────────────────────────
// Avisos DIÁRIOS por WhatsApp pro dono da conta (SOMENTE server-side), rodados
// pelo cron app/api/cron/owner-alerts (08h de Brasília). Os avisos disparados
// por um evento (caixa fechado, estoque baixo) ficam em lib/ownerAlerts.ts.
//
//   contas      → contas a pagar e impostos: vencem em 3 dias, amanhã, hoje e
//                 atrasadas há 1 e 7 dias
//   receber     → contas a receber, mesmas janelas
//   saldo       → saldo projetado fica negativo nos próximos X dias (ou o
//                 saldo atual está abaixo do mínimo definido pelo dono)
//   categorizar → lançamentos sem categoria (segundas-feiras)
//   orcamento   → centro de custo usou 90% / 100% do orçamento do mês
//   resumo      → receita, despesa, resultado e 3 maiores gastos (semanal: toda
//                 segunda; mensal: dia 1)
//
// Idempotência: `sent.{kind}` (data) e `sentBudget.{mês|centro}` (nível) no
// próprio users/{uid}/profile/whatsappAlerts — rodar o cron de novo no mesmo
// dia não reenvia. Cada aviso cabe numa linha só (limite do template).
// ─────────────────────────────────────────────────────────────────────────────

import type { Firestore } from "firebase-admin/firestore";
import { isInvestmentMovement } from "@/lib/cashflowCategories";
import { budgetForCenterMonth } from "@/lib/costCenterSync";
import { brl, notifyOwner, type AlertKind, type OwnerAlertsConfig } from "@/lib/ownerAlerts";

const round2 = (n: number) => Math.round(n * 100) / 100;
const EPS = 0.004;

export const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dowOf = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0 = domingo
const brDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export interface Item { nome: string; valor: number; dueDate: string; id?: string; col?: "bills" | "taxes" }

/** Quanto falta de uma conta/imposto/cobrança em aberto (0 se já quitada). */
function pendente(x: FirebaseFirestore.DocumentData, quitado: string, pagoField: string): number {
  if (x.status === quitado) return 0;
  return round2(Math.max(0, (Number(x.amount) || 0) - (Number(x[pagoField]) || 0)));
}

export async function carregarAbertos(
  db: Firestore, ownerUid: string, from: string, to: string
): Promise<{ pagar: Item[]; receber: Item[] }> {
  const col = (c: string) => db.collection(`users/${ownerUid}/${c}`).where("dueDate", ">=", from).where("dueDate", "<=", to).get();
  const [bills, taxes, recs] = await Promise.all([col("bills"), col("taxes"), col("receivables")]);
  const pagar: Item[] = [];
  const receber: Item[] = [];
  for (const d of bills.docs) {
    const x = d.data(); const valor = pendente(x, "pago", "amountPaid");
    if (valor > EPS) pagar.push({ nome: String(x.title ?? "").trim() || "Sem nome", valor, dueDate: String(x.dueDate), id: d.id, col: "bills" });
  }
  for (const d of taxes.docs) {
    const x = d.data(); const valor = pendente(x, "pago", "amountPaid");
    if (valor > EPS) pagar.push({ nome: String(x.name ?? "").trim() || "Imposto", valor, dueDate: String(x.dueDate), id: d.id, col: "taxes" });
  }
  for (const d of recs.docs) {
    const x = d.data(); const valor = pendente(x, "recebido", "amountReceived");
    if (valor > EPS) receber.push({ nome: String(x.title ?? "").trim() || String(x.partyName ?? "").trim() || "Sem nome", valor, dueDate: String(x.dueDate) });
  }
  return { pagar, receber };
}

/** Agrupa nas janelas D-3, D-1, hoje, atraso de 1 e de 7 dias. */
function textoVencimentos(itens: Item[], today: string, um: string, varios: string): string | null {
  const janelas: { label: string; date: string; nomes: boolean }[] = [
    { label: "em atraso há 7 dias", date: addDays(today, -7), nomes: true },
    { label: "em atraso desde ontem", date: addDays(today, -1), nomes: true },
    { label: "vencem hoje", date: today, nomes: true },
    { label: "vencem amanhã", date: addDays(today, 1), nomes: false },
    { label: "vencem em 3 dias", date: addDays(today, 3), nomes: false },
  ];
  const partes: string[] = [];
  for (const j of janelas) {
    const lista = itens.filter((i) => i.dueDate === j.date).sort((a, b) => b.valor - a.valor);
    if (!lista.length) continue;
    const total = lista.reduce((s, i) => s + i.valor, 0);
    const nomes = j.nomes
      ? ` (${lista.slice(0, 3).map((i) => `${i.nome} ${brl(i.valor)}`).join(", ")}${lista.length > 3 ? ` e mais ${lista.length - 3}` : ""})`
      : "";
    partes.push(`${plural(lista.length, um, varios)} ${j.label}, ${brl(total)}${nomes}`);
  }
  return partes.length ? partes.join("; ") : null;
}

export interface DigestSummary { sent: number; skipped: number; errors: number }

/**
 * Roda todos os avisos diários ligados por UM dono. `pro` já vem checado pelo
 * cron (uma leitura por conta, não uma por aviso).
 */
export async function runOwnerDigest(
  db: Firestore, ownerUid: string, cfg: OwnerAlertsConfig, today: string
): Promise<DigestSummary> {
  const out: DigestSummary = { sent: 0, skipped: 0, errors: 0 };
  const on = (k: AlertKind) => !!cfg.enabled?.[k];
  const sent = cfg.sent ?? {};
  const ref = db.doc(`users/${ownerUid}/profile/whatsappAlerts`);
  const marcar = (patch: Record<string, unknown>) => ref.set(patch, { merge: true }).catch(() => undefined);

  const enviar = async (kind: AlertKind, texto: string | null, marca: Record<string, unknown> = { sent: { [kind]: today } }, actions = false) => {
    if (!texto) { out.skipped++; return; }
    const res = await notifyOwner(db, ownerUid, kind, texto, { cfg, pro: true, actions });
    if (res.ok) { out.sent++; await marcar(marca); }
    else if (res.reason === "disabled" || res.reason === "not_pro" || res.reason === "no_phone") out.skipped++;
    else out.errors++;
  };

  // ── Contas a pagar / a receber (D-3, D-1, hoje, atraso) e saldo projetado ──
  const horizonte = Math.min(90, Math.max(1, Math.round(Number(cfg.horizonDays) || 15)));
  const precisaAbertos = on("contas") || on("receber") || on("saldo");
  const abertos = precisaAbertos
    ? await carregarAbertos(db, ownerUid, addDays(today, -7), addDays(today, Math.max(3, horizonte)))
    : { pagar: [], receber: [] };

  if (on("contas") && sent.contas !== today) {
    const texto = textoVencimentos(abertos.pagar, today, "conta a pagar", "contas a pagar");
    const vencidas = abertos.pagar.filter((i) => i.dueDate <= addDays(today, 3)).sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1)).slice(0, 8);
    await enviar("contas", texto, { sent: { contas: today } }, true);
    // Guarda quais contas o aviso citou: o botão "Marcar como pago" age nelas.
    if (texto) await db.doc(`users/${ownerUid}/profile/whatsappState`).set({ lastContas: { at: Date.now(), items: vencidas } }, { merge: true }).catch(() => undefined);
  }
  if (on("receber") && sent.receber !== today) {
    await enviar("receber", textoVencimentos(abertos.receber, today, "conta a receber", "contas a receber"));
  }

  // Lançamentos do caixa: lidos uma vez só, se algum aviso precisa deles.
  let cashflow: FirebaseFirestore.DocumentData[] | null = null;
  const lerCashflow = async () => {
    if (!cashflow) {
      const snap = await db.collection(`users/${ownerUid}/cashflow`).select("type", "amount", "date", "category", "description").get();
      cashflow = snap.docs.map((d) => d.data());
    }
    return cashflow;
  };

  // ── Saldo projetado ────────────────────────────────────────────────────────
  if (on("saldo")) {
    const ultimo = sent.saldo;
    const repetir = !ultimo || addDays(ultimo, 3) <= today; // no máximo a cada 3 dias
    if (repetir) {
      const fluxo = await lerCashflow();
      const saldoAtual = round2(fluxo.reduce((s, x) => s + (x.type === "entrada" ? 1 : -1) * (Number(x.amount) || 0), 0));
      const minimo = Math.max(0, Number(cfg.minBalance) || 0);
      const limite = addDays(today, horizonte);
      // Contas já vencidas e não pagas ainda vão sair do caixa; cobranças atrasadas não entram (incerteza).
      const eventos = [
        ...abertos.pagar.filter((i) => i.dueDate <= limite).map((i) => ({ date: i.dueDate < today ? today : i.dueDate, delta: -i.valor })),
        ...abertos.receber.filter((i) => i.dueDate >= today && i.dueDate <= limite).map((i) => ({ date: i.dueDate, delta: i.valor })),
      ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.delta - b.delta)); // saída antes da entrada no mesmo dia
      let corrente = saldoAtual;
      let negativoEm: { date: string; valor: number } | null = null;
      for (const e of eventos) {
        corrente = round2(corrente + e.delta);
        if (corrente < 0 && !negativoEm) negativoEm = { date: e.date, valor: corrente };
      }
      let texto: string | null = null;
      if (negativoEm) {
        texto = `atenção ao caixa: pelas contas a pagar e a receber, o saldo projetado fica negativo em ${brDate(negativoEm.date)} (${brl(negativoEm.valor)}), dentro dos próximos ${horizonte} dias. Saldo hoje: ${brl(saldoAtual)}`;
      } else if (minimo > 0 && saldoAtual < minimo) {
        texto = `o saldo em caixa está em ${brl(saldoAtual)}, abaixo do mínimo de ${brl(minimo)} que você definiu`;
      }
      await enviar("saldo", texto);
    }
  }

  // ── Lançamentos sem categoria (toda segunda) ───────────────────────────────
  if (on("categorizar") && dowOf(today) === 1 && sent.categorizar !== today) {
    const fluxo = await lerCashflow();
    const n = fluxo.filter((x) => !String(x.category ?? "").trim()).length;
    await enviar("categorizar", n > 0
      ? `você tem ${plural(n, "lançamento", "lançamentos")} sem categoria no Fluxo de Caixa. Categorizar melhora a qualidade do DRE e dos relatórios`
      : null);
  }

  // ── Orçamento por centro de custo (90% / 100%) ─────────────────────────────
  if (on("orcamento")) {
    const monthKey = today.slice(0, 7);
    const [centros, despesas] = await Promise.all([
      db.collection("costCenters").where("userId", "==", ownerUid).get(),
      db.collection("expenses").where("userId", "==", ownerUid).get(),
    ]);
    const jaAvisado = cfg.sentBudget ?? {};
    const novos: Record<string, number> = {};
    const linhas: string[] = [];
    for (const c of centros.docs) {
      const cc = c.data() as { name?: string; budget?: number; budgetsByMonth?: Record<string, number> };
      const orcado = budgetForCenterMonth(cc, monthKey, monthKey);
      if (!(orcado > 0) || !cc.name) continue;
      const usado = despesas.docs
        .map((d) => d.data())
        .filter((e) => e.center === cc.name && e.status === "pago" && String(e.date ?? "").slice(0, 7) === monthKey)
        .reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const pct = (usado / orcado) * 100;
      const nivel = pct >= 100 ? 100 : pct >= 90 ? 90 : 0;
      const chave = `${monthKey}|${c.id}`;
      if (!nivel || (jaAvisado[chave] ?? 0) >= nivel) continue;
      novos[chave] = nivel;
      linhas.push(nivel === 100
        ? `${cc.name} estourou o orçamento do mês (${brl(usado)} de ${brl(orcado)})`
        : `${cc.name} já usou ${Math.floor(pct)}% do previsto este mês (${brl(usado)} de ${brl(orcado)})`);
    }
    await enviar("orcamento", linhas.length ? linhas.join("; ") : null, { sentBudget: novos });
  }

  // ── Resumo semanal (segunda) ou mensal (dia 1) ─────────────────────────────
  if (on("resumo")) {
    const mensal = cfg.resumoFreq === "mensal";
    const hoje = dowOf(today) === 1 && !mensal || today.endsWith("-01") && mensal;
    if (hoje && sent.resumo !== today) {
      let de: string; let ate: string; let periodo: string;
      if (mensal) {
        const prev = addDays(today, -1);
        de = `${prev.slice(0, 7)}-01`; ate = prev; periodo = `do mês ${prev.slice(5, 7)}/${prev.slice(0, 4)}`;
      } else {
        de = addDays(today, -7); ate = addDays(today, -1); periodo = `da semana (${brDate(de)} a ${brDate(ate)})`;
      }
      const fluxo = (await lerCashflow()).filter((x) => {
        const d = String(x.date ?? "").slice(0, 10);
        return d >= de && d <= ate && !isInvestmentMovement(String(x.category ?? ""), String(x.description ?? ""));
      });
      const receita = fluxo.filter((x) => x.type === "entrada").reduce((s, x) => s + (Number(x.amount) || 0), 0);
      const porCategoria = new Map<string, number>();
      let despesa = 0;
      for (const x of fluxo) {
        if (x.type !== "saida") continue;
        const v = Number(x.amount) || 0;
        despesa += v;
        const cat = String(x.category ?? "").trim() || "Sem categoria";
        porCategoria.set(cat, (porCategoria.get(cat) ?? 0) + v);
      }
      const top = [...porCategoria.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
      await enviar("resumo", fluxo.length
        ? `resumo ${periodo}: receita ${brl(receita)}, despesa ${brl(despesa)}, resultado ${brl(receita - despesa)}` +
          (top.length ? `. Maiores gastos: ${top.map(([c, v]) => `${c} ${brl(v)}`).join(", ")}` : "") +
          `. Relatório completo em Relatórios`
        : null);
    }
  }

  return out;
}
