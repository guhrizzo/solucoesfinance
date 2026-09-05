# Foto de perfil do usuário — upload + avatar compartilhado

## Contexto e motivação

Hoje a plataforma nunca mostra uma foto de perfil real. Onde deveria aparecer
o avatar do usuário — cabeçalho da página **Minha conta** ([`app/users/page.tsx`](../../../app/users/page.tsx)),
avatar da **Navbar** ([`app/components/Navbar.tsx`](../../../app/components/Navbar.tsx))
e cabeçalho de **Configurações → Perfil** ([`app/configuracoes/PerfilTab.tsx`](../../../app/configuracoes/PerfilTab.tsx)) —
sempre se renderiza um quadrado com gradiente azul e a inicial do nome.

O login com Google já traz `photoURL` preenchido em `auth.currentUser`, mas
esse dado é ignorado. Quem entra por e-mail/senha não tem foto nenhuma.

Objetivo: deixar o usuário **escolher a própria foto**, com um padrão sensato
quando ele não escolher:

- entrou com Google → usa a foto do Google;
- entrou só por e-mail → inicial sobre fundo azul (comportamento atual).

## Decisões já tomadas (com o dono do produto)

| Pergunta | Resposta |
|---|---|
| Onde a foto aparece | Em todo lugar — um componente de avatar compartilhado; trocar em `/users` reflete na Navbar e em Configurações |
| Nível do upload | Simples — escolhe arquivo, o app reduz pra quadrado 256px e envia; exibe com recorte central (`object-fit: cover`); sem tela de ajuste/zoom |
| Quem pode ter foto | Qualquer usuário logado (dono da conta **e** membro de equipe) troca a própria foto |

## Origem da foto (precedência)

Fonte única da verdade: **`photoURL` do Firebase Auth** — mesmo mecanismo que
o nome de exibição já usa (`updateProfile()`). **Nenhuma mudança no Firestore.**

Ordem de resolução, dado o `User` do Firebase:

1. `user.photoURL` — se preenchido, é a foto (própria enviada, ou a do Google
   quando o usuário nunca enviou uma).
2. senão, foto do Google lida de
   `user.providerData.find(p => p.providerId === "google.com")?.photoURL` —
   fallback para o caso de `photoURL` ter sido limpo mas o Google seguir vinculado.
3. senão, `null` → o avatar renderiza a inicial
   (`displayName?.[0] ?? email?.[0] ?? "U"`, maiúscula) sobre o gradiente azul.

Se o `<img>` falhar ao carregar (link do Google expirado, arquivo removido),
o `onError` força o passo 3.

### "Remover foto"

- Se o usuário tem Google vinculado: `updateProfile({ photoURL: <foto do Google> })`.
- Senão: `updateProfile({ photoURL: "" })` → cai na inicial.
- Nos dois casos, tenta apagar o arquivo enviado do Storage (best-effort).

### Como saber se há foto "própria" enviada

O botão "Remover foto" só aparece quando existe foto enviada pelo usuário.
Critério: `user.photoURL` está preenchido **e** é diferente da foto do Google
em `providerData` (comparação de string exata). Isso é suficiente porque a
foto enviada mora em `firebasestorage.googleapis.com/.../users/{uid}/avatar/...`
e a do Google em `lh3.googleusercontent.com/...` — nunca colidem.

## Componentes e módulos

### `lib/profilePhoto.ts` (novo)

Funções puras + efeitos de I/O, sem React:

- `resolveAvatar(user: User | null): { src: string | null; initial: string }`
  — implementa a precedência acima.
- `hasCustomPhoto(user: User): boolean` — critério do "Remover foto".
- `AVATAR_ACCEPT = "image/png,image/jpeg,image/webp"`,
  `AVATAR_MAX_BYTES = 5 * 1024 * 1024`, `AVATAR_SIZE_PX = 256`.
- `downscaleToSquare(file: File): Promise<Blob>` — carrega o arquivo num
  `HTMLImageElement`, desenha recorte central quadrado num `<canvas>` de
  256×256, `canvas.toBlob("image/jpeg", 0.85)`. Isso normaliza qualquer
  entrada para ~20–30 KB e remove metadados EXIF.
- `uploadAvatar(user: User, file: File): Promise<string>` — valida tipo e
  tamanho (lança `Error` com mensagem PT-BR se falhar), roda `downscaleToSquare`,
  faz `uploadBytes` em `users/{uid}/avatar/photo_{Date.now()}.jpg`,
  `getDownloadURL`, `updateProfile(user, { photoURL: url })`. Depois tenta
  apagar arquivos `users/{uid}/avatar/*` anteriores (best-effort, ignora erro).
  Segue o padrão de timeout de 15s já usado em
  [`app/components/CashFlow.tsx`](../../../app/components/CashFlow.tsx) (`uploadNf`).
- `removeAvatar(user: User): Promise<void>` — lógica do "Remover foto" acima.

Imports do `firebase/storage` e `firebase/firestore` continuam dinâmicos
(`await import(...)`), como no resto do projeto.

### `app/hooks/useProfilePhoto.ts` (novo)

Store no padrão `useSyncExternalStore` — já usado em
[`app/lib/consent.ts`](../../../app/lib/consent.ts) e
[`app/components/AccessibilityWidget.tsx`](../../../app/components/AccessibilityWidget.tsx).

- Estado interno: `{ src: string | null; initial: string; loading: boolean }`.
- Uma assinatura de `onAuthStateChanged` (criada na primeira inscrição, mantida
  enquanto houver componentes ouvindo) preenche o estado via `resolveAvatar`.
- `refresh()` exportado: roda `auth.currentUser?.reload()` e recalcula o
  snapshot. Chamado após `uploadAvatar` / `removeAvatar`, porque
  `updateProfile()` **não** dispara `onAuthStateChanged`.
- Hook `useProfilePhoto()` retorna `{ src, initial, loading, refresh }`.

### `app/components/ui/Avatar.tsx` (novo)

Apresentacional puro. Exportado no barrel
[`app/components/ui/index.ts`](../../../app/components/ui/index.ts).

```tsx
interface AvatarProps {
  src: string | null;
  initial: string;
  size?: number;        // px; default 40
  className?: string;
}
```

- Com `src`: `<img>` quadrado com `borderRadius` proporcional e
  `objectFit: "cover"`; `onError` → estado local `broken=true` que passa a
  renderizar a inicial.
- Sem `src` (ou `broken`): `<div>` com `background: linear-gradient(135deg,
  var(--brand-500), var(--brand-400))`, texto branco, a `initial`.
- `alt=""` (decorativo — o nome já está ao lado em todos os usos).

### `app/components/AvatarUploader.tsx` (novo)

O único ponto de edição. Client component.

- Lê `useProfilePhoto()` + `useToast()`.
- Renderiza `<Avatar size={56}>` dentro de um `<button>` que dispara um
  `<input type="file" accept={AVATAR_ACCEPT} hidden>`; selo de câmera
  (ícone `Camera` do lucide) sobreposto no canto.
- Durante o envio: overlay com `<Loader2 className="animate-spin">` sobre o
  avatar, `disabled`.
- Ao escolher arquivo: `uploadAvatar(auth.currentUser, file)` → `refresh()` →
  toast "Foto atualizada." / toast de erro com a mensagem lançada.
- Botão de texto "Remover foto" abaixo, visível só quando
  `hasCustomPhoto(auth.currentUser)`; ao clicar: `removeAvatar` → `refresh()`
  → toast.

## Onde encaixa

| Arquivo | Antes | Depois |
|---|---|---|
| [`app/users/page.tsx`](../../../app/users/page.tsx) linhas ~468–479 | `<div>` estático com `{initial}` no card do cabeçalho | `<AvatarUploader />` |
| [`app/components/Navbar.tsx`](../../../app/components/Navbar.tsx) linha ~471 | `<div className="nxfi-avatar">{initial}</div>` | `<Avatar size={32} {...useProfilePhoto()} />` — tamanho pela prop `size`; a regra `.nxfi-avatar` do CSS que hoje pinta o fundo/tamanho passa a não ser mais necessária no `<img>`, mas o wrapper `.nxfi-avatar-btn` continua |
| [`app/configuracoes/PerfilTab.tsx`](../../../app/configuracoes/PerfilTab.tsx) cabeçalho | `<div>` estático com `{initial}` | `<Avatar>` (só exibição) lendo `useProfilePhoto()` |

Nenhuma prop nova é passada pelas 12 páginas que montam a `<Navbar>` — o
avatar da Navbar lê o hook diretamente. A prop `user` da Navbar segue como
está (nome, e-mail, uid).

O `initial` derivado localmente em cada um desses arquivos pode ser removido
onde deixar de ser usado; onde ainda serve (ex.: `firstName` na Navbar), fica.

## Dependência externa: regras do Firebase Storage

Os uploads gravam em `users/{uid}/avatar/photo_*.jpg`. As regras do Storage
(que vivem no console do Firebase, **não** há `storage.rules` no repositório)
precisam permitir escrita quando `request.auth.uid == uid` nesse caminho.

As notas fiscais já gravam em `users/{uid}/nfs/*` e funcionam, então
provavelmente existe uma regra curinga `users/{uid}/{allPaths=**}` que já
cobre `avatar/`. **Ação:** confirmar isso (teste real de upload no preview).
Se não cobrir, criar `storage.rules` versionado no repo com a regra e o dono
publica.

Restrições de tamanho/tipo são aplicadas **no cliente** antes do upload; não
dependemos de regra de Storage pra isso (o downscale já limita o que sobe a
um JPEG 256×256).

## Tratamento de erro

| Caso | Comportamento |
|---|---|
| Arquivo não é PNG/JPEG/WebP | toast "Escolha uma imagem PNG, JPEG ou WebP.", nada sobe |
| Arquivo > 5 MB | toast "A imagem precisa ter no máximo 5 MB.", nada sobe |
| `canvas.toBlob` retorna `null` | toast "Não foi possível processar a imagem." |
| Upload falha / timeout 15s (Storage desativado, rede) | toast "Não foi possível enviar a foto. Tente novamente." |
| `<img>` do avatar falha ao carregar | `onError` → renderiza a inicial (sem toast) |
| `updateProfile` falha | toast genérico de erro; foto não muda |

## Testes

O projeto **não tem suíte de testes** (sem `test` no `package.json`, sem
arquivos `*.test.*`). Verificação:

1. `npx tsc --noEmit` e `npm run lint` limpos.
2. `npm run build` sem erro.
3. Preview manual:
   - conta que entrou com Google → mostra a foto do Google na Navbar, em
     `/users` e em Configurações;
   - conta só e-mail → mostra a inicial nos três lugares;
   - enviar uma foto em `/users` → aparece nos três lugares após o `refresh`;
   - "Remover foto" → volta pra foto do Google (se houver) ou pra inicial;
   - enviar arquivo inválido (PDF, imagem gigante) → toast, avatar intacto.

## Fora de escopo

- Avatares de membros na lista de equipe do dono (`users/{owner}/team/*`) —
  esses vêm de um doc do Firestore com só nome/e-mail; continuam com inicial.
- Tela de recorte/zoom/reposição da foto.
- Foto da empresa (logo) — outro conceito, não pedido aqui.
- Sincronizar `photoURL` para dispositivos/sessões em tempo real além do
  `reload()` sob demanda.
