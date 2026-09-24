import { NextRequest, NextResponse } from "next/server";
import type { File as StorageFile } from "@google-cloud/storage";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { requireScope, isScopeError } from "@/lib/apiScope";
import { getAdminBucket } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 60;

// Cada chamada aqui dispara N requisições pagas à API da Anthropic (uma por
// chunk de ~8000 chars). O caminho de texto colado segue anônimo (só
// rate-limit por IP); o caminho de PDF exige login, porque a rota precisa
// resolver o uid do dono do arquivo no Storage (ver storagePath abaixo).
const RATE_LIMIT = { windowMs: 10 * 60 * 1000, max: 5 }; // 5 análises / 10 min por IP
const MAX_CHUNKS = 30; // ~240k chars — teto de custo por requisição, mesmo dentro do limite de taxa

const SYSTEM_PROMPT = `Você é um analisador de extratos bancários brasileiros.
Extraia TODAS as transações do texto fornecido.
Responda SOMENTE com JSON válido, sem markdown, sem texto adicional.
Formato:
{"transactions":[{"type":"entrada","description":"nome curto","category":"categoria","amount":1234.56,"date":"YYYY-MM-DD","note":""}]}
Regras:
- type: "entrada" para crédito/depósito/recebimento; "saida" para débito/pagamento/saque
- description: máximo 30 caracteres
- category: use uma dessas: Vendas, Serviços prestados, Recebimento de clientes, Investimentos, Outros recebimentos, Fornecedores, Folha de pagamento, Aluguel, Impostos, Marketing, TI / Software, Outros gastos
- amount: número positivo sem símbolo
- date: YYYY-MM-DD
- note: vazio ("") sempre
Seja conciso. Extraia todas as transações sem omitir nenhuma.`;

// O PDF chega via Storage (não mais em base64 no corpo) — a hospedagem
// serverless trava o corpo em ~4,5 MB e o base64 inflaria o arquivo em ~33%,
// então o teto de tamanho de verdade passa a ser só este aqui.
const MAX_PDF_BYTES = 5 * 1024 * 1024;

async function callAnthropic(userContent: any, maxTokens: number): Promise<any[]> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: maxTokens,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err?.error?.message ?? "Erro na API");
  }

  const data = await res.json();
  const rawText = (data.content as any[])?.map((c: any) => c.text || "").join("") ?? "";
  if (data.stop_reason === "max_tokens") {
    // A resposta foi cortada no meio do JSON — não dá pra interpretar. Isso
    // acontece quando o documento tem lançamentos demais pra caber na
    // resposta de uma só vez.
    throw new Error("O extrato tem lançamentos demais para analisar de uma vez. Divida o PDF em partes menores ou cole o texto.");
  }
  const clean = rawText.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(clean);
  return parsed.transactions ?? [];
}

const analyzeChunk = (chunk: string) =>
  callAnthropic(`Extrato bancário:\n\n${chunk}`, 4096);

// PDF do banco: manda o arquivo inteiro como documento; o Claude lê o texto (ou
// faz OCR se for escaneado) e extrai as transações numa única chamada.
const analyzePdf = (base64: string) =>
  callAnthropic(
    [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
      { type: "text", text: "Extraia TODAS as transações deste extrato bancário." },
    ],
    16000
  );

// Divide o texto em chunks de ~8000 chars, quebrando em linhas
function splitIntoChunks(text: string, maxChars = 8000): string[] {
  const lines = text.split("\n");
  const chunks: string[] = [];
  let current = "";

  for (const line of lines) {
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
  const { text, storagePath } = await req.json();

  let file: StorageFile | null = null;
  try {
    const allTransactions: any[] = [];

    if (typeof storagePath === "string" && storagePath.length > 0) {
      // Caminho PDF: exige login (o arquivo mora no Storage do dono da conta).
      const scope = await requireScope(req, "fluxoCaixa");
      if (isScopeError(scope)) {
        return NextResponse.json({ error: scope.error }, { status: scope.status });
      }
      const { limited, retryAfterSec } = checkRateLimit(`analyze-extract:${scope.uid}`, RATE_LIMIT, scope.isSupremeAdmin);
      if (limited) {
        return NextResponse.json(
          { error: "Muitas análises em pouco tempo. Aguarde alguns minutos e tente novamente." },
          { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
        );
      }
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
        return NextResponse.json(
          { error: "PDF muito grande. Envie um extrato menor (até 5 MB) ou cole o texto." },
          { status: 413 }
        );
      }

      const [buffer] = await file.download();
      allTransactions.push(...await analyzePdf(buffer.toString("base64")));
    } else {
      const { limited, retryAfterSec } = checkRateLimit(`analyze-extract:${getClientIp(req)}`, RATE_LIMIT);
      if (limited) {
        return NextResponse.json(
          { error: "Muitas análises em pouco tempo. Aguarde alguns minutos e tente novamente." },
          { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
        );
      }
      if (!text?.trim()) {
        return NextResponse.json({ error: "Texto vazio" }, { status: 400 });
      }

      const chunks = splitIntoChunks(text, 8000);
      if (chunks.length > MAX_CHUNKS) {
        return NextResponse.json(
          { error: `Extrato muito grande (${chunks.length} blocos). Envie em partes menores.` },
          { status: 413 }
        );
      }

      // Processa chunks em paralelo (máx 3 simultâneos para não sobrecarregar)
      for (let i = 0; i < chunks.length; i += 3) {
        const batch = chunks.slice(i, i + 3);
        const results = await Promise.all(batch.map(analyzeChunk));
        results.forEach(txs => allTransactions.push(...txs));
      }
    }

    // Remove duplicatas por descrição + data + valor
    const seen = new Set<string>();
    const unique = allTransactions.filter(tx => {
      const key = `${tx.description}|${tx.date}|${tx.amount}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Retorna no mesmo formato que o frontend espera
    return NextResponse.json({
      content: [{ text: JSON.stringify({ transactions: unique }) }]
    });

  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Erro interno" }, { status: 500 });
  } finally {
    // Era só um arquivo de trabalho pra passar pela API — não fica no Storage.
    await file?.delete().catch(() => {});
  }
}