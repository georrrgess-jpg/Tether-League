import { describe, expect, it } from 'vitest';
import {
  ROUNDS,
  WIN_POINTS,
  commitPlayerResult,
  currentRound,
  newSeason,
  nextPlayerMatch,
  playerRank,
  simulateScore,
  standings,
  validCareer,
  type CareerState,
  type NextMatch,
  type StandingRow,
} from '../src/career/career';
import { CLUBS, DIVISIONS, PLAYER_ID } from '../src/content/clubs';

const SEEDS = [1, 2, 7, 42, 1234, 99991, 0xdeadbeef, 0];
const LAST_DIVISION = DIVISIONS.length - 1;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const isPlayerFixture = (f: { home: string; away: string }) => f.home === PLAYER_ID || f.away === PLAYER_ID;

type Decide = (next: NextMatch, s: CareerState) => [number, number];
const WIN: Decide = () => [3, 0];
const LOSE: Decide = () => [0, 3];

/** Plays every remaining player match with the given result policy. Returns the number of matches committed. */
function playOut(s: CareerState, decide: Decide, stopWhen?: (next: NextMatch) => boolean): number {
  let n = 0;
  for (;;) {
    const next = nextPlayerMatch(s);
    if (!next || (stopWhen && stopWhen(next))) return n;
    const [pg, og] = decide(next, s);
    expect(commitPlayerResult(s, next.id, pg, og, false)).toBe(true);
    if (++n > 20) throw new Error('season did not terminate');
  }
}

function assertSorted(s: CareerState, table: StandingRow[]): void {
  for (let i = 1; i < table.length; i++) {
    const a = table[i - 1];
    const b = table[i];
    if (a.points !== b.points) expect(a.points).toBeGreaterThan(b.points);
    else if (a.gd !== b.gd) expect(a.gd).toBeGreaterThan(b.gd);
    else if (a.gf !== b.gf) expect(a.gf).toBeGreaterThan(b.gf);
    else expect(s.clubs.indexOf(a.club)).toBeLessThan(s.clubs.indexOf(b.club));
  }
}

function assertTableConsistent(s: CareerState): StandingRow[] {
  const table = standings(s);
  const done = s.fixtures.filter((f) => f.done);
  expect(table).toHaveLength(6);
  expect(new Set(table.map((r) => r.club))).toEqual(new Set(s.clubs));
  for (const row of table) {
    expect(row.wins + row.losses).toBe(row.played);
    expect(row.points).toBe(WIN_POINTS * row.wins);
    expect(row.gd).toBe(row.gf - row.ga);
    const mine = done.filter((f) => f.home === row.club || f.away === row.club);
    expect(row.played).toBe(mine.length);
    expect(row.gf).toBe(mine.reduce((a, f) => a + (f.home === row.club ? f.hg : f.ag), 0));
    expect(row.ga).toBe(mine.reduce((a, f) => a + (f.home === row.club ? f.ag : f.hg), 0));
    expect(row.wins).toBe(mine.filter((f) => (f.home === row.club ? f.hg > f.ag : f.ag > f.hg)).length);
  }
  expect(table.reduce((a, r) => a + r.wins, 0)).toBe(done.length);
  expect(table.reduce((a, r) => a + r.losses, 0)).toBe(done.length);
  expect(table.reduce((a, r) => a + r.gf, 0)).toBe(table.reduce((a, r) => a + r.ga, 0));
  assertSorted(s, table);
  return table;
}

describe('season schedule', () => {
  it('six clubs: the player plus the five division clubs, in a seeded order', () => {
    DIVISIONS.forEach((div, d) => {
      for (const seed of SEEDS) {
        const s = newSeason(d, 1, seed);
        expect(s.clubs).toHaveLength(6);
        expect(new Set(s.clubs)).toEqual(new Set([PLAYER_ID, ...div.clubs]));
        expect(s.phase).toBe('regular');
        expect(s.semis).toEqual([]);
        expect(s.final).toBeNull();
        expect(s.champion).toBeNull();
        expect(s.result).toBeNull();
      }
    });
    // The seed really shuffles the order (it is the last-resort tie-break).
    const orders = new Set(SEEDS.map((seed) => newSeason(0, 1, seed).clubs.join(',')));
    expect(orders.size).toBeGreaterThan(3);
  });

  it('thirty fixtures in ten rounds of three, every club exactly once per round and ten matches each', () => {
    for (let d = 0; d < DIVISIONS.length; d++) {
      for (const seed of SEEDS) {
        const s = newSeason(d, 3, seed);
        expect(s.fixtures).toHaveLength(30);
        expect(new Set(s.fixtures.map((f) => f.id)).size).toBe(30);
        for (let r = 1; r <= ROUNDS; r++) {
          const round = s.fixtures.filter((f) => f.round === r);
          expect(round).toHaveLength(3);
          const clubs = round.flatMap((f) => [f.home, f.away]);
          expect(new Set(clubs).size).toBe(6);
          expect(new Set(clubs)).toEqual(new Set(s.clubs));
        }
        expect(s.fixtures.every((f) => f.round >= 1 && f.round <= ROUNDS)).toBe(true);
        for (const c of s.clubs) {
          expect(s.fixtures.filter((f) => f.home === c || f.away === c)).toHaveLength(10);
          expect(s.fixtures.filter((f) => f.home === c)).toHaveLength(5);
          expect(s.fixtures.filter((f) => f.away === c)).toHaveLength(5);
        }
        expect(s.fixtures.every((f) => !f.done && f.hg === 0 && f.ag === 0)).toBe(true);
      }
    }
  });

  it('no self-fixtures and every ordered (home, away) pair exactly once: one home and one away meeting per opponent', () => {
    for (let d = 0; d < DIVISIONS.length; d++) {
      for (const seed of SEEDS) {
        const s = newSeason(d, 1, seed);
        const seen = new Map<string, number>();
        for (const f of s.fixtures) {
          expect(f.home).not.toBe(f.away);
          expect(s.clubs).toContain(f.home);
          expect(s.clubs).toContain(f.away);
          const k = `${f.home}>${f.away}`;
          seen.set(k, (seen.get(k) ?? 0) + 1);
        }
        for (const a of s.clubs) {
          for (const b of s.clubs) {
            if (a === b) continue;
            expect(seen.get(`${a}>${b}`)).toBe(1);
          }
        }
        expect(seen.size).toBe(30);
        // Each pair meets once in each half of the season.
        for (const f of s.fixtures.filter((x) => x.round <= 5)) {
          const back = s.fixtures.find((x) => x.home === f.away && x.away === f.home)!;
          expect(back.round).toBe(f.round + 5);
        }
      }
    }
  });

  it('is deterministic for a seed and gives every season its own fixture ids', () => {
    expect(newSeason(1, 2, 77)).toEqual(newSeason(1, 2, 77));
    const a = new Set(newSeason(0, 1, 5).fixtures.map((f) => f.id));
    const b = newSeason(0, 2, 5).fixtures.map((f) => f.id);
    const c = newSeason(1, 1, 5).fixtures.map((f) => f.id);
    expect(b.some((id) => a.has(id))).toBe(false);
    expect(c.some((id) => a.has(id))).toBe(false);
  });

  it('simulated scores always have a winner and are reproducible', () => {
    const ids = Object.keys(CLUBS);
    for (let i = 0; i < 300; i++) {
      const a = ids[i % ids.length];
      const b = ids[(i * 7 + 3) % ids.length];
      if (a === b) continue;
      const r = simulateScore(i * 13 + 1, `fx-${i}`, a, b);
      expect(r.ag).not.toBe(r.bg);
      expect(Number.isInteger(r.ag) && Number.isInteger(r.bg)).toBe(true);
      expect(r.ag).toBeGreaterThanOrEqual(0);
      expect(r.bg).toBeGreaterThanOrEqual(0);
      expect(simulateScore(i * 13 + 1, `fx-${i}`, a, b)).toEqual(r);
    }
  });
});

describe('committing player results', () => {
  it("commits only the player's next fixture and rejects everything else without changing state", () => {
    const s = newSeason(0, 1, 42);
    const next = nextPlayerMatch(s)!;
    expect(next.kind).toBe('league');
    expect(next.round).toBe(1);
    const mine = s.fixtures.filter(isPlayerFixture);
    expect(mine[0].id).toBe(next.id);
    const before = clone(s);

    expect(commitPlayerResult(s, next.id, 2, 2, true)).toBe(false); // draw
    expect(commitPlayerResult(s, next.id, 0, 0, false)).toBe(false);
    expect(commitPlayerResult(s, mine[1].id, 2, 1, false)).toBe(false); // a later player fixture
    expect(commitPlayerResult(s, mine[9].id, 2, 1, false)).toBe(false);
    expect(commitPlayerResult(s, s.fixtures.find((f) => !isPlayerFixture(f))!.id, 2, 1, false)).toBe(false); // not the player's
    expect(commitPlayerResult(s, 'nope', 2, 1, false)).toBe(false);
    expect(commitPlayerResult(s, '', 2, 1, false)).toBe(false);
    expect(s).toEqual(before);
  });

  it('records the score on the right side for home and away fixtures', () => {
    for (const seed of SEEDS) {
      const s = newSeason(0, 1, seed);
      for (let i = 0; i < 4; i++) {
        const next = nextPlayerMatch(s)!;
        const f = s.fixtures.find((x) => x.id === next.id)!;
        expect(next.home).toBe(f.home === PLAYER_ID);
        expect(next.opponent).toBe(f.home === PLAYER_ID ? f.away : f.home);
        expect(commitPlayerResult(s, next.id, 4, 1, i === 2)).toBe(true);
        expect(f.done).toBe(true);
        expect(f.ot).toBe(i === 2);
        if (f.home === PLAYER_ID) expect([f.hg, f.ag]).toEqual([4, 1]);
        else expect([f.hg, f.ag]).toEqual([1, 4]);
      }
      const row = standings(s).find((r) => r.club === PLAYER_ID)!;
      expect(row).toMatchObject({ played: 4, wins: 4, losses: 0, gf: 16, ga: 4, gd: 12, points: 12 });
    }
  });

  it('rejects a second commit of the same fixture and leaves the standings unchanged', () => {
    const s = newSeason(2, 1, 7);
    const next = nextPlayerMatch(s)!;
    expect(commitPlayerResult(s, next.id, 3, 1, false)).toBe(true);
    const before = clone(s);
    const table = standings(s);
    expect(commitPlayerResult(s, next.id, 3, 1, false)).toBe(false);
    expect(commitPlayerResult(s, next.id, 0, 5, true)).toBe(false);
    expect(s).toEqual(before);
    expect(standings(s)).toEqual(table);
  });

  it('simulates exactly the other fixtures of that round, never later rounds', () => {
    const s = newSeason(1, 1, 1234);
    for (let r = 1; r <= ROUNDS; r++) {
      const next = nextPlayerMatch(s)!;
      expect(next.round).toBe(r);
      expect(currentRound(s)).toBe(r);
      expect(commitPlayerResult(s, next.id, r % 2 ? 2 : 1, r % 2 ? 1 : 2, false)).toBe(true);
      for (const f of s.fixtures) {
        expect(f.done).toBe(f.round <= r);
        if (f.done) expect(f.hg).not.toBe(f.ag);
        else expect([f.hg, f.ag, f.ot]).toEqual([0, 0, false]);
      }
      expect(standings(s).every((row) => row.played === r)).toBe(true);
    }
  });

  it('never re-simulates earlier rounds when later results are committed', () => {
    for (const seed of SEEDS.slice(0, 4)) {
      const s = newSeason(0, 1, seed);
      const snapshots: string[] = [];
      for (let r = 1; r <= ROUNDS; r++) {
        const next = nextPlayerMatch(s)!;
        expect(commitPlayerResult(s, next.id, 1 + (r % 3), 0, r % 4 === 0)).toBe(true);
        // Everything recorded so far must be byte-identical to what it was when its round was played.
        snapshots.forEach((snap, i) => {
          expect(JSON.stringify(s.fixtures.filter((f) => f.round === i + 1))).toBe(snap);
        });
        snapshots.push(JSON.stringify(s.fixtures.filter((f) => f.round === r)));
      }
      // Playoffs do not touch league fixtures either.
      playOut(s, WIN);
      expect(s.phase).toBe('complete');
      snapshots.forEach((snap, i) => expect(JSON.stringify(s.fixtures.filter((f) => f.round === i + 1))).toBe(snap));
    }
  });

  it('standings always reflect exactly the committed fixtures (W+L = played, 3 points per win)', () => {
    for (let d = 0; d < DIVISIONS.length; d++) {
      const s = newSeason(d, 1, 99 + d);
      assertTableConsistent(s);
      expect(standings(s).every((r) => r.played === 0 && r.points === 0)).toBe(true);
      // With nothing played the table is the seeded order.
      expect(standings(s).map((r) => r.club)).toEqual(s.clubs);
      let wins = 0;
      for (let r = 1; r <= ROUNDS; r++) {
        const next = nextPlayerMatch(s)!;
        const win = (r * 7 + d) % 3 !== 0;
        if (win) wins++;
        commitPlayerResult(s, next.id, win ? 3 : 1, win ? 1 : 2, false);
        const table = assertTableConsistent(s);
        const me = table.find((x) => x.club === PLAYER_ID)!;
        expect(me.wins).toBe(wins);
        expect(me.played).toBe(r);
        expect(playerRank(s)).toBe(table.indexOf(me) + 1);
      }
    }
  });

  it('sorts by points, then goal difference, then goals scored, then seeded order', () => {
    const s = newSeason(0, 1, 5);
    const r1 = s.fixtures.filter((f) => f.round === 1);
    const setScore = (i: number, hg: number, ag: number) => Object.assign(r1[i], { done: true, hg, ag });

    // Identical results: winners tie on everything and fall back to seed order; same for the losers.
    r1.forEach((_f, i) => setScore(i, 2, 1));
    let t = standings(s);
    const winners = r1.map((f) => f.home).sort((a, b) => s.clubs.indexOf(a) - s.clubs.indexOf(b));
    const losers = r1.map((f) => f.away).sort((a, b) => s.clubs.indexOf(a) - s.clubs.indexOf(b));
    expect(t.map((r) => r.club)).toEqual([...winners, ...losers]);

    // Goal difference outranks seed order and goals scored.
    setScore(0, 2, 1);
    setScore(1, 5, 4);
    setScore(2, 2, 0);
    t = standings(s);
    expect(t[0].club).toBe(r1[2].home); // +2
    expect(t[1].club).toBe(r1[1].home); // +1 with 5 scored beats +1 with 2 scored
    expect(t[2].club).toBe(r1[0].home);
    // Among the losers: -1 with 4 scored, -1 with 1 scored, then -2.
    expect(t.slice(3).map((r) => r.club)).toEqual([r1[1].away, r1[0].away, r1[2].away]);

    // Points outrank any goal difference: an away side that wins twice narrowly sits above a side with one 9-0.
    const r2 = s.fixtures.filter((f) => f.round === 2);
    r2.forEach((f) => Object.assign(f, { done: true, hg: 0, ag: 1 }));
    Object.assign(r1[2], { hg: 9, ag: 0 });
    t = standings(s);
    assertSorted(s, t);
    const twoWins = t.filter((r) => r.wins === 2).map((r) => r.club);
    expect(twoWins.length).toBeGreaterThan(0);
    expect(t.slice(0, twoWins.length).map((r) => r.club).sort()).toEqual([...twoWins].sort());
  });
});

describe('playoffs and season outcome', () => {
  it('always winning: top seed, semis are 1v4 and 2v3 from the final table, champion and promoted', () => {
    for (let d = 0; d < DIVISIONS.length; d++) {
      for (const seed of SEEDS.slice(0, 3)) {
        const s = newSeason(d, 1, seed);
        expect(playOut(s, WIN, (n) => n.kind !== 'league')).toBe(10);
        const table = assertTableConsistent(s);
        expect(table[0].club).toBe(PLAYER_ID);
        expect(table[0]).toMatchObject({ wins: 10, losses: 0, points: 30, gf: 30, ga: 0 });
        expect(s.phase).toBe('semis');
        expect(s.semis).toHaveLength(2);
        expect([s.semis[0].a, s.semis[0].b]).toEqual([table[0].club, table[3].club]);
        expect([s.semis[1].a, s.semis[1].b]).toEqual([table[1].club, table[2].club]);
        // The semi without the player is already resolved; the player's is waiting.
        expect(s.semis[1].done).toBe(true);
        expect(s.semis[1].ag).not.toBe(s.semis[1].bg);
        expect(s.semis[0].done).toBe(false);
        expect(s.final).toBeNull();

        const semi = nextPlayerMatch(s)!;
        expect(semi).toMatchObject({ kind: 'semi', id: s.semis[0].id, opponent: table[3].club, home: true });
        expect(commitPlayerResult(s, semi.id, 1, 1, true)).toBe(false); // no draws in playoffs either
        expect(commitPlayerResult(s, s.semis[1].id, 2, 1, false)).toBe(false); // someone else's tie
        expect(commitPlayerResult(s, semi.id, 2, 1, true)).toBe(true);
        expect(commitPlayerResult(s, semi.id, 2, 1, true)).toBe(false);
        expect(s.phase).toBe('final');
        expect(s.semis[0]).toMatchObject({ done: true, ag: 2, bg: 1, ot: true });
        const sf2Winner = s.semis[1].ag > s.semis[1].bg ? s.semis[1].a : s.semis[1].b;
        expect(s.final).toMatchObject({ a: PLAYER_ID, b: sf2Winner, done: false });
        expect(s.result).toBeNull();

        const fin = nextPlayerMatch(s)!;
        expect(fin).toMatchObject({ kind: 'final', id: s.final!.id, opponent: sf2Winner });
        expect(commitPlayerResult(s, fin.id, 4, 3, false)).toBe(true);
        expect(s.phase).toBe('complete');
        expect(s.champion).toBe(PLAYER_ID);
        expect(s.result).toMatchObject({ division: d, seasonNo: 1, rank: 1, wins: 10, losses: 0, stage: 'champion', champion: PLAYER_ID });
        expect(s.result!.promoted).toBe(d < LAST_DIVISION);
        expect(nextPlayerMatch(s)).toBeNull();
        expect(commitPlayerResult(s, fin.id, 4, 3, false)).toBe(false);
        expect(validCareer(s)).toBe(true);
      }
    }
  });

  it('winning the title in the last division does not promote', () => {
    const s = newSeason(LAST_DIVISION, 4, 31);
    playOut(s, WIN);
    expect(s.result).toMatchObject({ stage: 'champion', promoted: false, division: LAST_DIVISION });
  });

  it('always losing: the player misses the playoffs and the season still completes with a champion', () => {
    for (let d = 0; d < DIVISIONS.length; d++) {
      for (const seed of SEEDS.slice(0, 3)) {
        const s = newSeason(d, 2, seed);
        expect(playOut(s, LOSE)).toBe(10);
        expect(s.phase).toBe('complete');
        expect(nextPlayerMatch(s)).toBeNull();
        const table = assertTableConsistent(s);
        expect(table[5].club).toBe(PLAYER_ID);
        expect(s.semis).toHaveLength(2);
        expect([s.semis[0].a, s.semis[0].b, s.semis[1].a, s.semis[1].b]).toEqual([table[0].club, table[3].club, table[1].club, table[2].club]);
        expect(s.semis.every((t) => t.done && t.ag !== t.bg && t.a !== PLAYER_ID && t.b !== PLAYER_ID)).toBe(true);
        expect(s.final!.done).toBe(true);
        expect(s.final!.ag).not.toBe(s.final!.bg);
        const finalWinner = s.final!.ag > s.final!.bg ? s.final!.a : s.final!.b;
        expect(s.champion).toBe(finalWinner);
        expect(s.champion).not.toBe(PLAYER_ID);
        expect(CLUBS[s.champion!]).toBeDefined();
        expect(s.result).toMatchObject({ stage: 'missed', rank: 6, wins: 0, losses: 10, promoted: false, champion: finalWinner });
        expect(validCareer(s)).toBe(true);
      }
    }
  });

  it('finishing fifth also misses the playoffs; finishing fourth gets the 1v4 semi away', () => {
    // Search a few seeds for seasons where the player ends exactly 5th and exactly 4th under a fixed policy.
    let sawFifth = false;
    let sawFourth = false;
    for (let seed = 1; seed <= 60 && !(sawFifth && sawFourth); seed++) {
      for (const winsWanted of [3, 4, 5, 6]) {
        const s = newSeason(0, 1, seed);
        let k = 0;
        playOut(s, () => (k++ < winsWanted ? [2, 1] : [1, 2]), (n) => n.kind !== 'league');
        const rank = playerRank(s);
        if (rank === 5 && !sawFifth) {
          sawFifth = true;
          expect(s.phase).toBe('complete');
          expect(s.result!.stage).toBe('missed');
          expect(nextPlayerMatch(s)).toBeNull();
        }
        if (rank === 4 && !sawFourth) {
          sawFourth = true;
          expect(s.phase).toBe('semis');
          const next = nextPlayerMatch(s)!;
          expect(next).toMatchObject({ kind: 'semi', id: s.semis[0].id, home: false, opponent: standings(s)[0].club });
          expect(s.semis[0].b).toBe(PLAYER_ID);
          // Win it as the away side: the score lands on the b side and the player goes through.
          expect(commitPlayerResult(s, next.id, 3, 2, false)).toBe(true);
          expect(s.semis[0]).toMatchObject({ ag: 2, bg: 3, done: true });
          expect(s.final!.a).toBe(PLAYER_ID);
        }
      }
    }
    expect(sawFifth).toBe(true);
    expect(sawFourth).toBe(true);
  });

  it('losing the semi-final: stage semifinalist, and the final is still simulated', () => {
    const s = newSeason(1, 1, 42);
    playOut(s, WIN, (n) => n.kind !== 'league');
    const semi = nextPlayerMatch(s)!;
    const opp = semi.opponent;
    expect(commitPlayerResult(s, semi.id, 0, 1, false)).toBe(true);
    expect(s.phase).toBe('complete');
    expect(s.final).not.toBeNull();
    expect(s.final!.done).toBe(true);
    expect(s.final!.a).toBe(opp);
    expect([s.final!.a, s.final!.b]).not.toContain(PLAYER_ID);
    expect(s.champion).toBe(s.final!.ag > s.final!.bg ? s.final!.a : s.final!.b);
    expect(s.result).toMatchObject({ stage: 'semifinalist', promoted: false, rank: 1, wins: 10 });
    expect(nextPlayerMatch(s)).toBeNull();
    expect(validCareer(s)).toBe(true);
  });

  it('losing the final: stage finalist, not promoted', () => {
    const s = newSeason(0, 1, 7);
    playOut(s, WIN, (n) => n.kind === 'final');
    const fin = nextPlayerMatch(s)!;
    expect(fin.kind).toBe('final');
    expect(commitPlayerResult(s, fin.id, 1, 2, true)).toBe(true);
    expect(s.phase).toBe('complete');
    expect(s.champion).toBe(fin.opponent);
    expect(s.result).toMatchObject({ stage: 'finalist', promoted: false, champion: fin.opponent });
    expect(s.final).toMatchObject({ ot: true, done: true });
  });

  it('is deterministic: same seed and same player results give the identical final state', () => {
    const policy: Decide = (n) => (n.round % 3 === 0 ? [1, 2] : [3, 1]);
    for (const seed of SEEDS) {
      const a = newSeason(2, 5, seed);
      const b = newSeason(2, 5, seed);
      playOut(a, policy);
      playOut(b, policy);
      expect(a.phase).toBe('complete');
      expect(b).toEqual(a);
    }
    // Other clubs' results do not depend on what the player does in their own match.
    const x = newSeason(0, 1, 11);
    const y = newSeason(0, 1, 11);
    playOut(x, WIN, (n) => n.round > 4);
    playOut(y, LOSE, (n) => n.round > 4);
    const others = (s: CareerState) => s.fixtures.filter((f) => !isPlayerFixture(f) && f.round <= 4);
    expect(others(y)).toEqual(others(x));
  });
});

describe('validCareer', () => {
  function statesAtEveryPhase(): CareerState[] {
    const out: CareerState[] = [];
    for (let d = 0; d < DIVISIONS.length; d++) {
      const fresh = newSeason(d, 1 + d, 100 + d);
      out.push(clone(fresh));
      const mid = clone(fresh);
      playOut(mid, WIN, (n) => n.round > 4);
      out.push(mid);
      const semis = clone(fresh);
      playOut(semis, WIN, (n) => n.kind !== 'league');
      expect(semis.phase).toBe('semis');
      out.push(semis);
      const fin = clone(semis);
      playOut(fin, WIN, (n) => n.kind === 'final');
      expect(fin.phase).toBe('final');
      out.push(fin);
      const done = clone(fin);
      playOut(done, WIN);
      expect(done.phase).toBe('complete');
      out.push(done);
      const missed = clone(fresh);
      playOut(missed, LOSE);
      expect(missed.phase).toBe('complete');
      out.push(missed);
    }
    return out;
  }

  it('accepts generated states at every phase, also after a JSON round trip', () => {
    const states = statesAtEveryPhase();
    expect(new Set(states.map((s) => s.phase))).toEqual(new Set(['regular', 'semis', 'final', 'complete']));
    for (const s of states) {
      expect(validCareer(s)).toBe(true);
      expect(validCareer(clone(s))).toBe(true);
    }
  });

  it('rejects corrupted states', () => {
    const base = newSeason(0, 1, 5);
    const complete = clone(base);
    playOut(complete, WIN);
    const corrupt = (from: CareerState, edit: (s: any) => void): unknown => {
      const c: any = clone(from);
      edit(c);
      return c;
    };
    const bad: [string, unknown][] = [
      ['null', null],
      ['string', 'career'],
      ['array', []],
      ['wrong fixture count (29)', corrupt(base, (s) => s.fixtures.pop())],
      ['wrong fixture count (31)', corrupt(base, (s) => s.fixtures.push({ ...s.fixtures[0] }))],
      ['no fixtures', corrupt(base, (s) => (s.fixtures = []))],
      ['self fixture', corrupt(base, (s) => (s.fixtures[3].away = s.fixtures[3].home))],
      ['done fixture with a level score', corrupt(base, (s) => Object.assign(s.fixtures[0], { done: true, hg: 2, ag: 2 }))],
      ['done fixture 0-0', corrupt(base, (s) => (s.fixtures[0].done = true))],
      ['unknown club in fixture', corrupt(base, (s) => (s.fixtures[5].home = 'ghost_fc'))],
      ['unknown club in list', corrupt(base, (s) => (s.clubs[s.clubs.indexOf(PLAYER_ID) === 0 ? 1 : 0] = 'ghost_fc'))],
      ['player missing', corrupt(base, (s) => (s.clubs[s.clubs.indexOf(PLAYER_ID)] = 'apex_orbit'))],
      ['five clubs', corrupt(base, (s) => s.clubs.pop())],
      ['negative score', corrupt(base, (s) => Object.assign(s.fixtures[0], { done: true, hg: -1, ag: 2 }))],
      ['fractional score', corrupt(base, (s) => Object.assign(s.fixtures[0], { done: true, hg: 1.5, ag: 2 }))],
      ['round out of range', corrupt(base, (s) => (s.fixtures[0].round = 11))],
      ['round zero', corrupt(base, (s) => (s.fixtures[0].round = 0))],
      ['bad division', corrupt(base, (s) => (s.division = DIVISIONS.length))],
      ['negative division', corrupt(base, (s) => (s.division = -1))],
      ['season zero', corrupt(base, (s) => (s.seasonNo = 0))],
      ['non-finite seed', corrupt(base, (s) => (s.seed = 'abc'))],
      ['unknown phase', corrupt(base, (s) => (s.phase = 'offseason'))],
      ['semis phase without ties', corrupt(base, (s) => (s.phase = 'semis'))],
      ['final phase without a final', corrupt(complete, (s) => ((s.phase = 'final'), (s.final = null)))],
      ['complete without a result', corrupt(complete, (s) => (s.result = null))],
      ['complete without a champion', corrupt(complete, (s) => (s.champion = null))],
      ['level playoff tie', corrupt(complete, (s) => Object.assign(s.semis[0], { ag: 1, bg: 1 }))],
      ['semis not an array', corrupt(base, (s) => (s.semis = null))],
      ['done flag not boolean', corrupt(base, (s) => (s.fixtures[0].done = 1))],
    ];
    for (const [label, state] of bad) {
      expect(validCareer(state), label).toBe(false);
    }
    expect(validCareer(base)).toBe(true);
    expect(validCareer(complete)).toBe(true);
  });
});
