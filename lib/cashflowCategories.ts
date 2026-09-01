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
