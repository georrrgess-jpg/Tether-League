import { OBJECTIVES, OBJECTIVE_BY_ID, OBJECTIVE_REWARD, OBJECTIVE_SLOTS, type MatchMetric, type ObjectiveDef, type ObjectiveTier, type TrialMetric } from '../content/progression';
import type { MatchResult } from '../game/modes/matchMode';
import { Rng, hashString } from '../game/sim/rng';
import type { ActiveObjective, ObjectiveStep, RewardLine, SaveGame } from '../storage/save';
import { unlockedArenas } from './road';

/**
 * Club objectives: always three active (easy / medium / hard). A completed objective pays once and is
 * replaced by a seeded draw from the same tier. No timers or resets: progress only moves when a match,
 * trial or lesson is committed.
 */

export type MatchFacts = Record<MatchMetric, number>;

/** Everything objectives and records need from one finished match, computed from what the simulation records. */
export function matchFacts(result: MatchResult): MatchFacts {
  const p = result.player;
  const career = result.kind !== 'quick';
  const won = result.won;
  let us = 0;
  let them = 0;
  let trailed = false;
  for (const g of result.goals) {
    if (g.team === 0) us++;
    else them++;
    if (them > us) trailed = true;
  }
  const margin = result.score[0] - result.score[1];
  const first = result.goals[0];
  return {
    goals: p.goals,
    assists: p.assists,
    saves: p.saves,
    passes: p.passes,
    interceptions: p.interceptions,
    shots: p.shots,
    swingGoals: result.goals.filter((g) => g.scorer === 0 && g.swing).length,
    swingKicks: p.swingKicks,
    wins: won ? 1 : 0,
    careerMatches: career ? 1 : 0,
    careerWins: career && won ? 1 : 0,
    cleanSheets: result.score[1] === 0 ? 1 : 0,
    comebackWins: won && trailed ? 1 : 0,
    firstGoal: first && first.team === 0 && first.scorer === 0 ? 1 : 0,
    winBy2: won && margin >= 2 ? 1 : 0,
    winBy3: won && margin >= 3 ? 1 : 0,
    hatTrick: p.goals >= 3 ? 1 : 0,
    goalAndSave: p.goals >= 1 && p.saves >= 1 ? 1 : 0,
    arenaWin: won ? 1 : 0,
    teamGoals: result.score[0],
    // Play counters default to 0 for results recorded before plays existed.
    plays: (p.longBalls ?? 0) + (p.giveAndGos ?? 0) + (p.wallPasses ?? 0) + (p.oneTouchGoals ?? 0),
    longBalls: p.longBalls ?? 0,
    giveAndGos: p.giveAndGos ?? 0,
    wallPasses: p.wallPasses ?? 0,
    oneTouchGoals: p.oneTouchGoals ?? 0,
  };
}

export function objectiveEligible(save: SaveGame, def: ObjectiveDef): boolean {
  return !def.arena || unlockedArenas(save).includes(def.arena);
}

/** Seeded, deterministic draw: same save state, same objective. */
export function drawObjective(save: SaveGame, tier: ObjectiveTier, exclude: string[]): ActiveObjective {
  const p = save.progress;
  const seq = p.objectiveSeq++;
  const rng = new Rng((p.objectiveSeed ^ hashString(`obj-${seq}`)) >>> 0);
  const active = new Set([...exclude, ...p.objectives.map((o) => o.id)]);
  // Variety: never two objectives on the same stat, and at most one trial objective at a time.
  const others = p.objectives.filter((o) => !exclude.includes(o.id)).map((o) => OBJECTIVE_BY_ID[o.id]).filter((d): d is ObjectiveDef => !!d);
  const clash = (d: ObjectiveDef) => others.some((x) => x.metric === d.metric || (x.source === 'trial' && d.source === 'trial'));
  let pool = OBJECTIVES.filter((d) => d.tier === tier && !active.has(d.id) && objectiveEligible(save, d) && !clash(d));
  if (!pool.length) pool = OBJECTIVES.filter((d) => d.tier === tier && !active.has(d.id) && objectiveEligible(save, d));
  if (!pool.length) pool = OBJECTIVES.filter((d) => d.tier === tier && objectiveEligible(save, d));
  const def = rng.pick(pool);
  return { uid: seq + 1, id: def.id, progress: 0 };
}

/** Fills any empty or invalid slot so there are always three objectives, one per tier, in slot order. */
export function ensureObjectives(save: SaveGame): void {
  const p = save.progress;
  const old = p.objectives;
  const slots: (ActiveObjective | null)[] = OBJECTIVE_SLOTS.map((tier) => old.find((x) => OBJECTIVE_BY_ID[x.id]?.tier === tier) ?? null);
  const present = () => slots.filter((x): x is ActiveObjective => !!x);
  p.objectives = present();
  OBJECTIVE_SLOTS.forEach((tier, i) => {
    if (slots[i]) return;
    slots[i] = drawObjective(save, tier, []);
    p.objectives = present();
  });
  p.objectives = present();
}

export function objectiveReward(def: ObjectiveDef, factor = 1): { credits: number; xp: number } {
  const r = OBJECTIVE_REWARD[def.tier];
  return { credits: Math.round(r.credits * factor), xp: Math.round(r.xp * factor) };
}

interface Advance {
  steps: ObjectiveStep[];
  lines: RewardLine[];
}

function advance(save: SaveGame, valueOf: (def: ObjectiveDef) => number | null, factor: number): Advance {
  const p = save.progress;
  const steps: ObjectiveStep[] = [];
  const lines: RewardLine[] = [];
  for (let i = 0; i < p.objectives.length; i++) {
    const o = p.objectives[i];
    const def = OBJECTIVE_BY_ID[o.id];
    if (!def) continue;
    const v = valueOf(def);
    if (v === null) continue;
    const before = o.progress;
    const after = Math.min(def.target, def.scope === 'match' ? Math.max(before, v) : before + v);
    if (after === before) continue;
    const done = after >= def.target;
    steps.push({ id: def.id, text: def.text, tier: def.tier, before, after, target: def.target, done });
    if (done) {
      const r = objectiveReward(def, factor);
      lines.push({ label: `Objective: ${def.text}`, credits: r.credits, xp: r.xp, source: 'objective' });
      p.objectivesDone++;
      p.objectives[i] = drawObjective(save, def.tier, [def.id]);
    } else o.progress = after;
  }
  return { steps, lines };
}

/** Progresses objectives with one committed match. `factor` is the quick-match reward factor. */
export function advanceForMatch(save: SaveGame, result: MatchResult, facts: MatchFacts, factor: number): Advance {
  return advance(save, (def) => {
    if (def.source !== 'match') return null;
    if (def.arena && def.arena !== result.arena) return null;
    return facts[def.metric as MatchMetric] ?? 0;
  }, factor);
}

/** Progresses trial objectives with one trial attempt's medal (0 = none). */
export function advanceForTrial(save: SaveGame, medal: number): Advance {
  const need: Record<TrialMetric, number> = { trialBronze: 1, trialSilver: 2, trialGold: 3 };
  return advance(save, (def) => (def.source === 'trial' ? (medal >= need[def.metric as TrialMetric] ? 1 : 0) : null), 1);
}

/**
 * Swaps one objective for a fresh draw of the same tier. Free, and available once after each completed
 * match (the allowance does not stack). Returns false when no reroll is available.
 */
export function rerollObjective(save: SaveGame, slot: number): boolean {
  const p = save.progress;
  if (p.rerolls <= 0 || slot < 0 || slot >= p.objectives.length) return false;
  const cur = p.objectives[slot];
  const def = OBJECTIVE_BY_ID[cur.id];
  if (!def) return false;
  p.objectives[slot] = drawObjective(save, def.tier, [cur.id]);
  p.rerolls = 0;
  return true;
}
