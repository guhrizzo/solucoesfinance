import json, subprocess, shutil

O = 0.5          # sobreposicao entre cenas (transicao)
GAP = 0.35       # respiro entre o fim de uma fala e o inicio da proxima cena
files = [f'audio/{i}.mp3' for i in range(1, 6)] + ['audio/6b.mp3']
D = [float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f])) for f in files]
HOLD_LAST = 1.8
L = [d + GAP + O for d in D[:5]] + [D[5] + 0.5 + HOLD_LAST]
S = [0.0]
for i in range(5):
    S.append(S[i] + L[i] - O)
TOTAL = S[5] + L[5]
LINE_AT = [S[i] + (0.15 if i == 0 else 0.3) for i in range(6)]
json.dump({"O": O, "L": L, "S": S, "total": TOTAL, "line_at": LINE_AT, "D": D}, open('timeline.json', 'w'))
pass


def a(name, delay, d=0.7):
    return f'animation:{name} {d}s cubic-bezier(.2,.9,.3,1) {delay:.2f}s both;'


def up(txt, delay, cls=''):
    return f'<div class="{cls}" style="{a("up", delay)}">{txt}</div>'


CSS = open('style.css', encoding='utf-8').read() + '''
.sc{opacity:1!important}
.avrow{position:relative;width:900px;height:380px;display:flex;justify-content:center;align-items:center}
.avlogo{position:absolute;left:55px;top:70px;width:270px;height:270px;border-radius:50%;object-fit:cover;box-shadow:0 20px 60px #0008}
.avni{position:relative;z-index:2;width:360px;height:360px;border-radius:50%;border:8px solid #3b8bff;overflow:hidden;box-shadow:0 0 80px #1f6feb99;background:#000}
.avni img{width:100%;height:100%;object-fit:cover}
.tagsh{position:absolute;right:20px;top:30px;background:#fff;border-radius:22px;padding:14px 28px;transform:rotate(7deg);box-shadow:0 18px 50px #0007}
.tagsh img{height:62px;display:block}
.scis{position:absolute;z-index:3;left:600px;top:290px;width:98px;height:98px;border-radius:24px;background:#2f6bff;border:5px solid #0b1020;display:grid;place-items:center}
.card2{width:100%;background:#101a2e;border:2px solid #22345a;border-radius:34px;padding:34px 36px 26px}
.card2 .top{display:flex;justify-content:space-between;align-items:flex-start;text-align:left}
.card2 .lbl{font:600 28px Hanken;color:#8aa0c4}
.card2 .big{font:800 48px Sora;margin-top:4px}
.pill{background:#12392a;color:#4ade80;font:700 28px Hanken;padding:10px 22px;border-radius:999px}
.bars2{display:flex;align-items:flex-end;gap:20px;height:330px;margin-top:26px;position:relative}
.bars2 .c{flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%;position:relative}
.bars2 .c i{display:block;background:linear-gradient(#3f78d6,#1d4aa8);border-radius:12px 12px 4px 4px;transform-origin:bottom}
.bars2 .c.hi i{background:linear-gradient(#8ec0ff,#1f6feb);box-shadow:0 0 40px #3b8bff99}
.bars2 .tip{position:absolute;top:-52px;left:50%;transform:translateX(-50%);background:#fff;color:#10202c;font:700 26px Hanken;padding:6px 16px;border-radius:12px;white-space:nowrap}
.mos{display:flex;gap:20px;margin-top:14px}
.mos span{flex:1;font:500 24px Hanken;color:#6c7f9f;text-align:center}
.mos span.on{color:#fff;font-weight:700}
.chip2{border-radius:20px;padding:14px 26px;display:grid;place-items:center;min-height:90px}
.chip2.on{background:#fff}
.chip2.soon{border:2px dashed #34507f;color:#fff;font:700 28px Hanken;text-align:center;line-height:1.1}
.chip2.soon small{display:block;font:700 18px Hanken;color:#5aa2ff;letter-spacing:2px;margin-top:6px}
.seg{font:700 34px Hanken;letter-spacing:5px;color:#7fb0ff;text-transform:uppercase}
.checks{width:100%;display:flex;flex-direction:column;gap:20px}
.ck{display:flex;align-items:center;gap:26px;background:#101a2e;border:2px solid #22345a;border-radius:26px;padding:26px 34px;font:600 44px Hanken;text-align:left}
.ck i{width:62px;height:62px;border-radius:50%;background:#16a34a;display:grid;place-items:center;flex:none}
.cta2{background:linear-gradient(135deg,#2f80ff,#1451b8);padding:44px 90px;border-radius:999px;font:800 62px Sora;box-shadow:0 25px 80px #1f6feb99;white-space:nowrap}
.scrim{position:absolute;inset:0;background:linear-gradient(transparent 55%,#070b14ee)}
'''
CHECK = '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'


def page(i, inner, transparent=False):
    bg = 'html,body{background:transparent!important}' if transparent else ''
    open(f'sc{i}.html', 'w', encoding='utf-8').write(f'<!doctype html><meta charset=utf-8><style>{CSS}{bg}</style><body><section class="sc">{inner}</section>')


# 1 hook
page(1, f'''
<div class="glow"></div>
<div class="avrow">
 <img class="avlogo" src="atelie_logo.png" style="{a("pop", 0.1)}">
 <div class="avni" style="{a("pop", 0.2)}"><img src="ni_photo.png"></div>
 <div class="tagsh" style="{a("pop", 0.55)}"><img src="Shopee.svg"></div>
 <div class="scis" style="{a("pop", 0.7)}"><svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><circle cx="6" cy="6" r="2.6"/><circle cx="6" cy="18" r="2.6"/><path d="M8 7.5L20 18M8 16.5L20 6"/></svg></div>
</div>
{up("Ateliê da Ni", 0.45, "h1")}
{up("Uma empresa de sucesso", 0.9, "sub")}
<svg class="chart" viewBox="0 0 900 360" style="{a("fade", 1.1)}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b8bff" stop-opacity=".55"/><stop offset="1" stop-color="#3b8bff" stop-opacity="0"/></linearGradient></defs>
<path d="M0 320 C150 300 220 260 330 240 S520 170 620 120 S800 40 900 20 L900 360 L0 360Z" fill="url(#g)"/>
<path style="animation:draw 1.3s ease-out 1.0s both" d="M0 320 C150 300 220 260 330 240 S520 170 620 120 S800 40 900 20" fill="none" stroke="#5aa2ff" stroke-width="10" stroke-linecap="round"/>
<circle cx="900" cy="20" r="16" fill="#fff" style="{a("pop", 2.2, .4)}"/></svg>''')

# 2 pessoa (placeholder com foto; assemble.py usa clips de IA se existirem)
page(2, f'''
<div class="glow warn"></div>
<div class="kicker" style="{a("up", 0.1)}">Ela é inteligente</div>
<div class="stage2" style="{a("pop", 0.3, .8)}"><div class="ringp"><img src="face.jpg"></div></div>
{up("Crescer <b>sem organizar</b><br>as finanças é um <span class='red'>risco</span>.", 2.3, "h2")}''')
open('sc2.html', 'a', encoding='utf-8').write('<style>.stage2{width:640px;height:640px}.ringp{width:100%;height:100%;border-radius:50%;border:6px solid #3b8bff;overflow:hidden;box-shadow:0 30px 90px #1f6feb66}.ringp img{width:100%;height:100%;object-fit:cover;object-position:50% 20%}</style>')

# overlay transparente p/ quando houver clips de IA
page('2o', f'''
<div class="scrim"></div>
<div style="position:absolute;top:150px;left:0;right:0;text-align:center"><div class="kicker" style="{a("up", 0.1)};text-shadow:0 4px 30px #000">Ela é inteligente</div></div>
<div style="position:absolute;bottom:200px;left:60px;right:60px;text-align:center;{a("up", 2.4)}"><div class="h2" style="text-shadow:0 6px 40px #000">Crescer <b>sem organizar</b><br>as finanças é um <span class='red'>risco</span>.</div></div>''', True)

# 3 escolha
page(3, f'''
<div class="glow"></div>
<div class="kicker" style="{a("up", 0.1)}">Por isso, a Ni escolheu</div>
<img class="logo" src="nexus_fi_logo_branco.png" style="{a("pop", 0.35)}">
<div class="check" style="{a("pop", 0.9)}"><svg width="90" height="90" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>''')

# 4 painel
vals = [("Mar", 34), ("Abr", 48), ("Mai", 40), ("Jun", 62), ("Jul", 56), ("Ago", 74), ("Set", 68), ("Out", 96)]
bars = ''.join(f'<div class="c{" hi" if k == 7 else ""}"><i style="height:{h}%;animation:grow .8s ease-out {2.2 + k * 0.07:.2f}s both"></i>' + (f'<div class="tip" style="{a("pop", 3.1, .4)}">R$ 18,4k</div>' if k == 7 else '') + '</div>' for k, (_, h) in enumerate(vals))
mos = ''.join(f'<span class="{"on" if k == 7 else ""}">{m}</span>' for k, (m, _) in enumerate(vals))
page(4, f'''
<div class="glow"></div>
{up("Tudo em <b>um só lugar</b>", 0.1, "h2 sm")}
<div class="kpis">
 <div class="kpi" style="{a("up", 0.7)}"><span>Caixa</span><b class="g">R$ 48.230</b></div>
 <div class="kpi" style="{a("up", 1.3)}"><span>A receber</span><b class="b">R$ 21.900</b></div>
 <div class="kpi" style="{a("up", 1.9)}"><span>A pagar</span><b class="r">R$ 12.480</b></div>
</div>
<div class="card2" style="{a("up", 2.0)}">
 <div class="top"><div><div class="lbl">Faturamento mensal</div><div class="big">R$ 18,4 mil</div></div><div class="pill">↗ +38%</div></div>
 <div class="bars2">{bars}</div><div class="mos">{mos}</div>
</div>
<div class="chips">
 <div class="chip2 on" style="{a("up", 4.3)}"><img src="Logotipo_MercadoLivre.png" style="height:44px"></div>
 <div class="chip2 on" style="{a("up", 4.5)}"><img src="Shein.svg" style="height:58px"></div>
 <div class="chip2 soon" style="{a("up", 4.7)}">TikTok Shop<small>EM BREVE</small></div>
 <div class="chip2 soon" style="{a("up", 4.9)}">Shopee<small>EM BREVE</small></div>
</div>
<div class="note" style="{a("fade", 5.2)}">Imagens ilustrativas</div>''')

# 5 cobranca
page(5, f'''
<div class="glow"></div>
{up("Cobrança por <b>Pix</b> e <b>WhatsApp</b>", 0.1, "h2 sm")}
<div class="chat">
 <div class="msg in" style="{a("up", 0.6)}">Olá! Sua fatura vence hoje.<br>Pague pelo Pix copia e cola:</div>
 <div class="msg in pix" style="{a("up", 1.1)}">00020126…nexusfi</div>
 <div class="msg out" style="{a("up", 1.9)}">Pago ✅</div>
</div>
<div class="paid" style="{a("pop", 2.3)}">Recebido!</div>''')

# 6 CTA
ck = ''.join(f'<div class="ck" style="{a("up", 1.5 + k * 0.28)}"><i>{CHECK}</i>{t}</div>' for k, t in enumerate(["Finanças organizadas", "Cobrança no automático", "Mais tempo para criar"]))
page(6, f'''
<div class="glow big"></div>
<img class="logo s" src="nexus_fi_logo_branco.png" style="{a("pop", 0.1)}">
{up("Seja inteligente<br>como a <b>Ni</b>.", 0.45, "h1 sm")}
<div class="seg" style="{a("up", 1.3)}">O segredo do sucesso dela</div>
<div class="checks">{ck}</div>
<div class="cta2" style="{a("pop", 2.7)}">Use a NexusFi</div>
{up("nexusfi.com.br", 3.1, "url")}''')

# light leaks (sequencias locais de 0.9s)
def leak(name, side, y, c1, c2, c3):
    x0, x1 = ('-250px', '260px') if side == 0 else ('1330px', '820px')
    d = 0.9
    h = f'''<div class="lk" style="animation:fl {d}s linear 0s both">
 <div class="g a" style="left:{x0};top:{y - 800}px;animation:mv {d}s ease-in-out 0s both;--x0:{x0};--x1:{x1};background:radial-gradient(closest-side,{c1},{c2}99 55%,transparent)"></div>
 <div class="g b" style="left:{x0};top:{y - 450}px;animation:mv {d}s ease-in-out .04s both;--x0:{x0};--x1:{x1}"></div>
 <div class="g c" style="left:{x0};top:{y - 220}px;animation:mv {d}s ease-in-out .07s both;--x0:{x0};--x1:{x1};background:radial-gradient(closest-side,{c3},{c3}99 55%,transparent)"></div>
 <div class="wash" style="animation:ws {d}s ease-in-out 0s both"></div></div>'''
    css = '''*{margin:0}html,body{width:1080px;height:1920px;background:#000;overflow:hidden}
.lk{position:absolute;inset:0;opacity:0}.g{position:absolute;border-radius:50%;filter:blur(70px)}
.g.a{width:1500px;height:1600px}.g.b{width:900px;height:900px;background:radial-gradient(closest-side,#ffb347,#ff7a1888 60%,transparent)}.g.c{width:480px;height:480px}
.wash{position:absolute;inset:0;background:radial-gradient(circle at 50% 50%,#ffcf8a88,#ff8a4a33 60%,transparent);opacity:0}
@keyframes fl{0%{opacity:0}18%{opacity:.55}50%{opacity:1}62%{opacity:.8}80%{opacity:.55}100%{opacity:0}}
@keyframes mv{from{transform:translateX(0)}to{transform:translateX(calc(var(--x1) - var(--x0)))}}
@keyframes ws{0%,30%{opacity:0}50%{opacity:.85}70%,100%{opacity:0}}'''
    open(f'{name}.html', 'w', encoding='utf-8').write(f'<!doctype html><meta charset=utf-8><style>{css}</style><body>{h}')


leak('leakA', 0, 380, '#ff5a1f', '#ff2a5a', '#fff6d0')
leak('leakB', 1, 1200, '#5aa2ff', '#7a4dff', '#e8f3ff')
print(json.dumps({"S": [round(x, 2) for x in S], "L": [round(x, 2) for x in L], "total": round(TOTAL, 2)}))
