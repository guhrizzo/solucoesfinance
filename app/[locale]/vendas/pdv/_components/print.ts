import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import {
  FORMAS_PAGAMENTO, esperadoNoFechamento, somaTotais,
  type Caixa, type PdvVenda,
} from "@/lib/pdv";

// Comprovante da venda e relatório de fechamento do caixa, impressos numa
// janela própria (preto no branco, largura de cupom). Não depende do tema
// nem do CSS do app — o HTML sai pronto daqui.

type T = (key: string, values?: Record<string, string | number>) => string;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const CSS = `
  *{box-sizing:border-box} body{font-family:ui-monospace,Menlo,Consolas,monospace;color:#000;background:#fff;margin:0;padding:16px;font-size:12px}
  .doc{max-width:380px;margin:0 auto} h1{font-size:15px;margin:0 0 2px;text-align:center} .c{text-align:center}
  .muted{color:#444} hr{border:0;border-top:1px dashed #000;margin:8px 0}
  table{width:100%;border-collapse:collapse} td,th{padding:2px 0;vertical-align:top;text-align:left} th{font-weight:700;border-bottom:1px solid #000}
  .r{text-align:right} .b{font-weight:700} .big{font-size:15px} .neg{color:#b00} .pos{color:#060}
  @media print{body{padding:0} .noprint{display:none}}
`;

function abrirJanela(titulo: string, corpo: string) {
  const w = window.open("", "_blank", "width=440,height=720");
  if (!w) return false;
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>${CSS}</style></head>` +
    `<body><div class="doc">${corpo}</div><script>window.onload=function(){window.focus();window.print();}<\/script></body></html>`
  );
  w.document.close();
  return true;
}

export function formaLabel(t: T, forma: string, parcelas = 1) {
  const nome = t(`payment.${forma}`);
  return forma === "credito" && parcelas > 1 ? t("payment.creditInstallments", { n: parcelas }) : nome;
}

export function imprimirComprovante(v: PdvVenda, empresa: string, t: T, locale: string) {
  const m = (n: number) => formatMoney(n, locale);
  const linhas = v.itens.map((it, i) => `
    <tr><td colspan="3">${String(i + 1).padStart(3, "0")} ${esc(it.descricao)}${it.sku ? ` <span class="muted">(${esc(it.sku)})</span>` : ""}</td></tr>
    <tr><td class="muted">${formatNumber(it.quantidade, locale, { maximumFractionDigits: 3 })} ${esc(it.unidade)} × ${m(it.precoUnitario)}</td><td></td><td class="r">${m(it.subtotal)}</td></tr>`).join("");

  const corpo = `
    <h1>${esc(empresa)}</h1>
    <div class="c muted">${esc(t("receipt.title"))}</div>
    <div class="c muted">${esc(t("receipt.notFiscal"))}</div>
    <hr>
    <div>${esc(t("receipt.saleNo", { n: v.numero }))}</div>
    <div>${esc(formatDateTime(v.createdAt, locale))}</div>
    <div>${esc(t("receipt.operator"))}: ${esc(v.operador)}</div>
    <hr>
    <table>${linhas}</table>
    <hr>
    <table>
      <tr><td class="b big">${esc(t("receipt.total"))}</td><td class="r b big">${m(v.total)}</td></tr>
      <tr><td>${esc(t("receipt.payment"))}</td><td class="r">${esc(formaLabel(t, v.forma, v.parcelas))}</td></tr>
      ${v.forma === "credito" && v.parcelas > 1 ? `<tr><td class="muted">${esc(t("receipt.installmentValue"))}</td><td class="r muted">${v.parcelas} × ${m(v.total / v.parcelas)}</td></tr>` : ""}
      ${v.forma === "dinheiro" ? `<tr><td>${esc(t("receipt.received"))}</td><td class="r">${m(v.valorRecebido)}</td></tr><tr><td>${esc(t("receipt.change"))}</td><td class="r">${m(v.troco)}</td></tr>` : ""}
    </table>
    <hr>
    <div class="c muted">${esc(t("receipt.thanks"))}</div>`;
  return abrirJanela(t("receipt.saleNo", { n: v.numero }), corpo);
}

export function imprimirRelatorioCaixa(c: Caixa, vendas: PdvVenda[], empresa: string, t: T, locale: string) {
  const m = (n: number) => formatMoney(n, locale);
  const fechado = c.status === "fechado";
  const esperado = c.esperado ?? esperadoNoFechamento(c);

  const linhasFormas = FORMAS_PAGAMENTO.map((f) => {
    const dif = c.diferenca?.[f] ?? 0;
    return `<tr>
      <td>${esc(t(`payment.${f}`))}</td>
      <td class="r">${m(c.totais?.[f] ?? 0)}</td>
      <td class="r">${m(esperado[f])}</td>
      ${fechado ? `<td class="r">${m(c.conferido?.[f] ?? 0)}</td><td class="r ${dif < 0 ? "neg" : dif > 0 ? "pos" : ""}">${m(dif)}</td>` : ""}
    </tr>`;
  }).join("");

  const ordenadas = [...vendas].sort((a, b) => a.numero - b.numero);
  const linhasVendas = ordenadas.map((v) => `<tr>
      <td>#${v.numero}</td>
      <td>${esc(formatDateTime(v.createdAt, locale).split(" ").pop() || "")}</td>
      <td>${esc(formaLabel(t, v.forma, v.parcelas))}</td>
      <td class="r">${m(v.total)}</td></tr>`).join("");

  const corpo = `
    <h1>${esc(empresa)}</h1>
    <div class="c b">${esc(fechado ? t("report.titleClosed") : t("report.titlePartial"))}</div>
    <hr>
    <div>${esc(t("report.operator"))}: ${esc(c.operador)}</div>
    <div>${esc(t("report.openedAt"))}: ${esc(formatDateTime(c.openedAt, locale))} · ${esc(c.openedByName)}</div>
    ${fechado && c.closedAt ? `<div>${esc(t("report.closedAt"))}: ${esc(formatDateTime(c.closedAt, locale))} · ${esc(c.closedByName || "")}</div>` : ""}
    <div>${esc(t("report.openingCash"))}: ${m(c.trocoInicial)}</div>
    <div>${esc(t("report.salesCount", { n: c.qtdVendas }))} · ${esc(t("report.salesTotal"))}: <span class="b">${m(c.totalVendas)}</span></div>
    <hr>
    <table>
      <tr><th>${esc(t("report.method"))}</th><th class="r">${esc(t("report.sold"))}</th><th class="r">${esc(t("report.expected"))}</th>
      ${fechado ? `<th class="r">${esc(t("report.counted"))}</th><th class="r">${esc(t("report.difference"))}</th>` : ""}</tr>
      ${linhasFormas}
      <tr><td class="b">${esc(t("report.total"))}</td><td class="r b">${m(c.totalVendas)}</td><td class="r b">${m(somaTotais(esperado))}</td>
      ${fechado ? `<td class="r b">${m(somaTotais(c.conferido!))}</td><td class="r b ${(c.diferencaTotal ?? 0) < 0 ? "neg" : (c.diferencaTotal ?? 0) > 0 ? "pos" : ""}">${m(c.diferencaTotal ?? 0)}</td>` : ""}</tr>
    </table>
    <div class="muted" style="margin-top:4px">${esc(t("report.expectedHint"))}</div>
    ${c.observacao ? `<hr><div>${esc(t("report.notes"))}: ${esc(c.observacao)}</div>` : ""}
    <hr>
    <div class="b">${esc(t("report.salesList"))}</div>
    <table>${linhasVendas || `<tr><td class="muted">${esc(t("report.noSales"))}</td></tr>`}</table>
    ${fechado ? `<hr><br><div class="c">______________________________</div><div class="c muted">${esc(t("report.signature"))}</div>` : ""}`;
  return abrirJanela(fechado ? t("report.titleClosed") : t("report.titlePartial"), corpo);
}
