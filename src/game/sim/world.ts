import type { ArenaDef } from '../../content/arenas';
import type { ChassisDef } from '../../content/chassis';
import { DT, TUNING } from '../../content/tuning';
import { attackDir, type Ball, type Command, type Robot, type World } from './types';

const SQRT2 = Math.SQRT2;
const R = TUNING.robot.radius;
const RB = TUNING.ball.radius;

/**
 * Fixed-step planar simulation.
 *
 * Update order per tick (see stepWorld):
 *   1. per robot: timers -> tether state machine -> movement / swing control -> kick attempt
 *   2. substeps: integrate robots (rope + walls) -> robot/robot -> integrate ball -> robot/ball
 *      -> ball walls / posts / net -> squeeze resolution -> goal crossing test
 *   3. facing update, tick++
 * Rendering never feeds back into this state.
 */

export function createRobot(id: number, team: 0 | 1, slot: number, chassis: ChassisDef, human = false): Robot {
  return {
    id,
    team,
    slot,
    chassis,
    human,
    assist: 0,
    x: 0,
    z: 0,
    vx: 0,
    vz: 0,
    facing: team === 0 ? 0 : Math.PI,
    aimX: 0,
    aimZ: 0,
    mx: 0,
    mz: 0,
    tState: 'ready',
    tAnchor: -1,
    tLen: 0,
    tTime: 0,
    tCd: 0,
    tDir: 1,
    tTaut: false,
    tPaying: false,
    tHeldPrev: false,
    tBuffer: 0,
    tConsumed: false,
    kickCd: 0,
    kickBuffer: 0,
    kickPower: 1,
    kickPass: false,
    mash: 0,
    ghost: 0,
    carry: 99,
    lastKickTick: -999,
    lastKickDirX: 1,
    lastKickDirZ: 0,
    lastTouchTick: -999,
    lastBumpTick: -999,
    lastAttachTick: -999,
    lastReleaseTick: -999,
  };
}

export function createWorld(arena: ArenaDef, robots: Robot[]): World {
  return {
    arena,
    hx: arena.length / 2,
    hz: arena.width / 2,
    robots,
    ball: { x: 0, z: 0, vx: 0, vz: 0, lastTouchRobot: -1, lastTouchTick: -999, lastTouchDeliberate: false, passBy: -1, passTick: -999 },
    tick: 0,
    events: [],
    goalsOpen: true,
    goalLatch: false,
  };
}

/** Clears motion, tether and input state for one robot and places it. Never grants velocity. */
export function placeRobot(r: Robot, x: number, z: number, facing: number): void {
  r.x = x;
  r.z = z;
  r.vx = 0;
  r.vz = 0;
  r.facing = facing;
  r.mx = 0;
  r.mz = 0;
  r.tState = 'ready';
  r.tAnchor = -1;
  r.tTime = 0;
  r.tCd = 0;
  r.tTaut = false;
  r.tPaying = false;
  r.tHeldPrev = false;
  r.tBuffer = 0;
  r.tConsumed = false;
  r.kickCd = 0;
  r.kickBuffer = 0;
  r.ghost = 0;
  r.carry = 99;
}

export function placeBall(w: World, x: number, z: number, vx = 0, vz = 0): void {
  const b = w.ball;
  b.x = x;
  b.z = z;
  b.vx = vx;
  b.vz = vz;
  b.lastTouchRobot = -1;
  b.lastTouchTick = -999;
  b.lastTouchDeliberate = false;
  b.passBy = -1;
  b.passTick = -999;
  w.goalLatch = false;
}

export function anchorDistance(w: World, r: Robot, anchor: number): number {
  const a = w.arena.anchors[anchor];
  return Math.hypot(r.x - a.x, r.z - a.z);
}

export function anchorInRange(w: World, r: Robot, anchor: number): boolean {
  if (!Number.isInteger(anchor) || anchor < 0 || anchor >= w.arena.anchors.length) return false;
  return anchorDistance(w, r, anchor) <= TUNING.tether.acquisitionRange;
}

/** Detach without any impulse. Used by release, auto-release, pause and resets. */
export function detach(w: World, r: Robot, auto: boolean, emit = true): void {
  if (r.tState !== 'attached') return;
  r.tState = 'cooldown';
  r.tCd = TUNING.tether.cooldownSeconds;
  r.tTaut = false;
  r.tPaying = false;
  r.tConsumed = auto;
  r.carry = 0;
  r.lastReleaseTick = w.tick;
  if (emit) w.events.push({ type: 'release', robot: r.id, speed: Math.hypot(r.vx, r.vz), auto });
}

function tryAttach(w: World, r: Robot, anchor: number, want: 0 | 1 | -1 = 0): boolean {
  if (!anchorInRange(w, r, anchor)) return false;
  const T = TUNING.tether;
  const a = w.arena.anchors[anchor];
  const dx = r.x - a.x;
  const dz = r.z - a.z;
  const d = Math.max(1e-4, Math.hypot(dx, dz));
  const nx = dx / d;
  const nz = dz / d;
  const tx = -nz;
  const tz = nx;
  const vt = r.vx * tx + r.vz * tz;
  const vr = r.vx * nx + r.vz * nz;

  let dir: 1 | -1;
  const mt = r.mx * tx + r.mz * tz;
  const at = (r.aimX - r.x) * tx + (r.aimZ - r.z) * tz;
  // A planned direction always wins: the swing starts the way the player (or bot) meant, even if current
  // momentum points the other way round the anchor.
  if (want !== 0) dir = want;
  else if (Math.abs(vt) > 0.8) dir = vt > 0 ? 1 : -1;
  else if (Math.abs(mt) > 0.25) dir = mt > 0 ? 1 : -1;
  else if (Math.abs(at) > 0.5) dir = at > 0 ? 1 : -1;
  else dir = tx * attackDir(r.team) >= 0 ? 1 : -1;

  r.tState = 'attached';
  r.tAnchor = anchor;
  r.tLen = Math.min(T.maxLength, Math.max(T.minLength, d));
  r.tTime = 0;
  r.tDir = dir;
  r.tTaut = false;
  r.tPaying = false;
  r.tBuffer = 0;
  r.lastAttachTick = w.tick;

  // Guarantee a minimum swing speed in the chosen direction without touching inward motion.
  if (vt * dir < T.startSpeed) {
    const nvt = dir * Math.max(T.startSpeed, Math.abs(vt) * 0.6);
    const keepR = Math.min(0, vr);
    r.vx = tx * nvt + nx * keepR;
    r.vz = tz * nvt + nz * keepR;
  }
  w.events.push({ type: 'attach', robot: r.id, anchor });
  return true;
}

function moveToward(cur: number, target: number, maxDelta: number): number {
  if (cur < target) return Math.min(target, cur + maxDelta);
  return Math.max(target, cur - maxDelta);
}

function controlRobot(w: World, r: Robot, c: Command): void {
  const T = TUNING.tether;
  const RT = TUNING.robot;
  const mod = r.chassis.mod;

  let mx = c.mx;
  let mz = c.mz;
  const ml = Math.hypot(mx, mz);
  if (ml > 1) {
    mx /= ml;
    mz /= ml;
  }
  r.mx = mx;
  r.mz = mz;
  r.aimX = c.ax;
  r.aimZ = c.az;

  if (r.kickCd > 0) r.kickCd -= DT;
  if (r.ghost > 0) r.ghost -= DT;
  r.carry += DT;
  r.mash = Math.max(0, r.mash - TUNING.kick.mashDecay * DT);
  if (c.kick || c.pass) r.mash += 1;
  if (c.pass) {
    r.kickBuffer = TUNING.kick.passBufferSeconds;
    r.kickPower = 1;
    r.kickPass = true;
  } else if (c.kick) {
    r.kickBuffer = TUNING.kick.inputBufferSeconds;
    r.kickPower = Math.max(0.2, Math.min(1, c.power));
    r.kickPass = false;
  } else if (r.kickBuffer > 0) r.kickBuffer -= DT;

  // --- tether state machine: READY -> ATTACHED -> COOLDOWN -> READY ---
  const pressed = c.tether && !r.tHeldPrev;
  if (!c.tether) r.tConsumed = false;
  if (r.tState === 'cooldown') {
    r.tCd -= DT;
    if (r.tCd <= 0) r.tState = 'ready';
  }
  if (pressed) {
    r.tBuffer = Math.max(T.pressBuffer, r.tState === 'cooldown' ? r.tCd + 0.08 : 0);
    if (r.tState === 'ready' && !anchorInRange(w, r, c.anchor)) {
      w.events.push({ type: 'tetherFail', robot: r.id });
    }
  }
  if (r.tState === 'attached') {
    r.tTime += DT;
    if (!c.tether) detach(w, r, false);
    else if (r.tTime >= T.maxHoldSeconds) detach(w, r, true);
  } else if (r.tState === 'ready' && c.tether && r.tBuffer > 0 && !r.tConsumed) {
    tryAttach(w, r, c.anchor, c.swingDir);
  }
  if (r.tBuffer > 0) r.tBuffer -= DT;
  if (!c.tether) r.tBuffer = 0;
  r.tHeldPrev = c.tether;

  // --- movement ---
  let swinging = false;
  if (r.tState === 'attached') {
    const a = w.arena.anchors[r.tAnchor];
    const dx = r.x - a.x;
    const dz = r.z - a.z;
    const d = Math.max(1e-4, Math.hypot(dx, dz));
    if (d >= r.tLen - 0.06) {
      swinging = true;
      const nx = dx / d;
      const nz = dz / d;
      const tx = -nz;
      const tz = nx;
      let vt = r.vx * tx + r.vz * tz;
      if (Math.abs(vt) > 0.6) r.tDir = vt > 0 ? 1 : -1;
      // The swing always drives itself forward; movement input never brakes or reverses it.
      const maxSpeed = T.maxSpeed;
      vt = Math.max(-maxSpeed, Math.min(maxSpeed, vt + r.tDir * T.swingAccel * mod.swing * DT));
      // Reeling in conserves angular momentum, so the swing speeds up as the rope shortens.
      const newLen = Math.max(T.minLength, r.tLen - T.reelUnitsPerSecond * DT);
      if (newLen < r.tLen) vt = Math.sign(vt) * Math.min(maxSpeed, (Math.abs(vt) * r.tLen) / newLen);
      r.tLen = newLen;
      r.vx = tx * vt;
      r.vz = tz * vt;
      r.tPaying = false;
    } else {
      r.tPaying = false;
    }
  }

  if (!swinging) {
    const maxRun = RT.maxRunSpeed;
    const speed = Math.hypot(r.vx, r.vz);
    if (speed <= maxRun * 1.03) {
      const tvx = mx * maxRun;
      const tvz = mz * maxRun;
      const opposing = ml < 0.05 || mx * r.vx + mz * r.vz < 0;
      const rate = (opposing ? RT.braking * mod.braking : RT.acceleration * mod.acceleration) * DT;
      const ddx = tvx - r.vx;
      const ddz = tvz - r.vz;
      const dl = Math.hypot(ddx, ddz);
      if (dl <= rate) {
        r.vx = tvx;
        r.vz = tvz;
      } else {
        r.vx += (ddx / dl) * rate;
        r.vz += (ddz / dl) * rate;
      }
    } else {
      // Carrying release momentum: limited steering, gradual decay toward run speed.
      const ux = r.vx / speed;
      const uz = r.vz / speed;
      const along = mx * ux + mz * uz;
      const px = mx - along * ux;
      const pz = mz - along * uz;
      let nvx = r.vx + px * RT.steerAccel * mod.steer * DT;
      let nvz = r.vz + pz * RT.steerAccel * mod.steer * DT;
      let decel: number;
      const launching = r.carry < RT.launchWindow;
      if (along < -0.25) decel = RT.braking * mod.braking * 0.85;
      else if (launching) decel = RT.launchDecel * mod.releaseDrag;
      else if (ml < 0.05) decel = RT.coastDecel;
      else decel = RT.carryDecel * mod.releaseDrag;
      const floor = along < -0.25 || (ml < 0.05 && !launching) ? 0 : maxRun;
      const ns = Math.max(floor, speed - decel * DT);
      const nl = Math.max(1e-6, Math.hypot(nvx, nvz));
      nvx = (nvx / nl) * ns;
      nvz = (nvz / nl) * ns;
      r.vx = nvx;
      r.vz = nvz;
    }
  }

  // --- deliberate kick ---
  if (r.kickBuffer > 0 && r.kickCd <= 0) tryKick(w, r);
}

/** Angle difference a-b wrapped to [-PI, PI]. */
function angDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** The teammate a pass goes to (2v2: the only one), or null when there is none. */
export function passTarget(w: World, r: Robot): Robot | null {
  let best: Robot | null = null;
  let bd = Infinity;
  for (const m of w.robots) {
    if (m.team !== r.team || m.id === r.id) continue;
    const d = Math.hypot(m.x - r.x, m.z - r.z);
    if (d < bd) {
      bd = d;
      best = m;
    }
  }
  return best;
}

/** True when no opponent stands within `width` of the segment (x0,z0)-(x1,z1), ignoring its ends. */
function laneClear(w: World, team: 0 | 1, x0: number, z0: number, x1: number, z1: number, width: number): boolean {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const l2 = dx * dx + dz * dz;
  if (l2 < 1e-6) return true;
  for (const o of w.robots) {
    if (o.team === team) continue;
    const t = ((o.x - x0) * dx + (o.z - z0) * dz) / l2;
    if (t < 0.08 || t > 0.95) continue;
    const px = x0 + dx * t;
    const pz = z0 + dz * t;
    if (Math.hypot(o.x - px, o.z - pz) < width) return false;
  }
  return true;
}

/**
 * Wall pass: when the straight lane to (px, pz) is blocked, find a clear bank off a side wall.
 * Returns the wall contact point and the total path length, or null to pass straight.
 */
export function bankPass(w: World, team: 0 | 1, bx: number, bz: number, px: number, pz: number): { x: number; z: number; len: number } | null {
  const width = TUNING.kick.bankLaneWidth;
  if (laneClear(w, team, bx, bz, px, pz, width)) return null;
  const lim = w.hx + w.hz - w.arena.corner - RB * SQRT2;
  let best: { x: number; z: number; len: number } | null = null;
  for (const s of [-1, 1]) {
    const wz = s * (w.hz - RB);
    const mz = 2 * wz - pz; // mirror the target across the wall line
    const t = (wz - bz) / (mz - bz);
    if (!(t > 0.15 && t < 0.85)) continue;
    const cx = bx + (px - bx) * t;
    if (Math.abs(cx) + Math.abs(wz) > lim - 0.6) continue; // would hit a corner cut
    if (!laneClear(w, team, bx, bz, cx, wz, width) || !laneClear(w, team, cx, wz, px, pz, width)) continue;
    const len = Math.hypot(cx - bx, wz - bz) + Math.hypot(px - cx, pz - wz);
    // Only routes a full-pace pass can still deliver (pace = passBase + passPerUnit * len + bankExtra).
    const K = TUNING.kick;
    if (K.passBase + K.passPerUnit * len + K.bankExtra > K.speedCap) continue;
    if (!best || len < best.len) best = { x: cx, z: wz, len };
  }
  return best;
}

function tryKick(w: World, r: Robot): void {
  const K = TUNING.kick;
  const b = w.ball;
  const dx = b.x - r.x;
  const dz = b.z - r.z;
  const d = Math.hypot(dx, dz);
  if (d > K.range || w.goalLatch) return;

  let ax = r.aimX - b.x;
  let az = r.aimZ - b.z;
  let al = Math.hypot(ax, az);
  if (al < 0.25) {
    ax = Math.cos(r.facing);
    az = Math.sin(r.facing);
    al = 1;
  }
  ax /= al;
  az /= al;

  let assisted: 'none' | 'goal' | 'pass' = 'none';
  let target = -1;
  let speedLimit = Infinity;
  let banked = false;
  const mate = r.kickPass ? passTarget(w, r) : null;
  if (mate) {
    // Pass button: aim at where the teammate will be, weighted so it can be collected.
    const px = mate.x + mate.vx * Math.min(K.passLeadMax, Math.hypot(mate.x - b.x, mate.z - b.z) / 14);
    const pz = mate.z + mate.vz * Math.min(K.passLeadMax, Math.hypot(mate.x - b.x, mate.z - b.z) / 14);
    const pl = Math.hypot(px - b.x, pz - b.z) || 1;
    ax = (px - b.x) / pl;
    az = (pz - b.z) / pl;
    assisted = 'pass';
    target = mate.id;
    speedLimit = K.passBase + K.passPerUnit * pl;
    const bank = bankPass(w, r.team, b.x, b.z, px, pz);
    if (bank) {
      const cl = Math.hypot(bank.x - b.x, bank.z - b.z) || 1;
      ax = (bank.x - b.x) / cl;
      az = (bank.z - b.z) / cl;
      // The longer route needs more pace than a standing kick, so a bank is struck firmly.
      speedLimit = K.passBase + K.passPerUnit * bank.len + K.bankExtra;
      banked = true;
    }
  } else if (r.assist > 0) {
    const maxA = TUNING.assist.maxAngle[r.assist];
    const aim = Math.atan2(az, ax);
    let best = Infinity;
    let bestAng = aim;
    // Goal mouth: clamp the aim inside the posts when it is close.
    const gx = attackDir(r.team) * w.hx;
    if ((gx - b.x) * attackDir(r.team) > 0.5 && w.goalsOpen) {
      const inset = w.arena.goalWidth / 2 - 0.6;
      const a1 = Math.atan2(-inset - b.z, gx - b.x);
      const a2 = Math.atan2(inset - b.z, gx - b.x);
      const lo = angDiff(a1, aim);
      const hi = angDiff(a2, aim);
      let corr: number;
      if (lo * hi <= 0) corr = 0;
      else corr = Math.abs(lo) < Math.abs(hi) ? lo : hi;
      if (Math.abs(corr) <= maxA) {
        best = Math.abs(corr);
        bestAng = aim + corr;
        assisted = 'goal';
      }
    }
    // Teammate: lead pass.
    for (const m of w.robots) {
      if (m.team !== r.team || m.id === r.id) continue;
      const md = Math.hypot(m.x - b.x, m.z - b.z);
      if (md < 2.6) continue;
      const lead = Math.min(0.6, md / 14);
      const px = m.x + m.vx * lead;
      const pz = m.z + m.vz * lead;
      const pa = Math.atan2(pz - b.z, px - b.x);
      const corr = angDiff(pa, aim);
      if (Math.abs(corr) <= maxA * 1.25 && Math.abs(corr) < best - 0.02) {
        best = Math.abs(corr);
        bestAng = aim + corr;
        assisted = 'pass';
        target = m.id;
        speedLimit = K.passBase + K.passPerUnit * md;
      }
    }
    if (assisted !== 'pass') speedLimit = Infinity;
    ax = Math.cos(bestAng);
    az = Math.sin(bestAng);
  }

  // Own-goal guard (players with aim assist on): a kick that would roll into our own goal mouth becomes a
  // clearance toward the nearer wing. With assist off an own goal is still possible.
  if (r.assist > 0 && !mate && w.goalsOpen) {
    const own = -attackDir(r.team);
    const ownX = own * w.hx;
    if (ax * own > 0.15) {
      const t = (ownX - b.x) / ax;
      const zAt = b.z + az * t;
      if (t > 0 && Math.abs(ownX - b.x) < 14 && Math.abs(zAt) < w.arena.goalWidth / 2 + 1) {
        const side = Math.sign(b.z || az || 1);
        const cx = -own * 0.45;
        const cz = side * 0.9;
        const cl = Math.hypot(cx, cz);
        ax = cx / cl;
        az = cz / cl;
        assisted = 'none';
      }
    }
  }
  // Mashing the kick button scuffs the kick: deterministic (seeded by tick and robot) aim error and less power.
  const rushed = !mate && r.mash > K.mashThreshold;
  if (rushed) {
    const h = Math.sin((w.tick + 1) * 12.9898 + r.id * 78.233) * 43758.5453;
    const err = ((h - Math.floor(h)) * 2 - 1) * K.rushedError;
    const ca = Math.cos(err);
    const sa = Math.sin(err);
    const nx = ax * ca - az * sa;
    az = ax * sa + az * ca;
    ax = nx;
  }
  const along = r.vx * ax + r.vz * az;
  const fwd = Math.max(0, along);
  let speed = Math.min(K.speedCap, K.baseSpeed + K.forwardVelocityFactor * fwd);
  // You cannot blast the ball back against your own run.
  const rs = Math.hypot(r.vx, r.vz);
  if (rs > 3 && along < -0.3 * rs) speed *= K.backwardPower;
  if (rushed) speed *= K.rushedPower;
  // First-time finish off a teammate's pass: a little extra pace (not for passes, rushed kicks or clearances back).
  const passer = b.passBy >= 0 ? w.robots[b.passBy] : undefined;
  const oneTouch =
    !mate && !rushed && assisted !== 'pass' && !!passer && passer.team === r.team && passer.id !== r.id &&
    w.tick - b.passTick <= K.oneTouchWindow * TUNING.sim.hz && ax * attackDir(r.team) > 0.2;
  if (oneTouch) speed = Math.min(K.speedCap * K.oneTouchBonus, speed * K.oneTouchBonus);
  speed = (banked ? speedLimit : Math.min(speed, speedLimit)) * r.kickPower;
  b.vx = ax * speed;
  b.vz = az * speed;
  b.lastTouchRobot = r.id;
  b.lastTouchTick = w.tick;
  b.lastTouchDeliberate = true;
  const wasPass = !!mate;
  if (wasPass || assisted === 'pass') {
    b.passBy = r.id;
    b.passTick = w.tick;
  } else {
    b.passBy = -1;
  }
  r.kickCd = rushed ? K.rushedCooldown : K.cooldownSeconds;
  r.kickBuffer = 0;
  r.kickPass = false;
  r.ghost = K.ghostSeconds;
  r.lastKickTick = w.tick;
  r.lastKickDirX = ax;
  r.lastKickDirZ = az;
  const swing = r.tState === 'attached' || (r.carry < 1.2 && Math.hypot(r.vx, r.vz) > TUNING.robot.maxRunSpeed * 1.15);
  w.events.push({
    type: 'kick',
    robot: r.id,
    speed,
    power: (speed - K.baseSpeed * 0.6) / (K.speedCap - K.baseSpeed * 0.6),
    assisted,
    swing,
    target,
    pass: wasPass,
    rushed,
    bank: banked,
    oneTouch,
  });
}

function ropeConstraint(w: World, r: Robot): void {
  const T = TUNING.tether;
  const a = w.arena.anchors[r.tAnchor];
  const dx = r.x - a.x;
  const dz = r.z - a.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-4) return;
  if (d < r.tLen && !r.tPaying) {
    // Ratchet: slack is taken up immediately so the swing starts at the closest radius reached.
    r.tLen = Math.max(T.minLength, d);
  }
  if (d > r.tLen) {
    const nx = dx / d;
    const nz = dz / d;
    r.x = a.x + nx * r.tLen;
    r.z = a.z + nz * r.tLen;
    const vr = r.vx * nx + r.vz * nz;
    if (vr > 0) {
      const tx = -nz;
      const tz = nx;
      const vt = r.vx * tx + r.vz * tz;
      const speed = Math.hypot(r.vx, r.vz);
      const sgn = Math.abs(vt) > 0.3 ? (vt > 0 ? 1 : -1) : r.tDir;
      // Taut rope: rotate velocity (lossless). First snap: convert part of the outward speed.
      const mag = r.tTaut ? speed : Math.abs(vt) + T.snapConvert * (speed - Math.abs(vt));
      const nvt = sgn * Math.min(T.maxSpeed, mag);
      r.vx = tx * nvt;
      r.vz = tz * nvt;
    }
    r.tTaut = true;
  } else {
    r.tTaut = d >= r.tLen - 0.06;
  }
}

function robotWalls(w: World, r: Robot): void {
  const lx = w.hx - R;
  const lz = w.hz - R;
  if (r.x > lx) {
    r.x = lx;
    if (r.vx > 0) r.vx = 0;
  } else if (r.x < -lx) {
    r.x = -lx;
    if (r.vx < 0) r.vx = 0;
  }
  if (r.z > lz) {
    r.z = lz;
    if (r.vz > 0) r.vz = 0;
  } else if (r.z < -lz) {
    r.z = -lz;
    if (r.vz < 0) r.vz = 0;
  }
  const lim = w.hx + w.hz - w.arena.corner - R * SQRT2;
  const s = Math.abs(r.x) + Math.abs(r.z);
  if (s > lim) {
    const sx = r.x >= 0 ? 1 : -1;
    const sz = r.z >= 0 ? 1 : -1;
    const half = (s - lim) / 2;
    r.x -= sx * half;
    r.z -= sz * half;
    const vn = (r.vx * sx + r.vz * sz) / SQRT2;
    if (vn > 0) {
      r.vx -= (vn * sx) / SQRT2;
      r.vz -= (vn * sz) / SQRT2;
    }
  }
}

/**
 * Ball boundary: side walls, corner cuts, end walls with goal mouths, posts and the goal box.
 * `ev` is null for predictions so they stay side-effect free.
 */
/** Outgoing normal speed for a wall impact with incoming normal speed vn (> 0): lively walls. */
function wallOut(vn: number): number {
  const B = TUNING.ball;
  return vn * B.wallRestitution + (vn > B.wallBoostMin ? B.wallBoost : 0);
}

/** Keeps a boosted rebound under the ball's top speed. */
function capBall(b: { vx: number; vz: number }): void {
  const s = Math.hypot(b.vx, b.vz);
  const m = TUNING.ball.maxSpeed;
  if (s > m) {
    b.vx *= m / s;
    b.vz *= m / s;
  }
}

export function ballWalls(w: World, b: { x: number; z: number; vx: number; vz: number }, ev: World['events'] | null): void {
  const lz = w.hz - RB;
  if (b.z > lz) {
    b.z = lz;
    if (b.vz > 0) {
      if (ev && b.vz > 1) ev.push({ type: 'wall', speed: b.vz, x: b.x, z: w.hz, nx: 0, nz: -1 });
      b.vz = -wallOut(b.vz);
      capBall(b);
    }
  } else if (b.z < -lz) {
    b.z = -lz;
    if (b.vz < 0) {
      if (ev && b.vz < -1) ev.push({ type: 'wall', speed: -b.vz, x: b.x, z: -w.hz, nx: 0, nz: 1 });
      b.vz = wallOut(-b.vz);
      capBall(b);
    }
  }
  const lim = w.hx + w.hz - w.arena.corner - RB * SQRT2;
  const s = Math.abs(b.x) + Math.abs(b.z);
  if (s > lim) {
    const sx = b.x >= 0 ? 1 : -1;
    const sz = b.z >= 0 ? 1 : -1;
    const half = (s - lim) / 2;
    b.x -= sx * half;
    b.z -= sz * half;
    const vn = (b.vx * sx + b.vz * sz) / SQRT2;
    if (vn > 0) {
      if (ev && vn > 1) ev.push({ type: 'wall', speed: vn, x: b.x, z: b.z, nx: -sx / SQRT2, nz: -sz / SQRT2 });
      const k = vn + wallOut(vn);
      b.vx -= (k * sx) / SQRT2;
      b.vz -= (k * sz) / SQRT2;
      capBall(b);
    }
  }

  const gh = w.arena.goalWidth / 2;
  const side = b.x >= 0 ? 1 : -1;
  const sxp = side * b.x; // distance along the attacking direction of this end
  if (sxp > w.hx - RB) {
    const inMouth = w.goalsOpen && Math.abs(b.z) < gh;
    if (!inMouth) {
      b.x = side * (w.hx - RB);
      const vn = b.vx * side;
      if (vn > 0) {
        if (ev && vn > 1) ev.push({ type: 'wall', speed: vn, x: side * w.hx, z: b.z, nx: -side, nz: 0 });
        b.vx = -side * wallOut(vn);
        capBall(b);
      }
    } else {
      // Posts are the end points of the wall on either side of the mouth.
      for (let k = -1; k <= 1; k += 2) {
        const px = side * w.hx;
        const pz = k * gh;
        const dx = b.x - px;
        const dz = b.z - pz;
        const d = Math.hypot(dx, dz);
        if (d < RB && d > 1e-6) {
          const nx = dx / d;
          const nz = dz / d;
          b.x = px + nx * RB;
          b.z = pz + nz * RB;
          const vn = b.vx * nx + b.vz * nz;
          if (vn < 0) {
            if (ev && vn < -1) ev.push({ type: 'post', speed: -vn, x: px, z: pz });
            b.vx -= (1 + TUNING.ball.postRestitution) * vn * nx;
            b.vz -= (1 + TUNING.ball.postRestitution) * vn * nz;
          }
        }
      }
      if (side * b.x > w.hx) {
        // Inside the goal box: soft net.
        const ne = TUNING.ball.netRestitution;
        const zl = gh - RB;
        if (b.z > zl) {
          b.z = zl;
          if (b.vz > 0) b.vz = -b.vz * ne;
        } else if (b.z < -zl) {
          b.z = -zl;
          if (b.vz < 0) b.vz = -b.vz * ne;
        }
        const back = w.hx + w.arena.goalDepth - RB;
        if (side * b.x > back) {
          b.x = side * back;
          const vn = b.vx * side;
          if (vn > 0) {
            if (ev && vn > 1.5) ev.push({ type: 'net', speed: vn });
            b.vx = -b.vx * ne;
            b.vz *= 0.5;
          }
        }
      }
    }
  }
}

function integrateBall(b: { x: number; z: number; vx: number; vz: number }, h: number): void {
  const B = TUNING.ball;
  let sp = Math.hypot(b.vx, b.vz);
  if (sp > 1e-6) {
    let ns = sp * Math.exp(-B.drag * h) - B.rolling * h;
    if (ns < 0) ns = 0;
    if (ns > B.maxSpeed) ns = B.maxSpeed;
    const k = ns / sp;
    b.vx *= k;
    b.vz *= k;
    sp = ns;
  }
  b.x += b.vx * h;
  b.z += b.vz * h;
}

function collideRobots(w: World, a: Robot, b: Robot): void {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const d = Math.hypot(dx, dz);
  const min = R * 2;
  if (d >= min || d < 1e-6) return;
  const nx = dx / d;
  const nz = dz / d;
  const ma = a.chassis.mod.mass;
  const mb = b.chassis.mod.mass;
  const pen = min - d;
  const tot = ma + mb;
  a.x -= nx * pen * (mb / tot);
  a.z -= nz * pen * (mb / tot);
  b.x += nx * pen * (ma / tot);
  b.z += nz * pen * (ma / tot);
  const rel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
  if (rel < 0) {
    const j = (-(1 + TUNING.robot.bumpRestitution) * rel) / (1 / ma + 1 / mb);
    a.vx -= (j / ma) * nx;
    a.vz -= (j / ma) * nz;
    b.vx += (j / mb) * nx;
    b.vz += (j / mb) * nz;
    if (-rel > 2 && w.tick - Math.max(a.lastBumpTick, b.lastBumpTick) > 10) {
      a.lastBumpTick = w.tick;
      b.lastBumpTick = w.tick;
      w.events.push({ type: 'bump', a: a.id, b: b.id, speed: -rel });
    }
  }
}

function collideRobotBall(w: World, r: Robot, pinned: boolean): void {
  if (r.ghost > 0) return;
  const b = w.ball;
  const dx = b.x - r.x;
  const dz = b.z - r.z;
  const d = Math.hypot(dx, dz);
  const min = R + RB;
  if (d >= min || d < 1e-6) return;
  const nx = dx / d;
  const nz = dz / d;
  const pen = min - d;
  if (pinned) {
    // Ball is held by a wall: the robot yields.
    r.x -= nx * pen;
    r.z -= nz * pen;
    const vn = r.vx * nx + r.vz * nz;
    if (vn > 0) {
      r.vx -= vn * nx;
      r.vz -= vn * nz;
    }
    return;
  }
  // The robot acts heavier than its bump mass against the ball so dribbling does not stall it.
  const mr = r.chassis.mod.mass * 3;
  const mb = TUNING.ball.mass;
  const tot = mr + mb;
  r.x -= nx * pen * (mb / tot);
  r.z -= nz * pen * (mb / tot);
  b.x += nx * pen * (mr / tot);
  b.z += nz * pen * (mr / tot);
  const rel = (b.vx - r.vx) * nx + (b.vz - r.vz) * nz;
  if (rel < 0) {
    const j = (-(1 + TUNING.ball.robotRestitution) * rel) / (1 / mr + 1 / mb);
    r.vx -= (j / mr) * nx;
    r.vz -= (j / mr) * nz;
    b.vx += (j / mb) * nx;
    b.vz += (j / mb) * nz;
    const gap = w.tick - r.lastTouchTick;
    if (gap > 8 || b.lastTouchRobot !== r.id) {
      w.events.push({ type: 'touch', robot: r.id, speed: -rel });
      b.lastTouchRobot = r.id;
      b.lastTouchTick = w.tick;
      b.lastTouchDeliberate = false;
      if (b.passBy >= 0 && w.robots[b.passBy] && w.robots[b.passBy].team !== r.team) b.passBy = -1;
    }
    r.lastTouchTick = w.tick;
  }
}

export function stepWorld(w: World, cmds: Command[]): void {
  w.events.length = 0;
  const robots = w.robots;
  for (let i = 0; i < robots.length; i++) controlRobot(w, robots[i], cmds[i]);

  const n = TUNING.sim.substeps;
  const h = DT / n;
  const b = w.ball;
  for (let s = 0; s < n; s++) {
    for (let i = 0; i < robots.length; i++) {
      const r = robots[i];
      r.x += r.vx * h;
      r.z += r.vz * h;
      if (r.tState === 'attached') ropeConstraint(w, r);
      robotWalls(w, r);
    }
    for (let i = 0; i < robots.length; i++) for (let j = i + 1; j < robots.length; j++) collideRobots(w, robots[i], robots[j]);
    integrateBall(b, h);
    for (let i = 0; i < robots.length; i++) collideRobotBall(w, robots[i], false);
    ballWalls(w, b, w.events);
    for (let i = 0; i < robots.length; i++) {
      collideRobotBall(w, robots[i], true);
      robotWalls(w, robots[i]);
    }
    // Swept goal test: the ball moves at most maxSpeed*h (< its radius) per substep, so the fully-crossed
    // condition cannot be skipped between samples.
    if (w.goalsOpen && !w.goalLatch && Math.abs(b.x) >= w.hx + RB && Math.abs(b.z) < w.arena.goalWidth / 2) {
      w.goalLatch = true;
      w.events.push({ type: 'goal', side: b.x > 0 ? 1 : 0 });
    }
  }

  for (let i = 0; i < robots.length; i++) {
    const r = robots[i];
    let sp = Math.hypot(r.vx, r.vz);
    // Hard cap for robots (bumps included); the ball has its own, higher limit.
    if (sp > TUNING.tether.maxSpeed) {
      const k = TUNING.tether.maxSpeed / sp;
      r.vx *= k;
      r.vz *= k;
      sp = TUNING.tether.maxSpeed;
    }
    if (sp > 0.5) {
      const target = Math.atan2(r.vz, r.vx);
      r.facing += angDiff(target, r.facing) * Math.min(1, 14 * DT);
    }
  }
  w.tick++;
}

/**
 * Side-effect free ball prediction with wall rebounds (robots ignored).
 * Fills `out` with positions every `stepSeconds` and returns the number written.
 */
export function predictBall(w: World, out: Float32Array, steps: number, stepSeconds: number): number {
  const tmp = { x: w.ball.x, z: w.ball.z, vx: w.ball.vx, vz: w.ball.vz };
  const sub = Math.max(1, Math.round(stepSeconds / (DT * 2)));
  const h = stepSeconds / sub;
  for (let i = 0; i < steps; i++) {
    for (let k = 0; k < sub; k++) {
      integrateBall(tmp, h);
      ballWalls(w, tmp, null);
    }
    out[i * 2] = tmp.x;
    out[i * 2 + 1] = tmp.z;
  }
  return steps;
}

/** Preview/acquisition scoring: exactly one candidate, with hysteresis toward the previous one. */
export function pickAnchor(w: World, r: Robot, aimX: number, aimZ: number, prev: number): number {
  const anchors = w.arena.anchors;
  const range = TUNING.tether.acquisitionRange;
  const adx = aimX - r.x;
  const adz = aimZ - r.z;
  const al = Math.hypot(adx, adz);
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    const dx = a.x - r.x;
    const dz = a.z - r.z;
    const d = Math.hypot(dx, dz);
    if (d > range) continue;
    let score = (d / range) * 0.55;
    if (al > 0.4 && d > 1e-3) {
      const cos = (dx * adx + dz * adz) / (d * al);
      score += Math.acos(Math.max(-1, Math.min(1, cos))) * 2.2;
      const cd = Math.hypot(aimX - a.x, aimZ - a.z);
      if (cd < 3) score -= (3 - cd) * 0.7;
    }
    if (i === prev) score -= 0.28;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}
