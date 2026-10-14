// Jar styles: cosmetic rewards unlocked through achievements.

export interface JarTheme {
  id: string;
  name: string;
  /** Achievement that unlocks it (none = always available). */
  unlock?: string;
  /** Outer glass stroke, bright lip, inner line, rim caps. */
  edge: string;
  lip: string;
  inner: string;
  cap: string;
  /** Glass fill, top and bottom. */
  fillTop: string;
  fillBottom: string;
  /** Soft glow drawn behind the glass edge. */
  glow: string;
}

export const THEMES: JarTheme[] = [
  {
    id: "classic", name: "Starlight Glass",
    edge: "rgba(158,179,255,0.28)", lip: "rgba(204,219,255,0.55)", inner: "rgba(255,255,255,0.22)", cap: "rgba(217,230,255,0.85)",
    fillTop: "rgba(107,128,255,0.05)", fillBottom: "rgba(107,128,255,0.13)", glow: "rgba(0,0,0,0)",
  },
  {
    id: "neon", name: "Neon", unlock: "chain5",
    edge: "rgba(63,224,197,0.35)", lip: "rgba(120,255,230,0.9)", inner: "rgba(200,255,245,0.35)", cap: "rgba(150,255,235,0.95)",
    fillTop: "rgba(63,224,197,0.04)", fillBottom: "rgba(63,224,197,0.12)", glow: "rgba(63,224,197,0.35)",
  },
  {
    id: "gold", name: "Golden Rings", unlock: "saturn",
    edge: "rgba(255,200,90,0.32)", lip: "rgba(255,215,120,0.85)", inner: "rgba(255,240,200,0.3)", cap: "rgba(255,225,140,0.95)",
    fillTop: "rgba(255,190,80,0.04)", fillBottom: "rgba(255,170,60,0.12)", glow: "rgba(255,190,80,0.22)",
  },
  {
    id: "rose", name: "Rose Quartz", unlock: "stars100",
    edge: "rgba(255,130,180,0.32)", lip: "rgba(255,170,205,0.85)", inner: "rgba(255,220,235,0.3)", cap: "rgba(255,190,215,0.95)",
    fillTop: "rgba(255,111,168,0.04)", fillBottom: "rgba(255,111,168,0.13)", glow: "rgba(255,111,168,0.25)",
  },
  {
    id: "ice", name: "Comet Ice", unlock: "level50",
    edge: "rgba(190,235,255,0.4)", lip: "rgba(230,250,255,0.95)", inner: "rgba(255,255,255,0.4)", cap: "rgba(240,252,255,1)",
    fillTop: "rgba(170,225,255,0.07)", fillBottom: "rgba(200,240,255,0.18)", glow: "rgba(170,225,255,0.3)",
  },
  {
    id: "aurora", name: "Aurora", unlock: "streak7",
    edge: "rgba(120,255,170,0.32)", lip: "rgba(160,140,255,0.9)", inner: "rgba(170,255,210,0.3)", cap: "rgba(190,170,255,0.95)",
    fillTop: "rgba(123,108,255,0.06)", fillBottom: "rgba(63,224,150,0.14)", glow: "rgba(123,108,255,0.3)",
  },
  {
    id: "solar", name: "Solar Flare", unlock: "sun",
    edge: "rgba(255,140,50,0.4)", lip: "rgba(255,200,80,0.95)", inner: "rgba(255,230,160,0.35)", cap: "rgba(255,210,100,1)",
    fillTop: "rgba(255,120,40,0.05)", fillBottom: "rgba(255,90,30,0.15)", glow: "rgba(255,130,40,0.4)",
  },
  {
    id: "galaxy", name: "Galaxy", unlock: "score6k",
    edge: "rgba(200,120,255,0.35)", lip: "rgba(240,180,255,0.9)", inner: "rgba(255,220,255,0.3)", cap: "rgba(230,190,255,1)",
    fillTop: "rgba(160,80,255,0.07)", fillBottom: "rgba(80,140,255,0.16)", glow: "rgba(170,90,255,0.35)",
  },
];

export function getTheme(id: string): JarTheme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
