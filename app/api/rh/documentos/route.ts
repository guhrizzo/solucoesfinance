export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getAdminBucket } from "@/lib/firebaseAdmin";
import { guardRh, isCtx, logRh, rhCol } from "@/lib/rh/server";

// Documentos do colaborador (contrato, RG, exames, atestados…). O arquivo mora no
// Storage, sem nenhum acesso pelo client; só estas rotas (Admin SDK) leem e gravam.
// Listar não pede PIN; baixar, enviar e excluir pedem.

const MAX_BYTES = 3 * 1024 * 1024; // o corpo da requisição vai em base64 (limite de ~4,5 MB da hospedagem)
const TIPOS: Record<string, string> = {
  "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
};
export const CATEGORIAS_DOC = ["contrato", "identificacao", "comprovante", "exame", "atestado", "outro"] as const;

const nomeSeguro = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\- ]+/g, "_").trim().slice(0, 80) || "documento";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const baixar = url.searchParams.get("baixar");
    const ctx = await guardRh(request, "doc-get", 60, "rh", !!baixar);
    if (!isCtx(ctx)) return ctx;

    if (baixar) {
      if (baixar.includes("/")) return NextResponse.json({ error: "Documento inválido." }, { status: 400 });
      const snap = await rhCol(ctx, "rhDocumentos").doc(baixar).get();
      if (!snap.exists) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
      const d = snap.data()!;
      const bucket = await getAdminBucket();
      const [buf] = await bucket.file(String(d.path)).download();
      await logRh(ctx, "baixou_documento", { colaboradorId: String(d.colaboradorId), info: String(d.nome) });
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": String(d.mime), "Cache-Control": "private, no-store",
          "Content-Disposition": `inline; filename="${encodeURIComponent(String(d.nome))}"`,
        },
      });
    }

    const colaboradorId = url.searchParams.get("colaboradorId") ?? "";
    if (!colaboradorId || colaboradorId.includes("/")) return NextResponse.json({ error: "Colaborador inválido." }, { status: 400 });
    const snap = await rhCol(ctx, "rhDocumentos").where("colaboradorId", "==", colaboradorId).get();
    const documentos = snap.docs
      .map((d) => ({ id: d.id, nome: String(d.data().nome), categoria: String(d.data().categoria ?? "outro"), mime: String(d.data().mime), size: Number(d.data().size) || 0, em: Number(d.data().createdAt) || 0, porNome: String(d.data().createdByName ?? "") }))
      .sort((a, b) => b.em - a.em);
    return NextResponse.json({ documentos });
  } catch (error) {
    console.error("Erro RH/documentos GET:", error);
    return NextResponse.json({ error: "Erro ao carregar os documentos." }, { status: 500 });
  }
}

/** { colaboradorId, categoria, nome, mime, dados (base64) } */
export async function POST(request: Request) {
  try {
    const ctx = await guardRh(request, "doc-post", 20);
    if (!isCtx(ctx)) return ctx;
    const body = await request.json().catch(() => ({}));
    const colaboradorId = String(body.colaboradorId ?? "");
    if (!colaboradorId || colaboradorId.includes("/")) return NextResponse.json({ error: "Colaborador inválido." }, { status: 400 });
    const mime = String(body.mime ?? "");
    if (!TIPOS[mime]) return NextResponse.json({ error: "Formato não aceito. Envie PDF, PNG, JPG ou WEBP." }, { status: 400 });
    const categoria = (CATEGORIAS_DOC as readonly string[]).includes(body.categoria) ? String(body.categoria) : "outro";
    const buf = Buffer.from(String(body.dados ?? ""), "base64");
    if (buf.length === 0) return NextResponse.json({ error: "Arquivo vazio." }, { status: 400 });
    if (buf.length > MAX_BYTES) return NextResponse.json({ error: "Arquivo grande demais (máximo de 3 MB)." }, { status: 413 });

    const colab = await rhCol(ctx, "rhColaboradores").doc(colaboradorId).get();
    if (!colab.exists) return NextResponse.json({ error: "Colaborador não encontrado." }, { status: 404 });
    const qtd = (await rhCol(ctx, "rhDocumentos").where("colaboradorId", "==", colaboradorId).get()).size;
    if (qtd >= 30) return NextResponse.json({ error: "Limite de 30 documentos por colaborador." }, { status: 409 });

    const ref = rhCol(ctx, "rhDocumentos").doc();
    const nome = nomeSeguro(String(body.nome ?? "documento"));
    const path = `rh/${ctx.ownerUid}/${colaboradorId}/${ref.id}.${TIPOS[mime]}`;
    const bucket = await getAdminBucket();
    await bucket.file(path).save(buf, { contentType: mime, resumable: false });
    await ref.set({
      colaboradorId, nome, categoria, mime, size: buf.length, path,
      createdAt: Date.now(), createdBy: ctx.actor.uid, createdByName: ctx.actor.name,
    });
    await logRh(ctx, "anexou_documento", { colaboradorId, colaboradorNome: String(colab.data()!.nome ?? ""), info: nome });
    return NextResponse.json({ ok: true, id: ref.id });
  } catch (error) {
    console.error("Erro RH/documentos POST:", error);
    return NextResponse.json({ error: "Erro ao enviar o documento." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await guardRh(request, "doc-del", 30);
    if (!isCtx(ctx)) return ctx;
    const body = await request.json().catch(() => ({}));
    const id = String(body.id ?? "");
    if (!id || id.includes("/")) return NextResponse.json({ error: "Documento inválido." }, { status: 400 });
    const ref = rhCol(ctx, "rhDocumentos").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
    const d = snap.data()!;
    const bucket = await getAdminBucket();
    await bucket.file(String(d.path)).delete({ ignoreNotFound: true });
    await ref.delete();
    await logRh(ctx, "removeu_documento", { colaboradorId: String(d.colaboradorId), info: String(d.nome) });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro RH/documentos DELETE:", error);
    return NextResponse.json({ error: "Erro ao excluir o documento." }, { status: 500 });
  }
}
