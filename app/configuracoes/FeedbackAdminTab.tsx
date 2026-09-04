"use client";

// app/configuracoes/FeedbackAdminTab.tsx
// Aba visível SÓ pros adm supremos (lib/compAccounts): todos os bugs e
// sugestões enviados pelos usuários. Resolver escreve o que foi feito e
// (por padrão) dispara o e-mail de retorno pro autor.

import { useEffect, useMemo, useState } from "react";
import { Inbox, Mail, MailX, RotateCcw, Check, ShieldAlert } from "lucide-react";
import { Card, Button, Pill, EmptyState } from "../components/ui";
import { authedFetch } from "@/lib/authedFetch";
import { FEEDBACK_LIMITS, FEEDBACK_TYPE_LABEL, type FeedbackDoc } from "@/lib/feedback";

type ShowToast = (message: string, type?: "success" | "error" | "warning" | "info") => void;
type Filter = "aberto" | "resolvido" | "todos";

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

function AdminRow({
  fb,
  onChanged,
  showToast,
}: {
  fb: FeedbackDoc;
  onChanged: (next: FeedbackDoc) => void;
  showToast: ShowToast;
}) {
  const [resolution, setResolution] = useState(fb.resolution ?? "");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);

  async function resolve() {
    if (!resolution.trim() || busy) return;
    setBusy(true);
    try {
      const res = await authedFetch("/api/feedback/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: fb.id, resolution, notify }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || "Não foi possível resolver.", "error");
        return;
      }
      showToast(data.warning || (notify ? "Resolvido e usuário avisado." : "Resolvido."), data.warning ? "warning" : "success");
      onChanged({
        ...fb,
        status: "resolvido",
        resolution,
        resolvedAt: Date.now(),
        notifiedAt: data.notifiedAt ?? fb.notifiedAt,
      });
    } catch {
      showToast("Falha de conexão.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function reopen() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await authedFetch("/api/feedback/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: fb.id, reopen: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || "Não foi possível reabrir.", "error");
        return;
      }
      showToast("Chamado reaberto.", "success");
      onChanged({ ...fb, status: "aberto", resolvedAt: null });
    } catch {
      showToast("Falha de conexão.", "error");
    } finally {
      setBusy(false);
    }
  }

  const field = (rotulo: string, valor: string) =>
    valor.trim() ? (
      <div>
        <p className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
          {rotulo}
        </p>
        <p className="text-[13px] whitespace-pre-wrap" style={{ color: "var(--text)" }}>
          {valor}
        </p>
      </div>
    ) : null;

  return (
    <Card padding="md" className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Pill tone={fb.type === "bug" ? "neg" : "info"}>{FEEDBACK_TYPE_LABEL[fb.type]}</Pill>
        {fb.status === "resolvido" ? (
          <Pill tone="pos" dot>
            Resolvido
          </Pill>
        ) : (
          <Pill tone="warn" dot>
            Em aberto
          </Pill>
        )}
        <span className="text-xs ml-auto" style={{ color: "var(--text-subtle)" }}>
          {fmtDate(fb.createdAt)}
        </span>
      </div>

      <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
        {fb.userName || "Sem nome"} · {fb.userEmail || "sem e-mail"}
      </p>

      <div className="space-y-2">
        {field("Onde", fb.local)}
        {field(fb.type === "bug" ? "O que aconteceu" : "Como funciona hoje", fb.atual)}
        {field("O que deveria acontecer", fb.esperado)}
      </div>

      {fb.status === "resolvido" ? (
        <div className="space-y-2 pt-1">
          <div
            className="rounded-lg p-3 text-[13px] whitespace-pre-wrap"
            style={{ background: "var(--pos-weak)", color: "var(--text)" }}
          >
            <span className="flex items-center gap-1.5 font-semibold mb-1" style={{ color: "var(--pos)" }}>
              <Check size={13} /> O que foi feito
            </span>
            {fb.resolution}
          </div>
          <p className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-subtle)" }}>
            {fb.notifiedAt ? <Mail size={12} /> : <MailX size={12} />}
            {fb.notifiedAt ? "Usuário avisado por e-mail." : "Sem e-mail de aviso."}
            {fb.resolvedByEmail ? ` · por ${fb.resolvedByEmail}` : ""}
          </p>
          <Button variant="ghost" size="sm" icon={RotateCcw} onClick={reopen} loading={busy}>
            Reabrir
          </Button>
        </div>
      ) : (
        <div className="space-y-2 pt-1">
          <textarea
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            maxLength={FEEDBACK_LIMITS.resolution}
            rows={3}
            className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none resize-y"
            style={textareaStyle}
            placeholder="O que foi feito / a decisão. Vai no e-mail pro usuário."
          />
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: "var(--text-muted)" }}>
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
              Avisar o usuário por e-mail
            </label>
            <Button
              size="sm"
              icon={Check}
              onClick={resolve}
              loading={busy}
              disabled={!resolution.trim()}
            >
              Marcar como resolvido
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function FeedbackAdminTab({ showToast }: { showToast: ShowToast }) {
  const [items, setItems] = useState<FeedbackDoc[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [filter, setFilter] = useState<Filter>("aberto");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch("/api/feedback");
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !data.isAdmin) {
          setDenied(true);
          return;
        }
        setItems(Array.isArray(data.items) ? data.items : []);
      } catch {
        if (!cancelled) setDenied(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => {
    const all = items ?? [];
    return {
      aberto: all.filter((f) => f.status === "aberto").length,
      resolvido: all.filter((f) => f.status === "resolvido").length,
      todos: all.length,
    };
  }, [items]);

  const visible = useMemo(() => {
    const all = items ?? [];
    return filter === "todos" ? all : all.filter((f) => f.status === filter);
  }, [items, filter]);

  function patch(next: FeedbackDoc) {
    setItems((cur) => (cur ? cur.map((f) => (f.id === next.id ? next : f)) : cur));
  }

  if (denied) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Acesso restrito"
        description="Esta aba é exclusiva da equipe NexusFi."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto rounded-xl p-1"
        style={{ background: "var(--sunken)", border: "1px solid var(--border)" }}
      >
        {(["aberto", "resolvido", "todos"] as const).map((f) => {
          const active = filter === f;
          const label = f === "aberto" ? "Abertos" : f === "resolvido" ? "Resolvidos" : "Todos";
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-all cursor-pointer"
              style={{
                background: active ? "var(--surface)" : "transparent",
                color: active ? "var(--brand)" : "var(--text-muted)",
                boxShadow: active ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              }}
            >
              {label}
              <span
                className="text-xs px-1.5 rounded-full"
                style={{ background: "var(--sunken)", color: "var(--text-muted)" }}
              >
                {counts[f]}
              </span>
            </button>
          );
        })}
      </div>

      {items === null ? (
        <p className="text-xs px-1" style={{ color: "var(--text-subtle)" }}>
          Carregando…
        </p>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={filter === "aberto" ? "Nenhum chamado em aberto" : "Nada aqui"}
          description={filter === "aberto" ? "Tudo resolvido por enquanto." : undefined}
        />
      ) : (
        visible.map((fb) => <AdminRow key={fb.id} fb={fb} onChanged={patch} showToast={showToast} />)
      )}
    </div>
  );
}
