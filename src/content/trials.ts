import type { ArenaId } from './arenas';

export type TrialId = 'swing_school' | 'clean_release' | 'bank_shot' | 'pass_window' | 'last_second_save' | 'counterattack';

export interface TrialDef {
  id: TrialId;
  name: string;
  skill: string;
  icon: string;
  arena: ArenaId;
  /** Exact success condition, shown before the trial starts. */
  objective: string;
  scoring: string;
  /** 'time' scores are seconds (lower is better); 'count' scores are totals (higher is better). */
  unit: 'time' | 'count';
  /** Medal thresholds, tuned from playtests. */
  bronze: number;
  silver: number;
  gold: number;
  /** Bump when rules or thresholds change so old records are not compared with new ones. */
  rulesVersion: number;
}

export const TRIALS: Record<TrialId, TrialDef> = {
  swing_school: {
    id: 'swing_school', name: 'Swing School', skill: 'Tether movement', icon: 'swing', arena: 'harbor_park',
    objective: 'Swing through the three glowing gates in order. Each gate only counts while you are faster than running speed. Tip: point past the next gate and tap swing; tap again to let go early.',
    scoring: 'Fastest time. Crossing a gate too slowly does not count.',
    unit: 'time', bronze: 14, silver: 9.5, gold: 6.5, rulesVersion: 3,
  },
  clean_release: {
    id: 'clean_release', name: 'Clean Release', skill: 'Release timing', icon: 'target', arena: 'harbor_park',
    objective: 'Manual release test: smart swing is off here. Point at the lane, hold swing, and let go when the rope glows green.',
    scoring: 'Successful launches out of 8 attempts.',
    unit: 'count', bronze: 3, silver: 5, gold: 7, rulesVersion: 2,
  },
  bank_shot: {
    id: 'bank_shot', name: 'Bank Shot', skill: 'Wall play', icon: 'ball', arena: 'foundry_court',
    objective: 'Score three goals. Each one must bounce off the glowing wall section first.',
    scoring: 'Time to three valid goals.',
    unit: 'time', bronze: 30, silver: 16, gold: 10.5, rulesVersion: 1,
  },
  pass_window: {
    id: 'pass_window', name: 'Pass Window', skill: 'Passing', icon: 'pass', arena: 'harbor_park',
    objective: 'Pass the ball through the gate to your moving teammate. They knock it back to your half for the next one.',
    scoring: 'Completed passes in 45 seconds.',
    unit: 'count', bronze: 5, silver: 9, gold: 13, rulesVersion: 1,
  },
  last_second_save: {
    id: 'last_second_save', name: 'Last-Second Save', skill: 'Defending', icon: 'save', arena: 'skyline_stadium',
    objective: 'Six shots are coming at your goal. Get across and block or clear each one.',
    scoring: 'Saves out of 6. Gold needs every one.',
    unit: 'count', bronze: 3, silver: 5, gold: 6, rulesVersion: 1,
  },
  counterattack: {
    id: 'counterattack', name: 'Counterattack', skill: 'Transition', icon: 'intercept', arena: 'championship_dome',
    objective: 'Cut out the opponents\' pass, then carry the ball up the pitch and score before they recover.',
    scoring: 'Fastest time from the pass to your goal.',
    unit: 'time', bronze: 10, silver: 6.5, gold: 4.5, rulesVersion: 2,
  },
};

export const TRIAL_ORDER: TrialId[] = ['swing_school', 'clean_release', 'bank_shot', 'pass_window', 'last_second_save', 'counterattack'];

/** 0 none, 1 bronze, 2 silver, 3 gold. */
export function medalFor(def: TrialDef, score: number): 0 | 1 | 2 | 3 {
  if (def.unit === 'time') return score <= def.gold ? 3 : score <= def.silver ? 2 : score <= def.bronze ? 1 : 0;
  return score >= def.gold ? 3 : score >= def.silver ? 2 : score >= def.bronze ? 1 : 0;
}

export function betterScore(def: TrialDef, a: number, b: number): boolean {
  return def.unit === 'time' ? a < b : a > b;
}

export const MEDAL_NAMES = ['No medal', 'Bronze', 'Silver', 'Gold'] as const;

export type LessonId = 'move' | 'tether' | 'kick' | 'pass' | 'defend';

export interface LessonDef {
  id: LessonId;
  name: string;
  summary: string;
  icon: string;
}

export const LESSONS: LessonDef[] = [
  { id: 'move', name: 'Movement', summary: 'Run, stop and find your goal.', icon: 'next' },
  { id: 'tether', name: 'Swing Basics', summary: 'Tap to launch, hold to steer, swing into a power shot.', icon: 'swing' },
  { id: 'kick', name: 'Kicking', summary: 'Aim a kick and score a practice goal.', icon: 'ball' },
  { id: 'pass', name: 'Passing', summary: 'Find your teammate in space.', icon: 'pass' },
  { id: 'defend', name: 'Defending', summary: 'Get goal-side and stop a shot.', icon: 'save' },
];
