import { describe, expect, it } from 'vitest';
import { ARENA_ORDER, type ArenaDef } from '../src/content/arenas';
import { CHASSIS_ORDER } from '../src/content/chassis';
import { DT } from '../src/content/tuning';
import { Rng } from '../src/game/sim/rng';
import { anchorInRange, detach, pickAnchor } from '../src/game/sim/world';
import { ARENAS, CHASSIS, R, TUNING, anchorIndex, cmd, eventsOf, finiteRobot, radial, robotInside, soloWorld, speedOf, step, swingSteer } from './helpers';

const T = TUNING.tether;
const SKY = ARENAS.skyline_stadium;
const GANTRY_N = anchorIndex(SKY, 'gantry_n');

/** Harbor Park with a single anchor, so "nothing in range" situations can be constructed. */
const ONE_ANCHOR: ArenaDef = { ...ARENAS.harbor_park, anchors: [{ id: 'far', x: 14, z: -10.5, kind: 'rail' }] };

/** Robot below the northern gantry anchor of Skyline Stadium: room for a full circle without touching a wall. */
function gantryWorld(chassis = CHASSIS.all_rounder) {
  return soloWorld({ arena: SKY, chassis, x: 0, z: 0 });
}

describe('anchor preview (pickAnchor)', () => {
  it('never offers an anchor beyond the acquisition range, and offers one whenever any is in range', () => {
    const rng = new Rng(7);
    for (const id of ARENA_ORDER) {
      const { w, r } = soloWorld({ arena: ARENAS[id] });
      let prev = -1;
      for (let i = 0; i < 400; i++) {
        r.x = rng.range(-w.hx + R, w.hx - R);
        r.z = rng.range(-w.hz + R, w.hz - R);
        const aimX = rng.range(-w.hx * 1.5, w.hx * 1.5);
        const aimZ = rng.range(-w.hz * 1.5, w.hz * 1.5);
        const pick = pickAnchor(w, r, aimX, aimZ, prev);
        const anyInRange = w.arena.anchors.some((a) => Math.hypot(a.x - r.x, a.z - r.z) <= T.acquisitionRange);
        if (pick === -1) expect(anyInRange).toBe(false);
        else {
          expect(Math.hypot(w.arena.anchors[pick].x - r.x, w.arena.anchors[pick].z - r.z)).toBeLessThanOrEqual(T.acquisitionRange);
          expect(anchorInRange(w, r, pick)).toBe(true);
        }
        prev = pick;
      }
    }
  });

  it('returns -1 when no anchor is in range, even if that anchor was the previous candidate or is aimed at', () => {
    const { w, r } = soloWorld({ arena: ONE_ANCHOR, x: -10, z: 5 });
    expect(Math.hypot(14 - r.x, -10.5 - r.z)).toBeGreaterThan(T.acquisitionRange);
    expect(pickAnchor(w, r, 0, 0, -1)).toBe(-1);
    expect(pickAnchor(w, r, 14, -10.5, 0)).toBe(-1);
    // ...and it becomes available as soon as the robot is close enough.
    r.x = 6;
    r.z = -4;
    expect(pickAnchor(w, r, 0, 0, -1)).toBe(0);
  });

  it('applies the range limit exactly at the boundary', () => {
    const { w, r } = soloWorld({ arena: ONE_ANCHOR });
    r.z = -9;
    const dz = -10.5 - r.z;
    const dxAtRange = Math.sqrt(T.acquisitionRange ** 2 - dz ** 2);
    r.x = 14 - dxAtRange + 0.01;
    expect(pickAnchor(w, r, 0, 0, -1)).toBe(0);
    r.x = 14 - dxAtRange - 0.01;
    expect(pickAnchor(w, r, 0, 0, -1)).toBe(-1);
    expect(anchorInRange(w, r, 0)).toBe(false);
  });

  it('has hysteresis: the previous candidate is kept while scores are close, but a clear aim change switches', () => {
    // Rail anchors only: the overhead gantries would otherwise be the nearest candidates at midfield.
    const arena = { ...ARENAS.harbor_park, anchors: ARENAS.harbor_park.anchors.filter((a) => a.kind === 'rail') };
    const n1 = anchorIndex(arena, 'north_1'); // (-3.5, -10.5)
    const n2 = anchorIndex(arena, 'north_2'); // (3.5, -10.5)
    const s1 = anchorIndex(arena, 'south_1'); // (-3.5, 10.5)
    const s2 = anchorIndex(arena, 'south_2'); // (3.5, 10.5)
    const { w, r } = soloWorld({ arena, x: 0.3, z: -0.2 });

    // No aim: the nearest anchor wins from a cold start...
    expect(pickAnchor(w, r, r.x, r.z, -1)).toBe(n2);
    // ...but a marginally farther previous candidate is retained.
    expect(pickAnchor(w, r, r.x, r.z, n1)).toBe(n1);
    expect(pickAnchor(w, r, r.x, r.z, n2)).toBe(n2);

    // Small robot movement across the midline does not flip the preview back and forth.
    let prev = n1;
    for (const x of [0.3, -0.3, 0.4, -0.4, 0.2]) {
      r.x = x;
      prev = pickAnchor(w, r, r.x, r.z, prev);
      expect(prev).toBe(n1);
    }

    // A decisive aim at another anchor overrides the hysteresis.
    r.x = 2;
    r.z = 3;
    expect(pickAnchor(w, r, 3.5, 10.5, s1)).toBe(s2);
  });

  it('never retains a previous candidate that has gone out of range', () => {
    const arena = ARENAS.harbor_park;
    const n0 = anchorIndex(arena, 'north_0');
    const { w, r } = soloWorld({ arena, x: -10, z: -5 });
    expect(pickAnchor(w, r, r.x, r.z, n0)).toBe(n0);
    r.x = 8;
    r.z = 5;
    expect(anchorInRange(w, r, n0)).toBe(false);
    const pick = pickAnchor(w, r, arena.anchors[n0].x, arena.anchors[n0].z, n0);
    expect(pick).not.toBe(n0);
    expect(pick).not.toBe(-1);
  });
});

describe('tether acquisition', () => {
  it('attaches to the previewed anchor on press when it is in range', () => {
    const { w, r } = gantryWorld();
    const ev = step(w, cmd({ tether: true, anchor: GANTRY_N }));
    expect(r.tState).toBe('attached');
    expect(r.tAnchor).toBe(GANTRY_N);
    expect(eventsOf(ev, 'attach')).toEqual([{ type: 'attach', robot: 0, anchor: GANTRY_N }]);
    expect(eventsOf(ev, 'tetherFail')).toHaveLength(0);
    expect(r.tLen).toBeGreaterThanOrEqual(T.minLength);
    expect(r.tLen).toBeLessThanOrEqual(T.maxLength);
  });

  it('a press on an out-of-range anchor does not attach, emits tetherFail once and starts no cooldown', () => {
    const { w, r } = soloWorld({ arena: ONE_ANCHOR, x: -10, z: 5 });
    const ev = step(w, cmd({ tether: true, anchor: 0 }), 30);
    expect(eventsOf(ev, 'tetherFail')).toEqual([{ type: 'tetherFail', robot: 0 }]);
    expect(eventsOf(ev, 'attach')).toHaveLength(0);
    expect(r.tState).toBe('ready');
    expect(r.tCd).toBe(0);
    expect(r.tAnchor).toBe(-1);
    expect(speedOf(r)).toBe(0);
  });

  it('a press with no previewed anchor (-1) or an out-of-table index fails the same way', () => {
    for (const anchor of [-1, 999]) {
      const { w, r } = soloWorld();
      const ev = step(w, cmd({ tether: true, anchor }), 5);
      expect(eventsOf(ev, 'tetherFail')).toHaveLength(1);
      expect(r.tState).toBe('ready');
      expect(r.tCd).toBe(0);
      expect(finiteRobot(r)).toBe(true);
    }
  });

  it('after a failed press the very next valid press attaches immediately (no cooldown was consumed)', () => {
    const { w, r } = gantryWorld();
    step(w, cmd({ tether: true, anchor: -1 }), 3);
    step(w, cmd({ tether: false }));
    expect(r.tState).toBe('ready');
    const ev = step(w, cmd({ tether: true, anchor: GANTRY_N }));
    expect(eventsOf(ev, 'attach')).toHaveLength(1);
    expect(r.tState).toBe('attached');
  });

  it('a stale hold does not attach later: once the press buffer has expired a fresh press is needed', () => {
    const { w, r } = soloWorld({ arena: ONE_ANCHOR, x: -10, z: 5 });
    step(w, cmd({ tether: true, anchor: 0 }), Math.ceil((T.pressBuffer + 0.1) * 60));
    // The anchor now comes into range while the button is still held from the failed press.
    r.x = 8;
    r.z = -5;
    expect(anchorInRange(w, r, 0)).toBe(true);
    const ev = step(w, cmd({ tether: true, anchor: 0 }), 30);
    expect(eventsOf(ev, 'attach')).toHaveLength(0);
    expect(r.tState).toBe('ready');
    // Fresh press works.
    step(w, cmd());
    step(w, cmd({ tether: true, anchor: 0 }));
    expect(r.tState).toBe('attached');
  });
});

describe('attached tether', () => {
  it('never retargets while held, whatever the previewed anchor or aim does', () => {
    const { w, r } = gantryWorld();
    step(w, cmd({ tether: true, anchor: GANTRY_N }));
    const rng = new Rng(3);
    const n = w.arena.anchors.length;
    const ev = step(
      w,
      () => cmd({ tether: true, anchor: rng.int(-1, n - 1), ax: rng.range(-20, 20), az: rng.range(-15, 15), mx: rng.range(-1, 1), mz: rng.range(-1, 1) }),
      100,
      () => {
        expect(r.tState).toBe('attached');
        expect(r.tAnchor).toBe(GANTRY_N);
      },
    );
    expect(eventsOf(ev, 'attach')).toHaveLength(0);
    expect(eventsOf(ev, 'release')).toHaveLength(0);
  });

  it('keeps the robot on the rope: distance to the anchor never exceeds the rope length', () => {
    const { w, r } = gantryWorld();
    step(w, cmd({ tether: true, anchor: GANTRY_N }));
    step(w, () => cmd({ tether: true, anchor: GANTRY_N, ...swingSteer(w, r) }), 100, () => {
      expect(radial(w, r).d).toBeLessThanOrEqual(r.tLen + 1e-6);
      expect(r.tLen).toBeGreaterThanOrEqual(T.minLength);
      expect(r.tLen).toBeLessThanOrEqual(T.maxLength);
    });
  });

  it('swing velocity is tangent to a taut rope on every tick', () => {
    for (const id of CHASSIS_ORDER) {
      const { w, r } = gantryWorld(CHASSIS[id]);
      step(w, cmd({ tether: true, anchor: GANTRY_N }));
      let tautTicks = 0;
      step(w, () => cmd({ tether: true, anchor: GANTRY_N, ...swingSteer(w, r) }), 100, () => {
        if (!r.tTaut) return;
        tautTicks++;
        const { nx, nz } = radial(w, r);
        expect(Math.abs(r.vx * nx + r.vz * nz)).toBeLessThan(1e-6 * Math.max(1, speedOf(r)));
      });
      expect(tautTicks).toBeGreaterThan(80);
    }
  });

  it('release preserves velocity: same speed and direction as just before, tangent to the rope', () => {
    for (const id of CHASSIS_ORDER) {
      const { w, r } = gantryWorld(CHASSIS[id]);
      step(w, cmd({ tether: true, anchor: GANTRY_N }));
      step(w, cmd({ tether: true, anchor: GANTRY_N }), 50);
      expect(r.tState).toBe('attached');
      expect(r.tTaut).toBe(true);
      const pre = { vx: r.vx, vz: r.vz };
      const preSpeed = speedOf(pre);
      // Fast enough that the release is a real launch (above run speed).
      expect(preSpeed).toBeGreaterThan(TUNING.robot.maxRunSpeed * 1.1);
      const { nx, nz } = radial(w, r);
      expect(Math.abs(pre.vx * nx + pre.vz * nz) / preSpeed).toBeLessThan(1e-6);

      // Release with the cursor pointing somewhere unrelated: the launch must not bend toward it.
      const ev = step(w, cmd({ tether: false, ax: -r.x * 3, az: 11 }));
      const rel = eventsOf(ev, 'release');
      expect(rel).toHaveLength(1);
      expect(rel[0].auto).toBe(false);
      expect(rel[0].speed).toBeCloseTo(preSpeed, 9);
      expect(r.tState).toBe('cooldown');

      const post = speedOf(r);
      // No boost, and no more loss than one tick of coasting drag.
      expect(post).toBeLessThanOrEqual(preSpeed + 1e-9);
      expect(post).toBeGreaterThanOrEqual(preSpeed - TUNING.robot.coastDecel * DT - 1e-9);
      const cross = (pre.vx * r.vz - pre.vz * r.vx) / (preSpeed * post);
      const dot = (pre.vx * r.vx + pre.vz * r.vz) / (preSpeed * post);
      expect(Math.abs(cross)).toBeLessThan(1e-9);
      expect(dot).toBeGreaterThan(0.999999);
      // Still perpendicular to the rope direction at the moment of release.
      expect(Math.abs(r.vx * nx + r.vz * nz) / post).toBeLessThan(1e-6);
    }
  });

  it('release never adds speed, even with full steering input on the release tick', () => {
    const { w, r } = gantryWorld();
    step(w, cmd({ tether: true, anchor: GANTRY_N }));
    step(w, () => cmd({ tether: true, anchor: GANTRY_N, ...swingSteer(w, r) }), 60);
    const pre = speedOf(r);
    const dir = Math.atan2(r.vz, r.vx);
    for (const [mx, mz] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
      const copy = soloWorld({ arena: SKY });
      Object.assign(copy.r, r);
      step(copy.w, cmd({ tether: false, mx, mz }));
      expect(speedOf(copy.r)).toBeLessThanOrEqual(pre + 1e-9);
      // Steering authority on one tick is small: the launch direction changes by a couple of degrees at most.
      let d = Math.atan2(copy.r.vz, copy.r.vx) - dir;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      expect(Math.abs(d)).toBeLessThan(0.06);
    }
  });

  it('swing speed never exceeds the tether speed cap, across chained swings on every chassis', () => {
    for (const id of CHASSIS_ORDER) {
      const { w, r } = gantryWorld(CHASSIS[id]);
      let max = 0;
      let letGo = false;
      let attaches = 0;
      for (let i = 0; i < 900; i++) {
        // Hold until auto-release, let go for one tick, press again (the press is buffered through the cooldown).
        const want = !letGo;
        letGo = false;
        const anchor = r.tState === 'attached' ? r.tAnchor : pickAnchor(w, r, r.x, r.z, -1);
        const steer = r.tState === 'attached' ? swingSteer(w, r) : { mx: 0, mz: 0 };
        const ev = step(w, cmd({ tether: want, anchor, ...steer }));
        attaches += eventsOf(ev, 'attach').length;
        if (eventsOf(ev, 'release').length) letGo = true;
        max = Math.max(max, speedOf(r));
        expect(speedOf(r)).toBeLessThanOrEqual(T.maxSpeed + 1e-9);
        expect(finiteRobot(r)).toBe(true);
        expect(robotInside(w, r)).toBe(true);
      }
      // The cap was actually reached, so the assertion above is meaningful.
      expect(max).toBeGreaterThan(T.maxSpeed - 0.05);
      expect(attaches).toBeGreaterThan(3);
    }
  });

  it('without a tether a robot never gets above run speed, so the cap can only be reached by swinging', () => {
    const { w, r } = soloWorld({ x: -10, z: 0 });
    step(w, cmd({ mx: 1 }), 120, () => expect(speedOf(r)).toBeLessThanOrEqual(TUNING.robot.maxRunSpeed + 1e-9));
  });
});

describe('auto-release and cooldown', () => {
  it('auto-releases at the hold limit and then needs a fresh press', () => {
    const { w, r } = gantryWorld();
    const hold = cmd({ tether: true, anchor: GANTRY_N });
    step(w, hold);
    const attachTick = r.lastAttachTick;
    const ev = step(w, hold, Math.ceil(T.maxHoldSeconds * 60) + 5);
    const rel = eventsOf(ev, 'release');
    expect(rel).toHaveLength(1);
    expect(rel[0].auto).toBe(true);
    const heldFor = (r.lastReleaseTick - attachTick) * DT;
    expect(heldFor).toBeGreaterThanOrEqual(T.maxHoldSeconds - DT - 1e-9);
    expect(heldFor).toBeLessThanOrEqual(T.maxHoldSeconds + 2 * DT);

    // Keep holding well past the cooldown: no re-attach.
    const later = step(w, () => cmd({ tether: true, anchor: pickAnchor(w, r, r.x, r.z, -1) }), 150);
    expect(eventsOf(later, 'attach')).toHaveLength(0);
    expect(r.tState).toBe('ready');

    // Let go, press again: attaches.
    step(w, cmd());
    const again = step(w, cmd({ tether: true, anchor: pickAnchor(w, r, r.x, r.z, -1) }));
    expect(eventsOf(again, 'attach')).toHaveLength(1);
    expect(r.tState).toBe('attached');
  });

  it('the auto-released swing keeps its velocity too (no impulse on auto-release)', () => {
    const { w, r } = gantryWorld();
    const hold = () => cmd({ tether: true, anchor: GANTRY_N, ...swingSteer(w, r) });
    step(w, cmd({ tether: true, anchor: GANTRY_N }));
    let pre = speedOf(r);
    let released = false;
    for (let i = 0; i < 130 && !released; i++) {
      pre = speedOf(r);
      const ev = step(w, hold());
      const rel = eventsOf(ev, 'release');
      if (rel.length) {
        released = true;
        expect(rel[0].auto).toBe(true);
        expect(rel[0].speed).toBeCloseTo(pre, 9);
        expect(speedOf(r)).toBeLessThanOrEqual(pre + 1e-9);
        expect(speedOf(r)).toBeGreaterThan(pre - 0.2);
      }
    }
    expect(released).toBe(true);
  });

  it('cooldown blocks re-attachment for cooldownSeconds after a manual release (a buffered press attaches afterwards)', () => {
    const { w, r } = gantryWorld();
    step(w, cmd({ tether: true, anchor: GANTRY_N }));
    step(w, cmd({ tether: true, anchor: GANTRY_N }), 20);
    const ev = step(w, cmd({ tether: false }));
    expect(eventsOf(ev, 'release')[0].auto).toBe(false);
    expect(r.tState).toBe('cooldown');
    const releaseTick = r.lastReleaseTick;

    // Press again straight away and hold.
    let attachedAt = -1;
    for (let i = 0; i < 60 && attachedAt < 0; i++) {
      const anchor = pickAnchor(w, r, r.x, r.z, -1);
      expect(anchor).not.toBe(-1);
      const e2 = step(w, cmd({ tether: true, anchor }));
      if (eventsOf(e2, 'attach').length) attachedAt = r.lastAttachTick;
      else expect(r.tState).not.toBe('attached');
    }
    expect(attachedAt).toBeGreaterThan(0);
    const gap = (attachedAt - releaseTick) * DT;
    expect(gap).toBeGreaterThanOrEqual(T.cooldownSeconds - DT - 1e-9);
    expect(gap).toBeLessThanOrEqual(T.cooldownSeconds + 4 * DT);
  });

  it('mashing the button during the cooldown cannot attach early', () => {
    const { w, r } = gantryWorld();
    step(w, cmd({ tether: true, anchor: GANTRY_N }));
    step(w, cmd({ tether: true, anchor: GANTRY_N }), 20);
    step(w, cmd({ tether: false }));
    const releaseTick = r.lastReleaseTick;
    let attachedAt = -1;
    for (let i = 0; i < 60 && attachedAt < 0; i++) {
      const ev = step(w, cmd({ tether: i % 2 === 0, anchor: pickAnchor(w, r, r.x, r.z, -1) }));
      if (eventsOf(ev, 'attach').length) attachedAt = r.lastAttachTick;
    }
    // It does attach again eventually, but never inside the cooldown window.
    expect(attachedAt).toBeGreaterThan(releaseTick);
    expect((attachedAt - releaseTick) * DT).toBeGreaterThanOrEqual(T.cooldownSeconds - DT - 1e-9);
  });
});

describe('rope stability', () => {
  it('stays finite when attaching exactly at the anchor point (zero rope distance)', () => {
    const a = SKY.anchors[GANTRY_N];
    const { w, r } = soloWorld({ arena: SKY, x: a.x, z: a.z });
    const ev = step(w, cmd({ tether: true, anchor: GANTRY_N }), 150, () => {
      expect(finiteRobot(r)).toBe(true);
      expect(robotInside(w, r)).toBe(true);
      expect(speedOf(r)).toBeLessThanOrEqual(T.maxSpeed + 1e-9);
    });
    expect(eventsOf(ev, 'attach')).toHaveLength(1);
  });

  it('stays finite inside the minimum radius, including sitting still on the anchor with the rope held', () => {
    const a = SKY.anchors[GANTRY_N];
    for (const off of [0, 1e-7, 1e-3, 0.5, T.minLength - 0.01, T.minLength, T.minLength + 0.01]) {
      const { w, r } = soloWorld({ arena: SKY, x: a.x + off, z: a.z });
      step(w, cmd({ tether: true, anchor: GANTRY_N }));
      expect(r.tState).toBe('attached');
      expect(r.tLen).toBeGreaterThanOrEqual(T.minLength);
      step(w, cmd({ tether: true, anchor: GANTRY_N }), 140, () => {
        expect(finiteRobot(r)).toBe(true);
        expect(robotInside(w, r)).toBe(true);
        expect(speedOf(r)).toBeLessThanOrEqual(T.maxSpeed + 1e-9);
      });
    }
  });

  it('stays stable when driven hard toward the anchor for several seconds, for every anchor of every arena', () => {
    for (const id of ARENA_ORDER) {
      const arena = ARENAS[id];
      arena.anchors.forEach((a, idx) => {
        // Start a few units from the anchor on the side facing the centre of the field.
        const toC = Math.hypot(a.x, a.z) || 1;
        const sx = a.x - (a.x / toC) * 5 + (a.x === 0 && a.z === 0 ? 3 : 0);
        const sz = a.z - (a.z / toC) * 5;
        const { w, r } = soloWorld({ arena, x: sx, z: sz, park: a.x > 0 ? -1 : 1 });
        expect(anchorInRange(w, r, idx)).toBe(true);
        let pressed = false;
        for (let i = 0; i < 300; i++) {
          const dx = a.x - r.x;
          const dz = a.z - r.z;
          const d = Math.hypot(dx, dz) || 1;
          // Re-press whenever the rope has let go, to keep exercising attach at short range.
          const want: boolean = r.tState === 'attached' || !pressed;
          step(w, cmd({ tether: want, anchor: idx, mx: dx / d, mz: dz / d, ax: a.x, az: a.z }));
          pressed = want;
          expect(finiteRobot(r)).toBe(true);
          expect(robotInside(w, r)).toBe(true);
          expect(speedOf(r)).toBeLessThanOrEqual(T.maxSpeed + 1e-9);
          if (r.tState === 'attached') expect(r.tLen).toBeGreaterThanOrEqual(T.minLength);
        }
      });
    }
  });

  it('a rail anchor never drags the robot outside the arena during wild swings', () => {
    const rng = new Rng(99);
    for (const id of ARENA_ORDER) {
      const { w, r } = soloWorld({ arena: ARENAS[id], x: 0, z: 0, park: 0 });
      w.goalsOpen = false; // keep the loose ball in play as an obstacle
      let c = cmd();
      for (let i = 0; i < 1500; i++) {
        if (i % 12 === 0) {
          c = cmd({ mx: rng.range(-1, 1), mz: rng.range(-1, 1), tether: rng.chance(0.75), ax: rng.range(-w.hx, w.hx), az: rng.range(-w.hz, w.hz), kick: rng.chance(0.2) });
        }
        c.anchor = r.tState === 'attached' ? r.tAnchor : pickAnchor(w, r, c.ax, c.az, c.anchor);
        step(w, c);
        c.kick = false;
        expect(finiteRobot(r)).toBe(true);
        expect(robotInside(w, r)).toBe(true);
        expect(speedOf(r)).toBeLessThanOrEqual(T.maxSpeed + 1e-9);
      }
    }
  });
});

describe('pause-style detach', () => {
  it('detach(w, r, false, false) leaves velocity untouched and emits nothing', () => {
    const { w, r } = gantryWorld();
    step(w, cmd({ tether: true, anchor: GANTRY_N }));
    step(w, () => cmd({ tether: true, anchor: GANTRY_N, ...swingSteer(w, r) }), 45);
    const before = { x: r.x, z: r.z, vx: r.vx, vz: r.vz };
    const events = w.events.length;
    detach(w, r, false, false);
    expect({ x: r.x, z: r.z, vx: r.vx, vz: r.vz }).toEqual(before);
    expect(w.events.length).toBe(events);
    expect(r.tState).toBe('cooldown');
    expect(r.tCd).toBe(T.cooldownSeconds);
  });

  it('resuming after a pause-detach gives no free boost and no silent re-attach while the button is still held', () => {
    const { w, r } = gantryWorld();
    step(w, cmd({ tether: true, anchor: GANTRY_N }));
    step(w, () => cmd({ tether: true, anchor: GANTRY_N, ...swingSteer(w, r) }), 45);
    const pre = speedOf(r);
    detach(w, r, false, false);
    let last = pre;
    const ev = step(w, cmd({ tether: true, anchor: GANTRY_N }), 90, () => {
      const s = speedOf(r);
      expect(s).toBeLessThanOrEqual(last + 1e-9);
      last = s;
    });
    expect(eventsOf(ev, 'attach')).toHaveLength(0);
    expect(r.tState).toBe('ready');
  });

  it('detach is a no-op for a robot that is not attached (cannot be used to start a cooldown)', () => {
    const { w, r } = gantryWorld();
    detach(w, r, false, false);
    expect(r.tState).toBe('ready');
    expect(r.tCd).toBe(0);
  });
});
