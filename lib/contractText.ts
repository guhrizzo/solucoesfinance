// lib/contractText.ts
// Texto do Contrato de Licença de Uso de Software e Prestação de Serviços da
// NexusFi, como função PURA — sem React, sem jsPDF. Compartilhado pela prévia
// na tela (app/assinatura/contrato/page.tsx) e pela geração do PDF
// (lib/contractPdf.ts), pra que os dois nunca divirjam.
//
// ⚠️ Este texto é um TEMPLATE redigido por engenharia, não por advogado.
// Precisa de revisão jurídica antes de produção. Ao mudar o texto de forma
// relevante, incremente CONTRACT_VERSION em lib/contract.ts.

import { formatBRLFromCents, getPlan, type PlanId } from "./billingPlans";
import { REGIME_LABEL, type ContractContratante, type ContractSignatario } from "./contract";

// ─── Parte CONTRATADA (NexusFi) ─────────────────────────────────────────────
// Dados confirmados: CNPJ, logradouro/número, cidade/UF, CEP, representante
// legal. PENDÊNCIAS (placeholder — confirmar antes de produção):
//   • bairro da sede
//   • razão social exata conforme registro na Junta Comercial
//   • e-mail/telefone oficial de contato (omitidos nesta versão)
export const NEXUSFI_PARTY = {
  razaoSocial: "NexusFi ME", // TODO: confirmar razão social exata (Junta Comercial)
  cnpj: "68.919.873/0001-36",
  logradouro: "Rua Sebastião Miguel da Silva, nº 107",
  bairro: "[BAIRRO]", // TODO: confirmar bairro da sede
  cidadeUf: "São Paulo/SP",
  cep: "08280-350",
  representante: "Felipe Augusto de Jesus Paiva",
  representanteCpf: "392.149.348-00",
  foro: "Comarca de São Paulo, Estado de São Paulo",
} as const;

/** Endereço da CONTRATADA em linha única. */
export function nexusfiEnderecoLinha(): string {
  const p = NEXUSFI_PARTY;
  return `${p.logradouro}, ${p.bairro}, ${p.cidadeUf}, CEP ${p.cep}`;
}

export const ACEITE_LEGAL_BASIS =
  "A manifestação de vontade por meio do aceite eletrônico registrado neste " +
  "instrumento é válida e eficaz nos termos da Medida Provisória nº 2.200-2/2001 " +
  "e da legislação brasileira aplicável, dispensada a assinatura física.";

// ─── Estrutura renderizada ──────────────────────────────────────────────────

export interface ContractParties {
  contratante: ContractContratante;
  signatario: ContractSignatario;
  planId: PlanId;
  planLabel: string;
  priceCents: number;
}

export interface RenderedClause {
  heading: string;
  body: string[];
}

export interface RenderedContract {
  title: string;
  /** Qualificação das partes. */
  preamble: string[];
  clauses: RenderedClause[];
  /** Base legal do aceite eletrônico (rodapé, antes do bloco de assinatura). */
  legalBasis: string;
}

function prazoDias(planId: PlanId): number {
  return getPlan(planId)?.months === 12 ? 365 : 30;
}

/** Monta o texto completo do contrato a partir dos dados das partes. */
export function renderContractText(p: ContractParties): RenderedContract {
  const n = NEXUSFI_PARTY;
  const dias = prazoDias(p.planId);
  const valor = formatBRLFromCents(p.priceCents);
  const regime = REGIME_LABEL[p.contratante.regimeTributario];

  const preamble = [
    `Pelo presente instrumento particular, de um lado, ${n.razaoSocial}, ` +
      `pessoa jurídica de direito privado inscrita no CNPJ sob o nº ${n.cnpj}, ` +
      `com sede em ${nexusfiEnderecoLinha()}, neste ato representada na forma de ` +
      `seus atos constitutivos por ${n.representante}, inscrito no CPF sob o ` +
      `nº ${n.representanteCpf}, doravante denominada "CONTRATADA"; e, de outro lado, ` +
      `${p.contratante.razaoSocial}, inscrita no CNPJ sob o nº ${p.contratante.cnpj}, ` +
      `optante pelo regime tributário ${regime}, com endereço em ` +
      `${p.contratante.endereco}, neste ato representada por ${p.signatario.nome}, ` +
      `inscrito no CPF sob o nº ${p.signatario.cpf}, com e-mail ${p.signatario.email}, ` +
      `doravante denominada "CONTRATANTE";`,
    `resolvem as partes celebrar o presente Contrato de Licença de Uso de ` +
      `Software e Prestação de Serviços ("Contrato"), que se regerá pelas ` +
      `cláusulas e condições a seguir.`,
  ];

  const clauses: RenderedClause[] = [
    {
      heading: "Cláusula 1 — Do objeto",
      body: [
        `1.1. O objeto deste Contrato é a concessão, pela CONTRATADA à CONTRATANTE, ` +
          `de licença de uso não exclusiva, intransferível e temporária da ` +
          `plataforma de gestão financeira empresarial "NexusFi" ("Plataforma"), ` +
          `disponibilizada na modalidade software como serviço (SaaS), na ` +
          `configuração do Plano ${p.planLabel}.`,
        `1.2. A licença não implica cessão ou transferência de propriedade sobre ` +
          `a Plataforma, seu código-fonte, marcas ou quaisquer direitos de ` +
          `propriedade intelectual da CONTRATADA.`,
      ],
    },
    {
      heading: "Cláusula 2 — Do prazo e da vigência",
      body: [
        `2.1. Este Contrato entra em vigor na data da confirmação do pagamento e ` +
          `vigora pelo período correspondente ao Plano contratado: ${dias} (${
            dias === 365 ? "trezentos e sessenta e cinco" : "trinta"
          }) dias corridos.`,
        `2.2. O modelo de contratação é pré-pago, SEM renovação automática e SEM ` +
          `prazo de fidelidade. Cada novo pagamento estende o período de acesso ` +
          `pelo prazo do respectivo Plano, contado a partir do maior valor entre ` +
          `a data do pagamento e o término do período vigente.`,
        `2.3. Não havendo novo pagamento, o acesso é encerrado automaticamente ao ` +
          `fim do período vigente, sem incidência de multa.`,
      ],
    },
    {
      heading: "Cláusula 3 — Do preço e das condições de pagamento",
      body: [
        `3.1. Pela licença objeto deste Contrato, a CONTRATANTE pagará à ` +
          `CONTRATADA o valor de ${valor} por período do Plano ${p.planLabel}.`,
        `3.2. O pagamento é pré-pago e processado pela InfinitePay, por meio de ` +
          `Pix ou cartão de crédito, podendo o cartão ser parcelado conforme as ` +
          `condições oferecidas pelo processador, hipótese em que eventuais ` +
          `encargos de parcelamento são de responsabilidade da CONTRATANTE.`,
        `3.3. O acesso à Plataforma é liberado após a confirmação do pagamento ` +
          `pelo processador.`,
        `3.4. Os valores poderão ser reajustados pela CONTRATADA para contratações ` +
          `futuras, mediante comunicação prévia, não afetando períodos já pagos.`,
      ],
    },
    {
      heading: "Cláusula 4 — Do direito de arrependimento e do cancelamento",
      body: [
        `4.1. A CONTRATANTE poderá exercer o direito de arrependimento no prazo de ` +
          `7 (sete) dias corridos contados da data do aceite deste Contrato, nos ` +
          `termos do art. 49 do Código de Defesa do Consumidor, com direito à ` +
          `restituição integral do valor pago.`,
        `4.2. Após o prazo previsto na cláusula 4.1, a CONTRATANTE poderá cancelar ` +
          `a contratação a qualquer tempo, o que impedirá novas cobranças. Nesse ` +
          `caso, não há reembolso do período em curso, e o acesso é mantido até o ` +
          `término do período já pago.`,
        `4.3. As solicitações de arrependimento ou cancelamento são feitas pelos ` +
          `canais de atendimento da Plataforma ou pelo e-mail de contato da ` +
          `CONTRATADA.`,
      ],
    },
    {
      heading: "Cláusula 5 — Das obrigações da CONTRATADA",
      body: [
        `5.1. Disponibilizar a Plataforma em conformidade com a descrição do Plano ` +
          `contratado, empregando esforços comercialmente razoáveis para mantê-la ` +
          `disponível e funcional.`,
        `5.2. Adotar medidas técnicas e organizacionais razoáveis de segurança da ` +
          `informação para proteção dos dados hospedados na Plataforma.`,
        `5.3. Prestar suporte à CONTRATANTE pelos canais de atendimento indicados ` +
          `na Plataforma.`,
        `5.4. Comunicar à CONTRATANTE, com antecedência razoável sempre que ` +
          `possível, interrupções programadas para manutenção.`,
      ],
    },
    {
      heading: "Cláusula 6 — Das obrigações da CONTRATANTE",
      body: [
        `6.1. Utilizar a Plataforma de acordo com a legislação vigente e com os ` +
          `termos deste Contrato, abstendo-se de práticas que comprometam a ` +
          `segurança, a disponibilidade ou a integridade do serviço.`,
        `6.2. Manter em sigilo as credenciais de acesso, responsabilizando-se por ` +
          `todas as operações realizadas com o uso de suas credenciais.`,
        `6.3. Responsabilizar-se pela veracidade, exatidão e atualização das ` +
          `informações cadastrais fornecidas, incluindo razão social, CNPJ e ` +
          `regime tributário declarados neste Contrato, bem como pelos dados e ` +
          `informações que inserir na Plataforma.`,
        `6.4. Efetuar os pagamentos nas condições contratadas.`,
      ],
    },
    {
      heading: "Cláusula 7 — Da proteção de dados pessoais (LGPD)",
      body: [
        `7.1. As partes se comprometem a observar a Lei nº 13.709/2018 (Lei Geral ` +
          `de Proteção de Dados Pessoais — LGPD) no tratamento de dados pessoais ` +
          `relacionados a este Contrato.`,
        `7.2. No tratamento de dados pessoais inseridos pela CONTRATANTE na ` +
          `Plataforma, a CONTRATANTE atua como controladora e a CONTRATADA como ` +
          `operadora, realizando o tratamento conforme as instruções da ` +
          `CONTRATANTE e as finalidades de execução deste Contrato.`,
        `7.3. O tratamento de dados pessoais pela CONTRATADA observa a sua ` +
          `Política de Privacidade, disponível em /privacidade, que integra este ` +
          `Contrato para todos os fins.`,
      ],
    },
    {
      heading: "Cláusula 8 — Da propriedade intelectual",
      body: [
        `8.1. A Plataforma, incluindo seu código-fonte, arquitetura, layout, ` +
          `marcas, nomes e demais elementos, é de titularidade exclusiva da ` +
          `CONTRATADA, protegida pela legislação de propriedade intelectual.`,
        `8.2. É vedado à CONTRATANTE copiar, modificar, descompilar, realizar ` +
          `engenharia reversa, sublicenciar ou explorar comercialmente a ` +
          `Plataforma fora das condições deste Contrato.`,
        `8.3. Os dados inseridos pela CONTRATANTE permanecem de sua titularidade.`,
      ],
    },
    {
      heading: "Cláusula 9 — Da limitação de responsabilidade",
      body: [
        `9.1. A Plataforma é ferramenta de apoio à gestão financeira e NÃO ` +
          `substitui os serviços de contador, advogado ou assessoria contábil, ` +
          `fiscal ou jurídica. As decisões tomadas pela CONTRATANTE com base nas ` +
          `informações da Plataforma são de sua exclusiva responsabilidade.`,
        `9.2. A CONTRATADA não responde por indisponibilidades decorrentes de ` +
          `caso fortuito, força maior, falhas de terceiros (provedores de ` +
          `hospedagem, telecomunicações, meios de pagamento) ou uso indevido ` +
          `pela CONTRATANTE.`,
        `9.3. A responsabilidade total da CONTRATADA por perdas e danos ` +
          `relacionados a este Contrato fica limitada ao valor efetivamente pago ` +
          `pela CONTRATANTE nos 12 (doze) meses anteriores ao evento que deu ` +
          `origem à responsabilidade.`,
      ],
    },
    {
      heading: "Cláusula 10 — Da rescisão",
      body: [
        `10.1. Este Contrato pode ser rescindido por qualquer das partes em caso ` +
          `de descumprimento de obrigação contratual não sanado no prazo de 10 ` +
          `(dez) dias corridos contados de notificação por escrito.`,
        `10.2. O encerramento das atividades de qualquer das partes, a decretação ` +
          `de falência ou a insolvência civil também são causas de rescisão.`,
        `10.3. Rescindido o Contrato, cessa o direito de uso da Plataforma, ` +
          `observado o disposto na Cláusula 4 quanto a reembolsos.`,
      ],
    },
    {
      heading: "Cláusula 11 — Das disposições gerais",
      body: [
        `11.1. A CONTRATADA poderá alterar os termos deste Contrato, mediante ` +
          `comunicação à CONTRATANTE por e-mail com antecedência mínima de 30 ` +
          `(trinta) dias; a continuidade do uso após a vigência das alterações ` +
          `implica concordância.`,
        `11.2. As comunicações entre as partes serão consideradas válidas quando ` +
          `enviadas aos e-mails cadastrados.`,
        `11.3. A eventual nulidade ou invalidade de qualquer cláusula deste ` +
          `Contrato não prejudica as demais, que permanecem em pleno vigor.`,
        `11.4. A tolerância de uma parte quanto ao descumprimento de qualquer ` +
          `obrigação pela outra não implica novação ou renúncia de direito.`,
      ],
    },
    {
      heading: "Cláusula 12 — Do foro",
      body: [
        `12.1. As partes elegem o foro da ${n.foro}, com renúncia a qualquer ` +
          `outro, por mais privilegiado que seja, para dirimir as questões ` +
          `decorrentes deste Contrato.`,
      ],
    },
  ];

  return {
    title: "Contrato de Licença de Uso de Software e Prestação de Serviços — NexusFi",
    preamble,
    clauses,
    legalBasis: ACEITE_LEGAL_BASIS,
  };
}

/** Linha do bloco de aceite eletrônico, para exibição/PDF (só com acceptedAt). */
export function renderAceiteBloco(opts: {
  nome: string;
  cpf: string;
  email: string;
  acceptedAt: number;
  ip: string | null;
  hash: string;
  contractVersion: number;
}): string {
  const dt = new Date(opts.acceptedAt).toLocaleString("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
  });
  return (
    `Aceito eletronicamente em ${dt} por ${opts.nome}, CPF ${opts.cpf}, ` +
    `e-mail ${opts.email}${opts.ip ? `, a partir do IP ${opts.ip}` : ""}. ` +
    `Identificador do documento (SHA-256): ${opts.hash}. ` +
    `Versão do contrato: ${opts.contractVersion}. ${ACEITE_LEGAL_BASIS}`
  );
}
