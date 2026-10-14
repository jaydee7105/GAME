// Adventure mode screens (level map, intro, results), the revive offer and
// the web build's demo-ad stand-in.

import { Sound } from "../core/audio";
import { buzz } from "../core/platform";
import { Save } from "../core/save";
import { CHAPTERS, CHAPTER_ICON, LEVEL_COUNT, LEVELS_PER_CHAPTER, Level, getLevel, goalText } from "../game/levels";
import { NAMES, PLURALS } from "../game/planets";
import type { FailReason, RunResult } from "../game/world";
import { PACING } from "../monetization/config";
import { iconUrl } from "../render/sprites";
import { button, formatScore, h, popIn } from "./dom";
import { icon } from "./icons";
import type { Screens } from "./screens";

function starRow(n: number, size = "", animate = false): HTMLElement {
  const row = h("div", { class: `stars ${size}`.trim() });
  for (let i = 0; i < 3; i++) {
    const s = h("i", { class: i < n ? "on" : "", html: icon("star") });
    row.append(s);
    if (animate && i < n) {
      s.animate(
        [{ transform: "scale(0) rotate(-40deg)", opacity: 0 }, { transform: "scale(1.35) rotate(8deg)", opacity: 1, offset: 0.7 }, { transform: "scale(1)", opacity: 1 }],
        { duration: 500, delay: 350 + i * 260, easing: "cubic-bezier(.2,.8,.3,1.3)", fill: "backwards" },
      );
      setTimeout(() => {
        Sound.play("chain", 1 + i * 0.12, -3, 0);
        buzz(20, 0.4);
      }, 350 + i * 260);
    }
  }
  return row;
}

function goalList(level: Level, progress?: number[]): HTMLElement {
  return h("div", { class: "goal-list" }, ...level.goals.map((g, i) => {
    const iconEl = g.kind === "make"
      ? h("img", { src: iconUrl(g.tier!, { face: Save.setting("faces") }), alt: "" })
      : h("i", { html: icon(g.kind === "score" ? "star" : "planet") });
    const done = progress ? (progress[i] ?? 0) >= g.count : false;
    const tail = progress
      ? h("b", { class: done ? "ok" : "" }, done ? "✓" : g.kind === "score" ? `${formatScore(progress[i] ?? 0)}` : `${progress[i] ?? 0}/${g.count}`)
      : null;
    return h("div", { class: "goal-row" }, iconEl, h("span", {}, goalText(g, NAMES, PLURALS)), tail);
  }));
}

// ---------------------------------------------------------------------------
// Level map
// ---------------------------------------------------------------------------
export function levelMap(screens: Screens, onPlay: (level: number) => void): void {
  const unlocked = Math.min(Save.data.adventure.unlocked, LEVEL_COUNT);
  const path = h("div", { class: "map" });
  let current: HTMLElement | null = null;
  for (let c = 0; c < CHAPTERS.length; c++) {
    const first = c * LEVELS_PER_CHAPTER + 1;
    const chapterLocked = first > unlocked;
    const header = h("div", { class: `chapter${chapterLocked ? " locked" : ""}` },
      h("img", { src: iconUrl(CHAPTER_ICON[c], { face: !chapterLocked && Save.setting("faces"), locked: chapterLocked }), alt: "" }),
      h("div", {}, h("small", {}, `CHAPTER ${c + 1}`), h("b", {}, CHAPTERS[c])));
    path.append(header);
    const nodes = h("div", { class: "nodes" });
    for (let i = 0; i < LEVELS_PER_CHAPTER; i++) {
      const id = first + i;
      const stars = Save.levelStars(id);
      const locked = id > unlocked;
      const isCurrent = id === unlocked;
      const boss = id % 10 === 0;
      const node = h("button", {
        class: `node${locked ? " locked" : ""}${isCurrent ? " current" : ""}${boss ? " boss" : ""}`,
        type: "button",
        style: { marginLeft: `${Math.round(Math.sin(i * 0.9) * 150)}px` },
        "aria-label": `Level ${id}`,
      }, h("span", {}, String(id)), stars ? starRow(stars, "tiny") : null);
      node.addEventListener("pointerdown", () => Sound.play("click", 1, -4));
      node.addEventListener("click", () => {
        if (locked) {
          node.animate([{ transform: "translateX(-8px)" }, { transform: "translateX(8px)" }, { transform: "translateX(0)" }], { duration: 220 });
          buzz(30, 0.3);
          return;
        }
        levelIntro(screens, getLevel(id), () => onPlay(id));
      });
      if (isCurrent) current = node;
      nodes.append(node);
    }
    path.append(nodes);
  }
  const scroll = h("div", { class: "scroll" }, h("div", { class: "col" }, path));
  const el = h("div", { class: "screen solid" },
    screens.topbar("Adventure"),
    h("div", { class: "subtitle", html: `${icon("star")}&nbsp;${Save.totalStars()} / ${LEVEL_COUNT * 3}` }),
    scroll);
  el.style.paddingTop = `${screens.safeTop + 28}px`;
  screens.push(el);
  requestAnimationFrame(() => current?.scrollIntoView({ block: "center" }));
}

export function levelIntro(screens: Screens, level: Level, onStart: () => void): void {
  const chapter = CHAPTERS[level.chapter];
  const best = Save.levelStars(level.id);
  const panel = h("div", { class: "panel level-panel" },
    h("div", { class: "eyebrow" }, `${chapter.toUpperCase()}${level.id % 10 === 0 ? " · BOSS" : ""}`),
    h("h2", {}, `Level ${level.id}`),
    best ? starRow(best) : null,
    goalList(level),
    h("div", { class: "msg" }, `${level.drops} drops · Finish with drops to spare for more stars`),
    button("PLAY", "primary block", () => {
      screens.closeAll();
      onStart();
    }),
    button("BACK", "ghost block small", () => screens.pop()));
  const el = h("div", { class: "screen" }, panel);
  screens.push(el);
}

export function levelComplete(screens: Screens, r: RunResult, h_: { next(): void; map(): void }): void {
  const level = getLevel(r.level!);
  const last = level.id >= LEVEL_COUNT;
  const panel = h("div", { class: "panel result" },
    h("div", { class: "eyebrow" }, CHAPTERS[level.chapter].toUpperCase()),
    h("h2", {}, `Level ${level.id} complete!`),
    starRow(r.stars ?? 1, "big", true),
    h("div", { class: "msg" }, `${r.dropsLeft} drops to spare · Score ${formatScore(r.score)}`),
    last ? h("div", { class: "msg", style: { color: "var(--gold)" } }, "You finished every level. Amazing!") : null,
    last ? null : button(`NEXT: LEVEL ${level.id + 1}`, "primary block", h_.next),
    button("MAP", "ghost block small", h_.map));
  screens.show(h("div", { class: "screen" }, panel));
}

export function levelFailed(screens: Screens, r: RunResult, progress: number[], h_: { retry(): void; map(): void }): void {
  const level = getLevel(r.level!);
  const panel = h("div", { class: "panel result" },
    h("h2", {}, r.reason === "drops" ? "Out of drops!" : "Jar's full!"),
    h("div", { class: "msg" }, `Level ${level.id} · So close! Here's how far you got:`),
    goalList(level, progress),
    button("TRY AGAIN", "primary block", h_.retry),
    button("MAP", "ghost block small", h_.map));
  screens.show(h("div", { class: "screen" }, panel));
}

// ---------------------------------------------------------------------------
// Revive: the one rewarded-ad placement
// ---------------------------------------------------------------------------
export function reviveOffer(screens: Screens, reason: FailReason, h_: { accept(): void; decline(): void }): void {
  let decided = false;
  const decide = (fn: () => void) => {
    if (decided) return;
    decided = true;
    clearInterval(timer);
    fn();
  };
  const secs = PACING.reviveCountdown;
  const ring = h("div", { class: "countdown" }, h("b", {}, String(secs)));
  const watch = button(`${icon("play")}Watch video`, "teal block", () => decide(h_.accept));
  const skip = button("No thanks", "ghost block small", () => decide(h_.decline));
  skip.style.opacity = "0";
  setTimeout(() => skip.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, fill: "forwards" }), 1200);
  const panel = h("div", { class: "panel revive" },
    h("h2", {}, "Keep going?"),
    ring,
    h("div", { class: "msg" }, reason === "drops"
      ? "Watch a short video to get 5 more drops."
      : "Watch a short video to clear the top of the jar and play on."),
    watch, skip);
  screens.show(h("div", { class: "screen" }, panel));
  popIn(ring, 0.05);
  let left = secs;
  const timer = window.setInterval(() => {
    left--;
    ring.querySelector("b")!.textContent = String(Math.max(left, 0));
    if (left <= 3) Sound.play("tick", 1.4, -8, 0);
    if (left <= 0) decide(h_.decline);
  }, 1000);
  ring.style.setProperty("--dur", `${secs}s`);
}

/** Web build only: a clearly labelled stand-in where the app shows a real ad. */
export function demoAd(host: HTMLElement, seconds: number): Promise<void> {
  return new Promise((resolve) => {
    const count = h("b", {}, String(seconds));
    const el = h("div", { class: "screen demo-ad" },
      h("div", { class: "panel" },
        h("div", { class: "eyebrow" }, "AD BREAK"),
        h("h2", {}, "Thanks for watching!"),
        h("div", { class: "msg" }, "In the app, a short video ad plays here. This web demo just counts down."),
        h("div", { class: "countdown" }, count)));
    host.append(el);
    let left = seconds;
    const t = window.setInterval(() => {
      left--;
      count.textContent = String(Math.max(left, 0));
      if (left <= 0) {
        clearInterval(t);
        el.remove();
        resolve();
      }
    }, 1000);
  });
}
