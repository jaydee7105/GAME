// Sound effects and music through the Web Audio API.

import { Save } from "./save";

const SFX = [
  "click", "tick", "drop", "thud", "chain", "powerup", "warning", "game_over",
  "supernova", "black_hole", "shake", "discover", "highscore", "start",
  ...Array.from({ length: 10 }, (_, i) => `merge_${i + 1}`),
];

class AudioEngine {
  private ctx: AudioContext | null = null;
  private sfxGain!: GainNode;
  private musicGain!: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private lastPlayed = new Map<string, number>();
  private music: AudioBufferSourceNode | null = null;
  private musicBuffer: AudioBuffer | null = null;
  private loading: Promise<void> | null = null;

  /** Must be called from a user gesture on some browsers. */
  unlock(): void {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
  }

  private init(): void {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor({ latencyHint: "interactive" });
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -6;
    comp.knee.value = 6;
    comp.ratio.value = 8;
    comp.attack.value = 0.002;
    comp.release.value = 0.15;
    comp.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.connect(comp);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.45;
    this.musicGain.connect(comp);
    this.applySettings();
    Save.on("settings", () => this.applySettings());
    void this.load();
  }

  load(): Promise<void> {
    if (!this.ctx) return Promise.resolve();
    this.loading ??= (async () => {
      const ctx = this.ctx!;
      const fetchBuffer = async (url: string) => {
        const res = await fetch(url);
        return ctx.decodeAudioData(await res.arrayBuffer());
      };
      await Promise.all(SFX.map(async (name) => {
        try {
          this.buffers.set(name, await fetchBuffer(`assets/audio/${name}.wav`));
        } catch (e) {
          console.warn("sound failed", name, e);
        }
      }));
      try {
        const canOgg = new Audio().canPlayType('audio/ogg; codecs="vorbis"') !== "";
        this.musicBuffer = await fetchBuffer(`assets/audio/music.${canOgg ? "ogg" : "mp3"}`);
        this.applySettings();
      } catch (e) {
        console.warn("music failed", e);
      }
    })();
    return this.loading;
  }

  private applySettings(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.sfxGain.gain.setTargetAtTime(Save.setting("sfx") ? 1 : 0, now, 0.02);
    if (Save.setting("music")) this.startMusic();
    else this.stopMusic();
  }

  private startMusic(): void {
    if (!this.ctx || !this.musicBuffer || this.music) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.musicBuffer;
    src.loop = true;
    src.connect(this.musicGain);
    this.musicGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.musicGain.gain.linearRampToValueAtTime(0.45, this.ctx.currentTime + 2.5);
    src.start();
    this.music = src;
  }

  private stopMusic(): void {
    if (!this.music || !this.ctx) return;
    const m = this.music;
    this.music = null;
    this.musicGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
    m.stop(this.ctx.currentTime + 1.0);
  }

  /** Pauses all audio while the app is in the background. */
  setBackground(hidden: boolean): void {
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  /** Plays a one-shot sound. minGap stops the same sound machine-gunning. */
  play(name: string, pitch = 1, volumeDb = 0, minGap = 0.03): void {
    const ctx = this.ctx;
    const buf = this.buffers.get(name);
    if (!ctx || !buf || ctx.state !== "running" || !Save.setting("sfx")) return;
    const now = ctx.currentTime;
    if (now - (this.lastPlayed.get(name) ?? -10) < minGap) return;
    this.lastPlayed.set(name, now);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = pitch;
    const g = ctx.createGain();
    g.gain.value = Math.pow(10, volumeDb / 20);
    src.connect(g).connect(this.sfxGain);
    src.start();
  }
}

export const Sound = new AudioEngine();
