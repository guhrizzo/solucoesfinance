// app/components/compras/api.ts
// Chamadas client-side às rotas /api/compras/**. As rotas devolvem
// { error, code, fields? } em caso de erro — aqui vira ComprasApiError, e a
// tela traduz pelo `code` (compras.errors.<code>).

export class ComprasApiError extends Error {
  code: string;
  status: number;
  fields?: Record<string, string>;
  constructor(message: string, code: string, status: number, fields?: Record<string, string>) {
    super(message);
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}

async function parse<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ComprasApiError(
      String(data.error ?? "Erro"),
      String(data.code ?? "generic"),
      res.status,
      (data.fields as Record<string, string> | undefined) ?? undefined,
    );
  }
  return data as T;
}

async function idToken(): Promise<string> {
  const { getFirebase } = await import("@/lib/firebase");
  const { auth } = await getFirebase();
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new ComprasApiError("Sessão expirada.", "auth", 401);
  return token;
}

function withJson(init: RequestInit & { json?: unknown }): RequestInit {
  const { json, ...rest } = init;
  if (json === undefined) return rest;
  return { ...rest, body: JSON.stringify(json), headers: { ...(rest.headers || {}), "Content-Type": "application/json" } };
}

/** Rotas da equipe interna (/api/compras/...). */
export async function internalApi<T = Record<string, unknown>>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const token = await idToken();
  const req = withJson(init);
  const res = await fetch(`/api/compras${path}`, { ...req, headers: { ...(req.headers || {}), Authorization: `Bearer ${token}` } });
  return parse<T>(res);
}

export const PORTAL_LINK_KEY = "nexusfi-portal-link";

export function getPortalLink(): string {
  try {
    return localStorage.getItem(PORTAL_LINK_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setPortalLink(key: string) {
  try {
    localStorage.setItem(PORTAL_LINK_KEY, key);
  } catch {
    /* sem storage: fica no primeiro vínculo */
  }
}

/** Rotas do portal (/api/compras/portal/...) — manda o vínculo escolhido no header. */
export async function portalApi<T = Record<string, unknown>>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const token = await idToken();
  const req = withJson(init);
  const res = await fetch(`/api/compras/portal${path}`, {
    ...req,
    headers: { ...(req.headers || {}), Authorization: `Bearer ${token}`, "x-portal-link": getPortalLink() },
  });
  return parse<T>(res);
}

/** Baixa um anexo (rota autenticada) e dispara o download no navegador. */
export async function downloadFile(url: string, name: string, portal: boolean) {
  const token = await idToken();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, ...(portal ? { "x-portal-link": getPortalLink() } : {}) } });
  if (!res.ok) await parse(res);
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

/** Upload multipart de um anexo. */
export async function uploadFile<T = Record<string, unknown>>(url: string, file: File, portal: boolean): Promise<T> {
  const token = await idToken();
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(url, {
    method: "POST",
    body: form,
    headers: { Authorization: `Bearer ${token}`, ...(portal ? { "x-portal-link": getPortalLink() } : {}) },
  });
  return parse<T>(res);
}

/** Chave de idempotência por ação (clique). */
export const newRequestKey = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "");
