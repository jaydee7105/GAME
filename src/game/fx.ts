// One-shot visual effects: particle bursts, shockwaves, floating text and the
// black hole. Simulated here, drawn on a 2D canvas.

import { ease } from "../core/tween";

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; damp: number }
interface Wave { x: number; y: number; r: number; color: string; width: number; t: number; dur: number }
interface Text { x: number; y: number; text: string; color: string; size: number; t: number; dur: number; rise: number; rot: number }
export interface Hole { x: number; y: number; radius: number; strength: number; spin: number }

export const FONT = "'Fredoka', 'Trebuchet MS', sans-serif";

const spriteCache = new Map<string, HTMLCanvasElement>();

/** A soft round dot tinted with `color`, cached. */
function dot(color: string): HTMLCanvasElement {
  let c = spriteCache.get(color);
  if (!c) {
    c = document.createElement("canvas");
    c.width = c.height = 32;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.25, color);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    spriteCache.set(color, c);
  }
  return c;
}

export class Fx {
  particles: Particle[] = [];
  waves: Wave[] = [];
  texts: Text[] = [];
  holes: Hole[] = [];

  burst(x: number, y: number, color: string, amount = 24, speed = 260, size = 1, lifetime = 0.7): void {
    for (let i = 0; i < amount; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.35 + 0.65 * Math.random());
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: lifetime * (0.7 + 0.3 * Math.random()), max: lifetime,
        size: (6 + Math.random() * 10) * size, color, damp: 2.2 + Math.random(),
      });
    }
  }

  shockwave(x: number, y: number, r: number, color: string, width = 6, dur = 0.45): void {
    this.waves.push({ x, y, r, color, width, t: 0, dur });
  }

  text(x: number, y: number, text: string, color = "#fff", size = 34, rise = 70, dur = 0.9, rot = 0): void {
    this.texts.push({ x, y, text, color, size, t: 0, dur, rise, rot });
  }

  update(dt: number): void {
    for (const p of this.particles) {
      p.life -= dt;
      p.vy += 280 * dt;
      const d = Math.exp(-p.damp * dt);
      p.vx *= d;
      p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const w of this.waves) w.t += dt;
    this.waves = this.waves.filter((w) => w.t < w.dur);
    for (const t of this.texts) t.t += dt;
    this.texts = this.texts.filter((t) => t.t < t.dur);
    for (const h of this.holes) h.spin += dt * 7;
  }

  clear(): void {
    this.particles = [];
    this.waves = [];
    this.texts = [];
    this.holes = [];
  }

  /** Effects that sit behind the planets. */
  drawBack(ctx: CanvasRenderingContext2D): void {
    for (const h of this.holes) drawHole(ctx, h);
  }

  drawFront(ctx: CanvasRenderingContext2D): void {
    for (const w of this.waves) {
      const p = ease.outCubic(w.t / w.dur);
      const r = w.r * (0.25 + 0.75 * p);
      ctx.globalAlpha = 1 - p;
      ctx.strokeStyle = w.color;
      ctx.lineWidth = Math.max(w.width * (1 - p), 1);
      ctx.beginPath();
      ctx.arc(w.x, w.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = (1 - p) * 0.35;
      ctx.lineWidth = Math.max(w.width * 0.5 * (1 - p), 1);
      ctx.beginPath();
      ctx.arc(w.x, w.y, r * 0.82, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    if (this.particles.length) {
      ctx.globalCompositeOperation = "lighter";
      for (const p of this.particles) {
        const k = Math.max(p.life / p.max, 0);
        const s = p.size * (0.3 + 0.7 * k);
        ctx.globalAlpha = Math.min(1, k * 1.4);
        ctx.drawImage(dot(p.color), p.x - s, p.y - s, s * 2, s * 2);
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }

    for (const t of this.texts) {
      const p = t.t / t.dur;
      const pop = ease.outBack(Math.min(t.t / 0.35, 1));
      const s = 0.4 + 0.6 * pop;
      const y = t.y - t.rise * ease.outCubic(p);
      ctx.save();
      ctx.translate(t.x, y);
      ctx.rotate(t.rot);
      ctx.scale(s, s);
      ctx.globalAlpha = p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4;
      ctx.font = `700 ${t.size}px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(t.size * 0.22, 6);
      ctx.strokeStyle = "rgba(16,8,36,0.9)";
      ctx.strokeText(t.text, 0, 0);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, 0, 0);
      ctx.restore();
    }
  }
}

function drawHole(ctx: CanvasRenderingContext2D, h: Hole): void {
  const r = h.radius * h.strength;
  if (r < 0.5) return;
  const glow = ctx.createRadialGradient(h.x, h.y, r * 0.4, h.x, h.y, r * 2.2);
  glow.addColorStop(0, "rgba(140,64,240,0.45)");
  glow.addColorStop(1, "rgba(140,64,240,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(h.x, h.y, r * 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,158,77,0.8)";
  ctx.lineWidth = Math.max(r * 0.09, 1.5);
  for (let arm = 0; arm < 3; arm++) {
    ctx.beginPath();
    for (let i = 0; i < 24; i++) {
      const t = i / 23;
      const a = h.spin + (arm * Math.PI * 2) / 3 + t * 4.2;
      const rr = r * (1.35 + (0.45 - 1.35) * t);
      const x = h.x + Math.cos(a) * rr, y = h.y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.fillStyle = "#050010";
  ctx.beginPath();
  ctx.arc(h.x, h.y, r * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,217,153,0.9)";
  ctx.lineWidth = Math.max(r * 0.05, 1);
  ctx.beginPath();
  ctx.arc(h.x, h.y, r * 0.58, 0, Math.PI * 2);
  ctx.stroke();
}
