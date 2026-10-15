// Replays every puzzle's stored solution with the current game code, and
// checks the Highlights tour still points at the puzzles it names.
//   npx tsx tools/verify-puzzles.ts
import { HIGHLIGHTS } from "../src/game/highlights";
import { GameWorld, L } from "./headless";

let ok = 0;
const bad: number[] = [];
for (let id = 1; id <= L.LEVEL_COUNT; id++) {
  const level = L.getLevel(id);
  if (!level.solution) continue;
  const w = new GameWorld();
  w.layout(720, 1280, 0, 0);
  w.start("adventure", level);
  for (const fx of level.solution) {
    if (w.isOver) break;
    w.dropTargetX = w.jar.left + fx * w.jar.rect.w;
    w.drop();
    for (let f = 0; f < 960 && !w.dropReady && !w.isOver; f++) w.update(1 / 60);
  }
  for (let f = 0; f < 360 && !w.isOver; f++) w.update(1 / 60);
  if (w.hasWon) ok++;
  else bad.push(id);
}
console.log(`${ok} puzzle solutions win${bad.length ? `; FAIL: ${bad.join(",")}` : ""}`);
const wrong = HIGHLIGHTS.filter((h) => {
  const title = L.getLevel(h.id).title;
  const name = h.name.startsWith("Puzzle: ") ? h.name.slice(8) : null;
  return name !== (title ?? null);
});
for (const h of wrong) console.log(`highlight "${h.name}" points at level ${h.id}: ${L.getLevel(h.id).title ?? "free play"}`);
process.exit(bad.length || wrong.length ? 1 : 0);
