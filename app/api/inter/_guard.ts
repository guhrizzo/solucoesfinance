// app/api/inter/_guard.ts
// Portão comum das rotas /api/inter/* que mexem na CONEXÃO (conexao, testar):
// token válido (requireScope), só o DONO da conta, plano Pro (mesmo padrão de
// app/api/analyze-nf-retencao) e rate limit por conta. Não é rota (não se chama
// route.ts), só um módulo compartilhado.

import { NextResponse } from "next/server";
import { requireScope, isScopeError, type ApiScope } from "@/lib/apiScope";
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
};

export async function guardInter(req: Request, opts: GuardOpts): Promise<ApiScope | NextResponse> {
  const scope = await requireScope(req);
  if (isScopeError(scope)) {
    return NextResponse.json({ error: scope.error }, { status: scope.status });
  }
  if (!scope.isOwner) {
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

/** A chave de cifragem existe? Checado antes de tocar em segredo, pra falhar com mensagem genérica. */
export function interKeyConfigured(): boolean {
  return !!process.env.INTER_ENC_KEY?.trim();
}

/**
 * Pra log: só o código do erro (ex.: "permission-denied"), nunca a mensagem —
 * mensagens de bibliotecas podem citar dados do documento ou da requisição.
 */
export function errCode(e: unknown): string {
  const c = typeof e === "object" && e !== null ? (e as { code?: unknown }).code : undefined;
  return typeof c === "string" || typeof c === "number" ? String(c) : "sem-codigo";
}

export const SERVER_CONFIG_ERROR = "Integração com o Banco Inter indisponível no momento (configuração do servidor). Avise o suporte.";
