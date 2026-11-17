// lib/interBoletosEstado.ts
// Estado de "boletos" do Banco Inter derivado do status público
// (users/{uid}/profile/interStatus). Puro: usado pelo cartão do cliente.

import type { InterStatus } from "./interTypes";

export type BoletosEstado = "indisponivel" | "inativo" | "ativo" | "escopoFaltando";

export function boletosEstado(status: Pick<InterStatus, "connected" | "cobrancaAtiva" | "cobrancaEscopos"> | null | undefined): BoletosEstado {
  if (!status?.connected) return "indisponivel";
  const esc = status.cobrancaEscopos;
  if (esc && (!esc.write || !esc.read)) return "escopoFaltando";
  return status.cobrancaAtiva === true ? "ativo" : "inativo";
}
