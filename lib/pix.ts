// lib/pix.ts
// Chave Pix recebedora da cobrança (Contas a Receber, plano Pro) e geração do
// "Pix copia e cola" estático (BR Code / EMV-QRCPS do Banco Central), com o
// valor da cobrança já embutido. Usado no e-mail e no WhatsApp de cobrança.

export type PixKeyType = "cpfcnpj" | "email" | "phone" | "evp";

export const PIX_KEY_TYPES: PixKeyType[] = ["cpfcnpj", "email", "phone", "evp"];

const onlyDigits = (s: string) => s.replace(/\D/g, "");
const EVP_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Chave no formato que vai dentro do BR Code (ou null se inválida):
 * CPF/CNPJ só dígitos, e-mail minúsculo, telefone +55DDDNÚMERO, aleatória minúscula.
 */
export function normalizePixKey(type: PixKeyType | undefined, raw: string | undefined | null): string | null {
  const v = String(raw ?? "").trim();
  if (!v || !type) return null;
  switch (type) {
    case "cpfcnpj": {
      const d = onlyDigits(v);
      return d.length === 11 || d.length === 14 ? d : null;
    }
    case "email":
      return EMAIL_RE.test(v) && v.length <= 77 ? v.toLowerCase() : null;
    case "phone": {
      let d = onlyDigits(v);
      if (d.length === 13 && d.startsWith("55")) d = d.slice(2);
      return d.length === 10 || d.length === 11 ? `+55${d}` : null;
    }
    case "evp":
      return EVP_RE.test(v) ? v.toLowerCase() : null;
  }
}

/** Chave formatada pra exibir (CPF/CNPJ com máscara, telefone legível). */
export function formatPixKey(type: PixKeyType | undefined, raw: string | undefined | null): string {
  const n = normalizePixKey(type, raw);
  if (!n) return String(raw ?? "").trim();
  if (type === "cpfcnpj") {
    return n.length === 11
      ? n.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4")
      : n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  }
  if (type === "phone") {
    const d = n.slice(3);
    return d.length === 11
      ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
      : `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }
  return n;
}

// ─── BR Code (Pix copia e cola) ──────────────────────────────────────────────

/** Texto ASCII em maiúsculas, sem acento — exigência do BR Code p/ nome/cidade. */
function asciiUpper(s: string, max: number): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 .\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .slice(0, max)
    .trim();
}

const tlv = (id: string, value: string) => `${id}${String(value.length).padStart(2, "0")}${value}`;

/** CRC16-CCITT (poly 0x1021, init 0xFFFF), como pede o manual do BR Code. */
function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Pix copia e cola estático com valor. `txid` identifica a cobrança no extrato
 * de quem recebe (até 25 caracteres alfanuméricos). Devolve null se a chave
 * for inválida ou o valor não for positivo.
 */
export function buildPixCopiaECola(opts: {
  keyType: PixKeyType | undefined;
  key: string | undefined | null;
  amount: number;
  merchantName: string;
  merchantCity?: string;
  txid?: string;
}): string | null {
  const key = normalizePixKey(opts.keyType, opts.key);
  if (!key || !(opts.amount > 0)) return null;
  const name = asciiUpper(opts.merchantName, 25) || "RECEBEDOR";
  const city = asciiUpper(opts.merchantCity ?? "", 15) || "BRASIL";
  const txid = (opts.txid ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";

  const payload =
    tlv("00", "01") +
    tlv("26", tlv("00", "br.gov.bcb.pix") + tlv("01", key)) +
    tlv("52", "0000") +
    tlv("53", "986") +
    tlv("54", opts.amount.toFixed(2)) +
    tlv("58", "BR") +
    tlv("59", name) +
    tlv("60", city) +
    tlv("62", tlv("05", txid)) +
    "6304";
  return payload + crc16(payload);
}
