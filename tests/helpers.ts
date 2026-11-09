/**
 * Shared helpers for the headless rule-validation suite. Only pure simulation modules are imported here:
 * nothing in this file (or any test) may pull in the DOM-dependent ui / render / session / input code.
 */
import { ARENAS, type ArenaDef } from '../src/content/arenas';
import { CHASSIS, type ChassisDef } from '../src/content/chassis';
import { TUNING } from '../src/content/tuning';
import { emptyCommand, type Command, type Robot, type SimEvent, type World } from '../src/game/sim/types';
import { createRobot, createWorld, placeBall, placeRobot, stepWorld } from '../src/game/sim/world';

export const R = TUNING.robot.radius;
export const RB = TUNING.ball.radius;
export const HZ = TUNING.sim.hz;

export function cmd(p: Partial<Command> = {}): Command {
  return { ...emptyCommand(), ...p };
}

export const speedOf = (o: { vx: number; vz: number }): number => Math.hypot(o.vx, o.vz);

export function anchorIndex(arena: ArenaDef, id: string): number {
  const i = arena.anchors.findIndex((a) => a.id === id);
  if (i < 0) throw new Error(`anchor ${id} not found in ${arena.id}`);
  return i;
}

/** Parks the ball at the back of a net with the goal latch set, so it cannot interfere or emit events. */
export function parkBall(w: World, side: 1 | -1 = 1): void {
  placeBall(w, side * (w.hx + w.arena.goalDepth - RB - 0.01), 0);
  w.goalLatch = true;
}

export interface SoloOptions {
  arena?: ArenaDef;
  chassis?: ChassisDef;
  team?: 0 | 1;
  x?: number;
  z?: number;
  /** Which net the ball is parked in (default +x). Pass 0 to leave the ball at the centre spot. */
  park?: 1 | -1 | 0;
}

/** A world with a single robot. By default the ball is parked out of the way. */
export function soloWorld(o: SoloOptions = {}): { w: World; r: Robot } {
  const r = createRobot(0, o.team ?? 0, 0, o.chassis ?? CHASSIS.all_rounder);
  const w = createWorld(o.arena ?? ARENAS.harbor_park, [r]);
  placeRobot(r, o.x ?? 0, o.z ?? 0, 0);
  const park = o.park ?? 1;
  if (park !== 0) parkBall(w, park);
  return { w, r };
}

/** A world with no robots at all (ball physics only). */
export function ballWorld(arena: ArenaDef = ARENAS.harbor_park): World {
  return createWorld(arena, []);
}

/**
 * Steps the world `n` ticks. `cmds` is a command list, a single command (applied to robot 0, the others idle)
 * or a function producing the list for each tick. Returns every event emitted, in order.
 */
export function step(w: World, cmds: Command | Command[] | ((tick: number) => Command | Command[]), n = 1, each?: (events: SimEvent[], i: number) => void): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    const raw = typeof cmds === 'function' ? cmds(i) : cmds;
    const list = Array.isArray(raw) ? raw : [raw];
    while (list.length < w.robots.length) list.push(cmd());
    stepWorld(w, list);
    for (const e of w.events) out.push(e);
    if (each) each(w.events, i);
  }
  return out;
}

export function eventsOf<T extends SimEvent['type']>(events: SimEvent[], type: T): Extract<SimEvent, { type: T }>[] {
  return events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
}

export function finiteRobot(r: Robot): boolean {
  return [r.x, r.z, r.vx, r.vz, r.facing, r.tLen, r.tTime, r.tCd].every(Number.isFinite);
}

export function finiteBall(w: World): boolean {
  const b = w.ball;
  return [b.x, b.z, b.vx, b.vz].every(Number.isFinite);
}

/** Robot containment: rectangular limits (which also close the goal mouths for robots) plus the corner cuts. */
export function robotInside(w: World, r: Robot, eps = 1e-6): boolean {
  const lim = w.hx + w.hz - w.arena.corner - R * Math.SQRT2;
  return Math.abs(r.x) <= w.hx - R + eps && Math.abs(r.z) <= w.hz - R + eps && Math.abs(r.x) + Math.abs(r.z) <= lim + eps;
}

/**
 * Ball envelope: inside the side walls and corner cuts, and beyond an end line only inside the goal mouth
 * and never further back than the net.
 */
export function ballInside(w: World, eps = 1e-6): boolean {
  const b = w.ball;
  const ax = Math.abs(b.x);
  const az = Math.abs(b.z);
  if (az > w.hz - RB + eps) return false;
  if (ax > w.hx + w.arena.goalDepth - RB + eps) return false;
  if (ax > w.hx - RB + eps && az >= w.arena.goalWidth / 2) return false;
  if (ax <= w.hx - RB + eps && ax + az > w.hx + w.hz - w.arena.corner - RB * Math.SQRT2 + eps) return false;
  return true;
}

/** Unit radial (anchor -> robot) for the robot's current anchor. */
export function radial(w: World, r: Robot, anchor = r.tAnchor): { nx: number; nz: number; d: number } {
  const a = w.arena.anchors[anchor];
  const dx = r.x - a.x;
  const dz = r.z - a.z;
  const d = Math.hypot(dx, dz);
  return { nx: dx / d, nz: dz / d, d };
}

/** Movement input that steers along the current swing direction (maximum swing acceleration). */
export function swingSteer(w: World, r: Robot): { mx: number; mz: number } {
  const { nx, nz } = radial(w, r);
  return { mx: -nz * r.tDir, mz: nx * r.tDir };
}

export { ARENAS, CHASSIS, TUNING };
