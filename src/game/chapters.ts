// Adventure structure: 25 chapters of 20 levels. Each chapter brings in one
// new mechanic; the last chapters remix them. Shared by the game and by the
// level generator (tools/levelgen.ts), so it must not import level data.

export const LEVEL_COUNT = 500;
export const LEVELS_PER_CHAPTER = 20;

export type Mechanic =
  | "basics" | "lowgrav" | "rocks" | "dust" | "hidden" | "ice" | "shelves" | "clear"
  | "bouncy" | "slippery" | "wind" | "spinners" | "wells" | "heavy" | "ceiling" | "narrow";

export interface MechanicInfo {
  name: string;
  /** One-line explanation shown the first time it appears. */
  desc: string;
  icon: string;
}

export const MECHANICS: Record<Exclude<Mechanic, "basics">, MechanicInfo> = {
  lowgrav: { name: "Low gravity", desc: "Planets drift down slowly and bounce around more. Take your time.", icon: "feather" },
  rocks: { name: "Space rocks", desc: "Rocks are stuck in the jar. Planets bounce off them and pile up on top.", icon: "rock" },
  dust: { name: "Stardust", desc: "Merge planets on top of the stardust to collect it.", icon: "sparkle" },
  hidden: { name: "Clouds", desc: "Clouds hide the next planet. Plan with what you're holding!", icon: "cloud" },
  ice: { name: "Frozen planets", desc: "Frozen planets hang in place. Merge right next to one to crack the ice.", icon: "snow" },
  shelves: { name: "Shelves", desc: "Metal shelves hold planets up. Use them to sort your planets.", icon: "shelf" },
  clear: { name: "Marked planets", desc: "Planets with a target ring must be merged away to win.", icon: "target" },
  bouncy: { name: "Jelly planets", desc: "Everything is extra bouncy here. Drop gently!", icon: "bounce" },
  slippery: { name: "Ice rink", desc: "Planets slide and roll much further on the slippery ice.", icon: "slip" },
  wind: { name: "Solar wind", desc: "The wind blows planets from side to side. Watch the arrow.", icon: "wind" },
  spinners: { name: "Spinners", desc: "Spinning bars bat planets around. Time your drops!", icon: "spinner" },
  wells: { name: "Gravity wells", desc: "Swirling wells pull nearby planets in and hold them there.", icon: "well" },
  heavy: { name: "Heavy gravity", desc: "Planets fall fast and hit hard.", icon: "weight" },
  ceiling: { name: "Low ceiling", desc: "The danger line is lower, so there's less room to play with.", icon: "ceiling" },
  narrow: { name: "Narrow jar", desc: "Walls squeeze the jar. Plan every drop.", icon: "narrow" },
};

export interface Chapter {
  name: string;
  /** Planet tier used as the chapter's emblem. */
  icon: number;
  /** Mechanic introduced in this chapter ("basics" = none). */
  mechanic: Mechanic;
  /** Mechanics this chapter mixes in (including its own). */
  mix: Mechanic[];
}

export const CHAPTERS: Chapter[] = [
  { name: "Asteroid Belt", icon: 0, mechanic: "basics", mix: [] },
  { name: "Lunar Orbit", icon: 1, mechanic: "lowgrav", mix: ["lowgrav"] },
  { name: "Mercury Craters", icon: 2, mechanic: "rocks", mix: ["rocks"] },
  { name: "Stardust Nebula", icon: 4, mechanic: "dust", mix: ["dust", "rocks"] },
  { name: "Venus Clouds", icon: 4, mechanic: "hidden", mix: ["hidden", "dust"] },
  { name: "Comet Ice", icon: 7, mechanic: "ice", mix: ["ice", "rocks"] },
  { name: "Space Station", icon: 5, mechanic: "shelves", mix: ["shelves", "dust"] },
  { name: "Debris Field", icon: 3, mechanic: "clear", mix: ["clear", "rocks", "ice"] },
  { name: "Jelly Nebula", icon: 4, mechanic: "bouncy", mix: ["bouncy", "shelves"] },
  { name: "Ice Giants", icon: 6, mechanic: "slippery", mix: ["slippery", "ice", "clear"] },
  { name: "Solar Wind", icon: 10, mechanic: "wind", mix: ["wind", "dust"] },
  { name: "Ring World", icon: 8, mechanic: "spinners", mix: ["spinners", "clear"] },
  { name: "Gravity Wells", icon: 9, mechanic: "wells", mix: ["wells", "dust", "rocks"] },
  { name: "Jupiter's Pull", icon: 9, mechanic: "heavy", mix: ["heavy", "shelves", "ice"] },
  { name: "Crowded Sky", icon: 5, mechanic: "ceiling", mix: ["ceiling", "clear", "dust"] },
  { name: "The Narrows", icon: 6, mechanic: "narrow", mix: ["narrow", "rocks", "hidden"] },
  { name: "Meteor Shower", icon: 2, mechanic: "basics", mix: ["rocks", "dust", "heavy"] },
  { name: "Frozen Moons", icon: 1, mechanic: "basics", mix: ["lowgrav", "ice", "clear"] },
  { name: "Storm Giant", icon: 9, mechanic: "basics", mix: ["wind", "heavy", "shelves"] },
  { name: "Asteroid Mines", icon: 0, mechanic: "basics", mix: ["clear", "rocks", "shelves", "ice"] },
  { name: "Orbital Rings", icon: 8, mechanic: "basics", mix: ["spinners", "dust", "slippery"] },
  { name: "Dark Side", icon: 1, mechanic: "basics", mix: ["hidden", "wells", "lowgrav"] },
  { name: "Nova Factory", icon: 7, mechanic: "basics", mix: ["bouncy", "spinners", "narrow"] },
  { name: "Event Horizon", icon: 9, mechanic: "basics", mix: ["wells", "slippery", "ceiling", "clear"] },
  { name: "Solar Core", icon: 10, mechanic: "basics", mix: ["wind", "spinners", "ice", "dust", "wells", "rocks"] },
];

export function chapterOf(levelId: number): number {
  return Math.min(Math.floor((levelId - 1) / LEVELS_PER_CHAPTER), CHAPTERS.length - 1);
}
