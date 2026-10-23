import { NextRequest, NextResponse } from "next/server";
import type { File as StorageFile } from "@google-cloud/storage";
import { checkRateLimit } from "@/lib/rateLimit";
import { requireScope, isScopeError } from "@/lib/apiScope";
import { getAdminBucket } from "@/lib/firebaseAdmin";
import { sanitizeSales, MAX_IMPORT_ROWS, type RawSale } from "@/lib/salesReportImport";

export const runtime = "nodejs";
export const maxDuration = 60;

// Importação por IA de relatórios de vendas (aba Vendas de /relatorios). Mesma
// mecânica de /api/analyze-extract (PDF via Storage temporário ou texto/CSV
// colado), mas SEMPRE autenticada e SOMENTE LEITURA: a rota só devolve as linhas
// lidas — quem grava (na coleção própria do relatório) é a tela, depois da
// revisão do usuário. Não toca em vendas, caixa, contas nem estoque.
const RATE_LIMIT = { windowMs: 10 * 60 * 1000, max: 5 }; // 5 análises / 10 min por usuário
const MAX_CHUNKS = 30;
const MAX_PDF_BYTES = 5 * 1024 * 1024;
const MODEL = "claude-haiku-4-5-20251001";

const buildPrompt = (today: string) => `Você é um leitor de relatórios de vendas brasileiros (marketplaces, PDV, ERP, planilhas).
Extraia TODAS as linhas de venda do documento. Leia só o que está escrito: NUNCA invente valores.
Responda SOMENTE com JSON válido, sem markdown, sem texto adicional.
Formato:
{"sales":[{"date":"YYYY-MM-DD","sku":"","name":"","qty":1,"amount":0,"unitCost":null,"fees":null,"returnedQty":null,"returnedValue":null,"channel":"","orderId":"","status":""}]}
Hoje é ${today}. Se a data da linha vier sem ano (ex.: "14/10"), use o ano do período do relatório ou, na falta dele, o ano de hoje.
Regras:
- Aceite qualquer tipo de lançamento de venda ou serviço prestado (produtos, serviços, vendas de balcão, Pix recebido de venda); só ignore totais/subtotais e despesas.
- Uma linha por item vendido (produto) — não crie linhas de total, subtotal ou resumo.
- date: data da venda em YYYY-MM-DD. Se o documento só tiver um período (ex.: "Outubro/2026") e a linha não tiver data, use null.
- sku: código/SKU do produto se existir, senão "". name: nome do produto.
- qty: quantidade vendida (número). Se a quantidade estiver no nome (ex.: "Munição 38 - 5 Und"), use 5 e mantenha o nome; se não houver, 1. amount: valor TOTAL cobrado pela linha (quantidade × preço, já com desconto aplicado), positivo, sem símbolo. Se só houver preço unitário, multiplique por qty. Não subtraia descontos de novo se o valor já for o líquido.
- unitCost: custo UNITÁRIO somente se o relatório trouxer coluna de custo/CMV/preço de compra (se vier o custo total da linha, divida por qty). Se não houver, null. NUNCA use o preço de venda como custo.
- fees: taxas/comissões/tarifas da linha (marketplace) se existirem, senão null.
- returnedQty / returnedValue: devolução parcial da linha se o relatório trouxer, senão null.
- channel: canal/marketplace/loja de origem se existir, senão "". orderId: número do pedido se existir, senão "".
- status: se a linha for cancelada, devolvida ou estornada escreva "cancelado", "devolvido" ou "estornado"; senão "".
- Valores monetários como número JSON (ponto decimal), nunca texto.`;

async function callAnthropic(userContent: unknown, maxTokens: number, system: string): Promise<RawSale[]> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message ?? "Erro na API");
  }
  const data = await res.json();
  if (data.stop_reason === "max_tokens") {
    throw new Error("O relatório tem linhas demais para analisar de uma vez. Divida o arquivo em partes menores.");
  }
  const rawText = (data.content as { text?: string }[])?.map((c) => c.text || "").join("") ?? "";
  const parsed = JSON.parse(rawText.replace(/```json|```/g, "").trim());
  return Array.isArray(parsed?.sales) ? parsed.sales : [];
}

const analyzeChunk = (chunk: string, system: string) =>
  callAnthropic(`Relatório de vendas:\n\n${chunk}`, 8192, system);

const analyzePdf = (base64: string, system: string) =>
  callAnthropic(
    [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
      { type: "text", text: "Extraia TODAS as linhas de venda deste relatório." },
    ],
    16000,
    system,
  );

function splitIntoChunks(text: string, maxChars = 8000): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    if ((current + "\n" + line).length > maxChars && current.length > 0) {
      chunks.push(current.trim());
      current = line;
    } else {
      current = current ? current + "\n" + line : line;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Leitura por IA não configurada (ANTHROPIC_API_KEY ausente)." }, { status: 503 });
  }
  const scope = await requireScope(req, "relatorios");
  if (isScopeError(scope)) {
    return NextResponse.json({ error: scope.error }, { status: scope.status });
  }
  const { limited, retryAfterSec } = checkRateLimit(`analyze-sales-report:${scope.uid}`, RATE_LIMIT, scope.isSupremeAdmin);
  if (limited) {
    return NextResponse.json(
      { error: "Muitas análises em pouco tempo. Aguarde alguns minutos e tente novamente." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const system = buildPrompt(today);
  const { text, storagePath } = await req.json().catch(() => ({}));
  let file: StorageFile | null = null;
  try {
    const all: RawSale[] = [];

    if (typeof storagePath === "string" && storagePath.length > 0) {
      if (!storagePath.startsWith(`users/${scope.uid}/extract-tmp/`)) {
        return NextResponse.json({ error: "Arquivo inválido." }, { status: 400 });
      }
      const bucket = await getAdminBucket();
      file = bucket.file(storagePath);
      const [metadata] = await file.getMetadata().catch(() => [null]);
      const sizeBytes = Number(metadata?.size) || 0;
      if (!metadata || sizeBytes === 0) {
        return NextResponse.json({ error: "Arquivo não encontrado. Envie novamente." }, { status: 400 });
      }
      if (sizeBytes > MAX_PDF_BYTES) {
        return NextResponse.json({ error: "PDF muito grande (limite de 5 MB). Envie um período menor ou cole o texto." }, { status: 413 });
      }
      const [buffer] = await file.download();
      all.push(...(await analyzePdf(buffer.toString("base64"), system)));
    } else {
      if (typeof text !== "string" || !text.trim()) {
        return NextResponse.json({ error: "Texto vazio" }, { status: 400 });
      }
      const chunks = splitIntoChunks(text, 8000);
      if (chunks.length > MAX_CHUNKS) {
        return NextResponse.json({ error: `Relatório muito grande (${chunks.length} blocos). Envie em partes menores.` }, { status: 413 });
      }
      for (let i = 0; i < chunks.length; i += 3) {
        const results = await Promise.all(chunks.slice(i, i + 3).map((c) => analyzeChunk(c, system)));
        results.forEach((r) => all.push(...r));
      }
    }

    const { rows, skipped } = sanitizeSales(all, { year: Number(today.slice(0, 4)) });
    if (rows.length === 0 && all.length > 0) {
      return NextResponse.json(
        { error: `A IA leu ${all.length} linha(s), mas nenhuma tinha data e valor válidos. Confira se o relatório traz a data de cada venda.` },
        { status: 422 },
      );
    }
    if (rows.length > MAX_IMPORT_ROWS) {
      return NextResponse.json(
        { error: `O relatório tem ${rows.length} linhas; o limite por importação é ${MAX_IMPORT_ROWS}. Divida em períodos menores.` },
        { status: 413 },
      );
    }
    return NextResponse.json({ rows, skipped });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro interno" }, { status: 500 });
  } finally {
    await file?.delete().catch(() => {});
  }
}
