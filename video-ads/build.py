import json, subprocess

D = [float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f'audio/{i}.mp3'])) for i in range(1, 7)]
PAD = 0.45
dur = [d + PAD for d in D]
start = [sum(dur[:i]) for i in range(6)]
TOTAL = sum(dur)
json.dump({"start": start, "dur": dur, "total": TOTAL}, open('timing.json', 'w'))


def sc(i, inner):
    s, d = start[i], dur[i]
    return f'<section class="sc" style="animation:scin .4s {s:.2f}s both, scout .35s {s+d-0.35:.2f}s forwards">{inner}</section>'


def a(name, delay, i):
    return f'animation:{name} .7s cubic-bezier(.2,.9,.3,1) {start[i]+delay:.2f}s both;'


def blk(i, txt, delay, cls=''):
    return f'<div class="{cls}" style="{a("up", delay, i)}">{txt}</div>'


S = []
# 1 hook
S.append(sc(0, f'''
<div class="glow"></div>
<div class="badge" style="{a("pop", 0.1, 0)}"><svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"><circle cx="6" cy="6" r="2.6"/><circle cx="6" cy="18" r="2.6"/><path d="M8 7.5L20 18M8 16.5L20 6"/></svg></div>
{blk(0, "Ateliê da Ni", 0.35, "h1")}
{blk(0, "Uma empresa de sucesso", 0.9, "sub")}
<svg class="chart" viewBox="0 0 900 360" style="{a("fade", 1.1, 0)}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b8bff" stop-opacity=".55"/><stop offset="1" stop-color="#3b8bff" stop-opacity="0"/></linearGradient></defs>
<path d="M0 320 C150 300 220 260 330 240 S520 170 620 120 S800 40 900 20 L900 360 L0 360Z" fill="url(#g)"/>
<path style="animation:draw 1.3s ease-out {start[0]+1.0:.2f}s both" d="M0 320 C150 300 220 260 330 240 S520 170 620 120 S800 40 900 20" fill="none" stroke="#5aa2ff" stroke-width="10" stroke-linecap="round"/></svg>'''))
# 2 smart / risk
docs = ''.join(f'<div class="doc" style="left:{x}px;top:{y}px;--r:{r}deg;{a("drop", 0.15 + k * 0.12, 1)}"><i></i><i></i><i style="width:55%"></i></div>' for k, (x, y, r) in enumerate([(80, 40, -9), (380, 0, 6), (620, 70, -4), (200, 230, 5), (520, 240, -8)]))
S.append(sc(1, f'''
<div class="glow warn"></div>
<div class="kicker" style="{a("up", 0.1, 1)}">Ela é inteligente</div>
<div class="docs">{docs}</div>
{blk(1, "Crescer <b>sem organizar</b><br>as finanças é um <span class='red'>risco</span>.", 1.2, "h2")}'''))
# 3 choice
S.append(sc(2, f'''
<div class="glow"></div>
<div class="kicker" style="{a("up", 0.1, 2)}">Por isso, a Ni escolheu</div>
<img class="logo" src="nexus_fi_logo_branco.png" style="{a("pop", 0.35, 2)}">
<div class="check" style="{a("pop", 0.9, 2)}"><svg width="90" height="90" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>'''))
# 4 dashboard
chips = ''.join(f'<div class="chip" style="{a("up", 2.6 + k * 0.18, 3)}"><img src="{src}" style="height:{h}px"></div>' for k, (src, h) in enumerate([("Logotipo_MercadoLivre.png", 44), ("TikTokShop.svg", 58), ("Shopee.svg", 58), ("Shein.svg", 58)]))
bars = ''.join(f'<i style="height:{h}%;animation:grow .8s ease-out {start[3] + 2.0 + k * 0.07:.2f}s both"></i>' for k, h in enumerate([35, 50, 42, 64, 58, 76, 70, 92]))
S.append(sc(3, f'''
<div class="glow"></div>
{blk(3, "Tudo em <b>um só lugar</b>", 0.1, "h2 sm")}
<div class="kpis">
 <div class="kpi" style="{a("up", 0.7, 3)}"><span>Caixa</span><b class="g">R$ 48.230</b></div>
 <div class="kpi" style="{a("up", 1.1, 3)}"><span>A receber</span><b class="b">R$ 21.900</b></div>
 <div class="kpi" style="{a("up", 1.5, 3)}"><span>A pagar</span><b class="r">R$ 12.480</b></div>
</div>
<div class="card" style="{a("up", 1.9, 3)}"><div class="bars">{bars}</div></div>
<div class="chips">{chips}</div>
<div class="note" style="{a("fade", 2.4, 3)}">Imagens ilustrativas</div>'''))
# 5 cobranca
S.append(sc(4, f'''
<div class="glow"></div>
{blk(4, "Cobrança por <b>Pix</b> e <b>WhatsApp</b>", 0.1, "h2 sm")}
<div class="chat">
 <div class="msg in" style="{a("up", 0.6, 4)}">Olá! Sua fatura vence hoje.<br>Pague pelo Pix copia e cola:</div>
 <div class="msg in pix" style="{a("up", 1.1, 4)}">00020126…nexusfi</div>
 <div class="msg out" style="{a("up", 1.9, 4)}">Pago ✅</div>
</div>
<div class="paid" style="{a("pop", 2.2, 4)}">Recebido!</div>'''))
# 6 CTA
S.append(sc(5, f'''
<div class="glow big"></div>
<img class="logo s" src="nexus_fi_logo_branco.png" style="{a("pop", 0.1, 5)}">
{blk(5, "Seja inteligente<br>como a Ni.", 0.5, "h1 sm")}
<div class="cta" style="{a("pop", 1.4, 5)}">Teste grátis por 7 dias</div>
{blk(5, "nexusfi.com.br", 2.0, "url")}'''))
css = open('style.css', encoding='utf-8').read()
open('index.html', 'w', encoding='utf-8').write(f'<!doctype html><meta charset=utf-8><style>{css}</style><body>{"".join(S)}')
print(TOTAL)
