"use client";

// Cadastro/edição de fornecedor em 3 etapas (empresa → contato → endereço).
// Valida no client com a mesma função do servidor (lib/compras/validate) e
// mostra também os erros devolvidos pela API (ex.: CNPJ duplicado).

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { Button, Field, Input, Modal } from "@/app/components/ui";
import { validateSupplier, maskCnpj, maskPhone, maskCep, isValidCnpj, onlyDigits } from "@/lib/compras/validate";
import { UFS, type SupplierDoc, type SupplierInput } from "@/lib/compras/types";
import { internalApi } from "@/app/components/compras/api";
import { errorText, fieldErrors, controlClass, controlStyle } from "@/app/components/compras/shared";

type Form = {
  razaoSocial: string; nomeFantasia: string; cnpj: string; ie: string; responsavel: string; email: string;
  telefone: string; whatsapp: string; categoria: string; observacoes: string; status: "ativo" | "inativo";
  logradouro: string; numero: string; complemento: string; bairro: string; cep: string; cidade: string; uf: string;
};

const STEP_FIELDS: (keyof Form | string)[][] = [
  ["razaoSocial", "nomeFantasia", "cnpj", "ie", "categoria", "status"],
  ["responsavel", "email", "telefone", "whatsapp"],
  ["endereco.cep", "endereco.logradouro", "endereco.numero", "endereco.complemento", "endereco.bairro", "endereco.cidade", "endereco.uf", "observacoes"],
];

function toForm(s: SupplierDoc | null): Form {
  return {
    razaoSocial: s?.razaoSocial ?? "", nomeFantasia: s?.nomeFantasia ?? "", cnpj: maskCnpj(s?.cnpj ?? ""), ie: s?.ie ?? "",
    responsavel: s?.responsavel ?? "", email: s?.email ?? "", telefone: maskPhone(s?.telefone ?? ""), whatsapp: maskPhone(s?.whatsapp ?? ""),
    categoria: s?.categoria ?? "", observacoes: s?.observacoes ?? "", status: s?.status ?? "ativo",
    logradouro: s?.endereco?.logradouro ?? "", numero: s?.endereco?.numero ?? "", complemento: s?.endereco?.complemento ?? "",
    bairro: s?.endereco?.bairro ?? "", cep: maskCep(s?.endereco?.cep ?? ""), cidade: s?.endereco?.cidade ?? "", uf: s?.endereco?.uf ?? "",
  };
}

function toPayload(f: Form): SupplierInput {
  return {
    razaoSocial: f.razaoSocial, nomeFantasia: f.nomeFantasia, cnpj: f.cnpj, ie: f.ie, responsavel: f.responsavel,
    email: f.email, telefone: f.telefone, whatsapp: f.whatsapp, categoria: f.categoria, observacoes: f.observacoes, status: f.status,
    endereco: { logradouro: f.logradouro, numero: f.numero, complemento: f.complemento, bairro: f.bairro, cep: f.cep, cidade: f.cidade, uf: f.uf },
  };
}

interface Props {
  open: boolean;
  editing: SupplierDoc | null;
  existingCnpjs: Map<string, string>; // cnpj → supplierId (checagem imediata de duplicidade)
  onClose: () => void;
  onSaved: (msg: string) => void;
}

export function SupplierFormModal({ open, editing, existingCnpjs, onClose, onSaved }: Props) {
  const t = useTranslations("compras");
  const tErr = useTranslations("compras.errors");
  const [form, setForm] = useState<Form>(toForm(editing));
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState("");

  useEffect(() => {
    if (open) { setForm(toForm(editing)); setStep(0); setErrors({}); setApiError(""); }
  }, [open, editing]);

  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const allErrors = useMemo(() => {
    const r = validateSupplier(toPayload(form));
    const errs: Record<string, string> = r.ok ? {} : { ...r.errors };
    const cnpj = onlyDigits(form.cnpj);
    const owner = existingCnpjs.get(cnpj);
    if (isValidCnpj(cnpj) && owner && owner !== editing?.id) errs.cnpj = "duplicateCnpj";
    return errs;
  }, [form, existingCnpjs, editing]);

  const stepErrors = (i: number) =>
    Object.fromEntries(Object.entries(allErrors).filter(([k]) => STEP_FIELDS[i].includes(k)).map(([k, c]) => [k, tErr.has(c) ? tErr(c) : c]));

  function next() {
    const e = stepErrors(step);
    setErrors(e);
    if (Object.keys(e).length === 0) setStep((s) => Math.min(2, s + 1));
  }

  async function save() {
    const all = Object.fromEntries(Object.entries(allErrors).map(([k, c]) => [k, tErr.has(c) ? tErr(c) : c]));
    setErrors(all);
    if (Object.keys(all).length) {
      const first = STEP_FIELDS.findIndex((fs) => fs.some((f) => f in all));
      if (first >= 0) setStep(first);
      return;
    }
    setSaving(true);
    setApiError("");
    try {
      if (editing) {
        await internalApi(`/suppliers/${editing.id}`, { method: "PATCH", json: { action: "update", data: toPayload(form) } });
        onSaved(t("supplier.saved"));
      } else {
        await internalApi("/suppliers", { method: "POST", json: { data: toPayload(form) } });
        onSaved(t("supplier.created"));
      }
      onClose();
    } catch (err) {
      const fe = fieldErrors(tErr, err);
      setErrors(fe);
      setApiError(errorText(tErr, err));
      const first = STEP_FIELDS.findIndex((fs) => fs.some((f) => f in fe));
      if (first >= 0) setStep(first);
    } finally {
      setSaving(false);
    }
  }

  const e = errors;
  const steps = [t("supplier.steps.company"), t("supplier.steps.contact"), t("supplier.steps.address")];

  return (
    <Modal open={open} onClose={onClose} title={editing ? t("supplier.edit") : t("supplier.new")} size="lg" closeDisabled={saving} mobileSheet>
      <div className="max-h-[75vh] overflow-y-auto px-5 py-4">
        {/* Etapas */}
        <ol className="mb-5 flex items-center gap-2" aria-label={t("supplier.stepOf", { current: step + 1, total: 3 })}>
          {steps.map((label, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <li key={label} className="flex flex-1 items-center gap-2">
                <button type="button" disabled={!editing && i > step} onClick={() => (editing || i < step) && setStep(i)}
                  aria-current={active ? "step" : undefined}
                  className="flex cursor-pointer items-center gap-2 text-xs font-semibold disabled:cursor-default"
                  style={{ color: active ? "var(--brand)" : done ? "var(--pos)" : "var(--text-subtle)" }}>
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px]"
                    style={{ background: active ? "var(--brand)" : done ? "var(--pos)" : "var(--sunken)", color: active || done ? "var(--on-accent)" : "var(--text-muted)" }}>
                    {done ? <Check size={12} /> : i + 1}
                  </span>
                  <span className="hidden sm:inline">{label}</span>
                </button>
                {i < 2 && <span className="h-px flex-1" style={{ background: "var(--border)" }} />}
              </li>
            );
          })}
        </ol>

        {step === 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("supplier.fields.razaoSocial")} error={e.razaoSocial} className="sm:col-span-2">
              <Input value={form.razaoSocial} maxLength={160} onChange={(ev) => set("razaoSocial", ev.target.value)} />
            </Field>
            <Field label={t("supplier.fields.nomeFantasia")} error={e.nomeFantasia}>
              <Input value={form.nomeFantasia} maxLength={120} onChange={(ev) => set("nomeFantasia", ev.target.value)} />
            </Field>
            <Field label={t("supplier.fields.cnpj")} error={e.cnpj ?? (onlyDigits(form.cnpj).length === 14 && allErrors.cnpj ? tErr(allErrors.cnpj) : undefined)}>
              <Input value={form.cnpj} inputMode="numeric" placeholder="00.000.000/0000-00" onChange={(ev) => set("cnpj", maskCnpj(ev.target.value))} />
            </Field>
            <Field label={t("supplier.fields.ie")} error={e.ie}>
              <Input value={form.ie} maxLength={20} onChange={(ev) => set("ie", ev.target.value)} />
            </Field>
            <Field label={t("supplier.fields.categoria")} error={e.categoria}>
              <Input value={form.categoria} maxLength={80} onChange={(ev) => set("categoria", ev.target.value)} />
            </Field>
            <Field label={t("supplier.fields.status")} hint={form.status === "inativo" ? t("supplier.inactiveHint") : undefined}>
              <select value={form.status} onChange={(ev) => set("status", ev.target.value)} className={controlClass} style={controlStyle}>
                <option value="ativo">{t("supplierStatus.ativo")}</option>
                <option value="inativo">{t("supplierStatus.inativo")}</option>
              </select>
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("supplier.fields.responsavel")} error={e.responsavel}>
              <Input value={form.responsavel} maxLength={120} onChange={(ev) => set("responsavel", ev.target.value)} />
            </Field>
            <Field label={t("supplier.fields.email")} error={e.email}>
              <Input type="email" value={form.email} maxLength={160} onChange={(ev) => set("email", ev.target.value)} />
            </Field>
            <Field label={t("supplier.fields.telefone")} error={e.telefone}>
              <Input inputMode="tel" value={form.telefone} onChange={(ev) => set("telefone", maskPhone(ev.target.value))} />
            </Field>
            <Field label={t("supplier.fields.whatsapp")} error={e.whatsapp} hint={t("supplier.whatsappHint")}>
              <Input inputMode="tel" value={form.whatsapp} onChange={(ev) => set("whatsapp", maskPhone(ev.target.value))} />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
            <Field label={t("supplier.fields.cep")} error={e["endereco.cep"]} className="sm:col-span-2">
              <Input inputMode="numeric" value={form.cep} onChange={(ev) => set("cep", maskCep(ev.target.value))} />
            </Field>
            <Field label={t("supplier.fields.logradouro")} error={e["endereco.logradouro"]} className="sm:col-span-4">
              <Input value={form.logradouro} maxLength={160} onChange={(ev) => set("logradouro", ev.target.value)} />
            </Field>
            <Field label={t("supplier.fields.numero")} error={e["endereco.numero"]} className="sm:col-span-2">
              <Input value={form.numero} maxLength={20} onChange={(ev) => set("numero", ev.target.value)} />
            </Field>
            <Field label={t("supplier.fields.complemento")} className="sm:col-span-4">
              <Input value={form.complemento} maxLength={80} onChange={(ev) => set("complemento", ev.target.value)} />
            </Field>
            <Field label={t("supplier.fields.bairro")} className="sm:col-span-2">
              <Input value={form.bairro} maxLength={80} onChange={(ev) => set("bairro", ev.target.value)} />
            </Field>
            <Field label={t("supplier.fields.cidade")} error={e["endereco.cidade"]} className="sm:col-span-3">
              <Input value={form.cidade} maxLength={80} onChange={(ev) => set("cidade", ev.target.value)} />
            </Field>
            <Field label={t("supplier.fields.uf")} error={e["endereco.uf"]} className="sm:col-span-1">
              <select value={form.uf} onChange={(ev) => set("uf", ev.target.value)} className={`${controlClass} px-2`} style={controlStyle}>
                <option value="">—</option>
                {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
            <Field label={t("supplier.fields.observacoes")} hint={t("supplier.observacoesHint")} className="sm:col-span-6">
              <textarea value={form.observacoes} maxLength={2000} rows={3} onChange={(ev) => set("observacoes", ev.target.value)}
                className={controlClass} style={{ ...controlStyle, resize: "vertical" }} />
            </Field>
          </div>
        )}

        {apiError && (
          <p role="alert" className="mt-4 rounded-lg px-3 py-2 text-sm" style={{ background: "var(--neg-weak)", color: "var(--neg)" }}>{apiError}</p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 px-5 py-4" style={{ borderTop: "1px solid var(--border)" }}>
        <Button type="button" variant="ghost" onClick={step === 0 ? onClose : () => setStep((s) => s - 1)} disabled={saving}>
          {step === 0 ? t("confirm.back") : t("supplier.back")}
        </Button>
        {step < 2 && !editing ? (
          <Button type="button" onClick={next}>{t("supplier.next")}</Button>
        ) : (
          <Button type="button" onClick={save} loading={saving}>{t("supplier.save")}</Button>
        )}
      </div>
    </Modal>
  );
}
