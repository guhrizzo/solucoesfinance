"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { Button, Field, Input, Modal, MoneyInput, parseAmount } from "@/app/components/ui";
import { rhApi, selectClass, selectStyle, hojeISO, type Colaborador } from "./shared";

interface Props {
  open: boolean;
  /** null = novo colaborador. */
  colaborador: Colaborador | null;
  onClose: () => void;
  onSaved: () => void;
}

const VAZIO = {
  nome: "", cpf: "", cargo: "", vinculo: "CLT", dataEntrada: "", dataSaida: "", status: "ativo",
  dependentes: "0", comissionado: "nao", salarioInicial: "", membroUid: "",
  banco: "", agencia: "", conta: "", tipoConta: "", pix: "",
};

export function ColaboradorModal({ open, colaborador, onClose, onSaved }: Props) {
  const t = useTranslations("rh");
  const [f, setF] = useState({ ...VAZIO, dataEntrada: hojeISO() });
  const [membros, setMembros] = useState<{ uid: string; nome: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");

  const set = (k: keyof typeof VAZIO, v: string) => setF((p) => ({ ...p, [k]: v }));

  // Usuários que podem ser vinculados (equipe + dono) — dá a visão "meus indicadores".
  useEffect(() => {
    if (!open) return;
    rhApi<{ ownerUid: string; membros: { uid: string; nome: string }[] }>("/api/rh/membros")
      .then((d) => setMembros([{ uid: d.ownerUid, nome: t("form.usuarioDono") }, ...d.membros]))
      .catch(() => setMembros([]));
  }, [open, t]);

  // Edição: carrega o cadastro completo (CPF/banco decifrados no servidor — a
  // abertura fica registrada no log de acessos).
  useEffect(() => {
    if (!open) return;
    setErro("");
    if (!colaborador) { setF({ ...VAZIO, dataEntrada: hojeISO() }); return; }
    let cancelled = false;
    (async () => {
      try {
        const d = await rhApi<{ cpf?: string; banco?: Record<string, string> | null }>(
          `/api/rh/colaboradores?id=${colaborador.id}&revelar=1`,
        );
        if (cancelled) return;
        const b = d.banco ?? {};
        setF({
          nome: colaborador.nome, cpf: d.cpf ?? "", cargo: colaborador.cargo, vinculo: colaborador.vinculo,
          dataEntrada: colaborador.dataEntrada, dataSaida: colaborador.dataSaida ?? "", status: colaborador.status,
          dependentes: String(colaborador.dependentes), comissionado: colaborador.comissionado ? "sim" : "nao", salarioInicial: "", membroUid: colaborador.membroUid ?? "",
          banco: b.banco ?? "", agencia: b.agencia ?? "", conta: b.conta ?? "", tipoConta: b.tipoConta ?? "", pix: b.pix ?? "",
        });
      } catch (e) {
        if (!cancelled) setErro(e instanceof Error ? e.message : t("comum.erroCarregar"));
      }
    })();
    return () => { cancelled = true; };
  }, [open, colaborador, t]);

  async function salvar() {
    setSaving(true);
    setErro("");
    try {
      const payload = {
        nome: f.nome, cpf: f.cpf, cargo: f.cargo, vinculo: f.vinculo, dataEntrada: f.dataEntrada,
        dataSaida: f.dataSaida || null, status: f.status, dependentes: Number(f.dependentes) || 0,
        comissionado: f.comissionado === "sim",
        membroUid: f.membroUid || null,
        banco: { banco: f.banco, agencia: f.agencia, conta: f.conta, tipoConta: f.tipoConta, pix: f.pix },
      };
      if (colaborador) {
        await rhApi("/api/rh/colaboradores", { method: "PATCH", body: { id: colaborador.id, ...payload } });
      } else {
        await rhApi("/api/rh/colaboradores", {
          body: { ...payload, salarioInicial: f.salarioInicial ? parseAmount(f.salarioInicial) : undefined },
        });
      }
      onSaved();
      onClose();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title={colaborador ? t("form.tituloEditar") : t("form.tituloNovo")} closeDisabled={saving}>
      <div className="space-y-4">
        <p className="flex items-start gap-2 rounded-lg p-3 text-xs" style={{ background: "var(--sunken)", color: "var(--text-muted)" }}>
          <ShieldCheck size={15} className="mt-0.5 shrink-0" aria-hidden />
          <span>{t("aviso")}</span>
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("form.nome")}><Input value={f.nome} onChange={(e) => set("nome", e.target.value)} maxLength={120} /></Field>
          <Field label={t("form.cpf")}><Input inputMode="numeric" value={f.cpf} onChange={(e) => set("cpf", e.target.value)} maxLength={14} /></Field>
          <Field label={t("form.cargo")}><Input value={f.cargo} onChange={(e) => set("cargo", e.target.value)} maxLength={80} /></Field>
          <Field label={t("form.vinculo")}>
            <select className={selectClass} style={selectStyle} value={f.vinculo} onChange={(e) => set("vinculo", e.target.value)}>
              {(["CLT", "PJ", "estagio", "outro"] as const).map((v) => <option key={v} value={v}>{t(`vinculos.${v}`)}</option>)}
            </select>
          </Field>
          <Field label={t("form.entrada")}><Input type="date" value={f.dataEntrada} onChange={(e) => set("dataEntrada", e.target.value)} /></Field>
          <Field label={t("form.saida")}><Input type="date" value={f.dataSaida} onChange={(e) => set("dataSaida", e.target.value)} /></Field>
          <Field label={t("form.status")}>
            <select className={selectClass} style={selectStyle} value={f.status} onChange={(e) => set("status", e.target.value)}>
              <option value="ativo">{t("status.ativo")}</option>
              <option value="inativo">{t("status.inativo")}</option>
            </select>
          </Field>
          <Field label={t("form.dependentes")}><Input type="number" min={0} max={20} value={f.dependentes} onChange={(e) => set("dependentes", e.target.value)} /></Field>
          <Field label={t("form.comissionado")}>
            <select className={selectClass} style={selectStyle} value={f.comissionado} onChange={(e) => set("comissionado", e.target.value)}>
              <option value="nao">{t("form.nao")}</option>
              <option value="sim">{t("form.sim")}</option>
            </select>
          </Field>
          <Field label={t("form.usuario")} hint={t("form.usuarioHint")}>
            <select className={selectClass} style={selectStyle} value={f.membroUid} onChange={(e) => set("membroUid", e.target.value)}>
              <option value="">{t("form.usuarioNenhum")}</option>
              {membros.map((m) => <option key={m.uid} value={m.uid}>{m.nome}</option>)}
            </select>
          </Field>
          {!colaborador && (
            <Field label={t("form.salarioInicial")} hint={t("form.salarioHint")}>
              <MoneyInput value={f.salarioInicial} onValueChange={(v) => set("salarioInicial", v)} />
            </Field>
          )}
        </div>

        <fieldset className="space-y-3">
          <legend className="mb-1 text-sm font-semibold" style={{ color: "var(--text)" }}>{t("form.banco")}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("form.bancoNome")}><Input value={f.banco} onChange={(e) => set("banco", e.target.value)} maxLength={60} /></Field>
            <Field label={t("form.tipoConta")}>
              <select className={selectClass} style={selectStyle} value={f.tipoConta} onChange={(e) => set("tipoConta", e.target.value)}>
                <option value="" />
                <option value="corrente">{t("form.corrente")}</option>
                <option value="poupanca">{t("form.poupanca")}</option>
              </select>
            </Field>
            <Field label={t("form.agencia")}><Input value={f.agencia} onChange={(e) => set("agencia", e.target.value)} maxLength={20} /></Field>
            <Field label={t("form.conta")}><Input value={f.conta} onChange={(e) => set("conta", e.target.value)} maxLength={30} /></Field>
            <Field label={t("form.pix")} className="sm:col-span-2"><Input value={f.pix} onChange={(e) => set("pix", e.target.value)} maxLength={80} /></Field>
          </div>
        </fieldset>

        {colaborador && <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{t("form.revelaNota")}</p>}
        {erro && <p role="alert" className="text-sm font-medium" style={{ color: "var(--neg)" }}>{erro}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>{t("form.cancelar")}</Button>
          <Button onClick={salvar} loading={saving} disabled={saving}>{saving ? t("form.salvando") : t("form.salvar")}</Button>
        </div>
      </div>
    </Modal>
  );
}
