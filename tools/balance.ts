/**
 * Balance report: full matches with different stand-ins for the player (robot 0), against bots at a
 * difficulty level. Reports win rate, goals for/against and own goals per match.
 *   vite-node tools/balance.ts [matches] [policy] [level]
 * policy: spam (runs at the ball and presses kick every tick, aiming at the goal), mash (same at 8 presses/s),
 *         passive, rookie, club, pro (a bot of that tier plays the player's robot).
 */
import { ARENAS, type ArenaId } from '../src/content/arenas';
import { CHASSIS } from '../src/content/chassis';
import { TUNING } from '../src/content/tuning';
import { BotDirector, CLUB_STYLE, DIFFICULTY, TENDENCY, difficultyAt, type DifficultyId } from '../src/game/ai/bot';
import { mateLevel } from '../src/game/setup';
import { Match } from '../src/game/sim/match';
import { emptyCommand, type Command, type World } from '../src/game/sim/types';
import { megWindow } from '../src/game/sim/world';

export type Policy = 'spam' | 'mash' | 'chase' | 'chase0' | 'passive' | 'clubmeg' | DifficultyId;

/** Spam shooter: straight at the ball, kick every chance, aiming at the middle of the opponent goal. */
function spam(w: World, c: Command, hz = 60): void {
  const r = w.robots[0];
  const b = w.ball;
  const dx = b.x - r.x;
  const dz = b.z - r.z;
  const d = Math.hypot(dx, dz) || 1;
  c.mx = dx / d;
  c.mz = dz / d;
  c.ax = w.hx;
  c.az = 0;
  // hz = button presses per second (60 = every tick; a fast human manages about 8)
  c.kick = hz >= 60 || w.tick % Math.round(60 / hz) === 0;
  c.power = 1;
  c.tether = false;
  c.anchor = -1;
}

/** Keyboard-style chaser: runs at the ball and kicks the way it is moving (no cursor aim). */
function chase(w: World, c: Command): void {
  const r = w.robots[0];
  const b = w.ball;
  const dx = b.x - r.x;
  const dz = b.z - r.z;
  const d = Math.hypot(dx, dz) || 1;
  c.mx = dx / d;
  c.mz = dz / d;
  c.ax = b.x + (dx / d) * 8;
  c.az = b.z + (dz / d) * 8;
  c.kick = w.tick % 8 === 0;
  c.power = 1;
  c.tether = false;
  c.anchor = -1;
}

export interface BalanceResult {
  n: number;
  wins: number;
  gf: number;
  ga: number;
  ownFor: number; // own goals conceded BY the opponents (helped us)
  ownAgainst: number; // own goals by our team
  playerGoals: number;
  draws: number;
}

export function runBalance(n: number, policy: Policy, level: number, arena: ArenaId = 'harbor_park', seed0 = 500): BalanceResult {
  const res: BalanceResult = { n, wins: 0, gf: 0, ga: 0, ownFor: 0, ownAgainst: 0, playerGoals: 0, draws: 0 };
  for (let i = 0; i < n; i++) {
    const c = CHASSIS.all_rounder;
    const m = new Match({ arena: ARENAS[arena], chassis: [c, c, c, c], human: 0, assist: policy === 'chase0' ? 0 : 1, regulationSeconds: 180 });
    const specs = [
      { robot: 1, difficulty: difficultyAt(mateLevel(level)), style: TENDENCY.supportive.style },
      { robot: 2, difficulty: difficultyAt(level), style: CLUB_STYLE.balanced },
      { robot: 3, difficulty: difficultyAt(level), style: CLUB_STYLE.balanced },
    ];
    // clubmeg: a Club bot that also nutmegs at every decent opening (how strong is meg spam?).
    if (!['spam', 'mash', 'chase', 'chase0', 'passive'].includes(policy)) specs.push({ robot: 0, difficulty: DIFFICULTY[policy === 'clubmeg' ? 'club' : (policy as DifficultyId)], style: CLUB_STYLE.balanced });
    const bots = new BotDirector(m.world, specs, seed0 + i);
    const cmds = [emptyCommand(), emptyCommand(), emptyCommand(), emptyCommand()];
    let prev = m.phase;
    let ticks = 0;
    let mercy = 0;
    while (!m.finished && ticks++ < 60 * 60 * 12) {
      if (m.phase === 'play') {
        bots.update(cmds);
        if (policy === 'spam') spam(m.world, cmds[0]);
        else if (policy === 'mash') spam(m.world, cmds[0], 8);
        else if (policy === 'chase' || policy === 'chase0') chase(m.world, cmds[0]);
        else if (policy === 'clubmeg') {
          const me = m.world.robots[0];
          const mw = me.megCd <= 0 ? megWindow(m.world, me) : null;
          if (mw && mw.chance >= 0.6) {
            cmds[0].meg = true;
            cmds[0].kick = false;
            cmds[0].pass = false;
          }
        }
      }
      m.step(cmds);
      // Same mercy rule as a real match (src/game/modes/matchMode.ts).
      const lead = m.score[1] - m.score[0];
      const ease = lead >= 4 ? 1 : lead >= 3 ? 0.6 : 0;
      if (ease !== mercy) {
        mercy = ease;
        bots.setTeamEase(1, ease);
      }
      if (prev !== 'countdown' && m.phase === 'countdown') bots.reset();
      prev = m.phase;
    }
    if (m.winner === 0) res.wins++;
    if (m.winner === -1) res.draws++;
    res.gf += m.score[0];
    res.ga += m.score[1];
    for (const g of m.goals) {
      if (g.ownGoalBy >= 0) {
        if (g.team === 0) res.ownFor++;
        else res.ownAgainst++;
      }
      if (g.scorer === 0) res.playerGoals++;
    }
  }
  return res;
}

export function fmt(label: string, r: BalanceResult): string {
  const p = (v: number) => (v / r.n).toFixed(2);
  return `${label.padEnd(26)} win ${((r.wins / r.n) * 100).toFixed(0).padStart(3)}%  for ${p(r.gf)}  against ${p(r.ga)}  player goals ${p(r.playerGoals)}  own goals: ours ${p(r.ownAgainst)} theirs ${p(r.ownFor)}`;
}

if (!process.env.VITEST) {
  const n = Number(process.argv[2] ?? 10);
  const policies = (process.argv[3] ?? 'spam,passive,rookie,club,pro').split(',') as Policy[];
  const levels = (process.argv[4] ?? '0,1,1.9').split(',').map(Number);
  for (const level of levels) for (const p of policies) console.log(fmt(`L${level} ${p}`, runBalance(n, p, level)));
  void TUNING;
}
