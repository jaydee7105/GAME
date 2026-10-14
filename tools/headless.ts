// Runs the real game code without a browser: a bot that plays levels, and a
// helper that lets a level's starting planets settle under physics. Used by
// tools/sim.ts, tools/levelgen.ts and tools/calibrate.ts.
const g = globalThis as unknown as Record<string, unknown>;
const store = new Map<string, string>();
g.window ??= g;
g.localStorage ??= { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
g.document ??= { createElement: () => ({ getContext: () => null }), addEventListener: () => {} };

const { GameWorld } = await import("../src/game/world");
const P = await import("../src/game/planets");
const L = await import("../src/game/levels");

export type Level = import("../src/game/levels").Level;
export type LevelDef = import("../src/game/levels").LevelDef;
type World = InstanceType<typeof GameWorld>;

export { GameWorld, P, L };

export interface PlayResult { won: boolean; stars: number; reason?: string; dropsUsed: number; seconds: number }

/** Plays one level with the bot. */
export async function play(level: Level, skill = 0.85): Promise<PlayResult> {
  const w = new GameWorld();
  w.layout(720, 1280, 0, 0);
  let result: PlayResult | null = null;
  w.on("levelComplete", (r) => (result = { won: true, stars: r.stars ?? 0, dropsUsed: r.drops, seconds: r.seconds }));
  w.on("fail", (reason) => (result = { won: false, stars: 0, reason, dropsUsed: w.drops, seconds: w.elapsed }));
  w.start("adventure", level);
  for (let frame = 0; frame < 60 * 60 * 15 && !result; frame++) {
    w.update(1 / 60);
    if (w.running && !w.isOver) usePowerups(w);
    if (w.dropReady && w.running) {
      w.dropTargetX = chooseX(w, skill);
      w.drop();
    }
    // Let promise callbacks (tween completions, events) run, like a browser frame would.
    if (frame % 4 === 0) await new Promise((r) => setImmediate(r));
  }
  return result ?? { won: false, stars: 0, reason: "timeout", dropsUsed: w.drops, seconds: w.elapsed };
}

/** Uses power-ups the way a player would: shake when the jar is nearly full,
 *  black-hole a stubborn marked planet or the planet at the top of the pile. */
function usePowerups(w: World): void {
  if (w.shakes > 0 && w.jar.danger > 0.5) {
    w.useShake();
    return;
  }
  if (w.blackHoles <= 0) return;
  let target = null as World["planets"][number] | null;
  if (w.jar.danger > 0.7) target = [...w.planets].sort((a, b) => a.y - a.radius - (b.y - b.radius))[0] ?? null;
  else if (w.drops > 12 && w.markedLeft() === 1) target = w.planets.find((p) => p.marked && !p.merging) ?? null;
  if (!target) return;
  w.toggleBlackHole();
  w.pointerDown(target.x, target.y);
}

/** Greedy bot: aims for merges, preferring ones that help the level's goals. */
export function chooseX(w: World, skill: number): number {
  const t = w.currentTier;
  const r = P.RADII[t];
  const left = w.jar.left + r + 1, right = w.jar.right - r - 1;
  if (Math.random() > skill) return left + Math.random() * (right - left);
  const nr = P.RADII[Math.min(t + 1, P.SUN)];
  let bestX = left, bestScore = -Infinity;
  for (let i = 0; i <= 28; i++) {
    const x = left + ((right - left) * i) / 28;
    w.dropX = x;
    const land = w.landingY();
    let s = land / 100;
    for (const p of w.planets) {
      const d = Math.hypot(p.x - x, p.y - land);
      if (d >= p.bodyRadius + P.collisionRadius(t) + 6) continue;
      if (p.tier === t && !p.ice) {
        s += 12;
        const mx = (p.x + x) / 2, my = (p.y + land) / 2;
        if (p.marked) s += 20;
        for (const dd of w.dust) if (!dd.taken && Math.hypot(dd.x - mx, dd.y - my) < nr + 34) s += 18;
        for (const q of w.planets) if (q.ice && Math.hypot(q.x - mx, q.y - my) - q.radius - nr < 30) s += 12;
      } else if (p.tier === t + 1) s += 2;
      else if (p.tier < t) s -= 2;
    }
    // Planets resting near stardust set up later merges there.
    for (const dd of w.dust) if (!dd.taken && Math.abs(dd.x - x) < r + 20 && land < dd.y + 60) s += 1.5;
    if (s > bestScore) {
      bestScore = s;
      bestX = x;
    }
  }
  return bestX;
}

/** Lets a level's loose starting planets fall into place. */
export function settle(def: LevelDef, seconds = 4): { start: LevelDef["start"]; merged: boolean; high: boolean } {
  const w = new GameWorld();
  w.layout(720, 1280, 0, 0);
  w.start("adventure", { ...def, id: 1, chapter: 0, drops: 999 });
  const n0 = w.planets.length;
  for (let i = 0; i < seconds * 60; i++) w.update(1 / 60);
  const j = w.jar;
  const r4 = (v: number) => Math.round(v * 10000) / 10000;
  const start = w.planets.map((p) => {
    const flags = (p.marked ? L.MARKED : 0) | (p.ice >= 2 ? L.ICE2 : p.ice === 1 ? L.ICE1 : 0);
    const item: [number, number, number, number?] = [p.tier, r4((p.x - j.left) / j.rect.w), r4((p.y - j.top) / j.rect.h)];
    if (flags) item.push(flags);
    return item;
  });
  const high = w.planets.some((p) => p.y - p.radius < j.lineY() + 120);
  return { start, merged: w.merges > 0 || w.planets.length !== n0 || w.isOver, high };
}
