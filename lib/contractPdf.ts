// lib/contractPdf.ts
// Geração do PDF do contrato assinado. SOMENTE server-side (rota
// app/api/billing/contract + finalização do pagamento em lib/contractFinalize).
// Mesmo padrão de lib/reportPdf.ts: import() dinâmico do jspdf, sem doc.save().

import { renderContractText, renderAceiteBloco } from "./contractText";
import type { ContractDoc } from "./contract";

/** Gera o PDF do contrato e devolve como Buffer (pronto pra anexo de e-mail / download). */
export async function buildContractPdf(c: ContractDoc): Promise<Buffer> {
  const { jsPDF } = await import("jspdf");

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const marginX = 48;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - marginX * 2;
  const bottom = pageH - 56;

  let y = 56;

  const ensureSpace = (needed: number) => {
    if (y + needed > bottom) {
      doc.addPage();
      y = 56;
    }
  };

  const paragraph = (
    text: string,
    opts: { size?: number; style?: "normal" | "bold"; gap?: number; color?: number } = {}
  ) => {
    const { size = 10, style = "normal", gap = 6, color = 20 } = opts;
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(color);
    const lines = doc.splitTextToSize(text, contentW) as string[];
    const lineH = size * 1.4;
    for (const line of lines) {
      ensureSpace(lineH);
      doc.text(line, marginX, y);
      y += lineH;
    }
    y += gap;
  };

  const rendered = renderContractText({
    contratante: c.contratante,
    signatario: c.signatario,
    planId: c.planId,
    planLabel: c.planLabel,
    priceCents: c.priceCents,
  });

  // ── Cabeçalho ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(13, 34, 71);
  doc.text("NexusFi", marginX, y);
  y += 22;

  paragraph(rendered.title, { size: 13, style: "bold", gap: 14, color: 13 });

  // ── Preâmbulo ──
  for (const para of rendered.preamble) paragraph(para, { gap: 8 });
  y += 4;

  // ── Cláusulas ──
  for (const clause of rendered.clauses) {
    ensureSpace(30);
    paragraph(clause.heading, { size: 11, style: "bold", gap: 4, color: 13 });
    for (const b of clause.body) paragraph(b, { gap: 5 });
    y += 4;
  }

  // ── Bloco de aceite eletrônico ──
  ensureSpace(60);
  y += 8;
  doc.setDrawColor(200);
  doc.line(marginX, y, pageW - marginX, y);
  y += 16;
  paragraph("Aceite eletrônico", { size: 11, style: "bold", gap: 4, color: 13 });
  paragraph(
    renderAceiteBloco({
      nome: c.signatario.nome,
      cpf: c.signatario.cpf,
      email: c.signatario.email,
      acceptedAt: c.acceptedAt,
      ip: c.ip,
      hash: c.hash,
      contractVersion: c.contractVersion,
    }),
    { size: 9, color: 90, gap: 6 }
  );
  if (c.transactionNsu) {
    paragraph(
      `Pagamento confirmado em ${
        c.paidAt ? new Date(c.paidAt).toLocaleString("pt-BR") : "—"
      } · referência da transação: ${c.transactionNsu}.`,
      { size: 9, color: 90, gap: 4 }
    );
  }

  // ── Rodapé em todas as páginas ──
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `NexusFi — CNPJ 68.919.873/0001-36 · Documento ${c.hash.slice(0, 16)}… · Página ${i}/${pages}`,
      marginX,
      pageH - 32
    );
  }

  const ab = doc.output("arraybuffer") as ArrayBuffer;
  return Buffer.from(ab);
}
