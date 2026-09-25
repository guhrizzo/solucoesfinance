// lib/boleto.ts
// Base para cobrança por boleto em Contas a Receber. Hoje o e-mail de cobrança
// (lib/emailTemplates.ts › receivableChargeEmail) já sai no LAYOUT de boleto
// (ficha de compensação), mas sem linha digitável / código de barras — esses
// campos ficam como "a emitir" até existir um provedor de boleto registrado.
//
// Para plugar uma API de boleto no futuro (Asaas, Mercado Pago, Inter, Efí…):
//   1. implemente `BoletoProvider` num arquivo próprio (ex.: lib/boleto/asaas.ts);
//   2. devolva-o em `getBoletoProvider()` (ex.: conforme BOLETO_PROVIDER no env);
//   3. a rota /api/receivables/charge-email já chama `issue()` quando a conta
//      ainda não tem boleto, grava o resultado em `receivables/{id}.boleto` e
//      reaproveita nos reenvios (lib/receivableChargeSend.ts). O e-mail passa a
//      mostrar linha digitável, nosso número e o botão do PDF. O código de
//      barras (itfBarcodeHtml) está pronto mas FORA do e-mail por decisão de
//      produto (2026-09-24) — religar em receivableChargeEmail se quiserem.

/** Boleto emitido, como fica gravado em `receivables/{id}.boleto`. */
export interface BoletoData {
  provider: string;            // id do provedor que emitiu (ex.: "asaas")
  externalId?: string;         // id do boleto no provedor (p/ consulta/baixa/webhook)
  bankCode?: string;           // "341", "077"… (3 dígitos)
  bankName?: string;           // "Itaú", "Inter"…
  linhaDigitavel: string;      // 47 dígitos (só dígitos ou formatada)
  codigoBarras?: string;       // 44 dígitos; se faltar, é derivado da linha
  nossoNumero?: string;
  agenciaCodigo?: string;      // "Agência / Código do beneficiário"
  carteira?: string;
  pdfUrl?: string;             // PDF oficial do boleto
  pixCopiaECola?: string;      // boletos híbridos (boleto + Pix)
  issuedAt: number;
  dueDate: string;             // YYYY-MM-DD com que foi registrado
  amount: number;              // valor registrado (R$)
}

export interface BoletoParty {
  name: string;
  doc: string;                 // CPF/CNPJ, só dígitos
  email?: string;
  phone?: string;
}

export interface BoletoIssueInput {
  receivableId: string;
  ownerUid: string;
  amount: number;
  dueDate: string;             // YYYY-MM-DD
  description: string;
  fineRate: number;            // % sobre o valor
  interestRate: number;        // % ao mês
  beneficiary: BoletoParty & { tradeName?: string };
  payer: BoletoParty;
}

export interface BoletoProvider {
  id: string;
  issue(input: BoletoIssueInput): Promise<BoletoData>;
}

/**
 * Provedor de boleto ativo. Nenhum por enquanto — o e-mail sai como aviso de
 * cobrança no layout de boleto, sem código de barras.
 */
export function getBoletoProvider(): BoletoProvider | null {
  return null;
}

/** Boleto gravado ainda vale pra esta cobrança (mesmo valor e vencimento)? */
export function isBoletoCurrent(b: BoletoData | undefined | null, amount: number, dueDate: string): b is BoletoData {
  return !!b?.linhaDigitavel && b.dueDate === dueDate && Math.abs((Number(b.amount) || 0) - amount) < 0.005;
}

// ─── Formatação ──────────────────────────────────────────────────────────────

const digits = (s: string | undefined | null) => String(s ?? "").replace(/\D/g, "");

/** CPF (000.000.000-00) ou CNPJ (00.000.000/0000-00); devolve como veio se não bater. */
export function formatCpfCnpj(raw: string | undefined | null): string {
  const d = digits(raw);
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  return String(raw ?? "").trim();
}

/** Rótulo do documento conforme o tamanho: "CPF" ou "CNPJ". */
export function docLabel(raw: string | undefined | null): string {
  const n = digits(raw).length;
  return n === 11 ? "CPF" : n === 14 ? "CNPJ" : "CPF/CNPJ";
}

/** 47 dígitos → "00000.00000 00000.000000 00000.000000 0 00000000000000". */
export function formatLinhaDigitavel(raw: string): string {
  const d = digits(raw);
  if (d.length !== 47) return raw.trim();
  return `${d.slice(0, 5)}.${d.slice(5, 10)} ${d.slice(10, 15)}.${d.slice(15, 21)} ${d.slice(21, 26)}.${d.slice(26, 32)} ${d[32]} ${d.slice(33)}`;
}

/** Converte a linha digitável (47) no código de barras (44) — FEBRABAN. */
export function linhaToBarcode(linha: string): string | null {
  const d = digits(linha);
  if (d.length !== 47) return null;
  return d.slice(0, 4) + d[32] + d.slice(33, 47) + d.slice(4, 9) + d.slice(10, 20) + d.slice(21, 31);
}

// ─── Código de barras ITF (Interleaved 2 of 5) em HTML de e-mail ─────────────

const ITF: Record<string, string> = {
  "0": "nnwwn", "1": "wnnnw", "2": "nwnnw", "3": "wwnnn", "4": "nnwnw",
  "5": "wnwnn", "6": "nwwnn", "7": "nnnww", "8": "wnnwn", "9": "nwnwn",
};

/**
 * Desenha o código de barras de 44 dígitos como uma linha de <td> pretas e
 * brancas (imagens costumam vir bloqueadas nos clientes de e-mail; tabela
 * renderiza em todos). Estreita = 1px, larga = 3px.
 */
export function itfBarcodeHtml(code44: string, height = 50): string {
  const d = digits(code44);
  if (d.length !== 44) return "";
  const bars: Array<[boolean, number]> = [[true, 1], [false, 1], [true, 1], [false, 1]]; // start
  for (let i = 0; i < d.length; i += 2) {
    const a = ITF[d[i]], b = ITF[d[i + 1]];
    for (let k = 0; k < 5; k++) {
      bars.push([true, a[k] === "w" ? 3 : 1]);
      bars.push([false, b[k] === "w" ? 3 : 1]);
    }
  }
  bars.push([true, 3], [false, 1], [true, 1]); // stop
  const cells = bars
    .map(([black, w]) =>
      `<td width="${w}" style="width:${w}px;min-width:${w}px;height:${height}px;padding:0;font-size:0;line-height:0;background:${black ? "#000000" : "#ffffff"};"></td>`)
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background:#ffffff;"><tr>${cells}</tr></table>`;
}
