"""Gera amostras de narração feminina (sem SSML) para comparar. Uso: python build/tts_samples.py"""
import base64, json, os, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEY = os.environ.get("ELEVENLABS_API_KEY") or os.environ["ELEVEN_API_KEY"]
TEXT = ("Tem empresas que estão sempre em constante evolução, mas esse avanço não acontece por acaso.\n\n"
        "O Maurício sabe que o sucesso acontece de dentro para fora, que estratégia, gestão e finanças devem caminhar juntos.\n\n"
        "Ter um sistema que conecta tudo na sua empresa faz toda a diferença.\n\n"
        "Use a Nexus Fi.")
CANDS = {
    "A-ana-dias-v2-solta": ("MZxV5lN3cv7hi1376O0m", "eleven_multilingual_v2", dict(stability=0.3, similarity_boost=0.75, style=0.45)),
    "B-ana-dias-v3": ("MZxV5lN3cv7hi1376O0m", "eleven_v3", dict(stability=0.5)),
    "C-nina-v2": ("GM2UA3fbsIaLHcswCDX9", "eleven_multilingual_v2", dict(stability=0.35, similarity_boost=0.75, style=0.4)),
    "D-bia-v2": ("Eyspt3SYhZzXd1Jd3J8O", "eleven_multilingual_v2", dict(stability=0.35, similarity_boost=0.75, style=0.4)),
}
os.makedirs(f"{ROOT}/voice/samples", exist_ok=True)


def words_from(al):
    ch, st, en = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]
    words, cur, s0, e0 = [], "", None, None
    for c, s, e in zip(ch, st, en):
        if c.isspace():
            if cur:
                words.append({"text": cur, "start": round(s0, 3), "end": round(e0, 3)}); cur = ""
            continue
        if not cur:
            s0 = s
        cur += c; e0 = e
    if cur:
        words.append({"text": cur, "start": round(s0, 3), "end": round(e0, 3)})
    return words


for name, (vid, model, vs) in CANDS.items():
    body = {"text": TEXT, "model_id": model, "language_code": "pt", "voice_settings": {**vs, "use_speaker_boost": True} if model != "eleven_v3" else vs}
    req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{vid}/with-timestamps?output_format=mp3_44100_128",
                                 data=json.dumps(body).encode(), headers={"xi-api-key": KEY, "Content-Type": "application/json"})
    try:
        d = json.load(urllib.request.urlopen(req))
    except Exception as e:
        print(name, "ERRO", e, getattr(e, "read", lambda: b"")()[:200]); continue
    open(f"{ROOT}/voice/samples/{name}.mp3", "wb").write(base64.b64decode(d["audio_base64"]))
    w = words_from(d["alignment"])
    json.dump(w, open(f"{ROOT}/voice/samples/{name}.words.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(name, len(w), "palavras", w[-1]["end"], "s")
