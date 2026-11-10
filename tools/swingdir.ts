/**
 * "Does the swing start the way I meant?" From random positions, the player runs toward a target (or
 * stands still) and taps or holds swing. We record the direction of travel during the first 0.2 s on the
 * rope and count the swing as backwards when it moves away from the target.
 *   vite-node tools/swingdir.ts
 */
import { ARENAS, type ArenaId } from '../src/content/arenas';
import { CHASSIS } from '../src/content/chassis';
import { TUNING } from '../src/content/tuning';
import { Rng } from '../src/game/sim/rng';
import { SmartSwing } from '../src/game/sim/swing';
import { emptyCommand } from '../src/game/sim/types';
import { createRobot, createWorld, placeBall, placeRobot, stepWorld } from '../src/game/sim/world';

const HZ = TUNING.sim.hz;

export function swingStart(arena: ArenaId, sx: number, sz: number, tx: number, tz: number, runTicks: number, hold: boolean, assist = true) {
  const w = createWorld(ARENAS[arena], [createRobot(0, 0, 0, CHASSIS.all_rounder, true)]);
  const r = w.robots[0];
  placeRobot(r, sx, sz, 0);
  placeBall(w, w.hx + 1.5, 0);
  w.goalLatch = true;
  const c = emptyCommand();
  const ss = new SmartSwing();
  const d0 = Math.hypot(tx - sx, tz - sz) || 1;
  // Running toward the target before pressing, as a player usually is.
  c.mx = (tx - sx) / d0;
  c.mz = (tz - sz) / d0;
  for (let i = 0; i < runTicks; i++) {
    ss.update(w, r, c, { held: false, tx, tz, anchor: -1, assist });
    stepWorld(w, [c]);
  }
  let attachedTicks = 0;
  let minDot = 1;
  let sumDot = 0;
  for (let i = 0; i < 2 * HZ; i++) {
    ss.update(w, r, c, { held: hold ? true : i < 2, tx, tz, anchor: -1, assist });
    stepWorld(w, [c]);
    if (r.tState === 'attached') {
      attachedTicks++;
      if (attachedTicks <= Math.round(0.2 * HZ)) {
        const sp = Math.hypot(r.vx, r.vz) || 1;
        const dx = tx - r.x, dz = tz - r.z, dl = Math.hypot(dx, dz) || 1;
        const dot = (r.vx * dx + r.vz * dz) / (sp * dl);
        minDot = Math.min(minDot, dot);
        sumDot += dot;
      }
    } else if (attachedTicks > 0) break;
  }
  const n = Math.min(attachedTicks, Math.round(0.2 * HZ));
  return { attached: attachedTicks > 0, avgDot: n ? sumDot / n : 1, minDot };
}

if (!process.env.VITEST) {
  for (const arena of ['harbor_park', 'foundry_court', 'skyline_stadium'] as ArenaId[]) {
    const A = ARENAS[arena];
    const rng = new Rng(11);
    const rows: Record<string, { n: number; back: number; att: number }> = {};
    for (let k = 0; k < 400; k++) {
      const hx = A.length / 2 - 1.2, hz = A.width / 2 - 1.2;
      const sx = rng.range(-hx, hx), sz = rng.range(-hz, hz);
      const tx = rng.range(-hx, hx), tz = rng.range(-hz, hz);
      if (Math.hypot(tx - sx, tz - sz) < 5) continue;
      for (const [label, run, hold] of [['tap standing', 0, false], ['tap running', 25, false], ['hold running', 25, true]] as [string, number, boolean][]) {
        const res = swingStart(arena, sx, sz, tx, tz, run, hold);
        const row = (rows[label] ??= { n: 0, back: 0, att: 0 });
        row.n++;
        if (res.attached) {
          row.att++;
          if (res.avgDot < 0.2 || res.minDot < -0.2) row.back++;
        }
      }
    }
    console.log(arena + ': ' + Object.entries(rows).map(([l, r]) => `${l}: backwards/sideways ${r.back}/${r.att} (${((r.back / Math.max(1, r.att)) * 100).toFixed(0)}%)`).join(' | '));
  }
}
