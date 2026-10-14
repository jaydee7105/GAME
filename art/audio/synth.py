"""Synthesises every sound effect and the music loop for Planet Drop.

    python art/audio/synth.py          # needs numpy + scipy (+ ffmpeg for music)

Everything is generated from scratch (FM bells, filtered noise, sine sweeps)
so the audio is original and royalty free.
"""

import os
import subprocess
import wave

import numpy as np
from scipy import signal

SR = 44100
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "public", "assets", "audio")
rng = np.random.default_rng(7)


# --------------------------------------------------------------------------
# Building blocks
# --------------------------------------------------------------------------
def t_axis(dur):
    return np.arange(int(SR * dur)) / SR


def env(n, attack=0.005, decay=0.3, curve=4.0):
    """Fast attack, exponential decay envelope of n samples."""
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    d = np.exp(-np.maximum(t - attack, 0) * curve / max(decay, 1e-4))
    return a * d


def adsr(n, a, d, s, r):
    t = np.arange(n) / SR
    dur = n / SR
    e = np.where(t < a, t / max(a, 1e-4),
                 np.where(t < a + d, 1 - (1 - s) * (t - a) / max(d, 1e-4), s))
    rel = np.clip((dur - t) / max(r, 1e-4), 0, 1)
    return e * rel


def sweep(f0, f1, dur, shape="exp"):
    t = t_axis(dur)
    if shape == "exp":
        f = f0 * (f1 / f0) ** (t / dur)
    else:
        f = f0 + (f1 - f0) * t / dur
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def fm_bell(freq, dur, ratio=3.5, index=2.5, decay=0.9, bright=1.0):
    t = t_axis(dur)
    mod_env = np.exp(-t * 6.0 / max(decay, 0.05)) * index * bright
    mod = np.sin(2 * np.pi * freq * ratio * t) * mod_env
    car = np.sin(2 * np.pi * freq * t + mod)
    # A soft second partial gives a glassy, cosmic shimmer.
    car += 0.25 * np.sin(2 * np.pi * freq * 2.01 * t) * np.exp(-t * 8.0 / max(decay, 0.05))
    return car * env(len(t), 0.003, decay, 4.0)


def noise(dur):
    return rng.uniform(-1, 1, int(SR * dur))


def lowpass(x, cutoff, order=2):
    b, a = signal.butter(order, min(cutoff / (SR / 2), 0.99), "low")
    return signal.lfilter(b, a, x)


def highpass(x, cutoff, order=2):
    b, a = signal.butter(order, min(cutoff / (SR / 2), 0.99), "high")
    return signal.lfilter(b, a, x)


def bandpass(x, lo, hi, order=2):
    b, a = signal.butter(order, [lo / (SR / 2), min(hi / (SR / 2), 0.99)], "band")
    return signal.lfilter(b, a, x)


def reverb(x, wet=0.25, size=1.0, damp=4000.0):
    """Cheap but smooth reverb: convolution with decaying filtered noise."""
    n = int(SR * 1.6 * size)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / SR * 3.2 / size)
    ir = lowpass(ir, damp)
    ir[: int(SR * 0.012)] *= np.linspace(0, 1, int(SR * 0.012))
    ir /= np.sqrt(np.sum(ir ** 2))
    tail = pad_to(signal.fftconvolve(x, ir), len(x) + n)
    dry = pad_to(x, len(x) + n)
    return dry * (1 - wet * 0.5) + tail * wet


def pad_to(x, n):
    return np.concatenate([x, np.zeros(max(n - len(x), 0))])[:n]


def mix(*parts):
    n = max(len(p) for p in parts)
    return sum(pad_to(p, n) for p in parts)


def at(x, offset, total):
    out = np.zeros(total)
    s = int(offset * SR)
    e = min(s + len(x), total)
    out[s:e] = x[: e - s]
    return out


def trim(x, thresh=1e-4):
    idx = np.where(np.abs(x) > thresh)[0]
    return x[: idx[-1] + 1] if len(idx) else x


def norm(x, peak=0.89):
    m = np.max(np.abs(x))
    return x / m * peak if m > 0 else x


def fade_out(x, dur=0.02):
    n = min(int(SR * dur), len(x))
    x = x.copy()
    x[-n:] *= np.linspace(1, 0, n)
    return x


def save(name, x, peak=0.89):
    x = fade_out(trim(norm(x, peak)))
    data = (np.clip(x, -1, 1) * 32767).astype(np.int16)
    with wave.open(os.path.join(OUT, name + ".wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


def note(semitones_from_a4):
    return 440.0 * 2 ** (semitones_from_a4 / 12.0)


# --------------------------------------------------------------------------
# Sound effects
# --------------------------------------------------------------------------
def sfx_click():
    x = sweep(1500, 700, 0.045) * env(int(SR * 0.045), 0.001, 0.03, 5)
    x = mix(x, lowpass(noise(0.01), 5000) * env(int(SR * 0.01), 0.0005, 0.006, 4) * 0.3)
    save("click", x, 0.6)


def sfx_tick():
    x = np.sin(2 * np.pi * 2400 * t_axis(0.03)) * env(int(SR * 0.03), 0.001, 0.02, 5)
    save("tick", x, 0.5)


def sfx_drop():
    n = int(SR * 0.16)
    x = sweep(620, 240, 0.16) * adsr(n, 0.01, 0.05, 0.6, 0.1)
    x += lowpass(noise(0.16), 1200) * env(n, 0.01, 0.1, 4) * 0.25
    save("drop", reverb(x, 0.12, 0.4), 0.55)


def sfx_thud():
    n = int(SR * 0.16)
    x = sweep(170, 70, 0.16) * env(n, 0.002, 0.12, 4)
    x = mix(x, lowpass(noise(0.05), 900) * env(int(SR * 0.05), 0.001, 0.03, 4) * 0.6)
    save("thud", x, 0.7)


PENT = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]


def sfx_merge(tier):
    """Bubbly pop + glassy bell; bigger planets get chords, a sub boom and space."""
    base = note(-2 + PENT[tier - 1])  # G4 upwards on a major pentatonic scale
    big = (tier - 1) / 9.0
    dur = 0.55 + big * 1.4
    total = int(SR * (dur + 0.2))
    pop = sweep(280 + tier * 30, 1100 + tier * 60, 0.05) * env(int(SR * 0.05), 0.001, 0.04, 4)
    pop = mix(pop, bandpass(noise(0.03), 1500, 6000) * env(int(SR * 0.03), 0.0005, 0.015, 4) * 0.5)
    # Harmonic FM (2:1) sounds warm and marimba-like rather than metallic.
    bell = fm_bell(base, dur, 2.0, 0.9 + big * 0.8, dur * 0.7)
    body = np.sin(2 * np.pi * base * 0.5 * t_axis(dur)) * env(int(SR * dur), 0.004, dur * 0.35, 4) * 0.35
    parts = [at(pop * 0.7, 0, total), at(lowpass(bell, 5000), 0.012, total), at(body, 0.012, total)]
    if tier >= 4:
        parts.append(at(fm_bell(base * 1.26, dur, 2.0, 0.8, dur * 0.6) * 0.4, 0.04, total))
    if tier >= 6:
        parts.append(at(fm_bell(base * 1.5, dur, 2.0, 0.8, dur * 0.6) * 0.38, 0.07, total))
        boom = sweep(110, 45, dur * 0.8) * env(int(SR * dur * 0.8), 0.004, dur * 0.5, 3.5)
        parts.append(at(boom * (0.5 + big * 0.5), 0, total))
    if tier >= 8:
        sparkle = sum(at(fm_bell(base * 2 * r, 0.4, 2.0, 1.0, 0.3) * 0.18, 0.1 + k * 0.06, total)
                      for k, r in enumerate([1.0, 1.26, 1.5, 2.0]))
        parts.append(sparkle)
    x = mix(*parts)
    save("merge_%d" % tier, reverb(x, 0.18 + big * 0.25, 0.6 + big * 0.8), 0.8)


def sfx_chain():
    total = int(SR * 0.6)
    x = sum(at(fm_bell(note(15 + s), 0.35, 2.0, 1.2, 0.25) * (0.9 - k * 0.15), k * 0.055, total)
            for k, s in enumerate([0, 4, 7, 12]))
    save("chain", reverb(x, 0.2, 0.5), 0.6)


def sfx_powerup():
    total = int(SR * 0.9)
    x = sum(at(fm_bell(note(12 + s), 0.5, 1.0, 1.5, 0.4), k * 0.07, total)
            for k, s in enumerate([0, 4, 7, 12, 16]))
    shimmer = highpass(noise(0.6), 6000) * env(int(SR * 0.6), 0.2, 0.3, 3) * 0.12
    save("powerup", reverb(mix(x, at(shimmer, 0.1, total)), 0.3, 0.7), 0.6)


def sfx_warning():
    total = int(SR * 0.3)
    t = t_axis(0.09)
    beep = signal.sawtooth(2 * np.pi * 740 * t, 0.5) * env(len(t), 0.004, 0.08, 3)
    beep = lowpass(beep, 2500)
    x = mix(at(beep, 0, total), at(beep * 0.8, 0.13, total))
    save("warning", x, 0.45)


def sfx_game_over():
    total = int(SR * 2.0)
    notes = [7, 3, 0, -5]
    x = sum(at(fm_bell(note(s), 0.9, 2.0, 1.4, 0.8), k * 0.22, total) for k, s in enumerate(notes))
    pad_t = t_axis(1.6)
    pad = sum(np.sin(2 * np.pi * note(s - 12) * pad_t) for s in (-5, -2, 3))
    pad *= adsr(len(pad_t), 0.3, 0.4, 0.6, 0.8) * 0.18
    save("game_over", reverb(mix(x, at(pad, 0.5, total)), 0.35, 1.2), 0.7)


def sfx_supernova():
    total = int(SR * 3.4)
    swell = bandpass(noise(0.5), 300, 5000) * np.linspace(0, 1, int(SR * 0.5)) ** 2
    boom = sweep(90, 30, 1.8) * env(int(SR * 1.8), 0.005, 1.2, 3)
    crack = lowpass(noise(0.4), 3000) * env(int(SR * 0.4), 0.001, 0.25, 4)
    chord = sum(at(fm_bell(note(s), 2.2, 3.5, 2.0, 1.8) * 0.35, 0.5 + k * 0.05, total)
                for k, s in enumerate([3, 7, 10, 15, 19, 22, 27]))
    x = mix(at(swell * 0.5, 0, total), at(boom, 0.48, total), at(crack * 0.6, 0.48, total), chord)
    save("supernova", reverb(x, 0.45, 1.8, 6000), 0.9)


def sfx_black_hole():
    n = int(SR * 1.2)
    t = t_axis(1.2)
    wob = 1 + 0.08 * np.sin(2 * np.pi * 9 * t)
    f = 520 * (60 / 520) ** (t / 1.2) * wob
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR)
    tone = tone * adsr(n, 0.05, 0.3, 0.8, 0.4)
    air = bandpass(noise(1.2), 200, 1800) * adsr(n, 0.3, 0.2, 0.6, 0.5) * 0.22
    save("black_hole", reverb(tone + air, 0.3, 1.0), 0.75)


def sfx_shake():
    n = int(SR * 0.7)
    t = t_axis(0.7)
    rumble = lowpass(noise(0.7), 260, 3) * (0.6 + 0.4 * np.sin(2 * np.pi * 14 * t))
    rumble *= adsr(n, 0.02, 0.2, 0.7, 0.35)
    gate = lowpass((np.sin(2 * np.pi * 18 * t) > 0.2).astype(float), 120)
    rattle = bandpass(noise(0.7), 900, 2800) * gate * env(n, 0.01, 0.5, 3) * 0.07
    save("shake", rumble * 2.5 + rattle, 0.75)


def sfx_discover():
    total = int(SR * 1.8)
    arp = sum(at(fm_bell(note(s), 0.7, 2.0, 1.6, 0.5), k * 0.09, total)
              for k, s in enumerate([3, 7, 10, 15]))
    chord = sum(at(fm_bell(note(s), 1.4, 3.5, 1.2, 1.2) * 0.35, 0.38, total) for s in (3, 10, 15, 19))
    save("discover", reverb(mix(arp, chord), 0.35, 1.0), 0.7)


def sfx_highscore():
    total = int(SR * 2.2)
    seq = [(0, 0), (4, 0.1), (7, 0.2), (12, 0.3), (7, 0.45), (12, 0.55), (16, 0.65)]
    arp = sum(at(fm_bell(note(3 + s), 0.6, 2.0, 1.8, 0.45), dt, total) for s, dt in seq)
    chord = sum(at(fm_bell(note(3 + s), 1.6, 3.5, 1.2, 1.3) * 0.4, 0.8, total) for s in (0, 4, 7, 12, 19))
    sparkle = highpass(noise(1.0), 7000) * env(int(SR * 1.0), 0.05, 0.7, 3) * 0.1
    save("highscore", reverb(mix(arp, chord, at(sparkle, 0.8, total)), 0.35, 1.0), 0.7)


def sfx_start():
    total = int(SR * 0.8)
    whoosh = bandpass(noise(0.35), 400, 4000) * np.sin(np.linspace(0, np.pi, int(SR * 0.35))) ** 2
    ding = fm_bell(note(15), 0.6, 3.5, 1.6, 0.5)
    ding2 = fm_bell(note(22), 0.6, 3.5, 1.2, 0.5) * 0.5
    save("start", reverb(mix(at(whoosh * 0.35, 0, total), at(ding, 0.25, total), at(ding2, 0.3, total)), 0.3, 0.8), 0.6)


# --------------------------------------------------------------------------
# Music: a slow, warm, spacey loop
# --------------------------------------------------------------------------
def music():
    bpm = 72.0
    beat = 60.0 / bpm
    bars = 16
    total_t = bars * 4 * beat
    n = int(SR * total_t)
    L = np.zeros(n)
    R = np.zeros(n)
    # Chords as semitones from A4 (two passes, second slightly varied).
    prog = [
        [-9, -5, -2, 2],    # Cmaj9-ish
        [-12, -8, -5, -1],  # Am7
        [-16, -12, -9, -5],  # Fmaj7
        [-14, -10, -7, -2],  # G6
    ]
    prog = prog * 4
    bar_len = 4 * beat
    for b, chord in enumerate(prog):
        start = b * bar_len
        # Pad: detuned sines, slow swell, soft lowpass.
        dur = bar_len + 1.2
        t = t_axis(dur)
        pad = np.zeros(len(t))
        for s in chord:
            f = note(s)
            for det in (-0.12, 0.0, 0.12):
                pad += np.sin(2 * np.pi * f * 2 ** (det / 12) * t + rng.uniform(0, 6.28))
        pad += 0.5 * np.sin(2 * np.pi * note(chord[0] - 12) * t)
        pad *= adsr(len(t), 1.2, 0.8, 0.75, 1.4) * 0.05
        pad = lowpass(pad, 1800)
        s0 = int(start * SR)
        e0 = min(s0 + len(pad), n)
        L[s0:e0] += pad[: e0 - s0]
        R[s0:e0] += pad[: e0 - s0]
        if s0 + len(pad) > n:  # wrap the tail for a seamless loop
            over = pad[e0 - s0:]
            L[: len(over)] += over
            R[: len(over)] += over
        # Bass: root note on beats 1 and 3.
        for k in (0, 2):
            bt = t_axis(beat * 1.8)
            bass = np.sin(2 * np.pi * note(chord[0] - 24) * bt) * adsr(len(bt), 0.02, 0.3, 0.5, 0.6) * 0.16
            o = int((start + k * beat) * SR)
            e = min(o + len(bass), n)
            L[o:e] += bass[: e - o]
            R[o:e] += bass[: e - o]
        # Twinkly arpeggio on eighths, from the chord plus an octave, gently randomised.
        tones = sorted(chord + [c + 12 for c in chord])
        for k in range(8):
            if rng.random() < 0.28 and k not in (0, 4):
                continue
            s = tones[(k * 3 + b) % len(tones)] + 12
            bell = fm_bell(note(s), 1.1, 3.5, 1.1, 0.9) * (0.055 if k % 2 == 0 else 0.04)
            o = int((start + k * beat * 0.5) * SR)
            pan = 0.5 + 0.35 * np.sin(b * 1.3 + k)
            for ch, g in ((L, 1 - pan), (R, pan)):
                e = min(o + len(bell), n)
                ch[o:e] += bell[: e - o] * g * 2
                if o + len(bell) > n:
                    over = bell[e - o:]
                    ch[: len(over)] += over * g * 2
    # Stereo reverb, folded back into the loop so it repeats seamlessly.
    out = []
    for ch in (L, R):
        wet = reverb(ch, 0.5, 2.2, 3500)
        loop = wet[:n].copy()
        tail = wet[n:]
        loop[: len(tail)] += tail
        out.append(loop)
    stereo = np.stack(out, 1)
    stereo = stereo / np.max(np.abs(stereo)) * 0.8
    wav_path = os.path.join(ROOT, "art", "build", "music.wav")
    os.makedirs(os.path.dirname(wav_path), exist_ok=True)
    data = (stereo * 32767).astype(np.int16)
    with wave.open(wav_path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav_path, "-c:a", "libvorbis", "-q:a", "4",
                    os.path.join(OUT, "music.ogg")], check=True)
    # MP3 fallback for browsers without Ogg Vorbis (Safari).
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav_path, "-c:a", "libmp3lame", "-b:a", "128k",
                    os.path.join(OUT, "music.mp3")], check=True)


def main():
    os.makedirs(OUT, exist_ok=True)
    sfx_click()
    sfx_tick()
    sfx_drop()
    sfx_thud()
    for tier in range(1, 11):
        sfx_merge(tier)
    sfx_chain()
    sfx_powerup()
    sfx_warning()
    sfx_game_over()
    sfx_supernova()
    sfx_black_hole()
    sfx_shake()
    sfx_discover()
    sfx_highscore()
    sfx_start()
    music()
    print("[audio] done:", sorted(os.listdir(OUT)))


if __name__ == "__main__":
    main()
