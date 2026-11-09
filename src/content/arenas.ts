export type ArenaId = 'harbor_park' | 'foundry_court' | 'skyline_stadium' | 'championship_dome';

export interface AnchorDef {
  id: string;
  x: number;
  z: number;
  /** 'rail' anchors sit on the boundary; 'gantry' anchors hang over the field (render only difference). */
  kind: 'rail' | 'gantry';
}

export interface ArenaDef {
  id: ArenaId;
  name: string;
  tag: string;
  blurb: string;
  unlockHint: string;
  length: number;
  width: number;
  goalWidth: number;
  goalDepth: number;
  /** Size of the diagonal corner cut that keeps the ball out of dead corners. */
  corner: number;
  anchors: AnchorDef[];
}

function railAnchors(length: number, width: number, xs: number[], endZ: number): AnchorDef[] {
  const out: AnchorDef[] = [];
  const hz = width / 2 + 0.5;
  const hx = length / 2 + 0.5;
  xs.forEach((x, i) => {
    out.push({ id: `north_${i}`, x, z: -hz, kind: 'rail' });
    out.push({ id: `south_${i}`, x, z: hz, kind: 'rail' });
  });
  // End-line anchors either side of each goal: used for goal-mouth sweeps and cut-ins.
  [-1, 1].forEach((sx, i) => {
    [-1, 1].forEach((sz, j) => {
      out.push({ id: `end_${i}_${j}`, x: sx * hx, z: sz * endZ, kind: 'rail' });
    });
  });
  return out;
}

export const ARENAS: Record<ArenaId, ArenaDef> = {
  harbor_park: {
    id: 'harbor_park',
    name: 'Harbor Park',
    tag: 'Balanced',
    blurb: 'The standard seaside court. Even spacing, clear swing lanes on both wings.',
    unlockHint: 'Home ground, always available.',
    length: 30,
    width: 20,
    goalWidth: 6,
    goalDepth: 2,
    corner: 2.4,
    anchors: railAnchors(30, 20, [-10.5, -3.5, 3.5, 10.5], 6),
  },
  foundry_court: {
    id: 'foundry_court',
    name: 'Foundry Court',
    tag: 'Tight and fast',
    blurb: 'A narrower court: short passing lanes, lively wall rebounds, anchors always in reach.',
    unlockHint: 'Finish your first season.',
    length: 27,
    width: 16.5,
    goalWidth: 6,
    goalDepth: 2,
    corner: 2.1,
    anchors: railAnchors(27, 16.5, [-9.4, -3.2, 3.2, 9.4], 5.4),
  },
  skyline_stadium: {
    id: 'skyline_stadium',
    name: 'Skyline Stadium',
    tag: 'Wide open',
    blurb: 'A wide rooftop pitch with room for support runs and two midfield gantry anchors for full-circle swings.',
    unlockHint: 'Win the Harbor Division title.',
    length: 31,
    width: 24,
    goalWidth: 6,
    goalDepth: 2,
    corner: 2.8,
    anchors: [
      ...railAnchors(31, 24, [-11, -3.7, 3.7, 11], 7),
      { id: 'gantry_n', x: 0, z: -4.5, kind: 'gantry' },
      { id: 'gantry_s', x: 0, z: 4.5, kind: 'gantry' },
    ],
  },
  championship_dome: {
    id: 'championship_dome',
    name: 'Championship Dome',
    tag: 'Showpiece',
    blurb: 'Standard competitive geometry under the lights, with rounder corners that keep the ball alive.',
    unlockHint: 'Reach the Premier Division.',
    length: 30,
    width: 20,
    goalWidth: 6,
    goalDepth: 2,
    corner: 3.2,
    anchors: railAnchors(30, 20, [-10.5, -3.5, 3.5, 10.5], 6),
  },
};

export const ARENA_ORDER: ArenaId[] = ['harbor_park', 'foundry_court', 'skyline_stadium', 'championship_dome'];
