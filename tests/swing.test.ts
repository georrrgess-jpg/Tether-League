import { describe, expect, it } from 'vitest';
import { ARENAS, type ArenaDef } from '../src/content/arenas';
import { CHASSIS } from '../src/content/chassis';
import { TUNING } from '../src/content/tuning';
import { BotDirector, CLUB_STYLE, DIFFICULTY } from '../src/game/ai/bot';
import { Match } from '../src/game/sim/match';
import { SmartSwing, clampTarget, launchCarry, planSwing, releaseNow } from '../src/game/sim/swing';
import { emptyCommand } from '../src/game/sim/types';
import { stepWorld } from '../src/game/sim/world';
import { HZ, soloWorld, speedOf } from './helpers';

const RUN = TUNING.robot.maxRunSpeed;

function angleTo(r: { x: number; z: number; vx: number; vz: number }, tx: number, tz: number): number {
  const dx = tx - r.x;
  const dz = tz - r.z;
  const c = (r.vx * dx + r.vz * dz) / (speedOf(r) * Math.hypot(dx, dz));
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
}

/** Tap (held for `holdTicks`) with smart swing; returns the robot state at release. */
function tapSwing(sx: number, sz: number, tx: number, tz: number, holdTicks = 3, assist = true, arena: ArenaDef = ARENAS.harbor_park) {
  const { w, r } = soloWorld({ arena, x: sx, z: sz });
  const ss = new SmartSwing();
  const c = emptyCommand();
  let attached = false;
  let release: { x: number; z: number; vx: number; vz: number; tick: number } | null = null;
  for (let i = 0; i < 4 * HZ && !release; i++) {
    ss.update(w, r, c, { held: i < holdTicks, tx, tz, anchor: -1, assist });
    const was = r.tState;
    stepWorld(w, [c]);
    if (r.tState === 'attached') attached = true;
    if (was === 'attached' && r.tState !== 'attached') release = { x: r.x, z: r.z, vx: r.vx, vz: r.vz, tick: w.tick };
  }
  return { w, r, attached, release, ss };
}

describe('swing planner', () => {
  it('plans a launch that points exactly at the target and beats running', () => {
    const cases: [number, number, number, number][] = [
      [-9, 5, 6, 5],
      [-9, -5, 8, -2],
      [5, 6, -9, 0],
      [0, -6, 12, 4],
    ];
    for (const [sx, sz, tx, tz] of cases) {
      const { w, r } = soloWorld({ x: sx, z: sz });
      const p = planSwing(w, r, tx, tz);
      expect(p).not.toBeNull();
      const dx = tx - p!.releaseX;
      const dz = tz - p!.releaseZ;
      const dot = (p!.lx * dx + p!.lz * dz) / Math.hypot(dx, dz);
      expect(dot).toBeGreaterThan(0.999);
      expect(p!.gain).toBeGreaterThan(0);
      expect(p!.swingTime).toBeLessThan(TUNING.tether.maxHoldSeconds);
    }
  });

  it('returns null when no anchor is in range', () => {
    const lonely: ArenaDef = { ...ARENAS.harbor_park, anchors: [{ id: 'far', x: 14.5, z: 10.5, kind: 'rail' }] };
    const { w, r } = soloWorld({ arena: lonely, x: -12, z: -7 });
    expect(planSwing(w, r, 0, 0)).toBeNull();
  });

  it('never plans an arc that leaves the pitch', () => {
    const { w, r } = soloWorld({ x: -12, z: 8 });
    for (let k = 0; k < 40; k++) {
      const tx = -13 + (k % 8) * 3.5;
      const tz = -8 + Math.floor(k / 8) * 4;
      const p = planSwing(w, r, tx, tz);
      if (!p) continue;
      for (let s = 0; s <= 10; s++) {
        const th = p.startAngle + p.dir * p.arc * (s / 10);
        expect(Math.abs(p.cx + Math.cos(th) * p.radius)).toBeLessThanOrEqual(w.hx);
        expect(Math.abs(p.cz + Math.sin(th) * p.radius)).toBeLessThanOrEqual(w.hz);
      }
    }
  });

  it('clamps off-pitch targets onto the field', () => {
    const { w } = soloWorld();
    const t = clampTarget(w, 99, -99);
    expect(Math.abs(t.x)).toBeLessThan(w.hx);
    expect(Math.abs(t.z)).toBeLessThan(w.hz);
  });
});

describe('smart swing (player tether controller)', () => {
  it('a tap swings and lets go automatically, launching toward the target fast', () => {
    for (const [sx, sz, tx, tz] of [
      [-9, 5, 6, 5],
      [-9, -5, 8, -2],
      [6, -6, -8, 2],
    ] as [number, number, number, number][]) {
      const { attached, release } = tapSwing(sx, sz, tx, tz);
      expect(attached).toBe(true);
      expect(release).not.toBeNull();
      expect(angleTo(release!, tx, tz)).toBeLessThan(8);
      expect(speedOf(release!)).toBeGreaterThan(RUN * 1.5);
    }
  });

  it('a hold is manual: no automatic release while the button is down', () => {
    const { w, r } = soloWorld({ x: -9, z: 5 });
    const ss = new SmartSwing();
    const c = emptyCommand();
    let attachedTicks = 0;
    for (let i = 0; i < 50; i++) {
      ss.update(w, r, c, { held: true, tx: 6, tz: 5, anchor: -1, assist: true });
      stepWorld(w, [c]);
      if (r.tState === 'attached') attachedTicks++;
    }
    expect(attachedTicks).toBeGreaterThan(40);
    expect(r.tState).toBe('attached');
    // letting go releases on that tick
    ss.update(w, r, c, { held: false, tx: 6, tz: 5, anchor: -1, assist: true });
    expect(c.tether).toBe(false);
    stepWorld(w, [c]);
    expect(r.tState).toBe('cooldown');
  });

  it('with smart swing off a tap is a plain short tether', () => {
    const { release } = tapSwing(-9, 5, 6, 5, 3, false);
    expect(release).not.toBeNull();
    expect(release!.tick).toBeLessThan(10);
  });

  it('a press shorter than one tick still swings (latched by the input layer as a 1-tick hold)', () => {
    const { attached, release } = tapSwing(-9, 5, 6, 5, 1);
    expect(attached).toBe(true);
    expect(release).not.toBeNull();
  });

  it('release decision fires on the tangent line', () => {
    const { r, release } = tapSwing(-9, -5, 8, -2);
    expect(release).not.toBeNull();
    expect(releaseNow(r, 8, -2)).toBe(false); // no longer attached
  });
});

describe('swing physics', () => {
  it('movement input never brakes or reverses a swing', () => {
    const { w, r } = soloWorld({ x: -9, z: 5 });
    const c = emptyCommand();
    const p = planSwing(w, r, 6, 5)!;
    c.anchor = p.anchor;
    c.swingDir = p.dir;
    c.tether = true;
    stepWorld(w, [c]);
    let prev = speedOf(r);
    const dir = r.tDir;
    for (let i = 0; i < 60 && r.tState === 'attached'; i++) {
      // push hard against the direction of travel
      const sp = speedOf(r) || 1;
      c.mx = -r.vx / sp;
      c.mz = -r.vz / sp;
      stepWorld(w, [c]);
      if (r.tState !== 'attached') break;
      expect(r.tDir).toBe(dir);
      expect(speedOf(r)).toBeGreaterThanOrEqual(prev - 0.35); // only rope/wall geometry, never braking
      prev = speedOf(r);
    }
  });

  it('attaching from a standstill starts the swing at a useful speed', () => {
    const { w, r } = soloWorld({ x: -9, z: 5 });
    const c = emptyCommand();
    const p = planSwing(w, r, 6, 5)!;
    c.anchor = p.anchor;
    c.tether = true;
    stepWorld(w, [c]);
    expect(speedOf(r)).toBeGreaterThanOrEqual(TUNING.tether.startSpeed - 0.5);
  });

  it('a launch keeps most of its speed through the launch window, with or without input', () => {
    for (const steer of [false, true]) {
      const { w, r } = soloWorld({ x: -9, z: 5 });
      const ss = new SmartSwing();
      const c = emptyCommand();
      let released = false;
      let v0 = 0;
      let t = 0;
      for (let i = 0; i < 4 * HZ; i++) {
        ss.update(w, r, c, { held: i < 3, tx: 6, tz: 5, anchor: -1, assist: true });
        if (released && steer) {
          const sp = speedOf(r) || 1;
          c.mx = r.vx / sp;
          c.mz = r.vz / sp;
        }
        const was = r.tState;
        stepWorld(w, [c]);
        if (!released && was === 'attached' && r.tState !== 'attached') {
          released = true;
          v0 = speedOf(r);
        } else if (released) {
          t++;
          if (t === Math.round(TUNING.robot.launchWindow * HZ) - 2) break;
        }
      }
      expect(released).toBe(true);
      expect(speedOf(r)).toBeGreaterThan(v0 - TUNING.robot.launchDecel * TUNING.robot.launchWindow - 0.3);
    }
  });

  it('a full-speed launch carries clearly farther than running in the same time', () => {
    const carry = launchCarry(TUNING.tether.maxSpeed);
    expect(carry).toBeGreaterThan(12);
  });
});

describe('bots use the tether', () => {
  it('club bots swing regularly in a seeded match, mostly at launch speed', () => {
    const c = CHASSIS.all_rounder;
    const m = new Match({ arena: ARENAS.harbor_park, chassis: [c, c, c, c], human: -1, assist: 0, regulationSeconds: 90 });
    const bots = new BotDirector(m.world, [0, 1, 2, 3].map((robot) => ({ robot, difficulty: DIFFICULTY.club, style: CLUB_STYLE.balanced })), 77);
    const cmds = [emptyCommand(), emptyCommand(), emptyCommand(), emptyCommand()];
    let prev = m.phase;
    let releases = 0;
    let fast = 0;
    let ticks = 0;
    while (!m.finished && ticks++ < 60 * 400) {
      if (m.phase === 'play') bots.update(cmds);
      m.step(cmds);
      if (prev !== 'countdown' && m.phase === 'countdown') bots.reset();
      prev = m.phase;
      for (const e of m.world.events) {
        if (e.type === 'release') {
          releases++;
          if (e.speed > 8) fast++;
        }
      }
    }
    const perRobot = releases / 4;
    expect(perRobot).toBeGreaterThan(4);
    expect(perRobot).toBeLessThan(40);
    expect(fast / releases).toBeGreaterThan(0.6);
  });
});
