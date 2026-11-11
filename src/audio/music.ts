/**
 * Tether League music: two original songs written as data plus a per-16th-step arranger.
 *
 * The sequencer never touches WebAudio. For every step the player (audio.ts) calls
 * `song.play(out, ctx)`, which emits notes through the small `Out` interface. Songs are a list
 * of sections (8 bars, 16 steps per bar); each section has a chord per bar ("C7s/C7" splits a bar).
 *
 * Menu, "Clubhouse Sunshine": F major, 100 BPM, swung 16ths. Warm funk-pop: round finger bass,
 *   electric-piano comping, shaker groove, a marimba hook in the B sections, a flute counter-line.
 *   A B A2 B2 C (bridge) = 40 bars, about 96 s per loop.
 * Match, "Tether Drive": A minor, 126 BPM. Four-on-the-floor synth-pop: pumping bass (side-chained),
 *   super-saw stabs, a 3-against-4 pluck arp, a dotted pluck riff and a lead hook in the B sections.
 *   A B A2 B2 D (breakdown + build) = 40 bars, about 76 s per loop. Intensity x (0..1) adds 16th hats,
 *   open hats, octave doublings, extra percussion, and at x >= 0.75 skips the quiet half of the breakdown.
 */

export type Inst =
  | 'kick' | 'mkick' | 'clap' | 'snare' | 'hat' | 'ohat' | 'shk' | 'tom' | 'crash' | 'rim' | 'snap'
  | 'bass' | 'fbass' | 'keys' | 'pluck' | 'stab' | 'lead' | 'flute' | 'mallet' | 'bell';

/** d: length in seconds (sustained instruments); pan: -1 left, 0 centre, 1 right; dly: delay send 0/1/2. */
export interface NoteOpts { d?: number; pan?: -1 | 0 | 1; dly?: 0 | 1 | 2 }

export interface Out {
  /** Drum hits take `m` as a pitch offset in semitones; pitched instruments take a MIDI note. */
  n(inst: Inst, m: number, t: number, v: number, o?: NoteOpts): void;
  pad(notes: readonly number[], t: number, d: number, v: number): void;
  /** Side-chain dip of the melodic bus (depth = gain at the bottom of the dip). */
  duck(t: number, depth: number): void;
  riser(t: number, d: number, v: number): void;
  /** Glide the song's master low-pass toward hz with time constant tau. */
  tone(t: number, hz: number, tau: number): void;
}

export interface Chord { r: number; v: readonly number[] }

export interface Ctx {
  sec: string;
  bar: number;
  bars: number;
  s: number;
  /** Swung start time of this step, and the straight step length. */
  t: number;
  sd: number;
  x: number;
  loop: number;
  chord: Chord;
  /** True while a cue (goal) drum fill should play. */
  fill: boolean;
}

export type OutroKind = 'win' | 'lose' | 'draw';

export interface Song {
  bpm: number;
  swing: number;
  chords: Record<string, Chord>;
  sections: Record<string, string>;
  order: readonly string[];
  /** Instruments this song needs before it can start. */
  needs: readonly string[];
  /** Corrective master EQ for the song: [type, frequency, gain dB, Q]. */
  eq: ReadonlyArray<readonly [BiquadFilterType, number, number, number]>;
  /** Output trim so both songs sit at the same loudness. */
  level: number;
  play(o: Out, c: Ctx): void;
  /** Bar to enter when moving into `sec` at intensity x (lets the arranger shorten breakdowns). */
  enter?(sec: string, x: number): number;
  outro?(o: Out, t: number, sd: number, kind: OutroKind): void;
}

// ---------------------------------------------------------------- notation helpers

const PC: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

export function noteNum(s: string): number {
  const m = /^([a-g])(#|b)?(\d)$/.exec(s);
  if (!m) return -1;
  return 12 * (Number(m[3]) + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

/** One bar of melody: 16 space-separated tokens, a note name starts a note, '-' holds, '.' rests. */
export type Bar = ReadonlyArray<readonly [step: number, midi: number, len: number]>;
export function mel(line: string): Bar {
  const out: [number, number, number][] = [];
  line.trim().split(/\s+/).forEach((tok, i) => {
    const last = out[out.length - 1];
    if (tok === '-') {
      if (last && last[0] + last[2] === i) last[2]++;
    } else if (tok !== '.') out.push([i, noteNum(tok), 1]);
  });
  return out;
}

/** Drum velocity at step s of a 16-character pattern ('.' none, 'o' ghost, 'x' hit, 'X' accent). */
const VEL: Record<string, number> = { o: 0.38, x: 0.75, X: 1 };
export const hit = (p: string, s: number): number => VEL[p[s]] ?? 0;

/** Length in steps of an onset at step s in a pattern where letters start notes and '-' holds. */
function held(p: string, s: number): number {
  let n = 1;
  while (s + n < 16 && p[s + n] === '-') n++;
  return n;
}

/** Deterministic 0..1 hash for small humanising variations. */
export const hash01 = (n: number): number => (Math.imul(n + 1, 2654435761) >>> 0) / 4294967296;

/** Bass degree letters: r root, o octave, f fifth, t tenth (octave + third is avoided; fifth above octave). */
function degree(ch: Chord, c: string): number {
  return ch.r + (c === 'o' ? 12 : c === 'f' ? 7 : c === 'F' ? 19 : c === 's' ? 10 : 0);
}

function bassLine(o: Out, inst: Inst, p: string, c: Ctx, v: number, gate = 0.92): void {
  const ch = p[c.s];
  if (!ch || ch === '.' || ch === '-') return;
  const len = held(p, c.s);
  const accent = c.s % 4 === 0 ? 1 : 0.86;
  o.n(inst, degree(c.chord, ch), c.t, v * accent, { d: len * c.sd * gate });
}

function chordHit(o: Out, inst: Inst, p: string, c: Ctx, v: number, top: boolean, gate = 0.9): void {
  const ch = p[c.s];
  if (!ch || ch === '.' || ch === '-') return;
  const d = held(p, c.s) * c.sd * gate;
  // Spread the voicing across the stereo field: low note left, next right, inner notes centre.
  c.chord.v.forEach((m, k) => o.n(inst, m, c.t, v, { d, pan: k === 0 ? -1 : k === 1 ? 1 : 0 }));
  if (top) o.n(inst, c.chord.v[0] + 12, c.t, v * 0.8, { d });
}

function line(o: Out, inst: Inst, bars: readonly Bar[], c: Ctx, v: number, shift: number, opts: NoteOpts = {}): void {
  const b = bars[c.bar % bars.length];
  for (const [at, m, len] of b) {
    if (at === c.s) o.n(inst, m + shift, c.t, v, { ...opts, d: len * c.sd * 0.95 });
  }
}

const padNotes = (ch: Chord): number[] => [ch.v[0], ch.v[1], ch.v[2], ch.v[0] + 12];

/** Pad on every chord change (bar start, or the half-bar of a split bar). */
function padOnChange(o: Out, c: Ctx, sections: Record<string, string>, v: number): void {
  if (c.s !== 0 && c.s !== 8) return;
  const tok = sections[c.sec].split(' ')[c.bar] ?? '';
  const split = tok.includes('/');
  if (c.s === 8 && !split) return;
  o.pad(padNotes(c.chord), c.t, (split ? 8 : 16) * c.sd + 0.25, v);
}

// ---------------------------------------------------------------- match: "Tether Drive"

const HOOK: readonly Bar[] = [
  'a4 . c5 . e5 - - d5 - - c5 - d5 - . .',
  'e5 - . . d5 . c5 . d5 - - - b4 - . .',
  'c5 . e5 . a5 - - g5 - - e5 - - - . .',
  'g5 - e5 - d5 - c5 - d5 - - - . . . .',
  'a4 . c5 . e5 - - d5 - - c5 - d5 - . .',
  'e5 - . . d5 . c5 . d5 - - - b4 - . .',
  'b4 . e5 . g#5 - - a5 - - g#5 - e5 - . .',
  'b4 - - - - - - - . . . . . . . .',
].map(mel);

const RIFF_STEPS = [0, 3, 6, 9, 12, 14];
const riffNote = (ch: Chord, k: number): number =>
  [ch.v[0] + 24, ch.v[2] + 12, ch.v[1] + 24, ch.v[2] + 12, ch.v[0] + 24, ch.v[1] + 12][k];

export const MATCH: Song = {
  bpm: 126,
  swing: 0.04,
  chords: {
    Am: { r: 33, v: [57, 60, 64] },
    F: { r: 29, v: [57, 60, 65] },
    C: { r: 36, v: [55, 60, 64] },
    G: { r: 31, v: [55, 59, 62] },
    E: { r: 28, v: [56, 59, 64] },
    Dm: { r: 38, v: [57, 62, 65] },
  },
  sections: {
    A: 'Am F C G Am F C G',
    B: 'F G Am C F G E E',
    A2: 'Am F C G Am F C G',
    B2: 'F G Am C F G E E',
    D: 'Dm F C G Dm F G E',
  },
  order: ['A', 'B', 'A2', 'B2', 'D'],
  needs: ['kick', 'clap', 'snare', 'hat', 'ohat', 'shk', 'tom', 'crash', 'bass', 'stab', 'pluck', 'lead', 'bell', 'mallet'],
  eq: [['peaking', 170, 2.5, 0.8], ['highshelf', 9000, -3, 0.7]],
  level: 0.93,
  enter: (sec, x) => (sec === 'D' && x >= 0.75 ? 4 : 0),

  play(o, c) {
    const { s, t, x, bar, sec } = c;
    const lastBar = bar === c.bars - 1;
    const brk = sec === 'D' && bar < 4;
    const build = sec === 'D' && bar >= 4;
    const hook = sec === 'B' || sec === 'B2';
    const mid = x >= 0.4;
    const hi = x >= 0.7;
    const h = hash01(c.loop * 977 + bar * 16 + s);

    // ---------- section-level moves
    if (s === 0 && bar === 0) {
      if (sec !== 'A2' || hi) o.n('crash', 0, t, sec === 'A' || hook ? 0.9 : 0.6);
      o.tone(t, sec === 'D' ? 1500 : 20000, sec === 'D' ? 0.5 : 0.05);
    }
    if (build && bar === 4 && s === 0) {
      o.tone(t, 20000, 1.4);
      o.riser(t, 64 * c.sd, 0.55 + 0.3 * x);
    }
    if (sec === 'B2' && lastBar && s === 0 && mid) o.riser(t, 16 * c.sd, 0.35);

    // ---------- drums
    const pre = build && bar === 7 && s >= 8; // short gap before the drop back into A
    const kickHere = brk ? bar === 0 && s === 0 : build ? (bar < 6 ? s % 4 === 0 : bar === 6 ? s % 2 === 0 : s < 8 && s % 2 === 0) : s % 4 === 0;
    if (kickHere && !pre) {
      o.n('kick', 0, t, s === 0 ? 1 : 0.92);
      o.duck(t, hi ? 0.38 : 0.5);
    }
    if (!brk && !build && (s === 4 || s === 12)) {
      o.n('clap', 0, t, 0.95);
      if (hook || hi) o.n('snare', 0, t, 0.5);
    }
    if (hi && !brk && s === 15 && bar % 2 === 1) o.n('clap', 0, t, 0.35);
    if (build && bar === 6 && s % 4 === 0) o.n('clap', 0, t, 0.6);
    if (build && bar === 7) o.n('snare', 0, t, 0.3 + 0.6 * (s / 15));
    if (c.fill) o.n('snare', 0, t, 0.35 + 0.045 * s);

    if (!brk) {
      const open = hook && hi;
      if (s % 4 === 2) o.n(open ? 'ohat' : 'hat', 0, t, open ? 0.55 : 0.8, { pan: 1 });
      else if (mid && s % 2 === 1) o.n('hat', 0, t, 0.22 + 0.2 * h, { pan: 1 });
      else if (x >= 0.25 && s % 4 === 0 && !build) o.n('hat', 0, t, 0.3, { pan: 1 });
      if (!hook && !build && x >= 0.25 && s % 2 === 1) o.n('shk', 0, t, 0.35 + 0.2 * h, { pan: -1 });
    } else {
      if (bar > 0 || s >= 8) o.n('shk', 0, t, (s % 2 ? 0.25 : 0.45) * (0.6 + 0.1 * bar), { pan: -1 });
      if (s % 4 === 2 && bar >= 2) o.n('hat', 0, t, 0.45, { pan: 1 });
    }
    if (lastBar && !brk && !build && s >= 12 && !c.fill) {
      if (x >= 0.3 || hook) o.n('tom', [7, 4, 0, -4][s - 12], t, 0.75 + 0.06 * (s - 12), { pan: s < 14 ? -1 : 1 });
      else if (s >= 14) o.n('snare', 0, t, 0.45);
    }

    // ---------- bass
    if (brk) bassLine(o, 'bass', 'r---------------', c, 0.7, 0.98);
    else if (build) {
      if (!(bar === 7 && s >= 12)) bassLine(o, 'bass', bar < 6 ? 'r-r-r-r-r-r-r-r-' : 'rrrrrrrrrrrrrrrr', c, 0.55 + 0.08 * (bar - 4));
    } else if (hook) bassLine(o, 'bass', 'r--r..o.r--r.of.', c, 0.9);
    else bassLine(o, 'bass', sec === 'A2' ? 'r-.or-.or-.or-or' : 'r-o.r-o.r-o.r-or', c, 0.85);

    // ---------- chords
    padOnChange(o, c, this.sections, brk ? 0.85 : build ? 0.6 : 0.45);
    if (hook) chordHit(o, 'stab', 'x-.x-.x-..x-.x-.', c, 0.5 + 0.15 * x, true);
    else if (sec === 'A') chordHit(o, 'stab', 'x-....x-..x-....', c, 0.45 + 0.15 * x, mid);
    else if (sec === 'A2' && mid) chordHit(o, 'stab', '..x-..x-..x-..x-', c, 0.4, false);
    else if (build && bar >= 6) chordHit(o, 'stab', 'x.x.x.x.x.x.x.x.', c, 0.25 + 0.05 * s, false);

    // ---------- arp (3-against-4 over a two-octave ladder)
    const ch = c.chord;
    const ladder = [ch.v[0] + 12, ch.v[1] + 12, ch.v[2] + 12, ch.v[0] + 24, ch.v[1] + 24, ch.v[2] + 24];
    const arpNote = ladder[(s % 3) + ((s >> 3) & 1) * 3];
    const pan: -1 | 1 = s % 2 ? 1 : -1;
    if (sec === 'A' && (x >= 0.25 || s % 2 === 0)) o.n('pluck', arpNote, t, (s % 4 === 0 ? 0.55 : 0.4) + 0.15 * x, { pan, dly: 1 });
    else if (hook && (mid || s % 2 === 0)) o.n('pluck', arpNote, t, 0.28 + 0.1 * x, { pan, dly: 1 });
    else if (brk) o.n('pluck', arpNote, t, 0.28 + 0.05 * bar, { pan, dly: 2 });
    else if (build) o.n('pluck', arpNote + (bar >= 6 ? 12 : 0), t, 0.3 + 0.1 * (bar - 4) + 0.01 * s, { pan, dly: 1 });

    // ---------- riff (A2; also A at high intensity)
    if (sec === 'A2' || (sec === 'A' && hi && bar >= 4)) {
      const k = RIFF_STEPS.indexOf(s);
      if (k >= 0) {
        o.n('pluck', riffNote(ch, k), t, 0.62, { dly: 1, d: 2.5 * c.sd });
        if (hi) o.n('bell', riffNote(ch, k) + 12, t, 0.18, { pan: k % 2 ? 1 : -1 });
      }
    }

    // ---------- hook
    if (hook) {
      line(o, 'lead', HOOK, c, 0.78, 0, { dly: 1 });
      if (sec === 'B2' || hi) line(o, 'bell', HOOK, c, 0.22, 12, { pan: 1 });
    } else if (brk) line(o, 'mallet', HOOK, c, 0.5, 0, { dly: 2 });
  },

  outro(o, t, sd, kind) {
    const win = kind === 'win';
    const root = kind === 'draw' ? 36 : 33;
    const chord = kind === 'win' ? [57, 61, 64, 69] : kind === 'draw' ? [55, 60, 64, 67] : [57, 60, 64, 71];
    o.tone(t, 20000, 0.05);
    o.n('kick', 0, t, 1);
    if (kind !== 'lose') o.n('crash', 0, t, 1);
    o.n('bass', root, t, 0.9, { d: 2.4 });
    o.pad(chord, t, 3.2, 0.8);
    for (const m of chord) o.n('stab', m, t, 0.55, { d: 1.6 });
    if (win) {
      [69, 73, 76, 81, 85].forEach((m, n) => o.n('bell', m + 12, t + n * sd, 0.3, { pan: n % 2 ? 1 : -1 }));
      o.n('lead', 81, t + 4 * sd, 0.7, { d: 1.8, dly: 1 });
    } else if (kind === 'lose') {
      [76, 72, 69].forEach((m, n) => o.n('mallet', m, t + n * 3 * sd, 0.45, { dly: 2 }));
    } else {
      [72, 76, 79].forEach((m, n) => o.n('mallet', m, t + n * 2 * sd, 0.45, { dly: 2 }));
    }
  },
};

// ---------------------------------------------------------------- menu: "Clubhouse Sunshine"

const MALLET_HOOK: readonly Bar[] = [
  'f5 . d5 . . c5 d5 - . . a4 . c5 - . .',
  'd5 . bb4 . . a4 bb4 - . . g4 . bb4 - . .',
  'a4 . bb4 . c5 . d5 - - . f5 - - . d5 .',
  'f5 - - - - - . . e5 - - - c5 . bb4 .',
  'f5 . d5 . . c5 d5 - . . a4 . c5 - . .',
  'd5 . bb4 . . a4 bb4 - . . g4 . bb4 - . .',
  'a4 . bb4 . c5 . d5 - - . f5 - - . d5 .',
  'f5 - - - e5 - - - - - - - . . . .',
].map(mel);

const FLUTE: readonly Bar[] = [
  'c5 - - - - - a4 - c5 - - - e5 - - -',
  'e5 - - - - - - - d5 - - - c5 - - -',
  'd5 - - - - - - - f5 - - - - - d5 -',
  'c5 - - - - - - - bb4 - - - g4 - - -',
  'c5 - - - - - a4 - c5 - - - e5 - - -',
  'e5 - - - - - - - d5 - - - c5 - - -',
  'd5 - - - - - - - f5 - - - - - d5 -',
  'c5 - - - - - - - - - - - . . . .',
].map(mel);

const SPARKLE = mel('. . . . . . . . . . . . f6 c6 a5 .');

export const MENU: Song = {
  bpm: 100,
  swing: 0.2,
  chords: {
    F7: { r: 41, v: [53, 57, 60, 64] },
    Am7: { r: 45, v: [55, 60, 64, 67] },
    Bb7: { r: 46, v: [57, 62, 65, 70] },
    C7s: { r: 36, v: [55, 58, 60, 65] },
    C7: { r: 36, v: [55, 58, 60, 64] },
    Dm7: { r: 38, v: [57, 60, 62, 65] },
    Gm7: { r: 43, v: [55, 58, 62, 65] },
  },
  sections: {
    A: 'F7 Am7 Bb7 C7s/C7 F7 Am7 Bb7 C7s/C7',
    B: 'Dm7 Gm7 Bb7 C7s/C7 Dm7 Gm7 Bb7 C7s/C7',
    A2: 'F7 Am7 Bb7 C7s/C7 F7 Am7 Bb7 C7s/C7',
    B2: 'Dm7 Gm7 Bb7 C7s/C7 Dm7 Gm7 Bb7 C7s/C7',
    C: 'Bb7 Am7 Gm7 F7 Bb7 Am7 Gm7 C7s/C7',
  },
  order: ['A', 'B', 'A2', 'B2', 'C'],
  needs: ['mkick', 'snare', 'shk', 'ohat', 'rim', 'snap', 'tom', 'fbass', 'keys', 'mallet', 'flute', 'pluck', 'bell'],
  eq: [['peaking', 480, -4.5, 1.1], ['peaking', 1600, 2.5, 0.9], ['highshelf', 8000, -7, 0.7]],
  level: 1.18,

  play(o, c) {
    const { s, t, bar, sec } = c;
    const bridge = sec === 'C';
    const hook = sec === 'B' || sec === 'B2';
    const lastBar = bar === c.bars - 1;
    const h = hash01(c.loop * 389 + bar * 16 + s);

    // ---------- drums
    const kick = bridge ? 'X.......x.......' : bar % 2 ? 'X.....x...X...o.' : 'X.....x...X.....';
    const k = hit(kick, s);
    if (k) {
      o.n('mkick', 0, t, k);
      o.duck(t, 0.66);
    }
    if (s === 4 || s === 12) {
      if (bridge) o.n('rim', 0, t, 0.8, { pan: -1 });
      else {
        o.n('snare', 0, t, 0.9);
        if (hook) o.n('snap', 0, t, 0.55, { pan: 1 });
      }
    }
    if (!bridge && (s === 7 || s === 15) && h > 0.45) o.n('snare', 0, t, 0.2);
    o.n('shk', 0, t, (s % 2 ? 0.28 : 0.5) * (bridge ? 0.7 : 1) * (0.9 + 0.2 * h), { pan: 1 });
    if (hook && s === 14 && bar % 2 === 1) o.n('ohat', 0, t, 0.4, { pan: -1 });
    if ((sec === 'A2' || sec === 'B2') && hit('...x..x...x.x...', s)) o.n('rim', 5, t, 0.32, { pan: 1 });
    if (lastBar && s >= 12) {
      if (sec === 'C' || sec === 'B2') o.n('tom', [7, 4, 0, -3][s - 12], t, 0.6, { pan: s < 14 ? 1 : -1 });
      else if (s % 2 === 0) o.n('snare', 0, t, 0.3 + 0.1 * (s - 12));
    }

    // ---------- bass
    if (bridge) bassLine(o, 'fbass', 'r-------f---o---', c, 0.8);
    else if (hook) bassLine(o, 'fbass', 'r--.r.o.r-.fo.f.', c, 0.9, 0.8);
    else bassLine(o, 'fbass', 'r-.ro..r-.r.f.o.', c, 0.9, 0.8);

    // ---------- keys and pad
    padOnChange(o, c, this.sections, bridge ? 0.6 : 0.36);
    if (bridge) chordHit(o, 'keys', 'x-------x-------', c, 0.5, false, 1);
    else if (hook) chordHit(o, 'keys', 'x---..x-..x---..', c, 0.48, false);
    else chordHit(o, 'keys', 'x-...x-...x-..x.', c, 0.5, false);

    // ---------- melodies
    if (hook) {
      line(o, 'mallet', MALLET_HOOK, c, 0.8, 0, { dly: 1 });
      line(o, 'pluck', MALLET_HOOK, c, 0.3, 0, { pan: -1 });
      if (sec === 'B2') line(o, 'bell', MALLET_HOOK, c, 0.16, 12, { pan: 1 });
    } else if (sec === 'A2') line(o, 'flute', FLUTE, c, 0.55, 0, { dly: 1 });
    else if (sec === 'A' && bar % 4 === 3) line(o, 'bell', [SPARKLE], c, 0.25, 0, { dly: 2, pan: -1 });
    if (bridge && s % 2 === 0) {
      const ch = c.chord;
      const up = [ch.v[0] + 12, ch.v[1] + 12, ch.v[2] + 12, ch.v[3] + 12, ch.v[1] + 24, ch.v[3] + 12, ch.v[2] + 12, ch.v[1] + 12];
      o.n('pluck', up[s / 2], t, 0.32 + 0.08 * (s === 0 ? 1 : 0), { dly: 2, pan: s % 4 ? 1 : -1 });
    }
  },
};

export const SONGS = { menu: MENU, match: MATCH } as const;

/** Chord sounding at step s of a bar (split bars change at step 8). */
export function chordAt(song: Song, sec: string, bar: number, s: number): Chord {
  const tok = (song.sections[sec].split(' ')[bar] ?? '').split('/');
  return song.chords[tok[s >= 8 && tok.length > 1 ? 1 : 0]] ?? Object.values(song.chords)[0];
}

export const barsIn = (song: Song, sec: string): number => song.sections[sec].split(' ').length;
