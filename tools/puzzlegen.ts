// Designs the puzzle levels (most of Adventure) into src/game/levels-data.json.
//
//   npx tsx tools/puzzlegen.ts [from] [to] [workers]   design missing slots, then pick
//   npx tsx tools/puzzlegen.ts --prune [from] [to]       drop saved candidates that spam beats
//   npx tsx tools/puzzlegen.ts 1 500 4 --refill          ...then redesign emptied and thin slots
//
// A puzzle is a starting set-up, a fixed drop order the player can see, and a
// goal. For each puzzle slot we build set-ups from the same layouts as normal
// levels, then a planning bot searches drop positions with look-ahead (beam
// search over real physics, branching with save/restore). The goal is set to
// what its best plan achieves, and the level is kept only if:
//   - replaying the plan from scratch wins (the solution is stored for hints),
//   - it still wins when every drop is nudged a few pixels (a person can do it),
//   - the greedy bot that just grabs the nearest merge usually fails
//     (so it takes some thinking),
//   - dropping everything at one spot never wins, and dropping at random
//     spots almost never does (so it can't be mashed through).
import { spawn } from "node:child_process";
import fs from "node:fs";
import { Rng, hashString } from "../src/core/rng";
import { CHAPTERS, LEVEL_COUNT, LEVELS_PER_CHAPTER, Mechanic, chapterOf, isPuzzleSlot } from "../src/game/chapters";
import { GameWorld, L, chooseX, settle } from "./headless";
import { Draft, H, MODS, RADII, W, r4, type LevelDef } from "./levelkit";
import { CONCEPTS, type Concept } from "./puzzles";

type World = InstanceType<typeof GameWorld>;
type Level = import("../src/game/levels").Level;
type Kind = "reach" | "clear" | "dust" | "chain";

const DATA = new URL("../src/game/levels-data.json", import.meta.url);
const OUT_DIR = new URL("./out/", import.meta.url);
const DONE_DIR = new URL("./out/puzzles/", import.meta.url);
/** Mechanics that keep a puzzle deterministic: the jar must come to rest between drops. */
const TIER_NAMES = ["Asteroid", "Moon", "Mercury", "Mars", "Venus", "Earth", "Neptune", "Uranus", "Saturn", "Jupiter", "Sun"];

// ---------------------------------------------------------------------------
// Running a level step by step
// ---------------------------------------------------------------------------
function newWorld(): World {
  const w = new GameWorld();
  w.layout(720, 1280, 0, 0);
  return w;
}

function asLevel(def: LevelDef): Level {
  return { ...def, id: 9999, chapter: 0 };
}

/** Drops the current planet at x (fraction of the jar) and plays until the next one is ready. */
function step(w: World, fx: number): "ok" | "won" | "lost" {
  if (!w.dropReady || w.isOver) return "lost";
  w.dropTargetX = w.jar.left + fx * w.jar.rect.w;
  w.drop();
  for (let f = 0; f < 60 * 16; f++) {
    w.update(1 / 60);
    if (w.isOver) return w.hasWon ? "won" : "lost";
    if (w.dropReady) return "ok";
  }
  return "lost";
}

/** Plays a list of drops from the start; jitter (px) nudges each drop. */
function replay(level: Level, xs: number[], jitter = 0, rng?: Rng): boolean {
  const w = newWorld();
  w.start("adventure", level);
  for (const x of xs) {
    const j = jitter && rng ? ((rng.next() * 2 - 1) * jitter) / W : 0;
    const r = step(w, Math.min(Math.max(x + j, 0), 1));
    if (r === "won") return true;
    if (r === "lost") return false;
  }
  for (let f = 0; f < 60 * 6 && !w.isOver; f++) w.update(1 / 60);
  return w.hasWon;
}

/**
 * Wins out of 64 games where every planet goes to a random spot. A puzzle that
 * random play beats now and then gets mashed through instead of solved, and a
 * small sample lets lucky ones slip by, so look twice as hard at those that
 * win at all in the first 24 games.
 */
function randomSpamWins(id: number, level: Level): number {
  const sr = new Rng(hashString(`spam-${id}`));
  const game = () => replay(level, level.queue!.map(() => 0.02 + sr.next() * 0.96));
  let wins = 0;
  for (let k = 0; k < 24 && wins <= 6; k++) if (game()) wins++;
  if (wins === 0 || wins > 6) return wins;
  for (let k = 0; k < 40 && wins <= 6; k++) if (game()) wins++;
  return wins;
}

/** Most random-spam wins (of 64) allowed: a few in the first chapter, ~3% later. */
function spamLimit(id: number): number {
  const d = (id - 1) / (LEVEL_COUNT - 1);
  return chapterOf(id) === 0 ? 6 : d < 0.2 ? 3 : 2;
}

/** The greedy bot, knowing the drop order but never planning ahead. */
function greedy(level: Level, jitter: number, rng: Rng): boolean {
  const w = newWorld();
  w.start("adventure", level);
  for (let k = 0; k < (level.queue?.length ?? 0); k++) {
    const x = chooseX(w, 1);
    const j = ((rng.next() * 2 - 1) * jitter) / W;
    const r = step(w, Math.min(Math.max((x - w.jar.left) / w.jar.rect.w + j, 0), 1));
    if (r === "won") return true;
    if (r === "lost") return false;
  }
  return w.hasWon;
}

// ---------------------------------------------------------------------------
// The planner: beam search over drop positions
// ---------------------------------------------------------------------------
function candidates(w: World): number[] {
  const t = w.currentTier;
  const r = RADII[t];
  const xs: number[] = [];
  const lo = w.jar.left + r + 1, hi = w.jar.right - r - 1;
  for (let i = 0; i <= 14; i++) xs.push(lo + ((hi - lo) * i) / 14);
  // Ends of bars and tops of rocks are where clever drops tend to go.
  for (const b of w.bars) {
    const c = (Math.cos(b.angle) * b.len) / 2;
    xs.push(b.x - c, b.x + c, b.x - c * 0.6, b.x + c * 0.6);
  }
  for (const k of w.rocks) xs.push(k.x, k.x - k.r - r, k.x + k.r + r);
  for (const p of w.planets) {
    if (p.merging) continue;
    if (p.tier === t || p.marked || p.ice) {
      xs.push(p.x, p.x - (p.radius + r) * 0.85, p.x + (p.radius + r) * 0.85);
    }
  }
  for (const d of w.dust) if (!d.taken) xs.push(d.x);
  const out: number[] = [];
  for (const x of xs.map((v) => Math.min(Math.max(v, lo), hi)).sort((a, b) => a - b)) {
    if (!out.length || x - out[out.length - 1] > 10) out.push(x);
  }
  return out.slice(0, 34).map((x) => (x - w.jar.left) / w.jar.rect.w);
}

function value(w: World, kind: Kind): number {
  let pot = 0, top = Infinity;
  for (const p of w.planets) {
    pot += Math.pow(2, 1.3 * p.tier);
    top = Math.min(top, p.y - p.radius);
  }
  let v = Math.log2(1 + pot) * 10 - w.planets.length * 0.8;
  const room = top - w.jar.lineY();
  if (room < 160) v -= (160 - room) * 0.3;
  v += 30 * w.highest;
  // Set-ups: twins near each other, and planets next to the size they'll grow into.
  const ps = w.planets.filter((p) => !p.merging);
  for (let a = 0; a < ps.length; a++) {
    for (let b = a + 1; b < ps.length; b++) {
      const p = ps[a], q = ps[b], dt = Math.abs(p.tier - q.tier);
      if (dt > 1) continue;
      const gap = Math.max(Math.hypot(p.x - q.x, p.y - q.y) - p.radius - q.radius, 0);
      v += (dt === 0 && !p.ice && !q.ice ? 6 : 3) * Math.exp(-gap / 90);
    }
  }
  if (kind === "clear" || w.planets.some((p) => p.marked)) {
    v += 400 * w.cleared;
    // Reward having a same-size planet near each remaining marked one.
    for (const m of w.planets) {
      if (!m.marked) continue;
      let best = 600;
      for (const q of w.planets) if (q !== m && q.tier === m.tier && !q.marked) best = Math.min(best, Math.hypot(q.x - m.x, q.y - m.y));
      v -= best * 0.05;
    }
  }
  if (w.dust.length) {
    v += 400 * w.dustTaken;
    for (const d of w.dust) {
      if (d.taken) continue;
      let best = 600;
      for (const q of w.planets) best = Math.min(best, Math.hypot(q.x - d.x, q.y - d.y) - q.radius);
      v -= best * 0.04;
    }
  }
  if (kind === "chain") v += 250 * w.bestChain;
  v += 60 * w.planets.filter((p) => p.ice).length * -1;
  return v;
}

interface Node { snap: unknown; xs: number[]; v: number }
interface Plan { xs: number[]; won: boolean; highest: number; highestAt: number; madeCount: number; bestChain: number; chainAt: number }

/** Searches for good drop positions. Returns the best line found. */
function plan(level: Level, kind: Kind, beam: number): Plan {
  const w = newWorld();
  w.start("adventure", level);
  const n = level.queue!.length;
  let nodes: Node[] = [{ snap: w.snapshot(), xs: [], v: 0 }];
  let best: Plan = { xs: [], won: false, highest: 0, highestAt: 0, madeCount: 0, bestChain: 0, chainAt: 0 };
  const startTop = Math.max(...level.start.map((s) => s[0]), 0);
  for (let depth = 0; depth < n && nodes.length; depth++) {
    const next: Node[] = [];
    const seen = new Set<string>();
    for (const node of nodes) {
      const sim = newWorld();
      sim.restore(JSON.parse(JSON.stringify(node.snap)), level);
      const xs = candidates(sim);
      for (const x of xs) {
        sim.restore(JSON.parse(JSON.stringify(node.snap)), level);
        const r = step(sim, x);
        const line = [...node.xs, x];
        if (r === "won") return { ...best, xs: line, won: true };
        if (r === "lost") continue;
        // Track the most impressive things reached, for goals set from the plan.
        const made = sim.highest > startTop ? sim.highest : 0;
        if (made > best.highest || (made === best.highest && made && line.length < best.highestAt)) {
          best = { ...best, xs: line, highest: made, highestAt: line.length, madeCount: 1 };
        }
        if (sim.bestChain > best.bestChain) best = { ...best, bestChain: sim.bestChain, chainAt: line.length, xs: kind === "chain" ? line : best.xs };
        const snap = sim.snapshot();
        if (!snap) continue;
        const sig = sim.planets.map((p) => `${p.tier}:${Math.round(p.x / 25)}:${Math.round(p.y / 25)}`).sort().join("|");
        if (seen.has(sig)) continue;
        seen.add(sig);
        const kindSig = sim.planets.map((p) => p.tier * 4 + (p.ice ? 1 : 0) + (p.marked ? 2 : 0)).sort((a, b) => a - b).join(",");
        next.push({ snap, xs: line, v: value(sim, kind), kind: kindSig } as Node);
      }
    }
    next.sort((a, b) => b.v - a.v);
    // Keep different kinds of jar (by which planets are in it), not just the
    // top scores: the clever line often looks worse for a move or two.
    const perKind = new Map<string, number>();
    nodes = [];
    for (const nd of next) {
      const k = (nd as Node & { kind?: string }).kind ?? "";
      const n = perKind.get(k) ?? 0;
      if (n >= 3) continue;
      perKind.set(k, n + 1);
      nodes.push(nd);
      if (nodes.length >= beam) break;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Building one puzzle from an idea
// ---------------------------------------------------------------------------
/** Mechanics the player has met by chapter c. */
function known(c: number): Set<Mechanic> {
  const s = new Set<Mechanic>();
  for (let k = 0; k <= c; k++) {
    s.add(CHAPTERS[k].mechanic);
    for (const m of CHAPTERS[k].mix) s.add(m);
  }
  return s;
}

/** Ideas in order of preference for a slot: fresh ones first, the chapter's mechanic favoured. */
function preferences(id: number, recent: string[]): string[] {
  const c = chapterOf(id);
  const k = known(c);
  const ch = CHAPTERS[c];
  const rng = new Rng(hashString(`planet-drop-pref-${id}`));
  const ok = CONCEPTS.filter((cp) => (cp.needs ?? []).every((m) => k.has(m)));
  // The very first puzzle is the gentlest idea.
  if (!recent.length) return ["wall", ...ok.map((cp) => cp.id).filter((x) => x !== "wall")];
  const scored = ok.map((cp) => {
    let s = rng.next() * 1.5;
    if ((cp.shows ?? []).some((m) => m === ch.mechanic || ch.mix.includes(m))) s += 0.6;
    const age = recent.length - 1 - recent.lastIndexOf(cp.id);
    if (recent.includes(cp.id) && age < 3) s -= 5;
    else if (recent.includes(cp.id) && age < 6) s -= 1;
    return { id: cp.id, s };
  });
  return scored.sort((a, b) => b.s - a.s).map((x) => x.id);
}

function buildPuzzle(id: number, concept: Concept, variant: number): { def: LevelDef; kind: Kind } | null {
  const rng = new Rng(hashString(`planet-drop-puzzle-${id}-${concept.id}-${variant}`));
  const dr = new Draft(rng);
  const c = chapterOf(id);
  const i = (id - 1) % LEVELS_PER_CHAPTER;
  const d = (id - 1) / (LEVEL_COUNT - 1);
  const boss = i === LEVELS_PER_CHAPTER - 1;
  dr.tag = boss ? "boss" : i === 16 ? "super" : i === 13 ? "hard" : undefined;
  const T = c === 0 ? 3 + dr.int(0, 1) : d < 0.3 ? 4 : d < 0.6 ? 4 + dr.int(0, 1) : 5;
  const built = concept.build(dr, { T: T + (boss ? 1 : 0), m: rng.next() < 0.5, d });
  if (!built || dr.planets.length + dr.dust.length < 1) return null;
  // The chapter's physics rule colours the puzzle.
  const rules: Mechanic[] = ["lowgrav", "heavy", "bouncy", "slippery"];
  const rule = [CHAPTERS[c].mechanic, ...CHAPTERS[c].mix].find((m) => rules.includes(m));
  if (rule && rng.next() < 0.65) MODS[rule]!(dr, d, false);
  // Later puzzles ask for more: filler planets to park without spoiling the
  // set-up, a stardust side-quest, and less room under the ceiling.
  const queue = [...built.queue];
  const extra = d > 0.15 ? dr.int(0, Math.floor(d * 3)) : 0;
  for (let k = 0; k < extra; k++) queue.splice(1 + dr.int(0, queue.length - 1), 0, dr.int(0, 1));
  const goals = [...built.goals];
  if (d > 0.35 && known(c).has("dust") && !goals.some((g) => g.kind === "dust") && rng.next() < 0.35) {
    const n = dr.int(1, 2);
    for (let k = 0; k < 40 && dr.dust.length < n; k++) dr.dustAt(dr.r(60, 540), dr.r(560, 720));
    if (dr.dust.length) goals.push({ kind: "dust", count: dr.dust.length });
  }
  if (d > 0.55 && !dr.mods.ceiling && rng.next() < 0.35) dr.mods.ceiling = Math.round(dr.r(80, 140));
  built.queue = queue;
  dr.goals = goals;
  dr.names.push(`puzzle-${concept.id}`);
  const def = dr.def(built.queue.length);
  const s = settle(def);
  if (s.merged || s.high) return null;
  def.start = s.start;
  def.queue = built.queue;
  def.title = concept.title;
  const g = def.goals[0].kind;
  const kind: Kind = g === "clear" ? "clear" : g === "dust" ? "dust" : g === "chain" ? "chain" : "reach";
  return { def, kind };
}

/** Tries ideas (and variants of each) until one passes every check. */
function makePuzzle(id: number, prefs: string[], log: (s: string) => void, tries = 8): LevelDef | null {
  const reasons: string[] = [];
  const why = (r: string) => reasons.push(r);
  const d = (id - 1) / (LEVEL_COUNT - 1);
  const c = chapterOf(id);
  const greedyLimit = c === 0 ? 2 : d < 0.25 ? 1 : 0; // out of 4 greedy attempts
  for (const cid of prefs) {
    const concept = CONCEPTS.find((x) => x.id === cid)!;
    for (let variant = 0; variant < tries; variant++) {
      const built = buildPuzzle(id, concept, variant);
      if (!built) { why("build/settle"); continue; }
      const { def, kind } = built;
      const level = asLevel(def);
      const p = plan(level, kind, 12);
      if (!p.won) {
        why("no plan");
        if (process.env.PZ_DUMP && variant === 0) fs.writeFileSync(`${process.env.PZ_DUMP}/fail-${id}-${concept.id}.json`, JSON.stringify(def));
        continue;
      }
      // Verify exactly what gets stored (rounded), not the planner's raw numbers.
      const xs = p.xs.map(r4);
      if (xs.length < 2) { why("too short"); continue; }
      // 1. The plan must win when replayed exactly.
      if (!replay(level, xs)) { why("replay"); continue; }
      // 2. ...and when every drop is nudged (a person can actually do it).
      const jr = new Rng(hashString(`jitter-${id}`));
      let ok = 0;
      for (let k = 0; k < 6; k++) if (replay(level, xs, 8, jr)) ok++;
      if (ok < 3) { why(`robust ${ok}`); continue; }
      // 3. Grabbing the nearest merge shouldn't be enough.
      const gr = new Rng(hashString(`greedy-${id}`));
      let g = 0;
      for (let k = 0; k < 4; k++) if (greedy(level, 6, gr)) g++;
      if (g > greedyLimit && !concept.aim) { why(`greedy ${g}`); continue; }
      // 4. Spamming mustn't work: every planet at one spot, or at random spots.
      let spotWins = 0;
      for (const fx of [0.1, 0.3, 0.5, 0.7, 0.9]) if (replay(level, Array(def.queue!.length).fill(fx))) spotWins++;
      if (spotWins > (c === 0 ? 1 : 0)) { why(`spot-spam ${spotWins}`); continue; }
      const randWins = randomSpamWins(id, level);
      if (randWins > spamLimit(id)) { why(`random-spam ${randWins}`); continue; }
      def.solution = xs.map(r4);
      if (process.env.PZ_DUMP) fs.writeFileSync(`${process.env.PZ_DUMP}/${id}-${concept.id}.json`, JSON.stringify(def));
      log(`  ${String(id).padStart(3)} ${concept.title.padEnd(20)} ${def.goals.map((x) => (x.kind === "make" ? `make ${TIER_NAMES[x.tier!]}` : `${x.kind} ${x.count}`)).join(", ").padEnd(20)} drops ${def.queue!.length}  solved in ${xs.length}  robust ${ok}/6  greedy ${g}/4  v${variant}`);
      return def;
    }
  }
  if (process.env.PZ_TRY) log(`  ${id}: NO PUZZLE FOUND (${prefs.join(",")}) ${reasons.join(" ")}`);
  return null;
}

// ---------------------------------------------------------------------------
if (process.env.PZ_TRY) {
  // Debug: try every idea on one slot, e.g. PZ_TRY=130 npx tsx tools/puzzlegen.ts
  const id = Number(process.env.PZ_TRY);
  const only = process.env.PZ_ONLY?.split(",");
  for (const cp of CONCEPTS.filter((c) => !only || only.includes(c.id))) {
    const t0 = Date.now();
    makePuzzle(id, [cp.id], (s) => console.log(s.trim(), `(${((Date.now() - t0) / 1000).toFixed(1)} s)`));
  }
} else if (process.env.PZ_WORKER) {
  const ids = process.env.PZ_IDS!.split(",").filter(Boolean).map(Number);
  const prefs: Record<string, string[]> = JSON.parse(process.env.PZ_PREFS!);
  // Each finished puzzle is saved straight away, so an interrupted run can resume.
  for (const id of ids) {
    // Up to three good puzzles per slot, each a different idea; the merge
    // step then picks one per slot so ideas stay varied across the game.
    const f = new URL(`${id}.json`, DONE_DIR);
    const prev = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null;
    const cands: LevelDef[] = (Array.isArray(prev) ? prev : prev ? [prev] : []).filter(Boolean);
    let tried = 0;
    for (const cid of prefs[id]) {
      if (cands.length >= 3 || (tried >= 10 && cands.length)) break;
      if (cands.some((c) => c.layout?.endsWith(`puzzle-${cid}`) || c.layout === `puzzle-${cid}`)) continue;
      tried++;
      const def = makePuzzle(id, [cid], (s) => console.log(s), cands.length ? 6 : 12);
      if (def) cands.push(def);
    }
    if (!cands.length) console.log(`  ${id}: NO PUZZLE FOUND`);
    fs.writeFileSync(f, JSON.stringify(cands));
  }
} else if (process.argv.includes("--prune")) {
  // Re-checks every saved candidate against the random-spam test and drops
  // the ones that fail; the next run designs replacements for those slots.
  const [lo = 1, hi = LEVEL_COUNT] = process.argv.slice(2).filter((a) => !a.startsWith("--")).map(Number);
  let dropped = 0, emptied = 0;
  for (let id = lo; id <= hi; id++) {
    const f = new URL(`${id}.json`, DONE_DIR);
    if (!isPuzzleSlot(id) || !fs.existsSync(f)) continue;
    const raw = JSON.parse(fs.readFileSync(f, "utf8"));
    const cands: LevelDef[] = (Array.isArray(raw) ? raw : [raw]).filter(Boolean);
    const keep = cands.filter((def) => {
      const wins = randomSpamWins(id, asLevel(def));
      if (wins <= spamLimit(id)) return true;
      console.log(`  ${id} ${def.title}: random spam wins ${wins}/64`);
      return false;
    });
    dropped += cands.length - keep.length;
    if (keep.length === cands.length) continue;
    if (keep.length) fs.writeFileSync(f, JSON.stringify(keep));
    else {
      fs.rmSync(f);
      emptied++;
    }
  }
  console.log(`pruned ${dropped} candidates; ${emptied} slots need new puzzles`);
} else {
  const from = Number(process.argv[2] ?? 1);
  const to = Number(process.argv[3] ?? LEVEL_COUNT);
  const workers = Number(process.argv[4] ?? 4);
  const fresh = process.argv.includes("--fresh");
  const ids: number[] = [];
  fs.mkdirSync(DONE_DIR, { recursive: true });
  for (let id = from; id <= to; id++) {
    if (!isPuzzleSlot(id)) continue;
    const f = new URL(`${id}.json`, DONE_DIR);
    if (fresh) fs.rmSync(f, { force: true });
    else if (fs.existsSync(f)) {
      const v = JSON.parse(fs.readFileSync(f, "utf8"));
      // --refill also tops up slots that pruning left with a single candidate.
      const thin = process.argv.includes("--refill") && Array.isArray(v) && v.length < 2;
      if (!thin && (Array.isArray(v) || process.argv.includes("--merge"))) continue; // already has its candidates
    }
    ids.push(id);
  }
  console.log(`${ids.length} puzzle slots to design`);
  // Plan which idea each slot tries first so ideas don't repeat close together.
  const prefs: Record<number, string[]> = {};
  const recent: string[] = [];
  for (let id = 1; id <= LEVEL_COUNT; id++) {
    if (!isPuzzleSlot(id)) continue;
    prefs[id] = preferences(id, recent);
    recent.push(prefs[id][0]);
  }
  const t0 = Date.now();
  // Workers handle a few slots each and then exit, so physics garbage never
  // piles up; a worker that dies just leaves its slots for the next one.
  const queue = [...ids];
  const runWorker = async (): Promise<void> => {
    while (queue.length) {
      const batch = queue.splice(0, 4);
      await new Promise<void>((resolve) => {
        const child = spawn(process.execPath, ["--import", "tsx", new URL(import.meta.url).pathname], {
          env: { ...process.env, PZ_WORKER: "1", PZ_IDS: batch.join(","), PZ_PREFS: JSON.stringify(prefs) },
          stdio: ["ignore", "inherit", "inherit"],
        });
        child.on("exit", (code) => {
          if (code !== 0) console.log(`  worker for ${batch.join(",")} exited with ${code}`);
          resolve();
        });
      });
    }
  };
  await Promise.all(Array.from({ length: workers }, () => runWorker()));
  // Pick one puzzle per slot: no idea twice within four puzzles, aiming
  // challenges kept rare, and the least-used idea preferred.
  const levels: LevelDef[] = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const missing: number[] = [];
  let total = 0;
  const uses = new Map<string, number>();
  const recentIdeas: string[] = [];
  const ideaOf = (l: LevelDef) => (l.layout ?? "").replace(/^.*puzzle-/, "");
  const isAim = (idea: string) => Boolean(CONCEPTS.find((c) => c.id === idea)?.aim);
  for (let id = 1; id <= LEVEL_COUNT; id++) {
    if (!isPuzzleSlot(id)) continue;
    total++;
    const f = new URL(`${id}.json`, DONE_DIR);
    const raw = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null;
    const cands: LevelDef[] = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter(Boolean);
    if (!cands.length) {
      missing.push(id);
      continue;
    }
    const last = recentIdeas.slice(-4);
    const aimLately = recentIdeas.slice(-7).some(isAim);
    const score = (l: LevelDef) => {
      const idea = ideaOf(l);
      return (uses.get(idea) ?? 0) + (last.includes(idea) ? 100 : 0) + (isAim(idea) && aimLately ? 50 : 0) + (isAim(idea) ? 3 : 0);
    };
    const pick = [...cands].sort((a, b) => score(a) - score(b))[0];
    levels[id - 1] = pick;
    const idea = ideaOf(pick);
    uses.set(idea, (uses.get(idea) ?? 0) + 1);
    recentIdeas.push(idea);
  }
  // The first puzzle of the game introduces the idea.
  const first = levels.findIndex((l) => l.queue);
  if (first >= 0) levels[first].intro = "puzzle";
  fs.writeFileSync(DATA, "[\n" + levels.map((l) => JSON.stringify(l)).join(",\n") + "\n]\n");
  console.log(`puzzles: ${total - missing.length}/${total} in ${Math.round((Date.now() - t0) / 1000)} s${missing.length ? `; none found for ${missing.join(",")}` : ""}`);
}

export { H };
