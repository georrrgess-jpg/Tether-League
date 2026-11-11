import { describe, expect, it } from 'vitest';
import { emptyCommand, type Command, type SimEvent, type World } from '../src/game/sim/types';
import { createRobot, createWorld, megWindow, placeBall, placeRobot, stepWorld } from '../src/game/sim/world';
import { ARENAS, CHASSIS, HZ, R, RB, TUNING } from './helpers';

const M = TUNING.meg;

/** Attacker (0) running right with the ball at its feet; a defender (1, other team) ahead on the line. */
function setup(defX = 2.9, defZ = 0, defVx = 0) {
  const me = createRobot(0, 0, 0, CHASSIS.all_rounder, true);
  const def = createRobot(1, 1, 0, CHASSIS.all_rounder);
  const w = createWorld(ARENAS.championship_dome, [me, def]);
  placeRobot(me, 0, 0, 0);
  placeRobot(def, defX, defZ, Math.PI);
  me.vx = TUNING.robot.maxRunSpeed;
  me.mx = 1;
  def.vx = defVx;
  placeBall(w, 1.1, 0, TUNING.robot.maxRunSpeed, 0);
  return { w, me, def };
}

const run = (): Command => {
  const c = emptyCommand();
  c.mx = 1;
  return c;
};

/** Presses the skill touch on a given tick offset (the roll is seeded by tick), returns the meg event. */
function attempt(tickOffset: number, defVx = -5) {
  // Start further back by the distance the two close in tickOffset ticks, so every press is near the sweet spot.
  const s = setup(2.9 + (tickOffset * (TUNING.robot.maxRunSpeed - defVx)) / HZ, 0, defVx);
  const hold = emptyCommand();
  hold.mx = -1; // the defender keeps charging
  for (let i = 0; i < tickOffset; i++) stepWorld(s.w, [run(), hold]);
  const c = run();
  c.meg = true;
  stepWorld(s.w, [c, hold]);
  const ev = s.w.events.find((e) => e.type === 'meg') as Extract<SimEvent, { type: 'meg' }> | undefined;
  return { ...s, ev };
}

function firstWith(success: boolean) {
  for (let t = 0; t < 40; t++) {
    const a = attempt(t);
    if (a.ev && a.ev.success === success) return a;
  }
  throw new Error(`no ${success ? 'successful' : 'failed'} meg found`);
}

function stepBoth(w: World, n: number, c1: Command = emptyCommand()): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    stepWorld(w, [run(), c1]);
    out.push(...w.events);
  }
  return out;
}

describe('nutmeg window', () => {
  it('is on only with the ball at your feet and a defender in the window on your line', () => {
    const on = setup();
    expect(megWindow(on.w, on.me)?.victim.id).toBe(1);
    const far = setup(1.1 + M.maxAhead + 0.5);
    expect(megWindow(far.w, far.me)).toBeNull();
    const wide = setup(2.9, M.width + 0.3);
    expect(megWindow(wide.w, wide.me)).toBeNull();
    const noBall = setup();
    placeBall(noBall.w, -6, 4);
    expect(megWindow(noBall.w, noBall.me)).toBeNull();
    const mate = setup();
    mate.def.team = 0;
    expect(megWindow(mate.w, mate.me)).toBeNull();
  });

  it('the chance rewards a committed defender, good timing and a straight line; a sideways shuffle shuts it', () => {
    const st = setup(2.9, 0, 0);
    const standing = megWindow(st.w, st.me)!;
    const charging = setup(2.9, 0, -5);
    const c = megWindow(charging.w, charging.me)!;
    expect(c.chance).toBeGreaterThan(standing.chance + 0.25);
    expect(c.chance).toBeLessThanOrEqual(M.maxChance);
    const offLine = setup(2.9, 0.45, -5);
    expect(megWindow(offLine.w, offLine.me)!.chance).toBeLessThan(c.chance - 0.1);
    const early = setup(1.1 + M.maxAhead - 0.05, 0, -5);
    expect(megWindow(early.w, early.me)!.chance).toBeLessThan(c.chance - 0.1);
    const shuffling = setup(2.9, 0, 0);
    shuffling.def.vz = 4.5;
    expect(megWindow(shuffling.w, shuffling.me)!.chance).toBeLessThan(standing.chance - 0.15);
    for (const w of [standing, c]) expect(w.chance).toBeGreaterThanOrEqual(M.minChance);
  });
});

describe('nutmeg attempt', () => {
  it('success: the ball and the attacker go through the defender, who is wrong-footed and briefly immune', () => {
    const a = firstWith(true);
    const { w, me, def } = a;
    expect(def.megged).toBeGreaterThan(0);
    expect(w.ball.megId).toBe(def.id);
    expect(me.phaseId).toBe(def.id);
    // The defender keeps coming; neither the ball nor the attacker is stopped by them.
    const hold = emptyCommand();
    hold.mx = -1;
    const ev = stepBoth(w, Math.round(1.2 * HZ), hold);
    expect(ev.some((e) => (e.type === 'touch' && e.robot === def.id) || e.type === 'bump')).toBe(false);
    expect(w.ball.x).toBeGreaterThan(def.x + R + RB);
    expect(me.x).toBeGreaterThan(def.x + R);
    expect(w.ball.megId).toBe(-1);
    expect(me.phaseId).toBe(-1);
    // Immune for a while: the same defender cannot be megged again at once.
    expect(def.megImmune).toBeGreaterThan(0);
  });

  it('failure: the ball is poked into the defender and the attacker stumbles (longer cooldown)', () => {
    const a = firstWith(false);
    const { w, me, def } = a;
    expect(w.ball.megId).toBe(-1);
    expect(me.phaseId).toBe(-1);
    expect(def.megged).toBe(0);
    expect(me.megCd).toBeCloseTo(M.failCooldown, 5);
    expect(Math.hypot(me.vx, me.vz)).toBeLessThan(TUNING.robot.maxRunSpeed * 0.7);
    const hold = emptyCommand();
    hold.mx = -1;
    const ev = stepBoth(w, Math.round(0.6 * HZ), hold);
    expect(ev.some((e) => e.type === 'touch' && e.robot === def.id)).toBe(true);
  });

  it('takes luck: against a charging defender most, but not all, attempts in the window succeed', () => {
    let ok = 0;
    let n = 0;
    for (let t = 0; t < 40; t++) {
      const a = attempt(t);
      if (!a.ev) continue;
      n++;
      if (a.ev.success) ok++;
    }
    expect(n).toBeGreaterThan(10);
    expect(ok / n).toBeGreaterThan(0.45);
    expect(ok / n).toBeLessThan(0.98);
  });

  it('a wrong-footed defender accelerates slowly and cannot kick', () => {
    const a = firstWith(true);
    const { w, def } = a;
    placeBall(w, def.x - 1.0, def.z); // a ball at the defender's feet
    w.ball.megId = -1;
    const c = emptyCommand();
    c.kick = true;
    c.ax = -20;
    stepWorld(w, [emptyCommand(), c]);
    expect(w.events.some((e) => e.type === 'kick' && e.robot === def.id)).toBe(false);
  });

  it('with nobody in the window the skill touch is a knock-on: the ball is pushed ahead', () => {
    const s = setup(12, 6, 0);
    const c = run();
    c.meg = true;
    stepWorld(s.w, [c, emptyCommand()]);
    const kick = s.w.events.find((e) => e.type === 'kick') as Extract<SimEvent, { type: 'kick' }>;
    expect(kick?.knock).toBe(true);
    expect(s.w.ball.vx).toBeGreaterThan(TUNING.robot.maxRunSpeed + 1.5);
    expect(s.w.events.some((e) => e.type === 'meg')).toBe(false);
  });

  it('an early press waits briefly for a closing defender instead of knocking the ball into them', () => {
    const s = setup(1.1 + M.maxAhead + 0.6, 0, -5);
    const hold = emptyCommand();
    hold.mx = -1;
    const c = run();
    c.meg = true;
    stepWorld(s.w, [c, hold]);
    expect(s.w.events.some((e) => e.type === 'kick' || e.type === 'meg')).toBe(false);
    let meg = false;
    for (let i = 0; i < Math.round(M.buffer * HZ) + 2 && !meg; i++) {
      stepWorld(s.w, [run(), hold]);
      meg = s.w.events.some((e) => e.type === 'meg');
    }
    expect(meg).toBe(true);
  });
});

describe('close control', () => {
  it('a robot running with the ball keeps it at its feet through a turn', () => {
    const me = createRobot(0, 0, 0, CHASSIS.all_rounder, true);
    const w = createWorld(ARENAS.championship_dome, [me]);
    placeRobot(me, -8, 0, 0);
    placeBall(w, -6.9, 0);
    const c = emptyCommand();
    c.mx = 1;
    for (let i = 0; i < HZ; i++) stepWorld(w, [c]);
    expect(Math.hypot(w.ball.x - me.x, w.ball.z - me.z)).toBeLessThan(TUNING.control.range);
    // Turn 60 degrees and keep running: the ball comes with the robot.
    c.mx = 0.5;
    c.mz = Math.sin(Math.PI / 3);
    for (let i = 0; i < HZ; i++) stepWorld(w, [c]);
    expect(Math.hypot(w.ball.x - me.x, w.ball.z - me.z)).toBeLessThan(TUNING.control.range + 0.2);
    expect(w.ball.vz).toBeGreaterThan(2);
  });

  it('does not hold on to a kicked ball, and yields when an opponent is on the ball too', () => {
    const me = createRobot(0, 0, 0, CHASSIS.all_rounder, true);
    const opp = createRobot(1, 1, 0, CHASSIS.all_rounder);
    const w = createWorld(ARENAS.championship_dome, [me, opp]);
    placeRobot(me, -8, 0, 0);
    placeRobot(opp, 10, 6, Math.PI);
    placeBall(w, -6.9, 0);
    const c = emptyCommand();
    c.mx = 1;
    for (let i = 0; i < 30; i++) stepWorld(w, [c, emptyCommand()]);
    c.kick = true;
    c.ax = 20;
    stepWorld(w, [c, emptyCommand()]);
    c.kick = false;
    for (let i = 0; i < 30; i++) stepWorld(w, [c, emptyCommand()]);
    expect(w.ball.x - me.x).toBeGreaterThan(2.5); // the shot left the feet
  });
});
