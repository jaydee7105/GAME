// Drawing for Adventure mechanics: rocks, shelves, spinners, gravity wells,
// stardust, frozen and marked planets, wind and the low ceiling.

import { BAR_THICKNESS } from "../game/world";
import type { GameWorld, Planet } from "../game/world";

type Ctx = CanvasRenderingContext2D;

// ---------------------------------------------------------------------------
// Rocks: cached, procedurally cratered boulders
// ---------------------------------------------------------------------------
const rockCache = new Map<number, HTMLCanvasElement>();

function rockSprite(r: number): HTMLCanvasElement {
  const key = Math.round(r);
  let c = rockCache.get(key);
  if (c) return c;
  const pad = 6;
  const size = Math.ceil((key + pad) * 2);
  c = document.createElement("canvas");
  c.width = c.height = size * 2;
  const g = c.getContext("2d")!;
  g.scale(2, 2);
  const cx = size / 2, cy = size / 2;
  // Lumpy outline.
  let seed = key * 9301 + 49297;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const pts: [number, number][] = [];
  const n = 18;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = key * (0.93 + rnd() * 0.1);
    pts.push([cx + Math.cos(a) * k, cy + Math.sin(a) * k]);
  }
  const shape = () => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
  };
  g.save();
  g.shadowColor = "rgba(0,0,0,0.55)";
  g.shadowBlur = 8;
  g.shadowOffsetY = 3;
  shape();
  const body = g.createRadialGradient(cx - key * 0.35, cy - key * 0.4, key * 0.1, cx, cy, key * 1.05);
  body.addColorStop(0, "#8d8299");
  body.addColorStop(0.55, "#5b5168");
  body.addColorStop(1, "#2f2839");
  g.fillStyle = body;
  g.fill();
  g.restore();
  g.save();
  shape();
  g.clip();
  for (let i = 0; i < 3 + key / 10; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * key * 0.65, cr = key * (0.1 + rnd() * 0.16);
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
    g.fillStyle = "rgba(30,24,40,0.45)";
    g.beginPath();
    g.arc(x, y, cr, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(200,190,215,0.25)";
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(x, y + cr * 0.15, cr, Math.PI * 0.1, Math.PI * 0.9);
    g.stroke();
  }
  g.restore();
  shape();
  g.strokeStyle = "rgba(225,215,240,0.35)";
  g.lineWidth = 1.5;
  g.stroke();
  rockCache.set(key, c);
  return c;
}

export function drawRocks(g: Ctx, w: GameWorld): void {
  for (const k of w.rocks) {
    const s = rockSprite(k.r);
    const size = s.width / 2;
    g.drawImage(s, k.x - size / 2, k.y - size / 2, size, size);
  }
}

// ---------------------------------------------------------------------------
// Bars: fixed shelves / walls (steel) and spinners (glowing teal)
// ---------------------------------------------------------------------------
export function drawBars(g: Ctx, w: GameWorld, time: number): void {
  const t = BAR_THICKNESS;
  for (const b of w.bars) {
    g.save();
    g.translate(b.x, b.y);
    g.rotate(b.angle);
    const half = b.len / 2 + t / 2;
    const path = () => {
      g.beginPath();
      g.roundRect(-half, -t / 2, half * 2, t, t / 2);
    };
    g.shadowColor = b.spin ? "rgba(63,224,197,0.6)" : "rgba(0,0,0,0.5)";
    g.shadowBlur = b.spin ? 14 : 6;
    g.shadowOffsetY = b.spin ? 0 : 3;
    path();
    const grad = g.createLinearGradient(0, -t / 2, 0, t / 2);
    if (b.spin) {
      grad.addColorStop(0, "#9ff7e6");
      grad.addColorStop(0.5, "#2bb89f");
      grad.addColorStop(1, "#16705f");
    } else {
      grad.addColorStop(0, "#d9def0");
      grad.addColorStop(0.45, "#8e95b3");
      grad.addColorStop(1, "#4a4f69");
    }
    g.fillStyle = grad;
    g.fill();
    g.shadowColor = "transparent";
    g.strokeStyle = b.spin ? "rgba(220,255,248,0.6)" : "rgba(255,255,255,0.35)";
    g.lineWidth = 1.5;
    path();
    g.stroke();
    // Rivets / light dots along the bar.
    const n = Math.max(2, Math.floor(b.len / 46));
    for (let i = 0; i <= n; i++) {
      const x = -b.len / 2 + (b.len * i) / n;
      g.fillStyle = b.spin
        ? `rgba(230,255,250,${0.45 + 0.4 * Math.sin(time * 6 + i)})`
        : "rgba(40,44,62,0.55)";
      g.beginPath();
      g.arc(x, 0, 2.4, 0, Math.PI * 2);
      g.fill();
    }
    if (b.spin) {
      g.fillStyle = "#e8fffb";
      g.beginPath();
      g.arc(0, 0, t * 0.62, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#1c8c78";
      g.beginPath();
      g.arc(0, 0, t * 0.3, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
}

// ---------------------------------------------------------------------------
// Gravity wells: a soft violet swirl
// ---------------------------------------------------------------------------
export function drawWells(g: Ctx, w: GameWorld, time: number): void {
  for (const well of w.wells) {
    const glowG = g.createRadialGradient(well.x, well.y, 0, well.x, well.y, well.r);
    glowG.addColorStop(0, "rgba(170,120,255,0.42)");
    glowG.addColorStop(0.35, "rgba(123,108,255,0.16)");
    glowG.addColorStop(1, "rgba(123,108,255,0)");
    g.fillStyle = glowG;
    g.beginPath();
    g.arc(well.x, well.y, well.r, 0, Math.PI * 2);
    g.fill();
    g.save();
    g.translate(well.x, well.y);
    g.lineCap = "round";
    for (let arm = 0; arm < 3; arm++) {
      g.beginPath();
      for (let i = 0; i <= 30; i++) {
        const f = i / 30;
        const a = time * 1.6 + arm * ((Math.PI * 2) / 3) + f * 3.2;
        const d = well.r * (0.12 + 0.8 * f);
        const x = Math.cos(a) * d, y = Math.sin(a) * d;
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.strokeStyle = "rgba(200,170,255,0.28)";
      g.lineWidth = 3;
      g.stroke();
    }
    g.setLineDash([6, 10]);
    g.lineDashOffset = -time * 20;
    g.strokeStyle = "rgba(190,160,255,0.25)";
    g.lineWidth = 2;
    g.beginPath();
    g.arc(0, 0, well.r, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = "rgba(20,8,40,0.9)";
    g.beginPath();
    g.arc(0, 0, 9, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(220,190,255,0.8)";
    g.lineWidth = 2;
    g.stroke();
    g.restore();
  }
}

// ---------------------------------------------------------------------------
// Stardust: bobbing golden sparkles
// ---------------------------------------------------------------------------
export function drawDust(g: Ctx, w: GameWorld, time: number): void {
  w.dust.forEach((d, i) => {
    if (d.taken) return;
    const bob = Math.sin(time * 2.2 + i * 1.7) * 3;
    const x = d.x, y = d.y + bob;
    const pulse = 0.75 + 0.25 * Math.sin(time * 4 + i);
    const halo = g.createRadialGradient(x, y, 0, x, y, 30);
    halo.addColorStop(0, `rgba(255,226,122,${0.55 * pulse})`);
    halo.addColorStop(1, "rgba(255,226,122,0)");
    g.fillStyle = halo;
    g.beginPath();
    g.arc(x, y, 30, 0, Math.PI * 2);
    g.fill();
    g.save();
    g.translate(x, y);
    g.rotate(Math.sin(time * 1.3 + i) * 0.3);
    g.fillStyle = "#fff3c4";
    g.strokeStyle = "#e0a52b";
    g.lineWidth = 2;
    g.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 - Math.PI / 2;
      const rr = k % 2 ? 6 : 15;
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      if (k) g.lineTo(px, py);
      else g.moveTo(px, py);
    }
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  });
}

// ---------------------------------------------------------------------------
// Frozen and marked planets
// ---------------------------------------------------------------------------
export function drawIce(g: Ctx, p: Planet, time: number): void {
  const r = p.radius * p.scale + 5;
  const thick = p.ice >= 2;
  g.save();
  g.translate(p.x, p.y);
  const fill = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
  fill.addColorStop(0, `rgba(235,250,255,${thick ? 0.6 : 0.42})`);
  fill.addColorStop(0.7, `rgba(170,220,255,${thick ? 0.45 : 0.28})`);
  fill.addColorStop(1, `rgba(140,200,255,${thick ? 0.65 : 0.5})`);
  g.fillStyle = fill;
  g.beginPath();
  // Faceted ice block.
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.3;
    const k = r * (i % 2 ? 1.0 : 1.06);
    if (i) g.lineTo(Math.cos(a) * k, Math.sin(a) * k);
    else g.moveTo(Math.cos(a) * k, Math.sin(a) * k);
  }
  g.closePath();
  g.fill();
  g.strokeStyle = "rgba(235,250,255,0.85)";
  g.lineWidth = 2.5;
  g.stroke();
  // Highlights.
  g.strokeStyle = `rgba(255,255,255,${0.55 + 0.2 * Math.sin(time * 2 + p.x)})`;
  g.lineWidth = 3;
  g.beginPath();
  g.arc(0, 0, r * 0.72, Math.PI * 1.1, Math.PI * 1.45);
  g.stroke();
  if (!thick) {
    // A crack once the first layer is gone (or for single ice, a hint of one).
    g.strokeStyle = "rgba(255,255,255,0.5)";
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(r * 0.15, -r * 0.9);
    g.lineTo(r * 0.05, -r * 0.4);
    g.lineTo(r * 0.3, -r * 0.1);
    g.lineTo(r * 0.15, r * 0.35);
    g.stroke();
  }
  g.restore();
}

export function drawMarked(g: Ctx, p: Planet, time: number): void {
  const r = p.radius * p.scale + 8;
  g.save();
  g.translate(p.x, p.y);
  g.rotate(time * 0.8);
  g.strokeStyle = "rgba(255,159,46,0.95)";
  g.lineWidth = 4;
  g.setLineDash([14, 9]);
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  g.rotate(-time * 0.8);
  // Small target badge at the top-right.
  const bx = r * 0.72, by = -r * 0.72;
  g.fillStyle = "#ff9f2e";
  g.beginPath();
  g.arc(bx, by, 11, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#fff";
  g.lineWidth = 2.2;
  g.beginPath();
  g.arc(bx, by, 6, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "#fff";
  g.beginPath();
  g.arc(bx, by, 2.2, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

// ---------------------------------------------------------------------------
// Wind streaks and the low ceiling
// ---------------------------------------------------------------------------
export function drawWind(g: Ctx, w: GameWorld, time: number): void {
  if (!w.windStrength) return;
  const j = w.jar;
  const k = w.wind / w.windStrength; // -1..1
  const a = Math.abs(k);
  g.save();
  g.beginPath();
  g.rect(j.left, j.top, j.rect.w, j.rect.h);
  g.clip();
  g.lineCap = "round";
  for (let i = 0; i < 14; i++) {
    const y = j.top + 40 + ((i * 97) % (j.rect.h - 80));
    const speed = 260 + (i % 4) * 60;
    const span = j.rect.w + 200;
    const off = ((time * speed + i * 137) % span) - 100;
    const x = k >= 0 ? j.left + off : j.right - off;
    const len = 40 + (i % 3) * 25;
    g.strokeStyle = `rgba(220,235,255,${0.22 * a})`;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x - Math.sign(k || 1) * len, y);
    g.stroke();
  }
  g.restore();
  // Direction arrow above the jar.
  const cx = j.centerX, cy = j.top - 18;
  g.save();
  g.translate(cx, cy);
  g.scale(k >= 0 ? 1 : -1, 1);
  g.globalAlpha = 0.35 + 0.65 * a;
  g.fillStyle = "#bfe0ff";
  g.beginPath();
  g.moveTo(-26, -5);
  g.lineTo(10, -5);
  g.lineTo(10, -12);
  g.lineTo(28, 0);
  g.lineTo(10, 12);
  g.lineTo(10, 5);
  g.lineTo(-26, 5);
  g.closePath();
  g.fill();
  g.restore();
}

export function drawCeiling(g: Ctx, w: GameWorld): void {
  const j = w.jar;
  if (!j.lineOffset) return;
  const y = j.lineY();
  const grad = g.createLinearGradient(0, j.top, 0, y);
  grad.addColorStop(0, "rgba(255,80,110,0.16)");
  grad.addColorStop(1, "rgba(255,80,110,0.05)");
  g.fillStyle = grad;
  g.fillRect(j.left, j.top, j.rect.w, y - j.top);
  g.save();
  g.beginPath();
  g.rect(j.left, j.top, j.rect.w, y - j.top);
  g.clip();
  g.strokeStyle = "rgba(255,110,140,0.12)";
  g.lineWidth = 8;
  for (let x = j.left - 200; x < j.right; x += 34) {
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (y - j.top), j.top);
    g.stroke();
  }
  g.restore();
}
