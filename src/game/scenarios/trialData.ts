/**
 * Fixed layouts for the skill trials (pure data, no DOM), so they can be validated headlessly.
 * Coordinates are field units for the arena named in content/trials.ts.
 */
export type Gate = [number, number, number, number];

export const SWING_GATES: Gate[] = [
  [-3.5, 2.6, -3.5, 6.8],
  [3.5, -6.8, 3.5, -2.6],
  [10.5, 2.6, 10.5, 6.8],
];

export const RELEASES: { start: [number, number]; gate: Gate }[] = [
  { start: [-8, 6], gate: [3, 2.2, 3, 6] },
  { start: [-8, -6], gate: [3, -6, 3, -2.2] },
  { start: [-9.5, 7.5], gate: [-1.5, -1.5, 1.5, 1.5] },
  { start: [-9.5, -7.5], gate: [-1.5, 1.5, 1.5, -1.5] },
  { start: [8, 6], gate: [-3, 2.2, -3, 6] },
  { start: [8, -6], gate: [-3, -6, -3, -2.2] },
  { start: [9.5, 7.5], gate: [1.5, -1.5, -1.5, 1.5] },
  { start: [-12, 3.5], gate: [4.5, 1.6, 4.5, 5.4] },
];

export const BANKS: { ball: [number, number]; player: [number, number]; wall: 1 | -1; seg: [number, number] }[] = [
  { ball: [2, 2], player: [-1, 3.2], wall: -1, seg: [5.5, 10] },
  { ball: [0, -3], player: [-2.5, -4], wall: 1, seg: [4.8, 9.6] },
  { ball: [-4, 0], player: [-6.5, 0.6], wall: -1, seg: [2.2, 7] },
];

export const WAYPOINTS: [number, number][] = [[8, -5], [9, 4.5], [4, 6.5], [10.5, 0], [5, -6.5], [11, 5.5], [7, 2], [3.5, -5], [10, -6], [6, 6]];
export const PASS_HOME: [number, number] = [-5, 0];

export const SHOTS: { start: [number, number]; from: [number, number]; z: number; speed: number }[] = [
  { start: [-9.5, 3.5], from: [2, -6], z: 1.5, speed: 11 },
  { start: [-9.5, -3], from: [3, 7], z: -1.8, speed: 12 },
  { start: [-6.5, -5], from: [4, 0], z: 2.2, speed: 12.5 },
  { start: [-4.5, 6.5], from: [0.5, -8], z: -2, speed: 12.5 },
  { start: [-2.5, -7.5], from: [5, 6], z: 2.3, speed: 13 },
  { start: [-0.5, 0], from: [6, -3], z: -2.3, speed: 13.5 },
];

export const COUNTERS: { a: [number, number]; b: [number, number]; me: [number, number] }[] = [
  { a: [1, -5.5], b: [-5, 4.5], me: [-9, 0] },
  { a: [2, 5], b: [-6, -4], me: [-9.5, 1] },
  { a: [0, -7], b: [-7, 2.5], me: [-10, -1.5] },
];
