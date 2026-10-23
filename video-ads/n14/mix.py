import json, subprocess, wave, os
import numpy as np
import scipy.signal as sg

src = open('../assemble.py', encoding='utf-8').read()
head = src.split('# narracao')[0].split('# ---------------------------------------------------------------- audio')[1]
T = json.load(open('timeline.json'))
S, TOTAL, PRE = T['S'], T['total'], T['pre']
FPS, SR = 30, 44100
O = 0.45
exec(head)  # define rng, mix, N, dec, put, whoosh, thump, music

for i in range(6):
    put(dec(f'tts/{i + 1}t.wav'), S[i] + PRE, 1.0)
nar_peak = np.abs(mix).max()
bed = music(TOTAL + 1)
venv = np.abs(mix[:len(bed)])
venv = sg.sosfilt(sg.butter(2, 6, 'low', fs=SR, output='sos'), venv)
venv = np.clip(venv / (np.percentile(venv, 95) + 1e-9), 0, 1)
duck = 1 - 0.55 * venv
fade = np.minimum(1, np.arange(len(bed)) / (SR * 1.0)) * np.clip((TOTAL + 0.8 - np.arange(len(bed)) / SR) / 1.5, 0, 1)
mix[:len(bed)] += 0.16 * nar_peak * bed * duck * fade
# whooshes suaves nas viradas de cena
for j in range(1, 6):
    c = S[j] + 0.22
    w = whoosh(0.9, 300, 4500, 0.45, 0.25)
    put(w, c - 0.45, 0.13 * nar_peak)
mix *= 0.92 / max(np.abs(mix).max(), 1e-9)
n_out = int(TOTAL * SR)
st = np.stack([mix[:n_out]] * 2, 1)
w = wave.open('final.wav', 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
w.writeframes((st * 32767).astype(np.int16).tobytes()); w.close()
print('audio ok', TOTAL)
