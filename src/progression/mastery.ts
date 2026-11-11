import { CHASSIS, CHASSIS_ORDER, type ChassisId } from '../content/chassis';
import { MASTERY_MAX, MASTERY_SIGNATURE, masteryReward, masteryStep, type MasteryReward, type SignatureStat } from '../content/progression';
import type { Grant, MasteryStep, RewardLine, SaveGame } from '../storage/save';
import { describeTrackReward, grantItem } from './road';

/**
 * Chassis mastery: the chassis the player's own robot used earns mastery XP from each completed match,
 * plus a signature bonus for playing to the chassis' strengths. Levels 1..20 (ranks Bronze to Master)
 * pay cosmetics, credits and picks. Mastery never changes how a chassis plays.
 */

/** Per-match signature bonus for a chassis from the player's match stats (capped). */
export function signatureBonus(
  chassis: ChassisId,
  p: Partial<Record<Exclude<SignatureStat, 'cleanSheet'>, number>>,
  cleanSheet: boolean,
): { xp: number; parts: { stat: SignatureStat; count: number; xp: number }[] } {
  const sig = MASTERY_SIGNATURE[chassis];
  const parts: { stat: SignatureStat; count: number; xp: number }[] = [];
  let total = 0;
  for (const [stat, w] of Object.entries(sig.weights) as [SignatureStat, number][]) {
    const count = stat === 'cleanSheet' ? (cleanSheet ? 1 : 0) : Math.max(0, p[stat] ?? 0);
    if (count <= 0) continue;
    const xp = Math.round(count * w);
    parts.push({ stat, count, xp });
    total += xp;
  }
  return { xp: Math.min(sig.cap, total), parts };
}

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
export function addMastery(save: SaveGame, chassis: ChassisId, gained: number, signature = 0): { step: MasteryStep; lines: RewardLine[]; grants: Grant[] } {
  const p = save.progress;
  const before = p.mastery[chassis] ?? 0;
  const levelBefore = masteryLevel(before);
  p.mastery[chassis] = Math.min(9999999, before + Math.max(0, Math.round(gained)) + Math.max(0, Math.round(signature)));
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
  return { step: { chassis, gained: p.mastery[chassis] - before, levelBefore, levelAfter, signature: Math.max(0, Math.round(signature)) }, lines, grants };
}
