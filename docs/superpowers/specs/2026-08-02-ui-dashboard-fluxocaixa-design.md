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

## Descobertas adicionais durante a implementação

- Uma 4ª modal (confirmação de exclusão de transação) também reimplementava a casca do zero — migrada para `ui/Modal` junto com as três previstas.
- `ui/Modal` ganhou duas props novas (`mobileSheet`, `closeDisabled`) para cobrir um padrão real já usado pelas modais de transação/importação (bottom sheet no mobile, com drag handle, e bloqueio de fechamento enquanto salva) — sem isso, migrar essas modais perderia esse comportamento.
- As três páginas/componentes injetavam `<style>@import url(fonts.googleapis...)</style>` redundante, carregando não só Sora (já coberto pela Fundação) mas também **JetBrains Mono**, que não estava carregado em nenhum lugar via `next/font`. Corrigido trazendo `JetBrains_Mono` para `app/layout.tsx` (mesmo padrão do Sora) e apontando `.mono` e o `--font-mono`/`--font-sans` do bloco `@theme inline` (que apontavam para `--font-geist-mono`/`--font-geist-sans`, fontes de um template padrão nunca carregadas neste projeto) para as fontes reais.
- `Set-Content -Encoding utf8` do PowerShell introduziu um BOM (byte-order-mark) no início de 4 arquivos editados por script neste processo (incluindo `Navbar.tsx`, da etapa anterior) — removido.

## Validação

Mudança de UI — validada no browser via uma rota de preview temporária (com as 3 modais internas exportadas temporariamente para o teste, revertido ao final), já que o fluxo real depende de autenticação Firebase: os 3 modais originais + a modal de exclusão descoberta, badges de status, `MoneyInput` pré-preenchido, variante `mobileSheet` (desktop centralizado vs. bottom sheet mobile com drag handle), tema claro/escuro, e ausência de erros de hidratação/console. Type-check e lint comparados byte-a-byte contra o baseline antes das mudanças — nenhum problema novo introduzido.
