import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { ArrowLeft } from "lucide-react";
import { CATEGORY_INFO } from "@/lib/consent";
import { CookiePreferencesButton } from "./CookiePreferencesButton";

export const metadata: Metadata = {
  title: "Política de Privacidade — NexusFi",
  description:
    "Como a NexusFi coleta, usa e protege seus dados pessoais, em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).",
};

const UPDATED = "3 de setembro de 2026";
const DPO_EMAIL = "privacidade@nexusfi.com.br";

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

export default function PrivacidadePage() {
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
        Política de Privacidade
      </h1>
      <p className="mt-2 text-xs text-[var(--text-subtle)]">
        Última atualização: {UPDATED}
      </p>

      <p className="mt-6 text-sm leading-relaxed text-[var(--text-muted)]">
        Esta Política explica como a NexusFi trata os dados pessoais de quem usa
        a plataforma, em conformidade com a{" "}
        <strong className="font-semibold text-[var(--text)]">
          Lei Geral de Proteção de Dados Pessoais (LGPD — Lei nº 13.709/2018)
        </strong>
        . Ao usar o NexusFi, você declara estar ciente das práticas descritas
        aqui.
      </p>

      <Section title="1. Quem é o controlador dos dados">
        <p>
          O controlador é a NexusFi, responsável pelas decisões sobre o
          tratamento dos seus dados pessoais. Para qualquer assunto relacionado a
          privacidade e proteção de dados, incluindo o exercício dos seus
          direitos, o contato do nosso Encarregado (DPO) é{" "}
          <a
            href={`mailto:${DPO_EMAIL}`}
            className="font-semibold text-[var(--brand)] underline underline-offset-2"
          >
            {DPO_EMAIL}
          </a>
          .
        </p>
      </Section>

      <Section title="2. Quais dados coletamos">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="font-semibold text-[var(--text)]">
              Dados de cadastro:
            </strong>{" "}
            nome, e-mail, senha (armazenada de forma criptografada) e dados da
            empresa que você informa.
          </li>
          <li>
            <strong className="font-semibold text-[var(--text)]">
              Dados de uso da plataforma:
            </strong>{" "}
            os lançamentos financeiros, contas, categorias, notas fiscais,
            informações de estoque e demais registros que você insere no sistema.
          </li>
          <li>
            <strong className="font-semibold text-[var(--text)]">
              Dados técnicos:
            </strong>{" "}
            endereço IP, tipo de dispositivo e navegador, e identificadores de
            sessão, coletados automaticamente por motivos de segurança e
            funcionamento.
          </li>
          <li>
            <strong className="font-semibold text-[var(--text)]">
              Dados de integrações que você conecta:
            </strong>{" "}
            quando você autoriza integrações (ex.: Mercado Livre, Shopee),
            recebemos dados de vendas e repasses dessas plataformas.
          </li>
        </ul>
      </Section>

      <Section title="3. Para que usamos os dados e com qual base legal">
        <p>Tratamos seus dados pessoais para as seguintes finalidades:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="font-semibold text-[var(--text)]">
              Fornecer e operar a plataforma
            </strong>{" "}
            (criar sua conta, autenticar o acesso, salvar seus lançamentos,
            gerar relatórios) — base legal:{" "}
            <em>execução de contrato</em> (art. 7º, V).
          </li>
          <li>
            <strong className="font-semibold text-[var(--text)]">
              Segurança e prevenção a fraudes
            </strong>{" "}
            (registros de auditoria, controle de acesso por PIN, limitação de
            requisições) — base legal:{" "}
            <em>legítimo interesse</em> (art. 7º, IX) e{" "}
            <em>cumprimento de obrigação legal</em> (art. 7º, II).
          </li>
          <li>
            <strong className="font-semibold text-[var(--text)]">
              Comunicações operacionais
            </strong>{" "}
            (e-mails de redefinição de senha, convites de equipe, avisos sobre
            chamados de suporte e cobrança) — base legal:{" "}
            <em>execução de contrato</em> (art. 7º, V).
          </li>
          <li>
            <strong className="font-semibold text-[var(--text)]">
              Cobrança da assinatura
            </strong>{" "}
            — base legal: <em>execução de contrato</em> (art. 7º, V) e{" "}
            <em>obrigação legal/fiscal</em> (art. 7º, II).
          </li>
          <li>
            <strong className="font-semibold text-[var(--text)]">
              Lembrar preferências e analisar o uso de forma agregada
            </strong>{" "}
            para melhorar o produto — base legal:{" "}
            <em>consentimento</em> (art. 7º, I), que você pode retirar a qualquer
            momento nas preferências de cookies.
          </li>
        </ul>
      </Section>

      <Section title="4. Cookies e tecnologias semelhantes">
        <p>
          Usamos cookies e o armazenamento local do navegador
          (<code>localStorage</code>) nas seguintes categorias:
        </p>
        <ul className="space-y-2 pl-0">
          {(
            ["essential", "preferences", "analytics"] as const
          ).map((cat) => (
            <li
              key={cat}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
            >
              <span className="block text-xs font-semibold text-[var(--text)]">
                {CATEGORY_INFO[cat].label}
                {CATEGORY_INFO[cat].required && (
                  <span className="ml-1.5 font-normal text-[var(--text-subtle)]">
                    (sempre ativos)
                  </span>
                )}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-[var(--text-muted)]">
                {CATEGORY_INFO[cat].description}
              </span>
            </li>
          ))}
        </ul>
        <p>
          Você decide sobre as categorias opcionais no banner exibido na primeira
          visita e pode revisar sua escolha quando quiser:
        </p>
        <CookiePreferencesButton />
      </Section>

      <Section title="5. Com quem compartilhamos">
        <p>
          Não vendemos seus dados. Compartilhamos o mínimo necessário com
          prestadores que operam a infraestrutura do serviço, na condição de
          operadores:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="font-semibold text-[var(--text)]">
              Google Firebase / Google Cloud
            </strong>{" "}
            — autenticação, banco de dados e hospedagem.
          </li>
          <li>
            <strong className="font-semibold text-[var(--text)]">Resend</strong>{" "}
            — envio de e-mails transacionais.
          </li>
          <li>
            <strong className="font-semibold text-[var(--text)]">
              InfinitePay
            </strong>{" "}
            — processamento dos pagamentos da assinatura.
          </li>
          <li>
            <strong className="font-semibold text-[var(--text)]">
              Mercado Livre e Shopee
            </strong>{" "}
            — apenas quando você conecta essas integrações.
          </li>
        </ul>
        <p>
          Também podemos compartilhar dados para cumprir ordem judicial ou
          obrigação legal.
        </p>
      </Section>

      <Section title="6. Transferência internacional">
        <p>
          Alguns desses prestadores processam dados fora do Brasil. Nesses casos,
          adotamos salvaguadas contratuais e exigimos padrões de proteção
          compatíveis com a LGPD.
        </p>
      </Section>

      <Section title="7. Por quanto tempo guardamos">
        <p>
          Mantemos seus dados enquanto sua conta estiver ativa. Após o
          encerramento, os dados são eliminados ou anonimizados em prazo
          razoável, exceto quando a retenção for necessária para cumprir
          obrigação legal, fiscal ou para exercício de direitos em processo.
        </p>
      </Section>

      <Section title="8. Seus direitos como titular">
        <p>
          A LGPD (art. 18) garante a você o direito de solicitar, a qualquer
          momento:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>confirmação da existência de tratamento e acesso aos dados;</li>
          <li>correção de dados incompletos, inexatos ou desatualizados;</li>
          <li>
            anonimização, bloqueio ou eliminação de dados desnecessários ou
            tratados em desconformidade;
          </li>
          <li>portabilidade dos dados a outro fornecedor;</li>
          <li>
            eliminação dos dados tratados com base no consentimento;
          </li>
          <li>
            informação sobre com quem compartilhamos seus dados;
          </li>
          <li>
            revogação do consentimento.
          </li>
        </ul>
        <p>
          Para exercer qualquer um desses direitos, escreva para{" "}
          <a
            href={`mailto:${DPO_EMAIL}`}
            className="font-semibold text-[var(--brand)] underline underline-offset-2"
          >
            {DPO_EMAIL}
          </a>
          . Você também pode apresentar reclamação à Autoridade Nacional de
          Proteção de Dados (ANPD).
        </p>
      </Section>

      <Section title="9. Segurança">
        <p>
          Adotamos medidas técnicas e organizacionais para proteger seus dados,
          incluindo criptografia em trânsito, controle de acesso, registros de
          auditoria e regras de autorização por conta. Nenhum sistema é
          totalmente imune a incidentes; caso ocorra algum que traga risco
          relevante a você, comunicaremos conforme a LGPD.
        </p>
      </Section>

      <Section title="10. Alterações nesta Política">
        <p>
          Podemos atualizar esta Política. Quando a mudança for relevante,
          avisaremos pela plataforma ou por e-mail e, quando aplicável,
          pediremos seu consentimento novamente.
        </p>
      </Section>

      <p className="mt-10 text-xs text-[var(--text-subtle)]">
        Dúvidas sobre privacidade? Fale com{" "}
        <a
          href={`mailto:${DPO_EMAIL}`}
          className="font-semibold text-[var(--brand)] underline underline-offset-2"
        >
          {DPO_EMAIL}
        </a>
        .
      </p>
    </main>
  );
}
