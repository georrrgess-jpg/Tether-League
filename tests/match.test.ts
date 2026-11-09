import { describe, expect, it } from 'vitest';
import type { ArenaDef } from '../src/content/arenas';
import { DT } from '../src/content/tuning';
import { BotDirector, CLUB_STYLE, DIFFICULTY } from '../src/game/ai/bot';
import { Match, type MatchEvent } from '../src/game/sim/match';
import type { Command } from '../src/game/sim/types';
import { pickAnchor, placeBall, placeRobot } from '../src/game/sim/world';
import { ARENAS, CHASSIS, HZ, RB, TUNING, anchorIndex, ballInside, cmd, finiteBall, finiteRobot, robotInside, speedOf } from './helpers';

const M = TUNING.match;

function newMatch(regulationSeconds = 180, human = -1, arena: ArenaDef = ARENAS.harbor_park): Match {
  const c = CHASSIS.all_rounder;
  return new Match({ arena, chassis: [c, c, c, c], human, assist: 0, regulationSeconds });
}

const idle = (): Command[] => [cmd(), cmd(), cmd(), cmd()];

/** Steps until `done(m)` is true (checked after each step). Returns every match event seen. */
function run(m: Match, done: (m: Match) => boolean, cmds: Command[] | ((m: Match) => Command[]) = idle(), maxTicks = 60 * HZ): MatchEvent[] {
  const out: MatchEvent[] = [];
  for (let i = 0; i < maxTicks; i++) {
    m.step(typeof cmds === 'function' ? cmds(m) : cmds);
    out.push(...m.events);
    if (done(m)) return out;
  }
  throw new Error(`condition not reached within ${maxTicks} ticks (phase ${m.phase})`);
}

function toPlay(m: Match): MatchEvent[] {
  return run(m, (x) => x.phase === 'play');
}

function ticks(m: Match, n: number, cmds: Command[] = idle()): MatchEvent[] {
  const out: MatchEvent[] = [];
  for (let i = 0; i < n; i++) {
    m.step(cmds);
    out.push(...m.events);
  }
  return out;
}

/** Fires the ball straight into a goal with no robot involved (side 1 = +x goal, scored on by team 0). */
function shootIn(m: Match, side: 1 | -1, z = 0): void {
  placeBall(m.world, side * (m.world.hx - 1), z, side * TUNING.ball.maxSpeed, 0);
}

/**
 * Teleports a robot to just behind the ball (relative to the aim) and makes it kick this tick.
 * Returns the match events of that tick. The other robots stay idle.
 */
function kickFrom(m: Match, robot: number, aimX: number, aimZ: number, power = 1): MatchEvent[] {
  const w = m.world;
  const b = w.ball;
  const dx = aimX - b.x;
  const dz = aimZ - b.z;
  const d = Math.hypot(dx, dz) || 1;
  placeRobot(w.robots[robot], b.x - (dx / d) * 1.2, b.z - (dz / d) * 1.2, Math.atan2(dz, dx));
  const cmds = idle();
  cmds[robot] = cmd({ kick: true, ax: aimX, az: aimZ, power });
  const kicksBefore = m.stats[robot].kicks;
  m.step(cmds);
  expect(m.stats[robot].kicks).toBe(kicksBefore + 1);
  return [...m.events];
}

/** Moves robots that are not part of a scenario well out of the way. */
function clearRobots(m: Match, keep: number[] = []): void {
  const spots: [number, number][] = [[-13, 8], [-11, -8], [13, -8], [11, 8]];
  m.world.robots.forEach((r, i) => {
    if (!keep.includes(i)) placeRobot(r, spots[i][0], spots[i][1], 0);
  });
}

const goalEvents = (ev: MatchEvent[]) => ev.filter((e): e is Extract<MatchEvent, { type: 'goal' }> => e.type === 'goal');

describe('kickoff and reset', () => {
  it('starts with a countdown during which nothing can move', () => {
    const m = newMatch();
    expect(m.phase).toBe('countdown');
    const start = m.world.robots.map((r) => ({ x: r.x, z: r.z }));
    const push = [cmd({ mx: 1, kick: true, tether: true, anchor: 0 }), cmd({ mx: 1 }), cmd({ mx: -1 }), cmd({ mx: -1 })];
    const ev: MatchEvent[] = [];
    let n = 0;
    while (m.phase === 'countdown') {
      m.step(push);
      ev.push(...m.events);
      n++;
      if (m.phase === 'countdown') {
        expect(m.world.robots.map((r) => ({ x: r.x, z: r.z }))).toEqual(start);
        expect(m.world.ball.x).toBe(0);
      }
    }
    expect(Math.abs(n * DT - M.kickoffCountdown)).toBeLessThanOrEqual(2 * DT);
    expect(ev.filter((e) => e.type === 'countdown').map((e) => (e as { n: number }).n)).toEqual([3, 2, 1]);
    expect(ev.filter((e) => e.type === 'go')).toHaveLength(1);
    expect(m.clock).toBe(180); // the clock does not run during the countdown
    expect(m.elapsed).toBe(0);
  });

  it('kickoff positions are a point reflection through the centre spot', () => {
    for (const arena of Object.values(ARENAS)) {
      const m = newMatch(180, -1, arena);
      const [a, b, c, d] = m.world.robots;
      expect(c.x).toBeCloseTo(-a.x, 9);
      expect(c.z).toBeCloseTo(-a.z, 9);
      expect(d.x).toBeCloseTo(-b.x, 9);
      expect(d.z).toBeCloseTo(-b.z, 9);
      for (const r of m.world.robots) expect(robotInside(m.world, r)).toBe(true);
      // Same distance from the ball for the two front robots.
      expect(Math.hypot(a.x, a.z)).toBeCloseTo(Math.hypot(c.x, c.z), 9);
    }
  });

  it('kickoff() clears velocities, tethers, cooldowns and the ball, whatever was going on', () => {
    const m = newMatch(180, -1, ARENAS.skyline_stadium);
    toPlay(m);
    const w = m.world;
    // Get everyone moving, two robots swinging, and the ball flying.
    const live = (): Command[] =>
      w.robots.map((r, i) => {
        const anchor = r.tState === 'attached' ? r.tAnchor : pickAnchor(w, r, r.x, r.z, -1);
        return cmd({ mx: i < 2 ? 1 : -1, mz: i % 2 ? 1 : -1, tether: i % 2 === 0, anchor, kick: true, ax: 0, az: 0 });
      });
    for (let i = 0; i < 50; i++) m.step(live());
    w.ball.vx = 9;
    w.ball.vz = -4;
    expect(w.robots.some((r) => r.tState === 'attached')).toBe(true);
    expect(w.robots.every((r) => speedOf(r) > 1)).toBe(true);

    m.kickoff();
    for (const r of w.robots) {
      expect(speedOf(r)).toBe(0);
      expect(r.tState).toBe('ready');
      expect(r.tAnchor).toBe(-1);
      expect(r.tCd).toBe(0);
      expect(r.kickCd).toBe(0);
      expect(r.kickBuffer).toBe(0);
      expect(r.tBuffer).toBe(0);
    }
    expect([w.ball.x, w.ball.z, w.ball.vx, w.ball.vz]).toEqual([0, 0, 0, 0]);
    expect(w.ball.lastTouchRobot).toBe(-1);
    expect(w.goalLatch).toBe(false);
  });

  it('after a goal: one score, a celebration, then a clean kickoff and a short countdown', () => {
    const m = newMatch();
    toPlay(m);
    ticks(m, 30, [cmd({ mx: 1 }), cmd({ mz: 1 }), cmd({ mx: -1 }), cmd({ mz: -1 })]);
    shootIn(m, 1);
    const ev = run(m, (x) => x.phase === 'goal');
    expect(goalEvents(ev)).toHaveLength(1);
    expect(m.score).toEqual([1, 0]);
    expect(m.lastGoalTeam).toBe(0);
    const clockAtGoal = m.clock;

    // Celebration: the ball keeps rattling around in the net, robots are not controllable, nothing more is scored.
    let celebrationTicks = 0;
    const startX = m.world.robots.map((r) => r.x);
    let drift = 0;
    for (;;) {
      if (celebrationTicks % 10 === 0) {
        m.world.ball.vx = 12;
        m.world.ball.vz = celebrationTicks % 20 === 0 ? 9 : -9;
      }
      m.step([cmd({ mx: 1 }), cmd({ mx: 1 }), cmd({ mx: 1 }), cmd({ mx: 1 })]);
      celebrationTicks++;
      expect(m.score).toEqual([1, 0]);
      expect(m.goals).toHaveLength(1);
      expect(m.events.filter((e) => e.type === 'goal')).toHaveLength(0);
      expect(m.clock).toBe(clockAtGoal);
      if (m.phase !== 'goal') break;
      m.world.robots.forEach((r, i) => (drift = Math.max(drift, Math.abs(r.x - startX[i]))));
    }
    expect(Math.abs(celebrationTicks * DT - M.goalCelebration)).toBeLessThanOrEqual(2 * DT);
    // Movement commands were ignored during the celebration (robots only coast to a stop).
    expect(drift).toBeLessThan(0.6);

    // Reset state.
    expect(m.phase).toBe('countdown');
    expect(m.phaseTime).toBe(M.goalCountdown);
    const w = m.world;
    for (const r of w.robots) {
      expect(speedOf(r)).toBe(0);
      expect(r.tState).toBe('ready');
    }
    expect([w.ball.x, w.ball.z, w.ball.vx, w.ball.vz]).toEqual([0, 0, 0, 0]);
    expect(w.goalLatch).toBe(false);
    const fresh = newMatch();
    expect(w.robots.map((r) => [r.x, r.z, r.facing])).toEqual(fresh.world.robots.map((r) => [r.x, r.z, r.facing]));

    // Play resumes after the shorter goal countdown with the clock where it stopped.
    let n = 0;
    while (m.phase === 'countdown') {
      m.step(idle());
      n++;
    }
    expect(Math.abs(n * DT - M.goalCountdown)).toBeLessThanOrEqual(2 * DT);
    expect(m.phase).toBe('play');
    expect(m.clock).toBeCloseTo(clockAtGoal, 9);
    expect(m.score).toEqual([1, 0]);
  });

  it('a human can skip the celebration with kick, but only after the minimum time, and the reset is still clean', () => {
    const m = newMatch(180, 0, ARENAS.skyline_stadium);
    toPlay(m);
    const w = m.world;
    // Put the human on a fast swing so it is still carrying momentum when the celebration is skipped.
    const g = anchorIndex(ARENAS.skyline_stadium, 'gantry_n');
    placeRobot(w.robots[0], 0, 0, 0);
    placeBall(w, 8, 8);
    const swing = idle();
    swing[0] = cmd({ tether: true, anchor: g });
    ticks(m, 100, swing);
    expect(speedOf(w.robots[0])).toBeGreaterThan(9);
    shootIn(m, 1);
    run(m, (x) => x.phase === 'goal', swing);

    const skip = idle();
    skip[0] = cmd({ kick: true });
    let n = 0;
    while (m.phase === 'goal') {
      m.step(skip);
      n++;
    }
    expect(n * DT).toBeGreaterThanOrEqual(M.goalCelebrationMinSkip - 1e-9);
    expect(n * DT).toBeLessThan(M.goalCelebrationMinSkip + 0.1);
    expect(n * DT).toBeLessThan(M.goalCelebration);
    expect(m.phase).toBe('countdown');
    for (const r of w.robots) {
      expect(speedOf(r)).toBe(0);
      expect(r.tState).toBe('ready');
    }
    expect([w.ball.x, w.ball.z, w.ball.vx, w.ball.vz]).toEqual([0, 0, 0, 0]);
    expect(m.score).toEqual([1, 0]);
  });

  it('an unattributable goal still counts for the team with no individual credit', () => {
    const m = newMatch();
    toPlay(m);
    shootIn(m, -1);
    const g = goalEvents(run(m, (x) => x.phase === 'goal'));
    expect(m.score).toEqual([0, 1]);
    expect(g[0].record).toMatchObject({ team: 1, scorer: -1, assist: -1, ownGoalBy: -1, overtime: false });
    for (const s of m.stats) expect(s.goals + s.assists + s.ownGoals).toBe(0);
  });
});

describe('regulation, overtime and the final whistle', () => {
  it('the clock only runs during play and a non-tied game ends when it reaches zero', () => {
    const m = newMatch(3);
    toPlay(m);
    ticks(m, 30);
    expect(m.clock).toBeCloseTo(3 - 0.5, 6);
    shootIn(m, 1);
    run(m, (x) => x.phase === 'goal');
    const clockAtGoal = m.clock;
    run(m, (x) => x.phase === 'play');
    expect(m.clock).toBeCloseTo(clockAtGoal, 9);
    expect(m.finished).toBe(false);
    expect(m.winner).toBe(-1);

    const ev = run(m, (x) => x.finished);
    expect(ev.filter((e) => e.type === 'final')).toHaveLength(1);
    expect(ev.filter((e) => e.type === 'overtime')).toHaveLength(0);
    expect(m.clock).toBe(0);
    expect(m.overtime).toBe(false);
    expect(m.score).toEqual([1, 0]);
    expect(m.winner).toBe(0);
    // Play time added up to exactly the regulation length (within a tick).
    expect(Math.abs(m.elapsed - 3)).toBeLessThanOrEqual(DT + 1e-9);
  });

  it('a finished match is frozen: further steps change nothing', () => {
    const m = newMatch(1);
    toPlay(m);
    shootIn(m, -1);
    run(m, (x) => x.finished);
    expect(m.winner).toBe(1);
    const snap = JSON.stringify({ s: m.score, c: m.clock, e: m.elapsed, g: m.goals, st: m.stats, b: m.world.ball, r: m.world.robots.map((r) => [r.x, r.z]) });
    shootIn(m, 1);
    const ev = ticks(m, 120, [cmd({ mx: 1, kick: true }), cmd({ mx: 1 }), cmd({ mx: 1 }), cmd({ mx: 1 })]);
    expect(ev).toHaveLength(0);
    expect(m.score).toEqual([0, 1]);
    // Only the ball we placed by hand differs; restore it and compare everything.
    m.world.ball = JSON.parse(snap).b;
    expect(JSON.stringify({ s: m.score, c: m.clock, e: m.elapsed, g: m.goals, st: m.stats, b: m.world.ball, r: m.world.robots.map((r) => [r.x, r.z]) })).toBe(snap);
  });

  it('tied regulation enters sudden-death overtime with a fresh kickoff and a stopped clock', () => {
    const m = newMatch(1);
    toPlay(m);
    ticks(m, 20, [cmd({ mx: 1 }), cmd({ mx: 1 }), cmd({ mx: -1 }), cmd({ mx: -1 })]);
    const ev = run(m, (x) => x.overtime);
    expect(ev.filter((e) => e.type === 'overtime')).toHaveLength(1);
    expect(ev.filter((e) => e.type === 'final')).toHaveLength(0);
    expect(m.phase).toBe('countdown');
    expect(m.phaseTime).toBe(M.kickoffCountdown);
    expect(m.clock).toBe(0);
    expect(m.finished).toBe(false);
    expect(m.winner).toBe(-1);
    // Fresh kickoff.
    const fresh = newMatch(1);
    expect(m.world.robots.map((r) => [r.x, r.z, r.vx, r.vz])).toEqual(fresh.world.robots.map((r) => [r.x, r.z, 0, 0]));
    expect([m.world.ball.x, m.world.ball.z, m.world.ball.vx, m.world.ball.vz]).toEqual([0, 0, 0, 0]);

    // Overtime play: the clock stays at zero and the match does not end on its own.
    toPlay(m);
    const more = ticks(m, 5 * HZ);
    expect(m.clock).toBe(0);
    expect(m.phase).toBe('play');
    expect(more.filter((e) => e.type === 'final' || e.type === 'overtime')).toHaveLength(0);
    expect(m.elapsed).toBeGreaterThan(5.9);
  });

  it('the first overtime goal ends the match with a winner', () => {
    for (const side of [1, -1] as const) {
      const m = newMatch(1);
      toPlay(m);
      run(m, (x) => x.overtime);
      toPlay(m);
      shootIn(m, side);
      const ev = run(m, (x) => x.finished);
      const goals = goalEvents(ev);
      expect(goals).toHaveLength(1);
      expect(goals[0].record.overtime).toBe(true);
      expect(ev.filter((e) => e.type === 'final')).toHaveLength(1);
      expect(m.score).toEqual(side === 1 ? [1, 0] : [0, 1]);
      expect(m.winner).toBe(side === 1 ? 0 : 1);
      expect(m.overtime).toBe(true);
      // No second kickoff countdown: celebration, then full time.
      expect(ev.filter((e) => e.type === 'countdown')).toHaveLength(0);
    }
  });
});

describe('goal and final clock on the same tick', () => {
  /** Ball one substep short of being fully over the +x (side 1) or -x (side -1) line. */
  function onTheLine(m: Match, side: 1 | -1): void {
    placeBall(m.world, side * (m.world.hx + RB - 0.1), 0, side * TUNING.ball.maxSpeed, 0);
  }

  it('the goal counts and the match then resolves at full time', () => {
    const m = newMatch(60);
    toPlay(m);
    m.clock = DT * 0.5;
    onTheLine(m, 1);
    m.step(idle());
    // Exactly one tick: the goal was scored on the tick the clock expired.
    expect(m.events.filter((e) => e.type === 'goal')).toHaveLength(1);
    expect(m.score).toEqual([1, 0]);
    expect(m.phase).toBe('goal');
    expect(m.events.filter((e) => e.type === 'final' || e.type === 'overtime')).toHaveLength(0);

    const ev = run(m, (x) => x.finished);
    expect(ev.filter((e) => e.type === 'final')).toHaveLength(1);
    expect(ev.filter((e) => e.type === 'countdown' || e.type === 'go' || e.type === 'overtime')).toHaveLength(0);
    expect(m.score).toEqual([1, 0]);
    expect(m.goals).toHaveLength(1);
    expect(m.goals[0].overtime).toBe(false);
    expect(m.winner).toBe(0);
    expect(m.overtime).toBe(false);
    expect(m.clock).toBe(0);
  });

  it('a buzzer-beater that levels the score sends the match to overtime instead of ending it', () => {
    const m = newMatch(60);
    toPlay(m);
    shootIn(m, -1);
    run(m, (x) => x.phase === 'goal');
    toPlay(m);
    expect(m.score).toEqual([0, 1]);

    m.clock = DT * 0.5;
    onTheLine(m, 1);
    m.step(idle());
    expect(m.score).toEqual([1, 1]);
    const ev = run(m, (x) => x.phase !== 'goal');
    expect(ev.filter((e) => e.type === 'overtime')).toHaveLength(1);
    expect(ev.filter((e) => e.type === 'final')).toHaveLength(0);
    expect(m.overtime).toBe(true);
    expect(m.finished).toBe(false);
    expect(m.phase).toBe('countdown');
    expect(m.clock).toBe(0);
    expect(m.goals.map((g) => g.overtime)).toEqual([false, false]);

    // Sudden death then decides it.
    toPlay(m);
    shootIn(m, 1);
    run(m, (x) => x.finished);
    expect(m.score).toEqual([2, 1]);
    expect(m.winner).toBe(0);
    expect(m.goals[2].overtime).toBe(true);
  });

  it('a buzzer-beater that breaks a tie wins in regulation (no overtime)', () => {
    const m = newMatch(60);
    toPlay(m);
    m.clock = DT * 0.5;
    onTheLine(m, -1);
    m.step(idle());
    run(m, (x) => x.finished);
    expect(m.score).toEqual([0, 1]);
    expect(m.winner).toBe(1);
    expect(m.overtime).toBe(false);
  });

  it('a ball that crosses one tick after the clock expired does not count', () => {
    const m = newMatch(60);
    toPlay(m);
    m.clock = DT * 0.5;
    // Needs two ticks to be fully over the line.
    placeBall(m.world, m.world.hx + RB - 0.45, 0, TUNING.ball.maxSpeed, 0);
    m.step(idle());
    expect(m.score).toEqual([0, 0]);
    expect(m.overtime).toBe(true);
    expect(m.phase).toBe('countdown');
    ticks(m, 30);
    expect(m.score).toEqual([0, 0]);
    expect(m.goals).toHaveLength(0);
  });

  it('is stable: the same setup always resolves the same way', () => {
    const outcome = () => {
      const m = newMatch(60);
      toPlay(m);
      m.clock = DT * 0.5;
      onTheLine(m, 1);
      run(m, (x) => x.finished);
      return JSON.stringify([m.score, m.goals, m.elapsed, m.clock, m.overtime, m.winner]);
    };
    expect(outcome()).toBe(outcome());
  });
});

describe('goal attribution', () => {
  it('an attacker goal credits the scorer and counts as a shot', () => {
    const m = newMatch();
    toPlay(m);
    clearRobots(m, [0]);
    placeBall(m.world, 12, 0.5);
    const kickEv = kickFrom(m, 0, 20, 0);
    expect(kickEv.filter((e) => e.type === 'shot')).toEqual([{ type: 'shot', robot: 0 }]);
    const g = goalEvents(run(m, (x) => x.phase === 'goal'));
    expect(g).toHaveLength(1);
    expect(g[0].record).toMatchObject({ team: 0, scorer: 0, assist: -1, ownGoalBy: -1 });
    expect(m.score).toEqual([1, 0]);
    expect(m.stats[0]).toMatchObject({ goals: 1, shots: 1, kicks: 1, assists: 0, ownGoals: 0 });
    expect(m.stats.slice(1).every((s) => s.goals === 0 && s.assists === 0)).toBe(true);
  });

  it('team 1 attacking the -x goal is credited symmetrically', () => {
    const m = newMatch();
    toPlay(m);
    clearRobots(m, [3]);
    placeBall(m.world, -12, -0.5);
    kickFrom(m, 3, -20, 0);
    const g = goalEvents(run(m, (x) => x.phase === 'goal'));
    expect(g[0].record).toMatchObject({ team: 1, scorer: 3, assist: -1, ownGoalBy: -1 });
    expect(m.score).toEqual([0, 1]);
    expect(m.stats[3].goals).toBe(1);
  });

  it("a defender's deliberate kick into their own goal is an own goal for the other team", () => {
    const m = newMatch();
    toPlay(m);
    clearRobots(m, [0]);
    placeBall(m.world, -12, 0.3);
    const kickEv = kickFrom(m, 0, -20, 0); // robot 0 (team 0) defends the -x goal
    expect(kickEv.filter((e) => e.type === 'shot')).toHaveLength(0); // not a shot for the kicker
    const g = goalEvents(run(m, (x) => x.phase === 'goal'));
    expect(g).toHaveLength(1);
    expect(g[0].record).toMatchObject({ team: 1, scorer: -1, assist: -1, ownGoalBy: 0 });
    expect(m.score).toEqual([0, 1]);
    expect(m.lastGoalTeam).toBe(1);
    expect(m.stats[0]).toMatchObject({ goals: 0, ownGoals: 1 });
    for (const s of m.stats) expect(s.goals).toBe(0);
    for (const s of m.stats) expect(s.assists).toBe(0);
  });

  it('an own goal long after an attacker touch is still an own goal (no stale credit)', () => {
    const m = newMatch();
    toPlay(m);
    clearRobots(m, [0, 2]);
    placeBall(m.world, -6, 0);
    kickFrom(m, 2, -6, 8, 0.3); // attacker pokes it sideways
    clearRobots(m, [0]);
    ticks(m, 4 * HZ); // more than the 3 s deflection window
    kickFrom(m, 0, -20, 0);
    const g = goalEvents(run(m, (x) => x.phase === 'goal'));
    expect(g[0].record).toMatchObject({ team: 1, scorer: -1, ownGoalBy: 0 });
    expect(m.stats[2].goals).toBe(0);
    expect(m.score).toEqual([0, 1]);
  });

  it('a shot deflected in by a defender shortly afterwards is credited to the attacker, not an own goal', () => {
    const m = newMatch();
    toPlay(m);
    clearRobots(m, [2]);
    placeBall(m.world, -8, 0);
    kickFrom(m, 2, -20, 0);
    // Defender kicks the moving ball onward into their own net within the deflection window.
    ticks(m, 6);
    clearRobots(m, [0]);
    kickFrom(m, 0, -20, 0.2);
    const g = goalEvents(run(m, (x) => x.phase === 'goal'));
    expect(g[0].record).toMatchObject({ team: 1, scorer: 2, ownGoalBy: -1 });
    expect(m.stats[2].goals).toBe(1);
    expect(m.stats[0].ownGoals).toBe(0);
    expect(m.score).toEqual([0, 1]);
  });

  it('pass from teammate A then goal by B credits an assist to A (and a completed pass)', () => {
    const m = newMatch();
    toPlay(m);
    clearRobots(m);
    placeBall(m.world, 6, 0);
    kickFrom(m, 1, 20, 0, 0.6); // A = robot 1 plays it forward
    clearRobots(m);
    ticks(m, 30);
    const ev = kickFrom(m, 0, 20, 0); // B = robot 0 finishes
    expect(ev.filter((e) => e.type === 'pass')).toEqual([{ type: 'pass', from: 1, to: 0 }]);
    const g = goalEvents(run(m, (x) => x.phase === 'goal'));
    expect(g[0].record).toMatchObject({ team: 0, scorer: 0, assist: 1, ownGoalBy: -1 });
    expect(m.stats[0]).toMatchObject({ goals: 1, assists: 0 });
    expect(m.stats[1]).toMatchObject({ goals: 0, assists: 1, passes: 1 });
    expect(m.score).toEqual([1, 0]);
  });

  it('a self-pass never yields a self-assist', () => {
    const m = newMatch();
    toPlay(m);
    clearRobots(m);
    placeBall(m.world, 6, 0);
    kickFrom(m, 0, 20, 0, 0.6);
    clearRobots(m);
    ticks(m, 30);
    const ev = kickFrom(m, 0, 20, 0);
    expect(ev.filter((e) => e.type === 'pass')).toHaveLength(0);
    const g = goalEvents(run(m, (x) => x.phase === 'goal'));
    expect(g[0].record).toMatchObject({ team: 0, scorer: 0, assist: -1 });
    expect(m.stats[0]).toMatchObject({ goals: 1, assists: 0, passes: 0 });
    expect(m.stats.reduce((a, s) => a + s.assists, 0)).toBe(0);
  });

  it('a self-pass after a teammate touch still credits the teammate, never the scorer', () => {
    const m = newMatch();
    toPlay(m);
    clearRobots(m);
    placeBall(m.world, 2, 0);
    kickFrom(m, 1, 20, 0, 0.6);
    clearRobots(m);
    ticks(m, 20);
    kickFrom(m, 0, 20, 0, 0.6);
    clearRobots(m);
    ticks(m, 20);
    kickFrom(m, 0, 20, 0);
    const g = goalEvents(run(m, (x) => x.phase === 'goal'));
    expect(g[0].record).toMatchObject({ scorer: 0, assist: 1 });
    expect(m.stats[0].assists).toBe(0);
    expect(m.stats[1].assists).toBe(1);
  });

  it('an opponent deliberate touch in between cancels the assist', () => {
    const m = newMatch();
    toPlay(m);
    clearRobots(m);
    placeBall(m.world, 4, 0);
    kickFrom(m, 1, 20, 0, 0.6); // teammate A
    clearRobots(m);
    ticks(m, 20);
    kickFrom(m, 2, 8, 6, 0.4); // opponent takes control and knocks it sideways
    clearRobots(m);
    ticks(m, 20);
    kickFrom(m, 0, 20, 0); // B scores
    const g = goalEvents(run(m, (x) => x.phase === 'goal'));
    expect(g[0].record).toMatchObject({ team: 0, scorer: 0, assist: -1 });
    expect(m.stats[1].assists).toBe(0);
    expect(m.stats[1].passes).toBe(0);
    expect(m.score).toEqual([1, 0]);
  });

  it('a teammate touch older than the assist window earns no assist', () => {
    const m = newMatch();
    toPlay(m);
    clearRobots(m);
    placeBall(m.world, 6, 0);
    kickFrom(m, 1, 20, 0, 0.3);
    clearRobots(m);
    ticks(m, Math.ceil((TUNING.stats.assistWindow + 0.5) * HZ));
    kickFrom(m, 0, 20, 0);
    const g = goalEvents(run(m, (x) => x.phase === 'goal'));
    expect(g[0].record).toMatchObject({ scorer: 0, assist: -1 });
    expect(m.stats[1].assists).toBe(0);
  });

  it('attribution does not leak across a kickoff: a touch before the previous goal cannot assist the next one', () => {
    const m = newMatch();
    toPlay(m);
    clearRobots(m);
    placeBall(m.world, 12, 0);
    kickFrom(m, 1, 20, 0); // robot 1 scores
    run(m, (x) => x.phase === 'goal');
    toPlay(m);
    clearRobots(m);
    placeBall(m.world, 12, 0);
    kickFrom(m, 0, 20, 0); // robot 0 scores straight after the restart
    const g = goalEvents(run(m, (x) => x.phase === 'goal'));
    expect(g[0].record).toMatchObject({ scorer: 0, assist: -1 });
    expect(m.stats[1]).toMatchObject({ goals: 1, assists: 0 });
    expect(m.score).toEqual([2, 0]);
  });
});

describe('stat jitter', () => {
  /** Attacker (robot 2) shoots at the -x goal; defender (robot 0) stands in the way. */
  function shotAtDefender(m: Match): void {
    clearRobots(m);
    placeRobot(m.world.robots[0], -12.5, 0, 0);
    placeBall(m.world, -7, 0);
    kickFrom(m, 2, -20, 0);
    placeRobot(m.world.robots[2], 13, -8, 0);
  }

  it('one blocked shot followed by a long scramble against the ball is exactly one save', () => {
    const m = newMatch();
    toPlay(m);
    shotAtDefender(m);
    expect(m.stats[2].shots).toBe(1);
    const w = m.world;
    let touches = 0;
    const ev: MatchEvent[] = [];
    // The defender keeps driving into the ball for four seconds: lots of repeated contact.
    for (let i = 0; i < 4 * HZ; i++) {
      const r = w.robots[0];
      const dx = w.ball.x - r.x;
      const dz = w.ball.z - r.z;
      const d = Math.hypot(dx, dz) || 1;
      const cmds = idle();
      cmds[0] = cmd({ mx: dx / d, mz: dz / d });
      m.step(cmds);
      ev.push(...m.events);
      touches += w.events.filter((e) => e.type === 'touch').length;
    }
    expect(m.phase).toBe('play');
    expect(touches).toBeGreaterThan(3);
    expect(ev.filter((e) => e.type === 'save')).toEqual([{ type: 'save', robot: 0 }]);
    expect(m.stats[0].saves).toBe(1);
    expect(m.stats[0].interceptions).toBeLessThanOrEqual(1);
    expect(m.score).toEqual([0, 0]);
  });

  it('a goalmouth scramble with both teams hammering the ball awards saves no faster than the debounce allows', () => {
    const m = newMatch();
    toPlay(m);
    clearRobots(m);
    const w = m.world;
    placeRobot(w.robots[0], -13.6, 0, 0);
    placeRobot(w.robots[2], -10.4, 0, Math.PI);
    placeBall(w, -12, 0);
    const saveTicks: number[] = [];
    let touches = 0;
    const seconds = 6;
    for (let i = 0; i < seconds * HZ && m.phase === 'play'; i++) {
      const cmds = idle();
      for (const id of [0, 2]) {
        const r = w.robots[id];
        const dx = w.ball.x - r.x;
        const dz = w.ball.z - r.z;
        const d = Math.hypot(dx, dz) || 1;
        // Attacker kicks at goal whenever it can; defender just bodies the ball.
        cmds[id] = cmd({ mx: dx / d, mz: dz / d, kick: id === 2, ax: -20, az: 0 });
      }
      m.step(cmds);
      touches += w.events.filter((e) => e.type === 'touch' || e.type === 'kick').length;
      for (const e of m.events) if (e.type === 'save') saveTicks.push(i);
    }
    expect(touches).toBeGreaterThan(10); // it really was a scramble
    const saves = m.stats[0].saves + m.stats[1].saves;
    expect(saveTicks).toHaveLength(saves);
    for (let i = 1; i < saveTicks.length; i++) {
      expect((saveTicks[i] - saveTicks[i - 1]) * DT).toBeGreaterThanOrEqual(TUNING.stats.saveDebounce);
    }
    expect(saves).toBeLessThanOrEqual(Math.floor(seconds / TUNING.stats.saveDebounce) + 1);
    // Attackers are never credited with saves at the goal they attack, and nothing here can be an assist.
    expect(m.stats[2].saves + m.stats[3].saves).toBe(0);
    expect(m.stats.reduce((a, s) => a + s.assists, 0)).toBe(0);
    // Contact jitter does not inflate interceptions either.
    expect(m.stats.reduce((a, s) => a + s.interceptions, 0)).toBeLessThanOrEqual(saves + 2);
  });

  it('rapid-fire shots blocked by the same defender are debounced instead of farming saves', () => {
    const m = newMatch();
    toPlay(m);
    clearRobots(m);
    const w = m.world;
    placeRobot(w.robots[0], -12.5, 0, 0);
    const saveTicks: number[] = [];
    let blocks = 0;
    let tick = 0;
    const advance = (n: number) => {
      for (let i = 0; i < n; i++) {
        m.step(idle());
        tick++;
        if (w.events.some((e) => e.type === 'touch' && e.robot === 0)) blocks++;
        for (const e of m.events) if (e.type === 'save') saveTicks.push(tick);
      }
    };
    const shots = 5;
    for (let k = 0; k < shots; k++) {
      // A fresh shot every three quarters of a second (longer than the save confirmation delay, shorter than
      // the debounce), each one on target and each one blocked.
      w.ball.x = -9;
      w.ball.z = 0;
      w.ball.vx = 0;
      w.ball.vz = 0;
      kickFrom(m, 2, -20, 0);
      tick++;
      placeRobot(w.robots[2], 13, -8, 0);
      advance(44);
    }
    advance(HZ);
    expect(m.phase).toBe('play');
    expect(m.stats[2].shots).toBe(shots);
    expect(blocks).toBeGreaterThanOrEqual(shots);
    expect(m.stats[0].saves).toBeGreaterThanOrEqual(1);
    expect(m.stats[0].saves).toBeLessThan(shots);
    expect(saveTicks).toHaveLength(m.stats[0].saves);
    for (let i = 1; i < saveTicks.length; i++) {
      expect((saveTicks[i] - saveTicks[i - 1]) * DT).toBeGreaterThanOrEqual(TUNING.stats.saveDebounce);
    }
    expect(m.stats[0].saves).toBeLessThanOrEqual(Math.floor((tick * DT) / TUNING.stats.saveDebounce) + 1);
  });

  it("stopping a team-mate's back-pass toward your own goal is not a save (and not a shot)", () => {
    const m = newMatch();
    toPlay(m);
    clearRobots(m);
    const w = m.world;
    placeRobot(w.robots[0], -12.5, 0, 0);
    placeBall(w, -8, 0);
    const ev = kickFrom(m, 1, -20, 0); // robot 1 is on the defender's own team
    placeRobot(w.robots[1], -11, -8, 0);
    let touched = false;
    for (let i = 0; i < 2 * HZ; i++) {
      m.step(idle());
      ev.push(...m.events);
      if (w.events.some((e) => e.type === 'touch' && e.robot === 0)) touched = true;
    }
    expect(touched).toBe(true);
    expect(m.phase).toBe('play');
    expect(ev.filter((e) => e.type === 'save' || e.type === 'shot' || e.type === 'intercept')).toHaveLength(0);
    expect(m.stats[0].saves).toBe(0);
    expect(m.stats[1].shots).toBe(0);
    expect(m.score).toEqual([0, 0]);
  });

  /** Attacker shoots along z = 0 at the -x goal; the defender stands `offset` to the side and only clips the ball. */
  function clippedShot(offset: number) {
    const m = newMatch();
    toPlay(m);
    clearRobots(m);
    placeRobot(m.world.robots[0], -12.5, offset, 0);
    placeBall(m.world, -7, 0);
    kickFrom(m, 2, -20, 0);
    placeRobot(m.world.robots[2], 13, -8, 0);
    let touched = false;
    const ev: MatchEvent[] = [];
    for (let i = 0; i < 5 * HZ && m.phase === 'play'; i++) {
      m.step(idle());
      ev.push(...m.events);
      if (m.world.events.some((e) => e.type === 'touch' && e.robot === 0)) touched = true;
    }
    return { m, ev, touched };
  }

  it('a grazing touch on a shot that goes straight in is a goal for the shooter and no save', () => {
    const { m, ev, touched } = clippedShot(1.03);
    expect(touched).toBe(true);
    expect(m.phase).toBe('goal');
    expect(m.score).toEqual([0, 1]);
    expect(goalEvents(ev)[0].record).toMatchObject({ team: 1, scorer: 2, ownGoalBy: -1 });
    expect(m.stats[0].saves).toBe(0);
    expect(ev.filter((e) => e.type === 'save')).toHaveLength(0);
  });

  // KNOWN DEFECT (src/game/sim/match.ts, Match.attribute / pendingSave): a pending save is confirmed 0.6 s after
  // the defender's touch if no goal has been conceded yet. A deflection that only slows the shot lets the ball
  // roll over the line later than that, so the defender is credited with a "save" for a shot that scored without
  // any further touch. Remove `.fails` once the save is cancelled when the same ball still goes in.
  it('scenario check: a shot clipped by the defender still rolls in and is credited to the shooter', () => {
    const { m, ev, touched } = clippedShot(0.9);
    expect(touched).toBe(true);
    expect(m.phase).toBe('goal');
    expect(m.score).toEqual([0, 1]);
    expect(goalEvents(ev)[0].record).toMatchObject({ team: 1, scorer: 2, ownGoalBy: -1 });
    expect(m.stats[0].ownGoals).toBe(0);
  });

  it('a deflected shot that still rolls in is not also credited as a save', () => {
    // Same scenario as the check above (which guards the preconditions); only the save credit is asserted here.
    const { m, ev } = clippedShot(0.9);
    expect(ev.filter((e) => e.type === 'save')).toHaveLength(0);
    expect(m.stats[0].saves).toBe(0);
  });
});

describe('full bot match', () => {
  type Diff = 'rookie' | 'club' | 'pro';
  function botMatch(arenaId: keyof typeof ARENAS, seed: number, regulationSeconds: number, diff: Diff, mixed = false, awayDiff: Diff = diff) {
    const c = CHASSIS;
    const m = mixed
      ? new Match({ arena: ARENAS[arenaId], chassis: [c.scout, c.bulwark, c.glider, c.all_rounder], human: -1, assist: 0, regulationSeconds })
      : newMatch(regulationSeconds, -1, ARENAS[arenaId]);
    const styles = mixed ? [CLUB_STYLE.pressure, CLUB_STYLE.passing, CLUB_STYLE.counter, CLUB_STYLE.wide] : [CLUB_STYLE.balanced, CLUB_STYLE.balanced, CLUB_STYLE.balanced, CLUB_STYLE.balanced];
    const bots = new BotDirector(
      m.world,
      [0, 1, 2, 3].map((robot) => ({ robot, difficulty: DIFFICULTY[robot < 2 ? diff : awayDiff], style: styles[robot] })),
      seed,
    );
    const cmds = idle();
    let prev = m.phase;
    let n = 0;
    const cap = 20 * 60 * HZ;
    let maxBall = 0;
    let maxRobot = 0;
    while (!m.finished && n < cap) {
      if (m.phase === 'play') bots.update(cmds);
      m.step(cmds);
      if (prev !== 'countdown' && m.phase === 'countdown') bots.reset();
      prev = m.phase;
      n++;
      const w = m.world;
      if (!finiteBall(w) || !w.robots.every(finiteRobot)) throw new Error(`non-finite state at tick ${n}`);
      if (!ballInside(w)) throw new Error(`ball out of the arena at tick ${n}: ${w.ball.x}, ${w.ball.z}`);
      for (const r of w.robots) {
        if (!robotInside(w, r)) throw new Error(`robot ${r.id} out of the arena at tick ${n}`);
        maxRobot = Math.max(maxRobot, speedOf(r));
      }
      maxBall = Math.max(maxBall, speedOf(w.ball));
      if (!Number.isFinite(m.clock) || m.clock > regulationSeconds) throw new Error('bad clock');
    }
    return { m, n, maxBall, maxRobot };
  }

  it('a seeded all-bot match finishes with a winner, finite state throughout and consistent stats', () => {
    const { m, n, maxRobot } = botMatch('harbor_park', 1000, 180, 'club');
    expect(m.finished).toBe(true);
    expect(n).toBeGreaterThan(180 * HZ); // a real full-length match was simulated
    expect(m.elapsed).toBeGreaterThanOrEqual(180 - DT);
    expect(m.winner).not.toBe(-1);
    expect(m.score[0]).not.toBe(m.score[1]);
    expect(m.goals).toHaveLength(m.score[0] + m.score[1]);
    expect(m.goals.filter((g) => g.team === 0)).toHaveLength(m.score[0]);
    expect(m.goals.filter((g) => g.team === 1)).toHaveLength(m.score[1]);
    expect(maxRobot).toBeLessThanOrEqual(TUNING.tether.maxSpeed + 1e-6);

    // Individual credits add up to (at most) the team totals.
    for (const team of [0, 1] as const) {
      const ids = team === 0 ? [0, 1] : [2, 3];
      const goals = ids.reduce((a, i) => a + m.stats[i].goals, 0);
      const assists = ids.reduce((a, i) => a + m.stats[i].assists, 0);
      const ownByOthers = m.goals.filter((g) => g.team === team && g.ownGoalBy >= 0).length;
      expect(goals + ownByOthers).toBeLessThanOrEqual(m.score[team]);
      expect(assists).toBeLessThanOrEqual(goals);
    }
    for (const g of m.goals) {
      if (g.scorer >= 0) {
        expect(m.world.robots[g.scorer].team).toBe(g.team);
        expect(g.ownGoalBy).toBe(-1);
        expect(g.assist).not.toBe(g.scorer);
        if (g.assist >= 0) expect(m.world.robots[g.assist].team).toBe(g.team);
      }
      if (g.ownGoalBy >= 0) {
        expect(m.world.robots[g.ownGoalBy].team).not.toBe(g.team);
        expect(g.assist).toBe(-1);
      }
      if (g.overtime) expect(g).toBe(m.goals[m.goals.length - 1]);
    }
    if (m.overtime) expect(m.goals[m.goals.length - 1].overtime).toBe(true);
    else expect(m.clock).toBe(0);
    const total = m.stats.reduce((a, s) => ({ kicks: a.kicks + s.kicks, swings: a.swings + s.swings, shots: a.shots + s.shots, saves: a.saves + s.saves }), { kicks: 0, swings: 0, shots: 0, saves: 0 });
    expect(total.kicks).toBeGreaterThan(20);
    expect(total.swings).toBeGreaterThan(5);
    expect(total.saves).toBeLessThanOrEqual(total.shots + m.goals.length + total.kicks);
    for (const s of m.stats) expect(s.shots).toBeLessThanOrEqual(s.kicks);
  });

  it('every arena hosts a complete match with mixed chassis, styles and difficulties without leaving the envelope', () => {
    const plans: [keyof typeof ARENAS, number, Diff, Diff][] = [
      ['harbor_park', 11, 'rookie', 'pro'],
      ['foundry_court', 22, 'pro', 'club'],
      ['skyline_stadium', 33, 'club', 'rookie'],
      ['championship_dome', 44, 'pro', 'pro'],
    ];
    for (const [arena, seed, home, away] of plans) {
      const { m, maxRobot } = botMatch(arena, seed, 120, home, true, away);
      expect(m.finished).toBe(true);
      expect(m.winner).not.toBe(-1);
      expect(m.goals).toHaveLength(m.score[0] + m.score[1]);
      expect(maxRobot).toBeLessThanOrEqual(TUNING.tether.maxSpeed + 1e-6);
    }
  });

  it('is deterministic for a given seed, on another arena and difficulty mix', () => {
    const a = botMatch('skyline_stadium', 4242, 45, 'pro');
    const b = botMatch('skyline_stadium', 4242, 45, 'pro');
    expect(a.m.finished).toBe(true);
    expect(a.m.winner).not.toBe(-1);
    expect(b.n).toBe(a.n);
    expect(b.m.score).toEqual(a.m.score);
    expect(b.m.goals).toEqual(a.m.goals);
    expect(b.m.stats).toEqual(a.m.stats);
  });
});
