"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CookingPot, Factory } from "lucide-react";
import { Button, Card, EmptyState, Field, Input, Pill, Table } from "@/app/components/ui";
import { formatDateTime, formatMoney } from "@/lib/format";
import { agregarProducao } from "@/lib/restaurante/pedido";
import type { Falta, Ingrediente, Unidade } from "@/lib/restaurante/tipos";
import { unidadesCompativeis } from "@/lib/restaurante/unidades";
import type { RestauranteData } from "./useRestauranteData";
import { MovimentoModal } from "./IngredientesTab";
import { Erro, FaltaForcarModal, RestApiError, erroMsg, fmtQtd, lerNumero, restApi, selectClass, selectStyle } from "./shared";

/**
 * (a) O que precisa ser feito agora: pratos dos pedidos recebidos/em preparo e
 * insumos dos ainda sem baixa × saldo. (b) Lotes de preparo e perdas.
 */
export function ProducaoTab({ dados }: { dados: RestauranteData }) {
  const t = useTranslations("restaurante");
  const locale = useLocale();
  const porId = useMemo(() => new Map(dados.ingredientes.map((i) => [i.id, i])), [dados.ingredientes]);
  const prod = useMemo(() => agregarProducao(dados.pedidos, porId), [dados.pedidos, porId]);
  const unidades = useMemo(() => new Map(dados.ingredientes.map((i) => [i.id, i.unidadeExibicao])), [dados.ingredientes]);
  const [perda, setPerda] = useState<Ingrediente | null>(null);
  const [perdaId, setPerdaId] = useState("");

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div>
          <h2 className="text-base font-bold" style={{ color: "var(--text)" }}>{t("producao.agoraTitulo")}</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>{t("producao.agoraDesc")}</p>
        </div>
        {prod.pratos.length === 0 ? (
          <EmptyState icon={CookingPot} title={t("producao.vazio")} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <Table
              columns={[
                { key: "nome", header: t("producao.prato") },
                { key: "recebido", header: t("status.recebido"), align: "right" },
                { key: "emPreparo", header: t("status.em_preparo"), align: "right" },
                { key: "total", header: t("producao.total"), align: "right" },
              ]}
              rows={prod.pratos}
              rowKey={(p) => p.pratoId}
              renderCell={(p, k) => (k === "nome" ? <span className="font-semibold">{p.nome}</span> : k === "total" ? <span className="font-bold">{p.total}</span> : p[k as "recebido" | "emPreparo"])}
            />
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{t("producao.insumos")}</h3>
              {prod.insumos.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--text-subtle)" }}>{t("producao.insumosVazio")}</p>
              ) : (
                <Table
                  columns={[
                    { key: "nome", header: t("falta.ingrediente") },
                    { key: "necessario", header: t("falta.necessario"), align: "right" },
                    { key: "saldo", header: t("producao.saldo"), align: "right" },
                    { key: "falta", header: t("falta.falta"), align: "right" },
                  ]}
                  rows={prod.insumos}
                  rowKey={(i) => i.ingredienteId}
                  renderCell={(i, k) => {
                    const u = unidades.get(i.ingredienteId) ?? i.unidadeBase;
                    if (k === "nome") return i.nome;
                    if (k === "falta") return i.falta > 0 ? <span className="font-semibold" style={{ color: "var(--neg)" }}>{fmtQtd(i.falta, u, locale)}</span> : <Pill tone="pos">{t("producao.ok")}</Pill>;
                    return fmtQtd(k === "necessario" ? i.necessario : i.saldo, u, locale);
                  }}
                />
              )}
            </div>
          </div>
        )}
      </Card>

      <LoteForm dados={dados} unidades={unidades} />

      <Card className="space-y-3">
        <div>
          <h2 className="text-base font-bold" style={{ color: "var(--text)" }}>{t("producao.perdaTitulo")}</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>{t("producao.perdaDesc")}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Field label={t("falta.ingrediente")} className="min-w-56 flex-1">
            <select className={selectClass} style={selectStyle} value={perdaId} onChange={(e) => setPerdaId(e.target.value)}>
              <option value="">{t("ficha.escolher")}</option>
              {dados.ingredientes.filter((i) => i.ativo).map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
            </select>
          </Field>
          <Button variant="secondary" disabled={!perdaId} onClick={() => setPerda(porId.get(perdaId) ?? null)}>{t("producao.registrarPerda")}</Button>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-base font-bold" style={{ color: "var(--text)" }}>{t("producao.lotesTitulo")}</h2>
        <Table
          columns={[
            { key: "em", header: t("producao.quando") },
            { key: "preparo", header: t("producao.preparo") },
            { key: "qtd", header: t("comum.quantidade"), align: "right" },
            { key: "custo", header: t("producao.custoLote"), align: "right" },
            { key: "ator", header: t("producao.quem") },
          ]}
          rows={dados.lotes}
          rowKey={(l) => l.id}
          empty={<p className="text-sm" style={{ color: "var(--text-subtle)" }}>{t("producao.lotesVazio")}</p>}
          renderCell={(l, k) => {
            if (k === "em") return formatDateTime(l.em, locale);
            if (k === "preparo") return <span className="flex flex-wrap items-center gap-1.5">{l.ingredienteNome}{l.forcado && <Pill tone="warn">{t("pedidos.forcado")}</Pill>}</span>;
            if (k === "qtd") return fmtQtd(l.quantidade, unidades.get(l.ingredienteId) ?? l.unidadeBase, locale);
            if (k === "custo") return formatMoney(l.custoLote, locale);
            return l.ator?.nome ?? "—";
          }}
        />
      </Card>

      {perda && <MovimentoModal ing={perda} acaoInicial="perda" onFechar={() => setPerda(null)} />}
    </div>
  );
}

function LoteForm({ dados, unidades }: { dados: RestauranteData; unidades: Map<string, Unidade> }) {
  const t = useTranslations("restaurante");
  const locale = useLocale();
  const preparos = dados.ingredientes.filter((i) => i.preparo && i.ativo);
  const [id, setId] = useState("");
  const [qtd, setQtd] = useState("");
  const [unidade, setUnidade] = useState<Unidade | "">("");
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [faltas, setFaltas] = useState<Falta[] | null>(null);
  const prep = preparos.find((p) => p.id === id);
  const u: Unidade | "" = unidade || prep?.unidadeExibicao || "";

  async function registrar(extra: { forcar?: boolean; motivo?: string } = {}) {
    setBusy(true); setErro(""); setOk("");
    try {
      await restApi("/api/restaurante/producao", { body: { ingredienteId: id, quantidade: lerNumero(qtd), unidade: u, motivo: extra.motivo ?? motivo, forcar: extra.forcar === true } });
      setFaltas(null); setQtd(""); setMotivo("");
      setOk(t("producao.loteOk"));
    } catch (e) {
      if (e instanceof RestApiError && e.code === "faltaInsumo" && e.faltas) setFaltas(e.faltas);
      else if (extra.forcar) throw e;
      else setErro(erroMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="text-base font-bold" style={{ color: "var(--text)" }}>{t("producao.loteTitulo")}</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>{t("producao.loteDesc")}</p>
      </div>
      {preparos.length === 0 ? (
        <EmptyState icon={Factory} title={t("producao.semPreparos")} description={t("producao.semPreparosDesc")} />
      ) : (
        <>
          <div className="grid items-end gap-2 sm:grid-cols-[2fr_1fr_6rem_2fr_auto]">
            <Field label={t("producao.preparo")}>
              <select className={selectClass} style={selectStyle} value={id} onChange={(e) => { setId(e.target.value); setUnidade(""); }}>
                <option value="">{t("ficha.escolher")}</option>
                {preparos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </Field>
            <Field label={t("producao.qtdProduzida")}><Input inputMode="decimal" value={qtd} onChange={(e) => setQtd(e.target.value)} placeholder="0" /></Field>
            <Field label={t("comum.unidade")}>
              <select className={selectClass} style={selectStyle} value={u} disabled={!prep} onChange={(e) => setUnidade(e.target.value as Unidade)}>
                {prep ? unidadesCompativeis(prep.unidadeBase).map((x) => <option key={x} value={x}>{x}</option>) : <option value="">—</option>}
              </select>
            </Field>
            <Field label={t("comum.motivoOpcional")}><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} /></Field>
            <Button onClick={() => registrar()} loading={busy} disabled={busy || !prep || !qtd.trim()}>{t("comum.registrar")}</Button>
          </div>
          {prep && (prep.receita?.length ?? 0) > 0 && (
            <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
              {t("producao.receitaRende", { qtd: fmtQtd(prep.rendimento ?? 0, prep.unidadeExibicao, locale) })}{" "}
              {prep.receita!.map((r) => `${dados.ingredientes.find((i) => i.id === r.ingredienteId)?.nome ?? "?"} ${fmtQtd(r.quantidade, dados.ingredientes.find((i) => i.id === r.ingredienteId)?.unidadeBase ?? "un", locale)}`).join(" · ")}
            </p>
          )}
          {prep && (prep.receita?.length ?? 0) === 0 && <p className="text-xs" style={{ color: "var(--warn)" }}>{t("producao.semReceita")}</p>}
        </>
      )}
      <Erro msg={erro} />
      {ok && <p role="status" className="text-sm font-medium" style={{ color: "var(--pos)" }}>{ok}</p>}
      {faltas && (
        <FaltaForcarModal
          aberto
          titulo={t("falta.tituloLote", { nome: prep?.nome ?? "" })}
          faltas={faltas}
          unidades={unidades}
          onFechar={() => setFaltas(null)}
          onForcar={(m) => registrar({ forcar: true, motivo: m })}
        />
      )}
    </Card>
  );
}
