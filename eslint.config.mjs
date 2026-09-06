import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

// NOTA sobre os globs: as rotas moram em app/[locale]/**. Nos globs do ESLint
// (minimatch) os colchetes de "[locale]" seriam lidos como classe de
// caractere, então usamos "app/*/..." — o "*" casa o segmento "[locale]"
// literalmente. Ver docs/superpowers/specs/2026-09-06-i18n-multi-idioma-*.

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  // Acessibilidade (WCAG 2.1 AA) — ver docs/superpowers/specs/2026-09-04-
  // acessibilidade-wcag-design.md. O `eslint-config-next` já registra o
  // plugin `jsx-a11y` pro repo inteiro (6 regras básicas, todas em warn)
  // — não redeclaramos o plugin aqui (o flat config não deixa duas
  // configs registrarem o mesmo nome de plugin), só reaproveitamos o
  // registro existente pra subir as regras do preset `recommended`
  // completo pra erro, só nestes arquivos já auditados e corrigidos
  // (Fases 1-4). Conforme mais páginas forem auditadas, elas entram
  // nesta lista (mesma mecânica do bloco de cor-hex abaixo, só que como
  // allowlist que cresce em vez de ignores que encolhe — mais seguro
  // aqui: evita marcar como erro algo que ainda não foi auditado no
  // resto do app).
  {
    files: [
      "app/components/ui/**/*.tsx",
      "app/components/Navbar.tsx",
      "app/components/AppShell.tsx",
      "app/components/CashFlow.tsx",
      "app/components/PinModal.tsx",
      "app/components/ConfirmModal.tsx",
      "app/*/register/**/*.tsx",
      "app/*/login/**/*.tsx",
      "app/layout.tsx",
      "app/*/layout.tsx",
      "app/*/dashboard/page.tsx",
      "app/*/fluxo-caixa/page.tsx",
      "app/*/contasPagar/page.tsx",
      "app/*/contasReceber/page.tsx",
      "app/*/costCenter/page.tsx",
      "app/*/estoque/page.tsx",
      "app/*/vendas/page.tsx",
      "app/*/impostos/page.tsx",
      "app/*/relatorios/page.tsx",
      "app/*/configuracoes/**/*.tsx",
      "app/*/acessibilidade/page.tsx",
    ],
    rules: jsxA11y.flatConfigs.recommended.rules,
  },

  // Redesign 2026-09 — barra cor hex crua nas telas do app interno já migradas.
  // Ver docs/superpowers/specs/2026-09-03-redesign-ui-unificado-design.md
  // `ignores`: telas fora do escopo do redesign (landing, auth, onboarding,
  // páginas de dev) — migrá-las é trabalho futuro.
  {
    files: ["app/**/*.tsx"],
    ignores: [
      "app/components/ui/**",
      "app/*/design-system/**",
      "app/*/page.tsx",
      "app/not-found.tsx",
      "app/*/not-found.tsx",
      "app/*/login/**",
      "app/*/register/**",
      "app/*/debug/**",
      "app/*/developer/**",
      "app/*/assinatura/**",
      "app/components/OnboardingModal.tsx",
      "app/components/CreatePasswordGate.tsx",
      "app/components/Paywall.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/#(?:[0-9a-fA-F]{3,4}){1,2}\\b/]",
          message:
            "Cor hex crua. Use um token do design system (var(--brand), var(--text), var(--pos)…) ou um componente de app/components/ui/.",
        },
        {
          selector: "TemplateElement[value.raw=/#(?:[0-9a-fA-F]{3,4}){1,2}\\b/]",
          message:
            "Cor hex crua em template string. Use um token do design system ou um componente de app/components/ui/.",
        },
      ],
    },
  },

  // i18n Fase 1 — depois que as rotas foram pra app/[locale]/, a regra
  // @next/next/no-html-link-for-pages passou a acusar os <a href="/rota">
  // pré-existentes (links internos que já deviam ser <Link>). Cada fase da
  // migração de i18n troca esses <a> pelo <Link> do wrapper
  // (@/i18n/navigation) e remove a entrada correspondente daqui — lista que
  // encolhe. Ver docs/superpowers/specs/2026-09-06-i18n-multi-idioma-plan.md.
  {
    files: [
      "app/*/assinatura/**/*.tsx",
      "app/*/configuracoes/**/*.tsx",
      "app/*/dashboard/page.tsx",
      "app/*/not-found.tsx",
      "app/*/register/page.tsx",
      "app/*/vendas/page.tsx",
      "app/components/AccessDenied.tsx",
      "app/components/CashFlow.tsx",
      "app/components/Navbar.tsx",
      "app/components/SubscriptionGate.tsx",
    ],
    rules: {
      "@next/next/no-html-link-for-pages": "off",
    },
  },
]);

export default eslintConfig;
