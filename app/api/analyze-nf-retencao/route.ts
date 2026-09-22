// app/api/analyze-nf-retencao/route.ts
//
// Leitor de NFS-e com retenção de impostos — exclusivo do plano Pro (ver
// docs/superpowers/specs/2026-09-14-nfse-retencao-impostos-design.md).
//
// Diferente de analyze-nf / analyze-extract (anônimas, gate só por IP), esta
// rota é AUTENTICADA: verifica o ID token, resolve o dono da conta e confirma
// que ele está no plano Pro antes de chamar a API paga da Anthropic.

import { NextRequest, NextResponse } from "next/server";
import type { File as StorageFile } from "@google-cloud/storage";
import { requireScope, isScopeError } from "@/lib/apiScope";
import { getAdminDb, getAdminBucket } from "@/lib/firebaseAdmin";
import { resolveSubscriptionState, isProAccess, type BillingDoc } from "@/lib/billing";
import { checkRateLimit } from "@/lib/rateLimit";

const RATE_LIMIT = { windowMs: 10 * 60 * 1000, max: 10 }; // 10 análises / 10 min por conta

// O arquivo chega via Storage (não mais no corpo da requisição em base64) —
// a hospedagem serverless trava o corpo em ~4,5 MB e o base64 infla o
// arquivo em ~33%, então 5 MB de PDF nunca coube ali. Fazendo o navegador
// subir direto pro Storage, o corpo da requisição vira só um caminho (texto
// curto) e o teto de tamanho passa a ser só este aqui.
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const SYSTEM_PROMPT = `Você analisa Notas Fiscais de Serviço Eletrônicas (NFS-e) brasileiras,
do ponto de vista do TOMADOR do serviço (quem paga e deve reter tributos).
Responda SOMENTE com JSON válido, sem markdown, sem texto adicional.
Formato:
{"numeroNota":"103","prestador":"nome do prestador (razão social)","dataEmissao":"YYYY-MM-DD","valorTotalServico":6161.65,"issRetidoPeloTomador":true,"retentions":[{"tipo":"inss","valor":677.78}]}
Regras:
- "tipo" de cada retenção é um destes valores exatos: "inss", "irrf", "csll", "cofins", "pis", "iss".
- Inclua em "retentions" SOMENTE tributos com valor destacado maior que zero na nota.
- "issRetidoPeloTomador": true se a nota indicar que o ISS é retido pelo Tomador
  (ex.: "O ISS desta NFS-e será RETIDO pelo Tomador de Serviço"); false se
  indicar que o prestador recolhe, ou se não houver menção clara.
- Se a nota não tiver nenhuma retenção destacada (ex.: NF-e de produto comum,
  sem seção de tributos retidos), responda "retentions": [].
- valorTotalServico: valor total do serviço, número positivo.
- dataEmissao: data de emissão da nota, formato YYYY-MM-DD.`;

const VALID_TIPOS = new Set(["inss", "irrf", "csll", "cofins", "pis", "iss"]);

export async function POST(req: NextRequest) {
  const scope = await requireScope(req, "impostos");
  if (isScopeError(scope)) {
    return NextResponse.json({ error: scope.error }, { status: scope.status });
  }

  try {
    const db = await getAdminDb();
    const billingSnap = await db.doc(`users/${scope.ownerUid}/profile/billing`).get();
    const state = resolveSubscriptionState(billingSnap.exists ? (billingSnap.data() as BillingDoc) : null);
    if (!isProAccess(state)) {
      return NextResponse.json(
        { error: "A leitura de NF com retenção de impostos é exclusiva do plano Pro." },
        { status: 403 }
      );
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Erro ao verificar assinatura" }, { status: 500 });
  }

  const { limited, retryAfterSec } = checkRateLimit(`analyze-nf-retencao:${scope.ownerUid}`, RATE_LIMIT);
  if (limited) {
    return NextResponse.json(
      { error: "Muitas análises em pouco tempo. Aguarde alguns minutos e tente novamente." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
  }

  let file: StorageFile | null = null;

  try {
    const { storagePath, mediaType } = await req.json();
    if (typeof storagePath !== "string" || !storagePath.startsWith(`taxes/tmp/${scope.ownerUid}/`)) {
      return NextResponse.json({ error: "Arquivo inválido." }, { status: 400 });
    }

    const bucket = await getAdminBucket();
    file = bucket.file(storagePath);

    const [metadata] = await file.getMetadata().catch(() => [null]);
    const sizeBytes = Number(metadata?.size) || 0;
    if (!metadata || sizeBytes === 0) {
      return NextResponse.json({ error: "Arquivo não encontrado. Envie novamente." }, { status: 400 });
    }
    if (sizeBytes > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "Arquivo muito grande. Envie um PDF ou imagem de até 5 MB." },
        { status: 413 }
      );
    }

    const [buffer] = await file.download();
    const base64 = buffer.toString("base64");

    const isImage = typeof mediaType === "string" && mediaType.startsWith("image/");
    const messages = [{
      role: "user",
      content: [
        isImage
          ? { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } }
          : { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
        { type: "text", text: "Analise esta NFS-e e extraia o valor do serviço e as retenções destacadas." },
      ],
    }];

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      return NextResponse.json({ error: err?.error?.message ?? "Erro na API" }, { status: res.status });
    }

    const data = await res.json();
    const rawText = (data.content as any[])?.map((c: any) => c.text || "").join("") ?? "";
    const clean = rawText.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    const issRetido = parsed.issRetidoPeloTomador === true;

    // Nunca confia na aritmética do modelo: soma as retenções aqui, no
    // servidor. ISS só entra na lista se a nota disser que o Tomador o retém
    // — senão a obrigação de recolher é do prestador, não deste usuário.
    const retentions = (Array.isArray(parsed.retentions) ? parsed.retentions : [])
      .filter((r: any) => VALID_TIPOS.has(r?.tipo) && Number(r?.valor) > 0)
      .filter((r: any) => r.tipo !== "iss" || issRetido)
      .map((r: any) => ({ tipo: r.tipo as string, valor: Number(r.valor) }));

    const valorTotalServico = Number(parsed.valorTotalServico) || 0;
    const totalRetido = retentions.reduce((sum: number, r: { valor: number }) => sum + r.valor, 0);

    return NextResponse.json({
      numeroNota: String(parsed.numeroNota ?? ""),
      prestador: String(parsed.prestador ?? ""),
      dataEmissao: String(parsed.dataEmissao ?? ""),
      valorTotalServico,
      issRetidoPeloTomador: issRetido,
      retentions,
      valorLiquido: Math.max(0, valorTotalServico - totalRetido),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Não foi possível ler esta nota fiscal." }, { status: 500 });
  } finally {
    // Era só um arquivo de trabalho pra passar pela API — não fica no Storage.
    await file?.delete().catch(() => {});
  }
}
