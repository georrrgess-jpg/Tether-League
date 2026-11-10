export type Action = 'up' | 'down' | 'left' | 'right' | 'tether' | 'kick' | 'anchorPrev' | 'anchorNext' | 'pause';

export const ACTION_LABELS: Record<Action, string> = {
  up: 'Move up',
  down: 'Move down',
  left: 'Move left',
  right: 'Move right',
  tether: 'Swing (tap or hold)',
  kick: 'Kick',
  anchorPrev: 'Previous anchor',
  anchorNext: 'Next anchor',
  pause: 'Pause',
};

export const ACTIONS: Action[] = ['up', 'down', 'left', 'right', 'tether', 'kick', 'anchorPrev', 'anchorNext', 'pause'];

export interface Settings {
  masterVolume: number;
  musicVolume: number;
  effectsVolume: number;
  muted: boolean;
  reducedMotion: boolean;
  cameraShake: boolean;
  quality: 'auto' | 'low' | 'medium' | 'high';
  /** Show the linking hint to the previewed anchor. */
  anchorAssistance: boolean;
  /** Smart swing: a tap on tether swings and launches toward your aim automatically. */
  swingAssist: boolean;
  aimAssistance: 'off' | 'light' | 'strong';
  /** auto = follow the last device used; mouse = cursor aim; keyboard = aim along movement. */
  aimMode: 'auto' | 'mouse' | 'keyboard';
  ballOutline: boolean;
  highContrast: boolean;
  textScale: number;
  showHints: boolean;
  touchScale: number;
  touchSwap: boolean;
  /** Two key codes (KeyboardEvent.code) per action; empty string = unbound. */
  keys: Record<Action, [string, string]>;
}

export function defaultKeys(): Record<Action, [string, string]> {
  return {
    up: ['KeyW', 'ArrowUp'],
    down: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    tether: ['Space', 'ShiftLeft'],
    kick: ['KeyJ', 'Enter'],
    anchorPrev: ['KeyQ', ''],
    anchorNext: ['KeyE', ''],
    pause: ['Escape', 'KeyP'],
  };
}

export function defaultSettings(): Settings {
  const prefersReduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    masterVolume: 0.8,
    musicVolume: 0.45,
    effectsVolume: 0.8,
    muted: false,
    reducedMotion: prefersReduced,
    cameraShake: false,
    quality: 'auto',
    anchorAssistance: true,
    swingAssist: true,
    aimAssistance: 'light',
    aimMode: 'auto',
    ballOutline: false,
    highContrast: false,
    textScale: 1,
    showHints: true,
    touchScale: 1,
    touchSwap: false,
    keys: defaultKeys(),
  };
}

export function keyLabel(code: string): string {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return { Up: '↑', Down: '↓', Left: '←', Right: '→' }[code.slice(5)] ?? code;
  const map: Record<string, string> = {
    Space: 'Space', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl',
    AltLeft: 'L-Alt', AltRight: 'R-Alt', Enter: 'Enter', Escape: 'Esc', Tab: 'Tab', Backspace: 'Backspace',
    Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=',
  };
  return map[code] ?? code;
}

/** Validates settings loaded from storage, falling back per field. */
export function sanitizeSettings(raw: unknown): Settings {
  const d = defaultSettings();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, lo: number, hi: number, def: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def);
  const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);
  const oneOf = <T extends string>(v: unknown, opts: readonly T[], def: T): T => (opts.includes(v as T) ? (v as T) : def);
  const keys = defaultKeys();
  if (r.keys && typeof r.keys === 'object') {
    for (const a of ACTIONS) {
      const k = (r.keys as Record<string, unknown>)[a];
      if (Array.isArray(k) && k.length === 2 && k.every((s) => typeof s === 'string' && s.length < 24)) keys[a] = [k[0], k[1]];
    }
  }
  return {
    masterVolume: num(r.masterVolume, 0, 1, d.masterVolume),
    musicVolume: num(r.musicVolume, 0, 1, d.musicVolume),
    effectsVolume: num(r.effectsVolume, 0, 1, d.effectsVolume),
    muted: bool(r.muted, d.muted),
    reducedMotion: bool(r.reducedMotion, d.reducedMotion),
    cameraShake: bool(r.cameraShake, d.cameraShake),
    quality: oneOf(r.quality, ['auto', 'low', 'medium', 'high'] as const, d.quality),
    anchorAssistance: bool(r.anchorAssistance, d.anchorAssistance),
    swingAssist: bool(r.swingAssist, d.swingAssist),
    aimAssistance: oneOf(r.aimAssistance, ['off', 'light', 'strong'] as const, d.aimAssistance),
    aimMode: oneOf(r.aimMode, ['auto', 'mouse', 'keyboard'] as const, d.aimMode),
    ballOutline: bool(r.ballOutline, d.ballOutline),
    highContrast: bool(r.highContrast, d.highContrast),
    textScale: num(r.textScale, 0.9, 1.4, d.textScale),
    showHints: bool(r.showHints, d.showHints),
    touchScale: num(r.touchScale, 0.7, 1.5, d.touchScale),
    touchSwap: bool(r.touchSwap, d.touchSwap),
    keys,
  };
}
