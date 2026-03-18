// app/api/analyze-nf/route.ts

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, content, base64, mediaType } = body;

    let messages: any[];

    if (type === "xml") {
      // NF-e XML: envia como texto
      messages = [{
        role: "user",
        content: `Analise esta NF-e XML e extraia os dados:\n\n${content}`,
      }];
    } else {
      // PDF ou imagem: envia como base64
      const isImage = (mediaType as string).startsWith("image/");
      messages = [{
        role: "user",
        content: [
          isImage
            ? { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } }
            : { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
          { type: "text", text: "Analise esta nota fiscal e extraia os dados principais." },
        ],
      }];
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
        max_tokens: 512,
        system: `Você analisa notas fiscais brasileiras (NF-e, NFS-e, cupom fiscal, etc).
Responda SOMENTE com JSON válido, sem markdown, sem texto adicional.
Formato:
{"description":"serviço ou produto principal (máx 40 chars)","amount":1234.56,"date":"YYYY-MM-DD","type":"saida","category":"categoria","note":"número da NF ou info útil"}
Regras:
- description: nome resumido do serviço/produto
- amount: valor total da nota, número positivo
- date: data de emissão no formato YYYY-MM-DD
- type: "saida" se for compra/pagamento, "entrada" se for venda/recebimento
- category: Vendas, Serviços prestados, Recebimento de clientes, Fornecedores, Aluguel, Impostos, Marketing, TI / Software, Outros gastos
- note: número da NF se disponível, senão string vazia`,
        messages,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      return NextResponse.json({ error: err?.error?.message ?? "Erro na API" }, { status: res.status });
    }

    const data = await res.json();
    const rawText = (data.content as any[])?.map((c: any) => c.text || "").join("") ?? "";
    const clean   = rawText.replace(/```json|```/g, "").trim();
    const parsed  = JSON.parse(clean);

    return NextResponse.json(parsed);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Erro interno" }, { status: 500 });
  }
}