// How bots use the tether in real matches: swings, swing kicks, swing goals, and where launches end up.
import { ARENAS, type ArenaId } from '../src/content/arenas';
import { CHASSIS } from '../src/content/chassis';
import { BotDirector, CLUB_STYLE, DIFFICULTY, type DifficultyId } from '../src/game/ai/bot';
import { Match } from '../src/game/sim/match';
import { emptyCommand } from '../src/game/sim/types';

const n = Number(process.argv[2] ?? 6);
const arena = (process.argv[3] ?? 'harbor_park') as ArenaId;
const diff = (process.argv[4] ?? 'club') as DifficultyId;
let swings = 0, swingKicks = 0, goals = 0, swingGoals = 0, fastRel = 0, total = 0;
for (let i = 0; i < n; i++) {
  const c = CHASSIS.all_rounder;
  const m = new Match({ arena: ARENAS[arena], chassis: [c, c, c, c], human: -1, assist: 0, regulationSeconds: 180 });
  const bots = new BotDirector(m.world, [0, 1, 2, 3].map((robot) => ({ robot, difficulty: DIFFICULTY[diff], style: CLUB_STYLE.balanced })), 900 + i);
  const cmds = [emptyCommand(), emptyCommand(), emptyCommand(), emptyCommand()];
  let prev = m.phase;
  while (!m.finished) {
    if (m.phase === 'play') bots.update(cmds);
    m.step(cmds);
    if (prev !== 'countdown' && m.phase === 'countdown') bots.reset();
    prev = m.phase;
    for (const e of m.world.events) if (e.type === 'release') { total++; if (e.speed > 8) fastRel++; }
  }
  for (const s of m.stats) { swings += s.swings; swingKicks += s.swingKicks; }
  goals += m.goals.length;
  swingGoals += m.goals.filter((g) => g.swing).length;
}
console.log(`${arena} ${diff}: per match swings ${(swings / n).toFixed(1)}, releases >8u/s ${((fastRel / Math.max(1, total)) * 100).toFixed(0)}%, swing kicks ${(swingKicks / n).toFixed(1)}, goals ${(goals / n).toFixed(1)} (swing goals ${(swingGoals / n).toFixed(1)})`);
