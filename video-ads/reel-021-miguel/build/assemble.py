"""Monta build/gen.py a partir do gen.py do reel-021 (cabeça e áudio) + scenes_mid.py (cenas do roteiro do Miguel)."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
old = open(os.path.join(HERE, "..", "..", "reel-021", "build", "gen.py"), encoding="utf-8").read()
mid = open(os.path.join(HERE, "scenes_mid.py"), encoding="utf-8").read()
i0 = old.index("# ---------------------------------------------------------------- cena A")
i1 = old.index("# ---------------------------------------------------------------- fundo")
head, tail = old[:i0], old[i1:]


def rep(s, a, b):
    assert a in s, a[:60]
    return s.replace(a, b)


head = rep(head, 'assert len(W) == 54, "a narração precisa ter 54 palavras"', 'assert len(W) == 51, "a narração precisa ter 51 palavras"')
head = rep(head, "B = [0, vt(10) - 0.35, vt(29) - 0.3, vt(45) - 0.25]  # cortes (instante global)", "B = [0, vt(15) - 0.35, vt(26) - 0.3, vt(34) - 0.3, vt(47) - 0.3]  # cortes (instante global)")
head = rep(head, 'NAMES = ["a", "b", "c", "d"]', 'NAMES = ["a", "b", "c", "d", "e"]')
head = rep(head, 'KINDS = ["push", "zoom", "whip"]  # A→B, B→C, C→D', 'KINDS = ["push", "zoom", "whip", "zoomin"]')
head = rep(head, '''    "whip": 'tl.fromTo("#root", { x: 1080 }, { x: 0, duration: 0.5, ease: "power3.inOut" }, 0);',
}''', '''    "whip": 'tl.fromTo("#root", { x: 1080 }, { x: 0, duration: 0.5, ease: "power3.inOut" }, 0);',
    "zoomin": 'tl.fromTo("#root", { scale: 1.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: "power3.out" }, 0);',
}''')
head = rep(head, '''    "whip": 'tl.to("#root", { x: -1080, duration: 0.5, ease: "power3.inOut" }, __D__ - 0.5);',
}''', '''    "whip": 'tl.to("#root", { x: -1080, duration: 0.5, ease: "power3.inOut" }, __D__ - 0.5);',
    "zoomin": 'tl.to("#root", { scale: 0.85, opacity: 0, duration: 0.5, ease: "power3.in" }, __D__ - 0.5);',
}''')
head = rep(head, "TOTAL = round(END_V + 2.4, 2)", "TOTAL = round(END_V + 2.6, 2)")
tail = rep(tail, 'kinds = ["leak", "zoom", "leak"]', 'kinds = ["leak", "zoom", "leak", "zoom"]')
tail = rep(tail, 'put(thump(0.9, 50), vt(6) + 0.3, 0.2 * nar_peak)  # "caixa é o rei": impacto\n', 'put(thump(0.9, 50), vt(33) + 0.1, 0.16 * nar_peak)  # "juntos"\n')
tail = rep(tail, "for t_click in (vt(38), vt(44) - 0.1, vt(53) + 1.3):", "for t_click in (vt(40), vt(50) + 1.4):")
tail = rep(tail, 'put(blip(900, 0.09), vt(25) - 0.05, 0.14 * nar_peak)  # "pra onde"\n', "for i in (27, 28, 30):\n    put(blip(900, 0.09), vt(i) - 0.05, 0.14 * nar_peak)\n")
open(os.path.join(HERE, "gen.py"), "w", encoding="utf-8").write(head + mid + tail)
print("gen.py montado")
