// lib/midas/interpret.ts
// Interpretador de texto livre do Midas: dicionario combinado pt/en/es.
// Sem dependencias; regex simples (sem quantificadores aninhados).
import type { Segment, Pain, Tool } from "@/lib/midas/types.ts";

export interface Interpretation {
  segment?: Segment;
  pain?: Pain;
  tool?: Tool;
  visibilityGap?: boolean;
  wantsOverview?: boolean;
  yes?: boolean;
  no?: boolean;
  empty: boolean;
}

const MAX_LEN = 800;

function normalize(text: string): string {
  return String(text ?? "")
    .slice(0, MAX_LEN)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function firstMatch<T extends string>(s: string, table: [T, RegExp][]): T | undefined {
  for (const [value, re] of table) if (re.test(s)) return value;
  return undefined;
}

const SEGMENTS: [Segment, RegExp][] = [
  ["ecommerce", /\b(mercado livre|mercadolivre|shopee|amazon|shein|tiktok|e-?commerce|loja virtual|loja online|online store|marketplace|marketplaces|tienda en linea|tienda virtual|dropshipping|nuvemshop|shopify)\b/],
  ["distribuidora", /\b(distribuidora|distribuidor|atacado|atacadista|wholesale|distributor|distribuidora|mayorista|distribucion)\b/],
  ["industria", /\b(industria|industrial|fabrica|fabricacao|manufactur\w*|factory|fabricamos|fabricante|manufacturing)\b/],
  ["servicos", /\b(servicos?|prestador|consultoria|consultor|agencia|clinica|escritorio|freelancer?|services?|consulting|agency|servicio|servicios|despacho)\b/],
  ["loja", /\b(loja|lojinha|comercio|varejo|boutique|mercadinho|padaria|restaurante|lanchonete|shop|store|retail|tienda|negocio fisico|comercio local)\b/],
];

const PAINS: [Pain, RegExp][] = [
  ["estoque", /\b(estoque|inventario|inventory|stock|existencias|almoxarifado)\b/],
  ["contas", /\b(contas a pagar|contas a receber|boletos?|cobranca|cobrancas|inadimplen\w*|fornecedores?|bills|invoices|receivables|payables|cuentas por pagar|cuentas por cobrar|facturas)\b/],
  ["impostos", /\b(impostos?|tributos?|nota fiscal|notas fiscais|nfs?-?e?|simples nacional|guia do das|das mei|das simples|taxes|tax|impuestos)\b/],
  ["relatorios", /\b(relatorios?|dre|reports?|reportes?|informes?|indicadores|kpis?)\b/],
  ["canais", /\b(canais|canal de venda|integrar|integracao|integracoes|channels|integration|canales|integracion)\b/],
  ["vendas", /\b(vendas|vender|pdv|frente de caixa|sales|selling|ventas|vender mais|clientes?)\b/],
  ["financeiro", /\b(fluxo de caixa|financeiro|financas|caixa|lucro|lucros|dinheiro|cash flow|finances|profit|money|flujo de caja|finanzas|ganancia|dinero)\b/],
  ["tudo", /\b(tudo|todos|tudo isso|everything|all of it|todo|todas)\b/],
];

const TOOLS: [Tool, RegExp][] = [
  ["planilha", /\b(excel|planilhas?|google sheets|sheets|spreadsheets?|hoja de calculo|hojas de calculo|calc)\b/],
  ["marketplace", /\b(painel do (mercado livre|shopee|marketplace)|so o painel|only the marketplace panel)\b/],
  ["caderno", /\b(caderno|papel|agenda|anotacao|anotacoes|anoto|notebook|paper|notes by hand|cuaderno|libreta|anoto a mano)\b/],
  ["app_banco", /\b(app do banco|aplicativo do banco|extrato|internet banking|bank app|banking app|app del banco|nubank|inter)\b/],
  ["sistema", /\b(sistema|erp|software|bling|tiny|omie|conta azul|contaazul|sistem[ao]s?|system|sistema propio)\b/],
  ["memoria", /\b(na cabeca|de cabeca|memoria|memorizo|in my head|from memory|by memory|en la cabeza|de memoria|mentalmente)\b/],
  ["contagem", /\b(contagem|conto|contando|conto na mao|contagem manual|count by hand|counting|manual count|conteo|contar a mano)\b/],
  ["nenhum", /\b(nenhum|nenhuma|nada|nao uso nada|nao tenho nada|nothing|none|ninguno|ninguna|no uso nada)\b/],
];

const VISIBILITY: RegExp[] = [
  /\bnao sei (quanto|se|o quanto) (ganho|gasto|lucro|sobra|entra|sai|tenho)/,
  /\bnao sei (quanto )?(ganho|gasto|lucro)/,
  /\bnem sei (quanto|se)\b/,
  /\bsem (saber|ideia|controle|visao)\b/,
  /\bnao tenho (controle|visao|nocao)\b/,
  /\bi (don'?t|do not) know how much\b/,
  /\bno idea (how much|where)\b/,
  /\bno se (cuanto|si)\b/,
  /\bno tengo (control|idea|vision)\b/,
];

const OVERVIEW = /\b(tudo|visao geral|geral|todos os modulos|todas as funcoes|ver tudo|mostra tudo|overview|everything|show me all|resumen|todo)\b/;
const YES = new Set(["sim", "s", "ss", "claro", "quero", "bora", "vamos", "pode", "ok", "okay", "yes", "y", "yep", "yeah", "sure", "si", "dale", "vale", "perfecto", "isso", "certo", "com certeza", "positivo", "uhum", "aham"]);
const NO = new Set(["nao", "n", "nop", "nope", "no", "agora nao", "nada", "depois", "talvez depois", "not now", "ahora no", "negativo"]);

export function interpret(text: string): Interpretation {
  const s = normalize(text);
  const empty = !/[\p{L}\p{N}]/u.test(s);
  if (empty) return { empty: true };

  const out: Interpretation = { empty: false };

  const segment = firstMatch(s, SEGMENTS);
  if (segment) out.segment = segment;

  const tool = firstMatch(s, TOOLS);
  if (tool) out.tool = tool;

  const pain = firstMatch(s, PAINS);
  if (pain) out.pain = pain;
  if (VISIBILITY.some((re) => re.test(s))) {
    out.visibilityGap = true;
    if (!pain) out.pain = "financeiro";
  }

  if (OVERVIEW.test(s)) out.wantsOverview = true;

  const bare = s.replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();
  const words = bare.split(" ");
  if (words.length <= 3) {
    const negated = NO.has(bare) || words.some((w) => w === "nao" || w === "no" || w === "not");
    if (negated) out.no = true;
    else if (YES.has(bare) || YES.has(words[0])) out.yes = true;
  }

  return out;
}
