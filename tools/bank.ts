/**
 * Bank Shot validation: which kick directions/speeds from a spawn hit a wall and then score?
 *   vite-node tools/bank.ts           -> check the shipped layouts with running-kick speeds
 *   vite-node tools/bank.ts search    -> survey candidate spawns
 */
import { ARENAS } from '../src/content/arenas';
import { TUNING } from '../src/content/tuning';
import { BANKS } from '../src/game/scenarios/trialData';
import { createWorld, placeBall, stepWorld } from '../src/game/sim/world';

const arena = ARENAS.foundry_court;
const K = TUNING.kick;
const RUN_KICK = K.baseSpeed + K.forwardVelocityFactor * TUNING.robot.maxRunSpeed;

function survey(bx: number, bz: number, wall: 1 | -1, lo: number, hi: number): { xs: number[]; n: number } {
  const xs: number[] = [];
  let n = 0;
  for (let sp = lo; sp <= hi + 1e-6; sp += 0.5) {
    for (let x = bx - 2; x <= 13; x += 0.2) {
      const w = createWorld(arena, []);
      const a = Math.atan2(wall * w.hz - bz, x - bx);
      placeBall(w, bx, bz, Math.cos(a) * sp, Math.sin(a) * sp);
      let hitX = NaN;
      let goal = false;
      for (let i = 0; i < 360 && !goal; i++) {
        stepWorld(w, []);
        for (const e of w.events) {
          if (e.type === 'wall') hitX = Math.sign(e.z) === wall && Math.abs(e.nz) > 0.9 ? e.x : NaN;
          if (e.type === 'goal' && e.side === 1) goal = true;
        }
      }
      if (goal && !Number.isNaN(hitX)) {
        xs.push(hitX);
        n++;
      }
    }
  }
  return { xs, n };
}

if (process.argv.includes('search')) {
  for (const wall of [-1, 1] as const)
    for (const bx of [1, 3, 5, 7])
      for (const bz of [-4, -2, 0, 2, 4]) {
        const r = survey(bx, bz, wall, 8.2, RUN_KICK);
        if (r.n) console.log(`ball (${bx}, ${bz}) wall ${wall}: ${r.n} solutions, wall contact x ${Math.min(...r.xs).toFixed(1)}..${Math.max(...r.xs).toFixed(1)}`);
      }
} else {
  console.log(`standing kick ${K.baseSpeed}, running kick ${RUN_KICK.toFixed(1)}`);
  BANKS.forEach((cfg, i) => {
    const r = survey(cfg.ball[0], cfg.ball[1], cfg.wall, 8.2, RUN_KICK);
    const inSeg = r.xs.filter((x) => x >= cfg.seg[0] - 0.3 && x <= cfg.seg[1] + 0.3).length;
    console.log(`bank ${i + 1}: ${inSeg} of ${r.n} scoring bank kicks (standing to running speed) touch the marked section; contact x ${r.n ? Math.min(...r.xs).toFixed(1) + '..' + Math.max(...r.xs).toFixed(1) : 'n/a'}`);
  });
}
