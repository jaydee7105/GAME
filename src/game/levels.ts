// Adventure levels. The 500 level definitions live in levels-data.json, made
// by tools/levelgen.ts and balanced by playing every level with a bot
// (tools/calibrate.ts). This file holds the types and small helpers.

import data from "./levels-data.json";
import { CHAPTERS, LEVEL_COUNT, LEVELS_PER_CHAPTER, Mechanic, chapterOf } from "./chapters";

export { CHAPTERS, LEVEL_COUNT, LEVELS_PER_CHAPTER, chapterOf };

export type GoalKind = "make" | "score" | "merges" | "chain" | "dust" | "clear";

export interface Goal {
  kind: GoalKind;
  /** Planet tier for "make" goals. */
  tier?: number;
  count: number;
}

/** Start planet flags. */
export const MARKED = 1;
export const ICE1 = 2;
export const ICE2 = 4;

export interface LevelMods {
  /** Gravity multiplier (low < 1 < heavy). */
  gravity?: number;
  /** Planet bounciness (restitution), default 0.12. */
  bounce?: number;
  /** Slippery planets (almost no friction). */
  slip?: boolean;
  /** Side wind strength as a fraction of gravity. */
  wind?: number;
  /** Hide the next-planet preview. */
  hidden?: boolean;
  /** Extra pixels the danger line moves down. */
  ceiling?: number;
}

/** Coordinates are fractions of the jar (x of its width, y of its height from the top). */
export interface Level {
  id: number;
  chapter: number;
  drops: number;
  goals: Goal[];
  /** Planets already in the jar: [tier, x, y, flags]. */
  start: [number, number, number, number?][];
  /** Highest tier the dropper may hand out (0-4). */
  maxDrop: number;
  /** Fixed round rocks: [x, y, radius px]. */
  rocks?: [number, number, number][];
  /** Bars: [x, y, length px, angle rad, spin rad/s (0 = fixed shelf)]. */
  bars?: [number, number, number, number, number][];
  /** Gravity wells: [x, y, radius px, strength]. */
  wells?: [number, number, number, number][];
  /** Stardust to collect: [x, y]. */
  dust?: [number, number][];
  mods?: LevelMods;
  /** "hard" and "super" levels are flagged on the map; "boss" ends a chapter. */
  tag?: "hard" | "super" | "boss";
  /** Mechanic this level introduces (shows a "NEW" card). */
  intro?: Mechanic;
  /** Layout name (for tools and debugging). */
  layout?: string;
  /** Puzzle levels: the exact planets you get, in order (shown in advance). */
  queue?: number[];
  /** Puzzle levels: a known solution, drop x per planet as a fraction of the jar. */
  solution?: number[];
  /** Puzzle levels: the name of the idea ("Over the Wall"...). */
  title?: string;
}

export type LevelDef = Omit<Level, "id" | "chapter">;

const LEVELS = data as unknown as LevelDef[];
const cache = new Map<number, Level>();

export function getLevel(id: number): Level {
  let l = cache.get(id);
  if (!l) {
    const def = LEVELS[id - 1] ?? LEVELS[LEVELS.length - 1];
    l = { ...def, id, chapter: chapterOf(id) };
    cache.set(id, l);
  }
  return l;
}

/** Stars earned for finishing with this many drops left (puzzles: 3 unless a hint was used). */
export function starsFor(level: Pick<Level, "drops" | "queue">, dropsLeft: number, hinted = false): number {
  if (level.queue) return hinted ? 1 : 3;
  const f = dropsLeft / level.drops;
  return f >= 0.3 ? 3 : f >= 0.12 ? 2 : 1;
}

export function goalText(g: Goal, names: string[], plurals: string[] = names): string {
  switch (g.kind) {
    case "make": return g.count > 1 ? `Make ${g.count} ${plurals[g.tier!]}` : `Make ${names[g.tier!]}`;
    case "score": return `Score ${g.count.toLocaleString("en-US")}`;
    case "merges": return `Merge ${g.count} times`;
    case "chain": return `Set off a x${g.count} chain`;
    case "dust": return `Collect ${g.count} stardust`;
    case "clear": return g.count > 1 ? `Merge away ${g.count} marked planets` : "Merge away the marked planet";
  }
}

/** Icon name for goals that aren't about a planet. */
export function goalIcon(g: Goal): string {
  return { make: "planet", score: "star", merges: "planet", chain: "chain", dust: "sparkle", clear: "target" }[g.kind];
}

/** Mechanics present in a level, for the intro card chips. */
export function levelFeatures(l: Level): Mechanic[] {
  const f: Mechanic[] = [];
  const m = l.mods ?? {};
  if (m.gravity && m.gravity < 1) f.push("lowgrav");
  if (m.gravity && m.gravity > 1) f.push("heavy");
  if (l.rocks?.length) f.push("rocks");
  if (l.dust?.length) f.push("dust");
  if (m.hidden) f.push("hidden");
  if (l.start.some((s) => (s[3] ?? 0) & (ICE1 | ICE2))) f.push("ice");
  const bars = l.bars ?? [];
  if (bars.some((b) => !b[4] && Math.abs(Math.cos(b[3])) > 0.35)) f.push("shelves");
  if (bars.some((b) => !b[4] && Math.abs(Math.cos(b[3])) <= 0.35)) f.push("narrow");
  if (bars.some((b) => b[4])) f.push("spinners");
  if (l.start.some((s) => (s[3] ?? 0) & MARKED)) f.push("clear");
  if (m.bounce) f.push("bouncy");
  if (m.slip) f.push("slippery");
  if (m.wind) f.push("wind");
  if (l.wells?.length) f.push("wells");
  if (m.ceiling) f.push("ceiling");
  return f;
}
