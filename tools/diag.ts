import { ARENAS } from '../src/content/arenas';
import { CHASSIS } from '../src/content/chassis';
import { BotDirector, CLUB_STYLE, DIFFICULTY, type DifficultyId } from '../src/game/ai/bot';
import { Match } from '../src/game/sim/match';
import { emptyCommand } from '../src/game/sim/types';
const d = (process.argv[2] ?? 'club') as DifficultyId;
const hist: Record<string, number> = {};
let goals = 0, n = 6, kickGoals = 0, touchGoals = 0;
const tsince: number[] = [];
for (let i = 0; i < n; i++) {
  const c = CHASSIS.all_rounder;
  const m = new Match({ arena: ARENAS.harbor_park, chassis: [c, c, c, c], human: -1, assist: 0, regulationSeconds: 180 });
  const bots = new BotDirector(m.world, [0, 1, 2, 3].map((r) => ({ robot: r, difficulty: DIFFICULTY[d], style: CLUB_STYLE.balanced })), 77 + i);
  const cmds = [emptyCommand(), emptyCommand(), emptyCommand(), emptyCommand()];
  let last = { x: 0, z: 0, tick: 0, kind: '', keeperDist: 0 };
  let prev = m.phase;
  while (!m.finished) {
    if (m.phase === 'play') bots.update(cmds);
    m.step(cmds);
    if (prev !== 'countdown' && m.phase === 'countdown') bots.reset();
    prev = m.phase;
    for (const e of m.world.events) {
      if (e.type === 'kick' || e.type === 'touch') {
        const r = m.world.robots[e.robot];
        const gx = r.team === 0 ? 17 : -17;
        let kd = 99;
        for (const o of m.world.robots) if (o.team !== r.team) kd = Math.min(kd, Math.hypot(o.x - gx, o.z));
        last = { x: Math.abs(gx - m.world.ball.x), z: m.world.ball.z, tick: m.world.tick, kind: e.type, keeperDist: kd };
      }
    }
    for (const e of m.events) if (e.type === 'goal') {
      goals++;
      const dist = Math.hypot(last.x, last.z);
      const bucket = dist < 4 ? '0-4' : dist < 8 ? '4-8' : dist < 12 ? '8-12' : dist < 16 ? '12-16' : '16+';
      hist[bucket + ' ' + last.kind] = (hist[bucket + ' ' + last.kind] ?? 0) + 1;
      hist['keeper>' + (last.keeperDist > 6 ? '6' : last.keeperDist > 3 ? '3' : '0')] = (hist['keeper>' + (last.keeperDist > 6 ? '6' : last.keeperDist > 3 ? '3' : '0')] ?? 0) + 1;
      if (e.record.ownGoalBy >= 0) hist['own'] = (hist['own'] ?? 0) + 1;
    }
  }
}
console.log('goals/match', goals / n, hist);
