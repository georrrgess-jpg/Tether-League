import { describe, expect, it } from 'vitest';
import { ARENAS } from '../src/content/arenas';
import { CHASSIS } from '../src/content/chassis';
import { TUNING } from '../src/content/tuning';
import { BotDirector, CLUB_STYLE, DIFFICULTY } from '../src/game/ai/bot';
import { emptyCommand, type SimEvent } from '../src/game/sim/types';
import { createRobot, createWorld, placeBall, placeRobot, stepWorld } from '../src/game/sim/world';
import { runBalance } from '../tools/balance';

const K = TUNING.kick;

function solo(assist: 0 | 1 | 2 = 1) {
  const r = createRobot(0, 0, 0, CHASSIS.all_rounder, true);
  r.assist = assist;
  const w = createWorld(ARENAS.harbor_park, [r]);
  placeRobot(r, 0, 0, 0);
  placeBall(w, 0.9, 0);
  return { w, r };
}

const kickOf = (ev: SimEvent[]) => ev.find((e) => e.type === 'kick') as Extract<SimEvent, { type: 'kick' }> | undefined;

describe('kick mashing', () => {
  it('a single deliberate press is a clean full kick', () => {
    const { w } = solo(0);
    const c = emptyCommand();
    c.kick = true;
    c.ax = 10;
    c.az = 0;
    stepWorld(w, [c]);
    const k = kickOf(w.events)!;
    expect(k.rushed).toBe(false);
    expect(k.speed).toBeCloseTo(K.baseSpeed, 6);
    expect(Math.abs(w.ball.vz)).toBeLessThan(1e-9);
  });

  it('a quick double tap is still clean', () => {
    const { w, r } = solo(0);
    placeBall(w, 5, 0);
    const c = emptyCommand();
    c.ax = 10;
    for (let i = 0; i < 12; i++) {
      c.kick = i === 0 || i === 6;
      stepWorld(w, [c]);
    }
    placeBall(w, r.x + 0.9, r.z);
    c.kick = true;
    stepWorld(w, [c]);
    expect(kickOf(w.events)!.rushed).toBe(false);
  });

  it('mashing the button scuffs the kick: weaker, off target, and a longer recovery', () => {
    const { w, r } = solo(0);
    placeBall(w, 6, 0);
    const c = emptyCommand();
    c.ax = 10;
    c.az = 0;
    for (let i = 0; i < 40; i++) {
      c.kick = i % 7 === 0; // about 8.5 presses a second
      stepWorld(w, [c]);
    }
    placeBall(w, r.x + 0.9, r.z);
    c.kick = true;
    stepWorld(w, [c]);
    const k = kickOf(w.events)!;
    expect(k.rushed).toBe(true);
    expect(k.speed).toBeLessThan(K.baseSpeed * K.rushedPower + 1e-6);
    expect(r.kickCd).toBeCloseTo(K.rushedCooldown, 6);
  });

  it('bots never mash (they press once per kick)', () => {
    const c = CHASSIS.all_rounder;
    const robots = [0, 1, 2, 3].map((i) => createRobot(i, i < 2 ? 0 : 1, i % 2, c));
    const w = createWorld(ARENAS.harbor_park, robots);
    placeRobot(robots[0], -5, -2, 0);
    placeRobot(robots[1], -9, 3, 0);
    placeRobot(robots[2], 5, 2, Math.PI);
    placeRobot(robots[3], 9, -3, Math.PI);
    placeBall(w, 0, 0);
    const bots = new BotDirector(w, [0, 1, 2, 3].map((robot) => ({ robot, difficulty: DIFFICULTY.pro, style: CLUB_STYLE.pressure })), 8);
    const cmds = robots.map(() => emptyCommand());
    let kicks = 0;
    for (let i = 0; i < 60 * 60; i++) {
      bots.update(cmds);
      stepWorld(w, cmds);
      for (const e of w.events) if (e.type === 'kick') {
        kicks++;
        expect(e.rushed).toBe(false);
      }
      if (w.goalLatch) placeBall(w, 0, 0);
    }
    expect(kicks).toBeGreaterThan(20);
  });
});

describe('own-goal guard', () => {
  function kickTowardOwnGoal(assist: 0 | 1 | 2) {
    const r = createRobot(0, 0, 0, CHASSIS.all_rounder, true);
    r.assist = assist;
    const w = createWorld(ARENAS.harbor_park, [r]);
    placeRobot(r, -8, 0, Math.PI);
    placeBall(w, -8.9, 0);
    const c = emptyCommand();
    c.kick = true;
    c.ax = -w.hx;
    c.az = 0.5; // straight at our own goal
    stepWorld(w, [c]);
    let ownGoal = false;
    for (let i = 0; i < 180; i++) {
      stepWorld(w, [emptyCommand()]);
      if (w.events.some((e) => e.type === 'goal' && e.side === 0)) ownGoal = true;
    }
    return ownGoal;
  }

  it('with aim assist on, a kick aimed into our own goal becomes a clearance', () => {
    expect(kickTowardOwnGoal(1)).toBe(false);
    expect(kickTowardOwnGoal(2)).toBe(false);
  });

  it('with aim assist off an own goal is still possible', () => {
    expect(kickTowardOwnGoal(0)).toBe(true);
  });
});

describe('scoring balance (seeded bot matches)', () => {
  it('mashing at human speed does not beat the middle division', () => {
    const r = runBalance(6, 'mash', 1, 'harbor_park', 900);
    expect(r.wins / r.n).toBeLessThanOrEqual(0.5);
    expect(r.playerGoals / r.n).toBeLessThan(2);
  });

  it('matches stay in a sensible scoring range and own goals are rare', () => {
    const r = runBalance(6, 'club', 1, 'harbor_park', 950);
    const perMatch = (r.gf + r.ga) / r.n;
    expect(perMatch).toBeGreaterThan(1.5);
    expect(perMatch).toBeLessThan(8);
    expect((r.ownFor + r.ownAgainst) / Math.max(1, r.gf + r.ga)).toBeLessThan(0.08);
  });
});
