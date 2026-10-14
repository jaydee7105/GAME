// Builds the 500 Adventure levels into src/game/levels-data.json.
//
//   npx tsx tools/levelgen.ts            all levels
//   npx tsx tools/levelgen.ts 120 140    regenerate a range, keep the rest
//
// Every level is a seeded combination of:
//   - the chapter's mechanics (rocks, shelves, ice, wind...), each with several layouts
//   - a starting pile (clutter, pyramid, towers, a head start...)
//   - goals that fit the mechanics (stardust levels collect dust, marked levels clear planets...)
// Starting planets are settled with real physics, levels that would merge or
// overflow on their own are rejected, and no two levels in a chapter share
// the same layout and goals. Drop budgets are set afterwards by playing every
// level with a bot (tools/calibrate.ts); until then a rough estimate is used.
import fs from "node:fs";
import { Rng, hashString } from "../src/core/rng";
import { CHAPTERS, LEVEL_COUNT, LEVELS_PER_CHAPTER, Mechanic, chapterOf } from "../src/game/chapters";
import { L, settle } from "./headless";

type Goal = import("../src/game/levels").Goal;
type LevelDef = import("../src/game/levels").LevelDef;
type LevelMods = import("../src/game/levels").LevelMods;
type Tag = LevelDef["tag"];

const OUT = new URL("../src/game/levels-data.json", import.meta.url);
const RADII = [22, 30, 39, 49, 60, 72, 85, 99, 114, 129, 145];
const W = 600, H = 760;
/** Obstacles stay below this, leaving room to aim and drop. */
const TOP = 200;
const { MARKED, ICE1, ICE2 } = L;

const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;

function segDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}

// ---------------------------------------------------------------------------
// A level being built, in jar pixels (0..600 across, 0..760 down)
// ---------------------------------------------------------------------------
class Draft {
  goals: Goal[] = [];
  planets: { t: number; x: number; y: number; f: number }[] = [];
  rocks: [number, number, number][] = [];
  bars: [number, number, number, number, number][] = [];
  wells: [number, number, number, number][] = [];
  dust: [number, number][] = [];
  mods: LevelMods = {};
  maxDrop = 4;
  tag: Tag;
  intro?: Mechanic;
  names: string[] = [];
  solids: { x: number; y: number; r: number }[] = [];
  caps: { x1: number; y1: number; x2: number; y2: number; r: number }[] = [];

  constructor(public rng: Rng) {}

  r(a: number, b: number): number { return this.rng.range(a, b); }
  int(a: number, b: number): number { return Math.min(Math.floor(this.rng.range(a, b + 1)), b); }
  chance(p: number): boolean { return this.rng.next() < p; }
  pick<T>(a: T[]): T { return a[Math.min(Math.floor(this.rng.next() * a.length), a.length - 1)]; }

  /** Free space around a circle (negative = overlapping). */
  gap(x: number, y: number, r: number, planets = true): number {
    let g = Math.min(x - r, W - x - r, H - y - r, y - r);
    for (const s of this.solids) g = Math.min(g, Math.hypot(s.x - x, s.y - y) - s.r - r);
    for (const c of this.caps) g = Math.min(g, segDist(x, y, c.x1, c.y1, c.x2, c.y2) - c.r - r);
    if (planets) for (const p of this.planets) g = Math.min(g, Math.hypot(p.x - x, p.y - y) - RADII[p.t] - r);
    return g;
  }

  rock(x: number, y: number, r: number, pad = 12): boolean {
    if (y - r < TOP || this.gap(x, y, r) < pad) return false;
    this.rocks.push([x, y, r]);
    this.solids.push({ x, y, r });
    return true;
  }

  bar(x: number, y: number, len: number, a: number, spin = 0): void {
    this.bars.push([x, y, len, a, spin]);
    if (spin) this.solids.push({ x, y, r: len / 2 + 10 });
    else {
      const c = (Math.cos(a) * len) / 2, s = (Math.sin(a) * len) / 2;
      this.caps.push({ x1: x - c, y1: y - s, x2: x + c, y2: y + s, r: 8 });
    }
  }

  well(x: number, y: number, r: number, s: number): void {
    this.wells.push([x, y, r, s]);
  }

  dustAt(x: number, y: number): boolean {
    if (y < 400 || this.gap(x, y, 18, false) < 6) return false;
    // Only where planets can reach it from above: nothing overhead.
    for (const c of this.caps) {
      const lo = Math.min(c.x1, c.x2) - 30, hi = Math.max(c.x1, c.x2) + 30;
      if (x > lo && x < hi && Math.min(c.y1, c.y2) < y) return false;
    }
    for (const k of this.solids) if (Math.abs(k.x - x) < k.r + 28 && k.y < y) return false;
    if (this.dust.some(([dx, dy]) => Math.hypot(dx - x, dy - y) < 70)) return false;
    this.dust.push([x, y]);
    return true;
  }

  /** Adds a planet if it fits; same-size neighbours are kept apart so nothing merges by itself. */
  planet(t: number, x: number, y: number, f = 0): boolean {
    const r = RADII[t];
    if (this.gap(x, y, r) < 1) return false;
    if (this.planets.some((p) => p.t === t && Math.hypot(p.x - x, p.y - y) < RADII[p.t] + r + 24)) return false;
    this.planets.push({ t, x, y, f });
    return true;
  }

  place(t: number, f: number, x0: number, x1: number, y0: number, y1: number, tries = 120): boolean {
    const r = RADII[t];
    for (let i = 0; i < tries; i++) {
      const x = this.r(Math.max(x0, r + 2), Math.min(x1, W - r - 2));
      const y = this.r(Math.max(y0, r + 2), Math.min(y1, H - r - 2));
      if (this.planet(t, x, y, f)) return true;
    }
    return false;
  }

  get marked(): number { return this.planets.filter((p) => p.f & MARKED).length; }
  get frozen(): number { return this.planets.filter((p) => p.f & (ICE1 | ICE2)).length; }

  def(drops: number): LevelDef {
    const out: LevelDef = {
      drops,
      goals: this.goals,
      start: this.planets.map((p) => (p.f ? [p.t, r4(p.x / W), r4(p.y / H), p.f] : [p.t, r4(p.x / W), r4(p.y / H)])),
      maxDrop: this.maxDrop,
    };
    if (this.rocks.length) out.rocks = this.rocks.map(([x, y, r]) => [r4(x / W), r4(y / H), Math.round(r)]);
    if (this.bars.length) out.bars = this.bars.map(([x, y, len, a, s]) => [r4(x / W), r4(y / H), Math.round(len), r2(a), r2(s)]);
    if (this.wells.length) out.wells = this.wells.map(([x, y, r, s]) => [r4(x / W), r4(y / H), Math.round(r), r2(s)]);
    if (this.dust.length) out.dust = this.dust.map(([x, y]) => [r4(x / W), r4(y / H)]);
    if (Object.keys(this.mods).length) out.mods = this.mods;
    if (this.tag) out.tag = this.tag;
    if (this.intro) out.intro = this.intro;
    out.layout = this.names.join("+");
    return out;
  }
}

type LayoutFn = (dr: Draft, d: number, strong: boolean) => string | null;

// ---------------------------------------------------------------------------
// Mechanic layouts
// ---------------------------------------------------------------------------
const MODS: Partial<Record<Mechanic, LayoutFn>> = {
  lowgrav: (dr, _d, strong) => { dr.mods.gravity = r2(dr.r(strong ? 0.4 : 0.48, 0.62)); return "lowgrav"; },
  heavy: (dr, _d, strong) => { dr.mods.gravity = r2(dr.r(1.45, strong ? 1.9 : 1.7)); return "heavy"; },
  bouncy: (dr, _d, strong) => { dr.mods.bounce = r2(dr.r(0.45, strong ? 0.7 : 0.6)); return "bouncy"; },
  slippery: (dr) => { dr.mods.slip = true; return "slippery"; },
  wind: (dr, d, strong) => { dr.mods.wind = r2(dr.r(0.12, 0.18 + 0.12 * d + (strong ? 0.06 : 0))); return "wind"; },
  hidden: (dr) => { dr.mods.hidden = true; return "clouds"; },
  ceiling: (dr, _d, strong) => { dr.mods.ceiling = Math.round(dr.r(90, strong ? 210 : 160)); return "ceiling"; },
};

const STRUCTURES: Partial<Record<Mechanic, LayoutFn[]>> = {
  rocks: [
    (dr, _d, strong) => {
      // Plinko pegs.
      const rows = strong ? 3 : 2, r = dr.r(13, 18), sp = dr.r(100, 125), y0 = dr.r(320, 400);
      for (let k = 0; k < rows; k++) {
        const y = y0 + k * dr.r(85, 105);
        for (let x = 60 + ((k % 2) * sp) / 2 + dr.r(-10, 10); x < W - 50; x += sp) dr.rock(x, y, r, 30);
      }
      return dr.rocks.length >= 4 ? "pegs" : null;
    },
    (dr, _d, strong) => {
      const n = strong ? 3 : 2;
      for (let i = 0, made = 0; i < 80 && made < n; i++) if (dr.rock(dr.r(70, 530), dr.r(470, 700), dr.r(34, 58), 70)) made++;
      return dr.rocks.length >= 2 ? "boulders" : null;
    },
    (dr) => {
      // Lumpy floor of half-buried rocks with pits between them.
      let x = dr.r(30, 70);
      while (x < W - 40) {
        const r = dr.r(26, 42);
        dr.rocks.push([x, H - r * 0.55, r]);
        dr.solids.push({ x, y: H - r * 0.55, r });
        x += r * 2 + dr.r(55, 95);
      }
      return "rock-floor";
    },
    (dr) => (dr.rock(dr.r(210, 390), dr.r(440, 560), dr.r(72, 95), 60) ? "island" : null),
    (dr) => {
      // A bowl of rocks that catches planets mid-jar.
      const cx = dr.r(260, 340), cy = dr.r(300, 360), rad = dr.r(190, 220), r = dr.r(17, 22);
      for (let a = 25; a <= 155; a += 26) dr.rock(cx + Math.cos((a * Math.PI) / 180) * rad, cy + Math.sin((a * Math.PI) / 180) * rad, r, 4);
      return dr.rocks.length >= 4 ? "rock-bowl" : null;
    },
  ],
  shelves: [
    (dr) => {
      const left = dr.chance(0.5), len = dr.r(200, 280), a = r2(dr.r(0.06, 0.26)) * (dr.chance(0.5) ? 1 : -1);
      dr.bar(left ? len / 2 + 6 : W - len / 2 - 6, dr.r(330, 520), len, a);
      return "shelf";
    },
    (dr) => {
      const y1 = dr.r(320, 380), len = dr.r(210, 260);
      dr.bar(len / 2 + 6, y1, len, r2(dr.r(0.05, 0.2)));
      dr.bar(W - len / 2 - 6, y1 + dr.r(150, 190), len, -r2(dr.r(0.05, 0.2)));
      return "staggered-shelves";
    },
    (dr) => {
      const y = dr.r(380, 470), a = dr.r(0.38, 0.5), len = 220;
      dr.bar(140, y, len, a);
      dr.bar(W - 140, y, len, -a);
      return "funnel";
    },
    (dr) => {
      const left = dr.chance(0.5), len = dr.r(300, 340), a = dr.r(0.22, 0.32);
      dr.bar(left ? len / 2 : W - len / 2, dr.r(400, 520), len, left ? a : -a);
      return "ramp";
    },
    (dr) => {
      dr.bar(dr.r(250, 350), dr.r(430, 530), dr.r(190, 240), r2(dr.r(-0.08, 0.08)));
      return "tray";
    },
  ],
  narrow: [
    (dr) => {
      const len = dr.r(300, 380), x = dr.r(150, 185);
      dr.bar(x, H - len / 2 - 6, len, Math.PI / 2);
      dr.bar(W - x, H - len / 2 - 6, len, Math.PI / 2);
      return "corridor";
    },
    (dr) => {
      const len = dr.r(280, 360);
      dr.bar(dr.r(260, 340), H - len / 2 - 6, len, Math.PI / 2);
      return "divider";
    },
    (dr) => {
      const y = dr.r(290, 340), len = 240, a = 0.6;
      dr.bar(len / 2 * Math.cos(a) - 4, y, len, a);
      dr.bar(W - (len / 2) * Math.cos(a) + 4, y, len, -a);
      return "pinch";
    },
    (dr) => {
      const xs = [150, 300, 450], hs = dr.chance(0.5) ? [130, 210, 290] : [290, 210, 130];
      xs.forEach((x, i) => dr.bar(x + dr.r(-15, 15), H - hs[i] / 2 - 6, hs[i], Math.PI / 2));
      return "steps";
    },
  ],
  spinners: [
    (dr, d) => {
      dr.bar(dr.r(270, 330), dr.r(450, 530), dr.r(200, 240), dr.r(0, 3), r2(dr.r(0.5, 0.8 + 0.4 * d)) * (dr.chance(0.5) ? 1 : -1));
      return "spinner";
    },
    (dr, d) => {
      const s = r2(dr.r(0.6, 0.9 + 0.4 * d)), y = dr.r(440, 520);
      dr.bar(160, y, 150, 0, s);
      dr.bar(W - 160, y, 150, 1.57, -s);
      return "twin-spinners";
    },
    (dr) => {
      dr.bar(300, dr.r(590, 630), dr.r(250, 280), 0.3, r2(dr.r(0.35, 0.55)) * (dr.chance(0.5) ? 1 : -1));
      return "low-spinner";
    },
    (dr, d) => {
      dr.bar(dr.r(260, 340), dr.r(330, 370), dr.r(160, 190), 0, r2(dr.r(1.1, 1.3 + 0.4 * d)) * (dr.chance(0.5) ? 1 : -1));
      return "fast-spinner";
    },
  ],
  wells: [
    (dr, _d, strong) => { dr.well(dr.r(240, 360), dr.r(400, 480), dr.r(140, 170), r2(dr.r(1.1, strong ? 1.6 : 1.4))); return "well"; },
    (dr) => {
      const y = dr.r(420, 500), s = r2(dr.r(1.1, 1.4));
      dr.well(165, y, 118, s);
      dr.well(W - 165, y + dr.r(-60, 60), 118, s);
      return "twin-wells";
    },
    (dr) => { dr.well(dr.chance(0.5) ? 135 : W - 135, dr.r(380, 480), dr.r(125, 145), r2(dr.r(1.2, 1.5))); return "side-well"; },
  ],
};

/** Frozen planets; strong layouts use thicker ice later on. */
const ICE: LayoutFn[] = [
  (dr, d, strong) => {
    const n = strong ? 2 : 1;
    for (let i = 0; i < n; i++) dr.place(dr.int(3, Math.min(4 + Math.floor(d * 3), 6)), iceFlag(dr, d, strong), 60, 540, 290, 470);
    return dr.frozen ? "frozen-hang" : null;
  },
  (dr, d, strong) => {
    const n = strong ? 4 : 3, step = W / n;
    for (let i = 0; i < n; i++) {
      const t = 1 + ((i + dr.int(0, 2)) % 3);
      dr.planet(t, step * (i + 0.5) + dr.r(-20, 20), H - RADII[t] - 2, iceFlag(dr, d, strong));
    }
    return dr.frozen >= 2 ? "frozen-floor" : null;
  },
  (dr, d, strong) => {
    // Two frozen twins: free both, then merge them.
    const t = dr.int(3, Math.min(4 + Math.floor(d * 2), 5)), f = iceFlag(dr, d, strong);
    const a = dr.place(t, f, 40, 240, 330, 640), b = a && dr.place(t, f, 360, 560, 330, 640);
    return a && b ? "frozen-twins" : null;
  },
  (dr, d, strong) => {
    // A broken shelf of ice across the jar.
    const y = dr.r(400, 470), n = 3;
    for (let i = 0; i < n; i++) dr.planet(2 + ((i + dr.int(0, 1)) % 2) * 2, 100 + i * 200 + dr.r(-15, 15), y + dr.r(-20, 20), iceFlag(dr, d, strong));
    return dr.frozen >= 2 ? "ice-shelf" : null;
  },
];

function iceFlag(dr: Draft, d: number, strong: boolean): number {
  return d > 0.3 && strong && dr.chance(0.5) ? ICE2 : ICE1;
}

/** Marked planets that must be merged away. */
const MARKS: LayoutFn[] = [
  (dr, d) => {
    const n = dr.int(2, d > 0.4 ? 4 : 3);
    for (let i = 0; i < n; i++) dr.place(dr.int(1, 3), MARKED, 40, 560, 600, 740);
    return dr.marked >= 2 ? "buried-marks" : null;
  },
  (dr) => {
    const n = dr.int(2, 3);
    for (let i = 0; i < n; i++) dr.place(dr.int(1, 4), MARKED, 40, 560, 250, 520);
    return dr.marked >= 2 ? "perched-marks" : null;
  },
  (dr, d) => {
    const n = dr.int(2, d > 0.5 ? 4 : 3);
    for (let i = 0; i < n; i++) dr.place(dr.int(0, 4), MARKED, 40, 560, 330, 740);
    return dr.marked >= 2 ? "scattered-marks" : null;
  },
];

/** Stardust patterns. */
const DUST: LayoutFn[] = [
  (dr, _d, strong) => {
    const n = strong ? 5 : dr.int(3, 4), y = dr.r(580, 690);
    for (let i = 0; i < n; i++) dr.dustAt(W * ((i + 0.5) / n) + dr.r(-15, 15), y + dr.r(-25, 25));
    return dr.dust.length >= 3 ? "dust-row" : null;
  },
  (dr) => {
    for (const [x, y] of [[60, 700], [W - 60, 700], [300, 600], [150, 520], [450, 520]] as const) dr.dustAt(x + dr.r(-15, 15), y + dr.r(-20, 20));
    return dr.dust.length >= 3 ? "dust-corners" : null;
  },
  (dr, _d, strong) => {
    const n = strong ? 6 : 4;
    for (let i = 0; i < 200 && dr.dust.length < n; i++) dr.dustAt(dr.r(50, 550), dr.r(420, 710));
    return dr.dust.length >= 3 ? "dust-scatter" : null;
  },
  (dr) => {
    dr.dustAt(dr.r(100, 250), dr.r(410, 470));
    dr.dustAt(dr.r(350, 500), dr.r(410, 470));
    for (let i = 0; i < 80 && dr.dust.length < 4; i++) dr.dustAt(dr.r(60, 540), dr.r(560, 710));
    return dr.dust.length >= 3 ? "dust-high" : null;
  },
  (dr) => {
    const x = dr.r(120, 480);
    for (const y of [700, 610, 520]) dr.dustAt(x + dr.r(-20, 20), y);
    return dr.dust.length >= 3 ? "dust-column" : null;
  },
];

/** Starting piles of loose planets. */
const PILES: Record<string, (dr: Draft, d: number, T: number) => boolean> = {
  none: () => true,
  clutter: (dr, d) => {
    const n = 2 + Math.floor(d * 5) + dr.int(0, 2);
    const top = Math.min(1 + Math.floor(d * 4), 4);
    for (let i = 0; i < n; i++) dr.place(dr.int(0, top), 0, 30, 570, 430, 740, 40);
    return true;
  },
  pyramid: (dr) => {
    const a = dr.int(0, 1), b = a + 1, c = a + 2;
    const rows = [[a, c, a, c], [b, b + 2, b], [a + 3]];
    rows.forEach((row, k) => row.forEach((t, i) => dr.planet(t, W / 2 + (i - (row.length - 1) / 2) * 118, H - RADII[t] - 3 - k * 92, 0)));
    return dr.planets.length >= 5;
  },
  towers: (dr) => {
    for (const x of [62, W - 62]) {
      const tiers = dr.chance(0.5) ? [3, 1, 2] : [2, 0, 3];
      let y = H - 3;
      for (const t of tiers) {
        y -= RADII[t];
        dr.planet(t, x + dr.r(-6, 6), y, 0);
        y -= RADII[t] + 4;
      }
    }
    return dr.planets.length >= 4;
  },
  headstart: (dr, _d, T) => dr.place(Math.max(T - 1, 2), 0, 120, 480, 560, 740),
  // Small to big along the floor: drop the right planet on the small end for a chain.
  staircase: (dr) => {
    const t0 = dr.int(0, 1), flip = dr.chance(0.5);
    let x = 10;
    for (let k = 0; k < 5; k++) {
      const t = t0 + k, r = RADII[t];
      x += r;
      if (x + r > W) break;
      dr.planet(t, flip ? W - x : x, H - r - 3, 0);
      x += r + 4;
    }
    return true;
  },
  // Two big twins far apart: dig a path to bring them together.
  "split-pair": (dr, _d, T) => {
    const t = Math.max(Math.min(T - 1, 5), 3), r = RADII[t];
    if (!dr.planet(t, r + 4, H - r - 4, 0) || !dr.planet(t, W - r - 4, H - r - 4, 0)) return false;
    for (let i = 0; i < 3; i++) dr.place(dr.int(0, 2), 0, 160, 440, 600, 740, 40);
    return true;
  },
  // A big planet sitting in the middle like a hill.
  hill: (dr) => dr.planet(dr.int(5, 6), dr.r(220, 380), H - 90, 0),
  // Big planets parked in both bottom corners.
  corners: (dr) => {
    const t = dr.int(4, 5), u = t === 4 ? 5 : 4;
    dr.planet(t, RADII[t] + 3, H - RADII[t] - 3, 0);
    dr.planet(u, W - RADII[u] - 3, H - RADII[u] - 3, 0);
    for (let i = 0; i < 2; i++) dr.place(dr.int(0, 2), 0, 180, 420, 620, 740, 40);
    return true;
  },
  // A tall column of alternating planets in the middle, splitting the jar.
  column: (dr) => {
    const x = dr.r(240, 360);
    let y = H - 3;
    for (const t of dr.chance(0.5) ? [4, 2, 3, 1] : [3, 1, 4, 2]) {
      y -= RADII[t];
      dr.planet(t, x + dr.r(-4, 4), y, 0);
      y -= RADII[t] + 2;
    }
    return dr.planets.length >= 3;
  },
  // Planets heaped against both walls, leaving a pit in the middle.
  pit: (dr) => {
    for (const side of [0, 1]) {
      for (let k = 0; k < 3; k++) {
        const t = dr.int(1, 3);
        dr.planet(t, side ? W - RADII[t] - 2 - (k === 2 ? 50 : 0) : RADII[t] + 2 + (k === 2 ? 50 : 0), H - 40 - k * 90, 0);
      }
    }
    return true;
  },
};

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------
const make = (tier: number, count = 1): Goal => ({ kind: "make", tier, count });
const score = (count: number): Goal => ({ kind: "score", count: Math.round(count / 10) * 10 });
const merges = (count: number): Goal => ({ kind: "merges", count: Math.round(count) });
const chain = (count: number): Goal => ({ kind: "chain", count });

/** Biggest planet whose rough drop cost fits the effort. */
function tierFor(effort: number, count = 1): number {
  for (let t = 9; t >= 3; t--) {
    const need = count === 1 ? 0.42 * 2 ** t + 9 : 0.34 * 2 ** t * count + 8;
    if (need <= effort) return t;
  }
  return 3;
}

/** Picks goals that suit the level's mechanics; returns the main goal kind. */
function chooseGoals(dr: Draft, effort: number, d: number, avoid: string, maxTier: number): string {
  const opts: string[] = [];
  if (dr.tag === "boss") {
    // Bosses always ask for something big, usually two things at once.
    if (dr.dust.length) opts.push("dust+make");
    if (dr.marked) opts.push("clear+make");
    if (!opts.length) opts.push("make", "chain+make", "make+score", "many");
    return pickGoals(dr, dr.pick(opts), effort, d, maxTier);
  }
  if (dr.dust.length) opts.push("dust", "dust", "dust+make");
  if (dr.marked) opts.push("clear", "clear+make", "clear+make");
  if (!opts.length) opts.push("make", "make", "many", "score", "merges", "chain+make", "make+score", "make+merges");
  if (dr.frozen && !dr.marked) opts.push("make", "make");
  if (dr.names.includes("staircase") && !dr.dust.length && !dr.marked) opts.push("chain+make", "chain+make");
  let pick = dr.pick(opts);
  for (let i = 0; i < 6 && pick.split("+")[0] === avoid; i++) pick = dr.pick(opts);
  return pickGoals(dr, pick, effort, d, maxTier);
}

function pickGoals(dr: Draft, pick: string, effort: number, d: number, maxTier: number): string {
  const T = Math.min(tierFor(effort), maxTier);
  switch (pick) {
    case "dust": dr.goals.push({ kind: "dust", count: dr.dust.length }); break;
    case "dust+make": dr.goals.push({ kind: "dust", count: dr.dust.length }, make(Math.min(tierFor(effort * 0.6), maxTier))); break;
    case "clear": dr.goals.push({ kind: "clear", count: dr.marked }); break;
    case "clear+make": dr.goals.push({ kind: "clear", count: dr.marked }, make(Math.min(tierFor(effort * 0.6), maxTier))); break;
    case "make": dr.goals.push(make(T)); break;
    case "many": {
      const n = dr.int(2, 3);
      dr.goals.push(make(Math.min(tierFor(effort, n), maxTier - 1), n));
      break;
    }
    case "score": dr.goals.push(score((effort - 6) * 8 * (1 + d))); break;
    case "merges": dr.goals.push(merges((effort - 5) / 1.45)); break;
    case "chain+make": dr.goals.push(chain(dr.names.includes("staircase") && d > 0.4 && dr.chance(0.5) ? 4 : 3), make(Math.min(tierFor(effort * 0.7), maxTier))); break;
    case "make+score": dr.goals.push(make(Math.min(tierFor(effort * 0.75), maxTier)), score((effort - 6) * 5 * (1 + d))); break;
    case "make+merges": dr.goals.push(make(Math.min(tierFor(effort * 0.75), maxTier)), merges((effort - 5) / 2.2)); break;
  }
  return pick.split("+")[0];
}

// ---------------------------------------------------------------------------
// Chapter 1: hand-made tutorial levels (no mechanics yet)
// ---------------------------------------------------------------------------
type Hand = { goals: Goal[]; start?: [number, number, number][]; maxDrop?: number; tag?: Tag; intro?: Mechanic; name: string };
const CH1: Hand[] = [
  { goals: [make(1, 2)], maxDrop: 1, name: "first-merge" },
  { goals: [make(3)], maxDrop: 2, name: "grow" },
  { goals: [score(110)], start: [[2, 120, 700], [2, 480, 700]], maxDrop: 3, name: "score" },
  { goals: [merges(12)], maxDrop: 3, name: "merges" },
  { goals: [make(4, 2)], start: [[3, 300, 690]], maxDrop: 3, name: "two-venus" },
  { goals: [make(5)], maxDrop: 4, name: "earth" },
  { goals: [make(3, 3), score(180)], start: [[0, 90, 720], [1, 510, 715]], maxDrop: 3, name: "mars-score" },
  { goals: [make(5)], start: [[4, 180, 690], [0, 420, 720], [1, 500, 715]], maxDrop: 4, name: "earth-start" },
  { goals: [merges(22)], start: [[2, 60, 700], [3, 300, 690], [2, 540, 700]], maxDrop: 4, tag: "hard", name: "merges-pile" },
  { goals: [make(5, 2)], start: [[4, 150, 690]], maxDrop: 4, name: "two-earths" },
  { goals: [chain(2), make(4)], maxDrop: 3, name: "first-chain" },
  { goals: [make(6)], start: [[5, 420, 680]], maxDrop: 4, name: "neptune" },
  { goals: [score(300), make(4, 2)], start: [[1, 60, 720], [2, 300, 700], [1, 540, 720]], maxDrop: 4, name: "score-venus" },
  { goals: [merges(30)], start: [[1, 75, 715], [2, 195, 705], [1, 315, 715], [3, 450, 690], [2, 135, 620], [3, 255, 610]], maxDrop: 4, name: "pyramid" },
  { goals: [chain(3)], start: [[1, 200, 715], [2, 280, 640], [3, 360, 690], [0, 520, 720]], maxDrop: 3, name: "chain-setup" },
  { goals: [make(5, 2), score(400)], maxDrop: 4, name: "earths-score" },
  { goals: [make(6)], start: [[0, 60, 720], [2, 160, 705], [1, 260, 715], [0, 360, 720], [2, 460, 705], [1, 540, 715]], maxDrop: 4, tag: "super", name: "neptune-clutter" },
  { goals: [score(500)], maxDrop: 4, name: "big-score" },
  { goals: [chain(3), make(5)], start: [[3, 120, 690], [4, 480, 680]], maxDrop: 4, name: "chain-earth" },
  { goals: [make(7)], start: [[5, 300, 680]], maxDrop: 4, tag: "boss", name: "boss-uranus" },
];

// ---------------------------------------------------------------------------
// Level assembly
// ---------------------------------------------------------------------------
function chapterRole(i: number, c: number): { role: "intro" | "practice" | "normal" | "boss"; tag: Tag } {
  if (i === LEVELS_PER_CHAPTER - 1) return { role: "boss", tag: "boss" };
  if (i === 0 && CHAPTERS[c].mechanic !== "basics") return { role: "intro", tag: undefined };
  if (i <= 2) return { role: "practice", tag: undefined };
  if (i === 16) return { role: "normal", tag: "super" };
  if (i === 8 || i === 13) return { role: "normal", tag: "hard" };
  return { role: "normal", tag: undefined };
}

/** Mechanics seen in chapters before c (for occasional throwbacks). */
function earlierMechanics(c: number): Mechanic[] {
  const s = new Set<Mechanic>();
  for (let k = 1; k < c; k++) for (const m of CHAPTERS[k].mix) s.add(m);
  return [...s];
}

function build(id: number, variant: number, prevKind: string): { draft: Draft; kind: string } | null {
  const rng = new Rng(hashString(`planet-drop-${id}-${variant}`));
  const dr = new Draft(rng);
  const c = chapterOf(id);
  const i = (id - 1) % LEVELS_PER_CHAPTER;
  const ch = CHAPTERS[c];
  const d = (id - 1) / (LEVEL_COUNT - 1);
  const { role, tag } = chapterRole(i, c);
  dr.tag = tag;

  if (c === 0) {
    const hand = CH1[i];
    dr.goals = hand.goals;
    dr.maxDrop = hand.maxDrop ?? 4;
    dr.tag = hand.tag;
    for (const [t, x, y] of hand.start ?? []) dr.planets.push({ t, x, y, f: 0 });
    dr.names.push(hand.name);
    return { draft: dr, kind: hand.goals[0].kind };
  }

  // Which mechanics this level uses.
  let mechs: Mechanic[];
  const own = ch.mechanic !== "basics" ? ch.mechanic : null;
  if (role === "intro" || role === "practice") mechs = own ? [own] : [dr.pick(ch.mix)];
  else if (role === "boss") mechs = [...ch.mix].sort(() => rng.next() - 0.5).slice(0, ch.mix.length > 3 ? 3 : ch.mix.length);
  else {
    const pool = ch.mix.filter((m) => m !== own);
    mechs = [];
    if (own && dr.chance(0.75)) mechs.push(own);
    const extra = own ? (dr.chance(0.45) ? 1 : 0) : dr.int(1, Math.min(2, pool.length));
    for (let k = 0; k < extra && pool.length; k++) {
      const m = dr.pick(pool.filter((x) => !mechs.includes(x)));
      if (m) mechs.push(m);
    }
    if (c >= 4 && dr.chance(0.18)) {
      const old = earlierMechanics(c).filter((m) => !mechs.includes(m));
      if (old.length) mechs.push(dr.pick(old));
    }
    if (!mechs.length) mechs.push(own ?? dr.pick(ch.mix));
  }
  if (role === "intro") dr.intro = own ?? undefined;
  const strong = role === "boss" || tag === "super" || (role === "normal" && dr.chance(0.35 + 0.3 * d));

  // Effort (roughly the drops a level should take) grows through the game.
  const base = 24 + 42 * d + 10 * (i / LEVELS_PER_CHAPTER);
  const effort = base * (role === "intro" ? 0.7 : role === "practice" ? 0.85 : role === "boss" ? 1.55 : tag === "super" ? 1.35 : tag === "hard" ? 1.2 : 1);
  const maxTier = d < 0.12 ? 6 : d < 0.4 ? 7 : 8;

  // Order matters: rules, then structures, then ice, marks, the loose pile and stardust.
  const order: Mechanic[] = ["lowgrav", "heavy", "bouncy", "slippery", "wind", "hidden", "ceiling", "narrow", "shelves", "rocks", "spinners", "wells", "ice", "clear", "dust"];
  mechs.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  for (const m of mechs) {
    let name: string | null = null;
    if (MODS[m]) name = MODS[m]!(dr, d, strong);
    else if (STRUCTURES[m]) name = dr.pick(STRUCTURES[m]!)(dr, d, strong);
    else if (m === "ice") name = dr.pick(ICE)(dr, d, strong);
    else if (m === "clear") {
      if (dr.frozen && dr.chance(0.5)) {
        const f = dr.planets.find((p) => p.f & (ICE1 | ICE2));
        if (f) f.f |= MARKED;
      }
      name = dr.pick(MARKS)(dr, d, strong);
    } else if (m === "dust") continue;
    if (!name) return null;
    dr.names.push(name);
  }

  // Loose starting pile.
  const T = Math.min(tierFor(effort), maxTier);
  const busy = dr.rocks.length + dr.bars.length + dr.frozen;
  const pileName = dr.pick(busy > 2
    ? ["none", "none", "clutter", "staircase"]
    : ["none", "clutter", "clutter", "pyramid", "towers", "headstart", "staircase", "split-pair", "hill", "pit", "corners", "column"]);
  if (!PILES[pileName](dr, d, T)) return null;
  if (pileName !== "none") dr.names.push(pileName);

  if (mechs.includes("dust")) {
    const name = dr.pick(DUST)(dr, d, strong);
    if (!name) return null;
    dr.names.push(name);
  }

  const kind = chooseGoals(dr, effort, d, prevKind, maxTier);
  // A head start makes a bigger planet reachable.
  if (pileName === "headstart" && dr.goals[0].kind === "make" && dr.goals[0].count === 1) dr.goals[0].tier = Math.min(dr.goals[0].tier! + 1, maxTier + 1, 9);
  if (role === "intro" || d < 0.05) dr.maxDrop = 4;
  return { draft: dr, kind };
}

/** The finale: make the Sun. */
function finale(): Draft {
  const dr = new Draft(new Rng(hashString("planet-drop-finale")));
  dr.tag = "boss";
  // A tower of giants, each touching the next: make a Neptune on top and
  // the whole stack cascades into the Sun.
  dr.planets.push(
    { t: 9, x: 135, y: 625, f: 0 }, { t: 8, x: 470, y: 640, f: 0 },
    { t: 7, x: 330, y: 470, f: 0 }, { t: 6, x: 150, y: 400, f: 0 },
  );
  dr.goals = [make(10)];
  dr.names.push("finale-sun");
  return dr;
}

// ---------------------------------------------------------------------------
const from = Number(process.argv[2] ?? 1);
const to = Number(process.argv[3] ?? LEVEL_COUNT);
const existing: LevelDef[] = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : [];
// Levels the calibrator found unfair get re-rolled from a later variant.
const BUMPS = new URL("./out/bumps.json", import.meta.url);
const bumps: Record<string, number> = fs.existsSync(BUMPS) ? JSON.parse(fs.readFileSync(BUMPS, "utf8")) : {};
const levels: LevelDef[] = [];
const seen = new Map<number, Set<string>>();
let prevKind = "";
const recent: string[] = [];
const stats = { retries: 0, failed: [] as number[] };

for (let id = 1; id <= LEVEL_COUNT; id++) {
  const c = chapterOf(id);
  if (!seen.has(c)) seen.set(c, new Set());
  if ((id < from || id > to) && existing[id - 1] && existing.length >= LEVEL_COUNT) {
    levels.push(existing[id - 1]);
    prevKind = existing[id - 1].goals[0].kind;
    seen.get(c)!.add(signature(existing[id - 1]));
    continue;
  }
  let done: LevelDef | null = null;
  const v0 = (bumps[id] ?? 0) * 100;
  for (let variant = v0; variant < v0 + 60 && !done; variant++) {
    const built = id === LEVEL_COUNT ? { draft: finale(), kind: "make" } : build(id, variant, prevKind);
    if (!built) { stats.retries++; continue; }
    const def = built.draft.def(0);
    const sig = signature(def);
    const ruleNames = ["lowgrav", "heavy", "bouncy", "slippery", "wind", "clouds", "ceiling"];
    const main = built.draft.names.filter((n) => !(n in PILES) && !ruleNames.includes(n))[0] ?? built.draft.names.find((n) => n in PILES) ?? "plain";
    if (main && recent.slice(-3).includes(main) && variant < v0 + 45) { stats.retries++; continue; }
    if (seen.get(c)!.has(sig) && variant < v0 + 50) { stats.retries++; continue; }
    const s = settle(def);
    if ((s.merged || s.high) && variant < v0 + 55) { stats.retries++; continue; }
    def.start = s.start;
    def.drops = estimate(def);
    seen.get(c)!.add(sig);
    prevKind = built.kind;
    recent.push(main ?? "");
    done = def;
  }
  if (!done) {
    stats.failed.push(id);
    done = existing[id - 1] ?? levels[levels.length - 1];
  }
  // Keep a previously calibrated budget if this level didn't change.
  const old = existing[id - 1];
  if (old && JSON.stringify({ ...old, drops: 0 }) === JSON.stringify({ ...done, drops: 0 })) done.drops = old.drops;
  levels.push(done);
  if (id % 25 === 0) console.log(`level ${id}: ${done.layout} | ${done.goals.map((g) => g.kind + (g.tier ?? "") + "x" + g.count).join(", ")}`);
}

fs.writeFileSync(OUT, "[\n" + levels.map((l) => JSON.stringify(l)).join(",\n") + "\n]\n");
const changed = levels.flatMap((l, i) => (existing[i] && JSON.stringify({ ...existing[i], drops: 0 }) === JSON.stringify({ ...l, drops: 0 }) ? [] : [i + 1]));
fs.writeFileSync(new URL("./out/changed.json", import.meta.url), JSON.stringify(changed));
console.log(`${changed.length} levels changed`);
console.log(`wrote ${levels.length} levels (${stats.retries} retries${stats.failed.length ? `, FAILED: ${stats.failed.join(",")}` : ""})`);

function signature(l: LevelDef): string {
  return `${l.layout}|${l.goals.map((g) => g.kind + (g.kind === "make" ? g.tier : "")).join(",")}`;
}

/** Rough drop budget until the calibrator replaces it. */
function estimate(l: LevelDef): number {
  let need = 0;
  for (const g of l.goals) {
    if (g.kind === "make") need = Math.max(need, g.count === 1 ? 0.42 * 2 ** g.tier! + 9 : 0.34 * 2 ** g.tier! * g.count + 8);
    else if (g.kind === "merges") need = Math.max(need, 1.45 * g.count + 5);
    else if (g.kind === "score") need = Math.max(need, g.count / 6 + 6);
    else need = Math.max(need, 8 * g.count + 8);
  }
  return Math.max(14, Math.min(Math.round(need * 1.3), 160));
}
