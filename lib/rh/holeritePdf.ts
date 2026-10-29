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

type RGB = [number, number, number];
const AZUL: RGB = [13, 34, 71];
const CINZA_TXT: RGB = [90, 98, 112];
const CINZA_BG: RGB = [243, 245, 249];
const BORDA: RGB = [214, 219, 228];

function nomeCompetencia(comp: string): string {
  const [ano, mes] = comp.split("-").map(Number);
  const nome = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(ano, mes - 1, 1)));
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} de ${ano}`;
}

export async function buildHoleritePdf(d: HoleriteDados): Promise<Buffer> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const mx = 40;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const larg = pageW - mx * 2;
  const fim = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  // Marca d'água da prévia: cor bem clara (sem transparência, que alguns
  // visualizadores não renderizam) e desenhada ANTES do conteúdo.
  if (d.previa) {
    doc.setTextColor(250, 222, 222);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(90);
    doc.text("PRÉVIA", pageW / 2 - 40, pageH / 2 + 80, { align: "center", angle: 35 });
  }

  // ── Faixa do cabeçalho ──
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
  doc.text(d.titulo, pageW - mx, 36, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(nomeCompetencia(d.competencia), pageW - mx, 54, { align: "right" });

  // ── Identificação do colaborador ──
  let y = 98;
  doc.setFillColor(...CINZA_BG);
  doc.setDrawColor(...BORDA);
  doc.roundedRect(mx, y, larg, 64, 5, 5, "FD");
  const campo = (rotulo: string, valor: string, x: number, yy: number) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...CINZA_TXT);
    doc.text(rotulo.toUpperCase(), x, yy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(25, 30, 40);
    doc.text(valor || "—", x, yy + 13);
  };
  const col2 = mx + larg * 0.45;
  const col3 = mx + larg * 0.75;
  campo("Colaborador", d.colaborador.nome, mx + 12, y + 18);
  campo("Cargo", d.colaborador.cargo, col2, y + 18);
  campo("CPF", d.colaborador.cpfMascarado, col3, y + 18);
  campo("Admissão", d.colaborador.admissao ? d.colaborador.admissao.split("-").reverse().join("/") : "", mx + 12, y + 46);
  campo("Dependentes (IRRF)", String(d.colaborador.dependentes), col2, y + 46);
  y += 82;

  // ── Verbas ──
  const corpo = d.linhas.length
    ? d.linhas.map((l) => [
        l.codigo, l.informativo ? `${l.descricao} (informativo)` : l.descricao, l.ref ?? "",
        l.provento ? brl(l.provento) : "", l.desconto ? brl(l.desconto) : "",
      ])
    : [[{ content: "Nenhum lançamento nesta competência.", colSpan: 5, styles: { halign: "center", fontStyle: "italic", textColor: CINZA_TXT, cellPadding: 14 } }]];
  autoTable(doc, {
    startY: y,
    margin: { left: mx, right: mx },
    theme: "plain",
    head: [["Cód.", "Descrição", "Referência", "Proventos", "Descontos"]],
    body: corpo as never,
    styles: { fontSize: 9, cellPadding: { top: 6, bottom: 6, left: 6, right: 6 }, textColor: [25, 30, 40], lineColor: BORDA, lineWidth: { bottom: 0.5 } as never },
    headStyles: { fillColor: AZUL, textColor: 255, fontStyle: "bold", lineWidth: 0 },
    alternateRowStyles: { fillColor: [250, 251, 253] },
    columnStyles: { 0: { cellWidth: 44 }, 2: { cellWidth: 70, textColor: CINZA_TXT }, 3: { halign: "right", cellWidth: 85 }, 4: { halign: "right", cellWidth: 85 } },
    didParseCell: (h) => {
      if (h.section === "head" && (h.column.index === 3 || h.column.index === 4)) h.cell.styles.halign = "right";
    },
  });
  y = fim() + 16;

  // ── Totais e líquido ──
  const caixa = (rotulo: string, valor: string, x: number, w: number, destaque = false) => {
    if (destaque) doc.setFillColor(...AZUL); else doc.setFillColor(...CINZA_BG);
    doc.setDrawColor(...BORDA);
    doc.roundedRect(x, y, w, 46, 5, 5, destaque ? "F" : "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...(destaque ? ([200, 210, 230] as RGB) : CINZA_TXT));
    doc.text(rotulo.toUpperCase(), x + 12, y + 17);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(destaque ? 15 : 12);
    doc.setTextColor(...(destaque ? ([255, 255, 255] as RGB) : ([25, 30, 40] as RGB)));
    doc.text(valor, x + 12, y + 36);
  };
  const gap = 10;
  const wBox = (larg - gap * 2) / 3.2;
  caixa("Total de proventos", brl(d.totais.proventos), mx, wBox);
  caixa("Total de descontos", brl(d.totais.descontos), mx + wBox + gap, wBox);
  caixa("Líquido a receber", brl(d.totais.liquido), mx + (wBox + gap) * 2, larg - (wBox + gap) * 2, true);
  y += 64;

  // ── Bases de cálculo ──
  if (d.bases.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...CINZA_TXT);
    doc.text("BASES DE CÁLCULO", mx, y);
    y += 8;
    const n = d.bases.length;
    const w = (larg - gap * (n - 1)) / n;
    d.bases.forEach((b, i) => {
      const x = mx + i * (w + gap);
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(...BORDA);
      doc.roundedRect(x, y, w, 36, 4, 4, "FD");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...CINZA_TXT);
      doc.text(b.rotulo, x + 8, y + 14);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(25, 30, 40);
      doc.text(brl(b.valor), x + 8, y + 28);
    });
    y += 54;
  }

  // ── Notas ──
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...CINZA_TXT);
  for (const nota of d.notas ?? []) {
    const linhas = doc.splitTextToSize(nota, larg) as string[];
    doc.text(linhas, mx, y);
    y += linhas.length * 10 + 4;
  }

  // ── Assinatura ──
  const ySig = Math.max(y + 36, pageH - 150);
  doc.setDrawColor(120);
  doc.line(mx, ySig, mx + 230, ySig);
  doc.line(pageW - mx - 120, ySig, pageW - mx, ySig);
  doc.setFontSize(8);
  doc.setTextColor(...CINZA_TXT);
  doc.text("Assinatura do colaborador", mx, ySig + 12);
  doc.text("Data", pageW - mx - 120, ySig + 12);

  // ── Rodapé ──
  doc.setDrawColor(...BORDA);
  doc.line(mx, pageH - 52, pageW - mx, pageH - 52);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(150, 90, 0);
  doc.text(AVISO_CONTADOR, mx, pageH - 38);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...CINZA_TXT);
  doc.text(`Gerado em ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} pelo NexusFi${d.previa ? " — PRÉVIA, sem valor como recibo" : ""}`, mx, pageH - 25);

  return Buffer.from(doc.output("arraybuffer"));
}
