import { describe, expect, it } from 'vitest';
import { ARENAS } from '../src/content/arenas';
import { CHASSIS } from '../src/content/chassis';
import { TUNING } from '../src/content/tuning';
import { BotDirector, CLUB_STYLE, DIFFICULTY } from '../src/game/ai/bot';
import { Rng } from '../src/game/sim/rng';
import { emptyCommand, type SimEvent } from '../src/game/sim/types';
import { createRobot, createWorld, placeBall, placeRobot, stepWorld } from '../src/game/sim/world';
import { swingStart } from '../tools/swingdir';

const K = TUNING.kick;

function duo() {
  const me = createRobot(0, 0, 0, CHASSIS.all_rounder, true);
  const mate = createRobot(1, 0, 1, CHASSIS.all_rounder);
  const w = createWorld(ARENAS.harbor_park, [me, mate]);
  placeRobot(me, -2, 0, 0);
  placeRobot(mate, 6, -5, 0);
  placeBall(w, -1.2, 0);
  return { w, me, mate };
}

describe('pass button', () => {
  it('sends a weighted pass at the teammate, whatever the aim', () => {
    const { w, mate } = duo();
    const c = emptyCommand();
    c.pass = true;
    c.ax = -15; // aiming the other way entirely
    c.az = 9;
    stepWorld(w, [c, emptyCommand()]);
    const kick = w.events.find((e) => e.type === 'kick') as Extract<SimEvent, { type: 'kick' }>;
    expect(kick).toBeTruthy();
    expect(kick.pass).toBe(true);
    expect(kick.target).toBe(1);
    const b = w.ball;
    const dx = mate.x - b.x;
    const dz = mate.z - b.z;
    const cos = (b.vx * dx + b.vz * dz) / (Math.hypot(b.vx, b.vz) * Math.hypot(dx, dz));
    expect(cos).toBeGreaterThan(0.99);
    expect(Math.hypot(b.vx, b.vz)).toBeLessThanOrEqual(K.passBase + K.passPerUnit * Math.hypot(dx, dz) + 0.6);
  });

  it('leads a moving teammate', () => {
    const { w, mate } = duo();
    mate.vz = 5; // running "down" the pitch
    const c = emptyCommand();
    c.pass = true;
    stepWorld(w, [c, emptyCommand()]);
    const b = w.ball;
    // aimed ahead of the teammate's current position in their direction of travel
    const angBall = Math.atan2(b.vz, b.vx);
    const angMate = Math.atan2(mate.z - b.z, mate.x - b.x);
    expect(angBall).toBeGreaterThan(angMate);
  });

  it('is buffered so a press just before the ball arrives still passes', () => {
    const { w, me } = duo();
    placeBall(w, 0.4, 0, -6, 0); // rolling toward the player, not yet in reach
    const c = emptyCommand();
    c.pass = true;
    stepWorld(w, [c, emptyCommand()]);
    expect(w.events.some((e) => e.type === 'kick')).toBe(false);
    c.pass = false;
    let passed = false;
    for (let i = 0; i < Math.round(K.passBufferSeconds * 60); i++) {
      stepWorld(w, [c, emptyCommand()]);
      if (w.events.some((e) => e.type === 'kick' && e.pass)) passed = true;
    }
    expect(passed).toBe(true);
    expect(me.kickPass).toBe(false);
  });

  it('with no teammate it is an ordinary kick toward the aim', () => {
    const r = createRobot(0, 0, 0, CHASSIS.all_rounder, true);
    const w = createWorld(ARENAS.harbor_park, [r]);
    placeRobot(r, 0, 0, 0);
    placeBall(w, 0.9, 0);
    const c = emptyCommand();
    c.pass = true;
    c.ax = 10;
    c.az = 0;
    stepWorld(w, [c]);
    const kick = w.events.find((e) => e.type === 'kick') as Extract<SimEvent, { type: 'kick' }>;
    expect(kick.pass).toBe(false);
    expect(w.ball.vx).toBeGreaterThan(0);
  });

  it('calling for the ball makes the bot teammate pass to the player', () => {
    const me = createRobot(0, 0, 0, CHASSIS.all_rounder, true);
    const mate = createRobot(1, 0, 1, CHASSIS.all_rounder);
    const w = createWorld(ARENAS.harbor_park, [me, mate]);
    placeRobot(me, 4, 6, 0);
    placeRobot(mate, -6, -2, 0);
    placeBall(w, -5, -2);
    const bots = new BotDirector(w, [{ robot: 1, difficulty: DIFFICULTY.club, style: CLUB_STYLE.balanced }], 3);
    const cmds = [emptyCommand(), emptyCommand()];
    bots.requestPass(0);
    let passTo = -1;
    for (let i = 0; i < 90 && passTo < 0; i++) {
      bots.update(cmds);
      stepWorld(w, cmds);
      for (const e of w.events) if (e.type === 'kick' && e.robot === 1) passTo = e.pass ? e.target : -2;
    }
    expect(passTo).toBe(0);
  });
});

describe('swings start forward', () => {
  it('tap or hold, standing or running, the swing never starts away from the target', () => {
    const rng = new Rng(5);
    let attached = 0;
    let backwards = 0;
    for (let k = 0; k < 120; k++) {
      const sx = rng.range(-13, 13), sz = rng.range(-8.5, 8.5), tx = rng.range(-13, 13), tz = rng.range(-8.5, 8.5);
      if (Math.hypot(tx - sx, tz - sz) < 5) continue;
      for (const [run, hold] of [[0, false], [25, false], [25, true]] as [number, boolean][]) {
        const res = swingStart('harbor_park', sx, sz, tx, tz, run, hold);
        if (!res.attached) continue;
        attached++;
        if (res.avgDot < 0 || res.minDot < -0.3) backwards++;
      }
    }
    expect(attached).toBeGreaterThan(150);
    expect(backwards).toBe(0);
  });

  it('a planned direction wins over momentum the other way round the anchor', () => {
    const r = createRobot(0, 0, 0, CHASSIS.all_rounder, true);
    const w = createWorld(ARENAS.harbor_park, [r]);
    placeRobot(r, -3.5, 4, 0);
    placeBall(w, 15.5, 0);
    w.goalLatch = true;
    r.vx = -5; // running "west"
    const anchor = ARENAS.harbor_park.anchors.findIndex((a) => a.id === 'south_1'); // directly "south" of the robot
    const c = emptyCommand();
    c.tether = true;
    c.anchor = anchor;
    c.swingDir = 1; // the dir that starts moving "east" here
    stepWorld(w, [c]);
    expect(r.tState).toBe('attached');
    expect(r.vx).toBeGreaterThan(0);
  });
});

describe('wall pass and one-touch finish', () => {
  it('banks the pass off a side wall when an opponent blocks the straight lane, and it reaches the teammate', () => {
    const me = createRobot(0, 0, 0, CHASSIS.all_rounder, true);
    const mate = createRobot(1, 0, 1, CHASSIS.all_rounder);
    const opp = createRobot(2, 1, 0, CHASSIS.all_rounder);
    const w = createWorld(ARENAS.harbor_park, [me, mate, opp]);
    // Wing play: both near the touchline, an opponent standing in the straight lane.
    placeRobot(me, -6, 5, 0);
    placeRobot(mate, 6, 5, Math.PI);
    placeRobot(opp, 0, 5, Math.PI);
    placeBall(w, -5.2, 5);
    const c = emptyCommand();
    c.pass = true;
    stepWorld(w, [c, emptyCommand(), emptyCommand()]);
    const kick = w.events.find((e) => e.type === 'kick') as Extract<SimEvent, { type: 'kick' }>;
    expect(kick?.bank).toBe(true);
    // The ball goes wide of the blocker and arrives close to the teammate.
    let closest = Infinity;
    let wall = false;
    for (let i = 0; i < 240; i++) {
      stepWorld(w, [emptyCommand(), emptyCommand(), emptyCommand()]);
      if (w.events.some((e) => e.type === 'wall')) wall = true;
      closest = Math.min(closest, Math.hypot(w.ball.x - mate.x, w.ball.z - mate.z));
      if (closest < 1.2) break;
    }
    expect(wall).toBe(true);
    expect(closest).toBeLessThan(1.2);
  });

  it('passes straight when the lane is open', () => {
    const { w } = duo();
    const c = emptyCommand();
    c.pass = true;
    stepWorld(w, [c, emptyCommand()]);
    const kick = w.events.find((e) => e.type === 'kick') as Extract<SimEvent, { type: 'kick' }>;
    expect(kick.bank).toBe(false);
  });

  it('a first-time shot off a teammate pass is a one-touch finish with extra pace', () => {
    const shot = (fromPass: boolean) => {
      const me = createRobot(0, 0, 0, CHASSIS.all_rounder, true);
      const mate = createRobot(1, 0, 1, CHASSIS.all_rounder);
      const w = createWorld(ARENAS.harbor_park, [me, mate]);
      placeRobot(me, 6, 0, 0);
      placeRobot(mate, -6, 4, 0);
      placeBall(w, 6.9, 0);
      if (fromPass) {
        w.ball.passBy = mate.id;
        w.ball.passTick = w.tick;
      }
      const c = emptyCommand();
      c.kick = true;
      c.ax = w.hx;
      c.az = 0;
      stepWorld(w, [c, emptyCommand()]);
      return w.events.find((e) => e.type === 'kick') as Extract<SimEvent, { type: 'kick' }>;
    };
    const plain = shot(false);
    const first = shot(true);
    expect(plain.oneTouch).toBe(false);
    expect(first.oneTouch).toBe(true);
    expect(first.speed).toBeGreaterThan(plain.speed * 1.08);
  });
});
