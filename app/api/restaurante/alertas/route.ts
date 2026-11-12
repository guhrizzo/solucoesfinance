export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { guardRestaurante, isCtx, respostaErro } from "@/lib/restaurante/server";
import { carregarTudo } from "@/lib/restaurante/service";
import { calcularAlertas } from "@/lib/restaurante/alertas";

// Alertas de falta de insumo (mesmo cálculo que a tela faz ao vivo).
export async function GET(request: Request) {
  const ctx = await guardRestaurante(request, "alertas-get", 120);
  if (!isCtx(ctx)) return ctx;
  try {
    const { ingredientes, pratos, pedidosAbertos } = await carregarTudo(ctx);
    return NextResponse.json(calcularAlertas(ingredientes, pratos, pedidosAbertos));
  } catch (e) {
    return respostaErro(e, "alertas GET");
  }
}
