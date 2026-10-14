"""Composes captioned Google Play screenshots (1080x1920) from raw game captures.

    python art/tools/store_screens.py <capture_dir>

Raw captures come from the game itself, e.g.
    node tools/capture.mjs --scene=showcase --steps=showcase,merge --size=1080x1920@1 --out=<capture_dir>
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
FONT = os.path.join(ROOT, "public", "assets", "fonts", "Fredoka.ttf")
OUT = os.path.join(ROOT, "store", "screenshots")
W, H = 1080, 1920

SHOTS = [
    ("showcase.png", "Drop & merge", "cute planets"),
    ("showcase_merge.png", "Grow them bigger", "and bigger..."),
    ("supernova.png", "Make two Suns for a", "SUPERNOVA!"),
    ("collection.png", "Discover", "every planet"),
    ("title.png", "A new Daily Challenge", "every day"),
    ("gameover.png", "Beat your", "best score"),
]


def font(size, weight=700):
    f = ImageFont.truetype(FONT, size)
    axes = [a["name"] for a in f.get_variation_axes()]
    values = {b"Width": 100, b"Weight": weight, "Width": 100, "Weight": weight}
    f.set_variation_by_axes([values.get(n, 100) for n in axes])
    return f


def background():
    bg = Image.new("RGB", (W, H))
    top, bottom = (44, 26, 120), (13, 11, 34)
    px = bg.load()
    for y in range(H):
        t = y / H
        c = tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(3))
        for x in range(W):
            px[x, y] = c
    glow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(glow).ellipse((-200, -300, W + 200, 700), fill=120)
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    tint = Image.new("RGB", (W, H), (120, 80, 255))
    return Image.composite(tint, bg, glow.point(lambda v: v // 3))


def centered(draw, y, text, f, fill, stroke=0):
    w = draw.textlength(text, font=f)
    draw.text(((W - w) / 2, y), text, font=f, fill=fill, stroke_width=stroke, stroke_fill=(30, 14, 80))


def compose(src, line1, line2, out):
    img = background()
    shot = Image.open(src).convert("RGB")
    scale = 0.8
    sw, sh = int(W * scale), int(H * scale)
    shot = shot.resize((sw, sh), Image.LANCZOS)
    x, y = (W - sw) // 2, H - sh - 70
    radius = 54
    mask = Image.new("L", (sw, sh), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, sw, sh), radius, fill=255)
    shadow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(shadow).rounded_rectangle((x, y + 18, x + sw, y + sh + 18), radius, fill=170)
    shadow = shadow.filter(ImageFilter.GaussianBlur(28))
    img = Image.composite(Image.new("RGB", (W, H), (5, 3, 15)), img, shadow)
    img.paste(shot, (x, y), mask)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((x - 6, y - 6, x + sw + 6, y + sh + 6), radius + 6, outline=(150, 130, 255), width=6)
    centered(d, 70, line1, font(78), (255, 243, 214), 6)
    centered(d, 165, line2, font(96), (255, 159, 46), 7)
    img.save(out, optimize=True)
    print("[store]", out)


def main():
    src_dir = sys.argv[1]
    os.makedirs(OUT, exist_ok=True)
    for i, (name, l1, l2) in enumerate(SHOTS):
        path = os.path.join(src_dir, name)
        if os.path.exists(path):
            compose(path, l1, l2, os.path.join(OUT, "%02d_%s" % (i + 1, name)))
        else:
            print("[store] missing", path)


if __name__ == "__main__":
    main()
