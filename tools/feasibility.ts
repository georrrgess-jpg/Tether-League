/**
 * Brute-force check that the tether trial layouts are achievable with simple inputs:
 * run (direction, time) -> attach (anchor) -> hold (steer along swing) -> release -> coast.
 * Reports how many of the searched input combinations succeed (a rough "forgiveness" measure).
 */
import { ARENAS } from '../src/content/arenas';
import { CHASSIS } from '../src/content/chassis';
import { RELEASES, SWING_GATES, type Gate } from '../src/game/scenarios/trialData';
import { segmentsCrossPure } from '../src/game/scenarios/geometry';
import { emptyCommand } from '../src/game/sim/types';
import { anchorInRange, createRobot, createWorld, placeRobot, stepWorld } from '../src/game/sim/world';

const DIRS: [number, number][] = [];
for (let i = 0; i < 8; i++) DIRS.push([Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4)]);

export function searchGate(start: [number, number], gate: Gate, minSpeed = 5.9, allowAttached = false): { ok: number; tried: number; best: number } {
  const arena = ARENAS.harbor_park;
  let ok = 0;
  let tried = 0;
  let best = Infinity;
  for (const [dx, dz] of DIRS) {
    for (const runT of [0, 12, 24, 36, 48]) {
      for (let a = 0; a < arena.anchors.length; a++) {
        for (let hold = 18; hold <= 108; hold += 6) {
          const w = createWorld(arena, [createRobot(0, 0, 0, CHASSIS.all_rounder, true)]);
          const r = w.robots[0];
          placeRobot(r, start[0], start[1], 0);
          w.ball.x = -13.4;
          w.ball.z = -8.4;
          const c = [emptyCommand()];
          c[0].mx = dx;
          c[0].mz = dz;
          for (let i = 0; i < runT; i++) stepWorld(w, c);
          if (!anchorInRange(w, r, a)) continue;
          tried++;
          c[0].anchor = a;
          c[0].tether = true;
          let attached = false;
          let done = false;
          for (let i = 0; i < hold + 150 && !done; i++) {
            if (i === hold) c[0].tether = false;
            if (r.tState === 'attached') {
              attached = true;
              // steer along the current direction of travel
              const sp = Math.hypot(r.vx, r.vz) || 1;
              c[0].mx = r.vx / sp;
              c[0].mz = r.vz / sp;
            } else if (attached) {
              const sp = Math.hypot(r.vx, r.vz) || 1;
              c[0].mx = r.vx / sp;
              c[0].mz = r.vz / sp;
            }
            const px = r.x;
            const pz = r.z;
            stepWorld(w, c);
            if (attached && (allowAttached || r.tState !== 'attached') && segmentsCrossPure(px, pz, r.x, r.z, gate[0], gate[1], gate[2], gate[3])) {
              if (Math.hypot(r.vx, r.vz) >= minSpeed) {
                ok++;
                best = Math.min(best, w.tick / 60);
              }
              done = true;
            }
          }
        }
      }
    }
  }
  return { ok, tried, best };
}

if (!process.env.VITEST) {
  console.log('Clean Release lanes:');
  RELEASES.forEach((cfg, i) => {
    const r = searchGate(cfg.start, cfg.gate);
    console.log(`  #${i + 1} start ${cfg.start} -> ${r.ok}/${r.tried} input combos succeed, fastest ${r.best.toFixed(2)}s`);
  });
  console.log('Swing School gates (from the previous gate / start):');
  const starts: [number, number][][] = [[[-12, 5.2]], [[-2, -3], [0, -6], [-3, -7], [1, -1]], [[5, 1], [6, 5], [8, 7], [4, 4]]];
  SWING_GATES.forEach((g, i) => {
    for (const st of starts[i]) {
      const r = searchGate(st, g, 5.9, true);
      console.log(`  gate ${i + 1} from ${st}: ${r.ok}/${r.tried} succeed, fastest ${r.best.toFixed(2)}s from a standing start`);
    }
  });
}
