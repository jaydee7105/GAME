// Full-screen overlays: title, pause, results, settings, planet collection,
// plus the "new planet" banner.

import { Sound } from "../core/audio";
import { buzz } from "../core/platform";
import { Mode, Save, SettingKey } from "../core/save";
import { LEVEL_COUNT } from "../game/chapters";
import { COUNT, FACTS, NAMES, PLURALS, SATURN, SUN } from "../game/planets";
import type { RunResult } from "../game/world";
import { iconUrl } from "../render/sprites";
import { button, formatScore, h, popIn } from "./dom";
import { icon } from "./icons";

export class Screens {
  private current: HTMLElement | null = null;
  private stack: HTMLElement[] = [];
  safeTop = 0;
  safeBottom = 0;
  viewW = 720;
  viewH = 1280;

  constructor(private host: HTMLElement) {}

  /** Replaces whatever screen is showing. */
  show(el: HTMLElement): HTMLElement {
    this.closeAll();
    this.host.append(el);
    this.current = el;
    return el;
  }

  /** Shows a screen on top of the current one (settings over title...). */
  push(el: HTMLElement): HTMLElement {
    this.host.append(el);
    this.stack.push(el);
    // Once a solid screen has faded in, hide what's under it.
    if (el.classList.contains("solid")) setTimeout(() => this.updateCover(), 260);
    return el;
  }

  /** Hides screens that sit fully under a solid one. */
  private updateCover(): void {
    const all = [this.current, ...this.stack].filter((e): e is HTMLElement => e !== null);
    let covered = false;
    for (let i = all.length - 1; i >= 0; i--) {
      all[i].style.visibility = covered ? "hidden" : "";
      if (all[i].classList.contains("solid")) covered = true;
    }
  }

  /** Closes the top-most pushed screen. Returns false if there was none. */
  pop(): boolean {
    const el = this.stack.pop();
    if (!el) return false;
    this.updateCover();
    this.fadeOut(el);
    return true;
  }

  hasPushed(): boolean {
    return this.stack.length > 0;
  }

  closeAll(): void {
    while (this.stack.length) this.fadeOut(this.stack.pop()!);
    if (this.current) this.fadeOut(this.current);
    this.current = null;
  }

  private fadeOut(el: HTMLElement): void {
    el.classList.add("closing");
    setTimeout(() => el.remove(), 160);
  }

  // -------------------------------------------------------------------------
  // Title
  // -------------------------------------------------------------------------
  title(h_: { play(): void; resume(): void; daily(): void; adventure(): void; settings(): void; planets(): void; awards(): void; highlights?: HTMLElement }): void {
    const usable = this.viewH - this.safeTop - this.safeBottom;
    const el = h("div", { class: "screen clear title" });
    const orbit = new TitleOrbit();
    orbit.el.style.top = `${this.safeTop + usable * 0.205}px`;
    const logo = h("div", { class: "logo" }, h("div", { class: "l1" }, "PLANET"), h("div", { class: "l2" }, "DROP"));
    logo.style.top = `${this.safeTop + usable * 0.33}px`;

    const menu = h("div", { class: "menu stagger" });
    const snap = Save.data.snapshot;
    if (snap) {
      menu.append(button("CONTINUE", "primary big", h_.resume));
      menu.append(h("div", { class: "note" }, snap.mode === "daily" ? "Daily run in progress" : `Score ${formatScore(snap.score)}`));
      menu.append(button("NEW GAME", "secondary small", h_.play));
    } else {
      menu.append(button("PLAY", "primary big", h_.play));
    }
    const lvl = Math.min(Save.data.adventure.unlocked, LEVEL_COUNT);
    menu.append(button(`ADVENTURE<small>Level ${lvl}</small>`, "secondary small stacked", h_.adventure));
    menu.append(button("DAILY CHALLENGE", "teal small", h_.daily));
    const streak = Save.liveStreak();
    const todayBest = Save.todaysDailyBest();
    menu.append(h("div", { class: "note" },
      streak > 0 ? h("span", { class: "streak", html: `${icon("flame")}${streak} day streak` }) : null,
      streak > 0 ? " · " : null,
      todayBest > 0 ? `Today's best ${formatScore(todayBest)}` : "New puzzle every day"));
    menu.append(h("div", { class: "row" },
      button(`${icon("planet")}Planets`, "ghost small tile", h_.planets),
      button(`${icon("trophy")}Awards`, "ghost small tile", h_.awards),
      button(`${icon("gear")}Settings`, "ghost small tile", h_.settings)));
    [...menu.children].forEach((c, i) => ((c as HTMLElement).style.animationDelay = `${0.2 + i * 0.07}s`));

    const footer = h("div", { class: "footer", html: `${icon("trophy")}BEST&nbsp;&nbsp;${formatScore(Save.data.best)}` });
    footer.style.top = `${this.viewH - this.safeBottom - 84}px`;
    el.append(orbit.el, logo, menu, footer);
    if (h_.highlights) {
      h_.highlights.style.top = `${this.safeTop + 28}px`;
      el.append(h_.highlights);
    }
    this.show(el);

    // Place the menu, keeping it clear of the footer on short screens.
    menu.style.top = `${this.safeTop + usable * 0.555}px`;
    const maxTop = this.viewH - this.safeBottom - 84 - 36 - menu.offsetHeight;
    const top = this.safeTop + usable * 0.555;
    if (top > maxTop) {
      const shift = top - maxTop;
      menu.style.top = `${maxTop}px`;
      logo.style.top = `${this.safeTop + usable * 0.33 - shift * 0.8}px`;
      orbit.el.style.top = `${this.safeTop + usable * 0.205 - shift * 0.55}px`;
    }
    popIn(logo, 0.05);
    orbit.start(el);
  }

  // -------------------------------------------------------------------------
  // Pause
  // -------------------------------------------------------------------------
  pause(h_: { resume(): void; restart(): void; home(): void }): void {
    const panel = h("div", { class: "panel" });
    const el = h("div", { class: "screen" }, panel);
    const build = () => {
      panel.replaceChildren(
        h("h2", {}, "Paused"),
        button("RESUME", "primary block", h_.resume),
        button("RESTART", "secondary block small", confirm),
        button("SAVE &amp; QUIT", "ghost block small", h_.home),
        h("div", { class: "quick" }, quickToggle("music", "music"), quickToggle("sfx", "sound"), quickToggle("haptics", "vibrate")),
      );
    };
    const confirm = () => {
      panel.replaceChildren(
        h("h2", {}, "Restart?"),
        h("div", { class: "msg" }, "Your current jar will be lost."),
        button("RESTART", "pink block", h_.restart),
        button("CANCEL", "ghost block small", build),
      );
    };
    build();
    this.show(el);
  }

  // -------------------------------------------------------------------------
  // Results
  // -------------------------------------------------------------------------
  gameOver(r: RunResult, newBest: boolean, h_: { again(): void; home(): void }): void {
    const titles = ["Jar's full!", "Out of space!", "Cosmic crunch!", "Planet pile-up!"];
    const daily = r.mode === "daily";
    const scoreEl = h("div", { class: "big" }, "0");
    const best = daily ? Save.todaysDailyBest() : Save.data.best;
    const d = new Date();
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const streak = Save.liveStreak();
    const panel = h("div", { class: "panel result" },
      h("h2", {}, titles[Math.floor(Math.random() * titles.length)]),
      daily ? h("div", { class: "sub" }, `Daily Challenge · ${months[d.getMonth()]} ${d.getDate()}`) : null,
      h("div", { class: "label" }, "SCORE"),
      scoreEl,
      newBest ? h("div", { class: "ribbon" }, "NEW BEST!") : h("div", { class: "msg" }, `Best  ${formatScore(best)}`),
      h("div", { class: "stats" },
        h("div", { class: "stat" }, h("img", { src: iconUrl(r.highest, { face: Save.setting("faces"), mood: "happy" }), alt: "" }),
          h("b", { class: "name" }, NAMES[r.highest]), h("span", {}, "Biggest planet")),
        h("div", { class: "stat" }, h("b", {}, String(r.merges)), h("span", {}, "Merges")),
        h("div", { class: "stat" }, h("b", {}, `x${Math.max(r.bestChain, 1)}`), h("span", {}, "Best chain"))),
      daily ? h("div", { class: "msg", style: { color: streak > 1 ? "var(--orange)" : "" } },
        streak > 1 ? `${streak} day streak! New challenge tomorrow.` : "Come back tomorrow for a new challenge.") : null,
      button("PLAY AGAIN", "primary block", h_.again),
      h("div", { class: "row2" },
        button("HOME", "ghost small", h_.home),
        button(`${icon("share")}SHARE`, "ghost small", () => this.onShare?.(r))),
    );
    const el = h("div", { class: "screen" }, panel);
    el.style.background = "rgba(8,5,26,.72)";
    this.show(el);
    const ribbon = panel.querySelector<HTMLElement>(".ribbon");
    if (ribbon) popIn(ribbon, 1.0);

    // Count the score up.
    let shown = 0;
    let last = performance.now();
    const tick = (now: number) => {
      if (!el.isConnected) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const before = shown;
      shown = Math.min(shown + Math.max(r.score * dt * 1.1, 60 * dt), r.score);
      scoreEl.textContent = formatScore(Math.floor(shown));
      if (Math.floor(shown / 50) !== Math.floor(before / 50)) Sound.play("tick", 1 + (shown / Math.max(r.score, 1)) * 0.5, -10, 0.04);
      if (shown < r.score) requestAnimationFrame(tick);
      else scoreEl.animate([{ transform: "scale(1)" }, { transform: "scale(1.15)" }, { transform: "scale(1)" }], { duration: 380, easing: "ease-out" });
    };
    requestAnimationFrame(tick);
    if (newBest) {
      setTimeout(() => {
        if (!el.isConnected) return;
        Sound.play("highscore", 1, -1);
        buzz(80, 0.6);
        this.onCelebrate?.();
      }, 1000);
    }
  }

  /** Hook so the app can fire confetti on the canvas. */
  onCelebrate?: () => void;
  /** Hook for the results screen's Share button. */
  onShare?: (r: RunResult) => void;

  // -------------------------------------------------------------------------
  // Settings
  // -------------------------------------------------------------------------
  settings(onReset: () => void, extra: SettingsExtras = {}): void {
    const rows: [SettingKey, string, string][] = [
      ["music", "Music", "music"], ["sfx", "Sound effects", "sound"], ["haptics", "Vibration", "vibrate"],
      ["faces", "Cute faces", "face"], ["guide", "Aim guide", "guide"],
    ];
    const col = h("div", { class: "col" });
    const el = h("div", { class: "screen solid" }, this.topbar("Settings"), h("div", { class: "scroll" }, col));
    el.style.paddingTop = `${this.safeTop + 28}px`;
    const build = (confirmReset = false) => {
      const s = Save.data.stats;
      const minutes = Math.floor(s.seconds / 60);
      col.replaceChildren(
        h("div", { class: "card" }, ...rows.map(([key, label, ic]) => {
          const t = h("button", { class: `toggle${Save.setting(key) ? " on" : ""}`, type: "button", "aria-label": label });
          t.addEventListener("click", () => {
            const on = !Save.setting(key);
            Save.setSetting(key, on);
            t.classList.toggle("on", on);
            Sound.play("click", on ? 1.1 : 0.9, -4);
            buzz(10, 0.3);
          });
          return h("div", { class: "setting" }, h("i", { html: icon(ic) }), h("span", {}, label), t);
        }), extra.reminders ? reminderRow(extra.reminders) : null),
        h("div", { class: "section" }, "YOUR STATS"),
        h("div", { class: "card grid2" }, ...([
          ["Games played", formatScore(s.games)], ["Best score", formatScore(Save.data.best)],
          ["Planets merged", formatScore(s.merges)], ["Supernovas", formatScore(s.supernovas)],
          ["Planets found", `${Save.discoveredCount()} / ${COUNT}`],
          ["Levels cleared", formatScore(Save.data.adventure.unlocked - 1)], ["Adventure stars", formatScore(Save.totalStars())],
          ["Longest chain", s.bestChain ? `x${s.bestChain}` : "-"],
          ["Time played", `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`],
        ].flatMap(([k, v]) => [h("div", { class: "k" }, k), h("div", {}, v)]))),
        button(confirmReset ? "Tap again to erase everything" : "Reset progress", confirmReset ? "pink block small" : "ghost block small", () => {
          if (!confirmReset) return build(true);
          Save.resetProgress();
          onReset();
          build(false);
        }),
        ...[
          extra.privacyOptions ? button(`${icon("shield")}Ad privacy choices`, "ghost block small", extra.privacyOptions) : null,
          extra.privacyPolicy ? button("Privacy policy", "ghost block small", extra.privacyPolicy) : null,
        ].filter((b): b is HTMLButtonElement => b !== null),
        h("div", { class: "about", html:
          "Planet Drop v1.1.0<br>Planets modelled in Blender<br>Fredoka font by Milena Brandão (SIL Open Font License)<br>Your progress stays on this device." }),
      );
    };
    build();
    this.push(el);
  }

  // -------------------------------------------------------------------------
  // Planet collection
  // -------------------------------------------------------------------------
  planets(): void {
    const grid = h("div", { class: "planets" });
    const el = h("div", { class: "screen solid" },
      this.topbar("Planets"),
      h("div", { class: "subtitle" }, `${Save.discoveredCount()} of ${COUNT} discovered`),
      h("div", { class: "scroll" }, h("div", { class: "col" }, grid)));
    el.style.paddingTop = `${this.safeTop + 28}px`;
    for (let t = 0; t < COUNT; t++) {
      const known = Save.isDiscovered(t);
      const made = Save.data.created[t];
      const card = h("button", { class: `pcard${known ? "" : " locked"}`, type: "button" },
        h("img", { src: iconUrl(t, { face: known && Save.setting("faces"), locked: !known }), alt: "" }),
        h("b", {}, known ? NAMES[t] : "???"),
        h("small", {}, known ? (made > 0 ? `Made ${formatScore(made)}×` : "Found") : `Tier ${t + 1}`));
      card.addEventListener("pointerdown", () => Sound.play("click", 1, -4));
      card.addEventListener("click", () => this.planetDetail(t));
      grid.append(card);
    }
    this.push(el);
  }

  private planetDetail(t: number): void {
    const known = Save.isDiscovered(t);
    const fact = known ? FACTS[t]
      : t > 0 && Save.isDiscovered(t - 1) ? `Merge two ${PLURALS[t - 1]} to discover it.` : "Keep merging bigger planets to discover it.";
    const img = h("img", { src: iconUrl(t, { face: known && Save.setting("faces"), locked: !known, mood: "happy" }), alt: "" });
    if (t === SATURN || t === SUN) img.style.width = img.style.height = "330px";
    const panel = h("div", { class: "panel detail" },
      img,
      h("h2", {}, known ? NAMES[t] : "Undiscovered"),
      h("p", {}, fact),
      known ? h("div", { class: "made" }, `You've made ${formatScore(Save.data.created[t])}`) : null,
      button("NICE", "primary block small", () => this.pop()));
    const el = h("div", { class: "screen" }, panel);
    el.addEventListener("click", (e) => {
      if (e.target === el) this.pop();
    });
    this.push(el);
    popIn(img, 0.05);
  }

  topbar(title: string): HTMLElement {
    const back = button(icon("back"), "ghost round", () => this.pop());
    back.setAttribute("aria-label", "Back");
    return h("div", { class: "topbar" }, back, h("h1", {}, title));
  }

  // -------------------------------------------------------------------------
  // Banner
  // -------------------------------------------------------------------------
  private bannerQueue: { small: string; big: string; art: HTMLElement; cls: string }[] = [];
  private bannerBusy = false;

  banner(tier: number): void {
    this.notify("NEW PLANET!", NAMES[tier], h("img", { src: iconUrl(tier, { face: Save.setting("faces"), mood: "happy" }), alt: "" }));
  }

  /** Drops a small card in from the top (discoveries, achievements...). */
  notify(small: string, big: string, art: HTMLElement, cls = ""): void {
    this.bannerQueue.push({ small, big, art, cls });
    if (!this.bannerBusy) this.nextBanner();
  }

  /** Removes any queued or visible banners (e.g. when leaving a run). */
  clearBanners(): void {
    this.bannerQueue = [];
    this.bannerBusy = false;
    clearTimeout(this.bannerTimer);
    this.host.querySelectorAll(".banner").forEach((b) => b.remove());
  }

  private bannerTimer = 0;

  private nextBanner(): void {
    const item = this.bannerQueue.shift();
    if (item === undefined) {
      this.bannerBusy = false;
      return;
    }
    this.bannerBusy = true;
    const el = h("div", { class: `banner ${item.cls}`.trim() }, item.art, h("div", {}, h("small", {}, item.small), h("b", {}, item.big)));
    el.style.top = `${this.safeTop + 150}px`;
    this.host.append(el);
    this.bannerTimer = window.setTimeout(() => {
      el.remove();
      this.nextBanner();
    }, 2850);
  }
}

export interface SettingsExtras {
  /** Daily reminder switch (native only). Resolves to the new state. */
  reminders?: (on: boolean) => Promise<boolean>;
  /** Opens the ad consent form (only where the law requires the option). */
  privacyOptions?: () => void;
  privacyPolicy?: () => void;
}

function reminderRow(set: (on: boolean) => Promise<boolean>): HTMLElement {
  const t = h("button", { class: `toggle${Save.setting("reminders") ? " on" : ""}`, type: "button", "aria-label": "Daily reminder" });
  t.addEventListener("click", async () => {
    Sound.play("click", 1, -4);
    const on = await set(!Save.setting("reminders"));
    t.classList.toggle("on", on);
  });
  return h("div", { class: "setting" }, h("i", { html: icon("bell") }), h("span", {}, "Daily reminder"), t);
}

function quickToggle(key: SettingKey, ic: string): HTMLButtonElement {
  const b = button(icon(ic), `ghost round${Save.setting(key) ? "" : " off"}`, () => {
    Save.setSetting(key, !Save.setting(key));
    b.classList.toggle("off", !Save.setting(key));
  });
  return b;
}

/** A little solar system orbiting above the title. */
class TitleOrbit {
  readonly el = h("div", { class: "orbit" });
  private center: HTMLImageElement;
  private orbiters: { img: HTMLImageElement; phase: number; speed: number; dist: number; size: number; spin: number }[] = [];

  constructor() {
    const faces = Save.setting("faces");
    this.center = h("img", { src: iconUrl(SATURN, { face: faces, mood: "happy" }), alt: "" });
    this.center.style.width = this.center.style.height = "400px";
    const specs: [number, number, number, number][] = [[5, 76, 0, 0.55], [1, 42, 2.2, 0.55], [3, 58, 4.0, 0.55], [6, 66, 1.1, 0.38], [0, 32, 3.1, 0.38]];
    for (const [tier, size, phase, speed] of specs) {
      const img = h("img", { src: iconUrl(tier, { face: faces }), alt: "" });
      img.style.width = img.style.height = `${size}px`;
      this.orbiters.push({ img, phase, speed, dist: speed > 0.5 ? 1 : 1.3, size, spin: 0 });
      this.el.append(img);
    }
    this.el.append(this.center);
  }

  start(screen: HTMLElement): void {
    const t0 = performance.now();
    const frame = (now: number) => {
      if (!screen.isConnected) return;
      const t = (now - t0) / 1000;
      const cy = Math.sin(t * 1.3) * 8;
      this.center.style.transform = `translate(-50%, -50%) translateY(${cy}px) rotate(${Math.sin(t * 0.6) * 4.5}deg)`;
      for (const o of this.orbiters) {
        const a = o.phase + t * o.speed;
        const rx = 250 * o.dist, ry = 64 * o.dist;
        const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
        const rot = -0.24;
        const px = x * Math.cos(rot) - y * Math.sin(rot);
        const py = x * Math.sin(rot) + y * Math.cos(rot) + cy * 0.4;
        const depth = Math.sin(a);
        const k = 0.82 + 0.18 * depth;
        o.spin += 0.5 / 60;
        o.img.style.transform = `translate(-50%, -50%) translate(${px}px, ${py}px) scale(${k}) rotate(${o.spin}rad)`;
        o.img.style.zIndex = depth > 0 ? "2" : "0";
        o.img.style.filter = `brightness(${1 - 0.25 * (1 - depth) * 0.5})`;
      }
      this.center.style.zIndex = "1";
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}

export type { Mode };
