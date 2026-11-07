"""Narração feminina (ElevenLabs, with-timestamps). Uso: python build/tts_f.py [voice_id]  (chave: ELEVENLABS_API_KEY no ambiente)"""
import base64, json, os, sys, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEY = os.environ.get("ELEVENLABS_API_KEY") or os.environ["ELEVEN_API_KEY"]
VOICE = sys.argv[1] if len(sys.argv) > 1 else "MZxV5lN3cv7hi1376O0m"  # Ana Dias - Engaging, Smooth and Forceful
BR = lambda t: f' <break time="{t}s" /> '
TEXT = ("Tem empresas que estão sempre em constante evolução, mas esse avanço não acontece por acaso." + BR(0.7) +
        "O Maurício sabe que o sucesso acontece de dentro para fora, que estratégia, gestão e finanças devem caminhar juntos." + BR(0.7) +
        "Ter um sistema que conecta tudo na sua empresa faz toda a diferença." + BR(0.7) +
        "Use a Nexus Fi.")
body = {"text": TEXT, "model_id": "eleven_multilingual_v2", "language_code": "pt",
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.8, "style": 0.25, "use_speaker_boost": True}}
req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE}/with-timestamps?output_format=mp3_44100_128",
                             data=json.dumps(body).encode(), headers={"xi-api-key": KEY, "Content-Type": "application/json"})
d = json.load(urllib.request.urlopen(req))
open(f"{ROOT}/voice/narr.mp3", "wb").write(base64.b64decode(d["audio_base64"]))
a = d["alignment"]; ch, st, en = a["characters"], a["character_start_times_seconds"], a["character_end_times_seconds"]
words, cur, s0, e0, tag = [], "", None, None, False
for c, s, e in zip(ch, st, en):
    if c == "<": tag = True
    if tag:
        if c == ">": tag = False
        if cur: words.append({"text": cur, "start": round(s0, 3), "end": round(e0, 3)}); cur = ""
        continue
    if c.isspace():
        if cur: words.append({"text": cur, "start": round(s0, 3), "end": round(e0, 3)}); cur = ""
        continue
    if not cur: s0 = s
    cur += c; e0 = e
if cur: words.append({"text": cur, "start": round(s0, 3), "end": round(e0, 3)})
json.dump(words, open(f"{ROOT}/voice/narr.words.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(words), "palavras;", words[-1]["end"], "s")
print(" ".join(f"{i}:{w['text']}@{w['start']}" for i, w in enumerate(words)).encode("ascii", "replace").decode())
