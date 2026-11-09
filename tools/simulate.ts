/**
 * Headless bot-vs-bot matches for tuning and deadlock detection.
 *   npm run sim -- [matches] [arena] [diffA] [diffB]
 */
import { ARENAS, type ArenaId } from '../src/content/arenas';
import { CHASSIS } from '../src/content/chassis';
import { BotDirector, CLUB_STYLE, DIFFICULTY, type DifficultyId } from '../src/game/ai/bot';
import { Match } from '../src/game/sim/match';
import { emptyCommand } from '../src/game/sim/types';

const n = Number(process.argv[2] ?? 10);
const arenaId = (process.argv[3] ?? 'harbor_park') as ArenaId;
const dA = (process.argv[4] ?? 'club') as DifficultyId;
const dB = (process.argv[5] ?? 'club') as DifficultyId;

let goals = 0;
let winsA = 0;
let ot = 0;
let totalTicks = 0;
const agg = { shots: 0, saves: 0, passes: 0, interceptions: 0, kicks: 0, swings: 0, swingKicks: 0, own: 0, assists: 0 };
let longestStill = 0;
const t0 = Date.now();
for (let i = 0; i < n; i++) {
  const c = CHASSIS.all_rounder;
  const m = new Match({ arena: ARENAS[arenaId], chassis: [c, c, c, c], human: -1, assist: 0, regulationSeconds: 180 });
  const bots = new BotDirector(
    m.world,
    [
      { robot: 0, difficulty: DIFFICULTY[dA], style: CLUB_STYLE.balanced },
      { robot: 1, difficulty: DIFFICULTY[dA], style: CLUB_STYLE.balanced },
      { robot: 2, difficulty: DIFFICULTY[dB], style: CLUB_STYLE.balanced },
      { robot: 3, difficulty: DIFFICULTY[dB], style: CLUB_STYLE.balanced },
    ],
    1000 + i,
  );
  const cmds = [emptyCommand(), emptyCommand(), emptyCommand(), emptyCommand()];
  let ticks = 0;
  let still = 0;
  let lx = 0;
  let lz = 0;
  let prevPhase = m.phase;
  while (!m.finished && ticks < 60 * 60 * 20) {
    if (m.phase === 'play') bots.update(cmds);
    m.step(cmds);
    if (prevPhase !== 'countdown' && m.phase === 'countdown') bots.reset();
    prevPhase = m.phase;
    ticks++;
    if (m.phase === 'play') {
      const b = m.world.ball;
      if (Math.hypot(b.x - lx, b.z - lz) < 0.6) still++;
      else {
        longestStill = Math.max(longestStill, still);
        still = 0;
        lx = b.x;
        lz = b.z;
      }
    }
    for (const r of m.world.robots) if (!Number.isFinite(r.x + r.z + r.vx + r.vz)) throw new Error('NaN robot');
    if (!Number.isFinite(m.world.ball.x + m.world.ball.vx)) throw new Error('NaN ball');
  }
  totalTicks += ticks;
  goals += m.score[0] + m.score[1];
  if (m.winner === 0) winsA++;
  if (m.overtime) ot++;
  for (const s of m.stats) {
    agg.shots += s.shots; agg.saves += s.saves; agg.passes += s.passes; agg.interceptions += s.interceptions;
    agg.kicks += s.kicks; agg.swings += s.swings; agg.swingKicks += s.swingKicks; agg.own += s.ownGoals; agg.assists += s.assists;
  }
  console.log(`#${i} ${m.score[0]}-${m.score[1]}${m.overtime ? ' OT' : ''} ${(ticks / 60).toFixed(0)}s finished=${m.finished}`);
}
const per = (v: number) => (v / n).toFixed(1);
console.log(`\n${arenaId} ${dA} vs ${dB}: goals/match ${per(goals)}, A wins ${winsA}/${n}, overtime ${ot}, avg length ${(totalTicks / 60 / n).toFixed(0)}s`);
console.log(`per match: shots ${per(agg.shots)} saves ${per(agg.saves)} passes ${per(agg.passes)} intercepts ${per(agg.interceptions)} kicks ${per(agg.kicks)} swings ${per(agg.swings)} swingKicks ${per(agg.swingKicks)} assists ${per(agg.assists)} ownGoals ${per(agg.own)}`);
console.log(`longest ball-still streak ${(longestStill / 60).toFixed(1)}s; sim speed ${(totalTicks / ((Date.now() - t0) / 1000) / 60).toFixed(0)}x realtime`);
