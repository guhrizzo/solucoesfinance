"use client";

// app/configuracoes/FeedbackTab.tsx
// Canal aberto a QUALQUER usuário: relatar um bug ou sugerir uma melhoria.
// Abaixo do formulário, o histórico dos próprios envios + o retorno do time.

import { useCallback, useEffect, useState } from "react";
import { Bug, Lightbulb, Send, CheckCircle2, Clock } from "lucide-react";
import { Card, Button, Input, Pill, EmptyState } from "../components/ui";
import { authedFetch } from "@/lib/authedFetch";
import {
  FEEDBACK_LIMITS,
  FEEDBACK_TYPE_LABEL,
  feedbackFieldLabels,
  type FeedbackDoc,
  type FeedbackType,
} from "@/lib/feedback";

type ShowToast = (message: string, type?: "success" | "error" | "warning" | "info") => void;

const textareaStyle: React.CSSProperties = {
  background: "var(--sunken)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  borderRadius: "var(--radius-control)",
};

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
      {children}
    </label>
  );
}

export default function FeedbackTab({ showToast }: { showToast: ShowToast }) {
  const [type, setType] = useState<FeedbackType>("bug");
  const [local, setLocal] = useState("");
  const [atual, setAtual] = useState("");
  const [esperado, setEsperado] = useState("");
  const [sending, setSending] = useState(false);

  const [mine, setMine] = useState<FeedbackDoc[] | null>(null);

  const labels = feedbackFieldLabels(type);

  const loadMine = useCallback(async () => {
    try {
      const res = await authedFetch("/api/feedback");
      if (!res.ok) return;
      const data = await res.json();
      setMine(Array.isArray(data.items) ? data.items : []);
    } catch {
      /* silencioso — a lista é secundária */
    }
  }, []);

  useEffect(() => {
    loadMine();
  }, [loadMine]);

  const canSubmit =
    !sending && local.trim() && esperado.trim() && (type !== "bug" || atual.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSending(true);
    try {
      const res = await authedFetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, local, atual, esperado }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || "Não foi possível enviar.", "error");
        return;
      }
      showToast(
        type === "bug" ? "Bug enviado. Obrigado pelo reporte!" : "Sugestão enviada. Valeu!",
        "success"
      );
      setLocal("");
      setAtual("");
      setEsperado("");
      loadMine();
    } catch {
      showToast("Falha de conexão. Tente de novo.", "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card padding="lg" className="space-y-5">
        <div>
          <h2 className="text-sm font-bold" style={{ color: "var(--text)" }}>
            Encontrou um problema ou tem uma ideia?
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            Descreva com o máximo de detalhe. O time recebe na hora e te responde por e-mail quando resolver.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {/* Tipo */}
          <div
            className="flex gap-1 rounded-xl p-1"
            style={{ background: "var(--sunken)", border: "1px solid var(--border)" }}
          >
            {(["bug", "melhoria"] as const).map((t) => {
              const active = type === t;
              const Icon = t === "bug" ? Bug : Lightbulb;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer"
                  style={{
                    background: active ? "var(--surface)" : "transparent",
                    color: active ? "var(--brand)" : "var(--text-muted)",
                    boxShadow: active ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                  }}
                >
                  <Icon size={15} />
                  {t === "bug" ? "Reportar bug" : "Sugerir melhoria"}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{labels.local}</Label>
            <Input
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              maxLength={FEEDBACK_LIMITS.local}
              placeholder="Ex.: Dashboard → card de Fluxo de Caixa; Contas a pagar; tela de login…"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{labels.atual}</Label>
            <textarea
              value={atual}
              onChange={(e) => setAtual(e.target.value)}
              maxLength={FEEDBACK_LIMITS.atual}
              rows={3}
              className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none resize-y"
              style={textareaStyle}
              placeholder={
                type === "bug"
                  ? "O que você fez e o que apareceu de errado? Passo a passo, mensagem de erro…"
                  : "Como isso funciona hoje (se já existe)."
              }
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{labels.esperado}</Label>
            <textarea
              value={esperado}
              onChange={(e) => setEsperado(e.target.value)}
              maxLength={FEEDBACK_LIMITS.esperado}
              rows={3}
              className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none resize-y"
              style={textareaStyle}
              placeholder={
                type === "bug"
                  ? "O comportamento correto esperado."
                  : "A ideia: o que deveria acontecer e por quê."
              }
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" icon={Send} loading={sending} disabled={!canSubmit}>
              Enviar
            </Button>
          </div>
        </form>
      </Card>

      {/* Meus envios */}
      <div className="space-y-2">
        <h3 className="text-sm font-bold px-1" style={{ color: "var(--text)" }}>
          Meus envios
        </h3>
        {mine === null ? (
          <p className="text-xs px-1" style={{ color: "var(--text-subtle)" }}>
            Carregando…
          </p>
        ) : mine.length === 0 ? (
          <EmptyState
            icon={Bug}
            title="Nada por aqui ainda"
            description="Seus bugs e sugestões aparecem aqui com o status e a resposta do time."
          />
        ) : (
          mine.map((f) => (
            <Card key={f.id} padding="md" className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Pill tone={f.type === "bug" ? "neg" : "info"}>{FEEDBACK_TYPE_LABEL[f.type]}</Pill>
                {f.status === "resolvido" ? (
                  <Pill tone="pos" dot>
                    Resolvido
                  </Pill>
                ) : (
                  <Pill tone="warn" dot>
                    Em aberto
                  </Pill>
                )}
                <span className="text-xs ml-auto" style={{ color: "var(--text-subtle)" }}>
                  {fmtDate(f.createdAt)}
                </span>
              </div>
              <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                {f.local}
              </p>
              {f.esperado && (
                <p className="text-[13px] whitespace-pre-wrap" style={{ color: "var(--text-muted)" }}>
                  {f.esperado}
                </p>
              )}
              {f.status === "resolvido" && f.resolution && (
                <div
                  className="rounded-lg p-3 text-[13px] whitespace-pre-wrap"
                  style={{ background: "var(--pos-weak)", color: "var(--text)" }}
                >
                  <span className="flex items-center gap-1.5 font-semibold mb-1" style={{ color: "var(--pos)" }}>
                    <CheckCircle2 size={13} /> O que foi feito
                  </span>
                  {f.resolution}
                </div>
              )}
              {f.status !== "resolvido" && (
                <p className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-subtle)" }}>
                  <Clock size={12} /> Aguardando o time.
                </p>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
