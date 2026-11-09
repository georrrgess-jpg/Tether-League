import { audio } from '../audio/audio';
import type { RobotLook } from '../content/cosmetics';
import { DT, TUNING } from '../content/tuning';
import { keyLabel, type Settings } from '../storage/settings';
import { h, icon } from '../ui/dom';
import { InputManager } from './input/input';
import type { Gfx } from './render/gfx';
import { MatchView, type Marker } from './render/matchView';
import type { RobotMood } from './render/robotView';
import type { Expression } from './render/textures';
import { clearCommand, emptyCommand, type Command, type World } from './sim/types';
import { detach } from './sim/world';

export interface PlayContext {
  gfx: Gfx;
  host: HTMLElement;
  settings(): Settings;
  saveSettings(): void;
}

/** A playable ruleset (match, trial, lesson, test drive) that the session drives at a fixed step. */
export interface PlayMode {
  readonly world: World;
  readonly human: number;
  readonly looks: RobotLook[];
  readonly teamColors: [string, string];
  readonly hud: HTMLElement;
  readonly title: string;
  /** Shown in the pause menu next to Leave: what leaving means for progress. */
  readonly leaveNote: string;
  /** True when positions were reset this tick (view must not interpolate across it). */
  teleported: boolean;
  markers?: { version: number; list: Marker[] };
  inputLive(): boolean;
  /** Advance one fixed tick. cmds[human] is already filled from input. */
  tick(cmds: Command[]): void;
  /** Per-rendered-frame HUD refresh. */
  frame(dt: number, session: PlaySession): void;
  moods(out: RobotMood[], expr: (Expression | null)[]): void;
  done(): boolean;
  crowdLevel(): number;
  musicIntensity(): number;
  debug?(): string;
  dispose(): void;
}

export interface SessionOptions {
  onDone(): void;
  onLeave(): void;
  onRestart?: () => void;
  restartLabel?: string;
  music?: boolean;
}

export class PlaySession {
  readonly layer: HTMLElement;
  readonly view: MatchView;
  readonly input: InputManager;
  paused = false;
  private cmds: Command[];
  private moods: RobotMood[];
  private exprs: (Expression | null)[];
  private acc = 0;
  private last = 0;
  private raf = 0;
  private running = false;
  private finished = false;
  private pauseEl: HTMLElement | null = null;
  private debugEl: HTMLElement | null = null;
  private markerVersion = -1;
  private fps = 60;
  private hum = false;
  private onResize = () => this.resize();
  private onVis = () => {
    if (document.hidden && !this.finished) this.pause();
  };
  private onKey = (e: KeyboardEvent) => {
    if (e.code === 'F3') {
      e.preventDefault();
      this.toggleDebug();
    } else if (this.paused && e.code === 'Escape' && !this.pauseEl?.querySelector('.confirm')) {
      e.preventDefault();
      this.resume();
    }
  };

  constructor(private ctx: PlayContext, readonly mode: PlayMode, private opts: SessionOptions) {
    const s = ctx.settings();
    this.layer = h('div', { class: 'play-layer' });
    const pauseBtn = h('button', { class: 'hud-pause', 'aria-label': 'Pause', onclick: () => this.pause() }, icon('pause'));
    this.layer.append(mode.hud, pauseBtn);
    ctx.host.appendChild(this.layer);

    this.view = new MatchView(ctx.gfx, {
      arena: mode.world.arena,
      looks: mode.looks,
      human: mode.human,
      teamColors: mode.teamColors,
      ballOutline: s.ballOutline || s.highContrast,
    });
    this.input = new InputManager(this.layer, ctx.settings, () => this.view, () => this.togglePause());
    this.cmds = mode.world.robots.map(() => emptyCommand());
    this.moods = mode.world.robots.map(() => 'play' as RobotMood);
    this.exprs = mode.world.robots.map(() => null);
  }

  start(): void {
    this.running = true;
    this.input.attach();
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKey);
    document.addEventListener('visibilitychange', this.onVis);
    window.addEventListener('blur', this.onVis as EventListener);
    this.view.snap(this.mode.world);
    this.resize();
    audio.setCrowd(this.mode.crowdLevel());
    if (this.opts.music !== false) audio.startMusic('match');
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.input.detach();
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKey);
    document.removeEventListener('visibilitychange', this.onVis);
    window.removeEventListener('blur', this.onVis as EventListener);
    audio.setTetherHum(false);
    audio.setCrowd(0);
    audio.setMusicIntensity(0);
    this.mode.dispose();
    this.view.dispose();
    this.layer.remove();
  }

  resize(): void {
    this.ctx.gfx.resize();
    this.view.resize();
  }

  togglePause(): void {
    if (this.paused) this.resume();
    else this.pause();
  }

  pause(): void {
    if (this.paused || this.finished || !this.running) return;
    this.paused = true;
    // Safe release: no held input survives a pause, and detaching never adds an impulse.
    this.input.releaseAll();
    this.input.enabled = false;
    const w = this.mode.world;
    if (this.mode.human >= 0) {
      const r = w.robots[this.mode.human];
      detach(w, r, false, false);
      r.kickBuffer = 0;
      r.tBuffer = 0;
      r.tHeldPrev = false;
    }
    audio.setTetherHum(false);
    this.hum = false;
    audio.suspend();
    this.showPause();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.pauseEl?.remove();
    this.pauseEl = null;
    this.input.enabled = true;
    this.input.releaseAll();
    this.input.refreshBindings();
    audio.resume();
    this.acc = 0;
    this.last = performance.now();
  }

  private showPause(): void {
    const s = this.ctx.settings();
    const k = s.keys;
    const row = (label: string, keys: string) => h('div', { class: 'kv' }, h('span', null, label), h('b', null, keys));
    const muteBtn = h('button', { class: 'btn btn-ghost', onclick: () => {
      const st = this.ctx.settings();
      st.muted = !st.muted;
      audio.applySettings({ master: st.masterVolume, music: st.musicVolume, effects: st.effectsVolume, muted: st.muted });
      this.ctx.saveSettings();
      muteBtn.replaceChildren(icon(st.muted ? 'mute' : 'sound'), st.muted ? 'Sound off' : 'Sound on');
    } }, icon(s.muted ? 'mute' : 'sound'), s.muted ? 'Sound off' : 'Sound on');

    const body = h('div', { class: 'pause-body' });
    const main = () => {
      body.replaceChildren(
        h('div', { class: 'pause-actions' },
          h('button', { class: 'btn btn-primary', onclick: () => this.resume(), autofocus: true }, icon('play'), 'Resume'),
          this.opts.onRestart ? h('button', { class: 'btn', onclick: () => confirmView('restart') }, icon('retry'), this.opts.restartLabel ?? 'Restart') : null,
          muteBtn,
          h('button', { class: 'btn btn-ghost', onclick: () => confirmView('leave') }, icon('home'), 'Leave'),
        ),
        h('div', { class: 'pause-controls' },
          h('h3', null, 'Controls'),
          row('Move / steer swing', `${keyLabel(k.up[0])} ${keyLabel(k.left[0])} ${keyLabel(k.down[0])} ${keyLabel(k.right[0])} or arrows`),
          row('Tether (hold, release to launch)', `Right mouse or ${keyLabel(k.tether[0])}`),
          row('Kick toward aim', `Left mouse or ${keyLabel(k.kick[0])}`),
          row('Cycle anchor', `${keyLabel(k.anchorPrev[0])} / ${keyLabel(k.anchorNext[0])}`),
          row('Pause', keyLabel(k.pause[0])),
          h('p', { class: 'muted' }, 'Touch: left thumb moves, hold TETHER, tap KICK or drag it to aim. Gamepad: left stick, right stick aim, trigger tether, A kick.'),
        ),
      );
      (body.querySelector('.btn-primary') as HTMLElement | null)?.focus();
    };
    const confirmView = (what: 'leave' | 'restart') => {
      body.replaceChildren(
        h('div', { class: 'confirm' },
          h('p', null, what === 'leave' ? this.mode.leaveNote : 'Restart from the beginning? The current attempt is discarded.'),
          h('div', { class: 'pause-actions' },
            h('button', { class: 'btn btn-primary', onclick: main }, 'Keep playing'),
            h('button', { class: 'btn btn-danger', onclick: () => {
              audio.resume();
              if (what === 'leave') this.opts.onLeave();
              else this.opts.onRestart?.();
            } }, what === 'leave' ? 'Leave' : 'Restart'),
          ),
        ),
      );
      (body.querySelector('.btn-primary') as HTMLElement | null)?.focus();
    };
    this.pauseEl = h('div', { class: 'overlay pause-overlay no-game-input', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Paused' },
      h('div', { class: 'panel pause-panel' }, h('div', { class: 'panel-title' }, h('span', null, 'Paused'), h('small', null, this.mode.title)), body),
    );
    this.layer.appendChild(this.pauseEl);
    main();
  }

  private toggleDebug(): void {
    if (this.debugEl) {
      this.debugEl.remove();
      this.debugEl = null;
    } else {
      this.debugEl = h('pre', { class: 'debug-overlay' });
      this.layer.appendChild(this.debugEl);
    }
  }

  private audioEvents(): void {
    const w = this.mode.world;
    const hmn = this.mode.human;
    for (const e of w.events) {
      switch (e.type) {
        case 'kick':
          audio.play('kick', { intensity: 0.35 + Math.max(0, Math.min(1, e.power)) * 0.65, pan: w.ball.x / w.hx * 0.6 });
          break;
        case 'touch':
          if (e.speed > 1.2) audio.play('touch', { intensity: Math.min(1, e.speed / 9), pan: w.ball.x / w.hx * 0.6 });
          break;
        case 'wall':
          audio.play('wall', { intensity: Math.min(1, e.speed / 14), pan: e.x / w.hx * 0.7 });
          break;
        case 'post':
          audio.play('post', { intensity: Math.min(1, e.speed / 12), pan: e.x / w.hx * 0.7 });
          audio.cheer(0.35);
          break;
        case 'net':
          audio.play('net', { intensity: Math.min(1, e.speed / 12) });
          break;
        case 'bump':
          audio.play('bump', { intensity: Math.min(1, e.speed / 9) });
          break;
        case 'attach':
          audio.play('tetherAttach', { intensity: e.robot === hmn ? 0.8 : 0.25 });
          break;
        case 'release':
          audio.play('tetherRelease', { intensity: e.robot === hmn ? 0.4 + Math.min(0.6, e.speed / 16) : 0.2 });
          break;
        case 'tetherFail':
          if (e.robot === hmn) audio.play('tetherFail');
          break;
      }
    }
    if (hmn >= 0) {
      const r = w.robots[hmn];
      const on = r.tState === 'attached';
      if (on || this.hum) audio.setTetherHum(on, Math.hypot(r.vx, r.vz) / TUNING.tether.maxSpeed);
      this.hum = on;
    }
  }

  private loop = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.25) dt = 0.25; // long stall: never simulate the gap
    this.fps += (1 / Math.max(dt, 1e-3) - this.fps) * 0.05;
    const mode = this.mode;
    const w = mode.world;
    const s = this.ctx.settings();

    if (!this.paused) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= DT && steps < TUNING.sim.maxCatchupSteps) {
        this.acc -= DT;
        steps++;
        this.view.snapshot(w);
        const live = mode.inputLive();
        if (mode.human >= 0) {
          const c = this.cmds[mode.human];
          this.input.sample(w, w.robots[mode.human], c);
          if (!live) {
            const kick = c.kick;
            clearCommand(c);
            c.kick = kick; // still used to skip celebrations
          }
        }
        mode.tick(this.cmds);
        this.view.onSimEvents(w, w.events, s.reducedMotion);
        this.audioEvents();
        if (mode.teleported) {
          mode.teleported = false;
          this.view.snap(w);
        }
        if (!this.finished && mode.done()) {
          this.finished = true;
          this.input.enabled = false;
          queueMicrotask(() => this.opts.onDone());
          break;
        }
      }
      if (this.acc > DT * TUNING.sim.maxCatchupSteps) this.acc = 0;
      if (mode.markers && mode.markers.version !== this.markerVersion) {
        this.markerVersion = mode.markers.version;
        this.view.setMarkers(mode.markers.list);
      }
      audio.setMusicIntensity(mode.musicIntensity());
    }

    mode.moods(this.moods, this.exprs);
    mode.frame(dt, this);
    const live = mode.inputLive() && !this.paused;
    this.view.render(w, {
      alpha: this.paused ? 1 : Math.min(1, this.acc / DT),
      dt: this.paused ? 0 : dt,
      preview: live && mode.human >= 0 && (s.anchorAssistance || w.robots[mode.human].tState === 'attached' || true) ? this.input.preview : -1,
      aimX: this.input.aimX,
      aimZ: this.input.aimZ,
      showAim: live && this.input.showAim,
      moods: this.moods,
      expressions: this.exprs,
      human: mode.human,
      reduced: s.reducedMotion,
      shake: s.cameraShake,
    });
    if (this.ctx.gfx.reportFrame(dt * 1000)) this.resize();

    if (this.debugEl && mode.human >= 0) {
      const r = w.robots[mode.human];
      this.debugEl.textContent =
        `fps ${this.fps.toFixed(0)}  quality ${this.ctx.gfx.quality}\n` +
        `speed ${Math.hypot(r.vx, r.vz).toFixed(2)}  ball ${Math.hypot(w.ball.vx, w.ball.vz).toFixed(2)}\n` +
        `tether ${r.tState}${r.tState === 'attached' ? ` len ${r.tLen.toFixed(2)} t ${r.tTime.toFixed(2)} dir ${r.tDir}` : ''}  preview ${this.input.preview}\n` +
        `aim ${this.input.device}  ${mode.debug?.() ?? ''}`;
    }
  };
}
