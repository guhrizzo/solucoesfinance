// lib/accountScope.ts
// ─── Multi-usuário: dono da conta vs. membro convidado com permissão por
// categoria ──────────────────────────────────────────────────────────────
//
// Modelo de dados (Firestore):
//   users/{uid}/profile/access — resolve, pra QUALQUER uid logado, de quem
//     são os dados que ele deve enxergar:
//       - Documento ausente  → esse uid é o próprio dono ("owner"), acesso
//         total. É o caso de toda conta criada antes desta feature existir
//         (e de qualquer dono novo) — sem migração nenhuma necessária.
//       - Documento presente → { ownerId, role: "member", permissions[],
//         email, displayName, createdAt }. `ownerId` é o uid cujos dados
//         (costCenters, expenses, users/{ownerId}/cashflow, /bills, /taxes,
//         /receivables, etc.) esse membro deve ler/escrever.
//   users/{ownerId}/team/{memberUid} — espelho pro dono listar/editar sua
//     equipe sem precisar de uma collection-group query.
//
// "O admin é a conta que estava logada na hora que a conta foi comprada" —
// na prática isso é simplesmente QUALQUER conta que nunca foi convidada por
// ninguém (sem doc em profile/access): ela é sempre dona dos próprios dados,
// e é ela quem cria e permissiona as contas dos demais.

export const PERMISSION_CATEGORIES = [
  { key: "dashboard", label: "Dashboard", path: "/dashboard" },
  { key: "fluxoCaixa", label: "Fluxo de Caixa", path: "/fluxo-caixa" },
  { key: "relatorios", label: "Relatórios", path: "/relatorios" },
  { key: "contasPagar", label: "Contas a Pagar", path: "/contasPagar" },
  { key: "impostos", label: "Impostos", path: "/impostos" },
  { key: "contasReceber", label: "Contas a Receber", path: "/contasReceber" },
  { key: "centroCustos", label: "Centro de Custos", path: "/costCenter" },
  { key: "estoque", label: "Estoque", path: "/estoque" },
  { key: "vendas", label: "Painel de Vendas", path: "/vendas" },
] as const;

export type PermissionKey = (typeof PERMISSION_CATEGORIES)[number]["key"];

export interface AccessDoc {
  ownerId: string;
  role: "member";
  permissions: PermissionKey[];
  email: string | null;
  displayName: string | null;
  createdAt: number;
}

export interface AccountScope {
  /** uid do Firebase Auth de quem está logado agora. */
  uid: string;
  /** uid cujos dados devem ser lidos/escritos — o próprio uid se for dono. */
  ownerUid: string;
  isOwner: boolean;
  /** "all" pro dono; lista de categorias liberadas pro membro. */
  permissions: "all" | PermissionKey[];
}

/**
 * Resolve o escopo de dados de um uid já autenticado — uso client-side
 * (SDK padrão do firebase/firestore, respeitando as regras de segurança).
 * Cada página troca `uid` (o do login) por `ownerUid` (o dono dos dados)
 * antes de montar suas queries — só essa troca no ponto de entrada já
 * redireciona toda a leitura/escrita da página pro dono certo, sem precisar
 * tocar em cada query individualmente.
 */
export async function resolveAccountScope(
  db: import("firebase/firestore").Firestore,
  uid: string
): Promise<AccountScope> {
  const { doc, getDoc } = await import("firebase/firestore");
  const snap = await getDoc(doc(db, "users", uid, "profile", "access"));
  if (!snap.exists()) {
    return { uid, ownerUid: uid, isOwner: true, permissions: "all" };
  }
  const data = snap.data() as Partial<AccessDoc>;
  const ownerUid = typeof data.ownerId === "string" && data.ownerId ? data.ownerId : uid;
  return {
    uid,
    ownerUid,
    isOwner: ownerUid === uid,
    permissions: Array.isArray(data.permissions) ? (data.permissions as PermissionKey[]) : [],
  };
}

export function hasPermission(scope: Pick<AccountScope, "isOwner" | "permissions">, key: PermissionKey): boolean {
  if (scope.isOwner || scope.permissions === "all") return true;
  return scope.permissions.includes(key);
}
