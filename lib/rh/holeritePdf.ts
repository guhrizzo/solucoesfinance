// lib/rh/holeritePdf.ts
// PDF do holerite (folha mensal) e dos recibos de férias, 13º e rescisão.
// SOMENTE servidor. Mesmo padrão de lib/contractPdf.ts: import() dinâmico do
// jspdf, devolve Buffer. O documento é sempre em português (documento
// trabalhista brasileiro).

export const AVISO_CONTADOR = "Cálculos devem ser conferidos pelo contador responsável.";

export interface HoleriteDados {
  titulo: string;
  /** Folha ainda aberta: marca d'água "PRÉVIA". */
  previa: boolean;
  empresa: { nome: string; cnpj?: string };
  colaborador: { nome: string; cargo: string; cpfMascarado: string; admissao: string; dependentes: number };
  competencia: string;
  linhas: { codigo: string; descricao: string; ref?: string; provento?: number; desconto?: number; informativo?: boolean }[];
  bases: { rotulo: string; valor: number }[];
  totais: { proventos: number; descontos: number; liquido: number };
  notas?: string[];
}

const brl = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

export async function buildHoleritePdf(d: HoleriteDados): Promise<Buffer> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const mx = 40;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  let y = 48;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(13, 34, 71);
  doc.text(d.titulo, mx, y);
  y += 18;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60);
  doc.text(`${d.empresa.nome}${d.empresa.cnpj ? ` — CNPJ ${d.empresa.cnpj}` : ""}`, mx, y);
  const [ano, mes] = d.competencia.split("-");
  doc.text(`Competência: ${mes}/${ano}`, pageW - mx, y, { align: "right" });
  y += 20;

  // Identificação do colaborador
  doc.setDrawColor(200);
  doc.rect(mx, y, pageW - mx * 2, 52);
  doc.setTextColor(20);
  doc.setFont("helvetica", "bold");
  doc.text(d.colaborador.nome, mx + 8, y + 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Cargo: ${d.colaborador.cargo || "—"}`, mx + 8, y + 31);
  doc.text(`CPF: ${d.colaborador.cpfMascarado}`, mx + 8, y + 44);
  doc.text(`Admissão: ${d.colaborador.admissao.split("-").reverse().join("/")}`, pageW / 2, y + 31);
  doc.text(`Dependentes (IRRF): ${d.colaborador.dependentes}`, pageW / 2, y + 44);
  y += 66;

  autoTable(doc, {
    startY: y,
    margin: { left: mx, right: mx },
    head: [["Cód.", "Descrição", "Ref.", "Proventos", "Descontos"]],
    body: d.linhas.map((l) => [
      l.codigo, l.informativo ? `${l.descricao} (informativo)` : l.descricao, l.ref ?? "",
      l.provento ? brl(l.provento) : "", l.desconto ? brl(l.desconto) : "",
    ]),
    foot: [["", "Totais", "", brl(d.totais.proventos), brl(d.totais.descontos)]],
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [13, 34, 71] },
    footStyles: { fillColor: [235, 238, 245], textColor: 20, fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 40 }, 2: { cellWidth: 70 }, 3: { halign: "right", cellWidth: 80 }, 4: { halign: "right", cellWidth: 80 } },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(13, 34, 71);
  doc.text(`Líquido a receber: ${brl(d.totais.liquido)}`, pageW - mx, y, { align: "right" });
  y += 22;

  if (d.bases.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: mx, right: mx },
      head: [d.bases.map((b) => b.rotulo)],
      body: [d.bases.map((b) => brl(b.valor))],
      styles: { fontSize: 8, cellPadding: 3, halign: "center" },
      headStyles: { fillColor: [90, 100, 120] },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(90);
  for (const n of d.notas ?? []) {
    const lines = doc.splitTextToSize(n, pageW - mx * 2) as string[];
    doc.text(lines, mx, y);
    y += lines.length * 10;
  }
  doc.setFont("helvetica", "bold");
  doc.text(AVISO_CONTADOR, mx, pageH - 36);

  if (d.previa) {
    doc.setTextColor(200, 40, 40);
    doc.setFontSize(48);
    doc.text("PRÉVIA", pageW / 2, pageH / 2, { align: "center", angle: 35 });
  }
  return Buffer.from(doc.output("arraybuffer"));
}
