// Prints a swing trajectory for tuning: run east, attach to a sideline anchor, steer, release.
import { ARENAS } from '../src/content/arenas';
import { CHASSIS, type ChassisId } from '../src/content/chassis';
import { emptyCommand } from '../src/game/sim/types';
import { createRobot, createWorld, pickAnchor, placeRobot, stepWorld } from '../src/game/sim/world';

const chassis = (process.argv[2] ?? 'all_rounder') as ChassisId;
const w = createWorld(ARENAS.harbor_park, [createRobot(0, 0, 0, CHASSIS[chassis], true)]);
const r = w.robots[0];
placeRobot(r, -9, 5.5, 0);
w.ball.x = 13; w.ball.z = -8;
const c = [emptyCommand()];
const log = (label: string) => console.log(`${label.padEnd(10)} t=${(w.tick / 60).toFixed(2)} pos=(${r.x.toFixed(2)}, ${r.z.toFixed(2)}) speed=${Math.hypot(r.vx, r.vz).toFixed(2)} dir=${((Math.atan2(r.vz, r.vx) * 180) / Math.PI).toFixed(0)}° ${r.tState} len=${r.tLen.toFixed(2)}`);
c[0].mx = 1;
for (let i = 0; i < 30; i++) stepWorld(w, c);
log('run');
c[0].anchor = pickAnchor(w, r, r.x + 6, r.z, -1);
console.log('anchor', w.arena.anchors[c[0].anchor]);
c[0].tether = true;
for (let i = 0; i < 114; i++) {
  stepWorld(w, c);
  if (i % 12 === 11 || r.tState !== 'attached') log('swing');
  if (r.tState !== 'attached') break;
  if (i === 54) { c[0].tether = false; }
}
for (let i = 0; i < 90; i++) { stepWorld(w, c); if (i % 15 === 14) log('carry'); }
