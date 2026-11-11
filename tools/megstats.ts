/** Nutmeg frequency in bot matches: vite-node tools/megstats.ts [matches] [level] */
import { ARENAS } from '../src/content/arenas';
import { CHASSIS } from '../src/content/chassis';
import { BotDirector, CLUB_STYLE, difficultyAt } from '../src/game/ai/bot';
import { Match } from '../src/game/sim/match';
import { emptyCommand } from '../src/game/sim/types';

const n = Number(process.argv[2] ?? 30);
const level = Number(process.argv[3] ?? 1);
let tries = 0;
let ok = 0;
let knocks = 0;
let goals = 0;
let sumChance = 0;
for (let i = 0; i < n; i++) {
  const c = CHASSIS.all_rounder;
  const m = new Match({ arena: ARENAS.harbor_park, chassis: [c, c, c, c], human: -1, assist: 0, regulationSeconds: 180 });
  const d = difficultyAt(level);
  const bots = new BotDirector(m.world, [0, 1, 2, 3].map((robot) => ({ robot, difficulty: d, style: CLUB_STYLE.balanced })), 4000 + i);
  const cmds = [emptyCommand(), emptyCommand(), emptyCommand(), emptyCommand()];
  let prev = m.phase;
  let t = 0;
  while (!m.finished && t++ < 60 * 60 * 12) {
    if (m.phase === 'play') bots.update(cmds);
    m.step(cmds);
    for (const e of m.world.events) {
      if (e.type === 'meg') {
        tries++;
        sumChance += e.chance;
        if (e.success) ok++;
      } else if (e.type === 'kick' && e.knock) knocks++;
    }
    if (prev !== 'countdown' && m.phase === 'countdown') bots.reset();
    prev = m.phase;
  }
  goals += m.score[0] + m.score[1];
}
console.log(`level ${level}: ${n} matches, goals ${(goals / n).toFixed(2)}/match, meg attempts ${(tries / n).toFixed(2)}/match, success ${tries ? Math.round((ok / tries) * 100) : 0}% (avg chance ${tries ? (sumChance / tries).toFixed(2) : '-'}), knock-ons ${(knocks / n).toFixed(2)}/match`);
