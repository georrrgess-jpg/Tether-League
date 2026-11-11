import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ArenaDef, ArenaId } from '../../content/arenas';
import {
  brickTexture,
  cityTexture,
  floorTexture,
  markGeometry,
  pitchMarks,
  pitchTexture,
  screenTexture,
  seededRandom,
  turfNormalTexture,
  waterTexture,
  type FloorKind,
  type PitchPaint,
} from './arenaTextures';
import { beamTexture, blobTexture, cloudTexture, labelTexture, lampPanelTexture, ledBoardTexture, netMeshTexture, ringTexture, shade, skyTexture, windowsTexture } from './textures';

export type Quality = 'low' | 'medium' | 'high';

interface Theme {
  sky: [number, string][];
  fog: [string, number, number] | null;
  pitch: PitchPaint;
  floor: FloorKind;
  /** Running band that frames the court. */
  apron: string;
  wall: string;
  wallTop: string;
  /** Energised strip along the inner edge of the wall rail. */
  trim: string;
  deck: string;
  stand: string;
  seat: string;
  rail: string;
  sun: string;
  sunIntensity: number;
  sunPos: [number, number, number];
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  crowd: string[];
  /** Tone-mapping exposure and studio-reflection strength for this venue. */
  exposure: number;
  env: number;
  lamp: string;
  beamOpacity: number;
  ledAccent: string;
}

const THEMES: Record<ArenaId, Theme> = {
  // Sunny seaside pier: bleached boardwalk, ivory walls, aqua trim, classic mown stripes.
  harbor_park: {
    sky: [[0, '#3f9fe6'], [0.55, '#8fd0f5'], [1, '#e2f6ff']],
    fog: null,
    pitch: { a: '#4dac7d', b: '#42a071', line: '#f6fbf4', mow: 'stripes', emblem: 'wave' },
    floor: 'planks',
    apron: '#7f9aa4',
    wall: '#efeadd', wallTop: '#fdfbf3', trim: '#35c3d4', deck: '#f1ecdf',
    stand: '#f0ece2', seat: '#2f9fc4', rail: '#c9cfd6',
    sun: '#fff1d2', sunIntensity: 3.2, sunPos: [-16, 26, 14],
    hemiSky: '#dff1ff', hemiGround: '#8f9c86', hemiIntensity: 0.95,
    crowd: ['#12bcd2', '#f48a2c', '#f3f5ef', '#f6c542', '#7a8aa0', '#51c998'],
    exposure: 0.86, env: 0.2, lamp: '#fff6e0', beamOpacity: 0, ledAccent: '#7ff3ff',
  },
  // Tight industrial court: steel plate floor, brick kilns, amber trim, pitch mown lengthwise.
  foundry_court: {
    sky: [[0, '#120d0b'], [0.6, '#2b1a12'], [1, '#5a2d14']],
    fog: ['#1a120e', 70, 150],
    pitch: { a: '#3f9577', b: '#36886b', line: '#f3eee0', mow: 'bands', emblem: 'cog' },
    floor: 'plate',
    apron: '#2a2725',
    wall: '#77706a', wallTop: '#a59e93', trim: '#ffab3d', deck: '#59524c',
    stand: '#4d4641', seat: '#c4682c', rail: '#8a8178',
    sun: '#ffd7a6', sunIntensity: 2.3, sunPos: [-8, 28, 14],
    hemiSky: '#ffcf9c', hemiGround: '#40302a', hemiIntensity: 1.0,
    crowd: ['#f48a2c', '#e9a23a', '#8c8177', '#d8d2c6', '#12bcd2', '#b2553a'],
    exposure: 0.95, env: 0.16, lamp: '#ffd9a0', beamOpacity: 0.07, ledAccent: '#ffb347',
  },
  // Rooftop at dusk: slate pavers, neon edges, a low warm sun and the city below; chequered cut.
  skyline_stadium: {
    sky: [[0, '#2b2466'], [0.45, '#8a4a8f'], [0.75, '#f08a5a'], [1, '#ffd79a']],
    fog: ['#4a3a78', 95, 330],
    pitch: { a: '#45a484', b: '#3b9778', line: '#fff6ea', mow: 'checker', emblem: 'towers' },
    floor: 'pavers',
    apron: '#3c3f5c',
    wall: '#e0dae8', wallTop: '#f6f1fa', trim: '#ff73cf', deck: '#cdc5df',
    stand: '#bdb7c9', seat: '#6f4fc4', rail: '#d9d4e4',
    sun: '#ffc08a', sunIntensity: 2.6, sunPos: [-22, 20, -6],
    hemiSky: '#cdb9ff', hemiGround: '#6f6a8c', hemiIntensity: 1.25,
    crowd: ['#8a5cf0', '#f48a2c', '#f3f5ef', '#12bcd2', '#ec5f8e', '#f6c542'],
    exposure: 0.9, env: 0.2, lamp: '#fff1dc', beamOpacity: 0.05, ledAccent: '#ffb27a',
  },
  // Indoor final venue: polished navy concourse, gold trim, wrap-round tiers, criss-cross cut.
  championship_dome: {
    sky: [[0, '#070c1f'], [0.6, '#101c44'], [1, '#1f3a7a']],
    fog: ['#0b1330', 70, 150],
    pitch: { a: '#3fa378', b: '#35956b', line: '#ffffff', mow: 'diamond', emblem: 'star' },
    floor: 'polish',
    apron: '#0f1936',
    wall: '#e8edf7', wallTop: '#ffffff', trim: '#ffd75e', deck: '#dbe3f4',
    stand: '#22315f', seat: '#2f6fe4', rail: '#8ea4d8',
    sun: '#eef4ff', sunIntensity: 2.7, sunPos: [-6, 34, 10],
    hemiSky: '#b9ccff', hemiGround: '#2a3a66', hemiIntensity: 1.1,
    crowd: ['#12bcd2', '#f48a2c', '#f3f5ef', '#f6c542', '#5f7fd6', '#e96a64', '#51c998'],
    exposure: 0.84, env: 0.18, lamp: '#eaf3ff', beamOpacity: 0.085, ledAccent: '#f6c542',
  },
};

export interface AnchorView {
  /** Rope attachment point. */
  head: THREE.Vector3;
  glow: number;
}

const ANCHOR_YELLOW = '#f6c542';
const NAVY = '#24344e';
const IVORY = '#f3efe4';
const STEEL = '#8d949c';

type Track = <T extends { dispose(): void }>(d: T) => T;

const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const _c = new THREE.Color();
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);

/** Merges transformed copies of geometries into one (keeps position / normal / uv). */
class Merger {
  private list: THREE.BufferGeometry[] = [];
  add(g: THREE.BufferGeometry, m: THREE.Matrix4): void {
    this.list.push(g.clone().applyMatrix4(m));
  }
  addAt(g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): void {
    this.add(g, new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'XYZ')), _s.set(sx, sy, sz)));
  }
  get empty(): boolean {
    return this.list.length === 0;
  }
  build(): THREE.BufferGeometry | null {
    if (!this.list.length) return null;
    const out = mergeGeometries(this.list, false);
    for (const g of this.list) g.dispose();
    this.list = [];
    return out;
  }
}

/**
 * Adds one primitive to a scenery bucket: bucket key, unit geometry, colour, size, position, then yaw /
 * pitch / roll (applied Y, X, Z) and how much to darken it toward its base (a cheap ambient-occlusion cue).
 *
 * Buckets: `m` matte paint, `s` satin paint, `g` metal, `d` double-sided cloth and leaves, `e` unlit glow.
 * An upper-case key is the same material in a mesh that casts shadows.
 */
type Put = (k: string, g: THREE.BufferGeometry, col: string, sx: number, sy: number, sz: number, x: number, y: number, z: number, ry?: number, rx?: number, rz?: number, ao?: number) => void;

/**
 * Static scenery baked into one vertex-coloured geometry per material, so a whole venue's props cost a
 * handful of draw calls.
 */
class Bake {
  private parts = new Map<string, THREE.BufferGeometry[]>();
  /** Buckets that get world-space UVs (texture repeats per world unit; negative = plain tops). */
  readonly uv = new Map<string, number>();

  readonly put: Put = (k, g, col, sx, sy, sz, x, y, z, ry = 0, rx = 0, rz = 0, ao = 0) => {
    this.add(k, g, col, _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz)), ao);
  };

  add(k: string, g: THREE.BufferGeometry, col: string, m: THREE.Matrix4, ao = 0): void {
    const c = g.clone().applyMatrix4(m);
    const pos = c.attributes.position;
    const n = pos.count;
    if (!c.attributes.color) {
      _c.set(col);
      const arr = new Float32Array(n * 3);
      let y0 = Infinity;
      let y1 = -Infinity;
      if (ao > 0)
        for (let i = 0; i < n; i++) {
          const y = pos.getY(i);
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      const span = y1 - y0;
      for (let i = 0; i < n; i++) {
        const f = ao > 0 && span > 0.05 ? 1 - ao * (1 - (pos.getY(i) - y0) / span) : 1;
        arr[i * 3] = _c.r * f;
        arr[i * 3 + 1] = _c.g * f;
        arr[i * 3 + 2] = _c.b * f;
      }
      c.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    const s = this.uv.get(k);
    if (s) {
      const nor = c.attributes.normal;
      const uv = c.attributes.uv;
      const a = Math.abs(s);
      for (let i = 0; i < n; i++) {
        const top = Math.abs(nor.getY(i)) > 0.6;
        if (top && s < 0) uv.setXY(i, 0.004, 0.004);
        else if (top) uv.setXY(i, pos.getX(i) * a, pos.getZ(i) * a);
        else uv.setXY(i, (Math.abs(nor.getX(i)) > 0.6 ? pos.getZ(i) : pos.getX(i)) * a, pos.getY(i) * a);
      }
    }
    let list = this.parts.get(k);
    if (!list) this.parts.set(k, (list = []));
    list.push(c);
  }

  /** One merged geometry per bucket; the caller owns them. */
  build(): Map<string, THREE.BufferGeometry> {
    const out = new Map<string, THREE.BufferGeometry>();
    for (const [k, list] of this.parts) {
      const g = mergeGeometries(list, false);
      for (const p of list) p.dispose();
      if (g) out.set(k, g);
    }
    this.parts.clear();
    return out;
  }
}

function bucketMaterial(k: string, low: boolean): THREE.Material {
  if (k === 'e') return new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: k === 's' ? 0.45 : k === 'g' ? 0.34 : 0.84,
    metalness: k === 'g' ? (low ? 0.15 : 0.55) : 0,
    side: k === 'd' ? THREE.DoubleSide : THREE.FrontSide,
  });
}

interface Ember {
  x: number;
  y: number;
  z: number;
  vy: number;
  sway: number;
}

export class ArenaView {
  readonly group = new THREE.Group();
  readonly anchors: AnchorView[] = [];
  readonly background: THREE.Texture;
  readonly fog: THREE.Fog | null;
  readonly sun: THREE.DirectionalLight;
  /** Renderer exposure for this venue (ACES filmic). */
  readonly exposure: number;
  /** `scene.environmentIntensity` for this venue on medium / high. */
  readonly envIntensity: number;
  private th: Theme;
  private rnd: () => number;
  private bake = new Bake();
  private put: Put = this.bake.put;
  private custom = new Map<string, { mat: THREE.Material; cast: boolean; order: number }>();
  /** Half width and north / south edges of the deck the venue stands on (pier, rooftop); null = open floor. */
  private platform: [number, number, number] | null = null;
  private crowd: THREE.InstancedMesh | null = null;
  private crowdU = { time: { value: 0 }, excite: { value: 0 } };
  private crowdFlags: THREE.InstancedMesh | null = null;
  private flagPos: Float32Array = new Float32Array(0);
  private bigFlags: number[] = [];
  private goalMats: THREE.MeshStandardMaterial[] = [];
  private netMeshes: THREE.Object3D[] = [];
  private goalFlash: [number, number] = [0, 0];
  private excitement = 0;
  private disposables: { dispose(): void }[] = [];
  private dummy = new THREE.Object3D();
  private instanced: THREE.InstancedMesh[] = [];
  private shadows: boolean;
  private rings!: THREE.InstancedMesh;
  private ringBase: THREE.Matrix4[] = [];
  private hiRing!: THREE.Mesh;
  private halo!: THREE.Mesh;
  private hiIndex = -1;
  private ledMat: THREE.MeshBasicMaterial | null = null;
  private ledTex: THREE.Texture | null = null;
  private ledFlashColor = new THREE.Color();
  private beamMat: THREE.MeshBasicMaterial | null = null;
  private embers: THREE.Points | null = null;
  private emberData: Ember[] = [];
  private flashes: THREE.Points | null = null;
  private flashLife: Float32Array = new Float32Array(0);
  private beaconMat: THREE.MeshBasicMaterial | null = null;
  private fireMat: THREE.MeshBasicMaterial | null = null;
  private fireLights: THREE.PointLight[] = [];
  private water: THREE.Texture | null = null;
  private spinners: THREE.Object3D[] = [];
  private sweepers: THREE.Object3D[] = [];
  private lastFlagTime = -1;

  constructor(private arena: ArenaDef, private quality: Quality, private teamColors: [string, string]) {
    const th = THEMES[arena.id];
    this.th = th;
    const hx = arena.length / 2;
    const hz = arena.width / 2;
    const shadows = quality === 'high';
    this.shadows = shadows;
    this.exposure = th.exposure;
    this.envIntensity = th.env;
    this.rnd = seededRandom(arena.id.length * 7919 + Math.round(arena.width * 31));
    if (arena.id === 'harbor_park') this.platform = [hx + 8, -(hz + 9.5), hz + 8.5];
    else if (arena.id === 'skyline_stadium') this.platform = [hx + 8.6, -(hz + 10.5), hz + 8.5];

    this.background = this.track(skyTexture(th.sky));
    this.fog = th.fog ? new THREE.Fog(th.fog[0], th.fog[1], th.fog[2]) : null;

    // On medium / high the PMREM environment adds soft fill, so the hemisphere light steps back.
    const hemi = new THREE.HemisphereLight(th.hemiSky, th.hemiGround, th.hemiIntensity * (quality === 'low' ? 0.8 : 0.6));
    this.group.add(hemi);
    this.sun = new THREE.DirectionalLight(th.sun, th.sunIntensity);
    this.sun.position.set(...th.sunPos);
    if (shadows) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(2048, 2048);
      const sc = this.sun.shadow.camera;
      sc.left = -hx - 6;
      sc.right = hx + 6;
      sc.top = hz + 8;
      sc.bottom = -hz - 8;
      sc.near = 1;
      sc.far = 90;
      this.sun.shadow.bias = -0.0005;
      this.sun.shadow.normalBias = 0.03;
      this.sun.shadow.radius = 2.5;
    }
    this.group.add(this.sun, this.sun.target);

    if (th.beamOpacity > 0 && quality !== 'low') {
      this.beamMat = this.track(
        new THREE.MeshBasicMaterial({ map: this.track(beamTexture()), color: th.lamp, transparent: true, opacity: th.beamOpacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
      );
    }
    // soft light pools on the floor (furnace glow, neon spill, spotlights): one additive mesh
    this.custom.set('pool', {
      mat: this.track(new THREE.MeshBasicMaterial({ map: blobTexture(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })),
      cast: false,
      order: 1,
    });

    this.buildGround(th, hx, hz);
    this.buildWalls(th, hx, hz);
    this.buildGoals(hx);
    this.buildAnchors(hx);
    this.buildStands(th, hx, hz);
    if (arena.id === 'harbor_park') this.harbor(hx, hz);
    else if (arena.id === 'foundry_court') this.foundry(hx, hz);
    else if (arena.id === 'skyline_stadium') this.skyline(th, hx, hz);
    else this.dome(hx, hz);
    this.flush();
  }

  // ------------------------------------------------------------------ helpers

  private track<T extends { dispose(): void }>(d: T): T {
    this.disposables.push(d);
    return d;
  }

  private std(color: string, rough = 0.8, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
    return this.track(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }));
  }

  /** Box centred on (x, y, z); tall boxes are shaded darker toward the ground. */
  private bx(k: string, col: string, sx: number, sy: number, sz: number, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, ao = 0.16): void {
    this.put(k, BOX, col, sx, sy, sz, x, y, z, ry, rx, rz, sy > 0.3 && k !== 'e' ? ao : 0);
  }

  /** Upright cylinder (or one tilted by rx / rz) centred on (x, y, z). */
  private cyl(k: string, col: string, r: number, h: number, x: number, y: number, z: number, rx = 0, rz = 0): void {
    this.put(k, CYL, col, r, h, r, x, y, z, 0, rx, rz, h > 0.6 && !rx && !rz && k !== 'e' ? 0.14 : 0);
  }

  /** Soft additive light pool on the floor. */
  private pool(col: string, x: number, z: number, sx: number, sz: number, y = 0.03): void {
    this.put('pool', PLANE, col, sx, sz, 1, x, y, z, 0, -Math.PI / 2);
  }

  /** Turns the baked buckets into meshes: one per material, shadow casters separate. */
  private flush(): void {
    const mats = new Map<string, THREE.Material>();
    for (const [k, g] of this.bake.build()) {
      const custom = this.custom.get(k);
      const lk = k.toLowerCase();
      let mat = custom?.mat ?? mats.get(lk);
      if (!mat) mats.set(lk, (mat = this.track(bucketMaterial(lk, this.quality === 'low'))));
      const mesh = this.mesh(g, mat, custom ? custom.cast : k !== lk, true)!;
      if (custom) mesh.renderOrder = custom.order;
    }
  }

  private mesh(geo: THREE.BufferGeometry | null, m: THREE.Material, cast = false, receive = false): THREE.Mesh | null {
    if (!geo) return null;
    this.track(geo);
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = this.shadows && cast;
    mesh.receiveShadow = this.shadows && receive;
    this.group.add(mesh);
    return mesh;
  }

  // ------------------------------------------------------------------ pitch

  private buildGround(th: Theme, hx: number, hz: number): void {
    const arena = this.arena;
    const low = this.quality === 'low';
    // The venue floor: a deck (pier, rooftop) with the surroundings beyond it, or a wide hall floor.
    const pf = this.platform;
    const fw = pf ? pf[0] * 2 : 190;
    const fd = pf ? pf[2] - pf[1] : 140;
    const tiles = this.track(floorTexture(th.floor));
    tiles.repeat.set(fw / 4, fd / 4);
    const polished = th.floor === 'polish';
    const floor = new THREE.Mesh(this.track(new THREE.PlaneGeometry(fw, fd)), this.std('#ffffff', polished ? 0.42 : 0.86, { map: tiles, metalness: polished && !low ? 0.25 : 0 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.03, pf ? (pf[1] + pf[2]) / 2 : 0);
    floor.receiveShadow = this.shadows;
    this.group.add(floor);
    // Apron: a darker band round the court (and under the goals) that sets the walls off from the floor.
    const ap = 1.6;
    const aw = arena.length + 2 * (arena.goalDepth + 1.5);
    for (const s of [-1, 1]) {
      this.bx('m', th.apron, aw, 0.02, ap, 0, -0.012, s * (hz + 0.55 + ap / 2));
      this.bx('m', th.apron, arena.goalDepth + 1.5, 0.02, arena.width + 1.1, s * (hx + (arena.goalDepth + 1.5) / 2), -0.012, 0);
    }

    const pt = this.track(pitchTexture(arena, th.pitch, 1024, low));
    const fm = this.std('#ffffff', 0.9, { map: pt });
    if (!low) {
      const nt = this.track(turfNormalTexture());
      nt.repeat.set(arena.length / 3.2, arena.width / 3.2);
      fm.normalMap = nt;
      fm.normalScale.set(0.45, 0.45);
    }
    const field = new THREE.Mesh(this.track(new THREE.PlaneGeometry(arena.length, arena.width)), fm);
    field.rotation.x = -Math.PI / 2;
    field.receiveShadow = this.shadows;
    this.group.add(field);
    // Medium / high lay the markings as geometry so they stay sharp on dense phone screens and in close-ups.
    if (!low) {
      const lm = this.std(th.pitch.line, 0.75, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const lines = this.mesh(markGeometry(pitchMarks(arena), 0.12), lm, false, true)!;
      lines.position.y = 0.004;
    }
  }

  private buildWalls(th: Theme, hx: number, hz: number): void {
    const arena = this.arena;
    const WH = 0.62;
    const WT = 0.55;
    const c = arena.corner;
    const gh = arena.goalWidth / 2;
    const wall = (x1: number, z1: number, x2: number, z2: number) => {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const ang = Math.atan2(z2 - z1, x2 - x1);
      // offset outward (left normal of travel direction, walls are listed clockwise seen from above)
      const nx = Math.sin(ang);
      const nz = -Math.cos(ang);
      const cx = (x1 + x2) / 2 + nx * (WT / 2);
      const cz = (z1 + z2) / 2 + nz * (WT / 2);
      this.bx('M', th.wall, len + WT * 0.5, WH, WT, cx, WH / 2, cz, -ang, 0, 0, 0.24);
      this.bx('s', th.wallTop, len + WT * 0.5, 0.08, WT + 0.08, cx, WH + 0.04, cz, -ang);
      // energised trim: a steady glowing strip on the rail, just inside the playing edge
      this.bx('e', th.trim, len + 0.1, 0.03, 0.085, (x1 + x2) / 2 + nx * 0.1, WH + 0.09, (z1 + z2) / 2 + nz * 0.1, -ang);
    };
    // Listed so the outward normal (sin, -cos) points away from the field.
    wall(-(hx - c), -hz, hx - c, -hz); // north
    wall(hx - c, -hz, hx, -(hz - c));
    wall(hx, -(hz - c), hx, -gh);
    wall(hx, gh, hx, hz - c);
    wall(hx, hz - c, hx - c, hz);
    wall(hx - c, hz, -(hx - c), hz); // south
    wall(-(hx - c), hz, -hx, hz - c);
    wall(-hx, hz - c, -hx, gh);
    wall(-hx, -gh, -hx, -(hz - c));
    wall(-hx, -(hz - c), -(hx - c), -hz);
    // yellow caps at the corner joints
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        this.bx('S', ANCHOR_YELLOW, 0.8, WH + 0.22, 0.8, sx * (hx - c + 0.05), (WH + 0.22) / 2, sz * (hz + WT / 2), 0, 0, 0, 0.12);
        this.bx('S', ANCHOR_YELLOW, 0.8, WH + 0.22, 0.8, sx * (hx + WT / 2), (WH + 0.22) / 2, sz * (hz - c + 0.05), 0, 0, 0, 0.12);
      }
    // corner deck fill (outside the diagonal walls)
    const tri = new THREE.Shape();
    tri.moveTo(0, 0);
    tri.lineTo(c + 1, 0);
    tri.lineTo(0, c + 1);
    tri.closePath();
    const triG = new THREE.ShapeGeometry(tri);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        // mirror by rotation instead of negative scale so all four keep the same winding
        const m = new THREE.Matrix4().makeTranslation(sx * (hx + 0.5), 0.02, sz * (hz + 0.5));
        m.multiply(new THREE.Matrix4().makeRotationY(sx < 0 ? (sz < 0 ? -Math.PI / 2 : 0) : sz < 0 ? Math.PI : Math.PI / 2));
        m.multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
        this.bake.add('m', triG, th.deck, m);
      }
    triG.dispose();

    // --- LED advertising boards on the inner face of the far wall, the end walls and the near wall's outside
    this.ledTex = this.track(ledBoardTexture(this.teamColors, arena.name, th.ledAccent));
    this.ledMat = this.track(new THREE.MeshBasicMaterial({ map: this.ledTex, toneMapped: false, color: new THREE.Color(0.92, 0.92, 0.92) }));
    const led = new LedStrip(0.44);
    const y0 = 0.1;
    const e = 0.006;
    led.quad(-(hx - c) + 0.2, -hz + e, hx - c - 0.2, -hz + e, y0, 0, 1);
    led.quad(hx - c - 0.2, hz + WT + e, -(hx - c) + 0.2, hz + WT + e, y0, 0, 1);
    for (const sx of [-1, 1]) {
      led.quad(sx * (hx - e), -(hz - c) + 0.2, sx * (hx - e), -gh - 0.3, y0, -sx, 0);
      led.quad(sx * (hx - e), gh + 0.3, sx * (hx - e), hz - c - 0.2, y0, -sx, 0);
    }
    this.mesh(led.build(), this.ledMat);
  }

  private buildGoals(hx: number): void {
    const arena = this.arena;
    const gh = arena.goalWidth / 2;
    const GH = 2.15;
    const gd = arena.goalDepth;
    const netT = this.track(netMeshTexture());
    const netMat = this.track(
      new THREE.MeshStandardMaterial({ map: netT, color: '#ffffff', transparent: true, opacity: 0.85, alphaTest: 0.08, side: THREE.DoubleSide, depthWrite: false, roughness: 0.8 }),
    );
    // goal floor tint and goal-line glow for both ends share one vertex-coloured mesh each
    this.custom.set('tint', { mat: this.track(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.28, depthWrite: false })), cast: false, order: 0 });
    this.custom.set('line', { mat: this.track(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false })), cast: false, order: 0 });
    for (const side of [0, 1] as const) {
      const sx = side === 0 ? -1 : 1;
      const color = this.teamColors[side];
      const gm = this.std(color, 0.22, { metalness: 0.35, emissive: new THREE.Color(color), emissiveIntensity: 0.35 });
      this.goalMats.push(gm);
      const gx = sx * hx;
      // Rounded tubular frame: posts and crossbar with ball joints, a slimmer back frame.
      const f = new Merger();
      const R = 0.13;
      const r = 0.075;
      const tube = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, rad: number) => {
        const a = new THREE.Vector3(x1, y1, z1);
        const b = new THREE.Vector3(x2, y2, z2);
        const len = a.distanceTo(b);
        const q = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, b.clone().sub(a).normalize());
        f.add(TUBE, new THREE.Matrix4().compose(a.add(b).multiplyScalar(0.5), q, _s.set(rad, len, rad)));
      };
      const joint = (x: number, y: number, z: number, rad: number) => f.addAt(BALL, x, y, z, 0, 0, 0, rad, rad, rad);
      const bx = gx + sx * gd;
      tube(gx, 0, -gh, gx, GH, -gh, R);
      tube(gx, 0, gh, gx, GH, gh, R);
      tube(gx, GH, -gh, gx, GH, gh, R);
      joint(gx, GH, -gh, R);
      joint(gx, GH, gh, R);
      for (const z of [-gh, gh]) {
        tube(gx, GH, z, bx, GH * 0.86, z, r);
        tube(bx, 0, z, bx, GH * 0.86, z, r);
        tube(gx, 0.04, z, bx, 0.04, z, r * 0.8);
        joint(bx, GH * 0.86, z, r);
      }
      tube(bx, GH * 0.86, -gh, bx, GH * 0.86, gh, r);
      tube(bx, 0.04, -gh, bx, 0.04, gh, r * 0.8);
      this.mesh(f.build(), gm, true);

      this.put('tint', PLANE, color, gd, arena.goalWidth, 1, gx + (sx * gd) / 2, 0.012, 0, 0, -Math.PI / 2);
      this.put('line', PLANE, color, 0.24, arena.goalWidth, 1, gx - sx * 0.12, 0.014, 0, 0, -Math.PI / 2);

      // net: one merged mesh per goal, UVs in world units so the mesh cells stay square; the back sags outward
      const cell = 0.32;
      const n = new Merger();
      const back = new THREE.PlaneGeometry(arena.goalWidth, GH * 0.86, 10, 6);
      const bp = back.attributes.position;
      const buv = back.attributes.uv;
      for (let i = 0; i < bp.count; i++) {
        const u = buv.getX(i);
        const v = buv.getY(i);
        bp.setZ(i, Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, v * 1.1)) * 0.22);
        buv.setXY(i, (u * arena.goalWidth) / cell, (v * GH * 0.86) / cell);
      }
      back.computeVertexNormals();
      n.addAt(back, sx * gd, (GH * 0.86) / 2, 0, 0, sx > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
      back.dispose();
      // side nets: trapezoids from the post (full height) back to the lower back frame
      for (const z of [-gh, gh]) {
        const g = new THREE.PlaneGeometry(gd, GH, 4, 4);
        const p = g.attributes.position;
        const uv = g.attributes.uv;
        for (let i = 0; i < p.count; i++) {
          const u = uv.getX(i);
          const v = uv.getY(i);
          p.setY(i, v * GH * (1 - 0.14 * u));
          uv.setXY(i, (u * gd) / cell, (v * GH) / cell);
        }
        g.computeVertexNormals();
        n.addAt(g, (sx * gd) / 2, 0, z, 0, sx > 0 ? 0 : Math.PI, 0);
        g.dispose();
      }
      const top = new THREE.PlaneGeometry(gd, arena.goalWidth, 4, 6);
      const tp = top.attributes.position;
      const tuv = top.attributes.uv;
      for (let i = 0; i < tp.count; i++) {
        const u = tuv.getX(i);
        const v = tuv.getY(i);
        // slopes down from the crossbar to the back frame and sags a little in the middle
        tp.setZ(i, -GH * 0.14 * (sx > 0 ? u : 1 - u) - Math.sin(Math.PI * v) * Math.sin(Math.PI * u) * 0.08);
        tuv.setXY(i, (u * gd) / cell, (v * arena.goalWidth) / cell);
      }
      top.computeVertexNormals();
      n.addAt(top, (sx * gd) / 2, GH, 0, -Math.PI / 2, 0, 0);
      top.dispose();
      const netGeo = n.build();
      if (netGeo) {
        this.track(netGeo);
        const net = new THREE.Mesh(netGeo, netMat);
        net.position.set(gx, 0, 0);
        net.renderOrder = 1;
        this.group.add(net);
        this.netMeshes.push(net);
      }
      // backstop behind the goal: wall in the venue's colours with the club's colour along its rail
      const wx = gx + sx * (gd + 0.55 / 2 + 0.05);
      this.bx('M', this.th.wall, 0.55, 0.62, arena.goalWidth + 1.2, wx, 0.31, 0, 0, 0, 0, 0.24);
      this.bx('s', color, 0.63, 0.08, arena.goalWidth + 1.28, wx, 0.66, 0);
    }
  }

  private buildAnchors(hx: number): void {
    const arena = this.arena;
    const low = this.quality === 'low';
    const ringMat = this.std(ANCHOR_YELLOW, 0.25, { metalness: low ? 0.1 : 0.45, emissive: new THREE.Color(ANCHOR_YELLOW), emissiveIntensity: 0.15 });
    // All anchor rings are one instanced mesh; the highlighted one is swapped for a glowing ring and halo.
    this.rings = new THREE.InstancedMesh(TORUS, ringMat, arena.anchors.length);
    this.rings.castShadow = this.shadows;
    const post = '#cfd5db';
    const rotor = new Merger();
    const marks = new Merger();
    const d = this.dummy;
    arena.anchors.forEach((a, i) => {
      const head = new THREE.Vector3();
      if (a.kind === 'rail') {
        // which wall are we on?
        const onEnd = Math.abs(a.x) > hx;
        const ox = onEnd ? Math.sign(a.x) : 0;
        const oz = onEnd ? 0 : Math.sign(a.z);
        const px = a.x + ox * 0.15;
        const pz = a.z + oz * 0.15;
        this.cyl('G', post, 0.2, 2.3, px, 1.15, pz);
        this.cyl('g', NAVY, 0.29, 0.14, px, 0.07, pz);
        this.cyl('s', ANCHOR_YELLOW, 0.225, 0.2, px, 1.3, pz);
        this.bx('S', ANCHOR_YELLOW, 0.78, 0.5, 0.78, px, 2.5, pz, 0, 0, 0, 0.1);
        this.bx('g', NAVY, 0.84, 0.07, 0.84, px, 2.27, pz);
        this.bx('G', NAVY, 0.36, 0.2, 0.36, px - ox * 0.38, 2.44, pz - oz * 0.38);
        // status light facing the pitch
        this.bx('e', '#8dffb0', onEnd ? 0.02 : 0.3, 0.05, onEnd ? 0.3 : 0.02, px - ox * 0.395, 2.62, pz - oz * 0.395);
        head.set(a.x - ox * 0.5, 2.1, a.z - oz * 0.5);
        d.rotation.set(0, onEnd ? Math.PI / 2 : 0, 0);
      } else {
        // Hovering anchor drone: a yellow body with the ring underneath; no structure crosses the pitch.
        head.set(a.x, 3.2, a.z);
        this.bx('S', ANCHOR_YELLOW, 0.7, 0.32, 0.7, a.x, 3.62, a.z);
        this.bx('g', NAVY, 1.5, 0.08, 0.16, a.x, 3.82, a.z, Math.PI / 4);
        this.bx('g', NAVY, 1.5, 0.08, 0.16, a.x, 3.82, a.z, -Math.PI / 4);
        this.bx('e', '#8dffb0', 0.3, 0.04, 0.3, a.x, 3.45, a.z);
        for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          rotor.addAt(DISC, a.x + dx * 0.53, 3.88, a.z + dz * 0.53, -Math.PI / 2, 0, 0, 0.36, 0.36, 1);
          this.cyl('g', NAVY, 0.05, 0.1, a.x + dx * 0.53, 3.86, a.z + dz * 0.53);
        }
        marks.addAt(PLANE, a.x, 0.016, a.z, -Math.PI / 2, 0, 0, 1.5, 1.5, 1);
        d.rotation.set(Math.PI / 2, 0, 0);
      }
      d.position.copy(head);
      d.scale.setScalar(1);
      d.updateMatrix();
      this.rings.setMatrixAt(i, d.matrix);
      this.ringBase.push(d.matrix.clone());
      this.anchors.push({ head, glow: 0 });
    });
    this.rings.instanceMatrix.needsUpdate = true;
    this.rings.computeBoundingSphere();
    this.hiRing = new THREE.Mesh(TORUS, this.track(new THREE.MeshBasicMaterial({ color: '#ffe46b', toneMapped: false })));
    this.hiRing.visible = false;
    this.halo = new THREE.Mesh(PLANE, this.track(new THREE.MeshBasicMaterial({ map: this.track(ringTexture(0.72)), color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, depthTest: false, toneMapped: false })));
    this.halo.renderOrder = 5;
    this.halo.visible = false;
    this.group.add(this.rings, this.hiRing, this.halo);
    this.instanced.push(this.rings);
    if (!rotor.empty) {
      const m = this.mesh(rotor.build(), this.track(new THREE.MeshBasicMaterial({ map: this.track(ringTexture(0.15)), color: '#dfe7f2', transparent: true, opacity: 0.35, depthWrite: false })));
      if (m) m.renderOrder = 2;
      // dashed ground rings under the hovering anchors
      this.mesh(marks.build(), this.track(new THREE.MeshBasicMaterial({ map: this.track(ringTexture(0.8, 14)), color: ANCHOR_YELLOW, transparent: true, opacity: 0.45, depthWrite: false })));
    }
  }

  // ------------------------------------------------------------------ stands and crowd

  private buildStands(th: Theme, hx: number, hz: number): void {
    const id = this.arena.id;
    const gd = this.arena.goalDepth;
    const dome = id === 'championship_dome';
    /** x, y, z, section: 0 / 1 = that club's end, 2 = neutral, 3 / 4 = leaning toward club 0 / 1. */
    const seats: number[] = [];
    const backC = shade(th.seat, -0.28);
    /**
     * One terrace step: riser, bench and backrest. `ax` 0 runs along x and 1 along z; (ox, oz) points away
     * from the pitch. Registers the seats for the crowd.
     */
    const row = (x: number, z: number, len: number, h: number, ax: 0 | 1, ox: number, oz: number, sec: number, sp = 0.75, deep = 1.3) => {
      this.bx('m', th.stand, ax ? deep : len, h, ax ? len : deep, x, h / 2, z, 0, 0, 0, 0.3);
      const sl = len - 0.1;
      this.bx('s', th.seat, ax ? 0.42 : sl, 0.12, ax ? sl : 0.42, x + ox * 0.3, h + 0.06, z + oz * 0.3);
      this.bx('s', backC, ax ? 0.07 : sl, 0.3, ax ? sl : 0.07, x + ox * 0.58, h + 0.27, z + oz * 0.58, 0, 0, 0, 0);
      const n = Math.floor(len / sp);
      const s0 = -((n - 1) * sp) / 2;
      for (let i = 0; i < n; i++) seats.push(ax ? x : x + s0 + i * sp, h, ax ? z + s0 + i * sp : z, sec);
    };

    // north stand: three blocks of three steps with stairs between them
    const z0 = -hz - 2.2;
    const pitchN = (hx * 2 - 4) / 3;
    const bw = pitchN - 0.8;
    for (let b = -1; b <= 1; b++) {
      const cx = b * pitchN;
      for (let t = 0; t < 3; t++) {
        const h = 0.5 + t * 0.55;
        row(cx, z0 - t * 1.3, bw, h, 0, 0, -1, b === 0 ? 2 : b < 0 ? 3 : 4);
        this.bx('g', th.rail, bw, 0.04, 0.04, cx, h + 0.42, z0 - t * 1.3 + 0.62);
      }
      if (b < 1) for (let t = 0; t < 3; t++) this.bx('m', shade(th.stand, 0.16), 0.8, 0.3 + t * 0.55, 1.3, cx + pitchN / 2, (0.3 + t * 0.55) / 2, z0 - t * 1.3, 0, 0, 0, 0.3);
      this.standRoof(th, cx, bw, z0);
    }
    // end stands behind each goal, dressed in the colours of the club defending that end
    for (const sx of [-1, 1]) {
      const x0 = sx * (hx + gd + 2.4);
      const len = hz * 2 - 5;
      const tc = this.teamColors[sx < 0 ? 0 : 1];
      for (let t = 0; t < 2; t++) {
        const h = 0.5 + t * 0.55;
        row(x0 + sx * t * 1.3, 0, len, h, 1, sx, 0, sx < 0 ? 0 : 1, 0.8);
        this.bx('g', th.rail, 0.04, 0.04, len, x0 + sx * t * 1.3 - sx * 0.62, h + 0.42, 0);
      }
      if (!dome) {
        // club board leaning back behind the top row, with a pale stripe along its upper edge
        this.bx('d', tc, 0.08, 1.25, len, x0 + sx * 2.35, 1.75, 0, 0, 0, -sx * 0.55, 0);
        this.bx('d', '#f4f1e6', 0.09, 0.16, len, x0 + sx * 2.64, 2.22, 0, 0, 0, -sx * 0.55, 0);
        for (const s of [-1, 1]) {
          this.cyl('g', STEEL, 0.05, 3.3, x0 + sx * 2.9, 1.65, s * (len / 2 + 0.2));
          this.bigFlags.push(x0 + sx * 2.9, 1.1, s * (len / 2 + 0.2), sx < 0 ? 0 : 1);
        }
      }
    }
    if (dome) {
      // upper tiers all round for the big-match feel, set back behind a glowing ribbon board
      const blue = '#3d8bff';
      const gold = '#ffd75e';
      for (let t = 0; t < 4; t++) row(0, z0 - 4.9 - t * 1.4, hx * 2 + 16, 2.6 + t * 0.7, 0, 0, -1, 2, 0.75, 1.4);
      this.bx('e', blue, hx * 2 + 16, 0.42, 0.06, 0, 2.25, z0 - 4.17);
      this.bx('e', gold, hx * 2 + 16, 0.06, 0.07, 0, 2.52, z0 - 4.16);
      for (const sx of [-1, 1]) {
        for (let t = 0; t < 3; t++) row(sx * (hx + gd + 5.2 + t * 1.4), -2, hz * 2 + 8, 1.7 + t * 0.7, 1, sx, 0, sx < 0 ? 0 : 1, 0.8, 1.4);
        const fx = sx * (hx + gd + 4.47);
        this.bx('e', blue, 0.06, 0.4, hz * 2 + 8, fx, 1.38, -2);
        this.bx('e', gold, 0.07, 0.06, hz * 2 + 8, fx, 1.64, -2);
      }
      // low south terrace: closes the bowl without rising into the camera's view of the pitch
      for (let t = 0; t < 2; t++) row(0, hz + 4.9 + t * 1.3, hx * 2 + 6, 0.5 + t * 0.55, 0, 0, 1, 2);
    }
    this.buildCrowd(th, seats, hx);

    // venue sign on the camera-side wall
    const sign = new THREE.Mesh(PLANE, this.track(new THREE.MeshBasicMaterial({ map: this.track(labelTexture(this.arena.name, '#f3f5ef', '#17273e')), transparent: true })));
    sign.scale.set(7.5, 1.4, 1);
    sign.rotation.x = -0.95;
    sign.position.set(0, 0.5, hz + 1.9);
    this.group.add(sign);
  }

  /** Cover over one block of the north stand, in the venue's own style. */
  private standRoof(th: Theme, cx: number, bw: number, z0: number): void {
    const id = this.arena.id;
    if (id === 'harbor_park') {
      // striped canvas awning on slim white posts
      const n = 9;
      const w = (bw + 0.6) / n;
      for (let i = 0; i < n; i++) this.bx('d', i % 2 ? '#fdf9ee' : '#f6c542', w, 0.05, 2.7, cx - (bw + 0.6) / 2 + (i + 0.5) * w, 3.9, z0 - 3.0, 0, 0.3);
      this.bx('s', '#fdf9ee', bw + 0.7, 0.2, 0.06, cx, 3.42, z0 - 1.7);
      for (const s of [-1, 1]) this.cyl('s', '#fdf9ee', 0.07, 4.3, cx + (s * bw) / 2, 2.15, z0 - 4.15);
    } else if (id === 'foundry_court') {
      // hazard-striped kick board along the front of the stand
      const n = Math.round(bw / 0.55);
      for (let i = 0; i < n; i++) this.bx('m', i % 2 ? '#211e1c' : '#e9a23a', bw / n, 0.34, 0.05, cx - bw / 2 + ((i + 0.5) * bw) / n, 0.3, z0 + 0.67, 0, 0, 0, 0);
      // corrugated shed roof on I-beams with work lamps under the eave
      this.bx('m', '#7d3f2c', bw + 0.5, 0.1, 2.8, cx, 3.95, z0 - 3.0, 0, 0.24);
      for (let i = 0; i < 7; i++) this.bx('m', '#5f2e20', 0.12, 0.06, 2.8, cx - bw / 2 + (i * bw) / 6, 4.02, z0 - 3.0, 0, 0.24);
      this.bx('g', '#3b3632', bw + 0.6, 0.16, 0.16, cx, 3.6, z0 - 1.66);
      for (const s of [-1, 1]) this.bx('g', '#3b3632', 0.16, 4.3, 0.16, cx + (s * bw) / 2, 2.15, z0 - 4.15);
      for (const s of [-1, 0, 1]) this.bx('e', '#ffd9a0', 0.5, 0.06, 0.16, cx + s * bw * 0.3, 3.5, z0 - 1.7);
    } else if (id === 'skyline_stadium') {
      // cantilevered slab with a neon edge and a glass back wall
      this.bx('s', '#efeaf6', bw + 0.5, 0.18, 2.6, cx, 3.75, z0 - 3.0);
      this.bx('e', th.trim, bw + 0.5, 0.07, 0.07, cx, 3.7, z0 - 1.68);
      this.bx('s', '#93a8dc', bw, 2.2, 0.08, cx, 2.75, z0 - 4.22, 0, 0, 0, 0.3);
      for (const s of [-1, 1]) this.bx('g', '#d9d4e4', 0.14, 3.7, 0.14, cx + (s * bw) / 2, 1.85, z0 - 4.15);
    }
  }

  /**
   * Robot fans: one instanced mesh (body and head). They sway gently and jump after goals in the vertex
   * shader, so the crowd costs nothing per frame on the CPU. Medium / high add waving flags.
   */
  private buildCrowd(th: Theme, seats: number[], hx: number): void {
    const rnd = this.rnd;
    const fill = this.quality === 'low' ? 0.3 : this.quality === 'medium' ? 0.6 : 0.82;
    const picked: number[] = [];
    for (let i = 0; i < seats.length; i += 4) if (rnd() < fill) picked.push(i);
    if (picked.length) {
      const body = new THREE.CapsuleGeometry(0.2, 0.22, 2, 6);
      const head = new THREE.SphereGeometry(0.17, 7, 5);
      head.translate(0, 0.36, 0);
      const isHead = (g: THREE.BufferGeometry, v: number) => g.setAttribute('aHead', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(v), 1));
      isHead(body, 0);
      isHead(head, 1);
      const geo = this.track(mergeGeometries([body, head], false)!);
      body.dispose();
      head.dispose();
      const mat = this.track(new THREE.MeshStandardMaterial({ roughness: 0.5 }));
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = this.crowdU.time;
        sh.uniforms.uExcite = this.crowdU.excite;
        sh.vertexShader =
          'attribute float aHead;\nuniform float uTime;\nuniform float uExcite;\n' +
          sh.vertexShader
            .replace(
              '#include <color_vertex>',
              `#include <color_vertex>
              float fanSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
              vColor.rgb = mix(vColor.rgb, fanSeed > 0.84 ? vec3(0.03, 0.045, 0.09) : mix(vColor.rgb, vec3(0.9), 0.78), aHead);`,
            )
            .replace(
              '#include <begin_vertex>',
              `#include <begin_vertex>
              float fanPh = fanSeed * 6.2831;
              transformed.x += (transformed.y + 0.3) * (sin(uTime * 5.0 + fanPh) * 0.14 * uExcite + sin(uTime * 0.9 + fanPh * 2.0) * 0.05);
              transformed.y += abs(sin(uTime * 9.0 + fanPh)) * 0.36 * uExcite + sin(uTime * (1.2 + fanSeed) + fanPh) * 0.03;`,
            );
      };
      mat.customProgramCacheKey = () => 'tl-crowd';
      const crowd = new THREE.InstancedMesh(geo, mat, picked.length);
      const col = new THREE.Color();
      const d = this.dummy;
      d.rotation.set(0, 0, 0);
      const flags: number[] = [];
      picked.forEach((si, i) => {
        const sec = seats[si + 3];
        const x = seats[si] + (rnd() - 0.5) * 0.15;
        const y = seats[si + 1] + 0.3;
        const z = seats[si + 2];
        d.position.set(x, y, z);
        d.scale.setScalar(0.88 + rnd() * 0.24);
        d.updateMatrix();
        crowd.setMatrixAt(i, d.matrix);
        // Each end belongs to the club that defends it; the long stands lean left / right and mix in the middle.
        const r = rnd();
        const team = sec < 2 ? (r < 0.7 ? sec : -1) : sec === 2 ? (r < 0.16 ? 0 : r < 0.32 ? 1 : -1) : r < 0.5 ? sec - 3 : r < 0.6 ? 4 - sec : -1;
        if (team >= 0) col.set(this.teamColors[team as 0 | 1]);
        else col.set(th.crowd[Math.floor(rnd() * th.crowd.length)]);
        col.offsetHSL(0, 0, (rnd() - 0.5) * 0.08);
        crowd.setColorAt(i, col);
        if (this.quality !== 'low' && rnd() < 0.08 && flags.length < 60 * 6) flags.push(x + 0.18, y + 0.25, z, rnd() * 6.28, team >= 0 ? team : x < 0 ? 0 : 1, 1);
      });
      crowd.instanceMatrix.needsUpdate = true;
      crowd.computeBoundingSphere();
      crowd.receiveShadow = false;
      this.group.add(crowd);
      this.instanced.push(crowd);
      this.crowd = crowd;
      if (this.quality !== 'low') {
        // big club flags on poles behind the ends
        for (let i = 0; i < this.bigFlags.length; i += 4) flags.push(this.bigFlags[i], this.bigFlags[i + 1], this.bigFlags[i + 2], rnd() * 6.28, this.bigFlags[i + 3], 3.2);
        this.buildFlags(flags);
      }
    }
  }

  private buildFlags(flags: number[]): void {
    if (!flags.length) return;
    const fg = new Merger();
    fg.addAt(BOX, 0, 0.35, 0, 0, 0, 0, 0.03, 0.7, 0.03);
    const cloth = new THREE.PlaneGeometry(0.48, 0.3, 4, 1);
    cloth.translate(0.24, 0.55, 0);
    fg.add(cloth, new THREE.Matrix4());
    cloth.dispose();
    const flagG = this.track(fg.build()!);
    const n = flags.length / 6;
    this.flagPos = new Float32Array(flags);
    this.crowdFlags = new THREE.InstancedMesh(flagG, this.track(new THREE.MeshStandardMaterial({ roughness: 0.7, side: THREE.DoubleSide })), n);
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      col.set(this.teamColors[this.flagPos[i * 6 + 4]]);
      this.crowdFlags.setColorAt(i, col);
    }
    this.crowdFlags.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.crowdFlags.frustumCulled = false;
    this.group.add(this.crowdFlags);
    this.instanced.push(this.crowdFlags);
    this.writeFlags(0);
  }

  // ------------------------------------------------------------------ venues

  /** Adds an open cone from a lamp to a ground point to `m` (apex at the lamp). */
  private beam(m: Merger, from: THREE.Vector3, to: THREE.Vector3, radius: number): void {
    const dir = to.clone().sub(from);
    const len = dir.length();
    const g = new THREE.ConeGeometry(radius, len, 24, 1, true);
    g.translate(0, -len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(DOWN, dir.normalize());
    m.add(g, new THREE.Matrix4().compose(from, q, _s.set(1, 1, 1)));
    g.dispose();
  }

  private addBeams(beams: Merger): void {
    if (!this.beamMat) return;
    const bm = this.mesh(beams.build(), this.beamMat);
    if (bm) bm.renderOrder = 4;
  }

  /** Harbor Park: a pier in a turquoise bay with a pier-head light, parasols, palms and moored boats. */
  private harbor(hx: number, hz: number): void {
    const [PX, PN, PS] = this.platform!;
    const put = this.put;
    const low = this.quality === 'low';
    this.water = buildHarborScenery(this.group, PN, (d) => this.track(d), this.quality === 'high', [PX, PN, PS]);
    // quay wall round the pier with a white kerb
    for (const z of [PN - 0.3, PS + 0.3]) this.bx('m', IVORY, PX * 2 + 1.2, 1.15, 0.6, 0, -0.45, z, 0, 0, 0, 0.4);
    for (const s of [-1, 1]) this.bx('m', IVORY, 0.6, 1.15, PS - PN, s * (PX + 0.3), -0.45, (PN + PS) / 2, 0, 0, 0, 0.4);
    // rope fence along the north and side edges
    const rope = '#d9c7a0';
    for (let x = -PX + 0.9; x < PX; x += (PX * 2 - 1.8) / 16) this.bx('s', '#fdf9ee', 0.11, 0.8, 0.11, x, 0.5, PN + 0.45);
    for (const y of [0.52, 0.8]) this.bx('s', rope, PX * 2 - 1.8, 0.035, 0.035, 0, y, PN + 0.45);
    for (const s of [-1, 1]) {
      for (let z = PN + 2.9; z < hz + 4; z += 2.45) this.bx('s', '#fdf9ee', 0.11, 0.8, 0.11, s * (PX - 0.45), 0.5, z);
      for (const y of [0.52, 0.8]) this.bx('s', rope, 0.035, 0.035, hz + 3.6 - PN, s * (PX - 0.45), y, (PN + hz + 3.6) / 2);
    }
    // pier-head light in the far-left corner
    lighthouse(put, -(hx + 3.6), 0, -(hz + 3.7), 0.6, 'M');
    // beach club in the far-right corner: parasols and loungers
    const shades: [number, number, string][] = [[hx + 1.2, -(hz + 3.4), '#ef5d50'], [hx + 4.0, -(hz + 6.0), '#2f9fc4'], [hx + 6.2, -(hz + 3.0), '#f6c542']];
    for (const [x, z, col] of shades) {
      parasol(put, x, 0, z, col);
      for (const s of [-1, 1]) {
        put('s', BOX, '#fdf9ee', 0.55, 0.07, 1.25, x + s * 0.75, 0.3, z + 0.9, s * 0.25, -0.22);
        put('s', BOX, col, 0.45, 0.08, 0.5, x + s * 0.72, 0.4, z + 0.55, s * 0.25, -0.22);
      }
    }
    // palms: planters by the camera-side corners, two more on the far side
    for (const sx of [-1, 1]) {
      this.bx('M', IVORY, 2.2, 0.5, 2.2, sx * (hx + 3.2), 0.25, hz + 2.6, 0, 0, 0, 0.25);
      palm(put, sx * (hx + 3.2), 0.5, hz + 2.6, 3.4);
      palm(put, sx * (hx + 6.9), 0, -(hz + 7.8), 3.9);
    }
    // jetty on the east side and boats moored round the pier
    const jz = -(hz + 1.2);
    this.bx('m', '#b99a6c', 6, 0.14, 1.3, PX + 3.4, -0.02, jz);
    for (const x of [PX + 1.2, PX + 3.4, PX + 6.2]) for (const s of [-1, 1]) this.cyl('m', '#7b6244', 0.11, 1.5, x, -0.3, jz + s * 0.72);
    const boats: [number, number, number, string, string][] = [
      [PX + 3.2, jz - 2.0, 0.1, '#fdf9ee', '#ef5d50'],
      [PX + 4.4, jz + 2.1, -0.1, '#2f9fc4', ''],
      [-(PX + 2.6), -(hz - 1.5), 1.45, '#f6c542', '#fdf9ee'],
      [-(PX + 3.4), -(hz + 7), 1.7, '#fdf9ee', ''],
      [PX + 2.8, -(hz + 8.2), 1.3, '#ef5d50', '#fdf9ee'],
      [-9, PN - 3.2, 0.2, '#fdf9ee', '#f6c542'],
      [7, PN - 4.4, -0.15, '#2f9fc4', '#fdf9ee'],
      [-11, PS + 4.5, 0.1, '#fdf9ee', '#2f9fc4'],
      [9, PS + 6.5, -0.2, '#ef5d50', '#fdf9ee'],
      [1, PS + 13, 0.3, '#f6c542', ''],
    ];
    for (const [x, z, ry, hull, sail] of low ? boats.slice(0, 7) : boats) boat(put, x, -0.78, z, ry, hull, sail);
    // landing stage on the camera side (seen on tall screens)
    this.bx('m', '#b99a6c', 3.2, 0.14, 9, 0, -0.02, PS + 5);
    for (const z of [PS + 1.5, PS + 5, PS + 9.2]) for (const s of [-1, 1]) this.cyl('m', '#7b6244', 0.12, 1.6, s * 1.75, -0.2, z);
    if (!low) {
      // bunting along the north awnings and gulls wheeling over the water beside the pier
      this.bunting(-hx + 1, hx - 1, -hz - 3.9, 3.38);
      this.gulls(-(PX + 5.5), 3.0, -(hz - 2), 1);
      this.gulls(PX + 6.5, 3.6, -(hz + 5), -1);
    }
  }

  /** A string of small triangular pennants in the team colours and white (one draw call). */
  private bunting(x1: number, x2: number, z: number, y: number): void {
    const n = Math.floor((x2 - x1) / 0.55);
    const pos: number[] = [];
    const colr: number[] = [];
    const cols = [new THREE.Color(this.teamColors[0]), new THREE.Color('#ffffff'), new THREE.Color(this.teamColors[1]), new THREE.Color('#f6c542')];
    for (let i = 0; i < n; i++) {
      const xa = x1 + i * 0.55;
      const xb = xa + 0.4;
      const sag = (t: number) => y - Math.sin(Math.PI * ((t - x1) / (x2 - x1))) * 0.3;
      const xm = (xa + xb) / 2;
      pos.push(xa, sag(xa), z, xm, sag(xm) - 0.32, z, xb, sag(xb), z);
      const c = cols[i % cols.length];
      for (let k = 0; k < 3; k++) colr.push(c.r, c.g, c.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    g.computeVertexNormals();
    this.mesh(g, this.track(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  }

  /** A few gulls circling a point beside the venue (never over the pitch). */
  private gulls(x: number, y: number, z: number, dir: number): void {
    const pos: number[] = [];
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7;
      const r = 2 + (i % 3) * 0.7;
      const cx = Math.cos(a) * r;
      const cz = Math.sin(a) * r;
      const h = (i % 2) * 0.5;
      // heading is the tangent of the circle; wings sweep back and up
      const tx = -Math.sin(a) * dir;
      const tz = Math.cos(a) * dir;
      for (const s of [-1, 1]) pos.push(cx + tx * 0.16, h, cz + tz * 0.16, cx - tx * 0.12, h, cz - tz * 0.12, cx - tx * 0.1 + tz * s * 0.55, h + 0.16, cz - tz * 0.1 - tx * s * 0.55);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const m = this.mesh(g, this.gullMat ?? (this.gullMat = this.track(new THREE.MeshBasicMaterial({ color: '#f7fafc', side: THREE.DoubleSide }))))!;
    m.position.set(x, y, z);
    m.userData.spin = dir * 0.28;
    this.spinners.push(m);
  }
  private gullMat: THREE.MeshBasicMaterial | null = null;

  /** Foundry Court: brick kilns glowing in the far corners, a furnace wall, pipes, crane and rail track. */
  private foundry(hx: number, hz: number): void {
    const low = this.quality === 'low';
    const steel = '#3f3a36';
    const dark = '#211e1c';
    const amber = '#e9a23a';
    const zb = -hz - 9;
    const bt = this.track(brickTexture());
    this.custom.set('brick', { mat: this.std('#ffffff', 0.9, { map: bt, vertexColors: true }), cast: false, order: 0 });
    this.bake.uv.set('brick', 0.5);
    // furnace flames glow (and flicker gently) through one shared material
    this.fireMat = this.track(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
    this.custom.set('fire', { mat: this.fireMat, cast: false, order: 0 });

    // back wall with three furnace mouths
    this.bx('brick', '#b9a79c', hx * 2 + 34, 14, 1, 0, 7, zb, 0, 0, 0, 0.5);
    const sources: [number, number][] = [];
    for (const x of [-hx * 0.7, 0, hx * 0.7]) {
      this.bx('m', '#2a2623', 6.4, 6.4, 0.6, x, 3.2, zb + 0.6, 0, 0, 0, 0.3);
      this.bx('fire', '#ff8a2a', 5, 4.6, 0.02, x, 2.9, zb + 0.95);
      this.bx('fire', '#ffd27a', 3.2, 2.6, 0.02, x, 2.2, zb + 0.97);
      this.bx('g', steel, 6.8, 0.5, 0.9, x, 6.0, zb + 0.75);
      this.pool('#a2470f', x, zb + 4.5, 9, 7);
      sources.push([x, zb + 1.2]);
    }
    for (const x of [-hx - 6, -hx * 0.35, hx * 0.35, hx + 6]) this.bx('g', steel, 0.8, 14, 0.8, x, 7, zb + 0.9, 0, 0, 0, 0.3);
    this.bx('g', steel, hx * 2 + 30, 0.7, 0.9, 0, 12.5, zb + 0.9);
    // brick side walls with hazard kerbs and pipe runs
    for (const sx of [-1, 1]) {
      const wx = sx * (hx + 9.5);
      this.bx('brick', '#a8968c', 1, 9, hz * 2 + 26, wx, 4.5, 0, 0, 0, 0, 0.5);
      for (let i = 0; i < 12; i++) this.bx('m', i % 2 ? dark : amber, 0.2, 0.5, 1.2, wx - sx * 0.55, 1.2, -hz - 4 + i * 2.4, 0, 0, 0, 0);
      this.put('g', CYL, '#2f7f86', 0.22, hz * 2 + 20, 0.22, wx - sx * 0.8, 2.3, -1, 0, Math.PI / 2);
      this.put('g', CYL, '#a8482c', 0.3, hz * 2 + 20, 0.3, wx - sx * 0.9, 3.1, -1, 0, Math.PI / 2);
      for (let z = -hz - 6; z < hz + 8; z += 4.2) this.put('g', CYL, steel, 0.4, 0.2, 0.4, wx - sx * 0.9, 3.1, z, 0, Math.PI / 2);
    }
    // kilns in the far corners: glowing mouth, steel cap, chimney and a pour of metal
    for (const sx of [-1, 1]) {
      const kx = sx * (hx + 5.8);
      const kz = -hz - 5;
      this.bx('brick', '#d8c8bc', 4.4, 3.3, 3.4, kx, 1.65, kz, 0, 0, 0, 0.4);
      this.bx('g', steel, 4.8, 0.3, 3.8, kx, 3.45, kz);
      this.bx('m', dark, 2.9, 2.1, 0.12, kx, 1.05, kz + 1.71, 0, 0, 0, 0);
      this.bx('fire', '#ff7a1f', 2.4, 1.7, 0.05, kx, 0.95, kz + 1.76);
      this.bx('fire', '#ffd27a', 1.5, 1.0, 0.05, kx, 0.7, kz + 1.78);
      this.bx('g', dark, 3.2, 0.28, 0.6, kx, 2.2, kz + 1.9);
      this.cyl('g', steel, 0.75, 8, kx - sx * 0.9, 7.6, kz - 0.5);
      for (const y of [5, 8.4]) this.cyl('s', amber, 0.79, 0.3, kx - sx * 0.9, y, kz - 0.5);
      this.bx('m', dark, 0.9, 0.14, 2.3, kx, 0.05, kz + 2.9);
      this.bx('fire', '#ffb14a', 0.5, 0.05, 2.1, kx, 0.11, kz + 2.9);
      this.pool('#b5500f', kx, kz + 3.4, 9, 7);
      if (!low) {
        const pl = new THREE.PointLight('#ff8a2a', 55, 22, 1.6);
        pl.position.set(kx, 2.2, kz + 3.2);
        this.group.add(pl);
        this.fireLights.push(pl);
      }
      sources.push([kx, kz + 2]);
      // drums, crates and girders stacked by the kiln
      for (const [dx, dz, c2] of [[2.9, 3.2, '#2f7f86'], [3.8, 2.6, '#a8482c'], [3.2, 2.2, amber]] as [number, number, string][]) {
        this.cyl('s', c2, 0.42, 1.05, kx - sx * dx, 0.52, kz + dz);
        this.cyl('s', dark, 0.44, 0.08, kx - sx * dx, 0.8, kz + dz);
      }
      this.bx('m', '#8a6a45', 1.0, 1.0, 1.0, kx - sx * 3.6, 0.5, kz - 0.6, 0.2);
      this.bx('m', '#96754e', 0.9, 0.9, 0.9, kx - sx * 3.5, 1.45, kz - 0.5, -0.3);
      for (let i = 0; i < 3; i++) this.bx('g', '#6f7f8f', 3.2, 0.2, 0.22, kx - sx * 0.2, 0.1 + (i === 2 ? 0.2 : 0), kz + 4.6 + (i === 2 ? 0.15 : i * 0.3), 0.12);
    }
    // hanging lamps with light cones onto the court
    const beams = new Merger();
    for (const x of [-hx * 0.55, 0, hx * 0.55]) {
      this.bx('g', dark, 0.06, 2.5, 0.06, x, 9.2, -hz - 4, 0, 0, 0, 0);
      this.bx('g', steel, 1.9, 0.35, 0.8, x, 8.1, -hz - 4);
      this.bx('e', '#ffe3b0', 1.6, 0.05, 0.6, x, 7.9, -hz - 4);
      if (this.beamMat) this.beam(beams, new THREE.Vector3(x, 7.88, -hz - 4), new THREE.Vector3(x * 1.1, 0, -hz * 0.35), 3.4);
    }
    this.addBeams(beams);
    // overhead crane carrying a ladle (far side only, never over the pitch)
    const cz = -hz - 6.8;
    this.bx('s', amber, hx * 2 + 16, 0.8, 0.8, 0, 11, cz);
    for (const sx of [-1, 1]) this.bx('g', steel, 0.9, 11, 0.9, sx * (hx + 8), 5.5, cz, 0, 0, 0, 0.3);
    this.bx('g', dark, 1.6, 0.6, 1.4, hx * 0.42, 10.5, cz);
    this.bx('g', dark, 0.08, 2.4, 0.08, hx * 0.42, 9.1, cz, 0, 0, 0, 0);
    this.cyl('g', steel, 0.8, 1.2, hx * 0.42, 7.4, cz);
    this.put('fire', CYL, '#ffb14a', 0.68, 0.06, 0.68, hx * 0.42, 8.02, cz);
    // rail track with an ore cart on the camera side (seen on tall screens)
    const tz = hz + 7.2;
    for (const s of [-0.6, 0.6]) this.bx('g', '#8d8780', hx * 2 + 30, 0.12, 0.14, 0, 0.06, tz + s);
    for (let x = -hx - 14; x <= hx + 14; x += 1.6) this.bx('m', '#2b2622', 0.34, 0.06, 2.0, x, 0.02, tz);
    this.bx('g', steel, 2.6, 0.9, 1.5, -hx * 0.4, 0.75, tz, 0, 0, 0, 0.25);
    this.bx('fire', '#ff9a3a', 2.2, 0.08, 1.1, -hx * 0.4, 1.2, tz);
    for (const s of [-0.9, 0.9]) this.put('g', CYL, dark, 0.28, 1.7, 0.28, -hx * 0.4 + s, 0.3, tz, 0, Math.PI / 2);
    this.pool('#8a3a0c', -hx * 0.4, tz, 6, 4);

    // drifting embers rising from the kilns and furnaces
    if (!low) {
      const n = 70;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const [sx, sz] = sources[i % sources.length];
        this.emberData.push({ x: sx + (this.rnd() - 0.5) * 3.5, y: this.rnd() * 9, z: sz + this.rnd() * 2, vy: 0.6 + this.rnd() * 1.1, sway: this.rnd() * 6.28 });
      }
      const g = this.track(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      const m = this.track(new THREE.PointsMaterial({ map: blobTexture(), color: new THREE.Color('#ffb05a').multiplyScalar(1.6), size: 0.22, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      this.embers = new THREE.Points(g, m);
      this.embers.frustumCulled = false;
      this.group.add(this.embers);
      this.updateEmbers(0);
    }
  }

  /** Skyline Stadium: a rooftop above the evening city with neon edges, a helipad, plant and searchlights. */
  private skyline(th: Theme, hx: number, hz: number): void {
    const [RX, RN, RS] = this.platform!;
    const low = this.quality === 'low';
    const rnd = this.rnd;
    const pink = th.trim;
    const warm = '#ffc887';
    // parapet with a neon line
    const par = '#6f7390';
    for (const [z, col] of [[RN + 0.25, pink], [RS - 0.25, warm]] as [number, string][]) {
      this.bx('m', par, RX * 2, 0.8, 0.5, 0, 0.4, z, 0, 0, 0, 0.3);
      this.bx('e', col, RX * 2, 0.06, 0.2, 0, 0.83, z);
    }
    for (const s of [-1, 1]) {
      this.bx('m', par, 0.5, 0.8, RS - RN, s * (RX - 0.25), 0.4, (RN + RS) / 2, 0, 0, 0, 0.3);
      this.bx('e', pink, 0.2, 0.06, RS - RN, s * (RX - 0.25), 0.83, (RN + RS) / 2);
      this.pool('#5a1f52', s * (RX - 1.6), (RN + RS) / 2, 5, RS - RN);
    }
    this.pool('#5a1f52', 0, RN + 1.6, RX * 2, 5);

    // the city below: street grid far down and the neighbours' towers round the roof
    const ct = this.track(cityTexture());
    ct.repeat.set(9, 9);
    const city = new THREE.Mesh(this.track(new THREE.PlaneGeometry(640, 640)), this.track(new THREE.MeshBasicMaterial({ map: ct, color: '#b9b2e6' })));
    city.rotation.x = -Math.PI / 2;
    city.position.y = -42;
    this.group.add(city);
    const wt = this.track(windowsTexture('#3b3567', '#ffd27a'));
    wt.wrapS = wt.wrapT = THREE.RepeatWrapping;
    this.custom.set('tower', { mat: this.std('#ffffff', 0.6, { map: wt, emissiveMap: wt, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.75, vertexColors: true }), cast: false, order: 0 });
    this.bake.uv.set('tower', -0.11);
    const tints = ['#ffffff', '#d9cfff', '#ffd9e8', '#cfe0ff'];
    const neon = [pink, '#7fe9ff', warm, '#b58cff'];
    const tower = (x: number, z: number, w: number, top: number, i: number) => {
      this.bx('tower', tints[i % 4], w, top + 42, w * (0.8 + (i % 3) * 0.2), x, (top - 42) / 2, z, 0, 0, 0, 0.55);
      if (i % 3 === 0) this.bx('e', neon[i % 4], w * 0.7, 0.5, 0.14, x, top + 0.45, z + w * 0.4);
      else if (i % 3 === 1) this.bx('m', '#4a4672', w * 0.4, 1.1, w * 0.4, x + w * 0.15, top + 0.55, z - w * 0.1);
    };
    const count = low ? 30 : 46;
    for (let i = 0; i < count; i++) {
      const side = i % 4;
      const w = 6 + rnd() * 6;
      const along = (rnd() - 0.5) * 2;
      const out = 6 + rnd() * 30;
      // north towers may rise above the roof line; those toward the camera stay well below it
      const top = side === 0 ? -16 + rnd() * 22 + (out > 22 ? 8 : 0) : -24 + rnd() * 16;
      if (side === 0) tower(along * 62, RN - out, w, top, i);
      else if (side === 1) tower(along * 50, RS + out + 2, w, Math.min(top, -12), i);
      else tower((side === 2 ? -1 : 1) * (RX + out), along * 48 - 4, w, top, i);
    }

    // far-left corner: water tank, air-handling units and lit skylights
    const tx = -(hx + 4.4);
    const tz = -(hz + 6.6);
    for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) this.bx('G', '#4a4672', 0.14, 1.3, 0.14, tx + dx, 0.65, tz + dz, 0, 0, 0, 0);
    this.cyl('M', '#a06a48', 1.25, 1.7, tx, 2.15, tz);
    for (const y of [1.6, 2.7]) this.cyl('g', '#4a3a36', 1.28, 0.1, tx, y, tz);
    this.put('M', CONE, '#8d93ad', 1.4, 0.6, 1.4, tx, 3.3, tz);
    for (const [ax, az, ry] of [[tx + 3.6, tz + 0.6, 0], [tx + 3.9, tz + 2.6, 0.1], [tx - 0.4, tz + 3.4, 1.57]] as [number, number, number][]) {
      this.bx('M', '#c9c6d6', 1.7, 0.9, 1.15, ax, 0.45, az, ry, 0, 0, 0.25);
      this.put('g', CYL, '#3c3f5c', 0.4, 0.06, 0.4, ax, 0.93, az);
      this.bx('g', '#8d93ad', 0.12, 0.12, 1.6, ax, 0.1, az + 1.3, ry);
    }
    for (let i = 0; i < 3; i++) {
      this.bx('g', '#3c3f5c', 2.0, 0.14, 1.3, tx - 2.2 + i * 2.4, 0.07, tz - 2.9);
      this.bx('e', '#ffdca6', 1.76, 0.03, 1.06, tx - 2.2 + i * 2.4, 0.15, tz - 2.9);
      this.pool('#6b4a1f', tx - 2.2 + i * 2.4, tz - 2.9, 3.6, 3);
    }
    // far-right corner: helipad
    const px = hx + 4.3;
    const pz = -(hz + 6.3);
    this.bx('m', '#33364f', 6.6, 0.04, 6.6, px, 0.0, pz);
    for (const s of [-1, 1]) {
      this.bx('s', '#f3f0fa', 6.2, 0.02, 0.16, px, 0.03, pz + s * 3.0);
      this.bx('s', '#f3f0fa', 0.16, 0.02, 6.2, px + s * 3.0, 0.03, pz);
      this.bx('s', '#f3f0fa', 0.42, 0.02, 2.8, px + s * 0.9, 0.03, pz);
      for (const t of [-1, 1]) {
        this.bx('e', '#7fe9ff', 0.2, 0.08, 0.2, px + s * 3.0, 0.06, pz + t * 3.0);
        this.pool('#1c5560', px + s * 3.0, pz + t * 3.0, 1.8, 1.8);
      }
    }
    this.bx('s', '#f3f0fa', 1.8, 0.02, 0.42, px, 0.03, pz);
    // solar arrays on the camera side (seen on tall screens)
    for (const sx of [-1, 1])
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 2; j++) this.bx('g', '#27408f', 2.6, 0.06, 1.3, sx * (6.5 + i * 3.1), 0.42, hz + 5 + j * 1.9, 0, 0.35);

    // floodlight towers on the far corners, lamps lit for the evening
    const steel = '#5d6675';
    const lamps = new Merger();
    const beams = new Merger();
    const H = 13.5;
    for (const sx of [-1, 1]) {
      const x = sx * (RX - 1.4);
      const z = RN + 1.6;
      this.cyl('g', steel, 0.28, H, x, H / 2, z);
      this.cyl('g', steel, 0.5, 0.3, x, 0.15, z);
      // lamp head facing the pitch, tilted down at it
      const aim = Math.atan2(-x, -z);
      const target = new THREE.Vector3(x * 0.35, 0, z * 0.15);
      const hc = new THREE.Vector3(x, H + 0.6, z);
      const tilt = Math.atan2(hc.y, Math.hypot(target.x - x, target.z - z));
      this.put('g', BOX, steel, 4.4, 2.4, 0.3, hc.x, hc.y, hc.z, aim, tilt);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, aim, 0, 'YXZ'));
      const lp = hc.clone().addScaledVector(new THREE.Vector3(0, 0, 1).applyQuaternion(q), 0.17);
      lamps.add(LAMP_PLANE, new THREE.Matrix4().compose(lp, q, _s.set(1, 1, 1)));
      if (this.beamMat) this.beam(beams, lp, target, 4.2);
    }
    this.mesh(lamps.build(), this.track(new THREE.MeshBasicMaterial({ map: this.track(lampPanelTexture()) })));
    this.addBeams(beams);
    // searchlights sweeping the sky from the far edge, and a mast beacon
    if (this.beamMat) {
      const cone = this.track(new THREE.ConeGeometry(2.6, 46, 20, 1, true));
      cone.rotateX(Math.PI).translate(0, 23, 0);
      for (const sx of [-1, 1]) {
        const x = sx * (hx - 3);
        this.cyl('g', '#3c3f5c', 0.55, 0.7, x, 0.35, RN + 1.5);
        const sl = new THREE.Mesh(cone, this.beamMat);
        sl.position.set(x, 0.7, RN + 1.5);
        sl.rotation.set(-0.75, 0, -sx * 0.35);
        sl.userData.base = -sx * 0.35;
        sl.userData.phase = sx;
        sl.renderOrder = 4;
        this.group.add(sl);
        this.sweepers.push(sl);
      }
    }
    this.bx('g', steel, 0.14, 5.2, 0.14, tx - 2.6, 2.6, tz + 1.2, 0, 0, 0, 0);
    this.beaconMat = this.track(new THREE.MeshBasicMaterial({ color: '#ff3030', toneMapped: false }));
    this.custom.set('beacon', { mat: this.beaconMat, cast: false, order: 0 });
    this.put('beacon', BLOB, '#ffffff', 0.2, 0.2, 0.2, tx - 2.6, 5.3, tz + 1.2);
    if (this.quality === 'high') {
      // sunset disc with a soft corona (only seen from low camera angles)
      const sun = new THREE.Mesh(this.track(new THREE.CircleGeometry(7, 40)), this.track(new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe2a0').multiplyScalar(1.25), fog: false })));
      sun.position.set(-14, 6, -150);
      const corona = new THREE.Mesh(PLANE, this.track(new THREE.MeshBasicMaterial({ map: blobTexture(), color: '#ffb070', transparent: true, opacity: 0.55, depthWrite: false, fog: false })));
      corona.scale.set(42, 42, 1);
      corona.position.set(-14, 6, -151);
      this.group.add(sun, corona);
    }
  }

  /** Championship Dome: enclosed bowl with ribbon boards, big screens, a lighting truss, banners and flashes. */
  private dome(hx: number, hz: number): void {
    const shell = '#0f1a3a';
    const gold = '#ffd75e';
    this.bx('m', shell, hx * 2 + 40, 22, 1, 0, 11, -hz - 13.5, 0, 0, 0, 0.4);
    for (const sx of [-1, 1]) this.bx('m', shell, 1, 22, hz * 2 + 40, sx * (hx + 12.5), 11, 0, 0, 0, 0, 0.4);
    // roof ribs over the far stands only (never between the match camera and the pitch)
    for (let i = -3; i <= 3; i++) this.bx('g', '#1b2a55', 0.5, 0.5, 12, i * 7, 17, -hz - 14);
    // lighting truss ring with lamp clusters and cones
    const truss = '#9aa6bf';
    const lamp = '#e6f2ff';
    const beams = new Merger();
    const yR = 13;
    const zR = -hz - 8.5;
    this.bx('g', truss, hx * 2 + 6, 0.35, 0.35, 0, yR + 0.6, zR);
    this.bx('g', truss, hx * 2 + 6, 0.2, 0.2, 0, yR - 0.2, zR);
    for (const x of [-hx * 0.75, -hx * 0.25, hx * 0.25, hx * 0.75]) {
      this.bx('g', truss, 2.4, 0.5, 0.8, x, yR, zR);
      this.bx('e', lamp, 2.2, 0.05, 0.6, x, yR - 0.27, zR + 0.1);
      if (this.beamMat) this.beam(beams, new THREE.Vector3(x, yR - 0.3, zR), new THREE.Vector3(x * 0.85, 0, -hz * 0.15), 4.6);
    }
    for (const sx of [-1, 1]) {
      this.bx('g', truss, 0.35, 0.35, hz * 2 + 4, sx * (hx + 9), yR + 0.6, -2);
      for (const z of [-hz * 0.5, hz * 0.3]) {
        this.bx('g', truss, 0.8, 0.5, 2.0, sx * (hx + 9), yR, z);
        this.bx('e', lamp, 0.6, 0.05, 1.8, sx * (hx + 9) - sx * 0.1, yR - 0.27, z);
        if (this.beamMat) this.beam(beams, new THREE.Vector3(sx * (hx + 9), yR - 0.3, z), new THREE.Vector3(sx * hx * 0.55, 0, z * 0.6), 4.0);
      }
    }
    this.addBeams(beams);
    // championship banner, pennants and light lines on the far wall
    const banner = new THREE.Mesh(PLANE, this.track(new THREE.MeshBasicMaterial({ map: this.track(labelTexture('Championship', '#17273e', '#f6c542')), transparent: true })));
    banner.scale.set(11, 2, 1);
    banner.position.set(0, 9.2, -hz - 12.9);
    this.group.add(banner);
    this.bx('e', '#3d8bff', hx * 2 + 24, 0.25, 0.25, 0, 6.6, -hz - 12.8);
    this.bx('e', '#3d8bff', hx * 2 + 24, 0.12, 0.12, 0, 11.8, -hz - 12.8);
    for (let i = 0; i < 8; i++) {
      const x = (i < 4 ? -1 : 1) * (8.5 + (i % 4) * 3.2);
      this.bx('d', i % 2 ? this.teamColors[i < 4 ? 0 : 1] : '#f3f5ef', 1.7, 3.6, 0.05, x, 9.1, -hz - 12.9, 0, 0, 0, 0);
      this.bx('d', gold, 1.7, 0.3, 0.06, x, 7.2, -hz - 12.88, 0, 0, 0, 0);
    }
    // big screens in the far corners, turned toward the centre circle
    const st = this.track(screenTexture(this.teamColors, 'THE FINAL'));
    const screens = new Merger();
    for (const sx of [-1, 1]) {
      const x = sx * (hx + 2.6);
      const z = -hz - 3.0;
      const ry = -sx * 0.62;
      this.put('g', BOX, '#101a38', 5.0, 2.7, 0.3, x, 3.15, z, ry, -0.18);
      for (const s of [-1.8, 1.8]) this.put('g', BOX, '#2a3a6a', 0.22, 1.9, 0.22, x + Math.cos(ry) * s, 0.95, z - Math.sin(ry) * s, ry);
      screens.add(PLANE, _m.compose(_p.set(x + Math.sin(ry) * 0.17, 3.18, z + Math.cos(ry) * 0.17), _q.setFromEuler(_e.set(-0.18, ry, 0, 'YXZ')), _s.set(4.7, 2.4, 1)).clone());
      this.bx('e', gold, 5.0, 0.07, 0.34, x - Math.sin(ry) * 0.25, 4.5, z - Math.cos(ry) * 0.25, ry);
      // spotlight pools on the concourse by each corner of the court
      this.pool('#263f8a', sx * (hx + 3.6), -hz - 1, 9, 6);
      this.pool('#263f8a', sx * (hx + 3.2), hz + 2.4, 8, 5);
    }
    this.mesh(screens.build(), this.track(new THREE.MeshBasicMaterial({ map: st, toneMapped: false })));
    // gold inlay along the camera-side edge of the apron
    this.bx('s', gold, hx * 2 + 9, 0.02, 0.12, 0, 0.0, hz + 2.3);

    // camera flashes twinkling in the stands
    if (this.quality !== 'low') {
      const n = 46;
      const pos = new Float32Array(n * 3);
      const rnd = this.rnd;
      for (let i = 0; i < n; i++) {
        const side = rnd();
        if (side < 0.6) {
          pos[i * 3] = (rnd() - 0.5) * (hx * 2 + 14);
          pos[i * 3 + 1] = 1.4 + rnd() * 4;
          pos[i * 3 + 2] = -hz - 2.5 - rnd() * 9;
        } else {
          const sx = side < 0.8 ? -1 : 1;
          pos[i * 3] = sx * (hx + 4.5 + rnd() * 6);
          pos[i * 3 + 1] = 1.0 + rnd() * 3;
          pos[i * 3 + 2] = (rnd() - 0.5) * (hz * 2 + 4);
        }
      }
      const g = this.track(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
      this.flashLife = new Float32Array(n);
      const m = this.track(new THREE.PointsMaterial({ map: blobTexture(), vertexColors: true, size: 0.55, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      this.flashes = new THREE.Points(g, m);
      this.flashes.frustumCulled = false;
      this.group.add(this.flashes);
    }
  }

  // ------------------------------------------------------------------ animation

  private writeFlags(time: number): void {
    const f = this.crowdFlags;
    if (!f) return;
    const d = this.dummy;
    const ex = this.excitement;
    const n = f.count;
    const p = this.flagPos;
    for (let i = 0; i < n; i++) {
      const ph = p[i * 6 + 3];
      const sc = p[i * 6 + 5];
      const big = sc > 1;
      const hop = ex > 0.01 && !big ? Math.abs(Math.sin(time * 9 + ph)) * 0.36 * ex : 0;
      d.position.set(p[i * 6], p[i * 6 + 1] + hop, p[i * 6 + 2]);
      const wave = Math.sin(time * (big ? 1.6 : 2.2 + ex * 6) + ph);
      d.rotation.set(0, wave * (big ? 0.35 : 0.5 + ex * 0.5), big ? 0 : wave * 0.15 * (1 + ex));
      d.scale.set(sc * (1 + Math.sin(time * 7 + ph) * 0.06), sc, sc);
      d.updateMatrix();
      f.setMatrixAt(i, d.matrix);
    }
    f.instanceMatrix.needsUpdate = true;
  }

  /** Crowd reaction 0..1 (decays on its own). */
  excite(amount: number): void {
    this.excitement = Math.max(this.excitement, amount);
  }

  flashGoal(side: 0 | 1): void {
    this.goalFlash[side] = 1;
  }

  setAnchorGlow(index: number, glow: number): void {
    for (let i = 0; i < this.anchors.length; i++) this.anchors[i].glow = i === index ? glow : 0;
  }

  update(dt: number, time: number, camera: THREE.Camera, reduced: boolean): void {
    // Highlighted anchor: its ring is replaced by a bright, slightly larger one inside a halo.
    let hi = -1;
    for (let i = 0; i < this.anchors.length; i++) if (this.anchors[i].glow > 0) hi = i;
    const hm = this.halo.material as THREE.MeshBasicMaterial;
    if (hi !== this.hiIndex) {
      if (this.hiIndex >= 0) this.rings.setMatrixAt(this.hiIndex, this.ringBase[this.hiIndex]);
      if (hi >= 0) {
        this.rings.setMatrixAt(hi, HIDE);
        this.ringBase[hi].decompose(this.hiRing.position, this.hiRing.quaternion, _s);
        this.hiRing.scale.setScalar(1);
        this.halo.position.copy(this.hiRing.position);
      }
      this.rings.instanceMatrix.needsUpdate = true;
      this.hiRing.visible = hi >= 0;
      this.hiIndex = hi;
    }
    if (hi >= 0) {
      const pulse = 1.25 + (reduced ? 0 : Math.sin(time * 7) * 0.08);
      this.hiRing.scale.setScalar(this.hiRing.scale.x + (pulse - this.hiRing.scale.x) * Math.min(1, dt * 14));
      // 1 = the anchor you would grab, 2 = attached
      hm.color.set(this.anchors[hi].glow >= 2 ? '#7ff3ff' : '#fff3c2');
    }
    hm.opacity += ((hi >= 0 ? 0.95 : 0) - hm.opacity) * Math.min(1, dt * 16);
    this.halo.visible = hm.opacity > 0.02;
    if (this.halo.visible) {
      this.halo.quaternion.copy(camera.quaternion);
      const s = 1.5 + (reduced ? 0 : Math.sin(time * 7) * 0.1);
      this.halo.scale.set(s, s, 1);
    }

    let flash = 0;
    let flashSide = 0;
    for (let s = 0; s < 2; s++) {
      if (this.goalFlash[s] > 0 || this.goalMats[s].emissiveIntensity > 0.36) {
        this.goalFlash[s] = Math.max(0, this.goalFlash[s] - dt * 0.9);
        const f = this.goalFlash[s];
        this.goalMats[s].emissiveIntensity = 0.35 + f * (reduced ? 0.6 : 1.4 + Math.sin(time * 30) * 0.5);
        const net = this.netMeshes[s];
        const bulge = reduced ? 0 : Math.sin(f * Math.PI) * 0.22;
        net.scale.set(1 + bulge, 1 + bulge * 0.3, 1);
        if (f > flash) {
          flash = f;
          flashSide = s;
        }
      }
    }
    // LED boards scroll; after a goal they pulse in the scoring side's colour.
    if (this.ledTex && this.ledMat) {
      if (!reduced) this.ledTex.offset.x = (this.ledTex.offset.x + dt * 0.035) % 1;
      if (flash > 0) {
        const pulse = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(time * 14);
        this.ledFlashColor.set(this.teamColors[flashSide === 1 ? 0 : 1]);
        this.ledMat.color.setRGB(0.92, 0.92, 0.92).lerp(this.ledFlashColor, flash * pulse * 0.85);
      } else this.ledMat.color.setRGB(0.92, 0.92, 0.92);
    }
    if (this.beamMat) this.beamMat.opacity = this.th.beamOpacity * (1 + flash * 0.8);
    if (this.embers && !reduced) this.updateEmbers(dt);
    if (this.flashes) this.updateFlashes(dt, reduced);

    // The crowd animates on the GPU: idle sway always, jumping while excited (still with reduced motion).
    if (this.excitement > 0) this.excitement = Math.max(0, this.excitement - dt * 0.35);
    if (!reduced) {
      this.crowdU.time.value = time;
      this.crowdU.excite.value = this.excitement;
      // slow ambient motion: sea drift, gulls, searchlights, a breathing furnace glow and mast beacon
      if (this.water) this.water.offset.set((time * 0.012) % 1, (time * 0.007) % 1);
      for (const o of this.spinners) o.rotation.y = time * o.userData.spin;
      for (const o of this.sweepers) o.rotation.z = o.userData.base + Math.sin(time * 0.22 + o.userData.phase) * 0.3;
      if (this.fireMat) {
        const f = 0.93 + Math.sin(time * 2.3) * 0.04 + Math.sin(time * 5.1 + 1) * 0.03;
        this.fireMat.color.setScalar(f);
        for (const l of this.fireLights) l.intensity = 55 * f;
      }
      if (this.beaconMat) this.beaconMat.color.setRGB(0.55 + 0.45 * Math.sin(time * 1.6), 0.06, 0.06);
      // Flags wave at 30 Hz at most.
      if (this.crowdFlags && time - this.lastFlagTime > 1 / 30) {
        this.lastFlagTime = time;
        this.writeFlags(time);
      }
    } else this.crowdU.excite.value = 0;
  }

  private updateEmbers(dt: number): void {
    const pts = this.embers!;
    const pos = pts.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < this.emberData.length; i++) {
      const e = this.emberData[i];
      e.y += e.vy * dt;
      e.sway += dt * 1.7;
      if (e.y > 10) e.y = 0.5 + Math.random() * 1.5;
      arr[i * 3] = e.x + Math.sin(e.sway) * 0.4;
      arr[i * 3 + 1] = e.y;
      arr[i * 3 + 2] = e.z;
    }
    pos.needsUpdate = true;
  }

  private updateFlashes(dt: number, reduced: boolean): void {
    const pts = this.flashes!;
    const colA = pts.geometry.attributes.color as THREE.BufferAttribute;
    const arr = colA.array as Float32Array;
    const n = this.flashLife.length;
    const rate = reduced ? 0 : (1.5 + this.excitement * 22) * dt;
    for (let i = 0; i < n; i++) {
      let l = this.flashLife[i];
      if (l > 0) l = Math.max(0, l - dt * 9);
      else if (Math.random() < (rate / n) * 3) l = 1;
      this.flashLife[i] = l;
      const v = l * l * 1.6;
      arr[i * 3] = arr[i * 3 + 1] = arr[i * 3 + 2] = v;
    }
    colA.needsUpdate = true;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    for (const i of this.instanced) i.dispose();
  }
}

/** Builds the merged quads of the LED boards with continuous, undistorted UVs. */
class LedStrip {
  private pos: number[] = [];
  private nor: number[] = [];
  private uv: number[] = [];
  private idx: number[] = [];
  private u = 0;
  constructor(private h: number) {}
  /** Quad from (x1, z1) to (x2, z2) whose front faces (nx, nz). */
  quad(x1: number, z1: number, x2: number, z2: number, y0: number, nx: number, nz: number): void {
    let dx = x2 - x1;
    let dz = z2 - z1;
    // the front of A→B is (-dz, dx); swap ends if that points the wrong way
    if (-dz * nx + dx * nz < 0) {
      [x1, x2] = [x2, x1];
      [z1, z2] = [z2, z1];
      dx = -dx;
      dz = -dz;
    }
    const len = Math.hypot(dx, dz);
    const du = len / (this.h * 16);
    const b = this.pos.length / 3;
    const y1 = y0 + this.h;
    this.pos.push(x1, y0, z1, x2, y0, z2, x2, y1, z2, x1, y1, z1);
    for (let i = 0; i < 4; i++) this.nor.push(nx, 0, nz);
    this.uv.push(this.u, 0, this.u + du, 0, this.u + du, 1, this.u, 1);
    this.u += du + 0.137;
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    return g;
  }
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const PLANE = new THREE.PlaneGeometry(1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 12);
const CONE = new THREE.ConeGeometry(1, 1, 12);
/** Unit tube along +y centred on the origin (for goal frames). */
const TUBE = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
const BALL = new THREE.SphereGeometry(1, 12, 8);
/** Low-poly ball for small or distant things (coconuts, hulls, beacons). */
const BLOB = new THREE.SphereGeometry(1, 8, 5);
const DISC = new THREE.CircleGeometry(1, 18);
const TORUS = new THREE.TorusGeometry(0.32, 0.085, 8, 22);
const LAMP_PLANE = new THREE.PlaneGeometry(4.0, 2.0);
/** Slightly tapered ring of a palm trunk. */
const TRUNK = new THREE.CylinderGeometry(1, 1.12, 1, 8);
/** Right-angled sail: mast edge on the y axis, foot along +x. */
const SAIL = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
  g.setIndex([0, 1, 2]);
  return g;
})();

/** Builds a palm frond: a tapering leaf bent downward along its length. */
const FROND = (() => {
  const len = 2.5;
  const g = new THREE.PlaneGeometry(len, 0.62, 6, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + len / 2; // 0..len from the crown
    const t = x / len;
    const y = p.getY(i);
    const w = Math.sin(Math.PI * Math.min(1, t * 1.05)) * (1 - t * 0.35);
    // fold the leaf along its rib
    p.setXYZ(i, x, -t * t * len * 0.55 + Math.abs(y * w) * 0.35, y * w);
  }
  g.computeVertexNormals();
  return g;
})();

/** Open cone whose segments alternate between two colours (parasols). */
function stripedCone(a: string, b: string): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(1, 1, 10, 1, true).toNonIndexed();
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    _c.set(Math.floor(i / 6) % 2 ? a : b);
    col[i * 3] = _c.r;
    col[i * 3 + 1] = _c.g;
    col[i * 3 + 2] = _c.b;
    idx.push(i);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

function parasol(put: Put, x: number, y: number, z: number, col: string): void {
  put('s', BOX, '#fdf9ee', 0.08, 2.1, 0.08, x, y + 1.05, z);
  const g = stripedCone(col, '#fdf9ee');
  put('d', g, '', 1.5, 0.5, 1.5, x, y + 2.2, z);
  g.dispose();
}

/** Curved palm with a crown of fronds and coconuts. */
function palm(put: Put, x: number, y: number, z: number, h: number): void {
  const seg = 6;
  const lean = 0.09;
  for (let i = 0; i < seg; i++) {
    const t = i / seg;
    const r = 0.2 - t * 0.07;
    put('m', TRUNK, i % 2 ? '#a8845a' : '#9b7850', r, h / seg, r, x + Math.sin(t * 1.4) * lean * h, y + (i + 0.5) * (h / seg), z, 0, 0, Math.sin(t * 1.4) * 0.12);
  }
  const tx = x + Math.sin(1.4) * lean * h * 0.95;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    put('m', BLOB, '#6b5132', 0.13, 0.13, 0.13, tx + Math.cos(a) * 0.17, y + h - 0.12, z + Math.sin(a) * 0.17);
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + (i % 2) * 0.2;
    put('d', FROND, i % 2 ? '#4fae63' : '#43a058', 1, 1, 1, tx, y + h + 0.05, z, -a, 0, i % 2 ? 0.35 : 0.1);
  }
}

/** Red and white lighthouse, `s` times the size of the one on the far island. `k` is the matte bucket. */
function lighthouse(put: Put, x: number, y: number, z: number, s: number, k = 'm'): void {
  put(k, CYL, '#d9d2c2', 1.75 * s, 0.5 * s, 1.75 * s, x, y + 0.25 * s, z);
  for (let i = 0; i < 4; i++) {
    const r = (1.25 - i * 0.14) * s;
    put(k, CYL, i % 2 ? '#e2534b' : '#fbfaf5', r, 2 * s, r, x, y + (1.5 + i * 2) * s, z, 0, 0, 0, i ? 0 : 0.2);
  }
  put(k, CYL, '#2b3a55', 1.05 * s, 0.16 * s, 1.05 * s, x, y + 8.55 * s, z);
  put('e', CYL, '#fff3b8', 0.6 * s, 0.9 * s, 0.6 * s, x, y + 9.05 * s, z);
  put(k, CONE, '#e2534b', 0.95 * s, 1.0 * s, 0.95 * s, x, y + 10.0 * s, z);
  put(k, BOX, '#e2534b', 0.7 * s, 1.3 * s, 0.2 * s, x, y + 1.15 * s, z + 1.22 * s);
}

/** Small boat on the water: a rounded hull with a sail (given a sail colour) or a cabin. */
function boat(put: Put, x: number, y: number, z: number, ry: number, hull: string, sail: string): void {
  put('s', BLOB, hull, 1.45, 0.5, 0.55, x, y, z, ry);
  put('s', BOX, '#fdf9ee', 1.7, 0.1, 0.62, x, y + 0.36, z, ry);
  if (sail) {
    put('s', BOX, STEEL, 0.06, 2.5, 0.06, x, y + 1.6, z);
    put('d', SAIL, sail, 1.15, 2.2, 1, x, y + 0.6, z, ry);
    put('d', SAIL, '#fdf9ee', 0.75, 1.7, 1, x, y + 0.6, z, ry + Math.PI);
  } else put('s', BOX, hull, 0.7, 0.4, 0.46, x, y + 0.6, z, ry);
}

/** Bakes a scenery list into meshes (matte / satin / metal / cloth / glow) and adds them to `group`. */
function addBaked(group: THREE.Group, bake: Bake, track: Track): void {
  for (const [k, g] of bake.build()) {
    const mesh = new THREE.Mesh(track(g), track(bucketMaterial(k.toLowerCase(), false)));
    mesh.castShadow = k !== k.toLowerCase();
    mesh.receiveShadow = true;
    group.add(mesh);
  }
}

/** A palm as a group of two meshes (trunk and fronds) for scenes outside a match. */
export function makePalm(x: number, y: number, z: number, h: number, track: Track): THREE.Group {
  const g = new THREE.Group();
  const bake = new Bake();
  palm(bake.put, 0, 0, 0, h);
  addBaked(g, bake, track);
  g.position.set(x, y, z);
  return g;
}

/**
 * The bay beyond `zEdge` (shared with the menu stage): a sea that pales toward the shore, and with `far`
 * the islands, lighthouse, domed buildings, sailing boats, turbines and clouds on the horizon. `shore` is
 * the half width and north / south edges of a pier to lighten the water around. Returns the water texture
 * so the caller can let it drift.
 */
export function buildHarborScenery(group: THREE.Group, zEdge: number, track: Track, far: boolean, shore: [number, number, number] | null = null): THREE.Texture {
  const wt = track(waterTexture());
  const deep = new THREE.Color('#2a8fd2');
  const shallow = new THREE.Color('#62cfdc');
  const sheet = (w: number, d: number, cz: number, seg: number, y: number) => {
    const g = new THREE.PlaneGeometry(w, d, Math.round(w / seg), Math.round(d / seg));
    g.rotateX(-Math.PI / 2).translate(0, y, cz);
    const p = g.attributes.position;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      g.attributes.uv.setXY(i, x / 9, z / 9);
      // distance from the pier (or from the shoreline when there is none)
      const dist = shore ? Math.hypot(Math.max(0, Math.abs(x) - shore[0]), Math.max(0, shore[1] - z, z - shore[2])) : Math.max(0, zEdge - z) * 0.5;
      const t = Math.min(1, dist / 16);
      _c.copy(shallow).lerp(deep, t * (2 - t));
      col[i * 3] = _c.r;
      col[i * 3 + 1] = _c.g;
      col[i * 3 + 2] = _c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  };
  // a fine sheet near the shore for the gradient, a coarse one out to the horizon
  const near = sheet(shore ? shore[0] * 2 + 44 : 120, shore ? shore[2] - shore[1] + 44 : 60, shore ? (shore[1] + shore[2]) / 2 : zEdge - 26, 3, -0.86);
  const wide = sheet(520, 420, zEdge - 60, 26, -0.9);
  const sea = new THREE.Mesh(track(mergeGeometries([near, wide], false)!), track(new THREE.MeshStandardMaterial({ map: wt, vertexColors: true, roughness: 0.22, metalness: 0.1 })));
  near.dispose();
  wide.dispose();
  sea.receiveShadow = true;
  group.add(sea);
  if (!far) return wt;

  const bake = new Bake();
  const put = bake.put;
  if (!shore) put('m', BOX, '#efe9da', 240, 1, 0.8, 0, -0.45, zEdge);
  const island = (x: number, z: number, sx: number, sy: number, sz: number) => {
    put('m', BALL, '#d8c7a2', sx * 1.08, sy * 0.55, sz * 1.08, x, -0.9, z);
    put('m', BALL, '#63b574', sx, sy, sz, x, -0.6, z);
    put('m', BALL, '#58a868', sx * 0.55, sy * 0.95, sz * 0.6, x + sx * 0.25, -0.6 + sy * 0.25, z - sz * 0.1);
  };
  island(-34, zEdge - 46, 15, 4.5, 8);
  island(30, zEdge - 60, 20, 6, 9);
  island(64, zEdge - 40, 10, 3.2, 6);
  if (!shore) lighthouse(put, -30, 3.2, zEdge - 44, 1);
  // domed harbour buildings
  for (const [x, z, s] of [[34, zEdge - 58, 4.6], [44, zEdge - 55, 3.2], [-52, zEdge - 30, 3.6]] as [number, number, number][]) {
    put('s', BALL, '#f4f2ea', s, s * 0.75, s, x, 4.2, z);
    put('g', CYL, '#8fd3ee', s * 1.01, s * 0.3, s * 1.01, x, 4.2, z);
  }
  const hulls = ['#fdf9ee', '#ef5d50', '#2f9fc4', '#f6c542'];
  const fleet: [number, number][] = [[-12, zEdge - 20], [8, zEdge - 30], [22, zEdge - 16], [-48, zEdge - 18], [-31, zEdge + 16], [32, zEdge + 24], [-29, zEdge + 34], [27, zEdge + 6]];
  fleet.forEach(([x, z], i) => {
    // a pier brings its own moored boats, so only the distant ones are kept
    if (!shore || z < zEdge - 10) boat(put, x, -0.78, z, (i % 3) * 0.3 - 0.3, hulls[i % 4], i % 4 ? '#fdf9ee' : '#ef5d50');
  });
  // wind turbines on the far island
  for (const x of [22, 27]) {
    put('s', CYL, '#fbfaf5', 0.12, 7, 0.12, x, 7.5, zEdge - 62);
    for (let i = 0; i < 3; i++) put('s', BOX, '#fbfaf5', 0.18, 2.6, 0.06, x + Math.sin((i * Math.PI * 2) / 3) * 1.3, 11 + Math.cos((i * Math.PI * 2) / 3) * 1.3, zEdge - 61.8, 0, 0, -(i * Math.PI * 2) / 3);
  }
  addBaked(group, bake, track);
  // soft clouds on the horizon
  const clouds = new Merger();
  for (const [x, y, z, s] of [[-90, 30, -200, 60], [-20, 42, -230, 80], [70, 34, -210, 64], [150, 28, -180, 54], [-160, 36, -170, 58]] as [number, number, number, number][]) {
    clouds.addAt(PLANE, x, y, zEdge + z, 0, 0, 0, s, s * 0.5, 1);
  }
  group.add(new THREE.Mesh(track(clouds.build()!), track(new THREE.MeshBasicMaterial({ map: track(cloudTexture()), transparent: true, opacity: 0.9, depthWrite: false, fog: false }))));
  return wt;
}
