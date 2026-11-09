/**
 * Tether League audio.
 *
 * Every sound and every bar of music in this file is synthesized at runtime with the
 * WebAudio API (oscillators, one shared noise buffer, filters and gain envelopes).
 * It is original work: no samples, no third-party audio assets, no network access.
 *
 * Routing: sfx bus + music bus -> master gain -> compressor (limiter) -> destination.
 * The module is import-safe outside the browser: nothing touches WebAudio until unlock().
 */

export type SfxName =
  | 'uiHover' | 'uiSelect' | 'uiBack' | 'uiDeny'
  | 'tetherAttach' | 'tetherRelease' | 'tetherFail'
  | 'touch' | 'kick' | 'wall' | 'post' | 'bump' | 'net'
  | 'goal' | 'concede' | 'countdown' | 'go' | 'whistle'
  | 'reward' | 'unlock' | 'medal' | 'purchase' | 'gate' | 'fail';

/** Volumes are 0..1. */
export interface AudioSettings { master: number; music: number; effects: number; muted: boolean }

/** intensity 0..1 (default 0.6), pan -1..1. */
export interface PlayOpts { intensity?: number; pan?: number }

type MusicTrack = 'menu' | 'match';
type AudioCtor = typeof AudioContext;

interface Engine { ctx: AudioContext; master: GainNode; sfx: GainNode; music: GainNode; noise: AudioBuffer }
/** Where and when a voice plays. */
interface Sink { e: Engine; out: AudioNode; t: number }
interface Shot extends Sink { i: number }
/** A long-lived sound (hum, crowd) that is faded out and torn down as one unit. */
interface Layer { level: GainNode; sources: AudioScheduledSourceNode[]; nodes: AudioNode[] }
interface Hum extends Layer { a: OscillatorNode; b: OscillatorNode; lp: BiquadFilterNode }
interface Player { track: MusicTrack; out: GainNode; step: number; nextTime: number; stepDur: number; endAt: number | null }

interface ToneSpec {
  freq: number; dur: number; gain: number;
  type?: OscillatorType; freqEnd?: number; glide?: number;
  at?: number; attack?: number; hold?: number; linear?: boolean;
  lp?: number; vibrato?: readonly [rate: number, depth: number];
}
interface NoiseSpec {
  freq: number; dur: number; gain: number;
  filter?: BiquadFilterType; freqEnd?: number; q?: number;
  at?: number; attack?: number; hold?: number;
}

const MUSIC_TRIM = 0.55;      // music sits well under the effects
const CROWD_GAIN = 0.6;
const RETRIGGER_MS = 40;
const TICK_MS = 50;
const LOOKAHEAD_S = 0.15;
const RAMP = 0.03;

const noop = (): void => {};
const nowMs = (): number => Date.now();
const mtof = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);
const clamp = (x: number, lo: number, hi: number, fallback: number): number =>
  Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : fallback;
/** Deterministic 0..1 hash, used for musical variation that never repeats exactly. */
const hash01 = (n: number): number => (Math.imul(n + 1, 2654435761) >>> 0) / 4294967296;
function safely(fn: () => void): void {
  try { fn(); } catch { /* audio must never break the game */ }
}

// ---------------------------------------------------------------- state

let engine: Engine | null = null;
let settings: AudioSettings = { master: 0.8, music: 0.5, effects: 0.8, muted: false };
let userSuspended = false;
let lastUnlockMs = -1e9;
let lastCheerMs = -1e9;
const lastPlayed = new Map<SfxName, number>();
let hum: Hum | null = null;
let crowd: Layer | null = null;
let crowdLevel = 0;
let wantTrack: MusicTrack | null = null;
let musicIntensity = 0;
let players: Player[] = [];
let timer: ReturnType<typeof setInterval> | null = null;

// ---------------------------------------------------------------- engine

function createEngine(): Engine | null {
  const g = globalThis as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (!Ctor) return null;
  const ctx = new Ctor();
  const master = ctx.createGain();
  const sfx = ctx.createGain();
  const music = ctx.createGain();
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -14;
  limiter.knee.value = 18;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.004;
  limiter.release.value = 0.2;
  master.gain.value = settings.muted ? 0 : settings.master;
  sfx.gain.value = settings.effects;
  music.gain.value = settings.music * MUSIC_TRIM;
  sfx.connect(master);
  music.connect(master);
  master.connect(limiter);
  limiter.connect(ctx.destination);
  // One shared white-noise buffer feeds every noise voice (looped from a random offset).
  const len = Math.floor(ctx.sampleRate * 3);
  const noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let n = 0; n < len; n++) data[n] = Math.random() * 2 - 1;
  return { ctx, master, sfx, music, noise };
}

function pushSettings(e: Engine): void {
  const t = e.ctx.currentTime;
  e.master.gain.setTargetAtTime(settings.muted ? 0 : settings.master, t, RAMP);
  e.sfx.gain.setTargetAtTime(settings.effects, t, RAMP);
  e.music.gain.setTargetAtTime(settings.music * MUSIC_TRIM, t, RAMP);
}

/** One-shots only sound while the context runs (or within the unlock gesture's start-up grace). */
function canSound(e: Engine): boolean {
  return !userSuspended && (e.ctx.state === 'running' || nowMs() - lastUnlockMs < 400);
}

// ---------------------------------------------------------------- voices

/** Soft attack, optional hold, then a click-free decay to silence at `end`. */
function shapeEnv(g: AudioParam, t: number, attack: number, hold: number, end: number, peak: number, linear: boolean): void {
  const p = Math.max(1e-4, peak);
  g.setValueAtTime(0, t);
  g.linearRampToValueAtTime(p, t + attack);
  g.setValueAtTime(p, t + attack + hold);
  if (linear) {
    g.linearRampToValueAtTime(0, end);
  } else {
    g.exponentialRampToValueAtTime(p * 0.01, end);
    g.linearRampToValueAtTime(0, end + 0.02);
  }
}

function tone(k: Sink, s: ToneSpec): void {
  const { ctx } = k.e;
  const t = k.t + (s.at ?? 0);
  const attack = s.attack ?? 0.006;
  const hold = s.hold ?? 0;
  const end = t + Math.max(s.dur, attack + hold + 0.02);
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  const chain: AudioNode[] = [osc, env];
  osc.type = s.type ?? 'sine';
  osc.frequency.setValueAtTime(s.freq, t);
  if (s.freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(s.freqEnd, t + (s.glide ?? s.dur));
  let head: AudioNode = osc;
  if (s.lp !== undefined) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = s.lp;
    lp.Q.value = 0.5;
    osc.connect(lp);
    head = lp;
    chain.push(lp);
  }
  if (s.vibrato) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = s.vibrato[0];
    depth.gain.value = s.vibrato[1];
    lfo.connect(depth);
    depth.connect(osc.frequency);
    lfo.start(t);
    lfo.stop(end + 0.04);
    chain.push(lfo, depth);
  }
  head.connect(env);
  env.connect(k.out);
  shapeEnv(env.gain, t, attack, hold, end, s.gain, s.linear === true);
  osc.onended = () => chain.forEach((n) => n.disconnect());
  osc.start(t);
  osc.stop(end + 0.04);
}

/** Filtered noise burst. Returns the filter so callers can add extra sweeps. */
function noise(k: Sink, s: NoiseSpec): BiquadFilterNode {
  const { ctx, noise: buffer } = k.e;
  const t = k.t + (s.at ?? 0);
  const attack = s.attack ?? 0.004;
  const hold = s.hold ?? 0;
  const end = t + Math.max(s.dur, attack + hold + 0.02);
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const env = ctx.createGain();
  src.buffer = buffer;
  src.loop = true;
  filter.type = s.filter ?? 'lowpass';
  filter.Q.value = s.q ?? 0.7;
  filter.frequency.setValueAtTime(s.freq, t);
  if (s.freqEnd !== undefined) filter.frequency.exponentialRampToValueAtTime(s.freqEnd, end);
  src.connect(filter);
  filter.connect(env);
  env.connect(k.out);
  shapeEnv(env.gain, t, attack, hold, end, s.gain, false);
  src.onended = () => [src, filter, env].forEach((n) => n.disconnect());
  src.start(t, Math.random() * (buffer.duration - 0.5));
  src.stop(end + 0.04);
  return filter;
}

/** Output node for a one-shot: the sfx bus, or a short-lived panner in front of it. */
function panned(e: Engine, pan: number): AudioNode {
  if (Math.abs(pan) < 0.02 || typeof e.ctx.createStereoPanner !== 'function') return e.sfx;
  const p = e.ctx.createStereoPanner();
  p.pan.value = pan * 0.8;
  p.connect(e.sfx);
  setTimeout(() => p.disconnect(), 2500); // longer than any one-shot
  return p;
}

function releaseLayer(e: Engine, l: Layer, tau: number): void {
  const now = e.ctx.currentTime;
  l.level.gain.cancelScheduledValues(now);
  l.level.gain.setTargetAtTime(0, now, tau);
  const first = l.sources[0];
  if (first) first.onended = () => [...l.sources, ...l.nodes, l.level].forEach((n) => n.disconnect());
  for (const s of l.sources) s.stop(now + tau * 7);
}

// ---------------------------------------------------------------- sound effects

const SFX: Record<SfxName, (k: Shot) => void> = {
  uiHover: (k) => tone(k, { freq: 660, freqEnd: 740, dur: 0.05, gain: 0.045 }),
  uiSelect: (k) => {
    tone(k, { type: 'triangle', freq: 660, dur: 0.07, gain: 0.07 });
    tone(k, { freq: 990, at: 0.045, dur: 0.1, gain: 0.06 });
  },
  uiBack: (k) => {
    tone(k, { type: 'triangle', freq: 520, dur: 0.06, gain: 0.065 });
    tone(k, { freq: 392, at: 0.045, dur: 0.09, gain: 0.06 });
  },
  uiDeny: (k) => {
    for (const at of [0, 0.075]) tone(k, { type: 'triangle', freq: 208, at, dur: 0.06, gain: 0.08, lp: 900 });
  },
  tetherAttach: (k) => {
    tone(k, { freq: 300, freqEnd: 1080, dur: 0.1, gain: 0.12, attack: 0.012 });
    noise(k, { filter: 'bandpass', freq: 900, freqEnd: 2600, q: 1.4, dur: 0.1, gain: 0.2, attack: 0.015 });
    tone(k, { type: 'triangle', freq: 1320, freqEnd: 700, at: 0.09, dur: 0.05, gain: 0.1, attack: 0.002 });
    noise(k, { filter: 'bandpass', freq: 2200, q: 1, at: 0.09, dur: 0.035, gain: 0.26, attack: 0.002 });
  },
  tetherRelease: (k) => {
    noise(k, { filter: 'bandpass', freq: 1800, freqEnd: 480, q: 1.1, dur: 0.2, gain: 0.36, attack: 0.02 });
    tone(k, { freq: 700, freqEnd: 250, dur: 0.17, gain: 0.06, attack: 0.015 });
  },
  tetherFail: (k) => {
    tone(k, { type: 'triangle', freq: 300, dur: 0.05, gain: 0.07, lp: 800 });
    tone(k, { type: 'triangle', freq: 262, at: 0.07, dur: 0.06, gain: 0.07, lp: 800 });
  },
  touch: ({ i, ...k }) => {
    const f = 380 + 160 * i;
    tone(k, { freq: f, freqEnd: f * 0.7, dur: 0.075, gain: 0.09 + 0.12 * i, attack: 0.004 });
    noise(k, { freq: 1200 + 1400 * i, dur: 0.035, gain: 0.16 + 0.2 * i, attack: 0.003 });
  },
  kick: ({ i, ...k }) => {
    tone(k, { freq: 150 + 50 * i, freqEnd: 55, glide: 0.11, dur: 0.18, gain: 0.26 + 0.3 * i, attack: 0.004 });
    tone(k, { type: 'triangle', freq: 300 + 200 * i, freqEnd: 120, dur: 0.055, gain: 0.09 + 0.1 * i, attack: 0.002 });
    noise(k, { filter: 'bandpass', freq: 1800 + 1200 * i, q: 1, dur: 0.03, gain: 0.28 + 0.3 * i, attack: 0.002 });
  },
  wall: ({ i, ...k }) => {
    tone(k, { type: 'triangle', freq: 170 + 60 * i, freqEnd: 82, dur: 0.14, gain: 0.2 + 0.2 * i, lp: 600 + 500 * i });
    tone(k, { freq: 92, freqEnd: 132, at: 0.05, dur: 0.1, gain: 0.08 + 0.08 * i, attack: 0.015 });
    noise(k, { freq: 500 + 500 * i, dur: 0.06, gain: 0.22 + 0.2 * i });
  },
  post: ({ i, ...k }) => {
    const f = 620 + 180 * i;
    tone(k, { freq: f, dur: 0.38, gain: 0.1 + 0.08 * i, attack: 0.003 });
    tone(k, { freq: f * 2.76, dur: 0.24, gain: 0.04 + 0.04 * i, attack: 0.003 });
    tone(k, { freq: f * 5.4, dur: 0.09, gain: 0.008 + 0.014 * i, attack: 0.003 });
  },
  bump: ({ i, ...k }) => {
    tone(k, { freq: 110 + 40 * i, freqEnd: 50, glide: 0.13, dur: 0.2, gain: 0.28 + 0.25 * i, attack: 0.005 });
    noise(k, { freq: 300 + 300 * i, dur: 0.07, gain: 0.4 + 0.3 * i, attack: 0.005 });
  },
  net: ({ i, ...k }) => {
    noise(k, { filter: 'bandpass', freq: 2000 + 700 * i, freqEnd: 850, q: 0.8, dur: 0.3, gain: 0.26 + 0.3 * i, attack: 0.04 });
    noise(k, { freq: 900, freqEnd: 400, at: 0.06, dur: 0.22, gain: 0.14 + 0.14 * i, attack: 0.05 });
  },
  goal: (k) => {
    [74, 78, 81, 86].forEach((m, n) => {
      tone(k, { type: 'triangle', freq: mtof(m), at: n * 0.09, dur: 0.24, gain: 0.12, lp: 3200 });
      tone(k, { type: 'triangle', freq: mtof(m), at: 0.4, dur: 0.5, gain: 0.07, hold: 0.16, lp: 3200 });
    });
    tone(k, { freq: mtof(50), at: 0.4, dur: 0.5, gain: 0.1, hold: 0.12, attack: 0.01 });
  },
  concede: (k) => {
    tone(k, { type: 'triangle', freq: 440, dur: 0.24, gain: 0.11, attack: 0.012, hold: 0.06, lp: 1300 });
    tone(k, { type: 'triangle', freq: 349.2, at: 0.2, dur: 0.4, gain: 0.11, attack: 0.012, hold: 0.08, lp: 1300 });
  },
  countdown: (k) => {
    tone(k, { freq: 660, dur: 0.16, gain: 0.15, attack: 0.008, hold: 0.07 });
    tone(k, { type: 'triangle', freq: 1320, dur: 0.1, gain: 0.025 });
  },
  go: (k) => {
    tone(k, { freq: 990, dur: 0.44, gain: 0.15, attack: 0.008, hold: 0.2 });
    tone(k, { freq: 1485, dur: 0.4, gain: 0.05, attack: 0.008, hold: 0.16 });
    tone(k, { type: 'triangle', freq: 495, dur: 0.3, gain: 0.05, hold: 0.1 });
  },
  whistle: (k) => {
    for (const freq of [1760, 1836]) tone(k, { freq, dur: 0.5, gain: 0.055, attack: 0.02, hold: 0.36, vibrato: [27, 45] });
    noise(k, { filter: 'bandpass', freq: 1800, q: 2, dur: 0.48, gain: 0.12, attack: 0.02, hold: 0.3 });
  },
  reward: (k) => {
    tone(k, { freq: 988, dur: 0.09, gain: 0.11, attack: 0.003 });
    tone(k, { freq: 1319, at: 0.075, dur: 0.38, gain: 0.11, attack: 0.003 });
    tone(k, { type: 'triangle', freq: 1319, at: 0.075, dur: 0.2, gain: 0.03 });
  },
  unlock: (k) => {
    [76, 80, 83, 88].forEach((m, n) => {
      tone(k, { freq: mtof(m), at: n * 0.075, dur: 0.32, gain: 0.09, attack: 0.004 });
      tone(k, { freq: mtof(m + 12), at: n * 0.075 + 0.02, dur: 0.16, gain: 0.02, attack: 0.004 });
    });
  },
  medal: (k) => {
    for (const m of [62, 66, 69]) tone(k, { type: 'triangle', freq: mtof(m), dur: 0.75, gain: 0.09, attack: 0.015, hold: 0.12, lp: 1500 });
    tone(k, { freq: mtof(50), dur: 0.7, gain: 0.1, attack: 0.015, hold: 0.1 });
  },
  purchase: (k) => {
    for (const at of [0, 0.065]) {
      noise(k, { filter: 'bandpass', freq: 2500, q: 1.2, at, dur: 0.025, gain: 0.3, attack: 0.002 });
      tone(k, { type: 'triangle', freq: 1100, freqEnd: 600, at, dur: 0.03, gain: 0.07, attack: 0.002 });
    }
    tone(k, { freq: 1319, at: 0.12, dur: 0.5, gain: 0.1, attack: 0.003 });
    tone(k, { freq: 1976, at: 0.12, dur: 0.32, gain: 0.04, attack: 0.003 });
  },
  gate: (k) => {
    tone(k, { type: 'triangle', freq: 784, dur: 0.32, gain: 0.13, attack: 0.004, lp: 3000 });
    tone(k, { freq: 1568, dur: 0.16, gain: 0.03, attack: 0.004 });
  },
  fail: (k) => {
    for (const freq of [110, 104]) tone(k, { type: 'sawtooth', freq, dur: 0.32, gain: 0.1, attack: 0.02, hold: 0.14, lp: 420 });
  },
};

// ---------------------------------------------------------------- hum + crowd

function buildHum(e: Engine): Hum {
  const { ctx } = e;
  const a = ctx.createOscillator();
  const b = ctx.createOscillator();
  const mix = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  const level = ctx.createGain();
  b.type = 'triangle';
  mix.gain.value = 0.45;
  lp.type = 'lowpass';
  lp.frequency.value = 500;
  level.gain.value = 0;
  a.connect(lp);
  b.connect(mix);
  mix.connect(lp);
  lp.connect(level);
  level.connect(e.sfx);
  a.start();
  b.start();
  return { level, sources: [a, b], nodes: [mix, lp], a, b, lp };
}

function buildCrowd(e: Engine): Layer {
  const { ctx } = e;
  const src = ctx.createBufferSource();
  const level = ctx.createGain();
  const layer: Layer = { level, sources: [src], nodes: [] };
  src.buffer = e.noise;
  src.loop = true;
  level.gain.value = 0;
  // Two band-passed voices of the same noise, each slowly swelling at its own rate, read as a murmur.
  for (const [freq, q, mix, rate] of [[430, 0.8, 1, 0.13], [1050, 1.1, 0.55, 0.29]] as const) {
    const band = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    band.type = 'bandpass';
    band.frequency.value = freq;
    band.Q.value = q;
    gain.gain.value = mix;
    lfo.frequency.value = rate;
    depth.gain.value = mix * 0.3;
    src.connect(band);
    band.connect(gain);
    gain.connect(level);
    lfo.connect(depth);
    depth.connect(gain.gain);
    lfo.start();
    layer.sources.push(lfo);
    layer.nodes.push(band, gain, depth);
  }
  level.connect(e.sfx);
  src.start();
  return layer;
}

function syncCrowd(e: Engine): void {
  if (crowdLevel <= 0.001) {
    if (crowd) releaseLayer(e, crowd, 0.3);
    crowd = null;
    return;
  }
  crowd ??= buildCrowd(e);
  crowd.level.gain.setTargetAtTime(crowdLevel * CROWD_GAIN, e.ctx.currentTime, 0.4);
}

// ---------------------------------------------------------------- music

interface Chord { root: number; tones: readonly number[] }
const ch = (root: number, ...tones: number[]): Chord => ({ root, tones });

/** Both tracks are in D major so the menu <-> match crossfade stays consonant. */
const MATCH_PROG: readonly Chord[] = [ // I V vi IV | I V IV V
  ch(38, 62, 66, 69), ch(45, 61, 64, 69), ch(47, 62, 66, 71), ch(43, 62, 67, 71),
  ch(38, 62, 66, 69), ch(45, 61, 64, 69), ch(43, 62, 67, 71), ch(45, 64, 69, 73),
];
const MENU_PROG: readonly Chord[] = [ // Dmaj7 Bm7 Gadd9 Aadd9 | Dmaj7 F#m7 Gadd9 Aadd9
  ch(38, 62, 66, 69, 73), ch(47, 62, 66, 69, 71), ch(43, 59, 62, 67, 69), ch(45, 61, 64, 69, 71),
  ch(38, 62, 66, 69, 73), ch(42, 61, 64, 66, 69), ch(43, 59, 62, 67, 69), ch(45, 61, 64, 69, 71),
];
const BASS_A = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 2, 0];
const BASS_B = [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 2, 0];
const ARP_A = [0, 1, 2, 1, 0, 1, 2, 1];
const ARP_B = [2, 1, 0, 1, 2, 0, 1, 2];
/** Lead melody, per bar: [step, midi, length in steps]. */
const LEAD: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>> = [
  [[0, 78, 3], [4, 81, 2], [6, 78, 2], [10, 76, 4]],
  [[0, 76, 3], [4, 73, 2], [6, 76, 2], [10, 69, 4]],
  [[0, 74, 3], [4, 78, 2], [6, 74, 2], [10, 71, 4]],
  [[0, 71, 2], [4, 74, 2], [8, 76, 2], [12, 78, 2], [14, 81, 2]],
  [[0, 81, 4], [6, 78, 2], [8, 74, 4]],
  [[0, 76, 4], [6, 73, 2], [8, 69, 4]],
  [[0, 71, 3], [4, 74, 2], [6, 71, 2], [10, 67, 4]],
  [[0, 69, 2], [4, 73, 2], [8, 76, 4], [14, 76, 2]],
];
const PLUCKS: ReadonlyArray<readonly number[]> = [[0, 6, 10], [0, 4, 10, 14], [2, 8, 12], [0, 6, 8, 14], [4, 10]];

const drumKick = (k: Sink, gain: number): void =>
  tone(k, { freq: 125, freqEnd: 46, glide: 0.11, dur: 0.24, gain, attack: 0.003 });
const drumClap = (k: Sink, gain: number): void => {
  noise(k, { filter: 'bandpass', freq: 1500, q: 0.9, dur: 0.12, gain, attack: 0.003 });
};
const drumHat = (k: Sink, gain: number, dur: number): void => {
  noise(k, { filter: 'highpass', freq: 6500, dur, gain, attack: 0.002 });
};

/** ~122 BPM groove. A 32-bar arrangement (arp / +lead / breather / +lead) keeps the loop from feeling short. */
function matchStep(k: Sink, bar: number, s: number, stepDur: number, x: number): void {
  const chord = MATCH_PROG[bar % 8];
  const phrase = Math.floor(bar / 8) % 4;
  const breather = phrase === 2 && bar % 8 < 4;
  if (s % 4 === 0 && (!breather || s === 0)) drumKick(k, 0.3);
  if (!breather && (s === 4 || s === 12)) drumClap(k, 0.34);
  if (bar % 8 === 7 && s >= 13) drumClap(k, 0.1 + 0.06 * (s - 13)); // little fill into the next phrase
  else if (bar % 4 === 3 && s === 15) drumClap(k, 0.12);
  if (s % 4 === 2) drumHat(k, 0.045, 0.07);
  else if (x > 0.35 && s % 2 === 1) drumHat(k, 0.012 + 0.025 * x, 0.03); // intensity layer: 16th hats

  const b = (bar % 2 === 0 ? BASS_A : BASS_B)[s];
  if (b > 0) {
    const freq = mtof(chord.root + (b === 2 ? 12 : 0));
    tone(k, { type: 'sawtooth', freq, dur: stepDur * 1.7, gain: 0.15, attack: 0.008, hold: stepDur * 0.6, lp: 480 });
  }
  if (s % 2 === 0 && (s === 0 || hash01(bar * 16 + s) > 0.12)) {
    const pattern = phrase >= 2 ? ARP_B : ARP_A;
    const note = chord.tones[pattern[s / 2] % chord.tones.length] + 12;
    tone(k, { type: 'triangle', freq: mtof(note), dur: 0.2, gain: 0.05, lp: 2600 });
    if (x > 0.5) tone(k, { freq: mtof(note + 12), at: stepDur, dur: 0.16, gain: 0.02 * x }); // intensity layer: octave echo
  }
  if (s === 0) {
    for (const m of chord.tones) {
      tone(k, { type: 'triangle', freq: mtof(m), dur: stepDur * 16, gain: 0.02, attack: 0.3, hold: stepDur * 8, linear: true, lp: 1200 });
    }
  }
  if (phrase % 2 === 1) {
    for (const [at, m, len] of LEAD[bar % 8]) {
      if (at !== s) continue;
      tone(k, { type: 'triangle', freq: mtof(m), dur: stepDur * len * 1.2, gain: 0.06, hold: stepDur * len * 0.5, lp: 3000, vibrato: [5.5, 4] });
    }
  }
}

/** ~96 BPM: slow pads, a soft bass note and sparse plucks picked by a hash of the bar number. */
function menuStep(k: Sink, bar: number, s: number, stepDur: number): void {
  const chord = MENU_PROG[bar % 8];
  const barDur = stepDur * 16;
  if (s === 0) {
    for (const m of chord.tones) {
      tone(k, { type: 'triangle', freq: mtof(m), dur: barDur * 1.1, gain: 0.028, attack: 0.5, hold: barDur * 0.45, linear: true, lp: 1000 });
    }
    tone(k, { freq: mtof(chord.root), dur: barDur * 0.8, gain: 0.11, attack: 0.03, hold: barDur * 0.3 });
  }
  if (s === 10 && bar % 2 === 1) tone(k, { freq: mtof(chord.root + 7), dur: 0.6, gain: 0.06, attack: 0.02 });
  const steps = PLUCKS[Math.floor(hash01(bar * 7 + 3) * PLUCKS.length)];
  if (steps.includes(s)) {
    const m = chord.tones[Math.floor(hash01(bar * 16 + s) * chord.tones.length)] + 12;
    tone(k, { type: 'triangle', freq: mtof(m), dur: 0.55, gain: 0.055, lp: 2400 });
    tone(k, { freq: mtof(m), at: stepDur * 3, dur: 0.45, gain: 0.018 }); // faux delay tap
  }
  if (bar % 8 >= 4 && s % 4 === 2) drumHat(k, 0.012, 0.03);
}

function stopScheduler(): void {
  if (timer !== null) clearInterval(timer);
  timer = null;
}

function ensureScheduler(): void {
  if (timer === null && !userSuspended && players.length > 0) timer = setInterval(tick, TICK_MS);
}

/** Look-ahead scheduler: queues every 16th-note step that starts within the next LOOKAHEAD_S. */
function tick(): void {
  safely(() => {
    const e = engine;
    if (!e || e.ctx.state !== 'running') return;
    const now = e.ctx.currentTime;
    for (let n = players.length - 1; n >= 0; n--) {
      const p = players[n];
      if (p.endAt !== null && now >= p.endAt) {
        p.out.disconnect();
        players.splice(n, 1);
        continue;
      }
      if (p.nextTime < now) p.nextTime = now + 0.02; // late timer (throttled tab): skip ahead, never burst
      while (p.nextTime < now + LOOKAHEAD_S) {
        const sink: Sink = { e, out: p.out, t: p.nextTime };
        const bar = Math.floor(p.step / 16);
        if (p.track === 'match') matchStep(sink, bar, p.step % 16, p.stepDur, musicIntensity);
        else menuStep(sink, bar, p.step % 16, p.stepDur);
        p.step++;
        p.nextTime += p.stepDur;
      }
    }
    if (players.length === 0) stopScheduler();
  });
}

function fadeOutPlayers(e: Engine, seconds: number): void {
  const now = e.ctx.currentTime;
  for (const p of players) {
    if (p.endAt !== null) continue;
    p.out.gain.cancelScheduledValues(now);
    p.out.gain.setValueAtTime(p.out.gain.value, now);
    p.out.gain.linearRampToValueAtTime(0, now + seconds);
    p.endAt = now + seconds + 0.05;
  }
}

function beginTrack(e: Engine, track: MusicTrack): void {
  const now = e.ctx.currentTime;
  fadeOutPlayers(e, 0.9);
  const out = e.ctx.createGain();
  out.gain.setValueAtTime(0, now);
  out.gain.linearRampToValueAtTime(1, now + 0.9);
  out.connect(e.music);
  const bpm = track === 'match' ? 122 : 96;
  players.push({ track, out, step: 0, nextTime: now + 0.08, stepDur: 60 / bpm / 4, endAt: null });
  ensureScheduler();
}

// ---------------------------------------------------------------- public API

interface AudioApi {
  unlock(): void;
  applySettings(s: AudioSettings): void;
  play(name: SfxName, opts?: PlayOpts): void;
  setTetherHum(active: boolean, speed01?: number): void;
  setCrowd(level: number): void;
  cheer(intensity?: number): void;
  startMusic(track: 'menu' | 'match'): void;
  stopMusic(): void;
  setMusicIntensity(x: number): void;
  suspend(): void;
  resume(): void;
}

export const audio: AudioApi = {
  /** Call from a user gesture. Lazily creates the AudioContext (or resumes it). Safe to call repeatedly. */
  unlock(): void {
    safely(() => {
      lastUnlockMs = nowMs();
      if (!engine) {
        engine = createEngine();
        if (!engine) return;
        if (wantTrack) beginTrack(engine, wantTrack);
        syncCrowd(engine);
      }
      if (!userSuspended && engine.ctx.state !== 'running') {
        void Promise.resolve(engine.ctx.resume()).then(ensureScheduler, noop);
      }
    });
  },

  applySettings(s: AudioSettings): void {
    safely(() => {
      settings = {
        master: clamp(s.master, 0, 1, settings.master),
        music: clamp(s.music, 0, 1, settings.music),
        effects: clamp(s.effects, 0, 1, settings.effects),
        muted: s.muted === true,
      };
      if (engine) pushSettings(engine);
    });
  },

  play(name: SfxName, opts?: PlayOpts): void {
    safely(() => {
      const e = engine;
      if (!e || !canSound(e)) return;
      const ms = nowMs();
      if (ms - (lastPlayed.get(name) ?? -1e9) < RETRIGGER_MS) return;
      lastPlayed.set(name, ms);
      const i = clamp(opts?.intensity ?? 0.6, 0, 1, 0.6);
      const pan = clamp(opts?.pan ?? 0, -1, 1, 0);
      SFX[name]({ e, out: panned(e, pan), t: e.ctx.currentTime + 0.005, i });
    });
  },

  setTetherHum(active: boolean, speed01 = 0): void {
    safely(() => {
      const e = engine;
      if (!e) return;
      if (!active) {
        if (hum) releaseLayer(e, hum, 0.05);
        hum = null;
        return;
      }
      const now = e.ctx.currentTime;
      const sp = clamp(speed01, 0, 1, 0);
      const f = 110 * (1 + 0.4 * sp);
      const fresh = hum === null;
      const h = (hum ??= buildHum(e));
      if (fresh) {
        h.a.frequency.value = f;
        h.b.frequency.value = f * 2.005;
      }
      h.a.frequency.setTargetAtTime(f, now, 0.08);
      h.b.frequency.setTargetAtTime(f * 2.005, now, 0.08);
      h.lp.frequency.setTargetAtTime(450 + 650 * sp, now, 0.08);
      h.level.gain.setTargetAtTime(0.065 + 0.04 * sp, now, 0.06);
    });
  },

  setCrowd(level: number): void {
    safely(() => {
      crowdLevel = clamp(level, 0, 1, 0);
      if (engine) syncCrowd(engine);
    });
  },

  cheer(intensity = 0.7): void {
    safely(() => {
      const e = engine;
      const ms = nowMs();
      if (!e || !canSound(e) || ms - lastCheerMs < 200) return;
      lastCheerMs = ms;
      const i = clamp(intensity, 0, 1, 0.7);
      const sink: Sink = { e, out: e.sfx, t: e.ctx.currentTime + 0.01 };
      const dur = 1.2 + 0.9 * i;
      const sweep = noise(sink, { filter: 'bandpass', freq: 520, q: 0.7, dur, gain: 0.35 + 0.5 * i, attack: 0.3, hold: 0.2 + 0.3 * i });
      sweep.frequency.exponentialRampToValueAtTime(1300 + 500 * i, sink.t + 0.45);
      sweep.frequency.exponentialRampToValueAtTime(750, sink.t + dur);
      noise(sink, { freq: 600, dur: dur * 0.8, gain: 0.25 + 0.3 * i, attack: 0.3 });
    });
  },

  startMusic(track: 'menu' | 'match'): void {
    safely(() => {
      if (wantTrack === track) return;
      wantTrack = track;
      if (engine) beginTrack(engine, track);
    });
  },

  stopMusic(): void {
    safely(() => {
      wantTrack = null;
      if (engine) fadeOutPlayers(engine, 0.5); // the scheduler stops itself once the fade completes
    });
  },

  setMusicIntensity(x: number): void {
    musicIntensity = clamp(x, 0, 1, 0);
  },

  suspend(): void {
    safely(() => {
      userSuspended = true;
      stopScheduler();
      if (engine) void Promise.resolve(engine.ctx.suspend()).catch(noop);
    });
  },

  resume(): void {
    safely(() => {
      userSuspended = false;
      if (engine) void Promise.resolve(engine.ctx.resume()).then(ensureScheduler, noop);
    });
  },
};
