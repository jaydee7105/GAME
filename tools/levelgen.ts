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
import { CHAPTERS, LEVEL_COUNT, LEVELS_PER_CHAPTER, Mechanic, chapterOf, isPuzzleSlot } from "../src/game/chapters";
import { L, settle } from "./headless";
import {
  Draft, DUST, H, ICE, MARKS, MODS, PILES, RADII, STRUCTURES, W, chain, chooseGoals, make, merges, score, tierFor,
  type Goal, type LevelDef, type Tag,
} from "./levelkit";

const OUT = new URL("../src/game/levels-data.json", import.meta.url);
const { MARKED, ICE1, ICE2 } = L;

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
  // Puzzle slots belong to tools/puzzlegen.ts; keep whatever puzzle is there.
  if (isPuzzleSlot(id) && existing[id - 1]?.queue) {
    levels.push(existing[id - 1]);
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
