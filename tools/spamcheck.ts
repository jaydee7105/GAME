// How often does mindless play win? Plays levels with "spam" strategies:
//   random  - every planet dropped at a random spot
//   spot    - every planet dropped at the same spot (5 spots tried)
//
//   npx tsx tools/spamcheck.ts <from> <to> [randomTrials] > report.tsv
import { GameWorld, L } from "./headless";

type World = InstanceType<typeof GameWorld>;

async function run(level: ReturnType<typeof L.getLevel>, pick: (w: World) => number): Promise<boolean> {
  const w = new GameWorld();
  w.layout(720, 1280, 0, 0);
  let won = false, over = false;
  w.on("levelComplete", () => (won = true));
  w.on("fail", () => (over = true));
  w.start("adventure", level);
  for (let f = 0; f < 60 * 60 * 6 && !won && !over && !w.isOver; f++) {
    w.update(1 / 60);
    if (w.dropReady && w.running) {
      w.dropTargetX = pick(w);
      w.drop();
    }
    if (f % 8 === 0) await new Promise((r) => setImmediate(r));
  }
  for (let f = 0; f < 240 && !w.isOver; f++) w.update(1 / 60);
  return won || w.hasWon;
}

const from = Number(process.argv[2] ?? 1), to = Number(process.argv[3] ?? L.LEVEL_COUNT);
const trials = Number(process.argv[4] ?? 20);
for (let id = from; id <= to; id++) {
  const level = L.getLevel(id);
  let rnd = 0, spot = 0;
  const puzzle = Boolean(level.queue);
  const n = puzzle ? trials : Math.max(4, Math.round(trials / 3));
  for (let k = 0; k < n; k++) if (await run(level, (w) => w.jar.left + Math.random() * w.jar.rect.w)) rnd++;
  for (const fx of [0.1, 0.3, 0.5, 0.7, 0.9]) if (await run(level, (w) => w.jar.left + fx * w.jar.rect.w)) spot++;
  console.log([id, puzzle ? "puzzle" : "normal", level.title ?? level.layout, (rnd / n).toFixed(2), spot].join("\t"));
}
