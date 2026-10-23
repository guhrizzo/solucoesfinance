import json

T = json.load(open('timing.json'))
start, dur = T['start'], T['dur']
S1, D1 = start[1], dur[1]


def a(name, delay, d=0.7):
    return f'animation:{name} {d}s cubic-bezier(.2,.9,.3,1) {S1 + delay:.2f}s both;'


person = '''
<svg viewBox="0 0 400 400" width="100%" height="100%">
  <ellipse cx="200" cy="175" rx="96" ry="112" fill="#2a1a16"/>
  <circle cx="200" cy="68" r="40" fill="#2a1a16"/>
  <rect x="177" y="245" width="46" height="70" rx="14" fill="#c4875f"/>
  <path d="M40 400 C40 330 120 298 200 298 C280 298 360 330 360 400Z" fill="#1f6feb"/>
  <path d="M200 298 L160 400 L240 400Z" fill="#f4f6fa"/>
  <path d="M200 310 L150 400 M200 310 L250 400" stroke="#1451b8" stroke-width="10" stroke-linecap="round"/>
  <path d="M168 300 Q200 330 232 300" fill="none" stroke="#c4875f" stroke-width="3"/>
  <ellipse cx="200" cy="185" rx="70" ry="82" fill="#d9a07c"/>
  <circle cx="130" cy="212" r="7" fill="#e9c46a"/><circle cx="270" cy="212" r="7" fill="#e9c46a"/>
  <path d="M128 178 C128 108 172 92 208 96 C248 100 274 126 272 180 C252 142 214 130 176 138 C152 144 138 158 128 178Z" fill="#2a1a16"/>
  <ellipse cx="172" cy="194" rx="6" ry="8.5" fill="#1b1b1b"/><ellipse cx="228" cy="194" rx="6" ry="8.5" fill="#1b1b1b"/>
  <circle cx="174" cy="191" r="2" fill="#fff"/><circle cx="230" cy="191" r="2" fill="#fff"/>
  <path d="M156 172 Q172 163 188 171 M212 171 Q228 163 244 172" fill="none" stroke="#2a1a16" stroke-width="5" stroke-linecap="round"/>
  <ellipse cx="150" cy="218" rx="14" ry="8" fill="#e5484d" opacity=".18"/><ellipse cx="250" cy="218" rx="14" ry="8" fill="#e5484d" opacity=".18"/>
  <path d="M174 226 Q200 252 226 226" fill="#fff" stroke="#8a3b3b" stroke-width="4" stroke-linejoin="round"/>
  <path d="M200 196 Q194 212 202 214" fill="none" stroke="#b97a58" stroke-width="3.5" stroke-linecap="round"/>
</svg>'''

bulb = '''<svg viewBox="0 0 48 48" width="110" height="110" fill="none" stroke-linecap="round" stroke-linejoin="round">
<path d="M24 5a13 13 0 0 0-7.5 23.6c1 .8 1.5 1.9 1.5 3.1V34h12v-2.3c0-1.2.5-2.3 1.5-3.1A13 13 0 0 0 24 5z" fill="#ffd34d" stroke="#b8860b" stroke-width="2"/>
<path d="M19 38h10M20.5 42h7" stroke="#8a94a2" stroke-width="3"/></svg>'''
rays = ''.join(f'<i style="--a:{ang}deg"></i>' for ang in range(-60, 61, 30))

docs = ''.join(
    f'<div class="doc sm" style="left:{x}px;top:{y}px;--r:{r}deg;{a("drop", 2.4 + k * 0.14)}"><i></i><i></i><i style="width:55%"></i></div>'
    for k, (x, y, r) in enumerate([(-30, 330, -14), (790, 300, 12), (-60, 120, -6), (830, 100, 9)]))

html = f'''
<section class="sc" style="animation:scin .4s {S1:.2f}s both, scout .35s {S1 + D1 - 0.35:.2f}s forwards">
<div class="glow warn"></div>
<div class="kicker" style="{a("up", 0.1)}">Ela é inteligente</div>
<div class="stage">
  <div class="docs2">{docs}</div>
  <div class="ring" style="{a("pop", 0.3, 0.8)}"><div class="person"><img src="face.jpg"></div></div>
  <div class="bulbwrap" style="{a("pop", 0.9, 0.7)}"><div class="rays">{rays}</div><div class="bulbbadge">{bulb}</div></div>
</div>
<div class="h2" style="{a("up", 2.3)}">Crescer <b>sem organizar</b><br>as finanças é um <span class="red">risco</span>.</div>
</section>'''

extra = '''
.stage{position:relative;width:900px;height:640px;display:grid;place-items:center}
.ring{position:relative;z-index:2;width:560px;height:560px;border-radius:50%;background:linear-gradient(160deg,#2a4f94,#122447);border:6px solid #3b8bff;overflow:hidden;box-shadow:0 30px 90px #1f6feb66;animation-name:pop}
.person{width:100%;height:100%}.person img{width:100%;height:100%;object-fit:cover;object-position:50% 20%;display:block}
.bulbwrap{position:absolute;z-index:3;right:70px;top:-10px;width:190px;height:190px;display:grid;place-items:center}
.bulbbadge{width:170px;height:170px;border-radius:50%;background:#fff;display:grid;place-items:center;box-shadow:0 0 90px #ffd34dcc}
.rays{position:absolute;inset:-30px}
.rays i{position:absolute;left:50%;top:50%;width:6px;height:36px;margin-left:-3px;background:#ffd34d;border-radius:4px;transform:rotate(var(--a)) translateY(-150px)}
.docs2{position:absolute;inset:0;z-index:1}
.doc.sm{width:170px;height:215px;padding:22px 18px;gap:14px;border-radius:14px}
.doc.sm i{height:11px}
.stage .ring{animation-name:pop,floaty}
@keyframes floaty{50%{transform:translateY(-14px)}}
'''
css = open('style.css', encoding='utf-8').read() + extra
open('scene2.html', 'w', encoding='utf-8').write(f'<!doctype html><meta charset=utf-8><style>{css}</style><body>{html}')

# light-leak overlay: bursts centred on each scene boundary
bursts = start[1:]
leaks = ''
for k, b in enumerate(bursts):
    t0 = b - 0.5
    leaks += f'''
<div class="burst" style="animation:lk 1.0s ease-in-out {t0:.2f}s both">
  <div class="blob o" style="animation:sweep 1.0s linear {t0:.2f}s both;--d:{1 if k % 2 == 0 else -1}"></div>
  <div class="blob p" style="animation:sweep 1.0s linear {t0 + 0.05:.2f}s both;--d:{1 if k % 2 == 0 else -1}"></div>
  <div class="blob y" style="animation:sweep 1.0s linear {t0 - 0.04:.2f}s both;--d:{1 if k % 2 == 0 else -1}"></div>
</div>'''
lcss = '''
*{margin:0}html,body{width:1080px;height:1920px;background:#000;overflow:hidden}
.burst{position:absolute;inset:0;opacity:0;filter:blur(60px)}
.blob{position:absolute;width:760px;height:2300px;top:-190px;left:50%;margin-left:-380px;border-radius:50%;mix-blend-mode:screen}
.blob.o{background:radial-gradient(closest-side,#ff8a1e,#ff8a1e00)}
.blob.p{background:radial-gradient(closest-side,#ff3d7f,#ff3d7f00);width:560px;margin-left:-280px}
.blob.y{background:radial-gradient(closest-side,#ffe27a,#ffe27a00);width:420px;margin-left:-210px}
@keyframes lk{0%{opacity:0}45%{opacity:1}100%{opacity:0}}
@keyframes sweep{from{transform:translateX(calc(var(--d)*-900px)) rotate(14deg)}to{transform:translateX(calc(var(--d)*900px)) rotate(14deg)}}
'''
open('leaks.html', 'w', encoding='utf-8').write(f'<!doctype html><meta charset=utf-8><style>{lcss}</style><body>{leaks}')
print(S1, D1, start)
