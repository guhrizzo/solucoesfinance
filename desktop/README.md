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

Sem cookie de sessão neste projeto: a sessão é do Firebase Auth dentro do
navegador embutido (IndexedDB), então persiste entre aberturas do app. O login
com Google usa o popup do Firebase (`signInWithPopup`); o app permite popups de
`*.firebaseapp.com` / `accounts.google.com` e remove o token `Electron/…` do
User-Agent, porque o Google recusa OAuth em navegador embutido que se anuncia
como Electron.

## Ícone

`assets/icon.png` / `assets/icon.ico` são gerados por `scripts/make-icon.mjs` a
partir do logo branco sobre fundo escuro — **provisório**. Para o oficial, ponha
um `assets/icon.source.png` quadrado (≥ 1024×1024) e rode `npm run prebuild`.

## Limitações

1. Sem assinatura de código: o SmartScreen avisa na 1ª instalação (*Mais informações* → *Executar assim mesmo*).
2. Precisa de internet (sem conexão mostra tela de "tentar de novo").
3. Só Windows x64.
