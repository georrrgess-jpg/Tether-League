import { CHASSIS } from '../../content/chassis';
import type { RobotLook } from '../../content/cosmetics';
import type { Settings } from '../../storage/settings';
import { h } from '../../ui/dom';
import type { PlaySession } from '../session';
import type { SimEvent } from '../sim/types';
import { Scenario } from './scenario';

/** Free practice with any chassis (owned or not): one robot, one ball, open goals, no rewards. */
export class TestDriveMode extends Scenario {
  readonly title: string;
  readonly leaveNote = 'End the test drive and return to the garage?';
  private goals = 0;
  private top = 0;
  private resetIn = 0;

  constructor(looks: RobotLook[], settings: () => Settings) {
    super('harbor_park', [{ team: 0, look: looks[0] }], settings);
    const c = CHASSIS[looks[0].chassis];
    this.title = `Test drive: ${c.name}`;
    this.setTask(this.title, c.strength);
    this.ready = 0.6;
    this.place(0, -5, 2, 0);
    this.ball(0, 0);
    const exit = h('button', { class: 'btn btn-primary btn-small no-game-input', style: 'pointer-events:auto;position:absolute;left:50%;bottom:calc(16px + var(--safe-b));transform:translateX(-50%)', onclick: () => this.finish(true, 'TEST DRIVE OVER', '') }, 'Finish test drive');
    this.hud.appendChild(exit);
    this.endDelay = 0.5;
  }

  protected after(events: SimEvent[]): void {
    const r = this.world.robots[0];
    this.top = Math.max(this.top, Math.hypot(r.vx, r.vz));
    for (const e of events) {
      if (e.type === 'goal') {
        this.goals++;
        this.toast('Goal!', 'good');
        this.resetIn = 1;
      }
    }
    if (this.resetIn > 0) {
      this.resetIn -= 1 / 60;
      if (this.resetIn <= 0) this.ball(0, 0);
    }
  }

  override frame(dt: number, s: PlaySession): void {
    super.frame(dt, s);
    const r = this.world.robots[0];
    this.setStat(`${Math.hypot(r.vx, r.vz).toFixed(1)} u/s · top ${this.top.toFixed(1)}`);
  }
}
