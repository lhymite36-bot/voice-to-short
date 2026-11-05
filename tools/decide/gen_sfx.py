#!/usr/bin/env python3
"""Procedural horror SFX + drone for Decide showcase ($0)."""
import math, struct, wave, os
from pathlib import Path

OUT = Path('/workspace/decide/audio')
OUT.mkdir(exist_ok=True)
SR = 44100

def write_wav(path, samples, sr=SR):
    # samples: list/iterable of float -1..1
    data = bytearray()
    for s in samples:
        v = max(-1.0, min(1.0, float(s)))
        data += struct.pack('<h', int(v * 32767))
    with wave.open(str(path), 'w') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes(data)

def env(i, n, a=0.02, r=0.15):
    t = i / max(1, n-1)
    if t < a: return t / a
    if t > 1-r: return (1-t) / r
    return 1.0

def noise(n, seed=1):
    # simple LCG noise
    x = seed & 0xFFFFFFFF
    for i in range(n):
        x = (1103515245 * x + 12345) & 0x7FFFFFFF
        yield (x / 0x7FFFFFFF) * 2 - 1

def tone(freq, dur, vol=0.3, wave='sin'):
    n = int(sr := SR * dur)
    out = []
    for i in range(n):
        t = i / SR
        if wave == 'sin':
            s = math.sin(2 * math.pi * freq * t)
        elif wave == 'saw':
            s = 2 * ((t * freq) % 1) - 1
        else:
            s = 1 if (t * freq) % 1 < 0.5 else -1
        out.append(s * vol * env(i, n))
    return out

def drone(dur=120):
    n = int(SR * dur)
    out = []
    for i in range(n):
        t = i / SR
        s = 0.12 * math.sin(2*math.pi*55*t)
        s += 0.08 * math.sin(2*math.pi*82.5*t + 0.3)
        s += 0.05 * math.sin(2*math.pi*110*t + 1.1)
        s += 0.03 * math.sin(2*math.pi*27.5*t)
        # slow pulse
        s *= 0.7 + 0.3 * math.sin(2*math.pi*0.08*t)
        out.append(s)
    return out

def radio_static(dur=1.5):
    n = int(SR * dur)
    out = []
    for i, ns in enumerate(noise(n, 7)):
        t = i / SR
        crackle = ns * (0.4 + 0.3 * math.sin(2*math.pi*18*t))
        beep = 0.15 * math.sin(2*math.pi*880*t) if int(t*8) % 5 == 0 else 0
        out.append((crackle + beep) * 0.5 * env(i, n, 0.05, 0.2))
    return out

def footsteps(n_steps=6):
    out = []
    for step in range(n_steps):
        n = int(SR * 0.18)
        for i, ns in enumerate(noise(n, 20+step)):
            # soft thud
            t = i / SR
            thud = math.sin(2*math.pi*90*t) * math.exp(-18*t)
            out.append((thud * 0.55 + ns * 0.08 * math.exp(-25*t)) * env(i, n, 0.01, 0.4))
        # gap
        out.extend([0.0] * int(SR * 0.32))
    return out

def tray_scrape(dur=0.7):
    n = int(SR * dur)
    out = []
    for i, ns in enumerate(noise(n, 99)):
        t = i / SR
        s = ns * (0.5 + 0.5 * math.sin(2*math.pi*12*t))
        s *= math.exp(-2.5*t)
        # metallic ring
        s += 0.2 * math.sin(2*math.pi*1400*t) * math.exp(-8*t)
        out.append(s * 0.45 * env(i, n, 0.02, 0.3))
    return out

def rewind_whoosh(dur=1.2):
    n = int(SR * dur)
    out = []
    for i, ns in enumerate(noise(n, 3)):
        t = i / SR
        # rising then falling pitch noise
        f = 200 + 2400 * (t/dur)
        s = ns * 0.35 + 0.25 * math.sin(2*math.pi*f*t)
        # reverse-feel: louder in middle-end
        e = math.sin(math.pi * (t/dur) ** 0.7)
        out.append(s * e * 0.6)
    return out

def glitch_blip(dur=0.5):
    n = int(SR * dur)
    out = []
    for i in range(n):
        t = i / SR
        s = 0.4 * math.sin(2*math.pi*(400+800*(i%40)/40)*t)
        if (i // 200) % 2 == 0: s *= 0.2
        out.append(s * env(i, n, 0.01, 0.15))
    return out

def door_creak(dur=1.0):
    n = int(SR * dur)
    out = []
    for i, ns in enumerate(noise(n, 44)):
        t = i / SR
        f = 180 + 90 * math.sin(2*math.pi*1.5*t)
        s = 0.35 * math.sin(2*math.pi*f*t) + 0.15 * ns
        out.append(s * env(i, n, 0.1, 0.25) * 0.5)
    return out

def led_flip(dur=0.35):
    return tone(1200, dur, vol=0.25) + tone(600, 0.15, vol=0.2)

def heartbeat(n_beats=4):
    out = []
    for b in range(n_beats):
        for freq, d, v in ((55, 0.12, 0.55), (40, 0.18, 0.35)):
            n = int(SR * d)
            for i in range(n):
                t = i / SR
                out.append(math.sin(2*math.pi*freq*t) * math.exp(-14*t) * v)
            out.extend([0.0] * int(SR * 0.08))
        out.extend([0.0] * int(SR * 0.45))
    return out

def choice_chime(dur=0.6):
    out = []
    for f in (523, 659, 784):
        out.extend(tone(f, 0.18, vol=0.22))
    return out[:int(SR*dur)]

write_wav(OUT/'drone.wav', drone(130))
write_wav(OUT/'sfx_static.wav', radio_static(1.8))
write_wav(OUT/'sfx_steps.wav', footsteps(7))
write_wav(OUT/'sfx_tray.wav', tray_scrape())
write_wav(OUT/'sfx_rewind.wav', rewind_whoosh())
write_wav(OUT/'sfx_glitch.wav', glitch_blip())
write_wav(OUT/'sfx_creak.wav', door_creak())
write_wav(OUT/'sfx_led.wav', led_flip())
write_wav(OUT/'sfx_heart.wav', heartbeat(5))
write_wav(OUT/'sfx_chime.wav', choice_chime())
print('SFX_DONE', list(OUT.glob('sfx_*.wav')))
