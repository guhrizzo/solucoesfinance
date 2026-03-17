import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();

    if (!text?.trim()) {
      return NextResponse.json({ error: "Texto vazio" }, { status: 400 });
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        system: `Você é um analisador de extratos bancários brasileiros especializado em finanças empresariais.
Analise o texto e extraia TODAS as transações financeiras encontradas.
Responda SOMENTE com JSON válido, sem markdown, sem texto adicional, sem explicações.
Formato exato:
{"transactions":[{"type":"entrada","description":"descrição curta","category":"categoria livre","amount":1234.56,"date":"YYYY-MM-DD","note":"observação ou vazio"}]}
Regras:
- type: "entrada" para créditos/depósitos/recebimentos; "saida" para débitos/pagamentos/saques
- description: máximo 40 caracteres, nome da operação
- category: classifique livremente (ex: Salário, Aluguel, Fornecedor, Vendas, etc.)
- amount: número positivo sem símbolo de moeda
- date: formato YYYY-MM-DD; se não houver, use a data de hoje
- note: qualquer info extra útil ou string vazia
Extraia o máximo de transações possível.`,
        messages: [{ role: "user", content: `Extrato bancário:\n\n${text}` }],
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      return NextResponse.json({ error: err?.error?.message ?? "Erro na API" }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Erro interno" }, { status: 500 });
  }
}