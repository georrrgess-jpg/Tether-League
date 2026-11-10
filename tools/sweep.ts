/**
 * Broken-mechanics sweep: many seeded bot matches on every arena with mixed chassis and difficulties.
 * Flags NaN/infinite values, robots or ball outside the arena envelope, a ball left untouched and still for
 * more than 6 s, a robot pinned in one place for more than 8 s while wanting to move, matches that do not
 * finish, score/goal-record mismatches and goal credit inconsistencies.
 *   vite-node tools/sweep.ts [matchesPerArena]
 */
import { ARENAS, ARENA_ORDER } from '../src/content/arenas';
import { CHASSIS, CHASSIS_ORDER } from '../src/content/chassis';
import { TUNING } from '../src/content/tuning';
import { BotDirector, CLUB_STYLE, DIFFICULTY, DIFFICULTY_ORDER } from '../src/game/ai/bot';
import { Match } from '../src/game/sim/match';
import { Rng } from '../src/game/sim/rng';
import { emptyCommand } from '../src/game/sim/types';

const n = Number(process.argv[2] ?? 6);
const problems: string[] = [];
let matches = 0;
let goalsTotal = 0;
let own = 0;
let maxStill = 0;
let maxPinned = 0;
const rng = new Rng(99);
for (const arena of ARENA_ORDER) {
  for (let i = 0; i < n; i++) {
    matches++;
    const ch = [0, 1, 2, 3].map(() => CHASSIS[rng.pick(CHASSIS_ORDER)]) as [typeof CHASSIS.all_rounder, typeof CHASSIS.all_rounder, typeof CHASSIS.all_rounder, typeof CHASSIS.all_rounder];
    const m = new Match({ arena: ARENAS[arena], chassis: ch, human: -1, assist: 0, regulationSeconds: 180 });
    const styles = Object.values(CLUB_STYLE);
    const diff = [0, 1, 2, 3].map(() => DIFFICULTY[rng.pick(DIFFICULTY_ORDER)]);
    const bots = new BotDirector(m.world, [0, 1, 2, 3].map((robot) => ({ robot, difficulty: diff[robot], style: rng.pick(styles) })), 3000 + matches);
    const cmds = [emptyCommand(), emptyCommand(), emptyCommand(), emptyCommand()];
    const w = m.world;
    let prev = m.phase;
    let ticks = 0;
    let still = 0;
    let lastTouch = 0;
    const pin = [0, 0, 0, 0];
    const px = [0, 0, 0, 0];
    const pz = [0, 0, 0, 0];
    while (!m.finished && ticks++ < 60 * 60 * 10) {
      if (m.phase === 'play') bots.update(cmds);
      m.step(cmds);
      if (prev !== 'countdown' && m.phase === 'countdown') bots.reset();
      prev = m.phase;
      const b = w.ball;
      if (![b.x, b.z, b.vx, b.vz].every(Number.isFinite)) problems.push(`${arena}#${i}: ball NaN at tick ${w.tick}`);
      if (Math.abs(b.z) > w.hz + 0.01 || Math.abs(b.x) > w.hx + w.arena.goalDepth + 0.01) problems.push(`${arena}#${i}: ball outside (${b.x.toFixed(2)}, ${b.z.toFixed(2)})`);
      for (const e of w.events) if (e.type === 'kick' || e.type === 'touch') lastTouch = w.tick;
      if (m.phase === 'play') {
        still = Math.hypot(b.vx, b.vz) < 0.05 && w.tick - lastTouch > 1 ? still + 1 : 0;
        maxStill = Math.max(maxStill, still);
        if (still === 6 * 60) problems.push(`${arena}#${i}: ball untouched and still for 6 s at (${b.x.toFixed(1)}, ${b.z.toFixed(1)})`);
        for (const r of w.robots) {
          if (![r.x, r.z, r.vx, r.vz].every(Number.isFinite)) problems.push(`${arena}#${i}: robot ${r.id} NaN`);
          if (Math.abs(r.x) > w.hx + 1e-6 || Math.abs(r.z) > w.hz + 1e-6) problems.push(`${arena}#${i}: robot ${r.id} outside`);
          if (Math.hypot(r.vx, r.vz) > TUNING.tether.maxSpeed + 1e-6) problems.push(`${arena}#${i}: robot ${r.id} over speed cap`);
          const wants = Math.hypot(cmds[r.id].mx, cmds[r.id].mz) > 0.5;
          if (w.tick % 30 === 0) {
            const moved = Math.hypot(r.x - px[r.id], r.z - pz[r.id]);
            pin[r.id] = wants && moved < 0.15 ? pin[r.id] + 0.5 : 0;
            maxPinned = Math.max(maxPinned, pin[r.id]);
            if (pin[r.id] === 8) problems.push(`${arena}#${i}: robot ${r.id} pinned 8 s at (${r.x.toFixed(1)}, ${r.z.toFixed(1)})`);
            px[r.id] = r.x;
            pz[r.id] = r.z;
          }
        }
      } else still = 0;
    }
    if (!m.finished) problems.push(`${arena}#${i}: match did not finish`);
    if (m.goals.length !== m.score[0] + m.score[1]) problems.push(`${arena}#${i}: goal records ${m.goals.length} vs score ${m.score}`);
    if (m.winner === -1) problems.push(`${arena}#${i}: no winner`);
    for (const g of m.goals) {
      if (g.scorer >= 0 && w.robots[g.scorer].team !== g.team) problems.push(`${arena}#${i}: scorer on the wrong team`);
      if (g.assist >= 0 && (g.assist === g.scorer || w.robots[g.assist].team !== g.team)) problems.push(`${arena}#${i}: bad assist`);
      if (g.ownGoalBy >= 0) {
        own++;
        if (w.robots[g.ownGoalBy].team === g.team) problems.push(`${arena}#${i}: own goal credited to the scoring team`);
      }
    }
    goalsTotal += m.goals.length;
  }
}
console.log(`${matches} matches, ${goalsTotal} goals (${(goalsTotal / matches).toFixed(1)}/match), own goals ${own} (${((own / Math.max(1, goalsTotal)) * 100).toFixed(1)}%)`);
console.log(`longest still ball ${(maxStill / 60).toFixed(1)} s, longest pinned robot ${maxPinned.toFixed(1)} s`);
console.log(problems.length ? `PROBLEMS (${problems.length}):\n` + [...new Set(problems)].slice(0, 30).join('\n') : 'no problems found');
