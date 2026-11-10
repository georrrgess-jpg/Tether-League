import { DT, TUNING } from '../../content/tuning';
import type { Command, Robot, World } from './types';
import { anchorInRange } from './world';

/**
 * Swing planning shared by bots and the player's smart swing.
 *
 * A swing around anchor C with rope length r launches the robot along the circle's tangent. For a target T
 * outside the circle there are exactly two tangent points, one per swing direction, so "swing toward T"
 * means: pick an anchor and direction, swing until the tangent points at T, then let go.
 *
 * Everything here is pure decision logic: it only produces Commands, so bots and humans keep identical physics.
 */
export interface SwingPlan {
  anchor: number;
  dir: 1 | -1;
  /** Anchor position and rope radius used for the plan. */
  cx: number;
  cz: number;
  radius: number;
  /** Robot angle around the anchor now, and the arc (radians, positive) swung before release. */
  startAngle: number;
  arc: number;
  releaseX: number;
  releaseZ: number;
  /** Unit launch direction at release. */
  lx: number;
  lz: number;
  releaseSpeed: number;
  swingTime: number;
  /** Estimated time to reach the target by swinging, and by running. */
  totalTime: number;
  runTime: number;
  /** runTime - totalTime: positive when the swing is the faster route. */
  gain: number;
  tx: number;
  tz: number;
}

const SAMPLE = 1 / 30;
const MIN_ARC = 0.12;
const MAX_ARC = 2.9;

/** Seconds and final speed to swing a distance `dist` starting at speed v0 (constant radius approximation). */
function swingRun(v0: number, dist: number, accel: number): { t: number; v: number } {
  const vmax = TUNING.tether.maxSpeed;
  let v = Math.min(vmax, v0);
  let s = 0;
  let t = 0;
  while (s < dist && t < 4) {
    v = Math.min(vmax, v + accel * SAMPLE);
    s += v * SAMPLE;
    t += SAMPLE;
  }
  return { t, v };
}

/** Seconds to travel `dist` in a straight line after a launch at speed v0 (launch window, then carry, then run). */
export function launchTravel(v0: number, dist: number, releaseDrag = 1): number {
  const RT = TUNING.robot;
  let v = Math.max(v0, RT.maxRunSpeed);
  let s = 0;
  let t = 0;
  while (s < dist && t < 6) {
    const decel = (t < RT.launchWindow ? RT.launchDecel : RT.carryDecel) * releaseDrag;
    v = Math.max(RT.maxRunSpeed, v - decel * SAMPLE);
    s += v * SAMPLE;
    t += SAMPLE;
  }
  return t;
}

/** Distance a launch at speed v0 carries before the robot is back to running speed. */
export function launchCarry(v0: number, releaseDrag = 1): number {
  const RT = TUNING.robot;
  let v = v0;
  let s = 0;
  let t = 0;
  while (v > RT.maxRunSpeed && t < 6) {
    const decel = (t < RT.launchWindow ? RT.launchDecel : RT.carryDecel) * releaseDrag;
    v -= decel * SAMPLE;
    s += Math.max(v, 0) * SAMPLE;
    t += SAMPLE;
  }
  return s;
}

function insideField(w: World, x: number, z: number, margin: number): boolean {
  const lx = w.hx - margin;
  const lz = w.hz - margin;
  if (Math.abs(x) > lx || Math.abs(z) > lz) return false;
  return Math.abs(x) + Math.abs(z) <= w.hx + w.hz - w.arena.corner - margin * Math.SQRT2;
}

/** Keeps a target inside the playing area (a cursor over the stands still means "that way"). */
export function clampTarget(w: World, x: number, z: number): { x: number; z: number } {
  const m = TUNING.robot.radius + 0.3;
  let cx = Math.max(-w.hx + m, Math.min(w.hx - m, x));
  let cz = Math.max(-w.hz + m, Math.min(w.hz - m, z));
  const lim = w.hx + w.hz - w.arena.corner - m * Math.SQRT2;
  const s = Math.abs(cx) + Math.abs(cz);
  if (s > lim) {
    const k = (s - lim) / 2;
    cx -= Math.sign(cx) * k;
    cz -= Math.sign(cz) * k;
  }
  return { x: cx, z: cz };
}

export interface PlanOptions {
  /** Only consider this anchor. */
  anchor?: number;
  /** Reject swings that would keep the robot on the rope longer than this (seconds). */
  maxSwingTime?: number;
  /** Largest arc (radians) swung before release. */
  maxArc?: number;
  /** Only swings whose first motion heads toward the target (dot of start direction and target direction). */
  minStartDot?: number;
}

/** Best swing toward (tx, tz), or null when no anchor in range can launch the robot that way. */
export function planSwing(w: World, r: Robot, tx: number, tz: number, opts: PlanOptions = {}): SwingPlan | null {
  const T = TUNING.tether;
  const RT = TUNING.robot;
  const mod = r.chassis.mod;
  const anchors = w.arena.anchors;
  const runDist = Math.hypot(tx - r.x, tz - r.z);
  const runTime = runDist / RT.maxRunSpeed + 0.12;
  const margin = RT.radius + 0.08;
  let best: SwingPlan | null = null;

  for (let i = 0; i < anchors.length; i++) {
    if (opts.anchor !== undefined && opts.anchor !== i) continue;
    if (!anchorInRange(w, r, i)) continue;
    const c = anchors[i];
    const d = Math.hypot(r.x - c.x, r.z - c.z);
    const rr = Math.max(T.minLength, Math.min(T.maxLength, d));
    const dT = Math.hypot(tx - c.x, tz - c.z);
    if (dT <= rr + 0.4) continue; // target inside the swing circle: no tangent reaches it
    const phiT = Math.atan2(tz - c.z, tx - c.x);
    const alpha = Math.acos(rr / dT);
    const th0 = Math.atan2(r.z - c.z, r.x - c.x);
    const nx = (r.x - c.x) / (d || 1);
    const nz = (r.z - c.z) / (d || 1);
    const vt = r.vx * -nz + r.vz * nx;
    const tdx = tx - r.x;
    const tdz = tz - r.z;
    const tdl = Math.hypot(tdx, tdz) || 1;
    for (const s of [1, -1] as const) {
      if (vt * s < -3) continue; // already swinging hard the other way
      // Direction the robot starts moving on this swing: never backwards when the caller asks for forward starts.
      if (opts.minStartDot !== undefined && ((-nz * s) * tdx + (nx * s) * tdz) / tdl < opts.minStartDot) continue;
      const thr = phiT - s * alpha;
      let arc = s * (thr - th0);
      arc = ((arc % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      if (arc < MIN_ARC || arc > (opts.maxArc ?? MAX_ARC)) continue;
      // The arc must stay on the pitch (the rope never drags a robot through a wall).
      let ok = true;
      for (let k = 1; k <= 6; k++) {
        const th = th0 + s * arc * (k / 6);
        if (!insideField(w, c.x + Math.cos(th) * rr, c.z + Math.sin(th) * rr, margin)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      const v0 = Math.max(T.startSpeed, Math.abs(vt) * (vt * s > 0 ? 1 : 0), Math.hypot(r.vx, r.vz) * T.snapConvert);
      const sw = swingRun(v0, arc * rr, T.swingAccel * mod.swing);
      if (sw.t > Math.min(T.maxHoldSeconds - 0.05, opts.maxSwingTime ?? Infinity)) continue;
      const rx = c.x + Math.cos(thr) * rr;
      const rz = c.z + Math.sin(thr) * rr;
      const lx = -Math.sin(thr) * s;
      const lz = Math.cos(thr) * s;
      const launchDist = Math.sqrt(Math.max(0, dT * dT - rr * rr));
      const totalTime = sw.t + launchTravel(sw.v, launchDist, mod.releaseDrag);
      if (!best || totalTime < best.totalTime) {
        best = {
          anchor: i, dir: s, cx: c.x, cz: c.z, radius: rr, startAngle: th0, arc,
          releaseX: rx, releaseZ: rz, lx, lz, releaseSpeed: sw.v, swingTime: sw.t,
          totalTime, runTime, gain: runTime - totalTime, tx, tz,
        };
      }
    }
  }
  return best;
}

/**
 * Fallback when no planned launch reaches the target: the anchor and direction whose swing starts most
 * directly toward the target (so pressing swing never sends the robot backwards), or null if every
 * swing in range would start sideways or backwards.
 */
export function forwardSwing(w: World, r: Robot, tx: number, tz: number, only = -1): { anchor: number; dir: 1 | -1 } | null {
  const T = TUNING.tether;
  const margin = TUNING.robot.radius + 0.08;
  const tdx = tx - r.x;
  const tdz = tz - r.z;
  const tdl = Math.hypot(tdx, tdz) || 1;
  let best: { anchor: number; dir: 1 | -1 } | null = null;
  let bestScore = -Infinity;
  const anchors = w.arena.anchors;
  for (let i = 0; i < anchors.length; i++) {
    if (only >= 0 && i !== only) continue;
    if (!anchorInRange(w, r, i)) continue;
    const c = anchors[i];
    const d = Math.hypot(r.x - c.x, r.z - c.z) || 1;
    const rr = Math.max(T.minLength, Math.min(T.maxLength, d));
    const nx = (r.x - c.x) / d;
    const nz = (r.z - c.z) / d;
    const th0 = Math.atan2(nz, nx);
    for (const s of [1, -1] as const) {
      const dot = ((-nz * s) * tdx + (nx * s) * tdz) / tdl;
      if (dot < (only >= 0 ? -1 : 0.35)) continue;
      // The first part of the arc must stay on the pitch.
      let ok = true;
      for (let k = 1; k <= 3; k++) {
        const th = th0 + s * (0.8 / Math.max(1, rr / 3)) * (k / 3);
        if (!insideField(w, c.x + Math.cos(th) * rr, c.z + Math.sin(th) * rr, margin)) ok = false;
      }
      if (!ok) continue;
      // Prefer starting straight at the target, then longer ropes (gentler, faster arcs).
      const score = dot * 2 + Math.min(rr, 8) * 0.06;
      if (score > bestScore) {
        bestScore = score;
        best = { anchor: i, dir: s };
      }
    }
  }
  return best;
}

/**
 * Release decision while attached: let go once the swing's direction of travel points at the target
 * (or has just swung past it), or when the target is almost reached.
 */
export function releaseNow(r: Robot, tx: number, tz: number): boolean {
  if (r.tState !== 'attached') return false;
  const sp = Math.hypot(r.vx, r.vz);
  if (sp < 1) return false;
  const dx = tx - r.x;
  const dz = tz - r.z;
  const dl = Math.hypot(dx, dz);
  if (dl < 1.6) return true;
  const cos = (r.vx * dx + r.vz * dz) / (sp * dl);
  const crs = (r.vx * dz - r.vz * dx) / (sp * dl);
  // One tick of rotation lead so the release lands on the line rather than just after it.
  const lead = (sp / Math.max(1, r.tLen)) * DT * 0.5;
  return cos > 0.35 && crs * r.tDir <= lead;
}

/** How closely the current direction of travel points at the target (1 = exactly). */
export function launchAlignment(r: Robot, tx: number, tz: number): number {
  const sp = Math.hypot(r.vx, r.vz);
  const dx = tx - r.x;
  const dz = tz - r.z;
  const dl = Math.hypot(dx, dz);
  if (sp < 0.5 || dl < 0.5) return 0;
  return (r.vx * dx + r.vz * dz) / (sp * dl);
}

export interface SwingInput {
  /** Tether button currently held. */
  held: boolean;
  /** Where the player wants to go. */
  tx: number;
  tz: number;
  /** Anchor picked explicitly (Q/E cycling), or -1. */
  anchor: number;
  /** Smart swing on: a tap swings and lets go automatically. */
  assist: boolean;
}

/** A press shorter than this is a tap (smart swing); longer is a manual hold. */
export const TAP_SECONDS = 0.2;
/** Automatic swings stay short so the player is never carried round a long loop in a tight moment. */
export const AUTO_SWING_MAX = 1.05;
/** Player swings: start toward the target and never wrap round more than this (radians). */
const PLAYER_PLAN: PlanOptions = { maxSwingTime: AUTO_SWING_MAX, maxArc: 2.2, minStartDot: 0.1 };

/**
 * The player's tether controller. A tap launches toward the target automatically; a hold is fully manual
 * (release when you like). Either way the anchor and swing direction come from the planner, so pressing
 * tether always does something sensible.
 */
export class SmartSwing {
  plan: SwingPlan | null = null;
  /** Forward-starting swing used when no planned launch reaches the target. */
  fallback: { anchor: number; dir: 1 | -1 } | null = null;
  private dir: 0 | 1 | -1 = 0;
  /** Active automatic swing (target locked when the button was pressed). */
  auto: { tx: number; tz: number } | null = null;
  /** True while a manual swing points at the target: the "let go now" cue. */
  cue = false;
  /** Anchor the HUD should highlight. */
  preview = -1;
  private prevHeld = false;
  private pressTick = -9999;
  private pending = false;
  private planTick = -9999;
  /** The button press that cancelled an automatic swing is ignored until it is released. */
  private swallow = false;

  reset(): void {
    this.plan = null;
    this.fallback = null;
    this.dir = 0;
    this.auto = null;
    this.cue = false;
    this.preview = -1;
    this.prevHeld = false;
    this.pending = false;
    this.swallow = false;
  }

  update(w: World, r: Robot, c: Command, inp: SwingInput): void {
    const target = clampTarget(w, inp.tx, inp.tz);
    const pressed = inp.held && !this.prevHeld;
    const releasedBtn = !inp.held && this.prevHeld;
    this.prevHeld = inp.held;

    if (r.tState !== 'attached') {
      // Re-plan a few times a second; the plan is only a preview until the button goes down.
      if (w.tick - this.planTick >= 3 || pressed) {
        this.planTick = w.tick;
        this.plan = planSwing(w, r, target.x, target.z, inp.anchor >= 0 ? { ...PLAYER_PLAN, anchor: inp.anchor } : PLAYER_PLAN);
        this.fallback = this.plan ? null : forwardSwing(w, r, target.x, target.z, inp.anchor);
      }
      // No forward option in reach: highlight nothing, so a press gives the 'no anchor' cue instead of a backwards swing.
      this.preview = inp.anchor >= 0 ? inp.anchor : (this.plan?.anchor ?? this.fallback?.anchor ?? -1);
    } else {
      this.preview = r.tAnchor;
    }

    if (pressed && this.auto && r.tState === 'attached') {
      // A second tap during an automatic swing lets go immediately.
      this.auto = null;
      this.swallow = true;
    } else if (pressed) {
      this.pressTick = w.tick;
      this.pending = r.tState !== 'attached';
      this.auto = inp.assist ? { tx: target.x, tz: target.z } : null;
    }
    if (!inp.held) this.swallow = false;
    // Held past the tap threshold: it is a manual swing from now on (release when the player lets go).
    if (this.auto && (inp.held || releasedBtn) && (w.tick - this.pressTick) / TUNING.sim.hz > TAP_SECONDS) this.auto = null;

    let tether = inp.held && !this.swallow;
    if (this.auto) {
      tether = true;
      if (r.tState === 'attached') {
        this.pending = false;
        // Let go on the launch line, or after a short swing if the target can't be lined up from here.
        if (!inp.held && (releaseNow(r, this.auto.tx, this.auto.tz) || r.tTime > AUTO_SWING_MAX + 0.15)) {
          this.auto = null;
          tether = false;
        }
      } else if (!this.pending || (w.tick - this.pressTick) / TUNING.sim.hz > TUNING.tether.pressBuffer + 0.05) {
        // Swing finished (or never started): stop holding.
        this.auto = null;
        tether = inp.held && !this.swallow;
      }
    }
    if (r.tState === 'attached') this.pending = false;

    this.cue = r.tState === 'attached' && !this.auto && inp.held && launchAlignment(r, target.x, target.z) > 0.97;
    c.tether = tether;
    c.anchor = this.preview;
    // The swing direction always comes from the plan (or the forward fallback), never from momentum.
    if (r.tState !== 'attached') this.dir = this.plan && this.plan.anchor === this.preview ? this.plan.dir : this.fallback && this.fallback.anchor === this.preview ? this.fallback.dir : 0;
    c.swingDir = this.dir;
  }
}
