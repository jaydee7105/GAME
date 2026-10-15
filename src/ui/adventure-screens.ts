// Adventure mode screens (level map, intro, results), the revive offer and
// the web build's demo-ad stand-in.

import { Sound } from "../core/audio";
import { buzz, isNative } from "../core/platform";
import { Save } from "../core/save";
import { MECHANICS } from "../game/chapters";
import { HIGHLIGHTS } from "../game/highlights";
import { CHAPTERS, LEVEL_COUNT, LEVELS_PER_CHAPTER, Level, chapterOf, getLevel, goalIcon, goalText, levelFeatures } from "../game/levels";
import { NAMES, PLURALS } from "../game/planets";
import type { FailReason, RunResult } from "../game/world";
import { PACING, USING_TEST_ADS } from "../monetization/config";
import { iconUrl } from "../render/sprites";
import { button, formatScore, h, popIn } from "./dom";
import { icon } from "./icons";
import type { Screens } from "./screens";

/** Whether the Highlights shortcut is offered (web and test builds only). */
export const SHOW_HIGHLIGHTS = !isNative || USING_TEST_ADS;

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
      : h("i", { class: `gi-${g.kind}`, html: icon(goalIcon(g)) });
    const done = progress ? (progress[i] ?? 0) >= g.count : false;
    const tail = progress
      ? h("b", { class: done ? "ok" : "" }, done ? "✓" : g.kind === "score" ? `${formatScore(progress[i] ?? 0)}` : `${progress[i] ?? 0}/${g.count}`)
      : null;
    return h("div", { class: "goal-row" }, iconEl, h("span", {}, goalText(g, NAMES, PLURALS)), tail);
  }));
}

const TAGS = { hard: "HARD", super: "SUPER HARD", boss: "BOSS" } as const;

function chapterStars(c: number): number {
  let n = 0;
  for (let i = 1; i <= LEVELS_PER_CHAPTER; i++) n += Save.levelStars(c * LEVELS_PER_CHAPTER + i);
  return n;
}

// ---------------------------------------------------------------------------
// Level map: one chapter at a time, with arrows to flip between chapters
// ---------------------------------------------------------------------------
export function levelMap(screens: Screens, onPlay: (level: number) => void): void {
  const unlocked = Math.min(Save.data.adventure.unlocked, LEVEL_COUNT);
  let chapter = chapterOf(unlocked);
  const header = h("div", { class: "chapter-head" });
  const path = h("div", { class: "map" });
  const scroll = h("div", { class: "scroll" }, h("div", { class: "col" }, path));

  const render = (dir = 0) => {
    const c = CHAPTERS[chapter];
    const first = chapter * LEVELS_PER_CHAPTER + 1;
    const locked = first > unlocked;
    const prev = button(icon("back"), "ghost round small", () => go(-1));
    const next = button(icon("chevron"), "ghost round small", () => go(1));
    prev.disabled = chapter === 0;
    next.disabled = chapter === CHAPTERS.length - 1;
    prev.setAttribute("aria-label", "Previous chapter");
    next.setAttribute("aria-label", "Next chapter");
    const mech = c.mechanic !== "basics" ? MECHANICS[c.mechanic] : null;
    header.replaceChildren(prev,
      h("div", { class: `chapter${locked ? " locked" : ""}` },
        h("img", { src: iconUrl(c.icon, { face: !locked && Save.setting("faces"), locked }), alt: "" }),
        h("div", {},
          h("small", {}, `CHAPTER ${chapter + 1} OF ${CHAPTERS.length}`),
          h("b", {}, c.name),
          h("em", { html: locked
            ? `${icon("lock")} Clear level ${first - 1} to unlock`
            : `${icon("star")} ${chapterStars(chapter)} / ${LEVELS_PER_CHAPTER * 3}${mech ? ` &nbsp;·&nbsp; ${icon(mech.icon)} ${mech.name}` : ""}` }))),
      next);

    const nodes = h("div", { class: "nodes" });
    let current: HTMLElement | null = null;
    for (let i = 0; i < LEVELS_PER_CHAPTER; i++) {
      const id = first + i;
      const level = getLevel(id);
      const stars = Save.levelStars(id);
      const isLocked = id > unlocked;
      const isCurrent = id === unlocked;
      const node = h("button", {
        class: `node${isLocked ? " locked" : ""}${isCurrent ? " current" : ""}${level.tag ? " " + level.tag : ""}${level.queue ? " puzzle" : ""}`,
        type: "button",
        style: { marginLeft: `${Math.round(Math.sin(i * 0.9) * 150)}px` },
        "aria-label": `Level ${id}`,
      },
      h("span", {}, String(id)),
      stars ? starRow(stars, "tiny") : null,
      level.tag && !isLocked ? h("i", { class: "tag" }, level.tag === "boss" ? "BOSS" : level.tag === "super" ? "SUPER" : "HARD") : null,
      level.intro && !isLocked ? h("i", { class: "new", html: icon(MECHANICS[level.intro as keyof typeof MECHANICS]?.icon ?? "star") }) : null,
      level.queue && !level.intro ? h("i", { class: "pz", html: icon("puzzle") }) : null);
      node.addEventListener("pointerdown", () => Sound.play("click", 1, -4));
      node.addEventListener("click", () => {
        if (isLocked) {
          node.animate([{ transform: "translateX(-8px)" }, { transform: "translateX(8px)" }, { transform: "translateX(0)" }], { duration: 220 });
          buzz(30, 0.3);
          return;
        }
        levelIntro(screens, level, () => onPlay(id));
      });
      if (isCurrent) current = node;
      nodes.append(node);
    }
    path.replaceChildren(nodes);
    if (dir) nodes.animate([{ transform: `translateX(${dir * 60}px)`, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 260, easing: "ease-out" });
    requestAnimationFrame(() => {
      if (current) current.scrollIntoView({ block: "center" });
      else scroll.scrollTop = 0;
    });
  };
  const go = (d: number) => {
    const n = Math.min(Math.max(chapter + d, 0), CHAPTERS.length - 1);
    if (n === chapter) return;
    chapter = n;
    Sound.play("click", 1.1, -4);
    render(d);
  };

  const top = screens.topbar("Adventure");
  if (SHOW_HIGHLIGHTS) top.append(highlightsButton(() => highlightsScreen(screens, onPlay), true));
  const el = h("div", { class: "screen solid" },
    top,
    h("div", { class: "subtitle", html: `${icon("star")}&nbsp;${Save.totalStars()} / ${LEVEL_COUNT * 3}` }),
    header,
    scroll);
  el.style.paddingTop = `${screens.safeTop + 28}px`;
  // Swipe left/right to change chapter.
  let sx = 0, sy = 0;
  scroll.addEventListener("pointerdown", (e) => {
    sx = e.clientX;
    sy = e.clientY;
  });
  scroll.addEventListener("pointerup", (e) => {
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
  });
  render();
  screens.push(el);
}

export function highlightsButton(onClick: () => void, compact = false): HTMLButtonElement {
  const b = compact
    ? button(icon("sparkle"), "gold round highlights-btn compact", onClick)
    : button(`${icon("sparkle")}Highlights`, "gold small highlights-btn", onClick);
  b.setAttribute("aria-label", "Level highlights");
  return b;
}

/** A tour of the most interesting levels, playable right away. */
export function highlightsScreen(screens: Screens, onPlay: (level: number) => void): void {
  const list = h("div", { class: "highlights" });
  for (const hl of HIGHLIGHTS) {
    const level = getLevel(hl.id);
    const feats = levelFeatures(level).filter((m) => m !== "basics").slice(0, 4);
    const card = h("button", { class: `hl-card${level.tag ? " " + level.tag : ""}`, type: "button" },
      h("div", { class: "hl-num" }, h("small", {}, "LEVEL"), h("b", {}, String(hl.id))),
      h("div", { class: "hl-info" },
        h("b", {}, hl.name),
        h("span", {}, hl.blurb),
        h("div", { class: "hl-icons" }, ...feats.map((m) => h("i", { title: MECHANICS[m as keyof typeof MECHANICS].name, html: icon(MECHANICS[m as keyof typeof MECHANICS].icon) })),
          ...level.goals.map((g) => h("em", {}, goalText(g, NAMES, PLURALS))))));
    card.addEventListener("pointerdown", () => Sound.play("click", 1, -4));
    card.addEventListener("click", () => levelIntro(screens, level, () => onPlay(hl.id)));
    list.append(card);
  }
  const el = h("div", { class: "screen solid" },
    screens.topbar("Highlights"),
    h("div", { class: "subtitle" }, "Jump straight into the best levels"),
    h("div", { class: "scroll" }, h("div", { class: "col" }, list)));
  el.style.paddingTop = `${screens.safeTop + 28}px`;
  screens.push(el);
}

export function levelIntro(screens: Screens, level: Level, onStart: () => void): void {
  const chapter = CHAPTERS[level.chapter];
  const best = Save.levelStars(level.id);
  const intro = level.intro && level.intro !== "basics" ? MECHANICS[level.intro] : null;
  const chips = levelFeatures(level).filter((m) => m !== level.intro && m !== "basics").map((m) => {
    const info = MECHANICS[m as keyof typeof MECHANICS];
    return h("span", { class: "chip", html: `${icon(info.icon)}${info.name}` });
  });
  const puzzle = Boolean(level.queue);
  const panel = h("div", { class: `panel level-panel${level.tag ? " " + level.tag : ""}${puzzle ? " puzzle" : ""}` },
    h("div", { class: "eyebrow" }, `${puzzle ? "PUZZLE" : level.intro ? chapter.name.toUpperCase() : "FREE PLAY"}${level.tag ? ` · ${TAGS[level.tag]}` : ""}`),
    h("h2", {}, `Level ${level.id}`),
    puzzle && level.title ? h("div", { class: "pz-title", html: `${icon("puzzle")}${level.title}` }) : null,
    best ? starRow(best) : null,
    intro ? h("div", { class: "new-card" },
      h("i", { html: icon(intro.icon) }),
      h("div", {}, h("small", {}, "NEW!"), h("b", {}, intro.name), h("span", {}, intro.desc))) : null,
    goalList(level),
    chips.length ? h("div", { class: "chips" }, ...chips) : null,
    puzzle ? h("div", { class: "pz-queue" }, h("small", {}, "YOUR PLANETS, IN ORDER"),
      h("div", {}, ...level.queue!.map((t) => h("img", { src: iconUrl(t, { face: Save.setting("faces") }), alt: "" })))) : null,
    h("div", { class: "msg" }, puzzle
      ? "Every puzzle has a solution. Plan where each planet goes!"
      : `${level.drops} drops · Finish with drops to spare for more stars`),
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
    h("div", { class: "eyebrow" }, CHAPTERS[level.chapter].name.toUpperCase()),
    h("h2", {}, `Level ${level.id} complete!`),
    starRow(r.stars ?? 1, "big", true),
    h("div", { class: "msg" }, level.queue
      ? (r.stars ?? 3) < 3 ? "Solved with a hint. Try it without one for 3 stars!" : `Solved in ${r.drops} ${r.drops === 1 ? "drop" : "drops"}!`
      : `${r.dropsLeft} drops to spare · Score ${formatScore(r.score)}`),
    last ? h("div", { class: "msg", style: { color: "var(--gold)" } }, "You finished every level. Amazing!") : null,
    last ? null : button(`NEXT: LEVEL ${level.id + 1}`, "primary block", h_.next),
    button("MAP", "ghost block small", h_.map));
  screens.show(h("div", { class: "screen" }, panel));
}

export function levelFailed(screens: Screens, r: RunResult, progress: number[], h_: { retry(): void; map(): void; hint?: () => void }): void {
  const level = getLevel(r.level!);
  const puzzle = Boolean(level.queue);
  const panel = h("div", { class: "panel result" },
    h("h2", {}, puzzle ? "Not quite!" : r.reason === "drops" ? "Out of drops!" : "Jar's full!"),
    h("div", { class: "msg" }, puzzle
      ? `${level.title ?? `Level ${level.id}`} · There's always a way. Try a different plan!`
      : `Level ${level.id} · So close! Here's how far you got:`),
    goalList(level, progress),
    button("TRY AGAIN", "primary block", h_.retry),
    h_.hint ? button(`${icon("play")}Show me how`, "teal block small", h_.hint) : null,
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
