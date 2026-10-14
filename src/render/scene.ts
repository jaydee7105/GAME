// Draws the playfield each frame using three stacked canvases:
//   back  (2D)    stars, back glass, halos, the Sun's glow, black holes
//   gl    (WebGL) lit planets
//   front (2D)    faces, Saturn's rings, aim guide, front glass, effects

import { Save } from "../core/save";
import { getTheme } from "../meta/themes";
import { GLASS, Jar } from "../game/jar";
import { COLORS, RADII, SATURN, SUN, collisionRadius } from "../game/planets";
import type { GameWorld, Planet } from "../game/world";
import type { Assets } from "./assets";
import { drawFace } from "./face";
import { PlanetGL } from "./planet-gl";
import { GLOW_SCALE, HALO_SCALE, drawRing, glow, halo } from "./sprites";

interface Star { x: number; y: number; r: number; s: number; o: number; c: string }

export class SceneRenderer {
  readonly back: HTMLCanvasElement;
  readonly glCanvas: HTMLCanvasElement;
  readonly front: HTMLCanvasElement;
  private bctx: CanvasRenderingContext2D;
  private fctx: CanvasRenderingContext2D;
  private gl: PlanetGL;
  private assets: Assets;
  /** World units -> device pixels. */
  private k = 1;
  viewW = 720;
  viewH = 1280;
  private stars: Star[] = [];
  private meteor: { x: number; y: number; vx: number; vy: number; t: number } | null = null;
  private meteorIn = 4;
  private time = 0;

  constructor(host: HTMLElement, assets: Assets) {
    this.assets = assets;
    const mk = (cls: string) => {
      const c = document.createElement("canvas");
      c.className = "layer " + cls;
      host.appendChild(c);
      return c;
    };
    this.back = mk("back");
    this.glCanvas = mk("gl");
    this.front = mk("front");
    this.bctx = this.back.getContext("2d")!;
    this.fctx = this.front.getContext("2d")!;
    this.gl = new PlanetGL(this.glCanvas);
    if (this.gl.ok) this.gl.load(assets.planets);
  }

  resize(cssW: number, cssH: number, scale: number, dpr: number): void {
    this.viewW = cssW / scale;
    this.viewH = cssH / scale;
    this.k = scale * dpr;
    for (const c of [this.back, this.glCanvas, this.front]) {
      c.width = Math.round(cssW * dpr);
      c.height = Math.round(cssH * dpr);
      c.style.width = cssW + "px";
      c.style.height = cssH + "px";
    }
    this.makeStars();
  }

  private makeStars(): void {
    const cols = ["#ffffff", "#ccdfff", "#ffebcc"];
    this.stars = Array.from({ length: 70 }, () => ({
      x: Math.random() * this.viewW, y: Math.random() * this.viewH,
      r: 0.8 + Math.random() * 1.5, s: 0.6 + Math.random() * 1.6, o: Math.random() * Math.PI * 2,
      c: cols[Math.floor(Math.random() * 3)],
    }));
  }

  render(w: GameWorld | null, dt: number, showWorld: boolean): void {
    this.time += dt;
    const b = this.bctx, f = this.fctx;
    // Clear in device pixels with an identity transform, then draw in world units.
    for (const [g, c] of [[b, this.back], [f, this.front]] as const) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, c.width, c.height);
      g.setTransform(this.k, 0, 0, this.k, 0, 0);
    }
    this.drawStars(b, dt);
    if (this.gl.ok) this.gl.begin(this.viewW, this.viewH, w?.shakeOffset.x ?? 0, w?.shakeOffset.y ?? 0);
    if (!w || !showWorld) return;

    const ox = w.shakeOffset.x, oy = w.shakeOffset.y;
    b.translate(ox, oy);
    f.translate(ox, oy);
    this.drawJarBack(b, w.jar);
    w.fx.drawBack(b);

    const faces = Save.setting("faces");
    const all = [...w.planets, ...w.ghosts];
    // Halos and the Sun's corona behind the planets.
    for (const p of all) this.drawGlow(b, p.tier, p.x, p.y, p.radius * p.scale, p.alpha);
    for (const p of all) this.drawPlanet(p.tier, p.x, p.y, p.radius * p.scale, p.angle, p.flash, p.alpha);

    // Dropper: the next planet, bobbing above the jar.
    if (w.dropReady) {
      const t = w.currentTier;
      const r = RADII[t] * w.dropScale;
      const y = w.dropY + Math.sin(this.time * 2.4) * 2;
      const a = Math.sin(this.time * 1.3) * 0.06;
      if (w.showGuide) this.drawGuide(f, w);
      this.drawGlow(b, t, w.dropX, y, r, 1);
      this.drawPlanet(t, w.dropX, y, r, a, 0, 1);
      if (faces) this.drawPlanetFace(f, t, w.dropX, y, r, a, w.dropFace.current, w.dropFace.blinking);
    }

    // Faces, then rings (clipped to the jar so they never poke through the glass).
    for (const p of all) {
      if (faces && p.alpha > 0.05) this.drawPlanetFace(f, p.tier, p.x, p.y, p.radius * p.scale, p.angle, p.face.current, p.face.blinking);
    }
    const rings = all.filter((p) => p.tier === SATURN);
    if (rings.length) {
      f.save();
      this.jarClip(f, w.jar);
      for (const p of rings) drawRing(f, p.x, p.y, p.radius * p.scale, p.alpha);
      f.restore();
    }

    this.drawJarFront(f, w.jar);
    w.fx.drawFront(f);
  }

  // -------------------------------------------------------------------------
  private drawPlanet(tier: number, x: number, y: number, r: number, angle: number, flash: number, alpha: number): void {
    if (r < 0.5) return;
    if (this.gl.ok) {
      this.gl.draw(tier, x, y, r, angle, { flash, alpha });
      return;
    }
    // Fallback without WebGL: plain textured sprite with a soft shading overlay.
    const b = this.bctx;
    b.save();
    b.globalAlpha = alpha;
    b.translate(x, y);
    b.rotate(angle);
    b.drawImage(this.assets.planets[tier].albedo, -r, -r, r * 2, r * 2);
    b.restore();
    const g = b.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.1, x, y, r);
    g.addColorStop(0, "rgba(255,255,255,0.12)");
    g.addColorStop(0.6, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(5,3,20,0.55)");
    b.fillStyle = g;
    b.beginPath();
    b.arc(x, y, r * 0.99, 0, Math.PI * 2);
    b.fill();
  }

  private drawGlow(g: CanvasRenderingContext2D, tier: number, x: number, y: number, r: number, alpha: number): void {
    if (tier === SUN) {
      const pulse = 1 + Math.sin(this.time * 2.2) * 0.04 + Math.sin(this.time * 5.3) * 0.015;
      const s = r * GLOW_SCALE * pulse;
      g.globalAlpha = alpha;
      g.drawImage(glow(), x - s, y - s, s * 2, s * 2);
      g.globalAlpha = 1;
      return;
    }
    const h = halo(tier);
    if (!h) return;
    const s = r * HALO_SCALE;
    g.globalAlpha = alpha;
    g.drawImage(h, x - s, y - s, s * 2, s * 2);
    g.globalAlpha = 1;
  }

  private drawPlanetFace(g: CanvasRenderingContext2D, tier: number, x: number, y: number, r: number, angle: number,
    mood: Parameters<typeof drawFace>[2], blinking: boolean): void {
    if (r < 6) return;
    g.save();
    g.translate(x, y);
    g.rotate(angle);
    drawFace(g, r * (tier === 0 ? 0.85 : 1), mood, blinking);
    g.restore();
  }

  private drawGuide(g: CanvasRenderingContext2D, w: GameWorld): void {
    const t = w.currentTier;
    const r = RADII[t];
    const landing = w.landingY();
    const top = w.dropY + r + 10;
    const bottom = landing;
    if (bottom - top < 6) return;
    const col = COLORS[t];
    let y = top + ((this.time * 60) % 22);
    g.fillStyle = "#ffffff";
    while (y < bottom - r) {
      g.globalAlpha = 0.42 * Math.min(Math.max((bottom - r - y) / 80, 0.25), 1);
      g.beginPath();
      g.arc(w.dropX, y, 3.2, 0, Math.PI * 2);
      g.fill();
      y += 22;
    }
    g.globalAlpha = 0.4;
    g.strokeStyle = col;
    g.lineWidth = 2.5;
    g.beginPath();
    g.arc(w.dropX, bottom, collisionRadius(t), 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 1;
  }

  // -------------------------------------------------------------------------
  // Jar
  // -------------------------------------------------------------------------
  private path(g: CanvasRenderingContext2D, pts: [number, number][]): void {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  }

  private jarClip(g: CanvasRenderingContext2D, jar: Jar): void {
    const pts = jar.outline(-GLASS * 0.5);
    pts[0] = [pts[0][0], -2000];
    pts[pts.length - 1] = [pts[pts.length - 1][0], -2000];
    this.path(g, pts);
    g.closePath();
    g.clip();
  }

  private drawJarBack(g: CanvasRenderingContext2D, jar: Jar): void {
    const r = jar.rect;
    this.path(g, jar.outline(0));
    g.closePath();
    const t = getTheme(Save.data.theme);
    const grad = g.createLinearGradient(0, r.y, 0, r.y + r.h);
    grad.addColorStop(0, t.fillTop);
    grad.addColorStop(1, t.fillBottom);
    g.fillStyle = grad;
    g.fill();
    const floor = g.createLinearGradient(0, r.y + r.h - 90, 0, r.y + r.h);
    floor.addColorStop(0, "rgba(140,166,255,0)");
    floor.addColorStop(1, "rgba(140,166,255,0.09)");
    g.fillStyle = floor;
    g.fillRect(r.x + 28, r.y + r.h - 90, r.w - 56, 90);
    g.strokeStyle = "rgba(191,209,255,0.10)";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(r.x, r.y);
    g.lineTo(r.x + r.w, r.y);
    g.stroke();
  }

  private drawJarFront(g: CanvasRenderingContext2D, jar: Jar): void {
    const r = jar.rect;
    const t = getTheme(Save.data.theme);
    g.lineCap = "round";
    g.lineJoin = "round";
    this.path(g, jar.outline(-GLASS * 0.5));
    if (t.glow !== "rgba(0,0,0,0)") {
      g.save();
      g.shadowColor = t.glow;
      g.shadowBlur = 26;
      g.strokeStyle = t.edge;
      g.lineWidth = GLASS + 4;
      g.stroke();
      g.restore();
    }
    g.strokeStyle = t.edge;
    g.lineWidth = GLASS + 4;
    g.stroke();
    g.strokeStyle = t.lip;
    g.lineWidth = GLASS * 0.45;
    g.stroke();
    this.path(g, jar.outline(1.5));
    g.strokeStyle = t.inner;
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = t.cap;
    for (const x of [r.x - GLASS * 0.5, r.x + r.w + GLASS * 0.5]) {
      g.beginPath();
      g.arc(x, r.y, GLASS * 0.75, 0, Math.PI * 2);
      g.fill();
    }
    // Reflections.
    g.strokeStyle = "rgba(255,255,255,0.10)";
    g.lineWidth = 12;
    g.beginPath();
    for (let i = 0; i < 12; i++) {
      const t = i / 11;
      const x = r.x + 22 + Math.sin(t * Math.PI) * 3;
      const y = r.y + 50 + (r.h - 170) * t;
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.stroke();
    g.lineWidth = 6;
    g.strokeStyle = "rgba(255,255,255,0.07)";
    g.beginPath();
    g.moveTo(r.x + 44, r.y + 70);
    g.lineTo(r.x + 44, r.y + 190);
    g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.05)";
    g.beginPath();
    g.moveTo(r.x + r.w - 26, r.y + 90);
    g.lineTo(r.x + r.w - 26, r.y + 300);
    g.stroke();

    // Danger line: dashed, glowing red as the jar overflows.
    const y = jar.lineY();
    const d = jar.danger;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * (8 + d * 10));
    const k = Math.min(d * 3, 1);
    const a = 0.16 + (0.55 + 0.45 * pulse - 0.16) * k;
    g.strokeStyle = `rgba(${255},${Math.round(255 - 191 * k)},${Math.round(255 - 166 * k)},${a})`;
    g.lineWidth = 3 + d * 3;
    g.lineCap = "butt";
    g.setLineDash([18, 12]);
    g.beginPath();
    g.moveTo(r.x + 14, y);
    g.lineTo(r.x + r.w - 14, y);
    g.stroke();
    g.setLineDash([]);
    if (d > 0) {
      g.fillStyle = `rgba(255,51,77,${0.12 * pulse * k})`;
      g.fillRect(r.x, y - 14, r.w, 28);
    }
  }

  // -------------------------------------------------------------------------
  // Background stars
  // -------------------------------------------------------------------------
  private drawStars(g: CanvasRenderingContext2D, dt: number): void {
    for (const s of this.stars) {
      const tw = 0.55 + 0.45 * Math.sin(this.time * s.s + s.o);
      const a = 0.35 + 0.65 * tw;
      const r = s.r * (0.8 + 0.3 * tw);
      g.fillStyle = s.c;
      g.globalAlpha = a * 0.12;
      g.beginPath();
      g.arc(s.x, s.y, r * 2.4, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = a;
      g.beginPath();
      g.arc(s.x, s.y, r, 0, Math.PI * 2);
      g.fill();
      if (s.r > 2) {
        const len = r * 4 * tw;
        g.globalAlpha = a * 0.5;
        g.fillRect(s.x - len, s.y - 0.5, len * 2, 1);
        g.fillRect(s.x - 0.5, s.y - len, 1, len * 2);
      }
    }
    g.globalAlpha = 1;
    this.meteorIn -= dt;
    if (this.meteorIn <= 0 && !this.meteor) {
      const sp = 700 + Math.random() * 300;
      this.meteor = { x: this.viewW * (0.2 + Math.random() * 0.9), y: Math.random() * this.viewH * 0.35, vx: -sp * 0.91, vy: sp * 0.41, t: 0 };
      this.meteorIn = 6 + Math.random() * 8;
    }
    const m = this.meteor;
    if (m) {
      m.t += dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      const a = Math.sin(Math.min(m.t / 1.2, 1) * Math.PI);
      const len = 160 / Math.hypot(m.vx, m.vy);
      const grad = g.createLinearGradient(m.x - m.vx * len, m.y - m.vy * len, m.x, m.y);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(1, `rgba(255,255,255,${0.85 * a})`);
      g.strokeStyle = grad;
      g.lineWidth = 2.5;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(m.x - m.vx * len, m.y - m.vy * len);
      g.lineTo(m.x, m.y);
      g.stroke();
      if (m.t > 1.2) this.meteor = null;
    }
  }
}

export type { Planet };
