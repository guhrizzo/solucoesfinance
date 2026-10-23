import json
T = json.load(open('timeline.json'))
S, L, TOTAL, PRE = T['S'], T['L'], T['total'], T['pre']
FADE = 0.45


def a(name, delay, d=0.7):
    return f'animation:{name} {d}s cubic-bezier(.2,.9,.3,1) {delay:.2f}s both;'


def kf(i):
    l = L[i]
    p1, p2 = FADE / l * 100, (l - FADE) / l * 100
    st = '0%{opacity:1}' if i == 0 else f'0%{{opacity:0;filter:blur(14px);transform:scale(1.04)}}{p1:.3f}%{{opacity:1;filter:none;transform:none}}'
    en = '100%{opacity:1}' if i == 5 else f'{p2:.3f}%{{opacity:1;filter:none;transform:none}}100%{{opacity:0;filter:blur(14px);transform:scale(.97)}}'
    return f'@keyframes sc{i}{{{st}{en}}}'


def scene(i, inner):
    return f'<section class="sc" style="animation:sc{i} {L[i]:.3f}s linear {S[i]:.3f}s both">{inner}</section>'


def word(txt, delay, cls=''):
    return f'<span class="w {cls}" style="{a("wup", delay, .55)}">{txt}</span>'


# ---- cena 1: gancho (texto + linha, depois texto + barras)
s = S[0]; v = PRE + 0.05
t2 = s + v + 2.9
tout = s + v + 2.5
bars = ''.join(f'<i style="height:{h}px;animation:grow .7s cubic-bezier(.2,.9,.3,1) {t2 + 0.3 + k * 0.22:.2f}s both"></i>' for k, h in enumerate([60, 120, 190, 270, 360, 470]))
sc1 = f'''
<div style="animation:fadeout .45s ease {tout:.2f}s both">
<div class="txt1" style="top:330px">
 <div class="ln">{word("O", s + v)} {word("Ateliê", s + v + .08)} {word("da", s + v + .16)} {word("Ni", s + v + .24)}</div>
 <div class="ln">{word("está", s + v + .4)} {word("em", s + v + .48)} {word("constante", s + v + .56)}</div>
 <div class="ln">{word("evolução", s + v + .85, "hl")}</div>
</div>
<svg class="lchart" viewBox="0 0 900 380" style="{a("fade", s + v + .3)}"><defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b82f6" stop-opacity=".5"/><stop offset="1" stop-color="#3b82f6" stop-opacity="0"/></linearGradient></defs>
<path d="M0 320 C150 305 230 270 340 250 S530 190 640 140 S800 60 880 40 L880 380 L0 380Z" fill="url(#g1)" style="{a("fade", s + v + .8, 1)}"/>
<path style="animation:draw 1.6s ease-out {s + v + .5:.2f}s both" d="M0 320 C150 305 230 270 340 250 S530 190 640 140 S800 60 880 40" fill="none" stroke="#5ba0ff" stroke-width="8" stroke-linecap="round"/>
<circle cx="880" cy="40" r="13" fill="#fff" style="transform-box:fill-box;transform-origin:center;{a("pop", s + v + 2.05, .4)}"/></svg>
</div>
<div class="txt1" style="top:330px">
 <div class="ln">{word("mas", t2)} {word("esse", t2 + .1)} {word("avanço", t2 + .2)}</div>
 <div class="ln">{word("não", t2 + .45)} {word("acontece", t2 + .55)}</div>
 <div class="ln">{word("por acaso.", t2 + .95, "hl")}</div></div>
<div class="bars1" style="{a("fade", t2, .4)}">{bars}</div>
<div class="dot1" style="{a("pop", t2 + 2.15, .4)}"></div>'''

# ---- cena 2: pessoa
s = S[1]
sc2 = f'''
<div class="photo" style="{a("fade", s + 0.15, .7)}"><img id="clipimg" src="clipa_0000.jpg"></div>
<div class="l3" style="{a("l3in", s + 0.7, .6)}">
 <div class="dash"></div>
 <div class="name">Ni</div>
 <div class="role">Fundadora do Ateliê da Ni</div>
</div>
<div class="alogo" style="{a("pop", s + 0.9, .5)}"><img src="atelie_logo_sq.png"></div>
<div class="mk">
 <span style="{a("pop", s + 1.9, .45)}"><img src="../Logotipo_MercadoLivre.png" style="height:40px"></span>
 <span style="{a("pop", s + 2.15, .45)}"><img src="../Shein.svg" style="height:44px"></span>
 <span style="{a("pop", s + 2.4, .45)}"><img src="../TikTokShop.svg" style="height:44px"></span>
 <span style="{a("pop", s + 2.65, .45)}"><img src="../Shopee.svg" style="height:46px"></span>
</div>'''

# ---- cena 3: pilares
s = S[2]
IC = {'t': '<svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="#fff"/></svg>',
      'g': '<svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>',
      'u': '<svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17l6-6 4 4 6-7"/><path d="M15 8h5v5"/></svg>'}
pil = ''
for k, (ic, t, sub) in enumerate([('t', 'Estratégia', 'para onde ir'), ('g', 'Gestão', 'como chegar lá'), ('u', 'Finanças', 'o que sustenta tudo')]):
    d = s + PRE + 0.5 + k * 0.85
    pil += f'<div class="pil" style="{a("up", d, .6)}"><i>{IC[ic]}</i><div><b>{t}</b><small>{sub}</small></div></div>'
sc3 = f'''<div class="pils">{pil}</div>
<div class="juntos"><div style="{a("wup", s + PRE + 3.0, .6)}">devem caminhar</div><div class="hl" style="{a("wup", s + PRE + 3.35, .6)}">juntos.</div></div>'''

# ---- cena 4: tudo em um so lugar
s = S[3]
vals = [34, 48, 40, 62, 56, 74, 68, 96]; mos = ['Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out']
dbars = ''.join(f'<div class="c{" hi" if k == 7 else ""}"><i style="height:{h}%;animation:grow .8s ease-out {s + PRE + 2.0 + k * 0.07:.2f}s both"></i>' + (f'<div class="tip" style="{a("pop", s + PRE + 2.9, .4)}">R$ 18,4k</div>' if k == 7 else '') + '</div>' for k, h in enumerate(vals))
dmos = ''.join(f'<span class="{"on" if k == 7 else ""}">{m}</span>' for k, m in enumerate(mos))
sc4 = f'''
<div class="h4" style="{a("up", s + 0.1, .6)}">Tudo em <b>um só lugar</b></div>
<div class="shot" style="{a("up", s + PRE + 0.5, .7)}">
 <div class="kp"><div style="{a("up", s + PRE + 0.8, .5)}"><span>Caixa</span><b class="g">R$ 48.230</b></div><div style="{a("up", s + PRE + 1.2, .5)}"><span>A receber</span><b class="b">R$ 21.900</b></div><div style="{a("up", s + PRE + 1.6, .5)}"><span>A pagar</span><b class="r">R$ 12.480</b></div></div>
 <div class="card2"><div class="top"><div><div class="lbl">Faturamento mensal</div><div class="big">R$ 18,4 mil</div></div><div class="pill">↗ +38%</div></div>
 <div class="bars2">{dbars}</div><div class="mos">{dmos}</div></div>
</div>
<div class="chips"><div class="chip2 on" style="{a("up", s + PRE + 3.4, .5)}"><img src="../Logotipo_MercadoLivre.png" style="height:40px"></div><div class="chip2 on" style="{a("up", s + PRE + 3.6, .5)}"><img src="../Shein.svg" style="height:50px"></div><div class="chip2 soon" style="{a("up", s + PRE + 3.8, .5)}">TikTok Shop<small>EM BREVE</small></div><div class="chip2 soon" style="{a("up", s + PRE + 4.0, .5)}">Shopee<small>EM BREVE</small></div></div>
<div class="note" style="{a("fade", s + PRE + 4.2, .5)}">Imagens ilustrativas</div>'''

# ---- cena 5: cobranca
s = S[4]
sc5 = f'''
<div class="h4" style="{a("up", s + 0.1, .6)}">Cobrança por <b>Pix</b> e <b>WhatsApp</b></div>
<div class="chat">
 <div class="msg in" style="{a("up", s + PRE + 0.4, .5)}">Olá! Sua fatura vence hoje.<br>Pague pelo Pix copia e cola:</div>
 <div class="msg in pix" style="{a("up", s + PRE + 0.9, .5)}">00020126…nexusfi</div>
 <div class="msg out" style="{a("pop", s + PRE + 1.7, .5)}">Pago ✅</div>
</div>
<div class="paid" style="{a("pop", s + PRE + 2.1, .6)}">Recebido!</div>'''

# ---- cena 6: CTA
s = S[5]
sc6 = f'''
<div class="ring" style="{a("fade", s + 0.3, 1)}"></div>
<div class="cta">
 <div class="smart" style="{a("up", s + 0.1, .6)}">Seja inteligente como a <b>Ni</b>.</div>
 <div class="usea" style="{a("up", s + PRE + 1.5, .6)}">Use a</div>
 <img class="clogo" src="../nexus_fi_logo_branco.png" style="{a("pop", s + PRE + 1.8, .7)}">
 <div class="btn" style="{a("pop", s + PRE + 2.4, .6)}">Acesse agora &rarr;</div>
 <div class="url" style="{a("fade", s + PRE + 3.0, .6)}">nexusfi.com.br</div>
</div>'''
dots = ''.join(f'<i style="left:{(k * 137) % 1000 + 40}px;top:{1180 + (k * 89) % 620}px;animation:tw 2.2s ease-in-out {(k * 0.37):.2f}s infinite"></i>' for k in range(26))

CSS = open('style_n14.css', encoding='utf-8').read()
html = f'<!doctype html><meta charset=utf-8><style>{CSS}{"".join(kf(i) for i in range(6))}</style><body><div class="bgglow"></div><div class="grid"></div><div class="dots">{dots}</div>' + ''.join(scene(i, x) for i, x in enumerate([sc1, sc2, sc3, sc4, sc5, sc6]))
open('video.html', 'w', encoding='utf-8').write(html)
print('ok', TOTAL)
