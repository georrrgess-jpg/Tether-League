import type { ArenaDef } from '../../content/arenas';
import type { ChassisDef } from '../../content/chassis';
import { DT, TUNING } from '../../content/tuning';
import { clearCommand, emptyCommand, type Command, type World } from './types';
import { createRobot, createWorld, placeBall, placeRobot, stepWorld } from './world';

export type MatchPhase = 'countdown' | 'play' | 'goal' | 'ended';

export interface RobotStats {
  goals: number;
  assists: number;
  saves: number;
  shots: number;
  passes: number;
  interceptions: number;
  kicks: number;
  swingKicks: number;
  swings: number;
  ownGoals: number;
  /** Plays: long balls a teammate collected, completed give-and-goes (credited to the runner), wall passes collected, one-touch goals. */
  longBalls: number;
  giveAndGos: number;
  wallPasses: number;
  oneTouchGoals: number;
  /** Successful nutmegs. */
  megs: number;
}

export interface GoalRecord {
  /** Seconds of play elapsed when the goal was scored. */
  time: number;
  team: 0 | 1;
  /** Robot id of the scorer, -1 when it cannot be attributed (own goals are never credited to an attacker). */
  scorer: number;
  assist: number;
  ownGoalBy: number;
  overtime: boolean;
  swing: boolean;
  /** Scored first time off a teammate pass. */
  oneTouch?: boolean;
}

export type PlayKind = 'long_ball' | 'give_and_go' | 'wall_pass' | 'one_touch' | 'nutmeg';

export type MatchEvent =
  | { type: 'countdown'; n: number }
  | { type: 'go' }
  | { type: 'goal'; record: GoalRecord }
  | { type: 'overtime' }
  | { type: 'final' }
  | { type: 'save'; robot: number }
  | { type: 'pass'; from: number; to: number }
  | { type: 'intercept'; robot: number }
  | { type: 'shot'; robot: number }
  /** A completed play, credited to `robot` (long ball / wall pass: the passer; give-and-go: the runner). */
  | { type: 'play'; play: PlayKind; robot: number; perfect: boolean };

export interface MatchConfig {
  arena: ArenaDef;
  /** Chassis for robots 0..3: team 0 slot 0/1, team 1 slot 0/1. */
  chassis: [ChassisDef, ChassisDef, ChassisDef, ChassisDef];
  /** Index of the human-controlled robot, or -1 for an all-bot match. */
  human: number;
  assist: 0 | 1 | 2;
  regulationSeconds: number;
}

interface Touch {
  robot: number;
  team: 0 | 1;
  tick: number;
  deliberate: boolean;
  swing: boolean;
  oneTouch: boolean;
}

function newStats(): RobotStats {
  return { goals: 0, assists: 0, saves: 0, shots: 0, passes: 0, interceptions: 0, kicks: 0, swingKicks: 0, swings: 0, ownGoals: 0, longBalls: 0, giveAndGos: 0, wallPasses: 0, oneTouchGoals: 0, megs: 0 };
}

const HZ = TUNING.sim.hz;
const idle: Command[] = [emptyCommand(), emptyCommand(), emptyCommand(), emptyCommand()];

/**
 * Match rules on top of the world simulation: phases, clock, scoring, overtime and attribution.
 *
 * Per-tick order: countdown/goal/ended bookkeeping, or (play) goal-bound probe -> stepWorld ->
 * attribution of touches -> goal settlement -> clock -> regulation/overtime resolution.
 * A goal and the final clock tick in the same step always resolve as "goal counts, then full time".
 */
export class Match {
  readonly world: World;
  readonly config: MatchConfig;
  phase: MatchPhase = 'countdown';
  phaseTime: number = TUNING.match.kickoffCountdown;
  clock: number;
  elapsed = 0;
  overtime = false;
  score: [number, number] = [0, 0];
  stats: RobotStats[] = [newStats(), newStats(), newStats(), newStats()];
  goals: GoalRecord[] = [];
  events: MatchEvent[] = [];
  /** Team that scored most recently (for celebration rendering), -1 before any goal. */
  lastGoalTeam: -1 | 0 | 1 = -1;

  private touches: Touch[] = [];
  private pendingPass: { from: number; team: 0 | 1; tick: number; x: number; z: number; lob: boolean; bank: boolean; perfect: boolean } | null = null;
  /** The last completed pass, for give-and-go detection. */
  private lastPass: { from: number; to: number; tick: number } | null = null;
  private pendingIntercept: { robot: number; team: 0 | 1; tick: number } | null = null;
  private pendingSave: { robot: number; side: 0 | 1; tick: number } | null = null;
  private lastSaveTick: [number, number] = [-9999, -9999];
  private goalBound: { side: 0 | 1; tick: number } | null = null;
  private lastCountdown = -1;
  private celebrationElapsed = 0;

  constructor(config: MatchConfig) {
    this.config = config;
    const robots = [
      createRobot(0, 0, 0, config.chassis[0], config.human === 0),
      createRobot(1, 0, 1, config.chassis[1], config.human === 1),
      createRobot(2, 1, 0, config.chassis[2], config.human === 2),
      createRobot(3, 1, 1, config.chassis[3], config.human === 3),
    ];
    if (config.human >= 0) robots[config.human].assist = config.assist;
    this.world = createWorld(config.arena, robots);
    this.clock = config.regulationSeconds;
    this.kickoff();
  }

  /** Symmetric legal spawn (point reflection through the centre spot); clears all velocities and tethers. */
  kickoff(): void {
    const w = this.world;
    const sx = w.hx / 15;
    placeRobot(w.robots[0], -4.2 * sx, -1.5, 0);
    placeRobot(w.robots[1], -9.5 * sx, 2.8, 0);
    placeRobot(w.robots[2], 4.2 * sx, 1.5, Math.PI);
    placeRobot(w.robots[3], 9.5 * sx, -2.8, Math.PI);
    placeBall(w, 0, 0);
    this.touches.length = 0;
    this.pendingPass = null;
    this.pendingIntercept = null;
    this.pendingSave = null;
    this.lastPass = null;
    this.goalBound = null;
    this.lastCountdown = -1;
  }

  get finished(): boolean {
    return this.phase === 'ended';
  }

  get winner(): 0 | 1 | -1 {
    if (this.phase !== 'ended' || this.score[0] === this.score[1]) return -1;
    return this.score[0] > this.score[1] ? 0 : 1;
  }

  step(cmds: Command[]): void {
    this.events.length = 0;
    const w = this.world;
    switch (this.phase) {
      case 'countdown': {
        w.events.length = 0;
        const n = Math.ceil(this.phaseTime);
        if (n !== this.lastCountdown && n > 0) {
          this.lastCountdown = n;
          this.events.push({ type: 'countdown', n });
        }
        this.phaseTime -= DT;
        if (this.phaseTime <= 0) {
          this.phase = 'play';
          this.events.push({ type: 'go' });
        }
        break;
      }
      case 'play': {
        this.probeGoalBound();
        stepWorld(w, cmds);
        this.attribute();
        this.elapsed += DT;
        if (!this.overtime) this.clock -= DT;
        if (this.phase === 'play' && !this.overtime && this.clock <= 0) {
          this.clock = 0;
          this.resolveRegulation();
        }
        break;
      }
      case 'goal': {
        for (const c of idle) clearCommand(c);
        stepWorld(w, idle);
        this.celebrationElapsed += DT;
        this.phaseTime -= DT;
        const human = this.config.human;
        if (human >= 0 && cmds[human].kick && this.celebrationElapsed > TUNING.match.goalCelebrationMinSkip) this.phaseTime = 0;
        if (this.phaseTime <= 0) {
          if (this.overtime) this.end();
          else if (this.clock <= 0) {
            this.clock = 0;
            this.resolveRegulation();
          } else {
            this.kickoff();
            this.phase = 'countdown';
            this.phaseTime = TUNING.match.goalCountdown;
          }
        }
        break;
      }
      case 'ended':
        w.events.length = 0;
        break;
    }
  }

  private resolveRegulation(): void {
    if (this.score[0] === this.score[1]) {
      this.overtime = true;
      this.kickoff();
      this.phase = 'countdown';
      this.phaseTime = TUNING.match.kickoffCountdown;
      this.events.push({ type: 'overtime' });
    } else this.end();
  }

  private end(): void {
    this.phase = 'ended';
    this.events.push({ type: 'final' });
  }

  /** Conservative straight-line probe: is the ball currently heading into a goal mouth? */
  private probeGoalBound(): void {
    const w = this.world;
    const b = w.ball;
    const sp = Math.hypot(b.vx, b.vz);
    this.goalBound = null;
    if (sp < 3.5 || Math.abs(b.vx) < 1) return;
    const side: 0 | 1 = b.vx > 0 ? 1 : 0;
    const gx = side === 1 ? w.hx : -w.hx;
    const t = (gx - b.x) / b.vx;
    if (t < 0 || t > 1.5) return;
    const zAt = b.z + b.vz * t;
    if (Math.abs(zAt) > w.arena.goalWidth / 2 - 0.25) return;
    if (Math.abs(gx - b.x) > sp * 1.6) return;
    this.goalBound = { side, tick: w.tick };
  }

  /** Plays completed by a pass from pp.from that `to` collected. */
  private completePlays(pp: { from: number; tick: number; lob: boolean; bank: boolean; perfect: boolean }, to: number, tick: number): void {
    if (pp.lob) {
      this.stats[pp.from].longBalls++;
      this.events.push({ type: 'play', play: 'long_ball', robot: pp.from, perfect: pp.perfect });
    } else if (pp.bank) {
      this.stats[pp.from].wallPasses++;
      this.events.push({ type: 'play', play: 'wall_pass', robot: pp.from, perfect: false });
    }
    // Give-and-go: A passed to B, and B's pass now comes straight back to A within the window.
    const lp = this.lastPass;
    if (lp && lp.from === to && lp.to === pp.from && tick - lp.tick <= TUNING.kick.giveGoWindow * HZ) {
      this.stats[to].giveAndGos++;
      this.events.push({ type: 'play', play: 'give_and_go', robot: to, perfect: pp.tick - lp.tick <= 0.9 * HZ });
      this.lastPass = null;
    } else this.lastPass = { from: pp.from, to, tick };
  }

  private recordTouch(robot: number, deliberate: boolean, swing: boolean, oneTouch = false): void {
    const w = this.world;
    const team = w.robots[robot].team;
    const tick = w.tick;
    const prev = this.touches.length ? this.touches[this.touches.length - 1] : null;

    // Save: a defender interrupts a goal-bound ball that the other team sent.
    const gb = this.goalBound;
    if (gb && gb.side === team && prev && prev.team !== team && tick - this.lastSaveTick[team] > TUNING.stats.saveDebounce * HZ && !this.pendingSave) {
      this.pendingSave = { robot, side: gb.side, tick };
    }

    // Pass completion / interception bookkeeping.
    const pp = this.pendingPass;
    if (pp) {
      if (team === pp.team) {
        if (robot !== pp.from && tick - pp.tick <= TUNING.stats.passWindow * HZ) {
          this.stats[pp.from].passes++;
          this.events.push({ type: 'pass', from: pp.from, to: robot });
          this.pendingPass = null;
          this.completePlays(pp, robot, tick);
        }
      } else {
        this.lastPass = null;
        // Only a ball that has genuinely travelled counts; scrambles next to the kicker do not.
        const travelled = Math.hypot(w.ball.x - pp.x, w.ball.z - pp.z);
        if (tick - pp.tick <= 3 * HZ && travelled >= 4 && !this.pendingSave) {
          if (deliberate) {
            this.stats[robot].interceptions++;
            this.events.push({ type: 'intercept', robot });
          } else this.pendingIntercept = { robot, team, tick };
        }
        this.pendingPass = null;
      }
    } else if (this.pendingIntercept) {
      const pi = this.pendingIntercept;
      if (team === pi.team && tick - pi.tick <= 2.5 * HZ && (deliberate || robot !== pi.robot || tick - pi.tick > 12)) {
        this.stats[pi.robot].interceptions++;
        this.events.push({ type: 'intercept', robot: pi.robot });
        this.pendingIntercept = null;
      } else if (team !== pi.team) this.pendingIntercept = null;
    }

    this.touches.push({ robot, team, tick, deliberate, swing, oneTouch });
    if (this.touches.length > 16) this.touches.shift();
  }

  private attribute(): void {
    const w = this.world;
    let goalSide: -1 | 0 | 1 = -1;
    for (const e of w.events) {
      switch (e.type) {
        case 'kick': {
          const r = w.robots[e.robot];
          const st = this.stats[e.robot];
          st.kicks++;
          if (e.swing) st.swingKicks++;
          this.recordTouch(e.robot, true, e.swing, e.oneTouch);
          this.pendingPass = { from: e.robot, team: r.team, tick: w.tick, x: w.ball.x, z: w.ball.z, lob: e.lob, bank: e.bank, perfect: e.perfect };
          // Shot: the kicked ball's straight path meets the opponent goal mouth and has the pace to arrive.
          const b = w.ball;
          const gx = r.team === 0 ? w.hx : -w.hx;
          if (Math.abs(b.vx) > 0.5 && (gx - b.x) * b.vx > 0) {
            const t = (gx - b.x) / b.vx;
            const zAt = b.z + b.vz * t;
            if (Math.abs(zAt) <= w.arena.goalWidth / 2 - 0.1 && Math.abs(gx - b.x) <= e.speed * 1.7) {
              st.shots++;
              this.events.push({ type: 'shot', robot: e.robot });
            }
          }
          break;
        }
        case 'touch':
          this.recordTouch(e.robot, false, false);
          break;
        case 'meg':
          // A nutmeg attempt is a deliberate touch by the attacker; a successful one is a completed play.
          this.recordTouch(e.robot, true, false);
          this.pendingPass = null;
          if (e.success) {
            this.stats[e.robot].megs++;
            this.events.push({ type: 'play', play: 'nutmeg', robot: e.robot, perfect: e.chance < 0.45 });
          }
          break;
        case 'attach':
          this.stats[e.robot].swings++;
          break;
        case 'goal':
          goalSide = e.side;
          break;
      }
    }

    if (this.pendingSave) {
      const ps = this.pendingSave;
      const age = w.tick - ps.tick;
      if (goalSide === ps.side) this.pendingSave = null;
      else if (age > 0.6 * HZ) {
        // A deflection that only slows the shot is not a save yet: wait while the ball is still
        // rolling toward that goal mouth (bounded, so a ball resting near the line still resolves).
        const b = w.ball;
        const dir = ps.side === 1 ? 1 : -1;
        const toLine = w.hx - b.x * dir;
        const threatening = toLine < 6 && b.vx * dir > 0.4 && Math.abs(b.z) < w.arena.goalWidth / 2 + 0.3;
        if (!threatening || age > 3 * HZ) {
          this.stats[ps.robot].saves++;
          this.lastSaveTick[ps.side] = w.tick;
          this.events.push({ type: 'save', robot: ps.robot });
          this.pendingSave = null;
        }
      }
    }

    if (goalSide !== -1) this.settleGoal(goalSide);
  }

  private settleGoal(side: 0 | 1): void {
    const w = this.world;
    const team: 0 | 1 = side === 1 ? 0 : 1; // the +x goal is attacked by team 0
    this.score[team]++;
    this.lastGoalTeam = team;

    let scorer = -1;
    let assist = -1;
    let ownGoalBy = -1;
    let swing = false;
    let oneTouch = false;
    const ts = this.touches;
    const last = ts.length ? ts[ts.length - 1] : null;
    let scorerIdx = -1;
    if (last) {
      if (last.team === team) scorerIdx = ts.length - 1;
      else {
        // Deflection off a defender: credit a recent attacking touch, otherwise it is an own goal.
        for (let i = ts.length - 2; i >= 0; i--) {
          if (ts[i].team === team) {
            if (last.tick - ts[i].tick <= 3 * HZ) scorerIdx = i;
            break;
          }
        }
        if (scorerIdx < 0) ownGoalBy = last.robot;
      }
    }
    if (scorerIdx >= 0) {
      const st = ts[scorerIdx];
      scorer = st.robot;
      swing = st.swing;
      oneTouch = st.oneTouch;
      this.stats[scorer].goals++;
      if (oneTouch) {
        this.stats[scorer].oneTouchGoals++;
        this.events.push({ type: 'play', play: 'one_touch', robot: scorer, perfect: false });
      }
      for (let i = scorerIdx - 1; i >= 0; i--) {
        const t = ts[i];
        if (st.tick - t.tick > TUNING.stats.assistWindow * HZ) break;
        if (t.team !== team) {
          if (t.deliberate) break; // opponent control in between
          continue;
        }
        if (t.robot !== scorer && t.deliberate) {
          assist = t.robot;
          this.stats[assist].assists++;
          break;
        }
      }
    } else if (ownGoalBy >= 0) this.stats[ownGoalBy].ownGoals++;

    const record: GoalRecord = { time: this.elapsed, team, scorer, assist, ownGoalBy, overtime: this.overtime, swing, oneTouch };
    this.goals.push(record);
    this.events.push({ type: 'goal', record });
    this.phase = 'goal';
    this.phaseTime = TUNING.match.goalCelebration;
    this.celebrationElapsed = 0;
    this.pendingPass = null;
    this.pendingIntercept = null;
    this.pendingSave = null;
    this.lastPass = null;
  }
}
