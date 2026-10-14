// The playfield: physics, jar, dropper, planets, merging, scoring, power-ups
// and game over. Pure game logic; drawing lives in render/.

import { Body, Box, Chain, Circle, Polygon, Vec2, World } from "planck";
import { Sound } from "../core/audio";
import { Emitter } from "../core/events";
import { buzz } from "../core/platform";
import { Rng } from "../core/rng";
import { dailySeed, Mode, PlanetSnap, Save, Snapshot, today } from "../core/save";
import { ease, Tweens } from "../core/tween";
import { FaceState } from "../render/face";
import { Fx } from "./fx";
import { GLASS, INNER_H, INNER_W, Jar } from "./jar";
import { ICE1, ICE2, Level, MARKED, getLevel, starsFor } from "./levels";
import * as P from "./planets";

/** Pixels per physics metre. */
const PPM = 40;
const STEP = 1 / 60;
const GRAVITY = 1500;
const DROP_COOLDOWN = 0.42;
const CHAIN_WINDOW = 1.1;
const DANGER_AGE = 1.4;
const DANGER_GRACE = 3.0;

/** A fixed or spinning bar inside the jar (world coordinates). */
export interface BarObstacle { body: Body; x: number; y: number; len: number; angle: number; spin: number }
export const BAR_THICKNESS = 16;
/** A merge collects stardust within this distance of the new planet's edge. */
export const DUST_REACH = 34;

export interface RunResult {
  mode: Mode;
  score: number;
  highest: number;
  merges: number;
  drops: number;
  supernovas: number;
  bestChain: number;
  seconds: number;
  /** Adventure only. */
  level?: number;
  won?: boolean;
  stars?: number;
  dropsLeft?: number;
  reason?: FailReason;
}

/** Why a run stopped: the jar overflowed, or (Adventure) the drops ran out. */
export type FailReason = "overflow" | "drops";

type WorldEvents = {
  score: [score: number, gained: number];
  next: [tier: number];
  chain: [count: number, x: number, y: number];
  discovered: [tier: number];
  seen: [tier: number];
  powerups: [blackHoles: number, shakes: number];
  powerupEarned: [kind: "shake" | "blackHole", x: number, y: number];
  aiming: [active: boolean];
  supernova: [x: number, y: number];
  firstDrop: [];
  firstMerge: [];
  danger: [level: number];
  /** The run has stopped; the app may offer a revive before calling finish(). */
  fail: [reason: FailReason];
  gameOver: [result: RunResult];
  /** Adventure goals: progress per goal, and drops remaining. */
  goals: [progress: number[]];
  dropsLeft: [left: number];
  /** A level mechanic did something worth a sound or a hint. */
  thaw: [x: number, y: number];
  dust: [x: number, y: number, left: number];
  cleared: [x: number, y: number, left: number];
  levelComplete: [result: RunResult];
};

/** A planet: physical while in the jar, or a purely visual ghost while it animates away. */
export class Planet {
  tier: number;
  radius: number;
  x = 0;
  y = 0;
  angle = 0;
  body: Body | null = null;
  age = 0;
  merging = false;
  /** Visual scale and white flash, animated on spawn/merge. */
  scale = 1;
  flash = 0;
  alpha = 1;
  face = new FaceState();
  /** Collision radius currently applied (grows after a merge). */
  bodyRadius: number;
  /** Adventure: layers of ice holding it in place (0 = free). */
  ice = 0;
  /** Adventure: must be merged away to win. */
  marked = false;

  constructor(tier: number) {
    this.tier = tier;
    this.radius = P.RADII[tier];
    this.bodyRadius = P.collisionRadius(tier);
  }
}

export class GameWorld extends Emitter<WorldEvents> {
  readonly jar = new Jar();
  readonly fx = new Fx();
  readonly tweens = new Tweens();

  mode: Mode = "classic";
  score = 0;
  running = false;
  isOver = false;
  currentTier = 0;
  nextTier = 0;
  blackHoles = 0;
  shakes = 0;
  aimingBlackHole = false;
  autoplay = false;

  highest = 0;
  merges = 0;
  drops = 0;
  supernovas = 0;
  bestChain = 0;
  elapsed = 0;

  /** Adventure state. */
  level: Level | null = null;
  dropsLeft = 0;
  goalProgress: number[] = [];
  revived = false;
  failReason: FailReason = "overflow";
  /** Classic/Adventure only: nudge the dropper towards useful planets. */
  fairDrops = true;
  /** Level obstacles and pickups, in world coordinates. */
  rocks: { x: number; y: number; r: number }[] = [];
  bars: BarObstacle[] = [];
  wells: { x: number; y: number; r: number; s: number }[] = [];
  dust: { x: number; y: number; taken: boolean }[] = [];
  /** Current side wind, -1..1 times its strength (for drawing). */
  wind = 0;
  windStrength = 0;
  /** The next-planet preview is hidden (clouds). */
  hidden = false;
  cleared = 0;
  dustTaken = 0;
  private gravityScale = 1;
  private bounce = 0.12;
  private friction = 0.45;
  private obstacleBodies: Body[] = [];
  private settleTimer = -1;
  private won = false;

  planets: Planet[] = [];
  ghosts: Planet[] = [];

  /** Dropper state. */
  dropX = 360;
  dropTargetX = 360;
  dropY = 0;
  dropReady = false;
  dropScale = 1;
  dropFace = new FaceState();
  showGuide = true;

  shakeOffset = { x: 0, y: 0 };
  time = 0;

  private world = new World({ gravity: Vec2(0, GRAVITY / PPM) });
  private walls: Body | null = null;
  private rng = new Rng();
  private cooldown = 0;
  private chainCount = 0;
  private lastMergeTime = -10;
  private dangerTime = 0;
  private dangerSuppress = 0;
  private pressing = false;
  private shakeAmount = 0;
  private acc = 0;
  private autoTimer = 0;
  private impacts: { p: Planet; speed: number }[] = [];

  constructor() {
    super();
    this.world.on("begin-contact", (c) => {
      const a = c.getFixtureA().getBody(), b = c.getFixtureB().getBody();
      const pa = a.getUserData() as Planet | null, pb = b.getUserData() as Planet | null;
      const va = a.getLinearVelocity(), vb = b.getLinearVelocity();
      const speed = Math.hypot(va.x - vb.x, va.y - vb.y) * PPM;
      const p = pa && pb ? (pa.tier > pb.tier ? pa : pb) : pa ?? pb;
      if (p) this.impacts.push({ p, speed });
    });
  }

  // -------------------------------------------------------------------------
  // Layout
  // -------------------------------------------------------------------------
  layout(viewW: number, viewH: number, safeTop: number, safeBottom: number): void {
    const bottomBar = 196 + safeBottom;
    let jarBottom = viewH - bottomBar;
    const extra = Math.max(viewH - 1280 - safeTop - safeBottom, 0);
    jarBottom -= extra * 0.35;
    const x = (viewW - INNER_W) / 2;
    const dx = x - this.jar.rect.x, dy = jarBottom - INNER_H - this.jar.rect.y;
    this.jar.rect = { x, y: jarBottom - INNER_H, w: INNER_W, h: INNER_H };
    this.dropY = this.jar.top - 78;
    // Keep planets where they are relative to the jar.
    for (const p of this.planets) {
      if (p.body) {
        const pos = p.body.getPosition();
        p.body.setPosition(Vec2(pos.x + dx / PPM, pos.y + dy / PPM));
        p.x += dx;
        p.y += dy;
      }
    }
    this.dropTargetX += dx;
    this.dropX += dx;
    this.buildWalls();
    this.buildObstacles();
  }

  private buildWalls(): void {
    if (this.walls) this.world.destroyBody(this.walls);
    const j = this.jar;
    const m = (v: number) => v / PPM;
    const body = this.world.createBody();
    const opts = { friction: 0.35, restitution: 0.05 };
    const tall = j.rect.h + 2400, wall = 200;
    body.createFixture(new Box(m(wall / 2), m(tall / 2), Vec2(m(j.left - wall / 2), m(j.bottom - tall / 2)), 0), opts);
    body.createFixture(new Box(m(wall / 2), m(tall / 2), Vec2(m(j.right + wall / 2), m(j.bottom - tall / 2)), 0), opts);
    body.createFixture(new Box(m(j.rect.w / 2 + wall), m(wall / 2), Vec2(m(j.centerX), m(j.bottom + wall / 2)), 0), opts);
    for (const side of [0, 1] as const) {
      const arc = j.cornerArc(side);
      body.createFixture(new Chain(arc.map(([x, y]) => Vec2(m(x), m(y))), false), opts);
      const corner = Vec2(m(side ? j.right : j.left), m(j.bottom));
      for (let i = 0; i < arc.length - 1; i++) {
        body.createFixture(new Polygon([Vec2(m(arc[i][0]), m(arc[i][1])), Vec2(m(arc[i + 1][0]), m(arc[i + 1][1])), corner]), opts);
      }
    }
    this.walls = body;
  }

  /** Applies a level's physics rules (or the defaults when level is null). */
  private applyLevel(level: Level | null): void {
    const m = level?.mods ?? {};
    this.gravityScale = m.gravity ?? 1;
    this.bounce = m.bounce ?? 0.12;
    this.friction = m.slip ? 0.03 : 0.45;
    this.windStrength = m.wind ?? 0;
    this.wind = 0;
    this.hidden = Boolean(m.hidden);
    this.jar.lineOffset = m.ceiling ?? 0;
    this.world.setGravity(Vec2(0, (GRAVITY * this.gravityScale) / PPM));
    this.dust = (level?.dust ?? []).map(() => ({ x: 0, y: 0, taken: false }));
    this.cleared = 0;
    this.dustTaken = 0;
    this.buildObstacles();
  }

  /** (Re)creates rocks, bars and wells for the current level and jar position. */
  private buildObstacles(): void {
    const spinAngles = this.bars.map((b) => b.angle);
    for (const b of this.obstacleBodies) this.world.destroyBody(b);
    this.obstacleBodies = [];
    this.rocks = [];
    this.bars = [];
    this.wells = [];
    const l = this.level;
    if (!l) return;
    const j = this.jar;
    const wx = (fx: number) => j.left + fx * j.rect.w;
    const wy = (fy: number) => j.top + fy * j.rect.h;
    const m = (v: number) => v / PPM;
    const opts = { friction: 0.4, restitution: 0.1 };
    for (const [fx, fy, r] of l.rocks ?? []) {
      const x = wx(fx), y = wy(fy);
      const body = this.world.createBody({ position: Vec2(m(x), m(y)) });
      body.createFixture(new Circle(m(r)), opts);
      this.obstacleBodies.push(body);
      this.rocks.push({ x, y, r });
    }
    (l.bars ?? []).forEach(([fx, fy, len, angle, spin], i) => {
      const x = wx(fx), y = wy(fy);
      const a = spin ? spinAngles[i] ?? angle : angle;
      const def = { position: Vec2(m(x), m(y)), angle: a };
      const body = spin ? this.world.createKinematicBody(def) : this.world.createBody(def);
      const t = BAR_THICKNESS / 2;
      body.createFixture(new Box(m(len / 2), m(t)), opts);
      body.createFixture(new Circle(Vec2(m(-len / 2), 0), m(t)), opts);
      body.createFixture(new Circle(Vec2(m(len / 2), 0), m(t)), opts);
      if (spin) body.setAngularVelocity(spin);
      this.obstacleBodies.push(body);
      this.bars.push({ body, x, y, len, angle: a, spin });
    });
    for (const [fx, fy, r, s] of l.wells ?? []) this.wells.push({ x: wx(fx), y: wy(fy), r, s });
    (l.dust ?? []).forEach(([fx, fy], i) => {
      if (!this.dust[i]) this.dust[i] = { x: 0, y: 0, taken: false };
      this.dust[i].x = wx(fx);
      this.dust[i].y = wy(fy);
    });
  }

  // -------------------------------------------------------------------------
  // Run lifecycle
  // -------------------------------------------------------------------------
  start(mode: Mode, levelRef: number | Level = 1): void {
    this.clear();
    this.mode = mode;
    this.level = mode === "adventure" ? (typeof levelRef === "number" ? getLevel(levelRef) : levelRef) : null;
    this.applyLevel(this.level);
    this.rng = new Rng(mode === "daily" ? dailySeed() : undefined);
    this.revived = false;
    this.won = false;
    this.dropsLeft = this.level?.drops ?? 0;
    this.goalProgress = this.level ? this.level.goals.map(() => 0) : [];
    this.score = 0;
    this.blackHoles = 1;
    this.shakes = 1;
    this.highest = 0;
    this.merges = 0;
    this.drops = 0;
    this.supernovas = 0;
    this.bestChain = 0;
    this.elapsed = 0;
    this.currentTier = this.roll(true);
    this.nextTier = this.roll(true);
    if (this.level) {
      for (const [t, fx, fy, flags = 0] of this.level.start) {
        const r = P.RADII[t];
        const x = Math.min(Math.max(this.jar.left + fx * this.jar.rect.w, this.jar.left + r), this.jar.right - r);
        const y = Math.min(this.jar.top + fy * this.jar.rect.h, this.jar.bottom - r);
        const p = this.spawn(t, x, y, -1, flags & ICE2 ? 2 : flags & ICE1 ? 1 : 0);
        p.age = 3;
        p.marked = Boolean(flags & MARKED);
      }
    }
    this.begin();
  }

  restore(s: Snapshot): boolean {
    if (!s || !Array.isArray(s.planets)) return false;
    this.clear();
    this.mode = s.mode;
    this.score = s.score;
    this.currentTier = s.current;
    this.nextTier = s.next;
    this.blackHoles = s.blackHoles;
    this.shakes = s.shakes;
    this.highest = s.highest;
    this.merges = s.merges;
    this.drops = s.drops;
    this.supernovas = s.supernovas;
    this.bestChain = s.bestChain;
    this.elapsed = s.elapsed;
    this.rng = new Rng();
    this.rng.state = s.rng >>> 0;
    this.level = s.mode === "adventure" && s.level ? getLevel(s.level) : null;
    this.applyLevel(this.level);
    this.revived = Boolean(s.revived);
    this.won = false;
    this.dropsLeft = s.dropsLeft ?? this.level?.drops ?? 0;
    this.goalProgress = this.level ? this.level.goals.map((_, i) => s.goals?.[i] ?? 0) : [];
    if (this.level) {
      this.level.goals.forEach((g, i) => {
        if (g.kind === "clear") this.cleared = this.goalProgress[i];
      });
      for (const i of s.dustTaken ?? []) if (this.dust[i]) this.dust[i].taken = true;
      this.dustTaken = this.dust.filter((d) => d.taken).length;
    }
    for (const d of s.planets) {
      const p = this.spawn(d.t, d.x + this.jar.left, d.y + this.jar.top, -1, d.i ?? 0);
      p.marked = Boolean(d.m);
      p.body!.setAngle(d.r);
      p.body!.setLinearVelocity(Vec2(d.vx / PPM, d.vy / PPM));
      p.body!.setAngularVelocity(d.w);
      p.angle = d.r;
      p.age = 5;
    }
    this.begin();
    return true;
  }

  snapshot(): Snapshot | null {
    if (!this.running || this.isOver) return null;
    const r2 = (v: number) => Math.round(v * 100) / 100;
    const planets: PlanetSnap[] = this.planets.filter((p) => !p.merging && p.body).map((p) => {
      const v = p.body!.getLinearVelocity();
      return {
        t: p.tier, x: r2(p.x - this.jar.left), y: r2(p.y - this.jar.top), r: r2(p.angle),
        vx: r2(v.x * PPM), vy: r2(v.y * PPM), w: r2(p.body!.getAngularVelocity()),
        ...(p.ice ? { i: p.ice } : {}), ...(p.marked ? { m: 1 } : {}),
      };
    });
    return {
      mode: this.mode, date: today(), score: this.score, current: this.currentTier, next: this.nextTier,
      blackHoles: this.blackHoles, shakes: this.shakes, highest: this.highest, merges: this.merges,
      drops: this.drops, supernovas: this.supernovas, bestChain: this.bestChain, elapsed: this.elapsed,
      rng: this.rng.state, planets,
      level: this.level?.id, revived: this.revived, dropsLeft: this.dropsLeft, goals: this.goalProgress,
      dustTaken: this.dust.flatMap((d, i) => (d.taken ? [i] : [])),
    };
  }

  private begin(): void {
    this.running = true;
    this.isOver = false;
    this.aimingBlackHole = false;
    this.cooldown = 0;
    this.dangerTime = 0;
    this.dangerSuppress = 1;
    this.chainCount = 0;
    this.jar.danger = 0;
    this.dropTargetX = this.dropX = this.jar.centerX;
    this.readyDropper();
    this.emit("score", this.score, 0);
    this.emit("next", this.nextTier);
    this.emit("powerups", this.blackHoles, this.shakes);
    this.emit("goals", this.goalProgress);
    this.emit("dropsLeft", this.dropsLeft);
  }

  stop(): void {
    this.running = false;
    this.clear();
  }

  private clear(): void {
    for (const p of this.planets) if (p.body) this.world.destroyBody(p.body);
    this.planets = [];
    this.ghosts = [];
    this.fx.clear();
    this.tweens.clear();
    this.impacts = [];
    this.dropReady = false;
    this.isOver = false;
    this.jar.danger = 0;
    this.acc = 0;
    this.settleTimer = -1;
  }

  private roll(opening = false): number {
    // The first drops are always small so every run starts gently.
    const max = this.level ? this.level.maxDrop + 1 : P.DROPPABLE;
    const limit = Math.min(opening ? 3 : P.DROPPABLE, max);
    const weights = P.DROP_WEIGHTS.slice(0, limit);
    // Fair drops (like Block Blast's board-aware pieces): planets that sit on
    // top of the pile and can be matched right away become more likely, more
    // so when the jar is getting full. The daily challenge stays pure luck so
    // everyone gets the same sequence.
    if (this.fairDrops && this.mode !== "daily" && !opening) {
      const top = this.exposedTiers();
      const boost = 0.6 + 1.4 * this.jar.danger + (this.planets.length > 18 ? 0.4 : 0);
      for (const t of top) if (t < limit) weights[t] *= 1 + boost;
    }
    let x = this.rng.next() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < limit; i++) {
      x -= weights[i];
      if (x <= 0) return i;
    }
    return 0;
  }

  /** Tiers of planets on the surface of the pile (reachable by a drop). */
  private exposedTiers(): Set<number> {
    const out = new Set<number>();
    const cols = 8;
    for (let c = 0; c < cols; c++) {
      const x = this.jar.left + (c + 0.5) * (this.jar.rect.w / cols);
      let best: Planet | null = null;
      for (const p of this.planets) {
        if (Math.abs(p.x - x) < p.radius && (!best || p.y - p.radius < best.y - best.radius)) best = p;
      }
      if (best) out.add(best.tier);
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Input (world coordinates)
  // -------------------------------------------------------------------------
  pointerDown(x: number, y: number): void {
    if (!this.running || this.isOver) return;
    if (this.aimingBlackHole) {
      this.tryBlackHole(x, y);
      return;
    }
    this.pressing = true;
    this.dropTargetX = x;
  }

  pointerMove(x: number): void {
    if (this.pressing) this.dropTargetX = x;
  }

  pointerUp(x: number): void {
    if (!this.pressing) return;
    this.pressing = false;
    this.dropTargetX = x;
    this.drop();
  }

  cancelPress(): void {
    this.pressing = false;
  }

  private clampDrop(x: number): number {
    const r = P.RADII[this.currentTier] + 1;
    return Math.min(Math.max(x, this.jar.left + r), this.jar.right - r);
  }

  private readyDropper(): void {
    this.dropReady = true;
    this.dropFace = new FaceState();
    this.dropScale = 0.2;
    this.dropX = this.clampDrop(this.dropX);
    void this.tweens.to(this as GameWorld, { dropScale: 1 }, 0.32, ease.outBack);
  }

  drop(): void {
    if (!this.running || this.isOver || !this.dropReady || this.cooldown > 0) return;
    // Drop exactly where the finger is (inside the jar), not where smoothing has reached.
    this.dropX = this.dropTargetX = this.clampDrop(this.dropTargetX);
    const tier = this.currentTier;
    const p = this.spawn(tier, this.dropX, this.dropY);
    p.body!.setLinearVelocity(Vec2(0, 80 / PPM));
    p.body!.setAngularVelocity(this.rng.range(-0.6, 0.6));
    this.drops++;
    Save.addStat("drops");
    if (this.level) {
      this.dropsLeft--;
      this.emit("dropsLeft", this.dropsLeft);
      // Out of drops: let the jar settle, then see whether the goals were met.
      if (this.dropsLeft <= 0) this.settleTimer = 2.4;
    }
    if (Save.markSeen(tier)) this.emit("seen", tier);
    if (this.drops === 1) this.emit("firstDrop");
    Sound.play("drop", (0.95 + Math.random() * 0.11) * (1.15 - tier * 0.06), -3);
    buzz(10, 0.2);
    this.dropReady = false;
    // A chain is a cascade of merges set off by one drop.
    this.chainCount = 0;
    this.lastMergeTime = -10;
    this.currentTier = this.nextTier;
    this.nextTier = this.roll(this.drops < 3);
    this.emit("next", this.nextTier);
    this.cooldown = this.level && this.dropsLeft <= 0 ? Infinity : DROP_COOLDOWN;
  }

  private spawn(tier: number, x: number, y: number, growFrom = -1, ice = 0): Planet {
    const p = new Planet(tier);
    p.x = x;
    p.y = y;
    const body = this.world.createDynamicBody({
      position: Vec2(x / PPM, y / PPM),
      linearDamping: 0.08,
      angularDamping: 0.8,
      bullet: tier <= 1,
    });
    const start = growFrom > 0 ? P.collisionRadius(tier) * (growFrom / p.radius) : P.collisionRadius(tier);
    p.bodyRadius = start;
    body.createFixture(new Circle(start / PPM), { density: 1, friction: this.friction, restitution: this.bounce });
    body.setUserData(p);
    p.body = body;
    if (ice > 0) {
      p.ice = ice;
      body.setStatic();
    }
    p.face.mood = "normal";
    if (growFrom > 0) {
      p.scale = growFrom / p.radius;
      p.flash = 0.85;
      void this.tweens.to(p, { bodyRadius: P.collisionRadius(tier) }, 0.14, ease.outQuad);
      void this.tweens.to(p, { scale: 1 }, 0.5, ease.outElastic);
      void this.tweens.to(p, { flash: 0 }, 0.35);
    }
    this.planets.push(p);
    return p;
  }

  /** Takes a planet out of the physics world, keeping it as an animating ghost. */
  private detach(p: Planet): void {
    p.merging = true;
    if (p.body) {
      this.world.destroyBody(p.body);
      p.body = null;
    }
    this.planets = this.planets.filter((q) => q !== p);
    this.ghosts.push(p);
  }

  private removeGhost(p: Planet): void {
    this.ghosts = this.ghosts.filter((q) => q !== p);
  }

  // -------------------------------------------------------------------------
  // Simulation
  // -------------------------------------------------------------------------
  update(dt: number): void {
    this.time += dt;
    this.tweens.update(dt);
    this.fx.update(dt);
    this.updateShake(dt);
    for (const p of this.planets) p.face.update(dt);
    for (const p of this.ghosts) p.face.update(dt);
    this.dropFace.update(dt);
    // Snappy but smooth dropper follow.
    this.dropTargetX = this.clampDrop(this.dropTargetX);
    this.dropX += (this.dropTargetX - this.dropX) * (1 - Math.exp(-dt * 28));

    if (!this.running || this.isOver) return;
    this.elapsed += dt;
    if (this.cooldown > 0) {
      this.cooldown -= dt;
      if (this.cooldown <= 0 && !this.dropReady) this.readyDropper();
    }
    if (this.autoplay) {
      this.autoTimer -= dt;
      if (this.autoTimer <= 0 && this.dropReady) {
        this.autoTimer = 0.5 + Math.random() * 0.6;
        this.dropTargetX = this.jar.left + Math.random() * this.jar.rect.w;
        setTimeout(() => this.drop(), 250);
      }
    }

    this.acc = Math.min(this.acc + dt, STEP * 4);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.physicsStep();
      if (this.isOver) break;
    }
    this.syncBodies();

    // Adventure: out of drops - wait for the jar to settle, then judge.
    if (this.settleTimer > 0 && !this.isOver) {
      this.settleTimer -= dt;
      if (this.settleTimer <= 0 && !this.won) this.end("drops");
    }
  }

  private physicsStep(): void {
    for (const p of this.planets) {
      p.age += STEP;
      // Apply animated collision radius (growth after a merge).
      const f = p.body?.getFixtureList();
      if (f) {
        const shape = f.getShape() as Circle;
        const target = p.bodyRadius / PPM;
        if (Math.abs(shape.m_radius - target) > 1e-4) {
          shape.m_radius = target;
          p.body!.resetMassData();
        }
      }
    }
    this.applyFields();
    this.world.step(STEP, 10, 8);
    this.syncBodies();
    this.handleImpacts();
    this.checkMerges();
    this.checkDanger(STEP);
  }

  /** Wind and gravity wells. */
  private applyFields(): void {
    const g = (GRAVITY * this.gravityScale) / PPM;
    if (this.windStrength) {
      this.wind = Math.sin((this.elapsed * Math.PI * 2) / 7) * this.windStrength;
      this.world.setGravity(Vec2(this.wind * g, g));
    }
    if (!this.wells.length) return;
    for (const p of this.planets) {
      if (!p.body || p.ice) continue;
      for (const w of this.wells) {
        const dx = w.x - p.x, dy = w.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d >= w.r || d < 1) continue;
        const k = 1 - d / w.r;
        const mass = p.body.getMass();
        p.body.applyForceToCenter(Vec2((dx / d) * w.s * g * k * mass, (dy / d) * w.s * g * k * mass), true);
        // A little drag inside the well so planets settle instead of orbiting.
        const v = p.body.getLinearVelocity();
        p.body.setLinearVelocity(Vec2(v.x * (1 - 0.04 * k), v.y * (1 - 0.04 * k)));
      }
    }
  }

  private syncBodies(): void {
    for (const b of this.bars) if (b.spin) b.angle = b.body.getAngle();
    for (const p of this.planets) {
      if (!p.body) continue;
      const pos = p.body.getPosition();
      p.x = pos.x * PPM;
      p.y = pos.y * PPM;
      p.angle = p.body.getAngle();
    }
  }

  private handleImpacts(): void {
    for (const { p, speed } of this.impacts) {
      if (speed < 140 || p.merging) continue;
      const vol = Math.min(Math.max(-20 + ((speed - 140) / 760) * 16, -20), -4);
      Sound.play("thud", Math.min(Math.max(1.25 - p.tier * 0.06, 0.6), 1.3) * (0.94 + Math.random() * 0.12), vol, 0.05);
    }
    this.impacts = [];
  }

  private checkMerges(): void {
    const pairs: [Planet, Planet][] = [];
    for (let c = this.world.getContactList(); c; c = c.getNext()) {
      if (!c.isTouching()) continue;
      const a = c.getFixtureA().getBody().getUserData() as Planet | null;
      const b = c.getFixtureB().getBody().getUserData() as Planet | null;
      if (!a || !b || a.merging || b.merging || a.tier !== b.tier || a.ice || b.ice) continue;
      a.merging = b.merging = true;
      pairs.push([a, b]);
    }
    for (const [a, b] of pairs) this.merge(a, b);
  }

  private merge(a: Planet, b: Planet): void {
    const tier = a.tier;
    const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
    const va = a.body!.getLinearVelocity(), vb = b.body!.getLinearVelocity();
    const vx = (va.x + vb.x) / 2, vy = (va.y + vb.y) / 2;
    for (const p of [a, b]) {
      this.detach(p);
      // Old planets fly together into the merge point.
      void this.tweens.to(p, { x, y, scale: 0.75 }, 0.09, ease.inQuad).then(() => this.removeGhost(p));
    }

    this.chainCount = this.elapsed - this.lastMergeTime < CHAIN_WINDOW ? this.chainCount + 1 : 1;
    this.lastMergeTime = this.elapsed;
    this.bestChain = Math.max(this.bestChain, this.chainCount);
    if (this.bestChain > Save.data.stats.bestChain) Save.data.stats.bestChain = this.bestChain;
    this.merges++;
    Save.addStat("merges");
    if (this.merges === 1) this.emit("firstMerge");
    const marked = Number(a.marked) + Number(b.marked);

    if (tier === P.SUN) {
      this.supernova(x, y);
      this.mergeEffects(x, y, P.RADII[P.SUN], marked);
      return;
    }

    const nt = tier + 1;
    const np = this.spawn(nt, x, y, P.RADII[tier]);
    np.body!.setLinearVelocity(Vec2(vx * 0.4, vy * 0.4));
    np.age = 0.6;
    np.face.cheer(1.4);

    const mult = 1 + 0.25 * (this.chainCount - 1);
    const gained = Math.round(P.POINTS[nt] * mult);
    this.addScore(gained);
    this.highest = Math.max(this.highest, nt);

    // Feedback scales with planet size.
    const col = P.COLORS[nt];
    const big = nt / 10;
    this.fx.burst(x, y, col, 14 + nt * 3, 220 + 260 * big, 1 + big);
    this.fx.shockwave(x, y, P.RADII[nt] * 1.7, "rgba(255,255,255,0.8)", 5 + 6 * big);
    this.fx.text(x, y - P.RADII[nt] * 0.4, `+${gained}`, mult > 1 ? "#ffd34d" : "#ffffff", 30 + nt * 2);
    Sound.play(`merge_${nt}`, 1, -1, 0);
    buzz(12 + nt * 4, 0.25 + big * 0.6);
    if (nt >= 6) this.addShake(4 + nt * 1.6);
    if (this.chainCount >= 2) {
      this.emit("chain", this.chainCount, x, y);
      Sound.play("chain", 1 + 0.08 * Math.min(this.chainCount - 2, 6), -4);
    }
    if (Save.discover(nt)) this.emit("discovered", nt);
    this.mergeEffects(x, y, P.RADII[nt], marked, true);
    this.updateGoals(nt);
    if (nt === 8) this.award("shake", x, y);
    else if (nt === 9) this.award("blackHole", x, y);
  }

  /** Level mechanics triggered by a merge at (x, y) making a planet of radius r. */
  private mergeEffects(x: number, y: number, r: number, marked: number, deferGoals = false): void {
    if (!this.level) return;
    if (marked) {
      this.cleared += marked;
      this.emit("cleared", x, y, this.markedLeft());
    }
    for (const p of this.planets) {
      if (p.ice && Math.hypot(p.x - x, p.y - y) - p.radius - r < 30) this.crack(p);
    }
    for (const d of this.dust) {
      if (d.taken || Math.hypot(d.x - x, d.y - y) > r + DUST_REACH) continue;
      d.taken = true;
      this.dustTaken++;
      this.fx.burst(d.x, d.y, "#ffe27a", 26, 360, 1.1, 0.9);
      this.fx.shockwave(d.x, d.y, 70, "rgba(255,226,122,0.9)", 5);
      this.emit("dust", d.x, d.y, this.dust.length - this.dustTaken);
    }
    if (!deferGoals) this.updateGoals();
  }

  /** Marked planets still in the jar. */
  markedLeft(): number {
    return this.planets.filter((p) => p.marked && !p.merging).length;
  }

  /** Cracks one layer of ice; the planet is freed when none are left. */
  private crack(p: Planet): void {
    p.ice--;
    this.fx.burst(p.x, p.y, "#cdeeff", 22 + p.radius * 0.3, 300, 1.0, 0.8);
    this.fx.shockwave(p.x, p.y, p.radius * 1.5, "rgba(205,238,255,0.9)", 5);
    this.emit("thaw", p.x, p.y);
    if (p.ice > 0 || !p.body) return;
    p.body.setDynamic();
    p.body.setAwake(true);
    p.age = 0.5;
    p.face.surprise(1.2);
  }

  private supernova(x: number, y: number): void {
    this.supernovas++;
    Save.addStat("supernovas");
    this.addScore(P.SUPERNOVA_POINTS);
    this.emit("supernova", x, y);
    this.fx.burst(x, y, "#ffcc4d", 90, 900, 2.6, 1.2);
    this.fx.burst(x, y, "#ff66b3", 50, 650, 2.0, 1.0);
    this.fx.shockwave(x, y, 520, "rgba(255,230,153,0.95)", 22, 0.8);
    this.fx.shockwave(x, y, 340, "rgba(255,140,77,0.9)", 14, 0.6);
    this.fx.text(x, y - 40, "SUPERNOVA!", "#ffd34d", 64, 110, 1.6);
    this.fx.text(x, y + 30, `+${P.SUPERNOVA_POINTS}`, "#ffffff", 46, 90, 1.6);
    Sound.play("supernova", 1, 0, 0);
    buzz(220, 1);
    this.addShake(26);
    for (const p of this.planets) {
      if (!p.body) continue;
      const dx = p.x - x, dy = p.y - y;
      const dist = Math.max(Math.hypot(dx, dy), 1);
      const push = Math.max(1 - dist / 600, 0);
      const m = p.body.getMass();
      p.body.applyLinearImpulse(Vec2((dx / dist) * push * 900 * m / PPM, ((dy / dist) * push * 900 - 200 * push) * m / PPM), p.body.getWorldCenter(), true);
    }
    this.dangerSuppress = 2.5;
    this.award("blackHole", x, y - 70);
    this.award("shake", x, y);
  }

  private award(kind: "shake" | "blackHole", x: number, y: number): void {
    if (kind === "shake") this.shakes++;
    else this.blackHoles++;
    this.emit("powerups", this.blackHoles, this.shakes);
    this.emit("powerupEarned", kind, x, y);
    Sound.play("powerup", 1, -3);
  }

  private addScore(n: number): void {
    this.score += n;
    this.emit("score", this.score, n);
    this.updateGoals();
  }

  /** Recomputes Adventure goal progress and wins the level when all are met. */
  private updateGoals(madeTier = -1): void {
    if (!this.level || this.won) return;
    this.level.goals.forEach((g, i) => {
      if (g.kind === "make" && g.tier === madeTier) this.goalProgress[i]++;
      else if (g.kind === "score") this.goalProgress[i] = this.score;
      else if (g.kind === "merges") this.goalProgress[i] = this.merges;
      else if (g.kind === "chain") this.goalProgress[i] = this.bestChain;
      else if (g.kind === "dust") this.goalProgress[i] = this.dustTaken;
      else if (g.kind === "clear") this.goalProgress[i] = this.cleared;
    });
    this.emit("goals", this.goalProgress);
    const done = this.level.goals.every((g, i) => this.goalProgress[i] >= g.count);
    if (done) this.win();
  }

  /** Every Adventure goal met: celebrate, then report the result. */
  private win(): void {
    if (this.won || !this.level) return;
    this.won = true;
    this.running = false;
    this.isOver = true;
    this.dropReady = false;
    this.pressing = false;
    this.settleTimer = -1;
    if (this.aimingBlackHole) {
      this.aimingBlackHole = false;
      this.emit("aiming", false);
    }
    for (const p of this.planets) p.face.cheer(10);
    const stars = starsFor(this.level, this.dropsLeft);
    this.fx.text(this.jar.centerX, this.jar.top + 220, "LEVEL COMPLETE!", "#ffd34d", 60, 90, 1.8);
    for (let i = 0; i < 5; i++) {
      void this.tweens.wait(i * 0.12).then(() => {
        const x = this.jar.left + 80 + Math.random() * (this.jar.rect.w - 160);
        const y = this.jar.top + 120 + Math.random() * 300;
        this.fx.burst(x, y, ["#ffd34d", "#ff6fa8", "#3fe0c5", "#ff9f2e", "#7b6cff"][i], 30, 420, 1.5, 1.0);
      });
    }
    Sound.play("highscore", 1, -1, 0);
    buzz(120, 0.6);
    const result: RunResult = { ...this.resultBase(), won: true, stars, dropsLeft: this.dropsLeft, level: this.level.id };
    void this.tweens.wait(1.6).then(() => this.emit("levelComplete", result));
  }

  private resultBase(): RunResult {
    return {
      mode: this.mode, score: this.score, highest: this.highest, merges: this.merges,
      drops: this.drops, supernovas: this.supernovas, bestChain: this.bestChain, seconds: this.elapsed,
      level: this.level?.id, reason: this.failReason,
    };
  }

  private checkDanger(dt: number): void {
    if (this.dangerSuppress > 0) this.dangerSuppress -= dt;
    const line = this.jar.lineY();
    let any = false;
    for (const p of this.planets) {
      const over = !p.ice && p.age > DANGER_AGE && p.y - p.radius < line;
      if (over) any = true;
      const near = this.dangerTime > 0 && p.y - p.radius < line + 80;
      p.face.mood = p.ice ? "sleepy" : over || near ? "worried" : "normal";
    }
    if (any && this.dangerSuppress <= 0) {
      const before = this.dangerTime;
      this.dangerTime += dt;
      if (Math.floor(before * 2) !== Math.floor(this.dangerTime * 2)) {
        Sound.play("warning", 1 + this.dangerTime * 0.1, -6);
        buzz(18, 0.3);
      }
    } else {
      this.dangerTime = Math.max(this.dangerTime - dt * 3, 0);
    }
    const level = Math.min(Math.max(this.dangerTime / DANGER_GRACE, 0), 1);
    if (Math.abs(level - this.jar.danger) > 0.001) {
      this.jar.danger = level;
      this.emit("danger", level);
    }
    if (this.dangerTime >= DANGER_GRACE) this.end("overflow");
  }

  /** Stops the run. The app may then offer a revive, or call finish(). */
  end(reason: FailReason = "overflow"): void {
    if (this.isOver) return;
    this.failReason = reason;
    this.settleTimer = -1;
    this.isOver = true;
    this.running = false;
    this.dropReady = false;
    this.pressing = false;
    if (this.aimingBlackHole) {
      this.aimingBlackHole = false;
      this.emit("aiming", false);
    }
    if (reason === "overflow") this.jar.danger = 1;
    for (const p of this.planets) p.face.mood = reason === "overflow" ? "worried" : "sleepy";
    Sound.play("game_over", 1, -2, 0);
    buzz(160, 0.7);
    this.addShake(reason === "overflow" ? 10 : 3);
    // Let the moment land before anything else appears.
    void this.tweens.wait(0.9).then(() => this.emit("fail", reason));
  }

  /** Whether the one revive for this run is still available. */
  get canRevive(): boolean {
    return !this.revived && !this.won;
  }

  /** Gives up after a fail: reports the final result. */
  finish(): void {
    for (const p of this.planets) p.face.mood = "sleepy";
    this.emit("gameOver", this.resultBase());
  }

  /** Continues after a fail (paid for with a rewarded ad). */
  revive(): void {
    if (!this.isOver || this.won) return;
    this.revived = true;
    Save.addStat("revives");
    if (this.failReason === "drops") {
      this.dropsLeft += 5;
      this.emit("dropsLeft", this.dropsLeft);
      this.fx.text(this.jar.centerX, this.jar.top + 260, "+5 DROPS", "#3fe0c5", 56, 90, 1.4);
    } else {
      // Clear the planets crowding the top of the jar.
      const line = this.jar.lineY();
      const crowded = this.planets.filter((p) => !p.ice && !p.marked).sort((a, b) => a.y - a.radius - (b.y - b.radius));
      const victims = crowded.filter((p, i) => i < 3 || p.y - p.radius < line + 170);
      for (const p of victims) {
        this.fx.burst(p.x, p.y, P.COLORS[p.tier], 26, 380, 1.2);
        this.fx.shockwave(p.x, p.y, p.radius * 1.8, "rgba(160,220,255,0.9)", 6);
        this.detach(p);
        p.face.surprise(1);
        void this.tweens.to(p, { scale: 0.01, alpha: 0 }, 0.35, ease.inBack).then(() => this.removeGhost(p));
      }
      this.fx.text(this.jar.centerX, this.jar.top + 260, "SECOND CHANCE!", "#3fe0c5", 52, 90, 1.4);
    }
    Sound.play("powerup", 1, -1, 0);
    buzz(80, 0.5);
    this.isOver = false;
    this.running = true;
    this.dangerTime = 0;
    this.dangerSuppress = 2.5;
    this.jar.danger = 0;
    for (const p of this.planets) p.face.mood = "normal";
    this.cooldown = 0.3;
    this.dropReady = false;
  }

  // -------------------------------------------------------------------------
  // Power-ups
  // -------------------------------------------------------------------------
  toggleBlackHole(): void {
    if (!this.running || this.isOver) return;
    if (this.aimingBlackHole) this.aimingBlackHole = false;
    else if (this.blackHoles > 0 && this.planets.length > 0) this.aimingBlackHole = true;
    this.emit("aiming", this.aimingBlackHole);
  }

  private tryBlackHole(x: number, y: number): void {
    let best: Planet | null = null;
    let bestD = Infinity;
    for (const p of this.planets) {
      const d = Math.hypot(p.x - x, p.y - y) - p.radius;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (!best || bestD > 40) {
      Sound.play("click", 0.7, -8);
      return;
    }
    this.aimingBlackHole = false;
    this.emit("aiming", false);
    this.blackHoles--;
    Save.addStat("blackHoles");
    this.emit("powerups", this.blackHoles, this.shakes);
    this.swallow(best);
  }

  swallow(p: Planet): void {
    this.detach(p);
    if (p.marked && this.level) {
      this.cleared++;
      this.emit("cleared", p.x, p.y, this.markedLeft());
      this.updateGoals();
    }
    p.face.surprise(2);
    const hole = { x: p.x, y: p.y, radius: p.radius * 1.15, strength: 0, spin: 0 };
    this.fx.holes.push(hole);
    Sound.play("black_hole", 1, -2, 0);
    buzz(120, 0.6);
    this.fx.text(p.x, p.y - p.radius - 20, "Gulp!", "#c9a6ff", 36);
    void this.tweens.to(hole, { strength: 1 }, 0.25, ease.outBack);
    void this.tweens.to(p, { angle: p.angle + Math.PI * 4 }, 0.85, ease.inQuad, 0.15);
    void this.tweens.to(p, { scale: 0.02 }, 0.75, ease.inQuad, 0.2).then(async () => {
      this.removeGhost(p);
      await this.tweens.to(hole, { strength: 0 }, 0.25, ease.inBack);
      this.fx.holes = this.fx.holes.filter((h) => h !== hole);
    });
  }

  useShake(): void {
    if (!this.running || this.isOver || this.shakes <= 0) return;
    this.shakes--;
    Save.addStat("shakes");
    this.emit("powerups", this.blackHoles, this.shakes);
    this.dangerSuppress = 2.5;
    this.dangerTime = 0;
    for (const p of this.planets) {
      if (!p.body) continue;
      const side = this.rng.range(-1, 1);
      const m = p.body.getMass();
      p.body.applyLinearImpulse(Vec2((side * 380 * m) / PPM, (-this.rng.range(760, 1040) * m) / PPM), p.body.getWorldCenter(), true);
      p.body.applyAngularImpulse(side * 4 * p.body.getInertia(), true);
      p.face.surprise(1.4);
    }
    this.addShake(22);
    Sound.play("shake", 1, -1, 0);
    buzz(260, 0.8);
  }

  // -------------------------------------------------------------------------
  // Aim guide and screen shake
  // -------------------------------------------------------------------------
  /** Where the held planet would come to rest if dropped straight down. */
  landingY(): number {
    const r = P.collisionRadius(this.currentTier);
    const x = this.dropX;
    let y = this.jar.floorFor(x, r);
    for (const p of this.planets) {
      const rr = r + p.bodyRadius;
      const dx = Math.abs(x - p.x);
      if (dx < rr && p.y > this.dropY) y = Math.min(y, p.y - Math.sqrt(rr * rr - dx * dx));
    }
    const hit = (cx: number, cy: number, cr: number) => {
      const rr = r + cr;
      const dx = Math.abs(x - cx);
      if (dx < rr && cy > this.dropY) y = Math.min(y, cy - Math.sqrt(rr * rr - dx * dx));
    };
    for (const k of this.rocks) hit(k.x, k.y, k.r);
    for (const b of this.bars) {
      const n = Math.max(Math.ceil(b.len / 6), 1);
      const c = Math.cos(b.angle), s = Math.sin(b.angle);
      for (let i = 0; i <= n; i++) {
        const t = (i / n - 0.5) * b.len;
        hit(b.x + c * t, b.y + s * t, BAR_THICKNESS / 2);
      }
    }
    return y;
  }

  addShake(amount: number): void {
    this.shakeAmount = Math.min(this.shakeAmount + amount, 40);
  }

  private updateShake(dt: number): void {
    if (this.shakeAmount <= 0.05) {
      this.shakeOffset.x = this.shakeOffset.y = 0;
      return;
    }
    this.shakeAmount *= Math.exp(-dt * 7);
    this.shakeOffset.x = (Math.random() * 2 - 1) * this.shakeAmount;
    this.shakeOffset.y = (Math.random() * 2 - 1) * this.shakeAmount;
  }

  /** Test helper: puts a planet straight into the jar. */
  debugSpawn(tier: number, x: number, y: number, age = 5): Planet {
    const p = this.spawn(tier, x, y);
    p.age = age;
    return p;
  }

  /** Test helper: stops the overflow check (for staged screenshots). */
  debugNoDanger(): void {
    this.dangerSuppress = 1e9;
  }
}

export { GLASS };
