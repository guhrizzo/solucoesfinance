"""Gera as cenas do Reel A (estilo v21) a partir do tempo das palavras da voz.

Uso (na pasta reel-a-hyperframes):  python build/gen.py [eleven-marcos | eleven-luiz | eleven-diego | eleven-leandro | edge-francisca | edge-antonio]
Troca de voz = rodar de novo com outro nome: cenas, índice e áudio são regerados.
"""
import json, os, re, subprocess, sys, wave
import numpy as np
import scipy.signal as sg

VOICE = sys.argv[1] if len(sys.argv) > 1 else "edge-francisca"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
W = json.load(open(f"voice-samples/{VOICE}.words.json", encoding="utf-8"))
assert len(W) == 60, "o script da voz precisa ter 60 palavras"
OFF = 0.45  # a voz começa 0,45 s depois do início do vídeo


def vt(i):
    return W[i]["start"] + OFF


END_V = W[-1]["end"] + OFF
TOTAL = round(END_V + 2.0, 2)
# fronteiras entre cenas (instante global do corte, no silêncio entre frases)
B = [0, vt(11) - 0.35, vt(19) - 0.3, vt(32) - 0.25, vt(47) - 0.25]
XF = 0.25  # as cenas se sobrepõem 0,25 s de cada lado do corte
STARTS = [0] + [b - XF for b in B[1:]]
ENDS = [b + XF for b in B[1:]] + [TOTAL]
NAMES = ["a", "b", "c", "d", "e"]

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
    .mono { font-family: "JetBrains Mono", monospace; }
"""

JS_HELPERS = """
    const fmt = (n) => "R$ " + Math.round(n).toString().replace(/\\B(?=(\\d{3})+(?!\\d))/g, ".");
    const up = (s, at, d = 0.6) => tl.fromTo(s, { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: d, ease: "power3.out" }, at);
    const pop = (s, at, d = 0.6) => tl.fromTo(s, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: d, ease: "back.out(1.7)" }, at);
    const ring = (s, x, y, at) => tl.fromTo(s, { x: x, y: y, scale: 0, opacity: 1 }, { scale: 1.9, opacity: 0, duration: 0.5, ease: "power2.out" }, at);
"""

CHECK = '<svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>'
CURSOR = '<svg class="cur" viewBox="0 0 24 24"><path d="M5 3l14 8-6 1.5L10 19z" fill="#ffffff" stroke="#0b1220" stroke-width="1.6" stroke-linejoin="round" /></svg>'


def tpl(i, body):
    """Troca __T<n>__ (instante da palavra n, local à cena) e __D__ (duração da cena)."""
    S = STARTS[i]
    D = ENDS[i] - S
    body = re.sub(r"__T(\d+)__", lambda m: f"{vt(int(m.group(1))) - S:.2f}", body)
    body = body.replace("__D__", f"{D:.2f}")
    return body


KINDS = ["push", "zoom", "whip", "zoomin"]  # transição em cada corte (A→B, B→C, C→D, D→E)
ENTER = {
    "push": 'tl.fromTo("#root", { y: 1920 }, { y: 0, duration: 0.5, ease: "power3.inOut" }, 0);',
    "zoom": 'tl.fromTo("#root", { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: "power3.out" }, 0);',
    "whip": 'tl.fromTo("#root", { x: 1080 }, { x: 0, duration: 0.5, ease: "power3.inOut" }, 0);',
    "zoomin": 'tl.fromTo("#root", { scale: 1.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: "power3.out" }, 0);',
}
EXIT = {
    "push": 'tl.to("#root", { y: -1920, duration: 0.5, ease: "power3.inOut" }, __D__ - 0.5);',
    "zoom": 'tl.to("#root", { scale: 1.35, opacity: 0, duration: 0.5, ease: "power3.in" }, __D__ - 0.5);',
    "whip": 'tl.to("#root", { x: -1080, duration: 0.5, ease: "power3.inOut" }, __D__ - 0.5);',
    "zoomin": 'tl.to("#root", { scale: 0.85, opacity: 0, duration: 0.5, ease: "power3.in" }, __D__ - 0.5);',
}


def scene(i, css, html, js):
    name = NAMES[i]
    js = re.sub(r'\n\s*tl\.fromTo\("#root", \{ ?opacity: 0 ?\}, \{ ?opacity: 1, duration: 0\.3 ?\}, 0\);', "", js)
    js = re.sub(r'\n\s*tl\.to\("#root", \{ ?opacity: 0, duration: 0\.3 ?\}, __D__ - 0\.3\);', "", js)
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


# ---------------------------------------------------------------- cena A
cap_words = ["Você", "vendeu", "trinta", "mil", "reais", "no", "Mercado", "Livre."]
cap_html = " ".join(
    f'<span id="a-w{k}" class="w{" b" if k in (2, 3, 4) else ""}">{w}</span>' for k, w in enumerate(cap_words)
)
a_js_words = "\n".join(
    f'    tl.fromTo("#a-w{k}", {{ opacity: 0, y: 24 }}, {{ opacity: 1, y: 0, duration: 0.3, ease: "power3.out" }}, __T{k}__);'
    for k in range(2, 8)
)
scene(
    0,
    """
    #a-card { position: absolute; left: 90px; top: 250px; width: 900px; padding: 44px; }
    #a-row { display: flex; align-items: center; gap: 24px; }
    #a-chip { background: #ffffff; border-radius: 20px; padding: 12px 22px; display: flex; }
    #a-chip img { height: 56px; width: auto; }
    #a-t { flex: 1; font-size: 48px; font-weight: 700; }
    #a-ck { width: 64px; height: 64px; border-radius: 50%; background: #16a34a; display: grid; place-items: center; box-shadow: 0 10px 40px #16a34a88; }
    #a-amt { font-family: "Sora", sans-serif; font-variant-numeric: tabular-nums; font-weight: 800; font-size: 132px; line-height: 1.05; margin-top: 26px; letter-spacing: -0.03em; white-space: nowrap; }
    #a-note { font-size: 30px; color: #8aa0c4; margin-top: 6px; }
    #a-cap { position: absolute; left: 90px; top: 720px; width: 900px; text-align: center; font-family: "Sora", sans-serif; font-weight: 700; font-size: 68px; line-height: 1.25; }
    #a-q { position: absolute; left: 60px; top: 990px; width: 960px; text-align: center; font-family: "Sora", sans-serif; font-weight: 800; font-size: 124px; line-height: 1.1; letter-spacing: -0.02em; }
    #a-qm { display: inline-block; }
    """,
    f"""
    <div id="a-card" class="card">
      <div id="a-row">
        <div id="a-chip"><img src="assets/img/Logotipo_MercadoLivre.png" alt="Mercado Livre" /></div>
        <div id="a-t">Venda aprovada</div>
        <div id="a-ck">{CHECK}</div>
      </div>
      <div id="a-amt">R$ 30.000</div>
      <div id="a-note">valores de exemplo</div>
    </div>
    <div id="a-cap">{cap_html}</div>
    <div id="a-q"><span id="a-q1" class="w">Mas sobrou</span><br /><span id="a-q2" class="w b">quanto<span id="a-qm">?</span></span></div>
    """,
    f"""
    tl.fromTo("#a-ck", {{ scale: 0 }}, {{ scale: 1, duration: 0.45, ease: "back.out(2)" }}, 0.35);
{a_js_words}
    tl.fromTo("#a-card", {{ scale: 1 }}, {{ scale: 1.04, duration: 0.2, ease: "power2.out" }}, __T2__);
    tl.to("#a-card", {{ scale: 1, duration: 0.4, ease: "power2.out" }}, __T2__ + 0.2);
    tl.to("#a-card", {{ opacity: 0.35, scale: 0.94, duration: 0.4, ease: "power2.inOut" }}, __T8__ - 0.1);
    tl.to("#a-cap", {{ opacity: 0.25, duration: 0.4, ease: "power2.inOut" }}, __T8__ - 0.1);
    up("#a-q1", __T8__, 0.5);
    up("#a-q2", __T10__ - 0.1, 0.5);
    tl.fromTo("#a-qm", {{ scale: 1 }}, {{ scale: 1.5, duration: 0.14, ease: "power3.out" }}, __T10__ + 0.35);
    tl.to("#a-qm", {{ scale: 1, duration: 0.55, ease: "elastic.out(1, 0.55)" }}, __T10__ + 0.49);
    tl.to("#root", {{ opacity: 0, duration: 0.3 }}, __D__ - 0.3);
    """,
)

# ---------------------------------------------------------------- cena B
ICO = {
    "pct": '<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#5aa2ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.3"/><circle cx="17" cy="17" r="2.3"/></svg>',
    "tag": '<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#5aa2ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12V4h8l9 9-8 8z"/><circle cx="7.5" cy="8.5" r="1.4"/></svg>',
    "truck": '<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#5aa2ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6h11v10H2zM13 9h4l3 3v4h-7"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/></svg>',
}
fees = [("b-f1", "Comissão", "pct", "− R$ 4.800", "painel do Mercado Livre", 11, -520, 25200, 16),
        ("b-f2", "Tarifa", "tag", "− R$ 1.200", "extrato da conta", 12, 520, 24000, 17),
        ("b-f3", "Frete", "truck", "− R$ 2.100", "planilha", 13, -520, 21900, 18)]
fee_html = "".join(
    f'<div id="{fid}" class="card fee"><div class="ico">{ICO[ic]}</div><div class="mid"><div class="nm h">{nm}</div>'
    f'<div id="{fid}-g" class="tg">{tg}</div></div><div class="vl mono r">{vl}</div></div>'
    for fid, nm, ic, vl, tg, *_ in fees
)
b_js = ""
for fid, nm, ic, vl, tg, wi, dx, to, wt in fees:
    b_js += f'    tl.fromTo("#{fid}", {{ opacity: 0, x: {dx} }}, {{ opacity: 1, x: 0, duration: 0.55, ease: "power3.out" }}, __T{wi}__ - 0.1);\n'
prev = 30000
for fid, nm, ic, vl, tg, wi, dx, to, wt in fees:
    b_js += f'    tl.fromTo(st, {{ v: {prev} }}, {{ v: {to}, duration: 0.4, ease: "power2.inOut", onUpdate: render, immediateRender: false }}, __T{wi}__);\n'
    prev = to
cap2 = ["cada", "taxa", "num", "lugar", "diferente."]
cap2_html = " ".join(f'<span id="b-w{k}" class="w{" b" if k >= 3 else ""}">{w}</span>' for k, w in enumerate(cap2))
b_js += "".join(
    f'    tl.fromTo("#b-w{k}", {{ opacity: 0, y: 24 }}, {{ opacity: 1, y: 0, duration: 0.3, ease: "power3.out" }}, __T{14 + k}__);\n'
    for k in range(5)
)
for fid, nm, ic, vl, tg, wi, dx, to, wt in fees:
    sign = -1 if dx < 0 else 1
    b_js += f'    tl.to("#{fid}", {{ x: {sign * 36}, rotation: {sign * 1.6}, duration: 0.6, ease: "power2.inOut" }}, __T16__);\n'
    b_js += f'    tl.fromTo("#{fid}-g", {{ opacity: 0, y: 10 }}, {{ opacity: 1, y: 0, duration: 0.4, ease: "power2.out" }}, __T{wt}__ - 0.3);\n'
scene(
    1,
    """
    #b-top { position: absolute; left: 90px; top: 230px; width: 900px; padding: 30px 40px 36px; text-align: center; }
    #b-lbl { font-size: 36px; color: #8aa0c4; font-weight: 600; }
    #b-amt { font-family: "Sora", sans-serif; font-weight: 800; font-size: 130px; line-height: 1.1; letter-spacing: -0.03em; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .fee { position: absolute; left: 90px; width: 900px; height: 160px; padding: 0 36px; display: flex; align-items: center; gap: 28px; }
    #b-f1 { top: 580px; } #b-f2 { top: 770px; } #b-f3 { top: 960px; }
    .ico { width: 96px; height: 96px; border-radius: 26px; background: #1a2a4a; display: grid; place-items: center; flex: none; }
    .mid { flex: 1; }
    .nm { font-size: 54px; line-height: 1.1; }
    .tg { font-size: 30px; color: #8aa0c4; margin-top: 4px; opacity: 0; }
    .vl { font-size: 50px; font-weight: 800; }
    #b-cap { position: absolute; left: 90px; top: 1170px; width: 900px; text-align: center; font-family: "Sora", sans-serif; font-weight: 700; font-size: 64px; line-height: 1.2; }
    #b-glow { position: absolute; left: 90px; top: 480px; width: 900px; height: 900px; border-radius: 50%; background: radial-gradient(#e5484d44, transparent 65%); opacity: 0; }
    """,
    f"""
    <div id="b-glow"></div>
    <div id="b-top" class="card"><div id="b-lbl">Valor da venda · exemplo</div><div id="b-amt">R$ 30.000</div></div>
    {fee_html}
    <div id="b-cap">{cap2_html}</div>
    """,
    f"""
    const st = {{ v: 30000 }};
    const amt = document.querySelector("#b-amt");
    const render = () => {{ amt.textContent = fmt(st.v); }};
    tl.fromTo("#root", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.3 }}, 0);
    tl.to("#b-glow", {{ opacity: 1, duration: 0.8 }}, __T12__);
{b_js}    tl.to("#b-amt", {{ color: "#ff9b9b", duration: 0.3 }}, __T13__ + 0.3);
    tl.to("#root", {{ opacity: 0, duration: 0.3 }}, __D__ - 0.3);
    """,
)

# ---------------------------------------------------------------- cena C
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
    .chip { position: absolute; top: 1170px; width: 430px; height: 120px; padding: 0 30px; display: flex; flex-direction: column; justify-content: center; gap: 4px; border-radius: 28px; }
    #c-chip1 { left: 109px; } #c-chip2 { left: 541px; }
    .chip b { font-family: "JetBrains Mono", monospace; font-size: 46px; font-weight: 800; }
    .chip span { font-size: 28px; color: #8aa0c4; font-weight: 600; }
    """,
    f"""
    <div id="c-head"><span id="c-na">Na</span><img id="c-logo" src="assets/img/nexus_fi_logo_branco.png" alt="NexusFi" /></div>
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
    <div id="c-chip1" class="card chip"><b class="g">+ R$ 30.000</b><span>entrou no caixa</span></div>
    <div id="c-chip2" class="card chip"><b class="r">− R$ 8.100</b><span>taxas, separadas</span></div>
    """,
    """
    tl.fromTo("#root", { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0);
    tl.fromTo("#c-wrap", { scale: 1, x: 0, y: 0 }, { scale: 1.18, x: -40, y: -120, duration: 1.4, ease: "sine.inOut" }, __T22__);
    tl.fromTo(".cur", { x: 760, y: 560, opacity: 0 }, { x: 343, y: 610, opacity: 1, duration: 1.0, ease: "power2.inOut" }, __T22__ + 0.2);
    ring("#c-r1", 355, 617, __T26__);
    pop("#c-chip1", __T26__, 0.5);
    tl.to(".cur", { x: 680, y: 480, duration: 0.7, ease: "power2.inOut" }, __T27__ + 0.2);
    tl.fromTo("#c-ul", { scaleX: 0, transformOrigin: "0 50%" }, { scaleX: 1, duration: 0.7, ease: "power2.inOut" }, __T29__);
    ring("#c-r2", 692, 485, __T31__ - 0.1);
    pop("#c-chip2", __T31__ - 0.1, 0.5);
    tl.to("#root", { opacity: 0, duration: 0.3 }, __D__ - 0.3);
    """,
)

# ---------------------------------------------------------------- cena D
bars_html = "".join(
    f'<i id="d-bar{k}" style="height:{h}%"></i>' for k, h in enumerate([30, 38, 34, 50, 46, 64, 58, 100])
)
bars_js = "".join(
    f'    tl.fromTo("#d-bar{k}", {{ scaleY: 0 }}, {{ scaleY: 1, duration: 0.7, ease: "power3.out" }}, __T34__ + {k * 0.07:.2f});\n'
    for k in range(8)
)
GRID = '<svg width="120" height="120" viewBox="0 0 120 120" fill="none"><rect x="8" y="8" width="104" height="104" rx="18" stroke="#5aa2ff" stroke-width="7"/><path d="M8 44h104M8 78h104M44 8v104M78 8v104" stroke="#5aa2ff" stroke-width="6"/>__SL__</svg>'
LIST = '<svg width="120" height="120" viewBox="0 0 120 120" fill="none"><rect x="8" y="8" width="104" height="104" rx="18" stroke="#5aa2ff" stroke-width="7"/><path d="M28 40h14M54 40h40M28 62h14M54 62h40M28 84h14M54 84h40" stroke="#5aa2ff" stroke-width="7" stroke-linecap="round"/>__SL__</svg>'


def slash(n):
    return (f'<path id="d-s{n}h" d="M14 106L106 14" stroke="#101a2e" stroke-width="22" stroke-linecap="round"/>'
            f'<path id="d-s{n}" d="M14 106L106 14" stroke="#ff6b6b" stroke-width="10" stroke-linecap="round"/>')


scene(
    3,
    """
    #d-saldo { position: absolute; left: 90px; top: 230px; width: 900px; height: 560px; padding: 36px 44px; box-shadow: 0 30px 90px #16a34a33; }
    #d-lbl { font-size: 36px; color: #8aa0c4; font-weight: 600; }
    #d-amt { font-family: "Sora", sans-serif; font-weight: 800; font-size: 136px; line-height: 1.1; letter-spacing: -0.03em; color: #4ade80; white-space: nowrap; font-variant-numeric: tabular-nums; }
    #d-bars { position: absolute; left: 44px; right: 44px; bottom: 36px; height: 200px; display: flex; align-items: flex-end; gap: 18px; }
    #d-bars i { flex: 1; background: linear-gradient(#5aa2ff, #1f6feb); border-radius: 12px 12px 4px 4px; transform-origin: bottom; display: block; }
    #d-bars i:last-child { background: linear-gradient(#7dffb0, #16a34a); }
    .row { position: absolute; left: 90px; width: 900px; height: 170px; padding: 0 40px; display: flex; align-items: center; gap: 36px; }
    #d-r1 { top: 860px; } #d-r2 { top: 1060px; }
    .row .tx { font-family: "Sora", sans-serif; font-weight: 700; font-size: 54px; line-height: 1.15; }
    """,
    f"""
    <div id="d-saldo" class="card"><div id="d-lbl">Saldo do mês · exemplo</div><div id="d-amt">R$ 0</div><div id="d-bars">{bars_html}</div></div>
    <div id="d-r1" class="card row">{GRID.replace("__SL__", slash(1))}<div class="tx">Sem planilha</div></div>
    <div id="d-r2" class="card row">{LIST.replace("__SL__", slash(2))}<div class="tx">Sem conferir<br />repasse na mão</div></div>
    """,
    f"""
    tl.fromTo("#root", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.3 }}, 0);
    const st = {{ v: 0 }};
    const amt = document.querySelector("#d-amt");
    tl.fromTo(st, {{ v: 0 }}, {{ v: 21900, duration: 1.1, ease: "power2.out", onUpdate: () => {{ amt.textContent = fmt(st.v); }} }}, __T33__);
{bars_js}    ["#d-s1h", "#d-s1", "#d-s2h", "#d-s2"].forEach((s) => tl.set(s, {{ attr: {{ "stroke-dasharray": 140, "stroke-dashoffset": 140 }} }}, 0));
    pop("#d-r1", __T39__ - 0.1, 0.5);
    tl.to(["#d-s1h", "#d-s1"], {{ attr: {{ "stroke-dashoffset": 0 }}, duration: 0.35, ease: "power2.out" }}, __T40__);
    pop("#d-r2", __T42__ - 0.1, 0.5);
    tl.to(["#d-s2h", "#d-s2"], {{ attr: {{ "stroke-dashoffset": 0 }}, duration: 0.35, ease: "power2.out" }}, __T44__);
    tl.to("#root", {{ opacity: 0, duration: 0.3 }}, __D__ - 0.3);
    """,
)

# ---------------------------------------------------------------- cena E
scene(
    4,
    """
    #e-logo { position: absolute; left: 220px; top: 250px; width: 640px; height: auto; }
    #e-h1 { position: absolute; left: 0; right: 0; top: 560px; text-align: center; font-size: 150px; line-height: 1.05; }
    #e-pill { position: absolute; left: 290px; top: 960px; width: 500px; height: 110px; border-radius: 55px; background: #16a34a22; border: 2px solid #16a34a; color: #4ade80; font-size: 50px; font-weight: 800; display: flex; align-items: center; justify-content: center; gap: 16px; }
    #e-btn { position: absolute; left: 190px; top: 1120px; width: 700px; height: 150px; border-radius: 75px; background: linear-gradient(135deg, #2f80ff, #1451b8); box-shadow: 0 25px 80px #1f6feb99; font-family: "Sora", sans-serif; font-weight: 800; font-size: 58px; display: flex; align-items: center; justify-content: center; }
    #e-ring { position: absolute; width: 90px; height: 90px; margin: -45px 0 0 -45px; border: 6px solid #ffffff; border-radius: 50%; opacity: 0; }
    .cur { position: absolute; left: 0; top: 0; width: 64px; height: 64px; }
    #e-glow { position: absolute; left: -160px; top: 330px; width: 1400px; height: 1400px; border-radius: 50%; background: radial-gradient(#1f6feb55, transparent 62%); opacity: 0; }
    """,
    f"""
    <div id="e-glow"></div>
    <img id="e-logo" src="assets/img/nexus_fi_logo_branco.png" alt="NexusFi" />
    <div id="e-h1" class="h"><div id="e-l1">Grátis por</div><div id="e-l2" class="b">7 dias</div></div>
    <div id="e-pill"><span>✓</span><span>sem cartão</span></div>
    <div id="e-btn">Link na bio →</div>
    <div id="e-ring"></div>
    {CURSOR}
    """,
    """
    tl.fromTo("#root", { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0);
    tl.to("#e-glow", { opacity: 1, duration: 1.2 }, 0.2);
    up("#e-l1", __T51__ - 0.1, 0.5);
    up("#e-l2", __T53__ - 0.1, 0.5);
    pop("#e-pill", __T55__ - 0.1, 0.5);
    pop("#e-btn", __T57__ - 0.1, 0.5);
    tl.fromTo(".cur", { x: 800, y: 1400, opacity: 0 }, { x: 560, y: 1200, opacity: 1, duration: 0.7, ease: "power2.inOut" }, __T58__);
    ring("#e-ring", 572, 1207, __T59__ + 0.25);
    tl.fromTo("#e-btn", { scale: 1 }, { scale: 0.95, duration: 0.1, ease: "power2.out", immediateRender: false }, __T59__ + 0.25);
    tl.to("#e-btn", { scale: 1, duration: 0.3, ease: "back.out(2)" }, __T59__ + 0.35);
    """,
)

# ---------------------------------------------------------------- fundo e vazamentos de luz
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
    tl.fromTo("#bg-g1", {{ scale: 1 }}, {{ scale: 1.14, duration: {TOTAL / 2:.2f}, ease: "sine.inOut" }}, 0);
    tl.to("#bg-g1", {{ scale: 1, duration: {TOTAL / 2:.2f}, ease: "sine.inOut" }}, {TOTAL / 2:.2f});
    tl.fromTo("#bg-g2", {{ opacity: 0.7 }}, {{ opacity: 1, duration: {TOTAL / 2:.2f}, ease: "sine.inOut" }}, 0);
    tl.to("#bg-g2", {{ opacity: 0.7, duration: {TOTAL / 2:.2f}, ease: "sine.inOut" }}, {TOTAL / 2:.2f});
    window.__timelines["bg"] = tl;
  </script>
</template>
""")

blobs = ""
lk_js = ""
for k, b in enumerate(B[1:]):
    t0 = b - 0.5
    d = 1 if k % 2 == 0 else -1
    blobs += f'<div id="lk{k}" class="burst"><div id="lk{k}o" class="blob o"></div><div id="lk{k}p" class="blob p"></div><div id="lk{k}y" class="blob y"></div></div>'
    lk_js += f'    tl.fromTo("#lk{k}", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.45, ease: "sine.in" }}, {t0:.2f});\n'
    lk_js += f'    tl.to("#lk{k}", {{ opacity: 0, duration: 0.55, ease: "sine.out" }}, {t0 + 0.45:.2f});\n'
    for suffix, dt in (("o", 0), ("p", 0.05), ("y", -0.04)):
        lk_js += f'    tl.fromTo("#lk{k}{suffix}", {{ x: {-900 * d}, rotation: 14 }}, {{ x: {900 * d}, rotation: 14, duration: 1.0, ease: "none" }}, {t0 + dt:.2f});\n'
_unused = (f"""<template>
  <style>
    #root {{ position: absolute; inset: 0; }}
    .burst {{ position: absolute; inset: 0; opacity: 0; }}
    .blob {{ position: absolute; width: 760px; height: 2300px; top: -190px; left: 50%; margin-left: -380px; border-radius: 50%; mix-blend-mode: screen; }}
    .blob.o {{ background: radial-gradient(closest-side, #ff8a1e, #ff8a1e00); }}
    .blob.p {{ background: radial-gradient(closest-side, #ff3d7f, #ff3d7f00); width: 560px; margin-left: -280px; }}
    .blob.y {{ background: radial-gradient(closest-side, #ffe27a, #ffe27a00); width: 420px; margin-left: -210px; }}
  </style>
  <div id="root" data-composition-id="leaks" data-width="1080" data-height="1920">{blobs}</div>
  <script>
    const tl = gsap.timeline({{ paused: true }});
{lk_js}    window.__timelines["leaks"] = tl;
  </script>
</template>
""")

# ---------------------------------------------------------------- index.html
hosts = ""
hosts += f'      <div id="bg" data-composition-id="bg" data-composition-src="compositions/bg.html" data-start="0" data-duration="{TOTAL}" data-track-index="0" data-track-kind="graphics" data-width="1080" data-height="1920"></div>\n'
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


voice_file = f"voice-samples/{VOICE}.mp3"
put(dec(voice_file), OFF, 1.0)
nar_peak = np.abs(mix).max()
bed = music(TOTAL + 1)
voice_env = np.abs(mix[:len(bed)])
voice_env = sg.sosfilt(sg.butter(2, 6, "low", fs=SR, output="sos"), voice_env)
voice_env = np.clip(voice_env / (np.percentile(voice_env, 95) + 1e-9), 0, 1)
duck = 1 - 0.55 * voice_env
fade = np.minimum(1, np.arange(len(bed)) / (SR * 1.0)) * np.clip((TOTAL + 0.8 - np.arange(len(bed)) / SR) / 1.5, 0, 1)
mix[:len(bed)] += 0.15 * nar_peak * bed * duck * fade
kinds = ["leak", "leak", "zoom", "leak"]
for k, b in enumerate(B[1:]):
    if kinds[k] == "zoom":
        put(whoosh(0.8, 300, 7000, 0.45), b - 0.45, 0.15 * nar_peak)
        put(thump(), b - 0.02, 0.17 * nar_peak)
    else:
        put(whoosh(1.2, 250, 4500, 0.6, 0.35), b - 0.6, 0.15 * nar_peak)
for i in (11, 12, 13):  # taxas caindo
    put(blip(900, 0.09), vt(i) - 0.05, 0.14 * nar_peak)
for t_click in (vt(26), vt(31) - 0.1, vt(59) + 0.25):  # cliques do cursor
    put(blip(1700, 0.07), t_click, 0.2 * nar_peak)
mix *= 0.92 / max(np.abs(mix).max(), 1e-9)
n_out = int(TOTAL * SR)
st = np.stack([mix[:n_out]] * 2, 1)
os.makedirs("assets/audio", exist_ok=True)
w = wave.open("assets/audio/mix.wav", "wb")
w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((st * 32767).astype(np.int16).tobytes()); w.close()
print(f"voz={VOICE} total={TOTAL}s cortes={[round(b, 2) for b in B]}")
