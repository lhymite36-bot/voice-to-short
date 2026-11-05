#!/usr/bin/env python3
"""Draws original comic-style test panels for the Comic Recap mode (no copyrighted art).
Story: "The Ember Warden" (original characters). Usage: python3 tools/make-comic-panels.py <outdir>"""
import math, os, random, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = sys.argv[1] if len(sys.argv) > 1 else 'tests/fixtures/comic-panels'
os.makedirs(OUT, exist_ok=True)
HERE = os.path.dirname(os.path.abspath(__file__))
BANG = '/usr/share/fonts/truetype/sand-box/google/Bangers/Bangers-Regular.ttf'
if not os.path.exists(BANG): BANG = os.path.join(HERE, '..', 'www', 'fonts', 'Bangers-Regular.ttf')
INK = (18, 14, 24)

def font(sz): return ImageFont.truetype(BANG, sz)

def halftone(img, col, step=16, rmax=6, angle=0.0, fade='radial', center=None):
    d = ImageDraw.Draw(img); w, h = img.size; cx, cy = center or (w / 2, h / 2)
    for y in range(0, h + step, step):
        for x in range(0, w + step, step):
            xo = x + (step / 2 if (y // step) % 2 else 0)
            if fade == 'radial': k = min(1, math.hypot(xo - cx, y - cy) / (0.75 * max(w, h)))
            else: k = y / h
            r = rmax * k
            if r > 0.6: d.ellipse([xo - r, y - r, xo + r, y + r], fill=col)

def grad(img, top, bot):
    w, h = img.size; d = ImageDraw.Draw(img)
    for y in range(h):
        k = y / max(1, h - 1); d.line([(0, y), (w, y)], fill=tuple(int(top[i] + (bot[i] - top[i]) * k) for i in range(3)))

def speed_lines(img, cx, cy, n=90, col=(255, 255, 255), inner=0.25, width=(2, 9), seed=1):
    rnd = random.Random(seed); d = ImageDraw.Draw(img); w, h = img.size; R = math.hypot(w, h)
    for i in range(n):
        a = rnd.random() * math.tau; r0 = R * (inner + rnd.random() * 0.2); wd = rnd.uniform(*width)
        p0 = (cx + math.cos(a) * r0, cy + math.sin(a) * r0); p1 = (cx + math.cos(a) * R, cy + math.sin(a) * R)
        a2 = a + wd / R * 6
        d.polygon([p0, p1, (cx + math.cos(a2) * R, cy + math.sin(a2) * R)], fill=col)

def glow(img, shape_fn, col, radius=40, strength=2):
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0)); shape_fn(ImageDraw.Draw(layer), col + (255,))
    g = layer.filter(ImageFilter.GaussianBlur(radius))
    for _ in range(strength): img.alpha_composite(g)
    img.alpha_composite(layer)

def burst(d, cx, cy, r1, r2, n, fill, seed=3):
    rnd = random.Random(seed); pts = []
    for i in range(n * 2):
        a = i / (n * 2) * math.tau; r = (r2 * rnd.uniform(0.85, 1.1)) if i % 2 == 0 else r1 * rnd.uniform(0.9, 1.1)
        pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
    d.polygon(pts, fill=fill, outline=INK, width=10)

def sfx_text(img, text, cx, cy, size, rot, fill=(255, 220, 40), fill2=(255, 120, 20)):
    f = font(size); tmp = Image.new('RGBA', (int(size * len(text) * 0.75) + 80, int(size * 1.6)), (0, 0, 0, 0)); d = ImageDraw.Draw(tmp)
    d.text((40, 20), text, font=f, fill=fill, stroke_width=max(6, size // 10), stroke_fill=INK)
    # simple two-tone: lower half orange
    g = Image.new('RGBA', tmp.size, (0, 0, 0, 0)); gd = ImageDraw.Draw(g); gd.text((40, 20), text, font=f, fill=fill2)
    mask = Image.new('L', tmp.size, 0); ImageDraw.Draw(mask).rectangle([0, tmp.size[1] * 0.55, tmp.size[0], tmp.size[1]], fill=255)
    tmp.paste(g, (0, 0), Image.composite(g.split()[3], Image.new('L', tmp.size, 0), mask))
    tmp = tmp.rotate(rot, expand=True, resample=Image.BICUBIC)
    img.alpha_composite(tmp, (int(cx - tmp.size[0] / 2), int(cy - tmp.size[1] / 2)))

def caption_box(img, text, x, y, size=44, fill=(255, 236, 140)):
    d = ImageDraw.Draw(img); f = font(size); bb = d.textbbox((0, 0), text, font=f)
    d.rectangle([x, y, x + bb[2] + 36, y + bb[3] + 26], fill=fill, outline=INK, width=6); d.text((x + 18, y + 10), text, font=f, fill=INK)

def bubble(img, text, x, y, size=46, tail=(0, 80)):
    d = ImageDraw.Draw(img); f = font(size); lines = text.split('\n'); w = max(d.textbbox((0, 0), l, font=f)[2] for l in lines) + 70; h = len(lines) * size * 1.15 + 50
    d.polygon([(x + w * 0.35, y + h - 10), (x + w * 0.35 + tail[0] + 40, y + h + tail[1]), (x + w * 0.55, y + h - 10)], fill='white', outline=INK, width=6)
    d.ellipse([x, y, x + w, y + h], fill='white', outline=INK, width=7)
    d.polygon([(x + w * 0.36, y + h - 16), (x + w * 0.35 + tail[0] + 36, y + h + tail[1] - 8), (x + w * 0.54, y + h - 16)], fill='white')
    for i, l in enumerate(lines):
        lw = d.textbbox((0, 0), l, font=f)[2]; d.text((x + (w - lw) / 2, y + 25 + i * size * 1.15), l, font=f, fill=INK)

def person(d, x, y, s, body, skin=(196, 132, 92), arm=None, kneel=False, cape=None, glow_eyes=None, face='neutral'):
    """Stylised comic figure, feet at (x, y), height ~ 600*s."""
    if cape: d.polygon([(x - 120 * s, y - 470 * s), (x + 120 * s, y - 470 * s), (x + 210 * s, y - 40 * s), (x - 210 * s, y - 40 * s)], fill=cape, outline=INK, width=8)
    if kneel:
        d.polygon([(x - 110 * s, y - 330 * s), (x + 110 * s, y - 330 * s), (x + 140 * s, y - 60 * s), (x - 140 * s, y - 60 * s)], fill=body, outline=INK, width=8)
        d.rectangle([x - 170 * s, y - 80 * s, x + 170 * s, y], fill=(40, 40, 60), outline=INK, width=8)
        top = y - 330 * s
    else:
        d.polygon([(x - 70 * s, y - 250 * s), (x - 20 * s, y - 250 * s), (x - 40 * s, y), (x - 110 * s, y)], fill=(40, 40, 60), outline=INK, width=8)
        d.polygon([(x + 20 * s, y - 250 * s), (x + 70 * s, y - 250 * s), (x + 110 * s, y), (x + 40 * s, y)], fill=(40, 40, 60), outline=INK, width=8)
        d.polygon([(x - 120 * s, y - 470 * s), (x + 120 * s, y - 470 * s), (x + 85 * s, y - 230 * s), (x - 85 * s, y - 230 * s)], fill=body, outline=INK, width=8)
        top = y - 470 * s
    if arm == 'up':
        d.polygon([(x + 100 * s, top + 20 * s), (x + 150 * s, top + 10 * s), (x + 260 * s, top - 200 * s), (x + 210 * s, top - 225 * s)], fill=body, outline=INK, width=8)
        d.ellipse([x + 195 * s, top - 290 * s, x + 285 * s, top - 200 * s], fill=skin, outline=INK, width=7)
    elif arm == 'point':
        d.polygon([(x + 100 * s, top + 30 * s), (x + 110 * s, top + 80 * s), (x + 330 * s, top + 60 * s), (x + 320 * s, top + 15 * s)], fill=body, outline=INK, width=8)
        d.ellipse([x + 310 * s, top + 5 * s, x + 380 * s, top + 75 * s], fill=skin, outline=INK, width=7)
    else:
        for sx in (-1, 1): d.polygon([(x + sx * 105 * s, top + 20 * s), (x + sx * 150 * s, top + 30 * s), (x + sx * 160 * s, top + 230 * s), (x + sx * 115 * s, top + 230 * s)], fill=body, outline=INK, width=8)
    hx, hy, hr = x, top - 85 * s, 80 * s
    d.ellipse([hx - hr, hy - hr, hx + hr, hy + hr], fill=skin, outline=INK, width=8)
    d.chord([hx - hr, hy - hr - 6 * s, hx + hr, hy + hr * 0.6], 180, 360, fill=(30, 22, 30))
    ec = glow_eyes or 'white'
    for sx in (-1, 1):
        if face == 'shock': d.ellipse([hx + sx * 30 * s - 13 * s, hy - 5 * s, hx + sx * 30 * s + 13 * s, hy + 21 * s], fill=ec, outline=INK, width=4)
        else: d.polygon([(hx + sx * 12 * s, hy + 2 * s), (hx + sx * 52 * s, hy - 8 * s), (hx + sx * 48 * s, hy + 12 * s)], fill=ec, outline=INK)
    if face == 'shock': d.ellipse([hx - 16 * s, hy + 36 * s, hx + 16 * s, hy + 66 * s], fill=INK)
    elif face == 'grit': d.rectangle([hx - 30 * s, hy + 40 * s, hx + 30 * s, hy + 54 * s], fill='white', outline=INK, width=4)
    else: d.line([(hx - 26 * s, hy + 46 * s), (hx + 26 * s, hy + 42 * s)], fill=INK, width=int(6 * s) + 1)
    return (hx, hy)

def frame(img):
    d = ImageDraw.Draw(img); w, h = img.size; d.rectangle([0, 0, w - 1, h - 1], outline=INK, width=14)

GREEN = (60, 255, 120)
panels = []

# 1. Wide: the Council
img = Image.new('RGBA', (1600, 1000)); grad(img, (8, 30, 22), (2, 6, 10)); halftone(img, (20, 90, 60), 18, 7)
d = ImageDraw.Draw(img)
for i, (x, y) in enumerate([(300, 640), (800, 520), (1300, 640)]):
    d.ellipse([x - 230, y + 40, x + 230, y + 120], fill=(30, 50, 45), outline=INK, width=8)
    d.polygon([(x - 150, y + 60), (x - 90, y - 300), (x + 90, y - 300), (x + 150, y + 60)], fill=(25, 25, 35), outline=INK, width=8)
    d.ellipse([x - 95, y - 420, x + 95, y - 250], fill=(25, 25, 35), outline=INK, width=8)
    glow(img, lambda dd, c, x=x, y=y: [dd.ellipse([x - 50, y - 350, x - 18, y - 330], fill=c), dd.ellipse([x + 18, y - 350, x + 50, y - 330], fill=c)], GREEN, 18, 3)
    d = ImageDraw.Draw(img)
caption_box(img, 'THE EMBER COUNCIL HAD MADE ITS RULING.', 40, 40, 52); frame(img); panels.append(('01-council.jpg', img))

# 2. Tall: Kael kneeling in the rain, empty wrist
img = Image.new('RGBA', (900, 1500)); grad(img, (30, 34, 52), (8, 8, 16)); halftone(img, (60, 70, 100), 16, 5, fade='y')
d = ImageDraw.Draw(img); rnd = random.Random(5)
for _ in range(220):
    x = rnd.uniform(0, 900); y = rnd.uniform(0, 1500); d.line([(x, y), (x - 14, y + 60)], fill=(150, 170, 210), width=3)
person(d, 450, 1330, 1.25, (60, 120, 90), kneel=True, face='grit')
d.ellipse([470, 1000, 560, 1050], outline=(255, 255, 255), width=6)
caption_box(img, 'NO GAUNTLET. NO POWER.', 40, 40, 58); frame(img); panels.append(('02-kneel.jpg', img))

# 3. Square: Vex arrives in green energy
img = Image.new('RGBA', (1200, 1200)); grad(img, (10, 60, 30), (0, 12, 8)); speed_lines(img, 600, 520, 110, (120, 255, 160), seed=7)
glow(img, lambda dd, c: dd.ellipse([330, 170, 870, 1150], fill=c), (40, 200, 90), 70, 2)
d = ImageDraw.Draw(img); person(d, 600, 1120, 1.35, (30, 40, 40), arm='point', cape=(20, 110, 60), glow_eyes=(150, 255, 180))
bubble(img, 'STAND DOWN,\nKAEL.', 60, 60, 64, (60, 120)); frame(img); panels.append(('03-vex.jpg', img))

# 4. Wide: the clash
img = Image.new('RGBA', (1600, 900)); grad(img, (255, 140, 30), (180, 20, 20)); speed_lines(img, 800, 450, 140, (255, 240, 180), 0.08, seed=11)
d = ImageDraw.Draw(img); burst(d, 800, 450, 230, 420, 16, (255, 230, 60))
person(d, 430, 860, 1.0, (60, 120, 90), arm='up', face='grit'); person(d, 1170, 860, 1.0, (30, 40, 40), arm='point', cape=(20, 110, 60), glow_eyes=(150, 255, 180))
sfx_text(img, 'KRA-KOOM!', 800, 300, 200, 8); frame(img); panels.append(('04-clash.jpg', img))

# 5. Tall: the hologram reveal
img = Image.new('RGBA', (900, 1400)); grad(img, (6, 10, 26), (0, 0, 0)); halftone(img, (30, 40, 90), 14, 5)
glow(img, lambda dd, c: dd.polygon([(200, 260), (700, 260), (780, 820), (120, 820)], fill=c), (60, 180, 255), 40, 1)
d = ImageDraw.Draw(img)
for i in range(9): d.line([(160, 300 + i * 58), (740, 300 + i * 58)], fill=(200, 240, 255), width=4)
d.text((220, 420), 'DIRECTIVE 9', font=font(74), fill=(255, 60, 60), stroke_width=4, stroke_fill=INK)
d.text((210, 520), 'FRAME KAEL', font=font(90), fill=(255, 255, 255), stroke_width=5, stroke_fill=INK)
person(d, 450, 1360, 0.95, (60, 120, 90), face='shock')
caption_box(img, 'THE COUNCIL LIED.', 40, 40, 60, (255, 150, 150)); frame(img); panels.append(('05-reveal.jpg', img))

# 6. Square: Vex in shock
img = Image.new('RGBA', (1100, 1100)); grad(img, (240, 240, 210), (190, 190, 160)); halftone(img, (230, 80, 80), 20, 8)
d = ImageDraw.Draw(img); person(d, 550, 1300, 1.7, (30, 40, 40), cape=(20, 110, 60), glow_eyes=(150, 255, 180), face='shock')
bubble(img, 'THEY USED\nME?!', 560, 60, 70, (-200, 100)); frame(img); panels.append(('06-shock.jpg', img))

# 7. Wide: the tower
img = Image.new('RGBA', (1500, 1000)); grad(img, (20, 10, 40), (60, 20, 30)); halftone(img, (90, 40, 90), 18, 6)
d = ImageDraw.Draw(img); d.polygon([(640, 980), (700, 120), (800, 120), (860, 980)], fill=(30, 30, 40), outline=INK, width=10)
glow(img, lambda dd, c: dd.polygon([(735, 0), (765, 0), (790, 160), (710, 160)], fill=c), GREEN, 30, 2)
d = ImageDraw.Draw(img); person(d, 300, 980, 0.9, (60, 120, 90)); person(d, 1200, 980, 0.9, (30, 40, 40), cape=(20, 110, 60), glow_eyes=(150, 255, 180))
caption_box(img, 'TOGETHER, THEY MARCHED ON THE TOWER.', 40, 40, 50); frame(img); panels.append(('07-tower.jpg', img))

# 8. Tall: the gauntlet returns
img = Image.new('RGBA', (900, 1500)); grad(img, (0, 40, 16), (0, 0, 0)); speed_lines(img, 450, 560, 120, (140, 255, 170), 0.1, seed=21)
glow(img, lambda dd, c: dd.ellipse([250, 360, 650, 760], fill=c), GREEN, 90, 3)
d = ImageDraw.Draw(img); d.rounded_rectangle([340, 470, 560, 690], 40, fill=(30, 200, 90), outline=INK, width=10)
d.polygon([(380, 690), (520, 690), (560, 1500), (340, 1500)], fill=(60, 120, 90), outline=INK, width=10)
sfx_text(img, 'VMMMMM', 450, 1150, 150, -10, (170, 255, 190), (40, 200, 90)); bubble(img, 'IT CHOSE\nME.', 80, 60, 70, (80, 90)); frame(img); panels.append(('08-gauntlet.jpg', img))

for name, im in panels:
    im.convert('RGB').save(os.path.join(OUT, name), quality=86)
    print(name, im.size)
