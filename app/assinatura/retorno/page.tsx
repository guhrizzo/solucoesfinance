"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, AlertCircle, ArrowRight, Receipt } from "lucide-react";
import { authedFetch } from "@/lib/authedFetch";
import { useAuth } from "../../hooks/useAuth";
import { useSubscription } from "../../hooks/useSubscription";
import { PageLoader } from "../../components/ui";

type Phase = "confirming" | "ok" | "pending" | "error";

function Retorno() {
  const params = useSearchParams();
  const { loading: authLoading } = useAuth();
  const sub = useSubscription();

  const orderNsu = params.get("order_nsu") || "";
  const transactionNsu = params.get("transaction_nsu") || "";
  const slug = params.get("slug") || params.get("invoice_slug") || "";
  const receiptUrl = params.get("receipt_url") || "";

  const [phase, setPhase] = useState<Phase>("confirming");
  const [msg, setMsg] = useState<string>("");
  const tries = useRef(0);

  useEffect(() => {
    if (authLoading) return;
    if (!orderNsu || !transactionNsu || !slug) {
      setPhase("error");
      setMsg("Retorno de pagamento incompleto. Se você pagou, o acesso libera assim que a confirmação chegar.");
      return;
    }

    let stop = false;
    const confirm = async () => {
      tries.current += 1;
      try {
        const res = await authedFetch("/api/billing/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order_nsu: orderNsu, transaction_nsu: transactionNsu, slug }),
        });
        const data = await res.json();
        if (stop) return;
        if (res.ok && data.ok) {
          setPhase("ok");
          return;
        }
        if (data.pending || res.status >= 500) {
          setPhase("pending");
          if (tries.current < 6) setTimeout(confirm, 5000);
          else setMsg("A confirmação está demorando. Você pode fechar esta página — o acesso libera sozinho quando o pagamento for processado.");
          return;
        }
        setPhase("error");
        setMsg(data.error || "Não foi possível confirmar o pagamento.");
      } catch {
        if (stop) return;
        setPhase("pending");
        if (tries.current < 6) setTimeout(confirm, 5000);
      }
    };
    confirm();
    return () => {
      stop = true;
    };
  }, [authLoading, orderNsu, transactionNsu, slug]);

  // Se a assinatura ficou ativa (via webhook, em paralelo), trata como sucesso
  // sem depender do resultado do /confirm.
  const webhookConfirmou = !sub.loading && sub.isActive && sub.status === "active";
  const effectivePhase: Phase = webhookConfirmou ? "ok" : phase;

  if (authLoading) return <PageLoader label="Carregando…" />;

  return (
    <div
      className="min-h-screen flex items-center justify-center px-5 py-12"
      style={{ background: "var(--db-bg)" }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-7 text-center"
        style={{ background: "var(--db-card)", border: "1px solid var(--db-border)", boxShadow: "var(--db-shadow-lg)" }}
      >
        {effectivePhase === "ok" ? (
          <>
            <CheckCircle2 size={44} className="mx-auto" style={{ color: "var(--success)" }} />
            <h1 className="mt-4 text-xl font-bold" style={{ color: "var(--db-text)" }}>
              Pagamento confirmado
            </h1>
            <p className="mt-2 text-sm" style={{ color: "var(--db-text-3)" }}>
              {sub.accessUntil
                ? `Acesso liberado até ${new Date(sub.accessUntil).toLocaleDateString("pt-BR")}.`
                : "Seu acesso foi liberado."}
            </p>
            <a
              href="/dashboard"
              className="mt-6 inline-flex items-center justify-center gap-2 font-semibold text-sm px-5 py-2.5 rounded-xl"
              style={{ background: "linear-gradient(135deg, var(--brand-500), var(--brand-600))", color: "#fff" }}
            >
              Ir para o dashboard <ArrowRight size={15} />
            </a>
          </>
        ) : effectivePhase === "error" ? (
          <>
            <AlertCircle size={44} className="mx-auto" style={{ color: "var(--danger)" }} />
            <h1 className="mt-4 text-xl font-bold" style={{ color: "var(--db-text)" }}>
              Não foi possível confirmar
            </h1>
            <p className="mt-2 text-sm" style={{ color: "var(--db-text-3)" }}>
              {msg}
            </p>
            <a
              href="/assinatura"
              className="mt-6 inline-flex items-center justify-center gap-2 font-semibold text-sm px-5 py-2.5 rounded-xl"
              style={{ background: "var(--db-card-alt)", border: "1px solid var(--db-border)", color: "var(--db-text-2)" }}
            >
              Voltar para assinatura
            </a>
          </>
        ) : (
          <>
            <Loader2 size={44} className="mx-auto animate-spin" style={{ color: "var(--brand-500)" }} />
            <h1 className="mt-4 text-xl font-bold" style={{ color: "var(--db-text)" }}>
              Confirmando pagamento…
            </h1>
            <p className="mt-2 text-sm" style={{ color: "var(--db-text-3)" }}>
              {msg || "Isso pode levar alguns segundos. Não feche a página."}
            </p>
          </>
        )}

        {receiptUrl && (
          <a
            href={receiptUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold"
            style={{ color: "var(--db-text-3)" }}
          >
            <Receipt size={12} /> Ver comprovante
          </a>
        )}
      </div>
    </div>
  );
}

export default function RetornoPage() {
  return (
    <Suspense fallback={<PageLoader label="Carregando…" />}>
      <Retorno />
    </Suspense>
  );
}
