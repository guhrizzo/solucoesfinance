// scripts/i18n-check.mjs
//
// Garante que os 3 idiomas (pt-BR, en, es) têm EXATAMENTE o mesmo conjunto de
// chaves em cada namespace, e que toda mensagem é ICU válido. pt-BR é a fonte
// da verdade — o que existe em pt-BR tem que existir em en e es (e vice-versa).
//
// Rodar ao fim de cada fase da migração de i18n:
//   node scripts/i18n-check.mjs
//
// Ver docs/superpowers/specs/2026-09-06-i18n-multi-idioma-plan.md (fase 1.9).

import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@formatjs/icu-messageformat-parser";

const MESSAGES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "messages");
const LOCALES = ["pt-BR", "en", "es"];
const SOURCE = "pt-BR";

let errors = 0;
const fail = (msg) => {
  console.error(`  ✗ ${msg}`);
  errors++;
};

function flatten(obj, prefix = "") {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flatten(v, key));
    } else {
      out[key] = v;
    }
  }
  return out;
}

function load(locale, ns) {
  return JSON.parse(readFileSync(join(MESSAGES_DIR, locale, ns), "utf8"));
}

const namespaces = readdirSync(join(MESSAGES_DIR, SOURCE)).filter((f) => f.endsWith(".json"));

for (const ns of namespaces) {
  const source = flatten(load(SOURCE, ns));
  const sourceKeys = new Set(Object.keys(source));

  for (const locale of LOCALES) {
    let flat;
    try {
      flat = flatten(load(locale, ns));
    } catch (e) {
      fail(`${locale}/${ns}: não carregou (${e.message})`);
      continue;
    }

    if (locale !== SOURCE) {
      const keys = new Set(Object.keys(flat));
      for (const k of sourceKeys) if (!keys.has(k)) fail(`${locale}/${ns}: falta a chave "${k}"`);
      for (const k of keys) if (!sourceKeys.has(k)) fail(`${locale}/${ns}: chave "${k}" não existe em ${SOURCE}`);
    }

    for (const [k, v] of Object.entries(flat)) {
      if (typeof v !== "string") continue;
      try {
        parse(v);
      } catch (e) {
        fail(`${locale}/${ns}: ICU inválido em "${k}": ${e.message}`);
      }
    }
  }
}

if (errors) {
  console.error(`\ni18n-check: ${errors} problema(s).`);
  process.exit(1);
}
console.log(`i18n-check: ok — ${namespaces.length} namespaces × ${LOCALES.length} idiomas.`);
