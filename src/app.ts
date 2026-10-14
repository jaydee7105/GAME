// App root: owns the playfield, the renderer and the UI, and moves between screens.

import { Sound } from "./core/audio";
import { buzz, exitApp, initPlatform, isNative } from "./core/platform";
import { Mode, Save, today } from "./core/save";
import { PRIVACY_URL, disableReminders, enableReminders, maybeAskForReview, scheduleReminder, shareText } from "./core/social";
import { MECHANICS } from "./game/chapters";
import { getLevel, goalText } from "./game/levels";
import { COLORS, NAMES, PLURALS } from "./game/planets";
import { FailReason, GameWorld, RunResult } from "./game/world";
import { checkAchievements } from "./meta/achievements";
import { Ads } from "./monetization/ads";
import { BANNER_RESERVE, PACING } from "./monetization/config";
import type { Assets } from "./render/assets";
import { SceneRenderer } from "./render/scene";
import { demoAd, highlightsButton, highlightsScreen, levelComplete, levelFailed, levelMap, reviveOffer } from "./ui/adventure-screens";
import { SHOW_HIGHLIGHTS } from "./game/highlights";
import { awardsScreen, badge } from "./ui/awards";
import { button, h } from "./ui/dom";
import { icon } from "./ui/icons";
import { Hud } from "./ui/hud";
import { Screens } from "./ui/screens";

type State = "title" | "game" | "paused" | "revive" | "over";

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
  /** Puzzle the player bought a hint for (it stays on for retries). */
  private hintedLevel = 0;
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
      restart: () => this.restartPuzzle(),
      hint: () => this.offerHint(),
    });
    this.flash = h("div", { class: "flash" });
    const screenHost = h("div", { class: "screens" });
    this.ui.append(this.hud.el, this.flash, screenHost);
    this.screens = new Screens(screenHost);
    this.screens.onCelebrate = () => this.confetti();
    this.screens.onShare = (r) => this.share(r);
    Ads.demoAd = (secs) => demoAd(screenHost, secs);
    void Ads.init();
    void scheduleReminder();

    w.on("discovered", (t) => {
      this.hud.refreshStrip(t);
      if (t >= 2) {
        this.screens.banner(t);
        Sound.play("discover", 1, -2);
      }
    });
    w.on("seen", (t) => this.hud.refreshStrip(t));
    w.on("supernova", () => {
      this.flashScreen();
      this.checkAwards();
    });
    w.on("fail", (reason) => this.onFail(reason));
    w.on("gameOver", (r) => this.onGameOver(r));
    w.on("levelComplete", (r) => this.onLevelComplete(r));
    w.on("powerupEarned", (kind, x, y) => {
      w.fx.text(this.clampX(x), y - 150, kind === "shake" ? "+1 Shake" : "+1 Black Hole", "#c9a6ff", 34, 60, 1.4);
    });
    w.on("thaw", (x, y) => {
      Sound.play("thud", 1.7, -4, 0.05);
      Sound.play("chain", 1.45, -9);
      buzz(25, 0.35);
      w.fx.text(this.clampX(x), y - 60, "CRACK!", "#cdeeff", 34, 60, 0.9);
    });
    w.on("dust", (x, y, left) => {
      Sound.play("chain", 1.6, -5);
      buzz(15, 0.3);
      w.fx.text(this.clampX(x), y - 40, left ? "+1 Stardust" : "All stardust!", "#ffe27a", 32, 60, 1);
    });
    w.on("cleared", (x, y, left) => {
      Sound.play("powerup", 1.15, -5);
      buzz(20, 0.35);
      w.fx.text(this.clampX(x), y - 70, left ? `${left} to go!` : "All clear!", "#ff9f2e", 34, 60, 1);
    });
    w.on("chain", (n, x, y) => {
      const cols = ["#3fe0c5", "#ffd34d", "#ff9f2e", "#ff6fa8"];
      w.fx.text(this.clampX(x), y - 90, `CHAIN x${n}`, cols[Math.min(n - 2, 3)], 40 + Math.min(n, 6) * 4, 80, 1.1, (Math.random() - 0.5) * 0.16);
      if (n >= 3) this.checkAwards();
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
    const probe = h("div", { style: { position: "fixed", top: "0", left: "0", paddingTop: "max(env(safe-area-inset-top, 0px), var(--safe-area-inset-top, 0px))", paddingBottom: "max(env(safe-area-inset-bottom, 0px), var(--safe-area-inset-bottom, 0px))", visibility: "hidden" } });
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
    // Keep room for the banner so the jar never moves when it appears.
    if (Ads.reservesBanner) this.safeBottom += BANNER_RESERVE / this.scale;
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
      adventure: () => this.openMap(),
      settings: () => this.openSettings(),
      planets: () => this.screens.planets(),
      awards: () => awardsScreen(this.screens),
      highlights: SHOW_HIGHLIGHTS ? highlightsButton(() => highlightsScreen(this.screens, (id) => this.startGame("adventure", id))) : undefined,
    });
    Ads.hideBanner();
  }

  private openSettings(): void {
    this.screens.settings(() => this.hud.refreshStrip(), {
      reminders: isNative ? async (on) => {
        if (on) return enableReminders();
        await disableReminders();
        return false;
      } : undefined,
      privacyOptions: Ads.privacyOptionsRequired ? () => void Ads.privacyOptions() : undefined,
      privacyPolicy: () => window.open(PRIVACY_URL, "_blank"),
    });
  }

  openMap(): void {
    levelMap(this.screens, (id) => this.startGame("adventure", id));
  }

  startGame(mode: Mode, level = 1, guided = false): void {
    Save.setSnapshot(null);
    this.screens.closeAll();
    this.state = "game";
    this.hud.setVisible(true);
    this.world.start(mode, level);
    // A bought hint lasts for the rest of your attempts at that puzzle.
    if (this.world.level?.solution && (guided || this.hintedLevel === level)) {
      this.world.guide = this.world.level.solution;
      this.hintedLevel = level;
    }
    this.hud.startRun();
    this.beginTutorial();
    if (this.world.level && this.tutorialStep < 0) {
      const l = this.world.level;
      const intro = l.intro && l.intro !== "basics" ? MECHANICS[l.intro] : null;
      this.hud.showHint(intro ? intro.desc : l.goals.map((g) => goalText(g, NAMES, PLURALS)).join(" · "));
      setTimeout(() => this.state === "game" && this.hud.hideHint(), intro ? 4200 : 2600);
    }
    Ads.showBanner();
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
    Ads.showBanner();
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
    if (this.state === "revive") return;
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
  // End of a run: revive offer, results, interstitials
  // -------------------------------------------------------------------------
  private onFail(reason: FailReason): void {
    const w = this.world;
    this.state = "revive";
    w.cancelPress();
    const canOffer = PACING.revivesPerRun > 0 && w.canRevive && Ads.rewardedAvailable();
    if (!canOffer) {
      w.finish();
      return;
    }
    reviveOffer(this.screens, reason, {
      accept: async () => {
        this.screens.closeAll();
        const rewarded = await Ads.showRewarded();
        if (rewarded) {
          w.revive();
          this.state = "game";
          this.last = performance.now();
          this.checkAwards();
        } else {
          w.finish();
        }
      },
      decline: () => {
        this.screens.closeAll();
        w.finish();
      },
    });
  }

  /** Puzzle levels: start the same puzzle again straight away. */
  private restartPuzzle(): void {
    const id = this.world.level?.id;
    if (!id || this.state !== "game") return;
    Sound.play("click", 0.9, -4);
    this.startGame("adventure", id);
  }

  /** Puzzle levels: watch a video to see where every planet goes. */
  private offerHint(): void {
    const level = this.world.level;
    if (!level?.solution || this.world.guide || this.state !== "game") return;
    this.state = "paused";
    const panel = h("div", { class: "panel" },
      h("h2", {}, "Need a hint?"),
      h("div", { class: "msg" }, "Watch a short video to see where to drop every planet. The puzzle starts again with the hints showing."),
      button(`${icon("play")}Watch video`, "teal block", async () => {
        this.screens.pop();
        if (await Ads.showRewarded()) this.startGame("adventure", level.id, true);
        else this.state = "game";
      }),
      button("NO THANKS", "ghost block small", () => {
        this.screens.pop();
        this.state = "game";
        this.last = performance.now();
      }));
    this.screens.push(h("div", { class: "screen" }, panel));
  }

  private onGameOver(r: RunResult): void {
    this.state = "over";
    Save.setSnapshot(null);
    Ads.runFinished();
    this.endTutorial();
    const newBest = Save.recordGame(r.mode, r.score, r.seconds);
    if (r.mode === "adventure") {
      const puzzle = Boolean(this.world.level?.solution);
      levelFailed(this.screens, r, [...this.world.goalProgress], {
        hint: puzzle && !this.world.guide ? async () => {
          if (await Ads.showRewarded()) this.startGame("adventure", r.level!, true);
        } : undefined,
        retry: () => (puzzle ? this.startGame("adventure", r.level) : this.afterRun(() => this.startGame("adventure", r.level))),
        map: () => this.afterRun(() => {
          this.goHome(false);
          this.openMap();
        }),
      });
    } else {
      this.screens.gameOver(r, newBest, {
        again: () => this.afterRun(() => this.startGame(r.mode)),
        home: () => this.afterRun(() => this.goHome(false)),
      });
      if (newBest) maybeAskForReview();
    }
    if (r.mode === "daily") void scheduleReminder();
    this.checkAwards();
    this.maybeOfferReminder(r);
  }

  private onLevelComplete(r: RunResult): void {
    this.state = "over";
    Save.setSnapshot(null);
    Ads.runFinished();
    Save.recordGame("adventure", r.score, r.seconds);
    Save.recordLevel(r.level!, r.stars ?? 1);
    levelComplete(this.screens, r, {
      next: () => this.afterRun(() => this.startGame("adventure", r.level! + 1)),
      map: () => this.afterRun(() => {
        this.goHome(false);
        this.openMap();
      }),
    });
    if ((r.stars ?? 0) === 3 && r.level! >= 5) maybeAskForReview();
    this.checkAwards();
  }

  /** Leaving a results screen is the natural break where an interstitial may run. */
  private async afterRun(next: () => void): Promise<void> {
    await Ads.maybeInterstitial();
    next();
  }

  private checkAwards(): void {
    for (const a of checkAchievements()) {
      this.screens.notify("ACHIEVEMENT!", a.name, badge(a), "toast");
      Sound.play("discover", 1.1, -3);
    }
  }

  /** After a few games, offer the daily reminder once (Android only). */
  private maybeOfferReminder(r: RunResult): void {
    if (!isNative || Save.data.reminderAsked || Save.setting("reminders")) return;
    if (r.mode !== "daily" && Save.data.stats.games < 4) return;
    Save.data.reminderAsked = true;
    Save.save();
    setTimeout(() => {
      if (this.state !== "over") return;
      const panel = h("div", { class: "panel" },
        h("h2", {}, "Daily reminder?"),
        h("div", { class: "msg" }, "We can nudge you once a day when a new Daily Challenge is ready. No other notifications."),
        button("YES, REMIND ME", "teal block", async () => {
          this.screens.pop();
          await enableReminders();
        }),
        button("NOT NOW", "ghost block small", () => this.screens.pop()));
      this.screens.push(h("div", { class: "screen" }, panel));
    }, 2500);
  }

  private async share(r: RunResult): Promise<void> {
    const what = r.mode === "adventure" ? `cleared level ${r.level}` : `scored ${r.score.toLocaleString("en-US")}`;
    const text = `I ${what} in Planet Drop and made ${NAMES[r.highest]}! Can you beat it?`;
    const res = await shareText(text);
    if (res === "copied") this.screens.notify("COPIED", "Paste it anywhere", h("i", { html: icon("share") }), "toast");
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
    return { app: this, world: this.world, Save, COLORS, levels: { getLevel } };
  }
}
