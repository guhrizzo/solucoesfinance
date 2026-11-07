"""Narração via ElevenLabs (with-timestamps). Uso: python build/tts_eleven.py [voice_id]  (chave em ELEVENLABS_API_KEY do ambiente)"""
import base64, json, os, sys, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEY = os.environ.get("ELEVENLABS_API_KEY") or os.environ["ELEVEN_API_KEY"]
VOICE = sys.argv[1] if len(sys.argv) > 1 else "rpNe0HOx7heUulPiOEaG"  # Diego - Confident Announcer
BR = lambda t: f' <break time="{t}s" /> '
TEXT = ("Faturamento é ego." + BR(0.45) + "Lucro é ajustável." + BR(0.45) + "Caixa é o rei." + BR(0.9) +
        "O Maurício, dono do clube zero vinte e um, faturava bem, mas não sabia pra onde o dinheiro ia." + BR(0.8) +
        "Com a Nexus Fi, ele viu pra onde o faturamento estava indo, e passou a regular." + BR(0.8) +
        "Seja inteligente como o Maurício." + BR(0.35) + "Use a Nexus Fi.")
body = {"text": TEXT, "model_id": "eleven_multilingual_v2", "language_code": "pt",
        "voice_settings": {"stability": 0.45, "similarity_boost": 0.8, "style": 0.3, "use_speaker_boost": True}}
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
