// Replays a puzzle's stored solution and records the jar after every drop, for
// reviewing puzzles (draw them with art/tools/storyboard.py).
//
//   npx tsx tools/storyboard.ts <levelId | dump.json> [out.json]
import fs from "node:fs";
import { GameWorld, L } from "./headless";

const arg = process.argv[2];
const def = arg.endsWith(".json") ? JSON.parse(fs.readFileSync(arg, "utf8")) : L.getLevel(Number(arg));
const level = { ...def, id: def.id ?? 9999, chapter: def.chapter ?? 0 };
const w = new GameWorld();
w.layout(720, 1280, 0, 0);
w.start("adventure", level);
const j = w.jar;
const frame = (dropX: number | null, tier: number | null) => ({
  dropX: dropX === null ? null : dropX, tier,
  planets: w.planets.map((p) => [p.tier, Math.round(p.x - j.left), Math.round(p.y - j.top), p.ice, p.marked ? 1 : 0]),
  dust: w.dust.map((d) => [Math.round(d.x - j.left), Math.round(d.y - j.top), d.taken ? 1 : 0]),
  goals: [...w.goalProgress],
});
const frames = [frame(null, null)];
let result = "running";
for (const fx of level.solution ?? []) {
  const tier = w.currentTier;
  w.dropTargetX = j.left + fx * j.rect.w;
  w.drop();
  for (let f = 0; f < 60 * 16 && !w.isOver && !w.dropReady; f++) w.update(1 / 60);
  frames.push(frame(Math.round(fx * j.rect.w), tier));
  if (w.isOver) { result = w.hasWon ? "won" : "lost"; break; }
}
const out = { id: level.id, title: level.title, goals: level.goals, queue: level.queue, rocks: level.rocks ?? [], bars: level.bars ?? [], mods: level.mods ?? {}, result, frames };
fs.writeFileSync(process.argv[3] ?? "storyboard.json", JSON.stringify(out));
console.log(`${level.title ?? "level " + level.id}: ${result} in ${frames.length - 1} drops`);
