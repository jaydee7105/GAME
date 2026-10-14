// Loads images and fonts before the game starts.

import { COUNT, KEYS } from "../game/planets";
import type { PlanetTextures } from "./planet-gl";

export interface Assets {
  planets: PlanetTextures[];
  ring: HTMLImageElement;
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load " + url));
    img.src = url;
  });
}

async function loadFont(): Promise<void> {
  try {
    const face = new FontFace("Fredoka", "url(assets/fonts/Fredoka.ttf)", { weight: "300 700" });
    document.fonts.add(await face.load());
    await Promise.all([300, 500, 600, 700].map((w) => document.fonts.load(`${w} 20px Fredoka`)));
  } catch (e) {
    console.warn("font failed", e);
  }
}

export async function loadAssets(onProgress?: (k: number) => void): Promise<Assets> {
  let done = 0;
  const total = COUNT * 2 + 3;
  const step = <T>(p: Promise<T>) => p.then((v) => {
    onProgress?.(++done / total);
    return v;
  });
  const fontP = step(loadFont());
  const planets = await Promise.all(KEYS.map(async (key) => {
    const [albedo, normal, spec] = await Promise.all([
      step(loadImage(`assets/planets/${key}.png`)),
      step(loadImage(`assets/planets/${key}_n.png`)),
      key === "earth" ? loadImage(`assets/planets/${key}_s.png`) : Promise.resolve(undefined),
    ]);
    return { albedo, normal, spec };
  }));
  const ring = await step(loadImage("assets/planets/saturn_ring.png"));
  await step(loadImage("assets/bg/space.jpg"));
  await fontP;
  return { planets, ring };
}
