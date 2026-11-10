/**
 * Smart-swing check: from many start points and targets, tap tether once (no other input) and measure
 * where the launch goes and how long it takes to reach the target compared with running.
 *   npm run swingcheck
 */
import { ARENAS, type ArenaId } from '../src/content/arenas';
import { CHASSIS } from '../src/content/chassis';
import { TUNING } from '../src/content/tuning';
import { Rng } from '../src/game/sim/rng';
import { SmartSwing, clampTarget, planSwing } from '../src/game/sim/swing';
import { emptyCommand } from '../src/game/sim/types';
import { createRobot, createWorld, placeBall, placeRobot, stepWorld } from '../src/game/sim/world';

const HZ = TUNING.sim.hz;

export function trySwing(arenaId: ArenaId, sx: number, sz: number, tx: number, tz: number, run: 'still' | 'moving') {
  const w = createWorld(ARENAS[arenaId], [createRobot(0, 0, 0, CHASSIS.all_rounder, true)]);
  const r = w.robots[0];
  placeRobot(r, sx, sz, 0);
  placeBall(w, w.hx + 1.5, 0);
  w.goalLatch = true;
  const tgt = clampTarget(w, tx, tz);
  const c = [emptyCommand()];
  if (run === 'moving') {
    const d = Math.hypot(tgt.x - sx, tgt.z - sz) || 1;
    c[0].mx = (tgt.x - sx) / d;
    c[0].mz = (tgt.z - sz) / d;
    for (let i = 0; i < 20; i++) stepWorld(w, c);
  }
  const plan = planSwing(w, r, tgt.x, tgt.z);
  const ss = new SmartSwing();
  let released = -1;
  let errDeg = NaN;
  let reach = -1;
  const t0 = w.tick;
  for (let i = 0; i < 6 * HZ; i++) {
    ss.update(w, r, c[0], { held: i < 4, tx: tgt.x, tz: tgt.z, anchor: -1, assist: true });
    // keep running toward the target once launched, like a player would
    if (released >= 0) {
      const d = Math.hypot(tgt.x - r.x, tgt.z - r.z) || 1;
      c[0].mx = (tgt.x - r.x) / d;
      c[0].mz = (tgt.z - r.z) / d;
    }
    const was = r.tState;
    stepWorld(w, c);
    if (was === 'attached' && r.tState !== 'attached' && released < 0) {
      released = w.tick;
      const sp = Math.hypot(r.vx, r.vz);
      const dx = tgt.x - r.x, dz = tgt.z - r.z;
      const a = Math.acos(Math.max(-1, Math.min(1, (r.vx * dx + r.vz * dz) / (sp * Math.hypot(dx, dz) || 1))));
      errDeg = (a * 180) / Math.PI;
    }
    if (Math.hypot(tgt.x - r.x, tgt.z - r.z) < 1.2) {
      reach = (w.tick - t0) / HZ;
      break;
    }
  }
  const runTime = Math.hypot(tgt.x - sx, tgt.z - sz) / TUNING.robot.maxRunSpeed;
  return { plan, released: released >= 0, errDeg, reach, runTime };
}

if (!process.env.VITEST) {
  const rng = new Rng(7);
  for (const arena of ['harbor_park', 'foundry_court', 'skyline_stadium'] as ArenaId[]) {
    const A = ARENAS[arena];
    let n = 0, planned = 0, aimed = 0, faster = 0, gainSum = 0;
    const errs: number[] = [];
    for (let k = 0; k < 300; k++) {
      const hx = A.length / 2 - 1.5, hz = A.width / 2 - 1.5;
      const sx = rng.range(-hx, hx), sz = rng.range(-hz, hz);
      const tx = rng.range(-hx, hx), tz = rng.range(-hz, hz);
      if (Math.hypot(tx - sx, tz - sz) < 7) continue;
      n++;
      const res = trySwing(arena, sx, sz, tx, tz, k % 2 ? 'moving' : 'still');
      if (!res.plan) continue;
      planned++;
      if (res.released) errs.push(res.errDeg);
      if (res.released && res.errDeg < 12) aimed++;
      if (res.reach > 0 && res.reach < res.runTime) { faster++; gainSum += res.runTime - res.reach; }
    }
    errs.sort((a, b) => a - b);
    console.log(`${arena}: ${n} trips >=7u, plan found ${planned} (${((planned / n) * 100).toFixed(0)}%), launch within 12deg ${aimed}/${planned}, median error ${errs[errs.length >> 1]?.toFixed(1)}deg, beat running ${faster}/${planned} (avg gain ${(gainSum / Math.max(1, faster)).toFixed(2)}s)`);
  }
}
