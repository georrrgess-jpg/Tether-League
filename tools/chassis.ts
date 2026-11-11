/**
 * Chassis balance report.
 *   vite-node tools/chassis.ts drills              movement drills per chassis (deterministic, instant)
 *   vite-node tools/chassis.ts duel [matches] [A] [B] [level]
 *                                                  2v2 bot matches, team A chassis vs team B chassis, sides swapped
 *                                                  every other match. Without A/B: the full round robin.
 * A chassis is "balanced" when no pairing strays far from 50% and every chassis is best at something
 * and worst at something in the drills.
 */
import { ARENAS } from '../src/content/arenas';
import { CHASSIS, CHASSIS_ORDER, type ChassisDef, type ChassisId } from '../src/content/chassis';
import { TUNING } from '../src/content/tuning';
import { BotDirector, CLUB_STYLE, difficultyAt } from '../src/game/ai/bot';
import { Match } from '../src/game/sim/match';
import { emptyCommand } from '../src/game/sim/types';
import { createRobot, createWorld, placeBall, placeRobot, stepWorld } from '../src/game/sim/world';

const HZ = TUNING.sim.hz;

function solo(c: ChassisDef) {
  const r = createRobot(0, 0, 0, c, true);
  const w = createWorld(ARENAS.championship_dome, [r]);
  placeBall(w, w.hx - 2, w.hz - 2);
  return { w, r };
}

export interface Drills {
  /** Seconds to cover 8 units from a standing start. */
  sprint8: number;
  /** Units travelled while stopping from run speed. */
  stopDist: number;
  /** Seconds to reverse from full speed one way to full speed the other way. */
  reverse: number;
  /** Seconds to turn 90 degrees at run speed (velocity within 10 degrees of the new heading). */
  cut90: number;
  /** Speed 0.9 s into a swing from rest on a 6-unit rope. */
  swing09: number;
  /** Units covered in the 2 s after a release at 11 u/s, holding forward. */
  carry2s: number;
  /** Speed left 1.5 s after that release. */
  carrySpeed: number;
  /** Units a standing All-Rounder is pushed by this chassis running into it. */
  shove: number;
  /** Units this chassis is pushed when an All-Rounder runs into it. */
  shoved: number;
}

export function drills(id: ChassisId): Drills {
  const c = CHASSIS[id];
  const cmd = emptyCommand();
  // sprint
  let s = solo(c);
  placeRobot(s.r, -10, 0, 0);
  cmd.mx = 1;
  let t = 0;
  while (s.r.x < -2 && t < 10 * HZ) {
    stepWorld(s.w, [cmd]);
    t++;
  }
  const sprint8 = t / HZ;
  // stop
  const x0 = s.r.x;
  cmd.mx = 0;
  t = 0;
  while (Math.hypot(s.r.vx, s.r.vz) > 0.05 && t < 5 * HZ) {
    stepWorld(s.w, [cmd]);
    t++;
  }
  const stopDist = s.r.x - x0;
  // reverse
  s = solo(c);
  placeRobot(s.r, -6, 0, 0);
  cmd.mx = 1;
  for (let i = 0; i < HZ; i++) stepWorld(s.w, [cmd]);
  cmd.mx = -1;
  t = 0;
  while (s.r.vx > -TUNING.robot.maxRunSpeed * 0.98 && t < 5 * HZ) {
    stepWorld(s.w, [cmd]);
    t++;
  }
  const reverse = t / HZ;
  // 90 degree cut
  s = solo(c);
  placeRobot(s.r, -6, 0, 0);
  cmd.mx = 1;
  cmd.mz = 0;
  for (let i = 0; i < HZ; i++) stepWorld(s.w, [cmd]);
  cmd.mx = 0;
  cmd.mz = 1;
  t = 0;
  while (t < 5 * HZ) {
    stepWorld(s.w, [cmd]);
    t++;
    const ang = Math.atan2(s.r.vx, s.r.vz);
    if (Math.abs(ang) < (10 * Math.PI) / 180 && Math.hypot(s.r.vx, s.r.vz) > TUNING.robot.maxRunSpeed * 0.9) break;
  }
  const cut90 = t / HZ;
  cmd.mz = 0;
  // swing from rest: stand 6 units from the first anchor in range
  s = solo(c);
  const a = s.w.arena.anchors[0];
  const dirX = a.x > 0 ? -1 : 1;
  placeRobot(s.r, a.x + dirX * 6, a.z > 0 ? a.z - 0.5 : a.z + 0.5, 0);
  cmd.mx = 0;
  cmd.tether = true;
  cmd.anchor = 0;
  cmd.swingDir = 1;
  let swing09 = 0;
  for (let i = 0; i < Math.round(0.9 * HZ); i++) {
    stepWorld(s.w, [cmd]);
    swing09 = Math.hypot(s.r.vx, s.r.vz);
  }
  cmd.tether = false;
  cmd.anchor = -1;
  cmd.swingDir = 0;
  // release carry: start at 11 u/s as if just released
  s = solo(c);
  placeRobot(s.r, -12, 0, 0);
  s.r.vx = 11;
  s.r.carry = 0;
  cmd.mx = 1;
  let carrySpeed = 0;
  for (let i = 0; i < 2 * HZ; i++) {
    stepWorld(s.w, [cmd]);
    if (i === Math.round(1.5 * HZ)) carrySpeed = Math.hypot(s.r.vx, s.r.vz);
  }
  const carry2s = s.r.x + 12;
  // shove: this chassis runs into a standing all-rounder, and the reverse
  const bump = (runner: ChassisDef, target: ChassisDef): number => {
    const r0 = createRobot(0, 0, 0, runner, true);
    const r1 = createRobot(1, 1, 0, target);
    const w = createWorld(ARENAS.championship_dome, [r0, r1]);
    placeBall(w, w.hx - 2, w.hz - 2);
    placeRobot(r0, -6, 0, 0);
    placeRobot(r1, 0, 0, Math.PI);
    const c0 = emptyCommand();
    c0.mx = 1;
    for (let i = 0; i < 2 * HZ; i++) stepWorld(w, [c0, emptyCommand()]);
    return r1.x;
  };
  return { sprint8, stopDist, reverse, cut90, swing09, carry2s, carrySpeed, shove: bump(c, CHASSIS.all_rounder), shoved: bump(CHASSIS.all_rounder, c) };
}

export interface Duel { n: number; winsA: number; winsB: number; draws: number; gfA: number; gfB: number }

/** n matches of [A, A] against [B, B]; A plays team 0 in even matches and team 1 in odd ones. */
export function duel(a: ChassisId, b: ChassisId, n: number, level = 1, seed0 = 7000): Duel {
  const res: Duel = { n, winsA: 0, winsB: 0, draws: 0, gfA: 0, gfB: 0 };
  for (let i = 0; i < n; i++) {
    const aHome = i % 2 === 0;
    const t0 = CHASSIS[aHome ? a : b];
    const t1 = CHASSIS[aHome ? b : a];
    const m = new Match({ arena: ARENAS.harbor_park, chassis: [t0, t0, t1, t1], human: -1, assist: 0, regulationSeconds: 180 });
    const d = difficultyAt(level);
    const bots = new BotDirector(m.world, [0, 1, 2, 3].map((robot) => ({ robot, difficulty: d, style: CLUB_STYLE.balanced })), seed0 + Math.floor(i / 2));
    const cmds = [emptyCommand(), emptyCommand(), emptyCommand(), emptyCommand()];
    let prev = m.phase;
    let ticks = 0;
    while (!m.finished && ticks++ < HZ * 60 * 12) {
      if (m.phase === 'play') bots.update(cmds);
      m.step(cmds);
      if (prev !== 'countdown' && m.phase === 'countdown') bots.reset();
      prev = m.phase;
    }
    const ga = m.score[aHome ? 0 : 1];
    const gb = m.score[aHome ? 1 : 0];
    res.gfA += ga;
    res.gfB += gb;
    if (m.winner === -1) res.draws++;
    else if ((m.winner === 0) === aHome) res.winsA++;
    else res.winsB++;
  }
  return res;
}

// Try stat changes without editing content: CHASSIS_OVERRIDE='{"scout":{"braking":1.05}}'
if (process.env.CHASSIS_OVERRIDE) {
  const o = JSON.parse(process.env.CHASSIS_OVERRIDE) as Partial<Record<ChassisId, Partial<ChassisDef['mod']>>>;
  for (const id of Object.keys(o) as ChassisId[]) Object.assign(CHASSIS[id].mod, o[id]);
}

if (!process.env.VITEST && (process.argv[2] === 'drills' || process.argv[2] === 'duel')) {
  const mode = process.argv[2] ?? 'drills';
  if (mode === 'drills') {
    const rows = CHASSIS_ORDER.map((id) => ({ id, d: drills(id) }));
    const keys = Object.keys(rows[0].d) as (keyof Drills)[];
    console.log(['drill'.padEnd(12), ...rows.map((r) => r.id.padStart(12))].join(''));
    for (const k of keys) console.log([k.padEnd(12), ...rows.map((r) => r.d[k].toFixed(2).padStart(12))].join(''));
  } else {
    const n = Number(process.argv[3] ?? 20);
    const a = process.argv[4] as ChassisId | undefined;
    const b = process.argv[5] as ChassisId | undefined;
    const level = Number(process.argv[6] ?? 1);
    const pairs: [ChassisId, ChassisId][] = [];
    if (a && b) pairs.push([a, b]);
    else for (let i = 0; i < CHASSIS_ORDER.length; i++) for (let j = i + 1; j < CHASSIS_ORDER.length; j++) pairs.push([CHASSIS_ORDER[i], CHASSIS_ORDER[j]]);
    for (const [x, y] of pairs) {
      const r = duel(x, y, n, level);
      const pts = (r.winsA + r.draws / 2) / r.n;
      console.log(`${x} v ${y}: ${r.winsA}-${r.draws}-${r.winsB}  ${(pts * 100).toFixed(0)}% for ${x}  goals ${(r.gfA / r.n).toFixed(2)} : ${(r.gfB / r.n).toFixed(2)}`);
    }
  }
}
