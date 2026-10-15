// Replays every puzzle's stored solution with the current game code.
//   npx tsx tools/verify-puzzles.ts
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
process.exit(bad.length ? 1 : 0);
