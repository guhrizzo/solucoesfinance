// ─── Exportação de Relatórios em PDF ──────────────────────────────────────────
//
// Gera um PDF da aba ativa da página de Relatórios (Fluxo de Caixa, Faturamento
// ou DRE) para o período selecionado. Usado só no cliente, via import() dinâmico
// em app/relatorios/page.tsx — jspdf não entra no bundle inicial.

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

const BRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const shortDate = (d: string) => `${d.split("-")[2]}/${d.split("-")[1]}`;

const TAB_LABEL: Record<ReportTab, string> = {
  fluxo: "Fluxo de Caixa",
  faturamento: "Faturamento",
  gastos: "Relatório de Gastos",
  dre: "Demonstração do Resultado (DRE)",
};

export async function exportReportPdf(data: ReportData): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const marginX = 40;

  // ── Cabeçalho ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Relatórios & Conciliação", marginX, 48);

  doc.setFontSize(11);
  doc.setTextColor(90);
  doc.text(`${TAB_LABEL[data.tab]}  ·  ${data.periodLabel}`, marginX, 66);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(130);
  const gen = data.generatedAt.toLocaleString("pt-BR");
  doc.text(`Gerado em ${gen}${data.userLabel ? `  ·  ${data.userLabel}` : ""}`, marginX, 80);
  doc.setTextColor(0);

  let y = 100;

  const heading = (t: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(30);
    doc.text(t, marginX, y);
    doc.setTextColor(0);
    y += 8;
  };

  const afterTable = () => {
    // @ts-expect-error lastAutoTable é anexado pelo plugin em runtime
    y = (doc.lastAutoTable?.finalY ?? y) + 24;
  };

  if (data.tab === "fluxo" && data.metrics) {
    heading("Resumo do período");
    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      theme: "plain",
      styles: { fontSize: 10 },
      body: [
        ["Total de entradas", BRL(data.metrics.entradas)],
        ["Total de saídas", BRL(data.metrics.saidas)],
        ["Saldo líquido", BRL(data.metrics.saldo)],
        ["Lançamentos", String(data.metrics.total)],
        ["Conciliação", `${data.metrics.taxaConciliacao.toFixed(0)}%`],
      ],
      columnStyles: { 0: { textColor: 90 }, 1: { halign: "right", fontStyle: "bold" } },
    });
    afterTable();

    if (data.closings && data.closings.length) {
      heading("Fechamento de caixa por período");
      autoTable(doc, {
        startY: y,
        margin: { left: marginX, right: marginX },
        headStyles: { fillColor: [30, 41, 59] },
        styles: { fontSize: 9 },
        head: [["Período", "Lançamentos", "Entradas", "Saídas", "Saldo", "Status"]],
        body: data.closings.map((c) => [
          c.label,
          String(c.count),
          BRL(c.entradas),
          BRL(c.saidas),
          BRL(c.saldo),
          c.done ? "Conferido" : "Pendente",
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
      heading("Lançamentos");
      autoTable(doc, {
        startY: y,
        margin: { left: marginX, right: marginX },
        headStyles: { fillColor: [30, 41, 59] },
        styles: { fontSize: 8 },
        head: [["Data", "Descrição", "Categoria", "Status", "Valor"]],
        body: data.txs.map((t) => [
          shortDate(t.date),
          t.description,
          t.category,
          t.reconciled ? "Conciliado" : "Pendente",
          `${t.type === "entrada" ? "+" : "-"}${BRL(t.amount)}`,
        ]),
        columnStyles: { 4: { halign: "right" } },
      });
      afterTable();
    }
  }

  if (data.tab === "faturamento" && data.faturamento) {
    const f = data.faturamento;
    heading("Resumo");
    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      theme: "plain",
      styles: { fontSize: 10 },
      body: [
        ["Receita bruta", BRL(f.total)],
        ["Ticket médio estimado", BRL(f.ticketMedio)],
        [`Média por ${f.granularity === "mes" ? "mês" : "dia"}`, BRL(f.average)],
        ["Período", f.countLabel],
      ],
      columnStyles: { 0: { textColor: 90 }, 1: { halign: "right", fontStyle: "bold" } },
    });
    afterTable();

    heading(`Demonstrativo de faturamento — ${f.granularity === "mes" ? "mensal" : "diário"}`);
    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      headStyles: { fillColor: [30, 41, 59] },
      styles: { fontSize: 9 },
      head: [[f.granularity === "mes" ? "Mês" : "Dia", "Faturamento"]],
      body: f.rows.map((r) => [r.label, BRL(r.total)]),
      foot: [["Total", BRL(f.total)]],
      columnStyles: { 1: { halign: "right" } },
      footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold", halign: "right" },
    });
    afterTable();

    if (f.projection) {
      heading("Projeção");
      autoTable(doc, {
        startY: y,
        margin: { left: marginX, right: marginX },
        theme: "plain",
        styles: { fontSize: 10 },
        body: [
          ["Realizado até hoje", BRL(f.total)],
          [`Projeção do restante (${f.projection.remainingLabel})`, BRL(f.projection.projectedRemaining)],
          ["Projeção total", BRL(f.projection.projectedTotal)],
        ],
        columnStyles: { 0: { textColor: 90 }, 1: { halign: "right", fontStyle: "bold" } },
      });
      afterTable();
    }
  }

  if (data.tab === "gastos" && data.gastos) {
    const g = data.gastos;
    heading("Resumo");
    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      theme: "plain",
      styles: { fontSize: 10 },
      body: [
        ["Total de gastos", BRL(g.total)],
        ["Categorias", String(g.categorias)],
        ["Maior categoria", g.rows[0] ? `${g.rows[0].name} — ${BRL(g.rows[0].total)} (${g.rows[0].pct.toFixed(1)}%)` : "—"],
      ],
      columnStyles: { 0: { textColor: 90 }, 1: { halign: "right", fontStyle: "bold" } },
    });
    afterTable();

    heading("Gastos por categoria");
    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      headStyles: { fillColor: [30, 41, 59] },
      styles: { fontSize: 9 },
      head: [["Categoria", "Valor", "%"]],
      body: g.rows.map((r) => [r.name, BRL(r.total), `${r.pct.toFixed(1)}%`]),
      foot: [["Total", BRL(g.total), "100%"]],
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
      footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold", halign: "right" },
    });
    afterTable();
  }

  if (data.tab === "dre" && data.dre) {
    const d = data.dre;
    heading("Demonstração do Resultado do Exercício");

    // Cada linha componente vem seguida das categorias que a compõem (o mesmo
    // detalhamento que fica recolhido na tela).
    const detail = (cats?: { name: string; total: number }[]) =>
      (cats ?? []).map((c) => [`    ${c.name}`, BRL(c.total)]);

    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      styles: { fontSize: 10 },
      headStyles: { fillColor: [30, 41, 59] },
      head: [["Linha", "Valor"]],
      body: [
        ["Receita Operacional Bruta", BRL(d.receita)],
        ...detail(d.receitaCats),
        ["(-) Deduções e Impostos", `-${BRL(d.impostos)}`],
        ...detail(d.impostosCats),
        ["= Receita Operacional Líquida", BRL(d.receitaLiquida)],
        ["(-) Custo da Mercadoria Vendida (CMV)", `-${BRL(d.cmv)}`],
        ...detail(d.cmvCats),
        ["= Lucro Bruto", BRL(d.lucroBruto)],
        ["(-) Despesas Operacionais", `-${BRL(d.despesas)}`],
        ...detail(d.despesasCats),
        ["= Lucro Líquido do Exercício", BRL(d.lucroLiquido)],
        ["Margem Líquida", `${d.margemLiquida.toFixed(1)}%`],
      ],
      columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
      didParseCell: (h) => {
        const raw = h.row.raw as unknown;
        const label = Array.isArray(raw) ? String(raw[0] ?? "") : "";
        if (h.section !== "body") return;
        if (label.startsWith("=") || label.startsWith("Margem")) {
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
  doc.save(`relatorio-${data.tab}-${slugPeriod}.pdf`);
}
