"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowDownUp, History, Package, Pencil, Plus, Trash2 } from "lucide-react";
import { Button, Card, EmptyState, Field, Input, Pill, Table } from "@/app/components/ui";
import { formatMoney, formatDateTime } from "@/lib/format";
import { nivelAlerta } from "@/lib/restaurante/estoque";
import type { Ingrediente, Unidade, UnidadeBase } from "@/lib/restaurante/tipos";
import { custoDeBase, deBase, unidadesCompativeis, UNIDADES_BASE } from "@/lib/restaurante/unidades";
import type { RestauranteData } from "./useRestauranteData";
import { FichaEditor, fichaParaForm, fichaParaPayload, type LinhaFichaForm } from "./FichaEditor";
import { Erro, RestModal, erroMsg, fmtNum, fmtQtd, lerNumero, paraCampo, restApi, selectClass, selectStyle } from "./shared";

/** Estoque de ingredientes: cadastro (CRUD), entrada de compra, ajuste/perda e histórico. */
export function IngredientesTab({ dados }: { dados: RestauranteData }) {
  const t = useTranslations("restaurante");
  const locale = useLocale();
  const [modal, setModal] = useState<{ ing: Ingrediente | null } | null>(null);
  const [mov, setMov] = useState<Ingrediente | null>(null);
  const [hist, setHist] = useState<Ingrediente | null>(null);
  const [confirmaExcluir, setConfirmaExcluir] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return q ? dados.ingredientes.filter((i) => i.nome.toLowerCase().includes(q)) : dados.ingredientes;
  }, [dados.ingredientes, busca]);

  async function excluir(i: Ingrediente) {
    setBusy(true); setErro("");
    try { await restApi(`/api/restaurante/ingredientes?id=${encodeURIComponent(i.id)}`, { method: "DELETE" }); }
    catch (e) { setErro(erroMsg(e)); }
    finally { setBusy(false); setConfirmaExcluir(null); }
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold" style={{ color: "var(--text)" }}>{t("ingredientes.titulo")}</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>{t("ingredientes.desc")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input aria-label={t("comum.buscar")} placeholder={t("comum.buscar")} value={busca} onChange={(e) => setBusca(e.target.value)} className="!w-48" />
          <Button icon={Plus} onClick={() => setModal({ ing: null })}>{t("ingredientes.novo")}</Button>
        </div>
      </div>
      <Erro msg={erro} />
      <Table
        columns={[
          { key: "nome", header: t("ingredientes.nome") },
          { key: "saldo", header: t("ingredientes.saldo"), align: "right" },
          { key: "minimo", header: t("ingredientes.minimo"), align: "right" },
          { key: "custo", header: t("ingredientes.custoMedio"), align: "right" },
          { key: "status", header: t("ingredientes.status") },
          { key: "acoes", header: "", align: "right", width: "1px" },
        ]}
        rows={lista}
        rowKey={(i) => i.id}
        empty={<EmptyState icon={Package} title={t("ingredientes.vazio")} description={t("ingredientes.vazioDesc")} />}
        renderCell={(i, key) => {
          const u = i.unidadeExibicao;
          switch (key) {
            case "nome":
              return (
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold">{i.nome}</span>
                  {i.preparo && <Pill tone="info">{t("ingredientes.preparo")}</Pill>}
                  {!i.ativo && <Pill tone="muted">{t("comum.inativo")}</Pill>}
                </span>
              );
            case "saldo": return <span style={{ color: i.saldo < 0 ? "var(--neg)" : undefined }}>{fmtQtd(i.saldo, u, locale)}</span>;
            case "minimo": return i.minimo > 0 ? fmtQtd(i.minimo, u, locale) : "—";
            case "custo": return `${formatMoney(custoDeBase(i.custoMedio, u), locale)}/${u}`;
            case "status": {
              const n = nivelAlerta(i.saldo, i.minimo);
              return <Pill tone={n === "zerado" ? "neg" : n === "baixo" ? "warn" : "pos"} dot>{t(`nivel.${n}`)}</Pill>;
            }
            case "acoes":
              return (
                <span className="flex items-center justify-end gap-1">
                  <Button size="sm" variant="ghost" icon={ArrowDownUp} aria-label={t("mov.titulo")} title={t("mov.titulo")} onClick={() => setMov(i)} />
                  <Button size="sm" variant="ghost" icon={History} aria-label={t("historico.titulo")} title={t("historico.titulo")} onClick={() => setHist(i)} />
                  <Button size="sm" variant="ghost" icon={Pencil} aria-label={t("comum.editar")} onClick={() => setModal({ ing: i })} />
                  {confirmaExcluir === i.id
                    ? <Button size="sm" variant="danger" disabled={busy} onClick={() => excluir(i)}>{t("comum.confirmar")}</Button>
                    : <Button size="sm" variant="ghost" icon={Trash2} aria-label={t("comum.excluir")} onClick={() => setConfirmaExcluir(i.id)} />}
                </span>
              );
            default: return null;
          }
        }}
      />
      {modal && <IngredienteModal ing={modal.ing} todos={dados.ingredientes} onFechar={() => setModal(null)} />}
      {mov && <MovimentoModal ing={mov} onFechar={() => setMov(null)} />}
      {hist && <HistoricoModal ing={hist} dados={dados} onFechar={() => setHist(null)} />}
    </Card>
  );
}

function IngredienteModal({ ing, todos, onFechar }: { ing: Ingrediente | null; todos: Ingrediente[]; onFechar: () => void }) {
  const t = useTranslations("restaurante");
  const locale = useLocale();
  const [nome, setNome] = useState(ing?.nome ?? "");
  const [base, setBase] = useState<UnidadeBase>(ing?.unidadeBase ?? "g");
  const [exib, setExib] = useState<Unidade>(ing?.unidadeExibicao ?? "kg");
  const [minimo, setMinimo] = useState(ing ? paraCampo(deBase(ing.minimo, ing.unidadeExibicao), locale) : "");
  const [custo, setCusto] = useState(ing ? paraCampo(custoDeBase(ing.custoMedio, ing.unidadeExibicao), locale) : "");
  const [saldoInicial, setSaldoInicial] = useState("");
  const [preparo, setPreparo] = useState(ing?.preparo ?? false);
  const [receita, setReceita] = useState<LinhaFichaForm[]>(fichaParaForm(ing?.receita, locale));
  const [rendimento, setRendimento] = useState(ing?.rendimento ? paraCampo(deBase(ing.rendimento, ing.unidadeExibicao), locale) : "");
  const [ativo, setAtivo] = useState(ing?.ativo ?? true);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  // Receita de preparo só com insumos crus (sem recursão) e nunca o próprio.
  const insumosCrus = todos.filter((x) => !x.preparo && x.id !== ing?.id);

  function trocarBase(b: UnidadeBase) {
    setBase(b);
    setExib(b === "g" ? "kg" : b === "ml" ? "L" : "un");
  }

  async function salvar() {
    setBusy(true); setErro("");
    try {
      const body = {
        nome, unidadeBase: base, unidadeExibicao: exib, ativo, preparo,
        minimo: lerNumero(minimo) || 0,
        custo: lerNumero(custo) || 0,
        ...(ing ? {} : { saldoInicial: lerNumero(saldoInicial) || 0 }),
        ...(preparo ? { receita: fichaParaPayload(receita), rendimento: lerNumero(rendimento) || 0 } : {}),
      };
      if (ing) await restApi("/api/restaurante/ingredientes", { method: "PATCH", body: { id: ing.id, ...body } });
      else await restApi("/api/restaurante/ingredientes", { body });
      onFechar();
    } catch (e) {
      setErro(erroMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <RestModal open onClose={onFechar} title={ing ? t("ingredientes.editarTitulo") : t("ingredientes.novoTitulo")} size="lg" closeDisabled={busy}>
      <div className="space-y-4">
        <Field label={t("ingredientes.nome")}><Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("ingredientes.unidadeBase")} hint={ing ? t("ingredientes.baseFixa") : t("ingredientes.baseHint")}>
            <select className={selectClass} style={selectStyle} value={base} disabled={!!ing} onChange={(e) => trocarBase(e.target.value as UnidadeBase)}>
              {UNIDADES_BASE.map((u) => <option key={u} value={u}>{t(`unidade.${u}`)}</option>)}
            </select>
          </Field>
          <Field label={t("ingredientes.unidadeExibicao")} hint={t("ingredientes.exibHint")}>
            <select className={selectClass} style={selectStyle} value={exib} onChange={(e) => setExib(e.target.value as Unidade)}>
              {unidadesCompativeis(base).map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </Field>
          <Field label={`${t("ingredientes.minimo")} (${exib})`}><Input inputMode="decimal" value={minimo} onChange={(e) => setMinimo(e.target.value)} placeholder="0" /></Field>
          <Field label={t("ingredientes.custoPor", { unidade: exib })} hint={ing ? t("ingredientes.custoHint") : undefined}>
            <Input inputMode="decimal" value={custo} onChange={(e) => setCusto(e.target.value)} placeholder="0,00" />
          </Field>
          {!ing && (
            <Field label={`${t("ingredientes.saldoInicial")} (${exib})`} hint={t("ingredientes.saldoInicialHint")}>
              <Input inputMode="decimal" value={saldoInicial} onChange={(e) => setSaldoInicial(e.target.value)} placeholder="0" />
            </Field>
          )}
        </div>
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={preparo} onChange={(e) => setPreparo(e.target.checked)} />
          <span>
            <span className="block font-semibold">{t("ingredientes.preparoLabel")}</span>
            <span className="block text-xs" style={{ color: "var(--text-muted)" }}>{t("ingredientes.preparoHint")}</span>
          </span>
        </label>
        {preparo && (
          <div className="space-y-3 rounded-lg p-3" style={{ border: "1px solid var(--border)" }}>
            <FichaEditor linhas={receita} onChange={setReceita} ingredientes={insumosCrus} rotulo={t("ingredientes.receita")} />
            <Field label={`${t("ingredientes.rendimento")} (${exib})`} hint={t("ingredientes.rendimentoHint")}>
              <Input inputMode="decimal" value={rendimento} onChange={(e) => setRendimento(e.target.value)} placeholder="0" />
            </Field>
          </div>
        )}
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
          {t("comum.ativo")}
        </label>
        <Erro msg={erro} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onFechar} disabled={busy}>{t("comum.cancelar")}</Button>
          <Button onClick={salvar} loading={busy} disabled={busy || nome.trim().length < 2}>{t("comum.salvar")}</Button>
        </div>
      </div>
    </RestModal>
  );
}

type AcaoMov = "entrada" | "ajuste" | "perda";

export function MovimentoModal({ ing, onFechar, acaoInicial = "entrada" }: { ing: Ingrediente; onFechar: () => void; acaoInicial?: AcaoMov }) {
  const t = useTranslations("restaurante");
  const locale = useLocale();
  const [acao, setAcao] = useState<AcaoMov>(acaoInicial);
  const [unidade, setUnidade] = useState<Unidade>(ing.unidadeExibicao);
  const [qtd, setQtd] = useState("");
  const [custoTotal, setCustoTotal] = useState("");
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar() {
    setBusy(true); setErro("");
    try {
      await restApi("/api/restaurante/movimentos", {
        body: { acao, ingredienteId: ing.id, quantidade: lerNumero(qtd), unidade, motivo, ...(acao === "entrada" ? { custoTotal: lerNumero(custoTotal) || 0 } : {}) },
      });
      onFechar();
    } catch (e) {
      setErro(erroMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const motivoObrigatorio = acao !== "entrada";
  return (
    <RestModal open onClose={onFechar} title={`${t("mov.titulo")} — ${ing.nome}`} closeDisabled={busy}>
      <div className="space-y-4">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>{t("mov.saldoAtual")}: <span className="mono font-semibold" style={{ color: "var(--text)" }}>{fmtQtd(ing.saldo, ing.unidadeExibicao, locale)}</span></p>
        <div role="radiogroup" aria-label={t("mov.tipo")} className="grid grid-cols-3 gap-1 rounded-lg p-1" style={{ background: "var(--sunken)" }}>
          {(["entrada", "ajuste", "perda"] as const).map((a) => (
            <button key={a} type="button" role="radio" aria-checked={acao === a} onClick={() => setAcao(a)}
              className="cursor-pointer rounded-md px-2 py-1.5 text-xs font-semibold"
              style={{ background: acao === a ? "var(--surface)" : "transparent", color: acao === a ? "var(--text)" : "var(--text-muted)" }}>
              {t(`mov.${a}`)}
            </button>
          ))}
        </div>
        <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{t(`mov.${acao}Hint`)}</p>
        <div className="grid grid-cols-[1fr_6rem] gap-2">
          <Field label={acao === "ajuste" ? t("mov.novoSaldo") : t("comum.quantidade")}>
            <Input inputMode="decimal" value={qtd} onChange={(e) => setQtd(e.target.value)} placeholder="0" />
          </Field>
          <Field label={t("comum.unidade")}>
            <select className={selectClass} style={selectStyle} value={unidade} onChange={(e) => setUnidade(e.target.value as Unidade)}>
              {unidadesCompativeis(ing.unidadeBase).map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </Field>
        </div>
        {acao === "entrada" && (
          <Field label={t("mov.custoTotal")} hint={t("mov.custoTotalHint")}>
            <Input inputMode="decimal" value={custoTotal} onChange={(e) => setCustoTotal(e.target.value)} placeholder="0,00" />
          </Field>
        )}
        <Field label={motivoObrigatorio ? t("comum.motivo") : t("comum.motivoOpcional")}>
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} />
        </Field>
        <Erro msg={erro} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onFechar} disabled={busy}>{t("comum.cancelar")}</Button>
          <Button onClick={salvar} loading={busy} disabled={busy || !qtd.trim() || (motivoObrigatorio && motivo.trim().length < 3)}>{t("comum.registrar")}</Button>
        </div>
      </div>
    </RestModal>
  );
}

function HistoricoModal({ ing, dados, onFechar }: { ing: Ingrediente; dados: RestauranteData; onFechar: () => void }) {
  const t = useTranslations("restaurante");
  const locale = useLocale();
  const movs = dados.movimentos.filter((m) => m.ingredienteId === ing.id);
  return (
    <RestModal open onClose={onFechar} title={`${t("historico.titulo")} — ${ing.nome}`} size="lg">
      <div className="space-y-3">
        <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{t("historico.desc")}</p>
        {movs.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>{t("historico.vazio")}</p>
        ) : (
          <ul className="divide-y text-sm" style={{ borderColor: "var(--border)" }}>
            {movs.map((m) => (
              <li key={m.id} className="flex flex-wrap items-start justify-between gap-2 py-2" style={{ borderColor: "var(--border)" }}>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Pill tone={m.delta > 0 ? "pos" : m.delta < 0 ? "neg" : "muted"}>{t(`tipoMov.${m.tipo}`)}</Pill>
                    {m.pedidoNumero ? <span className="text-xs" style={{ color: "var(--text-muted)" }}>#{m.pedidoNumero}</span> : null}
                  </span>
                  <span className="mt-0.5 block text-xs" style={{ color: "var(--text-muted)" }}>
                    {formatDateTime(m.em, locale)} · {m.ator?.nome}{m.motivo ? ` · ${m.motivo}` : ""}
                  </span>
                </span>
                <span className="mono text-right text-xs">
                  <span className="block font-semibold" style={{ color: m.delta > 0 ? "var(--pos)" : m.delta < 0 ? "var(--neg)" : "var(--text-muted)" }}>
                    {m.delta > 0 ? "+" : ""}{fmtQtd(m.delta === 0 ? m.quantidade : m.delta, ing.unidadeExibicao, locale)}
                  </span>
                  <span style={{ color: "var(--text-subtle)" }}>{t("historico.saldo")}: {fmtNum(deBase(m.saldoDepois, ing.unidadeExibicao), locale)} {ing.unidadeExibicao}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </RestModal>
  );
}
