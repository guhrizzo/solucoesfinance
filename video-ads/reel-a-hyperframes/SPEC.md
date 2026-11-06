> **Atualização:** a versão atual usa o estilo do vídeo v21 (fundo azul-marinho com brilho, cartões de vidro, vazamentos de luz, trilha e whooshes) e voz em take único da ElevenLabs. As cenas são geradas por `build/gen.py` a partir do tempo das palavras da voz (`python build/gen.py <voz>`). As seções de look abaixo (fundo claro, Sora/Hanken) descrevem a primeira versão e estão desatualizadas.

# SPEC — Reel A "Quanto ficou de verdade?" (NexusFi)

GOAL:    o vendedor de marketplace entende em 3 s que faturamento não é lucro e, em 28 s, vê a NexusFi mostrar o que sobra; no fim clica em "7 dias grátis".
OUTPUT:  HyperFrames, 1080 x 1920 (9:16), 30 fps. Destino: Instagram Reels.
TIME:    28 s x 30 fps = 840 frames. Sem BPM (música baixa opcional, ver SOUND).

## Regras de verdade (não negociáveis)
- Nenhum número de mercado, nenhum "+N empresas", nenhum depoimento. Zero prova social inventada.
- Valores da cena 2 são ILUSTRATIVOS e levam o selo "exemplo" na tela durante toda a cena.
- Cenas 3 e 4 usam telas REAIS da NexusFi (gravação/screenshot da conta do Gustavo), com dados de clientes borrados.
- Antes de renderizar: confirmar com um pedido real do Mercado Livre que a venda entra como entrada e as taxas como saída "Taxas Marketplace" (lib/vendas.ts). Se não entrar, ajustar a fala da cena 3.
- "7 dias grátis, sem cartão" é verdade (lib/billingPlans.ts, TRIAL_DAYS = 7).

## LOOK
- Meio: interface de produto sobre papel liso de app (a própria linguagem visual da NexusFi, tema claro).
- Ground: #f6f7f9, cor chapada, sem gradiente, grão 0%, vinheta 0%.
- Ink: #16202e (todo texto lido). Muted: #5a6675 (legendas secundárias, selo "exemplo").
- Accent único: #1f6feb (azul da marca). Aparece em UM elemento por cena: S1 o "?", S2 o valor final, S3 o sublinhado da linha "Taxas Marketplace", S4 o saldo, S5 o botão.
- Cor do Mercado Livre #ffd000 só atrás do logo do ML na S2 (é a marca deles, usada como ela é).
- Display: Sora 700, 148 px nos ganchos, 104 px nas frases, tracking -2%. Fonte via @font-face em assets/fonts/sora.woff2 (copiar de app/fonts).
- Corpo/legenda: Hanken Grotesk 600, 44 px, tracking 0. Fonte em assets/fonts/hanken-grotesk.woff2.
- Números monetários: JetBrains Mono 700, 96 px (assets/fonts/jetbrains-mono.woff2), alinhados à direita.
- Sombra de card: offset 0/12 px, blur 32 px, #16202e a 10%. Raio 28 px. Nada de glass, glow ou gradiente.

## OBJECTS
- Card de venda: retângulo branco #ffffff, raio 28, sombra acima, logo do Mercado Livre (public/Logotipo_MercadoLivre.png) em chip #ffd000 no canto superior esquerdo do card, valor em mono.
- Chips de desconto: linhas brancas empilhadas dentro do card, cada uma com rótulo (Comissão, Tarifa, Frete) e valor negativo em #16202e.
- Moldura de tela: a captura da NexusFi dentro de moldura de celular simples (raio 56, borda 10 px #16202e), ocupando 78% da largura (842 px). Sem notch decorativo.
- Logo final: public/nexus_fi_logo_colorido.png, 520 px de largura, no centro do end card (não no canto).

## MOTION
- enter: power3.out, 18 frames. move: power2.inOut, 24 frames. exit: power2.in, 12 frames. camera/push-in: sine.inOut, 60 frames, escala 1.00 → 1.08.
- Stagger entre chips: 8 frames. Selo "?" : spring, damping 0.55, só em escala (nunca em opacidade).
- Um movimento herói por cena; secundários andam 60% da distância e começam 4–6 frames depois; o resto fica parado.
- Texto lido não se mexe durante a leitura. Janela mínima de leitura: 15 frames + 9 frames por palavra.

## SAFE ZONES (1080 x 1920)
- Nada nos primeiros 168 px. Todo texto e produto entre y = 168 e y = 1330.
- Abaixo de 1330 px só fundo liso (legenda do Instagram e botões ficam ali). Nenhum texto na coluna direita de 120 px (rail de ações).
- Legendas queimadas no fundo da faixa segura: baseline em y = 1280, máx. 5 palavras por linha, 44 px.

## SHOTS
Frame 0 já é o gancho (thumbnail): texto na tela, nunca preto, nunca logo.

| # | Frames | Tempo | Herói | O que o viewer lê | Som | Passagem |
|---|--------|-------|-------|-------------------|-----|----------|
| S1 | 0–90 | 0–3 s | "Vendeu 30 mil." linha 1, "Sobrou quanto?" linha 2, Sora 148 px, ocupa ~55% da largura útil. O "?" em #1f6feb faz spring de escala 0.6 → 1.0 no frame 20. | "Vendeu 30 mil. Sobrou quanto?" (legenda = mesma frase) | impacto curto no "?" (f20) | corte seco no f90, card sobe de baixo |
| S2 | 90–300 | 3–10 s | Card de venda entra (move, f90–114) com R$ 30.000 em mono. Três chips de desconto descem do card um a um (f126, f134, f142) e o valor do topo desce em contagem de R$ 30.000 até R$ 21.900 (f150–210). Selo "exemplo ilustrativo" fixo, 36 px muted, no topo do card. | "Comissão, tarifa, frete. Cada um num lugar." Valor final R$ 21.900 em #1f6feb fica parado de f220 a f300. | tick suave por chip (3) | o card sai para a esquerda (exit f288–300), tela da NexusFi entra da direita |
| S3 | 300–600 | 10–20 s | Captura real do Fluxo de Caixa em moldura de celular, 842 px de largura, centrada. Push-in 1.00 → 1.08 em 60 frames no foco da linha de entrada (f330–390), depois move até a linha "Taxas Marketplace" (f420–444) e um sublinhado #1f6feb se desenha da esquerda para a direita (f444–468). | "A venda entra no caixa. As taxas saem separadas." (f336–450). Segunda linha: "O saldo já mostra o que sobrou." (f480–600) | clique na entrada (f336), clique na saída (f444) | crossfade de 12 frames para o dashboard |
| S4 | 600–750 | 20–25 s | Mesma captura do Fluxo de Caixa (o dashboard da conta real mostra saldo negativo e dados reais: NÃO usar). Push-in até o cabeçalho "Outubro de 2026 +R$ 21.900,00" (f600–660), o total ganha moldura #1f6feb de 6 px. | "Sem planilha. Sem conferir repasse na mão." | whoosh curto no push (f600) | corte seco no f750 |
| S5 | 750–840 | 25–28 s | End card: logo colorido (520 px) centrado em y ≈ 600; abaixo "7 dias grátis · sem cartão" (Sora 104 px, #16202e) e botão retangular #1f6feb com "Link na bio" (texto branco, 48 px). Entra tudo junto no f750 (18 frames) e segura até o fim. | "Teste 7 dias grátis, sem cartão. Link na bio." | confirmação curta na entrada | segura o último frame |

## CAPTIONS
- Um host de legendas com todos os grupos. Estilo: Hanken Grotesk 600, 44 px, #16202e direto no ground, sem pílula e sem fundo.
- Legendas só em S2, S3 e S4, sincronizadas ao texto da coluna "O que o viewer lê". S1 e S5 já têm texto grande na tela: não duplicar.
- Variável de voz opcional: `assets/audio/vo.wav` (voz do Gustavo). Sem VO, o vídeo funciona mudo (texto na tela carrega tudo).

## SOUND
- 28 s conta uma história: SFX nas ações visíveis (lista acima, volume baixo, -18 dB).
- Música opcional: uma trilha instrumental discreta a -24 dB, sem letra, licença livre. Decidir depois do preview; padrão: sem música.

## VARIÁVEIS (Studio editável)
- `--hook-1` "Vendeu 30 mil." / `--hook-2` "Sobrou quanto?"
- `--val-total` 30.000 · `--val-comissao` 4.800 · `--val-tarifa` 1.200 · `--val-frete` 2.100 · `--val-liquido` 21.900 (todos exemplo)
- `--cta` "7 dias grátis · sem cartão" · `--cta-btn` "Link na bio"
- Mídia trocável: `assets/screens/fluxo-caixa.png` (ou .mp4), `assets/screens/dashboard.png`

## ASSETS QUE PRECISAM EXISTIR ANTES DE CONSTRUIR
1. `assets/screens/fluxo-caixa` — captura vertical da tela Fluxo de Caixa mostrando uma venda de marketplace como entrada e a linha "Taxas Marketplace" como saída. Borrar nomes/CPF/CNPJ de clientes.
2. (descartado) dashboard: a conta real mostra saldo negativo; a S4 reutiliza `fluxo-caixa.png`.
   Status: `assets/screens/fluxo-caixa.png` JÁ EXISTE (1004 x 800, recorte do filtro "Produto exemplo", sem totais reais da conta). Resolução baixa (captura 502 px de largura ampliada 2x): aceitável para o rascunho; para o render final, regravar em tela maior.
3. Opcional: `assets/audio/vo.wav` — voz do Gustavo lendo as falas.
4. Já existem no repo: `public/Logotipo_MercadoLivre.png`, `public/nexus_fi_logo_colorido.png`, fontes em `app/fonts/`.

## BANNED
Os padrões da lista geral (vazio escuro, glow, gradientes, vidro, três cards em fila, KPI grid, logo no canto, tudo centralizado e esmaecendo ao mesmo tempo) mais, para este filme:
- qualquer número de mercado, "+N empresas", depoimento, selo de "mais vendido" ou contador falso;
- urgência falsa ("só hoje", "últimas vagas");
- dados reais de clientes visíveis;
- texto sobre captura escurecida.
(Após o 1º render: listar o que apareceu por padrão e acrescentar aqui.)

## QA
- f0: gancho legível e já completo; nada preto, nenhum logo.
- f60: "?" em escala final, tudo dentro de y 168–1330.
- f210: valor líquido R$ 21.900 em azul, selo "exemplo" visível.
- f330: captura nítida, linha de entrada em destaque, texto ≥ 28 px.
- f460: sublinhado completo sobre "Taxas Marketplace".
- f640: saldo emoldurado no dashboard.
- f800: end card com logo, "7 dias grátis · sem cartão" e botão; nada na faixa abaixo de 1330 além do fundo liso.
- `npx hyperframes check --json` sem erros; `snapshot --review` e REVIEW.md ao final.
