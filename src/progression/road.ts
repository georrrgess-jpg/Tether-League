import { ARENAS, type ArenaId } from '../content/arenas';
import { CHASSIS, type ChassisId } from '../content/chassis';
import { COSMETIC_BY_ID, type CosmeticKind } from '../content/cosmetics';
import { ROAD_LENGTH, roadReward, xpForLevel, type TrackReward } from '../content/progression';
import type { Grant, SaveGame } from '../storage/save';

/**
 * Club levels and the Club Road reward track. Pure functions over save data; grants happen only when a
 * commit function (progression.ts) calls claimLevels, which is idempotent through save.claimedLevels.
 */

/** Total XP needed to reach `level`. */
export function levelThreshold(level: number): number {
  let t = 0;
  for (let n = 1; n <= level; n++) t += xpForLevel(n);
  return t;
}

/** Club level = number of thresholds reached. */
export function levelFor(xp: number): number {
  let level = 0;
  let t = 0;
  for (;;) {
    const next = t + xpForLevel(level + 1);
    if (xp < next) return level;
    t = next;
    level++;
    if (level > 100000) return level;
  }
}

export function levelProgress(xp: number): { level: number; from: number; to: number; frac: number } {
  const level = levelFor(xp);
  const from = levelThreshold(level);
  const to = from + xpForLevel(level + 1);
  return { level, from, to, frac: Math.max(0, Math.min(1, (xp - from) / (to - from))) };
}

export type LevelReward = TrackReward;
export const levelReward = roadReward;

const KIND_LABEL: Record<CosmeticKind, string> = { face: 'face', pattern: 'jersey', trail: 'trail', celebration: 'celebration', badge: 'badge', topper: 'topper', title: 'club title', color: 'club colour' };

export function itemKindLabel(id: string): string {
  const d = COSMETIC_BY_ID[id];
  return d ? KIND_LABEL[d.kind] : 'item';
}

export function describeTrackReward(r: TrackReward): string {
  if (r.kind === 'pick') return 'Free cosmetic pick';
  if (r.kind === 'chassis') return `${CHASSIS[r.id].name} chassis`;
  if (r.kind === 'credits') return `${r.amount} credits`;
  const d = COSMETIC_BY_ID[r.id];
  return d ? `${d.name} ${KIND_LABEL[d.kind]}` : r.id;
}

export function describeLevelReward(level: number): string {
  return describeTrackReward(roadReward(level));
}

/**
 * Gives an item once. If it is already owned (e.g. bought in the shop before the reward came round),
 * pays `fallback` credits instead so a reward is never wasted. Returns the grant shown on screens.
 */
export function grantItem(save: SaveGame, id: string, fallback: number, label: string): Grant {
  const d = COSMETIC_BY_ID[id];
  if (!d) return { kind: 'credits', label, detail: 'Nothing to unlock' };
  if (!save.owned.includes(id)) {
    save.owned.push(id);
    return { kind: 'item', label, detail: `${d.name} ${KIND_LABEL[d.kind]} unlocked`, item: id };
  }
  save.credits += fallback;
  return { kind: 'credits', label, detail: fallback > 0 ? `+${fallback} credits (${d.name} already owned)` : `${d.name} already owned` };
}

export function grantChassis(save: SaveGame, id: ChassisId, fallback: number, label: string): Grant {
  if (!save.owned.includes(`chassis:${id}`)) {
    save.owned.push(`chassis:${id}`);
    return { kind: 'chassis', label, detail: `${CHASSIS[id].name} chassis unlocked in the Garage` };
  }
  save.credits += fallback;
  return { kind: 'credits', label, detail: `+${fallback} credits (chassis already owned)` };
}

/** Grants every unclaimed Club Road reward up to the current level, once each. */
export function claimLevels(save: SaveGame): Grant[] {
  const grants: Grant[] = [];
  const level = levelFor(save.xp);
  for (let l = 1; l <= level; l++) {
    if (save.claimedLevels.includes(l)) continue;
    save.claimedLevels.push(l);
    const label = `Club level ${l}`;
    const r = roadReward(l);
    if (r.kind === 'pick') {
      save.picks = Math.min(99, save.picks + 1);
      grants.push({ kind: 'pick', label, detail: 'Free cosmetic pick. Choose any shop item in Club customisation.' });
    } else if (r.kind === 'credits') {
      save.credits += r.amount;
      grants.push({ kind: 'credits', label, detail: `+${r.amount} credits` });
    } else if (r.kind === 'chassis') grants.push(grantChassis(save, r.id, r.fallback, label));
    else grants.push(grantItem(save, r.id, r.fallback, label));
  }
  return grants;
}

/** Arenas open for Quick Match (and arena objectives). */
export function unlockedArenas(save: SaveGame): ArenaId[] {
  const out: ArenaId[] = ['harbor_park'];
  if (save.seasons.length >= 1) out.push('foundry_court');
  if (save.trophies.some((t) => t.division >= 1)) out.push('skyline_stadium');
  if (save.career.division >= 3 || save.seasons.some((s) => s.division >= 3)) out.push('championship_dome');
  return out.filter((a) => !!ARENAS[a]);
}

export const ROAD_LEVELS = Array.from({ length: ROAD_LENGTH }, (_v, i) => i + 1);

// ---------------------------------------------------------------------------
// Legacy (save version 1) curve and rewards, used only by the v1 -> v2 migration.
// ---------------------------------------------------------------------------

const LEGACY_MILESTONES = [150, 400, 800, 1500, 2500];

export function legacyThreshold(level: number): number {
  if (level <= 0) return 0;
  if (level <= LEGACY_MILESTONES.length) return LEGACY_MILESTONES[level - 1];
  return 2500 + (level - LEGACY_MILESTONES.length) * 500;
}

/** What a v1 level paid: credits and picks only (chassis levels paid the chassis, or 150 if owned; counted as 0). */
export function legacyLevelValue(level: number): { credits: number; picks: number } {
  if (level === 4 || level === 6 || level === 8) return { credits: 0, picks: 0 };
  if (level === 1 || level === 3 || level === 5) return { credits: 0, picks: 1 };
  if (level === 2 || level === 7) return { credits: 100, picks: 0 };
  if (level > 8 && level % 4 === 0) return { credits: 0, picks: 1 };
  return { credits: 60, picks: 0 };
}
