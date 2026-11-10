import { audio } from './audio/audio';
import type { ChassisId } from './content/chassis';
import type { LessonId, TrialId } from './content/trials';
import { MatchMode, type MatchSetup } from './game/modes/matchMode';
import { Gfx } from './game/render/gfx';
import { MenuStage, type StageShot } from './game/render/menuStage';
import type { RobotMood } from './game/render/robotView';
import { clearJerseyCache } from './game/render/textures';
import { LessonMode } from './game/scenarios/lessons';
import { TestDriveMode } from './game/scenarios/testDrive';
import { TrialMode } from './game/scenarios/trials';
import { PlaySession, type PlayMode } from './game/session';
import { playerLooks } from './game/setup';
import { commitLesson, commitMatch, commitTrial, type TrialOutcome } from './progression/progression';
import { browserStorage, loadSave, newSave, writeSave, type SaveGame, type StorageLike } from './storage/save';
import { defaultSettings, type Settings } from './storage/settings';
import { h } from './ui/dom';
import { ROUTES } from './ui/routes';

export interface ScreenView {
  el: HTMLElement;
  stage?: { shot: StageShot; moods?: [RobotMood, RobotMood] };
  dispose?: () => void;
}

export interface ConfirmOptions {
  title: string;
  body: string | Node;
  confirm: string;
  cancel?: string;
  danger?: boolean;
}

export interface TrialReport {
  id: TrialId;
  score: number | null;
  outcome: TrialOutcome;
}

export class App {
  readonly host = document.getElementById('app')!;
  readonly canvas = document.getElementById('stage') as HTMLCanvasElement;
  readonly gfx: Gfx;
  stage: MenuStage;
  storage: StorageLike | null;
  save: SaveGame;
  /** False until the player has created a club. */
  hasClub = false;
  session: PlaySession | null = null;
  lastTrial: TrialReport | null = null;
  saveFailed = false;
  private view: ScreenView | null = null;
  private route = '';
  private toastStack = h('div', { class: 'toast-stack', 'aria-live': 'polite' });
  private last = performance.now();
  private slot: Element | null = null;
  private pendingSettings: Settings = defaultSettings();

  constructor() {
    this.storage = browserStorage();
    const loaded = loadSave(this.storage);
    if (loaded.save) {
      this.save = loaded.save;
      this.hasClub = true;
    } else {
      this.save = newSave();
    }
    this.gfx = new Gfx(this.canvas, this.save.settings.quality);
    this.stage = new MenuStage(this.gfx);
    this.host.appendChild(this.toastStack);
    this.applySettings();

    if (loaded.status === 'recovered') this.toast('Your latest save could not be read, so the previous one was restored.', 'bad', 7000);
    else if (loaded.status === 'corrupt') this.toast('Saved data was unreadable and has been set aside. Starting a new club.', 'bad', 7000);
    else if (loaded.status === 'unavailable') this.toast('This browser is blocking storage, so progress will not be saved. Use Settings → Export to keep a copy.', 'bad', 9000);

    const unlock = () => {
      audio.unlock();
      if (!this.session) audio.startMusic('menu');
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('hashchange', () => this.onHash());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) audio.suspend();
      else if (!this.session?.paused) audio.resume();
    });
    this.gfx.onContextLost = () => this.toast('Graphics were interrupted. Restoring…', 'bad', 4000);
    this.gfx.onContextRestored = () => {
      this.rebuildStage();
      this.toast('Graphics restored.', 'good');
    };
    // UI sounds for every button without wiring each one.
    this.host.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button, a.btn');
      if (b && !this.session) audio.play(b.classList.contains('is-back') ? 'uiBack' : 'uiSelect', { intensity: 0.5 });
    });
    document.fonts?.ready.then(() => {
      clearJerseyCache();
      this.syncStage(true);
    });

    this.onHash();
    requestAnimationFrame(this.loop);
  }

  // ------------------------------------------------------------------ state

  get settings(): Settings {
    return this.save.settings;
  }

  /** Writes a full snapshot. On failure the game keeps running and tells the player plainly. */
  persist(): boolean {
    if (!this.hasClub) return true;
    const ok = writeSave(this.storage, this.save);
    if (!ok && !this.saveFailed) {
      this.toast('Could not save progress in this browser. Open Settings → Export save to keep a copy.', 'bad', 9000);
    }
    this.saveFailed = !ok;
    return ok;
  }

  applySettings(): void {
    const s = this.settings;
    audio.applySettings({ master: s.masterVolume, music: s.musicVolume, effects: s.effectsVolume, muted: s.muted });
    const root = document.documentElement;
    root.style.setProperty('--scale', String(s.textScale));
    document.body.classList.toggle('reduced-motion', s.reducedMotion);
    document.body.classList.toggle('high-contrast', s.highContrast);
    this.stage.reduced = s.reducedMotion;
    if (this.gfx.setQuality(s.quality)) this.rebuildStage();
  }

  private rebuildStage(): void {
    this.stage.dispose();
    this.stage = new MenuStage(this.gfx);
    this.stage.reduced = this.settings.reducedMotion;
    this.syncStage(true);
  }

  /** Push the current club look to the menu stage. */
  syncStage(force = false): void {
    if (force) this.stage.setLooks([]);
    this.stage.setLooks(playerLooks(this.save));
  }

  // ------------------------------------------------------------- navigation

  navigate(route: string, replace = false): void {
    const target = `#/${route}`;
    if (location.hash === target) this.show(route);
    else if (replace) {
      history.replaceState(null, '', target);
      this.show(route);
    } else location.hash = target;
  }

  back(fallback = 'home'): void {
    if (history.length > 1 && this.route !== fallback) history.back();
    else this.navigate(fallback, true);
  }

  refresh(): void {
    this.show(this.route);
  }

  private onHash(): void {
    const route = location.hash.replace(/^#\/?/, '');
    if (this.session) {
      // Browser Back during play pauses instead of silently abandoning the match.
      if (route !== 'play-session') {
        history.pushState(null, '', '#/play-session');
        this.session.pause();
      }
      return;
    }
    this.show(route || 'home');
  }

  private show(route: string): void {
    let [name, query] = route.split('?');
    if (name === 'play-session') name = 'home';
    if (!this.hasClub) name = 'setup';
    else if (name === 'setup') name = 'home';
    if (!ROUTES[name]) name = 'home';
    this.view?.dispose?.();
    this.view?.el.remove();
    this.route = query ? `${name}?${query}` : name;
    const view = ROUTES[name](this, new URLSearchParams(query ?? ''));
    this.view = view;
    this.host.insertBefore(view.el, this.toastStack);
    this.slot = view.el.querySelector('.stage-slot');
    this.stage.setShot(view.stage?.shot ?? 'hidden');
    const moods = view.stage?.moods ?? ['idle', 'idle'];
    this.stage.setMoods(moods[0], moods[1]);
    this.stage.resetRotation();
    this.syncStage();
    this.measureSlot();
    const focus = view.el.querySelector<HTMLElement>('[data-autofocus]');
    focus?.focus({ preventScroll: true });
  }

  private measureSlot(): void {
    if (!this.slot) return;
    const r = this.slot.getBoundingClientRect();
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (r.width < 4 || r.height < 4) return;
    this.stage.setFrame((r.left + r.width / 2) / W, (r.top + r.height / 2) / H, r.width / W, r.height / H);
  }

  private onResize(): void {
    this.gfx.resize();
    this.measureSlot();
  }

  private loop = (now: number): void => {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.session || document.hidden) return;
    this.measureSlot();
    this.stage.render(dt);
  };

  // ------------------------------------------------------------------ UI

  toast(text: string, kind: '' | 'good' | 'bad' = '', ms = 3200): void {
    const el = h('div', { class: `app-toast ${kind}`, role: kind === 'bad' ? 'alert' : 'status' }, text);
    this.toastStack.appendChild(el);
    while (this.toastStack.children.length > 3) this.toastStack.firstChild!.remove();
    setTimeout(() => el.remove(), ms);
  }

  confirm(o: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
      const close = (v: boolean) => {
        overlay.remove();
        window.removeEventListener('keydown', onKey, true);
        prev?.focus?.();
        resolve(v);
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          close(false);
        }
      };
      const prev = document.activeElement as HTMLElement | null;
      const ok = h('button', { class: `btn ${o.danger ? 'btn-danger' : 'btn-primary'}`, onclick: () => close(true) }, o.confirm);
      const cancel = h('button', { class: 'btn btn-ghost', onclick: () => close(false) }, o.cancel ?? 'Cancel');
      const overlay = h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title },
        h('div', { class: 'panel dialog' }, h('div', { class: 'panel-title' }, o.title), typeof o.body === 'string' ? h('p', null, o.body) : o.body, h('div', { class: 'dialog-actions' }, cancel, ok)),
      );
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close(false);
      });
      this.host.appendChild(overlay);
      window.addEventListener('keydown', onKey, true);
      (o.danger ? cancel : ok).focus();
    });
  }

  // ---------------------------------------------------------------- play

  private begin(mode: PlayMode, opts: { onDone(): void; onLeave(): void; onRestart?: () => void; restartLabel?: string }): void {
    this.view?.dispose?.();
    this.view?.el.remove();
    this.view = null;
    this.slot = null;
    history.pushState(null, '', '#/play-session');
    const session = new PlaySession(
      { gfx: this.gfx, host: this.host, settings: () => this.settings, saveSettings: () => this.persist() },
      mode,
      opts,
    );
    this.session = session;
    this.host.insertBefore(session.layer, this.toastStack);
    session.start();
  }

  private end(): void {
    this.session?.stop();
    this.session = null;
    audio.startMusic('menu');
  }

  startMatch(setup: MatchSetup, opponentId: string, returnTo: string): void {
    const mode = new MatchMode(setup, () => this.settings);
    this.begin(mode, {
      onDone: () => {
        const result = mode.result();
        this.end();
        // Rewards, fixtures and records are committed here, once, before any results UI exists.
        commitMatch(this.save, result, { label: setup.label, opponentId, chassis: setup.looks[0].chassis });
        this.persist();
        this.navigate(`results?id=${encodeURIComponent(result.matchId)}`, true);
      },
      onLeave: () => {
        this.end();
        this.toast(setup.kind === 'quick' ? 'Quick match abandoned. No rewards.' : 'Match abandoned. The fixture is still waiting for you.');
        this.navigate(returnTo, true);
      },
    });
  }

  startTrial(id: TrialId): void {
    const mode = new TrialMode(id, playerLooks(this.save), () => this.settings);
    this.begin(mode, {
      onDone: () => {
        const score = mode.score();
        this.end();
        const outcome = commitTrial(this.save, id, score);
        this.persist();
        this.lastTrial = { id, score, outcome };
        this.navigate(`trial?id=${id}`, true);
      },
      onLeave: () => {
        this.end();
        this.navigate('academy', true);
      },
      onRestart: () => {
        this.end();
        this.startTrial(id);
      },
      restartLabel: 'Retry',
    });
  }

  startLesson(id: LessonId, returnTo = 'academy'): void {
    const mode = new LessonMode(id, playerLooks(this.save), () => this.settings);
    this.begin(mode, {
      onDone: () => {
        this.end();
        const r = commitLesson(this.save, id);
        this.save.flags.onboarded = true;
        this.persist();
        const bonus = r.bonus.reduce((acc, l) => ({ credits: acc.credits + l.credits, xp: acc.xp + l.xp }), { credits: r.credits, xp: r.xp });
        this.toast(r.first ? `Lesson complete! +${bonus.credits} credits, +${bonus.xp} XP${r.bonus.length ? ` (incl. ${r.bonus.map((l) => l.label).join(', ')})` : ''}` : 'Lesson complete!', 'good');
        const next = mode.nextLesson();
        if (next && returnTo === 'onboarding') this.startLesson(next, returnTo);
        else this.navigate(returnTo === 'onboarding' ? 'home' : returnTo, true);
      },
      onLeave: () => {
        this.end();
        this.save.flags.onboarded = true;
        this.persist();
        this.navigate(returnTo === 'onboarding' ? 'home' : returnTo, true);
      },
      onRestart: () => {
        this.end();
        this.startLesson(id, returnTo);
      },
    });
  }

  startTestDrive(chassis: ChassisId): void {
    const looks = playerLooks(this.save);
    looks[0] = { ...looks[0], chassis };
    const mode = new TestDriveMode(looks, () => this.settings);
    const exit = () => {
      this.end();
      this.navigate(`garage?c=${chassis}`, true);
    };
    this.begin(mode, { onDone: exit, onLeave: exit });
  }
}
