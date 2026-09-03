import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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

  // Redesign 2026-09 — barra cor hex crua nas telas em migração. Severidade
  // `warn` nesta fase (páginas legadas ainda têm centenas de violações); vira
  // `error` na Fase 11. Ver docs/superpowers/specs/2026-09-03-redesign-ui-unificado-design.md
  {
    files: ["app/**/*.tsx"],
    ignores: ["app/components/ui/**", "app/design-system/**"],
    rules: {
      "no-restricted-syntax": [
        "warn",
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
]);

export default eslintConfig;
