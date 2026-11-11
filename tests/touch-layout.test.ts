import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ARENAS } from '../src/content/arenas';
import { CHASSIS } from '../src/content/chassis';
import { TUNING } from '../src/content/tuning';
import { InputManager } from '../src/game/input/input';
import { emptyCommand } from '../src/game/sim/types';
import { createRobot, createWorld, placeBall, placeRobot } from '../src/game/sim/world';
import { defaultSettings } from '../src/storage/settings';

// On-screen touch buttons (SWING / KICK / PASS) with minimal stand-ins for the DOM, so the button paths,
// the long-ball charge shown on PASS and the vibration guard are covered without a browser.
type TouchApi = {
  touchBegin(id: number, x: number, y: number, target: unknown): boolean;
  touchMove(id: number, x: number, y: number): void;
  touchEnd(id: number): void;
  touchSeen: boolean;
  passBtn: unknown;
  touchRoot: unknown;
};

class FakeEl {
  classes = new Set<string>();
  props = new Map<string, string>();
  dataset: Record<string, string>;
  classList = {
    add: (...c: string[]) => c.forEach((x) => this.classes.add(x)),
    remove: (...c: string[]) => c.forEach((x) => this.classes.delete(x)),
    toggle: (c: string, on?: boolean) => {
      const v = on ?? !this.classes.has(c);
      if (v) this.classes.add(c);
      else this.classes.delete(c);
      return v;
    },
  };
  style = { setProperty: (k: string, v: string) => this.props.set(k, v) };
  constructor(kind: string) {
    this.dataset = { touch: kind };
  }
  closest(sel: string) {
    return sel === '[data-touch]' ? this : null;
  }
}

const g = globalThis as unknown as { window?: unknown; navigator?: unknown };
let hadWindow = false;
beforeAll(() => {
  hadWindow = 'window' in g;
  if (!hadWindow) g.window = { innerWidth: 800, innerHeight: 400 };
});
afterAll(() => {
  if (!hadWindow) delete g.window;
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setup() {
  const me = createRobot(0, 0, 0, CHASSIS.all_rounder, true);
  const w = createWorld(ARENAS.harbor_park, [me]);
  placeRobot(me, -4, 0, 0);
  placeBall(w, 6, 3);
  const settings = defaultSettings();
  const input = new InputManager({} as HTMLElement, () => settings, () => null, () => {});
  const api = input as unknown as TouchApi;
  api.touchSeen = true; // skip building the real on-screen controls
  return { w, me, input, api, settings };
}

describe('touch buttons', () => {
  for (const id of [0, -9, 2147483647, -2147483648]) {
    it(`KICK works with touch id ${id}`, () => {
      const { w, me, input, api } = setup();
      const kick = new FakeEl('kick');
      expect(api.touchBegin(id, 700, 350, kick)).toBe(true);
      expect(kick.classes.has('is-down')).toBe(true);
      api.touchEnd(id);
      const c = emptyCommand();
      input.sample(w, me, c);
      expect(c.kick).toBe(true);
    });
  }

  it('SWING and the stick work together on two fingers', () => {
    const { w, me, input, api } = setup();
    expect(api.touchBegin(-1, 100, 300, null)).toBe(true);
    api.touchMove(-1, 160, 300);
    expect(api.touchBegin(-2, 650, 330, new FakeEl('tether'))).toBe(true);
    const c = emptyCommand();
    input.sample(w, me, c);
    expect(c.mx).toBeGreaterThan(0.5);
    expect(input.used.tether).toBe(1);
  });

  it('shows the long-ball charge on PASS while held and clears it on release', () => {
    const { w, me, input, api } = setup();
    const pass = new FakeEl('pass');
    api.passBtn = pass;
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    api.touchBegin(-4, 700, 200, pass);
    now += (TUNING.kick.lobHoldSeconds + TUNING.kick.lobChargeSeconds * 0.5) * 1000;
    input.sample(w, me, emptyCommand());
    input.showCharge(0.5);
    expect(pass.classes.has('is-charging')).toBe(true);
    expect(pass.classes.has('has-ideal')).toBe(true);
    expect(Number(pass.props.get('--charge'))).toBeCloseTo(0.5, 1);
    expect(pass.classes.has('in-window')).toBe(true);
    api.touchEnd(-4);
    const c = emptyCommand();
    input.sample(w, me, c);
    expect(c.pass).toBe(true);
    expect(c.lob).toBeGreaterThan(0.3);
    input.showCharge(null);
    expect(pass.classes.has('is-charging')).toBe(false);
  });

  it('a quick PASS tap is a ground pass with no charge shown', () => {
    const { w, me, input, api } = setup();
    const pass = new FakeEl('pass');
    api.passBtn = pass;
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    api.touchBegin(3, 700, 200, pass);
    now += 60;
    input.showCharge(null);
    api.touchEnd(3);
    const c = emptyCommand();
    input.sample(w, me, c);
    expect(c.pass).toBe(true);
    expect(c.lob).toBe(0);
    expect(pass.classes.has('is-charging')).toBe(false);
  });

  it('vibrates on press only when enabled and supported', () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal('navigator', { vibrate });
    const { api, settings } = setup();
    api.touchBegin(1, 700, 350, new FakeEl('kick'));
    expect(vibrate).toHaveBeenCalledTimes(1);
    api.touchEnd(1);
    settings.vibration = false;
    api.touchBegin(2, 700, 350, new FakeEl('kick'));
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('does not vibrate (or throw) where vibration is missing', () => {
    vi.stubGlobal('navigator', {});
    const { api } = setup();
    expect(() => api.touchBegin(1, 700, 350, new FakeEl('tether'))).not.toThrow();
  });
});
