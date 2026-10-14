// Persistent player data: settings, records, stats, discoveries and the
// in-progress run. Stored in localStorage (app-private inside the Android app).

import { COUNT } from "../game/planets";
import { Emitter } from "./events";
import { hashString } from "./rng";

const KEY = "planet-drop/save/v1";

export type SettingKey = "music" | "sfx" | "haptics" | "faces" | "guide" | "reminders";

export interface Stats {
  games: number;
  merges: number;
  supernovas: number;
  drops: number;
  seconds: number;
  blackHoles: number;
  shakes: number;
  revives: number;
  bestChain: number;
  levelsWon: number;
}

/** Ad pacing state (see monetization/config.ts). */
export interface AdState {
  /** Finished runs and levels, for the new-player grace period and pacing. */
  finished: number;
  /** `finished` value when the last interstitial was shown. */
  lastAt: number;
  /** Epoch ms of the last interstitial. */
  lastTime: number;
  shown: number;
}

export interface SaveData {
  settings: Record<SettingKey, boolean>;
  best: number;
  dailyBest: Record<string, number>;
  dailyStreak: number;
  dailyLast: string;
  discovered: boolean[];
  created: number[];
  stats: Stats;
  tutorialDone: boolean;
  snapshot: Snapshot | null;
  /** Adventure: highest unlocked level (1-based) and stars per level. */
  adventure: { unlocked: number; stars: Record<string, number> };
  achievements: Record<string, number>;
  theme: string;
  ads: AdState;
  review: { asked: number; last: number };
  reminderAsked: boolean;
}

export interface PlanetSnap {
  t: number; x: number; y: number; r: number; vx: number; vy: number; w: number;
  /** Adventure: ice layers and marked flag. */
  i?: number; m?: number;
}

export interface Snapshot {
  mode: Mode;
  date: string;
  score: number;
  current: number;
  next: number;
  blackHoles: number;
  shakes: number;
  highest: number;
  merges: number;
  drops: number;
  supernovas: number;
  bestChain: number;
  elapsed: number;
  rng: number;
  planets: PlanetSnap[];
  level?: number;
  revived?: boolean;
  dropsLeft?: number;
  goals?: number[];
  /** Indexes of the stardust already collected. */
  dustTaken?: number[];
}

export type Mode = "classic" | "daily" | "adventure";

function defaults(): SaveData {
  return {
    settings: { music: true, sfx: true, haptics: true, faces: true, guide: true, reminders: false },
    best: 0,
    dailyBest: {},
    dailyStreak: 0,
    dailyLast: "",
    discovered: new Array(COUNT).fill(false),
    created: new Array(COUNT).fill(0),
    stats: { games: 0, merges: 0, supernovas: 0, drops: 0, seconds: 0, blackHoles: 0, shakes: 0, revives: 0, bestChain: 0, levelsWon: 0 },
    tutorialDone: false,
    snapshot: null,
    adventure: { unlocked: 1, stars: {} },
    achievements: {},
    theme: "classic",
    ads: { finished: 0, lastAt: 0, lastTime: 0, shown: 0 },
    review: { asked: 0, last: 0 },
    reminderAsked: false,
  };
}

export function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

/** A stable seed for a day's challenge. */
export function dailySeed(date = today()): number {
  return hashString("planet-drop-daily-" + date);
}

class SaveStore extends Emitter<{ settings: [] }> {
  data: SaveData = defaults();
  private dirty = false;

  load(): void {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      const d = defaults();
      this.data = {
        ...d,
        ...parsed,
        settings: { ...d.settings, ...(parsed.settings ?? {}) },
        stats: { ...d.stats, ...(parsed.stats ?? {}) },
        adventure: { ...d.adventure, ...(parsed.adventure ?? {}), stars: { ...(parsed.adventure?.stars ?? {}) } },
        achievements: { ...(parsed.achievements ?? {}) },
        ads: { ...d.ads, ...(parsed.ads ?? {}) },
        review: { ...d.review, ...(parsed.review ?? {}) },
        discovered: d.discovered.map((_, i) => Boolean(parsed.discovered?.[i])),
        created: d.created.map((_, i) => Number(parsed.created?.[i] ?? 0)),
      };
    } catch {
      console.warn("Save data was unreadable; starting fresh.");
    }
  }

  save(): void {
    this.dirty = false;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn("Could not save", e);
    }
  }

  flush(): void {
    if (this.dirty) this.save();
  }

  setting(key: SettingKey): boolean {
    return this.data.settings[key];
  }

  setSetting(key: SettingKey, value: boolean): void {
    this.data.settings[key] = value;
    this.save();
    this.emit("settings");
  }

  isDiscovered(tier: number): boolean {
    return this.data.discovered[tier];
  }

  discoveredCount(): number {
    return this.data.discovered.filter(Boolean).length;
  }

  /** Counts a merged planet. Returns true the first time it is ever made. */
  discover(tier: number): boolean {
    this.data.created[tier]++;
    this.dirty = true;
    if (this.data.discovered[tier]) return false;
    this.data.discovered[tier] = true;
    this.save();
    return true;
  }

  /** Marks a planet as seen (dropped) without counting it as made. */
  markSeen(tier: number): boolean {
    if (this.data.discovered[tier]) return false;
    this.data.discovered[tier] = true;
    this.save();
    return true;
  }

  addStat(key: keyof Stats, amount = 1): void {
    this.data.stats[key] += amount;
    this.dirty = true;
  }

  todaysDailyBest(): number {
    return this.data.dailyBest[today()] ?? 0;
  }

  /** Streak still alive today (0 if a day was missed). */
  liveStreak(): number {
    if (!this.data.dailyLast) return 0;
    return dayNumber(today()) - dayNumber(this.data.dailyLast) <= 1 ? this.data.dailyStreak : 0;
  }

  /** Records a finished run. Returns true if it set a new best for its mode. */
  recordGame(mode: Mode, score: number, seconds: number): boolean {
    const d = this.data;
    d.stats.games++;
    d.stats.seconds += seconds;
    let newBest = false;
    if (mode === "daily") {
      const key = today();
      if (score > (d.dailyBest[key] ?? 0)) {
        newBest = score > 0;
        d.dailyBest[key] = score;
      }
      if (d.dailyLast !== key) {
        d.dailyStreak = this.liveStreak() + 1;
        d.dailyLast = key;
      }
      // Keep only the last 60 days.
      const keys = Object.keys(d.dailyBest).sort();
      for (const k of keys.slice(0, Math.max(0, keys.length - 60))) delete d.dailyBest[k];
    } else if (mode === "classic" && score > d.best) {
      newBest = score > 0;
      d.best = score;
    }
    this.save();
    return newBest;
  }

  levelStars(level: number): number {
    return this.data.adventure.stars[level] ?? 0;
  }

  totalStars(): number {
    return Object.values(this.data.adventure.stars).reduce((a, b) => a + b, 0);
  }

  /** Records a won level; returns true if the stars improved. */
  recordLevel(level: number, stars: number): boolean {
    const a = this.data.adventure;
    const before = a.stars[level] ?? 0;
    if (stars > before) a.stars[level] = stars;
    a.unlocked = Math.max(a.unlocked, level + 1);
    this.data.stats.levelsWon++;
    this.save();
    return stars > before;
  }

  setSnapshot(s: Snapshot | null): void {
    this.data.snapshot = s;
    this.save();
  }

  resetProgress(): void {
    const keep = this.data.settings;
    this.data = defaults();
    this.data.settings = keep;
    this.save();
  }
}

export const Save = new SaveStore();
