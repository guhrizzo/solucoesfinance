"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Clock, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button, Field, Input, Pill } from "@/app/components/ui";
import { formatMoney } from "@/lib/format";
import type { Alertas } from "@/lib/restaurante/alertas";
import { estaAtrasado, minutosNoStatus, proximoStatus } from "@/lib/restaurante/pedido";
import { ORIGENS_PEDIDO, type Falta, type OrigemPedido, type Pedido, type StatusPedido } from "@/lib/restaurante/tipos";
import type { RestauranteData } from "./useRestauranteData";
import { Erro, FaltaForcarModal, RestApiError, RestModal, erroMsg, restApi, selectClass, selectStyle, useAgora } from "./shared";

const COLUNAS: StatusPedido[] = ["recebido", "em_preparo", "pronto", "entregue"];
/** Entregues ficam no quadro por 6 h (o histórico completo é o Firestore). */
const JANELA_ENTREGUES = 6 * 60 * 60_000;

export function PedidosTab({ dados, alertas }: { dados: RestauranteData; alertas: Alertas }) {
  const t = useTranslations("restaurante");
  const agora = useAgora();
  const [modal, setModal] = useState<{ pedido: Pedido | null } | null>(null);
  const [cancelar, setCancelar] = useState<Pedido | null>(null);
  const [falta, setFalta] = useState<{ pedido: Pedido; faltas: Falta[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  const unidades = useMemo(() => new Map(dados.ingredientes.map((i) => [i.id, i.unidadeExibicao])), [dados.ingredientes]);
  const porColuna = useMemo(() => {
    const m = new Map<StatusPedido, Pedido[]>(COLUNAS.map((c) => [c, []]));
    for (const p of dados.pedidos) {
      if (p.status === "entregue" && agora - (p.transicoes.entregue?.em ?? p.atualizadoEm) > JANELA_ENTREGUES) continue;
      m.get(p.status)?.push(p);
    }
    // Mais antigo primeiro (fila da cozinha); entregues, mais recente primeiro.
    for (const [s, l] of m) l.sort((a, b) => (s === "entregue" ? b.atualizadoEm - a.atualizadoEm : a.criadoEm - b.criadoEm));
    return m;
  }, [dados.pedidos, agora]);

  async function avancar(p: Pedido, para: StatusPedido, extra: Record<string, unknown> = {}) {
    setBusy(p.id); setErro("");
    try {
      await restApi("/api/restaurante/pedidos", { method: "PATCH", body: { acao: "status", id: p.id, para, ...extra } });
      setFalta(null);
    } catch (e) {
      if (e instanceof RestApiError && e.code === "faltaInsumo" && e.faltas) setFalta({ pedido: p, faltas: e.faltas });
      else if (extra.forcar) throw e;
      else setErro(erroMsg(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>{t("pedidos.desc")}</p>
        <Button icon={Plus} onClick={() => setModal({ pedido: null })} disabled={dados.pratos.every((p) => !p.ativo)}>{t("pedidos.novo")}</Button>
      </div>
      {dados.pratos.every((p) => !p.ativo) && <p className="text-sm" style={{ color: "var(--warn)" }}>{t("pedidos.semPratos")}</p>}
      <Erro msg={erro} />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLUNAS.map((col) => {
          const lista = porColuna.get(col) ?? [];
          return (
            <section key={col} aria-label={t(`status.${col}`)} className="flex min-h-40 flex-col gap-2 rounded-xl p-2.5" style={{ background: "var(--sunken)" }}>
              <h2 className="flex items-center justify-between px-1 text-sm font-bold" style={{ color: "var(--text)" }}>
                {t(`status.${col}`)}
                <Pill tone={col === "pronto" ? "pos" : col === "entregue" ? "muted" : "info"}>{lista.length}</Pill>
              </h2>
              {lista.length === 0 && <p className="px-1 py-6 text-center text-xs" style={{ color: "var(--text-subtle)" }}>{t("pedidos.vazioColuna")}</p>}
              {lista.map((p) => (
                <CartaoPedido
                  key={p.id}
                  pedido={p}
                  agora={agora}
                  busy={busy === p.id}
                  onAvancar={(para) => avancar(p, para)}
                  onEditar={() => setModal({ pedido: p })}
                  onCancelar={() => setCancelar(p)}
                />
              ))}
            </section>
          );
        })}
      </div>

      {modal && <PedidoModal pedido={modal.pedido} dados={dados} alertas={alertas} onFechar={() => setModal(null)} />}
      {cancelar && <CancelarModal pedido={cancelar} onFechar={() => setCancelar(null)} />}
      {falta && (
        <FaltaForcarModal
          aberto
          titulo={t("falta.tituloPedido", { numero: falta.pedido.numero })}
          faltas={falta.faltas}
          unidades={unidades}
          onFechar={() => setFalta(null)}
          onForcar={(motivo) => avancar(falta.pedido, "em_preparo", { forcar: true, motivo })}
        />
      )}
    </div>
  );
}

function CartaoPedido({
  pedido: p, agora, busy, onAvancar, onEditar, onCancelar,
}: {
  pedido: Pedido;
  agora: number;
  busy: boolean;
  onAvancar: (para: StatusPedido) => void;
  onEditar: () => void;
  onCancelar: () => void;
}) {
  const t = useTranslations("restaurante");
  const locale = useLocale();
  const atrasado = estaAtrasado(p, agora);
  const prox = proximoStatus(p.status);
  const min = minutosNoStatus(p, agora);
  const aberto = p.status !== "entregue" && p.status !== "cancelado";
  return (
    <article
      className="space-y-2 rounded-lg p-3"
      style={{
        background: "var(--surface)",
        border: `1px solid ${atrasado ? "var(--neg)" : "var(--border)"}`,
        boxShadow: atrasado ? "0 0 0 1px var(--neg)" : undefined,
      }}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-base font-bold" style={{ color: "var(--text)" }}>#{p.numero}</p>
          <p className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
            {t(`origem.${p.origem}`)}
            {p.mesa && ` · ${t("pedidos.mesa", { mesa: p.mesa })}`}
            {p.cliente && ` · ${p.cliente}`}
          </p>
        </div>
        <span className="flex shrink-0 flex-col items-end gap-1">
          {aberto && (
            <span className="mono flex items-center gap-1 text-xs font-semibold" style={{ color: atrasado ? "var(--neg)" : "var(--text-muted)" }}>
              <Clock size={12} aria-hidden="true" /> {t("pedidos.minutos", { min })}
            </span>
          )}
          {atrasado && <Pill tone="neg">{t("pedidos.atrasado")}</Pill>}
          {p.baixaForcada && <Pill tone="warn">{t("pedidos.forcado")}</Pill>}
        </span>
      </header>
      <ul className="space-y-1 text-sm">
        {p.itens.map((it, i) => (
          <li key={i}>
            <span className="font-semibold">{it.qtd}×</span> {it.nome}
            {it.obs && <span className="block text-xs italic" style={{ color: "var(--warn)" }}>{it.obs}</span>}
          </li>
        ))}
      </ul>
      {p.observacao && <p className="text-xs italic" style={{ color: "var(--text-muted)" }}>{p.observacao}</p>}
      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="mono text-sm font-semibold">{formatMoney(p.total, locale)}</span>
        <span className="flex items-center gap-1">
          {p.status === "recebido" && <Button size="sm" variant="ghost" icon={Pencil} aria-label={t("comum.editar")} onClick={onEditar} disabled={busy} />}
          {aberto && <Button size="sm" variant="ghost" icon={X} aria-label={t("pedidos.cancelar")} onClick={onCancelar} disabled={busy} />}
        </span>
      </div>
      {prox && (
        <Button size="sm" className="w-full" variant={prox === "entregue" ? "success" : "primary"} loading={busy} disabled={busy} onClick={() => onAvancar(prox)}>
          {t(`pedidos.avancar.${prox}`)}
        </Button>
      )}
    </article>
  );
}

interface LinhaForm { pratoId: string; qtd: number; obs: string }

function PedidoModal({ pedido, dados, alertas, onFechar }: { pedido: Pedido | null; dados: RestauranteData; alertas: Alertas; onFechar: () => void }) {
  const t = useTranslations("restaurante");
  const locale = useLocale();
  const [origem, setOrigem] = useState<OrigemPedido>(pedido?.origem ?? "balcao");
  const [mesa, setMesa] = useState(pedido?.mesa ?? "");
  const [cliente, setCliente] = useState(pedido?.cliente ?? "");
  const [observacao, setObservacao] = useState(pedido?.observacao ?? "");
  const [linhas, setLinhas] = useState<LinhaForm[]>(pedido?.itens.map((i) => ({ pratoId: i.pratoId, qtd: i.qtd, obs: i.obs })) ?? []);
  const [escolha, setEscolha] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  const ativos = dados.pratos.filter((p) => p.ativo && p.ficha.length > 0);
  const porId = new Map(dados.pratos.map((p) => [p.id, p]));
  const indisponiveis = new Set(alertas.pratosIndisponiveis.map((p) => p.pratoId));
  const total = linhas.reduce((s, l) => s + (porId.get(l.pratoId)?.preco ?? 0) * l.qtd, 0);

  function adicionar(id: string) {
    if (!id) return;
    setLinhas((ls) => (ls.some((l) => l.pratoId === id && !l.obs) ? ls.map((l) => (l.pratoId === id && !l.obs ? { ...l, qtd: Math.min(99, l.qtd + 1) } : l)) : [...ls, { pratoId: id, qtd: 1, obs: "" }]));
    setEscolha("");
  }

  async function salvar() {
    setBusy(true); setErro("");
    try {
      const body = { origem, mesa, cliente, observacao, itens: linhas };
      if (pedido) await restApi("/api/restaurante/pedidos", { method: "PATCH", body: { acao: "editar", id: pedido.id, ...body } });
      else await restApi("/api/restaurante/pedidos", { body });
      onFechar();
    } catch (e) {
      setErro(erroMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <RestModal open onClose={onFechar} title={pedido ? t("pedidoModal.tituloEditar", { numero: pedido.numero }) : t("pedidoModal.tituloNovo")} size="lg" closeDisabled={busy}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t("pedidoModal.origem")}>
            <select className={selectClass} style={selectStyle} value={origem} onChange={(e) => setOrigem(e.target.value as OrigemPedido)}>
              {ORIGENS_PEDIDO.map((o) => <option key={o} value={o}>{t(`origem.${o}`)}</option>)}
            </select>
          </Field>
          <Field label={t("pedidoModal.mesa")}><Input value={mesa} onChange={(e) => setMesa(e.target.value)} maxLength={20} /></Field>
          <Field label={t("pedidoModal.cliente")}><Input value={cliente} onChange={(e) => setCliente(e.target.value)} maxLength={80} /></Field>
        </div>

        <Field label={t("pedidoModal.adicionar")}>
          <select className={selectClass} style={selectStyle} value={escolha} onChange={(e) => adicionar(e.target.value)}>
            <option value="">{t("pedidoModal.escolher")}</option>
            {ativos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome} — {formatMoney(p.preco, locale)}{indisponiveis.has(p.id) ? ` (${t("pratos.indisponivel")})` : ""}
              </option>
            ))}
          </select>
        </Field>

        {linhas.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-subtle)" }}>{t("pedidoModal.semItens")}</p>
        ) : (
          <ul className="space-y-2">
            {linhas.map((l, i) => {
              const prato = porId.get(l.pratoId);
              return (
                <li key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-lg p-2.5 sm:grid-cols-[1fr_5rem_1fr_auto]" style={{ border: "1px solid var(--border)" }}>
                  <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                    {prato?.nome ?? "—"}
                    {indisponiveis.has(l.pratoId) && <Pill tone="warn">{t("pratos.indisponivel")}</Pill>}
                  </span>
                  <Input
                    aria-label={t("pedidoModal.qtd")}
                    inputMode="numeric"
                    className="!py-1.5 text-right"
                    value={String(l.qtd)}
                    onChange={(e) => {
                      const n = Math.max(1, Math.min(99, Math.floor(Number(e.target.value.replace(/\D/g, "")) || 1)));
                      setLinhas((ls) => ls.map((x, j) => (j === i ? { ...x, qtd: n } : x)));
                    }}
                  />
                  <Input
                    aria-label={t("pedidoModal.obs")}
                    placeholder={t("pedidoModal.obs")}
                    className="col-span-2 !py-1.5 sm:col-span-1"
                    value={l.obs}
                    maxLength={140}
                    onChange={(e) => setLinhas((ls) => ls.map((x, j) => (j === i ? { ...x, obs: e.target.value } : x)))}
                  />
                  <Button size="sm" variant="ghost" icon={Trash2} aria-label={t("comum.remover")} onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))} />
                </li>
              );
            })}
          </ul>
        )}

        <Field label={t("pedidoModal.observacao")}><Input value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={300} /></Field>

        <p className="flex items-center justify-between text-sm">
          <span style={{ color: "var(--text-muted)" }}>{t("pedidoModal.totalPrevia")}</span>
          <span className="mono text-base font-bold">{formatMoney(total, locale)}</span>
        </p>
        <Erro msg={erro} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onFechar} disabled={busy}>{t("comum.cancelar")}</Button>
          <Button onClick={salvar} loading={busy} disabled={busy || linhas.length === 0 || (origem === "mesa" && !mesa.trim())}>
            {pedido ? t("comum.salvar") : t("pedidoModal.criar")}
          </Button>
        </div>
      </div>
    </RestModal>
  );
}

function CancelarModal({ pedido, onFechar }: { pedido: Pedido; onFechar: () => void }) {
  const t = useTranslations("restaurante");
  const [destino, setDestino] = useState<"estorno" | "perda">("estorno");
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  async function confirmar() {
    setBusy(true); setErro("");
    try {
      await restApi("/api/restaurante/pedidos", {
        method: "PATCH",
        body: { acao: "status", id: pedido.id, para: "cancelado", perda: pedido.baixaFeita && destino === "perda", motivo },
      });
      onFechar();
    } catch (e) {
      setErro(erroMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <RestModal open onClose={onFechar} title={t("cancelar.titulo", { numero: pedido.numero })} closeDisabled={busy}>
      <div className="space-y-4">
        {pedido.baixaFeita ? (
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm" style={{ color: "var(--text-muted)" }}>{t("cancelar.comBaixa")}</legend>
            {(["estorno", "perda"] as const).map((d) => (
              <label key={d} className="flex cursor-pointer items-start gap-2 rounded-lg p-2.5 text-sm" style={{ border: `1px solid ${destino === d ? "var(--brand)" : "var(--border)"}` }}>
                <input type="radio" name="destino" checked={destino === d} onChange={() => setDestino(d)} className="mt-0.5" />
                <span>
                  <span className="block font-semibold">{t(`cancelar.${d}`)}</span>
                  <span className="block text-xs" style={{ color: "var(--text-muted)" }}>{t(`cancelar.${d}Hint`)}</span>
                </span>
              </label>
            ))}
          </fieldset>
        ) : (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>{t("cancelar.semBaixa")}</p>
        )}
        <Field label={t("comum.motivoOpcional")}><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} /></Field>
        <Erro msg={erro} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onFechar} disabled={busy}>{t("comum.voltar")}</Button>
          <Button variant="danger" onClick={confirmar} loading={busy} disabled={busy}>{t("cancelar.confirmar")}</Button>
        </div>
      </div>
    </RestModal>
  );
}
