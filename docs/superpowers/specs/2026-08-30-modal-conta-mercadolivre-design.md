# Modal: identidade da conta Mercado Livre conectada

**Data:** 2026-08-30
**Arquivo afetado:** `app/estoque/page.tsx` (só ele)

## Problema

Depois de conectar o Mercado Livre, a UI só mostra `🟢 Conectado` — sem dizer
**qual** conta ML está ligada. O usuário quer confirmar visualmente a identidade
da conta (nickname/id) e, se um dia houver mais de uma, ver todas listadas.

Decisões do brainstorming (2026-08-30):
- Propósito = **só ver/confirmar** a conta. Sem "conta ativa", sem seletor.
- Só **uma** conta ML na prática. A lista precisa apenas degradar bem para N contas.

## Fora de escopo (YAGNI)

- Conectar 2ª conta pela UI (o botão continua travando em "Conectado" após a 1ª).
- Dropdown de "escolher conta" em formulários (vínculo manual continua pegando `docs[0]`).
- Conceito de conta principal/padrão.
- Mudanças em rotas de servidor.

## O que já existe

- Header da aba Estoque: botão **Integrações (N)** → `setModalIntegracoesOpen(true)`.
- Modal *"Gerenciar Integrações de Canais"*:
  - Seção *"Disponíveis para Integração"*: linha ML e linha Shopee, cada uma com
    badge `🟢 Conectado` (estático) ou botão **Conectar Conta**.
  - Seção *"Suas Contas Integradas (N)"*: `integracoes.map(...)` → logo + `accountName`
    + `(accountId)` + botão **Desconectar** (`handleDisconnect`). Já itera N contas.
- Estado `integracoes` vem por `onSnapshot` de `integracoes` where `userId == ownerUid`.
- Interface `Integracao`: `{ id, platform, accountId, accountName, accessToken, expiresAt }`.
  O doc no Firestore também tem `createdAt` e `updatedAt` (gravados no callback).

## Mudanças

### 1. Interface `Integracao`

Adicionar campos opcionais já presentes no doc:

```ts
interface Integracao {
  id: string;
  platform: "mercadolivre" | "shopee";
  accountId: string;
  accountName: string;
  accessToken: string;
  expiresAt: number;
  createdAt?: number;
  updatedAt?: number;
}
```

### 2. Badge da linha do canal (ML e Shopee)

Trocar o texto estático `Conectado` por um resumo com a identidade. Helper:

```ts
const contasDe = (p: "mercadolivre" | "shopee") =>
  integracoes.filter((i) => i.platform === p);
```

- 0 contas → botão **Conectar Conta** (inalterado)
- 1 conta → `🟢 Conectado como {accountName}`
- 2+ contas → `🟢 {n} contas conectadas`

Mantém o ponto verde e o estilo atual; só muda o texto. Vale para as duas linhas
(ML e Shopee) para consistência.

### 3. Linha de "Suas Contas Integradas" — status + Reconectar

Cada item da lista passa a mostrar, abaixo do nome:

- **Info do token** (transparente, sem alarme — o access token renova sozinho no
  próximo uso via `getValidAccessToken`):
  - `expiresAt > agora` → `Token válido até {DD/MM HH:mm} · renova sozinho`
  - `expiresAt <= agora` → `Token renova na próxima sincronização`
  - `accountId` começa com `mock_` ou sem `expiresAt` → `Modo simulado`
- **"conectada em {DD/MM/AAAA}"** a partir de `createdAt` (se existir).

Botões da linha (ícone + label curto):
- **Reconectar** → `handleConnectAccount(item.platform)` (o callback faz upsert no
  mesmo doc por `userId+platform+accountId`, então não duplica). Útil se algo quebrar.
- **Desconectar** → `handleDisconnect(item.id, item.platform)` (inalterado).

Layout: empilhar nome + metadados à esquerda, botões à direita; a linha cresce em
altura. `max-h-40 overflow-y-auto` da lista continua.

### 4. Indicador fora do modal (aba de filtro Mercado Livre)

Quando `activeTab === "mercadolivre"` (ou `"shopee"`), renderizar um textinho
discreto acima da tabela:

`Conta: {accountName} · {n} anúncios vinculados`

- `accountName`: da(s) conta(s) daquela plataforma (join por `" · "` se 2+).
- `n`: `vinculos.filter(v => v.platform === activeTab).length`.
- Se não houver integração da plataforma → não renderiza nada.

Assim dá pra conferir a conta sem abrir o modal.

## Formatação de data

Reusar o padrão já usado no arquivo (checar se há helper tipo `formatDate`;
senão `new Date(ts).toLocaleDateString("pt-BR")` /
`toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })`).

## Testes / verificação

Sem testes automatizados no projeto para essa página. Verificação manual:
1. `tsc --noEmit` limpo.
2. Com a integração real atual (GURIZZO943): badge mostra "Conectado como GURIZZO943";
   lista mostra token válido + data; aba ML mostra o indicador.
3. Sanidade visual em tema claro e escuro (usa `var(--cf-*)`).

## Risco

Baixo. Um arquivo, só camada de apresentação, dados já carregados. Nenhuma
gravação nova. Pior caso: texto quebrado / layout apertado na lista — ajuste de CSS.
