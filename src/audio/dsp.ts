/**
 * Sample synthesis for Tether League audio: plain math into Float32Arrays, no WebAudio.
 *
 * Everything here runs once, after the first user gesture, to pre-render instrument samples,
 * drum hits, impact layers, crowd beds and the reverb impulse. Renders are seeded, so a given
 * sample rate always produces the same audio. Pure functions; safe to import anywhere.
 */

export type Buf = Float32Array;
/** One rendered sound: mono (one channel) or stereo (two). */
export type Chans = Buf[];

const TAU = Math.PI * 2;
const TABLE = 4096;
let sinTab: Float32Array | null = null;

/** Table sine; `ph` in cycles (any real number). */
export function sinp(ph: number): number {
  const tab = sinTab ?? initSin();
  const x = (ph - Math.floor(ph)) * TABLE;
  const i = x | 0;
  return tab[i] + (tab[i + 1] - tab[i]) * (x - i);
}
function initSin(): Float32Array {
  sinTab = new Float32Array(TABLE + 1);
  for (let n = 0; n <= TABLE; n++) sinTab[n] = Math.sin((n / TABLE) * TAU);
  return sinTab;
}

/** xorshift32, 0..1. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 0x9e3779b9;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export const mtof = (m: number): number => 440 * 2 ** ((m - 69) / 12);
/** Cheap soft clip (Padé tanh), exact enough for saturation colour. */
export function sat(x: number): number {
  if (x > 3) return 1;
  if (x < -3) return -1;
  const x2 = x * x;
  return (x * (27 + x2)) / (27 + 9 * x2);
}

/** PolyBLEP correction for a naive saw/pulse edge. */
function blep(t: number, dt: number): number {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

/** Topology-preserving state-variable filter (stable under fast modulation). */
export class Svf {
  private s1 = 0;
  private s2 = 0;
  private k = 1;
  private a1 = 1;
  private a2 = 0;
  private a3 = 0;
  lp = 0;
  bp = 0;
  hp = 0;
  set(fc: number, q: number, sr: number): this {
    const g = Math.tan((Math.PI * Math.min(Math.max(fc, 10), sr * 0.45)) / sr);
    this.k = 1 / q;
    this.a1 = 1 / (1 + g * (g + this.k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
    return this;
  }
  run(x: number): number {
    const v3 = x - this.s2;
    const v1 = this.a1 * this.s1 + this.a2 * v3;
    const v2 = this.s2 + this.a2 * this.s1 + this.a3 * v3;
    this.s1 = 2 * v1 - this.s1;
    this.s2 = 2 * v2 - this.s2;
    this.lp = v2;
    this.bp = v1;
    this.hp = x - this.k * v1 - v2;
    return v2;
  }
}

/** Linear fade in/out at the edges (in samples) so a buffer never starts or stops on a step. */
export function edges(b: Buf, fin: number, fout: number): Buf {
  const n = b.length;
  for (let i = 0; i < fin && i < n; i++) b[i] *= i / fin;
  for (let i = 0; i < fout && i < n; i++) b[n - 1 - i] *= i / fout;
  return b;
}

/** Scales channels so the loudest sample sits at `peak`, and removes any DC. */
export function norm(ch: Chans, peak = 0.9): Chans {
  let m = 1e-9;
  for (const b of ch) {
    let dc = 0;
    for (let i = 0; i < b.length; i++) dc += b[i];
    dc /= b.length;
    for (let i = 0; i < b.length; i++) {
      b[i] -= dc;
      m = Math.max(m, Math.abs(b[i]));
    }
  }
  const g = peak / m;
  for (const b of ch) for (let i = 0; i < b.length; i++) b[i] *= g;
  for (const b of ch) edges(b, 8, 64);
  return ch;
}

// ---------------------------------------------------------------- drums and impacts

export interface DrumSpec {
  dur: number;
  /** Pitch sweep: f1 + (f0 - f1) * exp(-t / ptau), plus a fast `snap` component. */
  f0: number; f1: number; ptau: number; snap?: number;
  /** Amplitude decay time constant and initial hold (s). */
  tau: number; hold?: number;
  drive?: number;
  /** Click: high-passed noise burst level and time constant. */
  click?: number; ctau?: number;
  /** Extra filtered noise body: level, band centre, decay. */
  nz?: number; nf?: number; ntau?: number; nq?: number;
}

/** Kick drums, thumps, toms: a pitch-dropping sine with click, noise and saturation. */
export function drum(sr: number, p: DrumSpec, seed = 1): Chans {
  const n = Math.floor(p.dur * sr);
  const out = new Float32Array(n);
  const r = rng(seed);
  const hp = new Svf().set(2500, 0.7, sr);
  const bp = new Svf().set(p.nf ?? 1000, p.nq ?? 0.8, sr);
  const drive = p.drive ?? 1;
  const hold = p.hold ?? 0;
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = p.f1 + (p.f0 - p.f1) * Math.exp(-t / p.ptau) + (p.snap ?? 0) * Math.exp(-t / 0.004);
    ph += f / sr;
    const amp = t < hold ? 1 : Math.exp(-(t - hold) / p.tau);
    const w = r() * 2 - 1;
    hp.run(w);
    bp.run(w);
    let x = sinp(ph) * amp;
    if (p.click) x += hp.hp * p.click * Math.exp(-t / (p.ctau ?? 0.0015));
    if (p.nz) x += bp.bp * p.nz * Math.exp(-t / (p.ntau ?? 0.05));
    out[i] = sat(x * drive) / sat(drive);
  }
  return norm([out]);
}

/** Claps and snares: a few short noise bursts, a tail, and an optional tonal body. */
export function clap(sr: number, p: { dur: number; bursts: number; gap: number; tail: number; f: number; q: number; body: number; bodyF: number; bright: number }, seed = 2): Chans {
  const n = Math.floor(p.dur * sr);
  const out = new Float32Array(n);
  const r = rng(seed);
  const bp = new Svf().set(p.f, p.q, sr);
  const hp = new Svf().set(5000, 0.7, sr);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let env = 0;
    for (let b = 0; b < p.bursts; b++) {
      const tb = t - b * p.gap;
      if (tb >= 0) env = Math.max(env, Math.exp(-tb / 0.0055) * (b === p.bursts - 1 ? 1 : 0.8));
    }
    const tl = t - (p.bursts - 1) * p.gap;
    if (tl >= 0) env = Math.max(env, 0.75 * Math.exp(-tl / p.tail));
    const w = r() * 2 - 1;
    bp.run(w);
    hp.run(w);
    ph += (p.bodyF * (1 + 0.3 * Math.exp(-t / 0.01))) / sr;
    out[i] = (bp.bp * 1.6 + hp.hp * p.bright) * env + sinp(ph) * p.body * Math.exp(-t / 0.045);
  }
  return norm([out], 0.85);
}

const HAT_F = [205.3, 304.4, 369.6, 522.7, 540, 800];

/** 808-style metal: six detuned squares, band-passed, plus noise. Hats, cymbals, crashes. */
export function metal(sr: number, p: { dur: number; tau: number; scale: number; f: number; noise: number; attack?: number; stereo?: boolean }, seed = 3): Chans {
  const n = Math.floor(p.dur * sr);
  const chans: Chans = [];
  for (let c = 0; c < (p.stereo ? 2 : 1); c++) {
    const r = rng(seed + c * 77);
    const out = new Float32Array(n);
    const bp = new Svf().set(p.f, 1.2, sr);
    const hp = new Svf().set(p.f * 0.7, 0.7, sr);
    const ph = HAT_F.map(() => r());
    const inc = HAT_F.map((f) => (f * p.scale * (1 + (r() - 0.5) * 0.01 * c)) / sr);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      let sq = 0;
      for (let k = 0; k < 6; k++) {
        ph[k] += inc[k];
        if (ph[k] >= 1) ph[k] -= 1;
        sq += ph[k] < 0.5 ? 1 : -1;
      }
      const x = sq / 6 + (r() * 2 - 1) * p.noise;
      bp.run(x);
      hp.run(bp.bp);
      const a = p.attack ? Math.min(1, t / p.attack) : 1;
      out[i] = hp.hp * a * Math.exp(-t / p.tau);
    }
    chans.push(out);
  }
  return norm(chans, 0.8);
}

/** Short filtered noise hit (shaker, snap, rim). */
export function burst(sr: number, p: { dur: number; f: number; q: number; attack: number; tau: number; tone?: number; toneTau?: number; tone2?: number }, seed = 4): Chans {
  const n = Math.floor(p.dur * sr);
  const out = new Float32Array(n);
  const r = rng(seed);
  const bp = new Svf().set(p.f, p.q, sr);
  let a = 0;
  let b = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.min(1, t / p.attack) * Math.exp(-Math.max(0, t - p.attack) / p.tau);
    bp.run(r() * 2 - 1);
    let x = bp.bp * env;
    if (p.tone) {
      a += p.tone / sr;
      b += (p.tone2 ?? p.tone * 1.48) / sr;
      x += (sinp(a) + 0.6 * sinp(b)) * 0.5 * Math.exp(-t / (p.toneTau ?? 0.02));
    }
    out[i] = x;
  }
  return norm([out], 0.8);
}

// ---------------------------------------------------------------- pitched instruments

export interface SynthSpec {
  dur: number;
  /** Unison saw voices per channel and their spread in cents. */
  saws: number; detune: number;
  /** Pulse (two offset saws) and sine sub levels relative to the saw stack. */
  pulse?: number; sine?: number; sub?: number;
  /** Low-pass: base cutoff (Hz, or multiple of note frequency when key=true), envelope amount and decay. */
  cut: number; env: number; etau: number; q: number; key?: boolean;
  /** Amp: attack (s), decay tau toward sustain level. */
  att: number; tau: number; sus: number;
  drive?: number;
  /** Vibrato: depth (semitones), rate (Hz), onset delay (s). */
  vib?: readonly [depth: number, rate: number, delay: number];
  breath?: number;
  stereo?: boolean;
}

/** Subtractive synth voice (bass, plucks, stabs, leads) rendered at frequency f. */
export function synth(sr: number, f: number, p: SynthSpec, seed = 5): Chans {
  const n = Math.floor(p.dur * sr);
  const nc = p.stereo ? 2 : 1;
  const chans: Chans = [];
  for (let c = 0; c < nc; c++) {
    const r = rng(seed + c * 131 + Math.round(f));
    const out = new Float32Array(n);
    const v = p.saws;
    const ph = new Float64Array(v + 1).map(() => r());
    const det = new Float64Array(v).map((_, k) => {
      const spread = v === 1 ? 0 : (k / (v - 1) - 0.5) * 2;
      const cents = p.detune * spread + (nc === 2 ? (c ? 2.5 : -2.5) : 0) + (r() - 0.5) * 2;
      return 2 ** (cents / 1200);
    });
    const f1 = new Svf();
    const f2 = new Svf();
    let sp = r();
    let bp = 0;
    const drive = p.drive ?? 1;
    const base = p.key ? p.cut * f : p.cut;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      let fm = f;
      if (p.vib && t > p.vib[2]) {
        const d = Math.min(1, (t - p.vib[2]) / 0.25) * p.vib[0];
        fm = f * 2 ** ((d * sinp((t - p.vib[2]) * p.vib[1])) / 12);
      }
      let x = 0;
      for (let k = 0; k < v; k++) {
        const dt = (fm * det[k]) / sr;
        let q = ph[k] + dt;
        if (q >= 1) q -= 1;
        ph[k] = q;
        x += 2 * q - 1 - blep(q, dt);
      }
      x /= Math.sqrt(v);
      const dt0 = fm / sr;
      if (p.pulse) {
        let q2 = ph[0] + 0.5;
        if (q2 >= 1) q2 -= 1;
        x += p.pulse * (2 * ph[0] - 1 - blep(ph[0], dt0) - (2 * q2 - 1 - blep(q2, dt0)));
      }
      if (p.sine || p.sub) {
        sp += dt0;
        if (p.sine) x += p.sine * sinp(sp);
        if (p.sub) x += p.sub * sinp(sp * 0.5);
      }
      if (p.breath) {
        bp = bp * 0.6 + (r() * 2 - 1) * 0.4;
        x += p.breath * bp;
      }
      if ((i & 15) === 0) {
        const fc = base + p.env * Math.exp(-t / p.etau);
        f1.set(fc, p.q, sr);
        f2.set(fc * 1.3, 0.6, sr);
      }
      x = f2.run(f1.run(x));
      const amp = t < p.att ? t / p.att : p.sus + (1 - p.sus) * Math.exp(-(t - p.att) / p.tau);
      out[i] = sat(x * amp * drive);
    }
    chans.push(out);
  }
  return norm(chans, 0.85);
}

/** Two-operator FM electric piano with a tine ping. */
export function epiano(sr: number, f: number, dur: number, seed = 6): Chans {
  const n = Math.floor(dur * sr);
  const out = new Float32Array(n);
  const r = rng(seed + Math.round(f));
  const dec = 1.1 * (220 / f) ** 0.35;
  let pc = r();
  let pm = r();
  let pt = r();
  let ph2 = r();
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    pc += f / sr;
    pm += f / sr;
    pt += (f * 7.02) / sr;
    ph2 += (f * 1.003) / sr;
    const idx = 0.25 + 1.25 * Math.exp(-t / 0.22);
    const amp = Math.min(1, t / 0.002) * Math.exp(-t / dec);
    const body = sinp(pc + (idx / TAU) * sinp(pm) * 1.1) + 0.5 * sinp(ph2);
    const tine = sinp(pt) * 0.35 * Math.exp(-t / 0.03);
    out[i] = sat((body * 0.7 + tine) * amp * 1.2);
  }
  return norm([out], 0.85);
}

/**
 * Modal (additive) bar/bell/plate: partial ratios with their own decay and level.
 * Uses recursive sine oscillators, so dozens of partials stay cheap.
 */
export function modal(sr: number, f: number, p: { dur: number; ratios: readonly number[]; decays: readonly number[]; amps: readonly number[]; strike?: number; spread?: number; stereo?: boolean }, seed = 7): Chans {
  const n = Math.floor(p.dur * sr);
  const chans: Chans = [];
  const nc = p.stereo ? 2 : 1;
  for (let c = 0; c < nc; c++) {
    const r = rng(seed + c * 17);
    const out = new Float32Array(n);
    const hp = new Svf().set(3000, 0.7, sr);
    for (let k = 0; k < p.ratios.length; k++) {
      const fk = f * p.ratios[k] * (1 + (nc === 2 ? (c ? 1 : -1) * (p.spread ?? 0.0015) * (k + 1) * 0.5 : 0));
      if (fk >= sr * 0.45) continue;
      const w = (TAU * fk) / sr;
      const c2 = 2 * Math.cos(w);
      const ph = r() * 0.2;
      let y1 = Math.sin(ph - w);
      let y2 = Math.sin(ph - 2 * w);
      const d = Math.exp(-1 / (p.decays[k] * sr));
      let a = p.amps[k];
      for (let i = 0; i < n; i++) {
        const y = c2 * y1 - y2;
        y2 = y1;
        y1 = y;
        out[i] += y * a;
        a *= d;
        if (a < 1e-5) break;
      }
    }
    if (p.strike) {
      for (let i = 0; i < Math.min(n, sr * 0.02); i++) {
        hp.run(r() * 2 - 1);
        out[i] += hp.hp * p.strike * Math.exp(-i / (sr * 0.002));
      }
    }
    for (let i = 0; i < Math.min(n, 48); i++) out[i] *= i / 48;
    chans.push(out);
  }
  return norm(chans, 0.85);
}

// ---------------------------------------------------------------- crowd, applause, room

/** Seamless stereo crowd murmur loop: formant-filtered noise with syllable-rate swells. */
export function crowd(sr: number, dur: number, seed = 8): Chans {
  const fade = Math.floor(0.6 * sr);
  const n = Math.floor(dur * sr);
  const total = n + fade;
  const chans: Chans = [];
  for (let c = 0; c < 2; c++) {
    const r = rng(seed + c * 999);
    const raw = new Float32Array(total);
    const forms = [new Svf(), new Svf(), new Svf()];
    const fc = [520, 1150, 2500];
    const fq = [3, 4, 5];
    const lvl = [1, 0.55, 0.22];
    const rum = new Svf().set(260, 0.7, sr);
    // Many voices -> a slowly breathing envelope made from interpolated random points.
    let e0 = r();
    let e1 = r();
    let seg = 0;
    const segLen = Math.floor(sr * 0.11);
    for (let i = 0; i < total; i++) {
      if (i % 64 === 0) {
        for (let k = 0; k < 3; k++) {
          fc[k] *= 1 + (r() - 0.5) * 0.04;
          fc[k] = Math.min(Math.max(fc[k], [380, 900, 2000][k]), [700, 1500, 3000][k]);
          forms[k].set(fc[k], fq[k], sr);
        }
      }
      if (++seg >= segLen) {
        seg = 0;
        e0 = e1;
        e1 = r();
      }
      const env = 0.65 + 0.35 * (e0 + (e1 - e0) * (seg / segLen));
      const w = r() * 2 - 1;
      let x = 0;
      for (let k = 0; k < 3; k++) {
        forms[k].run(w);
        x += forms[k].bp * lvl[k];
      }
      rum.run(w);
      raw[i] = x * env + rum.lp * 0.5;
    }
    const out = raw.subarray(0, n).slice();
    for (let i = 0; i < fade; i++) {
      const a = i / fade;
      out[i] = out[i] * Math.sqrt(a) + raw[n + i] * Math.sqrt(1 - a);
    }
    chans.push(out);
  }
  return norm(chans, 0.7);
}

/** Applause/clapping texture: many tiny band-passed clicks. */
export function applause(sr: number, dur: number, rate: number, seed = 9): Chans {
  const n = Math.floor(dur * sr);
  const chans: Chans = [];
  for (let c = 0; c < 2; c++) {
    const r = rng(seed + c * 55);
    const out = new Float32Array(n);
    const len = Math.floor(sr * 0.012);
    const count = Math.floor(dur * rate);
    const f = new Svf();
    for (let k = 0; k < count; k++) {
      const at = Math.floor(r() * (n - len));
      const g = 0.3 + r() * 0.7;
      f.set(900 + r() * 1800, 1.4, sr);
      for (let i = 0; i < len; i++) {
        f.run(r() * 2 - 1);
        out[at + i] += f.bp * g * Math.exp(-i / (sr * 0.0022));
      }
    }
    chans.push(out);
  }
  return norm(chans, 0.8);
}

/** Generated stereo reverb impulse: early reflections, then a darkening exponential tail. */
export function impulse(sr: number, dur: number, decay: number, seed = 10): Chans {
  const n = Math.floor(dur * sr);
  const chans: Chans = [];
  for (let c = 0; c < 2; c++) {
    const r = rng(seed + c * 3);
    const out = new Float32Array(n);
    const pre = Math.floor(0.012 * sr);
    let y = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sr;
      const a = 0.85 * Math.exp(-t / 0.35) + 0.12;
      y += a * ((r() * 2 - 1) - y);
      out[i] = y * Math.exp((-6.9 * t) / decay) * Math.min(1, t / 0.006);
    }
    for (let k = 0; k < 7; k++) {
      const at = pre + Math.floor((0.004 + r() * 0.05) * sr);
      if (at < n) out[at] += (r() < 0.5 ? -1 : 1) * (0.5 - k * 0.05);
    }
    chans.push(out);
  }
  return norm(chans, 0.6);
}
