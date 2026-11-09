import { describe, expect, it } from 'vitest';
import { ARENA_ORDER } from '../src/content/arenas';
import { CHASSIS_ORDER } from '../src/content/chassis';
import { DT } from '../src/content/tuning';
import { Rng } from '../src/game/sim/rng';
import type { Command } from '../src/game/sim/types';
import { createRobot, createWorld, pickAnchor, placeBall, placeRobot, predictBall } from '../src/game/sim/world';
import { ARENAS, CHASSIS, HZ, R, RB, TUNING, anchorIndex, ballInside, ballWorld, cmd, eventsOf, finiteBall, finiteRobot, robotInside, soloWorld, speedOf, step } from './helpers';

const B = TUNING.ball;
const K = TUNING.kick;
const RT = TUNING.robot;
const HARBOR = ARENAS.harbor_park;

describe('ball motion over simulated time', () => {
  it('matches the analytic drag + rolling law after one simulated second', () => {
    // dv/dt = -drag*v - rolling  =>  v(t) = (v0 + c) e^(-drag t) - c,  c = rolling / drag
    const c = B.rolling / B.drag;
    for (const v0 of [4, 10, 16]) {
      const w = ballWorld();
      placeBall(w, -12, 0, v0, 0);
      step(w, [], HZ);
      const vExpected = (v0 + c) * Math.exp(-B.drag) - c;
      const xExpected = -12 + ((v0 + c) * (1 - Math.exp(-B.drag))) / B.drag - c;
      expect(Math.abs(w.ball.vx - vExpected) / vExpected).toBeLessThan(0.02);
      expect(Math.abs(w.ball.x - xExpected)).toBeLessThan(0.02 * (xExpected + 12));
      expect(w.ball.z).toBe(0);
      expect(w.ball.vz).toBe(0);
    }
  });

  it('a rolling ball comes to a complete stop and stays stopped (no drift, no reversal)', () => {
    const w = ballWorld();
    placeBall(w, 0, 0, 1.5, -1);
    step(w, [], 6 * HZ);
    expect(speedOf(w.ball)).toBe(0);
    const at = { x: w.ball.x, z: w.ball.z };
    step(w, [], HZ);
    expect({ x: w.ball.x, z: w.ball.z }).toEqual(at);
    // It travelled along its initial heading only.
    expect(at.x).toBeGreaterThan(0);
    expect(at.z).toBeLessThan(0);
    expect(at.z / at.x).toBeCloseTo(-1 / 1.5, 6);
  });

  it('clamps an over-speed ball to the ball speed limit before it moves', () => {
    const w = ballWorld();
    placeBall(w, -10, 0, 60, 0);
    step(w, []);
    expect(speedOf(w.ball)).toBeLessThanOrEqual(B.maxSpeed);
    expect(w.ball.x - -10).toBeLessThanOrEqual(B.maxSpeed * DT + 1e-9);
  });

  it('a wall bounce loses speed by the wall restitution and reflects the normal component only', () => {
    const w = ballWorld();
    placeBall(w, 0, w.hz - RB - 0.2, 3, 9);
    const ev = step(w, [], 6);
    const walls = eventsOf(ev, 'wall');
    expect(walls).toHaveLength(1);
    expect(w.ball.vz).toBeLessThan(0);
    expect(w.ball.vx).toBeGreaterThan(0);
    // |vz| after ≈ restitution * |vz| before (minus a few ticks of drag).
    expect(Math.abs(w.ball.vz)).toBeLessThan(9 * B.wallRestitution);
    expect(Math.abs(w.ball.vz)).toBeGreaterThan(9 * B.wallRestitution * 0.9);
  });

  it('predictBall (coarser step) tracks the real stepped path, including a wall bounce', () => {
    const cases: [number, number, number, number][] = [
      [0, 2, 6, 12], // bounces off the south wall within the second
      [-5, -3, -4, -13], // north wall
      [2, -1, 9, 0.5], // straight roll
    ];
    for (const [x, z, vx, vz] of cases) {
      const w = ballWorld();
      placeBall(w, x, z, vx, vz);
      const steps = 10;
      const out = new Float32Array(steps * 2);
      expect(predictBall(w, out, steps, 0.1)).toBe(steps);
      // Prediction is side-effect free.
      expect([w.ball.x, w.ball.z, w.ball.vx, w.ball.vz]).toEqual([x, z, vx, vz]);
      let bounced = 0;
      for (let i = 0; i < steps; i++) {
        bounced += eventsOf(step(w, [], HZ / 10), 'wall').length;
        const err = Math.hypot(out[i * 2] - w.ball.x, out[i * 2 + 1] - w.ball.z);
        expect(err).toBeLessThan(0.6);
      }
      if (Math.abs(vz) > 10) expect(bounced).toBeGreaterThan(0);
    }
  });

  it('simulating in one go or in chunks gives the identical state (fixed step, no hidden frame state)', () => {
    const a = ballWorld();
    const b = ballWorld();
    placeBall(a, -3, 2, 11, 7);
    placeBall(b, -3, 2, 11, 7);
    step(a, [], 240);
    for (let i = 0; i < 8; i++) step(b, [], 30);
    expect(b.ball).toEqual(a.ball);
    expect(b.tick).toBe(a.tick);
  });
});

describe('robot running', () => {
  it('accelerates to run speed in the expected time and never exceeds it without a tether', () => {
    for (const id of CHASSIS_ORDER) {
      const ch = CHASSIS[id];
      const { w, r } = soloWorld({ chassis: ch, x: -12, z: 0 });
      let reachedAt = -1;
      step(w, cmd({ mx: 1 }), 90, (_e, i) => {
        expect(speedOf(r)).toBeLessThanOrEqual(RT.maxRunSpeed + 1e-9);
        if (reachedAt < 0 && speedOf(r) >= RT.maxRunSpeed - 1e-9) reachedAt = i + 1;
      });
      const expected = RT.maxRunSpeed / (RT.acceleration * ch.mod.acceleration);
      expect(reachedAt).toBeGreaterThan(0);
      expect(Math.abs(reachedAt * DT - expected)).toBeLessThanOrEqual(DT + 1e-9);
      // Distance after 1.5 s: ramp then cruise (within one tick of travel).
      const dist = r.x - -12;
      const ideal = RT.maxRunSpeed * (1.5 - expected / 2);
      expect(Math.abs(dist - ideal)).toBeLessThan(RT.maxRunSpeed * DT * 1.5);
    }
  });

  it('normalises diagonal and over-length input', () => {
    for (const [mx, mz] of [[1, 1], [-1, 1], [5, 0], [3, -4]] as const) {
      const { w, r } = soloWorld({ x: 0, z: 0 });
      step(w, cmd({ mx, mz }), 40, () => expect(speedOf(r)).toBeLessThanOrEqual(RT.maxRunSpeed + 1e-9));
      expect(speedOf(r)).toBeCloseTo(RT.maxRunSpeed, 6);
    }
  });

  it('brakes to a full stop without input and does not reverse', () => {
    const { w, r } = soloWorld({ x: -10, z: 0 });
    step(w, cmd({ mx: 1 }), 30);
    const x0 = r.x;
    step(w, cmd(), 30, () => expect(r.vx).toBeGreaterThanOrEqual(0));
    expect(speedOf(r)).toBe(0);
    const stopDist = r.x - x0;
    const ideal = RT.maxRunSpeed ** 2 / (2 * RT.braking);
    expect(stopDist).toBeGreaterThan(0);
    expect(stopDist).toBeLessThan(ideal + RT.maxRunSpeed * DT);
  });

  it('released swing momentum decays back to run speed and is never regained by running', () => {
    const sky = ARENAS.skyline_stadium;
    const g = anchorIndex(sky, 'gantry_n');
    const { w, r } = soloWorld({ arena: sky });
    step(w, cmd({ tether: true, anchor: g }));
    step(w, cmd({ tether: true, anchor: g }), 70);
    step(w, cmd());
    let last = speedOf(r);
    expect(last).toBeGreaterThan(RT.maxRunSpeed);
    // Keep running along the launch direction: speed only ever goes down toward run speed.
    step(
      w,
      () => {
        const s = speedOf(r) || 1;
        return cmd({ mx: r.vx / s, mz: r.vz / s });
      },
      200,
      () => {
        const s = speedOf(r);
        // Sliding along a wall can only remove speed, never add it.
        expect(s).toBeLessThanOrEqual(Math.max(last, RT.maxRunSpeed) + 1e-9);
        last = s;
      },
    );
    expect(last).toBeLessThanOrEqual(RT.maxRunSpeed + 1e-9);
  });

  it('robots cannot leave through a goal mouth, running or swinging', () => {
    for (const side of [1, -1] as const) {
      const { w, r } = soloWorld({ x: side * 12, z: 0, park: side === 1 ? -1 : 1 });
      step(w, cmd({ mx: side }), 180, () => {
        expect(Math.abs(r.x)).toBeLessThanOrEqual(w.hx - R + 1e-9);
        expect(robotInside(w, r)).toBe(true);
      });
      expect(Math.abs(r.x)).toBeCloseTo(w.hx - R, 6);
      expect(Math.abs(r.z)).toBeLessThan(HARBOR.goalWidth / 2); // it really is standing in the mouth

      // Swing on the end-line anchor beside the goal while steering into the net.
      const end = anchorIndex(HARBOR, side === 1 ? 'end_1_0' : 'end_0_0');
      const s2 = soloWorld({ x: side * 11, z: 0, park: side === 1 ? -1 : 1 });
      let letGo = false;
      for (let i = 0; i < 400; i++) {
        const want = !letGo;
        letGo = false;
        const ev = step(s2.w, cmd({ tether: want, anchor: end, mx: side, mz: 0 }));
        if (eventsOf(ev, 'release').length) letGo = true;
        expect(Math.abs(s2.r.x)).toBeLessThanOrEqual(s2.w.hx - R + 1e-9);
        expect(robotInside(s2.w, s2.r)).toBe(true);
      }
    }
  });
});

describe('goal detection', () => {
  it('a ball at maximum speed into the mouth scores exactly once, in either goal', () => {
    for (const side of [1, -1] as const) {
      for (const z of [0, 1.5, -2.4]) {
        const w = ballWorld();
        placeBall(w, side * 9, z, side * B.maxSpeed, 0);
        const ev = step(w, [], 3 * HZ, () => {
          expect(finiteBall(w)).toBe(true);
          expect(ballInside(w)).toBe(true);
        });
        const goals = eventsOf(ev, 'goal');
        expect(goals).toEqual([{ type: 'goal', side: side === 1 ? 1 : 0 }]);
        expect(w.goalLatch).toBe(true);
        // The ball is held by the net, behind the line.
        expect(Math.abs(w.ball.x)).toBeGreaterThan(w.hx);
      }
    }
  });

  it('an absurdly fast ball cannot tunnel past the goal line detector or through the net', () => {
    const w = ballWorld();
    placeBall(w, 14.9, 0, 500, 0);
    const ev = step(w, [], 30, () => expect(ballInside(w)).toBe(true));
    expect(eventsOf(ev, 'goal')).toHaveLength(1);
  });

  it('the goal only counts once the whole ball is over the line', () => {
    const w = ballWorld();
    // Ball stopped straddling the line: centre past the line but not by a full radius.
    placeBall(w, w.hx + RB - 0.05, 0);
    expect(eventsOf(step(w, [], 30), 'goal')).toHaveLength(0);
    expect(w.goalLatch).toBe(false);
    placeBall(w, w.hx + RB + 0.01, 0);
    expect(eventsOf(step(w, [], 1), 'goal')).toHaveLength(1);
  });

  it('a ball that keeps bouncing in the net does not score again while latched', () => {
    const w = ballWorld();
    placeBall(w, 13, 0.4, B.maxSpeed, 2);
    let goals = eventsOf(step(w, [], 60), 'goal').length;
    expect(goals).toBe(1);
    const rng = new Rng(5);
    for (let i = 0; i < 40; i++) {
      // Shove the ball around inside (and out of / back into) the net without clearing the latch.
      w.ball.vx = rng.range(-18, 18);
      w.ball.vz = rng.range(-18, 18);
      goals += eventsOf(step(w, [], 10), 'goal').length;
      expect(ballInside(w)).toBe(true);
    }
    expect(goals).toBe(1);
    // Only a reset (placeBall) re-arms the detector.
    placeBall(w, 13, 0, B.maxSpeed, 0);
    expect(w.goalLatch).toBe(false);
    expect(eventsOf(step(w, [], 60), 'goal')).toHaveLength(1);
  });

  it('a fast ball outside the posts never scores and stays in the field', () => {
    for (const side of [1, -1] as const) {
      for (const zs of [1, -1] as const) {
        const w = ballWorld();
        const z = zs * (HARBOR.goalWidth / 2 + 1);
        placeBall(w, side * 9, z, side * B.maxSpeed, 0);
        const ev = step(w, [], 3 * HZ, () => {
          expect(Math.abs(w.ball.x)).toBeLessThanOrEqual(w.hx - RB + 1e-9);
          expect(ballInside(w)).toBe(true);
        });
        expect(eventsOf(ev, 'goal')).toHaveLength(0);
        expect(w.goalLatch).toBe(false);
        expect(eventsOf(ev, 'wall').length).toBeGreaterThan(0);
        // It rebounded off the end wall back toward the middle.
        expect(side * w.ball.x).toBeLessThan(w.hx - RB - 0.5);
      }
    }
  });

  it('closed goals (goalsOpen = false) behave as a solid end wall', () => {
    const w = ballWorld();
    w.goalsOpen = false;
    placeBall(w, 9, 0, B.maxSpeed, 0);
    const ev = step(w, [], 2 * HZ, () => expect(Math.abs(w.ball.x)).toBeLessThanOrEqual(w.hx - RB + 1e-9));
    expect(eventsOf(ev, 'goal')).toHaveLength(0);
    expect(w.ball.vx).toBeLessThanOrEqual(0);
  });

  it('a ball that hits a post bounces back out without scoring', () => {
    for (const side of [1, -1] as const) {
      for (const zs of [1, -1] as const) {
        const w = ballWorld();
        placeBall(w, side * 10, zs * (HARBOR.goalWidth / 2 - 0.1), side * B.maxSpeed, 0);
        const ev = step(w, [], 2 * HZ, () => expect(ballInside(w)).toBe(true));
        expect(eventsOf(ev, 'post').length).toBeGreaterThanOrEqual(1);
        expect(eventsOf(ev, 'goal')).toHaveLength(0);
        expect(side * w.ball.x).toBeLessThan(w.hx - RB);
      }
    }
  });
});

describe('ball containment stress', () => {
  it('the ball never leaves the arena envelope during 20 s of random kicks and robot traffic, on every arena', () => {
    for (const id of ARENA_ORDER) {
      const arena = ARENAS[id];
      const rng = new Rng(1234 + ARENA_ORDER.indexOf(id));
      const robots = [
        createRobot(0, 0, 0, CHASSIS.all_rounder),
        createRobot(1, 0, 1, CHASSIS.bulwark),
        createRobot(2, 1, 0, CHASSIS.scout),
        createRobot(3, 1, 1, CHASSIS.glider),
      ];
      const w = createWorld(arena, robots);
      placeRobot(robots[0], -4, -1.5, 0);
      placeRobot(robots[1], -9, 2.8, 0);
      placeRobot(robots[2], 4, 1.5, Math.PI);
      placeRobot(robots[3], 9, -2.8, Math.PI);
      const cmds: Command[] = robots.map(() => cmd());
      let goals = 0;
      for (let i = 0; i < 20 * HZ; i++) {
        if (i % 24 === 0) {
          // Random hard hit from wherever the ball is (including inside a net); a third are aimed at a goal
          // mouth or post so the end-line geometry gets real traffic.
          let a = rng.range(0, Math.PI * 2);
          if (rng.chance(0.35)) a = Math.atan2(rng.range(-3.6, 3.6) - w.ball.z, (rng.chance(0.5) ? 1 : -1) * w.hx - w.ball.x);
          const s = rng.range(6, B.maxSpeed * 1.3);
          w.ball.vx = Math.cos(a) * s;
          w.ball.vz = Math.sin(a) * s;
        }
        if (i % 15 === 0) {
          robots.forEach((r, k) => {
            // Half of the time chase the ball to create squeezes against walls, posts and corners.
            const chase = rng.chance(0.5);
            const dx = w.ball.x - r.x;
            const dz = w.ball.z - r.z;
            const d = Math.hypot(dx, dz) || 1;
            cmds[k] = cmd({
              mx: chase ? dx / d : rng.range(-1, 1),
              mz: chase ? dz / d : rng.range(-1, 1),
              ax: rng.range(-w.hx, w.hx),
              az: rng.range(-w.hz, w.hz),
              tether: rng.chance(0.4),
              kick: rng.chance(0.5),
            });
          });
        }
        robots.forEach((r, k) => {
          cmds[k].anchor = r.tState === 'attached' ? r.tAnchor : pickAnchor(w, r, cmds[k].ax, cmds[k].az, cmds[k].anchor);
        });
        const ev = step(w, cmds);
        goals += eventsOf(ev, 'goal').length;
        if (w.goalLatch && i % 120 === 0) w.goalLatch = false; // re-arm now and then, as a kickoff would
        expect(finiteBall(w)).toBe(true);
        expect(ballInside(w)).toBe(true);
        expect(speedOf(w.ball)).toBeLessThanOrEqual(B.maxSpeed * 2.5); // sanity: no energy blow-up from squeezes
        for (const r of robots) {
          expect(finiteRobot(r)).toBe(true);
          expect(robotInside(w, r)).toBe(true);
        }
      }
      expect(goals).toBeGreaterThan(0);
    }
  });
});

describe('deliberate kick', () => {
  /** Robot at the origin facing +x with the ball `d` units in front of it. */
  function kickSetup(d: number) {
    const s = soloWorld({ x: 0, z: 0, park: 0 });
    placeBall(s.w, d, 0);
    return s;
  }

  it('only connects within kick range', () => {
    const near = kickSetup(K.range - 0.03);
    const evNear = step(near.w, cmd({ kick: true, ax: 10, az: 0 }));
    expect(eventsOf(evNear, 'kick')).toHaveLength(1);
    expect(near.w.ball.vx).toBeGreaterThan(0);
    expect(near.w.ball.lastTouchRobot).toBe(0);
    expect(near.w.ball.lastTouchDeliberate).toBe(true);

    const far = kickSetup(K.range + 0.03);
    const evFar = step(far.w, (i) => cmd({ kick: i === 0, ax: 10, az: 0 }), 30);
    expect(eventsOf(evFar, 'kick')).toHaveLength(0);
    expect(speedOf(far.w.ball)).toBe(0);
    expect(far.w.ball.lastTouchRobot).toBe(-1);
    expect(far.r.kickCd).toBeLessThanOrEqual(0); // a miss does not start the cooldown
  });

  it('sends the ball toward the aim point at the standing kick speed, scaled by power', () => {
    for (const [ax, az] of [[10, 0], [1.2, 8], [-6, -3]] as const) {
      const { w } = kickSetup(1.2);
      const ev = eventsOf(step(w, cmd({ kick: true, ax, az })), 'kick');
      expect(ev).toHaveLength(1);
      expect(ev[0].speed).toBeCloseTo(K.baseSpeed, 9);
      const want = Math.atan2(az - 0, ax - 1.2);
      const got = Math.atan2(w.ball.vz, w.ball.vx);
      expect(Math.abs(Math.atan2(Math.sin(got - want), Math.cos(got - want)))).toBeLessThan(1e-6);
    }
    const soft = kickSetup(1.2);
    const ev = eventsOf(step(soft.w, cmd({ kick: true, ax: 10, az: 0, power: 0.5 })), 'kick');
    expect(ev[0].speed).toBeCloseTo(K.baseSpeed * 0.5, 9);
  });

  it('respects the kick cooldown even when the button is mashed with the ball always in reach', () => {
    const { w, r } = kickSetup(1.2);
    const kickTicks: number[] = [];
    for (let i = 0; i < 2 * HZ; i++) {
      // Keep a ball in front of the robot at all times.
      w.ball.x = r.x + 1.2;
      w.ball.z = r.z;
      w.ball.vx = 0;
      w.ball.vz = 0;
      const ev = step(w, cmd({ kick: true, ax: 10, az: 0 }));
      if (eventsOf(ev, 'kick').length) kickTicks.push(i);
    }
    expect(kickTicks.length).toBeGreaterThan(3);
    for (let i = 1; i < kickTicks.length; i++) {
      expect((kickTicks[i] - kickTicks[i - 1]) * DT).toBeGreaterThanOrEqual(K.cooldownSeconds - 1e-9);
    }
    expect(kickTicks.length).toBeLessThanOrEqual(Math.floor(2 / K.cooldownSeconds) + 1);
  });

  it('buffers a slightly early press so it connects when the ball comes into reach, but not a far too early one', () => {
    // Robot runs at the ball; the press happens when the ball is still out of range.
    const run = (gap: number) => {
      const s = soloWorld({ x: 0, z: 0, park: 0 });
      step(s.w, cmd({ mx: 1 }), 30); // get up to run speed
      placeBall(s.w, s.r.x + K.range + gap, 0);
      const ev = step(s.w, (i) => cmd({ mx: 1, kick: i === 0, ax: 30, az: 0 }), 40);
      return { kicks: eventsOf(ev, 'kick'), w: s.w };
    };
    const closing = RT.maxRunSpeed * K.inputBufferSeconds; // distance covered during the buffer
    const early = run(closing * 0.5);
    expect(early.kicks).toHaveLength(1);
    expect(early.w.ball.lastTouchDeliberate).toBe(true);

    const tooEarly = run(closing * 2.5);
    expect(tooEarly.kicks).toHaveLength(0);
    // The robot simply dribbles into the ball instead.
    expect(tooEarly.w.ball.lastTouchDeliberate).toBe(false);
  });

  it('a kick while moving toward the aim is faster than a standing kick, and moving away adds nothing', () => {
    const standing = kickSetup(1.2);
    const s0 = eventsOf(step(standing.w, cmd({ kick: true, ax: 10, az: 0 })), 'kick')[0].speed;

    const moving = soloWorld({ x: -5, z: 0, park: 0 });
    step(moving.w, cmd({ mx: 1 }), 30);
    expect(speedOf(moving.r)).toBeCloseTo(RT.maxRunSpeed, 6);
    placeBall(moving.w, moving.r.x + 1.2, 0);
    const s1 = eventsOf(step(moving.w, cmd({ mx: 1, kick: true, ax: 30, az: 0 })), 'kick')[0].speed;
    expect(s1).toBeGreaterThan(s0 + 1);
    expect(s1).toBeCloseTo(K.baseSpeed + K.forwardVelocityFactor * RT.maxRunSpeed, 6);

    const away = soloWorld({ x: 5, z: 0, park: 0 });
    step(away.w, cmd({ mx: -1 }), 30);
    placeBall(away.w, away.r.x + 1.2, 0);
    const s2 = eventsOf(step(away.w, cmd({ mx: -1, kick: true, ax: 30, az: 0 })), 'kick')[0].speed;
    expect(s2).toBeCloseTo(s0, 9);
  });

  it('never exceeds the kick speed cap, whatever the robot speed', () => {
    for (const v of [0, RT.maxRunSpeed, TUNING.tether.maxSpeed, 14, 40]) {
      const { w, r } = kickSetup(1.2);
      r.vx = v; // injected directly: faster than anything legal play can produce
      const ev = eventsOf(step(w, cmd({ mx: 1, kick: true, ax: 30, az: 0 })), 'kick');
      expect(ev).toHaveLength(1);
      expect(ev[0].speed).toBeLessThanOrEqual(K.speedCap + 1e-9);
      expect(speedOf(w.ball)).toBeLessThanOrEqual(K.speedCap + 1e-9);
      if (v >= 14) expect(ev[0].speed).toBeCloseTo(K.speedCap, 9);
    }
  });

  it('a real swing-release kick is the strongest legal kick, flagged as a swing kick, and still under the cap', () => {
    const sky = ARENAS.skyline_stadium;
    const g = anchorIndex(sky, 'gantry_n');
    const { w, r } = soloWorld({ arena: sky, park: 0 });
    placeBall(w, 10, 8); // out of the way during the swing
    step(w, cmd({ tether: true, anchor: g }));
    step(w, cmd({ tether: true, anchor: g }), 100);
    step(w, cmd());
    const s = speedOf(r);
    expect(s).toBeGreaterThan(RT.maxRunSpeed * 1.5);
    // Drop the ball right in front of the robot along its direction of travel.
    const ux = r.vx / s;
    const uz = r.vz / s;
    w.ball.x = r.x + ux * 1.2;
    w.ball.z = r.z + uz * 1.2;
    const ev = eventsOf(step(w, cmd({ kick: true, ax: r.x + ux * 30, az: r.z + uz * 30 })), 'kick');
    expect(ev).toHaveLength(1);
    expect(ev[0].swing).toBe(true);
    expect(ev[0].speed).toBeGreaterThan(K.baseSpeed + K.forwardVelocityFactor * RT.maxRunSpeed);
    expect(ev[0].speed).toBeLessThanOrEqual(K.speedCap + 1e-9);
  });

  it('cannot kick a ball that is already in the net (goal latched)', () => {
    const { w } = kickSetup(1.2);
    w.goalLatch = true;
    const ev = step(w, cmd({ kick: true, ax: 10, az: 0 }), 5);
    expect(eventsOf(ev, 'kick')).toHaveLength(0);
  });
});

describe('robot / robot bumps', () => {
  function pair() {
    const heavy = createRobot(0, 0, 0, CHASSIS.bulwark);
    const light = createRobot(1, 1, 0, CHASSIS.scout);
    const w = createWorld(HARBOR, [heavy, light]);
    placeBall(w, 0, 8);
    return { w, heavy, light };
  }
  const mH = CHASSIS.bulwark.mod.mass;
  const mL = CHASSIS.scout.mod.mass;

  it('overlap resolution displaces both robots, the heavier one less (inverse to mass)', () => {
    const { w, heavy, light } = pair();
    placeRobot(heavy, -0.5, 0, 0);
    placeRobot(light, 0.5, 0, Math.PI);
    step(w, [cmd(), cmd()]);
    const dH = -0.5 - heavy.x;
    const dL = light.x - 0.5;
    expect(dH).toBeGreaterThan(0.01);
    expect(dL).toBeGreaterThan(dH);
    expect(dL / dH).toBeCloseTo(mH / mL, 6);
    expect(light.x - heavy.x).toBeCloseTo(2 * R, 6);
    expect(finiteRobot(heavy) && finiteRobot(light)).toBe(true);
  });

  it('a head-on collision changes both velocities, conserves momentum and favours the heavier chassis', () => {
    const { w, heavy, light } = pair();
    placeRobot(heavy, -(R + 0.02), 0, 0);
    placeRobot(light, R + 0.02, 0, Math.PI);
    heavy.vx = 5;
    light.vx = -5;
    // Hold the run input so the control step leaves both at their approach speed.
    const ev = step(w, [cmd({ mx: 1 }), cmd({ mx: -1 })]);
    const bumps = eventsOf(ev, 'bump');
    expect(bumps).toHaveLength(1);
    expect(bumps[0].speed).toBeGreaterThan(2);
    const vH0 = Math.min(RT.maxRunSpeed, 5 + RT.acceleration * CHASSIS.bulwark.mod.acceleration * DT);
    const vL0 = -Math.min(RT.maxRunSpeed, 5 + RT.acceleration * CHASSIS.scout.mod.acceleration * DT);
    const dvH = heavy.vx - vH0;
    const dvL = light.vx - vL0;
    expect(dvH).toBeLessThan(-1); // the Bulwark is not immovable
    expect(dvL).toBeGreaterThan(1);
    expect(Math.abs(dvH)).toBeLessThan(Math.abs(dvL));
    expect(mH * dvH + mL * dvL).toBeCloseTo(0, 6);
    expect(finiteRobot(heavy) && finiteRobot(light)).toBe(true);
  });

  it('a stationary Bulwark is shoved by a running Scout, and a sustained shoving match stays finite and in bounds', () => {
    const { w, heavy, light } = pair();
    placeRobot(heavy, 0, 0, 0);
    placeRobot(light, 4, 0, Math.PI);
    step(w, [cmd(), cmd({ mx: -1 })], 90);
    expect(heavy.x).toBeLessThan(-0.3); // displaced, not a wall
    expect(light.x - heavy.x).toBeGreaterThanOrEqual(2 * R - 1e-6);

    // Both now push against each other for three seconds.
    const x0 = (heavy.x + light.x) / 2;
    step(w, [cmd({ mx: 1 }), cmd({ mx: -1 })], 180, () => {
      expect(finiteRobot(heavy) && finiteRobot(light)).toBe(true);
      expect(robotInside(w, heavy) && robotInside(w, light)).toBe(true);
      expect(light.x - heavy.x).toBeGreaterThanOrEqual(2 * R - 1e-6);
      expect(speedOf(heavy)).toBeLessThanOrEqual(RT.maxRunSpeed + 1e-6);
      expect(speedOf(light)).toBeLessThanOrEqual(RT.maxRunSpeed + 1e-6);
    });
    // The heavier chassis wins the shoulder-to-shoulder challenge: the pair drifts toward the Scout's side.
    expect((heavy.x + light.x) / 2).toBeGreaterThan(x0);
  });

  it('a robot pinned against a wall by another robot stays inside the arena', () => {
    const { w, heavy, light } = pair();
    placeRobot(light, w.hx - R, 0.2, 0);
    placeRobot(heavy, w.hx - R - 2, 0, 0);
    step(w, [cmd({ mx: 1 }), cmd()], 120, () => {
      expect(robotInside(w, heavy) && robotInside(w, light)).toBe(true);
      expect(finiteRobot(heavy) && finiteRobot(light)).toBe(true);
    });
  });
});
