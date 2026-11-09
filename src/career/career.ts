import { CLUBS, DIVISIONS, PLAYER_ID } from '../content/clubs';
import { Rng, hashString } from '../game/sim/rng';

/**
 * Club career: six-club divisions, a ten-round double round robin (30 fixtures) and a four-team playoff.
 * Rules: every match has a winner (sudden death), 3 points for a win, 0 for a loss.
 * Standings sort by points, goal difference, goals scored, then seeded club order.
 * Promotion requires winning the playoff final.
 *
 * All functions here are pure state transitions on plain data so they can be validated headlessly.
 */
export interface Fixture {
  id: string;
  round: number;
  home: string;
  away: string;
  done: boolean;
  hg: number;
  ag: number;
  ot: boolean;
}

export interface Tie {
  id: string;
  a: string;
  b: string;
  done: boolean;
  ag: number;
  bg: number;
  ot: boolean;
}

export type SeasonStage = 'champion' | 'finalist' | 'semifinalist' | 'missed';

export interface SeasonResult {
  division: number;
  seasonNo: number;
  rank: number;
  wins: number;
  losses: number;
  gf: number;
  ga: number;
  stage: SeasonStage;
  champion: string;
  promoted: boolean;
}

export interface CareerState {
  division: number;
  seasonNo: number;
  seed: number;
  /** Six club ids in seeded order (tie-break of last resort). */
  clubs: string[];
  fixtures: Fixture[];
  semis: Tie[];
  final: Tie | null;
  champion: string | null;
  phase: 'regular' | 'semis' | 'final' | 'complete';
  result: SeasonResult | null;
}

export interface StandingRow {
  club: string;
  played: number;
  wins: number;
  losses: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
}

export const ROUNDS = 10;
export const WIN_POINTS = 3;

export function newSeason(division: number, seasonNo: number, seed: number): CareerState {
  const div = DIVISIONS[Math.max(0, Math.min(DIVISIONS.length - 1, division))];
  const rng = new Rng(seed ^ 0x51ed270b);
  const clubs = [PLAYER_ID, ...div.clubs];
  // seeded shuffle of the order (also the stable tie-break order)
  for (let i = clubs.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [clubs[i], clubs[j]] = [clubs[j], clubs[i]];
  }
  // circle method: 5 rounds, then the mirrored second leg with home/away swapped
  const n = clubs.length;
  const order = clubs.slice();
  const firstLeg: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = order[i];
      const b = order[n - 1 - i];
      pairs.push((r + i) % 2 === 0 ? [a, b] : [b, a]);
    }
    firstLeg.push(pairs);
    order.splice(1, 0, order.pop()!);
  }
  const fixtures: Fixture[] = [];
  const add = (round: number, home: string, away: string) =>
    fixtures.push({ id: `d${division}s${seasonNo}r${round}-${home}-${away}`, round, home, away, done: false, hg: 0, ag: 0, ot: false });
  firstLeg.forEach((pairs, r) => pairs.forEach(([h, a]) => add(r + 1, h, a)));
  firstLeg.forEach((pairs, r) => pairs.forEach(([h, a]) => add(r + 1 + (n - 1), a, h)));
  return { division, seasonNo, seed, clubs, fixtures, semis: [], final: null, champion: null, phase: 'regular', result: null };
}

export function clubRating(id: string): number {
  return id === PLAYER_ID ? 0 : (CLUBS[id]?.rating ?? 0);
}

function poisson(rng: Rng, lambda: number): number {
  const l = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng.next();
  } while (p > l && k < 12);
  return k - 1;
}

/** Seeded scoreline for a fixture between two AI clubs. Always produces a winner. */
export function simulateScore(seed: number, id: string, a: string, b: string): { ag: number; bg: number; ot: boolean } {
  const rng = new Rng(seed ^ hashString(id));
  const ra = clubRating(a);
  const rb = clubRating(b);
  const tempo = (c: string) => (CLUBS[c]?.style === 'pressure' ? 0.3 : CLUBS[c]?.style === 'counter' ? -0.3 : 0);
  const base = 2.5 + (tempo(a) + tempo(b)) / 2;
  let ag = poisson(rng, base * Math.exp(0.38 * (ra - rb)));
  let bg = poisson(rng, base * Math.exp(0.38 * (rb - ra)));
  let ot = false;
  if (ag === bg) {
    ot = true;
    if (rng.next() < 0.5 + 0.18 * (ra - rb)) ag++;
    else bg++;
  }
  return { ag, bg, ot };
}

export function standings(s: CareerState): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  for (const c of s.clubs) rows.set(c, { club: c, played: 0, wins: 0, losses: 0, gf: 0, ga: 0, gd: 0, points: 0 });
  for (const f of s.fixtures) {
    if (!f.done) continue;
    const h = rows.get(f.home)!;
    const a = rows.get(f.away)!;
    h.played++;
    a.played++;
    h.gf += f.hg;
    h.ga += f.ag;
    a.gf += f.ag;
    a.ga += f.hg;
    if (f.hg > f.ag) {
      h.wins++;
      a.losses++;
    } else {
      a.wins++;
      h.losses++;
    }
  }
  const out = [...rows.values()];
  for (const r of out) {
    r.gd = r.gf - r.ga;
    r.points = r.wins * WIN_POINTS;
  }
  const seedOrder = (c: string) => s.clubs.indexOf(c);
  out.sort((x, y) => y.points - x.points || y.gd - x.gd || y.gf - x.gf || seedOrder(x.club) - seedOrder(y.club));
  return out;
}

export function currentRound(s: CareerState): number {
  for (let r = 1; r <= ROUNDS; r++) if (s.fixtures.some((f) => f.round === r && !f.done)) return r;
  return ROUNDS;
}

export interface NextMatch {
  kind: 'league' | 'semi' | 'final';
  id: string;
  opponent: string;
  home: boolean;
  round: number;
}

/** The player's next unplayed match, or null when the season holds nothing more for them. */
export function nextPlayerMatch(s: CareerState): NextMatch | null {
  if (s.phase === 'regular') {
    const f = s.fixtures.find((x) => !x.done && (x.home === PLAYER_ID || x.away === PLAYER_ID));
    if (!f) return null;
    return { kind: 'league', id: f.id, opponent: f.home === PLAYER_ID ? f.away : f.home, home: f.home === PLAYER_ID, round: f.round };
  }
  if (s.phase === 'semis') {
    const t = s.semis.find((x) => !x.done && (x.a === PLAYER_ID || x.b === PLAYER_ID));
    if (!t) return null;
    return { kind: 'semi', id: t.id, opponent: t.a === PLAYER_ID ? t.b : t.a, home: t.a === PLAYER_ID, round: ROUNDS + 1 };
  }
  if (s.phase === 'final' && s.final && !s.final.done && (s.final.a === PLAYER_ID || s.final.b === PLAYER_ID)) {
    return { kind: 'final', id: s.final.id, opponent: s.final.a === PLAYER_ID ? s.final.b : s.final.a, home: s.final.a === PLAYER_ID, round: ROUNDS + 2 };
  }
  return null;
}

function tieWinner(t: Tie): string {
  return t.ag > t.bg ? t.a : t.b;
}

function simTie(s: CareerState, t: Tie): void {
  if (t.done) return;
  const r = simulateScore(s.seed, t.id, t.a, t.b);
  t.ag = r.ag;
  t.bg = r.bg;
  t.ot = r.ot;
  t.done = true;
}

function finish(s: CareerState): void {
  if (!s.final || !s.final.done) return;
  s.champion = tieWinner(s.final);
  s.phase = 'complete';
  const table = standings(s);
  const row = table.find((r) => r.club === PLAYER_ID)!;
  const rank = table.indexOf(row) + 1;
  const inSemis = s.semis.some((t) => t.a === PLAYER_ID || t.b === PLAYER_ID);
  const inFinal = s.final.a === PLAYER_ID || s.final.b === PLAYER_ID;
  const stage: SeasonStage = s.champion === PLAYER_ID ? 'champion' : inFinal ? 'finalist' : inSemis ? 'semifinalist' : 'missed';
  s.result = {
    division: s.division,
    seasonNo: s.seasonNo,
    rank,
    wins: row.wins,
    losses: row.losses,
    gf: row.gf,
    ga: row.ga,
    stage,
    champion: s.champion,
    promoted: stage === 'champion' && s.division < DIVISIONS.length - 1,
  };
}

/** Moves the season forward whenever everything that can be resolved without the player is resolved. */
function advance(s: CareerState): void {
  if (s.phase === 'regular' && s.fixtures.every((f) => f.done)) {
    const t = standings(s);
    const id = `d${s.division}s${s.seasonNo}`;
    s.semis = [
      { id: `${id}-sf1`, a: t[0].club, b: t[3].club, done: false, ag: 0, bg: 0, ot: false },
      { id: `${id}-sf2`, a: t[1].club, b: t[2].club, done: false, ag: 0, bg: 0, ot: false },
    ];
    s.phase = 'semis';
  }
  if (s.phase === 'semis') {
    for (const t of s.semis) if (t.a !== PLAYER_ID && t.b !== PLAYER_ID) simTie(s, t);
    if (s.semis.every((t) => t.done)) {
      s.final = { id: `d${s.division}s${s.seasonNo}-final`, a: tieWinner(s.semis[0]), b: tieWinner(s.semis[1]), done: false, ag: 0, bg: 0, ot: false };
      s.phase = 'final';
    }
  }
  if (s.phase === 'final' && s.final) {
    if (s.final.a !== PLAYER_ID && s.final.b !== PLAYER_ID) simTie(s, s.final);
    if (s.final.done) finish(s);
  }
}

/**
 * Records the player's real result for a fixture or playoff tie exactly once, simulates the other
 * unplayed fixtures of that round (never earlier rounds again) and advances the season.
 * Returns false when the id is unknown, not the player's next match, or already complete.
 */
export function commitPlayerResult(s: CareerState, id: string, playerGoals: number, oppGoals: number, ot: boolean): boolean {
  if (playerGoals === oppGoals) return false;
  const next = nextPlayerMatch(s);
  if (!next || next.id !== id) return false;
  if (next.kind === 'league') {
    const f = s.fixtures.find((x) => x.id === id)!;
    if (f.done) return false;
    const home = f.home === PLAYER_ID;
    f.hg = home ? playerGoals : oppGoals;
    f.ag = home ? oppGoals : playerGoals;
    f.ot = ot;
    f.done = true;
    for (const o of s.fixtures) {
      if (o.round === f.round && !o.done) {
        const r = simulateScore(s.seed, o.id, o.home, o.away);
        o.hg = r.ag;
        o.ag = r.bg;
        o.ot = r.ot;
        o.done = true;
      }
    }
  } else {
    const t = next.kind === 'semi' ? s.semis.find((x) => x.id === id)! : s.final!;
    if (t.done) return false;
    const isA = t.a === PLAYER_ID;
    t.ag = isA ? playerGoals : oppGoals;
    t.bg = isA ? oppGoals : playerGoals;
    t.ot = ot;
    t.done = true;
  }
  advance(s);
  return true;
}

export function playerRank(s: CareerState): number {
  return standings(s).findIndex((r) => r.club === PLAYER_ID) + 1;
}

/** Structural validation used when loading a save. */
export function validCareer(s: unknown): s is CareerState {
  if (!s || typeof s !== 'object') return false;
  const c = s as CareerState;
  if (!Number.isInteger(c.division) || c.division < 0 || c.division >= DIVISIONS.length) return false;
  if (!Number.isInteger(c.seasonNo) || c.seasonNo < 1 || !Number.isFinite(c.seed)) return false;
  if (!Array.isArray(c.clubs) || c.clubs.length !== 6 || !c.clubs.includes(PLAYER_ID)) return false;
  if (!c.clubs.every((id) => id === PLAYER_ID || !!CLUBS[id])) return false;
  if (!Array.isArray(c.fixtures) || c.fixtures.length !== 30) return false;
  const okScore = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < 100;
  for (const f of c.fixtures) {
    if (!f || typeof f.id !== 'string' || !c.clubs.includes(f.home) || !c.clubs.includes(f.away) || f.home === f.away) return false;
    if (!Number.isInteger(f.round) || f.round < 1 || f.round > ROUNDS || typeof f.done !== 'boolean' || !okScore(f.hg) || !okScore(f.ag)) return false;
    if (f.done && f.hg === f.ag) return false;
  }
  if (!['regular', 'semis', 'final', 'complete'].includes(c.phase)) return false;
  if (!Array.isArray(c.semis)) return false;
  const okTie = (t: Tie | null) => !!t && typeof t.id === 'string' && c.clubs.includes(t.a) && c.clubs.includes(t.b) && typeof t.done === 'boolean' && okScore(t.ag) && okScore(t.bg) && !(t.done && t.ag === t.bg);
  if (!c.semis.every(okTie)) return false;
  if (c.phase !== 'regular' && c.semis.length !== 2) return false;
  if (c.phase === 'regular' && c.fixtures.every((f) => f.done)) return false;
  if (c.phase !== 'regular' && c.fixtures.some((f) => !f.done)) return false;
  if ((c.phase === 'final' || c.phase === 'complete') && !okTie(c.final)) return false;
  if (c.phase === 'complete' && (!c.result || !c.champion)) return false;
  return true;
}
