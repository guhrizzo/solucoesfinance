// lib/compras/attachmentsApi.ts
// Upload / download / remoção de anexos, compartilhado pelas rotas da equipe
// (orders/[id]/attachments) e do portal (portal/orders/[id]/attachments).
// A autorização (conta, fornecedor, papel) já foi feita pela rota; aqui o
// serviço ainda reconfere status e dono do pedido dentro da transação.

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { checkRateLimit } from "@/lib/rateLimit";
import { handleError, jsonError } from "./auth";
import { addAttachment, paths, removeAttachment, type Actor } from "./service";
import { attachmentResponse, checkFile, deleteAttachmentFile, readAttachment, saveAttachment } from "./storage";
import { MAX_ATTACHMENT_BYTES, type OrderAttachment, type PurchaseOrderDoc } from "./types";

const FILE_ERRORS: Record<string, string> = {
  fileTooLarge: "Arquivo acima de 4 MB.",
  fileType: "Formato não aceito. Envie PDF, imagem (PNG/JPG/WEBP), XLSX, DOCX ou CSV.",
  fileEmpty: "Arquivo vazio.",
};

export async function uploadAttachment(req: Request, ownerUid: string, orderId: string, actor: Actor, supplierId: string | null) {
  const rl = checkRateLimit(`compras:upload:${actor.uid}`, { windowMs: 10 * 60 * 1000, max: 30 });
  if (rl.limited) return NextResponse.json({ error: "Muitos envios. Aguarde alguns minutos.", code: "rateLimited" }, { status: 429 });

  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_ATTACHMENT_BYTES + 64 * 1024) return NextResponse.json({ error: FILE_ERRORS.fileTooLarge, code: "fileTooLarge" }, { status: 413 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("validation", 400);
  }
  const file = form.get("file");
  if (!(file instanceof Blob)) return jsonError("validation", 400);
  const name = typeof (file as File).name === "string" ? (file as File).name : "arquivo";
  const buf = Buffer.from(await file.arrayBuffer());
  const check = checkFile(name, buf);
  if (!check.ok) return NextResponse.json({ error: FILE_ERRORS[check.code], code: check.code }, { status: 400 });

  try {
    // Confere o pedido ANTES de subir o arquivo (evita lixo no Storage).
    const db = await getAdminDb();
    const snap = await db.doc(paths.order(ownerUid, orderId)).get();
    if (!snap.exists || (supplierId && (snap.data() as PurchaseOrderDoc).supplierId !== supplierId)) return jsonError("notFound", 404);

    const att = await saveAttachment(ownerUid, orderId, { name: check.name, contentType: check.contentType, buf }, actor);
    try {
      await addAttachment(db, ownerUid, orderId, att, actor, supplierId);
    } catch (err) {
      await deleteAttachmentFile(att.path);
      throw err;
    }
    return NextResponse.json({ ok: true, attachment: { id: att.id, name: att.name, size: att.size, contentType: att.contentType } });
  } catch (err) {
    return handleError(err, "attachments.upload");
  }
}

export async function downloadAttachment(ownerUid: string, orderId: string, attId: string, supplierId: string | null) {
  try {
    const db = await getAdminDb();
    const snap = await db.doc(paths.order(ownerUid, orderId)).get();
    if (!snap.exists) return jsonError("notFound", 404);
    const order = snap.data() as PurchaseOrderDoc;
    if (supplierId && order.supplierId !== supplierId) return jsonError("notFound", 404);
    const att = (order.attachments ?? []).find((a: OrderAttachment) => a.id === attId);
    // Fornecedor só baixa anexos do próprio lado (os internos são da empresa).
    if (!att || (supplierId && att.side !== "supplier")) return jsonError("attachmentNotFound", 404);
    return attachmentResponse(att, await readAttachment(att.path));
  } catch (err) {
    return handleError(err, "attachments.download");
  }
}

export async function deleteAttachment(ownerUid: string, orderId: string, attId: string, actor: Actor, supplierId: string | null) {
  try {
    const db = await getAdminDb();
    const removed = await removeAttachment(db, ownerUid, orderId, attId, actor, supplierId);
    await deleteAttachmentFile(removed.path);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err, "attachments.delete");
  }
}

export const isAttId = (s: string | null): s is string => !!s && /^[0-9a-f-]{36}$/.test(s);
