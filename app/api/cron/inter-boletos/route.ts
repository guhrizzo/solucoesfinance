// app/api/cron/inter-boletos/route.ts
// GET (agendado — vercel.json, todo dia) → "consulta de segurança" dos boletos
// do Banco Inter: para cada conta com a cobrança ativa (integracoesBanco
// cobranca.ativo) e Pro, consulta os boletos em aberto e aplica a situação pelo
// núcleo idempotente (lib/interBoletoServer.ts atualizarBoletos). Cobre aviso
// do webhook perdido. Orçamento de tempo e concorrência limitada como o
// cron/inter-sync; uma conta com falha não interrompe as outras.
//
// Proteção: header `Authorization: Bearer ${CRON_SECRET}`.
// Logs e resposta: só contagens e códigos de erro.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { donoTemPro } from "@/lib/interDonoPro";
import { atualizarBoletos, BoletoError } from "@/lib/interBoletoServer";
import { errCode } from "@/lib/interErrors";

/** Para de PEGAR contas novas 30 s antes do maxDuration. */
const ORCAMENTO_MS = (maxDuration - 30) * 1000;
const CONCORRENCIA = 3;
const CRON_ACTOR = { uid: "inter-cron", name: "Banco Inter (consulta automática)" };

export async function GET(request: Request) {
  const inicio = Date.now();
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (!process.env.INTER_ENC_KEY?.trim()) {
    return NextResponse.json({ error: "INTER_ENC_KEY não configurada." }, { status: 500 });
  }

  const db = await getAdminDb();
  const snap = await db.collection("integracoesBanco").where("cobranca.ativo", "==", true).select().get();
  const fila = snap.docs.map((d) => d.id);

  let atualizadas = 0;
  let falhas = 0;
  let puladas = 0;
  let consultados = 0;
  let pagos = 0;
  let proximo = 0;

  const worker = async () => {
    while (proximo < fila.length && Date.now() - inicio < ORCAMENTO_MS) {
      const ownerUid = fila[proximo++];
      try {
        if (!(await donoTemPro(db, ownerUid))) {
          puladas++;
          continue;
        }
        const r = await atualizarBoletos(db, ownerUid, CRON_ACTOR);
        consultados += r.consultados;
        pagos += r.pagos;
        atualizadas++;
      } catch (e) {
        falhas++;
        const motivo = e instanceof BoletoError ? e.kind : errCode(e);
        console.error(`Cron Inter boletos: falha na conta ${ownerUid}:`, motivo);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCORRENCIA, fila.length) }, worker));

  const restantes = fila.length - proximo;
  return NextResponse.json({ contas: fila.length, atualizadas, falhas, puladas, restantes, consultados, pagos });
}
