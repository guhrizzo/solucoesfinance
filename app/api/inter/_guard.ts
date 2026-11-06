// app/api/inter/_guard.ts
// Portão comum das rotas /api/inter/*: token válido (requireScope), plano Pro
// (mesmo padrão de app/api/analyze-nf-retencao) e rate limit por conta. Por
// padrão só o DONO passa (rotas que mexem na CONEXÃO: conexao, testar); com
// `permission` (ex.: sincronizar) basta o membro ter essa permissão da conta.
// Não é rota (não se chama route.ts), só um módulo compartilhado.

import { NextResponse } from "next/server";
import { requireScope, isScopeError, type ApiScope } from "@/lib/apiScope";
import type { PermissionKey } from "@/lib/accountScope";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isProAccess } from "@/lib/billing";
import { resolveScopeSubscription } from "@/lib/scopeSubscription";
import { checkRateLimit } from "@/lib/rateLimit";

type GuardOpts = {
  /** Chave do rate limit (prefixo); a conta (ownerUid) é concatenada. */
  rateKey: string;
  rate: { windowMs: number; max: number };
  /** false só pra desconectar: quem perdeu o Pro ainda precisa poder apagar os segredos. */
  requirePro?: boolean;
  /**
   * Libera membros com esta permissão (donos sempre passam). Sem ela, a rota é
   * só do dono — comportamento das rotas de conexão.
   */
  permission?: PermissionKey;
};

export async function guardInter(req: Request, opts: GuardOpts): Promise<ApiScope | NextResponse> {
  const scope = await requireScope(req, opts.permission);
  if (isScopeError(scope)) {
    return NextResponse.json({ error: scope.error }, { status: scope.status });
  }
  if (!opts.permission && !scope.isOwner) {
    return NextResponse.json(
      { error: "Só o dono da conta pode gerenciar a integração com o Banco Inter." },
      { status: 403 }
    );
  }

  if (opts.requirePro !== false) {
    try {
      const state = await resolveScopeSubscription(await getAdminDb(), scope);
      if (!isProAccess(state)) {
        return NextResponse.json(
          { error: "A integração com o Banco Inter é exclusiva do plano Pro." },
          { status: 403 }
        );
      }
    } catch {
      return NextResponse.json({ error: "Erro ao verificar assinatura." }, { status: 500 });
    }
  }

  const { limited, retryAfterSec } = checkRateLimit(`${opts.rateKey}:${scope.ownerUid}`, opts.rate, scope.isSupremeAdmin);
  if (limited) {
    return NextResponse.json(
      { error: "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
  }
  return scope;
}

// Movidos pra um módulo puro (usado também pelo núcleo e pelos testes em node);
// reexportados aqui pra manter os imports existentes.
export { errCode, interKeyConfigured, SERVER_CONFIG_ERROR } from "@/lib/interErrors";
