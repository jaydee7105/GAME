// Cached 2D sprites shared by the game and the UI: atmosphere halos, the Sun's
// glow, Saturn's ring and pre-lit planet icons.

import { COUNT, RIM_COLORS, RIM_STRENGTH, SATURN, SUN, rgb } from "../game/planets";
import type { Assets } from "./assets";
import { drawFace } from "./face";
import { PlanetGL } from "./planet-gl";

/** Ring texture: 256 px per planet radius (same density as the planet maps). */
export const RING_PX_PER_RADIUS = 256;

const halos = new Map<number, HTMLCanvasElement>();
let sunGlow: HTMLCanvasElement | null = null;

function radialSprite(size: number, stops: [number, string][]): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) grad.addColorStop(o, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

/** Thin atmosphere ring hugging the planet edge (planet edge at 1/1.18 of the sprite radius). */
export function halo(tier: number): HTMLCanvasElement | null {
  const s = RIM_STRENGTH[tier];
  if (s <= 0.2 || tier === SUN) return null;
  let c = halos.get(tier);
  if (!c) {
    const a = Math.min(s * 0.75, 0.7);
    const col = RIM_COLORS[tier];
    c = radialSprite(256, [
      [0, rgb(col, 0)], [0.8, rgb(col, 0)], [0.85, rgb(col, 0.9 * a)], [0.91, rgb(col, 0.28 * a)], [1, rgb(col, 0)],
    ]);
    halos.set(tier, c);
  }
  return c;
}
export const HALO_SCALE = 1.18;

/** The Sun's corona; the Sun's edge sits at 1/1.65 of the sprite radius. */
export function glow(): HTMLCanvasElement {
  sunGlow ??= radialSprite(256, [
    [0, "rgba(255,184,64,0.85)"], [0.58, "rgba(255,184,64,0.77)"], [0.64, "rgba(255,184,64,0.36)"],
    [0.78, "rgba(255,184,64,0.11)"], [1, "rgba(255,184,64,0)"],
  ]);
  return sunGlow;
}
export const GLOW_SCALE = 1.65;

// ---------------------------------------------------------------------------
// Icons for the UI
// ---------------------------------------------------------------------------
const ICON = 256;
const lit: HTMLCanvasElement[] = [];
const shadow: HTMLCanvasElement[] = [];
const urlCache = new Map<string, string>();
let ringImg: HTMLImageElement | null = null;

/** How much of the icon the planet body fills (rings and glow need room). */
export function iconBodyScale(tier: number): number {
  if (tier === SATURN) return 0.52;
  if (tier === SUN) return 0.8;
  return 0.92;
}

/** Renders every planet once, lit, for use in menus. */
export function buildIcons(assets: Assets): void {
  ringImg = assets.ring;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = ICON;
  const gl = new PlanetGL(canvas);
  if (gl.ok) gl.load(assets.planets);
  for (let tier = 0; tier < COUNT; tier++) {
    for (const locked of [false, true]) {
      const out = document.createElement("canvas");
      out.width = out.height = ICON;
      const g = out.getContext("2d")!;
      const r = (ICON / 2) * iconBodyScale(tier);
      const c = ICON / 2;
      if (!locked) {
        if (tier === SUN) g.drawImage(glow(), c - r * GLOW_SCALE, c - r * GLOW_SCALE, r * GLOW_SCALE * 2, r * GLOW_SCALE * 2);
        const h = halo(tier);
        if (h) g.drawImage(h, c - r * HALO_SCALE, c - r * HALO_SCALE, r * HALO_SCALE * 2, r * HALO_SCALE * 2);
      }
      if (gl.ok) {
        gl.begin(ICON, ICON);
        gl.draw(tier, c, c, r, 0, { locked: locked ? 1 : 0 });
        g.drawImage(canvas, 0, 0);
      } else {
        g.save();
        g.beginPath();
        g.arc(c, c, r, 0, Math.PI * 2);
        g.clip();
        g.drawImage(assets.planets[tier].albedo, c - r, c - r, r * 2, r * 2);
        g.restore();
        if (locked) {
          g.globalCompositeOperation = "source-atop";
          g.fillStyle = "#1a1636";
          g.fillRect(0, 0, ICON, ICON);
          g.globalCompositeOperation = "source-over";
        }
      }
      if (tier === SATURN) drawRing(g, c, c, r, locked ? 0.25 : 1);
      (locked ? shadow : lit)[tier] = out;
    }
  }
  gl.dispose();
}

/** Draws Saturn's ring (non-rotating) centred on a planet of radius r. */
export function drawRing(g: CanvasRenderingContext2D, x: number, y: number, r: number, alpha = 1): void {
  if (!ringImg) return;
  const w = (ringImg.width / RING_PX_PER_RADIUS) * r;
  const h = (ringImg.height / RING_PX_PER_RADIUS) * r;
  g.globalAlpha = alpha;
  g.drawImage(ringImg, x - w / 2, y - h / 2, w, h);
  g.globalAlpha = 1;
}

export function setRingImage(img: HTMLImageElement): void {
  ringImg = img;
}

/** A PNG data URL of a planet icon, optionally with a happy face or locked. */
export function iconUrl(tier: number, opts: { face?: boolean; locked?: boolean; mood?: "normal" | "happy" } = {}): string {
  const key = `${tier}|${opts.face ? 1 : 0}|${opts.locked ? 1 : 0}|${opts.mood ?? "normal"}`;
  let url = urlCache.get(key);
  if (!url) {
    const src = (opts.locked ? shadow : lit)[tier];
    const c = document.createElement("canvas");
    c.width = c.height = ICON;
    const g = c.getContext("2d")!;
    g.drawImage(src, 0, 0);
    if (opts.face && !opts.locked) {
      const r = (ICON / 2) * iconBodyScale(tier) * (tier === 0 ? 0.85 : 1);
      g.save();
      g.translate(ICON / 2, ICON / 2);
      drawFace(g, r, opts.mood ?? "normal", false);
      g.restore();
      if (tier === SATURN) drawRing(g, ICON / 2, ICON / 2, (ICON / 2) * iconBodyScale(tier));
    }
    url = c.toDataURL("image/png");
    urlCache.set(key, url);
  }
  return url;
}
