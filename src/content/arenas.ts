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
    length: 34,
    width: 22,
    goalWidth: 6,
    goalDepth: 2,
    corner: 2.5,
    anchors: railAnchors(34, 22, [-12, -4, 4, 12], 6.5),
  },
  foundry_court: {
    id: 'foundry_court',
    name: 'Foundry Court',
    tag: 'Tight and fast',
    blurb: 'A narrower court: short passing lanes, lively wall rebounds, anchors always in reach.',
    unlockHint: 'Finish your first season.',
    length: 32,
    width: 18,
    goalWidth: 6,
    goalDepth: 2,
    corner: 2.2,
    anchors: railAnchors(32, 18, [-11.2, -3.8, 3.8, 11.2], 5.8),
  },
  skyline_stadium: {
    id: 'skyline_stadium',
    name: 'Skyline Stadium',
    tag: 'Wide open',
    blurb: 'A wide rooftop pitch with room for support runs and two midfield gantry anchors for full-circle swings.',
    unlockHint: 'Win the Harbor Division title.',
    length: 34,
    width: 26,
    goalWidth: 6,
    goalDepth: 2,
    corner: 3,
    anchors: [
      ...railAnchors(34, 26, [-12, -4, 4, 12], 7.5),
      { id: 'gantry_n', x: 0, z: -5, kind: 'gantry' },
      { id: 'gantry_s', x: 0, z: 5, kind: 'gantry' },
    ],
  },
  championship_dome: {
    id: 'championship_dome',
    name: 'Championship Dome',
    tag: 'Showpiece',
    blurb: 'Standard competitive geometry under the lights, with rounder corners that keep the ball alive.',
    unlockHint: 'Reach the Premier Division.',
    length: 34,
    width: 22,
    goalWidth: 6,
    goalDepth: 2,
    corner: 3.4,
    anchors: railAnchors(34, 22, [-12, -4, 4, 12], 6.5),
  },
};

export const ARENA_ORDER: ArenaId[] = ['harbor_park', 'foundry_court', 'skyline_stadium', 'championship_dome'];
