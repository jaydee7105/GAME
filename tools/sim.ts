// Headless level simulator: a bot plays Adventure levels with the real game
// code (physics included) so the difficulty curve can be checked.
//
//   npx tsx tools/sim.ts [fromLevel] [toLevel] [trialsPerLevel]
import { L, P, play } from "./headless";

const from = Number(process.argv[2] ?? 1);
const to = Number(process.argv[3] ?? from);
const trials = Number(process.argv[4] ?? 6);
const skill = Number(process.env.SKILL ?? 0.85);
console.log(`level  drops  goals                                   win%  stars  used  fails`);
for (let id = from; id <= to; id++) {
  const l = L.getLevel(id);
  const res = [];
  for (let i = 0; i < trials; i++) res.push(await play(l, skill));
  const wins = res.filter((r) => r.won);
  const stars = wins.length ? wins.reduce((a, r) => a + r.stars, 0) / wins.length : 0;
  const used = wins.length ? Math.round(wins.reduce((a, r) => a + r.dropsUsed, 0) / wins.length) : 0;
  const fails = res.filter((r) => !r.won).map((r) => r.reason![0]).join("");
  const goals = l.goals.map((gl) => (gl.kind === "make" ? `make ${P.NAMES[gl.tier!]}x${gl.count}` : `${gl.kind} ${gl.count}`)).join(", ");
  console.log(`${String(id).padStart(5)}  ${String(l.drops).padStart(5)}  ${goals.padEnd(39)} ${String(Math.round((wins.length / trials) * 100)).padStart(4)}  ${stars.toFixed(1).padStart(5)}  ${String(used).padStart(4)}  ${fails} ${l.layout ?? ""}`);
}
