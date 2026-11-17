"use client";

// Emissão de boleto (Banco Inter). Duas entradas: avulso (sem `receivable`) ou
// a partir de uma conta a receber (pré-preenche pagador, valor sugerido =
// saldo restante, vencimento e multa/juros). PIN antes de emitir. O endereço
// informado é devolvido ao chamador (`onSaveAddress`) para ser salvo no cliente
// da conta a receber e pré-preencher a próxima emissão.

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button, Field, Input, Modal, MoneyInput, formatAmount, parseAmount } from "@/app/components/ui";
import { onlyDigits } from "@/app/components/CadastroPanel";
import { authedFetch } from "@/lib/authedFetch";
import { maskCpf, maskCnpj } from "@/lib/contract";
import { formatPhone, MAX_FINE_RATE, MAX_INTEREST_RATE } from "@/lib/receivableCharge";
import type { PagadorEndereco } from "@/lib/pagadorEndereco";
import type { BoletosEstado } from "@/lib/interBoletosEstado";
import {
  enderecoVazio,
  hojeSP,
  validarPagadorForm,
  valorSugerido,
  vencimentoSugerido,
  type CampoEndereco,
  type ErroPagador,
} from "@/lib/boletoTela";
import { PinGate, hasPin } from "./PinGate";

export type EmitirReceivable = {
  id: string;
  title: string;
  amount: number;
  amountReceived?: number;
  dueDate: string;
  partyName?: string;
  partyDoc?: string;
  partyEmail?: string;
  partyPhone?: string;
  fineRate?: number;
  interestRate?: number;
  partyAddress?: PagadorEndereco;
};

type Toast = (msg: string, type?: "ok" | "err" | "warn") => void;

const cepMask = (v: string) => {
  const d = onlyDigits(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};
const docMask = (v: string) => (onlyDigits(v).length > 11 ? maskCnpj(v) : maskCpf(v));
const num2 = (n: number) => n.toFixed(2).replace(".", ",");
const rateText = (n?: number) => (n && n > 0 ? String(n).replace(".", ",") : "");
const parseRate = (s: string) => {
  const t = s.trim().replace(",", ".");
  return t === "" ? 0 : Number(t);
};
const maisDoisAnos = (hoje: string) => `${Number(hoje.slice(0, 4)) + 2}${hoje.slice(4)}`;

const ERRO_CAMPO: Record<CampoEndereco, string> = {
  cep: "cep", uf: "uf", logradouro: "street", numero: "number", bairro: "district", cidade: "city",
};
const ERRO_PAGADOR: Record<ErroPagador, string> = {
  nome: "name", doc: "doc", email: "email", telefone: "phone", endereco: "address",
};

export function EmitirBoletoModal({
  open,
  onClose,
  receivable,
  estado,
  pinUid,
  onToast,
  onSaveAddress,
  onEmitted,
}: {
  open: boolean;
  onClose: () => void;
  /** Ausente = boleto avulso. */
  receivable?: EmitirReceivable | null;
  /** Estado da cobrança no Inter; só `ativo` permite emitir. null = carregando. */
  estado: BoletosEstado | null;
  /** uid do login atual (dono do PIN). */
  pinUid: string | null;
  onToast: Toast;
  /** Conta a receber: grava o endereço (e dados do pagador) no cliente vinculado. */
  onSaveAddress?: (receivableId: string, endereco: PagadorEndereco) => Promise<void>;
  onEmitted?: () => void;
}) {
  const t = useTranslations("contasReceber.boletos.emit");
  const tEstado = useTranslations("contasReceber.boletos.estado");
  const hoje = hojeSP();

  const [nome, setNome] = useState("");
  const [doc, setDoc] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [end, setEnd] = useState<PagadorEndereco>(enderecoVazio());
  const [valor, setValor] = useState("");
  const [venc, setVenc] = useState(hoje);
  const [multa, setMulta] = useState("");
  const [juros, setJuros] = useState("");
  const [tentou, setTentou] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const busyRef = useRef(false);

  // Preenche ao abrir (a cada abertura: a conta a receber pode ter mudado).
  useEffect(() => {
    if (!open) return;
    const r = receivable;
    setNome(r?.partyName ?? "");
    setDoc(r?.partyDoc ? docMask(r.partyDoc) : "");
    setEmail(r?.partyEmail ?? "");
    setTelefone(r?.partyPhone ? formatPhone(r.partyPhone) : "");
    setEnd({ ...enderecoVazio(), ...(r?.partyAddress ?? {}), cep: cepMask(r?.partyAddress?.cep ?? "") });
    setValor(r ? formatAmount(num2(valorSugerido(r))) : "");
    setVenc(vencimentoSugerido(r?.dueDate, hoje));
    setMulta(rateText(r?.fineRate));
    setJuros(rateText(r?.interestRate));
    setTentou(false);
    setPinOpen(false);
    setBusy(false);
    busyRef.current = false;
    setErro("");
    // `hoje` muda só à meia-noite; abrir de novo já recalcula.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, receivable]);

  const ativo = estado === "ativo";

  const erros = useMemo(() => {
    const e: Record<string, string> = {};
    const p = validarPagadorForm({ nome, doc, email, telefone, endereco: end });
    if (!p.ok) {
      if (p.error === "endereco" && p.campo) e[ERRO_CAMPO[p.campo]] = t(`errors.${ERRO_CAMPO[p.campo]}`);
      else e[ERRO_PAGADOR[p.error]] = t(`errors.${ERRO_PAGADOR[p.error]}`);
    }
    if (!(parseAmount(valor) > 0)) e.amount = t("errors.amount");
    if (!venc || venc < hoje || venc > maisDoisAnos(hoje)) e.due = t("errors.due");
    const m = parseRate(multa);
    if (!Number.isFinite(m) || m < 0 || m > MAX_FINE_RATE) e.fine = t("errors.fine");
    const j = parseRate(juros);
    if (!Number.isFinite(j) || j < 0 || j > MAX_INTEREST_RATE) e.interest = t("errors.interest");
    return e;
  }, [nome, doc, email, telefone, end, valor, venc, multa, juros, hoje, t]);

  const err = (k: string) => (tentou ? erros[k] : undefined);
  const setE = (k: keyof PagadorEndereco, v: string) => setEnd((x) => ({ ...x, [k]: v }));

  async function pedirPin() {
    if (busyRef.current || !ativo) return;
    setTentou(true);
    setErro("");
    if (Object.keys(erros).length > 0) return;
    if (!pinUid || !(await hasPin(pinUid))) {
      setErro(t("errors.noPin"));
      return;
    }
    setPinOpen(true);
  }

  async function emitir() {
    if (busyRef.current) return;
    const p = validarPagadorForm({ nome, doc, email, telefone, endereco: end });
    if (!p.ok) return;
    busyRef.current = true;
    setBusy(true);
    setErro("");
    try {
      const multaN = parseRate(multa);
      const jurosN = parseRate(juros);
      const res = await authedFetch("/api/inter/boletos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(receivable ? { receivableId: receivable.id } : {}),
          payer: p.value,
          amount: Math.round(parseAmount(valor) * 100) / 100,
          dueDate: venc,
          ...(multaN > 0 ? { fineRate: multaN } : {}),
          ...(jurosN > 0 ? { interestRate: jurosN } : {}),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; situacao?: string };
      if (!res.ok) {
        const msg = json.error || t("error");
        setErro(msg);
        onToast(msg, "err");
        return;
      }
      // O boleto já existe no banco: falha ao guardar o endereço não desfaz nada.
      if (receivable && onSaveAddress) {
        await onSaveAddress(receivable.id, p.value.endereco).catch(() => undefined);
      }
      onToast(json.situacao === "EM_PROCESSAMENTO" ? t("successProcessing") : t("success"));
      onEmitted?.();
      onClose();
    } catch (e) {
      const msg = (e as Error)?.message || t("error");
      setErro(msg);
      onToast(msg, "err");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const titulo = receivable ? t("titleReceivable", { title: receivable.title }) : t("title");

  return (
    <>
      <Modal open={open} onClose={onClose} title={titulo} size="lg" mobileSheet closeDisabled={busy}>
        <form
          noValidate
          className="p-5 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void pedirPin();
          }}
        >
          {estado === null ? (
            <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }} role="status">
              <Loader2 size={14} className="animate-spin" />
            </div>
          ) : !ativo ? (
            <div
              role="alert"
              className="rounded-xl px-4 py-3 text-sm flex items-start gap-2"
              style={{ background: "var(--warn-weak)", color: "var(--warn)" }}
            >
              <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                <strong className="block">{t("unavailable")}</strong>
                {tEstado(estado)}
              </span>
            </div>
          ) : (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>{t("intro")}</p>
          )}

          <fieldset className="space-y-3 m-0 p-0 border-0 min-w-0" disabled={!ativo || busy}>
            <legend className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
              {t("payerSection")}
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label={t("name")} error={err("name")} className="sm:col-span-2">
                <Input value={nome} maxLength={100} autoComplete="off" onChange={(e) => setNome(e.target.value)} />
              </Field>
              <Field label={t("doc")} error={err("doc")}>
                <Input
                  inputMode="numeric"
                  autoComplete="off"
                  className="mono"
                  value={doc}
                  onChange={(e) => setDoc(docMask(e.target.value))}
                />
              </Field>
              <Field label={t("phone")} error={err("phone")}>
                <Input
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  className="mono"
                  value={telefone}
                  onChange={(e) => setTelefone(formatPhone(onlyDigits(e.target.value).slice(0, 11)))}
                />
              </Field>
              <Field label={t("email")} error={err("email")} className="sm:col-span-2">
                <Input type="email" inputMode="email" autoComplete="off" maxLength={120} value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
            </div>
          </fieldset>

          <fieldset className="space-y-3 m-0 p-0 border-0 min-w-0" disabled={!ativo || busy}>
            <legend className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
              {t("addressSection")}
            </legend>
            <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{t("addressHint")}</p>
            {err("address") && <p className="text-xs font-medium" style={{ color: "var(--neg)" }}>{err("address")}</p>}
            <div className="grid grid-cols-6 gap-3">
              <Field label={t("cep")} error={err("cep")} className="col-span-6 sm:col-span-2">
                <Input inputMode="numeric" autoComplete="postal-code" className="mono" value={end.cep} onChange={(e) => setE("cep", cepMask(e.target.value))} />
              </Field>
              <Field label={t("street")} error={err("street")} className="col-span-6 sm:col-span-4">
                <Input autoComplete="off" value={end.logradouro} onChange={(e) => setE("logradouro", e.target.value)} />
              </Field>
              <Field label={t("number")} error={err("number")} className="col-span-3 sm:col-span-2">
                <Input autoComplete="off" value={end.numero} onChange={(e) => setE("numero", e.target.value)} />
              </Field>
              <Field label={t("complement")} className="col-span-3 sm:col-span-4">
                <Input autoComplete="off" value={end.complemento ?? ""} onChange={(e) => setE("complemento", e.target.value)} />
              </Field>
              <Field label={t("district")} error={err("district")} className="col-span-6 sm:col-span-2">
                <Input autoComplete="off" value={end.bairro} onChange={(e) => setE("bairro", e.target.value)} />
              </Field>
              <Field label={t("city")} error={err("city")} className="col-span-4 sm:col-span-3">
                <Input autoComplete="off" value={end.cidade} onChange={(e) => setE("cidade", e.target.value)} />
              </Field>
              <Field label={t("state")} error={err("uf")} className="col-span-2 sm:col-span-1">
                <Input autoComplete="off" maxLength={2} className="uppercase" value={end.uf} onChange={(e) => setE("uf", e.target.value.toUpperCase())} />
              </Field>
            </div>
          </fieldset>

          <fieldset className="space-y-3 m-0 p-0 border-0 min-w-0" disabled={!ativo || busy}>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("amount")} error={err("amount")} hint={receivable ? t("amountHint") : undefined}>
                <MoneyInput value={valor} onValueChange={setValor} />
              </Field>
              <Field label={t("due")} error={err("due")}>
                <Input type="date" min={hoje} max={maisDoisAnos(hoje)} value={venc} onChange={(e) => setVenc(e.target.value)} />
              </Field>
              <Field label={t("fine")} error={err("fine")}>
                <Input inputMode="decimal" className="mono" placeholder="0" value={multa} onChange={(e) => setMulta(e.target.value.replace(/[^\d.,]/g, ""))} />
              </Field>
              <Field label={t("interest")} error={err("interest")}>
                <Input inputMode="decimal" className="mono" placeholder="0" value={juros} onChange={(e) => setJuros(e.target.value.replace(/[^\d.,]/g, ""))} />
              </Field>
            </div>
          </fieldset>

          {erro && (
            <div
              role="alert"
              className="rounded-xl px-4 py-3 text-xs flex items-start gap-2"
              style={{ background: "var(--neg-weak)", color: "var(--neg)" }}
            >
              <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
              {erro}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              {t("cancel")}
            </Button>
            <Button type="submit" loading={busy} disabled={!ativo}>
              {busy ? t("submitting") : t("submit")}
            </Button>
          </div>
        </form>
      </Modal>

      {pinUid && (
        <PinGate
          open={pinOpen}
          title={t("pinTitle")}
          subtitle={t("pinSubtitle")}
          pinUid={pinUid}
          onClose={() => setPinOpen(false)}
          onVerified={() => void emitir()}
          onError={(m) => setErro(m)}
        />
      )}
    </>
  );
}
