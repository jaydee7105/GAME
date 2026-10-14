import "./styles.css";
import { App } from "./app";
import { Save } from "./core/save";
import { loadAssets } from "./render/assets";
import { buildIcons } from "./render/sprites";
import { runTestScene } from "./testing";

async function boot(): Promise<void> {
  Save.load();
  const bar = document.querySelector<HTMLElement>("#boot .bar i");
  const assets = await loadAssets((k) => {
    if (bar) bar.style.width = `${Math.round(k * 100)}%`;
  });
  buildIcons(assets);
  const app = new App(document.getElementById("app")!, assets);
  (window as unknown as { planetDrop: ReturnType<App["debug"]> }).planetDrop = app.debug();
  document.getElementById("boot")?.classList.add("done");
  const scene = new URLSearchParams(location.search).get("scene");
  if (scene) void runTestScene(app, scene);
}

void boot();
