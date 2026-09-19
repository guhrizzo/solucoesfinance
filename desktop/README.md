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
npm run build      # gera build/Nexus-Fi-Setup.exe (nome fixo, sem versão)
```

Instalação por usuário (não pede admin).

## Publicar uma atualização

Feed = Releases do GitHub do repo público `guhrizzo/solucoesfinance`.

1. Suba `version` em `package.json`.
2. Crie `desktop/electron-builder.env` (gitignored) com `GH_TOKEN=<PAT com escopo public_repo>`.
3. `npm run release` — builda e cria uma release **rascunho** com `latest.yml` + `.exe` + `.blockmap`, e põe o SHA-256 nas notas. Avisa se o `.exe` não estiver assinado.
4. No GitHub, publique a release. Os apps instalados detectam em até 6h (ou na hora, em **Ajuda › Procurar atualizações**).

O botão "Baixar para Windows" da landing aponta pra `releases/latest/download/Nexus-Fi-Setup.exe`
(`lib/desktopDownload.ts`), então ele só funciona depois que existir uma release **publicada**.

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

## Assinatura de código (Windows / SmartScreen)

O aviso "O Windows protegeu o computador" aparece porque o instalador não tem
assinatura digital (Authenticode). Não existe configuração de build que o
remova — só assinar (ou distribuir pela Microsoft Store). Enquanto não assina,
cada versão nova é um arquivo "desconhecido" pro SmartScreen.

Caminhos, do mais simples ao mais caro:

1. **Microsoft Store (MSIX)** — conta de desenvolvedor pessoal ~US$ 19 (uma vez).
   A Microsoft assina e distribui; sem aviso e com atualização pela loja. Exige
   trocar o alvo `nsis` por `appx` no `electron-builder.yml` e passar pela
   certificação da loja.
2. **Azure Artifact Signing** (antigo Trusted Signing) — ~US$ 10/mês, sem token
   físico, reputação da Microsoft. Confira se o seu país/tipo de conta é elegível
   antes. No electron-builder: `win.azureSignOptions` + variáveis `AZURE_*`.
3. **Certificado de uma CA** (Sectigo, DigiCert, SSL.com…) — desde 2023 a chave fica
   em token/HSM. **EV** dá reputação imediata; **OV** precisa acumular reputação.

Com um certificado `.pfx`/`.p12`, basta definir antes do build e o electron-builder
assina sozinho (o `npm run release` mostra o status da assinatura):

```bash
set CSC_LINK=C:\caminho\certificado.pfx
set CSC_KEY_PASSWORD=<senha>
npm run release
```

Nunca commite o certificado nem a senha. Quando o instalador estiver assinado,
remova o passo do aviso ("Se o Windows mostrar…") da seção de download da
landing (`messages/*/landing.json`, `downloadApp.step2`).

Enquanto isso: envie cada `.exe` novo em
https://www.microsoft.com/wdsi/filesubmission — reduz falso positivo do Defender
(não elimina o SmartScreen).

## Limitações

1. Sem assinatura de código: o SmartScreen avisa na 1ª instalação (*Mais informações* → *Executar assim mesmo*) — ver seção acima.
2. Precisa de internet (sem conexão mostra tela de "tentar de novo").
3. Só Windows x64.
