// Tiny time-based tweening for visual properties.

export type Ease = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inQuad: (t: number) => t * t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t: number) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  inBack: (t: number) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return c3 * t * t * t - c1 * t * t;
  },
  outElastic: (t: number) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
};

interface Tween {
  target: Record<string, number>;
  from: Record<string, number>;
  to: Record<string, number>;
  duration: number;
  delay: number;
  time: number;
  ease: Ease;
  done?: () => void;
}

export class Tweens {
  private list: Tween[] = [];

  to<T extends object>(target: T, to: Partial<Record<keyof T, number>>, duration: number,
    easing: Ease = ease.outQuad, delay = 0): Promise<void> {
    return new Promise((resolve) => {
      this.list.push({
        target: target as unknown as Record<string, number>,
        from: {},
        to: to as Record<string, number>,
        duration: Math.max(duration, 1e-4),
        delay,
        time: 0,
        ease: easing,
        done: resolve,
      });
    });
  }

  /** Waits for a number of seconds of game time. */
  wait(seconds: number): Promise<void> {
    return this.to({ t: 0 }, { t: 1 }, seconds);
  }

  update(dt: number): void {
    if (this.list.length === 0) return;
    const finished: Tween[] = [];
    for (const tw of this.list) {
      tw.time += dt;
      if (tw.time < tw.delay) continue;
      if (Object.keys(tw.from).length === 0) {
        for (const k in tw.to) tw.from[k] = tw.target[k];
      }
      const p = Math.min((tw.time - tw.delay) / tw.duration, 1);
      const e = tw.ease(p);
      for (const k in tw.to) tw.target[k] = tw.from[k] + (tw.to[k] - tw.from[k]) * e;
      if (p >= 1) finished.push(tw);
    }
    if (finished.length) {
      this.list = this.list.filter((t) => !finished.includes(t));
      for (const f of finished) f.done?.();
    }
  }

  clear(): void {
    this.list = [];
  }
}
