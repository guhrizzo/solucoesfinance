// lib/passwordRules.ts
// Regras de senha forte compartilhadas entre cadastro (app/register) e
// "Definir senha" (app/perfil). Mantém as duas telas sempre em sincronia —
// mudou aqui, mudou nas duas. Isso é validação de UI (pode ser burlada por
// quem chama o Firebase direto); o bloqueio de verdade fica na Password
// Policy do Firebase Console (Authentication → Settings → Password policy).

export interface PasswordRule {
  key: string;
  label: string;
  test: (password: string) => boolean;
}

export const passwordRules: PasswordRule[] = [
  { key: "length", label: "Mínimo 12 caracteres", test: (p) => p.length >= 12 },
  { key: "upper", label: "Letra maiúscula", test: (p) => /[A-Z]/.test(p) },
  { key: "lower", label: "Letra minúscula", test: (p) => /[a-z]/.test(p) },
  { key: "number", label: "Número", test: (p) => /\d/.test(p) },
  { key: "special", label: "Caractere especial (!@#$%...)", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export function isStrongPassword(password: string): boolean {
  return passwordRules.every((rule) => rule.test(password));
}
