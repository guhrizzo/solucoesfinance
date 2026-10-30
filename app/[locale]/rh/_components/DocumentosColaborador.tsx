"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, Paperclip, Trash2 } from "lucide-react";
import { Button, Field } from "@/app/components/ui";
import { abrirPdf, rhApi, selectClass, selectStyle } from "./shared";

interface Doc { id: string; nome: string; categoria: string; mime: string; size: number; em: number; porNome: string }

const CATEGORIAS = ["contrato", "identificacao", "comprovante", "exame", "atestado", "outro"] as const;
const MAX = 3 * 1024 * 1024;

const paraBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    r.readAsDataURL(file);
  });

/** Anexos do colaborador (contrato, RG, exames…). Só existe depois de o colaborador ser salvo. */
export function DocumentosColaborador({ colaboradorId }: { colaboradorId: string }) {
  const t = useTranslations("rh");
  const [docs, setDocs] = useState<Doc[]>([]);
  const [categoria, setCategoria] = useState<string>("contrato");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [confirma, setConfirma] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await rhApi<{ documentos: Doc[] }>(`/api/rh/documentos?colaboradorId=${colaboradorId}`);
      setDocs(r.documentos);
    } catch (e) {
      setErro(e instanceof Error ? e.message : t("comum.erroCarregar"));
    }
  }, [colaboradorId, t]);

  useEffect(() => { carregar(); }, [carregar]);

  async function enviar(file: File) {
    setErro("");
    if (file.size > MAX) { setErro(t("docs.grande")); return; }
    setBusy(true);
    try {
      await rhApi("/api/rh/documentos", { body: { colaboradorId, categoria, nome: file.name, mime: file.type, dados: await paraBase64(file) } });
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function excluir(id: string) {
    setBusy(true); setErro("");
    try {
      await rhApi("/api/rh/documentos", { method: "DELETE", body: { id } });
      setConfirma(null);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  const rotulo = (c: string) => t(`docs.categorias.${(CATEGORIAS as readonly string[]).includes(c) ? c : "outro"}`);

  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-sm font-semibold" style={{ color: "var(--text)" }}>{t("docs.titulo")}</legend>
      <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{t("docs.nota")}</p>
      <div className="flex flex-wrap items-end gap-2">
        <Field label={t("docs.categoria")}>
          <select className={selectClass} style={selectStyle} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {CATEGORIAS.map((c) => <option key={c} value={c}>{rotulo(c)}</option>)}
          </select>
        </Field>
        <input ref={input} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void enviar(f); }} />
        <Button variant="secondary" size="sm" icon={Paperclip} loading={busy} disabled={busy} onClick={() => input.current?.click()}>{t("docs.anexar")}</Button>
      </div>
      {erro && <p role="alert" className="text-xs font-medium" style={{ color: "var(--neg)" }}>{erro}</p>}
      {docs.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{t("docs.vazio")}</p>
      ) : (
        <ul className="divide-y rounded-lg border text-sm" style={{ borderColor: "var(--border)" }}>
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate font-medium">{d.nome}</span>
                <span className="text-xs" style={{ color: "var(--text-subtle)" }}>{rotulo(d.categoria)} · {Math.max(1, Math.round(d.size / 1024))} KB{d.porNome ? ` · ${d.porNome}` : ""}</span>
              </span>
              <span className="flex items-center gap-1">
                <Button size="sm" variant="ghost" icon={Download} aria-label={t("docs.abrir")} onClick={() => abrirPdf(`/api/rh/documentos?baixar=${d.id}`).catch((e) => setErro(e instanceof Error ? e.message : "Erro"))} />
                {confirma === d.id ? (
                  <>
                    <Button size="sm" variant="danger" onClick={() => excluir(d.id)} disabled={busy}>{t("crud.confirmar")}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirma(null)}>{t("crud.cancelar")}</Button>
                  </>
                ) : (
                  <Button size="sm" variant="ghost" icon={Trash2} aria-label={t("docs.remover")} onClick={() => setConfirma(d.id)} disabled={busy} />
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
