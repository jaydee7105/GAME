// Staged scenes for automated QA and store screenshots, enabled with ?scene=<name>.
// Each scene sets window.sceneStep = "<label>" when a moment is ready to capture.

import type { App } from "./app";
import { Save } from "./core/save";
import { COUNT, SUN } from "./game/planets";

const wait = (s: number) => new Promise((r) => setTimeout(r, s * 1000));

function mark(label: string): void {
  (window as unknown as { sceneStep: string }).sceneStep = label;
  console.log("[scene]", label);
}

export async function runTestScene(app: App, scene: string): Promise<void> {
  const w = app.world;
  await wait(0.4);
  switch (scene) {
    case "title":
      await wait(1.2);
      mark("title");
      break;
    case "autoplay":
      Save.data.tutorialDone = true;
      app.startGame("classic");
      w.autoplay = true;
      mark("running");
      break;
    case "tutorial":
      Save.data.tutorialDone = false;
      app.startGame("classic");
      await wait(1.2);
      mark("tutorial");
      break;
    case "showcase": {
      // A good-looking mid-game jar.
      for (let i = 0; i < COUNT; i++) Save.data.discovered[i] = i <= 9;
      Save.data.tutorialDone = true;
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
      mark("showcase");
      await wait(1.5);
      w.debugSpawn(6, j.x + j.w / 2 - 40, j.y + 40, 0);
      await wait(0.75);
      mark("merge");
      break;
    }
    case "supernova": {
      Save.data.tutorialDone = true;
      app.startGame("classic");
      await wait(0.6);
      const j = w.jar.rect;
      const cx = j.x + j.w / 2, cy = j.y + j.h / 2;
      w.debugSpawn(SUN, cx - 40, cy + 200);
      w.debugSpawn(SUN, cx + 40, cy - 120);
      for (let i = 0; i < 6; i++) w.debugSpawn(i % 5, cx - 250 + i * 100, cy - 330);
      await wait(0.9);
      mark("supernova");
      break;
    }
    case "powerups": {
      Save.data.tutorialDone = true;
      app.startGame("classic");
      w.autoplay = true;
      await wait(10);
      w.autoplay = false;
      await wait(1.5);
      mark("before");
      await wait(1.0);
      w.useShake();
      await wait(0.3);
      mark("shake");
      await wait(2.5);
      w.toggleBlackHole();
      await wait(0.5);
      mark("aiming");
      await wait(1.0);
      w.toggleBlackHole();
      w.swallow(w.planets[0]);
      await wait(0.4);
      mark("swallow");
      break;
    }
    case "pause":
      Save.data.tutorialDone = true;
      app.startGame("classic");
      w.autoplay = true;
      await wait(4);
      app.pauseGame();
      await wait(0.6);
      mark("pause");
      break;
    case "resume": {
      Save.data.tutorialDone = true;
      app.startGame("classic");
      w.autoplay = true;
      await wait(8);
      w.autoplay = false;
      await wait(2);
      const before = w.planets.length;
      mark("before");
      await wait(0.5);
      app.goHome(true);
      await wait(1.2);
      mark("title_continue");
      await wait(0.5);
      app.continueGame();
      await wait(0.6);
      console.log(`[scene] resume before=${before} after=${w.planets.length} score=${w.score}`);
      mark("after");
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
      await wait(3.6);
      mark("gameover");
      break;
    }
    case "collection":
      for (let i = 0; i < COUNT; i++) {
        Save.data.discovered[i] = true;
        Save.data.created[i] = Math.max(Save.data.created[i], 3 + (COUNT - i) * 7);
      }
      app.screens.planets();
      await wait(0.8);
      mark("collection");
      break;
    case "settings":
      app.screens.settings(() => {});
      await wait(0.8);
      mark("settings");
      break;
  }
}
