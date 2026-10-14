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

check(errors.length === 0, `no page errors${errors.length ? ":\n  " + errors.join("\n  ") : ""}`);
await browser.close();
process.exit(failed ? 1 : 0);
