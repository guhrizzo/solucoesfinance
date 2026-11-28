// lib/shopeeAccess.ts
// A Shopee está oculta para todo mundo, EXCETO e-mails liberados. Serve para
// a conta de teste do revisor da Shopee Open Platform (a revisão exige ver a
// integração funcionando antes de liberar as chaves de produção) e para os
// donos da plataforma.
//
// Liberação: env pública NEXT_PUBLIC_SHOPEE_UI_EMAILS (e-mails separados por
// vírgula). Sem a env, só os adm supremos enxergam.

import { useAuth } from "@/app/hooks/useAuth";
import { isSupremeAdminEmail } from "@/lib/compAccounts";

export function isShopeeUiEmail(email: string | null | undefined, emailVerified?: boolean): boolean {
  if (!email) return false;
  if (isSupremeAdminEmail(email, emailVerified)) return true;
  const e = email.trim().toLowerCase();
  return (process.env.NEXT_PUBLIC_SHOPEE_UI_EMAILS || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
    .includes(e);
}

/** true se o usuário logado pode ver a Shopee na interface. */
export function useShopeeUi(): boolean {
  const { user } = useAuth();
  return isShopeeUiEmail(user?.email, user?.emailVerified);
}
