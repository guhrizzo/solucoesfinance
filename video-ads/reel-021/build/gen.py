"""Reel 021 Clube (Maurício) no estilo v21. Gera cenas, index.html e o áudio a partir de voice/narr.*.

Uso (na pasta reel-021):  python build/tts.py  &&  python build/gen.py
Mapa das palavras (voice/narr.words.json): 0-9 gancho · 10-28 Maurício · 29-44 virada · 45-53 fechamento.
"""
import json, os, re, subprocess, wave
import numpy as np
import scipy.signal as sg

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
W = json.load(open("voice/narr.words.json", encoding="utf-8"))
assert len(W) == 54, "a narração precisa ter 54 palavras"
OFF = 0.45  # a voz começa 0,45 s depois do início do vídeo


def vt(i):
    return W[i]["start"] + OFF


END_V = W[-1]["end"] + OFF
TOTAL = round(END_V + 2.4, 2)
B = [0, vt(10) - 0.35, vt(29) - 0.3, vt(45) - 0.25]  # cortes (instante global)
XF = 0.25
STARTS = [0] + [b - XF for b in B[1:]]
ENDS = [b + XF for b in B[1:]] + [TOTAL]
NAMES = ["a", "b", "c", "d"]

FONTS = """
    @font-face { font-family: "Sora"; src: url("assets/fonts/sora.woff2") format("woff2"); font-weight: 100 900; }
    @font-face { font-family: "Hanken Grotesk"; src: url("assets/fonts/hanken-grotesk.woff2") format("woff2"); font-weight: 100 900; }
    @font-face { font-family: "JetBrains Mono"; src: url("assets/fonts/jetbrains-mono.woff2") format("woff2"); font-weight: 100 900; }
    #root { position: absolute; inset: 0; font-family: "Hanken Grotesk", sans-serif; color: #ffffff; }
    .card { background: #101a2e; border: 2px solid #22345a; border-radius: 34px; }
    .h { font-family: "Sora", sans-serif; font-weight: 800; letter-spacing: -0.02em; }
    .b { color: #5aa2ff; }
    .g { color: #4ade80; }
    .r { color: #ff7b7b; }
    .w { display: inline-block; }
"""

JS_HELPERS = """
    const up = (s, at, d = 0.6) => tl.fromTo(s, { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: d, ease: "power3.out" }, at);
    const pop = (s, at, d = 0.6) => tl.fromTo(s, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: d, ease: "back.out(1.7)" }, at);
    const ring = (s, x, y, at) => tl.fromTo(s, { x: x, y: y, scale: 0, opacity: 1 }, { scale: 1.9, opacity: 0, duration: 0.5, ease: "power2.out" }, at);
"""

CURSOR = '<svg class="cur" viewBox="0 0 24 24"><path d="M5 3l14 8-6 1.5L10 19z" fill="#ffffff" stroke="#0b1220" stroke-width="1.6" stroke-linejoin="round" /></svg>'


def tpl(i, body):
    S = STARTS[i]
    D = ENDS[i] - S
    body = re.sub(r"__T(\d+)__", lambda m: f"{vt(int(m.group(1))) - S:.2f}", body)
    return body.replace("__D__", f"{D:.2f}")


KINDS = ["push", "zoom", "whip"]  # A→B, B→C, C→D
ENTER = {
    "push": 'tl.fromTo("#root", { y: 1920 }, { y: 0, duration: 0.5, ease: "power3.inOut" }, 0);',
    "zoom": 'tl.fromTo("#root", { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: "power3.out" }, 0);',
    "whip": 'tl.fromTo("#root", { x: 1080 }, { x: 0, duration: 0.5, ease: "power3.inOut" }, 0);',
}
EXIT = {
    "push": 'tl.to("#root", { y: -1920, duration: 0.5, ease: "power3.inOut" }, __D__ - 0.5);',
    "zoom": 'tl.to("#root", { scale: 1.35, opacity: 0, duration: 0.5, ease: "power3.in" }, __D__ - 0.5);',
    "whip": 'tl.to("#root", { x: -1080, duration: 0.5, ease: "power3.inOut" }, __D__ - 0.5);',
}


def scene(i, css, html, js):
    name = NAMES[i]
    if i > 0:
        js += "\n    " + ENTER[KINDS[i - 1]]
    if i < len(NAMES) - 1:
        js += "\n    " + EXIT[KINDS[i]]
    doc = f"""<template>
  <style>{FONTS}{css}
  </style>
  <div id="root" data-composition-id="{name}" data-width="1080" data-height="1920">{html}
  </div>
  <script>
    const tl = gsap.timeline({{ paused: true }});{JS_HELPERS}{js}
    window.__timelines["{name}"] = tl;
  </script>
</template>
"""
    open(f"compositions/{name}.html", "w", encoding="utf-8").write(tpl(i, doc))


# ---------------------------------------------------------------- cena A: gancho
CROWN = ('<svg id="a-crown" width="150" height="110" viewBox="0 0 150 110" fill="none"><path d="M10 92L22 24l36 34 17-42 17 42 36-34 12 68z" '
         'fill="#5aa2ff" stroke="#9cc6ff" stroke-width="5" stroke-linejoin="round"/><rect x="10" y="94" width="130" height="12" rx="6" fill="#2f80ff"/></svg>')
scene(
    0,
    """
    .sm { position: absolute; left: 0; right: 0; text-align: center; font-family: "Sora", sans-serif; font-weight: 700; font-size: 62px; color: #c9d6ee; }
    .bg { position: absolute; left: 0; right: 0; text-align: center; font-family: "Sora", sans-serif; font-weight: 800; letter-spacing: -0.03em; line-height: 1; white-space: nowrap; }
    #a-s1 { top: 230px; } #a-b1 { top: 310px; font-size: 170px; color: #8aa0c4; }
    #a-s2 { top: 560px; } #a-b2 { top: 640px; font-size: 138px; color: #5aa2ff; }
    #a-track { position: absolute; left: 160px; top: 840px; width: 760px; height: 14px; border-radius: 7px; background: #1a2a4a; }
    #a-fill { position: absolute; left: 0; top: 0; height: 14px; width: 380px; border-radius: 7px; background: #5aa2ff; }
    #a-knob { position: absolute; left: 140px; top: 818px; width: 58px; height: 58px; border-radius: 50%; background: #ffffff; box-shadow: 0 8px 30px #1f6febaa; border: 6px solid #5aa2ff; }
    #a-crown { position: absolute; left: 465px; top: 930px; }
    #a-s3 { top: 1060px; } #a-b3 { top: 1130px; font-size: 190px; color: #ffffff; text-shadow: 0 0 60px #2f80ff99; }
    """,
    f"""
    <div id="a-s1" class="sm">Faturamento é</div><div id="a-b1" class="bg">ego.</div>
    <div id="a-s2" class="sm">Lucro é</div><div id="a-b2" class="bg">ajustável.</div>
    <div id="a-track"><div id="a-fill"></div></div><div id="a-knob"></div>
    {CROWN}
    <div id="a-s3" class="sm">Caixa é</div><div id="a-b3" class="bg">o <span class="b">rei.</span></div>
    """,
    """
    tl.fromTo("#a-b1", { scale: 1 }, { scale: 1.1, duration: 0.18, ease: "power2.out" }, __T2__);
    tl.to("#a-b1", { scale: 1, duration: 0.5, ease: "elastic.out(1, 0.5)" }, __T2__ + 0.18);
    tl.to(["#a-s1", "#a-b1"], { opacity: 0.3, duration: 0.5, ease: "power2.inOut" }, __T3__ - 0.1);
    up("#a-s2", __T3__ - 0.1, 0.45);
    tl.fromTo("#a-b2", { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, __T5__ - 0.2);
    tl.fromTo(["#a-track", "#a-knob"], { opacity: 0 }, { opacity: 1, duration: 0.4 }, __T5__);
    tl.to("#a-knob", { x: 520, duration: 0.9, ease: "power2.inOut" }, __T5__ + 0.2);
    tl.to("#a-fill", { width: 640, duration: 0.9, ease: "power2.inOut" }, __T5__ + 0.2);
    tl.to("#a-knob", { x: 260, duration: 0.7, ease: "power2.inOut" }, __T5__ + 1.2);
    tl.to("#a-fill", { width: 380, duration: 0.7, ease: "power2.inOut" }, __T5__ + 1.2);
    tl.to(["#a-s2", "#a-b2", "#a-track", "#a-knob"], { opacity: 0.3, duration: 0.5, ease: "power2.inOut" }, __T6__ - 0.15);
    up("#a-s3", __T6__ - 0.15, 0.45);
    tl.fromTo("#a-crown", { opacity: 0, y: -60, scale: 0.6 }, { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: "back.out(1.8)" }, __T9__ - 0.2);
    tl.fromTo("#a-b3", { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.55, ease: "back.out(1.6)" }, __T8__ - 0.1);
    """,
)

# ---------------------------------------------------------------- cena B: Maurício
cap = ["Faturava", "bem,", "mas", "não", "sabia", "pra", "onde", "o", "dinheiro", "ia."]
cap_idx = [19, 20, 21, 22, 23, 24, 25, 26, 27, 28]
cap_html = " ".join(
    f'<span id="b-w{k}" class="w{" b" if k >= 5 else ""}">{w}</span>' for k, w in enumerate(cap)
)
cap_js = "\n".join(
    f'    tl.fromTo("#b-w{k}", {{ opacity: 0, y: 24 }}, {{ opacity: 1, y: 0, duration: 0.3, ease: "power3.out" }}, __T{cap_idx[k]}__);'
    for k in range(len(cap))
)
UP = '<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8M15 7h6v6"/></svg>'
scene(
    1,
    """
    #b-photo { position: absolute; left: 90px; top: 210px; width: 900px; height: 589px; border-radius: 34px; overflow: hidden; border: 2px solid #22345a; box-shadow: 0 30px 90px #1f6feb44; }
    #b-img { position: absolute; left: 0; top: 0; width: 900px; height: 589px; -webkit-mask-image: linear-gradient(#000 78%, transparent 100%); mask-image: linear-gradient(#000 78%, transparent 100%); }
    #b-bar { position: absolute; left: 90px; top: 835px; width: 64px; height: 7px; border-radius: 4px; background: #5aa2ff; }
    #b-name { position: absolute; left: 90px; top: 860px; font-size: 104px; line-height: 1.05; }
    #b-role { position: absolute; left: 90px; top: 985px; font-size: 40px; font-weight: 700; color: #5aa2ff; }
    .tag { position: absolute; top: 700px; height: 96px; padding: 0 30px; display: flex; align-items: center; gap: 16px; border-radius: 28px; font-size: 38px; font-weight: 800; }
    #b-t1 { left: 120px; } #b-t2 { right: 120px; border-color: #7a2a2f; }
    #b-cap { position: absolute; left: 90px; top: 1085px; width: 900px; font-family: "Sora", sans-serif; font-weight: 700; font-size: 62px; line-height: 1.25; }
    """,
    f"""
    <div id="b-photo"><img id="b-img" src="assets/img/mauricio.png" alt="Maurício" /></div>
    <div id="b-t1" class="card tag">{UP}<span class="g">faturando bem</span></div>
    <div id="b-t2" class="card tag"><span class="r">pra onde foi?</span></div>
    <div id="b-bar"></div>
    <div id="b-name" class="h">Maurício</div>
    <div id="b-role">Dono do clube de tiro 021</div>
    <div id="b-cap">{cap_html}</div>
    """,
    f"""
    tl.fromTo("#b-photo", {{ opacity: 0, scale: 1.08 }}, {{ opacity: 1, scale: 1, duration: 0.7, ease: "power3.out" }}, 0.45);
    tl.fromTo("#b-bar", {{ scaleX: 0, transformOrigin: "0 50%" }}, {{ scaleX: 1, duration: 0.4, ease: "power2.out" }}, __T11__ - 0.2);
    up("#b-name", __T11__ - 0.15, 0.5);
    up("#b-role", __T12__ - 0.1, 0.5);
    pop("#b-t1", __T19__ - 0.1, 0.5);
{cap_js}
    pop("#b-t2", __T25__ - 0.1, 0.5);
    tl.to("#b-t1", {{ opacity: 0.35, duration: 0.4 }}, __T25__);
    tl.fromTo("#b-t2", {{ x: 0 }}, {{ x: 10, duration: 0.08, repeat: 3, yoyo: true, ease: "sine.inOut", immediateRender: false }}, __T27__);
    """,
)

# ---------------------------------------------------------------- cena C: virada (tela real)
scene(
    2,
    """
    #c-head { position: absolute; left: 0; right: 0; top: 220px; display: flex; align-items: center; justify-content: center; gap: 22px; }
    #c-na { font-family: "Sora", sans-serif; font-weight: 700; font-size: 64px; color: #9db6dc; }
    #c-logo { height: 120px; width: auto; }
    #c-frame { position: absolute; left: 109px; top: 420px; width: 862px; height: 691px; background: #0b1220; border: 2px solid #2a4f94; border-radius: 56px; box-shadow: 0 30px 90px #1f6feb55; }
    #c-screen { position: absolute; inset: 10px; border-radius: 46px; overflow: hidden; }
    #c-wrap { position: absolute; left: 0; top: 0; width: 842px; height: 671px; transform-origin: 0 0; }
    #c-img { position: absolute; left: 0; top: 0; width: 842px; height: 671px; }
    #c-ul { position: absolute; left: 126px; top: 556px; width: 394px; height: 8px; border-radius: 4px; background: #5aa2ff; box-shadow: 0 0 24px #5aa2ff; }
    .rg { position: absolute; width: 70px; height: 70px; margin: -35px 0 0 -35px; border: 5px solid #5aa2ff; border-radius: 50%; opacity: 0; }
    .cur { position: absolute; left: 0; top: 0; width: 56px; height: 56px; }
    .chip { position: absolute; top: 1170px; width: 418px; height: 120px; padding: 0 30px; display: flex; flex-direction: column; justify-content: center; gap: 4px; border-radius: 28px; }
    #c-chip1 { left: 109px; } #c-chip2 { left: 541px; }
    .chip b { font-family: "Sora", sans-serif; font-size: 40px; font-weight: 800; }
    .chip span { font-size: 28px; color: #8aa0c4; font-weight: 600; }
    """,
    f"""
    <div id="c-head"><span id="c-na">Com a</span><img id="c-logo" src="assets/img/nexus_fi_logo_branco.png" alt="NexusFi" /></div>
    <div id="c-frame">
      <div id="c-screen">
        <div id="c-wrap" data-layout-allow-overflow>
          <img id="c-img" src="assets/screens/fluxo-caixa.png" alt="Fluxo de caixa da NexusFi" />
          <div id="c-ul"></div>
        </div>
        <div id="c-r1" class="rg"></div>
        <div id="c-r2" class="rg"></div>
        {CURSOR}
      </div>
    </div>
    <div id="c-chip1" class="card chip"><b class="b">Viu pra onde foi</b><span>o faturamento</span></div>
    <div id="c-chip2" class="card chip"><b class="g">Passou a regular</b><span>o lucro</span></div>
    """,
    """
    tl.fromTo("#c-wrap", { scale: 1, x: 0, y: 0 }, { scale: 1.18, x: -40, y: -120, duration: 1.4, ease: "sine.inOut" }, __T33__);
    tl.fromTo(".cur", { x: 760, y: 560, opacity: 0 }, { x: 343, y: 610, opacity: 1, duration: 1.0, ease: "power2.inOut" }, __T34__);
    ring("#c-r1", 355, 617, __T38__);
    pop("#c-chip1", __T38__, 0.5);
    tl.to(".cur", { x: 680, y: 480, duration: 0.7, ease: "power2.inOut" }, __T41__ - 0.3);
    tl.fromTo("#c-ul", { scaleX: 0, transformOrigin: "0 50%" }, { scaleX: 1, duration: 0.7, ease: "power2.inOut" }, __T42__);
    ring("#c-r2", 692, 485, __T44__ - 0.1);
    pop("#c-chip2", __T44__ - 0.1, 0.5);
    """,
)

# ---------------------------------------------------------------- cena D: fechamento
scene(
    3,
    """
    #d-av { position: absolute; left: 430px; top: 230px; width: 220px; height: 220px; border-radius: 50%; border: 6px solid #5aa2ff; box-shadow: 0 0 60px #2f80ff77; background: url("assets/img/mauricio.png") -327px -127px / 900px auto no-repeat; }
    #d-t { position: absolute; left: 0; right: 0; top: 500px; text-align: center; font-size: 74px; line-height: 1.12; }
    #d-use { position: absolute; left: 0; right: 0; top: 760px; text-align: center; font-family: "Sora", sans-serif; font-weight: 700; font-size: 68px; }
    #d-logo { position: absolute; left: 260px; top: 840px; width: 560px; height: auto; }
    #d-btn { position: absolute; left: 190px; top: 1135px; width: 700px; height: 130px; border-radius: 70px; background: linear-gradient(135deg, #2f80ff, #1451b8); box-shadow: 0 25px 80px #1f6feb99; font-family: "Sora", sans-serif; font-weight: 800; font-size: 54px; display: flex; align-items: center; justify-content: center; }
    #d-url { position: absolute; left: 0; right: 0; top: 1290px; text-align: center; font-size: 34px; letter-spacing: 0.08em; color: #9db6dc; font-weight: 600; }
    #d-ring { position: absolute; width: 90px; height: 90px; margin: -45px 0 0 -45px; border: 6px solid #ffffff; border-radius: 50%; opacity: 0; }
    .cur { position: absolute; left: 0; top: 0; width: 64px; height: 64px; }
    #d-glow { position: absolute; left: -160px; top: 330px; width: 1400px; height: 1400px; border-radius: 50%; background: radial-gradient(#1f6feb55, transparent 62%); opacity: 0; }
    """,
    f"""
    <div id="d-glow"></div>
    <div id="d-av"></div>
    <div id="d-t" class="h"><div id="d-t1">Seja inteligente</div><div id="d-t2">como o <span class="b">Maurício.</span></div></div>
    <div id="d-use">Use a</div>
    <img id="d-logo" src="assets/img/nexus_fi_logo_branco.png" alt="NexusFi" />
    <div id="d-btn">Acesse agora →</div>
    <div id="d-url">nexusfi.com.br</div>
    <div id="d-ring"></div>
    {CURSOR}
    """,
    """
    tl.to("#d-glow", { opacity: 1, duration: 1.2 }, 0.2);
    pop("#d-av", __T45__ - 0.25, 0.55);
    up("#d-t1", __T45__ - 0.1, 0.5);
    up("#d-t2", __T47__ - 0.1, 0.5);
    tl.to(["#d-av", "#d-t"], { opacity: 0.45, duration: 0.5 }, __T50__ - 0.1);
    up("#d-use", __T50__ - 0.1, 0.45);
    pop("#d-logo", __T52__ - 0.15, 0.55);
    pop("#d-btn", __T53__ - 0.05, 0.5);
    up("#d-url", __T53__ + 0.2, 0.5);
    tl.fromTo(".cur", { x: 800, y: 1400, opacity: 0 }, { x: 560, y: 1215, opacity: 1, duration: 0.7, ease: "power2.inOut" }, __T53__ + 0.5);
    ring("#d-ring", 572, 1222, __T53__ + 1.3);
    tl.fromTo("#d-btn", { scale: 1 }, { scale: 0.95, duration: 0.1, ease: "power2.out", immediateRender: false }, __T53__ + 1.3);
    tl.to("#d-btn", { scale: 1, duration: 0.3, ease: "back.out(2)" }, __T53__ + 1.4);
    """,
)

# ---------------------------------------------------------------- fundo
H = TOTAL / 2
open("compositions/bg.html", "w", encoding="utf-8").write(f"""<template>
  <style>
    #root {{ position: absolute; inset: 0; background: radial-gradient(1200px 900px at 50% -10%, #14305f 0%, #070b14 65%); }}
    .gl {{ position: absolute; border-radius: 50%; }}
    #bg-g1 {{ left: 90px; top: 480px; width: 900px; height: 900px; background: radial-gradient(#1f6feb55, transparent 65%); }}
    #bg-g2 {{ left: -60px; top: -260px; width: 1200px; height: 800px; background: radial-gradient(#2f80ff33, transparent 65%); }}
    #bg-grid {{ position: absolute; left: -300px; right: -300px; bottom: 0; height: 520px; transform-origin: 50% 100%; transform: perspective(520px) rotateX(64deg);
      background: repeating-linear-gradient(90deg, #2a4f9455 0 2px, transparent 2px 100px), repeating-linear-gradient(0deg, #2a4f9455 0 2px, transparent 2px 80px);
      -webkit-mask-image: linear-gradient(transparent 0%, #000 70%); mask-image: linear-gradient(transparent 0%, #000 70%); }}
  </style>
  <div id="root" data-composition-id="bg" data-width="1080" data-height="1920">
    <div id="bg-g2" class="gl"></div>
    <div id="bg-g1" class="gl"></div>
    <div id="bg-grid"></div>
  </div>
  <script>
    const tl = gsap.timeline({{ paused: true }});
    tl.fromTo("#bg-g1", {{ scale: 1 }}, {{ scale: 1.14, duration: {H:.2f}, ease: "sine.inOut" }}, 0);
    tl.to("#bg-g1", {{ scale: 1, duration: {H:.2f}, ease: "sine.inOut" }}, {H:.2f});
    tl.fromTo("#bg-g2", {{ opacity: 0.7 }}, {{ opacity: 1, duration: {H:.2f}, ease: "sine.inOut" }}, 0);
    tl.to("#bg-g2", {{ opacity: 0.7, duration: {H:.2f}, ease: "sine.inOut" }}, {H:.2f});
    window.__timelines["bg"] = tl;
  </script>
</template>
""")

# ---------------------------------------------------------------- index.html
hosts = f'      <div id="bg" data-composition-id="bg" data-composition-src="compositions/bg.html" data-start="0" data-duration="{TOTAL}" data-track-index="0" data-track-kind="graphics" data-width="1080" data-height="1920"></div>\n'
for k, n in enumerate(NAMES):
    hosts += (f'      <div id="{n}" data-composition-id="{n}" data-composition-src="compositions/{n}.html" data-start="{STARTS[k]:.2f}" '
              f'data-duration="{ENDS[k] - STARTS[k]:.2f}" data-track-index="{k + 1}" data-track-kind="graphics" data-width="1080" data-height="1920"></div>\n')
hosts += f'      <audio id="mix" class="clip" src="assets/audio/mix.wav" data-start="0" data-duration="{TOTAL}" data-track-index="8" data-volume="1"></audio>\n'
open("index.html", "w", encoding="utf-8").write(f"""<!doctype html>
<html lang="pt-BR" data-resolution="portrait">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ margin: 0; width: 1080px; height: 1920px; overflow: hidden; background: #070b14; }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{TOTAL}" data-width="1080" data-height="1920">
{hosts}    </div>
    <script>
      const tl = gsap.timeline({{ paused: true }});
      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
""")

# ---------------------------------------------------------------- áudio: voz + trilha com ducking + whooshes + cliques
SR = 44100
rng = np.random.default_rng(11)
N = int(TOTAL * SR) + SR
mix = np.zeros(N)


def dec(p):
    return np.frombuffer(subprocess.check_output(["ffmpeg", "-loglevel", "error", "-i", p, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"]), np.float32).astype(np.float64)


def put(x, t, g=1.0):
    s = int(t * SR)
    m = min(len(x), N - s)
    if m > 0:
        mix[s:s + m] += g * x[:m]


def whoosh(d, f0, f1, peak, shimmer=0.15):
    n = int(SR * d)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    Bk = 1024
    win = np.hanning(Bk * 2)
    for i in range(0, n - Bk * 2, Bk):
        fc = f0 * (f1 / f0) ** ((i / n) ** 1.2)
        bw = fc * 0.8
        sos = sg.butter(2, [max(60, fc - bw / 2), min(SR / 2 - 100, fc + bw / 2)], btype="band", fs=SR, output="sos")
        out[i:i + Bk * 2] += sg.sosfilt(sos, noise[i:i + Bk * 2]) * win
    env = np.exp(-((t - peak) / (d * 0.2)) ** 2) * (1 - np.exp(-t * 45))
    out *= env
    tail = sg.sosfilt(sg.butter(2, 6000, "high", fs=SR, output="sos"), rng.standard_normal(n)) * np.exp(-((t - peak - 0.12) / 0.2) ** 2) * shimmer
    out += tail
    return out / np.abs(out).max()


def thump(d=0.7, f=58):
    t = np.arange(int(SR * d)) / SR
    return np.sin(2 * np.pi * (f + 90 * np.exp(-t * 18)) * t) * np.exp(-t * 6)


def blip(f=1700, d=0.07):
    t = np.arange(int(SR * d)) / SR
    return np.sin(2 * np.pi * f * t) * np.exp(-t * 55) + 0.4 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t * 80)


def music(total):
    n = int(SR * total)
    t = np.arange(n) / SR
    beat = 60 / 100
    chords = [(220.0, 261.63, 329.63), (174.61, 220.0, 261.63), (261.63, 329.63, 392.0), (196.0, 246.94, 293.66)]
    pad = np.zeros(n)
    bar = beat * 4
    for k in range(int(total / bar) + 1):
        a, b = int(k * bar * SR), min(n, int((k + 1) * bar * SR))
        if a >= n:
            break
        tt = t[a:b] - t[a]
        env = np.minimum(1, tt / 0.5) * np.minimum(1, (bar - tt) / 0.5)
        for f in chords[k % 4]:
            pad[a:b] += env * (np.sin(2 * np.pi * f * tt) + 0.4 * np.sin(2 * np.pi * f * 2 * tt + 0.3)) / 3
    bass = np.zeros(n); kick = np.zeros(n); hat = np.zeros(n)
    for k in range(int(total / beat) + 1):
        s = int(k * beat * SR)
        tt = np.arange(min(int(0.35 * SR), n - s)) / SR
        if len(tt) <= 0:
            break
        f = chords[(k // 4) % 4][0] / 2
        bass[s:s + len(tt)] += np.sin(2 * np.pi * f * tt) * np.exp(-tt * 5) * 0.8
        if k % 2 == 0:
            kick[s:s + len(tt)] += np.sin(2 * np.pi * (50 + 100 * np.exp(-tt * 30)) * tt) * np.exp(-tt * 9)
        s2 = s + int(beat / 2 * SR)
        hh = min(int(0.05 * SR), n - s2)
        if hh > 0:
            hat[s2:s2 + hh] += rng.standard_normal(hh) * np.exp(-np.arange(hh) / SR * 90) * 0.5
    hat = sg.sosfilt(sg.butter(2, 7000, "high", fs=SR, output="sos"), hat)
    m = 0.5 * pad + 0.55 * bass + 0.5 * kick + 0.25 * hat
    return m / np.abs(m).max()


put(dec("voice/narr.mp3"), OFF, 1.0)
nar_peak = np.abs(mix).max()
bed = music(TOTAL + 1)
voice_env = np.abs(mix[:len(bed)])
voice_env = sg.sosfilt(sg.butter(2, 6, "low", fs=SR, output="sos"), voice_env)
voice_env = np.clip(voice_env / (np.percentile(voice_env, 95) + 1e-9), 0, 1)
duck = 1 - 0.55 * voice_env
fade = np.minimum(1, np.arange(len(bed)) / (SR * 1.0)) * np.clip((TOTAL + 0.8 - np.arange(len(bed)) / SR) / 1.5, 0, 1)
mix[:len(bed)] += 0.15 * nar_peak * bed * duck * fade
kinds = ["leak", "zoom", "leak"]
for k, b in enumerate(B[1:]):
    if kinds[k] == "zoom":
        put(whoosh(0.8, 300, 7000, 0.45), b - 0.45, 0.15 * nar_peak)
        put(thump(), b - 0.02, 0.17 * nar_peak)
    else:
        put(whoosh(1.2, 250, 4500, 0.6, 0.35), b - 0.6, 0.15 * nar_peak)
put(thump(0.9, 50), vt(6) + 0.3, 0.2 * nar_peak)  # "caixa é o rei": impacto
for t_click in (vt(38), vt(44) - 0.1, vt(53) + 1.3):
    put(blip(1700, 0.07), t_click, 0.2 * nar_peak)
put(blip(900, 0.09), vt(25) - 0.05, 0.14 * nar_peak)  # "pra onde"
mix *= 0.92 / max(np.abs(mix).max(), 1e-9)
n_out = int(TOTAL * SR)
st = np.stack([mix[:n_out]] * 2, 1)
os.makedirs("assets/audio", exist_ok=True)
w = wave.open("assets/audio/mix.wav", "wb")
w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((st * 32767).astype(np.int16).tobytes()); w.close()
print(f"total={TOTAL}s cortes={[round(b, 2) for b in B]}")
