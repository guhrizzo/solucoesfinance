# Revisão de UI/UX — Etapa 2: Dashboard + Fluxo de Caixa

## Contexto

Segunda etapa do roadmap iniciado em [2026-08-01-ui-fundacao-design.md](2026-08-01-ui-fundacao-design.md), que consolidou os tokens de design e criou os componentes primitivos em `app/components/ui/`. Esta etapa aplica esse sistema às duas telas de maior uso: Dashboard e Fluxo de Caixa.

## Escopo

- `app/dashboard/page.tsx`
- `app/components/CashFlow.tsx` (inclui os 3 modais internos: `PrevisaoModal`, `Modal` de transação, `ImportModal`)
- `app/components/CategoryBreakdown.tsx`

**Fora de escopo**: `app/components/OnboardingModal.tsx` (pertence à frente 2 do roadmap geral — Login/Cadastro/Onboarding, não a esta etapa). Nenhuma mudança de lógica de negócio, cálculos, listeners do Firestore, ou dos endpoints de IA (`/api/analyze-nf`, `/api/analyze-extract`).

## Problema

- **Bug de token**: `var(--db-text2)`, `var(--db-text3)` (dashboard) e `var(--cf-text2)` (CashFlow, 47 ocorrências) referenciam variáveis CSS que não existem — os nomes reais definidos em `globals.css` são `--db-text-2`, `--db-text-3`, `--cf-text-2` (com hífen). Uma `var()` inválida sem fallback faz a propriedade cair no valor herdado do elemento pai, quebrando silenciosamente a hierarquia de texto secundário/terciário em quase toda a tela.
- Três modais em `CashFlow.tsx` (previsão, transação, importação IA) reimplementam a casca de modal (overlay, animação, fechamento) do zero, cada um com sua própria variação.
- `parseAmount` duplicado localmente em `CashFlow.tsx`, idêntico ao já centralizado em `app/components/ui/Input.tsx`.
- Botões, badges de status e cores de estado (erro, NF anexada) usam hex/gradientes inline em vez dos tokens/componentes consolidados na Fundação.

## Solução

1. Corrigir os nomes de variável (`--db-text2` → `--db-text-2` etc.) em `dashboard/page.tsx` e `CashFlow.tsx`.
2. Trocar a casca dos três modais de `CashFlow.tsx` pelo componente `Modal` de `ui/`, preservando toda a lógica interna (upload de NF, scan por IA, validação, import) sem alterações.
3. Trocar botões de ação e badges de status pelos componentes `Button`/`Badge` de `ui/`.
4. Trocar os campos de valor monetário (`rawAmt`) por `MoneyInput`, removendo o `parseAmount` local em favor do de `ui/Input.tsx`.
5. Trocar cores de estado hardcoded (erro, NF anexada) pelos tokens semânticos já existentes (`--status-danger-*`, `--status-info-*`).

## Validação

Mudança de UI — validada no browser via uma rota de preview temporária (removida ao final), já que o fluxo real depende de autenticação Firebase: KPIs, gráfico, tabela de transações, os três modais (abrir/fechar/salvar), tema claro/escuro, e ausência de erros de hidratação/console.
