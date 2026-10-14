// Static description of every planet tier, from the smallest asteroid to the Sun.

export const COUNT = 11;
export const SUN = 10;
/** Tiers the dropper can hand out. */
export const DROPPABLE = 5;
/** Relative odds for each droppable tier. */
export const DROP_WEIGHTS = [26, 24, 20, 16, 14];

export const NAMES = [
  "Asteroid", "Moon", "Mercury", "Mars", "Venus", "Earth",
  "Neptune", "Uranus", "Saturn", "Jupiter", "Sun",
];

export const PLURALS = [
  "Asteroids", "Moons", "Mercurys", "Marses", "Venuses", "Earths",
  "Neptunes", "Uranuses", "Saturns", "Jupiters", "Suns",
];

export const KEYS = [
  "asteroid", "moon", "mercury", "mars", "venus", "earth",
  "neptune", "uranus", "saturn", "jupiter", "sun",
];

export const SATURN = 8;

/** Radius in world pixels (the jar is 600 px wide inside). */
export const RADII = [22, 30, 39, 49, 60, 72, 85, 99, 114, 129, 145];

/** Points for creating a planet of this tier by merging. */
export const POINTS = [0, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66];
export const SUPERNOVA_POINTS = 500;

/** Main colour of each body: particles and UI accents. */
export const COLORS = [
  "#8a7a6b", "#d9d8d4", "#b8977a", "#d9612e", "#f5cf7a",
  "#3f8fd8", "#3d63e0", "#8fe0e3", "#e8cf92", "#d9a46e", "#ffd34d",
];

/** Atmosphere glow colour (RGB 0..1) and strength. */
export const RIM_COLORS: [number, number, number][] = [
  [0.42, 0.38, 0.35], [0.77, 0.82, 1.0], [1.0, 0.85, 0.69], [1.0, 0.6, 0.42], [1.0, 0.9, 0.66],
  [0.49, 0.77, 1.0], [0.44, 0.61, 1.0], [0.72, 0.98, 1.0], [1.0, 0.91, 0.71], [1.0, 0.85, 0.66],
  [1.0, 0.7, 0.28],
];
export const RIM_STRENGTH = [0.0, 0.12, 0.08, 0.35, 0.65, 0.85, 0.75, 0.7, 0.45, 0.45, 0.0];

export const FACTS = [
  "Rocky leftovers from when the planets formed, 4.6 billion years ago.",
  "The Moon drifts about 3.8 cm farther away from Earth every year.",
  "A whole year on Mercury lasts just 88 Earth days.",
  "Mars has Olympus Mons, a volcano nearly three times taller than Everest.",
  "Venus spins backwards, and its day is longer than its year.",
  "Our home: the only world known to have life and open oceans.",
  "Neptune has the fastest winds in the Solar System, over 2,000 km/h.",
  "Uranus rolls around the Sun on its side, tipped over by 98 degrees.",
  "Saturn is so light it would float in a big enough bathtub.",
  "Jupiter's Great Red Spot is a storm wider than the whole Earth.",
  "About 1.3 million Earths could fit inside the Sun.",
];

/** Collision radius; the lumpy asteroid sits a little inside its sprite. */
export function collisionRadius(tier: number): number {
  return RADII[tier] * (tier === 0 ? 0.9 : 1.0);
}

export function rgb(c: [number, number, number], a = 1): string {
  return `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;
}
