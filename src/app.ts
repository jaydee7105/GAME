// App root: owns the playfield, the renderer and the UI, and moves between screens.

import { Sound } from "./core/audio";
import { exitApp, initPlatform } from "./core/platform";
import { Mode, Save, today } from "./core/save";
import { COLORS } from "./game/planets";
import { GameWorld } from "./game/world";
import type { Assets } from "./render/assets";
import { SceneRenderer } from "./render/scene";
import { h } from "./ui/dom";
import { Hud } from "./ui/hud";
import { Screens } from "./ui/screens";

type State = "title" | "game" | "paused" | "over";

const BASE_W = 720;
const BASE_H = 1280;

export class App {
  readonly world = new GameWorld();
  readonly scene: SceneRenderer;
  readonly hud: Hud;
  readonly screens: Screens;
  state: State = "title";
  private stage: HTMLElement;
  private ui: HTMLElement;
  private flash: HTMLElement;
  private scale = 1;
  private viewW = BASE_W;
  private viewH = BASE_H;
  private safeTop = 0;
  private safeBottom = 0;
  private last = performance.now();
  private autosave = 0;
  private tutorialStep = -1;
  private warned = false;
  private pointerId: number | null = null;

  constructor(root: HTMLElement, assets: Assets) {
    this.stage = h("div", { id: "stage" });
    this.stage.style.backgroundImage = "url(assets/bg/space.jpg)";
    this.ui = h("div", { id: "ui" });
    root.append(this.stage, this.ui);
    this.scene = new SceneRenderer(this.stage, assets);

    const w = this.world;
    this.hud = new Hud(w, {
      pause: () => this.pauseGame(),
      blackHole: () => w.toggleBlackHole(),
      shake: () => w.useShake(),
    });
    this.flash = h("div", { class: "flash" });
    const screenHost = h("div", { class: "screens" });
    this.ui.append(this.hud.el, this.flash, screenHost);
    this.screens = new Screens(screenHost);
    this.screens.onCelebrate = () => this.confetti();

    w.on("discovered", (t) => {
      this.hud.refreshStrip(t);
      if (t >= 2) {
        this.screens.banner(t);
        Sound.play("discover", 1, -2);
      }
    });
    w.on("seen", (t) => this.hud.refreshStrip(t));
    w.on("supernova", () => this.flashScreen());
    w.on("gameOver", (r) => {
      this.state = "over";
      Save.setSnapshot(null);
      const newBest = Save.recordGame(r.mode, r.score, r.seconds);
      this.endTutorial();
      this.screens.gameOver(r, newBest, { again: () => this.startGame(this.world.mode), home: () => this.goHome(false) });
    });
    w.on("powerupEarned", (kind, x, y) => {
      w.fx.text(this.clampX(x), y - 150, kind === "shake" ? "+1 Shake" : "+1 Black Hole", "#c9a6ff", 34, 60, 1.4);
    });
    w.on("chain", (n, x, y) => {
      const cols = ["#3fe0c5", "#ffd34d", "#ff9f2e", "#ff6fa8"];
      w.fx.text(this.clampX(x), y - 90, `CHAIN x${n}`, cols[Math.min(n - 2, 3)], 40 + Math.min(n, 6) * 4, 80, 1.1, (Math.random() - 0.5) * 0.16);
    });
    w.on("firstDrop", () => {
      if (this.tutorialStep !== 0) return;
      this.tutorialStep = 1;
      this.hud.showFinger(false);
      this.hud.showHint("Two matching planets merge into a bigger one!");
    });
    w.on("firstMerge", () => {
      if (this.tutorialStep !== 1) return;
      this.tutorialStep = 2;
      this.hud.showHint("Keep merging to grow all the way to the Sun");
      setTimeout(() => this.endTutorial(), 3500);
    });
    w.on("danger", (level) => {
      if (this.warned || level <= 0 || Save.data.stats.games > 2) return;
      this.warned = true;
      this.hud.showHint("Careful! Planets can't stay above the line");
      setTimeout(() => this.hud.hideHint(), 2600);
    });

    this.bindInput();
    initPlatform({
      onBack: () => this.back(),
      onPause: () => this.onBackground(),
      onResume: () => Sound.setBackground(false),
    });
    window.addEventListener("resize", () => this.resize());
    Save.on("settings", () => {
      this.world.showGuide = Save.setting("guide");
    });
    this.world.showGuide = Save.setting("guide");

    // A daily run only counts on the day it was started.
    const snap = Save.data.snapshot;
    if (snap && snap.mode === "daily" && snap.date !== today()) Save.setSnapshot(null);

    this.resize(); // also shows the title screen
    requestAnimationFrame((t) => this.frame(t));
  }

  // -------------------------------------------------------------------------
  // Layout & loop
  // -------------------------------------------------------------------------
  private readSafeArea(): { top: number; bottom: number } {
    const probe = h("div", { style: { position: "fixed", top: "0", left: "0", paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)", visibility: "hidden" } });
    document.body.append(probe);
    const cs = getComputedStyle(probe);
    const r = { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 };
    probe.remove();
    return r;
  }

  resize(): void {
    const W = window.innerWidth, H = window.innerHeight;
    this.scale = Math.min(W / BASE_W, H / BASE_H);
    this.viewW = W / this.scale;
    this.viewH = H / this.scale;
    const safe = this.readSafeArea();
    const forced = new URLSearchParams(location.search).get("notch");
    this.safeTop = forced ? Number(forced) : safe.top / this.scale;
    this.safeBottom = safe.bottom / this.scale;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.scene.resize(W, H, this.scale, dpr);
    this.ui.style.width = `${this.viewW}px`;
    this.ui.style.height = `${this.viewH}px`;
    this.ui.style.transform = `scale(${this.scale})`;
    this.world.layout(this.viewW, this.viewH, this.safeTop, this.safeBottom);
    this.hud.layout(this.viewW, this.viewH, this.safeTop);
    Object.assign(this.screens, { safeTop: this.safeTop, safeBottom: this.safeBottom, viewW: this.viewW, viewH: this.viewH });
    if (this.state === "title") this.showTitle();
  }

  private frame(now: number): void {
    const dt = Math.min((now - this.last) / 1000, 1 / 20);
    this.last = now;
    if (this.state !== "paused") this.world.update(dt);
    this.hud.update(dt);
    this.scene.render(this.world, dt, this.state !== "title");
    if (this.state === "game") {
      this.autosave += dt;
      if (this.autosave > 6) {
        this.autosave = 0;
        this.saveSnapshot();
      }
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  private clampX(x: number): number {
    return Math.min(Math.max(x, 190), this.viewW - 190);
  }

  private toWorldX(clientX: number): number {
    return clientX / this.scale;
  }

  private bindInput(): void {
    const s = this.stage;
    s.addEventListener("pointerdown", (e) => {
      Sound.unlock();
      if (this.state !== "game" || this.pointerId !== null) return;
      this.pointerId = e.pointerId;
      s.setPointerCapture(e.pointerId);
      this.world.pointerDown(this.toWorldX(e.clientX), e.clientY / this.scale);
    });
    s.addEventListener("pointermove", (e) => {
      if (e.pointerId === this.pointerId) this.world.pointerMove(this.toWorldX(e.clientX));
    });
    const up = (e: PointerEvent) => {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = null;
      if (this.state === "game") this.world.pointerUp(this.toWorldX(e.clientX));
    };
    s.addEventListener("pointerup", up);
    s.addEventListener("pointercancel", (e) => {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = null;
      this.world.cancelPress();
    });
    // Any first touch on the UI also unlocks audio.
    this.ui.addEventListener("pointerdown", () => Sound.unlock());
  }

  // -------------------------------------------------------------------------
  // Flow
  // -------------------------------------------------------------------------
  showTitle(): void {
    this.state = "title";
    this.screens.clearBanners();
    this.hud.setVisible(false);
    this.screens.title({
      play: () => this.startGame("classic"),
      resume: () => this.continueGame(),
      daily: () => this.startGame("daily"),
      settings: () => this.screens.settings(() => this.hud.refreshStrip()),
      planets: () => this.screens.planets(),
    });
  }

  startGame(mode: Mode): void {
    Save.setSnapshot(null);
    this.screens.closeAll();
    this.state = "game";
    this.hud.setVisible(true);
    this.world.start(mode);
    this.hud.startRun();
    this.beginTutorial();
    Sound.play("start", 1, -3);
  }

  continueGame(): void {
    const snap = Save.data.snapshot;
    this.screens.closeAll();
    if (!snap || !this.world.restore(snap)) {
      this.startGame("classic");
      return;
    }
    this.state = "game";
    this.hud.setVisible(true);
    this.hud.startRun();
    Sound.play("start", 1, -3);
  }

  pauseGame(): void {
    if (this.state !== "game" || this.world.isOver) return;
    this.world.cancelPress();
    this.state = "paused";
    this.saveSnapshot();
    this.screens.pause({
      resume: () => this.resumeGame(),
      restart: () => this.startGame(this.world.mode),
      home: () => this.goHome(true),
    });
  }

  resumeGame(): void {
    this.screens.closeAll();
    this.state = "game";
    this.last = performance.now();
  }

  goHome(saveRun: boolean): void {
    if (saveRun) this.saveSnapshot();
    else Save.setSnapshot(null);
    this.world.stop();
    this.endTutorial();
    this.showTitle();
  }

  private saveSnapshot(): void {
    Save.setSnapshot(this.world.snapshot());
    Save.flush();
  }

  private onBackground(): void {
    Sound.setBackground(true);
    if (this.state === "game") this.pauseGame();
    Save.flush();
  }

  back(): void {
    if (this.screens.pop()) return;
    switch (this.state) {
      case "game":
        if (this.world.aimingBlackHole) this.world.toggleBlackHole();
        else this.pauseGame();
        break;
      case "paused":
        this.resumeGame();
        break;
      case "over":
        this.goHome(false);
        break;
      default:
        Save.flush();
        exitApp();
    }
  }

  // -------------------------------------------------------------------------
  // Tutorial
  // -------------------------------------------------------------------------
  private beginTutorial(): void {
    this.warned = false;
    if (Save.data.tutorialDone) {
      this.tutorialStep = -1;
      return;
    }
    this.tutorialStep = 0;
    this.hud.showFinger(true);
    this.hud.showHint("Drag to aim, then let go to drop");
  }

  private endTutorial(): void {
    if (this.tutorialStep < 0) return;
    this.tutorialStep = -1;
    this.hud.showFinger(false);
    this.hud.hideHint();
    Save.data.tutorialDone = true;
    Save.save();
  }

  // -------------------------------------------------------------------------
  // Effects
  // -------------------------------------------------------------------------
  private flashScreen(): void {
    this.flash.animate([{ opacity: 0.7 }, { opacity: 0 }], { duration: 900, easing: "ease-out" });
  }

  private confetti(): void {
    const cols = ["#ffd34d", "#ff6fa8", "#3fe0c5", "#ff9f2e", "#7b6cff"];
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        this.world.fx.burst(80 + Math.random() * (this.viewW - 160), this.viewH * (0.2 + Math.random() * 0.3), cols[i % 5], 30, 420, 1.6, 1.0);
      }, i * 120);
    }
  }

  /** Exposed for tests and store-screenshot tooling. */
  debug() {
    return { app: this, world: this.world, Save, COLORS };
  }
}
