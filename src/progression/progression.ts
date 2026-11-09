import { commitPlayerResult, newSeason, type CareerState } from '../career/career';
import { ARENAS, type ArenaId } from '../content/arenas';
import { CHASSIS, CHASSIS_ORDER, type ChassisId } from '../content/chassis';
import { DIVISIONS } from '../content/clubs';
import { COSMETIC_BY_ID } from '../content/cosmetics';
import { MEDAL_NAMES, TRIALS, betterScore, medalFor, type TrialId } from '../content/trials';
import type { MatchResult } from '../game/modes/matchMode';
import type { CommittedResult, Grant, RewardLine, SaveGame } from '../storage/save';

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
} as const;

export const XP_MILESTONES = [150, 400, 800, 1500, 2500];
export const XP_REPEAT = 500;

/** Club level = number of XP thresholds reached. */
export function levelFor(xp: number): number {
  let level = 0;
  for (const m of XP_MILESTONES) if (xp >= m) level++;
  const last = XP_MILESTONES[XP_MILESTONES.length - 1];
  if (xp >= last) level += Math.floor((xp - last) / XP_REPEAT);
  return level;
}

export function levelThreshold(level: number): number {
  if (level <= 0) return 0;
  if (level <= XP_MILESTONES.length) return XP_MILESTONES[level - 1];
  return XP_MILESTONES[XP_MILESTONES.length - 1] + (level - XP_MILESTONES.length) * XP_REPEAT;
}

export function levelProgress(xp: number): { level: number; from: number; to: number; frac: number } {
  const level = levelFor(xp);
  const from = levelThreshold(level);
  const to = levelThreshold(level + 1);
  return { level, from, to, frac: Math.max(0, Math.min(1, (xp - from) / (to - from))) };
}

export type LevelReward = { kind: 'pick' } | { kind: 'credits'; amount: number } | { kind: 'chassis'; id: ChassisId; fallback: number };

export function levelReward(level: number): LevelReward {
  for (const id of CHASSIS_ORDER) if (CHASSIS[id].unlockLevel === level) return { kind: 'chassis', id, fallback: 150 };
  if (level === 1 || level === 3 || level === 5) return { kind: 'pick' };
  if (level === 2 || level === 7) return { kind: 'credits', amount: 100 };
  if (level > 8 && level % 4 === 0) return { kind: 'pick' };
  return { kind: 'credits', amount: 60 };
}

export function describeLevelReward(level: number): string {
  const r = levelReward(level);
  if (r.kind === 'pick') return 'Free cosmetic pick';
  if (r.kind === 'chassis') return `${CHASSIS[r.id].name} chassis`;
  return `${r.amount} credits`;
}

/** Grants every unclaimed level reward up to the current level, once each. */
export function claimLevels(save: SaveGame): Grant[] {
  const grants: Grant[] = [];
  const level = levelFor(save.xp);
  for (let l = 1; l <= level; l++) {
    if (save.claimedLevels.includes(l)) continue;
    save.claimedLevels.push(l);
    const r = levelReward(l);
    if (r.kind === 'pick') {
      save.picks++;
      grants.push({ kind: 'pick', label: `Club level ${l}`, detail: 'Free cosmetic pick. Choose any locked item in Club customisation.' });
    } else if (r.kind === 'credits') {
      save.credits += r.amount;
      grants.push({ kind: 'credits', label: `Club level ${l}`, detail: `+${r.amount} credits` });
    } else if (!save.owned.includes(`chassis:${r.id}`)) {
      save.owned.push(`chassis:${r.id}`);
      grants.push({ kind: 'chassis', label: `Club level ${l}`, detail: `${CHASSIS[r.id].name} chassis unlocked in the Garage` });
    } else {
      save.credits += r.fallback;
      grants.push({ kind: 'credits', label: `Club level ${l}`, detail: `+${r.fallback} credits (chassis already owned)` });
    }
  }
  return grants;
}

export function contributionScore(s: { goals: number; assists: number; saves: number; passes: number; interceptions: number }): number {
  return s.goals * 3 + s.assists * 3 + s.saves * 2 + s.interceptions * 1 + s.passes * 0.5;
}

export function matchRewards(result: MatchResult): RewardLine[] {
  const f = result.kind === 'quick' ? REWARDS.quickFactor : 1;
  const sc = (n: number) => Math.round(n * f);
  const lines: RewardLine[] = [{ label: result.kind === 'quick' ? 'Quick match played' : 'Match completed', credits: sc(REWARDS.matchComplete.credits), xp: sc(REWARDS.matchComplete.xp) }];
  if (result.won) lines.push({ label: 'Win bonus', credits: sc(REWARDS.winBonus.credits), xp: sc(REWARDS.winBonus.xp) });
  const score = contributionScore(result.player);
  const tier = REWARDS.contribution.find((t) => score >= t.min);
  if (tier) lines.push({ label: tier.label, credits: sc(tier.credits), xp: sc(tier.xp) });
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
}

/** True when the player's home trophy shelf / arenas would change: used only for messaging. */
export function unlockedArenas(save: SaveGame): ArenaId[] {
  const out: ArenaId[] = ['harbor_park'];
  if (save.seasons.length >= 1) out.push('foundry_court');
  if (save.trophies.some((t) => t.division >= 1)) out.push('skyline_stadium');
  if (save.career.division >= 3 || save.seasons.some((s) => s.division >= 3)) out.push('championship_dome');
  return out;
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
      mateGoals: result.mate.goals, title: resultTitle(result), rewards: [], credits: 0, xp: 0, xpBefore: save.xp, grants: [], newRecords: [], seasonComplete: false, at: Date.now(),
    };
  }

  const arenasBefore = unlockedArenas(save);
  const rewards = matchRewards(result);
  const grants: Grant[] = [];
  let seasonComplete = false;

  if (result.kind !== 'quick' && result.fixtureId) {
    const wasComplete = save.career.phase === 'complete';
    const ok = commitPlayerResult(save.career, result.fixtureId, result.score[0], result.score[1], result.overtime);
    if (ok && !wasComplete && save.career.phase === 'complete' && save.career.result) {
      seasonComplete = true;
      const res = save.career.result;
      save.seasons.push({ ...res });
      rewards.push({ label: 'Season completed', credits: REWARDS.seasonComplete.credits, xp: REWARDS.seasonComplete.xp });
      if (res.stage === 'champion') {
        const first = !save.trophies.some((t) => t.division === res.division);
        save.trophies.push({ division: res.division, seasonNo: res.seasonNo });
        const r = first ? REWARDS.divisionTitle : REWARDS.repeatTitle;
        rewards.push({ label: first ? `${DIVISIONS[res.division].name} champions` : 'Title defended', credits: r.credits, xp: r.xp });
        grants.push({ kind: 'trophy', label: DIVISIONS[res.division].trophy, detail: res.promoted ? `Promoted to the ${DIVISIONS[res.division + 1].name}` : 'Added to your trophy shelf' });
      }
    }
  }

  const credits = rewards.reduce((a, l) => a + l.credits, 0);
  const xp = rewards.reduce((a, l) => a + l.xp, 0);
  const xpBefore = save.xp;
  save.credits += credits;
  save.xp += xp;
  grants.push(...claimLevels(save));

  // records
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
  } else rec.streak = 0;
  rec.goals += p.goals;
  rec.assists += p.assists;
  rec.saves += p.saves;
  rec.passes += p.passes;
  rec.interceptions += p.interceptions;
  rec.swingGoals += result.goals.filter((g) => g.scorer === 0 && g.swing).length;
  if (p.goals > rec.bestGoals) {
    rec.bestGoals = p.goals;
    if (p.goals >= 2) newRecords.push(`New record: ${p.goals} goals in a match`);
  }
  if (p.saves > rec.bestSaves) {
    rec.bestSaves = p.saves;
    if (p.saves >= 2) newRecords.push(`New record: ${p.saves} saves in a match`);
  }

  for (const a of unlockedArenas(save)) {
    if (!arenasBefore.includes(a)) grants.push({ kind: 'arena', label: ARENAS[a].name, detail: 'New venue unlocked for Quick Match' });
  }

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
    at: Date.now(),
  };
  save.committed.push(result.matchId);
  if (save.committed.length > 80) save.committed.splice(0, save.committed.length - 80);
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

export function itemPrice(id: string): number {
  if (id.startsWith('chassis:')) return CHASSIS[id.slice(8) as ChassisId]?.credits ?? -1;
  return COSMETIC_BY_ID[id]?.credits ?? -1;
}

export type PurchaseOutcome = 'ok' | 'owned' | 'insufficient' | 'unknown' | 'no_pick';

/** Buys an item with credits. Validates ownership and balance, so a repeated click cannot charge twice. */
export function purchase(save: SaveGame, id: string): PurchaseOutcome {
  const price = itemPrice(id);
  if (price < 0) return 'unknown';
  if (save.owned.includes(id)) return 'owned';
  if (save.credits < price) return 'insufficient';
  save.credits -= price;
  save.owned.push(id);
  return 'ok';
}

/** Spends a free milestone pick on a cosmetic (not on chassis). */
export function usePick(save: SaveGame, id: string): PurchaseOutcome {
  const def = COSMETIC_BY_ID[id];
  if (!def || def.credits < 0) return 'unknown';
  if (save.owned.includes(id)) return 'owned';
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
  save.credits += credits;
  save.xp += xp;
  const grants = xp > 0 ? claimLevels(save) : [];
  return { medal, previousBest, newBest, credits, xp, paidMedals, grants };
}

/** Marks a lesson complete; the small reward is paid the first time only. */
export function commitLesson(save: SaveGame, id: string): { first: boolean; credits: number; xp: number; grants: Grant[] } {
  if (save.lessons.includes(id)) return { first: false, credits: 0, xp: 0, grants: [] };
  save.lessons.push(id);
  save.credits += REWARDS.lesson.credits;
  save.xp += REWARDS.lesson.xp;
  return { first: true, credits: REWARDS.lesson.credits, xp: REWARDS.lesson.xp, grants: claimLevels(save) };
}

export function medalCount(save: SaveGame): number {
  let n = 0;
  for (const id of Object.keys(TRIALS) as TrialId[]) n += save.trials[id]?.medal ?? 0;
  return n;
}
