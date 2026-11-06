"""Gera os slides do post de 1.000 seguidores do NexusFi (1080x1350)."""
import base64
import random
from pathlib import Path

HERE = Path(__file__).parent
FONTS = (HERE / "../../app/fonts").resolve().as_uri()
FELIPE = "data:image/jpeg;base64," + base64.b64encode((HERE / "felipe_slide.jpg").read_bytes()).decode()
LOGO = "data:image/png;base64," + base64.b64encode((HERE / "logo_branco.png").read_bytes()).decode()

NAVY = "#06142B"
DEEP = "#0A2A63"
BLUE = "#1F6FEB"
CYAN = "#19C3E6"
GREEN = "#1FD18B"
GRAD = f"linear-gradient(100deg,{BLUE} 0%,{CYAN} 55%,{GREEN} 100%)"
TOTAL = 4

CSS = f"""
@font-face{{font-family:'Sora';src:url('{FONTS}/sora.woff2');font-weight:100 900}}
@font-face{{font-family:'Hanken';src:url('{FONTS}/hanken-grotesk.woff2');font-weight:100 900}}
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{width:1080px;height:1350px;overflow:hidden;background:{NAVY}}}
.slide{{position:relative;width:1080px;height:1350px;overflow:hidden;color:#fff;font-family:'Hanken',sans-serif;
  background:radial-gradient(900px 700px at 85% 8%,{DEEP} 0%,transparent 70%),
             radial-gradient(900px 800px at 0% 100%,#0B3B7A 0%,transparent 65%),{NAVY}}}
.sora{{font-family:'Sora',sans-serif}}
.tag{{font-family:'Sora';font-size:26px;font-weight:600;letter-spacing:6px;color:{CYAN};text-transform:uppercase}}
.mark{{position:absolute;left:96px;top:300px;width:46px;height:46px;background:{CYAN};clip-path:polygon(0 0,100% 0,0 100%)}}
.hl{{position:relative;display:inline-block;padding:0 22px;margin-left:-22px;z-index:0}}
.hl::before{{content:'';position:absolute;inset:6px 0 -2px 0;background:{GRAD};transform:skewY(-1.6deg);z-index:-1}}
.logo{{position:absolute;left:96px;bottom:96px;height:74px}}
.dots{{position:absolute;left:0;right:0;bottom:50px;display:flex;justify-content:center;gap:12px}}
.dots i{{width:11px;height:11px;border-radius:50%;background:rgba(255,255,255,.28)}}
.dots i.on{{background:#fff}}
.arrow{{position:absolute;right:0;top:0;bottom:0;width:64px;display:flex;align-items:center;justify-content:center;
  background:linear-gradient(to right,transparent,rgba(255,255,255,.07))}}
.rule{{position:absolute;left:96px;right:96px;height:2px;background:rgba(255,255,255,.35)}}
"""


def dots_nav(i):
    return '<div class="dots">' + "".join(f'<i class="{"on" if k == i else ""}"></i>' for k in range(TOTAL)) + "</div>"


ARROW = ('<div class="arrow"><svg width="34" height="34" viewBox="0 0 24 24" fill="none">'
         '<path d="M9 6l6 6-6 6" stroke="rgba(255,255,255,.55)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>')


def dot_field(lit, w=1080, h=760, cols=40, rows=25, seed=7):
    """Campo de 1.000 pontos (40x25) — cada ponto = um seguidor."""
    gx, gy = w / cols, h / rows
    random.seed(seed)
    out = [f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}" style="position:absolute;left:0;top:0">',
           f'<defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="{BLUE}"/>'
           f'<stop offset=".55" stop-color="{CYAN}"/><stop offset="1" stop-color="{GREEN}"/></linearGradient></defs>']
    for r in range(rows):
        for c in range(cols):
            x, y = gx * (c + .5), gy * (r + .5)
            if lit:
                out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="5.2" fill="url(#g)" opacity="{random.uniform(.55,1):.2f}"/>')
            else:
                out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4" fill="#fff" opacity="{random.uniform(.12,.34):.2f}"/>')
    out.append("</svg>")
    return "".join(out)


def slide1():
    return f"""
<div class="slide">
  <img src="{FELIPE}" style="position:absolute;left:0;top:-90px;width:1080px;height:1443px">
  <div style="position:absolute;inset:0;background:linear-gradient(180deg,transparent 38%,{NAVY}E6 62%,{NAVY} 78%)"></div>
  <div class="tag" style="position:absolute;left:96px;top:712px">Obrigado</div>
  <div class="sora" style="position:absolute;left:96px;top:772px;font-size:100px;line-height:1.06;font-weight:700;letter-spacing:-3px">
    Chegamos<br>a <span class="hl">1.000</span><br>seguidores.
  </div>
  <div style="position:absolute;left:96px;top:1120px;font-size:34px;color:rgba(255,255,255,.9)">Cada um de vocês faz o NexusFi crescer.</div>
  <div style="position:absolute;left:96px;bottom:110px;padding:14px 30px;border-radius:40px;background:{BLUE};font-size:28px;font-weight:600">@nexusfi1</div>
  <img class="logo" src="{LOGO}" style="left:auto;right:96px;bottom:100px;height:66px">
  {ARROW}{dots_nav(0)}
</div>"""


def slide2():
    return f"""
<div class="slide">
  <div style="position:absolute;left:0;top:40px;width:1080px;height:760px;mask-image:linear-gradient(#000 45%,transparent 100%);-webkit-mask-image:linear-gradient(#000 45%,transparent 100%)">{dot_field(True)}</div>
  <div style="position:absolute;left:0;top:40px;width:1080px;height:760px;background:radial-gradient(520px 300px at 50% 50%,{NAVY}F2 0%,{NAVY}99 55%,transparent 100%)"></div>
  <div class="sora" style="position:absolute;left:0;top:210px;width:1080px;text-align:center;font-size:250px;line-height:1;font-weight:800;letter-spacing:-9px;background:{GRAD};-webkit-background-clip:text;background-clip:text;color:transparent">1.000</div>
  <div class="tag" style="position:absolute;left:0;top:490px;width:1080px;text-align:center;color:#fff;font-size:34px;letter-spacing:12px">seguidores</div>
  <div class="sora" style="position:absolute;left:96px;right:96px;top:850px;font-size:78px;line-height:1.1;font-weight:700;letter-spacing:-2.2px">
    Uma mesma busca:<br><span class="hl">controle</span> do dinheiro,<br>sem complicação.
  </div>
  <div class="rule" style="top:1168px"></div>
  <div style="position:absolute;left:96px;right:96px;top:1190px;font-size:32px;color:rgba(255,255,255,.85)">Obrigado por cada um dos 1.000.</div>
  {ARROW}{dots_nav(1)}
</div>"""


def item(txt, sub):
    return f"""<div style="display:flex;gap:26px;align-items:flex-start;padding:26px 0;border-bottom:2px solid rgba(255,255,255,.14)">
      <div style="width:16px;height:16px;border-radius:50%;background:{GRAD};margin-top:16px;flex:none"></div>
      <div><div class="sora" style="font-size:36px;font-weight:600;letter-spacing:-.6px">{txt}</div>
      <div style="font-size:28px;color:rgba(255,255,255,.66);margin-top:6px">{sub}</div></div></div>"""


def slide3():
    return f"""
<div class="slide">
  <div class="mark" style="top:150px"></div>
  <div class="tag" style="position:absolute;left:96px;top:96px">E agora?</div>
  <div class="sora" style="position:absolute;left:96px;right:110px;top:236px;font-size:84px;line-height:1.08;font-weight:700;letter-spacing:-2.4px">
    A gente está<br><span class="hl">só começando.</span>
  </div>
  <div style="position:absolute;left:96px;right:120px;top:560px">
    {item("Fluxo de caixa", "Entradas e saídas num só lugar")}
    {item("Contas a pagar e a receber", "Baixa automática pelo fluxo de caixa")}
    {item("Relatórios e DRE", "Resultado do mês sem planilha")}
    {item("Feito com você", "Bugs e sugestões viram melhorias")}
  </div>
  {ARROW}{dots_nav(2)}
</div>"""


def slide4():
    return f"""
<div class="slide" style="background:radial-gradient(1000px 900px at 80% 20%,{BLUE} 0%,transparent 70%),
   radial-gradient(900px 800px at 10% 100%,{GREEN}55 0%,transparent 65%),{DEEP}">
  <div style="position:absolute;left:0;top:0;width:1080px;height:900px;opacity:.5;mask-image:linear-gradient(#000,transparent 70%);-webkit-mask-image:linear-gradient(#000,transparent 70%)">{dot_field(False, h=900, rows=30, seed=3)}</div>
  <div class="mark" style="top:300px;background:#fff"></div>
  <div class="sora" style="position:absolute;left:96px;right:96px;top:380px;font-size:112px;line-height:1.05;font-weight:700;letter-spacing:-3.4px">
    Obrigado<br>por fazer<br>parte.
  </div>
  <div class="rule" style="top:880px"></div>
  <div style="position:absolute;left:96px;right:96px;top:916px;font-size:40px;line-height:1.32;color:rgba(255,255,255,.95)">
    Marque quem cuida das finanças com você e <b style="font-weight:700">siga para o que vem por aí.</b>
  </div>
  <div style="position:absolute;left:96px;top:1118px;display:inline-flex;padding:22px 44px;background:#fff;color:{NAVY};border-radius:60px;font-size:32px;font-weight:700">
    nexusfi.com.br
  </div>
  <div style="position:absolute;left:96px;top:1236px;font-size:30px;font-weight:600;color:rgba(255,255,255,.9)">@nexusfi1</div>
  <img class="logo" src="{LOGO}" style="left:auto;right:96px;bottom:100px;height:66px">
  {dots_nav(3)}
</div>"""


for n, fn in enumerate([slide1, slide2, slide3, slide4], 1):
    html = f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>{fn()}</body></html>'
    (HERE / f"slide_{n}.html").write_text(html, encoding="utf-8")
print("ok")
