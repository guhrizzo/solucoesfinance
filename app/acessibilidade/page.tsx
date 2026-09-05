import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Declaração de Acessibilidade — NexusFi",
  description:
    "Compromisso da NexusFi com a acessibilidade digital (WCAG 2.1 AA), o que já foi feito, o que está em andamento e como reportar uma barreira.",
};

const UPDATED = "4 de setembro de 2026 (revisão pós-auditoria da área logada)";
const CONTACT_EMAIL = "privacidade@nexusfi.com.br";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="font-heading text-lg font-semibold text-[var(--text)]">
        {title}
      </h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-[var(--text-muted)]">
        {children}
      </div>
    </section>
  );
}

export default function AcessibilidadePage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--brand)]"
      >
        <ArrowLeft size={15} />
        Voltar
      </Link>

      <h1 className="font-heading mt-6 text-2xl font-bold text-[var(--text)] sm:text-3xl">
        Declaração de Acessibilidade
      </h1>
      <p className="mt-2 text-xs text-[var(--text-subtle)]">
        Última atualização: {UPDATED}
      </p>

      <p className="mt-6 text-sm leading-relaxed text-[var(--text-muted)]">
        A NexusFi está trabalhando para que sua plataforma — o site público e
        a área logada — seja utilizável por qualquer pessoa, incluindo quem
        usa leitor de tela, navega só por teclado, ou depende de outras
        tecnologias assistivas. Isso segue o espírito da{" "}
        <strong className="font-semibold text-[var(--text)]">
          Lei Brasileira de Inclusão (Lei nº 13.146/2015)
        </strong>
        , que trata acessibilidade digital como parte do direito de acesso à
        informação e à comunicação.
      </p>

      <Section title="Padrão que seguimos">
        <p>
          Usamos como referência técnica as{" "}
          <strong className="font-semibold text-[var(--text)]">
            Web Content Accessibility Guidelines (WCAG) 2.1, nível AA
          </strong>{" "}
          — o padrão internacional mais usado para acessibilidade web e base
          do eMAG (Modelo de Acessibilidade em Governo Eletrônico) e da ABNT
          NBR 17225 no Brasil.
        </p>
      </Section>

      <Section title="O que já foi feito">
        <p>
          Este trabalho foi entregue em fases, cobrindo o site público
          (landing, cadastro, login, política de privacidade) e a área
          logada inteira (dashboard, fluxo de caixa, contas a pagar/receber,
          centro de custos, estoque, painel de vendas, impostos, relatórios
          e configurações):
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Navegação completa por teclado em tabelas, cartões, menus e
            filtros que antes só respondiam ao mouse, com indicador de foco
            visível em toda a plataforma.
          </li>
          <li>
            Janelas e diálogos (modais) — incluindo os quatro modais
            principais de cadastro (contas a pagar, contas a receber,
            impostos e centro de custos) — anunciam seu papel e título pra
            leitor de tela, prendem o foco enquanto abertos e devolvem o
            foco exatamente pra quem os abriu ao fechar, incluindo fechar
            pela tecla Esc.
          </li>
          <li>
            Todo botão que só tem ícone (fechar, editar, excluir, navegar
            entre fotos, alternar tema, menu da conta, etc.) tem um nome
            acessível — mais de 30 corrigidos ao longo da auditoria — e
            menus suspensos informam se estão abertos ou fechados.
          </li>
          <li>
            Formulários de cadastro, login e das telas financeiras com
            rótulos ligados corretamente aos campos (inclusive grupos de
            opções, com <code>fieldset</code>/<code>legend</code>).
          </li>
          <li>
            Link de &ldquo;Pular para o conteúdo&rdquo;, visível ao navegar por teclado,
            pra pular o menu repetido em toda página, com o foco realmente
            indo pro conteúdo (não só a rolagem da página).
          </li>
          <li>
            Ordem de títulos (H1 → H2 → H3) corrigida nas páginas onde
            pulava um nível, sem mudar a aparência visual.
          </li>
          <li>
            Os dois gráficos financeiros desenhados à mão no dashboard têm
            uma alternativa em tabela (oculta visualmente, disponível pra
            leitor de tela) com os mesmos valores mês a mês.
          </li>
          <li>
            Redução de animações controlada por você — não pelo sistema
            operacional —, em Configurações → Aparência, com opção
            &ldquo;Reduzido&rdquo; que zera transições e desliga a rolagem suave.
          </li>
          <li>
            Aviso de cookies em versão compacta, com opção de expandir pra
            ver todas as categorias antes de decidir.
          </li>
          <li>
            Contraste de cor verificado com medição real (não só visual) em
            todos os textos das telas revisadas, incluindo os tokens de cor
            compartilhados por toda a plataforma — dois problemas de
            contraste insuficiente encontrados nessa medição já foram
            corrigidos.
          </li>
          <li>
            Checagem automática (lint com <code>eslint-plugin-jsx-a11y</code>)
            que passa a barrar, antes de ir pro ar, os tipos de problema de
            acessibilidade encontrados nesta auditoria — hoje já cobrindo a
            maior parte das páginas da área logada, com o restante do
            repositório entrando aos poucos.
          </li>
        </ul>
      </Section>

      <Section title="Limitações conhecidas">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Relatórios exportados em PDF ainda não foram auditados.</li>
          <li>
            Dois modais secundários (edição de centro de custo dentro de
            Centro de Custos, e os modais auxiliares de Estoque) ainda não
            têm o mesmo tratamento completo de diálogo acessível dos quatro
            modais principais — continuam utilizáveis por mouse e teclado,
            mas sem a mesma prontidão para leitor de tela.
          </li>
          <li>
            O teste com leitor de tela foi feito por inspeção da árvore de
            acessibilidade e dos atributos ARIA, não com um leitor de tela
            real (NVDA/Narrador) rodando ponta a ponta.
          </li>
          <li>
            Algumas páginas fora do escopo desta rodada (Usuários, área de
            desenvolvedor, assinatura, design system) ainda não foram
            auditadas.
          </li>
        </ul>
      </Section>

      <Section title="Como reportar uma barreira">
        <p>
          Se você encontrar algo na NexusFi que não conseguiu usar por causa
          de uma barreira de acessibilidade, escreva pra gente em{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="font-semibold text-[var(--brand)] underline underline-offset-2"
          >
            {CONTACT_EMAIL}
          </a>
          , descrevendo a página, o que você tentou fazer e, se possível, a
          tecnologia assistiva usada. Vamos avaliar e responder.
        </p>
      </Section>
    </main>
  );
}
