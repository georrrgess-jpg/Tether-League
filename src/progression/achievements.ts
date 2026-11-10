import { COSMETIC_BY_ID } from '../content/cosmetics';
import { ACHIEVEMENTS, ACHIEVEMENT_REWARD, TIER_NAMES, type AchievementDef, type AchievementStat } from '../content/progression';
import { TRIALS, type TrialId } from '../content/trials';
import type { AchievementStep, Grant, RewardLine, SaveGame } from '../storage/save';
import { bestMasteryLevel, totalMasteryLevels } from './mastery';
import { grantItem, levelFor } from './road';

/**
 * Achievements: lifetime goals with bronze / silver / gold tiers. Each tier pays once; the paid tier is
 * stored in save.progress.achievements. Values come only from recorded data.
 */

export function achievementValue(save: SaveGame, stat: AchievementStat): number {
  const r = save.records;
  const trialTier = (id: TrialId) => {
    const t = save.trials[id];
    return t ? Math.max(t.medal, t.rewarded) : 0;
  };
  const trialIds = Object.keys(TRIALS) as TrialId[];
  switch (stat) {
    case 'goals': case 'swingGoals': case 'assists': case 'passes': case 'saves': case 'interceptions': case 'shots':
    case 'wins': case 'matches': case 'bestStreak': case 'bestMargin': case 'bestGoals': case 'bestSaves':
    case 'cleanSheets': case 'comebackWins': case 'overtimeWins': case 'hatTricks':
      return r[stat];
    case 'trophies': return save.trophies.length;
    case 'topDivision': return 1 + Math.max(save.career.division, ...save.seasons.map((s) => s.division + (s.promoted ? 1 : 0)), ...save.trophies.map((t) => t.division));
    case 'seasons': return save.seasons.length;
    case 'finals': return save.seasons.filter((s) => s.stage === 'champion' || s.stage === 'finalist').length;
    case 'trialMedals': return trialIds.reduce((a, id) => a + trialTier(id), 0);
    case 'trialGolds': return trialIds.filter((id) => trialTier(id) >= 3).length;
    case 'lessons': return save.lessons.length;
    case 'clubLevel': return levelFor(save.xp);
    case 'objectivesDone': return save.progress.objectivesDone;
    case 'bestMastery': return bestMasteryLevel(save);
    case 'totalMastery': return totalMasteryLevels(save);
    case 'playoffs': return save.seasons.filter((s) => s.stage !== 'missed').length;
    case 'shopOwned': return save.owned.filter((o) => COSMETIC_BY_ID[o]?.unlock === 'shop').length;
    case 'arenasWon': return Object.values(save.progress.arenaWins).filter((n) => (n ?? 0) > 0).length;
  }
}

export function tierReached(def: AchievementDef, value: number): number {
  return def.tiers.filter((t) => value >= t).length;
}

export function achievementText(def: AchievementDef, tierIndex: number): string {
  const n = def.tiers[Math.max(0, Math.min(2, tierIndex))];
  return def.text.replace('{n}', String(n)).replace(/\{([^|}]*)\|([^}]*)\}/g, (_m, one: string, many: string) => (n === 1 ? one : many));
}

/**
 * Pays every newly reached tier once. `pay` false marks tiers as earned and grants their items without
 * credits or XP (used once, by the v1 -> v2 save migration).
 */
export function settleAchievements(save: SaveGame, pay = true): { steps: AchievementStep[]; lines: RewardLine[]; grants: Grant[] } {
  const steps: AchievementStep[] = [];
  const lines: RewardLine[] = [];
  const grants: Grant[] = [];
  const claimed = save.progress.achievements;
  for (const def of ACHIEVEMENTS) {
    const reached = tierReached(def, achievementValue(save, def.stat));
    for (let t = (claimed[def.id] ?? 0) + 1; t <= reached; t++) {
      claimed[def.id] = t;
      const label = `${def.name} · ${TIER_NAMES[t - 1]}`;
      steps.push({ id: def.id, name: def.name, tier: t as 1 | 2 | 3 });
      if (pay) lines.push({ label, credits: ACHIEVEMENT_REWARD[t - 1].credits, xp: ACHIEVEMENT_REWARD[t - 1].xp, source: 'achievement' });
      const item = def.items?.[(t - 1) as 0 | 1 | 2];
      if (item && COSMETIC_BY_ID[item]) grants.push(grantItem(save, item, 0, label));
    }
  }
  return { steps, lines, grants };
}
