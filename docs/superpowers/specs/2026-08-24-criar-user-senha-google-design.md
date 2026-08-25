# Criar user (nome + senha obrigatórios) para contas só-Google

## Contexto geral

Pedido do usuário: "quando a pessoa entrar ela vai precisar criar um user com o nome dele e uma senha que será usada para diversas funções dentro da plataforma".

Explorado em brainstorming (ver conversa): trata-se de **uma conta por "user"**, não um sistema de múltiplos operadores/funcionários por empresa. O objetivo real é garantir que toda conta tenha nome + senha definidos — hoje só quem passa pelo formulário de `/register` preenche os dois; quem entra só pelo Google nunca define uma senha (o [account linking](../../../lib/authLink.ts) já implementado permite adicionar depois, mas é opcional, na tela `/perfil`). O "diversas funções" citado é só o nome sendo usado/assinado depois em outras partes do app (ex.: "criado por X") — **não** entra no escopo desta etapa (decidido explicitamente: só criar e guardar o nome, exibir em outros módulos fica para specs futuras, módulo por módulo).

A senha **não** será usada para reautenticação de ações sensíveis (decidido explicitamente) — é só uma exigência de completude de cadastro.

## Quem é afetado

Só contas que autenticaram exclusivamente via Google e nunca definiram senha (`auth.currentUser.providerData` sem entrada `"password"`). Quem já tem senha (cadastro por `/register`, ou já vinculou pela tela `/perfil`) não vê nenhuma mudança.

## Solução

### 1. Novo componente — `app/components/CreatePasswordGate.tsx`

Modal em tela cheia, mesma linguagem visual do [OnboardingModal](../../../app/components/OnboardingModal.tsx) (gradiente azul, tipografia Sora), porém:
- **Bloqueante de verdade**: sem botão de fechar (X), sem fechar clicando fora, sem ESC.
- Tela única (não é um wizard de passos): campo Nome completo (pré-preenchido com `user.displayName` vindo do Google, editável), campo Senha, campo Confirmar senha — reaproveitando o checklist de força de senha já existente (`lib/passwordRules.ts`, 12+ caracteres, maiúscula, minúscula, número, especial).
- Props: `{ open: boolean; email: string; suggestedName: string | null; onComplete: () => void }`.

Submit:
1. `updateProfile(auth.currentUser, { displayName: name.trim() })` — grava o nome no próprio Firebase Auth (mesmo campo já lido em toda a UI, ex.: `Navbar`; não é criado nenhum campo novo no Firestore).
2. `linkPasswordToCurrentUser(auth.currentUser, email, password)` — helper já existente em `lib/authLink.ts` (criado para a tela `/perfil`).
3. Sucesso → chama `onComplete()`.
4. Erro → mesmo mapeamento PT-BR já usado em `/perfil` e `/register` (`auth/weak-password`, `auth/password-does-not-meet-requirements`, `auth/requires-recent-login`, `auth/network-request-failed`).

### 2. Integração no Dashboard (`app/dashboard/page.tsx`)

No `onAuthStateChanged` já existente, ao lado do carregamento do onboarding de ramo/faturamento:
```
const hasPassword = u.providerData.some(p => p.providerId === "password");
setNeedsPasswordSetup(!hasPassword);
```
Renderiza `<CreatePasswordGate open={needsPasswordSetup} email={user.email} suggestedName={user.displayName} onComplete={() => setNeedsPasswordSetup(false)} />` **antes** do `OnboardingModal` existente — e o `OnboardingModal` passa a abrir só com `open={showOnboarding && !needsPasswordSetup}`, garantindo que os dois gates nunca aparecem sobrepostos (senha primeiro, ramo do negócio depois).

### Escopo desta etapa (arquivos tocados)

- `app/components/CreatePasswordGate.tsx` (novo)
- `app/dashboard/page.tsx` — cálculo de `hasPassword`, renderização do gate, ajuste da condição do `OnboardingModal`

## Fora de escopo

- Exibir "criado por [nome]" em fluxo de caixa, contas a pagar/receber, estoque, centro de custo — fica para pedidos futuros, módulo por módulo.
- Qualquer forma de reautenticação por senha antes de ações sensíveis.
- Gate global em todas as rotas (só estoque, contas a pagar direto por URL, etc. continuam sem esse bloqueio) — só o Dashboard, mesmo padrão do onboarding de ramo já existente.
- Múltiplos "users"/operadores por conta (equipe) — decidido explicitamente que é 1 por conta.

## Validação planejada

- `tsc --noEmit` limpo.
- Não é possível simular automaticamente uma conta "só Google" nova neste ambiente (exige OAuth real) — validação final por teste manual do usuário com uma conta Google sem senha: confirmar que o gate aparece, bloqueia o resto do Dashboard, e some após completar nome+senha; confirmar que uma conta que já tem senha nunca vê o gate.
