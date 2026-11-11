import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RobotLook } from '../../content/cosmetics';
import type { Quality } from './arenaView';
import { faceTexture, jerseyTexture, luminance, shade, type Expression } from './textures';

/**
 * Procedural robot: rounded clear-coat white shell, navy joints, a dark glass face screen with glowing eyes,
 * the club jersey with its number, a glowing team-colour belt and ear lights, and back thrusters that flare
 * when the robot runs fast or swings. Optional head toppers come from the look.
 *
 * The four chassis are one family (same skull, face screen, materials and collision footprint) told apart by
 * silhouette and a few signature parts that survive at match-camera size:
 *  - All-Rounder: the balanced classic. One crown stripe, round shoulder caps, a twin-nozzle jet pack.
 *  - Scout: lean and long-legged. Twin racing stripes, a visor peak, one ear antenna, slim twin boosters,
 *    heel fins; leans forward.
 *  - Bulwark: stocky and armoured. A broad helmet band, square ear blocks, a jaw guard, club-colour pauldrons,
 *    a chest bumper with running lights, heavy boots and one big thruster; stands low and wide.
 *  - Glider: aerodynamic. An arrowhead helmet graphic, swept ear fins and an aero tail, back wings with lit
 *    leading edges, a teardrop torso and pointed boots; arms swept back.
 *
 * Static parts are merged per material inside each moving group (body, torso, head, arms, legs), so a robot
 * costs about twenty-five draw calls whatever its detail. Merged geometry is cached per chassis and per
 * topper and shared by every robot. All animation is presentation only; the simulation body is a circle and
 * never reads this.
 */
export type RobotMood = 'play' | 'celebrate' | 'sad' | 'idle' | 'ready';

export interface RobotPose {
  x: number;
  z: number;
  facing: number;
  vx: number;
  vz: number;
  tethered: boolean;
  /** World position of the anchor while tethered (`ay`: rope attachment height, default ANCHOR_Y). */
  ax: number;
  az: number;
  ay?: number;
  /** Seconds since the last deliberate kick / bump (large when none). */
  kickAge: number;
  kickDir: number;
  bumpAge: number;
  /** Seconds since this robot was nutmegged (undefined or above 1: none): plays a short wrong-footed reaction. */
  megAge?: number;
  mood: RobotMood;
  reduced: boolean;
}

/** Typical anchor head height in world units, used to aim the rope arm when the pose gives none. */
const ANCHOR_Y = 2.6;
/** Length of the nutmeg reaction (s). */
const MEG_TIME = 0.7;

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
  private solid = new Set<Slot>();

  /** `trim`: surface decoration (rings, stripes, inlays) that adds nothing to the shadow silhouette. */
  add(slot: Slot, g: THREE.BufferGeometry, x: Xf = {}, trim = false): this {
    const c = g.clone();
    const s = x.s ?? 1;
    const p = x.p ?? [0, 0, 0];
    const r = x.r ?? [0, 0, 0];
    _m.compose(_p.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2])), typeof s === 'number' ? _s.setScalar(s) : _s.set(s[0], s[1], s[2]));
    c.applyMatrix4(_m);
    let list = this.lists.get(slot);
    if (!list) this.lists.set(slot, (list = []));
    list.push(c);
    if (!trim) this.solid.add(slot);
    return this;
  }

  /** Slots whose parts are all surface trim. */
  trimSlots(): Set<Slot> {
    const out = new Set<Slot>();
    for (const slot of this.lists.keys()) if (!this.solid.has(slot)) out.add(slot);
    return out;
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
/** Tiny parts: thumbs, lamps, studs. */
const SPH_XS = new THREE.SphereGeometry(1, 10, 7);
/** Mid-detail sphere for joints, hands and boots (small on screen). */
const SPH_MID = new THREE.SphereGeometry(1, 22, 14);
const HEMI = new THREE.SphereGeometry(1, 24, 9, 0, Math.PI * 2, 0, Math.PI / 2);
/** Cap of the unit sphere round +z: scaled like a boot (plus a hair) it is a toe cap with a clean edge. */
const TOE_CAP = (() => {
  const g = new THREE.SphereGeometry(1, 16, 5, 0, Math.PI * 2, 0, 1.0);
  g.rotateX(Math.PI / 2);
  return g;
})();
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

/**
 * Proportions and stance of one chassis. The four share one skeleton, head and collision footprint (plan
 * width stays within about 8% of the All-Rounder); each has its own silhouette, signature parts and posture.
 */
interface ChassisDims {
  /** Head scale and height of the head centre in body space. */
  head: number;
  headY: number;
  /** Arm scale and shoulder joint position. */
  arm: number;
  shoulder: number;
  shoulderY: number;
  legSpread: number;
  /** Extra leg length (negative: shorter legs); the body rides this much higher so the boots stay grounded. */
  drop: number;
  /** Stance: constant forward lean, how far the arms hang out / back, outward leg splay. */
  lean: number;
  armOut: number;
  armBack: number;
  legSplay: number;
  /** Running: forward lean and bounce relative to the All-Rounder. */
  runLean: number;
  hop: number;
  /** Peak leg swing of a kick and the deepest forward nod (rad) that keeps the chassis clear of itself. */
  kick: number;
  nod: number;
}

const DIMS: Record<ChassisId, ChassisDims> = {
  all_rounder: { head: 1, headY: 1.02, arm: 1, shoulder: 0.315, shoulderY: 0.7, legSpread: 0.125, drop: 0, lean: 0, armOut: 0.12, armBack: 0, legSplay: 0, runLean: 1, hop: 1, kick: 1.4, nod: 0.38 },
  scout: { head: 0.94, headY: 0.992, arm: 0.95, shoulder: 0.29, shoulderY: 0.688, legSpread: 0.115, drop: 0.08, lean: 0.07, armOut: 0.17, armBack: 0.14, legSplay: 0, runLean: 1.2, hop: 1.15, kick: 1.45, nod: 0.38 },
  bulwark: { head: 1.04, headY: 1.015, arm: 1.12, shoulder: 0.34, shoulderY: 0.69, legSpread: 0.15, drop: -0.05, lean: -0.02, armOut: 0.06, armBack: -0.1, legSplay: 0.05, runLean: 0.8, hop: 0.75, kick: 1.2, nod: 0.24 },
  glider: { head: 0.98, headY: 1.02, arm: 0.97, shoulder: 0.305, shoulderY: 0.705, legSpread: 0.12, drop: 0, lean: 0.035, armOut: 0.2, armBack: 0.15, legSplay: 0, runLean: 1.15, hop: 0.9, kick: 1.4, nod: 0.38 },
};

/** Jersey torso: lathe profile [radius, height] from hem to neck, cross-section squareness (2 = round), depth. */
interface TorsoSpec {
  profile: [number, number][];
  sq: number;
  depth: number;
  belt: [number, number];
  collar: [number, number];
  pelvis: V3;
}

const TORSO: Record<ChassisId, TorsoSpec> = {
  // the balanced classic: a rounded barrel
  all_rounder: {
    profile: [[0.15, 0], [0.205, 0.035], [0.245, 0.13], [0.272, 0.25], [0.266, 0.34], [0.215, 0.41], [0.12, 0.445], [0.001, 0.455]],
    sq: 2, depth: 1, belt: [0.19, 0.042], collar: [0.122, 0.04], pelvis: [0.162, 0.08, 0.128],
  },
  // lean and short in the body: narrow waist, high chest
  scout: {
    profile: [[0.128, 0], [0.172, 0.033], [0.204, 0.12], [0.236, 0.24], [0.238, 0.32], [0.2, 0.385], [0.115, 0.42], [0.001, 0.43]],
    sq: 2, depth: 0.93, belt: [0.158, 0.036], collar: [0.114, 0.038], pelvis: [0.15, 0.076, 0.12],
  },
  // stocky and square-shouldered: a boxier section with a thick belt
  bulwark: {
    profile: [[0.185, 0], [0.238, 0.035], [0.262, 0.12], [0.27, 0.25], [0.262, 0.345], [0.212, 0.412], [0.125, 0.446], [0.001, 0.455]],
    sq: 3.2, depth: 0.98, belt: [0.222, 0.05], collar: [0.132, 0.046], pelvis: [0.2, 0.086, 0.15],
  },
  // teardrop: full chest tapering hard to a narrow waist
  glider: {
    profile: [[0.122, 0], [0.162, 0.035], [0.2, 0.12], [0.25, 0.255], [0.26, 0.345], [0.214, 0.412], [0.12, 0.446], [0.001, 0.455]],
    sq: 2, depth: 0.94, belt: [0.15, 0.036], collar: [0.118, 0.04], pelvis: [0.15, 0.076, 0.12],
  },
};

const HIP_Y = 0.36;
/** Hip joint to the sole of the boot (before `drop`). */
const LEG_LEN = 0.357;
const BELT_Y = 0.028;
/** Skull ellipsoid radii (the head sphere is 0.3 scaled 1.14 / 0.93 / 1). */
const SKULL: V3 = [0.342, 0.279, 0.3];

interface ChassisGeo {
  dims: ChassisDims;
  groups: Record<GroupName, Map<Slot, THREE.BufferGeometry>>;
  /** Per group: slots made only of surface trim, which add nothing to the shadow silhouette. */
  trim: Record<GroupName, Set<Slot>>;
  /** Jersey shell (textured), rank belt and thruster flames fitted to this chassis. */
  jersey: THREE.BufferGeometry;
  rankBelt: THREE.BufferGeometry;
  flame: THREE.BufferGeometry;
  /** Flame origin and tilt in torso space. */
  jet: { y: number; z: number; tilt: number };
}

const chassisCache = new Map<ChassisId, ChassisGeo>();

const WHITE_C = new THREE.Color('#ffffff');

/**
 * Trim (accent slot) colour: the club colour, unless it is so light it would vanish against the white shell
 * (Ivory, Chrome...): then the secondary colour if that one shows, else a deeper shade of the primary.
 */
export function trimColor(primary: string, secondary: string): string {
  if (!washedOut(primary)) return primary;
  if (!washedOut(secondary)) return secondary;
  return shade(primary, -0.45);
}

/** True for colours that barely show against the white shell: very light, or light and nearly grey. */
function washedOut(hex: string): boolean {
  const l = luminance(hex);
  return l > 0.62 || (chroma(hex) < 0.1 && l > 0.3);
}

/** Colourfulness of a hex colour in sRGB (max - min channel, 0..1). */
function chroma(hex: string): number {
  const r = { r: 0, g: 0, b: 0 };
  new THREE.Color(hex).getRGB(r, THREE.SRGBColorSpace);
  return Math.max(r.r, r.g, r.b) - Math.min(r.r, r.g, r.b);
}

/** Bright, saturated light colour of the club hue for eyes and light strips (greys give a cool white). */
export function vividColor(hex: string): string {
  if (chroma(hex) < 0.1) return '#cdeeff';
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl, THREE.SRGBColorSpace);
  c.setHSL(hsl.h, Math.max(0.75, hsl.s), 0.62, THREE.SRGBColorSpace);
  return '#' + c.getHexString(THREE.SRGBColorSpace);
}

/**
 * Patch of the unit sphere used for inlaid helmet graphics. `map` takes (s, t) in 0..1 to (a, b): `a` is the
 * angle from the crown toward the face (negative down the back of the head), `b` the angle off the centre
 * line toward +x. Scaled by the skull radii (plus a hair) it is a panel of the skull surface itself.
 */
function skullPatch(map: (s: number, t: number) => [number, number], segS: number, segT: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segS; i++) {
    for (let j = 0; j <= segT; j++) {
      const [a, b] = map(i / segS, j / segT);
      pos.push(Math.sin(b), Math.cos(b) * Math.cos(a), Math.cos(b) * Math.sin(a));
      uv.push(j / segT, i / segS);
    }
  }
  // wind the triangles to face outward whichever way the map runs
  const w = segT + 1;
  const mid = (Math.floor(segS / 2) * w + Math.floor(segT / 2)) * 3;
  const e1 = new THREE.Vector3(pos[mid + 3] - pos[mid], pos[mid + 4] - pos[mid + 1], pos[mid + 5] - pos[mid + 2]);
  const e2 = new THREE.Vector3(pos[mid + w * 3] - pos[mid], pos[mid + w * 3 + 1] - pos[mid + 1], pos[mid + w * 3 + 2] - pos[mid + 2]);
  const outward = e1.cross(e2).dot(new THREE.Vector3(pos[mid], pos[mid + 1], pos[mid + 2])) > 0;
  for (let i = 0; i < segS; i++) {
    for (let j = 0; j < segT; j++) {
      const p = i * w + j;
      if (outward) idx.push(p, p + 1, p + w, p + 1, p + w + 1, p + w);
      else idx.push(p, p + w, p + 1, p + 1, p + w, p + w + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.slice(), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Front edge of the helmet graphics (tucked under the visor rim) and back edge (at the chin seam). */
const STRIPE_FRONT = 0.86;
const STRIPE_BACK = -2.07;

/**
 * Stripe from the brow over the crown to the nape between lateral angles `b0` and `b1` (which may vary along
 * it: s = 0 at the nape, 1 at the brow). Its ends follow lines of constant height, so wide and offset stripes
 * still meet the visor rim and the chin seam squarely. `from` / `to` trim the run (0..1).
 */
function crownStripe(b0: (s: number) => number, b1: (s: number) => number, from = 0, to = 1, segS = 40, segT = 2): THREE.BufferGeometry {
  return skullPatch((s, t) => {
    const u = from + (to - from) * s;
    const b = b0(u) + (b1(u) - b0(u)) * t;
    const cb = Math.max(0.2, Math.cos(b));
    const aF = Math.acos(Math.min(1, Math.cos(STRIPE_FRONT) / cb));
    const aB = -Math.acos(Math.max(-1, Math.cos(STRIPE_BACK) / cb));
    return [aB + (aF - aB) * u, b];
  }, segS, segT);
}

/** Recomputes smooth normals and welds them across coincident vertices (lathe / torus seams stay invisible). */
function smoothNormals(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.computeVertexNormals();
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const sums = new Map<string, [number, number, number]>();
  const key = (i: number) => `${Math.round(pos.getX(i) * 2e4)},${Math.round(pos.getY(i) * 2e4)},${Math.round(pos.getZ(i) * 2e4)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    const s = sums.get(k);
    if (s) {
      s[0] += nor.getX(i);
      s[1] += nor.getY(i);
      s[2] += nor.getZ(i);
    } else sums.set(k, [nor.getX(i), nor.getY(i), nor.getZ(i)]);
  }
  for (let i = 0; i < pos.count; i++) {
    const s = sums.get(key(i))!;
    const l = Math.hypot(s[0], s[1], s[2]) || 1;
    nor.setXYZ(i, s[0] / l, s[1] / l, s[2] / l);
  }
  return g;
}

/** Superellipse factor for a squarer cross-section: 1 on the axes, fuller toward the corners (n = 2 is round). */
function squareK(x: number, z: number, n: number): number {
  const r = Math.hypot(x, z);
  if (n === 2 || r < 1e-6) return 1;
  return Math.pow(Math.pow(Math.abs(x) / r, n) + Math.pow(Math.abs(z) / r, n), -1 / n);
}

/** Reshapes geometry built round the torso axis to the chassis' cross-section (squareness, depth). */
function shapeRound(g: THREE.BufferGeometry, n: number, depth: number): THREE.BufferGeometry {
  if (n === 2 && depth === 1) return g;
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const k = squareK(x, z, n);
    pos.setXYZ(i, x * k, pos.getY(i), z * k * depth);
  }
  return smoothNormals(g);
}

/**
 * Planar part laid out in (u, v) and placed with an explicit basis: u along `span`, v along `chord` (made
 * perpendicular to span), extruded `depth` along their normal, origin at `at`.
 */
function placedExtrude(points: [number, number][], depth: number, bevel: number, at: V3, span: V3, chord: V3): THREE.BufferGeometry {
  const g = extrude(points, depth, bevel);
  const S = new THREE.Vector3(...span).normalize();
  const C = new THREE.Vector3(...chord);
  C.addScaledVector(S, -C.dot(S)).normalize();
  const N = new THREE.Vector3().crossVectors(S, C);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(S, C, N).setPosition(at[0], at[1], at[2]));
  return g;
}

/** Capsule between two points. */
function rod(r: number, a: THREE.Vector3, b: THREE.Vector3): THREE.BufferGeometry {
  const d = b.clone().sub(a);
  const g = new THREE.CapsuleGeometry(r, d.length(), 3, 8);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

/** Thruster tilt: nozzles point down and back. */
const JET_TILT = 0.45;

/**
 * Thruster flames for nozzles at the given x offsets: per nozzle an outer team-colour cone, a white-hot core
 * and a nozzle disc; vertex colours fade to the tip. `r` is the nozzle radius (0.05 on the All-Rounder).
 */
const flameCache = new Map<string, THREE.BufferGeometry>();
function flameGeo(xs: number[], r: number): THREE.BufferGeometry {
  const key = `${xs.join(',')}|${r}`;
  const hit = flameCache.get(key);
  if (hit) return hit;
  const k = r / 0.05;
  const parts: THREE.BufferGeometry[] = [];
  const colorize = (g: THREE.BufferGeometry, base: number, len: number) => {
    const pos = g.attributes.position;
    const c = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const t = len > 0 ? Math.max(0, Math.min(1, -pos.getY(i) / len)) : 0;
      const v = base * (1 - t) * (1 - t);
      c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = v;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  };
  for (const x of xs) {
    const outer = new THREE.ConeGeometry(0.05 * k, 1, 14, 3, true);
    outer.rotateX(Math.PI);
    outer.translate(x, -0.5, 0);
    parts.push(colorize(outer, 1.1, 1));
    const core = new THREE.ConeGeometry(0.026 * k, 0.6, 10, 2, true);
    core.rotateX(Math.PI);
    core.translate(x, -0.3, 0);
    parts.push(colorize(core, 2.6, 0.6));
    const disc = new THREE.CircleGeometry(0.04 * k, 16);
    disc.rotateX(Math.PI / 2);
    disc.translate(x, -0.002, 0);
    parts.push(colorize(disc, 2.2, 0));
  }
  const norm = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of norm) for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'color') g.deleteAttribute(name);
  const geo = mergeGeometries(norm, false)!;
  flameCache.set(key, geo);
  return geo;
}

/** Regular-ish octagon outline (half extents and corner chamfer) for armour blocks. */
function octagon(hw: number, hh: number, c: number): [number, number][] {
  return [[-hw + c, -hh], [hw - c, -hh], [hw, -hh + c], [hw, hh - c], [hw - c, hh], [-hw + c, hh], [-hw, hh - c], [-hw, -hh + c]];
}

// --- torso: jersey, collar, belt, jet pack and the chassis' back / chest signature

function buildTorso(id: ChassisId, T: Parts, B: Parts): Pick<ChassisGeo, 'jersey' | 'rankBelt' | 'flame' | 'jet'> {
  const spec = TORSO[id];
  const pts = new THREE.SplineCurve(spec.profile.map(([r, y]) => new THREE.Vector2(r, y))).getPoints(18);
  const H = spec.profile[spec.profile.length - 1][1];
  // Jersey: a smooth lathe whose v coordinate follows height so the number sits mid-chest.
  const jersey = new THREE.LatheGeometry(pts, 36, Math.PI, Math.PI * 2);
  {
    const pos = jersey.attributes.position;
    const uv = jersey.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setY(i, Math.max(0, Math.min(1, pos.getY(i) / H)));
  }
  shapeRound(jersey, spec.sq, spec.depth);
  jersey.computeBoundingSphere();
  /** Jersey radius on the axes at height y. */
  const rAt = (y: number): number => {
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].y >= y) {
        const a = pts[i - 1];
        const b = pts[i];
        return b.y - a.y < 1e-6 ? b.x : a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y);
      }
    }
    return pts[pts.length - 1].x;
  };
  const back = (y: number) => -rAt(y) * spec.depth;
  const front = (y: number) => rAt(y) * spec.depth;
  const ring = (R: number, tube: number, seg: number, tubeSeg = 6) => {
    const g = new THREE.TorusGeometry(R, tube, tubeSeg, seg);
    g.rotateX(Math.PI / 2);
    return shapeRound(g, spec.sq, spec.depth);
  };

  // pelvis (body group, under the hem) and neck
  B.add('navy', SPH_LO, { p: [0, HIP_Y, 0], s: spec.pelvis });
  T.add('navy', SPH_LO, { p: [0, H + 0.015, 0], s: [0.094, 0.06, 0.094] });
  const [collarR, collarTube] = spec.collar;
  T.add('navy', ring(collarR, collarTube, 28), { p: [0, H - 0.025, 0] });
  const [beltR, beltTube] = spec.belt;
  T.add('navy', ring(beltR, beltTube, 32), { p: [0, BELT_Y, 0] });
  T.add('glow', ring(beltR + beltTube, 0.009, 40, 5), { p: [0, BELT_Y, 0] }, true);
  const rankBelt = ring(beltR + 0.004, beltTube + 0.005, 44, 8);
  rankBelt.translate(0, BELT_Y, 0);
  rankBelt.computeBoundingSphere();

  // Thrusters: nozzle bells along the tilted jet axis; the flame starts at their mouths.
  const ay = Math.cos(JET_TILT);
  const az = Math.sin(JET_TILT);
  const jets = (xs: number[], y: number, z: number, r: number): Pick<ChassisGeo, 'flame' | 'jet'> => {
    const k = r / 0.05;
    for (const x of xs) T.add('navy', new THREE.CylinderGeometry(0.04 * k, 0.056 * k, 0.085 * k, 16), { p: [x, y - ay * 0.058 * k, z - az * 0.058 * k], r: [JET_TILT, 0, 0] });
    return { flame: flameGeo(xs, r), jet: { y: y - ay * 0.1 * k, z: z - az * 0.1 * k, tilt: JET_TILT } };
  };
  let out: Pick<ChassisGeo, 'flame' | 'jet'>;

  if (id === 'scout') {
    // Twin slim boosters on a yoke: light and quick.
    const zb = back(0.135) - 0.028;
    T.add('navy', SPH_LO, { p: [0, 0.15, zb + 0.03], s: [0.12, 0.05, 0.045] });
    for (const sx of [-1, 1]) {
      const at = (d: number): V3 => [sx * 0.074, 0.135 + ay * d, zb + az * d];
      T.add('shell', capsule(0.046, 0.1), { p: at(0.03), r: [JET_TILT, 0, 0] });
      T.add('accent', torus(0.047, 0.011, 20), { p: at(0.065), r: [JET_TILT + Math.PI / 2, 0, 0] }, true);
    }
    out = jets([-0.074, 0.074], 0.135 - ay * 0.045, zb - az * 0.045, 0.04);
  } else if (id === 'bulwark') {
    // One heavy thruster in a broad armoured housing.
    const zb = back(0.16);
    T.add('shell', SPH, { p: [0, 0.14, zb + 0.022], r: [JET_TILT * 0.5, 0, 0], s: [0.215, 0.105, 0.1] });
    for (const sx of [-1, 1]) T.add('accent', ROUND_BOX, { p: [sx * 0.135, 0.145, zb - 0.052], r: [JET_TILT * 0.5, 0, sx * 0.25], s: [0.04, 0.038, 0.03] }, true);
    T.add('navy', torus(0.064, 0.018, 24), { p: [0, 0.105 - ay * 0.012, zb - 0.036 - az * 0.012], r: [JET_TILT + Math.PI / 2, 0, 0] });
    out = jets([0], 0.105, zb - 0.036, 0.076);
    // Front bumper with two running lights, below the number.
    const zf = front(0.105);
    T.add('shell', capsule(0.036, 0.25), { p: [0, 0.105, zf + 0.012], r: [0, 0, Math.PI / 2] });
    for (const sx of [-1, 1]) {
      T.add('glow', SPH_XS, { p: [sx * 0.095, 0.105, zf + 0.044], s: [0.032, 0.02, 0.012] }, true);
      T.add('navy', SPH_XS, { p: [sx * 0.168, 0.105, zf + 0.004], s: [0.03, 0.044, 0.044] });
    }
  } else if (id === 'glider') {
    // Slim spine pack carrying swept wings in a shallow V, below the back number and clear of the arms.
    const zb = back(0.17);
    T.add('shell', SPH, { p: [0, 0.17, zb + 0.012], r: [JET_TILT * 0.5, 0, 0], s: [0.13, 0.115, 0.075] });
    T.add('accent', torus(1, 0.03, 32), { p: [0, 0.17, zb + 0.012], r: [JET_TILT * 0.5 + Math.PI / 2, 0, 0], s: [0.13, 0.066, 0.6] }, true);
    out = jets([-0.078, 0.078], 0.108, zb - 0.036, 0.044);
    // Each wing is laid out in its own plane: u runs out along the span, v back along the chord (both wings
    // share one outline: with a right-handed basis per side they come out mirror images).
    for (const sx of [-1, 1]) {
      const at: V3 = [sx * 0.085, 0.215, zb + 0.03];
      const span: V3 = [sx * 0.86, 0.45, -0.24];
      const chord: V3 = [0, -0.3, -1];
      T.add('shell', placedExtrude([[0, -0.02], [0.2, 0.012], [0.33, 0.062], [0.345, 0.1], [0.3, 0.118], [0.15, 0.15], [0, 0.19]], 0.022, 0.007, at, span, chord));
      T.add('accent', placedExtrude([[0.04, 0.062], [0.19, 0.06], [0.3, 0.085], [0.28, 0.105], [0.14, 0.132], [0.04, 0.15]], 0.036, 0.002, at, span, chord), {}, true);
      const S = new THREE.Vector3(...span).normalize();
      const C = new THREE.Vector3(...chord);
      C.addScaledVector(S, -C.dot(S)).normalize();
      const O = new THREE.Vector3(...at);
      const pt = (u: number, v: number) => O.clone().addScaledVector(S, u).addScaledVector(C, v);
      T.add('glow', rod(0.011, pt(0.03, -0.012), pt(0.2, 0.014)), {}, true);
      T.add('glow', rod(0.011, pt(0.2, 0.014), pt(0.325, 0.062)), {}, true);
    }
  } else {
    // Compact jet pack: a moulded shell with a trim ring and two nozzles.
    const zb = back(0.14);
    T.add('shell', SPH, { p: [0, 0.14, zb + 0.013], r: [JET_TILT * 0.5, 0, 0], s: [0.2, 0.105, 0.085] });
    T.add('accent', torus(1, 0.02, 36), { p: [0, 0.14, zb + 0.013], r: [JET_TILT * 0.5 + Math.PI / 2, 0, 0], s: [0.2, 0.085, 1] }, true);
    out = jets([-0.1, 0.1], 0.115, zb - 0.042, 0.05);
  }
  return { jersey, rankBelt, ...out };
}

// --- head: one skull, visor and ear pods for the whole family; helmet graphics and fittings per chassis

function buildHead(id: ChassisId, H: Parts): void {
  const skin = (g: THREE.BufferGeometry, lift = 1.012): [THREE.BufferGeometry, Xf] => [g, { s: [SKULL[0] * lift, SKULL[1] * lift, SKULL[2] * lift] }];
  H.add('shell', SPH, { s: [SKULL[0], SKULL[1], SKULL[2]] });
  // navy rim around the face screen: a clear lip proud of the skull (no near-coincident surfaces)
  H.add('navy', new THREE.SphereGeometry(0.309, 36, 10, Math.PI / 2 - 1.06, 2.12, 1.02, 0.98), { p: [0, 0.035, 0.012], s: [1.14, 0.93, 1] });
  // chin seam
  H.add('navy', torus(1, 0.03, 40), { p: [0, -0.15, 0.0], r: [Math.PI / 2, 0, 0], s: [0.282, 0.249, 0.5] }, true);

  // Helmet graphics: panels of the skull surface itself, lifted 1.2% so they read as inlaid with clean edges
  // and nothing to z-fight. One centre stripe / twin racing stripes / a broad armour band / a swept dart.
  const flat = (b: number) => () => b;
  if (id === 'scout') {
    for (const sx of [-1, 1]) H.add('accent', ...skin(crownStripe(flat(sx * 0.085), flat(sx * 0.205))), true);
  } else if (id === 'bulwark') {
    H.add('accent', ...skin(crownStripe(flat(-0.4), flat(0.4), 0, 1, 40, 6)), true);
    for (const sx of [-1, 1]) H.add('navy', ...skin(crownStripe(flat(sx * 0.4), flat(sx * 0.47)), 1.013), true);
  } else if (id === 'glider') {
    // arrowhead pointing forward, swallow-tailed at the back
    for (const sx of [-1, 1]) {
      const outer = (s: number) => sx * (0.03 + 0.4 * Math.pow((1 - s) / 0.7, 0.9));
      const inner = (s: number) => sx * Math.max(0, 0.5 - 0.92 * s);
      H.add('accent', ...skin(crownStripe(inner, outer, 0.3, 1, 30, 3)), true);
    }
  } else {
    H.add('accent', ...skin(crownStripe(flat(-0.235), flat(0.235), 0, 1, 40, 3)), true);
  }

  // Ear pods
  for (const sx of [-1, 1]) {
    if (id === 'bulwark') {
      // armoured ear blocks with a light bar
      H.add('navy', extrude(octagon(0.08, 0.086, 0.03), 0.06, 0.008), { p: [sx * 0.345, 0, 0], r: [0, Math.PI / 2, 0] });
      H.add('accent', extrude(octagon(0.058, 0.064, 0.022), 0.016, 0.005), { p: [sx * 0.388, 0, 0], r: [0, Math.PI / 2, 0] }, true);
      H.add('glow', SPH_XS, { p: [sx * 0.396, 0, 0], s: [0.01, 0.045, 0.016] }, true);
    } else {
      H.add('navy', CYL, { p: [sx * 0.345, 0, 0], r: [0, 0, Math.PI / 2], s: [0.097, 0.075, 0.097] });
      H.add('accent', CYL, { p: [sx * 0.386, 0, 0], r: [0, 0, Math.PI / 2], s: [0.066, 0.022, 0.066] }, true);
      H.add('glow', torus(0.08, 0.012, 24), { p: [sx * 0.384, 0, 0], r: [0, Math.PI / 2, 0] }, true);
    }
  }

  if (id === 'scout') {
    // Visor peak: a short cap brim over the face screen, and a sensor antenna on the left ear pod.
    const peak: [number, number][] = [];
    const span = 0.98;
    const rim = (a: number, out: number): [number, number] => {
      const x = Math.sin(a) * 0.245;
      const z = Math.cos(a) * 0.215;
      const k = 1 + out / Math.hypot(x, z);
      return [x * k, z * k];
    };
    for (let i = 0; i <= 12; i++) {
      const a = -span + (2 * span * i) / 12;
      peak.push(rim(a, 0.108 * Math.pow(Math.cos((a / span) * (Math.PI / 2)), 0.8)));
    }
    for (let i = 12; i >= 0; i--) peak.push(rim(-span + (2 * span * i) / 12, -0.02));
    // (the brim droops toward its corners so it wraps the brow instead of sitting on it like a plate)
    const brim = extrude(peak, 0.014, 0.006);
    const bp = brim.attributes.position;
    for (let i = 0; i < bp.count; i++) bp.setZ(i, bp.getZ(i) + 0.55 * bp.getX(i) * bp.getX(i));
    brim.computeVertexNormals();
    H.add('accent', brim, { p: [0, 0.224, 0], r: [Math.PI / 2 + 0.13, 0, 0] });
    H.add('navy', CYL, { p: [-0.385, 0.165, -0.04], r: [0, 0, 0.25], s: [0.015, 0.2, 0.015] });
    H.add('glow', SPH_LO, { p: [-0.41, 0.272, -0.04], s: 0.034 });
  } else if (id === 'bulwark') {
    // Jaw guard: a fat chin bar hugging the lower face, rising into the ear blocks at both ends.
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 12; i++) {
      const f = -1 + i / 6;
      const a = f * 1.75;
      pts.push(new THREE.Vector3(Math.sin(a) * 0.292, -0.165 + 0.1 * Math.pow(Math.abs(f), 2.2), Math.cos(a) * 0.262));
    }
    H.add('accent', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.042, 8, false));
  } else if (id === 'glider') {
    // Swept fins on the ear pods and a flattened aero tail on the back of the helmet (its wide base is
    // inside the skull; with the arrowhead it reads as one dart from above).
    for (const sx of [-1, 1]) {
      H.add('accent', extrude([[0.035, -0.03], [-0.2, 0.15], [-0.15, 0.172], [0.06, 0.055]], 0.02), { p: [sx * 0.387, 0.03, -0.02], r: [0, -Math.PI / 2, 0] });
    }
    const up = 0.1;
    const rot: V3 = [-Math.PI / 2 + up, 0, 0];
    const along = (d: number): V3 => [0, -0.02 + Math.sin(up) * d, -0.25 - Math.cos(up) * d];
    H.add('accent', new THREE.ConeGeometry(1, 1, 20, 1, true), { p: along(0.055), r: rot, s: [0.235, 0.31, 0.095] });
  }
}

// --- arms (y = 0 at the shoulder, hanging down; the group is scaled by dims.arm)

function buildArm(id: ChassisId, A: Parts, sx: number): void {
  const band: Slot = sx > 0 ? 'yellow' : 'accent'; // the tether hand wears the yellow band
  const flat: V3 = [Math.PI / 2, 0, 0];
  A.add('navy', SPH_LO, { s: 0.085 });
  /** Upper arm, elbow seam, flared cuff with the wrist band, and a mitten hand with a thumb. */
  const limb = (r: number, cuff: number, hand: number, bandTube = 0.017): void => {
    A.add('shell', capsule(r, 0.17), { p: [0, -0.17, 0] });
    A.add('navy', torus(r, 0.013, 24), { p: [0, -0.165, 0], r: flat }, true);
    A.add('shell', new THREE.CylinderGeometry(r + 0.003, cuff, 0.075, 18, 1, true), { p: [0, -0.258, 0] });
    A.add(band, torus(cuff - 0.006, bandTube, 24), { p: [0, -0.262, 0], r: flat }, true);
    A.add('navy', SPH_MID, { p: [0, -0.34, 0], s: hand });
    A.add('navy', SPH_XS, { p: [-sx * hand * 0.55, -0.335, hand * 0.62], s: hand * 0.46 });
  };
  if (id === 'scout') {
    // slim arm, low shoulder cap, racing stripe down the outside
    A.add('shell', HEMI, { p: [0, 0.006, 0], s: [0.098, 0.08, 0.1] });
    limb(0.05, 0.06, 0.084, 0.014);
    A.add('accent', ROUND_BOX, { p: [sx * 0.048, -0.135, 0], s: [0.014, 0.075, 0.034] }, true);
    A.add('accent', torus(0.096, 0.01, 24), { p: [0, 0.006, 0], r: flat }, true);
  } else if (id === 'bulwark') {
    // Armoured pauldron centred on the shoulder joint so it turns with the arm (a body-fixed pad would be
    // pierced by raised arms), with a club-colour top plate; thick arm, gauntlet and a big fist. The arm
    // group is scaled by dims.arm, so the pauldron is sized in body units and divided by it.
    const k = 1 / DIMS.bulwark.arm;
    const c: V3 = [sx * 0.008 * k, -0.008 * k, 0];
    A.add('shell', SPH, { p: c, s: [0.128 * k, 0.114 * k, 0.136 * k] });
    A.add('navy', torus(1, 0.06, 32), { p: c, r: flat, s: [0.125 * k, 0.133 * k, 0.3 * k] }, true);
    A.add('accent', new THREE.SphereGeometry(1, 18, 4, 0, Math.PI * 2, 0, 0.9), { p: c, s: [0.1325 * k, 0.118 * k, 0.141 * k] }, true);
    limb(0.07, 0.09, 0.103, 0.021);
  } else if (id === 'glider') {
    // teardrop shoulder fairing swept back, and a blade fin behind the forearm
    A.add('shell', HEMI, { p: [0, 0.008, -0.014], s: [0.106, 0.092, 0.13] });
    A.add('accent', torus(1, 0.105, 28), { p: [0, 0.008, -0.014], r: flat, s: [0.104, 0.128, 0.115] }, true);
    limb(0.054, 0.066, 0.089);
    A.add('accent', extrude([[-0.03, -0.275], [-0.03, -0.185], [-0.125, -0.15], [-0.085, -0.235]], 0.014, 0.005), { r: [0, -Math.PI / 2, 0] });
  } else {
    // round shoulder cap with a trim ring
    A.add('shell', HEMI, { p: [0, 0.008, 0], s: [0.118, 0.1, 0.118] });
    A.add('accent', torus(0.115, 0.012, 28), { p: [0, 0.008, 0], r: flat }, true);
    limb(0.058, 0.07, 0.092);
    A.add('accent', torus(0.058, 0.012, 24), { p: [0, -0.105, 0], r: flat }, true); // sleeve band
  }
}

// --- legs (y = 0 at the hip; `drop` lengthens the thigh and lowers the boot)

function buildLeg(id: ChassisId, L: Parts, sx: number): void {
  const drop = DIMS[id].drop;
  const flat: V3 = [Math.PI / 2, 0, 0];
  /** Thigh, boot shaft with its cuff, boot and coloured welt; returns the boot centre height. */
  const leg = (thigh: number, shaft: number, boot: V3, bootZ: number): number => {
    L.add('navy', capsule(thigh, 0.14 + drop), { p: [0, -0.12 - drop / 2, 0] });
    L.add('shell', CYL, { p: [0, -0.215 - drop, 0.006], s: [shaft, 0.09, shaft * 1.07] });
    L.add('navy', torus(shaft, 0.013, 24), { p: [0, -0.17 - drop, 0.006], r: flat }, true);
    const by = -LEG_LEN - drop + boot[1];
    L.add('shell', SPH_MID, { p: [0, by, bootZ], s: boot });
    L.add('accent', SPH_MID, { p: [0, -0.32 - drop, bootZ], s: [boot[0] * 1.03, 0.03, boot[2] * 1.03] }, true);
    return by;
  };
  if (id === 'scout') {
    // long slim legs with a racing stripe, light boots and swept heel fins
    leg(0.054, 0.062, [0.093, 0.066, 0.15], 0.036);
    L.add('accent', ROUND_BOX, { p: [0, -0.215 - drop, 0.071], s: [0.026, 0.04, 0.014] }, true);
    L.add('accent', ROUND_BOX, { p: [sx * 0.05, -0.115 - drop / 2, 0], s: [0.014, 0.07 + drop / 2, 0.034] }, true);
    L.add('accent', extrude([[-0.04, -0.03], [0.055, 0.04], [0.15, 0.125], [0.125, 0.045], [0.045, -0.045]], 0.014, 0.006), { p: [sx * 0.07, -0.215 - drop, -0.005], r: [0, Math.PI / 2, 0] });
  } else if (id === 'bulwark') {
    // short thick legs, heavy boots with a toe bumper and a shin plate
    const by = leg(0.076, 0.086, [0.124, 0.08, 0.176], 0.04);
    L.add('accent', ROUND_BOX, { p: [0, -0.212 - drop, 0.096], s: [0.062, 0.034, 0.02] }, true);
    L.add('navy', TOE_CAP, { p: [0, by, 0.04], s: [0.124 * 1.035, 0.08 * 1.035, 0.176 * 1.035] }, true);
  } else if (id === 'glider') {
    // slim legs and long pointed boots with club-colour toes
    const by = leg(0.058, 0.066, [0.094, 0.066, 0.176], 0.046);
    L.add('accent', ROUND_BOX, { p: [0, -0.215 - drop, 0.075], s: [0.028, 0.04, 0.014] }, true);
    L.add('accent', TOE_CAP, { p: [0, by, 0.046], s: [0.094 * 1.035, 0.066 * 1.035, 0.176 * 1.035] }, true);
  } else {
    // classic boots with a shin pad
    leg(0.062, 0.07, [0.105, 0.072, 0.155], 0.035);
    L.add('shell', ROUND_BOX, { p: [0, -0.2 - drop, 0.076], s: [0.066, 0.036, 0.026] });
    L.add('accent', ROUND_BOX, { p: [0, -0.2 - drop, 0.086], s: [0.026, 0.04, 0.014] }, true);
  }
}

function chassisGeo(id: ChassisId): ChassisGeo {
  const hit = chassisCache.get(id);
  if (hit) return hit;
  const key: ChassisId = DIMS[id] ? id : 'all_rounder';
  const P: Record<GroupName, Parts> = { body: new Parts(), torso: new Parts(), head: new Parts(), armL: new Parts(), armR: new Parts(), legL: new Parts(), legR: new Parts() };
  const torso = buildTorso(key, P.torso, P.body);
  buildHead(key, P.head);
  buildArm(key, P.armL, -1);
  buildArm(key, P.armR, 1);
  buildLeg(key, P.legL, -1);
  buildLeg(key, P.legR, 1);
  const names = Object.keys(P) as GroupName[];
  const geo: ChassisGeo = {
    dims: DIMS[key],
    groups: Object.fromEntries(names.map((n) => [n, P[n].build()])) as ChassisGeo['groups'],
    trim: Object.fromEntries(names.map((n) => [n, P[n].trimSlots()])) as ChassisGeo['trim'],
    ...torso,
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
  kind: 'none' | 'wobble' | 'spin' | 'float' | 'sweep';
  /** Height above the head centre the topper reaches (for markers above the robot). */
  height: number;
}

const topperCache = new Map<string, TopperGeo>();
const TOPPERS = new Set(['topper_antenna', 'topper_fin', 'topper_headset', 'topper_horns', 'topper_propeller', 'topper_halo', 'topper_crown', 'topper_mohawk', 'topper_ears', 'topper_tophat', 'topper_radar']);

/** The same surface seen from both sides: the copy has reversed winding and normals (open bowls, dishes). */
function twoSided(g: THREE.BufferGeometry): [THREE.BufferGeometry, THREE.BufferGeometry] {
  const back = g.clone();
  const idx = back.index!;
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i);
    idx.setX(i, idx.getX(i + 2));
    idx.setX(i + 2, a);
  }
  const n = back.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return [g, back];
}

/** Places geometry in a tilted frame (origin `at`, Euler `tilt`) before it goes into a Parts list. */
function inFrame(at: V3, tilt: V3): (slot: Slot, g: THREE.BufferGeometry, x: Xf, into: Parts) => void {
  const frame = new THREE.Object3D();
  frame.position.set(at[0], at[1], at[2]);
  frame.rotation.set(tilt[0], tilt[1], tilt[2]);
  frame.updateMatrix();
  return (slot, g, x, into) => {
    const local = g.clone();
    const s = x.s ?? 1;
    const p = x.p ?? [0, 0, 0];
    const r = x.r ?? [0, 0, 0];
    _m.compose(_p.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2])), typeof s === 'number' ? _s.setScalar(s) : _s.set(s[0], s[1], s[2]));
    local.applyMatrix4(_m);
    local.applyMatrix4(frame.matrix);
    into.add(slot, local);
  };
}

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
    case 'topper_mohawk': {
      // a ridge of blade spikes along the crown stripe, tallest over the brow, each standing on the skull normal
      const spikes: [number, number][] = [[0.62, 0.16], [0.3, 0.22], [-0.03, 0.24], [-0.37, 0.21], [-0.72, 0.16], [-1.05, 0.11]];
      for (const [a, h] of spikes) {
        const py = SKULL[1] * Math.cos(a);
        const pz = SKULL[2] * Math.sin(a);
        const ny = Math.cos(a) / SKULL[1];
        const nz = Math.sin(a) / SKULL[2];
        const nl = Math.hypot(ny, nz);
        const th = Math.atan2(nz / nl, ny / nl);
        const cone = new THREE.ConeGeometry(0.075, h, 4, 1);
        cone.translate(0, h / 2, 0);
        F.add('secondary', cone, { p: [0, py - (ny / nl) * 0.02, pz - (nz / nl) * 0.02], r: [th, 0, 0], s: [0.55, 1, 1.2] });
      }
      height = TOP_Y + 0.23;
      break;
    }
    case 'topper_ears': {
      // pointed cat ears: white shell outside, club colour inside, tilted out over the ear pods
      const outer: [number, number][] = [[-0.095, 0], [0.095, 0], [0.012, 0.19]];
      const inner: [number, number][] = [[-0.055, 0.02], [0.055, 0.02], [0.008, 0.14]];
      for (const sx of [-1, 1]) {
        const put = inFrame([sx * 0.19, TOP_Y - 0.075, 0.0], [0, -sx * 0.25, -sx * 0.42]);
        put('shell', extrude(outer.map(([x, y]) => [x * sx, y] as [number, number]), 0.045, 0.012), {}, F);
        put('accent', extrude(inner.map(([x, y]) => [x * sx, y] as [number, number]), 0.02, 0.004), { p: [0, 0, 0.026] }, F);
      }
      height = TOP_Y + 0.13;
      break;
    }
    case 'topper_tophat': {
      // dapper navy top hat with a club-colour band and a gold buckle, worn at a slight tilt
      const put = inFrame([0.02, TOP_Y - 0.035, -0.01], [-0.1, 0, -0.14]);
      put('navy', CYL, { p: [0, 0.01, 0], s: [0.25, 0.02, 0.235] }, F);
      put('navy', new THREE.CylinderGeometry(0.158, 0.148, 0.25, 32), { p: [0, 0.14, 0] }, F);
      put('navy', CYL, { p: [0, 0.266, 0], s: [0.159, 0.006, 0.159] }, F);
      put('accent', CYL, { p: [0, 0.05, 0], s: [0.153, 0.05, 0.153] }, F);
      put('gold', ROUND_BOX, { p: [0, 0.05, 0.152], r: [Math.PI / 2, 0, 0], s: [0.05, 0.012, 0.045] }, F);
      height = TOP_Y + 0.27;
      break;
    }
    case 'topper_radar': {
      // a little radar dish on a mast that sweeps the pitch; the feed tip glows
      pivot = [0, TOP_Y + 0.11, -0.03];
      kind = 'sweep';
      F.add('navy', CYL, { p: [0, TOP_Y - 0.005, -0.03], s: [0.05, 0.03, 0.05] });
      F.add('metal', CYL, { p: [0, TOP_Y + 0.06, -0.03], s: [0.016, 0.12, 0.016] });
      const R = 0.24;
      const cap = new THREE.SphereGeometry(R, 28, 7, 0, Math.PI * 2, 0, 0.72);
      cap.translate(0, -R, 0);
      const [outside, inside] = twoSided(cap);
      inside.translate(0, -0.006, 0);
      const tiltUp = 0.45;
      const rx = -(Math.PI / 2 + tiltUp);
      M.add('shell', outside, { p: [0, 0.03, 0], r: [rx, 0, 0] });
      M.add('metal', inside, { p: [0, 0.03, 0], r: [rx, 0, 0] });
      // rim and feed: the dish opens toward +z, tipped up
      const dz = Math.cos(tiltUp);
      const dy = Math.sin(tiltUp);
      const rimC: V3 = [0, 0.03 + dy * R * (1 - Math.cos(0.72)), dz * R * (1 - Math.cos(0.72))];
      M.add('accent', torus(R * Math.sin(0.72), 0.011, 40), { p: rimC, r: [rx + Math.PI / 2, 0, 0] });
      const feedLen = 0.1;
      M.add('navy', CYL, { p: [0, 0.03 + dy * feedLen * 0.5, dz * feedLen * 0.5], r: [Math.PI / 2 - tiltUp, 0, 0], s: [0.008, feedLen, 0.008] });
      M.add('glow', SPH_LO, { p: [0, 0.03 + dy * feedLen, dz * feedLen], s: 0.02 });
      height = pivot[1] + 0.16;
      break;
    }
  }
  const geo: TopperGeo = { fixed: F.build(), moving: M.build(), pivot, kind, height };
  topperCache.set(id, geo);
  return geo;
}

// ----------------------------------------------------------------------------- view

const tmpV = new THREE.Vector3();
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const smooth01 = (a: number, b: number, v: number): number => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class RobotView {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  /** Everything above the hips (torso, head, arms): twists as one for the nutmeg reaction. */
  private upper = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private handR = new THREE.Object3D();
  private handL = new THREE.Object3D();
  /** Which arm holds the rope during the current swing (+1: armR on local +x, -1: armL). */
  private ropeArm = 0;
  /** 0..1 blend into the celebration (hop, spin) so it never pops in or out. */
  private cheer = 0;
  private spinAngle = 0;
  private spinVel = 0;
  private legLz = 0;
  private legRz = 0;
  /** Backflip angle (rad, about the body's hip-height pivot) and the body's rest height for the chassis. */
  private flip = 0;
  private pitchNow = 0;
  private celT = 0;
  private bodyBaseY = 0;
  private jersey: THREE.Mesh;
  private visor: THREE.Mesh;
  private flame: THREE.Mesh;
  private flameMat: THREE.MeshBasicMaterial;
  /** Mastery rank belt over the navy belt (hidden when unranked). */
  private rankBelt: THREE.Mesh;
  private rankMat: THREE.MeshStandardMaterial;
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
  private dims: ChassisDims = DIMS.all_rounder;
  /** Nutmeg reaction: active flag, the side the upper body whips round to (alternates), current twist. */
  private megOn = false;
  private megSide = Math.random() < 0.5 ? 1 : -1;
  private twist = 0;
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

    this.body.add(this.upper, this.legL, this.legR);
    this.upper.add(this.torso, this.head, this.armL, this.armR);
    this.torso.position.set(0, HIP_Y - 0.03, 0);
    // The jersey, flames and rank belt are fitted to the chassis: buildChassis swaps their geometry.
    const geo = chassisGeo(look.chassis);
    this.jersey = new THREE.Mesh(geo.jersey, this.jerseyMat);
    this.jersey.castShadow = shadows;
    this.torso.add(this.jersey);
    this.visor = new THREE.Mesh(VISOR_GEO, this.visorMat);
    this.visor.scale.set(1.14, 0.93, 1.0);
    this.visor.position.set(0, 0.035, 0.012);
    this.head.add(this.visor);
    this.flame = new THREE.Mesh(geo.flame, this.flameMat);
    this.flame.renderOrder = 3;
    this.torso.add(this.flame);
    this.rankMat = new THREE.MeshStandardMaterial({ color: '#f4c84b', roughness: 0.22, metalness: 0.9 });
    this.rankBelt = new THREE.Mesh(geo.rankBelt, this.rankMat);
    this.rankBelt.castShadow = false; // it hugs the belt: nothing to add to the shadow
    this.rankBelt.visible = false;
    this.torso.add(this.rankBelt);
    this.handR.position.set(0, -0.34, 0);
    this.armR.add(this.handR);
    this.handL.position.set(0, -0.34, 0);
    this.armL.add(this.handL);
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
    const trim = trimColor(primary, look.secondary);
    const accent = this.mats.accent as THREE.MeshStandardMaterial;
    accent.color.set(trim);
    accent.emissive.set(trim);
    accent.emissiveIntensity = 0.14;
    (this.mats.secondary as THREE.MeshStandardMaterial).color.set(look.secondary);
    // Glow parts: a vivid light version of the club colour pushed above 1 so it reads as light, also for
    // dark or greyish club colours (which used to give dull grey eyes and belts).
    const vivid = vividColor(primary);
    this.glowBase.set(vivid).multiplyScalar(1.7);
    (this.mats.glow as THREE.MeshBasicMaterial).color.copy(this.glowBase);
    this.flameMat.color.set(shade(vivid, 0.1));
    this.eyeColor = '#' + new THREE.Color(vivid).lerp(WHITE_C, 0.4).getHexString();
    this.jerseyMat.map = jerseyTexture(look.pattern, primary, look.secondary, look.number);
    this.jerseyMat.needsUpdate = true;
    this.applyFace(true);

    // Mastery rank belt: bronze / silver / gold / platinum metal, Master glows.
    const rank = Math.max(0, Math.min(5, Math.round(look.mastery ?? 0)));
    this.rankBelt.visible = rank > 0;
    if (rank > 0) {
      const RANK = ['#9aa3ad', '#c9824a', '#d6dde4', '#f4c84b', '#a8ecff', '#ff8ee0'];
      this.rankMat.color.set(RANK[rank]);
      this.rankMat.emissive.set(rank >= 4 ? RANK[rank] : '#000000');
      this.rankMat.emissiveIntensity = rank === 5 ? 0.55 : rank === 4 ? 0.18 : 0;
      this.rankMat.metalness = rank === 5 ? 0.5 : 0.9;
    }
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
        mesh.castShadow = this.shadows && slot !== 'glow' && !geo.trim[name].has(slot);
        groups[name].add(mesh);
        this.partMeshes.push(mesh);
      }
    }
    const d = geo.dims;
    this.dims = d;
    this.jersey.geometry = geo.jersey;
    this.rankBelt.geometry = geo.rankBelt;
    this.flame.geometry = geo.flame;
    this.flame.position.set(0, geo.jet.y, geo.jet.z);
    this.flame.rotation.x = geo.jet.tilt;
    this.head.position.set(0, d.headY, 0.01);
    this.head.scale.setScalar(d.head);
    this.armL.scale.setScalar(d.arm);
    this.armR.scale.setScalar(d.arm);
    this.armL.position.set(-d.shoulder, d.shoulderY, 0);
    this.armR.position.set(d.shoulder, d.shoulderY, 0);
    this.legL.position.set(-d.legSpread, HIP_Y, 0);
    this.legR.position.set(d.legSpread, HIP_Y, 0);
    // Longer / shorter legs raise or lower the whole body so feet stay on the ground.
    this.bodyBaseY = d.drop;
    this.body.position.y = this.bodyBaseY;
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
    const d = this.dims;
    return (this.body.position.y + d.headY + this.topperHeight * d.head + 0.04) * this.scale;
  }

  private applyFace(force = false): void {
    // wide-eyed for the whole nutmeg reaction, whatever the match asks for
    const exp: Expression = this.megOn ? 'wow' : this.blink > 0 && (this.expression === 'neutral' || this.expression === 'focus') ? 'blink' : this.expression;
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

  /** World position of the tether hand (rope start): the hand on the anchor's side during a swing. */
  handWorld(out: THREE.Vector3): THREE.Vector3 {
    return (this.ropeArm < 0 ? this.handL : this.handR).getWorldPosition(out);
  }

  /** Height the body is currently lifted off the ground (for shadow scaling). */
  get lift(): number {
    return this.air * this.scale;
  }

  update(dt: number, p: RobotPose): void {
    this.time += dt;
    const d0 = this.dims;
    const speed = Math.hypot(p.vx, p.vz);
    // Stride grows with speed so the feet roughly keep pace with the ground from a jog to a sprint.
    const stride = Math.min(1.25, speed / 4.6);
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

    // Stance comes from the chassis: how it leans, where the arms hang, how far it bounces.
    let rollTarget = Math.max(-0.45, Math.min(0.45, -turnRate * 0.05 * Math.min(1, speed / 4)));
    let pitch = d0.lean + Math.min(0.45, speed * 0.04) * d0.runLean;
    let armLx = d0.armBack - swing * 0.75 * stride;
    let armRx = d0.armBack + swing * 0.75 * stride;
    let armLz = -d0.armOut;
    let armRz = d0.armOut;
    let legLx = swing * 0.95 * stride;
    let legRx = -swing * 0.95 * stride;
    let legLz = -d0.legSplay;
    let legRz = d0.legSplay;
    let headX = 0;
    let headY = 0;
    let twistTarget = 0;
    let y = Math.abs(swing) * 0.05 * stride * d0.hop + this.air;
    let thrustTarget = p.tethered ? 1 : Math.max(0, Math.min(1, (speed - 4.6) / 4.2));

    // Anchor in the robot's own frame (x: its +x side, where armR hangs).
    let anchorX = 0;
    let anchorZ = 0;
    if (p.tethered) {
      const th = Math.PI / 2 - this.yaw + this.spinAngle;
      const dx = p.ax - p.x;
      const dz = p.az - p.z;
      anchorX = dx * Math.cos(th) - dz * Math.sin(th);
      anchorZ = dx * Math.sin(th) + dz * Math.cos(th);
      // The hand on the anchor's side takes the rope and keeps it for the swing (switching only if the anchor
      // ends up clearly on the other side), so the rope never crosses the body or the face.
      if (this.ropeArm === 0 || anchorX * this.ropeArm < -0.35 * Math.hypot(anchorX, anchorZ)) this.ropeArm = anchorX >= 0 ? 1 : -1;
      const side = this.ropeArm;
      // Lean into the swing (toward the anchor), free arm out for balance, legs trailing.
      rollTarget = -side * 0.42;
      pitch = 0.3;
      if (side > 0) {
        armLx = 0.5;
        armLz = -0.6;
      } else {
        armRx = 0.5;
        armRz = 0.6;
      }
      legLx = 0.55 + swing * 0.15;
      legRx = 0.3 - swing * 0.15;
    } else {
      this.ropeArm = 0;
      if (fast) {
        pitch = 0.55 * (0.6 + 0.4 * d0.runLean);
        armLx = 0.9;
        armRx = 0.9;
        armLz = -0.35;
        armRz = 0.35;
      }
    }

    if (p.kickAge < 0.26) {
      const t = p.kickAge / 0.26;
      legRx = -d0.kick * Math.sin(Math.PI * Math.min(1, t * 1.15));
      if (this.ropeArm >= 0) armLx = -0.8;
      if (this.ropeArm <= 0) armRx = 0.6;
      pitch = -0.12;
    }
    if (p.bumpAge < 0.3) {
      const t = 1 - p.bumpAge / 0.3;
      rollTarget += Math.sin(p.bumpAge * 40) * 0.25 * t;
      headX = -0.2 * t;
    }

    const t = this.time;
    const celebrating = p.mood === 'celebrate';
    const cel = this.look.celebration;
    // Celebrations blend in and out (hop height, spin) instead of starting mid-bounce or mid-turn.
    this.cheer += ((celebrating ? 1 : 0) - this.cheer) * Math.min(1, dt * 6);
    // Time into the current celebration, so cycles (backflip, drum roll) always start from their first beat.
    this.celT = celebrating ? this.celT + dt : 0;
    const spinning = celebrating && cel === 'celebration_spin' && !reduced;
    this.spinVel += ((spinning ? 7 : 0) - this.spinVel) * Math.min(1, dt * 4);
    this.spinAngle += this.spinVel * dt;
    if (spinning) this.spinAngle %= Math.PI * 2;
    else {
      const rest = Math.round(this.spinAngle / (Math.PI * 2)) * Math.PI * 2;
      this.spinAngle += (rest - this.spinAngle) * Math.min(1, dt * 3);
    }
    if (celebrating) {
      // Raised arms stay wide of the head and ear pods (hands used to sink into them).
      const hop = reduced ? 0 : Math.abs(Math.sin(t * 6.5)) * 0.28;
      let lift = hop;
      pitch = 0;
      rollTarget = 0;
      thrustTarget = reduced ? 0.3 : 0.35 + Math.max(0, Math.cos(t * 6.5)) * 0.5;
      if (cel === 'celebration_flip') {
        // crouch with arms back, launch into a full backflip with arms high, land with arms wide
        const u = reduced ? 0.9 : (this.celT % 1.9) / 1.9;
        if (u < 0.2) {
          armLx = armRx = 0.7;
          armLz = -0.3;
          armRz = 0.3;
          lift = 0;
          pitch = 0.18;
        } else if (u < 0.74) {
          const s = (u - 0.2) / 0.54;
          lift = 3.6 * s * (1 - s) * 0.95;
          armLx = armRx = -2.75;
          armLz = -0.85;
          armRz = 0.85;
          legLx = legRx = -0.5 * Math.sin(Math.PI * s);
          thrustTarget = 1;
        } else {
          armLx = armRx = -0.35;
          armLz = -1.25;
          armRz = 1.25;
          lift = 0;
        }
      } else if (cel === 'celebration_drum') {
        // a furious drum roll (arms forward at chest height, well below the head), then ta-da
        const u = reduced ? 0.9 : (this.celT % 2.4) / 2.4;
        if (u < 0.7) {
          const s = reduced ? 0 : Math.sin(t * 24);
          armLx = -1.35 + s * 0.45;
          armRx = -1.35 - s * 0.45;
          armLz = -0.24;
          armRz = 0.24;
          lift = Math.abs(s) * 0.015;
          legLx = legRx = 0;
          thrustTarget = 0.25;
        } else {
          armLx = armRx = -2.6;
          armLz = -1.0;
          armRz = 1.0;
          lift = Math.sin((Math.PI * (u - 0.7)) / 0.3) * 0.3;
          legLx = legRx = 0;
        }
      } else if (cel === 'celebration_point') {
        // point out to the right at the teammate who set it up, fist pump with the other arm, look their way
        const s = reduced ? 0 : Math.sin(t * 9);
        armRz = 1.35 + s * 0.1;
        armRx = -0.35;
        armLx = -2.75 + Math.max(0, s) * 0.22;
        armLz = -0.85;
        legLx = legRx = 0;
        lift = reduced ? 0 : Math.abs(Math.sin(t * 4.5)) * 0.08;
        headY = 0.45;
      } else if (cel === 'celebration_spin') {
        armLx = armRx = -2.75;
        armLz = -0.85;
        armRz = 0.85;
      } else if (cel === 'celebration_jacks') {
        const s = reduced ? 0.5 : (Math.sin(t * 9) + 1) / 2;
        armLx = armRx = 0;
        armLz = -0.4 - s * 1.75;
        armRz = 0.4 + s * 1.75;
        legLx = legRx = 0;
        legLz = -s * 0.42;
        legRz = s * 0.42;
      } else if (cel === 'celebration_dance') {
        const s = reduced ? 0 : Math.sin(t * 7);
        rollTarget = s * 0.3;
        armLx = -1.4 + s * 0.6;
        armRx = -1.4 - s * 0.6;
        armLz = -0.65;
        armRz = 0.65;
        legLx = s * 0.35;
        legRx = -s * 0.35;
        lift = Math.abs(s) * 0.1;
      } else {
        armLx = armRx = -2.6;
        const w = reduced ? 0 : Math.sin(t * 11);
        armLz = -0.9 - w * 0.25;
        armRz = 0.9 - (reduced ? 0 : Math.sin(t * 11 + 1)) * 0.25;
        legLx = legRx = 0;
      }
      y = y * (1 - this.cheer) + lift * this.cheer;
      headX = -0.18;
    } else if (p.mood === 'sad') {
      headX = d0.nod;
      pitch = 0.16;
      armLx = armRx = 0.12;
      y = 0;
      thrustTarget = 0;
    } else if (p.mood === 'idle' || p.mood === 'ready') {
      const breathe = Math.sin(t * 2.1);
      y += reduced ? 0 : breathe * 0.012 + 0.012;
      armLx += breathe * 0.05;
      armRx -= breathe * 0.05;
      headY = reduced ? 0 : Math.sin(t * 0.7) * 0.18;
      headX = reduced ? 0 : Math.sin(t * 0.9 + 1) * 0.04;
      if (p.mood === 'ready') {
        // confident garage stance
        armLz = -0.55;
        armRz = 0.55;
        armLx = -0.35;
        armRx = -0.35;
        legLx = -0.12;
        legRx = 0.12;
        legLz = -0.16;
        legRz = 0.16;
      }
    }

    // Nutmeg reaction: wrong-footed for about 0.7 s. The legs splay (too late), the upper body whips round
    // after the ball with the head leading over the shoulder, the arms flail, then everything recovers.
    // Reduced motion keeps a gentle version: a small splay and a look over the shoulder, no spin or wobble.
    const megAge = p.megAge;
    const megNow = megAge !== undefined && megAge >= 0 && megAge < MEG_TIME && !celebrating && p.mood !== 'sad';
    if (megNow !== this.megOn) {
      this.megOn = megNow;
      if (megNow) this.megSide = -this.megSide;
      this.applyFace();
    }
    if (megNow) {
      const u = megAge / MEG_TIME;
      const m = smooth01(0, 0.16, u) * (1 - smooth01(0.64, 1, u));
      const side = this.megSide;
      const wob = reduced ? 0 : Math.sin(u * 21);
      const keep = 1 - m;
      const splay = reduced ? 0.2 : 0.58;
      legLx = legLx * keep + wob * 0.1 * m;
      legRx = legRx * keep - wob * 0.1 * m;
      legLz = legLz * keep - splay * m;
      legRz = legRz * keep + splay * m;
      twistTarget = reduced ? 0 : side * (1.2 + wob * 0.14) * m;
      headY = side * (reduced ? 0.55 : 0.9) * m;
      headX = headX * keep + 0.1 * m;
      // arms windmill for balance, one up as the other comes down
      const flail = reduced ? 0.45 : 1.15;
      const mill = reduced ? 0 : wob * 0.45;
      armLx = armLx * keep + (-0.3 + wob * 0.3) * m;
      armRx = armRx * keep + (-0.3 - wob * 0.3) * m;
      armLz = armLz * keep - (flail + mill) * m;
      armRz = armRz * keep + (flail - mill) * m;
      rollTarget = rollTarget * keep + side * wob * 0.1 * m;
      pitch = pitch * keep + (d0.lean - 0.1) * m;
      // a startled little hop as the ball goes through
      y = y * keep + (reduced ? 0 : 0.07 * Math.sin(Math.PI * Math.min(1, u / 0.3)));
      thrustTarget *= keep;
    }

    this.roll += (rollTarget - this.roll) * k;
    const kk = Math.min(1, dt * 16);
    const b = this.body;
    // Backflip: the angle follows the airborne part of the cycle; otherwise it settles on the nearest full turn.
    if (celebrating && cel === 'celebration_flip' && !reduced) {
      const u = (this.celT % 1.9) / 1.9;
      const s = Math.max(0, Math.min(1, (u - 0.24) / 0.46));
      this.flip = -s * s * (3 - 2 * s) * Math.PI * 2; // 0 and -2pi look the same, so the wrap is seamless
    } else this.flip += (Math.round(this.flip / (Math.PI * 2)) * Math.PI * 2 - this.flip) * Math.min(1, dt * 6);
    this.pitchNow += (pitch - this.pitchNow) * kk;
    b.rotation.x = this.pitchNow + this.flip;
    b.rotation.z = this.roll;
    // rotate about a pivot at hip height rather than the feet
    const piv = 0.62;
    b.position.y = this.bodyBaseY + piv - piv * Math.cos(this.flip);
    b.position.z = -piv * Math.sin(this.flip);

    if (this.ropeArm !== 0) {
      // Aim the rope arm at the anchor: its direction in body space gives the two shoulder angles
      // (arm hangs along -y; rotation order XYZ, so dir = (sin z, -cos z cos x, -cos z sin x)).
      const side = this.ropeArm;
      const arm = side > 0 ? this.armR : this.armL;
      const sc = this.scale || 1;
      const v = tmpV.set(anchorX / sc, ((p.ay ?? ANCHOR_Y) - y * sc) / sc - b.position.y, anchorZ / sc);
      v.applyQuaternion(_q.setFromEuler(b.rotation).invert());
      if (this.twist !== 0) v.applyAxisAngle(Y_AXIS, -this.twist);
      v.sub(arm.position).normalize();
      // keep the arm on its own side and raised
      v.x = side > 0 ? Math.max(0.12, v.x) : Math.min(-0.12, v.x);
      v.y = Math.max(0.15, v.y);
      v.normalize();
      const az = Math.asin(Math.max(-1, Math.min(1, v.x)));
      let ax = Math.atan2(-v.z, -v.y);
      if (ax > Math.PI / 2) ax -= Math.PI * 2; // continuous through "straight up" (no wrap at +-PI)
      if (side > 0) {
        armRx = ax;
        armRz = az;
      } else {
        armLx = ax;
        armLz = az;
      }
    }

    this.armL.rotation.x += (armLx - this.armL.rotation.x) * kk;
    this.armR.rotation.x += (armRx - this.armR.rotation.x) * kk;
    this.armL.rotation.z += (armLz - this.armL.rotation.z) * kk;
    this.armR.rotation.z += (armRz - this.armR.rotation.z) * kk;
    this.legL.rotation.x += (legLx - this.legL.rotation.x) * kk;
    this.legR.rotation.x += (legRx - this.legR.rotation.x) * kk;
    this.legLz += (legLz - this.legLz) * kk;
    this.legRz += (legRz - this.legRz) * kk;
    this.legL.rotation.z = this.legLz;
    this.legR.rotation.z = this.legRz;
    this.head.rotation.x += (headX - this.head.rotation.x) * kk;
    this.head.rotation.y += (headY - this.head.rotation.y) * kk;
    this.twist += (twistTarget - this.twist) * kk;
    if (Math.abs(this.twist) < 1e-4 && twistTarget === 0) this.twist = 0;
    this.upper.rotation.y = this.twist;

    this.root.position.set(p.x, y * this.scale, p.z);
    this.root.rotation.y = Math.PI / 2 - this.yaw + this.spinAngle;
    this.root.scale.setScalar(this.scale);

    this.animateLights(dt, t, thrustTarget, reduced);
    this.animateTopper(dt, t, p, speed, reduced);
  }

  /** Thruster flames, light belt and ear rings. */
  private animateLights(dt: number, t: number, thrustTarget: number, reduced: boolean): void {
    this.thrust += (thrustTarget - this.thrust) * Math.min(1, dt * (thrustTarget > this.thrust ? 9 : 4));
    const th = this.thrust;
    const flick = reduced ? 1 : 0.86 + 0.14 * Math.sin(t * 53 + this.phase) * Math.sin(t * 31);
    // No idle pilot flame: the jets only light when the robot sprints, swings or celebrates.
    this.flame.visible = th > 0.03;
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
    } else if (kind === 'sweep') {
      // radar dish: a slow scan, quicker while sprinting or swinging; parked facing forward in reduced motion
      if (reduced) this.spin = 0;
      else this.spin = (this.spin + (1.3 + this.thrust * 2.5) * dt) % (Math.PI * 2);
      mv.rotation.y = Math.sin(this.spin) * 1.1;
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
    this.rankMat.dispose();
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
