/**
 * Tether League audio.
 *
 * Every sound and every bar of music is generated in code (WebAudio plus pre-rendered sample
 * synthesis in dsp.ts): no audio files, no network, no third-party assets. The module is
 * import-safe outside the browser: nothing touches WebAudio until unlock().
 *
 * Public API (all calls are cheap, never throw, and are silent no-ops before unlock()):
 *
 *   audio.unlock()                      Call from a user gesture. Creates/resumes the context; sample
 *                                       banks then render in small chunks (music starts once ready).
 *   audio.applySettings(s)              master / music / effects volume (0..1) and mute.
 *   audio.play(name, { intensity, pan, heavy })
 *                                       One-shot effect. intensity 0..1 (default 0.6), pan -1..1,
 *                                       heavy = meatier swing-kick variant for 'kick'.
 *   audio.charge(level | null)          Long-ball charge voice: one held voice whose pitch and
 *                                       brightness glide with level 0..1; null releases it. Call every
 *                                       frame while charging. A voice not refreshed for 0.3 s fades
 *                                       out by itself, so a missed null cannot leave it stuck.
 *                                       audio.play('lobCharge', { intensity }) is the same as charge(intensity).
 *   audio.cheer(intensity)              Crowd swell with applause (whistles when big).
 *   audio.setCrowd(level)               Stadium ambience bed (crowd murmur + room tone), 0 = off.
 *   audio.setTetherHum(active, speed01) Rope tension + wind while swinging.
 *   audio.startMusic('menu' | 'match')  Crossfades to a track (restarts the match track after an outro).
 *   audio.stopMusic()
 *   audio.setMusicIntensity(x)          Match music energy 0..1. Layers react per bar; also nudged by play.
 *   audio.musicCue(cue)                 'goal' (fill + crash into the hook), 'concede' (filter dip),
 *                                       'overtime' (jump to the build), 'win' | 'lose' | 'draw' (outro).
 *   audio.suspend() / audio.resume()    Pause and background handling.
 *
 * Routing and instruments live in engine.ts, sample synthesis in dsp.ts, songs in music.ts, effect
 * recipes and per-effect levels in sfx.ts. `audioLab` (bottom) renders offline for measurement only.
 */
import { buildEngine, hasAll, MUSIC_TRIM, pump, sampleNote, setDelayTime, type Engine } from './engine';
import { barsIn, chordAt, SONGS, type Inst, type Out, type OutroKind, type Song } from './music';
import { DYNAMIC, finish, LEVEL, LOW_PRIORITY, nz, o, RETRIGGER, SFX, swell, type SfxName, type Shot } from './sfx';

export type { SfxName } from './sfx';

/** Volumes are 0..1. */
export interface AudioSettings { master: number; music: number; effects: number; muted: boolean }

/** intensity 0..1 (default 0.6), pan -1..1, heavy: swing-kick variant. */
export interface PlayOpts { intensity?: number; pan?: number; heavy?: boolean }

export type MusicCue = 'goal' | 'concede' | 'overtime' | OutroKind;
type MusicTrack = 'menu' | 'match';
type AudioCtor = typeof AudioContext;

const TICK_MS = 40;
const LOOKAHEAD_S = 0.22;
const MAX_SHOTS = 32;
const RAMP = 0.03;

const noop = (): void => {};
const nowMs = (): number => Date.now();
const mtof = (m: number): number => 440 * 2 ** ((m - 69) / 12);
const clamp = (x: number, lo: number, hi: number, fallback: number): number =>
  Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : fallback;
/** Freezes a param at its current automated value (Safari's .value can lag behind automation). */
function holdAt(p: AudioParam, t: number): void {
  const q = p as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam };
  if (typeof q.cancelAndHoldAtTime === 'function') q.cancelAndHoldAtTime(t);
  else {
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
  }
}
function safely(fn: () => void): void {
  try {
    fn();
  } catch {
    /* audio must never break the game */
  }
}

/** Per-instrument level, whether it bypasses the side-chain (drums), and release time. */
const MIX: Record<Inst, readonly [gain: number, drum: boolean, rel: number]> = {
  kick: [0.36, true, 0], mkick: [0.36, true, 0], clap: [0.62, true, 0], snare: [0.82, true, 0],
  hat: [0.32, true, 0], ohat: [0.26, true, 0], shk: [0.32, true, 0], tom: [0.45, true, 0],
  crash: [0.38, true, 0], rim: [0.5, true, 0], snap: [0.6, true, 0],
  bass: [0.3, false, 0.04], fbass: [0.34, false, 0.05], keys: [0.3, false, 0.15], pluck: [0.3, false, 0.05],
  stab: [0.27, false, 0.08], lead: [0.32, false, 0.09], flute: [0.22, false, 0.12], mallet: [0.45, false, 0.1],
  bell: [0.26, false, 0.2],
};

// ---------------------------------------------------------------- state

interface Player {
  track: MusicTrack;
  song: Song;
  out: GainNode;
  lp: BiquadFilterNode;
  dry: GainNode; dryL: AudioNode; dryR: AudioNode;
  duck: GainNode; L: AudioNode; R: AudioNode;
  padL: BiquadFilterNode; padR: BiquadFilterNode;
  d1: GainNode; d2: GainNode;
  nodes: AudioNode[];
  io: Out;
  started: boolean;
  t0: number; step: number; sd: number;
  sec: number; bar: number; loop: number;
  x: number; xAt: number;
  jumpStep: number; jumpTo: readonly [string, number]; fillFrom: number;
  outro: OutroKind | null;
  endAt: number | null;
  /** Lab only: play just these instruments ('pad' and 'riser' included). */
  solo?: ReadonlySet<string>;
}

interface Voice { level: GainNode; srcs: AudioScheduledSourceNode[]; nodes: AudioNode[] }
interface Hum extends Voice { a: OscillatorNode; b: OscillatorNode; bp: BiquadFilterNode; wbp: BiquadFilterNode; wg: GainNode }
interface Charge extends Voice { a: OscillatorNode; b: OscillatorNode; lp: BiquadFilterNode; trem: OscillatorNode; depth: GainNode; seen: number }

let engine: Engine | null = null;
let settings: AudioSettings = { master: 0.8, music: 0.5, effects: 0.8, muted: false };
let userSuspended = false;
let lastUnlockMs = -1e9;
let lastCheerMs = -1e9;
let lastTickMs = -1e9;
let listening = false;
const lastPlayed = new Map<SfxName, number>();
const shotEnds: number[] = [];
let hum: Hum | null = null;
let charge: Charge | null = null;
let bed: Voice | null = null;
let crowdLevel = 0;
let wantTrack: MusicTrack | null = null;
let musicTarget = 0;
let activity = 0;
let activityAt = 0;
let players: Player[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
let pumping = false;
/** [AudioContext construction ms, graph build ms] of the first unlock (diagnostics). */
let unlockCost: [number, number] = [0, 0];

// ---------------------------------------------------------------- engine

function createEngine(): Engine | null {
  const g = globalThis as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (!Ctor) return null;
  const t0 = performance.now();
  const ctx = new Ctor({ latencyHint: 'interactive' });
  const t1 = performance.now();
  const e = buildEngine(ctx, false);
  unlockCost = [+(t1 - t0).toFixed(1), +(performance.now() - t1).toFixed(1)];
  pushSettings(e, settings);
  // iOS: a silent buffer started inside the gesture fully unlocks output.
  const silent = ctx.createBufferSource();
  silent.buffer = ctx.createBuffer(1, 1, 22050);
  silent.connect(ctx.destination);
  silent.start(0);
  ctx.onstatechange = () => safely(() => {
    if (ctx.state === 'running') ensureScheduler();
  });
  return e;
}

function pushSettings(e: Engine, s: AudioSettings): void {
  const t = e.ctx.currentTime;
  const set = (n: GainNode, v: number): void => {
    n.gain.setTargetAtTime(v, t, RAMP);
  };
  set(e.master, s.muted ? 0 : s.master);
  set(e.sfx, s.effects);
  set(e.sfxRev, s.effects);
  for (const n of [e.music, e.musRev, e.musDly]) set(n, s.music * MUSIC_TRIM);
}

/** Renders queued sample banks in short slices (about 10 ms, then yield), so unlock and frames stay smooth. */
function startPump(e: Engine): void {
  if (pumping) return;
  pumping = true;
  const step = (): void => safely(() => {
    if (engine !== e) return;
    if (pump(e, 10)) setTimeout(step, 8);
    else pumping = false;
    if (crowdLevel > 0 && !bed) syncCrowd(e);
  });
  setTimeout(step, 30);
}

function running(e: Engine): boolean {
  return (e.ctx as AudioContext).state === 'running';
}

/** One-shots only sound while the context runs (or within the unlock gesture's start-up grace). */
function canSound(e: Engine): boolean {
  return !userSuspended && (running(e) || nowMs() - lastUnlockMs < 400);
}

function resumeCtx(e: Engine): void {
  void Promise.resolve((e.ctx as AudioContext).resume()).then(ensureScheduler, noop);
}

/** Re-resume after iOS interruptions or a gesture that did not count as activation. */
function listen(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  const poke = (): void => safely(() => {
    const e = engine;
    if (e && !userSuspended && !running(e)) resumeCtx(e);
  });
  for (const ev of ['touchend', 'pointerup', 'click', 'keydown', 'focus', 'pageshow']) {
    window.addEventListener(ev, poke, { capture: true, passive: true });
  }
}

// ---------------------------------------------------------------- one-shots

function newShot(e: Engine, t: number, i: number, heavy: boolean): Shot {
  return { e, t, i, h: heavy, out: e.ctx.createGain(), end: 0, last: null, nodes: [], rev: 0 };
}

/** Routes a built shot to the effects bus (panned, with its reverb send) and schedules cleanup. */
function launch(e: Engine, k: Shot, pan: number): void {
  const extra: AudioNode[] = [k.out];
  if (Math.abs(pan) > 0.02 && typeof e.ctx.createStereoPanner === 'function') {
    const p = e.ctx.createStereoPanner();
    p.pan.value = pan * 0.8;
    k.out.connect(p);
    p.connect(e.sfx);
    extra.push(p);
  } else k.out.connect(e.sfx);
  if (k.rev > 0) {
    const s = e.ctx.createGain();
    s.gain.value = k.rev;
    k.out.connect(s);
    s.connect(e.sfxRev);
    extra.push(s);
  }
  finish(k, extra);
  if (k.duck) duckMusic(e, k.t, k.duck[0], k.duck[1]);
  shotEnds.push(k.end);
}

function duckMusic(e: Engine, t: number, depth: number, hold: number): void {
  const g = e.mix.gain;
  g.setTargetAtTime(depth, t, 0.04);
  g.setTargetAtTime(1, t + hold, 0.5);
}

const ACTIVITY: Partial<Record<SfxName, number>> = { kick: 0.12, goal: 1, post: 0.3, wallBoost: 0.15, tetherAttach: 0.06, lob: 0.15, perfect: 0.2, play: 0.25 };

function bumpActivity(e: Engine, amount: number): void {
  decayActivity(e);
  activity = Math.min(1, activity + amount);
}
function decayActivity(e: Engine): void {
  const t = e.ctx.currentTime;
  activity *= Math.exp(-Math.max(0, t - activityAt) / 5);
  activityAt = t;
}

/** Builds and launches a one-shot at time t. Shared by the live API and the offline lab. */
function playAt(e: Engine, name: SfxName, t: number, i: number, pan: number, heavy: boolean): void {
  if (name === 'lobCharge') return;
  const now = e.ctx.currentTime;
  for (let n = shotEnds.length - 1; n >= 0; n--) if (shotEnds[n] < now) shotEnds.splice(n, 1);
  if (shotEnds.length >= MAX_SHOTS || (shotEnds.length >= MAX_SHOTS * 0.7 && LOW_PRIORITY.has(name))) return;
  const k = newShot(e, t, i, heavy);
  k.out.gain.value = LEVEL[name] * (DYNAMIC.has(name) ? 0.3 + 0.7 * i * i : 1);
  SFX[name](k);
  launch(e, k, pan);
  const act = ACTIVITY[name];
  if (act) bumpActivity(e, act * (name === 'kick' ? i : 1));
}

// ---------------------------------------------------------------- hum, charge, crowd

function release(e: Engine, v: Voice, tau: number, now = e.ctx.currentTime): void {
  holdAt(v.level.gain, now);
  v.level.gain.setTargetAtTime(0, now, tau);
  const first = v.srcs[0];
  if (first) first.onended = () => [...v.srcs, ...v.nodes, v.level].forEach((n) => n.disconnect());
  for (const s of v.srcs) s.stop(now + tau * 8);
}

function osc(e: Engine, wave: 'warm' | 'bright' | 'soft' | OscillatorType, f: number, to: AudioNode): OscillatorNode {
  const n = e.ctx.createOscillator();
  if (wave === 'warm' || wave === 'bright' || wave === 'soft') n.setPeriodicWave(e.waves[wave]);
  else n.type = wave;
  n.frequency.value = f;
  n.connect(to);
  return n;
}

function biquad(e: Engine, type: BiquadFilterType, f: number, q: number, to: AudioNode): BiquadFilterNode {
  const b = e.ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  b.connect(to);
  return b;
}

function gainNode(e: Engine, v: number, to?: AudioNode): GainNode {
  const g = e.ctx.createGain();
  g.gain.value = v;
  if (to) g.connect(to);
  return g;
}

function buildHum(e: Engine): Hum {
  const level = gainNode(e, 0, e.sfx);
  const bp = biquad(e, 'bandpass', 300, 2.5, level);
  const a = osc(e, 'warm', 110, bp);
  const mix = gainNode(e, 0.4, bp);
  const b = osc(e, 'sine', 220, mix);
  const wg = gainNode(e, 0, level);
  const wbp = biquad(e, 'bandpass', 600, 0.9, wg);
  const wind = e.ctx.createBufferSource();
  wind.buffer = e.pink;
  wind.loop = true;
  wind.connect(wbp);
  const t = e.ctx.currentTime;
  a.start(t);
  b.start(t);
  wind.start(t, Math.random());
  return { level, srcs: [a, b, wind], nodes: [bp, mix, wg, wbp], a, b, bp, wbp, wg };
}

function setHum(e: Engine, active: boolean, speed01: number, now = e.ctx.currentTime): void {
  if (!active) {
    if (hum) release(e, hum, 0.05, now);
    hum = null;
    return;
  }
  const sp = clamp(speed01, 0, 1, 0);
  const f = 98 * (1 + 0.5 * sp);
  const h = (hum ??= buildHum(e));
  h.a.frequency.setTargetAtTime(f, now, 0.08);
  h.b.frequency.setTargetAtTime(f * 2.01, now, 0.08);
  h.bp.frequency.setTargetAtTime(f * 2.4 + 300 * sp, now, 0.08);
  h.wbp.frequency.setTargetAtTime(500 + 2600 * sp, now, 0.1);
  h.wg.gain.setTargetAtTime(0.02 + 0.2 * sp * sp, now, 0.08);
  h.level.gain.setTargetAtTime(0.12 + 0.06 * sp, now, 0.06);
}

function buildCharge(e: Engine): Charge {
  const level = gainNode(e, 0, e.sfx);
  const amp = gainNode(e, 0.7, level);
  const lp = biquad(e, 'lowpass', 900, 2.2, amp);
  const a = osc(e, 'bright', 160, lp);
  const mix = gainNode(e, 0.35, lp);
  const b = osc(e, 'sine', 320, mix);
  b.detune.value = 8;
  const depth = gainNode(e, 0);
  depth.connect(amp.gain);
  const trem = osc(e, 'sine', 7, depth);
  const t = e.ctx.currentTime;
  for (const s of [a, b, trem]) s.start(t);
  return { level, srcs: [a, b, trem], nodes: [amp, lp, mix, depth], a, b, lp, trem, depth, seen: nowMs() };
}

function setCharge(e: Engine, level: number | null, t: number): void {
  if (level === null || !Number.isFinite(level)) {
    if (charge) release(e, charge, 0.03, t);
    charge = null;
    return;
  }
  const lv = clamp(level, 0, 1, 0);
  const c = (charge ??= buildCharge(e));
  c.seen = nowMs();
  const f = 160 * 2 ** (lv * 2.3);
  c.a.frequency.setTargetAtTime(f, t, 0.03);
  c.b.frequency.setTargetAtTime(f * 2, t, 0.03);
  c.lp.frequency.setTargetAtTime(700 + 4200 * lv, t, 0.04);
  c.trem.frequency.setTargetAtTime(6 + 12 * lv, t, 0.05);
  c.depth.gain.setTargetAtTime(0.3 * lv, t, 0.05);
  c.level.gain.setTargetAtTime(0.05 + 0.09 * lv, t, 0.03);
}

function buildBed(e: Engine): Voice | null {
  const buf = e.bufs.get('crowd');
  if (!buf) return null;
  const level = gainNode(e, 0, e.sfx);
  const g1 = gainNode(e, 0.8, level);
  const lp = biquad(e, 'lowpass', 2400, 0.6, g1);
  const src = e.ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.connect(lp);
  const depth = gainNode(e, 0.22);
  depth.connect(g1.gain);
  const lfo = osc(e, 'sine', 0.06, depth);
  const g2 = gainNode(e, 0.3, level);
  const lp2 = biquad(e, 'lowpass', 220, 0.6, g2);
  const room = e.ctx.createBufferSource();
  room.buffer = e.pink;
  room.loop = true;
  room.connect(lp2);
  const t = e.ctx.currentTime;
  src.start(t, Math.random() * buf.duration);
  room.start(t, Math.random());
  lfo.start(t);
  return { level, srcs: [src, room, lfo], nodes: [g1, lp, g2, lp2, depth] };
}

function syncCrowd(e: Engine): void {
  if (crowdLevel <= 0.001) {
    if (bed) release(e, bed, 0.4);
    bed = null;
    return;
  }
  bed ??= buildBed(e);
  bed?.level.gain.setTargetAtTime(crowdLevel * 0.32, e.ctx.currentTime, 0.5);
}

function cheerAt(e: Engine, t: number, i: number): void {
  const k = newShot(e, t, i, false);
  swell(k, 'crowd', { g: 0.16 + 0.26 * i, a: 0.22, h: 0.3 + 0.6 * i, d: 1.6 + i, rate: 1.06 + 0.08 * i, f: 1700, gain: 7 });
  swell(k, 'applause', { g: 0.06 + 0.16 * i, a: 0.12, h: 0.7 + 1.1 * i, d: 1.3, type: 'highpass', f: 400, q: 0.5 });
  if (i > 0.7) {
    o(k, { f: 1900, f2: 2700, gl: 0.22, g: 0.035, a: 0.05, h: 0.15, d: 0.25, at: 0.35, vib: [7, 25, 0] });
    o(k, { f: 2300, f2: 1800, gl: 0.4, g: 0.025, a: 0.05, h: 0.1, d: 0.3, at: 0.8 });
    nz(k, { f: 650, f2: 1100, gl: 0.4, q: 3, g: 0.1 * i, a: 0.15, h: 0.25, d: 0.6 });
  }
  launch(e, k, 0);
}

// ---------------------------------------------------------------- music players

function makePlayer(e: Engine, track: MusicTrack, now: number): Player {
  const ctx = e.ctx;
  const song = SONGS[track];
  const pan = (v: number, to: AudioNode): AudioNode => {
    if (typeof ctx.createStereoPanner !== 'function') return gainNode(e, 1, to);
    const p = ctx.createStereoPanner();
    p.pan.value = v;
    p.connect(to);
    return p;
  };
  const out = gainNode(e, 0, e.music);
  out.gain.setValueAtTime(0, now);
  const hp = biquad(e, 'highpass', 28, 0.7, out); // DC and sub-rumble guard
  let head: AudioNode = hp;
  const eq: AudioNode[] = [];
  for (const [type, f, gain, q] of song.eq) {
    const b = biquad(e, type, f, q, head);
    b.gain.value = gain;
    eq.push(b);
    head = b;
  }
  const lp = biquad(e, 'lowpass', 20000, 0.5, head);
  const dry = gainNode(e, 1, lp);
  const dryL = pan(-0.6, lp);
  const dryR = pan(0.6, lp);
  const duck = gainNode(e, 1, lp);
  const L = pan(-0.75, duck);
  const R = pan(0.75, duck);
  const wideL = pan(-0.95, duck);
  const wideR = pan(0.95, duck);
  const padL = biquad(e, 'lowpass', 1800, 0.7, wideL);
  const padR = biquad(e, 'lowpass', 1800, 0.7, wideR);
  const d1 = gainNode(e, 0.28, e.musDly);
  const d2 = gainNode(e, 0.55, e.musDly);
  const rv1 = gainNode(e, 0.3, e.musRev);
  const rv2 = gainNode(e, 0.07, e.musRev);
  duck.connect(rv1);
  dry.connect(rv2);
  const p: Player = {
    track, song, out, lp, dry, dryL, dryR, duck, L, R, padL, padR, d1, d2,
    nodes: [out, hp, ...eq, lp, dry, dryL, dryR, duck, L, R, wideL, wideR, padL, padR, d1, d2, rv1, rv2],
    io: null as unknown as Out,
    started: false, t0: now, step: 0, sd: 60 / song.bpm / 4,
    sec: 0, bar: 0, loop: 0, x: 0.3, xAt: now,
    jumpStep: -1, jumpTo: ['A', 0], fillFrom: -1, outro: null, endAt: null,
  };
  p.io = output(e, p);
  return p;
}

function output(e: Engine, p: Player): Out {
  const ctx = e.ctx;
  return {
    n(inst, m, t, v, op) {
      if (p.solo && !p.solo.has(inst)) return;
      const [g, drum, rel] = MIX[inst];
      const side = op?.pan ?? 0;
      const dest = drum ? (side < 0 ? p.dryL : side > 0 ? p.dryR : p.dry) : side < 0 ? p.L : side > 0 ? p.R : p.duck;
      const send = op?.dly === 1 ? p.d1 : op?.dly === 2 ? p.d2 : undefined;
      sampleNote(e, inst, m, t, v * g, dest, drum ? undefined : op?.d, rel, send);
    },
    pad(notes, t, d, v) {
      if (p.solo && !p.solo.has('pad')) return;
      const peak = v * 0.03;
      for (const m of notes) {
        for (const side of [0, 1]) {
          const n = ctx.createOscillator();
          const amp = ctx.createGain();
          amp.gain.value = 0;
          n.setPeriodicWave(e.waves.warm);
          n.frequency.value = mtof(m);
          n.detune.value = side ? 6 : -6;
          amp.gain.setValueAtTime(0, t);
          amp.gain.linearRampToValueAtTime(peak, t + 0.35);
          amp.gain.setValueAtTime(peak, t + Math.max(0.36, d - 0.1));
          amp.gain.linearRampToValueAtTime(0, t + d + 0.6);
          n.connect(amp);
          amp.connect(side ? p.padR : p.padL);
          n.onended = () => {
            n.disconnect();
            amp.disconnect();
          };
          n.start(t);
          n.stop(t + d + 0.62);
        }
      }
    },
    duck(t, depth) {
      p.duck.gain.setTargetAtTime(depth, t, 0.004);
      p.duck.gain.setTargetAtTime(1, t + 0.03, 0.075);
    },
    riser(t, d, v) {
      if (p.solo && !p.solo.has('riser')) return;
      const src = ctx.createBufferSource();
      const bp = ctx.createBiquadFilter();
      const amp = ctx.createGain();
      src.buffer = e.white;
      src.loop = true;
      amp.gain.value = 0;
      bp.type = 'bandpass';
      bp.Q.value = 1.8;
      bp.frequency.setValueAtTime(350, t);
      bp.frequency.exponentialRampToValueAtTime(7500, t + d);
      amp.gain.setValueAtTime(0, t);
      amp.gain.linearRampToValueAtTime(v * 0.05, t + d * 0.6);
      amp.gain.linearRampToValueAtTime(v * 0.14, t + d);
      amp.gain.linearRampToValueAtTime(0, t + d + 0.04);
      src.connect(bp);
      bp.connect(amp);
      amp.connect(p.dry);
      amp.connect(p.d2);
      src.onended = () => [src, bp, amp].forEach((n) => n.disconnect());
      src.start(t, Math.random());
      src.stop(t + d + 0.06);
    },
    tone(t, hz, tau) {
      p.lp.frequency.setTargetAtTime(hz, t, tau);
    },
  };
}

function targetIntensity(e: Engine, track: MusicTrack): number {
  if (track !== 'match') return 0;
  decayActivity(e);
  return Math.min(1, 0.2 + 0.8 * musicTarget + 0.4 * activity);
}

function nextBar(p: Player): void {
  const order = p.song.order;
  if (p.jumpStep >= 0 && p.step >= p.jumpStep) {
    const i = order.indexOf(p.jumpTo[0]);
    p.sec = i < 0 ? 0 : i;
    p.bar = p.jumpTo[1];
    p.jumpStep = -1;
    p.fillFrom = -1;
    return;
  }
  p.bar++;
  if (p.bar >= barsIn(p.song, order[p.sec])) {
    p.sec++;
    if (p.sec >= order.length) {
      p.sec = 0;
      p.loop++;
    }
    p.bar = p.song.enter?.(order[p.sec], p.x) ?? 0;
  }
}

/** Schedules every step that starts before `horizon`. Missed steps (throttled timers) are skipped on the grid. */
function fillPlayer(e: Engine, p: Player, now: number, horizon: number): void {
  if (!p.started) {
    if (!hasAll(e, p.song.needs)) return;
    p.started = true;
    p.t0 = now + 0.08;
    p.out.gain.cancelScheduledValues(now);
    p.out.gain.setValueAtTime(0, now);
    p.out.gain.linearRampToValueAtTime(p.song.level, now + 1.2);
    setDelayTime(e, (60 / p.song.bpm) * 0.75, now);
  }
  if (p.endAt !== null) return;
  const dt = Math.max(0, now - p.xAt);
  p.xAt = now;
  p.x += (targetIntensity(e, p.track) - p.x) * (1 - Math.exp(-dt / 1.2));
  const due = (): number => p.t0 + p.step * p.sd;
  if (due() < now - 1) p.t0 = now + 0.05 - p.step * p.sd; // long stall (suspended context): re-anchor
  while (due() < now - 0.005) advance(p);
  while (due() < horizon && p.endAt === null) {
    step(e, p);
    advance(p);
  }
}

function advance(p: Player): void {
  p.step++;
  if (p.step % 16 === 0) nextBar(p);
}

function step(e: Engine, p: Player): void {
  const s = p.step % 16;
  const song = p.song;
  const sec = song.order[p.sec];
  const t = p.t0 + p.step * p.sd + (s % 2 ? song.swing * p.sd : 0);
  if (p.outro && s % 4 === 0) {
    song.outro?.(p.io, t, p.sd, p.outro);
    p.endAt = t + 6;
    p.out.gain.setValueAtTime(song.level, t + 3.5);
    p.out.gain.linearRampToValueAtTime(0, t + 5.8);
    return;
  }
  if (s === 0) {
    const f = 1300 + 2600 * p.x;
    p.padL.frequency.setTargetAtTime(f, t, 0.6);
    p.padR.frequency.setTargetAtTime(f, t, 0.6);
  }
  song.play(p.io, {
    sec, bar: p.bar, bars: barsIn(song, sec), s, t, sd: p.sd, x: p.x, loop: p.loop,
    chord: chordAt(song, sec, p.bar, s),
    fill: p.fillFrom >= 0 && p.step >= p.fillFrom,
  });
}

function fadePlayer(e: Engine, p: Player, seconds: number): void {
  if (p.endAt !== null && !p.outro) return;
  const now = e.ctx.currentTime;
  const fade = p.outro ? Math.max(seconds, 2.5) : seconds;
  holdAt(p.out.gain, now);
  p.out.gain.linearRampToValueAtTime(0, now + fade);
  p.endAt = now + fade + 0.05;
  p.outro = null;
}

function beginTrack(e: Engine, track: MusicTrack): void {
  const now = e.ctx.currentTime;
  for (const p of players) fadePlayer(e, p, 1);
  players.push(makePlayer(e, track, now));
  ensureScheduler();
}

function cueAt(e: Engine, list: Player[], cue: MusicCue, now: number): void {
  const p = list.find((q) => q.track === 'match' && q.endAt === null);
  if (!p) return;
  if (cue === 'win' || cue === 'lose' || cue === 'draw') {
    p.outro = cue;
    return;
  }
  if (cue === 'concede') {
    p.lp.frequency.setTargetAtTime(650, now, 0.06);
    p.lp.frequency.setTargetAtTime(20000, now + 1.3, 0.45);
    return;
  }
  let nb = Math.ceil(p.step / 16) * 16;
  if (nb - p.step < 4) nb += 16;
  p.jumpStep = nb;
  const sec = p.song.order[p.sec];
  p.jumpTo = cue === 'overtime' ? ['D', 4] : [sec === 'B' ? 'B2' : 'B', 0];
  p.fillFrom = cue === 'goal' ? Math.max(p.step, nb - 8) : -1;
  if (cue === 'goal') bumpActivity(e, 0.6);
}

function tickPlayers(e: Engine, list: Player[], now: number): void {
  for (let n = list.length - 1; n >= 0; n--) {
    const p = list[n];
    if (p.endAt !== null && now >= p.endAt) {
      for (const node of p.nodes) node.disconnect();
      list.splice(n, 1);
      continue;
    }
    fillPlayer(e, p, now, now + LOOKAHEAD_S);
  }
}

// ---------------------------------------------------------------- scheduler

function stopScheduler(): void {
  if (timer !== null) clearInterval(timer);
  timer = null;
}

function ensureScheduler(): void {
  if (timer === null && !userSuspended && (players.length > 0 || charge)) timer = setInterval(tick, TICK_MS);
}

function tick(): void {
  safely(() => {
    const e = engine;
    if (!e || !running(e)) return;
    lastTickMs = nowMs();
    if (charge && lastTickMs - charge.seen > 300) setCharge(e, null, e.ctx.currentTime);
    tickPlayers(e, players, e.ctx.currentTime);
    if (players.length === 0 && !charge) stopScheduler();
  });
}

/** Extra scheduling from frame-driven calls, so music keeps time even when timers are throttled. */
function nudge(): void {
  if (nowMs() - lastTickMs > 16) tick();
}

// ---------------------------------------------------------------- public API

interface AudioApi {
  unlock(): void;
  applySettings(s: AudioSettings): void;
  play(name: SfxName, opts?: PlayOpts): void;
  charge(level: number | null): void;
  setTetherHum(active: boolean, speed01?: number): void;
  setCrowd(level: number): void;
  cheer(intensity?: number): void;
  startMusic(track: 'menu' | 'match'): void;
  stopMusic(): void;
  setMusicIntensity(x: number): void;
  musicCue(cue: MusicCue): void;
  suspend(): void;
  resume(): void;
}

export const audio: AudioApi = {
  unlock(): void {
    safely(() => {
      lastUnlockMs = nowMs();
      listen();
      if (!engine) {
        engine = createEngine();
        if (!engine) return;
        startPump(engine);
        if (wantTrack) beginTrack(engine, wantTrack);
      }
      if (!userSuspended && !running(engine)) resumeCtx(engine);
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
      if (engine) pushSettings(engine, settings);
    });
  },

  play(name: SfxName, opts?: PlayOpts): void {
    safely(() => {
      const e = engine;
      if (!e || !canSound(e)) return;
      const i = clamp(opts?.intensity ?? 0.6, 0, 1, 0.6);
      if (name === 'lobCharge') {
        audio.charge(i);
        return;
      }
      const ms = nowMs();
      if (ms - (lastPlayed.get(name) ?? -1e9) < (RETRIGGER[name] ?? 30)) return;
      lastPlayed.set(name, ms);
      playAt(e, name, e.ctx.currentTime + 0.005, i, clamp(opts?.pan ?? 0, -1, 1, 0), opts?.heavy === true);
    });
  },

  charge(level: number | null): void {
    safely(() => {
      const e = engine;
      if (!e) return;
      if (level !== null && !canSound(e)) level = null;
      if (level === null && !charge) return;
      setCharge(e, level, e.ctx.currentTime);
      if (charge) ensureScheduler();
      nudge();
    });
  },

  setTetherHum(active: boolean, speed01 = 0): void {
    safely(() => {
      const e = engine;
      if (!e || (active && !canSound(e))) return;
      setHum(e, active, speed01);
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
      cheerAt(e, e.ctx.currentTime + 0.01, clamp(intensity, 0, 1, 0.7));
    });
  },

  startMusic(track: 'menu' | 'match'): void {
    safely(() => {
      const live = players.some((p) => p.track === track && p.endAt === null && !p.outro);
      if (wantTrack === track && (live || !engine)) return;
      wantTrack = track;
      if (engine) beginTrack(engine, track);
    });
  },

  stopMusic(): void {
    safely(() => {
      wantTrack = null;
      if (engine) for (const p of players) fadePlayer(engine, p, 0.6);
    });
  },

  setMusicIntensity(x: number): void {
    musicTarget = clamp(x, 0, 1, 0);
    safely(nudge);
  },

  musicCue(cue: MusicCue): void {
    safely(() => {
      if (engine) cueAt(engine, players, cue, engine.ctx.currentTime);
    });
  },

  suspend(): void {
    safely(() => {
      userSuspended = true;
      stopScheduler();
      if (!engine) return;
      setCharge(engine, null, engine.ctx.currentTime);
      void Promise.resolve((engine.ctx as AudioContext).suspend()).catch(noop);
    });
  },

  resume(): void {
    safely(() => {
      userSuspended = false;
      if (engine) resumeCtx(engine);
    });
  },
};

// ---------------------------------------------------------------- offline lab (dev tooling only)

/**
 * Renders music and effects into an OfflineAudioContext for measurement. Not used by the game,
 * so production builds tree-shake it away.
 */
export const audioLab = {
  /** Snapshot of the live engine for automated checks. */
  live(): Record<string, unknown> {
    const e = engine;
    return {
      state: e ? (e.ctx as AudioContext).state : 'none',
      unlockCtxMs: unlockCost[0],
      unlockBuildMs: unlockCost[1],
      time: e ? +e.ctx.currentTime.toFixed(2) : 0,
      jobsLeft: e ? e.jobs.length : -1,
      banks: e ? [...e.banks.keys()].length + e.bufs.size : 0,
      players: players.map((p) => ({ track: p.track, started: p.started, step: p.step, sec: p.song.order[p.sec], bar: p.bar, x: +p.x.toFixed(2), ending: p.endAt !== null })),
      shots: shotEnds.length,
      charge: charge !== null,
      hum: hum !== null,
      crowd: bed !== null,
      scheduler: timer !== null,
    };
  },
  engine(ctx: BaseAudioContext, s: AudioSettings = { master: 1, music: 1, effects: 1, muted: false }): Engine {
    const e = buildEngine(ctx, true);
    for (const n of [e.master, e.sfx, e.sfxRev, e.music, e.musRev, e.musDly]) n.gain.cancelScheduledValues(0);
    e.master.gain.value = s.muted ? 0 : s.master;
    e.sfx.gain.value = s.effects;
    e.sfxRev.gain.value = s.effects;
    for (const n of [e.music, e.musRev, e.musDly]) n.gain.value = s.music * MUSIC_TRIM;
    return e;
  },
  /**
   * Returns a scheduler for a track to call at increasing times (e.g. from OfflineAudioContext.suspend),
   * exactly like the live look-ahead scheduler; x(t) sets intensity, cues fire at their times.
   */
  music(e: Engine, track: MusicTrack, x: (t: number) => number, cues: ReadonlyArray<readonly [number, MusicCue]> = [], solo?: readonly string[]): (t: number) => void {
    const list = [makePlayer(e, track, 0)];
    if (solo) list[0].solo = new Set(solo);
    let c = 0;
    const tick = (t: number): void => {
      musicTarget = x(t);
      while (c < cues.length && cues[c][0] <= t) cueAt(e, list, cues[c++][1], t);
      tickPlayers(e, list, t);
      musicTarget = 0;
    };
    return Object.assign(tick, {
      state: () => list.map((p) => ({ sec: p.song.order[p.sec], bar: p.bar, step: p.step, x: +p.x.toFixed(2), fill: p.fillFrom, jump: p.jumpStep, ending: p.endAt !== null })),
    });
  },
  sfx(e: Engine, name: SfxName, t: number, intensity = 0.6, pan = 0, heavy = false): void {
    shotEnds.length = 0;
    playAt(e, name, t, intensity, pan, heavy);
  },
  cheer(e: Engine, t: number, i: number): void {
    cheerAt(e, t, i);
  },
  crowd(e: Engine, level: number): void {
    crowdLevel = level;
    bed = null;
    syncCrowd(e);
    crowdLevel = 0;
    bed = null;
  },
  /** Drives the charge voice along [time, level | null] points (times ascending). */
  charge(e: Engine, points: ReadonlyArray<readonly [number, number | null]>): void {
    charge = null;
    for (const [t, lv] of points) setCharge(e, lv, t);
    charge = null;
  },
  hum(e: Engine, points: ReadonlyArray<readonly [number, number | null]>): void {
    hum = null;
    for (const [t, sp] of points) setHum(e, sp !== null, sp ?? 0, t);
    hum = null;
  },
};
