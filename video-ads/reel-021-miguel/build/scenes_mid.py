# ---------------------------------------------------------------- cena A: gancho (constante evolução / por acaso)
bars = [22, 34, 30, 48, 44, 66, 100]
bars_html = "".join(f'<i id="a-br{k}" style="height:{h}%"></i>' for k, h in enumerate(bars))
bars_js = "".join(
    f'    tl.fromTo("#a-br{k}", {{ scaleY: 0 }}, {{ scaleY: 1, duration: 0.6, ease: "power3.out" }}, __T10__ + {k * 0.12:.2f});\n'
    for k in range(len(bars))
)
scene(
    0,
    """
    .t1 { position: absolute; left: 0; right: 0; text-align: center; font-family: "Sora", sans-serif; font-weight: 800; letter-spacing: -0.03em; line-height: 1.05; font-size: 96px; }
    #a-l1 { top: 230px; } #a-l2 { top: 335px; } #a-l3 { top: 440px; } #a-l4 { top: 545px; font-size: 118px; }
    #a-chart { position: absolute; left: 90px; top: 800px; width: 900px; height: 400px; }
    #a-m1 { top: 280px; } #a-m2 { top: 385px; } #a-m3 { top: 490px; font-size: 128px; }
    #a-bars { position: absolute; left: 190px; right: 190px; top: 800px; height: 400px; display: flex; align-items: flex-end; gap: 22px; }
    #a-bars i { flex: 1; display: block; background: linear-gradient(#5aa2ff, #1f6feb); border-radius: 14px 14px 5px 5px; transform-origin: bottom; }
    #a-bars i:last-child { background: linear-gradient(#8ec1ff, #3a8bff); box-shadow: 0 0 50px #3a8bffaa; }
    """,
    f"""
    <div id="a-l1" class="t1">Tem empresas</div><div id="a-l2" class="t1">que estão sempre</div>
    <div id="a-l3" class="t1">em constante</div><div id="a-l4" class="t1 b">evolução</div>
    <svg id="a-chart" viewBox="0 0 900 400" fill="none">
      <defs><linearGradient id="a-gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a8bff" stop-opacity="0.45"/><stop offset="1" stop-color="#3a8bff" stop-opacity="0"/></linearGradient></defs>
      <path id="a-area" d="M20 370 C 200 350, 330 300, 470 250 S 740 130, 880 40 L880 400 L20 400 Z" fill="url(#a-gr)" opacity="0"/>
      <path id="a-line" d="M20 370 C 200 350, 330 300, 470 250 S 740 130, 880 40" stroke="#5aa2ff" stroke-width="9" stroke-linecap="round" pathLength="1"/>
      <circle id="a-pt" cx="880" cy="40" r="15" fill="#fff"/>
    </svg>
    <div id="a-m1" class="t1">mas esse avanço</div><div id="a-m2" class="t1">não acontece</div><div id="a-m3" class="t1 b">por acaso.</div>
    <div id="a-bars">{bars_html}</div>
    """,
    f"""
    tl.fromTo("#a-l1", {{ scale: 1 }}, {{ scale: 1.06, duration: 0.18, ease: "power2.out" }}, __T0__);
    tl.to("#a-l1", {{ scale: 1, duration: 0.5, ease: "elastic.out(1, 0.5)" }}, __T0__ + 0.18);
    up("#a-l2", __T2__ - 0.1, 0.5);
    up("#a-l3", __T5__ - 0.1, 0.5);
    up("#a-l4", __T7__ - 0.1, 0.55);
    tl.set("#a-line", {{ attr: {{ "stroke-dasharray": 1, "stroke-dashoffset": 1 }} }}, 0);
    tl.set("#a-pt", {{ opacity: 0 }}, 0);
    tl.to("#a-line", {{ attr: {{ "stroke-dashoffset": 0 }}, duration: 2.6, ease: "power1.inOut" }}, __T2__);
    tl.to("#a-area", {{ opacity: 1, duration: 1.2 }}, __T5__);
    tl.to("#a-pt", {{ opacity: 1, duration: 0.2 }}, __T2__ + 2.4);
    tl.to(["#a-l1", "#a-l2", "#a-l3", "#a-l4", "#a-chart"], {{ opacity: 0, y: -30, duration: 0.4, ease: "power2.in" }}, __T8__ - 0.35);
    up("#a-m1", __T8__ - 0.05, 0.5);
    up("#a-m2", __T11__ - 0.05, 0.5);
    tl.fromTo("#a-m3", {{ opacity: 0, scale: 0.7 }}, {{ opacity: 1, scale: 1, duration: 0.6, ease: "back.out(1.7)" }}, __T13__ - 0.05);
{bars_js}    """,
)

# ---------------------------------------------------------------- cena B: Maurício em movimento
cap = ["O", "sucesso", "acontece", "de", "dentro", "para", "fora."]
cap_idx = [19, 20, 21, 22, 23, 24, 25]
cap_html = " ".join(f'<span id="b-w{k}" class="w{" b" if k >= 3 else ""}">{w}</span>' for k, w in enumerate(cap))
cap_js = "\n".join(
    f'    tl.fromTo("#b-w{k}", {{ opacity: 0, y: 24 }}, {{ opacity: 1, y: 0, duration: 0.3, ease: "power3.out" }}, __T{cap_idx[k]}__);'
    for k in range(len(cap))
)
scene(
    1,
    """
    #b-card { position: absolute; left: 90px; top: 200px; width: 900px; height: 700px; border-radius: 34px; overflow: hidden; border: 2px solid #22345a; box-shadow: 0 30px 90px #1f6feb44; background: #0b1220; }
    #b-vid { position: absolute; left: 0; top: 0; width: 900px; height: 700px; object-fit: cover; -webkit-mask-image: linear-gradient(#000 80%, transparent 100%); mask-image: linear-gradient(#000 80%, transparent 100%); }
    #b-bar { position: absolute; left: 90px; top: 935px; width: 64px; height: 7px; border-radius: 4px; background: #5aa2ff; }
    #b-name { position: absolute; left: 90px; top: 958px; font-size: 104px; line-height: 1.05; }
    #b-role { position: absolute; left: 90px; top: 1082px; font-size: 40px; font-weight: 700; color: #5aa2ff; }
    #b-cap { position: absolute; left: 90px; top: 1170px; width: 900px; font-family: "Sora", sans-serif; font-weight: 700; font-size: 56px; line-height: 1.22; }
    """,
    f"""
    <div id="b-card" data-layout-allow-overflow><video id="b-vid" class="clip" src="assets/video/clip1.mp4" muted playsinline data-start="0" data-duration="__D__" data-track-index="0"></video></div>
    <div id="b-bar"></div>
    <div id="b-name" class="h">Maurício</div>
    <div id="b-role">Dono do clube de tiro 021</div>
    <div id="b-cap">{cap_html}</div>
    """,
    f"""
    tl.fromTo("#b-card", {{ opacity: 0, scale: 1.06 }}, {{ opacity: 1, scale: 1, duration: 0.7, ease: "power3.out" }}, 0.3);
    tl.fromTo("#b-bar", {{ scaleX: 0, transformOrigin: "0 50%" }}, {{ scaleX: 1, duration: 0.4, ease: "power2.out" }}, __T16__ - 0.2);
    up("#b-name", __T16__ - 0.15, 0.5);
    up("#b-role", __T17__ - 0.1, 0.5);
{cap_js}
    """,
)


# ---------------------------------------------------------------- cena C: estratégia / gestão / finanças
def ico(kind):
    paths = {
        "t": '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="#fff"/>',
        "g": '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
        "f": '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
    }
    return f'<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">{paths[kind]}</svg>'


pill = [("c-p1", "Estratégia", "para onde ir", "t", 27), ("c-p2", "Gestão", "como chegar lá", "g", 28), ("c-p3", "Finanças", "o que sustenta tudo", "f", 30)]
pill_html = "".join(
    f'<div id="{i}" class="card pill"><div class="ic">{ico(k)}</div><div><div class="pt h">{t}</div><div class="ps">{s}</div></div></div>'
    for i, t, s, k, _ in pill
)
pill_js = "".join(f'    pop("#{i}", __T{w}__ - 0.1, 0.5);\n' for i, t, s, k, w in pill)
scene(
    2,
    """
    #c-card { position: absolute; left: 90px; top: 200px; width: 900px; height: 480px; border-radius: 34px; overflow: hidden; border: 2px solid #22345a; box-shadow: 0 30px 90px #1f6feb44; background: #0b1220; }
    #c-vid { position: absolute; left: 0; top: 0; width: 900px; height: 480px; object-fit: cover; }
    .pill { position: absolute; left: 90px; width: 900px; height: 118px; padding: 0 30px; display: flex; align-items: center; gap: 26px; }
    #c-p1 { top: 715px; } #c-p2 { top: 850px; } #c-p3 { top: 985px; }
    .ic { width: 74px; height: 74px; border-radius: 50%; background: linear-gradient(135deg, #2f80ff, #1451b8); display: grid; place-items: center; flex: none; box-shadow: 0 8px 30px #1f6feb88; }
    .pt { font-size: 46px; line-height: 1.1; } .ps { font-size: 28px; color: #8aa0c4; font-weight: 600; }
    #c-link { position: absolute; left: 126px; top: 800px; width: 4px; height: 240px; background: #2a4f94; border-radius: 2px; transform-origin: 0 0; }
    #c-t { position: absolute; left: 0; right: 0; top: 1150px; text-align: center; }
    #c-t1 { font-family: "Sora", sans-serif; font-weight: 700; font-size: 62px; } #c-t2 { font-family: "Sora", sans-serif; font-weight: 800; font-size: 108px; line-height: 1.05; color: #5aa2ff; letter-spacing: -0.03em; }
    """,
    f"""
    <div id="c-card" data-layout-allow-overflow><video id="c-vid" class="clip" src="assets/video/clip2.mp4" muted playsinline data-start="0" data-duration="__D__" data-track-index="0"></video></div>
    <div id="c-link"></div>
    {pill_html}
    <div id="c-t"><div id="c-t1">devem caminhar</div><div id="c-t2">juntos.</div></div>
    """,
    f"""
    tl.fromTo("#c-card", {{ opacity: 0, scale: 1.06 }}, {{ opacity: 1, scale: 1, duration: 0.7, ease: "power3.out" }}, 0.3);
{pill_js}    tl.fromTo("#c-link", {{ scaleY: 0 }}, {{ scaleY: 1, duration: 0.8, ease: "power2.inOut" }}, __T30__);
    up("#c-t1", __T31__ - 0.1, 0.5);
    tl.fromTo("#c-t2", {{ opacity: 0, scale: 0.7 }}, {{ opacity: 1, scale: 1, duration: 0.6, ease: "back.out(1.7)" }}, __T33__ - 0.1);
    tl.fromTo(["#c-p1", "#c-p2", "#c-p3"], {{ scale: 1 }}, {{ scale: 1.03, duration: 0.25, ease: "power2.out", immediateRender: false }}, __T33__);
    tl.to(["#c-p1", "#c-p2", "#c-p3"], {{ scale: 1, duration: 0.5, ease: "elastic.out(1, 0.5)" }}, __T33__ + 0.25);
    """,
)

# ---------------------------------------------------------------- cena D: tudo em um só lugar
mods = [("d-m1", "Fluxo de caixa", 38), ("d-m2", "Contas a pagar", 39), ("d-m3", "Impostos", 41)]
mods_html = "".join(f'<div id="{i}" class="card mod"><span class="g">●</span> {t}</div>' for i, t, _ in mods)
mods_js = "".join(f'    pop("#{i}", __T{w}__ - 0.1, 0.5);\n' for i, t, w in mods)
cap2 = ["faz", "toda", "a", "diferença."]
cap2_idx = [43, 44, 45, 46]
cap2_html = " ".join(f'<span id="d-w{k}" class="w{" b" if k >= 1 else ""}">{w}</span>' for k, w in enumerate(cap2))
cap2_js = "".join(
    f'    tl.fromTo("#d-w{k}", {{ opacity: 0, y: 24 }}, {{ opacity: 1, y: 0, duration: 0.3, ease: "power3.out" }}, __T{cap2_idx[k]}__);\n'
    for k in range(len(cap2))
)
scene(
    3,
    """
    #d-title { position: absolute; left: 0; right: 0; top: 220px; text-align: center; font-size: 76px; }
    #d-frame { position: absolute; left: 109px; top: 360px; width: 862px; height: 691px; background: #0b1220; border: 2px solid #2a4f94; border-radius: 56px; box-shadow: 0 30px 90px #1f6feb55; }
    #d-screen { position: absolute; inset: 10px; border-radius: 46px; overflow: hidden; }
    #d-wrap { position: absolute; left: 0; top: 0; width: 842px; height: 671px; transform-origin: 0 0; }
    #d-img { position: absolute; left: 0; top: 0; width: 842px; height: 671px; }
    .rg { position: absolute; width: 70px; height: 70px; margin: -35px 0 0 -35px; border: 5px solid #5aa2ff; border-radius: 50%; opacity: 0; }
    .cur { position: absolute; left: 0; top: 0; width: 56px; height: 56px; }
    .mod { position: absolute; top: 1085px; height: 86px; width: 286px; display: flex; align-items: center; justify-content: center; gap: 12px; font-size: 30px; font-weight: 800; border-radius: 26px; }
    #d-m1 { left: 90px; } #d-m2 { left: 397px; } #d-m3 { left: 704px; }
    #d-cap { position: absolute; left: 90px; right: 90px; top: 1215px; text-align: center; font-family: "Sora", sans-serif; font-weight: 700; font-size: 60px; }
    """,
    f"""
    <div id="d-title" class="h">Tudo em <span class="b">um só lugar</span></div>
    <div id="d-frame">
      <div id="d-screen">
        <div id="d-wrap" data-layout-allow-overflow><img id="d-img" src="assets/screens/fluxo-caixa.png" alt="Fluxo de caixa da NexusFi" /></div>
        <div id="d-r1" class="rg"></div>
        {CURSOR}
      </div>
    </div>
    {mods_html}
    <div id="d-cap">{cap2_html}</div>
    """,
    f"""
    up("#d-title", __T34__ - 0.1, 0.55);
    tl.fromTo("#d-frame", {{ opacity: 0, y: 60 }}, {{ opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }}, __T36__ - 0.2);
    tl.fromTo("#d-wrap", {{ scale: 1, x: 0, y: 0 }}, {{ scale: 1.18, x: -40, y: -120, duration: 1.6, ease: "sine.inOut" }}, __T37__);
    tl.fromTo(".cur", {{ x: 760, y: 560, opacity: 0 }}, {{ x: 343, y: 610, opacity: 1, duration: 1.0, ease: "power2.inOut" }}, __T37__ + 0.2);
    ring("#d-r1", 355, 617, __T40__);
{mods_js}{cap2_js}    """,
)

# ---------------------------------------------------------------- cena E: fechamento
scene(
    4,
    """
    #e-ring { position: absolute; left: 190px; top: 560px; width: 700px; height: 700px; border-radius: 50%; border: 3px solid #2a4f94; opacity: 0; }
    #e-use { position: absolute; left: 0; right: 0; top: 520px; text-align: center; font-family: "Sora", sans-serif; font-weight: 700; font-size: 80px; }
    #e-logo { position: absolute; left: 190px; top: 640px; width: 700px; height: auto; }
    #e-btn { position: absolute; left: 190px; top: 1000px; width: 700px; height: 140px; border-radius: 70px; background: linear-gradient(135deg, #2f80ff, #1451b8); box-shadow: 0 25px 80px #1f6feb99; font-family: "Sora", sans-serif; font-weight: 800; font-size: 54px; display: flex; align-items: center; justify-content: center; }
    #e-url { position: absolute; left: 0; right: 0; top: 1170px; text-align: center; font-size: 36px; letter-spacing: 0.08em; color: #9db6dc; font-weight: 600; }
    #e-ring2 { position: absolute; width: 90px; height: 90px; margin: -45px 0 0 -45px; border: 6px solid #ffffff; border-radius: 50%; opacity: 0; }
    .cur { position: absolute; left: 0; top: 0; width: 64px; height: 64px; }
    #e-glow { position: absolute; left: -160px; top: 300px; width: 1400px; height: 1400px; border-radius: 50%; background: radial-gradient(#1f6feb55, transparent 62%); opacity: 0; }
    """,
    f"""
    <div id="e-glow"></div><div id="e-ring"></div>
    <div id="e-use">Use a</div>
    <img id="e-logo" src="assets/img/nexus_fi_logo_branco.png" alt="NexusFi" />
    <div id="e-btn">Acesse agora →</div>
    <div id="e-url">nexusfi.com.br</div>
    <div id="e-ring2"></div>
    {CURSOR}
    """,
    """
    tl.to("#e-glow", { opacity: 1, duration: 1.2 }, 0.2);
    tl.fromTo("#e-ring", { opacity: 0, scale: 0.85 }, { opacity: 0.5, scale: 1, duration: 1.2, ease: "power2.out" }, __T47__ - 0.3);
    up("#e-use", __T47__ - 0.1, 0.45);
    pop("#e-logo", __T49__ - 0.15, 0.55);
    pop("#e-btn", __T50__ + 0.1, 0.5);
    up("#e-url", __T50__ + 0.35, 0.5);
    tl.fromTo(".cur", { x: 800, y: 1300, opacity: 0 }, { x: 560, y: 1075, opacity: 1, duration: 0.7, ease: "power2.inOut" }, __T50__ + 0.6);
    ring("#e-ring2", 572, 1082, __T50__ + 1.4);
    tl.fromTo("#e-btn", { scale: 1 }, { scale: 0.95, duration: 0.1, ease: "power2.out", immediateRender: false }, __T50__ + 1.4);
    tl.to("#e-btn", { scale: 1, duration: 0.3, ease: "back.out(2)" }, __T50__ + 1.5);
    """,
)

