"use client";

// app/components/PlatformAnalytics.tsx
// Registra uma visita a cada mudança de rota (app logado inteiro + site
// público — decisão de produto, diferente da referência que ignora rotas
// internas), chamando POST /api/track. Não renderiza nada e nunca interfere
// na navegação (erros são engolidos). Montado 1x em app/[locale]/layout.tsx.
//
// Ver docs/superpowers/specs/2026-09-15-analytics-visitantes-plataforma-design.md.

import { useEffect, useRef } from "react";
import { usePathname } from "@/i18n/navigation";
import { authedFetch } from "@/lib/authedFetch";

export function PlatformAnalytics() {
    const pathname = usePathname();
    const ultimoEnviado = useRef<string | null>(null);

    useEffect(() => {
        if (!pathname) return;
        if (ultimoEnviado.current === pathname) return;
        ultimoEnviado.current = pathname;

        (async () => {
            try {
                const init: RequestInit = {
                    method: "POST",
                    keepalive: true,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ path: pathname }),
                };

                // Logado = manda o Bearer do ID token (a rota tenta verificar;
                // sem token ou inválido, conta como anônimo). Import dinâmico
                // pro Firebase não entrar no bundle de quem nunca navega
                // (mesmo padrão usado em Navbar.tsx e outras páginas).
                const { getFirebase } = await import("@/lib/firebase");
                const { auth } = await getFirebase();

                if (auth.currentUser) {
                    await authedFetch("/api/track", init).catch(() => {});
                } else {
                    fetch("/api/track", init).catch(() => {});
                }
            } catch {
                /* nunca quebra a navegação */
            }
        })();
    }, [pathname]);

    return null;
}
