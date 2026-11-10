import { describe, expect, it } from 'vitest';
import { nextPlayerMatch, type NextMatch } from '../src/career/career';
import { CHASSIS_ORDER } from '../src/content/chassis';
import { COSMETICS, COSMETIC_BY_ID, STARTER_COSMETICS, cosmeticsOfKind } from '../src/content/cosmetics';
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_BY_ID,
  MASTERY_MAX,
  OBJECTIVES,
  OBJECTIVE_BY_ID,
  OBJECTIVE_REWARD,
  OBJECTIVE_SLOTS,
  ROAD_LENGTH,
  roadReward,
  seasonPrize,
} from '../src/content/progression';
import { TRIALS } from '../src/content/trials';
import type { MatchResult } from '../src/game/modes/matchMode';
import type { GoalRecord, RobotStats } from '../src/game/sim/match';
import { playerLooks } from '../src/game/setup';
import { achievementValue, settleAchievements } from '../src/progression/achievements';
import { addMastery, masteryLevel, masteryThreshold } from '../src/progression/mastery';
import { drawObjective, matchFacts } from '../src/progression/objectives';
import { REWARDS, claimLevels, commitMatch, commitTrial, itemPrice, levelFor, levelThreshold, purchase, rerollObjective, usePick } from '../src/progression/progression';
import { SAVE_VERSION, defaultClub, exportSave, importSave, newSave, validateSave, type SaveGame } from '../src/storage/save';
import { defaultSettings } from '../src/storage/settings';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const fresh = (seed = 99): SaveGame => newSave(defaultClub(), defaultSettings(), seed);
const stats = (p: Partial<RobotStats> = {}): RobotStats => ({ goals: 0, assists: 0, saves: 0, shots: 0, passes: 0, interceptions: 0, kicks: 0, swingKicks: 0, swings: 0, ownGoals: 0, longBalls: 0, giveAndGos: 0, wallPasses: 0, oneTouchGoals: 0, ...p });
const goal = (team: 0 | 1, scorer: number, p: Partial<GoalRecord> = {}): GoalRecord => ({ time: 10, team, scorer, assist: -1, ownGoalBy: -1, overtime: false, swing: false, ...p });
function result(p: Partial<MatchResult> = {}): MatchResult {
  const score = p.score ?? [1, 0];
  return { matchId: 'q-1', kind: 'quick', arena: 'harbor_park', opponent: 'Ember Works', score, won: score[0] > score[1], overtime: false, duration: 180, player: stats(), mate: stats(), goals: [], ...p };
}
const CTX = { label: 'Test', opponentId: 'ember_works' };
const careerResult = (next: NextMatch, pg: number, og: number, p: Partial<MatchResult> = {}) =>
  result({ matchId: `c-${next.id}`, kind: next.kind === 'league' ? 'career' : 'playoff', fixtureId: next.id, score: [pg, og], ...p });
/** Puts a specific objective in its tier's slot. */
function setObjective(save: SaveGame, id: string, progress = 0): number {
  const def = OBJECTIVE_BY_ID[id];
  const slot = OBJECTIVE_SLOTS.indexOf(def.tier);
  save.progress.objectives[slot] = { uid: 999, id, progress };
  return slot;
}

describe('content integrity', () => {
  it('every reward, achievement and mastery item exists and earned-only items have exactly one source', () => {
    const sources: Record<string, string[]> = {};
    const add = (id: string, where: string) => (sources[id] ??= []).push(where);
    for (let l = 1; l <= ROAD_LENGTH; l++) {
      const r = roadReward(l);
      if (r.kind === 'item') add(r.id, `road ${l}`);
    }
    for (const a of ACHIEVEMENTS) for (const id of Object.values(a.items ?? {})) add(id!, a.id);
    for (const id of Object.keys(sources)) expect(COSMETIC_BY_ID[id], id).toBeDefined();
    for (const c of COSMETICS.filter((x) => x.unlock === 'level' || x.unlock === 'achievement')) expect(sources[c.id] ?? [], c.id).toHaveLength(1);
    expect(COSMETICS.filter((c) => c.kind === 'topper').map((c) => c.id).sort()).toEqual(['topper_antenna', 'topper_crown', 'topper_ears', 'topper_fin', 'topper_halo', 'topper_headset', 'topper_horns', 'topper_mohawk', 'topper_none', 'topper_propeller', 'topper_radar', 'topper_tophat']);
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(30);
    expect(OBJECTIVES.length).toBeGreaterThanOrEqual(25);
    for (const tier of OBJECTIVE_SLOTS) expect(OBJECTIVES.filter((o) => o.tier === tier && !o.arena).length).toBeGreaterThanOrEqual(5);
  });

  it('the Club Road has a concrete reward for every level, chassis at 4 / 6 / 8, the crown at 40 and credits after', () => {
    expect(roadReward(4)).toMatchObject({ kind: 'chassis', id: 'scout' });
    expect(roadReward(6)).toMatchObject({ kind: 'chassis', id: 'bulwark' });
    expect(roadReward(8)).toMatchObject({ kind: 'chassis', id: 'glider' });
    expect(roadReward(40)).toEqual({ kind: 'item', id: 'topper_crown', fallback: 0 });
    for (const l of [41, 50, 99]) expect(roadReward(l)).toMatchObject({ kind: 'credits' });
    // Early levels come quickly, later ones need more XP, and the step never shrinks.
    let prev = 0;
    for (let l = 1; l <= 60; l++) {
      const step = levelThreshold(l) - levelThreshold(l - 1);
      expect(step).toBeGreaterThanOrEqual(prev);
      prev = step;
    }
    expect(levelThreshold(1)).toBeLessThan(REWARDS.matchComplete.xp + REWARDS.winBonus.xp + 100);
  });
});

describe('Club Road rewards', () => {
  it('every level up to 45 is granted exactly once, even when claimed in pieces', () => {
    const a = fresh();
    a.xp = levelThreshold(45);
    claimLevels(a);
    const b = fresh();
    for (let l = 1; l <= 45; l += 7) {
      b.xp = levelThreshold(l);
      claimLevels(b);
    }
    b.xp = levelThreshold(45);
    claimLevels(b);
    for (const s of [a, b]) {
      expect(s.claimedLevels.slice().sort((x, y) => x - y)).toEqual(Array.from({ length: 45 }, (_v, i) => i + 1));
      expect(new Set(s.owned).size).toBe(s.owned.length);
      expect(s.owned).toContain('topper_crown');
      expect(s.owned).toContain('chassis:glider');
      expect(s.owned).toContain('color_gold');
    }
    expect(b.credits).toBe(a.credits);
    expect(b.picks).toBe(a.picks);
    const snap = clone(a);
    expect(claimLevels(a)).toEqual([]);
    expect(a).toEqual(snap);
  });

  it('a track item already bought pays its fallback credits instead', () => {
    const s = fresh();
    s.credits = itemPrice('topper_fin');
    expect(purchase(s, 'topper_fin')).toBe('ok');
    s.xp = levelThreshold(5);
    s.claimedLevels = [1, 2, 3, 4];
    const g = claimLevels(s);
    expect(g).toHaveLength(1);
    expect(g[0].kind).toBe('credits');
    const r = roadReward(5);
    expect(s.credits).toBe(r.kind === 'item' ? r.fallback : -1);
    expect(s.owned.filter((o) => o === 'topper_fin')).toHaveLength(1);
  });
});

describe('objectives', () => {
  it('a new save always has three objectives, one per tier, and the draw is deterministic per seed', () => {
    const a = fresh(5);
    const b = fresh(5);
    expect(a.progress.objectives.map((o) => OBJECTIVE_BY_ID[o.id].tier)).toEqual(OBJECTIVE_SLOTS);
    expect(a.progress.objectives).toEqual(b.progress.objectives);
    const seen = new Set<string>();
    for (let seed = 0; seed < 40; seed++) for (const o of fresh(seed).progress.objectives) seen.add(o.id);
    expect(seen.size).toBeGreaterThan(10);
    // Arena objectives are only offered once that arena is unlocked.
    for (let i = 0; i < 200; i++) expect(OBJECTIVE_BY_ID[drawObjective(a, 'hard', []).id].arena).toBeUndefined();
  });

  it('completing an objective pays once, replaces it deterministically and recommitting changes nothing', () => {
    const run = () => {
      const s = fresh(11);
      const slot = setObjective(s, 'e_goals2', 1);
      const rec = commitMatch(s, result({ matchId: 'q-obj', kind: 'career', player: stats({ goals: 1 }) }), CTX);
      return { s, slot, rec };
    };
    const { s, slot, rec } = run();
    const step = rec.progress.objectives.find((o) => o.id === 'e_goals2')!;
    expect(step).toMatchObject({ before: 1, after: 2, target: 2, done: true });
    const line = rec.rewards.find((l) => l.source === 'objective' && l.label.includes('Score 2 goals'))!;
    expect(line).toMatchObject({ credits: OBJECTIVE_REWARD.easy.credits, xp: OBJECTIVE_REWARD.easy.xp });
    expect(s.progress.objectives[slot].id).not.toBe('e_goals2');
    expect(OBJECTIVE_BY_ID[s.progress.objectives[slot].id].tier).toBe('easy');
    expect(s.progress.objectivesDone).toBe(1);
    // Same state, same replacement.
    expect(run().s.progress.objectives).toEqual(s.progress.objectives);
    const snap = clone(s);
    for (let i = 0; i < 3; i++) expect(commitMatch(s, result({ matchId: 'q-obj', kind: 'career', player: stats({ goals: 1 }) }), CTX)).toBe(rec);
    expect(s).toEqual(snap);
  });

  it('"in one match" objectives need the target inside a single match; totals add up', () => {
    const s = fresh();
    setObjective(s, 'm_passes6');
    setObjective(s, 'e_passes5');
    commitMatch(s, result({ matchId: 'a', player: stats({ passes: 4 }) }), CTX);
    commitMatch(s, result({ matchId: 'b', player: stats({ passes: 3 }) }), CTX);
    expect(s.progress.objectives[1]).toMatchObject({ id: 'm_passes6', progress: 4 });
    expect(s.progress.objectives[0].id).not.toBe('e_passes5'); // 4 + 3 >= 5: done and replaced
    const rec = commitMatch(s, result({ matchId: 'c', player: stats({ passes: 7 }) }), CTX);
    expect(rec.progress.objectives.find((o) => o.id === 'm_passes6')).toMatchObject({ done: true });
  });

  it('quick matches progress objectives at the reduced reward factor; abandoned matches never reach commit', () => {
    const s = fresh();
    setObjective(s, 'e_win1');
    const rec = commitMatch(s, result({ matchId: 'q-9', kind: 'quick' }), CTX);
    const line = rec.rewards.find((l) => l.source === 'objective')!;
    expect(line.xp).toBe(Math.round(OBJECTIVE_REWARD.easy.xp * REWARDS.quickFactor));
    expect(line.credits).toBe(Math.round(OBJECTIVE_REWARD.easy.credits * REWARDS.quickFactor));
  });

  it('match facts: clean sheets, comebacks, opening goals and swing goals come from the goal log', () => {
    const f = matchFacts(result({ score: [2, 1], goals: [goal(1, 2), goal(0, 0, { swing: true }), goal(0, 1)] }));
    expect(f).toMatchObject({ comebackWins: 1, cleanSheets: 0, firstGoal: 0, swingGoals: 1, wins: 1, winBy2: 0 });
    const g = matchFacts(result({ score: [3, 0], goals: [goal(0, 0), goal(0, 1), goal(0, 0)], player: stats({ goals: 3, saves: 1 }) }));
    expect(g).toMatchObject({ comebackWins: 0, cleanSheets: 1, firstGoal: 1, winBy3: 1, hatTrick: 1, goalAndSave: 1 });
  });

  it('trial objectives move with a trial attempt medal', () => {
    const s = fresh();
    setObjective(s, 'm_trial_silver');
    const t = TRIALS.pass_window;
    setObjective(s, 'e_goals2');
    expect(commitTrial(s, 'pass_window', t.bronze).progress.objectives).toEqual([]);
    const o = commitTrial(s, 'pass_window', t.silver);
    expect(o.progress.objectives).toEqual([expect.objectContaining({ id: 'm_trial_silver', done: true })]);
    expect(o.bonus.some((l) => l.source === 'objective')).toBe(true);
  });

  it('a free reroll is available once after each completed match and swaps for the same tier', () => {
    const s = fresh();
    expect(rerollObjective(s, 2)).toBe(false);
    commitMatch(s, result({ matchId: 'r1', score: [0, 1] }), CTX);
    const before = s.progress.objectives[2].id;
    expect(rerollObjective(s, 2)).toBe(true);
    expect(s.progress.objectives[2].id).not.toBe(before);
    expect(OBJECTIVE_BY_ID[s.progress.objectives[2].id].tier).toBe('hard');
    expect(rerollObjective(s, 0)).toBe(false);
    commitMatch(s, result({ matchId: 'r2', score: [0, 1] }), CTX);
    commitMatch(s, result({ matchId: 'r3', score: [0, 1] }), CTX);
    expect(s.progress.rerolls).toBe(1); // does not stack
    expect(rerollObjective(s, 5)).toBe(false);
  });
});

describe('achievements', () => {
  it('each tier pays once, a big jump pays every tier it crosses, and recommitting pays nothing', () => {
    const s = fresh();
    s.records.goals = ACHIEVEMENT_BY_ID.goal_getter.tiers[1] - 1;
    const rec = commitMatch(s, result({ matchId: 'g', player: stats({ goals: 1 }) }), CTX);
    const tiers = rec.progress.achievements.filter((a) => a.id === 'goal_getter').map((a) => a.tier);
    expect(tiers).toEqual([1, 2]);
    expect(rec.rewards.filter((l) => l.source === 'achievement' && l.label.startsWith('Goal Getter'))).toHaveLength(2);
    expect(s.progress.achievements.goal_getter).toBe(2);
    const credits = s.credits;
    expect(settleAchievements(s).steps).toEqual([]);
    expect(s.credits).toBe(credits);
    commitMatch(s, result({ matchId: 'g', player: stats({ goals: 1 }) }), CTX);
    expect(s.credits).toBe(credits);
  });

  it('item rewards are granted with their tier', () => {
    const s = fresh();
    s.records.saves = ACHIEVEMENT_BY_ID.safe_hands.tiers[2];
    const r = settleAchievements(s);
    expect(r.steps.filter((x) => x.id === 'safe_hands')).toHaveLength(3);
    expect(s.owned).toContain('badge_glove');
    expect(r.grants.some((g) => g.item === 'badge_glove')).toBe(true);
  });

  it('only recorded data feeds achievements, and new lifetime counters come from the commit path', () => {
    const s = fresh();
    commitMatch(s, result({ matchId: 'ot', score: [2, 1], overtime: true, goals: [goal(1, 2), goal(0, 1), goal(0, 0, { overtime: true })], player: stats({ goals: 1, shots: 4 }) }), CTX);
    expect(s.records).toMatchObject({ overtimeWins: 1, comebackWins: 1, cleanSheets: 0, shots: 4, careerWins: 0 });
    commitMatch(s, result({ matchId: 'cs', kind: 'career', score: [3, 0], player: stats({ goals: 3 }) }), CTX);
    expect(s.records).toMatchObject({ cleanSheets: 1, hatTricks: 1, careerWins: 1 });
    for (const a of ACHIEVEMENTS) expect(Number.isFinite(achievementValue(s, a.stat)), a.id).toBe(true);
  });
});

describe('chassis mastery', () => {
  it('levels 1..10 pay once each, cap at 10, and only the chassis used earns', () => {
    const s = fresh();
    const r = addMastery(s, 'scout', masteryThreshold(3));
    expect(r.step).toMatchObject({ chassis: 'scout', levelBefore: 0, levelAfter: 3 });
    expect(s.owned).toContain('badge_wing');
    expect(r.lines.map((l) => l.label)).toEqual(['Scout mastery 1', 'Scout mastery 3']);
    expect(addMastery(s, 'scout', 0).lines).toEqual([]);
    addMastery(s, 'scout', 999999);
    expect(masteryLevel(s.progress.mastery.scout)).toBe(MASTERY_MAX);
    expect(s.progress.masteryClaimed.scout).toBe(MASTERY_MAX);
    expect(s.owned).toContain('title_scout_master');
    expect(s.progress.mastery.glider).toBe(0);
  });

  it('a committed match credits the chassis named in the context with the match XP', () => {
    const s = fresh();
    const rec = commitMatch(s, result({ matchId: 'm', kind: 'career' }), { ...CTX, chassis: 'bulwark' });
    const matchXp = rec.rewards.filter((l) => l.source === 'match').reduce((a, l) => a + l.xp, 0);
    expect(rec.progress.mastery).toMatchObject({ chassis: 'bulwark', gained: matchXp });
    expect(s.progress.mastery.bulwark).toBe(matchXp);
    expect(s.progress.mastery.all_rounder).toBe(0);
  });
});

describe('season prize money', () => {
  it('pays by league position and playoff stage, scaled by division, once per season', () => {
    expect(seasonPrize(0, 1, 'champion')).toBeGreaterThan(seasonPrize(0, 1, 'finalist'));
    expect(seasonPrize(0, 2, 'missed')).toBeGreaterThan(seasonPrize(0, 5, 'missed'));
    expect(seasonPrize(4, 3, 'semifinalist')).toBeGreaterThan(seasonPrize(0, 3, 'semifinalist'));
    const s = fresh();
    const recs = [];
    for (let i = 0; i < 20; i++) {
      const next = nextPlayerMatch(s.career);
      if (!next) break;
      recs.push(commitMatch(s, careerResult(next, 2, 0), CTX));
    }
    const prizes = recs.flatMap((r) => r.rewards.filter((l) => l.label.startsWith('Season prize')));
    expect(prizes).toHaveLength(1);
    const res = s.career.result!;
    expect(prizes[0].credits).toBe(seasonPrize(res.division, res.rank, res.stage));
    expect(recs[recs.length - 1].rewards.some((l) => l.label.startsWith('Season prize'))).toBe(true);
  });
});

describe('shop rules for earned-only items', () => {
  it('earned-only items cannot be bought or picked; opponent-only items stay unknown', () => {
    const s = fresh();
    s.credits = 99999;
    s.picks = 5;
    for (const c of COSMETICS.filter((x) => x.unlock === 'level' || x.unlock === 'achievement' || x.unlock === 'mastery')) {
      expect(itemPrice(c.id), c.id).toBe(-1);
      expect(purchase(s, c.id), c.id).toBe('earned');
      expect(usePick(s, c.id), c.id).toBe('earned');
    }
    expect(s.credits).toBe(99999);
    expect(s.picks).toBe(5);
    expect(purchase(s, 'badge_gear')).toBe('unknown');
    s.owned.push('topper_crown');
    expect(purchase(s, 'topper_crown')).toBe('owned');
    // Setup only offers starter badges; the shop lists starter + shop items only.
    for (const k of ['badge', 'topper', 'title'] as const) for (const c of cosmeticsOfKind(k)) expect(['starter', 'shop']).toContain(c.unlock);
    expect(usePick(s, 'topper_halo')).toBe('ok');
  });
});

describe('save v2', () => {
  /** A save as version 1 wrote it, after about a dozen matches. */
  function v1Save(): Record<string, unknown> {
    const base = clone(fresh(31337)) as any;
    const career = base.career;
    return {
      version: 1,
      createdAt: 1762000000000,
      updatedAt: 1762100000000,
      club: { name: 'Rope Rockets', badge: 'badge_anchor', primary: 'red', secondary: 'navy', numbers: [9, 23], chassis: 'scout', mateChassis: 'all_rounder', face: 'face_star', pattern: 'pattern_plain', trail: 'trail_standard', celebration: 'celebration_wave' },
      settings: base.settings,
      credits: 640,
      xp: 2620,
      owned: [...STARTER_COSMETICS.filter((c) => !c.startsWith('topper') && !c.startsWith('title')), 'chassis:all_rounder', 'chassis:scout', 'face_star', 'badge_anchor', 'topper_fin'],
      picks: 1,
      claimedLevels: [1, 2, 3, 4, 5],
      career,
      seasons: [{ division: 0, seasonNo: 1, rank: 2, wins: 7, losses: 3, gf: 30, ga: 20, stage: 'finalist', champion: 'ember_works', promoted: false }],
      trophies: [],
      records: { matches: 14, wins: 9, goals: 16, assists: 3, saves: 12, passes: 40, interceptions: 30, swingGoals: 4, bestGoals: 3, bestSaves: 3, bestMargin: 4, streak: 2, bestStreak: 5 },
      trials: { pass_window: { best: 10, medal: 2, rewarded: 2, attempts: 3, rulesVersion: TRIALS.pass_window.rulesVersion } },
      lessons: ['move', 'tether'],
      flags: { onboarded: true, playedMatch: true },
      committed: ['c-old-1', 'q-old-2'],
      results: [{ matchId: 'q-old-2', kind: 'quick', label: 'Quick', arena: 'harbor_park', opponentId: 'ember_works', opponent: 'Ember Works', score: [3, 1], won: true, overtime: false, stats: { goals: 2, assists: 0, saves: 1, passes: 3, interceptions: 2, shots: 5, swingKicks: 1, ownGoals: 0 }, mateGoals: 1, title: 'Striker', rewards: [{ label: 'Quick match played', credits: 30, xp: 48 }], credits: 30, xp: 48, xpBefore: 2572, grants: [{ kind: 'pick', label: 'Club level 5', detail: 'x' }], newRecords: [], seasonComplete: false, at: 1762100000000 }],
      prefs: base.prefs,
      matchSeq: 3,
    };
  }

  it('migrates a realistic v1 save: keeps everything, maps claimed levels without re-paying, seeds objectives', () => {
    const raw = v1Save();
    const snapshot = clone(raw);
    const s = validateSave(raw);
    expect(raw).toEqual(snapshot); // input untouched
    expect(s.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBe(3);
    expect(s.club.ball).toBe('ball_classic');
    expect(s.records.giveAndGos).toBe(0);
    expect(s.xp).toBe(2620);
    expect(s.club).toMatchObject({ name: 'Rope Rockets', chassis: 'scout', face: 'face_star', badge: 'badge_anchor', topper: 'topper_antenna', title: 'title_newcomers' });
    for (const id of ['face_star', 'badge_anchor', 'topper_fin', 'chassis:scout']) expect(s.owned).toContain(id);
    // Old levels 1..5 reached 2500 XP; every new level at or below 2500 XP counts as claimed.
    const covered = Array.from({ length: 20 }, (_v, i) => i + 1).filter((l) => levelThreshold(l) <= 2500);
    expect(s.claimedLevels).toEqual(covered);
    expect(s.claimedLevels.length).toBeLessThanOrEqual(levelFor(s.xp));
    // Credits only go up, by at most the new track's credit value for those levels.
    expect(s.credits).toBeGreaterThanOrEqual(640);
    expect(s.picks).toBeGreaterThanOrEqual(1);
    // Track items and chassis for the covered levels are owned now.
    for (const l of covered) {
      const r = roadReward(l);
      if (r.kind === 'chassis') expect(s.owned).toContain(`chassis:${r.id}`);
      if (r.kind === 'item') expect(s.owned).toContain(r.id);
    }
    // Achievements already met are marked, without credits or XP.
    expect(s.progress.achievements.goal_getter).toBe(1);
    expect(s.progress.achievements.on_a_roll).toBe(1);
    expect(s.records).toMatchObject({ matches: 14, cleanSheets: 0, overtimeWins: 0, shots: 0 });
    expect(s.progress.objectives.map((o) => OBJECTIVE_BY_ID[o.id].tier)).toEqual(OBJECTIVE_SLOTS);
    expect(s.progress.mastery).toEqual({ all_rounder: 0, scout: 0, bulwark: 0, glider: 0 });
    // Old records still load and display.
    expect(s.results[0]).toMatchObject({ matchId: 'q-old-2', progress: { objectives: [], achievements: [], mastery: null } });
    expect(s.results[0].rewards[0].source).toBe('match');
    // Deterministic, idempotent and the ledger still guards old matches.
    expect(validateSave(clone(raw))).toEqual(s);
    expect(validateSave(clone(s))).toEqual(s);
    const credits = s.credits;
    commitMatch(s, result({ matchId: 'q-old-2' }), CTX);
    expect(s.credits).toBe(credits);
    // The next commit grants the remaining new levels once.
    const rec = commitMatch(s, result({ matchId: 'q-new' }), CTX);
    expect(new Set(s.claimedLevels).size).toBe(s.claimedLevels.length);
    expect(s.claimedLevels.slice().sort((a, b) => a - b)).toEqual(Array.from({ length: levelFor(s.xp) }, (_v, i) => i + 1));
    expect(rec.grants.filter((g) => g.label === 'Club level 1')).toEqual([]);
  });

  it('a v1 save with no claimed levels pays nothing at migration', () => {
    const raw = v1Save();
    raw.claimedLevels = [];
    raw.xp = 120;
    const s = validateSave(raw);
    expect(s.credits).toBe(640);
    expect(s.picks).toBe(1);
    expect(s.claimedLevels).toEqual([]);
  });

  it('validates the new fields and round-trips through export / import', () => {
    const s = fresh();
    commitMatch(s, result({ matchId: 'x1', kind: 'career', score: [3, 0], player: stats({ goals: 2, saves: 2 }) }), { ...CTX, chassis: 'all_rounder' });
    expect(importSave(exportSave(s))).toEqual(s);
    const raw: any = clone(s);
    raw.club.topper = 'topper_crown'; // not owned
    raw.club.title = 'badge_star'; // wrong kind
    raw.club.primary = 'gold'; // earned colour not owned
    raw.progress.objectives = [{ id: 'nope', progress: 5 }, { id: 'e_goals2', progress: 99 }, 'x'];
    raw.progress.achievements = { goal_getter: 9, fake: 2 };
    raw.progress.mastery = { scout: -5, glider: 1e12, tank: 4 };
    raw.progress.rerolls = 7;
    raw.records.cleanSheets = 'many';
    const v = validateSave(raw);
    expect(v.club).toMatchObject({ topper: 'topper_antenna', title: 'title_newcomers', primary: 'cyan' });
    expect(v.progress.objectives.map((o) => OBJECTIVE_BY_ID[o.id].tier)).toEqual(OBJECTIVE_SLOTS);
    expect(v.progress.objectives[0]).toMatchObject({ id: 'e_goals2', progress: 1 });
    expect(v.progress.achievements).toEqual({ goal_getter: 3 });
    expect(v.progress.mastery).toMatchObject({ scout: 0, glider: 9999999 });
    expect(v.progress.rerolls).toBe(1);
    expect(v.records.cleanSheets).toBe(0);
    raw.owned.push('topper_crown', 'color_gold');
    const w = validateSave(raw);
    expect(w.club).toMatchObject({ topper: 'topper_crown', primary: 'gold' });
  });

  it('playerLooks passes the topper to both robots', () => {
    const s = fresh();
    s.club.topper = 'topper_fin';
    expect(playerLooks(s).map((l) => l.topper)).toEqual(['topper_fin', 'topper_fin']);
    expect(CHASSIS_ORDER.length).toBe(4);
  });
});

describe('save v3', () => {
  it('migrates a v2 save: adds the starter match ball and zeroed play counters, keeps everything else', () => {
    const v2 = JSON.parse(JSON.stringify(fresh())) as Record<string, unknown>;
    v2.version = 2;
    const club = v2.club as Record<string, unknown>;
    delete club.ball;
    const rec = v2.records as Record<string, unknown>;
    for (const k of ['giveAndGos', 'longBalls', 'wallPasses', 'oneTouchGoals']) delete rec[k];
    rec.goals = 41;
    v2.credits = 1234;
    const s = validateSave(v2);
    expect(s.version).toBe(3);
    expect(s.club.ball).toBe('ball_classic');
    expect(s.owned).toContain('ball_classic');
    expect(s.records.goals).toBe(41);
    expect(s.records.longBalls).toBe(0);
    expect(s.credits).toBe(1234);
  });

  it('rejects an unknown or unowned ball and falls back to the starter ball', () => {
    const raw = JSON.parse(JSON.stringify(fresh())) as Record<string, unknown>;
    (raw.club as Record<string, unknown>).ball = 'ball_does_not_exist';
    expect(validateSave(raw).club.ball).toBe('ball_classic');
  });
});

describe('plays progression', () => {
  it('completed plays pay a capped reward line once, count toward records, and advance play objectives', () => {
    const s = fresh();
    const slot = setObjective(s, 'm_longball2');
    const player = stats({ longBalls: 2, giveAndGos: 1, wallPasses: 1, oneTouchGoals: 1, goals: 1 });
    const rec = commitMatch(s, result({ matchId: 'q-plays', kind: 'career', player }), CTX);
    const line = rec.rewards.find((l) => l.label.startsWith('Plays completed'));
    expect(line?.label).toBe('Plays completed × 4'); // 5 plays, capped at 4
    expect(s.records.longBalls).toBe(2);
    expect(s.records.giveAndGos).toBe(1);
    expect(s.records.wallPasses).toBe(1);
    expect(s.records.oneTouchGoals).toBe(1);
    // The long-ball objective completed and was replaced by a fresh one in the same slot.
    expect(s.progress.objectives[slot].id).not.toBe('m_longball2');
    // Idempotent: committing the same match again pays nothing more.
    const credits = s.credits;
    commitMatch(s, result({ matchId: 'q-plays', kind: 'career', player }), CTX);
    expect(s.credits).toBe(credits);
    expect(s.records.longBalls).toBe(2);
  });

  it('a match with no plays has no plays line', () => {
    const s = fresh();
    const rec = commitMatch(s, result({ matchId: 'q-none' }), CTX);
    expect(rec.rewards.some((l) => l.label.startsWith('Plays'))).toBe(false);
  });
});
