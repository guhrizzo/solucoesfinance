// tests/support/register.mjs
// Hook de resolução pros testes (node --test + --experimental-strip-types):
//   • "@/lib/x"  → <raiz>/lib/x (alias do tsconfig)
//   • import sem extensão ("./calc") → tenta .ts, .tsx, /index.ts
// Assim os testes importam os módulos TS do app sem bundler nem dependência nova.
import { register } from "node:module";

register(new URL("./resolve-hook.mjs", import.meta.url));
