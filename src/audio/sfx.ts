/**
 * Sound effects: each one is a few layers (transient + body + tail) built from live oscillators,
 * filtered noise and pre-rendered samples, with small random pitch/filter variation per hit.
 */
import { sampleNote, type Engine } from './engine';

export type SfxName =
  | 'uiHover' | 'uiSelect' | 'uiBack' | 'uiDeny'
  | 'tetherAttach' | 'tetherRelease' | 'tetherFail'
  | 'touch' | 'kick' | 'wall' | 'wallBoost' | 'post' | 'bump' | 'net' | 'land' | 'lob'
  | 'goal' | 'concede' | 'countdown' | 'go' | 'whistle'
  | 'reward' | 'unlock' | 'medal' | 'purchase' | 'gate' | 'fail'
  | 'perfect' | 'play' | 'levelUp' | 'cue' | 'lobCharge';

/** A one-shot being built: time, intensity, output, and bookkeeping for cleanup. */
export interface Shot {
  e: Engine;
  t: number;
  i: number;
  /** Heavy variant (swing kick). */
  h: boolean;
  out: GainNode;
  end: number;
  last: AudioScheduledSourceNode | null;
  nodes: AudioNode[];
  /** Reverb send level for this shot (0 = dry). */
  rev: number;
  /** Ask the music to dip: [depth, seconds]. */
  duck?: readonly [number, number];
}

type Wave = OscillatorType | 'warm' | 'bright' | 'soft';
interface OscP {
  f: number; f2?: number; gl?: number; w?: Wave; g: number; d: number;
  at?: number; a?: number; h?: number;
  lp?: number; hp?: number; bp?: number; q?: number;
  /** Vibrato [rate Hz, depth Hz, decay s (0 = steady)]. */
  vib?: readonly [number, number, number];
  det?: number;
}
interface NzP {
  f: number; f2?: number; gl?: number; type?: BiquadFilterType; q?: number;
  g: number; d: number; at?: number; a?: number; h?: number; pink?: boolean;
}

const rnd = Math.random;
/** x varied by +-pct. */
const vary = (x: number, pct: number): number => x * (1 + (rnd() * 2 - 1) * pct);
const mf = (m: number): number => 440 * 2 ** ((m - 69) / 12);

function keep(k: Shot, src: AudioScheduledSourceNode, end: number, ...nodes: AudioNode[]): void {
  k.nodes.push(src, ...nodes);
  if (end >= k.end) {
    k.end = end;
    k.last = src;
  }
}

/**
 * Attack to peak, optional hold, then exponential decay to -60 dB over d, then exactly zero.
 * The param must already be 0: buffer sources start with sub-sample accuracy, so a frame can
 * play just before the first automation event takes effect.
 */
function env(p: AudioParam, t: number, a: number, h: number, d: number, peak: number): number {
  const pk = Math.max(1e-4, peak);
  p.value = 0;
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(pk, t + a);
  if (h > 0) p.setValueAtTime(pk, t + a + h);
  const end = t + a + h + d;
  p.exponentialRampToValueAtTime(pk * 0.001, end);
  p.linearRampToValueAtTime(0, end + 0.008);
  return end + 0.012;
}

function filt(k: Shot, type: BiquadFilterType, f: number, q: number): BiquadFilterNode {
  const b = k.e.ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  return b;
}

export function o(k: Shot, p: OscP): void {
  const { ctx, waves } = k.e;
  const t = k.t + (p.at ?? 0);
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  const w = p.w ?? 'sine';
  if (w === 'warm' || w === 'bright' || w === 'soft') osc.setPeriodicWave(waves[w]);
  else osc.type = w;
  osc.frequency.setValueAtTime(p.f, t);
  if (p.f2 !== undefined) osc.frequency.exponentialRampToValueAtTime(p.f2, t + (p.gl ?? p.d));
  if (p.det) osc.detune.value = p.det;
  let head: AudioNode = osc;
  const extra: AudioNode[] = [amp];
  for (const [type, f] of [['lowpass', p.lp], ['highpass', p.hp], ['bandpass', p.bp]] as const) {
    if (f === undefined) continue;
    const b = filt(k, type, f, p.q ?? (type === 'bandpass' ? 1.2 : 0.7));
    head.connect(b);
    head = b;
    extra.push(b);
  }
  head.connect(amp);
  amp.connect(k.out);
  const end = env(amp.gain, t, p.a ?? 0.003, p.h ?? 0, p.d, p.g);
  if (p.vib) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = p.vib[0];
    depth.gain.setValueAtTime(p.vib[1], t);
    if (p.vib[2] > 0) depth.gain.setTargetAtTime(0, t, p.vib[2]);
    lfo.connect(depth);
    depth.connect(osc.frequency);
    lfo.start(t);
    lfo.stop(end);
    extra.push(lfo, depth);
  }
  osc.start(t);
  osc.stop(end);
  keep(k, osc, end, ...extra);
}

export function nz(k: Shot, p: NzP): BiquadFilterNode {
  const { ctx } = k.e;
  const t = k.t + (p.at ?? 0);
  const src = ctx.createBufferSource();
  const b = filt(k, p.type ?? 'bandpass', p.f, p.q ?? 0.9);
  const amp = ctx.createGain();
  src.buffer = p.pink ? k.e.pink : k.e.white;
  src.loop = true;
  b.frequency.setValueAtTime(p.f, t);
  if (p.f2 !== undefined) b.frequency.exponentialRampToValueAtTime(p.f2, t + (p.gl ?? p.d));
  src.connect(b);
  b.connect(amp);
  amp.connect(k.out);
  const end = env(amp.gain, t, p.a ?? 0.002, p.h ?? 0, p.d, p.g);
  src.start(t, rnd() * 0.9);
  src.stop(end);
  keep(k, src, end, b, amp);
  return b;
}

/** Plays a pre-rendered sample (or a bank note when m is a MIDI note); silently skips if not loaded yet. */
export function sm(k: Shot, name: string, p: { g: number; rate?: number; m?: number; at?: number; lp?: number }): void {
  const t = k.t + (p.at ?? 0);
  let dest: AudioNode = k.out;
  const lp = p.lp ? filt(k, 'lowpass', p.lp, 0.7) : null;
  if (lp) {
    lp.connect(k.out);
    dest = lp;
  }
  const src = sampleNote(k.e, name, p.m ?? 12 * Math.log2(p.rate ?? 1), t, p.g, dest);
  if (!src) {
    lp?.disconnect();
    return;
  }
  keep(k, src, t + (src.buffer?.duration ?? 0) / src.playbackRate.value, ...(lp ? [lp] : []));
}

/** Plays a whole sample buffer through a filter and a swell envelope (crowd swells, applause). */
export function swell(k: Shot, name: string, p: { g: number; a: number; h: number; d: number; rate?: number; at?: number; type?: BiquadFilterType; f?: number; q?: number; gain?: number }): void {
  const buf = k.e.bufs.get(name);
  if (!buf) return;
  const { ctx } = k.e;
  const t = k.t + (p.at ?? 0);
  const src = ctx.createBufferSource();
  const b = filt(k, p.type ?? 'peaking', p.f ?? 1800, p.q ?? 0.7);
  if (p.gain !== undefined) b.gain.value = p.gain;
  const amp = ctx.createGain();
  src.buffer = buf;
  src.loop = true;
  src.playbackRate.value = p.rate ?? 1;
  src.connect(b);
  b.connect(amp);
  amp.connect(k.out);
  const end = env(amp.gain, t, p.a, p.h, p.d, p.g);
  src.start(t, rnd() * buf.duration * 0.8);
  src.stop(end);
  keep(k, src, end, b, amp);
}

/** Disconnects a finished shot once its longest layer has ended. */
export function finish(k: Shot, extra: AudioNode[]): void {
  const done = (): void => {
    for (const n of k.nodes) n.disconnect();
    for (const n of extra) n.disconnect();
    k.nodes.length = 0;
  };
  const last = k.last;
  if (!last) return done();
  const prev = last.onended;
  last.onended = (ev) => {
    if (prev) prev.call(last, ev);
    done();
  };
}

/** Bell / chime note from the bell bank. */
const bell = (k: Shot, m: number, g: number, at = 0): void => sm(k, 'bell', { m, g, at });

const chord = (k: Shot, inst: string, notes: readonly number[], g: number, at: number): void => {
  for (const m of notes) sm(k, inst, { m, g, at });
};

/** Bright rising sparkle: quick bell arpeggio plus airy noise. */
function sparkle(k: Shot, notes: readonly number[], step: number, g: number, at = 0): void {
  notes.forEach((m, n) => bell(k, m, g * (1 - n * 0.06), at + n * step));
  nz(k, { type: 'highpass', f: 6000, f2: 11000, gl: step * notes.length, g: g * 0.25, a: step * notes.length * 0.6, d: 0.35, at });
}

function zing(k: Shot, s: number): void {
  const f = vary(720, 0.06);
  o(k, { f, f2: f * 3.6, gl: 0.11, w: 'bright', g: 0.22 * s, a: 0.003, d: 0.24, bp: 2400, q: 1.3 });
  o(k, { f: f * 2, f2: f * 7.2, gl: 0.11, g: 0.12 * s, d: 0.2 });
  o(k, { f: 3520, g: 0.06 * s, at: 0.05, d: 0.3, vib: [31, 90, 0] });
  nz(k, { type: 'highpass', f: 5000, f2: 9500, gl: 0.12, g: 0.1 * s, d: 0.16 });
  k.rev = Math.max(k.rev, 0.3);
}

// ---------------------------------------------------------------- the effects

export const SFX: Record<Exclude<SfxName, 'lobCharge'>, (k: Shot) => void> = {
  uiHover: (k) => {
    o(k, { f: vary(2100, 0.03), f2: 2450, gl: 0.02, g: 0.03, a: 0.002, d: 0.035 });
    nz(k, { type: 'highpass', f: 7000, g: 0.012, d: 0.02 });
  },
  uiSelect: (k) => {
    const f = vary(1180, 0.015);
    o(k, { f, f2: f * 1.33, gl: 0.03, w: 'triangle', g: 0.16, a: 0.0015, d: 0.1 });
    o(k, { f: f * 2, g: 0.05, d: 0.06, at: 0.012 });
    nz(k, { f: 4200, q: 1.6, g: 0.1, d: 0.014 });
    sm(k, 'thump', { rate: 2.6, g: 0.08 });
  },
  uiBack: (k) => {
    o(k, { f: 820, f2: 560, gl: 0.06, w: 'triangle', g: 0.13, a: 0.004, d: 0.12, lp: 3000 });
    o(k, { f: 410, f2: 300, g: 0.07, d: 0.1 });
  },
  uiDeny: (k) => {
    for (const at of [0, 0.085]) {
      o(k, { f: 196, w: 'square', g: 0.06, a: 0.003, h: 0.03, d: 0.05, lp: 900, at });
      o(k, { f: 98, g: 0.09, a: 0.003, h: 0.03, d: 0.05, at });
    }
  },
  cue: (k) => {
    const f = vary(1568, 0.01);
    o(k, { f, g: 0.07, a: 0.002, d: 0.2 });
    o(k, { f: f * 1.5, g: 0.025, d: 0.12, at: 0.012 });
    k.rev = 0.3;
  },

  tetherAttach: (sh) => {
    const s = 0.35 + 0.65 * sh.i;
    const v = vary(1, 0.05);
    nz(sh, { f: 700 * v, f2: 4200 * v, gl: 0.07, q: 2.2, g: 0.22 * s, a: 0.012, h: 0.03, d: 0.05 });
    o(sh, { f: 2637 * v, g: 0.07 * s, a: 0.001, d: 0.09, at: 0.065 });
    o(sh, { f: 3951 * v, g: 0.035 * s, d: 0.06, at: 0.065 });
    sm(sh, 'thump', { rate: 1.9 * v, g: 0.22 * s, at: 0.065 });
    o(sh, { f: 220 * v, w: 'warm', g: 0.13 * s, a: 0.004, d: 0.3, at: 0.065, lp: 1800, vib: [17, 45, 0.07] });
    sh.rev = 0.15;
  },
  tetherRelease: (sh) => {
    const s = 0.3 + 0.7 * sh.i;
    const v = vary(1, 0.05);
    o(sh, { f: 1100 * v, f2: 260, gl: 0.05, w: 'triangle', g: 0.1 * s, a: 0.002, d: 0.07 });
    nz(sh, { f: 2400 * v, f2: 450, gl: 0.3, q: 1.2, g: 0.32 * s, a: 0.03, d: 0.28 });
    nz(sh, { type: 'highpass', f: 3000, g: 0.06 * s, a: 0.02, d: 0.15, pink: true });
    sh.rev = 0.1;
  },
  tetherFail: (k) => {
    o(k, { f: 330, f2: 220, gl: 0.12, w: 'warm', g: 0.08, lp: 900, d: 0.14 });
    nz(k, { type: 'lowpass', f: 1500, f2: 300, g: 0.1, d: 0.12 });
    o(k, { f: 165, g: 0.08, d: 0.1, at: 0.02 });
  },

  touch: (k) => {
    const i = k.i;
    sm(k, 'thump', { rate: vary(1.7 + 0.5 * (1 - i), 0.05), g: 0.12 + 0.28 * i });
    nz(k, { f: vary(1800 + 1500 * i, 0.1), q: 1, g: 0.05 + 0.1 * i, d: 0.03 });
  },
  kick: (k) => {
    const i = k.i;
    const v = vary(1, 0.03);
    nz(k, { f: 3500 * v, q: 1.2, g: 0.18 + 0.25 * i, a: 0.0005, d: 0.014 });
    o(k, { f: 2600 * v, g: 0.04 + 0.05 * i, a: 0.0005, d: 0.012 });
    sm(k, 'thump', { rate: (1.35 - 0.35 * i) * v, g: 0.45 + 0.5 * i });
    o(k, { f: (480 + 260 * i) * v, f2: 170, gl: 0.035, w: 'triangle', g: 0.13 + 0.12 * i, a: 0.001, d: 0.06 });
    if (i > 0.55) nz(k, { f: 3200, f2: 700, gl: 0.25, q: 1, g: (i - 0.55) * 0.55, a: 0.01, d: 0.25 });
    if (k.h || i > 0.9) {
      const h = k.h ? 1 : (i - 0.9) * 10;
      sm(k, 'crunch', { rate: vary(1, 0.08), g: 0.35 * h });
      o(k, { f: 95, f2: 38, gl: 0.22, g: 0.5 * h, a: 0.002, d: 0.3 });
      o(k, { f: 900 * v, f2: 2600, gl: 0.09, w: 'bright', g: 0.05 * h, d: 0.15, hp: 1200 });
      k.rev = 0.22;
    }
  },
  lob: (k) => {
    const i = k.i;
    nz(k, { f: 3000, q: 1, g: 0.14, d: 0.012 });
    sm(k, 'thump', { rate: vary(0.85, 0.04), g: 0.4 + 0.3 * i });
    o(k, { f: 140, f2: 280, gl: 0.18, g: 0.16 + 0.1 * i, a: 0.01, d: 0.22 });
    nz(k, { f: 500, f2: 2400, gl: 0.3, q: 1.4, g: 0.2 + 0.15 * i, a: 0.04, d: 0.3 });
    k.rev = 0.12;
  },
  land: (k) => {
    const i = k.i;
    sm(k, 'thump', { rate: vary(0.62 + 0.15 * (1 - i), 0.05), g: 0.25 + 0.5 * i });
    nz(k, { type: 'lowpass', f: 700, f2: 200, g: 0.08 + 0.15 * i, d: 0.12 });
    o(k, { f: 75, f2: 50, g: 0.2 * i, d: 0.15 });
  },
  wall: (k) => {
    const i = k.i;
    const v = vary(1, 0.05);
    sm(k, 'thump', { rate: (1 + 0.2 * (1 - i)) * v, g: 0.3 + 0.35 * i });
    o(k, { f: (150 + 70 * i) * v, w: 'warm', g: 0.12 + 0.16 * i, a: 0.002, d: 0.24, lp: 1500, vib: [22, (150 + 70 * i) * 0.35, 0.06] });
    nz(k, { f: 1400 * v, q: 0.9, g: 0.12 + 0.2 * i, d: 0.04 });
    if (i > 0.5) zing(k, (i - 0.5) * 2);
  },
  wallBoost: (k) => zing(k, 0.4 + 0.6 * k.i),
  post: (k) => {
    const i = k.i;
    sm(k, 'clang', { rate: 0.92 + 0.16 * rnd(), g: 0.3 + 0.4 * i, lp: 3000 + 7000 * i });
    sm(k, 'thump', { rate: 1.1, g: 0.3 * i });
    k.rev = 0.3;
  },
  net: (k) => {
    const i = k.i;
    nz(k, { f: 2200 + 800 * i, f2: 700, gl: 0.35, q: 0.8, g: 0.18 + 0.25 * i, a: 0.02, d: 0.35 });
    nz(k, { type: 'lowpass', f: 900, f2: 300, g: 0.1 + 0.15 * i, a: 0.03, d: 0.3, at: 0.04 });
    sm(k, 'thump', { rate: 0.8, g: 0.12 + 0.12 * i });
  },
  bump: (k) => {
    const i = k.i;
    const v = vary(1, 0.06);
    sm(k, 'thump', { rate: 0.75 * v, g: 0.35 + 0.4 * i });
    o(k, { f: 310 * v, f2: 240, w: 'square', g: 0.05 + 0.07 * i, d: 0.09, lp: 1600 });
    nz(k, { f: 900 * v, q: 5, g: 0.12 + 0.15 * i, d: 0.1 });
  },

  goal: (k) => {
    sm(k, 'boom', { g: 0.7 });
    sm(k, 'crash', { g: 0.4 });
    nz(k, { type: 'lowpass', f: 5000, f2: 300, g: 0.22, d: 0.5 });
    o(k, { f: 110, f2: 40, gl: 0.5, g: 0.3, d: 0.7 });
    chord(k, 'stab', [60, 64, 67, 72], 0.2, 0);
    chord(k, 'stab', [64, 67, 72, 76], 0.2, 0.13);
    chord(k, 'stab', [67, 72, 76, 79], 0.24, 0.26);
    sparkle(k, [84, 88, 91, 96, 100, 103, 108], 0.045, 0.3, 0.3);
    nz(k, { type: 'highpass', f: 4000, f2: 12000, gl: 0.8, g: 0.06, a: 0.35, d: 0.6, at: 0.2 });
    k.rev = 0.35;
    k.duck = [0.4, 1.4];
  },
  concede: (k) => {
    o(k, { f: mf(64), f2: mf(63), gl: 0.25, w: 'warm', lp: 1100, g: 0.13, a: 0.01, h: 0.1, d: 0.3 });
    o(k, { f: mf(60), f2: mf(57), gl: 0.35, w: 'warm', lp: 900, g: 0.13, a: 0.01, h: 0.1, d: 0.5, at: 0.22 });
    o(k, { f: mf(45), g: 0.12, a: 0.01, d: 0.5, at: 0.22 });
    k.rev = 0.2;
    k.duck = [0.7, 0.8];
  },
  countdown: (k) => {
    o(k, { f: 880, g: 0.2, a: 0.002, h: 0.06, d: 0.16 });
    o(k, { f: 1760, g: 0.05, d: 0.08 });
    nz(k, { f: 5000, q: 1.5, g: 0.06, d: 0.01 });
    k.rev = 0.15;
  },
  go: (k) => {
    o(k, { f: 1318.5, w: 'bright', lp: 5000, g: 0.08, a: 0.003, h: 0.15, d: 0.3 });
    o(k, { f: 1760, g: 0.15, h: 0.15, d: 0.35 });
    o(k, { f: 659.3, w: 'triangle', g: 0.1, h: 0.1, d: 0.3 });
    sm(k, 'boom', { rate: 1.3, g: 0.35 });
    sm(k, 'crash', { rate: 1.2, g: 0.14 });
    k.rev = 0.3;
  },
  whistle: (k) => {
    const f = vary(2900, 0.02);
    o(k, { f, g: 0.12, a: 0.015, h: 0.38, d: 0.08, vib: [42, 160, 0] });
    o(k, { f: f * 1.15, g: 0.035, a: 0.015, h: 0.38, d: 0.08, vib: [42, 180, 0] });
    nz(k, { f: 3000, q: 2, g: 0.05, a: 0.02, h: 0.35, d: 0.08 });
    k.rev = 0.25;
  },

  reward: (k) => {
    o(k, { f: mf(83), w: 'square', lp: 6000, g: 0.07, a: 0.001, h: 0.05, d: 0.04 });
    o(k, { f: mf(88), w: 'square', lp: 7000, g: 0.07, a: 0.001, h: 0.02, d: 0.35, at: 0.07 });
    bell(k, 100, 0.14, 0.07);
    k.rev = 0.25;
  },
  unlock: (k) => {
    [72, 76, 79, 83, 84, 88].forEach((m, n) => {
      bell(k, m + 12, 0.2, n * 0.06);
      sm(k, 'pluck', { m, g: 0.12, at: n * 0.06 });
    });
    nz(k, { type: 'highpass', f: 6000, f2: 12000, gl: 0.4, g: 0.05, a: 0.3, d: 0.4 });
    k.rev = 0.4;
  },
  medal: (k) => {
    chord(k, 'stab', [60, 64, 67], 0.18, 0);
    chord(k, 'stab', [65, 69, 72], 0.18, 0.14);
    chord(k, 'stab', [67, 71, 74, 79], 0.18, 0.28);
    chord(k, 'stab', [72, 76, 79, 84], 0.24, 0.42);
    sm(k, 'boom', { rate: 1.2, g: 0.3, at: 0.42 });
    sm(k, 'crash', { g: 0.15, at: 0.42 });
    sparkle(k, [96, 100, 103, 108], 0.05, 0.22, 0.45);
    k.rev = 0.35;
    k.duck = [0.6, 1.2];
  },
  purchase: (k) => {
    for (const at of [0, 0.05]) {
      nz(k, { f: 3000, q: 3, g: 0.2, d: 0.02, at });
      o(k, { f: 1200, f2: 800, w: 'triangle', g: 0.05, d: 0.03, at });
    }
    bell(k, 93, 0.25, 0.1);
    bell(k, 100, 0.12, 0.1);
    o(k, { f: mf(93), g: 0.05, d: 0.6, at: 0.1, vib: [6, 4, 0] });
    for (let n = 0; n < 5; n++) bell(k, 96 + Math.floor(rnd() * 8), 0.05, 0.12 + n * 0.035);
    k.rev = 0.3;
  },
  gate: (k) => {
    const m = [76, 79, 81, 83, 84, 86, 88][Math.round(k.i * 6)];
    bell(k, m, 0.24);
    bell(k, m + 7, 0.18, 0.07);
    sm(k, 'pluck', { m, g: 0.16 });
    sm(k, 'pluck', { m: m + 7, g: 0.14, at: 0.07 });
    k.rev = 0.3;
  },
  fail: (k) => {
    o(k, { f: mf(55), f2: mf(53), gl: 0.25, w: 'warm', lp: 700, g: 0.12, a: 0.01, h: 0.08, d: 0.25 });
    o(k, { f: mf(51), f2: mf(48), gl: 0.3, w: 'warm', lp: 600, g: 0.12, a: 0.01, h: 0.08, d: 0.35, at: 0.16 });
  },
  perfect: (k) => {
    bell(k, 88, 0.28);
    bell(k, 95, 0.22, 0.07);
    bell(k, 100, 0.14, 0.14);
    o(k, { f: mf(88), g: 0.07, d: 0.8, a: 0.004 });
    k.rev = 0.4;
  },
  play: (k) => {
    const s = 0.5 + 0.5 * k.i;
    [72, 76, 79].forEach((m, n) => {
      sm(k, 'pluck', { m, g: 0.22 * s, at: n * 0.06 });
      bell(k, m + 12, 0.14 * s, n * 0.06);
    });
    bell(k, 96, 0.18 * s, 0.18);
    nz(k, { type: 'highpass', f: 7000, g: 0.04 * s, a: 0.1, d: 0.3, at: 0.08 });
    k.rev = 0.35;
  },
  levelUp: (k) => {
    chord(k, 'stab', [60, 64, 67], 0.18, 0);
    chord(k, 'stab', [65, 69, 72], 0.18, 0.12);
    chord(k, 'stab', [67, 71, 74], 0.2, 0.24);
    chord(k, 'stab', [72, 76, 79, 84], 0.26, 0.36);
    sm(k, 'lead', { m: 72, g: 0.2, at: 0 });
    sm(k, 'lead', { m: 77, g: 0.2, at: 0.12 });
    sm(k, 'lead', { m: 79, g: 0.2, at: 0.24 });
    sm(k, 'lead', { m: 84, g: 0.24, at: 0.36 });
    sm(k, 'boom', { g: 0.45, at: 0.36 });
    sm(k, 'crash', { g: 0.25, at: 0.36 });
    sparkle(k, [84, 88, 91, 96, 100, 103, 108, 112], 0.04, 0.26, 0.4);
    nz(k, { type: 'highpass', f: 3000, f2: 10000, gl: 0.36, g: 0.06, a: 0.33, d: 0.2 });
    k.rev = 0.4;
    k.duck = [0.45, 1.6];
  },
};

/**
 * Output level per effect (linear), set from measured peaks so the hierarchy holds at full volume:
 * goal / level-up about -2 dBFS, power kick -4, normal kick -8, tap -14, touches -16, UI -16..-30.
 */
export const LEVEL: Record<SfxName, number> = {
  uiHover: 0.7, uiSelect: 0.52, uiBack: 0.5, uiDeny: 0.6, cue: 1.5,
  tetherAttach: 0.75, tetherRelease: 0.75, tetherFail: 1.2,
  touch: 0.75, kick: 0.52, lob: 0.65, land: 0.65, wall: 0.62, wallBoost: 1, post: 0.7, net: 1, bump: 0.62,
  goal: 0.85, concede: 0.8, countdown: 0.85, go: 0.7, whistle: 1.35,
  reward: 1.5, unlock: 0.63, medal: 0.8, purchase: 1, gate: 0.67, fail: 0.5,
  perfect: 0.85, play: 0.68, levelUp: 0.85, lobCharge: 1,
};

/** Impacts whose loudness follows intensity steeply (tap vs power shot). */
export const DYNAMIC: ReadonlySet<SfxName> = new Set<SfxName>(['kick', 'touch', 'wall', 'land', 'bump', 'lob', 'net', 'post']);

/** Sounds that may be dropped when many voices are already playing. */
export const LOW_PRIORITY: ReadonlySet<SfxName> = new Set<SfxName>(['uiHover', 'touch', 'wall', 'bump', 'land', 'net', 'tetherRelease', 'tetherAttach']);

/** Minimum gap between two plays of the same sound (ms). */
export const RETRIGGER: Partial<Record<SfxName, number>> = { touch: 55, wall: 60, bump: 70, land: 70, uiHover: 35, net: 120 };
