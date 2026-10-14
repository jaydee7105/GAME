// Puzzle ideas. Each one lays out a scene around a specific trick, a drop
// order and a goal; tools/puzzlegen.ts then checks it has a solution a person
// can pull off and that grabbing the nearest merge isn't enough.
//
// Builders work in jar pixels (600 x 760, y down) and can be mirrored.
import { Mechanic } from "../src/game/chapters";
import { Draft, H, RADII as R, W, chain, make, type Goal } from "./levelkit";

export interface Opts {
  /** Base planet tier for the idea (grows through the game). */
  T: number;
  /** Mirror left/right. */
  m: boolean;
  /** Progress through the game, 0..1. */
  d: number;
}

export interface Concept {
  id: string;
  /** Name shown to the player. */
  title: string;
  /** Mechanics the player must have met before this idea can appear. */
  needs?: Mechanic[];
  /** Mechanics this idea shows off (preferred in those chapters). */
  shows?: Mechanic[];
  build(dr: Draft, o: Opts): { queue: number[]; goals: Goal[] } | null;
}

const floorY = (t: number) => H - R[t] - 2;
const clampT = (t: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, t));

/** Places a planet allowing designed contact (but no real overlap). */
function put(dr: Draft, t: number, x: number, y: number, f = 0): boolean {
  if (dr.gap(x, y, R[t]) < -2) return false;
  dr.planets.push({ t, x, y, f });
  return true;
}

/** Where a planet dropped at x would rest on the floor and the given planets. */
function restY(dr: Draft, t: number, x: number): number {
  let y = floorY(t);
  for (const p of dr.planets) {
    if (p.f & 6) continue; // frozen planets hang in the air; things fall past them
    const rr = R[t] + R[p.t] + 1, dx = Math.abs(x - p.x);
    if (dx < rr) y = Math.min(y, p.y - Math.sqrt(rr * rr - dx * dx));
  }
  return y;
}

/** Puts a planet where it would come to rest when dropped at x. */
const rest = (dr: Draft, t: number, x: number, f = 0) => put(dr, t, x, restY(dr, t, x), f);

const mx = (o: Opts, x: number) => (o.m ? W - x : x);
const ma = (o: Opts, a: number) => (o.m ? -a : a);
const units = (q: number[]) => q.reduce((a, t) => a + 2 ** t, 0);

/** Small filler planets that can't pair into anything in `avoid` (nor build up to it). */
function junk(dr: Draft, avoid: number[], n: number): number[] {
  const lo = Math.min(...avoid);
  const pool = [0, 1, 2, 3].filter((t) => !avoid.includes(t) && t < lo - 1);
  const fallback = [0, 1, 2, 3].filter((t) => !avoid.includes(t));
  return Array.from({ length: n }, () => dr.pick(pool.length ? pool : fallback.length ? fallback : [0]));
}

/** Inserts items into a queue at random positions after the first `keep`. */
function sprinkle(dr: Draft, q: number[], items: number[], keep = 0): number[] {
  const out = [...q];
  for (const it of items) out.splice(keep + dr.int(0, out.length - keep), 0, it);
  return out;
}

export const CONCEPTS: Concept[] = [
  {
    id: "wall", title: "Over the Wall",
    build(dr, o) {
      // A wall splits the jar. Your big planet is on one side; the easy merge is on the other.
      const T = clampT(o.T, 3, 5), h = dr.r(250, 320);
      dr.bar(mx(o, 300), H - h / 2 - 4, h, Math.PI / 2);
      if (!rest(dr, T, mx(o, R[T] + 4))) return null;
      if (!rest(dr, T - 1, mx(o, 300 + 12 + R[T - 1] + dr.r(10, 60)))) return null;
      return { queue: sprinkle(dr, [T - 1, T - 1], junk(dr, [T - 1, T], 2), 1), goals: [make(T + 1)] };
    },
  },
  {
    id: "shelf", title: "Shelf Drop",
    shows: ["shelves"],
    build(dr, o) {
      // A planet waits on a shelf above its twin. Knock it off.
      const T = clampT(o.T, 3, 5), len = dr.r(220, 260), y = dr.r(390, 450);
      dr.bar(mx(o, len / 2 + 4), y, len, 0);
      if (!put(dr, T, mx(o, len * 0.55), y - 8 - R[T] - 1)) return null;
      if (!rest(dr, T, mx(o, len + R[T] * 0.6 + dr.r(0, 30)))) return null;
      rest(dr, T - 3 >= 0 ? T - 3 : 0, mx(o, W - 40));
      const q = [T - 1, T - 2];
      if (units(q) >= 2 ** T) return null;
      return { queue: sprinkle(dr, q, junk(dr, [T - 2, T - 1, T], 2)), goals: [make(T + 1)] };
    },
  },
  {
    id: "domino", title: "Domino Run",
    build(dr, o) {
      // A staircase of planets: keep it clear, then set it off from the small end.
      const a = clampT(o.T - 3, 0, 2);
      let x = 6;
      for (let k = 0; k < 4; k++) {
        const t = a + k;
        x += R[t];
        if (!rest(dr, t, mx(o, x))) return null;
        x += R[t] + 2;
      }
      const goals = o.d > 0.3 ? [chain(3), make(a + 4)] : [make(a + 4)];
      return { queue: [...junk(dr, [a, a + 1, a + 2, a + 3], dr.int(2, 3)), a], goals };
    },
  },
  {
    id: "bank", title: "Bank Shot",
    shows: ["shelves"],
    build(dr, o) {
      // A low roof hides the twin. Roll a planet down the ramp and under it.
      const T = clampT(o.T - 1, 2, 4);
      const roofY = H - 2 * R[T] - 26, rx0 = dr.r(320, 360);
      dr.bar(mx(o, (rx0 + W) / 2), roofY, W - rx0, 0);
      if (!rest(dr, T, mx(o, rx0 + R[T] + dr.r(20, 60)))) return null;
      // The ramp reaches the floor well before the roof, so a planet can roll in.
      const x0 = 24, y0 = dr.r(430, 480), x1 = rx0 - 2 * R[T] - 24, y1 = H - 10;
      dr.bar(mx(o, (x0 + x1) / 2), (y0 + y1) / 2, Math.hypot(x1 - x0, y1 - y0), ma(o, Math.atan2(y1 - y0, x1 - x0)));
      const q = sprinkle(dr, [T], junk(dr, [T], dr.int(1, 2)));
      return { queue: q, goals: [make(T + 1)] };
    },
  },
  {
    id: "tunnel", title: "Tunnel Run",
    shows: ["narrow", "shelves"],
    build(dr, o) {
      // The twin sits in a covered tunnel in the middle; only a rolling planet gets in.
      const T = clampT(o.T - 1, 2, 4), s = o.m ? -1 : 1, cx = mx(o, dr.r(380, 430)), w = 2 * R[T] + 80;
      const roofY = H - 2 * R[T] - 24;
      dr.bar(cx, roofY, w, 0);
      dr.bar(cx + s * (w / 2 + 6), (roofY + H) / 2, H - roofY, Math.PI / 2);
      if (!rest(dr, T, cx + s * (w / 2 - R[T] - 4))) return null;
      const x0 = mx(o, 20), y0 = dr.r(470, 520);
      const x1 = cx - s * (w / 2 + 2 * R[T] + 24), y1 = H - 8;
      dr.bar((x0 + x1) / 2, (y0 + y1) / 2, Math.hypot(x1 - x0, y1 - y0), Math.atan2(y1 - y0, x1 - x0));
      return { queue: sprinkle(dr, [T], junk(dr, [T], 2)), goals: [make(T + 1)] };
    },
  },

  {
    id: "pyramid", title: "Stack Attack",
    build(dr, o) {
      // The planet you need sits on top of a pyramid. Grow the base under it.
      const T = clampT(o.T, 3, 5);
      const row = [T - 2, T - 1, T - 2];
      const xs = [W / 2 - R[T - 1] - R[T - 2] - 1, W / 2, W / 2 + R[T - 1] + R[T - 2] + 1];
      row.forEach((t, k) => rest(dr, t, xs[k] + (o.m ? 3 : -3)));
      if (!rest(dr, T, W / 2 + dr.r(-10, 10))) return null;
      const q = sprinkle(dr, [T - 2], junk(dr, [T - 2, T - 1, T], 2), 0);
      return { queue: q, goals: [make(T + 1)] };
    },
  },


  {
    id: "icekey", title: "Ice Key", needs: ["ice"], shows: ["ice"],
    build(dr, o) {
      // A frozen planet hangs over its twin. Merge on the ledge beside it to crack the ice.
      const T = clampT(o.T, 3, 5), x = mx(o, dr.r(200, 280)), y = dr.r(340, 400);
      const thick = o.d > 0.45 && dr.chance(0.5);
      if (!put(dr, T, x, y, thick ? 4 : 2)) return null;
      // A small shelf right beside the ice, where a merge can happen.
      const lx = x + (o.m ? -1 : 1) * (R[T] + 52), ly = y + R[T] * 0.55;
      dr.bar(lx, ly, 90, 0);
      if (!rest(dr, T, x + dr.r(-12, 12))) return null;
      const k = dr.int(1, 2);
      const q = sprinkle(dr, thick ? [k, k, k, k] : [k, k], junk(dr, [k, T - 1, T], 2));
      if (units(q) >= 2 ** T) return null;
      return { queue: q, goals: [make(T + 1)] };
    },
  },
  {
    id: "icecage", title: "Ice Cage", needs: ["ice", "clear"], shows: ["ice", "clear"],
    build(dr, o) {
      // A marked planet under a frozen lid of the same size. Crack the lid and it drops in.
      const m = dr.int(2, 3), x = mx(o, dr.r(240, 360));
      if (!put(dr, m, x, floorY(m), 1)) return null;
      const lidY = floorY(m) - 2 * R[m] - dr.r(70, 110);
      if (!put(dr, m, x, lidY, 2)) return null;
      for (const sx of [-1, 1]) dr.bar(x + sx * (R[m] + 52), lidY + R[m] * 0.55, 80, 0);
      const k = m === 2 ? 0 : 1;
      const q = sprinkle(dr, [k, k], junk(dr, [k, m], 1));
      return { queue: q, goals: [{ kind: "clear", count: 1 }] };
    },
  },
  {
    id: "dig", title: "Dig It Out", needs: ["clear"], shows: ["clear"],
    build(dr, o) {
      // A marked planet is buried. Clear the planets on top, then reach it.
      const m = dr.int(1, 2), x = mx(o, dr.r(200, 400));
      if (!rest(dr, m, x, 1)) return null;
      const c1 = m + 2;
      if (!rest(dr, c1, x - 10)) return null;
      if (!rest(dr, 0, x + 20)) return null;
      const q = [...junk(dr, [m, c1], 1), c1, m];
      return { queue: q, goals: [{ kind: "clear", count: 1 }] };
    },
  },
  {
    id: "lifo", title: "Last In, First Out", needs: ["clear"], shows: ["clear"],
    build(dr, o) {
      // Two marked planets stacked in a narrow slot; the pieces arrive in the wrong order.
      const a = dr.int(1, 2), b = a + 1, gap = 2 * R[b] + 14, cx = mx(o, dr.r(200, 400));
      // Shallow enough that the merged planet pops out over the walls.
      const h = 2 * R[a] + R[b] + 6;
      for (const sx of [-1, 1]) dr.bar(cx + sx * (gap / 2 + 8), H - h / 2 - 4, h, Math.PI / 2);
      if (!rest(dr, a, cx, 1)) return null;
      if (!rest(dr, b, cx, 1)) return null;
      return { queue: [a, b, ...junk(dr, [a, b], 1), a], goals: [{ kind: "clear", count: 2 }] };
    },
  },
  {
    id: "dustpit", title: "Stardust Pit", needs: ["dust"], shows: ["dust"],
    build(dr, o) {
      // Stardust at the bottom of a narrow pit.
      const T = clampT(o.T - 2, 1, 3), gap = 2 * R[T + 1] + dr.r(20, 30), h = dr.r(160, 220);
      const cx = mx(o, dr.r(170, 430));
      dr.bar(cx - gap / 2 - 8, H - h / 2 - 4, h, Math.PI / 2);
      dr.bar(cx + gap / 2 + 8, H - h / 2 - 4, h, Math.PI / 2);
      dr.dust.push([cx, H - 30]);
      dr.dust.push([mx(o, cx > W / 2 ? 80 : W - 80), H - 30]);
      return { queue: sprinkle(dr, [T, T], junk(dr, [T], 2)), goals: [{ kind: "dust", count: 2 }] };
    },
  },
  {
    id: "dusttrail", title: "Stardust Trail", needs: ["dust"], shows: ["dust"],
    build(dr, o) {
      // Stardust in a line: each merge has to land on the next one.
      const n = dr.int(3, 4);
      for (let k = 0; k < n; k++) dr.dust.push([mx(o, 70 + k * dr.r(120, 150)), H - dr.r(25, 60)]);
      const t = dr.int(0, 2);
      rest(dr, t + 1, mx(o, W - R[t + 1] - 4));
      return { queue: sprinkle(dr, [t, t, t, t, t + 1], junk(dr, [t, t + 1], 1)), goals: [{ kind: "dust", count: n }] };
    },
  },
  {
    id: "funnel", title: "Funnel Order", shows: ["shelves"],
    build(dr, o) {
      // A funnel only lets small planets through to the twin below; big ones must go round.
      const T = clampT(o.T - 1, 3, 4), y = dr.r(380, 420), a = 0.42, len = 200;
      const gap = 2 * R[T - 1] + 26;
      const cx = mx(o, 200);
      const off = gap / 2 + (len / 2) * Math.cos(a);
      dr.bar(cx - off, y, len, a);
      dr.bar(cx + off, y, len, -a);
      if (!rest(dr, T, cx + dr.r(-20, 20))) return null;
      const q = [T + 1, T - 1, T - 1];
      return { queue: sprinkle(dr, q, junk(dr, [T - 1, T, T + 1], 1), 1), goals: [make(T + 1)] };
    },
  },
  {
    id: "icebridge", title: "Ice Bridge", needs: ["ice"], shows: ["ice"],
    build(dr, o) {
      // A bridge of frozen planets over the twin. Crack one to open a way down.
      const T = clampT(o.T - 1, 2, 4), y = dr.r(420, 470);
      const tiers = [2, 3, 2, 3].map((t) => (o.m ? 5 - t : t));
      let x = 4;
      for (const t of tiers) {
        x += R[t];
        if (!put(dr, t, x, y, 2)) return null;
        x += R[t] + dr.r(18, 28);
      }
      if (!rest(dr, T, mx(o, dr.r(150, 450)))) return null;
      const k = dr.int(0, 1);
      return { queue: sprinkle(dr, [k, k, T], junk(dr, [k, T], 1)), goals: [make(T + 1)] };
    },
  },
  {
    id: "twinthaw", title: "Twin Thaw", needs: ["ice"], shows: ["ice"],
    build(dr, o) {
      // Two frozen twins over a funnel. Free both and they'll meet in the middle.
      const T = clampT(o.T, 3, 4), y = dr.r(330, 380);
      for (const sx of [-1, 1]) {
        const x = W / 2 + sx * dr.r(150, 190);
        if (!put(dr, T, x, y + dr.r(-20, 20), 2)) return null;
        dr.bar(x - sx * (R[T] + 48), y + R[T] * 0.55, 80, 0);
      }
      dr.bar(130, 620, 250, 0.35);
      dr.bar(W - 130, 620, 250, -0.35);
      const k = dr.int(0, 1);
      const q = sprinkle(dr, [k, k, k, k], junk(dr, [k, T], 1));
      if (units(q) >= 2 ** T) return null;
      return { queue: q, goals: [make(T + 1)] };
    },
  },
  {
    id: "dustledge", title: "Shelf Dust", needs: ["dust"], shows: ["dust", "shelves"],
    build(dr, o) {
      // Stardust floats over two shelves: the merges have to happen up there.
      const t = dr.int(0, 1), y1 = dr.r(360, 400), y2 = y1 + dr.r(140, 180);
      dr.bar(mx(o, 120), y1, 220, ma(o, -0.06));
      dr.bar(mx(o, W - 120), y2, 220, ma(o, 0.06));
      dr.dust.push([mx(o, 110), y1 - 40], [mx(o, W - 110), y2 - 40]);
      return { queue: sprinkle(dr, [t, t, t, t], junk(dr, [t], 1)), goals: [{ kind: "dust", count: 2 }] };
    },
  },
  {
    id: "sorting", title: "Sorting Machine", needs: ["clear"], shows: ["clear", "narrow"],
    build(dr, o) {
      // Two bins, two marked planets. Send each arriving planet to the right bin.
      const a = dr.int(1, 2), b = a + 1, gap = 2 * R[b] + 14, h = 2 * R[b] + 10;
      const xs = [mx(o, 170), mx(o, 430)];
      const tiers = dr.chance(0.5) ? [a, b] : [b, a];
      for (let k = 0; k < 2; k++) {
        for (const sx of [-1, 1]) dr.bar(xs[k] + sx * (gap / 2 + 8), H - h / 2 - 4, h, Math.PI / 2);
        if (!rest(dr, tiers[k], xs[k], 1)) return null;
      }
      return { queue: [b, ...junk(dr, [a, b], 1), a], goals: [{ kind: "clear", count: 2 }] };
    },
  },

];
