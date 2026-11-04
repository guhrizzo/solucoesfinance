// lib/interConexao.ts
// Validação PURA do corpo das rotas /api/inter/conexao (sem I/O, testável).
// Nunca devolve nem inclui o conteúdo recebido nas mensagens de erro: os campos
// são segredos (client secret, chave privada) e não podem vazar em resposta/log.

export const MAX_ID_CHARS = 200;
export const MAX_PEM_CHARS = 20 * 1024;
export const MAX_CONTA_CHARS = 30;

const CERT_HEADER = "-----BEGIN CERTIFICATE-----";
// Aceita PKCS#8 ("PRIVATE KEY"), PKCS#1 ("RSA PRIVATE KEY") e EC.
const KEY_HEADER = /^-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/;

export type ConexaoInput = {
  clientId?: string;
  clientSecret?: string;
  certPem?: string;
  keyPem?: string;
  /** undefined = não mexer; "" = limpar (só no PUT). */
  conta?: string;
};

export type ConexaoValidation = { ok: true; value: ConexaoInput } | { ok: false; error: string };

function isRec(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Lê um campo de texto opcional; erro se vier com tipo errado ou grande demais. */
function campo(body: Record<string, unknown>, nome: string, max: number, rotulo: string): string | undefined | { error: string } {
  const v = body[nome];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") return { error: `${rotulo} inválido.` };
  const t = v.trim();
  if (t.length > max) return { error: `${rotulo} muito grande.` };
  return t;
}

/** Normaliza e valida o número da conta: só dígitos (aceita pontos, hífen e espaços na digitação). */
export function normalizeConta(conta: string): string | null {
  const digits = conta.replace(/[\s.\-]/g, "");
  if (!digits) return "";
  return /^\d+$/.test(digits) ? digits : null;
}

/** "12345678" → "••••5678". Vazio → undefined. */
export function maskConta(conta: string | undefined | null): string | undefined {
  const d = String(conta ?? "").replace(/\D/g, "");
  if (!d) return undefined;
  return `••••${d.slice(-4)}`;
}

export function isCertPem(pem: string): boolean {
  return pem.startsWith(CERT_HEADER) && pem.includes("-----END CERTIFICATE-----");
}

export function isKeyPem(pem: string): boolean {
  return KEY_HEADER.test(pem) && /-----END (?:RSA |EC )?PRIVATE KEY-----/.test(pem);
}

/**
 * Valida o corpo de POST (mode "create": clientId, clientSecret, certPem e keyPem
 * obrigatórios) ou PUT (mode "update": tudo opcional, mas certificado e chave vêm
 * juntos, e ao menos um campo precisa vir).
 */
export function validateConexaoBody(body: unknown, mode: "create" | "update"): ConexaoValidation {
  if (!isRec(body)) return { ok: false, error: "Dados inválidos." };

  const out: ConexaoInput = {};
  const specs: Array<[keyof ConexaoInput, number, string]> = [
    ["clientId", MAX_ID_CHARS, "Client ID"],
    ["clientSecret", MAX_ID_CHARS, "Client Secret"],
    ["certPem", MAX_PEM_CHARS, "Certificado"],
    ["keyPem", MAX_PEM_CHARS, "Chave privada"],
    ["conta", MAX_CONTA_CHARS, "Número da conta"],
  ];
  for (const [nome, max, rotulo] of specs) {
    const r = campo(body, nome, max, rotulo);
    if (r && typeof r === "object") return { ok: false, error: r.error };
    // Vazio conta como "não enviado" — exceto `conta`, onde "" no PUT limpa.
    if (r === undefined || (r === "" && nome !== "conta")) continue;
    out[nome] = r;
  }

  if (out.conta !== undefined) {
    const c = normalizeConta(out.conta);
    if (c === null) return { ok: false, error: "Número da conta inválido: use só dígitos." };
    if (c === "" && mode === "create") delete out.conta;
    else out.conta = c;
  }

  if (mode === "create") {
    if (!out.clientId) return { ok: false, error: "Informe o Client ID." };
    if (!out.clientSecret) return { ok: false, error: "Informe o Client Secret." };
    if (!out.certPem) return { ok: false, error: "Envie o certificado (.crt)." };
    if (!out.keyPem) return { ok: false, error: "Envie a chave privada (.key)." };
  } else {
    if ((out.certPem === undefined) !== (out.keyPem === undefined)) {
      return { ok: false, error: "Envie o certificado e a chave privada juntos." };
    }
    if (Object.keys(out).length === 0) return { ok: false, error: "Nada para atualizar." };
  }

  if (out.certPem !== undefined && !isCertPem(out.certPem)) {
    return { ok: false, error: "Certificado inválido: envie o arquivo .crt em formato PEM (começa com -----BEGIN CERTIFICATE-----)." };
  }
  if (out.keyPem !== undefined && !isKeyPem(out.keyPem)) {
    return { ok: false, error: "Chave privada inválida: envie o arquivo .key em formato PEM (começa com -----BEGIN PRIVATE KEY-----)." };
  }
  return { ok: true, value: out };
}
