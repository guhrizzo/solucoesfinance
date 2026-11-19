// lib/rh/custoPdf.ts
// PDF do "Custo mensal" do RH, gerado NO NAVEGADOR (jspdf + autotable via
// import dinâmico) a partir dos dados que a tela já carregou. A4 paisagem,
// cabeçalho com a marca NexusFi e marca d'água do logo no fundo de cada página.
//
// A marca d'água é "assada" num PNG pelo canvas (logo girado com alpha baixo),
// em vez de usar GState/opacidade do PDF — alguns visualizadores ignoram a
// transparência do jsPDF, mas todos respeitam o canal alfa de um PNG.

type RGB = [number, number, number];
const NAVY: RGB = [11, 26, 46];
const AZUL: RGB = [0, 150, 214];
const VERDE: RGB = [0, 196, 140];
const TXT: RGB = [30, 41, 59];
const MUTED: RGB = [100, 116, 139];
const BORDA: RGB = [226, 232, 240];
const ZEBRA: RGB = [248, 250, 252];
const NEG: RGB = [220, 38, 38];

export interface CustoPdfLinha {
  nome: string;
  sub: string;
  semSalario: boolean;
  dias: string;
  salario: number;
  /** Adicional noturno + insalubridade + periculosidade. */
  adicionais: number;
  prov13: number;
  provFerias: number;
  encargos: number;
  beneficios: number;
  comissao: number;
  bonus: number;
  total: number;
}

export interface CustoPdfDados {
  empresa: { nome: string; cnpj?: string | null };
  competencia: string;
  situacao: string;
  fechadaPor?: string;
  linhas: CustoPdfLinha[];
  total: number;
  rateio: { nome: string; valor: number; naoAlocado?: boolean }[];
  premissas: string;
  money: (n: number) => string;
  labels: {
    titulo: string; competencia: string; situacao: string; colaboradores: string; total: string;
    totalGeral: string; rateio: string; premissas: string; semSalario: string;
    geradoEm: (data: string) => string; pagina: (n: number, total: number) => string;
    cols: string[]; // colaborador, dias, salário, adicionais, 13º, férias, encargos, benefícios, comissão, bônus, total
  };
  dataGeracao: string;
  nomeArquivo: string;
}

function carregarImagem(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, falha) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => falha(new Error(`Falha ao carregar ${src}`));
    img.src = src;
  });
}

/** Logo com o fundo branco removido (pixels quase brancos viram transparentes). */
function logoSemFundo(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  const escala = Math.min(1, 640 / img.naturalWidth);
  c.width = Math.round(img.naturalWidth * escala);
  c.height = Math.round(img.naturalHeight * escala);
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const px = ctx.getImageData(0, 0, c.width, c.height);
  const d = px.data;
  for (let i = 0; i < d.length; i += 4) {
    const min = Math.min(d[i], d[i + 1], d[i + 2]);
    if (min > 235) d[i + 3] = 0;
    else if (min > 200) d[i + 3] = Math.round(d[i + 3] * ((235 - min) / 35));
  }
  ctx.putImageData(px, 0, 0);
  return c;
}

/** Marca d'água: logo girado e bem claro, num PNG transparente do tamanho da página. */
function marcaDagua(logo: HTMLCanvasElement, pageW: number, pageH: number): string {
  const escala = 1.5; // resolução (a marca é clara e grande; mais que isso só pesa o arquivo)
  const c = document.createElement("canvas");
  c.width = Math.round(pageW * escala);
  c.height = Math.round(pageH * escala);
  const ctx = c.getContext("2d")!;
  const w = c.width * 0.62;
  const h = (w * logo.height) / logo.width;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((-20 * Math.PI) / 180);
  ctx.globalAlpha = 0.065;
  ctx.drawImage(logo, -w / 2, -h / 2, w, h);
  return c.toDataURL("image/png");
}

/** Faixa em degradê azul → verde (a "assinatura" da marca). */
function faixaDegrade(doc: import("jspdf").jsPDF, x: number, y: number, w: number, h: number) {
  const passos = 60;
  const pw = w / passos;
  for (let i = 0; i < passos; i++) {
    const t = i / (passos - 1);
    doc.setFillColor(
      Math.round(AZUL[0] + (VERDE[0] - AZUL[0]) * t),
      Math.round(AZUL[1] + (VERDE[1] - AZUL[1]) * t),
      Math.round(AZUL[2] + (VERDE[2] - AZUL[2]) * t),
    );
    doc.rect(x + i * pw, y, pw + 0.5, h, "F");
  }
}

export async function gerarCustoPdf(d: CustoPdfDados): Promise<Blob> {
  const [{ jsPDF }, { default: autoTable }, logoImg] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    carregarImagem("/nexus_fi_logo_colorido.png"),
  ]);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const mx = 32;
  const larg = pageW - mx * 2;
  doc.setProperties({ title: d.nomeArquivo, creator: "NexusFi", subject: d.labels.titulo });

  const logo = logoSemFundo(logoImg);
  const logoPng = logo.toDataURL("image/png");
  const wm = marcaDagua(logo, pageW, pageH);

  // ── Cabeçalho ──
  const logoH = 26;
  const logoW = (logoH * logo.width) / logo.height;
  doc.addImage(logoPng, "PNG", mx, 26, logoW, logoH, "nexus-logo", "SLOW");
  doc.setDrawColor(...BORDA);
  doc.setLineWidth(0.8);
  doc.line(mx + logoW + 14, 24, mx + logoW + 14, 56);
  doc.setTextColor(...TXT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(d.empresa.nome, mx + logoW + 28, 37);
  if (d.empresa.cnpj) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(`CNPJ ${d.empresa.cnpj}`, mx + logoW + 28, 51);
  }
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text(d.labels.titulo, pageW - mx, 38, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...MUTED);
  doc.text(`${d.labels.competencia}: ${d.competencia}`, pageW - mx, 53, { align: "right" });
  faixaDegrade(doc, mx, 68, larg, 3);

  // ── Indicadores ──
  let y = 86;
  const gap = 12;
  const cardW = (larg - gap * 2) / 3;
  const cards: { rotulo: string; valor: string; extra?: string; destaque?: boolean }[] = [
    { rotulo: d.labels.total, valor: d.money(d.total), destaque: true },
    { rotulo: d.labels.colaboradores, valor: String(d.linhas.length) },
    { rotulo: d.labels.situacao, valor: d.situacao, extra: d.fechadaPor },
  ];
  cards.forEach((c, i) => {
    const x = mx + i * (cardW + gap);
    if (c.destaque) {
      doc.setFillColor(...NAVY);
      doc.roundedRect(x, y, cardW, 54, 6, 6, "F");
      faixaDegrade(doc, x + 14, y + 47, 36, 2.5);
    } else {
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(...BORDA);
      doc.roundedRect(x, y, cardW, 54, 6, 6, "FD");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...(c.destaque ? ([190, 205, 225] as RGB) : MUTED));
    doc.text(c.rotulo.toUpperCase(), x + 14, y + 17);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...(c.destaque ? ([255, 255, 255] as RGB) : TXT));
    doc.text(c.valor, x + 14, y + 38);
    if (c.extra) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text(c.extra, x + cardW - 14, y + 38, { align: "right" });
    }
  });
  y += 54 + 16;

  // ── Tabela ──
  const soma = (k: keyof CustoPdfLinha) => d.linhas.reduce((s, l) => s + (l[k] as number), 0);
  const subs = new Map<number, { nome: string; sub: string; semSalario: boolean }>();
  const body = d.linhas.map((l, i) => {
    subs.set(i, { nome: l.nome, sub: l.sub, semSalario: l.semSalario });
    return [
      `${l.nome}\n${l.sub}${l.semSalario ? ` · ${d.labels.semSalario}` : ""}`,
      l.dias, d.money(l.salario), d.money(l.adicionais), d.money(l.prov13), d.money(l.provFerias), d.money(l.encargos),
      d.money(l.beneficios), d.money(l.comissao), d.money(l.bonus), d.money(l.total),
    ];
  });
  const foot = [[
    d.labels.totalGeral, "", d.money(soma("salario")), d.money(soma("adicionais")), d.money(soma("prov13")), d.money(soma("provFerias")),
    d.money(soma("encargos")), d.money(soma("beneficios")), d.money(soma("comissao")), d.money(soma("bonus")), d.money(d.total),
  ]];
  const larguras = [178, 34, 66, 62, 60, 66, 60, 60, 58, 58, 0]; // a última (Total) fica com o resto (~76pt)
  const ult = larguras.length - 1;
  larguras[ult] = larg - larguras.slice(0, ult).reduce((a, b) => a + b, 0);

  autoTable(doc, {
    startY: y,
    margin: { left: mx, right: mx, top: 40, bottom: 44 },
    head: [d.labels.cols],
    body,
    foot,
    showFoot: "lastPage",
    rowPageBreak: "avoid",
    theme: "plain",
    styles: { font: "helvetica", fontSize: 8.5, textColor: TXT, cellPadding: { top: 7, bottom: 7, left: 6, right: 6 }, valign: "middle", lineColor: BORDA },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.5, cellPadding: { top: 8, bottom: 8, left: 6, right: 6 } },
    footStyles: { fillColor: [236, 242, 248], textColor: NAVY, fontStyle: "bold", fontSize: 9 },
    alternateRowStyles: { fillColor: ZEBRA },
    columnStyles: Object.fromEntries(larguras.map((w, i) => [i, { cellWidth: w, halign: i === 0 ? "left" : "right" }])),
    didParseCell: (data) => {
      if (data.section !== "body" && data.column.index > 0) data.cell.styles.halign = "right";
      if (data.section === "foot") { data.cell.styles.fontSize = 8.3; data.cell.styles.overflow = "visible"; }
      if (data.column.index === ult && data.section !== "head") data.cell.styles.fontStyle = "bold";
      if (data.section === "body") data.cell.styles.lineWidth = { bottom: 0.5, top: 0, left: 0, right: 0 };
    },
    willDrawCell: (data) => {
      // Coluna do colaborador: desenha nome (negrito) + cargo/vínculo (menor, cinza) à mão.
      if (data.section === "body" && data.column.index === 0) data.cell.text = [];
    },
    didDrawCell: (data) => {
      if (data.section !== "body" || data.column.index !== 0) return;
      const info = subs.get(data.row.index);
      if (!info) return;
      const x = data.cell.x + 6;
      const meio = data.cell.y + data.cell.height / 2;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.8);
      doc.setTextColor(...TXT);
      doc.text(doc.splitTextToSize(info.nome, data.cell.width - 12)[0] as string, x, meio - 2);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.3);
      doc.setTextColor(...MUTED);
      const sub = doc.splitTextToSize(info.sub, data.cell.width - 12)[0] as string;
      doc.text(sub, x, meio + 8.5);
      if (info.semSalario) {
        doc.setTextColor(...NEG);
        doc.text(`· ${d.labels.semSalario}`, x + doc.getTextWidth(sub) + 3, meio + 8.5);
      }
    },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 22;

  // ── Rateio por centro de custo ──
  if (d.rateio.length > 0) {
    if (y + 40 + d.rateio.length * 18 > pageH - 50) { doc.addPage(); y = 50; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...NAVY);
    doc.text(d.labels.rateio, mx, y);
    autoTable(doc, {
      startY: y + 8,
      margin: { left: mx, right: mx, top: 40, bottom: 44 },
      tableWidth: 360,
      body: d.rateio.map((r) => [r.nome, d.money(r.valor)]),
      theme: "plain",
      styles: { font: "helvetica", fontSize: 8.5, textColor: TXT, cellPadding: 6, lineColor: BORDA },
      columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
      didParseCell: (data) => {
        data.cell.styles.lineWidth = { bottom: 0.5, top: 0, left: 0, right: 0 };
        if (d.rateio[data.row.index]?.naoAlocado && data.column.index === 0) data.cell.styles.textColor = [180, 83, 9];
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 22;
  }

  // ── Premissas ──
  const linhasPrem = doc.splitTextToSize(d.premissas, larg) as string[];
  if (y + 18 + linhasPrem.length * 11 > pageH - 50) { doc.addPage(); y = 50; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(d.labels.premissas.toUpperCase(), mx, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(linhasPrem, mx, y + 12, { lineHeightFactor: 1.35 });

  // ── Marca d'água + rodapé em todas as páginas ──
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.addImage(wm, "PNG", 0, 0, pageW, pageH, "nexus-wm", "SLOW");
    faixaDegrade(doc, mx, pageH - 30, larg, 1.2);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(d.labels.geradoEm(d.dataGeracao), mx, pageH - 17);
    doc.text(d.labels.pagina(p, total), pageW - mx, pageH - 17, { align: "right" });
  }

  doc.autoPrint();
  return doc.output("blob");
}
