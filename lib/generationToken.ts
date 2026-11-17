// lib/generationToken.ts
// Token de geração: cada operação assíncrona captura a geração atual ao começar
// e só aplica o resultado se ela ainda for a vigente. Quem muda o "alvo" (nova
// busca, troca do e-mail) chama bump() e invalida tudo que ainda está em voo.

export type GenerationToken = {
  /** Invalida as operações em voo e devolve a nova geração. */
  bump(): number;
  /** Geração vigente (para capturar no início de uma operação). */
  current(): number;
  /** true se a geração capturada ainda é a vigente. */
  isCurrent(captured: number): boolean;
};

export function createGenerationToken(): GenerationToken {
  let gen = 0;
  return {
    bump: () => ++gen,
    current: () => gen,
    isCurrent: (captured) => captured === gen,
  };
}
