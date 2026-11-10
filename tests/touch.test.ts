import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ARENAS } from '../src/content/arenas';
import { CHASSIS } from '../src/content/chassis';
import { InputManager } from '../src/game/input/input';
import { emptyCommand } from '../src/game/sim/types';
import { createRobot, createWorld, placeBall, placeRobot } from '../src/game/sim/world';
import { defaultSettings } from '../src/storage/settings';

// Touch identifiers are arbitrary integers: iOS can report negative or very large ones.
// A stick touch with any id must steer the robot (a sign check once made the knob move while
// the robot stood still on iPhone).
type TouchApi = {
  touchBegin(id: number, x: number, y: number, target: null): boolean;
  touchMove(id: number, x: number, y: number): void;
  touchEnd(id: number): void;
  touchSeen: boolean;
};

const g = globalThis as unknown as { window?: unknown };
let hadWindow = false;
beforeAll(() => {
  hadWindow = 'window' in g;
  if (!hadWindow) g.window = { innerWidth: 800, innerHeight: 400 };
});
afterAll(() => {
  if (!hadWindow) delete g.window;
});

function setup() {
  const me = createRobot(0, 0, 0, CHASSIS.all_rounder, true);
  const w = createWorld(ARENAS.harbor_park, [me]);
  placeRobot(me, -4, 0, 0);
  placeBall(w, 6, 3);
  const settings = defaultSettings();
  const input = new InputManager({} as HTMLElement, () => settings, () => null, () => {});
  const api = input as unknown as TouchApi;
  api.touchSeen = true; // skip building the on-screen controls (no DOM here)
  return { w, me, input, api };
}

describe('touch stick', () => {
  for (const id of [0, 1, -7, -2147483648, 3000000000]) {
    it(`steers with touch id ${id}`, () => {
      const { w, me, input, api } = setup();
      expect(api.touchBegin(id, 100, 300, null)).toBe(true);
      api.touchMove(id, 160, 300); // drag right
      const c = emptyCommand();
      input.sample(w, me, c);
      expect(c.mx).toBeGreaterThan(0.5);
      api.touchEnd(id);
      const c2 = emptyCommand();
      input.sample(w, me, c2);
      expect(c2.mx).toBe(0);
    });
  }

  it('lets a second finger press a button while the stick is held', () => {
    const { w, me, input, api } = setup();
    api.touchBegin(-3, 100, 300, null);
    api.touchMove(-3, 100, 240);
    // A second touch on the stick side is ignored while the first one steers.
    expect(api.touchBegin(-4, 120, 320, null)).toBe(false);
    const c = emptyCommand();
    input.sample(w, me, c);
    expect(c.mz).toBeLessThan(-0.5);
  });
});
