// lib/compras/storage.ts
// Anexos dos pedidos (propostas, orçamentos) — SOMENTE server-side.
// Ficam em compras/{ownerUid}/{orderId}/{attachmentId}, caminho que o
// storage.rules NEGA pro client: upload e download passam sempre pelas rotas
// (que conferem conta/fornecedor) e o Admin SDK grava/lê.

import { randomUUID } from "node:crypto";
import { getAdminBucket } from "@/lib/firebaseAdmin";
import { MAX_ATTACHMENT_BYTES, type OrderAttachment } from "./types";

const ALLOWED: { type: string; ext: string[]; sniff: (b: Buffer) => boolean }[] = [
  { type: "application/pdf", ext: ["pdf"], sniff: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  { type: "image/png", ext: ["png"], sniff: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: "image/jpeg", ext: ["jpg", "jpeg"], sniff: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/webp", ext: ["webp"], sniff: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
  {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: ["xlsx"],
    sniff: (b) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04,
  },
  {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: ["docx"],
    sniff: (b) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04,
  },
  { type: "text/csv", ext: ["csv"], sniff: (b) => !b.subarray(0, 1024).includes(0) },
];

export function sanitizeFileName(name: string): string {
  const base = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._ -]/g, "_").replace(/\s+/g, " ").trim();
  return (base || "arquivo").slice(-120);
}

export type FileCheck = { ok: true; contentType: string; name: string } | { ok: false; code: "fileTooLarge" | "fileType" | "fileEmpty" };

/** Confere tamanho, extensão E assinatura do conteúdo (não confia no MIME do navegador). */
export function checkFile(name: string, buf: Buffer): FileCheck {
  if (buf.length === 0) return { ok: false, code: "fileEmpty" };
  if (buf.length > MAX_ATTACHMENT_BYTES) return { ok: false, code: "fileTooLarge" };
  const clean = sanitizeFileName(name);
  const ext = clean.split(".").pop()?.toLowerCase() ?? "";
  const match = ALLOWED.find((a) => a.ext.includes(ext) && a.sniff(buf));
  if (!match) return { ok: false, code: "fileType" };
  return { ok: true, contentType: match.type, name: clean };
}

export async function saveAttachment(
  ownerUid: string, orderId: string, file: { name: string; contentType: string; buf: Buffer },
  who: { uid: string; name: string; side: "supplier" | "internal" },
): Promise<OrderAttachment> {
  const id = randomUUID();
  const path = `compras/${ownerUid}/${orderId}/${id}`;
  const bucket = await getAdminBucket();
  await bucket.file(path).save(file.buf, {
    resumable: false,
    contentType: file.contentType,
    metadata: { contentDisposition: `attachment; filename="${file.name.replace(/"/g, "")}"`, metadata: { ownerUid, orderId, side: who.side } },
  });
  return {
    id, name: file.name, size: file.buf.length, contentType: file.contentType, path, side: who.side,
    uploadedAt: Date.now(), uploadedBy: who.uid, uploadedByName: who.name,
  };
}

export async function readAttachment(path: string): Promise<Buffer> {
  const bucket = await getAdminBucket();
  const [buf] = await bucket.file(path).download();
  return buf;
}

export async function deleteAttachmentFile(path: string): Promise<void> {
  const bucket = await getAdminBucket();
  await bucket.file(path).delete({ ignoreNotFound: true }).catch((err: unknown) => console.error("[compras] apagar anexo:", err));
}

/** Resposta de download (stream do arquivo, sempre como anexo, sem cache). */
export function attachmentResponse(att: OrderAttachment, buf: Buffer): Response {
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": att.contentType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(att.name)}"; filename*=UTF-8''${encodeURIComponent(att.name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
