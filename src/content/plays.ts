/**
 * The playbook: named team plays the player can pull off. Mechanics live in the simulation
 * (src/game/sim/world.ts) and input (src/game/input/input.ts); this is the player-facing description,
 * shown in the Academy playbook, the pause menu and the controls help.
 */
export type PlayId = 'long_ball' | 'give_and_go' | 'wall_pass' | 'one_touch';

export interface PlayDef {
  id: PlayId;
  name: string;
  /** One line: what the play is for. */
  summary: string;
  /** How to do it, per input. Short imperative steps. */
  how: { keyboard: string; touch: string; pad: string };
  /** What separates a good attempt from a perfect one. */
  skill: string;
  /** The Records counter that tracks it. */
  record: 'longBalls' | 'giveAndGos' | 'wallPasses' | 'oneTouchGoals';
  icon: string;
}

export const PLAYS: Record<PlayId, PlayDef> = {
  long_ball: {
    id: 'long_ball',
    name: 'Long Ball',
    summary: 'Loft the ball over defenders to a teammate up the pitch.',
    how: {
      keyboard: 'Hold PASS (K / F) to charge, release to send it.',
      touch: 'Hold PASS to charge, release to send it.',
      pad: 'Hold B / Y to charge, release to send it.',
    },
    skill: 'The meter has a gold notch: release on it for the perfect weight. Early drops short, late sails long.',
    record: 'longBalls',
    icon: 'pass',
  },
  give_and_go: {
    id: 'give_and_go',
    name: 'Give-and-Go',
    summary: 'Pass, burst forward, and get it straight back in stride.',
    how: {
      keyboard: 'Pass, run toward goal, then press PASS again while your teammate has the ball.',
      touch: 'Pass, run toward goal, then tap PASS again while your teammate has the ball.',
      pad: 'Pass, run toward goal, then press B / Y again while your teammate has the ball.',
    },
    skill: 'Call before your teammate settles the ball for a first-time return. Run into space: a blocked lane kills the return.',
    record: 'giveAndGos',
    icon: 'assist',
  },
  wall_pass: {
    id: 'wall_pass',
    name: 'Wall Pass',
    summary: 'Bend a pass round a blocker off the lively side wall.',
    how: {
      keyboard: 'Tap PASS when a defender stands in the lane; the pass banks off the side wall.',
      touch: 'Tap PASS when a defender stands in the lane; the pass banks off the side wall.',
      pad: 'Tap B / Y when a defender stands in the lane; the pass banks off the side wall.',
    },
    skill: 'Works when you and your teammate are near the same wall and the bank route is clear.',
    record: 'wallPasses',
    icon: 'intercept',
  },
  one_touch: {
    id: 'one_touch',
    name: 'One-Touch Strike',
    summary: 'Shoot first time off a teammate pass for extra power.',
    how: {
      keyboard: 'Kick the moment a teammate pass reaches you, aimed at goal.',
      touch: 'Tap KICK the moment a teammate pass reaches you.',
      pad: 'Press A / X the moment a teammate pass reaches you.',
    },
    skill: 'Strike within a second or so of the pass: no extra touches.',
    record: 'oneTouchGoals',
    icon: 'ball',
  },
};

export const PLAY_ORDER: PlayId[] = ['long_ball', 'give_and_go', 'wall_pass', 'one_touch'];
