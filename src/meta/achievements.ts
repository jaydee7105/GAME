// Achievements: long-term goals that reward players with jar styles.

import { Save } from "../core/save";
import { COUNT } from "../game/planets";

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  /** Planet tier shown as the badge, or an icon name. */
  badge: number | string;
  /** Current value and the target (for progress bars). */
  progress(): [number, number];
}

const s = () => Save.data.stats;
const disc = (t: number): [number, number] => [Save.isDiscovered(t) ? 1 : 0, 1];

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first", name: "First Contact", desc: "Merge two planets", badge: 1, progress: () => [Math.min(s().merges, 1), 1] },
  { id: "earth", name: "Home Sweet Home", desc: "Make the Earth", badge: 5, progress: () => disc(5) },
  { id: "saturn", name: "Lord of the Rings", desc: "Make Saturn", badge: 8, progress: () => disc(8) },
  { id: "jupiter", name: "Giant Leap", desc: "Make Jupiter", badge: 9, progress: () => disc(9) },
  { id: "sun", name: "Let There Be Light", desc: "Make the Sun", badge: 10, progress: () => disc(10) },
  { id: "supernova", name: "Supernova!", desc: "Merge two Suns", badge: "star", progress: () => [Math.min(s().supernovas, 1), 1] },
  { id: "chain3", name: "Chain Reaction", desc: "Set off a x3 chain", badge: "planet", progress: () => [Math.min(s().bestChain, 3), 3] },
  { id: "chain5", name: "Domino Effect", desc: "Set off a x5 chain", badge: "planet", progress: () => [Math.min(s().bestChain, 5), 5] },
  { id: "score1k", name: "Rising Star", desc: "Score 1,000 in Classic", badge: "trophy", progress: () => [Math.min(Save.data.best, 1000), 1000] },
  { id: "score3k", name: "Star Power", desc: "Score 3,000 in Classic", badge: "trophy", progress: () => [Math.min(Save.data.best, 3000), 3000] },
  { id: "score6k", name: "Superstar", desc: "Score 6,000 in Classic", badge: "trophy", progress: () => [Math.min(Save.data.best, 6000), 6000] },
  { id: "merges500", name: "Busy Universe", desc: "Merge 500 planets", badge: 3, progress: () => [Math.min(s().merges, 500), 500] },
  { id: "merges5k", name: "Cosmic Architect", desc: "Merge 5,000 planets", badge: 6, progress: () => [Math.min(s().merges, 5000), 5000] },
  { id: "games25", name: "Regular Visitor", desc: "Finish 25 games", badge: "planet", progress: () => [Math.min(s().games, 25), 25] },
  { id: "streak3", name: "Habit Forming", desc: "Play the Daily Challenge 3 days in a row", badge: "flame", progress: () => [Math.min(Save.liveStreak(), 3), 3] },
  { id: "streak7", name: "Weekly Ritual", desc: "Play the Daily Challenge 7 days in a row", badge: "flame", progress: () => [Math.min(Save.liveStreak(), 7), 7] },
  { id: "level10", name: "Belt Graduate", desc: "Clear Adventure level 10", badge: 0, progress: () => [Math.min(Save.data.adventure.unlocked - 1, 10), 10] },
  { id: "level50", name: "Halfway Home", desc: "Clear Adventure level 50", badge: 7, progress: () => [Math.min(Save.data.adventure.unlocked - 1, 50), 50] },
  { id: "level100", name: "Master of the Cosmos", desc: "Clear all 100 Adventure levels", badge: 10, progress: () => [Math.min(Save.data.adventure.unlocked - 1, 100), 100] },
  { id: "stars100", name: "Star Collector", desc: "Earn 100 Adventure stars", badge: "star", progress: () => [Math.min(Save.totalStars(), 100), 100] },
  { id: "blackhole10", name: "Event Horizon", desc: "Use 10 Black Holes", badge: "blackhole", progress: () => [Math.min(s().blackHoles, 10), 10] },
  { id: "collector", name: "Complete Set", desc: "Discover every planet", badge: 10, progress: () => [Save.discoveredCount(), COUNT] },
];

/** Checks every achievement; returns the ones unlocked just now. */
export function checkAchievements(): Achievement[] {
  const fresh: Achievement[] = [];
  for (const a of ACHIEVEMENTS) {
    if (Save.data.achievements[a.id]) continue;
    const [v, max] = a.progress();
    if (v >= max) {
      Save.data.achievements[a.id] = Date.now();
      fresh.push(a);
    }
  }
  if (fresh.length) Save.save();
  return fresh;
}

export function unlockedCount(): number {
  return Object.keys(Save.data.achievements).length;
}
