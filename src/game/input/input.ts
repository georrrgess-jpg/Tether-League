import { TUNING } from '../../content/tuning';
import type { Action, Settings } from '../../storage/settings';
import { attackDir, type Command, type Robot, type World } from '../sim/types';
import { SmartSwing } from '../sim/swing';
import { anchorInRange } from '../sim/world';
import { buzz } from '../../ui/device';

/**
 * Converts keyboard, mouse, touch and gamepad state into the normalised Command the simulation consumes.
 * Device mappings live here only; the simulation never sees raw input.
 */
export interface FieldProjector {
  screenToField(clientX: number, clientY: number, out: { x: number; z: number }): boolean;
}

/** Touch Events are the most reliable touch source on phones, including inside embedded frames. */
const TOUCH_EVENTS = typeof window !== 'undefined' && 'ontouchstart' in window;

export type AimDevice = 'mouse' | 'keys' | 'touch' | 'pad';

export class InputManager {
  preview = -1;
  aimX = 0;
  aimZ = 0;
  showAim = false;
  device: AimDevice = 'mouse';
  enabled = true;
  /** True once any touch input has been seen (touch controls are then shown). */
  touchSeen = false;
  /** Counters the HUD uses to fade hints once an action has been performed. */
  used = { move: 0, tether: 0, kick: 0, pass: 0, meg: 0 };

  private keys = new Set<string>();
  private bind = new Map<string, Action>();
  private mouseX = 0;
  private mouseY = 0;
  private kickQueued = false;
  private megQueued = false;
  private megBtn: HTMLElement | null = null;
  private megShown = -1;
  private padMegPrev = false;
  private passQueued = false;
  /** Long-ball charge of the queued pass (0 = ground pass). */
  private passLob = 0;
  /** performance.now() when PASS went down, while it is held. */
  private passDownAt: number | null = null;
  /** Long-ball charge while PASS is held past the tap window (0..1), else null. The HUD shows it. */
  lobCharge: number | null = null;
  private passId: number | null = null;
  private padPassPrev = false;
  private kickByKey = false;
  private tetherMouse = false;
  private tetherTouch = false;
  private padTether = false;
  private padKickPrev = false;
  private padPausePrev = false;
  private override = -1;
  /** A tether press seen since the last sample (so a click shorter than one tick still counts). */
  private tetherLatch = false;
  /** Smart swing controller: plans the anchor / direction and auto-releases taps. */
  readonly swing = new SmartSwing();
  /** Set by modes that require manual swings (or always smart ones). */
  assistOverride: boolean | null = null;
  swingTargetX = 0;
  private mouseMovedAt = -1e9;
  swingTargetZ = 0;
  /** Active touch ids, or null. Touch ids are arbitrary integers (iOS can report negative or huge ones), so never test their sign. */
  private stickId: number | null = null;
  private stickOX = 0;
  private stickOY = 0;
  private stickX = 0;
  private stickY = 0;
  private kickId: number | null = null;
  private kickSX = 0;
  private kickSY = 0;
  private dragX = 0;
  private dragZ = 0;
  private dragAim = false;
  private aimOnce: { x: number; z: number } | null = null;
  private tetherId: number | null = null;
  private touchRoot: HTMLElement | null = null;
  private stickBase: HTMLElement | null = null;
  private stickKnob: HTMLElement | null = null;
  /** Radius of the drawn stick at rest (client px); 0 until measured. */
  private stickR = 0;
  private passBtn: HTMLElement | null = null;
  /** Last long-ball charge drawn on the PASS button (to skip redundant style writes). */
  private chargeDrawn = -1;
  private chargeInWindow = false;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private tmp = { x: 0, z: 0 };
  private off: (() => void)[] = [];

  constructor(
    private layer: HTMLElement,
    private settings: () => Settings,
    private projector: () => FieldProjector | null,
    private onPause: () => void,
  ) {}

  attach(): void {
    this.refreshBindings();
    const on = <K extends keyof WindowEventMap>(target: Window | HTMLElement, type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      target.addEventListener(type, fn as EventListener, opts);
      this.off.push(() => target.removeEventListener(type, fn as EventListener, opts));
    };
    on(window, 'keydown', (e) => this.keyDown(e));
    on(window, 'keyup', (e) => this.keyUp(e));
    on(window, 'blur', () => this.releaseAll());
    on(this.layer, 'contextmenu', (e) => e.preventDefault());
    on(this.layer, 'pointerdown', (e) => this.pointerDown(e));
    on(this.layer, 'pointermove', (e) => this.pointerMove(e));
    on(this.layer, 'pointerup', (e) => this.pointerUp(e));
    on(this.layer, 'pointercancel', (e) => this.pointerUp(e));
    // iOS and in-app web views can ignore touch-action inside embedded (cross-origin) frames and
    // turn a joystick drag into a page scroll, cancelling the pointer. Blocking the touch default
    // during play keeps drags on the game; taps on real buttons still click.
    const blockTouch = (e: TouchEvent, start: boolean) => {
      if (!this.enabled || !e.cancelable) return;
      const t = e.target as HTMLElement | null;
      if (start && t?.closest('button, a, input, select, textarea, label, .no-game-input')) return;
      e.preventDefault();
    };
    on(this.layer, 'touchstart', (e) => {
      blockTouch(e, true);
      if (TOUCH_EVENTS) for (const t of Array.from(e.changedTouches)) this.touchBegin(t.identifier, t.clientX, t.clientY, t.target as HTMLElement);
    }, { passive: false });
    on(this.layer, 'touchmove', (e) => {
      blockTouch(e, false);
      if (TOUCH_EVENTS) for (const t of Array.from(e.changedTouches)) this.touchMove(t.identifier, t.clientX, t.clientY);
    }, { passive: false });
    const touchEnd = (e: TouchEvent) => {
      if (TOUCH_EVENTS) for (const t of Array.from(e.changedTouches)) this.touchEnd(t.identifier);
    };
    on(this.layer, 'touchend', touchEnd);
    on(this.layer, 'touchcancel', touchEnd);
    if (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) this.showTouch();
  }

  detach(): void {
    for (const f of this.off) f();
    this.off.length = 0;
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.touchRoot?.remove();
    this.touchRoot = null;
    this.passBtn = null;
    this.layer.classList.remove('has-touch');
    this.releaseAll();
  }

  refreshBindings(): void {
    this.bind.clear();
    const keys = this.settings().keys;
    for (const a of Object.keys(keys) as Action[]) for (const code of keys[a]) if (code) this.bind.set(code, a);
    if (this.touchRoot) this.layoutTouch();
  }

  /** Drops every held input. Called on pause, blur and scene exit so nothing sticks or fires late. */
  releaseAll(): void {
    this.keys.clear();
    this.kickQueued = false;
    this.megQueued = false;
    this.passQueued = false;
    this.passLob = 0;
    this.passDownAt = null;
    this.lobCharge = null;
    this.passId = null;
    this.tetherMouse = false;
    this.tetherTouch = false;
    this.padTether = false;
    this.tetherLatch = false;
    this.swing.reset();
    this.stickId = null;
    this.stickX = this.stickY = 0;
    this.kickId = null;
    this.tetherId = null;
    this.dragAim = false;
    this.aimOnce = null;
    if (this.stickKnob) this.stickKnob.style.transform = '';
    if (this.stickBase) {
      this.stickBase.style.left = '';
      this.stickBase.style.top = '';
      this.stickBase.classList.remove('is-steer');
    }
    this.touchRoot?.querySelectorAll('.is-down').forEach((el) => el.classList.remove('is-down'));
    this.showCharge(null);
  }

  private pressPass(): void {
    if (this.passDownAt === null) this.passDownAt = performance.now();
    this.used.pass++;
  }

  /** PASS released: a tap is a ground pass, a hold is a long ball with the charge reached. */
  private releasePass(): void {
    if (this.passDownAt === null) return;
    const charge = this.chargeAt(performance.now());
    this.passDownAt = null;
    this.lobCharge = null;
    if (!this.enabled) return;
    this.passQueued = true;
    this.passLob = charge ?? 0;
  }

  private chargeAt(now: number): number | null {
    if (this.passDownAt === null) return null;
    const K = TUNING.kick;
    const held = (now - this.passDownAt) / 1000;
    if (held < K.lobHoldSeconds) return null;
    return Math.max(0.01, Math.min(1, (held - K.lobHoldSeconds) / K.lobChargeSeconds));
  }

  private keyDown(e: KeyboardEvent): void {
    if (!this.enabled) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const a = this.bind.get(e.code);
    if (!a) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    if (a === 'pause') {
      this.onPause();
      return;
    }
    if (a === 'pass') {
      this.pressPass();
    } else if (a === 'meg') {
      this.megQueued = true;
      this.used.meg++;
    } else if (a === 'kick') {
      this.kickQueued = true;
      this.kickByKey = true;
      this.used.kick++;
      if (this.settings().aimMode === 'auto') this.device = 'keys';
    } else if (a === 'tether') {
      this.used.tether++;
      this.tetherLatch = true;
      if (this.settings().aimMode === 'auto') this.device = 'keys';
    } else if (a === 'anchorPrev' || a === 'anchorNext') {
      this.cycle = a === 'anchorNext' ? 1 : -1;
    } else this.used.move++;
  }
  private cycle = 0;

  private keyUp(e: KeyboardEvent): void {
    this.keys.delete(e.code);
    if (this.bind.get(e.code) === 'pass' && !this.held('pass')) this.releasePass();
  }

  private held(a: Action): boolean {
    const k = this.settings().keys[a];
    return (k[0] !== '' && this.keys.has(k[0])) || (k[1] !== '' && this.keys.has(k[1]));
  }

  private pointerDown(e: PointerEvent): void {
    if (!this.enabled) return;
    const target = e.target as HTMLElement;
    if (e.pointerType === 'mouse') {
      if (target.closest('button, a, input, select, .no-game-input')) return;
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      if (this.settings().aimMode !== 'keyboard') this.device = 'mouse';
      if (e.button === 0) {
        this.kickQueued = true;
        this.kickByKey = false;
        this.used.kick++;
      } else if (e.button === 1) {
        // Middle click: skill touch (nutmeg / knock-on).
        e.preventDefault();
        this.megQueued = true;
        this.used.meg++;
      } else if (e.button === 2) {
        this.tetherMouse = true;
        this.tetherLatch = true;
        this.used.tether++;
      }
      return;
    }
    // Touch and pen. Browsers with Touch Events are handled there (they keep working inside
    // embedded frames where pointer streams can be cancelled); this path covers the rest.
    if (TOUCH_EVENTS) return;
    if (this.touchBegin(e.pointerId, e.clientX, e.clientY, target)) e.preventDefault();
  }

  /** Starts a touch on a control or the movement stick. Returns true when the touch was used. */
  private touchBegin(id: number, x: number, y: number, target: HTMLElement | null): boolean {
    if (!this.enabled) return false;
    if (!this.touchSeen) this.showTouch();
    this.device = 'touch';
    this.wake();
    const btn = target?.closest?.('[data-touch]') as HTMLElement | null;
    const kind = btn?.dataset.touch;
    if (kind === 'pass' && this.passId === null) {
      this.passId = id;
      this.pressPass();
      this.pressed(btn!);
      return true;
    }
    if (kind === 'kick' && this.kickId === null) {
      this.kickId = id;
      this.kickSX = x;
      this.kickSY = y;
      this.dragAim = false;
      this.pressed(btn!);
      return true;
    }
    if (kind === 'meg') {
      // A tap: fires on touch down, nothing held.
      this.megQueued = true;
      this.used.meg++;
      this.pressed(btn!);
      setTimeout(() => btn!.classList.remove('is-down'), 140);
      return true;
    }
    if (kind === 'tether' && this.tetherId === null) {
      this.tetherId = id;
      this.tetherTouch = true;
      this.tetherLatch = true;
      this.used.tether++;
      this.pressed(btn!);
      return true;
    }
    if (kind || this.stickId !== null || target?.closest?.('button, a, .no-game-input')) return false;
    const swap = this.settings().touchSwap;
    const leftSide = x < window.innerWidth * 0.5;
    if (leftSide === swap) return false;
    this.stickId = id;
    this.stickX = this.stickY = 0;
    // Pressing on or near the drawn stick steers at once, so movement works without a drag.
    // Anywhere else on that half, the stick appears under the thumb and steers as it moves.
    const home = this.stickHome();
    const reach = 1.7 * (this.stickR || 62 * this.settings().touchScale);
    if (home && Math.hypot(x - home.x, y - home.y) <= reach) {
      this.stickOX = home.x;
      this.stickOY = home.y;
    } else {
      this.stickOX = x;
      this.stickOY = y;
      if (this.stickBase) {
        this.stickBase.style.left = `${x}px`;
        this.stickBase.style.top = `${y}px`;
      }
    }
    this.stickBase?.classList.add('is-down');
    this.used.move++;
    this.steer(x, y);
    return true;
  }

  /** Centre of the stick at rest, in client pixels. */
  private stickHome(): { x: number; y: number } | null {
    if (!this.stickBase) return null;
    this.stickBase.style.left = '';
    this.stickBase.style.top = '';
    const r = this.stickBase.getBoundingClientRect();
    if (!r.width) return null;
    this.stickR = r.width / 2;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  private steer(x: number, y: number): void {
    // Full deflection at 90% of the drawn radius (the knob then sits on the rim).
    const max = this.stickR ? this.stickR * 0.9 : 56 * this.settings().touchScale;
    let dx = x - this.stickOX;
    let dy = y - this.stickOY;
    const d = Math.hypot(dx, dy);
    if (d > max) {
      // Let the base follow the thumb so direction changes stay easy.
      this.stickOX += (dx / d) * (d - max);
      this.stickOY += (dy / d) * (d - max);
      dx = (dx / d) * max;
      dy = (dy / d) * max;
      if (this.stickBase) {
        this.stickBase.style.left = `${this.stickOX}px`;
        this.stickBase.style.top = `${this.stickOY}px`;
      }
    }
    const dead = 0.16;
    const len = Math.hypot(dx, dy);
    const m = Math.min(1, len / max);
    const k = m < dead || len === 0 ? 0 : (m - dead) / (1 - dead) / len;
    this.stickX = dx * k;
    this.stickY = dy * k;
    if (this.stickKnob) this.stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    if (this.stickBase) {
      // Outside the dead zone the knob lights up and the rim shows the steering direction.
      const steering = k > 0;
      this.stickBase.classList.toggle('is-steer', steering);
      if (steering) this.stickBase.style.setProperty('--dir', `${Math.round((Math.atan2(dy, dx) * 180) / Math.PI)}deg`);
    }
  }

  private pointerMove(e: PointerEvent): void {
    if (e.pointerType === 'mouse') {
      if (Math.abs(e.clientX - this.mouseX) + Math.abs(e.clientY - this.mouseY) > 2) {
        this.mouseMovedAt = performance.now();
        if (this.settings().aimMode !== 'keyboard') this.device = 'mouse';
      }
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      return;
    }
    if (!TOUCH_EVENTS) this.touchMove(e.pointerId, e.clientX, e.clientY);
  }

  private touchMove(id: number, x: number, y: number): void {
    if (id === this.stickId) {
      this.steer(x, y);
    } else if (id === this.kickId) {
      const dx = x - this.kickSX;
      const dy = y - this.kickSY;
      const d = Math.hypot(dx, dy);
      this.dragAim = d > 18;
      if (this.dragAim) {
        this.dragX = dx / d;
        this.dragZ = dy / d;
      }
    }
  }

  private pointerUp(e: PointerEvent): void {
    if (e.pointerType === 'mouse') {
      if (e.button === 2) this.tetherMouse = false;
      return;
    }
    if (!TOUCH_EVENTS) this.touchEnd(e.pointerId);
  }

  private touchEnd(id: number): void {
    if (id === this.stickId) {
      this.stickId = null;
      this.stickX = this.stickY = 0;
      if (this.stickKnob) this.stickKnob.style.transform = '';
      if (this.stickBase) {
        this.stickBase.classList.remove('is-down', 'is-steer');
        this.stickBase.style.left = '';
        this.stickBase.style.top = '';
      }
    } else if (id === this.passId) {
      this.passId = null;
      this.releasePass();
      this.touchRoot?.querySelector('[data-touch="pass"]')?.classList.remove('is-down');
    } else if (id === this.kickId) {
      this.kickId = null;
      this.kickQueued = true;
      this.kickByKey = !this.dragAim;
      this.used.kick++;
      if (this.dragAim) this.aimOnce = { x: this.dragX, z: this.dragZ };
      this.dragAim = false;
      this.touchRoot?.querySelector('[data-touch="kick"]')?.classList.remove('is-down');
    } else if (id === this.tetherId) {
      this.tetherId = null;
      this.tetherTouch = false;
      this.touchRoot?.querySelector('[data-touch="tether"]')?.classList.remove('is-down');
    }
    if (this.stickId === null && this.passId === null && this.kickId === null && this.tetherId === null) this.restSoon();
  }

  /** Button pressed: lit state and, where supported and enabled, a short buzz. */
  private pressed(btn: HTMLElement): void {
    btn.classList.add('is-down');
    if (this.settings().vibration) buzz(btn.dataset.touch === 'kick' ? 12 : 8);
  }

  /** Controls are at full strength while touched, and fade back a little when left alone. */
  private wake(): void {
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.touchRoot?.classList.remove('is-idle');
  }

  private restSoon(): void {
    if (!this.touchRoot) return;
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      this.touchRoot?.classList.add('is-idle');
    }, 3500);
  }

  /**
   * Long-ball charge on the PASS button, matching the meter at the robot's feet: a fill that grows
   * while PASS is held and a gold notch at the ideal charge (when there is a pass to aim).
   */
  /**
   * Lights the MEG touch button when a nutmeg is on (chance 0..1), dims it otherwise. Three looks:
   * off (knock-on only), on, and hot (a good chance).
   */
  showMeg(chance: number | null): void {
    const btn = this.megBtn;
    if (!btn) return;
    const level = chance === null ? 0 : chance >= 0.6 ? 2 : 1;
    if (level === this.megShown) return;
    if (level > 0 && this.megShown <= 0 && this.settings().vibration) buzz(6);
    this.megShown = level;
    btn.classList.toggle('is-on', level >= 1);
    btn.classList.toggle('is-hot', level === 2);
  }

  showCharge(ideal: number | null): void {
    const btn = this.passBtn;
    if (!btn) return;
    const charge = this.lobCharge;
    if (charge === null) {
      if (this.chargeDrawn !== -1) {
        this.chargeDrawn = -1;
        this.chargeInWindow = false;
        btn.classList.remove('is-charging', 'has-ideal', 'in-window');
      }
      return;
    }
    const q = Math.round(charge * 100) / 100;
    const inWindow = ideal !== null && Math.abs(charge - ideal) <= 0.06;
    if (q !== this.chargeDrawn) {
      this.chargeDrawn = q;
      btn.style.setProperty('--charge', String(q));
      btn.classList.add('is-charging');
    }
    btn.classList.toggle('has-ideal', ideal !== null);
    if (ideal !== null) btn.style.setProperty('--ideal', String(Math.round(ideal * 100) / 100));
    if (inWindow !== this.chargeInWindow) {
      this.chargeInWindow = inWindow;
      btn.classList.toggle('in-window', inWindow);
      if (inWindow && this.settings().vibration) buzz(6);
    }
  }

  private showTouch(): void {
    this.touchSeen = true;
    if (this.touchRoot) return;
    const root = document.createElement('div');
    root.className = 'touch-ui';
    // The stick's rest spot shows four chevrons; the rim arc (.stick-dir) shows the steering direction.
    const chev = (deg: number) => `<path transform="rotate(${deg} 50 50)" d="M44 13 50 7l6 6"/>`;
    root.innerHTML = `
      <div class="stick-base" aria-hidden="true"><svg class="stick-chev" viewBox="0 0 100 100">${chev(0)}${chev(90)}${chev(180)}${chev(270)}</svg><i class="stick-dir"></i><div class="stick-knob"></div></div>
      <div class="tbtn tbtn-tether" data-touch="tether" role="button" aria-label="Swing"><span>SWING</span><small>tap · hold</small></div>
      <div class="tbtn tbtn-kick" data-touch="kick" role="button" aria-label="Kick"><span>KICK</span><small>drag to aim</small></div>
      <div class="tbtn tbtn-pass" data-touch="pass" role="button" aria-label="Pass"><i class="tb-charge" aria-hidden="true"></i><span>PASS</span><small>hold: long</small></div>
      <div class="tbtn tbtn-meg" data-touch="meg" role="button" aria-label="Meg: nutmeg or knock-on"><span>MEG</span></div>`;
    this.layer.appendChild(root);
    this.layer.classList.add('has-touch');
    this.touchRoot = root;
    this.stickBase = root.querySelector('.stick-base');
    this.stickKnob = root.querySelector('.stick-knob');
    this.passBtn = root.querySelector('.tbtn-pass');
    this.megBtn = root.querySelector('.tbtn-meg');
    this.megShown = -1;
    this.layoutTouch();
    this.restSoon();
  }

  private layoutTouch(): void {
    if (!this.touchRoot) return;
    const s = this.settings();
    // On the play layer so HUD pieces (rotate tip, hint) can keep clear of the controls too.
    this.layer.style.setProperty('--touch-scale', String(s.touchScale));
    this.touchRoot.classList.toggle('swap', s.touchSwap);
    this.layer.classList.toggle('touch-swap', s.touchSwap);
    this.stickR = 0;
  }

  private padPoll(): { mx: number; mz: number; ax: number; az: number; aim: boolean } | null {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    let pad: Gamepad | null = null;
    for (const p of navigator.getGamepads()) if (p && p.connected) pad = pad ?? p;
    if (!pad) return null;
    const dz = (v: number, d: number) => (Math.abs(v) < d ? 0 : v);
    const mx = dz(pad.axes[0] ?? 0, 0.2);
    const mz = dz(pad.axes[1] ?? 0, 0.2);
    const rx = pad.axes[2] ?? 0;
    const ry = pad.axes[3] ?? 0;
    const aim = Math.hypot(rx, ry) > 0.4;
    const b = (i: number) => !!pad!.buttons[i]?.pressed;
    const tether = b(7) || b(5) || b(6) || b(4);
    if (tether && !this.padTether) {
      this.used.tether++;
      this.tetherLatch = true;
    }
    this.padTether = tether;
    // X (button 2): skill touch.
    const megBtn = b(2);
    if (megBtn && !this.padMegPrev) {
      this.megQueued = true;
      this.used.meg++;
      this.device = 'pad';
    }
    this.padMegPrev = megBtn;
    const kick = b(0);
    if (kick && !this.padKickPrev) {
      this.kickQueued = true;
      this.kickByKey = !aim;
      this.used.kick++;
      this.device = 'pad';
    }
    this.padKickPrev = kick;
    const passBtn = b(1) || b(3);
    if (passBtn && !this.padPassPrev) {
      this.pressPass();
      this.device = 'pad';
    } else if (!passBtn && this.padPassPrev) this.releasePass();
    this.padPassPrev = passBtn;
    const pause = b(9);
    if (pause && !this.padPausePrev) this.onPause();
    this.padPausePrev = pause;
    if (mx || mz || aim || tether) this.device = 'pad';
    return { mx, mz, ax: rx, az: ry, aim };
  }

  /** Aim for kicks made without an explicit aim (keyboard, tap, pad face button). */
  private smartAim(w: World, r: Robot, dx: number, dz: number, out: { x: number; z: number }): void {
    // Aim used when the player has not pointed anywhere (keyboard, tap, pad face button, stale cursor).
    // It follows the direction of movement, but never sends the ball back toward your own goal: a kick while
    // running back becomes a clearance toward the wing, or a pass to a teammate who is open ahead.
    const b = w.ball;
    const att = attackDir(r.team);
    const assist = this.settings().aimAssistance;
    if (dx * att < -0.25) {
      for (const m of w.robots) {
        if (m.team !== r.team || m.id === r.id) continue;
        if ((m.x - b.x) * att > 2.5 && Math.hypot(m.x - b.x, m.z - b.z) > 3) {
          out.x = m.x + m.vx * 0.4;
          out.z = m.z + m.vz * 0.4;
          return;
        }
      }
      const side = Math.sign(b.z || r.z || dz || 1);
      out.x = b.x + att * 8;
      out.z = side * (w.hz - 1.5);
      return;
    }
    out.x = b.x + dx * 8;
    out.z = b.z + dz * 8;
    if (assist === 'off') return;
    const gx = att * w.hx;
    const gdx = gx - b.x;
    const gd = Math.hypot(gdx, b.z);
    // Only shots already heading close to the goal are tidied inside the posts (light: about a metre outside).
    const reach = assist === 'strong' ? 3 : 1.2;
    if (w.goalsOpen && dx * att > 0.3 && gd < 15 && gdx * att > 0.5) {
      const zAt = b.z + (dz / (dx * att)) * Math.abs(gdx);
      const lim = w.arena.goalWidth / 2 - 0.9;
      if (Math.abs(zAt) < lim + reach) {
        out.x = gx;
        out.z = Math.max(-lim, Math.min(lim, zAt));
        return;
      }
    }
    for (const m of w.robots) {
      if (m.team !== r.team || m.id === r.id) continue;
      const mx = m.x + m.vx * 0.4 - b.x;
      const mz = m.z + m.vz * 0.4 - b.z;
      const md = Math.hypot(mx, mz);
      if (md < 2.5) continue;
      if ((mx * dx + mz * dz) / md > 0.78) {
        out.x = b.x + mx;
        out.z = b.z + mz;
        return;
      }
    }
  }


  /** Fill the command for one simulation tick. */
  sample(w: World, r: Robot, c: Command): void {
    const s = this.settings();
    let mx = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
    let mz = (this.held('down') ? 1 : 0) - (this.held('up') ? 1 : 0);
    if (this.stickId !== null) {
      mx = this.stickX;
      mz = this.stickY;
    }
    const pad = this.padPoll();
    if (pad && (pad.mx || pad.mz)) {
      mx = pad.mx;
      mz = pad.mz;
      this.used.move++;
    }
    const ml = Math.hypot(mx, mz);
    if (ml > 1) {
      mx /= ml;
      mz /= ml;
    }
    c.mx = mx;
    c.mz = mz;

    let dirX = Math.cos(r.facing);
    let dirZ = Math.sin(r.facing);
    if (ml > 0.2) {
      dirX = mx / ml;
      dirZ = mz / ml;
    }

    const mouseAim = this.device === 'mouse' && s.aimMode !== 'keyboard';
    const proj = this.projector();
    let explicit = false;
    if (pad && pad.aim && this.device === 'pad') {
      const l = Math.hypot(pad.ax, pad.az);
      this.aimX = r.x + (pad.ax / l) * 8;
      this.aimZ = r.z + (pad.az / l) * 8;
      explicit = true;
    } else if (this.dragAim) {
      this.aimX = r.x + this.dragX * 6;
      this.aimZ = r.z + this.dragZ * 6;
      explicit = true;
    } else if (mouseAim && proj && proj.screenToField(this.mouseX, this.mouseY, this.tmp)) {
      this.aimX = this.tmp.x;
      this.aimZ = this.tmp.z;
      explicit = true;
    } else {
      this.smartAim(w, r, dirX, dirZ, this.tmp);
      this.aimX = this.tmp.x;
      this.aimZ = this.tmp.z;
    }
    this.showAim = explicit;

    // Swing target, in a fixed and predictable order:
    //   1. the gamepad aim stick when it is pushed;
    //   2. the direction you are moving (so a swing never goes "backwards" because the cursor is resting behind you);
    //   3. standing still: the cursor, if the mouse was used in the last few seconds;
    //   4. otherwise the way your robot is facing.
    let tx: number;
    let tz: number;
    const mouseFresh = mouseAim && explicit && performance.now() - this.mouseMovedAt < 3000;
    if (pad && pad.aim && this.device === 'pad') {
      const l = Math.hypot(pad.ax, pad.az);
      tx = r.x + (pad.ax / l) * 10;
      tz = r.z + (pad.az / l) * 10;
    } else if (ml > 0.2) {
      tx = r.x + dirX * 10;
      tz = r.z + dirZ * 10;
    } else if (mouseFresh) {
      tx = this.aimX;
      tz = this.aimZ;
    } else {
      tx = r.x + Math.cos(r.facing) * 10;
      tz = r.z + Math.sin(r.facing) * 10;
    }
    this.swingTargetX = tx;
    this.swingTargetZ = tz;

    // Q / E override the planner's anchor choice (never while attached).
    if (r.tState === 'attached') this.override = -1;
    else if (this.cycle !== 0) {
      this.override = this.cycleAnchor(w, r, this.override >= 0 ? this.override : this.swing.preview, this.cycle);
    }
    this.cycle = 0;
    if (this.override >= 0 && !anchorInRange(w, r, this.override)) this.override = -1;

    const held = this.enabled && (this.tetherMouse || this.tetherTouch || this.padTether || this.held('tether') || this.tetherLatch);
    this.tetherLatch = false;
    this.swing.update(w, r, c, { held, tx, tz, anchor: this.override, assist: this.assistOverride ?? s.swingAssist });
    if (!this.enabled) c.tether = false;
    this.preview = this.swing.preview;

    c.pass = this.enabled && this.passQueued;
    c.lob = c.pass ? this.passLob : 0;
    c.giveGo = false;
    this.passQueued = false;
    this.passLob = 0;
    this.lobCharge = this.enabled ? this.chargeAt(performance.now()) : null;
    c.meg = this.enabled && this.megQueued && !c.pass;
    this.megQueued = false;
    c.kick = this.enabled && this.kickQueued && !c.pass && !c.meg;
    c.power = 1;
    if (this.kickQueued) {
      if (this.aimOnce) {
        c.ax = w.ball.x + this.aimOnce.x * 8;
        c.az = w.ball.z + this.aimOnce.z * 8;
      } else if ((this.kickByKey || (ml > 0.2 && performance.now() - this.mouseMovedAt > 3000)) && !(pad && pad.aim)) {
        // Keyboard kick, or a click with a cursor you have not touched for a while: aim from movement instead.
        this.smartAim(w, r, dirX, dirZ, this.tmp);
        c.ax = this.tmp.x;
        c.az = this.tmp.z;
      } else {
        c.ax = this.aimX;
        c.az = this.aimZ;
      }
      this.aimOnce = null;
    } else {
      c.ax = this.aimX;
      c.az = this.aimZ;
    }
    this.kickQueued = false;
  }

  private cycleAnchor(w: World, r: Robot, current: number, dir: number): number {
    const list: { i: number; a: number }[] = [];
    w.arena.anchors.forEach((an, i) => {
      if (Math.hypot(an.x - r.x, an.z - r.z) <= TUNING.tether.acquisitionRange) list.push({ i, a: Math.atan2(an.z - r.z, an.x - r.x) });
    });
    if (!list.length) return -1;
    list.sort((p, q) => p.a - q.a);
    const idx = list.findIndex((p) => p.i === current);
    return list[(idx + dir + list.length) % list.length].i;
  }
}
