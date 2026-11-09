import { audio } from '../../audio/audio';
import type { RobotLook } from '../../content/cosmetics';
import { LESSONS, type LessonId } from '../../content/trials';
import { DT, TUNING } from '../../content/tuning';
import { keyLabel, type Settings } from '../../storage/settings';
import type { Command, SimEvent } from '../sim/types';
import { Scenario, runTo, type ScenarioRobot } from './scenario';

const YELLOW = '#ffe36a';
const CYAN = '#7ff3ff';
const PARK: [number, number] = [-13.4, -8.4];

interface Step {
  text: string;
  sub?: string;
  enter(): void;
  /** Returns true when the step's goal has been met. */
  check(events: SimEvent[]): boolean;
}

/**
 * Academy lessons: every step is played, never just read. A step can always be retried; nothing here
 * awards a match win.
 */
export class LessonMode extends Scenario {
  readonly title: string;
  readonly leaveNote = 'Leave the lesson? You can restart it from the Academy at any time.';
  private steps: Step[] = [];
  private index = -1;
  private wait = 0;
  private stepT = 0;
  private a = 0;
  private b = 0;
  private flag = false;
  private touch: boolean;

  constructor(readonly id: LessonId, looks: RobotLook[], settings: () => Settings) {
    super('harbor_park', LessonMode.robots(id, looks), settings);
    const def = LESSONS.find((l) => l.id === id)!;
    this.title = `Academy: ${def.name}`;
    this.setTask(def.name, def.summary);
    this.touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    this.ready = 0.9;
    this.world.goalsOpen = id === 'kick' || id === 'pass' || id === 'defend';
    this.build();
    this.next();
  }

  private static robots(id: LessonId, looks: RobotLook[]): ScenarioRobot[] {
    const me: ScenarioRobot = { team: 0, look: looks[0] };
    return id === 'pass' ? [me, { team: 0, look: looks[1] }] : [me];
  }

  /** Onboarding chains the three essentials; other lessons stand alone. */
  nextLesson(): LessonId | null {
    const chain: LessonId[] = ['move', 'tether', 'kick'];
    const i = chain.indexOf(this.id);
    return i >= 0 && i < chain.length - 1 ? chain[i + 1] : null;
  }

  private keys(): { move: string; tether: string; kick: string } {
    const k = this.settings().keys;
    if (this.touch) return { move: 'the left side of the screen', tether: 'TETHER', kick: 'KICK' };
    return {
      move: `${keyLabel(k.up[0])} ${keyLabel(k.left[0])} ${keyLabel(k.down[0])} ${keyLabel(k.right[0])}`,
      tether: `right mouse or ${keyLabel(k.tether[0])}`,
      kick: `left mouse or ${keyLabel(k.kick[0])}`,
    };
  }

  private me() {
    return this.world.robots[0];
  }

  private reach(x: number, z: number, r: number): boolean {
    const p = this.me();
    return Math.hypot(p.x - x, p.z - z) < r;
  }

  private target(x: number, z: number, r = 1.3): void {
    this.setMarkers([{ kind: 'ring', x, z, r, color: YELLOW, pulse: true }, { kind: 'disc', x, z, r: r * 0.9, color: YELLOW, opacity: 0.25 }]);
  }

  private build(): void {
    const k = this.keys();
    const w = this.world;
    const hx = w.hx;
    switch (this.id) {
      case 'move':
        this.steps = [
          {
            text: `Move with ${k.move}. Run into the glowing circle.`,
            sub: 'The white ring under your robot shows which one is you.',
            enter: () => {
              this.place(0, -9, 0, 0);
              this.ball(PARK[0], PARK[1]);
              this.target(-3.5, 3);
            },
            check: () => this.reach(-3.5, 3, 1.3),
          },
          {
            text: 'Now stop inside this one.',
            sub: 'Robots take a moment to brake. Let go early.',
            enter: () => this.target(2.5, -4),
            check: () => {
              const p = this.me();
              this.a = this.reach(2.5, -4, 1.3) && Math.hypot(p.vx, p.vz) < 0.8 ? this.a + DT : 0;
              return this.a > 0.35;
            },
          },
          {
            text: 'You attack the goal on the right. Run to the spot in front of it.',
            sub: 'Your own goal is on the left, in your club colour.',
            enter: () => this.target(hx - 4, 0, 1.5),
            check: () => this.reach(hx - 4, 0, 1.5),
          },
        ];
        break;
      case 'tether':
        this.steps = [
          {
            text: `An anchor in reach glows. Hold ${k.tether} to attach your tether.`,
            sub: this.touch ? 'Move toward an anchor to choose it.' : 'Point the mouse near an anchor to choose it, or use Q / E.',
            enter: () => {
              this.place(0, -8, 4.5, 0);
              this.ball(PARK[0], PARK[1]);
              this.setMarkers([]);
            },
            check: (ev) => ev.some((e) => e.type === 'attach' && e.robot === 0),
          },
          {
            text: 'Keep holding and steer along the swing to build speed.',
            sub: 'Steering toward the anchor tightens the turn; the ring under you shows the time left.',
            enter: () => {},
            check: () => {
              const p = this.me();
              return p.tState === 'attached' && Math.hypot(p.vx, p.vz) >= 8.2;
            },
          },
          {
            text: 'Let go to launch! You fly off in the direction you were travelling.',
            sub: 'Release earlier or later to change where you go.',
            enter: () => {},
            check: (ev) => ev.some((e) => e.type === 'release' && e.robot === 0 && e.speed >= 6.5),
          },
          {
            text: 'Swing, then release so your launch carries you through the gate.',
            sub: 'You must still be faster than running speed when you cross it.',
            enter: () => {
              this.place(0, -8, 5, 0);
              this.setMarkers([{ kind: 'gate', x: 3, z: 1.6, x2: 3, z2: 6.6, color: YELLOW, width: 0.5 }]);
            },
            check: () => this.gate(3, 1.6, 3, 6.6),
          },
          {
            text: 'Once more on the other wing.',
            sub: 'Any anchor works. Pick the one that sends you where you want to go.',
            enter: () => {
              this.place(0, -8, -5, 0);
              this.setMarkers([{ kind: 'gate', x: 3, z: -6.6, x2: 3, z2: -1.6, color: YELLOW, width: 0.5 }]);
            },
            check: () => this.gate(3, -6.6, 3, -1.6),
          },
        ];
        break;
      case 'kick':
        this.steps = [
          {
            text: `Run to the ball. When its ring lights up, press ${k.kick} to kick.`,
            sub: this.touch ? 'Tap KICK to kick ahead, or drag it to aim.' : 'The ball goes toward your aim point.',
            enter: () => {
              this.place(0, -3.5, 0.5, 0);
              this.ball(0, 0);
              this.setMarkers([]);
            },
            check: (ev) => ev.some((e) => e.type === 'kick' && e.robot === 0),
          },
          {
            text: 'Score in the open goal on the right.',
            sub: 'Aim between the posts. Light aim assist nudges close shots on target.',
            enter: () => {
              this.a = 7;
              this.b = 1.5;
              this.place(0, 4, 3, 0);
              this.ball(7, 1.5);
            },
            check: (ev) => this.scored(ev),
          },
          {
            text: 'Momentum adds power. Run through the ball and kick while moving.',
            sub: 'A running kick is harder than a standing one; a swing kick is the hardest.',
            enter: () => {
              this.a = 3;
              this.b = -3;
              this.place(0, -3, -3, 0);
              this.ball(3, -3);
            },
            check: (ev) => {
              this.resetStrayBall(ev);
              return ev.some((e) => e.type === 'kick' && e.robot === 0 && e.speed >= 11.4);
            },
          },
          {
            text: 'Now finish: score one more.',
            sub: 'Every match is won by goals, however they go in.',
            enter: () => {},
            check: (ev) => this.scored(ev),
          },
        ];
        break;
      case 'pass':
        this.steps = [
          {
            text: `Aim at your teammate and press ${k.kick} to pass.`,
            sub: 'Passes that are aimed close to a teammate are weighted so they can be collected.',
            enter: () => {
              this.a = -2.5;
              this.b = 2;
              this.place(0, -4.5, 2.2, 0);
              this.place(1, 5, -3, Math.PI);
              this.ball(-2.5, 2);
              this.flag = false;
              this.setMarkers([]);
            },
            check: (ev) => this.received(ev),
          },
          {
            text: 'Again, but your teammate is moving. Lead them.',
            sub: 'Aim where they are going, not where they are.',
            enter: () => {
              this.a = -3;
              this.b = -2;
              this.place(0, -5, -2.4, 0);
              this.ball(-3, -2);
              this.flag = false;
            },
            check: (ev) => this.received(ev),
          },
          {
            text: 'Give and go: pass, run into the marked space, and shoot the return ball.',
            sub: 'Moving after a pass is how two robots beat a defence.',
            enter: () => {
              this.a = -1;
              this.b = 3;
              this.place(0, -3, 3.3, 0);
              this.place(1, 5, 4.5, Math.PI);
              this.ball(-1, 3);
              this.flag = false;
              this.target(9.5, -1, 1.6);
            },
            check: (ev) => {
              this.received(ev);
              return this.scored(ev);
            },
          },
        ];
        break;
      case 'defend':
        this.steps = [
          {
            text: 'Get goal-side: stand between the ball and your goal.',
            sub: 'From there you can block shots and passes toward goal.',
            enter: () => {
              this.place(0, 2, -4, Math.PI);
              this.ball(-2, 4.5);
              this.target(-9.2, 2, 1.3);
            },
            check: () => this.reach(-9.2, 2, 1.3),
          },
          {
            text: 'Shot incoming! Block it with your body or kick it clear.',
            sub: 'The orange ring shows where the shot starts.',
            enter: () => this.shot(-10, 0.5, -1, -6, 1.2, 9.5, 1.4),
            check: (ev) => this.saved(ev, () => this.shot(-10, 0.5, -1, -6, 1.2, 9.5, 1.4)),
          },
          {
            text: 'Caught upfield! Tether to an anchor and swing back to cover your goal.',
            sub: 'A swing recovers much faster than running.',
            enter: () => this.shot(4, 6.5, 5, -6, -1.4, 9, 2.6),
            check: (ev) => this.saved(ev, () => this.shot(4, 6.5, 5, -6, -1.4, 9, 2.6)),
          },
        ];
        break;
    }
  }

  // ----------------------------------------------------------- step helpers

  private gate(ax: number, az: number, bx: number, bz: number): boolean {
    const p = this.me();
    if (!this.playerCrossed(ax, az, bx, bz)) return false;
    if (p.tState !== 'attached' && Math.hypot(p.vx, p.vz) >= 5.9) return true;
    this.toast(p.tState === 'attached' ? 'Release before the gate' : 'Too slow: launch from a swing', 'bad');
    return false;
  }

  /** Put the ball back on its spot when it has rolled away and stopped. */
  private resetStrayBall(ev: SimEvent[]): void {
    const b = this.world.ball;
    if (ev.some((e) => e.type === 'goal')) {
      this.ball(this.a, this.b);
      this.stepT = 0;
      return;
    }
    const away = Math.hypot(b.x - this.a, b.z - this.b) > 1.5;
    this.stepT = away && Math.hypot(b.vx, b.vz) < 0.5 ? this.stepT + DT : 0;
    if (this.stepT > 2) {
      this.ball(this.a, this.b);
      this.stepT = 0;
      this.toast('Ball reset');
    }
  }

  private scored(ev: SimEvent[]): boolean {
    for (const e of ev) {
      if (e.type === 'goal') {
        if (e.side === 1) {
          audio.play('goal');
          return true;
        }
        this.toast('That is your own goal. Attack the right-hand one', 'bad');
      }
    }
    this.resetStrayBall(ev);
    return false;
  }

  private received(ev: SimEvent[]): boolean {
    for (const e of ev) {
      if (e.type === 'kick' && e.robot === 0) this.flag = true;
      if ((e.type === 'touch' || e.type === 'kick') && e.robot === 1 && this.flag) {
        this.flag = false;
        this.toast('Pass received', 'good');
        this.wait2 = 1;
        return true;
      }
    }
    if (this.wait2 <= 0) this.resetStrayBall(ev);
    return false;
  }
  private wait2 = 0;

  private shotCfg = { fx: 0, fz: 0, z: 0, speed: 0 };
  private shotPhase = 0;
  private shotT = 0;

  private shot(px: number, pz: number, fx: number, fz: number, z: number, speed: number, telegraph: number): void {
    this.place(0, px, pz, Math.PI);
    this.ball(fx, fz);
    this.shotCfg = { fx, fz, z, speed };
    this.shotPhase = 0;
    this.shotT = telegraph;
    this.flag = false;
    this.setMarkers([{ kind: 'ring', x: fx, z: fz, r: 1, color: '#ff8a66', pulse: true }]);
  }

  private saved(ev: SimEvent[], retry: () => void): boolean {
    const w = this.world;
    const b = w.ball;
    const s = this.shotCfg;
    this.shotT -= DT;
    if (this.shotPhase === 0) {
      b.x = s.fx;
      b.z = s.fz;
      b.vx = b.vz = 0;
      if (this.shotT <= 0) {
        const dx = -w.hx - s.fx;
        const dz = s.z - s.fz;
        const l = Math.hypot(dx, dz);
        b.vx = (dx / l) * s.speed;
        b.vz = (dz / l) * s.speed;
        this.shotPhase = 1;
        this.shotT = 3.6;
        this.setMarkers([]);
        audio.play('kick', { intensity: 0.7 });
      }
      return false;
    }
    for (const e of ev) {
      if (e.type === 'goal') {
        if (e.side === 0) {
          this.toast('It went in. Try again: get on the line of the shot', 'bad');
          audio.play('concede');
          retry();
          return false;
        }
        return true;
      }
      if ((e.type === 'touch' || e.type === 'kick') && e.robot === 0) this.flag = true;
    }
    const sp = Math.hypot(b.vx, b.vz);
    if ((this.flag && (b.vx > 0.5 || sp < 1.2)) || this.shotT <= 0) {
      this.toast('Saved!', 'good');
      return true;
    }
    return false;
  }

  // ----------------------------------------------------------------- flow

  private next(): void {
    this.index++;
    this.a = 0;
    this.stepT = 0;
    if (this.index >= this.steps.length) {
      this.setMarkers([]);
      this.coach('Done', 'Lesson complete!', '', true);
      this.finish(true, 'LESSON COMPLETE', '');
      return;
    }
    const s = this.steps[this.index];
    s.enter();
    this.coach(`Step ${this.index + 1} of ${this.steps.length}`, s.text, s.sub ?? '');
  }

  protected override before(cmds: Command[]): void {
    if (this.id !== 'pass') return;
    const w = this.world;
    const mate = w.robots[1];
    const c = cmds[1];
    const b = w.ball;
    const bd = Math.hypot(b.x - mate.x, b.z - mate.z);
    if (this.wait2 > 0) this.wait2 -= DT;
    if (this.index === 1) {
      // patrol
      const tz = Math.sin(this.t * 0.9) * 4.5;
      runTo(c, 5.5, tz, mate.x, mate.z, 0.2);
    } else if (this.index === 2) {
      if (bd < TUNING.kick.range - 0.1 && mate.kickCd <= 0 && b.lastTouchRobot !== 1 && Math.hypot(b.vx, b.vz) < 9) {
        // return ball into the marked space
        c.ax = 9.5;
        c.az = -1;
        c.kick = true;
        c.power = 0.72;
      } else if (bd < 5 && b.lastTouchRobot === 0) runTo(c, b.x + b.vx * 0.2, b.z + b.vz * 0.2, mate.x, mate.z, 0.2);
      else runTo(c, 5, 4.5, mate.x, mate.z, 0.3);
    } else if (bd < 4 && Math.hypot(b.vx, b.vz) > 1) runTo(c, b.x + b.vx * 0.2, b.z + b.vz * 0.2, mate.x, mate.z, 0.2);
  }

  protected after(events: SimEvent[]): void {
    if (this.wait > 0) {
      this.wait -= DT;
      if (this.wait <= 0) this.next();
      return;
    }
    const s = this.steps[this.index];
    if (s && s.check(events)) {
      audio.play('gate', { intensity: 0.6 });
      this.coach(`Step ${this.index + 1} of ${this.steps.length}`, 'Nice!', '', true);
      this.wait = 0.7;
    }
  }
}
