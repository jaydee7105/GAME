// Adventure mode: 100 levels in 10 chapters. Each level has goals, a drop
// budget and sometimes planets already in the jar. Levels 1-12 are hand-made
// to teach the game; the rest come from a seeded generator that follows a
// difficulty curve, so every player gets the same level N.

import { Rng, hashString } from "../core/rng";

export type GoalKind = "make" | "score" | "merges";

export interface Goal {
  kind: GoalKind;
  /** Planet tier for "make" goals. */
  tier?: number;
  count: number;
}

export interface Level {
  id: number;
  chapter: number;
  drops: number;
  goals: Goal[];
  /** Planets already in the jar: tier, x and y as fractions of the jar. */
  start: [number, number, number][];
  /** Highest tier the dropper may hand out (0-4). */
  maxDrop: number;
}

export const LEVEL_COUNT = 100;
export const LEVELS_PER_CHAPTER = 10;

export const CHAPTERS = [
  "Asteroid Belt", "Lunar Orbit", "Inner Planets", "Red Frontier", "Cloud Tops",
  "Blue Marble", "Ice Giants", "Ring World", "Storm Giant", "Solar Core",
];

/** Planet used as each chapter's emblem on the map. */
export const CHAPTER_ICON = [0, 1, 2, 3, 4, 5, 6, 8, 9, 10];

const make = (tier: number, count = 1): Goal => ({ kind: "make", tier, count });
const score = (count: number): Goal => ({ kind: "score", count });
const merges = (count: number): Goal => ({ kind: "merges", count });

/** Hand-made opening levels: each introduces one idea. */
const HANDMADE: Omit<Level, "id" | "chapter">[] = [
  { drops: 14, goals: [make(1, 2)], start: [], maxDrop: 1 },
  { drops: 18, goals: [make(3)], start: [], maxDrop: 2 },
  { drops: 22, goals: [score(110)], start: [[2, 0.2, 0.92], [2, 0.8, 0.92]], maxDrop: 3 },
  { drops: 26, goals: [merges(12)], start: [], maxDrop: 3 },
  { drops: 24, goals: [make(4, 2)], start: [[3, 0.5, 0.9]], maxDrop: 3 },
  { drops: 28, goals: [make(5)], start: [], maxDrop: 4 },
  { drops: 34, goals: [make(3, 3), score(180)], start: [[0, 0.15, 0.95], [1, 0.85, 0.94]], maxDrop: 3 },
  { drops: 26, goals: [make(5)], start: [[4, 0.3, 0.88], [0, 0.7, 0.95], [1, 0.82, 0.93]], maxDrop: 4 },
  { drops: 38, goals: [merges(22)], start: [[2, 0.1, 0.94], [3, 0.5, 0.9], [2, 0.9, 0.94]], maxDrop: 4 },
  { drops: 32, goals: [make(5, 2)], start: [[4, 0.25, 0.88]], maxDrop: 4 },
  { drops: 34, goals: [make(6)], start: [[5, 0.7, 0.86]], maxDrop: 4 },
  { drops: 40, goals: [score(300), make(4, 2)], start: [[1, 0.1, 0.95], [2, 0.5, 0.94], [1, 0.9, 0.95]], maxDrop: 4 },
];

/** "Asteroid units" a planet is worth: tier t is made from 2^t asteroids. */
const units = (tier: number) => Math.pow(2, tier);

/*
 * Drop budgets are fitted to simulation (tools/sim.ts): the number of drops a
 * decent player needs to win about 3 times in 4 is roughly
 *   one big planet:  0.42 x units + 9
 *   several planets: 0.34 x units + 8
 *   merges:          1.45 x merges + 5
 *   score:           points / 5 + 6
 * Early levels add a generous margin; late levels add almost none.
 */
const makeNeed = (tier: number, count: number) => (count === 1 ? 0.42 * units(tier) + 9 : 0.34 * units(tier) * count + 8);
const mergeNeed = (n: number) => 1.45 * n + 5;
const scoreNeed = (pts: number) => pts / 5 + 6;

/** Main planet per chapter for "make" goals. */
const CHAPTER_TARGET = [5, 5, 6, 6, 6, 7, 7, 7, 8, 8];

function generate(id: number): Omit<Level, "id" | "chapter"> {
  const rng = new Rng(hashString("planet-drop-level-" + id));
  const chapter = Math.floor((id - 1) / LEVELS_PER_CHAPTER);
  const d = Math.min((id - 1) / (LEVEL_COUNT - 1), 1);
  // Margin over the fitted budget: generous early, tight late. A gentle
  // saw-tooth inside each chapter makes the first levels of a chapter easier.
  const inChapter = ((id - 1) % LEVELS_PER_CHAPTER) / LEVELS_PER_CHAPTER;
  const margin = 1.45 - 0.4 * d - 0.12 * inChapter;
  const boss = id % 10 === 0;
  const start: [number, number, number][] = [];
  const goals: Goal[] = [];
  let need = 0;
  const target = CHAPTER_TARGET[chapter];

  if (boss) {
    // Boss: one big planet. From chapter 7 on, Jupiter with a Saturn head start.
    if (chapter >= 7) {
      goals.push(make(9));
      start.push([8, 0.3 + rng.next() * 0.4, 0.84]);
      need = makeNeed(8, 1) * 1.15 + 10;
    } else {
      goals.push(make(target + 1));
      need = makeNeed(target + 1, 1);
    }
  } else {
    switch (Math.floor(rng.next() * 4)) {
      case 0: {
        // One big planet, sometimes with a head start.
        goals.push(make(target));
        need = makeNeed(target, 1);
        if (rng.next() < 0.4) {
          start.push([target - 1, 0.2 + rng.next() * 0.6, 0.88]);
          need -= 0.42 * units(target - 1) * 0.85;
        }
        break;
      }
      case 1: {
        // Several medium planets.
        const t = Math.max(target - 2, 3);
        const n = 2 + Math.floor(rng.next() * 3);
        goals.push(make(t, n));
        need = makeNeed(t, n);
        break;
      }
      case 2: {
        // A planet and a score.
        const t = target - 1;
        const pts = Math.round((150 + 700 * d) / 10) * 10;
        goals.push(make(t), score(pts));
        const a = makeNeed(t, 1), b = scoreNeed(pts);
        // Both goals progress together, so this mix needs less than it looks.
        need = (Math.max(a, b) + 0.2 * Math.min(a, b)) * 0.55;
        break;
      }
      default: {
        // Lots of merges.
        const m = Math.round(20 + 40 * d);
        goals.push(merges(m));
        need = mergeNeed(m);
      }
    }
  }

  // Clutter: small planets already in the jar make later levels trickier.
  const clutter = Math.floor(rng.next() * (1 + 6 * d));
  for (let i = 0; i < clutter; i++) {
    const t = Math.floor(rng.next() * Math.min(2 + Math.floor(d * 4), 5));
    start.push([t, 0.08 + rng.next() * 0.84, 0.92 - 0.08 * Math.floor(i / 5)]);
  }
  need += clutter * 0.6;

  const drops = Math.max(14, Math.round(need * margin));
  return { drops: Math.min(drops, 220), goals, start, maxDrop: 4 };
}

const cache = new Map<number, Level>();

export function getLevel(id: number): Level {
  let l = cache.get(id);
  if (!l) {
    const base = id <= HANDMADE.length ? HANDMADE[id - 1] : generate(id);
    l = { ...base, id, chapter: Math.floor((id - 1) / LEVELS_PER_CHAPTER) };
    cache.set(id, l);
  }
  return l;
}

/** Stars earned for finishing with this many drops left. */
export function starsFor(level: Level, dropsLeft: number): number {
  const f = dropsLeft / level.drops;
  return f >= 0.3 ? 3 : f >= 0.12 ? 2 : 1;
}

export function goalText(g: Goal, names: string[], plurals: string[] = names): string {
  if (g.kind === "make") return g.count > 1 ? `Make ${g.count} ${plurals[g.tier!]}` : `Make ${names[g.tier!]}`;
  if (g.kind === "score") return `Score ${g.count.toLocaleString("en-US")}`;
  return `Merge ${g.count} times`;
}
