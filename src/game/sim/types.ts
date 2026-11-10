import type { ArenaDef } from '../../content/arenas';
import type { ChassisDef } from '../../content/chassis';

/** Normalised per-tick input for one robot. Humans and bots produce exactly the same structure. */
export interface Command {
  /** Movement request in world x/z, length 0..1. */
  mx: number;
  mz: number;
  /** World-space aim point (kick target / anchor preference). */
  ax: number;
  az: number;
  /** Tether button held. */
  tether: boolean;
  /** Kick pressed this tick (edge). */
  kick: boolean;
  /** Kick strength 0..1 (1 = full). */
  power: number;
  /** Previewed anchor index, -1 when none is legal. */
  anchor: number;
  /** Preferred swing direction on attach (from the swing planner); 0 lets the simulation choose. */
  swingDir: 0 | 1 | -1;
  /** Pass pressed this tick (edge): a weighted, leading pass to the teammate, whatever the aim. */
  pass: boolean;
}

export function emptyCommand(): Command {
  return { mx: 0, mz: 0, ax: 0, az: 0, tether: false, kick: false, power: 1, anchor: -1, swingDir: 0, pass: false };
}

export function clearCommand(c: Command): void {
  c.mx = 0;
  c.mz = 0;
  c.tether = false;
  c.kick = false;
  c.power = 1;
  c.anchor = -1;
  c.swingDir = 0;
  c.pass = false;
}

export type TetherState = 'ready' | 'attached' | 'cooldown';

export interface Robot {
  id: number;
  team: 0 | 1;
  slot: number;
  chassis: ChassisDef;
  human: boolean;
  /** Aim assistance level: 0 off, 1 light, 2 strong. Bots always use 0. */
  assist: 0 | 1 | 2;

  x: number;
  z: number;
  vx: number;
  vz: number;
  facing: number;
  aimX: number;
  aimZ: number;
  mx: number;
  mz: number;

  tState: TetherState;
  tAnchor: number;
  tLen: number;
  tTime: number;
  tCd: number;
  tDir: 1 | -1;
  tTaut: boolean;
  tPaying: boolean;
  tHeldPrev: boolean;
  tBuffer: number;
  /** Set after an automatic release; a fresh press is required before re-attaching. */
  tConsumed: boolean;

  kickCd: number;
  kickBuffer: number;
  kickPower: number;
  /** The buffered kick is a pass. */
  kickPass: boolean;
  /** Kick-button mashing level (see TUNING.kick.mashThreshold). */
  mash: number;
  ghost: number;

  /** Seconds since release from a swing while still above run speed (used for "swing kick" detection). */
  carry: number;

  // Presentation hints (ticks of the latest events; never read by the rules).
  lastKickTick: number;
  lastKickDirX: number;
  lastKickDirZ: number;
  lastTouchTick: number;
  lastBumpTick: number;
  lastAttachTick: number;
  lastReleaseTick: number;
}

export interface Ball {
  x: number;
  z: number;
  vx: number;
  vz: number;
  lastTouchRobot: number;
  lastTouchTick: number;
  lastTouchDeliberate: boolean;
}

export type SimEvent =
  | { type: 'kick'; robot: number; speed: number; power: number; assisted: 'none' | 'goal' | 'pass'; swing: boolean; target: number; pass: boolean; rushed: boolean }
  | { type: 'touch'; robot: number; speed: number }
  | { type: 'wall'; speed: number; x: number; z: number; nx: number; nz: number }
  | { type: 'post'; speed: number; x: number; z: number }
  | { type: 'net'; speed: number }
  | { type: 'bump'; a: number; b: number; speed: number }
  | { type: 'attach'; robot: number; anchor: number }
  | { type: 'release'; robot: number; speed: number; auto: boolean }
  | { type: 'tetherFail'; robot: number }
  /** side = which goal the ball entered: 0 is the -x goal (defended by team 0), 1 is the +x goal. */
  | { type: 'goal'; side: 0 | 1 };

export interface World {
  arena: ArenaDef;
  hx: number;
  hz: number;
  robots: Robot[];
  ball: Ball;
  tick: number;
  events: SimEvent[];
  /** When false the goal mouths are closed for the ball (used by some trials and lessons). */
  goalsOpen: boolean;
  /** Set when a goal has been detected and not yet reset; prevents double scoring. */
  goalLatch: boolean;
}

export const attackDir = (team: 0 | 1): 1 | -1 => (team === 0 ? 1 : -1);
