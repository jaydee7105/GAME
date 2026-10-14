// Awards screen: achievements and the jar styles they unlock.

import { Sound } from "../core/audio";
import { Save } from "../core/save";
import { ACHIEVEMENTS, Achievement, unlockedCount } from "../meta/achievements";
import { THEMES, getTheme } from "../meta/themes";
import { iconUrl } from "../render/sprites";
import { formatScore, h } from "./dom";
import { icon } from "./icons";
import type { Screens } from "./screens";

export function badge(a: Achievement, locked = false): HTMLElement {
  if (typeof a.badge === "number") return h("img", { src: iconUrl(a.badge, { face: !locked && Save.setting("faces"), locked }), alt: "" });
  return h("i", { html: icon(a.badge) });
}

export function awardsScreen(screens: Screens, tab: "achievements" | "styles" = "achievements"): void {
  const body = h("div", { class: "col" });
  const tabs = h("div", { class: "tabs" });
  const el = h("div", { class: "screen solid" },
    screens.topbar("Awards"),
    h("div", { class: "subtitle" }, `${unlockedCount()} of ${ACHIEVEMENTS.length} unlocked`),
    tabs,
    h("div", { class: "scroll" }, body));
  el.style.paddingTop = `${screens.safeTop + 28}px`;

  const show = (which: "achievements" | "styles") => {
    tabs.replaceChildren(
      tabButton("Achievements", which === "achievements", () => show("achievements")),
      tabButton("Jar styles", which === "styles", () => show("styles")));
    body.replaceChildren(which === "achievements" ? achievementList() : styleGrid(() => show("styles")));
  };
  show(tab);
  screens.push(el);
}

function tabButton(label: string, active: boolean, onClick: () => void): HTMLButtonElement {
  const b = h("button", { class: `tab${active ? " active" : ""}`, type: "button" }, label);
  b.addEventListener("click", () => {
    Sound.play("click", 1, -4);
    onClick();
  });
  return b;
}

function achievementList(): HTMLElement {
  const list = h("div", { class: "awards" });
  const sorted = [...ACHIEVEMENTS].sort((a, b) => Number(Boolean(Save.data.achievements[b.id])) - Number(Boolean(Save.data.achievements[a.id])));
  for (const a of sorted) {
    const done = Boolean(Save.data.achievements[a.id]);
    const [v, max] = a.progress();
    const reward = THEMES.find((t) => t.unlock === a.id);
    list.append(h("div", { class: `award${done ? " done" : ""}` },
      h("div", { class: "badge" }, badge(a, !done)),
      h("div", { class: "info" },
        h("b", {}, a.name),
        h("span", {}, a.desc),
        done ? null : h("div", { class: "bar" }, h("i", { style: { width: `${Math.round((v / max) * 100)}%` } })),
        done ? null : h("small", {}, `${formatScore(v)} / ${formatScore(max)}`),
        reward ? h("em", {}, `Reward: ${reward.name} jar`) : null),
      done ? h("div", { class: "tick", html: "✓" }) : null));
  }
  return list;
}

function styleGrid(refresh: () => void): HTMLElement {
  const grid = h("div", { class: "styles" });
  for (const t of THEMES) {
    const unlocked = !t.unlock || Boolean(Save.data.achievements[t.unlock]);
    const selected = Save.data.theme === t.id;
    const need = t.unlock ? ACHIEVEMENTS.find((a) => a.id === t.unlock) : undefined;
    const jar = h("div", { class: "mini-jar", style: {
      borderColor: t.lip,
      background: `linear-gradient(${t.fillTop}, ${t.fillBottom})`,
      boxShadow: `0 0 22px ${t.glow}, inset 0 0 0 3px ${t.edge}`,
    } }, h("img", { src: iconUrl(5, { face: false, locked: !unlocked }), alt: "" }));
    const card = h("button", { class: `style-card${selected ? " selected" : ""}${unlocked ? "" : " locked"}`, type: "button" },
      jar, h("b", {}, t.name), h("small", {}, selected ? "In use" : unlocked ? "Tap to use" : need ? `Unlock: ${need.name}` : ""));
    card.addEventListener("click", () => {
      if (!unlocked) {
        card.animate([{ transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "none" }], { duration: 200 });
        return;
      }
      Sound.play("powerup", 1.2, -6);
      Save.data.theme = getTheme(t.id).id;
      Save.save();
      refresh();
    });
    grid.append(card);
  }
  return grid;
}
