"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { Button, Field, Input, MoneyInput, parseAmount } from "@/app/components/ui";
import { DocumentosColaborador } from "./DocumentosColaborador";
import { formatarCep, formatarCpf, rhApi, selectClass, selectStyle, hojeISO, type Colaborador, RhModal as Modal } from "./shared";

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
  cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "",
  jornadaTipo: "", cargaSemanal: "", horario: "",
  insalubridade: "0", periculosidade: "nao", categoriaFgts: "geral",
};

export function ColaboradorModal({ open, colaborador, onClose, onSaved }: Props) {
  const t = useTranslations("rh");
  const [f, setF] = useState({ ...VAZIO, dataEntrada: hojeISO() });
  const [membros, setMembros] = useState<{ uid: string; nome: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmaExcluir, setConfirmaExcluir] = useState(false);
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
    setConfirmaExcluir(false);
    if (!colaborador) { setF({ ...VAZIO, dataEntrada: hojeISO() }); return; }
    let cancelled = false;
    (async () => {
      try {
        const d = await rhApi<{ cpf?: string; banco?: Record<string, string> | null; endereco?: Record<string, string> | null }>(
          `/api/rh/colaboradores?id=${colaborador.id}&revelar=1`, {}, { pin: true },
        );
        if (cancelled) return;
        const b = d.banco ?? {};
        const en = d.endereco ?? {};
        setF({
          nome: colaborador.nome, cpf: formatarCpf(d.cpf ?? ""), cargo: colaborador.cargo, vinculo: colaborador.vinculo,
          dataEntrada: colaborador.dataEntrada, dataSaida: colaborador.dataSaida ?? "", status: colaborador.status,
          dependentes: String(colaborador.dependentes), comissionado: colaborador.comissionado ? "sim" : "nao", salarioInicial: "", membroUid: colaborador.membroUid ?? "",
          banco: b.banco ?? "", agencia: b.agencia ?? "", conta: b.conta ?? "", tipoConta: b.tipoConta ?? "", pix: b.pix ?? "",
          cep: formatarCep(en.cep ?? ""), logradouro: en.logradouro ?? "", numero: en.numero ?? "", complemento: en.complemento ?? "",
          bairro: en.bairro ?? "", cidade: en.cidade ?? "", uf: en.uf ?? "",
          jornadaTipo: colaborador.jornada?.tipo ?? "", cargaSemanal: colaborador.jornada?.cargaSemanal ? String(colaborador.jornada.cargaSemanal) : "",
          horario: colaborador.jornada?.horario ?? "",
          insalubridade: String(colaborador.insalubridade ?? 0), periculosidade: colaborador.periculosidade ? "sim" : "nao",
          categoriaFgts: colaborador.categoriaFgts ?? "geral",
        });
      } catch (e) {
        if (!cancelled) setErro(e instanceof Error ? e.message : t("comum.erroCarregar"));
      }
    })();
    return () => { cancelled = true; };
  }, [open, colaborador, t]);

  async function excluir() {
    if (!colaborador) return;
    setSaving(true);
    setErro("");
    try {
      await rhApi("/api/rh/colaboradores", { method: "DELETE", body: { id: colaborador.id } });
      onSaved();
      onClose();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
      setConfirmaExcluir(false);
    } finally {
      setSaving(false);
    }
  }

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
        endereco: { cep: f.cep, logradouro: f.logradouro, numero: f.numero, complemento: f.complemento, bairro: f.bairro, cidade: f.cidade, uf: f.uf },
        jornada: { tipo: f.jornadaTipo, cargaSemanal: f.cargaSemanal ? Number(f.cargaSemanal.replace(",", ".")) : null, horario: f.horario },
        insalubridade: Number(f.insalubridade) || 0, periculosidade: f.periculosidade === "sim", categoriaFgts: f.categoriaFgts,
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
          <Field label={t("form.nome")}><Input placeholder={t("form.ph.nome")} value={f.nome} onChange={(e) => set("nome", e.target.value)} maxLength={120} /></Field>
          <Field label={t("form.cpf")}><Input inputMode="numeric" placeholder={t("form.ph.cpf")} value={f.cpf} onChange={(e) => set("cpf", formatarCpf(e.target.value))} maxLength={14} /></Field>
          <Field label={t("form.cargo")}><Input placeholder={t("form.ph.cargo")} value={f.cargo} onChange={(e) => set("cargo", e.target.value)} maxLength={80} /></Field>
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
          <Field label={t("form.dependentes")}><Input type="number" min={0} max={20} placeholder="0" value={f.dependentes} onChange={(e) => set("dependentes", e.target.value)} /></Field>
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
            <Field label={t("form.bancoNome")}><Input placeholder={t("form.ph.banco")} value={f.banco} onChange={(e) => set("banco", e.target.value)} maxLength={60} /></Field>
            <Field label={t("form.tipoConta")}>
              <select className={selectClass} style={selectStyle} value={f.tipoConta} onChange={(e) => set("tipoConta", e.target.value)}>
                <option value="">{t("form.ph.tipoConta")}</option>
                <option value="corrente">{t("form.corrente")}</option>
                <option value="poupanca">{t("form.poupanca")}</option>
              </select>
            </Field>
            <Field label={t("form.agencia")}><Input placeholder={t("form.ph.agencia")} value={f.agencia} onChange={(e) => set("agencia", e.target.value)} maxLength={20} /></Field>
            <Field label={t("form.conta")}><Input placeholder={t("form.ph.conta")} value={f.conta} onChange={(e) => set("conta", e.target.value)} maxLength={30} /></Field>
            <Field label={t("form.pix")} className="sm:col-span-2"><Input placeholder={t("form.ph.pix")} value={f.pix} onChange={(e) => set("pix", e.target.value)} maxLength={80} /></Field>
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-1 text-sm font-semibold" style={{ color: "var(--text)" }}>{t("form.endereco")}</legend>
          <div className="grid gap-3 sm:grid-cols-6">
            <Field label={t("form.cep")} className="sm:col-span-2"><Input inputMode="numeric" placeholder="00000-000" value={f.cep} onChange={(e) => set("cep", formatarCep(e.target.value))} maxLength={9} /></Field>
            <Field label={t("form.logradouro")} className="sm:col-span-3"><Input value={f.logradouro} onChange={(e) => set("logradouro", e.target.value)} maxLength={120} /></Field>
            <Field label={t("form.numero")} className="sm:col-span-1"><Input value={f.numero} onChange={(e) => set("numero", e.target.value)} maxLength={12} /></Field>
            <Field label={t("form.complemento")} className="sm:col-span-2"><Input value={f.complemento} onChange={(e) => set("complemento", e.target.value)} maxLength={60} /></Field>
            <Field label={t("form.bairro")} className="sm:col-span-2"><Input value={f.bairro} onChange={(e) => set("bairro", e.target.value)} maxLength={60} /></Field>
            <Field label={t("form.cidade")} className="sm:col-span-1"><Input value={f.cidade} onChange={(e) => set("cidade", e.target.value)} maxLength={60} /></Field>
            <Field label={t("form.uf")} className="sm:col-span-1"><Input value={f.uf} onChange={(e) => set("uf", e.target.value.toUpperCase().slice(0, 2))} maxLength={2} /></Field>
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-1 text-sm font-semibold" style={{ color: "var(--text)" }}>{t("form.jornada")}</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t("form.jornadaTipo")}>
              <select className={selectClass} style={selectStyle} value={f.jornadaTipo} onChange={(e) => set("jornadaTipo", e.target.value)}>
                <option value="">{t("form.ph.jornadaTipo")}</option>
                {(["5x2", "6x1", "12x36", "parcial", "outra"] as const).map((j) => <option key={j} value={j}>{t(`form.jornadas.${j}`)}</option>)}
              </select>
            </Field>
            <Field label={t("form.cargaSemanal")}><Input inputMode="decimal" placeholder="44" value={f.cargaSemanal} onChange={(e) => set("cargaSemanal", e.target.value.replace(/[^\d,.]/g, ""))} maxLength={5} /></Field>
            <Field label={t("form.horario")}><Input placeholder={t("form.ph.horario")} value={f.horario} onChange={(e) => set("horario", e.target.value)} maxLength={80} /></Field>
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-1 text-sm font-semibold" style={{ color: "var(--text)" }}>{t("form.adicionais")}</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t("form.insalubridade")} hint={t("form.insalubridadeHint")}>
              <select className={selectClass} style={selectStyle} value={f.insalubridade} onChange={(e) => setF((p) => ({ ...p, insalubridade: e.target.value, periculosidade: e.target.value !== "0" ? "nao" : p.periculosidade }))}>
                <option value="0">{t("form.nenhum")}</option>
                <option value="10">{t("form.grauMinimo")}</option>
                <option value="20">{t("form.grauMedio")}</option>
                <option value="40">{t("form.grauMaximo")}</option>
              </select>
            </Field>
            <Field label={t("form.periculosidade")} hint={t("form.periculosidadeHint")}>
              <select className={selectClass} style={selectStyle} value={f.periculosidade} onChange={(e) => setF((p) => ({ ...p, periculosidade: e.target.value, insalubridade: e.target.value === "sim" ? "0" : p.insalubridade }))}>
                <option value="nao">{t("form.nao")}</option>
                <option value="sim">{t("form.sim")}</option>
              </select>
            </Field>
            <Field label={t("form.categoriaFgts")}>
              <select className={selectClass} style={selectStyle} value={f.categoriaFgts} onChange={(e) => set("categoriaFgts", e.target.value)}>
                {(["geral", "aprendiz", "domestico"] as const).map((c) => <option key={c} value={c}>{t(`form.fgts.${c}`)}</option>)}
              </select>
            </Field>
          </div>
        </fieldset>

        {colaborador ? <DocumentosColaborador colaboradorId={colaborador.id} /> : <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{t("docs.salveAntes")}</p>}

        {colaborador && <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{t("form.revelaNota")}</p>}
        {erro && <p role="alert" className="text-sm font-medium" style={{ color: "var(--neg)" }}>{erro}</p>}

        <div className="flex flex-wrap items-center justify-between gap-2">
          {colaborador ? (
            confirmaExcluir
              ? <span className="flex items-center gap-2"><span className="text-xs" style={{ color: "var(--neg)" }}>{t("crud.confirmaColab")}</span><Button variant="danger" size="sm" onClick={excluir} disabled={saving}>{t("crud.confirmar")}</Button><Button variant="ghost" size="sm" onClick={() => setConfirmaExcluir(false)}>{t("crud.cancelar")}</Button></span>
              : <Button variant="danger" size="sm" onClick={() => setConfirmaExcluir(true)} disabled={saving}>{t("crud.excluirColaborador")}</Button>
          ) : <span />}
          <span className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>{t("form.cancelar")}</Button>
            <Button onClick={salvar} loading={saving} disabled={saving}>{saving ? t("form.salvando") : t("form.salvar")}</Button>
          </span>
        </div>
      </div>
    </Modal>
  );
}
