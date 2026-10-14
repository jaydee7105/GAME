// Drives the built game in headless Chromium: plays staged scenes and saves
// screenshots. Used for QA and for the Play Store screenshots.
//
//   node tools/capture.mjs --scene=showcase --steps=showcase,merge --out=shots [--size=1080x1920@1]
//
// Needs a server on --url (default: vite preview at http://localhost:4173).
import { chromium } from "playwright-core";
import fs from "node:fs";

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v ?? "1"];
}));
const [size, dpr] = (args.size ?? "390x844@2").split("@");
const [width, height] = size.split("x").map(Number);
const out = args.out ?? "shots";
fs.mkdirSync(out, { recursive: true });

const exe = process.env.CHROME_PATH
  ?? ["/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell"].find((p) => fs.existsSync(p));
const browser = await chromium.launch({
  executablePath: exe,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"],
});
const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: Number(dpr ?? 1), isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
  if (m.text().startsWith("[scene]")) console.log(m.text());
});
if (args.fresh) await ctx.addInitScript(() => localStorage.clear());
const url = `${args.url ?? "http://localhost:4173"}/?scene=${args.scene ?? "title"}${args.notch ? "&notch=" + args.notch : ""}`;
await page.goto(url);
const steps = (args.steps ?? args.scene ?? "title").split(",");
for (const step of steps) {
  await page.waitForFunction((s) => window.sceneStep === s, step, { timeout: 60000 });
  await page.screenshot({ path: `${out}/${step}.png` });
  await page.evaluate((s) => (window.sceneAck = s), step);
  console.log("saved", `${out}/${step}.png`);
}
if (args.wait) await page.waitForTimeout(Number(args.wait) * 1000);
if (errors.length) {
  console.log("PAGE ERRORS:\n" + errors.join("\n"));
  process.exitCode = 1;
}
await browser.close();
