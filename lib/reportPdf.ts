// ─── Exportação de Relatórios em PDF ──────────────────────────────────────────
//
// Gera um PDF da aba ativa da página de Relatórios (Fluxo de Caixa, Faturamento
// ou DRE) para o período selecionado. Usado só no cliente, via import() dinâmico
// em app/[locale]/relatorios/page.tsx — jspdf não entra no bundle inicial.
//
// i18n: quem gera passa `locale` + `messages` (o objeto completo de mensagens,
// de `useMessages()`); os rótulos saem de `relatorios.pdf` e os nomes de
// categoria passam por `categoryLabel` (namespace `categories`). Moeda em BRL.

import { createTranslator, type AbstractIntlMessages } from "next-intl";
import { formatMoney } from "@/lib/format";
import { categoryLabel } from "@/lib/cashflowCategories";

export type ReportTab = "fluxo" | "faturamento" | "gastos" | "dre";

interface ClosingRow {
  label: string;
  count: number;
  entradas: number;
  saidas: number;
  saldo: number;
  done: boolean;
}

export interface ReportData {
  tab: ReportTab;
  periodLabel: string;
  generatedAt: Date;
  userLabel?: string;
  locale: string;
  messages: Record<string, unknown>;

  metrics?: { entradas: number; saidas: number; saldo: number; taxaConciliacao: number; total: number };
  txs?: { date: string; description: string; category: string; type: "entrada" | "saida"; amount: number; reconciled?: boolean }[];
  closings?: ClosingRow[];

  faturamento?: {
    granularity: "dia" | "mes";
    rows: { label: string; total: number }[];
    total: number;
    average: number;
    countLabel: string;
    ticketMedio: number;
    projection?: { remainingLabel: string; projectedRemaining: number; projectedTotal: number };
  };

  dre?: {
    receita: number; impostos: number; receitaLiquida: number; cmv: number;
    lucroBruto: number; despesas: number; lucroLiquido: number; margemLiquida: number;
    receitaCats?: { name: string; total: number }[];
    impostosCats?: { name: string; total: number }[];
    cmvCats?: { name: string; total: number }[];
    despesasCats?: { name: string; total: number }[];
  };

  gastos?: {
    total: number;
    categorias: number;
    rows: { name: string; total: number; pct: number }[];
  };
}

const shortDate = (d: string) => `${d.split("-")[2]}/${d.split("-")[1]}`;

export async function exportReportPdf(data: ReportData): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const msgs = data.messages as AbstractIntlMessages;
  // O augmentation global de `IntlMessages` tornaria os namespaces/chaves
  // estritos aqui e o TS colapsaria para `never` (mensagens vêm soltas de
  // `useMessages()`). Um alias solto resolve — o i18n:check garante as chaves.
  type LooseT = (key: string, values?: Record<string, string | number>) => string;
  const t = createTranslator({ locale: data.locale, messages: msgs, namespace: "relatorios.pdf" }) as unknown as LooseT;
  const tCat = createTranslator({ locale: data.locale, messages: msgs, namespace: "categories" }) as unknown as (k: string) => string;
  const catLabel = (name: string) => categoryLabel(name, tCat);
  const BRL = (n: number) => formatMoney(n, data.locale);

  const TAB_LABEL: Record<ReportTab, string> = {
    fluxo: t("tabFluxo"),
    faturamento: t("tabFaturamento"),
    gastos: t("tabGastos"),
    dre: t("tabDre"),
  };

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const marginX = 40;

  // ── Cabeçalho ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(t("title"), marginX, 48);

  doc.setFontSize(11);
  doc.setTextColor(90);
  doc.text(`${TAB_LABEL[data.tab]}  ·  ${data.periodLabel}`, marginX, 66);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(130);
  const gen = data.generatedAt.toLocaleString(data.locale);
  doc.text(`${t("generatedAt", { when: gen })}${data.userLabel ? `  ·  ${data.userLabel}` : ""}`, marginX, 80);
  doc.setTextColor(0);

  let y = 100;

  const heading = (txt: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(30);
    doc.text(txt, marginX, y);
    doc.setTextColor(0);
    y += 8;
  };

  const afterTable = () => {
    // @ts-expect-error lastAutoTable é anexado pelo plugin em runtime
    y = (doc.lastAutoTable?.finalY ?? y) + 24;
  };

  if (data.tab === "fluxo" && data.metrics) {
    heading(t("periodSummary"));
    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      theme: "plain",
      styles: { fontSize: 10 },
      body: [
        [t("totalInflows"), BRL(data.metrics.entradas)],
        [t("totalOutflows"), BRL(data.metrics.saidas)],
        [t("netBalance"), BRL(data.metrics.saldo)],
        [t("entries"), String(data.metrics.total)],
        [t("reconciliation"), `${data.metrics.taxaConciliacao.toFixed(0)}%`],
      ],
      columnStyles: { 0: { textColor: 90 }, 1: { halign: "right", fontStyle: "bold" } },
    });
    afterTable();

    if (data.closings && data.closings.length) {
      heading(t("closingByPeriod"));
      autoTable(doc, {
        startY: y,
        margin: { left: marginX, right: marginX },
        headStyles: { fillColor: [30, 41, 59] },
        styles: { fontSize: 9 },
        head: [[t("colPeriod"), t("colEntries"), t("colInflows"), t("colOutflows"), t("colBalance"), t("colStatus")]],
        body: data.closings.map((c) => [
          c.label,
          String(c.count),
          BRL(c.entradas),
          BRL(c.saidas),
          BRL(c.saldo),
          c.done ? t("statusDone") : t("statusPending"),
        ]),
        columnStyles: {
          1: { halign: "center" },
          2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" },
          5: { halign: "center" },
        },
      });
      afterTable();
    }

    if (data.txs && data.txs.length) {
      heading(t("entriesHeading"));
      autoTable(doc, {
        startY: y,
        margin: { left: marginX, right: marginX },
        headStyles: { fillColor: [30, 41, 59] },
        styles: { fontSize: 8 },
        head: [[t("colDate"), t("colDescription"), t("colCategory"), t("colTxStatus"), t("colAmount")]],
        body: data.txs.map((tx) => [
          shortDate(tx.date),
          tx.description,
          catLabel(tx.category),
          tx.reconciled ? t("reconciled") : t("pending"),
          `${tx.type === "entrada" ? "+" : "-"}${BRL(tx.amount)}`,
        ]),
        columnStyles: { 4: { halign: "right" } },
      });
      afterTable();
    }
  }

  if (data.tab === "faturamento" && data.faturamento) {
    const f = data.faturamento;
    heading(t("summary"));
    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      theme: "plain",
      styles: { fontSize: 10 },
      body: [
        [t("grossRevenue"), BRL(f.total)],
        [t("estTicket"), BRL(f.ticketMedio)],
        [f.granularity === "mes" ? t("averagePerMonth") : t("averagePerDay"), BRL(f.average)],
        [t("period"), f.countLabel],
      ],
      columnStyles: { 0: { textColor: 90 }, 1: { halign: "right", fontStyle: "bold" } },
    });
    afterTable();

    heading(f.granularity === "mes" ? t("revenueStatementMonthly") : t("revenueStatementDaily"));
    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      headStyles: { fillColor: [30, 41, 59] },
      styles: { fontSize: 9 },
      head: [[f.granularity === "mes" ? t("colMonth") : t("colDay"), t("colRevenue")]],
      body: f.rows.map((r) => [r.label, BRL(r.total)]),
      foot: [[t("total"), BRL(f.total)]],
      columnStyles: { 1: { halign: "right" } },
      footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold", halign: "right" },
    });
    afterTable();

    if (f.projection) {
      heading(t("projection"));
      autoTable(doc, {
        startY: y,
        margin: { left: marginX, right: marginX },
        theme: "plain",
        styles: { fontSize: 10 },
        body: [
          [t("realizedToday"), BRL(f.total)],
          [t("projectedRemaining", { label: f.projection.remainingLabel }), BRL(f.projection.projectedRemaining)],
          [t("projectedTotal"), BRL(f.projection.projectedTotal)],
        ],
        columnStyles: { 0: { textColor: 90 }, 1: { halign: "right", fontStyle: "bold" } },
      });
      afterTable();
    }
  }

  if (data.tab === "gastos" && data.gastos) {
    const g = data.gastos;
    heading(t("summary"));
    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      theme: "plain",
      styles: { fontSize: 10 },
      body: [
        [t("totalExpenses"), BRL(g.total)],
        [t("categories"), String(g.categorias)],
        [t("topCategory"), g.rows[0] ? `${catLabel(g.rows[0].name)} — ${BRL(g.rows[0].total)} (${g.rows[0].pct.toFixed(1)}%)` : "—"],
      ],
      columnStyles: { 0: { textColor: 90 }, 1: { halign: "right", fontStyle: "bold" } },
    });
    afterTable();

    heading(t("expensesByCategory"));
    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      headStyles: { fillColor: [30, 41, 59] },
      styles: { fontSize: 9 },
      head: [[t("colCategory"), t("colValue"), "%"]],
      body: g.rows.map((r) => [catLabel(r.name), BRL(r.total), `${r.pct.toFixed(1)}%`]),
      foot: [[t("total"), BRL(g.total), "100%"]],
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
      footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold", halign: "right" },
    });
    afterTable();
  }

  if (data.tab === "dre" && data.dre) {
    const d = data.dre;
    heading(t("dreHeading"));

    // Cada linha componente vem seguida das categorias que a compõem (o mesmo
    // detalhamento que fica recolhido na tela).
    const detail = (cats?: { name: string; total: number }[]) =>
      (cats ?? []).map((c) => [`    ${catLabel(c.name)}`, BRL(c.total)]);

    const body = [
      [t("dreGrossRevenue"), BRL(d.receita)],
      ...detail(d.receitaCats),
      [t("dreDeductions"), `-${BRL(d.impostos)}`],
      ...detail(d.impostosCats),
      [t("dreNetRevenue"), BRL(d.receitaLiquida)],
      [t("dreCmv"), `-${BRL(d.cmv)}`],
      ...detail(d.cmvCats),
      [t("dreGrossProfit"), BRL(d.lucroBruto)],
      [t("dreOpExpenses"), `-${BRL(d.despesas)}`],
      ...detail(d.despesasCats),
      [t("dreNetProfit"), BRL(d.lucroLiquido)],
      [t("dreMargin"), `${d.margemLiquida.toFixed(1)}%`],
    ];
    const marginRowIndex = body.length - 1;

    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      styles: { fontSize: 10 },
      headStyles: { fillColor: [30, 41, 59] },
      head: [[t("colLine"), t("colValue")]],
      body,
      columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
      didParseCell: (h) => {
        const raw = h.row.raw as unknown;
        const label = Array.isArray(raw) ? String(raw[0] ?? "") : "";
        if (h.section !== "body") return;
        if (label.trimStart().startsWith("=") || h.row.index === marginRowIndex) {
          h.cell.styles.fillColor = [241, 245, 249];
        } else if (label.startsWith("    ")) {
          h.cell.styles.textColor = 120;
          h.cell.styles.fontSize = 8.5;
          h.cell.styles.fontStyle = "normal";
        }
      },
    });
    afterTable();
  }

  const slugPeriod = data.periodLabel.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
  doc.save(`${t("fileSlug")}-${data.tab}-${slugPeriod}.pdf`);
}
