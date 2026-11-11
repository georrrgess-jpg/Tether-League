import { audio } from '../audio/audio';
import type { RobotLook } from '../content/cosmetics';
import { DT, TUNING } from '../content/tuning';
import { keyLabel, type Settings } from '../storage/settings';
import { fullscreenAvailable, isFullscreen, screenWake, toggleFullscreen } from '../ui/device';
import { h, icon } from '../ui/dom';
import { InputManager } from './input/input';
import type { Gfx } from './render/gfx';
import { MatchView, type Marker, type ViewFrame } from './render/matchView';
import type { RobotMood } from './render/robotView';
import type { Expression } from './render/textures';
import { clearCommand, emptyCommand, type Command, type World } from './sim/types';
import { detach, lobPlan, megWindow } from './sim/world';

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
  /** Forces smart swing on or off for this mode, regardless of the player's setting. */
  readonly swingAssist?: boolean;
  /** Match ball skin (cosmetic id); the classic ball when absent. */
  readonly ballSkin?: string;
  inputLive(): boolean;
  /** Advance one fixed tick. cmds[human] is already filled from input. */
  tick(cmds: Command[]): void;
  /** Per-rendered-frame HUD refresh. */
  frame(dt: number, session: PlaySession): void;
  moods(out: RobotMood[], expr: (Expression | null)[]): void;
  /** Presentation-only slow motion (1 = normal). The simulation still runs whole fixed steps. */
  timeScale?(): number;
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

/** The "turn sideways" tip is shown on the first match of a visit only (portrait phones, CSS-gated). */
let rotateTipShown = false;

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
  private cuePrev = false;
  private pausedAt = 0;
  private onResize = () => this.resize();
  private onVis = () => {
    if (document.hidden && !this.finished) this.pause();
  };
  private onBlur = () => {
    if (!this.finished) this.pause();
  };
  private onKey = (e: KeyboardEvent) => {
    if (e.code === 'F3') {
      e.preventDefault();
      this.toggleDebug();
    } else if (this.paused && e.code === 'Escape' && performance.now() - this.pausedAt > 200 && !this.pauseEl?.querySelector('.confirm')) {
      e.preventDefault();
      this.resume();
    }
  };

  constructor(private ctx: PlayContext, readonly mode: PlayMode, private opts: SessionOptions) {
    const s = ctx.settings();
    this.layer = h('div', { class: `play-layer${rotateTipShown ? '' : ' tip-rotate'}` });
    rotateTipShown = true;
    const pauseBtn = h('button', { class: 'hud-pause', 'aria-label': 'Pause', onclick: () => this.pause() }, icon('pause'));
    this.layer.append(mode.hud, pauseBtn);
    ctx.host.appendChild(this.layer);

    this.view = new MatchView(ctx.gfx, {
      arena: mode.world.arena,
      looks: mode.looks,
      human: mode.human,
      teamColors: mode.teamColors,
      ballOutline: s.ballOutline || s.highContrast,
      ball: mode.ballSkin,
    });
    this.input = new InputManager(this.layer, ctx.settings, () => this.view, () => this.togglePause());
    if (mode.swingAssist !== undefined) this.input.assistOverride = mode.swingAssist;
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
    window.addEventListener('blur', this.onBlur);
    this.view.snap(this.mode.world);
    this.resize();
    audio.setCrowd(this.mode.crowdLevel());
    if (this.opts.music !== false) audio.startMusic('match');
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
    screenWake.hold();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.raf);
    screenWake.release();
    this.input.detach();
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKey);
    document.removeEventListener('visibilitychange', this.onVis);
    window.removeEventListener('blur', this.onBlur);
    audio.setTetherHum(false);
    audio.charge(null);
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
    this.pausedAt = performance.now();
    screenWake.release();
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
    audio.charge(null);
    this.hum = false;
    audio.suspend();
    this.showPause();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.pauseEl?.remove();
    this.pauseEl = null;
    screenWake.hold();
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
    // Touch players see touch controls; keyboard and mouse players see their key bindings.
    const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    const dev = this.input.device;
    const touch = dev === 'touch' || ((coarse || this.input.touchSeen) && dev !== 'keys' && dev !== 'pad');
    const muteBtn = h('button', { class: 'btn btn-ghost', onclick: () => {
      const st = this.ctx.settings();
      st.muted = !st.muted;
      audio.applySettings({ master: st.masterVolume, music: st.musicVolume, effects: st.effectsVolume, muted: st.muted });
      this.ctx.saveSettings();
      muteBtn.replaceChildren(icon(st.muted ? 'mute' : 'sound'), st.muted ? 'Sound off' : 'Sound on');
    } }, icon(s.muted ? 'mute' : 'sound'), s.muted ? 'Sound off' : 'Sound on');

    // Fullscreen only where the browser allows it (not iPhone Safari, not frames without permission).
    const fsLabel = () => [icon('grid'), isFullscreen() ? 'Exit full screen' : 'Full screen'];
    const fsBtn = fullscreenAvailable()
      ? h('button', { class: 'btn btn-ghost pause-fs', onclick: async () => {
          await toggleFullscreen();
          fsBtn?.replaceChildren(...fsLabel());
        } }, ...fsLabel())
      : null;
    const body = h('div', { class: 'pause-body' });
    const main = () => {
      body.replaceChildren(
        h('div', { class: 'pause-actions' },
          h('button', { class: 'btn btn-primary', onclick: () => this.resume(), autofocus: true }, icon('play'), 'Resume'),
          this.opts.onRestart ? h('button', { class: 'btn', onclick: () => confirmView('restart') }, icon('retry'), this.opts.restartLabel ?? 'Restart') : null,
          muteBtn,
          fsBtn,
          h('button', { class: 'btn btn-ghost', onclick: () => confirmView('leave') }, icon('home'), 'Leave'),
        ),
        touch
          ? h('div', { class: 'pause-controls' },
              h('h3', null, 'Touch controls'),
              row('Move', `Hold or drag the stick (bottom ${s.touchSwap ? 'right' : 'left'}), or press anywhere on that side`),
              row('SWING', 'Tap = auto launch, tap again = let go, hold = let go yourself'),
              row('KICK', 'Tap, or drag to aim (one tap per kick; mashing scuffs the shot)'),
              row('PASS', 'Tap (without the ball: call for it)'),
              row('Pause', 'II button'),
              h('h3', null, 'Plays'),
              row('Long ball', 'Hold PASS: its ring fills; let go on the gold notch'),
              row('Give-and-go', 'Tap PASS again after passing'),
              row('Nutmeg', 'Run at a defender who dives in and tap MEG when it lights up (otherwise MEG is a knock-on)'),
              h('p', { class: 'muted' }, 'Walls are lively: bank passes and crosses off them. PASS bends round a blocked lane off the side wall, and a first-time shot off a teammate\'s pass is a one-touch strike. The Academy playbook explains every play.'),
            )
          : h('div', { class: 'pause-controls' },
              h('h3', null, 'Controls'),
              row('Move / steer swing', `${keyLabel(k.up[0])} ${keyLabel(k.left[0])} ${keyLabel(k.down[0])} ${keyLabel(k.right[0])} or arrows`),
              row('Swing: tap = auto launch toward your aim', `Right mouse or ${keyLabel(k.tether[0])}`),
              row('Swing: tap again = let go now; hold = let go yourself (rope glows green when lined up)', 'same button'),
              row('Kick toward aim (one press; mashing scuffs the shot)', `Left mouse or ${keyLabel(k.kick[0])}`),
              row('Pass to teammate (without the ball: call for it)', `${keyLabel(k.pass[0])} / ${keyLabel(k.pass[1])}`),
              row('Meg: nutmeg a defender who dives in when the ball ring turns pink (otherwise a knock-on)', `${keyLabel(k.meg[0])} / ${keyLabel(k.meg[1])} or middle mouse`),
              row('Cycle anchor', `${keyLabel(k.anchorPrev[0])} / ${keyLabel(k.anchorNext[0])}`),
              row('Pause', keyLabel(k.pause[0])),
              h('h3', null, 'Plays'),
              row('Long ball', `Hold ${keyLabel(k.pass[0])}, release to send it`),
              row('Give-and-go', `${keyLabel(k.pass[0])} again after passing`),
              row('Nutmeg', `${keyLabel(k.meg[0])} at a defender who dives in`),
              h('p', { class: 'muted' }, 'Gamepad: left stick, right stick aim, trigger swing, A kick, B pass (hold for a long ball), X meg. Swings go the way you are moving (standing still: toward the cursor). Walls are lively, a blocked pass banks off the side wall, and a first-time shot off a pass is a one-touch strike. The Academy playbook explains every play.'),
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
      h('div', { class: 'panel pause-panel' },
        h('div', { class: 'pause-head' }, h('span', { class: 'pause-icon', 'aria-hidden': 'true' }, icon('pause')), h('div', { class: 'panel-title' }, h('span', null, 'Paused'), h('small', null, this.mode.title))),
        body,
      ),
    );
    this.layer.appendChild(this.pauseEl);
    main();
  }

  /** Long-ball meter state while the player holds PASS near the ball (null otherwise). */
  /** Chance of the nutmeg currently on for the player (null = none). Read by the HUD and hints. */
  megOn: number | null = null;

  private lobFrame(w: World, human: number): ViewFrame['lob'] {
    const charge = this.input.lobCharge;
    if (charge === null) return null;
    const r = w.robots[human];
    const plan = lobPlan(w, r);
    if (!plan) return null;
    return { charge, ideal: plan.ideal, bx: w.ball.x, bz: w.ball.z, tx: plan.x, tz: plan.z };
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
        case 'kick': {
          const power = Math.max(0, Math.min(1, e.power));
          const pan = w.ball.x / w.hx * 0.6;
          if (e.lob) {
            audio.play('lob', { intensity: 0.4 + power * 0.6, pan });
            if (e.perfect && e.robot === hmn) audio.play('perfect');
          } else {
            audio.play('kick', { intensity: 0.35 + power * 0.65, pan, heavy: (e.swing || e.oneTouch) && power > 0.5 });
          }
          break;
        }
        case 'land':
          audio.play('land', { intensity: Math.min(1, e.speed / 12), pan: e.x / w.hx * 0.6 });
          break;
        case 'meg':
          // Through the legs: a quick zip and, when it comes off, a cheer from the crowd.
          audio.play('kick', { intensity: 0.3, pan: w.ball.x / w.hx * 0.6 });
          if (e.success) {
            audio.play(e.robot === hmn ? 'perfect' : 'tetherRelease', { intensity: 0.7, pan: w.ball.x / w.hx * 0.6 });
            audio.cheer(e.robot === hmn ? 0.55 : 0.35);
          } else audio.play('bump', { intensity: 0.5, pan: w.ball.x / w.hx * 0.6 });
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
      const cue = this.input.swing.cue;
      if (cue && !this.cuePrev) audio.play('cue', { intensity: 0.5 });
      this.cuePrev = cue;
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
      this.acc += dt * (mode.timeScale?.() ?? 1);
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
    const lob = live && mode.human >= 0 ? this.lobFrame(w, mode.human) : null;
    this.input.showCharge(lob ? lob.ideal : null);
    audio.charge(lob ? lob.charge : null);
    // Nutmeg opening for the player: lights the MEG button and turns the ball ring pink.
    const human = mode.human >= 0 ? w.robots[mode.human] : null;
    const mw = live && human && human.megCd <= 0 ? megWindow(w, human) : null;
    this.megOn = mw ? mw.chance : null;
    this.input.showMeg(this.megOn);
    this.view.render(w, {
      alpha: this.paused ? 1 : Math.min(1, this.acc / DT),
      dt: this.paused ? 0 : dt,
      preview: live && mode.human >= 0 ? this.input.preview : -1,
      link: s.anchorLine,
      swingCue: live && this.input.swing.cue,
      aimX: this.input.aimX,
      aimZ: this.input.aimZ,
      showAim: live && this.input.showAim,
      lob,
      meg: this.megOn,
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
