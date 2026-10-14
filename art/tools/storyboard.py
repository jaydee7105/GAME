"""Draws a puzzle storyboard (from tools/storyboard.ts) as a strip of jar snapshots.

    python art/tools/storyboard.py story.json out.png
"""
import json
import math
import sys

from PIL import Image, ImageDraw

RADII = [22, 30, 39, 49, 60, 72, 85, 99, 114, 129, 145]
COL = ["#8a7a6b", "#d9d8d4", "#b8977a", "#d9612e", "#f5cf7a", "#3f8fd8", "#3d63e0", "#8fe0e3", "#e8cf92", "#d9a46e", "#ffd34d"]
NM = ["Ast", "Moon", "Merc", "Mars", "Ven", "Earth", "Nep", "Ura", "Sat", "Jup", "Sun"]
W, H, S = 600, 760, 0.42


def main(src, out):
    st = json.load(open(src))
    frames = st["frames"]
    fw, fh = int(W * S) + 12, int(H * S) + 70
    img = Image.new("RGB", (fw * len(frames), fh + 40), (16, 12, 40))
    d = ImageDraw.Draw(img)
    goals = ", ".join(f"make {NM[g['tier']]}" if g["kind"] == "make" else f"{g['kind']} {g['count']}" for g in st["goals"])
    q = " ".join(NM[t] for t in st["queue"])
    d.text((6, 4), f"#{st['id']} {st.get('title')} | goal: {goals} | queue: {q} | {st['result']}", fill=(255, 230, 150))
    for k, fr in enumerate(frames):
        ox, oy = k * fw + 6, 30
        P = lambda x, y: (ox + x * S, oy + y * S)
        d.rectangle([ox, oy, ox + W * S, oy + H * S], fill=(30, 26, 70), outline=(150, 160, 255))
        line = 6 + st["mods"].get("ceiling", 0)
        d.line([P(0, line), P(W, line)], fill=(255, 90, 110))
        for x, y, r in st["rocks"]:
            cx, cy = P(x * W, y * H)
            d.ellipse([cx - r * S, cy - r * S, cx + r * S, cy + r * S], fill=(90, 80, 105))
        for x, y, ln, an, sp in st["bars"]:
            cx, cy = P(x * W, y * H)
            dx, dy = math.cos(an) * ln / 2 * S, math.sin(an) * ln / 2 * S
            d.line([cx - dx, cy - dy, cx + dx, cy + dy], fill=(190, 195, 215), width=max(2, int(16 * S)))
        for x, y, taken in fr["dust"]:
            if not taken:
                cx, cy = P(x, y)
                d.regular_polygon((cx, cy, 6), 4, fill=(255, 226, 122))
        for t, x, y, ice, marked in fr["planets"]:
            cx, cy = P(x, y)
            r = RADII[t] * S
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=COL[t], outline=(170, 225, 255) if ice else None, width=3 if ice else 1)
            if marked:
                d.ellipse([cx - r - 3, cy - r - 3, cx + r + 3, cy + r + 3], outline=(255, 159, 46), width=2)
        if fr["dropX"] is not None:
            x = ox + fr["dropX"] * S
            d.line([x, oy, x, oy + 40], fill=(63, 224, 197), width=3)
            d.text((ox + 2, oy + H * S + 4), f"{k}. drop {NM[fr['tier']]} at {fr['dropX']}", fill=(220, 220, 255))
        else:
            d.text((ox + 2, oy + H * S + 4), "start", fill=(220, 220, 255))
    img.save(out)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
