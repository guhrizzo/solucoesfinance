import json, os, glob, subprocess, wave, sys
import numpy as np
import scipy.signal as sg
from PIL import Image

FPS, W, H, SR = 30, 1080, 1920, 44100
T = json.load(open('timeline.json'))
S, L, O, TOTAL, LINE_AT = T['S'], T['L'], T['O'], T['total'], T['line_at']
OUT = sys.argv[1] if len(sys.argv) > 1 else 'nexusfi-atelie-da-ni-v10.mp4'
# tipo de cada transicao: entre cena j e j+1
KINDS = ['whip', 'leakA', 'zoom', 'push', 'leakB']

# ---------------------------------------------------------------- audio
rng = np.random.default_rng(11)
N = int(TOTAL * SR) + SR
mix = np.zeros(N)


def dec(p):
    return np.frombuffer(subprocess.check_output(['ffmpeg', '-loglevel', 'error', '-i', p, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-']), np.float32).astype(np.float64)


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
    B = 1024
    win = np.hanning(B * 2)
    for i in range(0, n - B * 2, B):
        fc = f0 * (f1 / f0) ** ((i / n) ** 1.2)
        bw = fc * 0.8
        sos = sg.butter(2, [max(60, fc - bw / 2), min(SR / 2 - 100, fc + bw / 2)], btype='band', fs=SR, output='sos')
        out[i:i + B * 2] += sg.sosfilt(sos, noise[i:i + B * 2]) * win
    env = np.exp(-((t - peak) / (d * 0.2)) ** 2) * (1 - np.exp(-t * 45))
    out *= env
    tail = sg.sosfilt(sg.butter(2, 6000, 'high', fs=SR, output='sos'), rng.standard_normal(n)) * np.exp(-((t - peak - 0.12) / 0.2) ** 2) * shimmer
    out += tail
    return out / np.abs(out).max()


def thump(d=0.7, f=58):
    t = np.arange(int(SR * d)) / SR
    return np.sin(2 * np.pi * (f + 90 * np.exp(-t * 18)) * t) * np.exp(-t * 6)


def music(total):
    n = int(SR * total)
    t = np.arange(n) / SR
    bpm = 100
    beat = 60 / bpm
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
    bass = np.zeros(n)
    kick = np.zeros(n)
    hat = np.zeros(n)
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
    hat = sg.sosfilt(sg.butter(2, 7000, 'high', fs=SR, output='sos'), hat)
    m = 0.5 * pad + 0.55 * bass + 0.5 * kick + 0.25 * hat
    return m / np.abs(m).max()


# narracao
for i in range(6):
    f = 'audio/6b.mp3' if i == 5 else f'audio/{i + 1}.mp3'
    put(dec(f), LINE_AT[i], 1.0)
nar_peak = np.abs(mix).max()
# trilha com ducking simples sob a voz
bed = music(TOTAL + 1)
voice_env = np.abs(mix[:len(bed)])
voice_env = sg.sosfilt(sg.butter(2, 6, 'low', fs=SR, output='sos'), voice_env)
voice_env = np.clip(voice_env / (np.percentile(voice_env, 95) + 1e-9), 0, 1)
duck = 1 - 0.55 * voice_env
fade = np.minimum(1, np.arange(len(bed)) / (SR * 1.0)) * np.clip((TOTAL + 0.8 - np.arange(len(bed)) / SR) / 1.5, 0, 1)
mix[:len(bed)] += 0.16 * nar_peak * bed * duck * fade
# whooshes
for j, k in enumerate(KINDS):
    c = S[j + 1] + O / 2
    if k == 'whip':
        w = whoosh(0.7, 500, 6000, 0.33); put(w, c - 0.33, 0.17 * nar_peak)
    elif k.startswith('leak'):
        w = whoosh(1.2, 250, 4500, 0.6, 0.35); put(w, c - 0.6, 0.15 * nar_peak)
    elif k == 'zoom':
        w = whoosh(0.8, 300, 7000, 0.45); put(w, c - 0.45, 0.15 * nar_peak); put(thump(), c - 0.02, 0.17 * nar_peak)
    else:
        w = whoosh(0.65, 700, 3500, 0.3); put(w, c - 0.3, 0.17 * nar_peak)
mix *= 0.92 / max(np.abs(mix).max(), 1e-9)
n_out = int(TOTAL * SR)
st = np.stack([mix[:n_out]] * 2, 1)
w = wave.open('final.wav', 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((st * 32767).astype(np.int16).tobytes()); w.close()

# ---------------------------------------------------------------- video
def load(p):
    return np.asarray(Image.open(p).convert('RGB'), dtype=np.float32)


cache = {}


def clip_frames():
    """usa clips/a.mp4 (1o trecho) e clips/b.mp4 (resto). So com b.mp4: ele cobre a cena toda"""
    a, b = 'clips/a.mp4', 'clips/b.mp4'
    if not os.path.exists(b):
        return None
    vf = f'scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={FPS}'
    os.makedirs('fr/clipB', exist_ok=True)
    for f in glob.glob('fr/clipA/*.png') + glob.glob('fr/clipB/*.png'):
        os.remove(f)
    if os.path.exists(a):
        os.makedirs('fr/clipA', exist_ok=True)
        split = 2.9
        subprocess.check_call(['ffmpeg', '-y', '-loglevel', 'error', '-ss', '1.2', '-i', a, '-t', str(split + 0.3), '-vf', vf, 'fr/clipA/%04d.png'])
    else:
        split = 0.0
    subprocess.check_call(['ffmpeg', '-y', '-loglevel', 'error', '-i', b, '-t', str(L[1] - split + 0.1), '-vf', vf, 'fr/clipB/%04d.png'])
    return (len(glob.glob('fr/clipA/*.png')), len(glob.glob('fr/clipB/*.png')), int(split * FPS))


CLIPS = clip_frames()


def scene_frame(i, k):
    """frame k (local) da cena i (0-based), segurando o ultimo frame"""
    sid = i + 1
    nfr = int(np.ceil(L[i] * FPS))
    k = max(0, min(k, nfr - 1))
    key = (i, k)
    if key in cache:
        return cache[key]
    if i == 1 and CLIPS:
        na, nb, sp = CLIPS
        def fa(i):
            return load(f'fr/clipA/{max(1, min(i + 1, na)):04d}.png')

        def fb(i):
            return load(f'fr/clipB/{max(1, min(i + 1, nb)):04d}.png')
        if k < sp - 4:
            base = fa(k)
        elif k < sp:
            al2 = (k - (sp - 4) + 1) / 5
            base = fa(k) * (1 - al2) + fb(0) * al2
        else:
            base = fb(k - sp)
        ov = np.asarray(Image.open(f'fr/s2o/{k:04d}.png').convert('RGBA'), dtype=np.float32)
        al = ov[..., 3:4] / 255
        fr = base * (1 - al) + ov[..., :3] * al
    else:
        fr = load(f'fr/s{sid}/{k:04d}.png')
    if len(cache) > 60:
        cache.clear()
    cache[key] = fr
    return fr


def translate(img, dx, dy):
    return np.roll(np.roll(img, int(round(dx)), axis=1), int(round(dy)), axis=0) if (dx or dy) else img


def motion(img, dx, dy, blur, axis, n=8):
    acc = np.zeros_like(img)
    for s in range(n):
        f = (s / (n - 1) - 0.5) * blur
        acc += translate(img, dx + (f if axis == 'x' else 0), dy + (f if axis == 'y' else 0))
    return acc / n


def zoom(img, s, blur=0.0, n=6):
    pil = Image.fromarray(img.astype(np.uint8))
    acc = np.zeros_like(img)
    for k in range(n):
        sc = s * (1 + blur * k / (n - 1))
        w, h = int(W * sc), int(H * sc)
        r = pil.resize((w, h), Image.BILINEAR)
        l, t = (w - W) // 2, (h - H) // 2
        acc += np.asarray(r.crop((l, t, l + W, t + H)), dtype=np.float32)
    return acc / n


def screen(a, b, k=1.0):
    return 255 - (255 - a) * (255 - b * k) / 255


def smooth(x):
    x = min(1, max(0, x))
    return x * x * (3 - 2 * x)


def transition(j, p, ko, ki):
    kind = KINDS[j]
    out = scene_frame(j, ko)
    inc = scene_frame(j + 1, ki)
    if kind == 'whip':
        if p < 0.5:
            q = (p / 0.5) ** 2
            return motion(out, -q * 1300, 0, q * 420, 'x')
        q = ((1 - p) / 0.5) ** 2
        return motion(inc, q * 1300, 0, q * 420, 'x')
    if kind == 'push':
        if p < 0.5:
            q = (p / 0.5) ** 2
            return motion(out, 0, -q * 1500, q * 480, 'y')
        q = ((1 - p) / 0.5) ** 2
        return motion(inc, 0, q * 1500, q * 480, 'y')
    if kind == 'zoom':
        if p < 0.5:
            q = (p / 0.5) ** 2
            fr = zoom(out, 1 + 0.6 * q, 0.18 * q)
        else:
            q = ((1 - p) / 0.5) ** 2
            fr = zoom(inc, 1 + 0.6 * q, 0.18 * q)
        fl = min(1.0, max(0.0, 1 - abs(p - 0.5) / 0.16) * 1.25)
        return fr * (1 - fl) + np.array([255, 250, 240], np.float32) * fl
    # leaks
    base = out * (1 - smooth((p - 0.42) / 0.16)) + inc * smooth((p - 0.42) / 0.16)
    return base


def leak_overlay(name, t_center, t):
    k = int(round((t - (t_center - 0.45)) * FPS))
    if 0 <= k < 27:
        return load(f'fr/{name.replace("leak", "lk")}/{k:04d}.png')
    return None


total_frames = int(np.ceil(TOTAL * FPS))
ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-', '-i', 'final.wav',
                       '-c:v', 'libx264', '-crf', '17', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', OUT], stdin=subprocess.PIPE)
for f in range(total_frames):
    t = f / FPS
    # cena ativa
    act = [i for i in range(6) if S[i] <= t < S[i] + L[i] + 1e-9]
    j = next((jj for jj in range(5) if S[jj + 1] <= t < S[jj + 1] + O), None)
    if j is not None:
        p = (t - S[j + 1]) / O
        ko = int(round((t - S[j]) * FPS))
        ki = int(round((t - S[j + 1]) * FPS))
        fr = transition(j, p, ko, ki)
    else:
        i = act[-1] if act else 5
        fr = scene_frame(i, int(round((t - S[i]) * FPS)))
    for jj, kd in enumerate(KINDS):
        if kd.startswith('leak'):
            lk = leak_overlay(kd, S[jj + 1] + O / 2, t)
            if lk is not None:
                fr = screen(fr, lk, 0.9)
    ff.stdin.write(np.clip(fr, 0, 255).astype(np.uint8).tobytes())
ff.stdin.close()
ff.wait()
print('ok', OUT, TOTAL)
