// Categorias de lançamento do Fluxo de Caixa — fonte única compartilhada entre
// o formulário do Fluxo de Caixa (app/components/CashFlow.tsx) e a conciliação
// linha a linha do Fechamento de Caixa (app/relatorios/page.tsx). Assim o
// seletor de categoria de um lugar oferece exatamente as mesmas opções do outro.

export type TxType = "entrada" | "saida";

export const CASHFLOW_CATEGORIES: Record<TxType, string[]> = {
  entrada: ["Vendas", "Serviços prestados", "Recebimento de clientes", "Investimentos", "Outros recebimentos"],
  saida: ["Fornecedores", "Folha de pagamento", "Aluguel", "Impostos", "Marketing", "TI / Software", "Outros gastos"],
};
