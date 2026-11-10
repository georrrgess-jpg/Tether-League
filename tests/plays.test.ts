import { describe, expect, it } from 'vitest';
import { Match, type MatchEvent } from '../src/game/sim/match';
import { emptyCommand, type Command, type SimEvent } from '../src/game/sim/types';
import { createRobot, createWorld, lobCarry, lobPlan, placeBall, placeRobot, stepWorld } from '../src/game/sim/world';
import { ARENAS, CHASSIS, HZ, TUNING } from './helpers';

const K = TUNING.kick;
const B = TUNING.ball;

/** Me (0) with the ball on the left, teammate (1) up the pitch, opponent (2) standing in the lane. */
function longBallSetup() {
  const me = createRobot(0, 0, 0, CHASSIS.all_rounder, true);
  const mate = createRobot(1, 0, 1, CHASSIS.all_rounder);
  const opp = createRobot(2, 1, 0, CHASSIS.all_rounder);
  const w = createWorld(ARENAS.harbor_park, [me, mate, opp]);
  placeRobot(me, -9, 0, 0);
  placeRobot(mate, 7, 2, Math.PI);
  placeRobot(opp, -1, 0.8, Math.PI);
  placeBall(w, -8.2, 0);
  return { w, me, mate, opp };
}

function longBall(charge: number | 'ideal') {
  const s = longBallSetup();
  const plan = lobPlan(s.w, s.me)!;
  const c = emptyCommand();
  c.pass = true;
  c.lob = charge === 'ideal' ? plan.ideal : charge;
  const idle = [emptyCommand(), emptyCommand()];
  stepWorld(s.w, [c, ...idle]);
  const kick = s.w.events.find((e) => e.type === 'kick') as Extract<SimEvent, { type: 'kick' }>;
  // Fly until the first touchdown; note any robot touches on the way.
  let landed: { x: number; z: number } | null = null;
  const touchedBy = new Set<number>();
  let maxH = 0;
  let hOverOpp = 0;
  for (let i = 0; i < 4 * HZ && !landed; i++) {
    stepWorld(s.w, [emptyCommand(), ...idle]);
    maxH = Math.max(maxH, s.w.ball.h);
    if (Math.abs(s.w.ball.x - s.opp.x) < 0.4) hOverOpp = Math.max(hOverOpp, s.w.ball.h);
    for (const e of s.w.events) {
      if (e.type === 'touch') touchedBy.add(e.robot);
      if (e.type === 'land' && !landed) landed = { x: e.x, z: e.z };
      // Dropping onto the teammate counts as arriving there (cushioned first touch).
      if (e.type === 'touch' && e.robot === s.mate.id && !landed) landed = { x: s.w.ball.x, z: s.w.ball.z };
    }
  }
  return { ...s, plan, kick, landed: landed!, touchedBy, maxH, hOverOpp };
}

describe('long ball', () => {
  it('a perfectly weighted long ball sails over the defender and lands on the teammate run', () => {
    const r = longBall('ideal');
    expect(r.kick.lob).toBe(true);
    expect(r.kick.perfect).toBe(true);
    expect(r.hOverOpp).toBeGreaterThan(B.headHeight);
    expect(r.touchedBy.has(r.opp.id)).toBe(false);
    expect(Math.hypot(r.landed.x - r.plan.x, r.landed.z - r.plan.z)).toBeLessThan(1.6);
  });

  it('a badly weighted one drops short (undercharged) or sails long (overcharged): it takes skill', () => {
    const plan = lobPlan(longBallSetup().w, longBallSetup().me)!;
    const short = longBall(Math.max(0.01, plan.ideal - 0.3));
    const long = longBall(Math.min(1, plan.ideal + 0.3));
    expect(short.kick.perfect).toBe(false);
    expect(long.kick.perfect).toBe(false);
    const dShort = Math.hypot(short.landed.x - short.w.robots[0].x, short.landed.z - short.w.robots[0].z);
    const dLong = Math.hypot(long.landed.x - long.w.robots[0].x, long.landed.z - long.w.robots[0].z);
    expect(dShort).toBeLessThan(plan.dist - 3);
    expect(dLong).toBeGreaterThan(plan.dist + 3);
  });

  it('carry grows with charge across the documented range', () => {
    expect(lobCarry(0)).toBe(K.lobMin);
    expect(lobCarry(1)).toBe(K.lobMax);
    expect(lobCarry(0.5)).toBeCloseTo((K.lobMin + K.lobMax) / 2);
  });

  it('a ball in the air above head height can be neither touched nor kicked', () => {
    const me = createRobot(0, 0, 0, CHASSIS.all_rounder, true);
    const w = createWorld(ARENAS.harbor_park, [me]);
    placeRobot(me, 0, 0, 0);
    placeBall(w, 0.9, 0);
    w.ball.h = B.headHeight + 0.6;
    w.ball.vh = 0;
    const c = emptyCommand();
    c.kick = true;
    c.ax = 10;
    stepWorld(w, [c]);
    expect(w.events.some((e) => e.type === 'kick' || e.type === 'touch')).toBe(false);
  });

  it('a lofted ball above the crossbar cannot score; it comes back off the frame', () => {
    const me = createRobot(0, 0, 0, CHASSIS.all_rounder, true);
    const w = createWorld(ARENAS.harbor_park, [me]);
    placeRobot(me, -10, 0, 0);
    placeBall(w, w.hx - 1.5, 0, 9, 0);
    w.ball.h = B.crossbar + 1.5;
    w.ball.vh = 2;
    let goal = false;
    for (let i = 0; i < HZ; i++) {
      stepWorld(w, [emptyCommand()]);
      if (w.events.some((e) => e.type === 'goal')) goal = true;
    }
    expect(goal).toBe(false);
    expect(w.ball.vx).toBeLessThan(0);
  });

  it('a lofted ball settles: it bounces lower each time and ends up rolling', () => {
    const r = longBall('ideal');
    for (let i = 0; i < 3 * HZ; i++) stepWorld(r.w, [emptyCommand(), emptyCommand(), emptyCommand()]);
    expect(r.w.ball.h).toBe(0);
    expect(r.w.ball.vh).toBe(0);
  });
});

describe('plays are detected and credited by the match', () => {
  /** A 2v2 match in play with the opponents parked far away. */
  function playMatch() {
    const c = CHASSIS.all_rounder;
    const m = new Match({ arena: ARENAS.harbor_park, chassis: [c, c, c, c], human: 0, assist: 1, regulationSeconds: 180 });
    for (let i = 0; i < 6 * HZ && m.phase !== 'play'; i++) m.step([emptyCommand(), emptyCommand(), emptyCommand(), emptyCommand()]);
    expect(m.phase).toBe('play');
    const w = m.world;
    placeRobot(w.robots[2], 12, 8, Math.PI);
    placeRobot(w.robots[3], 12, -8, Math.PI);
    return m;
  }
  const idle = (): Command[] => [emptyCommand(), emptyCommand(), emptyCommand(), emptyCommand()];

  it('pass, pass back: a give-and-go for the runner', () => {
    const m = playMatch();
    const w = m.world;
    placeRobot(w.robots[0], -6, 0, 0);
    placeRobot(w.robots[1], 2, 4, Math.PI);
    placeBall(w, -5.2, 0);
    const events: MatchEvent[] = [];
    const step = (cmds: Command[]) => {
      m.step(cmds);
      events.push(...m.events);
    };
    const pass0 = idle();
    pass0[0].pass = true;
    step(pass0);
    // Wait for the teammate to collect, then it returns the ball (give-and-go lead) to robot 0.
    for (let i = 0; i < 3 * HZ && !events.some((e) => e.type === 'pass'); i++) step(idle());
    expect(events.some((e) => e.type === 'pass' && e.from === 0 && e.to === 1)).toBe(true);
    const back = idle();
    back[1].pass = true;
    back[1].giveGo = true;
    for (let i = 0; i < 12; i++) step(i === 0 ? back : idle());
    for (let i = 0; i < 3 * HZ && !events.some((e) => e.type === 'play'); i++) step(idle());
    const play = events.find((e) => e.type === 'play') as Extract<MatchEvent, { type: 'play' }>;
    expect(play?.play).toBe('give_and_go');
    expect(play.robot).toBe(0);
    expect(m.stats[0].giveAndGos).toBe(1);
  });
});

describe('receiving a long ball', () => {
  it('a long ball that drops onto the teammate is cushioned: touched, at their feet, not through them', () => {
    const me = createRobot(0, 0, 0, CHASSIS.all_rounder, true);
    const mate = createRobot(1, 0, 1, CHASSIS.all_rounder);
    const w = createWorld(ARENAS.harbor_park, [me, mate]);
    placeRobot(me, -9, 1, 0);
    placeRobot(mate, 7, 3, Math.PI);
    placeBall(w, -8.2, 1);
    const c = emptyCommand();
    c.pass = true;
    c.lob = lobPlan(w, me)!.ideal;
    stepWorld(w, [c, emptyCommand()]);
    let touched = false;
    for (let i = 0; i < 3 * HZ && !touched; i++) {
      stepWorld(w, [emptyCommand(), emptyCommand()]);
      touched = w.events.some((e) => e.type === 'touch' && e.robot === 1);
    }
    expect(touched).toBe(true);
    for (let i = 0; i < HZ; i++) stepWorld(w, [emptyCommand(), emptyCommand()]);
    expect(Math.hypot(w.ball.x - mate.x, w.ball.z - mate.z)).toBeLessThan(3);
  });
});
