// Staged scenes for automated QA and store screenshots, enabled with ?scene=<name>.
// Each scene sets window.sceneStep = "<label>" when a moment is ready to capture.

import type { App } from "./app";
import { Save } from "./core/save";
import { getLevel } from "./game/levels";
import { COUNT, SUN } from "./game/planets";
import { levelIntro } from "./ui/adventure-screens";
import { awardsScreen } from "./ui/awards";

const wait = (s: number) => new Promise((r) => setTimeout(r, s * 1000));

/** Waits until a condition holds (checked every animation frame). */
function until(pred: () => boolean, timeout = 30): Promise<void> {
  const t0 = performance.now();
  return new Promise((resolve) => {
    const tick = () => (pred() || performance.now() - t0 > timeout * 1000 ? resolve() : requestAnimationFrame(tick));
    tick();
  });
}

/** Marks a moment as ready and waits until the capture tool has taken its shot. */
async function mark(label: string): Promise<void> {
  const win = window as unknown as { sceneStep: string; sceneAck?: string };
  win.sceneStep = label;
  console.log("[scene]", label);
  await until(() => win.sceneAck === label, 8);
}

export async function runTestScene(app: App, scene: string): Promise<void> {
  const w = app.world;
  await wait(0.4);
  switch (scene) {
    case "title":
      await wait(1.2);
      await mark("title");
      break;
    case "autoplay":
      Save.data.tutorialDone = true;
      app.startGame("classic");
      w.autoplay = true;
      await mark("running");
      break;
    case "tutorial":
      Save.data.tutorialDone = false;
      app.startGame("classic");
      await wait(1.2);
      await mark("tutorial");
      break;
    case "showcase": {
      // A good-looking mid-game jar.
      for (let i = 0; i < COUNT; i++) Save.data.discovered[i] = i <= 9;
      Save.data.tutorialDone = true;
      Save.data.best = 6240;
      app.startGame("classic");
      w.debugNoDanger();
      const j = w.jar.rect;
      const layout: [number, number, number][] = [
        [9, 0.27, 0.8], [8, 0.73, 0.83], [7, 0.7, 0.55], [5, 0.24, 0.48], [6, 0.46, 0.6], [4, 0.85, 0.34],
        [3, 0.1, 0.3], [2, 0.42, 0.33], [1, 0.6, 0.3], [0, 0.3, 0.2], [3, 0.53, 0.15], [1, 0.9, 0.1],
      ];
      for (const [t, x, y] of layout) {
        w.debugSpawn(t, j.x + j.w * x, j.y + j.h * y, 0);
        await wait(0.12);
      }
      w.highest = 9;
      w.score = 4280;
      w.emit("score", w.score, 0);
      app.hud.startRun();
      await wait(3.5);
      w.dropTargetX = j.x + j.w * 0.62;
      await wait(1.0);
      await mark("showcase");
      await wait(1.5);
      // Two Neptunes meeting mid-air make an Uranus, for an action shot.
      const merges = w.merges;
      w.debugSpawn(6, j.x + j.w / 2 - 95, j.y + 150, 0);
      w.debugSpawn(6, j.x + j.w / 2 + 75, j.y + 150, 0);
      await until(() => w.merges > merges);
      const t0 = w.time;
      await until(() => w.time - t0 > 0.12);
      await mark("merge");
      break;
    }
    case "supernova": {
      Save.data.tutorialDone = true;
      Save.data.best = 6240;
      app.startGame("classic");
      await wait(0.6);
      const j = w.jar.rect;
      const cx = j.x + j.w / 2, cy = j.y + j.h / 2;
      w.debugSpawn(SUN, cx - 40, cy + 200);
      w.debugSpawn(SUN, cx + 40, cy - 120);
      for (let i = 0; i < 6; i++) w.debugSpawn(i % 5, cx - 250 + i * 100, cy - 330);
      await until(() => w.supernovas > 0);
      const t0 = w.time;
      await until(() => w.time - t0 > 0.35);
      await mark("supernova");
      break;
    }
    case "powerups": {
      Save.data.tutorialDone = true;
      app.startGame("classic");
      w.autoplay = true;
      await wait(10);
      w.autoplay = false;
      await wait(1.5);
      await mark("before");
      await wait(1.0);
      w.useShake();
      await wait(0.3);
      await mark("shake");
      await wait(2.5);
      w.toggleBlackHole();
      await wait(0.5);
      await mark("aiming");
      await wait(1.0);
      w.toggleBlackHole();
      w.swallow(w.planets[0]);
      await wait(0.4);
      await mark("swallow");
      break;
    }
    case "pause":
      Save.data.tutorialDone = true;
      app.startGame("classic");
      w.autoplay = true;
      await wait(4);
      app.pauseGame();
      await wait(0.6);
      await mark("pause");
      break;
    case "resume": {
      Save.data.tutorialDone = true;
      app.startGame("classic");
      w.autoplay = true;
      await wait(8);
      w.autoplay = false;
      await wait(2);
      const before = w.planets.length;
      await mark("before");
      await wait(0.5);
      app.goHome(true);
      await wait(1.2);
      await mark("title_continue");
      await wait(0.5);
      app.continueGame();
      await wait(0.6);
      console.log(`[scene] resume before=${before} after=${w.planets.length} score=${w.score}`);
      await mark("after");
      break;
    }
    case "gameover": {
      Save.data.tutorialDone = true;
      app.startGame("classic");
      const j = w.jar.rect;
      for (let i = 0; i < 26; i++) w.debugSpawn([2, 3, 4, 5, 6][i % 5], j.x + 60 + ((i * 137) % 480), j.y + j.h - 60 - i * 40, 2);
      w.highest = 8;
      w.score = Save.data.best + 1361;
      w.merges = 117;
      w.bestChain = 4;
      w.emit("score", w.score, 0);
      await wait(4);
      w.end();
      await until(() => app.state === "over");
      const final = w.score.toLocaleString("en-US");
      await until(() => document.querySelector(".result .big")?.textContent === final);
      await wait(1.2);
      await mark("gameover");
      break;
    }
    case "collection":
      for (let i = 0; i < COUNT; i++) {
        Save.data.discovered[i] = true;
        Save.data.created[i] = Math.max(Save.data.created[i], 3 + (COUNT - i) * 7);
      }
      app.screens.planets();
      await wait(0.8);
      await mark("collection");
      break;
    case "map":
      const top = Number(new URLSearchParams(location.search).get("unlocked") ?? 14);
      Save.data.adventure.unlocked = top;
      for (let i = 1; i < top; i++) Save.data.adventure.stars[i] = 1 + (i % 3);
      app.openMap();
      await wait(1.2);
      await mark("map");
      break;
    case "intro": {
      const id = Number(new URLSearchParams(location.search).get("level") ?? 12);
      levelIntro(app.screens, getLevel(id), () => app.startGame("adventure", id));
      await wait(0.8);
      await mark("intro");
      break;
    }
    case "levels": {
      // ?scene=levels&ids=41,104,250 : each level after a few seconds of play.
      Save.data.tutorialDone = true;
      Save.data.adventure.unlocked = 500;
      const ids = (new URLSearchParams(location.search).get("ids") ?? "1").split(",").map(Number);
      for (const id of ids) {
        app.startGame("adventure", id);
        app.hud.hideHint();
        w.autoplay = true;
        await wait(3.5);
        w.autoplay = false;
        await wait(1.2);
        await mark(`L${id}`);
      }
      break;
    }
    case "level":
      Save.data.tutorialDone = true;
      app.startGame("adventure", 12);
      w.autoplay = true;
      await wait(6);
      w.autoplay = false;
      await wait(1.5);
      await mark("level");
      break;
    case "revive":
      Save.data.tutorialDone = true;
      app.startGame("classic");
      w.autoplay = true;
      await wait(5);
      w.autoplay = false;
      w.end("overflow");
      await until(() => app.state === "revive" && !!document.querySelector(".revive"));
      await wait(0.6);
      await mark("offer");
      (document.querySelector(".revive .btn.teal") as HTMLButtonElement).click();
      await wait(1.0);
      await mark("demoad");
      await until(() => app.state === "game");
      await wait(0.5);
      await mark("revived");
      break;
    case "complete":
      Save.data.tutorialDone = true;
      app.startGame("adventure", 7);
      await wait(1);
      w.debugNoDanger();
      for (const [t, x] of [[6, 150], [5, 330], [4, 480], [3, 590], [2, 250], [1, 420], [0, 540]] as const) w.debugSpawn(t, x, 760);
      await wait(1.5);
      (w as unknown as { score: number }).score = 486;
      (w as unknown as { dropsLeft: number }).dropsLeft = 20;
      (w as unknown as { win(): void }).win();
      await until(() => !!document.querySelector(".result"));
      await wait(1.6);
      await mark("complete");
      break;
    case "awards": {
      Save.data.achievements = { first: 1, earth: 1, saturn: 1, chain3: 1, score1k: 1, games25: 1 };
      Save.data.stats.merges = 320;
      awardsScreen(app.screens);
      await wait(0.8);
      await mark("achievements");
      (document.querySelectorAll(".tab")[1] as HTMLButtonElement).click();
      await wait(0.5);
      await mark("styles");
      break;
    }
    case "settings":
      app.screens.settings(() => {});
      await wait(0.8);
      await mark("settings");
      break;
  }
}
