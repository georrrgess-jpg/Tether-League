/**
 * Audio graph and sample banks.
 *
 *   sfx voices ──► sfx (effects fader) ─────────────────────────────┐
 *        └──────► sfxRev (effects fader) ──► revIn ─► convolver ─► revOut ─┤
 *   music players ─► music (music fader) ─► mix (moment ducking) ──────────┤
 *        ├──────► musRev (music fader) ──► revIn                            ├─► master ─► limiter ─► clip ─► out
 *        └──────► musDly (music fader) ──► ping-pong delay ─► mix, revIn ──┘
 *
 * Banks are rendered by dsp.ts after the first gesture, in small jobs spread over timer ticks.
 */
import { applause, burst, clap, crowd, drum, epiano, impulse, metal, modal, rng, synth, type Chans, type SynthSpec } from './dsp';

export interface Engine {
  ctx: BaseAudioContext;
  sr: number;
  master: GainNode;
  sfx: GainNode;
  sfxRev: GainNode;
  music: GainNode;
  musRev: GainNode;
  musDly: GainNode;
  mix: GainNode;
  dlyL: DelayNode;
  dlyR: DelayNode;
  white: AudioBuffer;
  pink: AudioBuffer;
  /** Single-sample sounds (drums, impacts, crowd). */
  bufs: Map<string, AudioBuffer>;
  /** Multi-sampled pitched instruments. */
  banks: Map<string, Bank>;
  waves: Record<'warm' | 'bright' | 'soft', PeriodicWave>;
  jobs: Array<() => void>;
}

export interface Bank { roots: number[]; bufs: AudioBuffer[] }

/** Music level trim: the songs are mixed hot, this seats them under the effects. */
export const MUSIC_TRIM = 0.5;

function waves(ctx: BaseAudioContext): Engine['waves'] {
  const make = (n: number, amp: (k: number) => number): PeriodicWave => {
    const re = new Float32Array(n + 1);
    const im = new Float32Array(n + 1);
    for (let k = 1; k <= n; k++) im[k] = amp(k);
    return ctx.createPeriodicWave(re, im);
  };
  return {
    warm: make(24, (k) => Math.exp(-k / 7) / k),
    bright: make(40, (k) => 1 / k),
    soft: make(9, (k) => (k % 2 ? 1 / (k * k) : 0.12 / (k * k))),
  };
}

export function toBuffer(e: { ctx: BaseAudioContext }, ch: Chans, rate: number): AudioBuffer {
  const b = e.ctx.createBuffer(ch.length, ch[0].length, rate);
  ch.forEach((c, i) => b.getChannelData(i).set(c));
  return b;
}

function noiseBuffer(ctx: BaseAudioContext, sr: number, pink: boolean): AudioBuffer {
  const n = Math.floor(sr * 1.2);
  const b = ctx.createBuffer(1, n, sr);
  const d = b.getChannelData(0);
  const r = rng(pink ? 21 : 20);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    if (pink) {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.25;
    } else d[i] = w * 0.9;
  }
  // Crossfade the ends so looped noise has no seam, and remove any DC (pink noise drifts).
  const f = 512;
  for (let i = 0; i < f; i++) {
    const a = i / f;
    d[i] = d[i] * a + d[n - f + i] * (1 - a);
  }
  let dc = 0;
  for (let i = 0; i < n; i++) dc += d[i];
  dc /= n;
  for (let i = 0; i < n; i++) d[i] -= dc;
  return b;
}

// ---------------------------------------------------------------- instrument definitions

const BASS: SynthSpec = { dur: 1.3, saws: 1, detune: 0, sine: 0.45, cut: 300, env: 2100, etau: 0.09, q: 1.1, att: 0.003, tau: 0.35, sus: 0.7, drive: 1.6 };
const FBASS: SynthSpec = { dur: 1.2, saws: 1, detune: 0, sine: 1.0, pulse: 0.2, cut: 260, env: 1300, etau: 0.06, q: 0.9, att: 0.004, tau: 0.4, sus: 0.35, drive: 1.3 };
const PLUCK: SynthSpec = { dur: 0.75, saws: 2, detune: 9, pulse: 0.35, cut: 900, env: 6500, etau: 0.09, q: 1.3, poles: 2, att: 0.002, tau: 0.22, sus: 0, drive: 1.2 };
const STAB: SynthSpec = { dur: 0.8, saws: 3, detune: 16, cut: 1100, env: 5000, etau: 0.16, q: 0.9, poles: 2, att: 0.003, tau: 0.3, sus: 0.15, drive: 1.1 };
const LEAD: SynthSpec = { dur: 1.9, saws: 2, detune: 7, pulse: 0.55, sine: 0.3, cut: 6, key: true, env: 3500, etau: 0.12, q: 1.1, poles: 2, att: 0.008, tau: 0.5, sus: 0.75, drive: 1.3, vib: [0.22, 5.6, 0.2] };
const FLUTE: SynthSpec = { dur: 2.2, saws: 1, detune: 0, sine: 1.6, cut: 2.2, key: true, env: 600, etau: 0.1, q: 0.7, att: 0.05, tau: 0.6, sus: 0.8, drive: 1, vib: [0.18, 5, 0.25], breath: 0.25 };
const BELL = { dur: 1.8, ratios: [1, 2.76, 5.4, 8.93, 2, 4.07], decays: [1.2, 0.55, 0.25, 0.12, 0.8, 0.3], amps: [1, 0.45, 0.25, 0.12, 0.2, 0.1], stereo: true };
const MALLET = { dur: 1.3, ratios: [1, 3.93, 9.2, 2], decays: [0.55, 0.12, 0.04, 0.2], amps: [1, 0.35, 0.12, 0.06], strike: 0.25 };
const CLANG = { dur: 1.5, ratios: [1, 2.32, 2.95, 4.25, 5.6, 6.63, 9.38, 12.5], decays: [1.1, 0.8, 0.7, 0.5, 0.35, 0.3, 0.2, 0.12], amps: [1, 0.7, 0.4, 0.5, 0.3, 0.3, 0.2, 0.12], strike: 0.6, spread: 0.004, stereo: true };

/**
 * Instrument name -> roots and a renderer. `div` divides the output sample rate: most voices are
 * rendered at half rate (their content sits well below 12 kHz), which halves time and memory.
 * Order of the list = render order (menu first, then effects, then the match kit).
 */
type BankDef = readonly [name: string, roots: readonly number[], div: number, make: (sr: number, f: number) => Chans];
const fm = (m: number): number => 440 * 2 ** ((m - 69) / 12);
const BANKS: readonly BankDef[] = [
  ['keys', [52, 60, 68, 76], 2, (sr, f) => epiano(sr, f, 1.7)],
  ['fbass', [33, 45], 2, (sr, f) => synth(sr, f, FBASS)],
  ['mallet', [62, 70, 78, 86], 2, (sr, f) => modal(sr, f, MALLET)],
  ['bell', [84, 96], 1, (sr, f) => modal(sr, f, BELL)],
  ['flute', [66, 72, 78], 2, (sr, f) => synth(sr, f, FLUTE)],
  ['pluck', [62, 68, 74, 80, 86], 2, (sr, f) => synth(sr, f, PLUCK)],
  ['bass', [33, 45], 2, (sr, f) => synth(sr, f, BASS)],
  ['stab', [58, 66, 74], 2, (sr, f) => synth(sr, f, STAB)],
  ['lead', [66, 72, 78], 2, (sr, f) => synth(sr, f, LEAD)],
];

type BufDef = readonly [name: string, make: (sr: number) => Chans, div?: number];
const BUFS_EARLY: readonly BufDef[] = [
  ['thump', (sr) => drum(sr, { dur: 0.32, f0: 240, f1: 68, ptau: 0.026, snap: 300, tau: 0.075, hold: 0.004, drive: 1.5, click: 0.5, nz: 0.3, nf: 900, ntau: 0.02 })],
];
const BUFS: readonly BufDef[] = [
  ['mkick', (sr) => drum(sr, { dur: 0.45, f0: 125, f1: 50, ptau: 0.04, snap: 160, tau: 0.17, hold: 0.02, drive: 1.3, click: 0.18 })],
  ['snare', (sr) => clap(sr, { dur: 0.35, bursts: 1, gap: 0, tail: 0.075, f: 1900, q: 0.7, body: 0.55, bodyF: 190, bright: 0.3 })],
  ['shk', (sr) => burst(sr, { dur: 0.12, f: 6000, q: 1, attack: 0.012, tau: 0.035 })],
  ['rim', (sr) => burst(sr, { dur: 0.1, f: 2300, q: 3, attack: 0.0008, tau: 0.008, tone: 1450, toneTau: 0.025, tone2: 2280 })],
  ['snap', (sr) => burst(sr, { dur: 0.15, f: 2600, q: 1.6, attack: 0.0012, tau: 0.022 })],
  ['ohat', (sr) => metal(sr, { dur: 0.6, tau: 0.17, scale: 1.4, f: 9500, noise: 0.5 })],
  ['tom', (sr) => drum(sr, { dur: 0.5, f0: 190, f1: 112, ptau: 0.06, tau: 0.2, drive: 1.2, click: 0.1, nz: 0.12, nf: 700, ntau: 0.03 }), 2],
  ['clang', (sr) => modal(sr, 520, CLANG), 2],
  ['crunch', (sr) => burst(sr, { dur: 0.25, f: 1300, q: 0.6, attack: 0.001, tau: 0.045, tone: 82, toneTau: 0.08, tone2: 123 }), 2],
  ['boom', (sr) => drum(sr, { dur: 1.5, f0: 110, f1: 33, ptau: 0.14, snap: 120, tau: 0.42, hold: 0.04, drive: 1.6, click: 0.25, nz: 0.25, nf: 400, ntau: 0.12 }), 2],
  ['crowd', (sr) => crowd(sr, 5), 3],
  ['applause', (sr) => applause(sr, 2.5, 150), 2],
  ['kick', (sr) => drum(sr, { dur: 0.36, f0: 180, f1: 54, ptau: 0.03, snap: 280, tau: 0.12, hold: 0.025, drive: 2, click: 0.36 })],
  ['clap', (sr) => clap(sr, { dur: 0.45, bursts: 4, gap: 0.0105, tail: 0.11, f: 1350, q: 1.1, body: 0.2, bodyF: 210, bright: 0.25 })],
  ['hat', (sr) => metal(sr, { dur: 0.15, tau: 0.035, scale: 1.4, f: 8800, noise: 0.45 })],
  ['crash', (sr) => metal(sr, { dur: 1.7, tau: 0.55, scale: 2.1, f: 7000, noise: 0.9, attack: 0.002 })],
];

const ORDER = [
  'mkick', 'snare', 'shk', 'rim', 'snap', 'ohat', 'tom', 'keys', 'fbass', 'mallet', 'bell', 'flute', 'pluck',
  'clang', 'crunch', 'boom', 'crash', 'stab', 'crowd', 'applause',
  'kick', 'clap', 'hat', 'bass', 'lead',
];

/** Builds the graph. Heavy renders are queued in `jobs`; pass sync to run them all now (offline use). */
export function buildEngine(ctx: BaseAudioContext, sync: boolean): Engine {
  const sr = Math.min(ctx.sampleRate, 48000);
  const g = (v: number, to?: AudioNode): GainNode => {
    const n = ctx.createGain();
    n.gain.value = v;
    if (to) n.connect(to);
    return n;
  };
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 4;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.14;
  const clip = ctx.createWaveShaper();
  const curve = new Float32Array(2049);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / 1024) - 1;
    const a = Math.abs(x);
    curve[i] = Math.sign(x) * (a < 0.82 ? a : 0.82 + 0.16 * Math.tanh((a - 0.82) / 0.16));
  }
  clip.curve = curve;
  limiter.connect(clip);
  clip.connect(ctx.destination);
  const master = g(0.8, limiter);
  const mix = g(1, master);
  const music = g(0.5, mix);
  const sfx = g(0.8, master);
  const revOut = g(1, master);
  const conv = ctx.createConvolver();
  conv.normalize = true;
  conv.connect(revOut);
  const revIn = g(1, conv);
  const sfxRev = g(0.8, revIn);
  const musRev = g(0.5, revIn);
  // Ping-pong delay with a darkening feedback loop (gain < 0.5 keeps it bounded).
  const musDly = g(0.5);
  const dlyL = ctx.createDelay(1.5);
  const dlyR = ctx.createDelay(1.5);
  const fb = g(0.36);
  const fbLp = ctx.createBiquadFilter();
  fbLp.type = 'lowpass';
  fbLp.frequency.value = 3200;
  const fbHp = ctx.createBiquadFilter();
  fbHp.type = 'highpass';
  fbHp.frequency.value = 280;
  const merge = ctx.createChannelMerger(2);
  const dOut = g(0.55, mix);
  dOut.connect(g(0.35, revIn));
  musDly.connect(fbHp);
  fbHp.connect(dlyL);
  dlyL.connect(dlyR);
  dlyR.connect(fb);
  fb.connect(fbLp);
  fbLp.connect(dlyL);
  dlyL.connect(merge, 0, 0);
  dlyR.connect(merge, 0, 1);
  merge.connect(dOut);

  const e: Engine = {
    ctx, sr, master, sfx, sfxRev, music, musRev, musDly, mix, dlyL, dlyR,
    white: noiseBuffer(ctx, sr, false),
    pink: null as unknown as AudioBuffer,
    bufs: new Map(),
    banks: new Map(),
    waves: waves(ctx),
    jobs: [],
  };
  e.pink = e.white; // until the pink job below has run
  e.jobs.push(() => {
    e.pink = noiseBuffer(ctx, sr, true);
  });
  // The reverb impulse (and the convolver's FFT set-up) waits for the first job, off the gesture.
  e.jobs.push(() => {
    conv.buffer = toBuffer(e, impulse(sr, 1.8, 1.5), sr);
  });
  // The impact thump is the first job: every gameplay sound leans on it.
  for (const [name, make] of BUFS_EARLY) e.jobs.unshift(() => e.bufs.set(name, toBuffer(e, make(sr), sr)));
  const named: Array<[string, () => void]> = [];
  for (const [name, make, div] of BUFS) {
    named.push([name, () => {
      const rate = sr / (div ?? 1);
      e.bufs.set(name, toBuffer(e, make(rate), rate));
    }]);
  }
  for (const [name, roots, div, make] of BANKS) {
    const bank: Bank = { roots: [], bufs: [] };
    for (const m of roots) {
      named.push([name, () => {
        const rate = sr / div;
        bank.bufs.push(toBuffer(e, make(rate, fm(m)), rate));
        bank.roots.push(m);
        if (bank.roots.length === roots.length) e.banks.set(name, bank);
      }]);
    }
  }
  // Menu kit first (music can start), then common effects, then the match kit.
  const rank = (n: string): number => {
    const i = ORDER.indexOf(n);
    return i < 0 ? ORDER.length : i;
  };
  named.sort((x, y) => rank(x[0]) - rank(y[0]));
  for (const [, job] of named) e.jobs.push(job);
  if (sync) while (e.jobs.length) e.jobs.shift()?.();
  return e;
}

/** Runs queued renders for up to `budgetMs`; returns true while work remains. */
export function pump(e: Engine, budgetMs: number): boolean {
  const start = performance.now();
  while (e.jobs.length && performance.now() - start < budgetMs) e.jobs.shift()?.();
  return e.jobs.length > 0;
}

export const hasAll = (e: Engine, names: readonly string[]): boolean =>
  names.every((n) => e.bufs.has(n) || e.banks.has(n));

export function setDelayTime(e: Engine, seconds: number, at: number): void {
  e.dlyL.delayTime.setTargetAtTime(seconds, at, 0.05);
  e.dlyR.delayTime.setTargetAtTime(seconds, at, 0.05);
}

/** Picks the buffer and playback rate for a MIDI note from a bank (or a single buffer, semitone offset). */
export function source(e: Engine, name: string, m: number): { buf: AudioBuffer; rate: number } | null {
  const bank = e.banks.get(name);
  if (bank) {
    let best = 0;
    for (let k = 1; k < bank.roots.length; k++) {
      if (Math.abs(bank.roots[k] - m) < Math.abs(bank.roots[best] - m)) best = k;
    }
    return { buf: bank.bufs[best], rate: 2 ** ((m - bank.roots[best]) / 12) };
  }
  const buf = e.bufs.get(name);
  return buf ? { buf, rate: 2 ** (m / 12) } : null;
}

/**
 * Plays a sample note. `d` (seconds) ends a sustained note with a short release; without it the
 * sample plays out (its own tail is faded to silence). Returns the source, or null if not loaded.
 */
export function sampleNote(e: Engine, name: string, m: number, t: number, v: number, dest: AudioNode, d?: number, rel = 0.06, extra?: AudioNode): AudioBufferSourceNode | null {
  const s = source(e, name, m);
  if (!s || v <= 0) return null;
  const { ctx } = e;
  const src = ctx.createBufferSource();
  const amp = ctx.createGain();
  src.buffer = s.buf;
  src.playbackRate.value = s.rate;
  amp.gain.value = v;
  src.connect(amp);
  amp.connect(dest);
  if (extra) amp.connect(extra);
  const natural = s.buf.duration / s.rate;
  let stop = t + natural;
  if (d !== undefined && d + rel < natural) {
    amp.gain.setValueAtTime(v, t + d);
    amp.gain.linearRampToValueAtTime(0, t + d + rel);
    stop = t + d + rel + 0.01;
  }
  src.onended = () => {
    src.disconnect();
    amp.disconnect();
  };
  src.start(t);
  src.stop(stop);
  return src;
}
