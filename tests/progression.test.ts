import { describe, expect, it } from 'vitest';
import { newSeason, nextPlayerMatch, standings, type NextMatch } from '../src/career/career';
import { CHASSIS, CHASSIS_ORDER } from '../src/content/chassis';
import { DIVISIONS, PLAYER_ID } from '../src/content/clubs';
import { COSMETICS, STARTER_COSMETICS } from '../src/content/cosmetics';
import { TRIALS, TRIAL_ORDER } from '../src/content/trials';
import type { MatchResult } from '../src/game/modes/matchMode';
import type { RobotStats } from '../src/game/sim/match';
import {
  REWARDS,
  claimLevels,
  commitLesson,
  commitMatch,
  commitTrial,
  itemPrice,
  levelFor,
  levelProgress,
  levelReward,
  levelThreshold,
  matchRewards,
  purchase,
  startNextSeason,
  unlockedArenas,
  usePick,
} from '../src/progression/progression';
import { defaultClub, newSave, type SaveGame } from '../src/storage/save';
import { defaultSettings } from '../src/storage/settings';

const LAST_DIVISION = DIVISIONS.length - 1;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function freshSave(seed = 4242): SaveGame {
  return newSave(defaultClub(), defaultSettings(), seed);
}

function stats(p: Partial<RobotStats> = {}): RobotStats {
  return { goals: 0, assists: 0, saves: 0, shots: 0, passes: 0, interceptions: 0, kicks: 0, swingKicks: 0, swings: 0, ownGoals: 0, ...p };
}

function result(p: Partial<MatchResult> = {}): MatchResult {
  const score = p.score ?? [2, 1];
  return {
    matchId: 'm-1',
    kind: 'quick',
    arena: 'harbor_park',
    opponent: 'Ember Works',
    score,
    won: score[0] > score[1],
    overtime: false,
    duration: 180,
    player: stats(),
    mate: stats(),
    goals: [],
    ...p,
  };
}

const CTX = { label: 'Test match', opponentId: 'ember_works' };

/** Everything commitMatch is allowed to change, minus timestamps. */
function economy(save: SaveGame) {
  return clone({
    credits: save.credits,
    xp: save.xp,
    owned: save.owned,
    picks: save.picks,
    claimedLevels: save.claimedLevels,
    records: save.records,
    career: save.career,
    seasons: save.seasons,
    trophies: save.trophies,
    committed: save.committed,
    results: save.results.map((r) => ({ ...r, at: 0 })),
    trials: save.trials,
    lessons: save.lessons,
  });
}

function careerResult(next: NextMatch, pg: number, og: number, p: Partial<MatchResult> = {}): MatchResult {
  return result({ matchId: `c-${next.id}`, kind: next.kind === 'league' ? 'career' : 'playoff', fixtureId: next.id, score: [pg, og], won: pg > og, ...p });
}

/** Plays the rest of the season through commitMatch. Returns every committed record. */
function playSeason(save: SaveGame, decide: (next: NextMatch) => [number, number]) {
  const out = [];
  for (let guard = 0; guard < 20; guard++) {
    const next = nextPlayerMatch(save.career);
    if (!next) break;
    const [pg, og] = decide(next);
    out.push(commitMatch(save, careerResult(next, pg, og), CTX));
  }
  expect(nextPlayerMatch(save.career)).toBeNull();
  return out;
}

/** Reward lines paid by the match itself (not objectives, achievements, mastery or the season). */
const matchLines = <T extends { source?: string }>(lines: T[]) => lines.filter((l) => (l.source ?? 'match') === 'match');
const sum = (lines: { credits: number; xp: number }[]) => lines.reduce((a, l) => ({ credits: a.credits + l.credits, xp: a.xp + l.xp }), { credits: 0, xp: 0 });
const contributionLabels: string[] = REWARDS.contribution.map((t) => t.label);

describe('commitMatch', () => {
  it('is idempotent: the same result twice pays once and returns the same record', () => {
    const save = freshSave();
    const res = result({ matchId: 'q-1', player: stats({ goals: 2, saves: 1 }), goals: [{ time: 10, team: 0, scorer: 0, assist: -1, ownGoalBy: -1, overtime: false, swing: true }] });
    const first = commitMatch(save, res, CTX);
    expect(first.credits).toBeGreaterThan(0);
    expect(first.xp).toBeGreaterThan(0);
    expect(save.xp).toBe(first.xp);
    expect(save.credits).toBeGreaterThanOrEqual(first.credits); // level grants may add credits on top
    expect(save.records).toMatchObject({ matches: 1, wins: 1, goals: 2, saves: 1, swingGoals: 1, streak: 1 });
    const after = economy(save);

    for (let i = 0; i < 5; i++) {
      const again = commitMatch(save, res, CTX);
      expect(again).toBe(first);
      expect(economy(save)).toEqual(after);
    }
    // A structurally equal copy (e.g. rebuilt after a refresh) is recognised by its id too.
    const copy = commitMatch(save, clone(res), { label: 'other label', opponentId: 'x' });
    expect(copy).toBe(first);
    expect(economy(save)).toEqual(after);
    expect(save.committed.filter((id) => id === 'q-1')).toHaveLength(1);
    expect(save.results).toHaveLength(1);
  });

  it('a different match id is a different match and pays again', () => {
    const save = freshSave();
    const a = commitMatch(save, result({ matchId: 'q-1' }), CTX);
    const b = commitMatch(save, result({ matchId: 'q-2' }), CTX);
    expect(b).not.toBe(a);
    // The match lines are identical; objectives / achievements completed by the first match may add extra lines.
    expect(sum(matchLines(b.rewards))).toEqual(sum(matchLines(a.rewards)));
    expect(save.records.matches).toBe(2);
    expect(save.xp).toBe(a.xp + b.xp);
  });

  it('still refuses to pay twice after the detailed record has rolled out of the recent-results list', () => {
    const save = freshSave();
    const first = result({ matchId: 'q-0' });
    commitMatch(save, first, CTX);
    for (let i = 1; i <= 14; i++) commitMatch(save, result({ matchId: `q-${i}` }), CTX);
    expect(save.results.some((r) => r.matchId === 'q-0')).toBe(false);
    expect(save.committed).toContain('q-0');
    const before = economy(save);
    const again = commitMatch(save, first, CTX);
    expect(again.matchId).toBe('q-0');
    expect(again.credits).toBe(0);
    expect(again.xp).toBe(0);
    expect(again.rewards).toEqual([]);
    expect(again.grants).toEqual([]);
    expect(economy(save)).toEqual(before);
  });

  it('quick matches pay the reduced factor and never touch career fixtures', () => {
    const quickSave = freshSave();
    const careerSave = freshSave();
    const next = nextPlayerMatch(careerSave.career)!;
    const player = stats({ goals: 1 });

    const career = commitMatch(careerSave, careerResult(next, 2, 1, { player }), CTX);
    const careerBefore = clone(quickSave.career);
    // Even a (bogus) fixture id on a quick match must not reach the season.
    const quick = commitMatch(quickSave, result({ matchId: 'q-1', kind: 'quick', fixtureId: next.id, score: [2, 1], player }), CTX);

    expect(quickSave.career).toEqual(careerBefore);
    expect(quickSave.career.fixtures.every((f) => !f.done)).toBe(true);
    expect(careerSave.career.fixtures.filter((f) => f.done)).toHaveLength(3);

    const qm = matchLines(quick.rewards);
    const cm = matchLines(career.rewards);
    expect(qm.map((l) => l.label.replace('Quick match played', 'Match completed'))).toEqual(cm.map((l) => l.label));
    qm.forEach((l, i) => {
      expect(l.credits).toBe(Math.round(cm[i].credits * REWARDS.quickFactor));
      expect(l.xp).toBe(Math.round(cm[i].xp * REWARDS.quickFactor));
    });
    // Objectives completed in a quick match pay the same reduced factor.
    for (const l of quick.rewards.filter((x) => x.source === 'objective')) {
      const twin = career.rewards.find((x) => x.label === l.label);
      if (twin) expect(l.xp).toBe(Math.round(twin.xp * REWARDS.quickFactor));
    }
    expect(sum(qm).credits).toBeLessThan(sum(cm).credits);
    expect(sum(qm).xp).toBeLessThan(sum(cm).xp);
    expect(quickSave.credits).toBe(quick.credits);
    expect(quickSave.xp).toBe(quick.xp);
    // Records still count quick matches.
    expect(quickSave.records.matches).toBe(1);
  });

  it('a career result records the fixture exactly once and the standings follow', () => {
    const save = freshSave();
    const next = nextPlayerMatch(save.career)!;
    const rec = commitMatch(save, careerResult(next, 3, 1), CTX);
    const f = save.career.fixtures.find((x) => x.id === next.id)!;
    expect(f.done).toBe(true);
    expect(f.home === PLAYER_ID ? [f.hg, f.ag] : [f.ag, f.hg]).toEqual([3, 1]);
    const row = standings(save.career).find((r) => r.club === PLAYER_ID)!;
    expect(row).toMatchObject({ played: 1, wins: 1, gf: 3, ga: 1, points: 3 });
    const after = economy(save);
    // Double-click on Continue, results screen reopened, etc.
    expect(commitMatch(save, careerResult(next, 3, 1), CTX)).toBe(rec);
    expect(commitMatch(save, careerResult(next, 0, 9), CTX)).toBe(rec);
    expect(economy(save)).toEqual(after);
    expect(nextPlayerMatch(save.career)!.round).toBe(2);
  });

  it('a loss still pays the completion reward, no win bonus, and resets the streak', () => {
    const save = freshSave();
    commitMatch(save, result({ matchId: 'w1', score: [2, 0] }), CTX);
    commitMatch(save, result({ matchId: 'w2', score: [3, 0] }), CTX);
    expect(save.records).toMatchObject({ streak: 2, bestStreak: 2, bestMargin: 3 });
    const before = { credits: save.credits, xp: save.xp };

    const win = matchRewards(result({ kind: 'career', score: [1, 0] }));
    const lossRes = result({ matchId: 'l1', kind: 'career', score: [0, 4] });
    const loss = commitMatch(save, lossRes, CTX);
    expect(loss.won).toBe(false);
    expect(loss.credits).toBeGreaterThan(0);
    expect(loss.xp).toBeGreaterThan(0);
    expect(matchLines(loss.rewards)).toHaveLength(1);
    expect(loss.rewards[0]).toMatchObject({ credits: REWARDS.matchComplete.credits, xp: REWARDS.matchComplete.xp });
    expect(sum(win).credits).toBeGreaterThan(sum(matchLines(loss.rewards)).credits);
    expect(sum(win).xp).toBeGreaterThan(sum(matchLines(loss.rewards)).xp);
    expect(save.credits).toBe(before.credits + loss.credits);
    expect(save.xp).toBe(before.xp + loss.xp);
    expect(save.records).toMatchObject({ matches: 3, wins: 2, streak: 0, bestStreak: 2, bestMargin: 3 });
  });

  it('the contribution tier is awarded at most once and recognises saves, passes, assists and interceptions', () => {
    const base = sum(matchRewards(result({ kind: 'career', score: [0, 1] })));
    const cases: Partial<RobotStats>[] = [
      { saves: 1 },
      { passes: 4 },
      { assists: 1 },
      { interceptions: 2 },
      { saves: 3 },
      { passes: 6, saves: 1 },
      { goals: 1 },
      { goals: 6, assists: 4, saves: 5, passes: 20, interceptions: 9 },
    ];
    for (const c of cases) {
      const lines = matchRewards(result({ kind: 'career', score: [0, 1], player: stats(c) }));
      const tiers = lines.filter((l) => contributionLabels.includes(l.label));
      expect(tiers, JSON.stringify(c)).toHaveLength(1);
      expect(sum(lines).credits).toBeGreaterThan(base.credits);
      expect(sum(lines).xp).toBeGreaterThan(base.xp);
    }
    // No contribution, no tier; and things that are not contributions do not count.
    for (const c of [{}, { shots: 9, kicks: 40, swings: 12, swingKicks: 5 }, { passes: 3 }, { interceptions: 1 }] as Partial<RobotStats>[]) {
      const lines = matchRewards(result({ kind: 'career', score: [0, 1], player: stats(c) }));
      expect(lines.filter((l) => contributionLabels.includes(l.label))).toHaveLength(0);
    }
    // A defensive performance can reach the same top tier as a goal-scoring one.
    const keeper = matchRewards(result({ player: stats({ saves: 5 }) })).find((l) => contributionLabels.includes(l.label))!;
    const striker = matchRewards(result({ player: stats({ goals: 3 }) })).find((l) => contributionLabels.includes(l.label))!;
    expect(keeper).toEqual(striker);
    // More contribution never pays less.
    let last = 0;
    for (let saves = 0; saves <= 8; saves++) {
      const c = sum(matchRewards(result({ player: stats({ saves }) }))).credits;
      expect(c).toBeGreaterThanOrEqual(last);
      last = c;
    }
  });

  it('the committed record carries exactly what was paid', () => {
    const save = freshSave();
    save.credits = 1000;
    save.xp = 20;
    const rec = commitMatch(save, result({ matchId: 'q-9', score: [5, 0], player: stats({ goals: 3 }) }), CTX);
    expect(rec.credits).toBe(sum(rec.rewards).credits);
    expect(rec.xp).toBe(sum(rec.rewards).xp);
    expect(rec.xpBefore).toBe(20);
    expect(save.xp).toBe(20 + rec.xp);
    // Level grants are on top of the listed match credits.
    const levelCredits = save.credits - 1000 - rec.credits;
    expect(levelCredits).toBeGreaterThanOrEqual(0);
    expect(rec.score).toEqual([5, 0]);
    expect(rec.stats.goals).toBe(3);
    expect(save.flags.playedMatch).toBe(true);
  });
});

describe('club levels', () => {
  it('level thresholds are consistent', () => {
    expect(levelFor(0)).toBe(0);
    let prev = 0;
    for (let l = 1; l <= 14; l++) {
      const t = levelThreshold(l);
      expect(t).toBeGreaterThan(prev);
      expect(levelFor(t)).toBe(l);
      expect(levelFor(t - 1)).toBe(l - 1);
      const p = levelProgress(t);
      expect(p).toMatchObject({ level: l, from: t, frac: 0 });
      expect(p.to).toBe(levelThreshold(l + 1));
      prev = t;
    }
  });

  it('crossing several milestones at once grants each level exactly once', () => {
    const save = freshSave();
    save.xp = levelThreshold(3); // level 3 straight away
    const grants = claimLevels(save);
    expect(grants).toHaveLength(3);
    expect(save.claimedLevels).toEqual([1, 2, 3]);
    const expectPicks = [1, 2, 3].filter((l) => levelReward(l).kind === 'pick').length;
    const expectCredits = [1, 2, 3].reduce((a, l) => {
      const r = levelReward(l);
      return a + (r.kind === 'credits' ? r.amount : 0);
    }, 0);
    expect(save.picks).toBe(expectPicks);
    expect(save.credits).toBe(expectCredits);
    expect(expectPicks + expectCredits).toBeGreaterThan(0);

    const snapshot = economy(save);
    expect(claimLevels(save)).toEqual([]);
    expect(claimLevels(save)).toEqual([]);
    expect(economy(save)).toEqual(snapshot);
  });

  it('a single match that crosses two thresholds grants both levels once, and recommitting grants nothing', () => {
    const save = freshSave();
    // XP sits just below the second threshold with nothing claimed yet (e.g. XP earned from trials before the
    // level rewards existed): one match crosses it and both outstanding levels are granted together.
    save.xp = levelThreshold(2) - 20;
    const res = result({ matchId: 'q-lvl', score: [1, 0] });
    const rec = commitMatch(save, res, CTX);
    expect(save.xp).toBeGreaterThanOrEqual(levelThreshold(2));
    expect(levelFor(save.xp)).toBe(2);
    expect(rec.grants.map((g) => g.label).filter((l) => l.startsWith('Club level'))).toEqual(['Club level 1', 'Club level 2']);
    expect(rec.progress).toMatchObject({ levelBefore: 1, levelAfter: 2 });
    expect(save.claimedLevels).toEqual([1, 2]);
    const snapshot = economy(save);
    expect(commitMatch(save, res, CTX)).toBe(rec);
    expect(economy(save)).toEqual(snapshot);
    // The next match never grants levels 1 or 2 again (it may reach level 3 through achievements).
    const next = commitMatch(save, result({ matchId: 'q-lvl-2', score: [0, 1] }), CTX);
    expect(next.grants.filter((g) => g.label === 'Club level 1' || g.label === 'Club level 2')).toEqual([]);
    expect(save.claimedLevels).toEqual(Array.from({ length: levelFor(save.xp) }, (_v, i) => i + 1));
  });

  it('a chassis level reward unlocks the chassis, or falls back to credits when it is already owned', () => {
    const chassisLevels = CHASSIS_ORDER.filter((id) => CHASSIS[id].unlockLevel > 0).map((id) => ({ id, level: CHASSIS[id].unlockLevel }));
    expect(chassisLevels.length).toBeGreaterThan(0);
    for (const { id, level } of chassisLevels) {
      const reward = levelReward(level);
      expect(reward).toMatchObject({ kind: 'chassis', id });

      // Not owned: unlocked for free, no credits for that level.
      const a = freshSave();
      a.xp = levelThreshold(level);
      a.claimedLevels = Array.from({ length: level - 1 }, (_v, i) => i + 1);
      const ga = claimLevels(a);
      expect(ga).toHaveLength(1);
      expect(ga[0].kind).toBe('chassis');
      expect(a.owned.filter((o) => o === `chassis:${id}`)).toHaveLength(1);
      expect(a.credits).toBe(0);

      // Already bought: credits instead, no duplicate ownership entry.
      const b = freshSave();
      b.credits = CHASSIS[id].credits;
      expect(purchase(b, `chassis:${id}`)).toBe('ok');
      expect(b.credits).toBe(0);
      b.xp = levelThreshold(level);
      b.claimedLevels = Array.from({ length: level - 1 }, (_v, i) => i + 1);
      const gb = claimLevels(b);
      expect(gb).toHaveLength(1);
      expect(gb[0].kind).toBe('credits');
      expect(b.credits).toBeGreaterThan(0);
      expect(b.credits).toBe(reward.kind === 'chassis' ? reward.fallback : -1);
      expect(b.owned.filter((o) => o === `chassis:${id}`)).toHaveLength(1);
      expect(claimLevels(b)).toEqual([]);
    }
  });

  it('lessons pay once', () => {
    const save = freshSave();
    const first = commitLesson(save, 'move');
    expect(first.first).toBe(true);
    // The lesson reward plus any achievement it completes (Academy Graduate bronze).
    expect(save.credits).toBe(first.credits + sum(first.bonus).credits);
    expect(save.xp).toBe(first.xp + sum(first.bonus).xp);
    expect(first.bonus.map((l) => l.source)).toEqual(['achievement']);
    const snapshot = economy(save);
    expect(commitLesson(save, 'move')).toMatchObject({ first: false, credits: 0, xp: 0, grants: [], bonus: [] });
    expect(economy(save)).toEqual(snapshot);
  });
});

describe('championship and seasons', () => {
  it('winning the title adds exactly one trophy and one season record, with the first-title bonus', () => {
    const save = freshSave();
    const records = playSeason(save, () => [3, 0]);
    expect(records).toHaveLength(12);
    const last = records[records.length - 1];
    expect(save.career.phase).toBe('complete');
    expect(save.career.result).toMatchObject({ stage: 'champion', promoted: true });
    expect(save.trophies).toEqual([{ division: 0, seasonNo: 1 }]);
    expect(save.seasons).toHaveLength(1);
    expect(save.seasons[0]).toEqual(save.career.result);
    expect(records.filter((r) => r.seasonComplete)).toEqual([last]);
    expect(last.rewards.filter((l) => l.credits === REWARDS.divisionTitle.credits && l.xp === REWARDS.divisionTitle.xp)).toHaveLength(1);
    expect(last.rewards.filter((l) => l.label === 'Season completed')).toHaveLength(1);
    expect(last.grants.filter((g) => g.kind === 'trophy')).toHaveLength(1);
    // Earlier matches of the season carried no season / title lines.
    for (const r of records.slice(0, -1)) {
      expect(r.rewards.some((l) => l.label === 'Season completed' || /champions|Title defended/.test(l.label))).toBe(false);
      expect(r.grants.some((g) => g.kind === 'trophy')).toBe(false);
    }
    // Everything paid adds up (level credit grants come on top).
    const paid = records.reduce((a, r) => a + r.credits, 0);
    const levelCredits = save.claimedLevels.reduce((a, l) => {
      const r = levelReward(l);
      return a + (r.kind === 'credits' ? r.amount : 0);
    }, 0);
    expect(save.credits).toBe(paid + levelCredits);
    expect(save.xp).toBe(records.reduce((a, r) => a + r.xp, 0));

    // Recommitting the final (double click, reopened results) changes nothing.
    const snapshot = economy(save);
    const finalId = save.career.final!.id;
    expect(commitMatch(save, result({ matchId: `c-${finalId}`, kind: 'playoff', fixtureId: finalId, score: [3, 0] }), CTX)).toBe(last);
    expect(economy(save)).toEqual(snapshot);
    expect(save.trophies).toHaveLength(1);
    expect(save.seasons).toHaveLength(1);
  });

  it('a season without the title pays the season-complete line but no trophy or title bonus', () => {
    const save = freshSave();
    const records = playSeason(save, () => [0, 2]);
    expect(records).toHaveLength(10);
    const last = records[records.length - 1];
    expect(save.career.phase).toBe('complete');
    expect(save.career.result!.stage).toBe('missed');
    expect(last.seasonComplete).toBe(true);
    expect(last.rewards.filter((l) => l.label === 'Season completed')).toHaveLength(1);
    // match completed + season completed + season prize (objective / mastery / achievement lines may follow)
    expect(last.rewards.filter((l) => l.source === 'match' || l.source === 'season').map((l) => l.label)).toEqual(['Match completed', 'Season completed', 'Season prize · 6th in the league']);
    expect(save.trophies).toEqual([]);
    expect(save.seasons).toHaveLength(1);
    expect(last.grants.some((g) => g.kind === 'trophy')).toBe(false);
  });

  it('startNextSeason returns false and changes nothing while the season is in progress', () => {
    const save = freshSave();
    const before = clone(save);
    expect(startNextSeason(save)).toBe(false);
    const next = nextPlayerMatch(save.career)!;
    commitMatch(save, careerResult(next, 2, 1), CTX);
    const mid = clone(save.career);
    expect(startNextSeason(save)).toBe(false);
    expect(save.career).toEqual(mid);
    expect(before.career.fixtures).toHaveLength(30);
    // Also not between the league and the playoffs.
    for (let i = 0; i < 9; i++) commitMatch(save, careerResult(nextPlayerMatch(save.career)!, 2, 1), CTX);
    expect(save.career.phase).toBe('semis');
    expect(startNextSeason(save)).toBe(false);
    expect(save.career.phase).toBe('semis');
  });

  it('promotion: a champion moves up one division and keeps credits, items and history', () => {
    const save = freshSave();
    save.credits = 5000;
    expect(purchase(save, 'face_star')).toBe('ok');
    playSeason(save, () => [3, 0]);
    const kept = clone({ credits: save.credits, xp: save.xp, owned: save.owned, picks: save.picks, seasons: save.seasons, trophies: save.trophies, records: save.records, committed: save.committed, results: save.results, claimedLevels: save.claimedLevels });
    const oldSeed = save.career.seed;

    expect(startNextSeason(save)).toBe(true);
    expect(save.career).toMatchObject({ division: 1, seasonNo: 2, phase: 'regular', champion: null, result: null });
    expect(save.career.fixtures).toHaveLength(30);
    expect(save.career.fixtures.every((f) => !f.done)).toBe(true);
    expect(new Set(save.career.clubs)).toEqual(new Set([PLAYER_ID, ...DIVISIONS[1].clubs]));
    expect(save.career.seed).not.toBe(oldSeed);
    expect(clone({ credits: save.credits, xp: save.xp, owned: save.owned, picks: save.picks, seasons: save.seasons, trophies: save.trophies, records: save.records, committed: save.committed, results: save.results, claimedLevels: save.claimedLevels })).toEqual(kept);
    // Calling it again mid-season is refused.
    expect(startNextSeason(save)).toBe(false);
    expect(save.career.seasonNo).toBe(2);
  });

  it('no promotion without the title: semifinalists, finalists and non-qualifiers replay the division', () => {
    const policies: [string, (n: NextMatch) => [number, number]][] = [
      ['missed', () => [0, 1]],
      ['semifinalist', (n) => (n.kind === 'league' ? [2, 0] : [0, 1])],
      ['finalist', (n) => (n.kind === 'final' ? [0, 1] : [2, 0])],
    ];
    for (const [stage, policy] of policies) {
      const save = freshSave();
      save.career = newSeason(2, 1, 77);
      playSeason(save, policy);
      expect(save.career.result!.stage).toBe(stage);
      expect(save.career.result!.promoted).toBe(false);
      expect(save.trophies).toEqual([]);
      expect(startNextSeason(save)).toBe(true);
      expect(save.career).toMatchObject({ division: 2, seasonNo: 2, phase: 'regular' });
    }
  });

  it('the first-title bonus is paid once per division: defending the title pays the smaller repeat bonus', () => {
    const save = freshSave();
    save.career = newSeason(LAST_DIVISION, 1, 9);
    const first = playSeason(save, () => [2, 0]).pop()!;
    expect(save.career.result).toMatchObject({ stage: 'champion', promoted: false });
    expect(first.rewards.some((l) => l.credits === REWARDS.divisionTitle.credits)).toBe(true);
    expect(startNextSeason(save)).toBe(true);
    expect(save.career).toMatchObject({ division: LAST_DIVISION, seasonNo: 2 });

    const second = playSeason(save, () => [2, 0]).pop()!;
    expect(save.trophies).toEqual([
      { division: LAST_DIVISION, seasonNo: 1 },
      { division: LAST_DIVISION, seasonNo: 2 },
    ]);
    expect(save.seasons).toHaveLength(2);
    expect(second.rewards.some((l) => l.credits === REWARDS.divisionTitle.credits && l.xp === REWARDS.divisionTitle.xp)).toBe(false);
    expect(second.rewards.filter((l) => l.credits === REWARDS.repeatTitle.credits && l.xp === REWARDS.repeatTitle.xp)).toHaveLength(1);
    expect(sum(second.rewards).credits).toBeLessThan(sum(first.rewards).credits);
  });

  it('a full climb: five titles in a row reach the top division with one trophy per division', () => {
    const save = freshSave();
    for (let d = 0; d < DIVISIONS.length; d++) {
      expect(save.career.division).toBe(d);
      playSeason(save, () => [1, 0]);
      expect(save.career.result!.stage).toBe('champion');
      expect(startNextSeason(save)).toBe(true);
    }
    expect(save.career.division).toBe(LAST_DIVISION);
    expect(save.career.seasonNo).toBe(DIVISIONS.length + 1);
    expect(save.trophies.map((t) => t.division)).toEqual(DIVISIONS.map((_d, i) => i));
    expect(save.seasons).toHaveLength(DIVISIONS.length);
    expect(save.records.matches).toBe(12 * DIVISIONS.length);
    expect(save.records.wins).toBe(12 * DIVISIONS.length);
    expect(save.records.bestStreak).toBe(12 * DIVISIONS.length);
    // Each claimed level exactly once.
    expect(new Set(save.claimedLevels).size).toBe(save.claimedLevels.length);
    expect(save.claimedLevels).toEqual(Array.from({ length: levelFor(save.xp) }, (_v, i) => i + 1));
    expect(unlockedArenas(save)).toEqual(['harbor_park', 'foundry_court', 'skyline_stadium', 'championship_dome']);
  });
});

describe('shop', () => {
  const PAID = COSMETICS.filter((c) => c.credits > 0);

  it('insufficient funds leaves the save unchanged', () => {
    const save = freshSave();
    save.credits = PAID[0].credits - 1;
    const before = clone(save);
    expect(purchase(save, PAID[0].id)).toBe('insufficient');
    expect(purchase(save, 'chassis:scout')).toBe('insufficient');
    expect(save).toEqual(before);
  });

  it('a successful purchase deducts once; a second click reports owned with no charge', () => {
    for (const id of [PAID[0].id, 'chassis:bulwark']) {
      const save = freshSave();
      const price = itemPrice(id);
      expect(price).toBeGreaterThan(0);
      save.credits = price * 3;
      expect(purchase(save, id)).toBe('ok');
      expect(save.credits).toBe(price * 2);
      expect(save.owned.filter((o) => o === id)).toHaveLength(1);
      for (let i = 0; i < 3; i++) expect(purchase(save, id)).toBe('owned');
      expect(save.credits).toBe(price * 2);
      expect(save.owned.filter((o) => o === id)).toHaveLength(1);
    }
  });

  it('exact funds are enough and leave a zero balance, never a negative one', () => {
    const save = freshSave();
    save.credits = PAID[1].credits;
    expect(purchase(save, PAID[1].id)).toBe('ok');
    expect(save.credits).toBe(0);
    expect(purchase(save, PAID[2].id)).toBe('insufficient');
    expect(save.credits).toBe(0);
  });

  it('unknown ids and opponent-only items are rejected', () => {
    const save = freshSave();
    save.credits = 99999;
    save.picks = 3;
    const before = clone(save);
    for (const id of ['', 'nope', 'face_', 'chassis:', 'chassis:tank', 'chassis:face_star', 'badge_gear', 'badge_flame', 'FACE_STAR']) {
      expect(purchase(save, id), id).toBe('unknown');
      expect(usePick(save, id), id).toBe('unknown');
    }
    // Object.prototype keys are not shop items either.
    for (const id of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) expect(purchase(save, id), id).toBe('unknown');
    expect(save).toEqual(before);
  });

  // KNOWN DEFECT (src/progression/progression.ts, usePick): the catalogue lookup `COSMETIC_BY_ID[id]` is a plain
  // object index, so inherited keys such as "constructor" resolve to a truthy non-item whose `credits` is
  // undefined; `def.credits < 0` is then false and the pick is spent on a bogus owned id. Not reachable from the
  // current UI (it only passes catalogue ids). Remove `.fails` once the lookup is own-property safe.
  it('usePick rejects ids that only exist on Object.prototype', () => {
    for (const id of ['constructor', 'toString', '__proto__']) {
      const save = freshSave();
      save.picks = 1;
      expect(usePick(save, id), id).toBe('unknown');
      expect(save.picks).toBe(1);
      expect(save.owned).not.toContain(id);
    }
  });

  it('starter items are already owned and cost nothing', () => {
    const save = freshSave();
    for (const id of [...STARTER_COSMETICS, 'chassis:all_rounder']) {
      expect(save.owned).toContain(id);
      expect(purchase(save, id)).toBe('owned');
    }
    expect(save.credits).toBe(0);
  });

  it('usePick consumes exactly one pick, refuses chassis, owned items and an empty pick balance', () => {
    const save = freshSave();
    expect(usePick(save, PAID[0].id)).toBe('no_pick');
    expect(save.owned).not.toContain(PAID[0].id);

    save.picks = 2;
    expect(usePick(save, 'chassis:scout')).toBe('unknown');
    expect(save.picks).toBe(2);
    expect(save.owned).not.toContain('chassis:scout');

    expect(usePick(save, PAID[0].id)).toBe('ok');
    expect(save.picks).toBe(1);
    expect(save.credits).toBe(0);
    expect(save.owned.filter((o) => o === PAID[0].id)).toHaveLength(1);
    expect(usePick(save, PAID[0].id)).toBe('owned');
    expect(save.picks).toBe(1);

    expect(usePick(save, PAID[1].id)).toBe('ok');
    expect(save.picks).toBe(0);
    expect(usePick(save, PAID[2].id)).toBe('no_pick');
    expect(save.picks).toBe(0);
    expect(save.owned).not.toContain(PAID[2].id);
  });
});

describe('commitTrial', () => {
  const timeId = TRIAL_ORDER.find((id) => TRIALS[id].unit === 'time')!;
  const countId = TRIAL_ORDER.find((id) => TRIALS[id].unit === 'count')!;
  const T = TRIALS[timeId];
  const C = TRIALS[countId];
  const tier = (n: 1 | 2 | 3) => REWARDS.trialMedal[n];

  it('time trials: lower is better, the best only improves and each medal pays once', () => {
    const save = freshSave();
    const bronze = commitTrial(save, timeId, T.bronze - 0.5);
    expect(bronze).toMatchObject({ medal: 1, previousBest: null, newBest: true, credits: tier(1).credits, xp: tier(1).xp, paidMedals: ['Bronze'] });
    expect(save.trials[timeId]).toMatchObject({ best: T.bronze - 0.5, medal: 1, rewarded: 1, attempts: 1 });

    // Slower run: nothing changes except the attempt count.
    const worse = commitTrial(save, timeId, T.bronze + 5);
    expect(worse).toMatchObject({ medal: 0, newBest: false, credits: 0, xp: 0, paidMedals: [], previousBest: T.bronze - 0.5 });
    expect(save.trials[timeId]).toMatchObject({ best: T.bronze - 0.5, medal: 1, rewarded: 1, attempts: 2 });

    // Faster, silver: pays silver only.
    const silver = commitTrial(save, timeId, T.silver - 0.5);
    expect(silver).toMatchObject({ medal: 2, newBest: true, credits: tier(2).credits, xp: tier(2).xp, paidMedals: ['Silver'] });
    // A bronze-level run after silver does not downgrade the medal or the best.
    commitTrial(save, timeId, T.bronze - 0.1);
    expect(save.trials[timeId]).toMatchObject({ best: T.silver - 0.5, medal: 2, rewarded: 2, attempts: 4 });
    expect(save.credits).toBe(tier(1).credits + tier(2).credits);
  });

  it('count trials: higher is better and the best only improves', () => {
    const save = freshSave();
    expect(commitTrial(save, countId, C.silver)).toMatchObject({ medal: 2, newBest: true });
    expect(commitTrial(save, countId, C.bronze)).toMatchObject({ medal: 1, newBest: false, credits: 0, previousBest: C.silver });
    expect(save.trials[countId]).toMatchObject({ best: C.silver, medal: 2, rewarded: 2 });
    expect(commitTrial(save, countId, C.silver)).toMatchObject({ newBest: false, credits: 0 }); // equal is not better
    expect(commitTrial(save, countId, C.silver + 1).newBest).toBe(true);
    expect(save.trials[countId]!.best).toBe(C.silver + 1);
  });

  it('going straight to gold pays bronze + silver + gold once; repeating gold pays nothing', () => {
    for (const [id, gold] of [[timeId, T.gold], [countId, C.gold]] as const) {
      const save = freshSave();
      const first = commitTrial(save, id, gold);
      expect(first.medal).toBe(3);
      expect(first.paidMedals).toEqual(['Bronze', 'Silver', 'Gold']);
      expect(first.credits).toBe(tier(1).credits + tier(2).credits + tier(3).credits);
      expect(first.xp).toBe(tier(1).xp + tier(2).xp + tier(3).xp);
      expect(save.credits - first.credits).toBeGreaterThanOrEqual(0); // level grants may add credits on top
      const xp = save.xp;
      const credits = save.credits;
      for (let i = 0; i < 3; i++) {
        const again = commitTrial(save, id, gold);
        expect(again).toMatchObject({ medal: 3, credits: 0, xp: 0, paidMedals: [], newBest: false, grants: [] });
      }
      expect(save.xp).toBe(xp);
      expect(save.credits).toBe(credits);
      expect(save.trials[id]).toMatchObject({ medal: 3, rewarded: 3, attempts: 4, best: gold });
    }
  });

  it('a failed attempt (null or non-finite score) counts an attempt but earns no medal and no best', () => {
    const save = freshSave();
    for (const bad of [null, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(commitTrial(save, timeId, bad)).toMatchObject({ medal: 0, previousBest: null, newBest: false, credits: 0, xp: 0, paidMedals: [] });
    }
    expect(save.trials[timeId]).toMatchObject({ best: null, medal: 0, rewarded: 0, attempts: 3 });
    expect(save.credits).toBe(0);
    expect(save.xp).toBe(0);
    // A failure after a medal does not erase it.
    commitTrial(save, timeId, T.gold);
    commitTrial(save, timeId, null);
    expect(save.trials[timeId]).toMatchObject({ best: T.gold, medal: 3, rewarded: 3, attempts: 5 });
  });

  it('medal thresholds are inclusive and ordered for every trial', () => {
    for (const id of TRIAL_ORDER) {
      const def = TRIALS[id];
      const eps = def.unit === 'time' ? 0.01 : 1;
      const worse = (v: number) => (def.unit === 'time' ? v + eps : v - eps);
      const expectMedal = (score: number, medal: number) => {
        const save = freshSave();
        expect(commitTrial(save, id, score).medal, `${id} @ ${score}`).toBe(medal);
      };
      expectMedal(def.gold, 3);
      expectMedal(worse(def.gold), 2);
      expectMedal(def.silver, 2);
      expectMedal(worse(def.silver), 1);
      expectMedal(def.bronze, 1);
      expectMedal(worse(def.bronze), 0);
    }
  });

  it('a record from an older rules version is reset but its paid tiers are not paid again', () => {
    const save = freshSave();
    save.trials[timeId] = { best: 1, medal: 3, rewarded: 2, attempts: 9, rulesVersion: T.rulesVersion - 1 };
    const silver = commitTrial(save, timeId, T.silver);
    expect(silver).toMatchObject({ medal: 2, previousBest: null, newBest: true, credits: 0, xp: 0, paidMedals: [] });
    expect(save.trials[timeId]).toMatchObject({ best: T.silver, medal: 2, rewarded: 2, attempts: 1, rulesVersion: T.rulesVersion });
    const gold = commitTrial(save, timeId, T.gold);
    expect(gold.paidMedals).toEqual(['Gold']);
    expect(gold.credits).toBe(tier(3).credits);
  });
});
