import { audio } from '../../audio/audio';
import type { RobotLook } from '../../content/cosmetics';
import { TRIALS, type TrialId } from '../../content/trials';
import { DT, TUNING } from '../../content/tuning';
import type { Settings } from '../../storage/settings';
import { fmtTime } from '../../ui/dom';
import { BotDirector, CLUB_STYLE, DIFFICULTY } from '../ai/bot';
import type { Marker } from '../render/matchView';
import type { PlaySession } from '../session';
import type { Command, SimEvent } from '../sim/types';
import { OPPONENT_LOOK, Scenario, runTo, type ScenarioRobot } from './scenario';
import { BANKS, COUNTERS, PASS_HOME, RELEASES, SHOTS, SWING_GATES, WAYPOINTS, type Gate } from './trialData';

const YELLOW = '#ffe36a';
const CYAN = '#7ff3ff';
const DIM = '#9fb3c8';
const CARRY_SPEED = 5.9;


function robotsFor(id: TrialId, looks: RobotLook[]): ScenarioRobot[] {
  const me: ScenarioRobot = { team: 0, look: looks[0] };
  if (id === 'pass_window') return [me, { team: 0, look: looks[1] }];
  if (id === 'counterattack') return [me, { team: 1, look: OPPONENT_LOOK }, { team: 1, look: { ...OPPONENT_LOOK, number: 9 } }];
  return [me];
}

/**
 * Six deterministic skill trials. Layouts and shot lists are fixed data (no randomness), so personal
 * bests are comparable between attempts; TRIALS[id].rulesVersion guards against rule changes.
 */
export class TrialMode extends Scenario {
  readonly title: string;
  readonly leaveNote = 'Leave this trial? The attempt is discarded; your best score is kept.';
  private result: number | null = null;
  private step = 0;
  private count = 0;
  private attempt = 0;
  private phase = 0;
  private timer = 0;
  private flag = false;
  private flag2 = false;
  private bots: BotDirector | null = null;
  private lastSlowToast = -9;

  constructor(readonly id: TrialId, looks: RobotLook[], settings: () => Settings) {
    super(TRIALS[id].arena, robotsFor(id, looks), settings);
    const def = TRIALS[id];
    this.title = def.name;
    this.setTask(def.name, def.objective);
    this.world.goalsOpen = id === 'bank_shot' || id === 'last_second_save' || id === 'counterattack';
    this.setup();
  }

  score(): number | null {
    return this.result;
  }

  // --------------------------------------------------------------- setup

  private setup(): void {
    const w = this.world;
    switch (this.id) {
      case 'swing_school':
        this.place(0, -12, 5.2, 0);
        this.ball(-13.5, -8.5);
        this.gateMarkers();
        break;
      case 'clean_release':
        this.nextRelease();
        break;
      case 'bank_shot':
        this.nextBank();
        break;
      case 'pass_window':
        this.place(0, -7.5, 0.6, 0);
        this.place(1, WAYPOINTS[0][0], WAYPOINTS[0][1], Math.PI);
        this.ball(-5.5, 0);
        this.passMarkers();
        break;
      case 'last_second_save':
        this.nextShot();
        break;
      case 'counterattack':
        this.bots = new BotDirector(
          w,
          [
            { robot: 1, difficulty: DIFFICULTY.club, style: CLUB_STYLE.counter },
            { robot: 2, difficulty: DIFFICULTY.club, style: CLUB_STYLE.counter },
          ],
          4242,
        );
        this.nextCounter();
        break;
    }
  }

  private gateMarkers(): void {
    const list: Marker[] = [];
    SWING_GATES.forEach((g, i) => {
      if (i < this.step) return;
      list.push({ kind: 'gate', x: g[0], z: g[1], x2: g[2], z2: g[3], color: i === this.step ? YELLOW : DIM, width: 0.5, opacity: i === this.step ? 1 : 0.5 });
    });
    this.setMarkers(list);
  }

  private nextRelease(): void {
    const cfg = RELEASES[this.attempt];
    this.place(0, cfg.start[0], cfg.start[1], cfg.start[0] < 0 ? 0 : Math.PI);
    this.ball(-13.6, -8.6);
    this.timer = 0;
    this.flag = false; // has attached
    this.flag2 = false; // has launched
    const g = cfg.gate;
    this.setMarkers([{ kind: 'gate', x: g[0], z: g[1], x2: g[2], z2: g[3], color: YELLOW, width: 0.5 }]);
  }

  private nextBank(): void {
    const w = this.world;
    const cfg = BANKS[this.step];
    this.place(0, cfg.player[0], cfg.player[1], 0);
    this.ball(cfg.ball[0], cfg.ball[1]);
    this.flag = false;
    const z = cfg.wall * (w.hz - 0.3);
    this.setMarkers([
      { kind: 'line', x: cfg.seg[0], z, x2: cfg.seg[1], z2: z, color: YELLOW, width: 0.6 },
      { kind: 'ring', x: (cfg.seg[0] + cfg.seg[1]) / 2, z: cfg.wall * (w.hz - 1.2), r: 0.7, color: YELLOW, pulse: true },
    ]);
  }

  private passGate(): Gate {
    const wp = WAYPOINTS[this.step % WAYPOINTS.length];
    const [hx, hz] = PASS_HOME;
    const cx = (hx + wp[0]) / 2;
    const cz = (hz + wp[1]) / 2;
    const dx = wp[0] - hx;
    const dz = wp[1] - hz;
    const l = Math.hypot(dx, dz) || 1;
    const px = (-dz / l) * 1.9;
    const pz = (dx / l) * 1.9;
    return [cx - px, cz - pz, cx + px, cz + pz];
  }

  private passMarkers(): void {
    const g = this.passGate();
    const wp = WAYPOINTS[this.step % WAYPOINTS.length];
    this.setMarkers([
      { kind: 'gate', x: g[0], z: g[1], x2: g[2], z2: g[3], color: YELLOW, width: 0.5 },
      { kind: 'ring', x: wp[0], z: wp[1], r: 1.1, color: CYAN, opacity: 0.6 },
    ]);
  }

  private nextShot(): void {
    const s = SHOTS[this.step];
    this.place(0, s.start[0], s.start[1], Math.PI);
    this.ball(s.from[0], s.from[1]);
    this.phase = 0;
    this.timer = 1.25;
    this.setMarkers([{ kind: 'ring', x: s.from[0], z: s.from[1], r: 1, color: '#ff8a66', pulse: true }]);
  }

  private nextCounter(): void {
    const c = COUNTERS[this.attempt % COUNTERS.length];
    this.place(0, c.me[0], c.me[1], 0);
    this.place(1, c.a[0], c.a[1], Math.PI);
    this.place(2, c.b[0] + 2.5, c.b[1], Math.PI);
    const dx = c.b[0] - c.a[0];
    const dz = c.b[1] - c.a[1];
    const l = Math.hypot(dx, dz);
    this.ball(c.a[0] + (dx / l) * 1.1, c.a[1] + (dz / l) * 1.1);
    this.phase = 0;
    this.timer = 0.9;
    this.bots?.reset();
    this.setMarkers([{ kind: 'ring', x: c.b[0], z: c.b[1], r: 1, color: '#ff8a66', opacity: 0.6 }]);
  }

  // --------------------------------------------------------------- rules

  protected override before(cmds: Command[]): void {
    const w = this.world;
    if (this.id === 'pass_window') {
      const mate = w.robots[1];
      const c = cmds[1];
      const wp = WAYPOINTS[this.step % WAYPOINTS.length];
      const b = w.ball;
      const bd = Math.hypot(b.x - mate.x, b.z - mate.z);
      if (this.phase === 2) {
        // Returning the ball: get to it and knock it back toward the player's zone.
        runTo(c, b.x, b.z, mate.x, mate.z, 0.3);
        c.ax = w.robots[0].x;
        c.az = w.robots[0].z;
        if (bd < TUNING.kick.range - 0.1 && mate.kickCd <= 0) {
          c.kick = true;
          c.power = Math.max(0.5, Math.min(0.9, (5.5 + 0.55 * Math.hypot(c.ax - b.x, c.az - b.z)) / TUNING.kick.baseSpeed));
        }
      } else if (this.phase === 1 && bd < 4.5) {
        runTo(c, b.x + b.vx * 0.25, b.z + b.vz * 0.25, mate.x, mate.z, 0.2);
      } else runTo(c, wp[0], wp[1], mate.x, mate.z, 0.3);
    } else if (this.id === 'counterattack') {
      const c = COUNTERS[this.attempt % COUNTERS.length];
      if (this.phase === 2) this.bots!.update(cmds);
      else if (this.phase === 1) {
        // Receiver runs onto the pass; passer supports.
        const b = w.ball;
        runTo(cmds[2], b.x + b.vx * 0.3, b.z + b.vz * 0.3, w.robots[2].x, w.robots[2].z, 0.2);
        runTo(cmds[1], c.a[0] - 5, c.a[1] * 0.4, w.robots[1].x, w.robots[1].z, 0.5);
      } else runTo(cmds[2], c.b[0], c.b[1], w.robots[2].x, w.robots[2].z, 0.3);
    }
  }

  protected after(events: SimEvent[]): void {
    switch (this.id) {
      case 'swing_school':
        this.swingSchool();
        break;
      case 'clean_release':
        this.cleanRelease(events);
        break;
      case 'bank_shot':
        this.bankShot(events);
        break;
      case 'pass_window':
        this.passWindow(events);
        break;
      case 'last_second_save':
        this.lastSave(events);
        break;
      case 'counterattack':
        this.counter(events);
        break;
    }
  }

  private swingSchool(): void {
    const r = this.world.robots[0];
    const g = SWING_GATES[this.step];
    if (this.playerCrossed(g[0], g[1], g[2], g[3])) {
      const sp = Math.hypot(r.vx, r.vz);
      if (sp >= CARRY_SPEED) {
        this.step++;
        audio.play('gate', { intensity: 0.5 + this.step * 0.15 });
        this.toast(`Gate ${this.step}/3`, 'good');
        if (this.step >= 3) {
          this.result = Math.round(this.t * 100) / 100;
          this.setMarkers([]);
          this.finish(true, fmtTime(this.result), 'All gates cleared');
          return;
        }
        this.gateMarkers();
      } else if (this.t - this.lastSlowToast > 1.5) {
        this.lastSlowToast = this.t;
        this.toast('Too slow: swing through it', 'bad');
        audio.play('fail', { intensity: 0.3 });
      }
    }
    if (this.t > 90) this.finish(false, 'TIME UP', 'Try chaining swings between gates');
  }

  private cleanRelease(events: SimEvent[]): void {
    const r = this.world.robots[0];
    const cfg = RELEASES[this.attempt];
    this.timer += DT;
    for (const e of events) {
      if (e.type === 'attach') this.flag = true;
      if (e.type === 'release' && this.flag) this.flag2 = true;
    }
    const sp = Math.hypot(r.vx, r.vz);
    let outcome = 0;
    const g = cfg.gate;
    if (this.playerCrossed(g[0], g[1], g[2], g[3])) {
      if (this.flag2 && r.tState !== 'attached' && sp >= CARRY_SPEED) outcome = 1;
      else if (this.t - this.lastSlowToast > 1.2) {
        this.lastSlowToast = this.t;
        this.toast(r.tState === 'attached' ? 'Release before the lane' : 'Carry launch speed through the lane', 'bad');
      }
    }
    if (!outcome && this.flag2 && r.tState !== 'attached' && sp < TUNING.robot.maxRunSpeed + 0.15) outcome = -1;
    if (!outcome && this.timer > 8) outcome = -1;
    if (outcome) {
      if (outcome > 0) {
        this.count++;
        this.toast('Clean launch!', 'good');
        audio.play('gate', { intensity: 0.7 });
      } else {
        this.toast('Missed the lane', 'bad');
        audio.play('fail', { intensity: 0.3 });
      }
      this.attempt++;
      if (this.attempt >= RELEASES.length) {
        this.result = this.count;
        this.setMarkers([]);
        this.finish(this.count > 0, `${this.count} / 8`, 'Clean launches');
      } else this.nextRelease();
    }
  }

  private bankShot(events: SimEvent[]): void {
    const cfg = BANKS[this.step];
    for (const e of events) {
      if (e.type === 'kick' || e.type === 'touch') this.flag = false;
      else if (e.type === 'wall') {
        if (Math.sign(e.z) === cfg.wall && Math.abs(e.nz) > 0.9 && e.x >= cfg.seg[0] - 0.3 && e.x <= cfg.seg[1] + 0.3) {
          this.flag = true;
          audio.play('gate', { intensity: 0.4 });
        } else this.flag = false;
      } else if (e.type === 'goal') {
        if (e.side === 1 && this.flag) {
          this.count++;
          this.step++;
          audio.play('goal');
          this.toast(`Bank shot ${this.count}/3`, 'good');
          if (this.count >= 3) {
            this.result = Math.round(this.t * 100) / 100;
            this.setMarkers([]);
            this.finish(true, fmtTime(this.result), 'Three bank shots');
            return;
          }
        } else {
          this.toast(e.side === 1 ? 'Direct shot: bank it off the glowing wall' : 'Wrong goal', 'bad');
          audio.play('fail', { intensity: 0.3 });
        }
        this.nextBank();
        return;
      }
    }
    if (this.t > 90) this.finish(false, 'TIME UP', 'Aim at the glowing wall section');
  }

  private passWindow(events: SimEvent[]): void {
    const w = this.world;
    const g = this.passGate();
    this.timer += DT;
    for (const e of events) {
      if (e.type === 'kick' && e.robot === 0) {
        this.phase = 1;
        this.flag = false;
        this.timer = 0;
      } else if ((e.type === 'touch' || e.type === 'kick') && e.robot === 1) {
        if (this.phase === 1) {
          if (this.flag) {
            this.count++;
            this.toast(`Pass ${this.count}`, 'good');
            audio.play('gate', { intensity: 0.6 });
            this.step++;
            this.passMarkers();
          } else this.toast('Through the gate next time', 'bad');
          this.phase = 2;
          this.timer = 0;
        } else if (this.phase === 2 && e.type === 'kick') {
          this.phase = 0;
          this.timer = 0;
        }
      } else if (e.type === 'touch' && e.robot === 0 && this.phase === 1) this.flag = false;
    }
    if (this.phase === 1 && this.ballCrossed(g[0], g[1], g[2], g[3])) this.flag = true;
    // Recover from stray balls so the clock is spent passing, not chasing.
    const b = w.ball;
    const idle = Math.hypot(b.vx, b.vz) < 0.4;
    if ((this.phase === 1 && this.timer > 4.5) || (this.phase === 2 && this.timer > 5) || (this.phase === 0 && idle && this.timer > 6)) {
      this.ball(PASS_HOME[0] - 0.5, PASS_HOME[1]);
      this.phase = 0;
      this.timer = 0;
      this.toast('New ball');
    }
    if (this.t >= 45) {
      this.result = this.count;
      this.setMarkers([]);
      this.finish(this.count > 0, `${this.count}`, 'Completed passes');
    }
  }

  private lastSave(events: SimEvent[]): void {
    const w = this.world;
    const s = SHOTS[this.step];
    this.timer -= DT;
    if (this.phase === 0) {
      // telegraph: hold the ball on its spot
      w.ball.x = s.from[0];
      w.ball.z = s.from[1];
      w.ball.vx = w.ball.vz = 0;
      if (this.timer <= 0) {
        const gx = -w.hx;
        const dx = gx - s.from[0];
        const dz = s.z - s.from[1];
        const l = Math.hypot(dx, dz);
        w.ball.vx = (dx / l) * s.speed;
        w.ball.vz = (dz / l) * s.speed;
        this.phase = 1;
        this.timer = 3.4;
        this.flag = false;
        this.setMarkers([]);
        audio.play('kick', { intensity: 0.8 });
      }
      return;
    }
    let outcome = 0;
    for (const e of events) {
      if (e.type === 'goal') outcome = e.side === 0 ? -1 : 1;
      if ((e.type === 'touch' || e.type === 'kick') && e.robot === 0) this.flag = true;
    }
    const b = w.ball;
    if (!outcome && this.phase === 1) {
      const sp = Math.hypot(b.vx, b.vz);
      if (this.timer <= 0 || (this.flag && (b.vx > 0.5 || sp < 1.2)) || sp < 0.3) outcome = 1;
    }
    if (outcome && this.phase === 1) {
      this.phase = 2;
      this.timer = 0.8;
      if (outcome > 0) {
        this.count++;
        this.toast('SAVE!', 'good');
        audio.play('gate', { intensity: 0.8 });
      } else {
        this.toast('Goal conceded', 'bad');
        audio.play('concede');
      }
    }
    if (this.phase === 2 && this.timer <= 0) {
      this.step++;
      if (this.step >= SHOTS.length) {
        this.result = this.count;
        this.finish(this.count > 0, `${this.count} / 6`, 'Saves');
      } else nextTick(() => this.nextShot());
    }
  }

  private counter(events: SimEvent[]): void {
    const w = this.world;
    const c = COUNTERS[this.attempt % COUNTERS.length];
    const fail = (why: string) => {
      this.toast(why, 'bad');
      audio.play('fail', { intensity: 0.4 });
      this.attempt++;
      if (this.attempt >= 3) {
        this.result = null;
        this.finish(false, 'NO GOAL', 'Three attempts used');
      } else nextTick(() => this.nextCounter());
    };
    if (this.phase === 0) {
      this.timer -= DT;
      if (this.timer <= 0) {
        const b = w.ball;
        const dx = c.b[0] - b.x;
        const dz = c.b[1] - b.z;
        const l = Math.hypot(dx, dz);
        b.vx = (dx / l) * 9;
        b.vz = (dz / l) * 9;
        this.phase = 1;
        this.timer = 0;
        this.setMarkers([]);
        audio.play('kick', { intensity: 0.6 });
      }
      return;
    }
    this.timer += DT;
    for (const e of events) {
      if (e.type === 'goal') {
        if (e.side === 1) {
          this.result = Math.round(this.timer * 100) / 100;
          audio.play('goal');
          this.finish(true, fmtTime(this.result), 'Counterattack finished');
        } else fail('They scored');
        return;
      }
      if (this.phase === 1 && (e.type === 'touch' || e.type === 'kick')) {
        if (e.robot === 0) {
          this.phase = 2;
          this.toast('Intercepted! Go and score', 'good');
          audio.play('gate', { intensity: 0.7 });
        } else if (e.robot === 2) {
          fail('Pass completed: cut it out earlier');
          return;
        }
      }
    }
    if (this.timer > 30) fail('Too slow');
  }

  override frame(dt: number, s: PlaySession): void {
    super.frame(dt, s);
    switch (this.id) {
      case 'swing_school':
        this.setStat(`${fmtTime(this.t)} · gate ${Math.min(3, this.step + 1)}/3`);
        break;
      case 'clean_release':
        this.setStat(`Launch ${Math.min(8, this.attempt + 1)}/8 · ${this.count} clean`);
        break;
      case 'bank_shot':
        this.setStat(`${fmtTime(this.t)} · ${this.count}/3`);
        break;
      case 'pass_window':
        this.setStat(`${Math.max(0, 45 - this.t).toFixed(1)}s · ${this.count} passes`);
        break;
      case 'last_second_save':
        this.setStat(`Shot ${Math.min(6, this.step + 1)}/6 · ${this.count} saved`);
        break;
      case 'counterattack':
        this.setStat(`Attempt ${Math.min(3, this.attempt + 1)}/3 · ${this.phase > 0 ? fmtTime(this.timer) : '00:00.00'}`);
        break;
    }
  }
}

/** Defers a reset until the current tick's event loop is finished. */
function nextTick(fn: () => void): void {
  fn();
}
