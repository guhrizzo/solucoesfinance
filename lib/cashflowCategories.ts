// Categorias de lançamento do Fluxo de Caixa — fonte única compartilhada entre
// o formulário do Fluxo de Caixa (app/components/CashFlow.tsx) e a conciliação
// linha a linha do Fechamento de Caixa (app/relatorios/page.tsx). Assim o
// seletor de categoria de um lugar oferece exatamente as mesmas opções do outro.

export type TxType = "entrada" | "saida";

// ATENÇÃO ao nomear uma categoria de SAÍDA: o DRE (aba DRE de
// app/[locale]/relatorios) escolhe a linha por palavra-chave no nome —
// "imposto"/"taxa"/"tributo" cai em Impostos, "fornecedor"/"produto"/
// "mercadoria"/"compra" cai em CMV, e todo o resto cai em Despesas. Por isso as
// subcategorias de tributo começam com "Impostos ..." e as de custo com
// "Compra de ...": é o que faz cada uma somar na linha certa do DRE.
export const CASHFLOW_CATEGORIES: Record<TxType, string[]> = {
  entrada: [
    "Vendas",
    "Vendas Mercado Livre",
    "Vendas Shopee",
    "Vendas TikTok Shop",
    "Serviços prestados",
    "Recebimento de clientes",
    "Adiantamento de clientes",
    "Antecipação de recebíveis",
    "Aluguéis recebidos",
    "Rendimentos financeiros",
    "Resgate de investimento",
    "Investimentos",
    "Aporte de sócios",
    "Empréstimos recebidos",
    "Venda de imobilizado",
    "Juros / Multas recebidos",
    "Restituição de impostos",
    "Subvenções / Incentivos fiscais",
    "Cashback / Bonificações",
    "Estorno / Reembolso",
    "Outros recebimentos",
    "Transferência mesma titularidade",
  ],
  saida: [
    "Fornecedores",
    "Compra de mercadorias",
    "Compra de matéria-prima",
    "Embalagens",
    "Serviços de terceiros",
    "Comissões de vendas",
    "Folha de pagamento",
    "Encargos sociais (FGTS / INSS)",
    "Benefícios (VT / VR / Saúde)",
    "Férias / 13º salário",
    "Rescisões trabalhistas",
    "Treinamento / Capacitação",
    "Pró-labore",
    "Retirada de lucros / Dividendos",
    "Aluguel",
    "Condomínio / IPTU",
    "Energia / Água / Internet",
    "Limpeza / Conservação",
    "Material de escritório",
    "Manutenção",
    "Transporte / Frete",
    "Combustível",
    "Viagens / Hospedagem",
    "Alimentação / Refeições",
    "Marketing",
    "TI / Software",
    "Contabilidade / Honorários",
    "Jurídico / Advogados",
    "Consultorias",
    "Seguros",
    "Impostos",
    "Impostos Simples Nacional (DAS)",
    "Impostos federais (IRPJ / CSLL)",
    "Impostos estaduais (ICMS)",
    "Impostos municipais (ISS)",
    "Impostos sobre vendas (PIS / COFINS)",
    "IOF / Tributos financeiros",
    "Taxas bancárias",
    "Tarifas de cartão / Adquirente",
    "Taxas Marketplace",
    "Juros / Multas pagos",
    "Empréstimos / Financiamentos",
    "Aplicação financeira",
    "Outros gastos",
    "Transferência mesma titularidade",
  ],
};

/** Movimentação entre contas do próprio titular — não é receita nem despesa,
 *  então fica de fora do DRE (segue aparecendo no Fluxo de Caixa e demais abas). */
export const SAME_OWNER_TRANSFER_CATEGORY = "Transferência mesma titularidade";

/** Normaliza pra casar texto digitado à mão: sem acento, sem espaço nas
 *  pontas, minúscula. */
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** Compara sem diferenciar maiúsculas/acentos, pra pegar variações digitadas
 *  à mão (categoria livre) além do valor fixo da lista. */
export function isSameOwnerTransfer(category: string): boolean {
  return norm(category) === norm(SAME_OWNER_TRANSFER_CATEGORY);
}

/** Resgate de aplicação — "Resgate", "Resgate de investimento", "resgate
 *  automático" etc. É o dinheiro do próprio titular voltando pra conta, então
 *  não é gasto: fica de fora do Relatório de Gastos (aba Gastos de
 *  app/[locale]/relatorios). Segue aparecendo no Fluxo de Caixa, no DRE e nas
 *  demais abas.
 *
 *  Casa por TERMO (e não por categoria fixa) porque o resgate chega tanto como
 *  categoria livre quanto só na descrição vinda da importação de extrato. */
export function isRedemption(category: string, description = ""): boolean {
  return norm(`${category} ${description}`).includes("resgate");
}

// Sentinela usada nos <select> de categoria. Quando escolhida, a UI troca por
// um input livre e o valor salvo passa a ser o texto que o usuário digitar.
export const CUSTOM_CATEGORY = "__custom__";

/** true quando `category` não está na lista fixa do tipo — ou seja, é um texto
 *  livre digitado pelo usuário (ou um valor legado de antes desta lista). */
export function isCustomCategory(category: string, type: TxType): boolean {
  return !!category && !CASHFLOW_CATEGORIES[type].includes(category);
}

// ─── i18n ─────────────────────────────────────────────────────────────────────
// O VALOR das categorias acima é o que fica GRAVADO no Firestore (`tx.category`)
// e o que costCenterSync/relatorios/dashboard casam por string — NÃO traduzir.
// Só a exibição é traduzida: cada valor tem uma `key` estável que indexa
// messages/*/categories.json.
export const CATEGORY_KEY: Record<string, string> = {
  "Vendas": "vendas",
  "Vendas Mercado Livre": "vendasML",
  "Vendas Shopee": "vendasShopee",
  "Vendas TikTok Shop": "vendasTikTok",
  "Serviços prestados": "servicosPrestados",
  "Recebimento de clientes": "recebimentoClientes",
  "Adiantamento de clientes": "adiantamentoClientes",
  "Antecipação de recebíveis": "antecipacaoRecebiveis",
  "Aluguéis recebidos": "alugueisRecebidos",
  "Rendimentos financeiros": "rendimentosFinanceiros",
  "Resgate de investimento": "resgateInvestimento",
  "Investimentos": "investimentos",
  "Aporte de sócios": "aporteSocios",
  "Empréstimos recebidos": "emprestimosRecebidos",
  "Venda de imobilizado": "vendaImobilizado",
  "Juros / Multas recebidos": "jurosMultasRecebidos",
  "Restituição de impostos": "restituicaoImpostos",
  "Subvenções / Incentivos fiscais": "subvencoesIncentivos",
  "Cashback / Bonificações": "cashbackBonificacoes",
  "Estorno / Reembolso": "estornoReembolso",
  "Outros recebimentos": "outrosRecebimentos",
  "Transferência mesma titularidade": "transferenciaMesmaTitularidade",
  "Fornecedores": "fornecedores",
  "Compra de mercadorias": "compraMercadorias",
  "Compra de matéria-prima": "compraMateriaPrima",
  "Embalagens": "embalagens",
  "Serviços de terceiros": "servicosTerceiros",
  "Comissões de vendas": "comissoesVendas",
  "Folha de pagamento": "folhaPagamento",
  "Encargos sociais (FGTS / INSS)": "encargosSociais",
  "Benefícios (VT / VR / Saúde)": "beneficios",
  "Férias / 13º salário": "feriasDecimoTerceiro",
  "Rescisões trabalhistas": "rescisoesTrabalhistas",
  "Treinamento / Capacitação": "treinamentoCapacitacao",
  "Pró-labore": "proLabore",
  "Retirada de lucros / Dividendos": "retiradaLucros",
  "Aluguel": "aluguel",
  "Condomínio / IPTU": "condominioIptu",
  "Energia / Água / Internet": "energiaAguaInternet",
  "Limpeza / Conservação": "limpezaConservacao",
  "Material de escritório": "materialEscritorio",
  "Manutenção": "manutencao",
  "Transporte / Frete": "transporteFrete",
  "Combustível": "combustivel",
  "Viagens / Hospedagem": "viagensHospedagem",
  "Alimentação / Refeições": "alimentacaoRefeicoes",
  "Marketing": "marketing",
  "TI / Software": "tiSoftware",
  "Contabilidade / Honorários": "contabilidadeHonorarios",
  "Jurídico / Advogados": "juridicoAdvogados",
  "Consultorias": "consultorias",
  "Seguros": "seguros",
  "Impostos": "impostos",
  "Impostos Simples Nacional (DAS)": "impostosSimplesNacional",
  "Impostos federais (IRPJ / CSLL)": "impostosFederais",
  "Impostos estaduais (ICMS)": "impostosEstaduais",
  "Impostos municipais (ISS)": "impostosMunicipais",
  "Impostos sobre vendas (PIS / COFINS)": "impostosVendas",
  "IOF / Tributos financeiros": "iofTributosFinanceiros",
  "Taxas bancárias": "taxasBancarias",
  "Tarifas de cartão / Adquirente": "tarifasCartao",
  "Taxas Marketplace": "taxasMarketplace",
  "Juros / Multas pagos": "jurosMultasPagos",
  "Empréstimos / Financiamentos": "emprestimosFinanciamentos",
  "Aplicação financeira": "aplicacaoFinanceira",
  "Outros gastos": "outrosGastos",
};

/**
 * Rótulo traduzido de uma categoria. `storedValue` é o que está no Firestore;
 * categoria customizada / legada (sem key) é exibida como está.
 * `t` deve ser um `useTranslations("categories")` (ou `getTranslations`).
 */
export function categoryLabel(storedValue: string, t: (key: string) => string): string {
  const key = CATEGORY_KEY[storedValue];
  return key ? t(key) : storedValue;
}
