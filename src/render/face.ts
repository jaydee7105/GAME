// Small, expressive cartoon faces drawn on top of planets.

export type Mood = "normal" | "happy" | "worried" | "sleepy" | "amazed";

const INK = "#1f1429";
const BLUSH = "rgba(255,107,140,0.38)";
const TONGUE = "#ff737f";

/** Animated face state (blinking, temporary expressions). */
export class FaceState {
  mood: Mood = "normal";
  private blinkIn = 1 + Math.random() * 4;
  private blinkLeft = 0;
  private happyLeft = 0;
  private amazedLeft = 0;

  cheer(seconds = 1.2): void {
    this.happyLeft = seconds;
  }

  surprise(seconds = 1.2): void {
    this.amazedLeft = seconds;
  }

  update(dt: number): void {
    this.happyLeft = Math.max(this.happyLeft - dt, 0);
    this.amazedLeft = Math.max(this.amazedLeft - dt, 0);
    if (this.blinkLeft > 0) {
      this.blinkLeft -= dt;
    } else {
      this.blinkIn -= dt;
      if (this.blinkIn <= 0) {
        this.blinkLeft = 0.12;
        this.blinkIn = 2 + Math.random() * 4;
      }
    }
  }

  get current(): Mood {
    if (this.amazedLeft > 0) return "amazed";
    if (this.happyLeft > 0) return "happy";
    return this.mood;
  }

  get blinking(): boolean {
    return this.blinkLeft > 0;
  }
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string): void {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(rx, 0.1), Math.max(ry, 0.1), 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

/** Draws a face centred at the origin of the current transform. */
export function drawFace(ctx: CanvasRenderingContext2D, r: number, mood: Mood, blinking: boolean): void {
  const ex = r * 0.33;
  const ey = -r * 0.04;
  const eh = r * 0.17;
  const ew = r * 0.13;
  const line = Math.max(r * 0.065, 1.4);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = INK;
  ctx.lineWidth = line;

  for (const side of [-1, 1]) ellipse(ctx, side * r * 0.52, r * 0.17, r * 0.12, r * 0.075, BLUSH);

  for (const side of [-1, 1]) {
    const cx = side * ex;
    const cy = ey;
    if (mood === "happy") {
      ctx.beginPath();
      ctx.arc(cx, cy + eh * 0.35, ew * 1.15, Math.PI * 1.12, Math.PI * 1.88);
      ctx.stroke();
    } else if (mood === "sleepy" || (blinking && mood !== "amazed")) {
      ctx.beginPath();
      ctx.arc(cx, cy - eh * 0.2, ew * 1.05, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    } else {
      const k = mood === "amazed" ? 1.18 : 1;
      ellipse(ctx, cx, cy, ew * k, eh * k, INK);
      ellipse(ctx, cx - ew * 0.3, cy - eh * 0.38, ew * 0.42, ew * 0.42, "#fff");
      ellipse(ctx, cx + ew * 0.35, cy + eh * 0.35, ew * 0.18, ew * 0.18, "rgba(255,255,255,0.8)");
      if (mood === "worried") {
        ctx.beginPath();
        ctx.moveTo(cx - side * ew * 1.3, cy - eh * 1.55);
        ctx.lineTo(cx + side * ew * 0.9, cy - eh * 1.9);
        ctx.lineWidth = line * 0.85;
        ctx.stroke();
        ctx.lineWidth = line;
      }
    }
  }

  const my = r * 0.2;
  switch (mood) {
    case "happy": {
      const w = r * 0.17;
      ctx.beginPath();
      ctx.moveTo(-w, my - w * 0.12);
      ctx.arc(0, my - w * 0.12, w, 0, Math.PI);
      ctx.closePath();
      ctx.fillStyle = INK;
      ctx.fill();
      ellipse(ctx, 0, my + w * 0.5, w * 0.55, w * 0.28, TONGUE);
      break;
    }
    case "worried": {
      const w = r * 0.15;
      ctx.beginPath();
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        const x = -w + 2 * w * t;
        const y = my + Math.sin(t * Math.PI * 2) * w * 0.18 + w * 0.15;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineWidth = line * 0.9;
      ctx.stroke();
      break;
    }
    case "amazed":
      ellipse(ctx, 0, my + r * 0.03, r * 0.07, r * 0.09, INK);
      break;
    case "sleepy":
      ctx.beginPath();
      ctx.moveTo(-r * 0.07, my + r * 0.03);
      ctx.lineTo(r * 0.07, my + r * 0.03);
      ctx.lineWidth = line * 0.9;
      ctx.stroke();
      break;
    default:
      ctx.beginPath();
      ctx.arc(0, my - r * 0.06, r * 0.12, Math.PI * 0.18, Math.PI * 0.82);
      ctx.stroke();
  }
}
