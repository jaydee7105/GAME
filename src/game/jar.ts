// The glass jar: geometry shared by physics, rendering and the aim guide.

export const INNER_W = 600;
export const INNER_H = 760;
export const CORNER = 46;
export const GLASS = 10;
/** Planets resting above this line (relative to the jar top) end the game. */
export const LINE_OFFSET = 6;

export interface Rect { x: number; y: number; w: number; h: number }

export class Jar {
  rect: Rect = { x: 0, y: 0, w: INNER_W, h: INNER_H };
  /** 0..1, drives the overflow warning. */
  danger = 0;

  get left(): number { return this.rect.x; }
  get right(): number { return this.rect.x + this.rect.w; }
  get top(): number { return this.rect.y; }
  get bottom(): number { return this.rect.y + this.rect.h; }
  get centerX(): number { return this.rect.x + this.rect.w / 2; }

  lineY(): number {
    return this.rect.y + LINE_OFFSET;
  }

  /** Points along a rounded bottom corner, wall to floor (0 = left, 1 = right). */
  cornerArc(side: 0 | 1, steps = 10): [number, number][] {
    const pts: [number, number][] = [];
    if (side === 0) {
      const cx = this.left + CORNER, cy = this.bottom - CORNER;
      for (let i = 0; i <= steps; i++) {
        const a = Math.PI - (Math.PI / 2) * (i / steps);
        pts.push([cx + Math.cos(a) * CORNER, cy + Math.sin(a) * CORNER]);
      }
    } else {
      const cx = this.right - CORNER, cy = this.bottom - CORNER;
      for (let i = 0; i <= steps; i++) {
        const a = (Math.PI / 2) * (i / steps);
        pts.push([cx + Math.cos(a) * CORNER, cy + Math.sin(a) * CORNER]);
      }
    }
    return pts;
  }

  /** Inner outline from the top-left, round the bottom, up to the top-right. */
  outline(inset = 0, steps = 14): [number, number][] {
    const x0 = this.left + inset, x1 = this.right - inset;
    const y0 = this.top + inset, y1 = this.bottom - inset;
    const k = CORNER - inset;
    const pts: [number, number][] = [[x0, y0]];
    for (let i = 0; i <= steps; i++) {
      const a = Math.PI - (Math.PI / 2) * (i / steps);
      pts.push([x0 + k + Math.cos(a) * k, y1 - k + Math.sin(a) * k]);
    }
    for (let i = 0; i <= steps; i++) {
      const a = Math.PI / 2 - (Math.PI / 2) * (i / steps);
      pts.push([x1 - k + Math.cos(a) * k, y1 - k + Math.sin(a) * k]);
    }
    pts.push([x1, y0]);
    return pts;
  }

  /** Lowest y a circle of radius r dropped at x can rest at, ignoring planets. */
  floorFor(x: number, r: number): number {
    let y = this.bottom - r;
    const k = CORNER - r;
    if (k > 0) {
      const cy = this.bottom - CORNER;
      for (const cx of [this.left + CORNER, this.right - CORNER]) {
        const dx = x - cx;
        const inCorner = cx < this.centerX ? x < cx : x > cx;
        if (inCorner && Math.abs(dx) <= k) y = Math.min(y, cy + Math.sqrt(k * k - dx * dx));
      }
    }
    return y;
  }
}
