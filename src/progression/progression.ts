import { commitPlayerResult, newSeason, type CareerState } from '../career/career';
import { ARENAS } from '../content/arenas';
import { CHASSIS, type ChassisId } from '../content/chassis';
import { DIVISIONS } from '../content/clubs';
import { COSMETIC_BY_ID } from '../content/cosmetics';
import { seasonPrize } from '../content/progression';
import { MEDAL_NAMES, TRIALS, betterScore, medalFor, type TrialId } from '../content/trials';
import type { MatchResult } from '../game/modes/matchMode';
import { emptyReport, type AchievementStep, type CommittedResult, type Grant, type ProgressReport, type RewardLine, type SaveGame } from '../storage/save';
import { settleAchievements } from './achievements';
import { addMastery, signatureBonus } from './mastery';
import { advanceForMatch, advanceForTrial, matchFacts } from './objectives';
import { claimLevels, levelFor, unlockedArenas } from './road';

export { claimLevels, describeLevelReward, describeTrackReward, levelFor, levelProgress, levelReward, levelThreshold, unlockedArenas, type LevelReward } from './road';
export { rerollObjective } from './objectives';

/**
 * Rewards and ownership. Every payout happens inside a commit function that is idempotent by id;
 * screens only display committed records and never pay anything themselves.
 */
export const REWARDS = {
  matchComplete: { credits: 50, xp: 80 },
  winBonus: { credits: 30, xp: 40 },
  /** Contribution tiers by score (see contributionScore). */
  contribution: [
    { min: 9, credits: 20, xp: 30, label: 'Star contribution' },
    { min: 5, credits: 14, xp: 20, label: 'Strong contribution' },
    { min: 2, credits: 8, xp: 10, label: 'Team contribution' },
  ],
  quickFactor: 0.6,
  divisionTitle: { credits: 300, xp: 250 },
  repeatTitle: { credits: 120, xp: 100 },
  seasonComplete: { credits: 60, xp: 60 },
  trialMedal: [
    { credits: 0, xp: 0 },
    { credits: 20, xp: 20 },
    { credits: 30, xp: 30 },
    { credits: 50, xp: 50 },
  ],
  lesson: { credits: 10, xp: 15 },
  /** Per completed play (long ball, give-and-go, wall pass, one-touch goal), up to `max` per match. */
  play: { credits: 8, xp: 12, max: 4 },
} as const;

/** Completed plays in a match: long balls, give-and-goes, wall passes and one-touch goals. */
export function playCount(s: { longBalls?: number; giveAndGos?: number; wallPasses?: number; oneTouchGoals?: number; megs?: number }): number {
  return (s.longBalls ?? 0) + (s.giveAndGos ?? 0) + (s.wallPasses ?? 0) + (s.oneTouchGoals ?? 0) + (s.megs ?? 0);
}

export function contributionScore(s: { goals: number; assists: number; saves: number; passes: number; interceptions: number }): number {
  return s.goals * 3 + s.assists * 3 + s.saves * 2 + s.interceptions * 1 + s.passes * 0.5;
}

export function matchRewards(result: MatchResult): RewardLine[] {
  const f = result.kind === 'quick' ? REWARDS.quickFactor : 1;
  const sc = (n: number) => Math.round(n * f);
  const lines: RewardLine[] = [{ label: result.kind === 'quick' ? 'Quick match played' : 'Match completed', credits: sc(REWARDS.matchComplete.credits), xp: sc(REWARDS.matchComplete.xp), source: 'match' }];
  if (result.won) lines.push({ label: 'Win bonus', credits: sc(REWARDS.winBonus.credits), xp: sc(REWARDS.winBonus.xp), source: 'match' });
  const score = contributionScore(result.player);
  const tier = REWARDS.contribution.find((t) => score >= t.min);
  if (tier) lines.push({ label: tier.label, credits: sc(tier.credits), xp: sc(tier.xp), source: 'match' });
  const plays = Math.min(REWARDS.play.max, playCount(result.player));
  if (plays > 0) lines.push({ label: `Plays completed × ${plays}`, credits: sc(REWARDS.play.credits * plays), xp: sc(REWARDS.play.xp * plays), source: 'match' });
  return lines;
}

function resultTitle(r: MatchResult): string {
  const p = r.player;
  if (p.goals >= 3) return 'Hat-trick Hero';
  if (p.saves >= 3) return 'Guardian';
  if (p.assists >= 2 || (p.assists >= 1 && p.passes >= 4)) return 'Playmaker';
  if (p.goals >= 2) return 'Striker';
  if (p.swingKicks >= 3) return 'Swing Specialist';
  if (p.interceptions >= 3) return 'Ball Hawk';
  if (p.passes >= 5) return 'Team Player';
  if (p.goals + p.assists + p.saves > 0) return 'Difference Maker';
  return 'Squad Member';
}

export interface CommitContext {
  label: string;
  opponentId: string;
  /** Chassis the player's own robot used (earns mastery). Defaults to the club's equipped chassis. */
  chassis?: ChassisId;
}

const STAGE_LABEL = { champion: 'champions', finalist: 'finalists', semifinalist: 'semi-finalists', missed: '' } as const;
const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

/**
 * Pays reward lines added since the last call, claims Club Road levels, then settles achievements (which can
 * themselves add XP and so levels) until nothing changes. Returns the achievement tiers earned.
 */
function settle(save: SaveGame, lines: RewardLine[], grants: Grant[], paidUpTo: { n: number }): AchievementStep[] {
  const steps: AchievementStep[] = [];
  for (let round = 0; round < 8; round++) {
    for (; paidUpTo.n < lines.length; paidUpTo.n++) {
      save.credits = Math.min(9999999, save.credits + lines[paidUpTo.n].credits);
      save.xp = Math.min(9999999, save.xp + lines[paidUpTo.n].xp);
    }
    grants.push(...claimLevels(save));
    const a = settleAchievements(save);
    if (!a.steps.length) break;
    steps.push(...a.steps);
    lines.push(...a.lines);
    grants.push(...a.grants);
  }
  return steps;
}

/**
 * Commits a finished match exactly once: builds the immutable result record, pays rewards, updates the
 * fixture / standings / history / records and stores the match id in the ledger.
 * Calling it again with the same match id returns the stored record without changing anything.
 */
export function commitMatch(save: SaveGame, result: MatchResult, ctx: CommitContext): CommittedResult {
  const existing = save.results.find((r) => r.matchId === result.matchId);
  if (save.committed.includes(result.matchId)) {
    if (existing) return existing;
    // Ledger says committed but the detailed record has rolled off: return a non-paying summary.
    return {
      matchId: result.matchId, kind: result.kind, label: ctx.label, arena: result.arena, opponentId: ctx.opponentId, opponent: result.opponent,
      score: result.score, won: result.won, overtime: result.overtime,
      stats: { goals: result.player.goals, assists: result.player.assists, saves: result.player.saves, passes: result.player.passes, interceptions: result.player.interceptions, shots: result.player.shots, swingKicks: result.player.swingKicks, ownGoals: result.player.ownGoals },
      mateGoals: result.mate.goals, title: resultTitle(result), rewards: [], credits: 0, xp: 0, xpBefore: save.xp, grants: [], newRecords: [], seasonComplete: false, progress: emptyReport(levelFor(save.xp)), at: Date.now(),
    };
  }

  const arenasBefore = unlockedArenas(save);
  const quick = result.kind === 'quick';
  const factor = quick ? REWARDS.quickFactor : 1;
  const rewards = matchRewards(result);
  const masteryXp = rewards.reduce((a, l) => a + l.xp, 0);
  const grants: Grant[] = [];
  let seasonComplete = false;
  const xpBefore = save.xp;
  const levelBefore = levelFor(save.xp);

  if (!quick && result.fixtureId) {
    const wasComplete = save.career.phase === 'complete';
    const ok = commitPlayerResult(save.career, result.fixtureId, result.score[0], result.score[1], result.overtime);
    if (ok && !wasComplete && save.career.phase === 'complete' && save.career.result) {
      seasonComplete = true;
      const res = save.career.result;
      save.seasons.push({ ...res });
      rewards.push({ label: 'Season completed', credits: REWARDS.seasonComplete.credits, xp: REWARDS.seasonComplete.xp, source: 'season' });
      const prize = seasonPrize(res.division, res.rank, res.stage);
      rewards.push({ label: `Season prize · ${ordinal(res.rank)} in the league${res.stage !== 'missed' ? `, playoff ${STAGE_LABEL[res.stage]}` : ''}`, credits: prize, xp: 0, source: 'season' });
      if (res.stage === 'champion') {
        const first = !save.trophies.some((t) => t.division === res.division);
        save.trophies.push({ division: res.division, seasonNo: res.seasonNo });
        const r = first ? REWARDS.divisionTitle : REWARDS.repeatTitle;
        rewards.push({ label: first ? `${DIVISIONS[res.division].name} champions` : 'Title defended', credits: r.credits, xp: r.xp, source: 'season' });
        grants.push({ kind: 'trophy', label: DIVISIONS[res.division].trophy, detail: res.promoted ? `Promoted to the ${DIVISIONS[res.division + 1].name}` : 'Added to your trophy shelf' });
      }
    }
  }

  // records (before achievements, which read them)
  const facts = matchFacts(result);
  const rec = save.records;
  const p = result.player;
  const newRecords: string[] = [];
  rec.matches++;
  if (result.won) {
    rec.wins++;
    rec.streak++;
    if (rec.streak > rec.bestStreak) {
      rec.bestStreak = rec.streak;
      if (rec.streak >= 2) newRecords.push(`Best win streak: ${rec.streak}`);
    }
    const margin = result.score[0] - result.score[1];
    if (margin > rec.bestMargin) {
      rec.bestMargin = margin;
      if (rec.matches > 1 && margin >= 2) newRecords.push(`Biggest win: by ${margin}`);
    }
    if (result.overtime) rec.overtimeWins++;
    if (facts.comebackWins) rec.comebackWins++;
    if (!quick) rec.careerWins++;
    save.progress.arenaWins[result.arena] = (save.progress.arenaWins[result.arena] ?? 0) + 1;
  } else rec.streak = 0;
  rec.goals += p.goals;
  rec.assists += p.assists;
  rec.saves += p.saves;
  rec.passes += p.passes;
  rec.interceptions += p.interceptions;
  rec.shots += p.shots;
  rec.swingGoals += facts.swingGoals;
  rec.longBalls += p.longBalls ?? 0;
  rec.giveAndGos += p.giveAndGos ?? 0;
  rec.wallPasses += p.wallPasses ?? 0;
  rec.oneTouchGoals += p.oneTouchGoals ?? 0;
  rec.megs += p.megs ?? 0;
  if (facts.cleanSheets) rec.cleanSheets++;
  if (facts.hatTrick) rec.hatTricks++;
  if (p.goals > rec.bestGoals) {
    rec.bestGoals = p.goals;
    if (p.goals >= 2) newRecords.push(`New record: ${p.goals} goals in a match`);
  }
  if (p.saves > rec.bestSaves) {
    rec.bestSaves = p.saves;
    if (p.saves >= 2) newRecords.push(`New record: ${p.saves} saves in a match`);
  }

  // chassis mastery (the player's own robot), objectives, then pay and settle levels / achievements
  const chassis: ChassisId = ctx.chassis && Object.hasOwn(CHASSIS, ctx.chassis) ? ctx.chassis : save.club.chassis;
  const sig = signatureBonus(chassis, p, result.score[1] === 0);
  const m = addMastery(save, chassis, masteryXp, sig.xp);
  rewards.push(...m.lines);
  grants.push(...m.grants);
  const obj = advanceForMatch(save, result, facts, factor);
  rewards.push(...obj.lines);
  save.progress.rerolls = 1;
  const achievements = settle(save, rewards, grants, { n: 0 });

  const credits = rewards.reduce((a, l) => a + l.credits, 0);
  const xp = rewards.reduce((a, l) => a + l.xp, 0);

  for (const a of unlockedArenas(save)) {
    if (!arenasBefore.includes(a)) grants.push({ kind: 'arena', label: ARENAS[a].name, detail: 'New venue unlocked for Quick Match' });
  }

  const progress: ProgressReport = { objectives: obj.steps, achievements, mastery: m.step, levelBefore, levelAfter: levelFor(save.xp) };
  const committed: CommittedResult = {
    matchId: result.matchId,
    kind: result.kind,
    label: ctx.label,
    arena: result.arena,
    opponentId: ctx.opponentId,
    opponent: result.opponent,
    score: [result.score[0], result.score[1]],
    won: result.won,
    overtime: result.overtime,
    stats: { goals: p.goals, assists: p.assists, saves: p.saves, passes: p.passes, interceptions: p.interceptions, shots: p.shots, swingKicks: p.swingKicks, ownGoals: p.ownGoals },
    mateGoals: result.mate.goals,
    title: resultTitle(result),
    rewards,
    credits,
    xp,
    xpBefore,
    grants,
    newRecords,
    seasonComplete,
    progress,
    at: Date.now(),
  };
  save.committed.push(result.matchId);
  if (save.committed.length > 80) save.committed.splice(0, save.committed.length - 80);
  // A replayed fixture (only possible after a season was rebuilt from a damaged save) replaces its old record.
  save.results = save.results.filter((r) => r.matchId !== committed.matchId);
  save.results.push(committed);
  if (save.results.length > 12) save.results.splice(0, save.results.length - 12);
  if (save.seasons.length > 40) save.seasons.splice(0, save.seasons.length - 40);
  save.flags.playedMatch = true;
  return committed;
}

/** Starts the next season after a completed one: promoted clubs move up, everyone else replays the division. */
export function startNextSeason(save: SaveGame): boolean {
  const c: CareerState = save.career;
  if (c.phase !== 'complete' || !c.result) return false;
  const division = c.result.promoted ? Math.min(DIVISIONS.length - 1, c.division + 1) : c.division;
  save.career = newSeason(division, c.seasonNo + 1, (c.seed * 1664525 + 1013904223) >>> 0);
  return true;
}

/** Shop price, 0 for starters, -1 for anything that cannot be bought (earned-only, opponent-only, unknown). */
export function itemPrice(id: string): number {
  if (id.startsWith('chassis:')) return Object.hasOwn(CHASSIS, id.slice(8)) ? CHASSIS[id.slice(8) as ChassisId].credits : -1;
  const d = COSMETIC_BY_ID[id];
  if (!d) return -1;
  return d.unlock === 'shop' ? d.credits : d.unlock === 'starter' ? 0 : -1;
}

/** 'earned' = an earned-only item (Club Road, achievement or mastery): it can be owned but never bought or picked. */
export type PurchaseOutcome = 'ok' | 'owned' | 'insufficient' | 'unknown' | 'no_pick' | 'earned';

const earnedOnly = (id: string): boolean => {
  const u = COSMETIC_BY_ID[id]?.unlock;
  return u === 'level' || u === 'achievement' || u === 'mastery';
};

/** Buys an item with credits. Validates ownership and balance, so a repeated click cannot charge twice. */
export function purchase(save: SaveGame, id: string): PurchaseOutcome {
  if (earnedOnly(id)) return save.owned.includes(id) ? 'owned' : 'earned';
  const price = itemPrice(id);
  if (price < 0) return 'unknown';
  if (save.owned.includes(id)) return 'owned';
  if (save.credits < price) return 'insufficient';
  save.credits -= price;
  save.owned.push(id);
  return 'ok';
}

/** Spends a free pick on a shop cosmetic (never on chassis or earned-only items). */
export function usePick(save: SaveGame, id: string): PurchaseOutcome {
  const def = COSMETIC_BY_ID[id];
  if (!def || def.unlock === 'opponent') return 'unknown';
  if (earnedOnly(id)) return save.owned.includes(id) ? 'owned' : 'earned';
  if (save.owned.includes(id)) return 'owned';
  if (def.unlock !== 'shop') return 'unknown';
  if (save.picks <= 0) return 'no_pick';
  save.picks--;
  save.owned.push(id);
  return 'ok';
}

export interface TrialOutcome {
  medal: 0 | 1 | 2 | 3;
  previousBest: number | null;
  newBest: boolean;
  credits: number;
  xp: number;
  paidMedals: string[];
  grants: Grant[];
  /** Objective and achievement rewards from this attempt (on top of the medal credits / XP above). */
  bonus: RewardLine[];
  progress: ProgressReport;
}

/**
 * Records a finished trial attempt. Personal bests only ever improve, and each medal tier pays once:
 * going straight to gold also pays any unclaimed lower tiers.
 */
export function commitTrial(save: SaveGame, id: TrialId, score: number | null): TrialOutcome {
  const def = TRIALS[id];
  let rec = save.trials[id];
  if (!rec || rec.rulesVersion !== def.rulesVersion) {
    rec = { best: null, medal: 0, rewarded: rec?.rewarded ?? 0, attempts: 0, rulesVersion: def.rulesVersion };
    save.trials[id] = rec;
  }
  rec.attempts++;
  const previousBest = rec.best;
  let newBest = false;
  let medal: 0 | 1 | 2 | 3 = 0;
  if (score !== null && Number.isFinite(score)) {
    medal = medalFor(def, score);
    if (rec.best === null || betterScore(def, score, rec.best)) {
      rec.best = score;
      newBest = true;
    }
    if (medal > rec.medal) rec.medal = medal;
  }
  let credits = 0;
  let xp = 0;
  const paidMedals: string[] = [];
  while (rec.rewarded < rec.medal) {
    rec.rewarded = (rec.rewarded + 1) as 1 | 2 | 3;
    credits += REWARDS.trialMedal[rec.rewarded].credits;
    xp += REWARDS.trialMedal[rec.rewarded].xp;
    paidMedals.push(MEDAL_NAMES[rec.rewarded]);
  }
  const levelBefore = levelFor(save.xp);
  const obj = advanceForTrial(save, medal);
  const lines: RewardLine[] = [{ label: 'Trial medals', credits, xp, source: 'trial' }, ...obj.lines];
  const grants: Grant[] = [];
  const achievements = settle(save, lines, grants, { n: 0 });
  const bonus = lines.slice(1);
  return { medal, previousBest, newBest, credits, xp, paidMedals, grants, bonus, progress: { objectives: obj.steps, achievements, mastery: null, levelBefore, levelAfter: levelFor(save.xp) } };
}

/** Marks a lesson complete; the small reward is paid the first time only. */
export function commitLesson(save: SaveGame, id: string): { first: boolean; credits: number; xp: number; grants: Grant[]; bonus: RewardLine[] } {
  if (save.lessons.includes(id)) return { first: false, credits: 0, xp: 0, grants: [], bonus: [] };
  save.lessons.push(id);
  const lines: RewardLine[] = [{ label: 'Lesson complete', credits: REWARDS.lesson.credits, xp: REWARDS.lesson.xp, source: 'lesson' }];
  const grants: Grant[] = [];
  settle(save, lines, grants, { n: 0 });
  return { first: true, credits: REWARDS.lesson.credits, xp: REWARDS.lesson.xp, grants, bonus: lines.slice(1) };
}

export function medalCount(save: SaveGame): number {
  let n = 0;
  for (const id of Object.keys(TRIALS) as TrialId[]) n += save.trials[id]?.medal ?? 0;
  return n;
}
