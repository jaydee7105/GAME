"""Contact sheet of planets lit the same way as the game shader (for art review)."""
import sys, os, numpy as np
from PIL import Image
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
P = os.path.join(ROOT, "public", "assets", "planets")
L = np.array([-0.55, 0.62, 0.56]); L /= np.linalg.norm(L)
names = sys.argv[2:] or ["asteroid","moon","mercury","mars","venus","earth","neptune","uranus","saturn","jupiter","sun"]
S = 256
sheet = Image.new("RGBA", (S * len(names), S + 40), (14, 12, 34, 255))
for i, n in enumerate(names):
    a = np.asarray(Image.open(f"{P}/{n}.png").resize((S, S), Image.LANCZOS)).astype(np.float32) / 255
    nm = np.asarray(Image.open(f"{P}/{n}_n.png").convert("RGB").resize((S, S), Image.LANCZOS)).astype(np.float32) / 255
    N = nm[..., :3] * 2 - 1
    N /= np.maximum(np.linalg.norm(N, axis=-1, keepdims=True), 1e-4)
    if n == "sun":
        col = a[..., :3] * 1.1
    else:
        d = np.clip(N @ L, 0, 1)
        wrap = np.clip((N @ L + 0.25) / 1.25, 0, 1)
        lit = 0.16 + 0.95 * wrap ** 1.3
        H = L + np.array([0, 0, 1.0]); H /= np.linalg.norm(H)
        sp = f"{P}/{n}_s.png"
        sm = np.asarray(Image.open(sp).convert("L").resize((S, S), Image.LANCZOS)).astype(np.float32)[..., None] / 255 if os.path.exists(sp) else 0
        spec = sm * np.clip(N @ H, 0, 1)[..., None] ** 40 * 0.8
        rim = (1 - np.clip(N[..., 2], 0, 1)) ** 3 * 0.35
        col = a[..., :3] * lit[..., None] + spec + rim[..., None] * np.array([0.6, 0.75, 1.0])
    out = np.concatenate([np.clip(col, 0, 1), a[..., 3:4]], -1)
    im = Image.fromarray((out * 255).astype(np.uint8), "RGBA")
    sheet.alpha_composite(im, (i * S, 20))
sheet.save(sys.argv[1])
