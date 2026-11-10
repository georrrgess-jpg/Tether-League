// Plays Swing School and Clean Release headlessly with smart-swing taps (aim just beyond each gate).
import { ARENAS } from '../src/content/arenas';
import { CHASSIS } from '../src/content/chassis';
import { TUNING } from '../src/content/tuning';
import { segmentsCrossPure } from '../src/game/scenarios/geometry';
import { RELEASES, SWING_GATES, type Gate } from '../src/game/scenarios/trialData';
import { SmartSwing } from '../src/game/sim/swing';
import { emptyCommand } from '../src/game/sim/types';
import { createRobot, createWorld, placeBall, placeRobot, stepWorld } from '../src/game/sim/world';

const HZ = TUNING.sim.hz;
const CARRY = 5.9;
function beyond(g: Gate, from: { x: number; z: number }, d = 3): [number, number] {
  const cx = (g[0] + g[2]) / 2, cz = (g[1] + g[3]) / 2;
  const dx = cx - from.x, dz = cz - from.z, l = Math.hypot(dx, dz) || 1;
  return [cx + (dx / l) * d, cz + (dz / l) * d];
}
function world(sx: number, sz: number) {
  const w = createWorld(ARENAS.harbor_park, [createRobot(0, 0, 0, CHASSIS.all_rounder, true)]);
  placeRobot(w.robots[0], sx, sz, 0);
  placeBall(w, -13.4, -8.4);
  return w;
}
// Swing School: tap toward the next gate whenever ready; run toward it otherwise.
{
  const w = world(-12, 5.2);
  const r = w.robots[0];
  const ss = new SmartSwing();
  const c = emptyCommand();
  let gate = 0, t = 0, presses = 0, holdT = 0;
  while (gate < 3 && t < 40 * HZ) {
    const g = SWING_GATES[gate];
    const [tx, tz] = beyond(g, r, 3);
    const d = Math.hypot(tx - r.x, tz - r.z) || 1;
    c.mx = (tx - r.x) / d; c.mz = (tz - r.z) / d;
    const want = r.tState === 'ready' && !ss.auto && holdT <= 0;
    if (want) { holdT = 2; presses++; }
    ss.update(w, r, c, { held: holdT > 0, tx, tz, anchor: -1, assist: true });
    holdT--;
    const px = r.x, pz = r.z;
    stepWorld(w, [c]);
    t++;
    if (segmentsCrossPure(px, pz, r.x, r.z, g[0], g[1], g[2], g[3]) && Math.hypot(r.vx, r.vz) >= CARRY) gate++;
  }
  console.log(`Swing School with smart taps: ${gate}/3 gates in ${(t / HZ).toFixed(2)}s (${presses} taps)`);
}
// Clean Release: one tap per attempt, aimed beyond the lane.
{
  let ok = 0;
  RELEASES.forEach((cfg) => {
    const w = world(cfg.start[0], cfg.start[1]);
    const r = w.robots[0];
    const ss = new SmartSwing();
    const c = emptyCommand();
    const [tx, tz] = beyond(cfg.gate, r, 3);
    let res = false;
    let launched = false;
    for (let i = 0; i < 8 * HZ; i++) {
      ss.update(w, r, c, { held: i < 2, tx, tz, anchor: -1, assist: true });
      const px = r.x, pz = r.z, was = r.tState;
      stepWorld(w, [c]);
      if (was === 'attached' && r.tState !== 'attached') launched = true;
      const g = cfg.gate;
      if (segmentsCrossPure(px, pz, r.x, r.z, g[0], g[1], g[2], g[3])) { res = launched && r.tState !== 'attached' && Math.hypot(r.vx, r.vz) >= CARRY; break; }
      if (launched && Math.hypot(r.vx, r.vz) < TUNING.robot.maxRunSpeed + 0.15) break;
    }
    if (res) ok++;
  });
  console.log(`Clean Release with one smart tap each: ${ok}/8`);
}
