// lib/rh/irpfPdf.ts
// PDF do demonstrativo anual de IRPF. SOMENTE servidor. Mesmo padrão do holerite
// (import() dinâmico do jspdf, devolve Buffer, sempre em português).

import type { DemonstrativoIrpf } from "./irpf";
import { AVISO_CONTADOR } from "./holeritePdf";

const brl = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
type RGB = [number, number, number];
const AZUL: RGB = [13, 34, 71];
const CINZA_TXT: RGB = [90, 98, 112];
const BORDA: RGB = [214, 219, 228];

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const TIPO_EVENTO: Record<string, string> = { ferias: "Férias", decimo1: "13º — 1ª parcela", decimo2: "13º — 2ª parcela", rescisao: "Rescisão" };
const nomeMes = (comp: string) => MESES[Number(comp.split("-")[1]) - 1] ?? comp;

export interface IrpfPdfDados {
  empresa: { nome: string; cnpj?: string };
  colaborador: { nome: string; cargo: string; cpfMascarado: string };
  demonstrativo: DemonstrativoIrpf;
}

export async function buildIrpfPdf(d: IrpfPdfDados): Promise<Buffer> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const mx = 40;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const fim = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const dm = d.demonstrativo;

  doc.setFillColor(...AZUL);
  doc.rect(0, 0, pageW, 78, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(d.empresa.nome, mx, 38);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  if (d.empresa.cnpj) doc.text(`CNPJ ${d.empresa.cnpj}`, mx, 54);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Demonstrativo de IRPF", pageW - mx, 36, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Ano-calendário ${dm.ano}`, pageW - mx, 54, { align: "right" });

  doc.setTextColor(25, 30, 40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(d.colaborador.nome, mx, 102);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...CINZA_TXT);
  doc.text(`${d.colaborador.cargo || "—"}  ·  CPF ${d.colaborador.cpfMascarado}`, mx, 116);

  const estilos = {
    theme: "plain" as const,
    margin: { left: mx, right: mx },
    styles: { fontSize: 9, cellPadding: { top: 5, bottom: 5, left: 6, right: 6 }, textColor: [25, 30, 40] as RGB, lineColor: BORDA, lineWidth: { bottom: 0.5 } as never },
    headStyles: { fillColor: AZUL, textColor: 255, fontStyle: "bold" as const, lineWidth: 0 },
  };
  const dir = { 1: { halign: "right" as const }, 2: { halign: "right" as const }, 3: { halign: "right" as const }, 4: { halign: "right" as const } };

  autoTable(doc, {
    ...estilos, startY: 130,
    head: [["Mês", "Rendimento tributável", "INSS", "Dependentes", "IRRF retido"]],
    body: (dm.meses.length ? dm.meses.map((m) => [nomeMes(m.comp), brl(m.rendimento), brl(m.inss), String(m.dependentes), `${brl(m.irrf)}${m.metodo === "simplificado" ? " *" : ""}`])
      : [[{ content: "Nenhuma folha fechada neste ano.", colSpan: 5, styles: { halign: "center", fontStyle: "italic", textColor: CINZA_TXT } }]]) as never,
    columnStyles: dir,
    didParseCell: (h) => { if (h.section === "head" && h.column.index > 0) h.cell.styles.halign = "right"; },
  });

  let y = fim() + 18;
  if (dm.eventos.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...CINZA_TXT);
    doc.text("FÉRIAS, 13º E RESCISÃO", mx, y);
    autoTable(doc, {
      ...estilos, startY: y + 6,
      head: [["Evento", "Rend. tributável", "13º (excl.)", "INSS", "IRRF retido"]],
      body: dm.eventos.map((e) => [`${TIPO_EVENTO[e.tipo] ?? e.tipo} — ${nomeMes(e.comp)}`, brl(e.rendimentoNormal), brl(e.rendimento13), brl(e.inss), brl(e.irrf)]) as never,
      columnStyles: dir,
      didParseCell: (h) => { if (h.section === "head" && h.column.index > 0) h.cell.styles.halign = "right"; },
    });
    y = fim() + 18;
  }

  autoTable(doc, {
    ...estilos, startY: y,
    head: [["Totais do ano", "", "", "", ""]],
    body: [
      ["Rendimentos tributáveis (mensais)", "", "", "", brl(dm.totais.rendimentos)],
      ["13º salário (tributação exclusiva)", "", "", "", brl(dm.totais.rendimentos13)],
      ["INSS (contribuição previdenciária oficial)", "", "", "", brl(dm.totais.inss)],
      ["Imposto de renda retido na fonte", "", "", "", brl(dm.totais.irrf)],
    ] as never,
    columnStyles: { 4: { halign: "right", fontStyle: "bold" } },
  });
  y = fim() + 14;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...CINZA_TXT);
  const notas = [
    "Considera apenas folhas e eventos fechados. (*) IRRF calculado pelo desconto simplificado.",
    "Documento gerencial de conferência: o Informe de Rendimentos oficial é emitido pelo contador/empresa.",
  ];
  for (const n of notas) { const l = doc.splitTextToSize(n, pageW - mx * 2) as string[]; doc.text(l, mx, y); y += l.length * 10 + 3; }

  doc.setDrawColor(...BORDA);
  doc.line(mx, pageH - 52, pageW - mx, pageH - 52);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(150, 90, 0);
  doc.text(AVISO_CONTADOR, mx, pageH - 38);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...CINZA_TXT);
  doc.text(`Gerado em ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} pelo NexusFi`, mx, pageH - 25);
  return Buffer.from(doc.output("arraybuffer"));
}
