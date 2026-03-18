import { NextRequest, NextResponse } from "next/server";

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

async function analyzeChunk(chunk: string): Promise<any[]> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Extrato bancário:\n\n${chunk}` }],
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err?.error?.message ?? "Erro na API");
  }

  const data = await res.json();
  const rawText = (data.content as any[])?.map((c: any) => c.text || "").join("") ?? "";
  const clean = rawText.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(clean);
  return parsed.transactions ?? [];
}

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
  try {
    const { text } = await req.json();

    if (!text?.trim()) {
      return NextResponse.json({ error: "Texto vazio" }, { status: 400 });
    }

    const chunks = splitIntoChunks(text, 8000);

    // Processa chunks em paralelo (máx 3 simultâneos para não sobrecarregar)
    const allTransactions: any[] = [];
    for (let i = 0; i < chunks.length; i += 3) {
      const batch = chunks.slice(i, i + 3);
      const results = await Promise.all(batch.map(analyzeChunk));
      results.forEach(txs => allTransactions.push(...txs));
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
  }
}