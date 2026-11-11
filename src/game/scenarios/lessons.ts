import { audio } from '../../audio/audio';
import type { RobotLook } from '../../content/cosmetics';
import { LESSONS, type LessonId } from '../../content/trials';
import { DT, TUNING } from '../../content/tuning';
import { keyLabel, type Settings } from '../../storage/settings';
import type { Command, SimEvent } from '../sim/types';
import { lobPlan } from '../sim/world';
import { OPPONENT_LOOK, Scenario, runTo, type ScenarioRobot } from './scenario';

const YELLOW = '#ffe36a';
const CYAN = '#7ff3ff';
const PARK: [number, number] = [-13.4, -8.4];

interface Step {
  text: string;
  sub?: string;
  enter(): void;
  /** Advance without the short "Nice!" pause (used when the next step continues the same motion). */
  instant?: boolean;
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
    this.world.goalsOpen = id === 'kick' || id === 'pass' || id === 'defend' || id === 'plays';
    this.build();
    this.next();
  }

  private static robots(id: LessonId, looks: RobotLook[]): ScenarioRobot[] {
    const me: ScenarioRobot = { team: 0, look: looks[0] };
    if (id === 'plays') return [me, { team: 0, look: looks[1] }, { team: 1, look: OPPONENT_LOOK }];
    return id === 'pass' ? [me, { team: 0, look: looks[1] }] : [me];
  }

  /** Onboarding chains the three essentials; other lessons stand alone. */
  nextLesson(): LessonId | null {
    const chain: LessonId[] = ['move', 'tether', 'kick'];
    const i = chain.indexOf(this.id);
    return i >= 0 && i < chain.length - 1 ? chain[i + 1] : null;
  }

  private keys(): { move: string; tether: string; kick: string; pass: string; meg: string } {
    const k = this.settings().keys;
    if (this.touch) return { move: `the stick (bottom ${this.settings().touchSwap ? 'right' : 'left'})`, tether: 'SWING', kick: 'KICK', pass: 'PASS', meg: 'MEG' };
    return {
      move: `${keyLabel(k.up[0])} ${keyLabel(k.left[0])} ${keyLabel(k.down[0])} ${keyLabel(k.right[0])}`,
      tether: `right mouse or ${keyLabel(k.tether[0])}`,
      kick: `left mouse or ${keyLabel(k.kick[0])}`,
      pass: `${keyLabel(k.pass[0])} (or ${keyLabel(k.pass[1])})`,
      meg: keyLabel(k.meg[0]),
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
            text: this.touch ? 'Move toward the glowing circle and tap SWING.' : `Run toward the glowing circle (or point at it) and tap ${k.tether}.`,
            sub: 'Swings go the way you are moving; standing still, toward your cursor. The glowing anchor is the one you will use.',
            enter: () => {
              this.place(0, -9, 5, 0);
              this.ball(PARK[0], PARK[1]);
              this.flag = false;
              this.target(4, 5.5, 1.6);
            },
            check: (ev) => {
              if (ev.some((e) => e.type === 'release' && e.robot === 0)) this.flag = true;
              return this.flag && this.reach(4, 5.5, 2);
            },
          },
          {
            text: this.touch ? 'Head for the gate and tap SWING to launch through it.' : `Head for the gate and tap ${k.tether} to launch through it.`,
            sub: 'You must still be faster than running speed when you cross it.',
            enter: () => {
              this.place(0, -8, 5, 0);
              this.setMarkers([{ kind: 'gate', x: 1, z: 1.4, x2: 1, z2: 7, color: YELLOW, width: 0.5 }]);
            },
            check: () => this.gate(1, 1.4, 1, 7),
          },
          {
            text: this.touch ? 'Now hold SWING and let go yourself, when the rope glows green.' : `Now hold ${k.tether} and let go yourself, when the rope glows green.`,
            sub: 'Green means you are pointing at your aim right now. Letting go launches you straight ahead.',
            enter: () => {
              this.place(0, -8, -5, 0);
              this.setMarkers([{ kind: 'gate', x: 1, z: -7, x2: 1, z2: -1.4, color: YELLOW, width: 0.5 }]);
            },
            check: () => this.gate(1, -7, 1, -1.4),
          },
          {
            text: this.touch ? 'Swing into the ball, then tap KICK as you arrive.' : `Aim at the ball, tap ${k.tether}, then kick as you arrive.`,
            sub: 'A kick at launch speed is a power shot, much harder than a running kick.',
            enter: () => {
              this.a = 4;
              this.b = -2;
              this.place(0, -9, -5, 0);
              this.ball(4, -2);
              this.setMarkers([]);
            },
            check: (ev) => {
              this.resetStrayBall(ev);
              return ev.some((e) => e.type === 'kick' && e.robot === 0 && e.swing);
            },
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
            text: `Press ${k.pass} near the ball to pass to your teammate.`,
            sub: 'The pass button always finds your teammate, weighted so they can collect it. You can also aim and kick.',
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
            text: `Again: your teammate is moving. Press ${k.pass}.`,
            sub: 'A pass is played ahead of a moving teammate, into their path.',
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
            text: `Give and go: pass, run into the marked space, and shoot the return ball.`,
            sub: `Tip: in a match, press ${k.pass} without the ball to call for it.`,
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
      case 'plays':
        this.steps = [
          {
            text: `A defender blocks the lane. Hold ${k.pass} to charge a long ball, then let go to loft it over them.`,
            sub: 'The ring at your feet fills while you hold. The dot shows where the ball will land.',
            enter: () => this.lobDrill(false),
            check: (ev) => this.lobReceived(ev, false),
          },
          {
            text: 'Now a perfect one: let go when the ring reaches the gold notch.',
            sub: 'Perfect weight lands right on your teammate. Early drops short; late sails long.',
            enter: () => this.lobDrill(true),
            check: (ev) => this.lobReceived(ev, true),
          },
          {
            text: `Give-and-go: pass with ${k.pass}, sprint toward goal, and press ${k.pass} again while your teammate has the ball. Finish the return.`,
            sub: 'Call before your teammate settles it and the return comes first time, into your stride.',
            enter: () => {
              this.a = -4;
              this.b = 2.5;
              this.place(0, -5, 2.5, 0);
              this.place(1, 3, 6, Math.PI);
              this.place(2, PARK[0] + 26, -PARK[1], Math.PI);
              this.ball(-4, 2.5);
              this.flag = false;
              this.ggCall = false;
              this.ggReturned = false;
              this.target(8, 0.5, 1.8);
            },
            check: (ev) => {
              for (const e of ev) if (e.type === 'kick' && e.robot === 1 && e.giveGo) this.ggReturned = true;
              for (const e of ev) {
                if (e.type === 'goal' && e.side === 1) {
                  if (this.ggReturned) {
                    audio.play('goal');
                    return true;
                  }
                  this.toast('Goal, but use the give-and-go: pass, run, then call for it back', 'bad');
                }
              }
              this.resetGiveGo(ev);
              return false;
            },
          },
          {
            text: this.touch
              ? 'Nutmeg: run straight at the charging defender and tap MEG as it lights up.'
              : `Nutmeg: run straight at the charging defender and press ${k.meg} as the ball ring turns pink.`,
            sub: 'The ball goes through their legs and you run through after it. It takes a little luck: if they block it, go again.',
            enter: () => this.megDrill(),
            check: (ev) => this.megDone(ev),
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
            text: 'Caught upfield! Point back at your goal and tap swing to get there in time.',
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

  private ggCall = false;
  private ggReturned = false;

  /** Nutmeg drill: ball at your feet, a defender who charges straight at you once you set off. */
  private megDrill(): void {
    this.a = -6;
    this.b = 0;
    this.place(0, -7, 0, 0);
    this.place(1, -12, -7, 0);
    this.place(2, 6, 0, Math.PI);
    this.ball(this.a, this.b);
    this.flag = false;
    this.megGo = 0;
    this.stepT = 0;
    this.setMarkers([]);
  }

  private megGo = 0;

  private megDone(ev: SimEvent[]): boolean {
    for (const e of ev) {
      if (e.type !== 'meg' || e.robot !== 0) continue;
      if (e.success) {
        this.toast('Nutmeg! Right through them', 'good');
        return true;
      }
      this.toast('Blocked! Megs need a little luck: go again', 'bad');
      this.megGo = -1.2; // short pause, then reset
    }
    // Reset when the attempt fizzled out: blocked, the defender won the ball, or you ran past each other.
    const me = this.me();
    const def = this.world.robots[2];
    const b = this.world.ball;
    if (this.megGo < 0) {
      this.megGo += DT;
      if (this.megGo >= 0) this.megDrill();
      return false;
    }
    const lost = Math.hypot(b.x - me.x, b.z - me.z) > 4 || def.x < me.x - 1.5;
    this.stepT = lost ? this.stepT + DT : 0;
    if (this.stepT > 0.8) {
      this.megDrill();
      this.toast('Reset: run at the defender with the ball at your feet');
    }
    return false;
  }

  /** Long-ball drill: ball at your feet, teammate up the pitch, a defender parked in the straight lane. */
  private lobDrill(perfectOnly: boolean): void {
    this.a = -8.2;
    this.b = perfectOnly ? -2 : 1;
    this.place(0, -9, this.b, 0);
    this.place(1, 7, perfectOnly ? -4 : 3, Math.PI);
    this.place(2, -1.2, perfectOnly ? -2.6 : 1.6, Math.PI);
    this.ball(this.a, this.b);
    this.flag = false;
    const plan = lobPlan(this.world, this.me());
    if (plan) this.target(plan.x, plan.z, 1.4);
  }

  /** A long ball the teammate collects completes the step (a perfect one when required). */
  private lobReceived(ev: SimEvent[], perfectOnly: boolean): boolean {
    for (const e of ev) {
      if (e.type === 'kick' && e.robot === 0) {
        if (!e.lob) this.toast(`Hold ${this.keys().pass} longer: a tap is a ground pass the defender can block`, 'bad');
        else if (perfectOnly && !e.perfect) this.toast(e.perfect ? '' : 'Off the notch. Watch the ring and try again', 'bad');
        this.flag = e.lob && (!perfectOnly || e.perfect);
      }
      if (e.type === 'touch' && e.robot === 2 && this.flag) {
        this.flag = false;
        this.toast('The defender got to it. Try again', 'bad');
      }
      if ((e.type === 'touch' || e.type === 'kick') && e.robot === 1 && this.flag) {
        this.flag = false;
        this.toast(perfectOnly ? 'Perfect long ball!' : 'Long ball received!', 'good');
        this.wait2 = 1;
        return true;
      }
    }
    if (this.wait2 <= 0) this.resetStrayBall(ev);
    return false;
  }

  /** Give-and-go drill: reset when the ball goes dead without a goal. */
  private resetGiveGo(ev: SimEvent[]): void {
    const b = this.world.ball;
    const dead = Math.hypot(b.vx, b.vz) < 0.4 && Math.hypot(b.x - this.a, b.z - this.b) > 1.5 && Math.hypot(b.x - this.world.robots[1].x, b.z - this.world.robots[1].z) > 2;
    this.stepT = dead ? this.stepT + DT : 0;
    if (this.stepT > 2.2 || ev.some((e) => e.type === 'goal')) {
      const s = this.steps[this.index];
      s.enter();
      this.stepT = 0;
      this.toast('Reset: pass, run, call it back');
    }
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
    if (this.id === 'plays') {
      this.playsMate(cmds);
      return;
    }
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

  /** Plays lesson teammate: collects long balls; in the give-and-go step, returns the ball first time when called. */
  private playsMate(cmds: Command[]): void {
    const w = this.world;
    const mate = w.robots[1];
    const me = w.robots[0];
    const c = cmds[1];
    const b = w.ball;
    if (this.wait2 > 0) this.wait2 -= DT;
    const bd = Math.hypot(b.x - mate.x, b.z - mate.z);
    if (this.index === 3) {
      // Nutmeg step: once you set off, the defender charges straight at the ball (a committed challenge).
      const def = w.robots[2];
      if (this.megGo >= 0 && (Math.hypot(me.vx, me.vz) > 1.5 || this.megGo > 0)) {
        this.megGo += DT;
        if (def.megged <= 0) runTo(cmds[2], b.x, b.z, def.x, def.z, 0.2);
      }
      return;
    }
    // The defender stays put (it only blocks the straight lane).
    if (this.index === 2) {
      // Player pressed PASS without the ball after passing: the call for a give-and-go.
      if (cmds[0].pass && Math.hypot(b.x - me.x, b.z - me.z) > TUNING.kick.range + 0.4) this.ggCall = true;
      if (bd < TUNING.kick.range - 0.05 && b.lastTouchRobot !== 1 && mate.kickCd <= 0 && this.ggCall) {
        c.pass = true;
        c.giveGo = true;
        this.ggCall = false;
      } else if (bd < 6 && b.lastTouchRobot === 0 && b.h < TUNING.ball.headHeight) runTo(c, b.x + b.vx * 0.2, b.z + b.vz * 0.2, mate.x, mate.z, 0.2);
      return;
    }
    // Long-ball steps: meet the ball where it comes down.
    if (b.lastTouchRobot === 0 && (b.h > 0 || Math.hypot(b.vx, b.vz) > 1)) {
      const plan = lobPlan(w, me);
      const tx = b.h > 0 ? (plan ? plan.x : b.x) : b.x + b.vx * 0.2;
      const tz = b.h > 0 ? (plan ? plan.z : b.z) : b.z + b.vz * 0.2;
      if (bd < 7) runTo(c, tx, tz, mate.x, mate.z, 0.2);
    }
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
      if (s.instant) {
        this.next();
        return;
      }
      this.coach(`Step ${this.index + 1} of ${this.steps.length}`, 'Nice!', '', true);
      this.wait = 0.7;
    }
  }
}
