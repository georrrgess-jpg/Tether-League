import { audio } from '../../audio/audio';
import { ARENAS, type ArenaId } from '../../content/arenas';
import { CHASSIS } from '../../content/chassis';
import type { RobotLook } from '../../content/cosmetics';
import { DT } from '../../content/tuning';
import type { Settings } from '../../storage/settings';
import { h } from '../../ui/dom';
import type { Marker } from '../render/matchView';
import type { RobotMood } from '../render/robotView';
import type { Expression } from '../render/textures';
import type { PlayMode, PlaySession } from '../session';
import { clearCommand, emptyCommand, type Command, type SimEvent, type World } from '../sim/types';
import { createRobot, createWorld, placeBall, placeRobot, stepWorld } from '../sim/world';

export const OPPONENT_LOOK: RobotLook = {
  chassis: 'all_rounder',
  primary: '#F48A2C',
  secondary: '#3A2A22',
  number: 4,
  face: 'face_visor',
  pattern: 'pattern_plain',
  trail: 'trail_standard',
  celebration: 'celebration_wave',
};

export interface ScenarioRobot {
  team: 0 | 1;
  look: RobotLook;
}

/**
 * Shared base for trials, lessons and the test drive: a World driven by custom rules instead of a Match.
 * Robot 0 is always the player.
 */
export abstract class Scenario implements PlayMode {
  readonly world: World;
  readonly human = 0;
  readonly looks: RobotLook[];
  readonly teamColors: [string, string];
  readonly hud: HTMLElement;
  abstract readonly title: string;
  abstract readonly leaveNote: string;
  teleported = false;
  markers = { version: 0, list: [] as Marker[] };

  /** Seconds of live play. */
  protected t = 0;
  protected ready = 1.4;
  protected ended = false;
  protected success = false;
  protected endHold = 0;
  protected endDelay = 1.3;
  /** Ball position before the current tick (for segment-crossing tests). */
  protected pbx = 0;
  protected pbz = 0;
  protected prx = 0;
  protected prz = 0;
  protected idle: Command[];
  private elTitle = h('span', { class: 't-title' });
  private elGoal = h('span', { class: 't-goal' });
  private elStat = h('span', { class: 't-stat' });
  private elBanner = h('div', { class: 'banner' });
  private elToasts = h('div', { class: 'toasts' });
  protected elCoach = h('div', { class: 'coach', style: 'display:none' });
  private bannerT = 0;
  private readyShown = false;

  constructor(arena: ArenaId, robots: ScenarioRobot[], protected settings: () => Settings) {
    const sim = robots.map((r, i) => createRobot(i, r.team, i, CHASSIS[r.look.chassis], i === 0));
    const s = settings();
    sim[0].assist = s.aimAssistance === 'off' ? 0 : s.aimAssistance === 'light' ? 1 : 2;
    this.world = createWorld(ARENAS[arena], sim);
    this.looks = robots.map((r) => r.look);
    const opp = robots.find((r) => r.team === 1)?.look.primary ?? OPPONENT_LOOK.primary;
    this.teamColors = [robots[0].look.primary, opp];
    this.idle = robots.map(() => emptyCommand());
    this.hud = h('div', { class: 'hud' }, h('div', { class: 'task' }, this.elTitle, this.elGoal, this.elStat), this.elBanner, this.elToasts, this.elCoach);
  }

  protected setTask(title: string, goal: string): void {
    this.elTitle.textContent = title;
    this.elGoal.textContent = goal;
  }

  protected setStat(text: string): void {
    if (this.elStat.textContent !== text) this.elStat.textContent = text;
  }

  protected setMarkers(list: Marker[]): void {
    this.markers = { version: this.markers.version + 1, list };
  }

  protected toast(text: string, kind = ''): void {
    const el = h('div', { class: `toast ${kind}` }, text);
    this.elToasts.appendChild(el);
    while (this.elToasts.children.length > 3) this.elToasts.firstChild!.remove();
    setTimeout(() => el.remove(), 1900);
  }

  protected banner(text: string, sub: string, cls: string, seconds: number): void {
    this.elBanner.className = `banner show ${cls}`;
    this.elBanner.replaceChildren(h('strong', null, text), sub ? h('span', null, sub) : '');
    this.bannerT = seconds;
  }

  protected coach(step: string, text: string, sub = '', ok = false): void {
    this.elCoach.style.display = '';
    this.elCoach.className = `coach${ok ? ' ok' : ''}`;
    this.elCoach.replaceChildren(h('span', { class: 'c-step' }, step), h('span', { class: 'c-text' }, text), sub ? h('span', { class: 'c-sub' }, sub) : '');
  }

  protected place(i: number, x: number, z: number, facing = 0): void {
    placeRobot(this.world.robots[i], x, z, facing);
    this.teleported = true;
  }

  protected ball(x: number, z: number, vx = 0, vz = 0): void {
    placeBall(this.world, x, z, vx, vz);
    this.pbx = x;
    this.pbz = z;
    this.teleported = true;
  }

  /** Did the ball cross segment a-b during the last tick? */
  protected ballCrossed(ax: number, az: number, bx: number, bz: number): boolean {
    return segmentsCross(this.pbx, this.pbz, this.world.ball.x, this.world.ball.z, ax, az, bx, bz);
  }

  protected playerCrossed(ax: number, az: number, bx: number, bz: number): boolean {
    const r = this.world.robots[0];
    return segmentsCross(this.prx, this.prz, r.x, r.z, ax, az, bx, bz);
  }

  protected finish(success: boolean, banner: string, sub = ''): void {
    if (this.ended) return;
    this.ended = true;
    this.success = success;
    this.banner(banner, sub, success ? 'ours' : 'neutral', 4);
    audio.play(success ? 'medal' : 'fail');
  }

  /** Scenario rules before the physics step (bot scripting writes into cmds[1..]). */
  protected before(_cmds: Command[]): void {}
  /** Scenario rules after the physics step. */
  protected abstract after(events: SimEvent[]): void;

  inputLive(): boolean {
    return !this.ended && this.ready <= 0;
  }

  tick(cmds: Command[]): void {
    const w = this.world;
    if (this.ready > 0) {
      if (!this.readyShown) {
        this.readyShown = true;
        this.banner('READY', '', 'neutral', this.ready);
        audio.play('countdown');
      }
      this.ready -= DT;
      w.events.length = 0;
      if (this.ready <= 0) audio.play('go');
      return;
    }
    if (this.ended) {
      for (const c of this.idle) clearCommand(c);
      stepWorld(w, this.idle);
      w.events.length = 0;
      this.endHold += DT;
      return;
    }
    this.pbx = w.ball.x;
    this.pbz = w.ball.z;
    this.prx = w.robots[0].x;
    this.prz = w.robots[0].z;
    for (let i = 1; i < cmds.length; i++) clearCommand(cmds[i]);
    this.before(cmds);
    stepWorld(w, cmds);
    this.t += DT;
    this.after(w.events);
  }

  frame(dt: number, _session: PlaySession): void {
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.elBanner.className = 'banner';
    }
  }

  moods(out: RobotMood[], expr: (Expression | null)[]): void {
    for (let i = 0; i < out.length; i++) {
      expr[i] = null;
      out[i] = this.ended ? (this.success && this.world.robots[i].team === 0 ? 'celebrate' : this.success ? 'sad' : 'idle') : this.ready > 0 ? 'idle' : 'play';
    }
  }

  done(): boolean {
    return this.ended && this.endHold >= this.endDelay;
  }

  crowdLevel(): number {
    return 0.22;
  }

  musicIntensity(): number {
    return 0;
  }

  dispose(): void {}
}

export function segmentsCross(p1x: number, p1z: number, p2x: number, p2z: number, ax: number, az: number, bx: number, bz: number): boolean {
  const d1x = p2x - p1x;
  const d1z = p2z - p1z;
  const d2x = bx - ax;
  const d2z = bz - az;
  const den = d1x * d2z - d1z * d2x;
  if (Math.abs(den) < 1e-9) return false;
  const t = ((ax - p1x) * d2z - (az - p1z) * d2x) / den;
  const u = ((ax - p1x) * d1z - (az - p1z) * d1x) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

/** Simple scripted movement: run toward a point, slowing on arrival. */
export function runTo(c: Command, x: number, z: number, rx: number, rz: number, stop = 0.25): number {
  const dx = x - rx;
  const dz = z - rz;
  const d = Math.hypot(dx, dz);
  if (d > stop) {
    const k = Math.min(1, d / 1.2);
    c.mx = (dx / d) * k;
    c.mz = (dz / d) * k;
  } else {
    c.mx = 0;
    c.mz = 0;
  }
  return d;
}
