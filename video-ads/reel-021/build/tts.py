"""Gera a narração (edge-tts, pt-BR Antonio) + tempo de cada palavra. Uso: python build/tts.py"""
import asyncio, json, os, sys
import edge_tts
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEXT = ("Faturamento é ego. Lucro é ajustável. Caixa é o rei. "
        "O Maurício, dono do clube zero vinte e um, faturava bem, mas não sabia pra onde o dinheiro ia. "
        "Com a Nexus Fi, ele viu pra onde o faturamento estava indo, e passou a regular. "
        "Seja inteligente como o Maurício. Use a Nexus Fi.")
VOICE = sys.argv[1] if len(sys.argv) > 1 else "pt-BR-AntonioNeural"
RATE = sys.argv[2] if len(sys.argv) > 2 else "+0%"

async def main():
    c = edge_tts.Communicate(TEXT, VOICE, rate=RATE, boundary="WordBoundary")
    words, audio = [], bytearray()
    async for ch in c.stream():
        if ch["type"] == "audio":
            audio += ch["data"]
        elif ch["type"] == "WordBoundary":
            s = ch["offset"] / 1e7; d = ch["duration"] / 1e7
            words.append({"text": ch["text"], "start": round(s, 3), "end": round(s + d, 3)})
    os.makedirs(f"{ROOT}/voice", exist_ok=True)
    open(f"{ROOT}/voice/narr.mp3", "wb").write(audio)
    json.dump(words, open(f"{ROOT}/voice/narr.words.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(len(words), "palavras;", words[-1]["end"], "s")
    print(" ".join(f"{i}:{w['text']}@{w['start']}" for i, w in enumerate(words)))
asyncio.run(main())
