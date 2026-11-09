// Career-like matches with a passive (or bot-stand-in) player, to check for deadlocks and difficulty spread.
import { ARENAS } from '../src/content/arenas';
import { CHASSIS } from '../src/content/chassis';
import { BotDirector, CLUB_STYLE, DIFFICULTY, TENDENCY, difficultyAt } from '../src/game/ai/bot';
import { Match } from '../src/game/sim/match';
import { emptyCommand } from '../src/game/sim/types';

const level = Number(process.argv[2] ?? 0);
const standIn = process.argv[3] ?? 'passive'; // passive | rookie | club | pro
const n = Number(process.argv[4] ?? 8);
let w0 = 0, gf = 0, ga = 0, still = 0, mateGoals = 0;
for (let i = 0; i < n; i++) {
  const c = CHASSIS.all_rounder;
  const m = new Match({ arena: ARENAS.harbor_park, chassis: [c, c, c, c], human: 0, assist: 1, regulationSeconds: 180 });
  const specs = [
    { robot: 1, difficulty: difficultyAt(Math.max(1, level)), style: TENDENCY.supportive.style },
    { robot: 2, difficulty: difficultyAt(level), style: CLUB_STYLE.balanced },
    { robot: 3, difficulty: difficultyAt(level), style: CLUB_STYLE.balanced },
  ];
  if (standIn !== 'passive') specs.push({ robot: 0, difficulty: DIFFICULTY[standIn as 'rookie'], style: CLUB_STYLE.balanced });
  const bots = new BotDirector(m.world, specs, 300 + i);
  const cmds = [emptyCommand(), emptyCommand(), emptyCommand(), emptyCommand()];
  let prev = m.phase, lx = 0, lz = 0, run = 0, ticks = 0;
  while (!m.finished && ticks++ < 60 * 60 * 15) {
    if (m.phase === 'play') bots.update(cmds);
    m.step(cmds);
    if (prev !== 'countdown' && m.phase === 'countdown') bots.reset();
    prev = m.phase;
    if (m.phase === 'play') {
      const b = m.world.ball;
      if (Math.hypot(b.x - lx, b.z - lz) < 0.6) run++; else { still = Math.max(still, run); run = 0; lx = b.x; lz = b.z; }
    }
  }
  if (m.winner === 0) w0++;
  gf += m.score[0]; ga += m.score[1]; mateGoals += m.stats[1].goals;
}
console.log(`level ${level} player=${standIn}: wins ${w0}/${n}, goals for ${(gf / n).toFixed(1)} against ${(ga / n).toFixed(1)}, mate goals ${(mateGoals / n).toFixed(1)}, longest still ${(still / 60).toFixed(1)}s`);
