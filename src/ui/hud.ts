// In-game overlay: score, next planet, pause, power-ups, evolution strip and hints.

import { Save } from "../core/save";
import { COUNT } from "../game/planets";
import type { GameWorld } from "../game/world";
import { iconUrl } from "../render/sprites";
import { button, formatScore, h } from "./dom";
import { icon } from "./icons";

export class Hud {
  readonly el: HTMLDivElement;
  private scoreWrap: HTMLDivElement;
  private scoreEl: HTMLDivElement;
  private bestEl: HTMLDivElement;
  private modeEl: HTMLDivElement;
  private next: HTMLDivElement;
  private nextImg: HTMLImageElement;
  private pause: HTMLButtonElement;
  private bh: HTMLButtonElement;
  private sh: HTMLButtonElement;
  private bhBadge: HTMLSpanElement;
  private shBadge: HTMLSpanElement;
  private strip: HTMLDivElement;
  private slots: HTMLDivElement[] = [];
  private stripImgs: HTMLImageElement[] = [];
  private hint: HTMLDivElement;
  private finger: HTMLDivElement;
  private shown = 0;
  private target = 0;
  private highest = -1;

  constructor(private world: GameWorld, handlers: { pause(): void; blackHole(): void; shake(): void }) {
    this.scoreEl = h("div", { class: "score outlined" }, "0");
    this.bestEl = h("div", { class: "best" }, "BEST 0");
    this.modeEl = h("div", { class: "mode" });
    this.scoreWrap = h("div", { class: "score-wrap" }, this.scoreEl, this.bestEl, this.modeEl);
    this.nextImg = h("img", { alt: "" });
    this.next = h("div", { class: "next" }, h("span", {}, "NEXT"), this.nextImg);
    this.pause = button(icon("pause"), "ghost round", handlers.pause);
    this.pause.setAttribute("aria-label", "Pause");
    this.bhBadge = h("span", { class: "badge" }, "1");
    this.shBadge = h("span", { class: "badge" }, "1");
    this.bh = button(`${icon("blackhole")}Black Hole`, "secondary pill", handlers.blackHole);
    this.bh.append(this.bhBadge);
    this.sh = button(`${icon("shake")}Shake`, "secondary pill", handlers.shake);
    this.sh.append(this.shBadge);
    this.strip = h("div", { class: "strip" });
    for (let i = 0; i < COUNT; i++) {
      const img = h("img", { alt: "" });
      const size = 22 + i * 2.7;
      img.style.width = img.style.height = `${size}px`;
      const slot = h("div", { class: "slot" }, img);
      this.slots.push(slot);
      this.stripImgs.push(img);
      this.strip.append(slot);
    }
    this.hint = h("div", { class: "hint hidden" });
    this.finger = h("div", { class: "finger" });
    this.finger.style.display = "none";
    this.el = h("div", { class: "hud" }, this.scoreWrap, this.next, this.pause, this.strip, this.bh, this.sh, this.finger, this.hint);

    world.on("score", (score, gained) => this.onScore(score, gained));
    world.on("next", (t) => {
      this.nextImg.src = iconUrl(t, { face: Save.setting("faces") });
      this.nextImg.classList.remove("pop");
      void this.nextImg.offsetWidth;
      this.nextImg.classList.add("pop");
    });
    world.on("powerups", (b, s) => this.onPowerups(b, s));
    world.on("aiming", (on) => {
      this.bh.classList.toggle("aiming", on);
      if (on) this.showHint("Tap a planet to feed it to the black hole");
      else this.hideHint();
      this.onPowerups(world.blackHoles, world.shakes);
    });
  }

  layout(_viewW: number, _viewH: number, safeTop: number): void {
    const j = this.world.jar;
    const left = j.left - 14, right = j.right + 14;
    const top = safeTop + 26;
    const place = (el: HTMLElement, x: number, y: number, w?: number, hgt?: number) => {
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      if (w !== undefined) el.style.width = `${w}px`;
      if (hgt !== undefined) el.style.height = `${hgt}px`;
    };
    place(this.scoreWrap, left, top - 6);
    place(this.pause, right - 88, top, 88, 88);
    place(this.next, right - 88 - 128, top - 6);
    place(this.strip, left, j.bottom + 22, right - left, 64);
    const barY = j.bottom + 100, gap = 20, w = (right - left - gap) / 2;
    place(this.bh, left, barY, w);
    place(this.sh, left + w + gap, barY, w);
    place(this.hint, j.centerX, j.top + 150);
    this.hint.style.width = `${j.rect.w - 80}px`;
    place(this.finger, j.centerX, this.world.dropY + 96);
  }

  startRun(): void {
    const w = this.world;
    this.modeEl.textContent = w.mode === "daily" ? "DAILY CHALLENGE" : "";
    this.bestEl.textContent = "BEST " + formatScore(w.mode === "daily" ? Save.todaysDailyBest() : Save.data.best);
    this.shown = this.target = w.score;
    this.scoreEl.textContent = formatScore(w.score);
    this.highest = -1;
    this.refreshStrip();
    this.hideHint();
  }

  refreshStrip(flashTier = -1): void {
    for (let i = 0; i < COUNT; i++) {
      const img = this.stripImgs[i];
      const url = iconUrl(i, { locked: !Save.isDiscovered(i) });
      if (img.getAttribute("src") !== url) img.src = url;
      if (i === flashTier) {
        img.classList.remove("flash");
        void img.offsetWidth;
        img.classList.add("flash");
      }
    }
  }

  update(dt: number): void {
    if (Math.round(this.shown) !== this.target) {
      this.shown += (this.target - this.shown) * (1 - Math.exp(-dt * 12));
      if (Math.abs(this.shown - this.target) < 1) this.shown = this.target;
      this.scoreEl.textContent = formatScore(this.shown);
    }
    if (this.world.highest !== this.highest) {
      this.highest = this.world.highest;
      this.slots.forEach((s, i) => s.classList.toggle("top", i === this.highest));
    }
  }

  private onScore(score: number, gained: number): void {
    this.target = score;
    if (gained > 0) {
      this.scoreEl.classList.remove("bump");
      void this.scoreEl.offsetWidth;
      this.scoreEl.classList.add("bump");
    } else {
      this.shown = score;
      this.scoreEl.textContent = formatScore(score);
    }
  }

  private onPowerups(b: number, s: number): void {
    this.bhBadge.textContent = String(b);
    this.shBadge.textContent = String(s);
    this.bhBadge.classList.toggle("empty", b <= 0);
    this.shBadge.classList.toggle("empty", s <= 0);
    this.bh.disabled = b <= 0 && !this.world.aimingBlackHole;
    this.sh.disabled = s <= 0;
  }

  showHint(text: string): void {
    this.hint.textContent = text;
    this.hint.classList.remove("hidden");
  }

  hideHint(): void {
    this.hint.classList.add("hidden");
  }

  showFinger(on: boolean): void {
    this.finger.style.display = on ? "block" : "none";
  }

  setVisible(on: boolean): void {
    this.el.style.display = on ? "" : "none";
  }
}
