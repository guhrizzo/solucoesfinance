"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck, FileText, ArrowRight, ArrowLeft } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useSubscription } from "../../hooks/useSubscription";
import { PageLoader } from "../../components/ui";
import { getPlan, formatBRLFromCents } from "@/lib/billingPlans";
import { isPlanId, startCheckout } from "@/lib/startCheckout";
import {
  TAX_REGIMES,
  REGIME_LABEL,
  EMAIL_RE,
  isValidCnpj,
  isValidCpf,
  maskCnpj,
  maskCpf,
  type TaxRegime,
} from "@/lib/contract";
import { renderContractText, nexusfiEnderecoLinha, NEXUSFI_PARTY } from "@/lib/contractText";

interface Company {
  razaoSocial: string;
  cnpj: string;
  endereco: string;
}

const EMPTY: Company = { razaoSocial: "", cnpj: "", endereco: "" };

export default function ContratoPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const sub = useSubscription();

  const [plano] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("plano");
  });
  const plan = plano && isPlanId(plano) ? getPlan(plano)! : null;

  // ── Formulário ──
  const [razaoSocial, setRazaoSocial] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [regime, setRegime] = useState<TaxRegime | "">("");
  const [endereco, setEndereco] = useState("");
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [aceito, setAceito] = useState(false);

  const [prefillDone, setPrefillDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const redirected = useRef(false);

  // Plano inválido → volta pra assinatura.
  useEffect(() => {
    if (!plano || !isPlanId(plano)) {
      if (!redirected.current) {
        redirected.current = true;
        router.replace("/assinatura");
      }
    }
  }, [plano, router]);

  // Só o dono, e só se ainda não está ativo.
  useEffect(() => {
    if (authLoading || sub.loading) return;
    if (redirected.current) return;
    if (!sub.isOwner || sub.comped) {
      redirected.current = true;
      router.replace("/assinatura");
      return;
    }
    if (sub.status === "active") {
      redirected.current = true;
      router.replace("/dashboard");
    }
  }, [authLoading, sub.loading, sub.isOwner, sub.comped, sub.status, router]);

  // Prefill: profile/company + dados do login.
  useEffect(() => {
    if (prefillDone || authLoading || sub.loading || !user) return;
    let cancelled = false;
    (async () => {
      let company: Company = EMPTY;
      try {
        const { getFirebase } = await import("@/lib/firebase");
        const { doc, getDoc } = await import("firebase/firestore");
        const { db } = await getFirebase();
        // O dono lê o próprio ninho; ownerUid == uid aqui (guarda acima).
        const snap = await getDoc(doc(db, "users", user.uid, "profile", "company"));
        if (snap.exists()) {
          const d = snap.data();
          company = {
            razaoSocial: d.razaoSocial ?? d.nomeFantasia ?? "",
            cnpj: d.cnpj ?? "",
            endereco: d.endereco ?? "",
          };
        }
      } catch {
        /* prefill é best-effort */
      }
      if (cancelled) return;
      setRazaoSocial((v) => v || company.razaoSocial);
      setCnpj((v) => v || (company.cnpj ? maskCnpj(company.cnpj) : ""));
      setEndereco((v) => v || company.endereco);
      setNome((v) => v || user.displayName || "");
      setEmail((v) => v || user.email || "");
      setPrefillDone(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [prefillDone, authLoading, sub.loading, user]);

  const rendered = useMemo(() => {
    if (!plan) return null;
    return renderContractText({
      contratante: {
        razaoSocial: razaoSocial.trim() || "[RAZÃO SOCIAL DA CONTRATANTE]",
        cnpj: cnpj.trim() || "[CNPJ]",
        regimeTributario: (regime || "simples_nacional") as TaxRegime,
        endereco: endereco.trim() || "[ENDEREÇO DA CONTRATANTE]",
      },
      signatario: {
        nome: nome.trim() || "[RESPONSÁVEL]",
        cpf: cpf.trim() || "[CPF]",
        email: email.trim() || "[E-MAIL]",
      },
      planId: plan.id,
      planLabel: plan.label,
      priceCents: plan.priceCents,
    });
  }, [plan, razaoSocial, cnpj, regime, endereco, nome, cpf, email]);

  const formValido =
    !!plan &&
    razaoSocial.trim().length > 1 &&
    isValidCnpj(cnpj) &&
    !!regime &&
    endereco.trim().length > 3 &&
    nome.trim().length > 2 &&
    isValidCpf(cpf) &&
    EMAIL_RE.test(email.trim().toLowerCase()) &&
    aceito;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formValido || !plan || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const { authedFetch } = await import("@/lib/authedFetch");
      const res = await authedFetch("/api/billing/contract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: plan.id,
          razaoSocial: razaoSocial.trim(),
          cnpj,
          regimeTributario: regime,
          endereco: endereco.trim(),
          nome: nome.trim(),
          cpf,
          email: email.trim().toLowerCase(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.contractId) {
        throw new Error(data?.error || "Não foi possível registrar o contrato.");
      }
      // Aceito → segue direto pro pagamento seguro.
      await startCheckout(plan.id, data.contractId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao processar o contrato.");
      setSubmitting(false);
    }
  }

  if (authLoading || sub.loading || !plan) return <PageLoader label="Carregando contrato…" />;

  const labelCls = "block text-xs font-semibold mb-1.5";
  const labelStyle = { color: "var(--db-text-2)" } as const;
  const fieldStyle = {
    background: "var(--db-card-alt)",
    border: "1px solid var(--db-border)",
    color: "var(--db-text)",
  } as const;
  const fieldCls = "w-full rounded-xl px-3.5 py-2.5 text-sm outline-none";

  return (
    <div className="min-h-screen px-5 py-10" style={{ background: "var(--db-bg)" }}>
      <div className="mx-auto w-full max-w-5xl">
        <button
          onClick={() => router.push("/assinatura")}
          className="inline-flex items-center gap-1.5 text-xs font-semibold mb-5 cursor-pointer"
          style={{ color: "var(--db-text-3)" }}
        >
          <ArrowLeft size={13} /> Voltar
        </button>

        <div className="flex items-center gap-2 mb-1">
          <FileText size={17} style={{ color: "var(--brand-500)" }} />
          <h1 className="text-xl font-bold" style={{ color: "var(--db-text)" }}>
            Contrato de prestação de serviços
          </h1>
        </div>
        <p className="text-sm mb-6" style={{ color: "var(--db-text-3)" }}>
          Plano <strong>{plan.label}</strong> · {formatBRLFromCents(plan.priceCents)} por período.
          Preencha os dados da empresa, leia o contrato e assine para ir ao pagamento.
        </p>

        <div className="grid lg:grid-cols-2 gap-5">
          {/* ── Formulário ── */}
          <form onSubmit={handleSubmit}>
            <div
              className="rounded-2xl p-6 space-y-4"
              style={{
                background: "var(--db-card)",
                border: "1px solid var(--db-border)",
                boxShadow: "var(--db-shadow-lg)",
              }}
            >
              <h2 className="text-sm font-bold" style={{ color: "var(--db-text)" }}>
                Dados da CONTRATANTE
              </h2>

              <div>
                <label className={labelCls} style={labelStyle}>Razão social</label>
                <input
                  className={fieldCls}
                  style={fieldStyle}
                  value={razaoSocial}
                  onChange={(e) => setRazaoSocial(e.target.value)}
                  placeholder="Ex.: Padaria do Bairro Ltda."
                  maxLength={160}
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls} style={labelStyle}>CNPJ</label>
                  <input
                    className={`${fieldCls} mono`}
                    style={{
                      ...fieldStyle,
                      borderColor: cnpj && !isValidCnpj(cnpj) ? "var(--danger)" : "var(--db-border)",
                    }}
                    value={cnpj}
                    onChange={(e) => setCnpj(maskCnpj(e.target.value))}
                    placeholder="00.000.000/0000-00"
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <label className={labelCls} style={labelStyle}>Regime tributário</label>
                  <select
                    className={fieldCls}
                    style={fieldStyle}
                    value={regime}
                    onChange={(e) => setRegime(e.target.value as TaxRegime | "")}
                  >
                    <option value="">Selecione…</option>
                    {TAX_REGIMES.map((r) => (
                      <option key={r} value={r}>
                        {REGIME_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className={labelCls} style={labelStyle}>Endereço da empresa</label>
                <input
                  className={fieldCls}
                  style={fieldStyle}
                  value={endereco}
                  onChange={(e) => setEndereco(e.target.value)}
                  placeholder="Rua, nº, bairro, cidade/UF, CEP"
                  maxLength={240}
                />
              </div>

              <div className="pt-1">
                <h2 className="text-sm font-bold" style={{ color: "var(--db-text)" }}>
                  Responsável que assina
                </h2>
              </div>

              <div>
                <label className={labelCls} style={labelStyle}>Nome completo</label>
                <input
                  className={fieldCls}
                  style={fieldStyle}
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Nome de quem assina pela empresa"
                  maxLength={120}
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls} style={labelStyle}>CPF</label>
                  <input
                    className={`${fieldCls} mono`}
                    style={{
                      ...fieldStyle,
                      borderColor: cpf && !isValidCpf(cpf) ? "var(--danger)" : "var(--db-border)",
                    }}
                    value={cpf}
                    onChange={(e) => setCpf(maskCpf(e.target.value))}
                    placeholder="000.000.000-00"
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <label className={labelCls} style={labelStyle}>E-mail</label>
                  <input
                    className={fieldCls}
                    style={fieldStyle}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@empresa.com.br"
                    type="email"
                  />
                </div>
              </div>

              <label
                className="flex items-start gap-2.5 pt-2 cursor-pointer select-none"
                style={{ color: "var(--db-text-2)" }}
              >
                <input
                  type="checkbox"
                  checked={aceito}
                  onChange={(e) => setAceito(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-xs leading-relaxed">
                  Li e aceito os termos deste contrato. Declaro que as informações prestadas são
                  verdadeiras e que tenho poderes para representar a empresa CONTRATANTE. O aceite
                  eletrônico será registrado com data, hora e IP.
                </span>
              </label>

              {error && (
                <div
                  className="text-sm rounded-lg px-3 py-2"
                  style={{ background: "rgba(239,68,68,0.1)", color: "var(--danger)" }}
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={!formValido || submitting}
                className="w-full inline-flex items-center justify-center gap-2 font-semibold text-sm px-4 py-3 rounded-xl cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: "linear-gradient(135deg, var(--brand-500), var(--brand-600))",
                  color: "#fff",
                }}
              >
                {submitting ? (
                  <>
                    <Loader2 size={15} className="animate-spin" /> Registrando o aceite…
                  </>
                ) : (
                  <>
                    Assinar e ir para o pagamento <ArrowRight size={15} />
                  </>
                )}
              </button>

              <p
                className="flex items-center gap-1.5 text-xs"
                style={{ color: "var(--db-text-4)" }}
              >
                <ShieldCheck size={12} /> Pagamento processado pela InfinitePay (Pix ou cartão).
              </p>
            </div>
          </form>

          {/* ── Prévia do contrato ── */}
          <div
            className="rounded-2xl p-6"
            style={{
              background: "var(--db-card)",
              border: "1px solid var(--db-border)",
              boxShadow: "var(--db-shadow-lg)",
            }}
          >
            <h2 className="text-sm font-bold mb-3" style={{ color: "var(--db-text)" }}>
              {rendered?.title}
            </h2>
            <div
              className="rounded-xl p-4 text-xs leading-relaxed overflow-y-auto"
              style={{
                background: "var(--db-card-alt)",
                border: "1px solid var(--db-border)",
                color: "var(--db-text-2)",
                maxHeight: "70vh",
              }}
            >
              <p className="mb-1" style={{ color: "var(--db-text-3)" }}>
                <strong>CONTRATADA:</strong> {NEXUSFI_PARTY.razaoSocial} · CNPJ {NEXUSFI_PARTY.cnpj} ·{" "}
                {nexusfiEnderecoLinha()}
              </p>
              {rendered?.preamble.map((p, i) => (
                <p key={`pre-${i}`} className="mb-2">
                  {p}
                </p>
              ))}
              {rendered?.clauses.map((c) => (
                <div key={c.heading} className="mb-3">
                  <p className="font-bold mb-1" style={{ color: "var(--db-text)" }}>
                    {c.heading}
                  </p>
                  {c.body.map((b, i) => (
                    <p key={i} className="mb-1">
                      {b}
                    </p>
                  ))}
                </div>
              ))}
              <p className="mt-3 pt-3" style={{ borderTop: "1px solid var(--db-border)", color: "var(--db-text-3)" }}>
                {rendered?.legalBasis}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
