// End-to-end smoke test: plays the built game with real touch input in a
// mobile-sized headless Chromium and checks the basics work.
//
//   npm run build && npx vite preview --port 4173 &   then   npm test
import { chromium } from "playwright-core";
import fs from "node:fs";

const url = process.env.URL ?? "http://localhost:4173/";
const exe = process.env.CHROME_PATH
  ?? ["/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell"].find((p) => fs.existsSync(p));
const browser = await chromium.launch({
  executablePath: exe,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
let failed = false;
const check = (ok, msg) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
  if (!ok) failed = true;
};

await page.goto(url);
await page.waitForFunction(() => window.planetDrop !== undefined, null, { timeout: 30000 });
await page.waitForTimeout(800);
check(await page.isVisible("text=PLAY"), "title screen shows PLAY");

await page.tap("text=PLAY");
await page.waitForTimeout(800);
check(await page.evaluate(() => window.planetDrop.app.state === "game"), "PLAY starts a run");
check(await page.isVisible("text=Drag to aim"), "first-run tutorial hint is shown");

// Drag-to-aim and release, across the jar.
const cdp = await ctx.newCDPSession(page);
const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
const xs = [];
for (let i = 0; i < 16; i++) {
  const x0 = 195, x1 = 50 + ((i * 53) % 290), y = 300;
  await touch("touchStart", x0, y);
  for (let s = 1; s <= 5; s++) {
    await touch("touchMove", x0 + ((x1 - x0) * s) / 5, y);
    await page.waitForTimeout(25);
  }
  await touch("touchEnd", 0, 0);
  xs.push(x1);
  await page.waitForTimeout(700);
}
await page.waitForTimeout(1500);
const s = await page.evaluate(() => ({ drops: window.planetDrop.world.drops, score: window.planetDrop.world.score, planets: window.planetDrop.world.planets.length }));
check(s.drops >= 12, `touch drags drop planets (drops=${s.drops})`);
check(s.score > 0, `merging scores points (score=${s.score})`);
const spread = await page.evaluate(() => {
  const p = window.planetDrop.world.planets.map((q) => q.x);
  return Math.max(...p) - Math.min(...p);
});
check(spread > 200, `aiming moves the drop position (spread=${Math.round(spread)})`);

await page.tap("button[aria-label=Pause]");
await page.waitForTimeout(500);
check(await page.isVisible("text=Paused"), "pause button opens the pause menu");
const frozen1 = await page.evaluate(() => window.planetDrop.world.elapsed);
await page.waitForTimeout(500);
const frozen2 = await page.evaluate(() => window.planetDrop.world.elapsed);
check(frozen1 === frozen2, "game time stops while paused");
await page.tap("text=RESUME");
await page.waitForTimeout(400);
check(await page.evaluate(() => window.planetDrop.app.state === "game"), "resume returns to the game");

await page.tap("button[aria-label=Pause]");
await page.waitForTimeout(400);
await page.tap("text=SAVE & QUIT");
await page.waitForTimeout(800);
check(await page.isVisible("text=CONTINUE"), "save & quit offers CONTINUE");
await page.tap("text=CONTINUE");
await page.waitForTimeout(800);
const restored = await page.evaluate(() => window.planetDrop.world.planets.length);
check(restored === s.planets || restored > 0, `continue restores the jar (${restored} planets)`);

// Adventure: the map opens, level 1 starts with goals and a drop counter.
await page.tap("button[aria-label=Pause]");
await page.waitForTimeout(400);
await page.tap("text=SAVE & QUIT");
await page.waitForTimeout(800);
await page.tap("text=ADVENTURE");
await page.waitForTimeout(800);
check(await page.isVisible(".map"), "Adventure opens the level map");
await page.tap(".node.current", { force: true }); // it pulses, so never "stable"
await page.waitForTimeout(600);
await page.tap("button:text-is(\"PLAY\")");
await page.waitForTimeout(1200);
const adv = await page.evaluate(() => ({
  state: window.planetDrop.app.state, mode: window.planetDrop.world.mode, drops: window.planetDrop.world.dropsLeft,
}));
check(adv.state === "game" && adv.mode === "adventure" && adv.drops > 0, `level 1 starts (drops left=${adv.drops})`);
check(await page.isVisible(".goals .goal"), "level goals are shown in the HUD");

// Running out of drops offers the rewarded revive once, which adds drops.
await page.evaluate(() => {
  const w = window.planetDrop.world;
  w.dropsLeft = 0;
  w.end("drops");
});
await page.waitForTimeout(1600);
check(await page.isVisible("text=Watch video"), "failing offers a revive");
await page.tap("text=Watch video");
await page.waitForTimeout(4800);
const rev = await page.evaluate(() => ({ state: window.planetDrop.app.state, drops: window.planetDrop.world.dropsLeft, can: window.planetDrop.world.canRevive }));
check(rev.state === "game" && rev.drops > 0 && !rev.can, `revive continues the level (drops left=${rev.drops})`);

// Level mechanics: frozen planets stay put, marked planets count when removed,
// obstacles exist, and a save/restore keeps all of it.
const mech = await page.evaluate(async () => {
  const { app, world: w } = window.planetDrop;
  const find = (pred) => { for (let id = 21; id <= 500; id++) if (pred(window.planetDrop.levels.getLevel(id))) return id; return 0; };
  const iceId = find((l) => l.start.some((s) => (s[3] ?? 0) & 6));
  app.startGame("adventure", iceId);
  await new Promise((r) => setTimeout(r, 1500));
  const frozen = w.planets.filter((p) => p.ice);
  const still = frozen.every((p) => p.body.isStatic());
  const markId = find((l) => !l.queue && l.start.some((s) => (s[3] ?? 0) & 1));
  app.startGame("adventure", markId);
  await new Promise((r) => setTimeout(r, 800));
  const marked = w.planets.find((p) => p.marked && !p.ice);
  const before = w.cleared;
  if (marked) { w.toggleBlackHole(); w.pointerDown(marked.x, marked.y); }
  await new Promise((r) => setTimeout(r, 300));
  const clearedAfter = w.cleared;
  const barId = find((l) => (l.bars ?? []).length > 0 && (l.rocks ?? []).length > 0) || find((l) => (l.rocks ?? []).length > 0);
  const wantBars = (window.planetDrop.levels.getLevel(barId).bars ?? []).length;
  app.startGame("adventure", barId);
  const snap = JSON.parse(JSON.stringify(w.snapshot()));
  w.restore(snap);
  return { iceId, frozen: frozen.length, still, markId, cleared: clearedAfter, before, marked: !!marked, barId, wantBars, bars: w.bars.length, rocks: w.rocks.length };
});
check(mech.frozen > 0 && mech.still, `frozen planets hang in place (level ${mech.iceId}, ${mech.frozen} frozen)`);
check(mech.marked && mech.cleared === mech.before + 1, `black-holing a marked planet counts towards its goal (level ${mech.markId})`);
check(mech.barId > 0 && mech.bars === mech.wantBars && mech.rocks > 0, `obstacles survive save/restore (level ${mech.barId}: ${mech.bars} bars, ${mech.rocks} rocks)`);

// Puzzles: the stored solution solves the level in the real game, and a hint
// snaps a nearby drop onto the marked spot.
const pz = await page.evaluate(async () => {
  const { app, world: w, levels } = window.planetDrop;
  let id = 0;
  for (let k = 1; k <= 500 && !id; k++) if (levels.getLevel(k).solution) id = k;
  if (!id) return { id: 0 };
  const level = levels.getLevel(id);
  app.startGame("adventure", id);
  const queueShown = !!document.querySelector(".queue-strip img") || level.queue.length <= 2;
  const restartShown = getComputedStyle([...document.querySelectorAll(".hud .pill")].find((b) => b.textContent.includes("Restart"))).display !== "none";
  // Software GL can run at ~10 fps, which slows game time, so be patient.
  const until = async (pred, ms = 30000) => { const t = performance.now(); while (!pred() && performance.now() - t < ms) await new Promise((r) => setTimeout(r, 30)); };
  for (const fx of level.solution) {
    await until(() => w.dropReady || w.isOver);
    if (w.isOver) break;
    w.dropTargetX = w.jar.left + fx * w.jar.rect.w;
    w.drop();
  }
  await until(() => w.isOver);
  const solved = w.hasWon;
  app.startGame("adventure", id, true);
  await until(() => w.dropReady);
  const target = w.guideX();
  w.dropTargetX = target + 15;
  w.drop();
  const snapped = Math.abs(w.dropX - target) < 0.5;
  return { id, solved, queueShown, restartShown, snapped, steps: level.solution.length };
});
if (pz.id) {
  check(pz.solved, `puzzle ${pz.id} is solved by its stored solution (${pz.steps} drops)`);
  check(pz.queueShown && pz.restartShown, "puzzle HUD shows the drop order and a Restart button");
  check(pz.snapped, "a hinted drop snaps onto the marked spot");
}

check(errors.length === 0, `no page errors${errors.length ? ":\n  " + errors.join("\n  ") : ""}`);
await browser.close();
process.exit(failed ? 1 : 0);
