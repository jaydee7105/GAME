// Tiny DOM helpers.

import { Sound } from "../core/audio";
import { buzz } from "../core/platform";

type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K, attrs: Record<string, unknown> = {}, ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = String(v);
    else if (k === "html") el.innerHTML = String(v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v as EventListener);
    else el.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c);
  }
  return el;
}

/** A chunky game button with click sound and haptics. */
export function button(label: string, kind = "primary", onClick?: () => void, extraClass = ""): HTMLButtonElement {
  const b = h("button", { class: `btn ${kind} ${extraClass}`.trim(), type: "button", html: label });
  b.addEventListener("pointerdown", () => {
    Sound.play("click", 1, -4);
    buzz(8, 0.25);
  });
  if (onClick) b.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

export function formatScore(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** Plays a CSS "pop" entrance on an element. */
export function popIn(el: HTMLElement, delay = 0): void {
  el.animate(
    [{ transform: "scale(0.6)", opacity: 0 }, { transform: "scale(1.06)", opacity: 1, offset: 0.7 }, { transform: "scale(1)", opacity: 1 }],
    { duration: 450, delay: delay * 1000, easing: "cubic-bezier(.2,.8,.3,1)", fill: "backwards" },
  );
}
