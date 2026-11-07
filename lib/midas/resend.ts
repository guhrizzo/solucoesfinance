// lib/midas/resend.ts
// Decisão pura (cliente): reenviar o "completed" depois do CTA?

/** Reenvio do "completed": só se está no CTA e o servidor ainda não confirmou a conclusão. */
export function shouldResendCompleted(atCta: boolean, serverStatus: string | undefined): boolean {
  return atCta && serverStatus !== "completed" && serverStatus !== "converted";
}
