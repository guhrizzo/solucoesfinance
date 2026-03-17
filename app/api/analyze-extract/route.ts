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
        max_tokens: 4096,
        system: `Você é um analisador de extratos bancários brasileiros.
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
- note: deixe vazio ("") sempre que possível para economizar tokens
Seja conciso. Extraia todas as transações sem omitir nenhuma.`,
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