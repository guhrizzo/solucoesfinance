"use client";

import { ShieldAlert } from "lucide-react";

/**
 * Tela renderizada no lugar do conteúdo de uma página quando o usuário
 * logado (um membro convidado, nunca o dono da conta) não tem a categoria
 * dessa página liberada em `users/{uid}/profile/access`. Cada página decide
 * sozinha, no próprio efeito de auth, se deve renderizar isto em vez do seu
 * conteúdo normal — ver lib/accountScope.ts.
 */
export default function AccessDenied({ category }: { category: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--db-bg)" }}>
      <div
        className="max-w-sm w-full text-center space-y-4 p-8 rounded-2xl border"
        style={{ background: "var(--db-card)", borderColor: "var(--db-border)" }}
      >
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto"
          style={{ background: "rgba(239,68,68,0.1)" }}
        >
          <ShieldAlert size={26} style={{ color: "var(--danger)" }} />
        </div>
        <div>
          <h1 className="font-bold text-lg" style={{ color: "var(--db-text)" }}>Acesso restrito</h1>
          <p className="text-sm mt-1.5" style={{ color: "var(--db-text-2)" }}>
            Sua conta não tem permissão para acessar <strong>{category}</strong>. Fale com o administrador da conta para liberar.
          </p>
        </div>
        <a
          href="/users"
          className="inline-block text-sm font-semibold px-4 py-2.5 rounded-xl text-white cursor-pointer"
          style={{ background: "var(--primary)" }}
        >
          Ir para Minha conta
        </a>
      </div>
    </div>
  );
}
