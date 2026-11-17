// Banco Inter: tipos e regras puras dos boletos (sem I/O).
// Tipos e regras vivem em interBoletoRegras.ts (seguro para o client); aqui
// ficam só os geradores de id, que usam node:crypto (servidor).
import { randomBytes } from "node:crypto";

export * from "./interBoletoRegras";

const SEU_NUMERO_MAX = 15;
const ID_LEN = 12;
const ALFABETO = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Id de 12 caracteres [0-9a-z] (crypto, base36 sem viés). */
export function newBoletoId(): string {
  let out = "";
  while (out.length < ID_LEN) {
    for (const b of randomBytes(ID_LEN * 2)) {
      // 252 = 7 * 36: descarta o resto para não enviesar o módulo.
      if (b < 252 && out.length < ID_LEN) out += ALFABETO[b % 36];
    }
  }
  return out;
}

/** "seuNumero" enviado ao Inter (máx. 15 caracteres) = id do boleto. */
export function seuNumeroDe(id: string): string {
  if (id.length > SEU_NUMERO_MAX) {
    throw new Error(`seuNumero excede ${SEU_NUMERO_MAX} caracteres`);
  }
  return id;
}
