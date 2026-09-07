"use client";

// TEMP — rota de QA visual do design system (Fase 0). Remover na Fase 11.
// Sem Navbar, sem auth: valida os componentes ui/ em claro e escuro num só lugar,
// já que as telas reais exigem login Firebase.

import { useState, useEffect } from "react";
import { Plus, Download, Trash2, Inbox, TrendingUp } from "lucide-react";
import {
  Button, Pill, Card, Modal, Input, MoneyInput, Field,
  Table, KpiTile, PageHeader, EmptyState, Badge,
} from "@/app/components/ui";

const TOKENS = [
  "--bg", "--surface", "--sunken", "--border", "--border-strong",
  "--text", "--text-muted", "--text-subtle",
  "--brand", "--brand-hover", "--brand-weak",
  "--pos", "--pos-weak", "--neg", "--neg-weak", "--warn", "--warn-weak",
];

type Row = { date: string; desc: string; cat: string; status: React.ReactNode; amount: string; tone: "pos" | "neg" };

const ROWS: Row[] = [
  { date: "12 set", desc: "Delta Tecnologia — NF 4471", cat: "Recebimento de clientes", status: <Pill tone="pos" dot>Conciliado</Pill>, amount: "+ 134.000,00", tone: "pos" },
  { date: "11 set", desc: "Folha — quinzena", cat: "Folha de pagamento", status: <Pill tone="pos" dot>Conciliado</Pill>, amount: "− 48.220,00", tone: "neg" },
  { date: "10 set", desc: "Simples Nacional — DAS", cat: "Impostos", status: <Pill tone="warn" dot>Vence em 2 dias</Pill>, amount: "− 9.874,30", tone: "neg" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-lg font-bold" style={{ color: "var(--text)" }}>{title}</h2>
      {children}
    </section>
  );
}

export default function DesignSystemPage() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [modalOpen, setModalOpen] = useState(false);
  const [money, setMoney] = useState("1.290,00");

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza com o tema já aplicado pelo script inline, pós-hidratação
    if (current === "dark" || current === "light") setTheme(current);
  }, []);

  const apply = (t: "light" | "dark") => {
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
  };

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }}>
      <div className="mx-auto flex max-w-4xl flex-col gap-12 px-6 py-12">
        <div className="flex items-center justify-between">
          <PageHeader title="Design system" subtitle="Fase 0 — QA visual dos componentes ui/" badge={<Pill tone="info">temp</Pill>} />
          <Button variant="secondary" size="sm" onClick={() => apply(theme === "dark" ? "light" : "dark")}>
            Tema: {theme === "dark" ? "escuro" : "claro"}
          </Button>
        </div>

        <Section title="Tokens">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TOKENS.map((t) => (
              <div key={t} style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ height: 44, background: `var(${t})` }} />
                <div className="mono px-2 py-1 text-[10px]" style={{ color: "var(--text-subtle)" }}>{t}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Button">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" icon={Plus}>Novo lançamento</Button>
            <Button variant="success" icon={Plus}>Nova transação</Button>
            <Button variant="secondary" icon={Download}>Exportar</Button>
            <Button variant="ghost">Cancelar</Button>
            <Button variant="danger" icon={Trash2}>Excluir</Button>
            <Button variant="primary" loading>Salvando</Button>
            <Button variant="primary" disabled>Desabilitado</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">sm</Button>
            <Button size="md">md</Button>
            <Button size="lg">lg</Button>
          </div>
        </Section>

        <Section title="Pill / Badge">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="pos" dot>Pago</Pill>
            <Pill tone="info" dot>Agendado</Pill>
            <Pill tone="warn" dot>Vence em 2 dias</Pill>
            <Pill tone="neg" dot>Vencido</Pill>
            <Pill tone="muted">Rascunho</Pill>
            <Badge status="entrada">Entrada</Badge>
            <Badge status="saida">Saída</Badge>
          </div>
        </Section>

        <Section title="Field / Input">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Descrição" hint="Como aparece no extrato">
              <Input placeholder="Assinatura de software" />
            </Field>
            <Field label="Valor">
              <MoneyInput value={money} onValueChange={setMoney} />
            </Field>
            <Field label="Vencimento" error="Data obrigatória">
              <Input type="date" />
            </Field>
          </div>
        </Section>

        <Section title="KpiTile">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiTile label="Entradas" value="R$ 218.430" valueTone="pos" delta="▲ 12,4% vs. ago" deltaTone="pos" icon={TrendingUp} />
            <KpiTile label="Saídas" value="R$ 154.902" valueTone="neg" delta="▲ 4,1% vs. ago" deltaTone="neg" />
            <KpiTile label="Resultado" value="R$ 63.528" delta="margem 29%" deltaTone="pos" />
            <KpiTile label="Saldo projetado" value="R$ 145.668" delta="31 set" />
          </div>
        </Section>

        <Section title="Table">
          <Card padding="none">
            <Table<Row>
              columns={[
                { key: "date", header: "Data" },
                { key: "desc", header: "Descrição" },
                { key: "cat", header: "Categoria" },
                { key: "status", header: "Status" },
                { key: "amount", header: "Valor", align: "right" },
              ]}
              rows={ROWS}
              renderCell={(r, k) =>
                k === "amount" ? (
                  <span style={{ color: r.tone === "pos" ? "var(--pos)" : "var(--neg)", fontWeight: 500 }}>{r.amount}</span>
                ) : k === "date" ? (
                  <span className="mono" style={{ color: "var(--text-muted)" }}>{r.date}</span>
                ) : (
                  (r as unknown as Record<string, React.ReactNode>)[k]
                )
              }
            />
          </Card>
        </Section>

        <Section title="EmptyState">
          <EmptyState
            icon={Inbox}
            title="Nenhuma movimentação neste mês"
            description="Lance a primeira entrada ou saída para ver o fluxo de caixa."
            action={<Button variant="primary" icon={Plus}>Novo lançamento</Button>}
          />
        </Section>

        <Section title="Modal">
          <Button variant="secondary" onClick={() => setModalOpen(true)}>Abrir modal</Button>
          <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Excluir lançamento?">
            <div className="flex flex-col gap-4 p-5">
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Esta saída de <span className="mono">R$ 1.290,00</span> será removida do fluxo de caixa.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
                <Button variant="danger" icon={Trash2} onClick={() => setModalOpen(false)}>Excluir</Button>
              </div>
            </div>
          </Modal>
        </Section>
      </div>
    </div>
  );
}
