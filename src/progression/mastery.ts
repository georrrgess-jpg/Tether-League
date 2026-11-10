import { CHASSIS, CHASSIS_ORDER, type ChassisId } from '../content/chassis';
import { MASTERY_MAX, masteryReward, masteryStep, type MasteryReward } from '../content/progression';
import type { Grant, MasteryStep, RewardLine, SaveGame } from '../storage/save';
import { describeTrackReward, grantItem } from './road';

/**
 * Chassis mastery: the chassis the player's own robot used earns mastery XP from each completed match.
 * Levels 1..10 pay cosmetics, credits and a pick. Mastery never changes how a chassis plays.
 */

export function masteryThreshold(level: number): number {
  let t = 0;
  for (let n = 1; n <= Math.min(level, MASTERY_MAX); n++) t += masteryStep(n);
  return t;
}

export function masteryLevel(xp: number): number {
  let l = 0;
  while (l < MASTERY_MAX && xp >= masteryThreshold(l + 1)) l++;
  return l;
}

export function masteryProgress(xp: number): { level: number; from: number; to: number; frac: number; max: boolean } {
  const level = masteryLevel(xp);
  if (level >= MASTERY_MAX) return { level, from: masteryThreshold(MASTERY_MAX), to: masteryThreshold(MASTERY_MAX), frac: 1, max: true };
  const from = masteryThreshold(level);
  const to = masteryThreshold(level + 1);
  return { level, from, to, frac: Math.max(0, Math.min(1, (xp - from) / (to - from))), max: false };
}

export function describeMasteryReward(r: MasteryReward): string {
  if (r.kind === 'credits') return `${r.amount} credits`;
  if (r.kind === 'pick') return 'Free cosmetic pick';
  return describeTrackReward({ kind: 'item', id: r.id, fallback: r.fallback });
}

export function totalMasteryLevels(save: SaveGame): number {
  return CHASSIS_ORDER.reduce((a, id) => a + masteryLevel(save.progress.mastery[id] ?? 0), 0);
}

export function bestMasteryLevel(save: SaveGame): number {
  return Math.max(0, ...CHASSIS_ORDER.map((id) => masteryLevel(save.progress.mastery[id] ?? 0)));
}

/**
 * Adds mastery XP and pays every newly reached level once (masteryClaimed is the ledger).
 * Credits come back as reward lines so the committed record lists them with the match rewards.
 */
export function addMastery(save: SaveGame, chassis: ChassisId, gained: number): { step: MasteryStep; lines: RewardLine[]; grants: Grant[] } {
  const p = save.progress;
  const before = p.mastery[chassis] ?? 0;
  const levelBefore = masteryLevel(before);
  p.mastery[chassis] = Math.min(9999999, before + Math.max(0, Math.round(gained)));
  const levelAfter = masteryLevel(p.mastery[chassis]);
  const lines: RewardLine[] = [];
  const grants: Grant[] = [];
  for (let l = (p.masteryClaimed[chassis] ?? 0) + 1; l <= levelAfter; l++) {
    p.masteryClaimed[chassis] = l;
    const label = `${CHASSIS[chassis].name} mastery ${l}`;
    const r = masteryReward(chassis, l);
    if (r.kind === 'credits') lines.push({ label, credits: r.amount, xp: 0, source: 'mastery' });
    else if (r.kind === 'pick') {
      save.picks = Math.min(99, save.picks + 1);
      grants.push({ kind: 'pick', label, detail: 'Free cosmetic pick. Choose any shop item in Club customisation.' });
    } else grants.push(grantItem(save, r.id, r.fallback, label));
  }
  return { step: { chassis, gained: p.mastery[chassis] - before, levelBefore, levelAfter }, lines, grants };
}
