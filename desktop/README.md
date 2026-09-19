# Nexus Fi — App desktop

Casca **Electron** que empacota o Nexus Fi (Next.js publicado em
`https://nexusfi.com.br`) como app instalável no Windows: janela própria, atalho
no Menu Iniciar e atualização automática. O backend segue 100% na nuvem — o app
**não** roda o Next.js localmente, só abre o site numa janela nativa.

**Entrada:** o app sempre começa em `/login`. A landing (`/`, `/en`, `/es`) não
abre dentro do app — qualquer navegação pra ela é redirecionada pro login. O
resto (cadastro, sistema, páginas legais) funciona normal. O site público segue
acessível pelo navegador.

## Rodar em desenvolvimento

```bash
# 1. na RAIZ do repo, suba o site
npm run dev

# 2. em outro terminal
cd desktop
npm install
npm run dev        # abre o Electron apontando pra http://localhost:3000/login
```

`Ctrl+Shift+I` abre o DevTools (só em dev).

## Gerar o instalador

```bash
cd desktop
npm install
npm run build      # gera build/Nexus-Fi-Setup-<versão>.exe
```

Instalação por usuário (não pede admin).

## Publicar uma atualização

Feed = Releases do GitHub do repo público `guhrizzo/solucoesfinance`.

1. Suba `version` em `package.json`.
2. Crie `desktop/electron-builder.env` (gitignored) com `GH_TOKEN=<PAT com escopo public_repo>`.
3. `npm run release` — builda e cria uma release **rascunho** com `latest.yml` + `.exe` + `.blockmap`.
4. No GitHub, publique a release. Os apps instalados detectam em até 6h (ou na hora, em **Ajuda › Procurar atualizações**).

## Login

E-mail e senha funcionam direto no app. **O Google não**: ele recusa OAuth em
janela embutida (`accounts.google.com/signin/rejected`), e trocar o User-Agent
não resolve. Por isso o botão "Google" (login e cadastro) delega pro navegador
do sistema:

1. O site detecta o app (`window.nexusDesktop`, ver `lib/desktopBridge.ts`) e chama
   `loginWithBrowser()`; o app sobe um servidor em `127.0.0.1:<porta efêmera>` e abre
   `/entrar-dispositivo?porta=…&state=…` no navegador padrão.
2. Lá o usuário entra com o Google normalmente. A página troca o ID token por um
   código de uso único (`POST /api/desktop/code`, coleção `device_logins`, 2 min,
   guardado só o hash) e redireciona pra `http://127.0.0.1:<porta>/callback`.
3. O app valida o `state`, abre `/entrar-dispositivo/concluir?code=…` na própria
   janela, que resgata o código (`POST /api/desktop/exchange` → custom token do
   Firebase) e faz `signInWithCustomToken`. Cai no dashboard, mesmo uid.

A sessão é do Firebase Auth (IndexedDB) e persiste entre aberturas. Em dev, o app
imprime a URL do passo 1 no terminal.

**Importante:** o app carrega o site publicado, então o login com Google só
funciona depois que as rotas `/entrar-dispositivo` e `/api/desktop/*` estiverem
deployadas em produção.

## Ícone

`assets/icon.png` / `assets/icon.ico` são gerados por `scripts/make-icon.mjs` a
partir do `app/favicon.svg` do site. Para outra arte, ponha um
`assets/icon.source.png` quadrado (≥ 1024×1024) — ele tem prioridade — e rode
`npm run prebuild`.

## Limitações

1. Sem assinatura de código: o SmartScreen avisa na 1ª instalação (*Mais informações* → *Executar assim mesmo*).
2. Precisa de internet (sem conexão mostra tela de "tentar de novo").
3. Só Windows x64.
