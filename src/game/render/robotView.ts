import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RobotLook } from '../../content/cosmetics';
import type { Quality } from './arenaView';
import { faceTexture, jerseyTexture, shade, type Expression } from './textures';

/**
 * Procedural robot: rounded clear-coat white shell, navy joints, a dark glass face screen with glowing eyes,
 * the club jersey with its number, a glowing team-colour belt and ear rings, and two small back thrusters
 * that flare when the robot runs fast or swings. Optional head toppers come from the look.
 *
 * Static parts are merged per material inside each moving group (body, torso, head, arms, legs), so a robot
 * costs about thirty draw calls whatever its detail. Merged geometry is cached per chassis and per topper and
 * shared by every robot. All animation is presentation only; the simulation body is a circle and never
 * reads this.
 */
export type RobotMood = 'play' | 'celebrate' | 'sad' | 'idle' | 'ready';

export interface RobotPose {
  x: number;
  z: number;
  facing: number;
  vx: number;
  vz: number;
  tethered: boolean;
  /** World position of the anchor while tethered. */
  ax: number;
  az: number;
  /** Seconds since the last deliberate kick / bump (large when none). */
  kickAge: number;
  kickDir: number;
  bumpAge: number;
  mood: RobotMood;
  reduced: boolean;
}

const WHITE = '#f6f8f6';
const NAVY = '#1f2d45';
const TETHER_YELLOW = '#f6c542';

type Slot = 'shell' | 'navy' | 'accent' | 'secondary' | 'glow' | 'yellow' | 'gold' | 'gem' | 'metal' | 'halo';
type V3 = [number, number, number];
interface Xf {
  p?: V3;
  r?: V3;
  s?: number | V3;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Collects transformed primitives per material slot and merges them into one geometry per slot. */
class Parts {
  private lists = new Map<Slot, THREE.BufferGeometry[]>();

  add(slot: Slot, g: THREE.BufferGeometry, x: Xf = {}): this {
    const c = g.clone();
    const s = x.s ?? 1;
    const p = x.p ?? [0, 0, 0];
    const r = x.r ?? [0, 0, 0];
    _m.compose(_p.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2])), typeof s === 'number' ? _s.setScalar(s) : _s.set(s[0], s[1], s[2]));
    c.applyMatrix4(_m);
    let list = this.lists.get(slot);
    if (!list) this.lists.set(slot, (list = []));
    list.push(c);
    return this;
  }

  build(): Map<Slot, THREE.BufferGeometry> {
    const out = new Map<Slot, THREE.BufferGeometry>();
    for (const [slot, list] of this.lists) {
      const flat = list.some((g) => !g.index);
      const norm = list.map((g) => {
        const h = flat && g.index ? g.toNonIndexed() : g;
        for (const name of Object.keys(h.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') h.deleteAttribute(name);
        return h;
      });
      const merged = norm.length === 1 ? norm[0] : mergeGeometries(norm, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      out.set(slot, merged);
    }
    return out;
  }
}

// ----------------------------------------------------------------------------- shared primitives

const SPH = new THREE.SphereGeometry(1, 30, 18);
const SPH_LO = new THREE.SphereGeometry(1, 14, 10);
/** Mid-detail sphere for joints, hands and boots (small on screen). */
const SPH_MID = new THREE.SphereGeometry(1, 22, 14);
const HEMI = new THREE.SphereGeometry(1, 24, 9, 0, Math.PI * 2, 0, Math.PI / 2);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 24);
const torus = (R: number, tube: number, seg = 32, arc = Math.PI * 2) => new THREE.TorusGeometry(R, tube, 6, seg, arc);
const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 4, 14);
const ROUND_BOX = (() => {
  // A softened box: a capsule squashed flat reads as a moulded panel at robot scale.
  return new THREE.CapsuleGeometry(0.5, 1, 4, 12);
})();

function extrude(points: [number, number][], depth: number, bevel = 0.008): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Jersey torso: a smooth lathe whose v coordinate follows height so the number sits mid-chest. */
const TORSO_H = 0.455;
const TORSO_GEO = (() => {
  const ctrl = [
    new THREE.Vector2(0.15, 0.0), new THREE.Vector2(0.205, 0.035), new THREE.Vector2(0.245, 0.13), new THREE.Vector2(0.272, 0.25),
    new THREE.Vector2(0.266, 0.34), new THREE.Vector2(0.215, 0.41), new THREE.Vector2(0.12, 0.445), new THREE.Vector2(0.001, TORSO_H),
  ];
  const pts = new THREE.SplineCurve(ctrl).getPoints(18);
  const g = new THREE.LatheGeometry(pts, 36, Math.PI, Math.PI * 2);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setY(i, Math.max(0, Math.min(1, pos.getY(i) / TORSO_H)));
  return g;
})();

/** Twin thruster flame: an outer team-colour cone, a white-hot core and a nozzle disc; vertex colours fade to the tip. */
const THRUSTER_X = 0.1;
const THR_Y = 0.115;
const THR_Z = -0.29;
const THRUSTER_TILT = 0.45;
const FLAME_GEO = (() => {
  const parts: THREE.BufferGeometry[] = [];
  const colorize = (g: THREE.BufferGeometry, base: number, len: number) => {
    const pos = g.attributes.position;
    const c = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const t = len > 0 ? Math.max(0, Math.min(1, -pos.getY(i) / len)) : 0;
      const k = base * (1 - t) * (1 - t);
      c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  };
  for (const sx of [-1, 1]) {
    const outer = new THREE.ConeGeometry(0.05, 1, 14, 3, true);
    outer.rotateX(Math.PI);
    outer.translate(sx * THRUSTER_X, -0.5, 0);
    parts.push(colorize(outer, 1.1, 1));
    const core = new THREE.ConeGeometry(0.026, 0.6, 10, 2, true);
    core.rotateX(Math.PI);
    core.translate(sx * THRUSTER_X, -0.3, 0);
    parts.push(colorize(core, 2.6, 0.6));
    const disc = new THREE.CircleGeometry(0.04, 16);
    disc.rotateX(Math.PI / 2);
    disc.translate(sx * THRUSTER_X, -0.002, 0);
    parts.push(colorize(disc, 2.2, 0));
  }
  const norm = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of norm) for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'color') g.deleteAttribute(name);
  return mergeGeometries(norm, false)!;
})();

/** Soft ring sprite used behind the halo topper. */
let haloGlowTex: THREE.Texture | null = null;
function haloGlowTexture(): THREE.Texture {
  if (haloGlowTex) return haloGlowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 20, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.0)');
  grad.addColorStop(0.72, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.86, 'rgba(255,255,255,0.15)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  haloGlowTex = new THREE.CanvasTexture(c);
  return haloGlowTex;
}

// ----------------------------------------------------------------------------- chassis

type ChassisId = RobotLook['chassis'];
type GroupName = 'body' | 'torso' | 'head' | 'armL' | 'armR' | 'legL' | 'legR';

interface ChassisDims {
  torso: V3;
  head: number;
  arm: number;
  legY: number;
  legSpread: number;
  shoulder: number;
}

interface ChassisGeo {
  dims: ChassisDims;
  groups: Record<GroupName, Map<Slot, THREE.BufferGeometry>>;
}

const DIMS: Record<ChassisId, ChassisDims> = {
  all_rounder: { torso: [1, 1, 1], head: 1, arm: 1, legY: 1, legSpread: 0.125, shoulder: 0.315 },
  scout: { torso: [0.86, 0.96, 0.9], head: 0.93, arm: 0.92, legY: 1.22, legSpread: 0.125, shoulder: 0.275 },
  bulwark: { torso: [1.24, 1.0, 1.14], head: 1.04, arm: 1.22, legY: 0.86, legSpread: 0.17, shoulder: 0.39 },
  glider: { torso: [0.94, 1, 0.96], head: 0.98, arm: 0.96, legY: 1, legSpread: 0.125, shoulder: 0.315 },
};

const HIP_Y = 0.36;
const HEAD_Y = 1.02;
/** Skull ellipsoid radii (the head sphere is 0.3 scaled 1.14 / 0.93 / 1). */
const SKULL: V3 = [0.342, 0.279, 0.3];

const chassisCache = new Map<ChassisId, ChassisGeo>();

function chassisGeo(id: ChassisId): ChassisGeo {
  const hit = chassisCache.get(id);
  if (hit) return hit;
  const P = {
    body: new Parts(),
    torso: new Parts(),
    head: new Parts(),
    armL: new Parts(),
    armR: new Parts(),
    legL: new Parts(),
    legR: new Parts(),
  };

  // --- body (unscaled): pelvis and neck
  P.body.add('navy', SPH_MID, { p: [0, HIP_Y, 0], s: [0.162, 0.08, 0.128] });
  P.body.add('navy', SPH_MID, { p: [0, 0.8, 0], s: [0.094, 0.06, 0.094] });

  // --- torso (scaled per chassis; y = 0 at the hem)
  const T = P.torso;
  T.add('navy', torus(0.122, 0.04), { p: [0, 0.43, 0], r: [Math.PI / 2, 0, 0] }); // collar
  T.add('glow', torus(0.152, 0.008, 40), { p: [0, 0.412, 0], r: [Math.PI / 2, 0, 0] }); // collar light
  T.add('navy', torus(0.19, 0.042), { p: [0, 0.028, 0], r: [Math.PI / 2, 0, 0] }); // belt
  T.add('glow', torus(0.232, 0.009, 56), { p: [0, 0.028, 0], r: [Math.PI / 2, 0, 0] }); // light belt
  // Compact jet pack on the lower back: a moulded shell with two nozzles that point down and back.
  T.add('shell', SPH, { p: [0, 0.14, -0.235], r: [THRUSTER_TILT * 0.5, 0, 0], s: [0.2, 0.105, 0.085] });
  T.add('accent', torus(1, 0.02, 48), { p: [0, 0.14, -0.235], r: [THRUSTER_TILT * 0.5 + Math.PI / 2, 0, 0], s: [0.2, 0.085, 1] });
  const ax = [0, Math.cos(THRUSTER_TILT), Math.sin(THRUSTER_TILT)];
  for (const sx of [-1, 1]) {
    const c: V3 = [sx * THRUSTER_X, THR_Y, THR_Z];
    const at = (d: number): V3 => [c[0], c[1] + ax[1] * d, c[2] + ax[2] * d];
    T.add('navy', CYL, { p: at(-0.045), r: [THRUSTER_TILT, 0, 0], s: [0.046, 0.05, 0.046] });
    T.add('metal', new THREE.CylinderGeometry(0.04, 0.054, 0.05, 20), { p: at(-0.075), r: [THRUSTER_TILT, 0, 0] });
  }

  // --- head (y = 0 at the head centre)
  const H = P.head;
  H.add('shell', SPH, { s: [SKULL[0], SKULL[1], SKULL[2]] });
  H.add('accent', SPH, { p: [0, 0.012, -0.02], s: [0.3 * 0.42, 0.3 * 0.945, 0.3 * 0.99] }); // crown stripe
  // navy rim around the face screen: a clear lip proud of the skull (no near-coincident surfaces)
  H.add('navy', new THREE.SphereGeometry(0.309, 40, 12, Math.PI / 2 - 1.06, 2.12, 1.02, 0.98), { p: [0, 0.035, 0.012], s: [1.14, 0.93, 1] });
  // chin seam
  H.add('navy', torus(1, 0.03, 48), { p: [0, -0.15, 0.0], r: [Math.PI / 2, 0, 0], s: [0.282, 0.249, 0.5] });
  for (const sx of [-1, 1]) {
    H.add('navy', CYL, { p: [sx * 0.345, 0, 0], r: [0, 0, Math.PI / 2], s: [0.097, 0.075, 0.097] });
    H.add('accent', CYL, { p: [sx * 0.386, 0, 0], r: [0, 0, Math.PI / 2], s: [0.066, 0.022, 0.066] });
    H.add('glow', torus(0.08, 0.012, 32), { p: [sx * 0.384, 0, 0], r: [0, Math.PI / 2, 0] });
  }

  // --- arms (y = 0 at the shoulder, hanging down)
  const bulwark = id === 'bulwark';
  for (const [A, right] of [[P.armL, false], [P.armR, true]] as [Parts, boolean][]) {
    A.add('navy', SPH_MID, { s: 0.085 });
    if (!bulwark) {
      A.add('shell', HEMI, { p: [0, 0.008, 0], s: [0.118, 0.1, 0.118] });
      A.add('accent', torus(0.115, 0.012, 32), { p: [0, 0.008, 0], r: [Math.PI / 2, 0, 0] });
    }
    A.add('shell', capsule(0.058, 0.17), { p: [0, -0.17, 0] });
    A.add('navy', torus(0.058, 0.014, 28), { p: [0, -0.165, 0], r: [Math.PI / 2, 0, 0] }); // elbow seam
    A.add(right ? 'yellow' : 'accent', torus(0.06, 0.018, 28), { p: [0, -0.255, 0], r: [Math.PI / 2, 0, 0] });
    A.add('navy', SPH_MID, { p: [0, -0.34, 0], s: 0.092 });
  }

  // --- legs (y = 0 at the hip)
  const boot = bulwark ? 1.18 : 1;
  for (const L of [P.legL, P.legR]) {
    L.add('navy', capsule(0.062, 0.14), { p: [0, -0.12, 0] });
    L.add('shell', CYL, { p: [0, -0.215, 0.006], s: [0.07, 0.09, 0.075] }); // boot shaft
    L.add('navy', torus(0.07, 0.013, 28), { p: [0, -0.17, 0.006], r: [Math.PI / 2, 0, 0] });
    L.add('accent', ROUND_BOX, { p: [0, -0.215, 0.078], s: [0.03, 0.04, 0.014] });
    L.add('shell', SPH_MID, { p: [0, -0.285, 0.035], s: [0.105 * boot, 0.072 * boot, 0.155 * boot] });
    L.add('accent', SPH_MID, { p: [0, -0.32, 0.035], s: [0.108 * boot, 0.03, 0.16 * boot] });
  }

  // --- chassis identity
  if (id === 'scout') {
    // side sensor antenna, a small visor peak and calf fins: light and quick
    H.add('navy', CYL, { p: [-0.385, 0.165, -0.04], r: [0, 0, 0.25], s: [0.013, 0.2, 0.013] });
    H.add('glow', SPH_LO, { p: [-0.41, 0.27, -0.04], s: 0.03 });
    for (const L of [P.legL, P.legR]) L.add('secondary', extrude([[0, 0], [0.12, -0.03], [0.02, 0.1]], 0.016), { p: [0, -0.17, -0.06], r: [0, Math.PI / 2, -0.35] });
  } else if (bulwark) {
    // armoured shoulders and a reinforced waist
    for (const sx of [-1, 1]) {
      P.body.add('shell', SPH, { p: [sx * 0.4, 0.76, 0], s: [0.16, 0.11, 0.155] });
      P.body.add('secondary', torus(1, 0.05, 40), { p: [sx * 0.4, 0.765, 0], r: [Math.PI / 2, 0, 0], s: [0.162, 0.157, 0.4] });
      P.body.add('glow', SPH_LO, { p: [sx * 0.4, 0.875, 0.04], s: [0.03, 0.012, 0.06] });
    }
    T.add('navy', torus(0.205, 0.05, 48), { p: [0, 0.045, 0], r: [Math.PI / 2, 0, 0] });
  } else if (id === 'glider') {
    // swept wings on the back with glowing leading edges
    for (const sx of [-1, 1]) {
      const wing: [number, number][] = [[0, 0], [0, 0.12], [0.3, 0.27], [0.36, 0.27], [0.33, 0.21]].map(([x, y]) => [sx * x, y]);
      const stripe: [number, number][] = [[0.04, 0.07], [0.04, 0.1], [0.27, 0.215], [0.3, 0.2]].map(([x, y]) => [sx * x, y]);
      const edge: [number, number][] = [[0, 0.108], [0, 0.128], [0.3, 0.278], [0.36, 0.278], [0.36, 0.264], [0.3, 0.262]].map(([x, y]) => [sx * x, y]);
      const xf: Xf = { p: [sx * 0.07, 0.22, -0.245], r: [-0.3, sx * 0.7, sx * 0.55] };
      T.add('shell', extrude(wing, 0.016, 0.006), xf);
      T.add('secondary', extrude(stripe, 0.03, 0.002), xf);
      T.add('glow', extrude(edge, 0.024, 0.003), xf);
      // swept fins on the ear pods
      H.add('accent', extrude([[0, 0], [-0.17, 0.16], [-0.12, 0.17], [0.05, 0.05]], 0.02), { p: [sx * 0.385, 0.03, -0.02], r: [0, -Math.PI / 2, 0] });
    }
  }

  const geo: ChassisGeo = {
    dims: DIMS[id] ?? DIMS.all_rounder,
    groups: {
      body: P.body.build(),
      torso: P.torso.build(),
      head: P.head.build(),
      armL: P.armL.build(),
      armR: P.armR.build(),
      legL: P.legL.build(),
      legR: P.legR.build(),
    },
  };
  chassisCache.set(id, geo);
  return geo;
}

// ----------------------------------------------------------------------------- toppers

/** Head-top attachment height (head-local). */
const TOP_Y = SKULL[1];

interface TopperGeo {
  /** Static parts on the head. */
  fixed: Map<Slot, THREE.BufferGeometry>;
  /** Parts that animate, with their pivot (head-local). */
  moving: Map<Slot, THREE.BufferGeometry>;
  pivot: V3;
  kind: 'none' | 'wobble' | 'spin' | 'float';
  /** Height above the head centre the topper reaches (for markers above the robot). */
  height: number;
}

const topperCache = new Map<string, TopperGeo>();
const TOPPERS = new Set(['topper_antenna', 'topper_fin', 'topper_headset', 'topper_horns', 'topper_propeller', 'topper_halo', 'topper_crown']);

function topperGeo(id: string): TopperGeo | null {
  if (!TOPPERS.has(id)) return null;
  const hit = topperCache.get(id);
  if (hit) return hit;
  const F = new Parts();
  const M = new Parts();
  let pivot: V3 = [0, 0, 0];
  let kind: TopperGeo['kind'] = 'none';
  let height = TOP_Y;
  switch (id) {
    case 'topper_antenna': {
      // springy coil on a socket, a thin mast and a glowing bulb; the whole stalk wobbles from its base
      pivot = [0.0, TOP_Y - 0.01, -0.06];
      kind = 'wobble';
      F.add('navy', CYL, { p: pivot, s: [0.042, 0.04, 0.042] });
      F.add('metal', torus(0.042, 0.008, 24), { p: [pivot[0], pivot[1] + 0.02, pivot[2]], r: [Math.PI / 2, 0, 0] });
      const coil: THREE.Vector3[] = [];
      for (let i = 0; i <= 60; i++) {
        const t = i / 60;
        const a = t * Math.PI * 2 * 5;
        coil.push(new THREE.Vector3(Math.cos(a) * 0.022, 0.02 + t * 0.12, Math.sin(a) * 0.022));
      }
      M.add('metal', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), 60, 0.0065, 5, false));
      M.add('navy', CYL, { p: [0, 0.24, 0], s: [0.009, 0.17, 0.009] });
      M.add('glow', SPH, { p: [0, 0.34, 0], s: 0.042 });
      M.add('accent', torus(0.03, 0.009, 20), { p: [0, 0.3, 0], r: [Math.PI / 2, 0, 0] });
      height = pivot[1] + 0.38;
      break;
    }
    case 'topper_fin': {
      // swept racing fin along the crown with a glowing leading edge
      const fin: [number, number][] = [[0.17, 0], [0.05, 0.1], [-0.16, 0.19], [-0.27, 0.17], [-0.2, 0.05], [-0.22, -0.04]];
      F.add('secondary', extrude(fin, 0.03, 0.012), { p: [0, TOP_Y - 0.06, -0.02], r: [0, -Math.PI / 2, 0] });
      const edge: [number, number][] = [[0.18, 0.005], [0.05, 0.112], [-0.16, 0.204], [-0.165, 0.18], [0.04, 0.09], [0.16, -0.005]];
      F.add('glow', extrude(edge, 0.036, 0.004), { p: [0, TOP_Y - 0.06, -0.02], r: [0, -Math.PI / 2, 0] });
      height = TOP_Y + 0.15;
      break;
    }
    case 'topper_headset': {
      for (const sx of [-1, 1]) {
        F.add('navy', CYL, { p: [sx * 0.37, 0, 0], r: [0, 0, Math.PI / 2], s: [0.118, 0.07, 0.118] });
        F.add('accent', CYL, { p: [sx * 0.41, 0, 0], r: [0, 0, Math.PI / 2], s: [0.09, 0.02, 0.09] });
        F.add('glow', torus(0.1, 0.01, 32), { p: [sx * 0.408, 0, 0], r: [0, Math.PI / 2, 0] });
      }
      F.add('navy', torus(0.37, 0.026, 40, Math.PI), { p: [0, 0.02, -0.02], s: [1, 0.83, 1.4] });
      const stripe = torus(0.37, 0.014, 40, Math.PI * 0.5);
      stripe.rotateZ(Math.PI * 0.25);
      F.add('accent', stripe, { p: [0, 0.02, -0.02], s: [1.02, 0.85, 2.6] });
      const boom = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.4, -0.04, 0.05), new THREE.Vector3(-0.38, -0.2, 0.26), new THREE.Vector3(-0.15, -0.17, 0.34));
      F.add('metal', new THREE.TubeGeometry(boom, 20, 0.011, 6, false));
      F.add('navy', capsule(0.024, 0.04), { p: [-0.13, -0.168, 0.345], r: [0, 0, Math.PI / 2] });
      F.add('gem', SPH_LO, { p: [-0.098, -0.168, 0.35], s: 0.014 });
      height = TOP_Y + 0.06;
      break;
    }
    case 'topper_horns': {
      const bolt: [number, number][] = [[0, 0], [0.07, 0], [0.05, 0.08], [0.1, 0.08], [0.02, 0.25], [0.035, 0.12], [-0.015, 0.12]];
      for (const sx of [-1, 1]) {
        F.add('yellow', extrude(bolt.map(([x, y]) => [x - 0.035, y] as [number, number]), 0.035, 0.01), { p: [sx * 0.17, TOP_Y - 0.1, 0.02], r: [0, sx * 0.35, -sx * 0.38] });
        F.add('navy', CYL, { p: [sx * 0.16, TOP_Y - 0.075, 0.02], r: [0, 0, -sx * 0.38], s: [0.05, 0.04, 0.05] });
      }
      height = TOP_Y + 0.17;
      break;
    }
    case 'topper_propeller': {
      // four-panel beanie, a stem and a three-blade propeller that spins
      const cap = (phi: number) => new THREE.SphereGeometry(1, 10, 8, phi, Math.PI / 2, 0, Math.PI / 2.15);
      for (let i = 0; i < 4; i++) F.add(i % 2 ? 'accent' : 'secondary', cap((i * Math.PI) / 2), { p: [0, 0.02, -0.005], s: [SKULL[0] + 0.014, SKULL[1] + 0.014, SKULL[2] + 0.014] });
      F.add('navy', torus(1, 0.02, 48), { p: [0, 0.075, -0.005], r: [Math.PI / 2, 0, 0], s: [0.334, 0.293, 0.6] });
      F.add('navy', CYL, { p: [0, TOP_Y + 0.05, 0], s: [0.016, 0.08, 0.016] });
      pivot = [0, TOP_Y + 0.095, 0];
      kind = 'spin';
      M.add('yellow', SPH_LO, { s: [0.03, 0.022, 0.03] });
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const blade = SPH.clone();
        blade.scale(0.1, 0.009, 0.03);
        blade.rotateX(0.35);
        M.add(i === 0 ? 'gem' : 'yellow', blade, { p: [Math.cos(a) * 0.11, 0, Math.sin(a) * 0.11], r: [0, -a, 0] });
      }
      height = pivot[1] + 0.03;
      break;
    }
    case 'topper_halo': {
      pivot = [0, TOP_Y + 0.13, -0.01];
      kind = 'float';
      M.add('halo', torus(0.2, 0.026, 56), { r: [Math.PI / 2, 0, 0] });
      height = pivot[1] + 0.05;
      break;
    }
    case 'topper_crown': {
      // gold band with five points, ball finials and jewels; sits slightly tilted for swagger
      const band = new THREE.LatheGeometry([new THREE.Vector2(0.158, 0), new THREE.Vector2(0.176, 0), new THREE.Vector2(0.183, 0.075), new THREE.Vector2(0.165, 0.075), new THREE.Vector2(0.158, 0)], 36);
      const tilt: V3 = [-0.12, 0, 0.1];
      const base = TOP_Y - 0.04;
      const grp = new THREE.Object3D();
      grp.position.set(0, base, -0.01);
      grp.rotation.set(tilt[0], tilt[1], tilt[2]);
      grp.updateMatrix();
      const put = (slot: Slot, g: THREE.BufferGeometry, x: Xf) => {
        const local = g.clone();
        const s = x.s ?? 1;
        const p = x.p ?? [0, 0, 0];
        const r = x.r ?? [0, 0, 0];
        _m.compose(_p.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2])), typeof s === 'number' ? _s.setScalar(s) : _s.set(s[0], s[1], s[2]));
        local.applyMatrix4(_m);
        local.applyMatrix4(grp.matrix);
        F.add(slot, local);
      };
      put('gold', band, {});
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
        const x = Math.cos(a) * 0.172;
        const z = Math.sin(a) * 0.172;
        put('gold', new THREE.ConeGeometry(0.04, 0.09, 4), { p: [x, 0.115, z], r: [0, -a + Math.PI / 4, 0] });
        put('gold', SPH_LO, { p: [x, 0.168, z], s: 0.018 });
        const b = a + Math.PI / 5;
        put('gem', SPH_LO, { p: [Math.cos(b) * 0.18, 0.038, Math.sin(b) * 0.18], s: [0.02, 0.022, 0.02] });
      }
      height = TOP_Y + 0.15;
      break;
    }
  }
  const geo: TopperGeo = { fixed: F.build(), moving: M.build(), pivot, kind, height };
  topperCache.set(id, geo);
  return geo;
}

// ----------------------------------------------------------------------------- view

const tmpV = new THREE.Vector3();

export class RobotView {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private handR = new THREE.Object3D();
  private jersey: THREE.Mesh;
  private visor: THREE.Mesh;
  private flame: THREE.Mesh;
  private flameMat: THREE.MeshBasicMaterial;
  private jerseyMat: THREE.MeshStandardMaterial;
  private visorMat: THREE.MeshStandardMaterial;
  private mats: Record<Slot, THREE.Material>;
  private glowBase = new THREE.Color();
  private haloBase = new THREE.Color('#ffe7a3').multiplyScalar(2.2);
  private partMeshes: THREE.Mesh[] = [];
  private topper = new THREE.Group();
  private topperMover = new THREE.Group();
  private topperGlow: THREE.Mesh | null = null;
  private topperKind: TopperGeo['kind'] = 'none';
  private topperId = '';
  private chassisId: ChassisId | '' = '';
  private topperHeight = TOP_Y;
  private look!: RobotLook;
  private eyeColor = '#7ff3ff';
  private expression: Expression = 'neutral';
  private phase = Math.random() * 6;
  private time = Math.random() * 10;
  private air = 0;
  private roll = 0;
  private lastFacing = 0;
  private blinkIn = 2 + Math.random() * 3;
  private blink = 0;
  private hipY = HIP_Y;
  private yaw = 0;
  private thrust = 0;
  private lastVx = 0;
  private lastVz = 0;
  private wob = { x: 0, z: 0, vx: 0, vz: 0 };
  private spin = 0;
  private shadows: boolean;
  /** Extra scale applied by the menu stage. */
  scale = 1;

  constructor(look: RobotLook, shadows: boolean, quality: Quality = 'medium') {
    this.shadows = shadows;
    this.root.add(this.body);
    this.mats = RobotView.makeMaterials(quality);
    this.jerseyMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.62, metalness: 0 });
    this.visorMat =
      quality === 'low'
        ? new THREE.MeshStandardMaterial({ color: '#03060b', roughness: 0.18, metalness: 0.2, emissive: '#ffffff', emissiveIntensity: 1.25 })
        : new THREE.MeshPhysicalMaterial({ color: '#02050a', roughness: 0.22, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04, emissive: '#ffffff', emissiveIntensity: 1.3 });
    this.flameMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

    this.body.add(this.torso, this.head, this.armL, this.armR, this.legL, this.legR);
    this.torso.position.set(0, this.hipY - 0.03, 0);
    this.head.position.set(0, HEAD_Y, 0.01);
    this.jersey = new THREE.Mesh(TORSO_GEO, this.jerseyMat);
    this.jersey.castShadow = shadows;
    this.torso.add(this.jersey);
    this.visor = new THREE.Mesh(VISOR_GEO, this.visorMat);
    this.visor.scale.set(1.14, 0.93, 1.0);
    this.visor.position.set(0, 0.035, 0.012);
    this.head.add(this.visor);
    this.flame = new THREE.Mesh(FLAME_GEO, this.flameMat);
    this.flame.position.set(0, THR_Y - Math.cos(THRUSTER_TILT) * 0.1, THR_Z - Math.sin(THRUSTER_TILT) * 0.1);
    this.flame.rotation.x = THRUSTER_TILT;
    this.flame.renderOrder = 3;
    this.torso.add(this.flame);
    this.handR.position.set(0, -0.34, 0);
    this.armR.add(this.handR);
    this.head.add(this.topper);
    this.topper.add(this.topperMover);
    this.setLook(look);
  }

  private static makeMaterials(quality: Quality): Record<Slot, THREE.Material> {
    const phys = quality !== 'low';
    const high = quality === 'high';
    const gloss = (color: string, rough: number, metal: number, coat: number, extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}) =>
      phys && coat > 0
        ? new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: metal, clearcoat: coat, clearcoatRoughness: 0.1, ...extra })
        : new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...(extra as Partial<THREE.MeshStandardMaterialParameters>) });
    return {
      shell: gloss(WHITE, 0.36, 0.0, 1.0),
      navy: gloss(NAVY, 0.34, 0.45, high ? 0.6 : 0),
      accent: gloss('#12bcd2', 0.32, 0.1, high ? 0.7 : 0),
      secondary: gloss('#24395c', 0.34, 0.1, high ? 0.6 : 0),
      glow: new THREE.MeshBasicMaterial({ color: '#7ff3ff' }),
      yellow: gloss(TETHER_YELLOW, 0.32, 0.15, high ? 0.6 : 0, { emissive: new THREE.Color(TETHER_YELLOW), emissiveIntensity: 0.18 }),
      gold: gloss('#f4c44e', 0.24, 1.0, high ? 0.4 : 0),
      gem: new THREE.MeshStandardMaterial({ color: '#ff3d63', roughness: 0.15, metalness: 0.1, emissive: new THREE.Color('#ff2450'), emissiveIntensity: 0.9 }),
      metal: new THREE.MeshStandardMaterial({ color: '#b9c2cf', roughness: 0.28, metalness: 0.85 }),
      halo: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    };
  }

  /**
   * Gives every robot material an explicit environment map. Scenes without `scene.environment` (the low
   * quality tier) call this so the shells and metals still pick up reflections on the robots alone.
   */
  setEnvironment(env: THREE.Texture | null, intensity = 1): void {
    const all: THREE.Material[] = [...Object.values(this.mats), this.jerseyMat, this.visorMat];
    for (const m of all) {
      const s = m as THREE.MeshStandardMaterial;
      if (!s.isMeshStandardMaterial) continue;
      if (s.envMap !== env) {
        s.envMap = env;
        s.needsUpdate = true;
      }
      s.envMapIntensity = intensity;
    }
  }

  setLook(look: RobotLook): void {
    const prevLook = this.look;
    this.look = { ...look };
    const primary = look.primary;
    const accent = this.mats.accent as THREE.MeshStandardMaterial;
    accent.color.set(primary);
    accent.emissive.set(primary);
    accent.emissiveIntensity = 0.14;
    (this.mats.secondary as THREE.MeshStandardMaterial).color.set(look.secondary);
    // Glow parts: a light, saturated version of the club colour pushed above 1 so it reads as light.
    this.glowBase.set(shade(primary, 0.25)).multiplyScalar(1.7);
    (this.mats.glow as THREE.MeshBasicMaterial).color.copy(this.glowBase);
    this.flameMat.color.set(shade(primary, 0.2));
    this.eyeColor = shade(primary, 0.45);
    this.jerseyMat.map = jerseyTexture(look.pattern, primary, look.secondary, look.number);
    this.jerseyMat.needsUpdate = true;
    this.applyFace(true);

    if (this.chassisId !== look.chassis || !prevLook) this.buildChassis(look.chassis);
    const topper = look.topper ?? 'topper_none';
    if (this.topperId !== topper) this.buildTopper(topper);
  }

  private buildChassis(id: ChassisId): void {
    const geo = chassisGeo(id);
    this.chassisId = id;
    for (const m of this.partMeshes) m.removeFromParent();
    this.partMeshes.length = 0;
    const groups: Record<GroupName, THREE.Group> = { body: this.body, torso: this.torso, head: this.head, armL: this.armL, armR: this.armR, legL: this.legL, legR: this.legR };
    for (const name of Object.keys(groups) as GroupName[]) {
      for (const [slot, g] of geo.groups[name]) {
        const mesh = new THREE.Mesh(g, this.mats[slot]);
        mesh.castShadow = this.shadows && slot !== 'glow';
        groups[name].add(mesh);
        this.partMeshes.push(mesh);
      }
    }
    const d = geo.dims;
    this.torso.scale.set(d.torso[0], d.torso[1], d.torso[2]);
    this.head.scale.setScalar(d.head);
    this.armL.scale.setScalar(d.arm);
    this.armR.scale.setScalar(d.arm);
    this.armL.position.set(-d.shoulder, 0.7, 0);
    this.armR.position.set(d.shoulder, 0.7, 0);
    this.legL.scale.set(1, d.legY, 1);
    this.legR.scale.set(1, d.legY, 1);
    this.legL.position.set(-d.legSpread, this.hipY, 0);
    this.legR.position.set(d.legSpread, this.hipY, 0);
    // Longer / shorter legs raise or lower the whole body so feet stay on the ground.
    this.body.position.y = (d.legY - 1) * 0.33;
  }

  private buildTopper(id: string): void {
    this.topperId = id;
    // Topper geometry is cached and shared; only the meshes (and the per-robot glow sprite material) go.
    for (const c of [...this.topper.children]) if (c !== this.topperMover) c.removeFromParent();
    this.topperMover.clear();
    if (this.topperGlow) {
      (this.topperGlow.material as THREE.Material).dispose();
      this.topperGlow = null;
    }
    this.topperKind = 'none';
    this.topperHeight = TOP_Y;
    this.wob.x = this.wob.z = this.wob.vx = this.wob.vz = 0;
    const geo = topperGeo(id);
    if (!geo) return;
    for (const [slot, g] of geo.fixed) {
      const mesh = new THREE.Mesh(g, this.mats[slot]);
      mesh.castShadow = this.shadows && slot !== 'glow' && slot !== 'halo';
      this.topper.add(mesh);
    }
    this.topperMover.position.set(geo.pivot[0], geo.pivot[1], geo.pivot[2]);
    this.topperMover.rotation.set(0, 0, 0);
    for (const [slot, g] of geo.moving) {
      const mesh = new THREE.Mesh(g, this.mats[slot]);
      mesh.castShadow = this.shadows && slot !== 'glow' && slot !== 'halo';
      this.topperMover.add(mesh);
    }
    if (geo.kind === 'float') {
      const glow = new THREE.Mesh(
        HALO_SPRITE,
        new THREE.MeshBasicMaterial({ map: haloGlowTexture(), color: '#ffd76a', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      glow.rotation.x = -Math.PI / 2;
      glow.scale.setScalar(0.62);
      glow.renderOrder = 3;
      this.topperMover.add(glow);
      this.topperGlow = glow;
    }
    this.topperKind = geo.kind;
    this.topperHeight = geo.height;
  }

  /** Height of the top of the robot above its feet, in world units (includes the topper and scale). */
  get topHeight(): number {
    const d = DIMS[this.look.chassis] ?? DIMS.all_rounder;
    return (this.body.position.y + HEAD_Y + this.topperHeight * d.head + 0.04) * this.scale;
  }

  private applyFace(force = false): void {
    const exp: Expression = this.blink > 0 && (this.expression === 'neutral' || this.expression === 'focus') ? 'blink' : this.expression;
    const t = faceTexture(this.look.face, exp, this.eyeColor);
    if (force || this.visorMat.emissiveMap !== t) {
      this.visorMat.emissiveMap = t;
      this.visorMat.needsUpdate = true;
    }
  }

  setExpression(e: Expression): void {
    if (this.expression !== e) {
      this.expression = e;
      this.applyFace();
    }
  }

  /** World position of the tether hand (rope start). */
  handWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.handR.getWorldPosition(out);
  }

  /** Height the body is currently lifted off the ground (for shadow scaling). */
  get lift(): number {
    return this.air * this.scale;
  }

  update(dt: number, p: RobotPose): void {
    this.time += dt;
    const speed = Math.hypot(p.vx, p.vz);
    const stride = Math.min(1.25, speed / 5.2);
    const moving = speed > 0.35;
    if (moving) this.phase += dt * (5 + speed * 1.9);
    const swing = Math.sin(this.phase);
    const reduced = p.reduced;

    // blink
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blink = 0.12;
      this.blinkIn = 2.5 + Math.random() * 3.5;
      this.applyFace();
    } else if (this.blink > 0) {
      this.blink -= dt;
      if (this.blink <= 0) this.applyFace();
    }

    // yaw: face travel direction; during a kick turn toward the kick.
    let targetYaw = p.facing;
    if (p.kickAge < 0.22) targetYaw = p.kickDir;
    let d = targetYaw - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * 18);
    let turn = p.facing - this.lastFacing;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    this.lastFacing = p.facing;
    const turnRate = dt > 0 ? turn / dt : 0;

    const k = Math.min(1, dt * 10);
    const fast = speed > 6.3;
    const airTarget = reduced ? 0 : p.tethered ? 0.34 : fast ? 0.14 : 0;
    this.air += (airTarget - this.air) * k;

    let rollTarget = Math.max(-0.45, Math.min(0.45, -turnRate * 0.05 * Math.min(1, speed / 4)));
    let pitch = Math.min(0.45, speed * 0.04);
    let armLx = -swing * 0.75 * stride;
    let armRx = swing * 0.75 * stride;
    let armLz = -0.12;
    let armRz = 0.12;
    let legLx = swing * 0.95 * stride;
    let legRx = -swing * 0.95 * stride;
    let headX = 0;
    let headY = 0;
    let y = Math.abs(swing) * 0.05 * stride + this.air;
    let spin = 0;
    let thrustTarget = p.tethered ? 1 : Math.max(0, Math.min(1, (speed - 4.6) / 4.2));

    if (p.tethered) {
      // Lean away from the anchor, tether arm up along the rope, legs trailing.
      const dx = p.ax - p.x;
      const dz = p.az - p.z;
      const fx = Math.cos(p.facing);
      const fz = Math.sin(p.facing);
      const side = fx * dz - fz * dx > 0 ? 1 : -1; // anchor on the robot's right (+) or left (-)
      rollTarget = side * 0.5;
      pitch = 0.3;
      armRx = -2.5;
      armRz = side * 0.9 - 0.2;
      armLx = 0.5;
      armLz = -0.5;
      legLx = 0.55 + swing * 0.15;
      legRx = 0.3 - swing * 0.15;
    } else if (fast) {
      pitch = 0.55;
      armLx = 0.9;
      armRx = 0.9;
      armLz = -0.35;
      armRz = 0.35;
    }

    if (p.kickAge < 0.26) {
      const t = p.kickAge / 0.26;
      legRx = -1.5 * Math.sin(Math.PI * Math.min(1, t * 1.15));
      armLx = -0.8;
      armRx = 0.6;
      pitch = -0.12;
    }
    if (p.bumpAge < 0.3) {
      const t = 1 - p.bumpAge / 0.3;
      rollTarget += Math.sin(p.bumpAge * 40) * 0.25 * t;
      headX = -0.2 * t;
    }

    const t = this.time;
    if (p.mood === 'celebrate') {
      const cel = this.look.celebration;
      const hop = reduced ? 0 : Math.abs(Math.sin(t * 6.5)) * 0.28;
      y = hop;
      pitch = 0;
      rollTarget = 0;
      thrustTarget = reduced ? 0.3 : 0.35 + Math.max(0, Math.cos(t * 6.5)) * 0.5;
      if (cel === 'celebration_spin') {
        spin = reduced ? 0 : t * 7;
        armLx = armRx = -2.9;
        armLz = -0.5;
        armRz = 0.5;
      } else if (cel === 'celebration_jacks') {
        const s = (Math.sin(t * 9) + 1) / 2;
        armLx = armRx = 0;
        armLz = -0.4 - s * 2.2;
        armRz = 0.4 + s * 2.2;
        legLx = legRx = 0;
        this.legL.rotation.z = -s * 0.5;
        this.legR.rotation.z = s * 0.5;
      } else if (cel === 'celebration_dance') {
        const s = Math.sin(t * 7);
        rollTarget = s * 0.3;
        armLx = -1.4 + s * 0.6;
        armRx = -1.4 - s * 0.6;
        armLz = -0.6;
        armRz = 0.6;
        legLx = s * 0.35;
        legRx = -s * 0.35;
        y = Math.abs(s) * 0.1;
      } else {
        armLx = armRx = -2.7;
        armLz = -0.45 + Math.sin(t * 11) * 0.35;
        armRz = 0.45 - Math.sin(t * 11 + 1) * 0.35;
        legLx = legRx = 0;
      }
      headX = -0.18;
    } else if (p.mood === 'sad') {
      headX = 0.38;
      pitch = 0.16;
      armLx = armRx = 0.12;
      y = 0;
      thrustTarget = 0;
    } else if (p.mood === 'idle' || p.mood === 'ready') {
      const breathe = Math.sin(t * 2.1);
      y += reduced ? 0 : breathe * 0.012 + 0.012;
      armLx += breathe * 0.05;
      armRx -= breathe * 0.05;
      headY = Math.sin(t * 0.7) * 0.18;
      headX = Math.sin(t * 0.9 + 1) * 0.04;
      if (p.mood === 'ready') {
        // confident garage stance
        armLz = -0.55;
        armRz = 0.55;
        armLx = -0.35;
        armRx = -0.35;
        legLx = -0.12;
        legRx = 0.12;
        this.legL.rotation.z = -0.16;
        this.legR.rotation.z = 0.16;
      }
    }
    if (p.mood !== 'celebrate' && p.mood !== 'ready') {
      this.legL.rotation.z *= 0.8;
      this.legR.rotation.z *= 0.8;
    }

    this.roll += (rollTarget - this.roll) * k;
    const kk = Math.min(1, dt * 16);
    const b = this.body;
    b.rotation.x += (pitch - b.rotation.x) * kk;
    b.rotation.z = this.roll;
    this.armL.rotation.x += (armLx - this.armL.rotation.x) * kk;
    this.armR.rotation.x += (armRx - this.armR.rotation.x) * kk;
    this.armL.rotation.z += (armLz - this.armL.rotation.z) * kk;
    this.armR.rotation.z += (armRz - this.armR.rotation.z) * kk;
    this.legL.rotation.x += (legLx - this.legL.rotation.x) * kk;
    this.legR.rotation.x += (legRx - this.legR.rotation.x) * kk;
    this.head.rotation.x += (headX - this.head.rotation.x) * kk;
    this.head.rotation.y += (headY - this.head.rotation.y) * kk;

    this.root.position.set(p.x, y * this.scale, p.z);
    this.root.rotation.y = Math.PI / 2 - this.yaw + spin;
    this.root.scale.setScalar(this.scale);

    this.animateLights(dt, t, thrustTarget, reduced);
    this.animateTopper(dt, t, p, speed, reduced);
  }

  /** Thruster flames, light belt and ear rings. */
  private animateLights(dt: number, t: number, thrustTarget: number, reduced: boolean): void {
    this.thrust += (thrustTarget - this.thrust) * Math.min(1, dt * (thrustTarget > this.thrust ? 9 : 4));
    const th = this.thrust;
    const flick = reduced ? 1 : 0.86 + 0.14 * Math.sin(t * 53 + this.phase) * Math.sin(t * 31);
    this.flame.scale.set(1, 0.035 + th * 0.4 * flick, 1);
    this.flameMat.opacity = 0.32 + 0.68 * th;
    const pulse = reduced ? 1 : 1 + Math.sin(t * 2.4) * 0.1;
    (this.mats.glow as THREE.MeshBasicMaterial).color.copy(this.glowBase).multiplyScalar(pulse + th * 0.35);
  }

  private animateTopper(dt: number, t: number, p: RobotPose, speed: number, reduced: boolean): void {
    const kind = this.topperKind;
    if (kind === 'none') return;
    const mv = this.topperMover;
    if (kind === 'wobble') {
      // Spring antenna: driven by the robot's acceleration in its own frame (lags behind starts and turns).
      const step = Math.min(dt, 1 / 30);
      const ax = step > 0 ? (p.vx - this.lastVx) / Math.max(dt, 1e-4) : 0;
      const az = step > 0 ? (p.vz - this.lastVz) / Math.max(dt, 1e-4) : 0;
      this.lastVx = p.vx;
      this.lastVz = p.vz;
      const c = Math.cos(this.yaw);
      const s = Math.sin(this.yaw);
      const fwd = Math.max(-40, Math.min(40, ax * c + az * s));
      const side = Math.max(-40, Math.min(40, -ax * s + az * c));
      const w = this.wob;
      const drive = reduced ? 0 : 1;
      const idle = reduced ? 0 : Math.sin(t * 3.1) * 0.6;
      w.vx += (-w.x * 140 - w.vx * 7 - fwd * 0.05 * drive) * step;
      w.vz += (-w.z * 140 - w.vz * 7 + side * 0.05 * drive + idle * 0.2) * step;
      w.x = Math.max(-0.6, Math.min(0.6, w.x + w.vx * step));
      w.z = Math.max(-0.6, Math.min(0.6, w.z + w.vz * step));
      mv.rotation.x = w.x - speed * 0.02;
      mv.rotation.z = w.z;
    } else if (kind === 'spin') {
      const rate = reduced ? 1.5 : 5 + this.thrust * 28 + speed * 0.8;
      this.spin = (this.spin + rate * dt) % (Math.PI * 2);
      mv.rotation.y = this.spin;
    } else if (kind === 'float') {
      const geo = topperGeo(this.topperId);
      const baseY = geo ? geo.pivot[1] : TOP_Y + 0.13;
      mv.position.y = baseY + (reduced ? 0 : Math.sin(t * 2.2) * 0.022);
      mv.rotation.x = reduced ? 0 : Math.sin(t * 1.3) * 0.08;
      mv.rotation.z = reduced ? 0 : Math.cos(t * 1.1) * 0.08;
      const glow = reduced ? 1 : 0.88 + Math.sin(t * 3.3) * 0.12;
      (this.mats.halo as THREE.MeshBasicMaterial).color.copy(this.haloBase).multiplyScalar(glow);
    }
  }

  dispose(): void {
    // Geometry is shared through the chassis / topper caches; materials belong to this robot.
    for (const m of Object.values(this.mats)) m.dispose();
    this.jerseyMat.dispose();
    this.visorMat.dispose();
    this.flameMat.dispose();
    if (this.topperGlow) (this.topperGlow.material as THREE.Material).dispose();
  }
}

const VISOR_GEO = new THREE.SphereGeometry(0.312, 36, 12, Math.PI / 2 - 1.0, 2.0, 1.08, 0.86);
const HALO_SPRITE = new THREE.PlaneGeometry(1, 1);

export function setShadowFlags(obj: THREE.Object3D, cast: boolean, receive: boolean): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = cast;
      m.receiveShadow = receive;
    }
  });
}

export { tmpV };
