// Headless level simulator: a bot plays Adventure levels with the real game
// code (physics included) so the difficulty curve can be checked and tuned.
//
//   npx tsx tools/sim.ts [fromLevel] [toLevel] [trialsPerLevel]
const g = globalThis as unknown as Record<string, unknown>;
const store = new Map<string, string>();
g.window = g;
g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
g.document = { createElement: () => ({ getContext: () => null }), addEventListener: () => {} };

const { GameWorld } = await import("../src/game/world");
const { getLevel, LEVEL_COUNT } = await import("../src/game/levels");
const P = await import("../src/game/planets");

type Result = { won: boolean; stars: number; reason?: string; dropsUsed: number };

async function play(levelId: number, skill: number): Promise<Result> {
  const w = new GameWorld();
  w.layout(720, 1280, 0, 0);
  let result: Result | null = null;
  w.on("levelComplete", (r) => (result = { won: true, stars: r.stars ?? 0, dropsUsed: r.drops }));
  w.on("fail", (reason) => {
    result = { won: false, stars: 0, reason, dropsUsed: w.drops };
  });
  w.start("adventure", levelId);
  for (let frame = 0; frame < 60 * 60 * 12 && !result; frame++) {
    w.update(1 / 60);
    if (w.dropReady && w.running) {
      w.dropTargetX = chooseX(w, skill);
      w.drop();
    }
    // Let promise callbacks (tween completions, events) run, like a browser frame would.
    if (frame % 4 === 0) await new Promise((r) => setImmediate(r));
  }
  if (!result && process.env.DEBUG) console.log("timeout state", { drops: w.drops, left: w.dropsLeft, ready: w.dropReady, running: w.running, over: w.isOver, planets: w.planets.length });
  return result ?? { won: false, stars: 0, reason: "timeout", dropsUsed: w.drops };
}

/** Greedy bot: aims at a matching planet on the surface, else the lowest spot. */
function chooseX(w: InstanceType<typeof GameWorld>, skill: number): number {
  const t = w.currentTier;
  const r = P.RADII[t];
  const left = w.jar.left + r + 1, right = w.jar.right - r - 1;
  if (Math.random() > skill) return left + Math.random() * (right - left);
  let bestX = left, bestScore = -Infinity;
  for (let i = 0; i <= 24; i++) {
    const x = left + ((right - left) * i) / 24;
    w.dropX = x;
    const land = w.landingY();
    // What would we touch on landing?
    let s = land / 100;
    for (const p of w.planets) {
      const d = Math.hypot(p.x - x, p.y - land);
      if (d < p.bodyRadius + P.collisionRadius(t) + 6) {
        if (p.tier === t) s += 12;
        else if (p.tier === t + 1) s += 2;
        else if (p.tier < t) s -= 2;
      }
    }
    if (s > bestScore) {
      bestScore = s;
      bestX = x;
    }
  }
  return bestX;
}

const from = Number(process.argv[2] ?? 1);
const to = Number(process.argv[3] ?? LEVEL_COUNT);
const trials = Number(process.argv[4] ?? 6);
const skill = Number(process.env.SKILL ?? 0.85);
console.log(`level  drops  goals                              win%  stars  fails`);
for (let id = from; id <= to; id++) {
  const l = getLevel(id);
  const res: Result[] = [];
  for (let i = 0; i < trials; i++) res.push(await play(id, skill));
  const wins = res.filter((r) => r.won);
  const stars = wins.length ? wins.reduce((a, r) => a + r.stars, 0) / wins.length : 0;
  const fails = res.filter((r) => !r.won).map((r) => r.reason![0]).join("");
  const goals = l.goals.map((gl) => (gl.kind === "make" ? `make ${P.NAMES[gl.tier!]}x${gl.count}` : `${gl.kind} ${gl.count}`)).join(", ");
  console.log(`${String(id).padStart(5)}  ${String(l.drops).padStart(5)}  ${goals.padEnd(34)} ${String(Math.round((wins.length / trials) * 100)).padStart(4)}  ${stars.toFixed(1).padStart(5)}  ${fails}`);
}
