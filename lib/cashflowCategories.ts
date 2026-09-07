// Categorias de lançamento do Fluxo de Caixa — fonte única compartilhada entre
// o formulário do Fluxo de Caixa (app/components/CashFlow.tsx) e a conciliação
// linha a linha do Fechamento de Caixa (app/relatorios/page.tsx). Assim o
// seletor de categoria de um lugar oferece exatamente as mesmas opções do outro.

export type TxType = "entrada" | "saida";

export const CASHFLOW_CATEGORIES: Record<TxType, string[]> = {
  entrada: [
    "Vendas",
    "Vendas Mercado Livre",
    "Vendas Shopee",
    "Serviços prestados",
    "Recebimento de clientes",
    "Rendimentos financeiros",
    "Investimentos",
    "Aporte de sócios",
    "Empréstimos recebidos",
    "Estorno / Reembolso",
    "Transferência mesma titularidade",
  ],
  saida: [
    "Fornecedores",
    "Folha de pagamento",
    "Pró-labore",
    "Aluguel",
    "Energia / Água / Internet",
    "Transporte / Frete",
    "Manutenção",
    "Marketing",
    "TI / Software",
    "Impostos",
    "Taxas bancárias",
    "Taxas Marketplace",
    "Empréstimos / Financiamentos",
    "Transferência mesma titularidade",
  ],
};

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
  "Serviços prestados": "servicosPrestados",
  "Recebimento de clientes": "recebimentoClientes",
  "Rendimentos financeiros": "rendimentosFinanceiros",
  "Investimentos": "investimentos",
  "Aporte de sócios": "aporteSocios",
  "Empréstimos recebidos": "emprestimosRecebidos",
  "Estorno / Reembolso": "estornoReembolso",
  "Transferência mesma titularidade": "transferenciaMesmaTitularidade",
  "Fornecedores": "fornecedores",
  "Folha de pagamento": "folhaPagamento",
  "Pró-labore": "proLabore",
  "Aluguel": "aluguel",
  "Energia / Água / Internet": "energiaAguaInternet",
  "Transporte / Frete": "transporteFrete",
  "Manutenção": "manutencao",
  "Marketing": "marketing",
  "TI / Software": "tiSoftware",
  "Impostos": "impostos",
  "Taxas bancárias": "taxasBancarias",
  "Taxas Marketplace": "taxasMarketplace",
  "Empréstimos / Financiamentos": "emprestimosFinanciamentos",
  // Valores fora de CASHFLOW_CATEGORIES que a normalização da importação por IA
  // pode produzir — mapeados só pra exibição.
  "Outros recebimentos": "outrosRecebimentos",
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
