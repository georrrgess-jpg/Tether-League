import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ArenaDef, ArenaId } from '../../content/arenas';
import {
  beamTexture,
  blobTexture,
  cloudTexture,
  fieldTexture,
  labelTexture,
  lampPanelTexture,
  ledBoardTexture,
  netMeshTexture,
  ringTexture,
  skyTexture,
  tileTexture,
  windowsTexture,
} from './textures';

export type Quality = 'low' | 'medium' | 'high';

type LightRig = 'day' | 'sunset' | 'industrial' | 'night';

interface Theme {
  sky: [number, string][];
  fog: string | null;
  grassA: string;
  grassB: string;
  line: string;
  wall: string;
  wallTop: string;
  floorA: string;
  floorB: string;
  grout: string;
  stand: string;
  seat: string;
  rail: string;
  canopy: string;
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
  rig: LightRig;
  lamp: string;
  beamOpacity: number;
  ledAccent: string;
}

const THEMES: Record<ArenaId, Theme> = {
  harbor_park: {
    sky: [[0, '#3f9fe6'], [0.55, '#8fd0f5'], [1, '#e2f6ff']],
    fog: null,
    grassA: '#4aa588', grassB: '#409a7d', line: '#f4faf5',
    wall: '#eeeadf', wallTop: '#fbf9f2',
    floorA: '#d8dcdf', floorB: '#cdd2d6', grout: '#b9bfc4',
    stand: '#e9e6dc', seat: '#3d9fc4', rail: '#c9cfd6', canopy: '#f6c542',
    sun: '#fff1d2', sunIntensity: 3.2, sunPos: [-16, 26, 14],
    hemiSky: '#dff1ff', hemiGround: '#7f9c8c', hemiIntensity: 0.95,
    crowd: ['#12bcd2', '#f48a2c', '#f3f5ef', '#f6c542', '#7a8aa0', '#51c998'],
    exposure: 0.86, env: 0.2, rig: 'day', lamp: '#fff6e0', beamOpacity: 0, ledAccent: '#7ff3ff',
  },
  foundry_court: {
    sky: [[0, '#120d0b'], [0.6, '#2b1a12'], [1, '#5a2d14']],
    fog: '#1a120e',
    grassA: '#43917a', grassB: '#3b876d', line: '#f0ece0',
    wall: '#6b665f', wallTop: '#8a847a',
    floorA: '#3d3935', floorB: '#35312e', grout: '#262321',
    stand: '#4a4540', seat: '#b8642e', rail: '#8a8178', canopy: '#e9a23a',
    sun: '#ffd7a6', sunIntensity: 2.3, sunPos: [-8, 28, 14],
    hemiSky: '#ffcf9c', hemiGround: '#40302a', hemiIntensity: 1.0,
    crowd: ['#f48a2c', '#e9a23a', '#8c8177', '#d8d2c6', '#12bcd2', '#b2553a'],
    exposure: 0.95, env: 0.16, rig: 'industrial', lamp: '#ffd9a0', beamOpacity: 0.07, ledAccent: '#ffb347',
  },
  skyline_stadium: {
    sky: [[0, '#2b2466'], [0.45, '#8a4a8f'], [0.75, '#f08a5a'], [1, '#ffd79a']],
    fog: null,
    grassA: '#43a086', grassB: '#3b957c', line: '#fff6ea',
    wall: '#dcd6de', wallTop: '#f1ecf2',
    floorA: '#8f93a8', floorB: '#858aa0', grout: '#70748a',
    stand: '#bdb7c9', seat: '#6f4fc4', rail: '#d9d4e4', canopy: '#f6a94a',
    sun: '#ffc58f', sunIntensity: 2.5, sunPos: [-22, 20, -6],
    hemiSky: '#cdb9ff', hemiGround: '#6f6a8c', hemiIntensity: 1.25,
    crowd: ['#8a5cf0', '#f48a2c', '#f3f5ef', '#12bcd2', '#ec5f8e', '#f6c542'],
    exposure: 0.9, env: 0.2, rig: 'sunset', lamp: '#fff1dc', beamOpacity: 0.05, ledAccent: '#ffb27a',
  },
  championship_dome: {
    sky: [[0, '#070c1f'], [0.6, '#101c44'], [1, '#1f3a7a']],
    fog: '#0b1330',
    grassA: '#48aa86', grassB: '#3f9f7c', line: '#ffffff',
    wall: '#e6ebf5', wallTop: '#ffffff',
    floorA: '#1d2a4d', floorB: '#192545', grout: '#131c36',
    stand: '#243463', seat: '#2f6fe4', rail: '#8ea4d8', canopy: '#f6c542',
    sun: '#eef4ff', sunIntensity: 2.7, sunPos: [-6, 34, 10],
    hemiSky: '#b9ccff', hemiGround: '#2a3a66', hemiIntensity: 1.1,
    crowd: ['#12bcd2', '#f48a2c', '#f3f5ef', '#f6c542', '#5f7fd6', '#e96a64', '#51c998'],
    exposure: 0.95, env: 0.2, rig: 'night', lamp: '#eaf3ff', beamOpacity: 0.085, ledAccent: '#f6c542',
  },
};

export interface AnchorView {
  /** Rope attachment point. */
  head: THREE.Vector3;
  ring: THREE.Mesh;
  ringMat: THREE.MeshStandardMaterial;
  halo: THREE.Mesh;
  glow: number;
}

const ANCHOR_YELLOW = '#f6c542';

type Mat = THREE.Material;
interface Batch {
  geo: THREE.BufferGeometry;
  mat: Mat;
  cast: THREE.Matrix4[];
  flat: THREE.Matrix4[];
}

const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

/** Merges transformed copies of geometries into one (keeps position / normal / uv). */
class Merger {
  private list: THREE.BufferGeometry[] = [];
  add(g: THREE.BufferGeometry, m: THREE.Matrix4): void {
    const c = g.clone().applyMatrix4(m);
    this.list.push(c);
  }
  addAt(g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): void {
    this.add(g, new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'XYZ')), _s.set(sx, sy, sz)));
  }
  get empty(): boolean {
    return this.list.length === 0;
  }
  build(keep: string[] = ['position', 'normal', 'uv']): THREE.BufferGeometry | null {
    if (!this.list.length) return null;
    const flat = this.list.some((g) => !g.index);
    const norm = this.list.map((g) => {
      const h = flat && g.index ? g.toNonIndexed() : g;
      for (const name of Object.keys(h.attributes)) if (!keep.includes(name)) h.deleteAttribute(name);
      return h;
    });
    const out = mergeGeometries(norm, false);
    for (const g of this.list) g.dispose();
    this.list = [];
    return out;
  }
}

interface Ember {
  x: number;
  y: number;
  z: number;
  vy: number;
  sway: number;
  life: number;
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
  private crowdBodies: THREE.InstancedMesh | null = null;
  private crowdHeads: THREE.InstancedMesh | null = null;
  private crowdFlags: THREE.InstancedMesh | null = null;
  private crowdPos: Float32Array = new Float32Array(0);
  private flagPos: Float32Array = new Float32Array(0);
  private goalMats: THREE.MeshStandardMaterial[] = [];
  private netMeshes: THREE.Object3D[] = [];
  private goalFlash: [number, number] = [0, 0];
  private excitement = 0;
  private crowdDirty = false;
  private disposables: { dispose(): void }[] = [];
  private dummy = new THREE.Object3D();
  private instanced: THREE.InstancedMesh[] = [];
  private batches = new Map<string, Batch>();
  private shadows: boolean;
  private ledMat: THREE.MeshBasicMaterial | null = null;
  private ledTex: THREE.Texture | null = null;
  private ledFlashColor = new THREE.Color();
  private beamMat: THREE.MeshBasicMaterial | null = null;
  private embers: THREE.Points | null = null;
  private emberData: Ember[] = [];
  private flashes: THREE.Points | null = null;
  private flashLife: Float32Array = new Float32Array(0);
  private beaconMat: THREE.MeshBasicMaterial | null = null;
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

    this.background = this.track(skyTexture(th.sky));
    this.fog = th.fog ? new THREE.Fog(th.fog, 70, 150) : null;

    // On medium / high the PMREM environment adds soft fill, so the hemisphere light steps back.
    const hemi = new THREE.HemisphereLight(th.hemiSky, th.hemiGround, th.hemiIntensity * (quality === 'low' ? 0.95 : 0.6));
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

    this.buildGround(th, hx, hz);
    this.buildWalls(th, hx, hz);
    this.buildGoals(hx);
    this.buildAnchors(hx);
    this.buildSurroundings(th, hx, hz);
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

  /** Static meshes are batched into one instanced mesh per geometry + material to keep draw calls low. */
  private inst(geo: THREE.BufferGeometry, m: Mat, sx: number, sy: number, sz: number, x: number, y: number, z: number, ry = 0, cast = true, rx = 0, rz = 0): void {
    const key = geo.uuid + m.uuid;
    let b = this.batches.get(key);
    if (!b) this.batches.set(key, (b = { geo, mat: m, cast: [], flat: [] }));
    // YXZ: tilt (rx) in the object's own frame, then turn (ry)
    const mat = new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz));
    (cast ? b.cast : b.flat).push(mat);
  }

  private box(m: Mat, sx: number, sy: number, sz: number, x: number, y: number, z: number, ry = 0, cast = true): void {
    this.inst(BOX, m, sx, sy, sz, x, y, z, ry, cast);
  }

  private flush(): void {
    for (const b of this.batches.values()) {
      for (const [list, cast] of [[b.cast, true], [b.flat, false]] as [THREE.Matrix4[], boolean][]) {
        if (!list.length) continue;
        const inst = new THREE.InstancedMesh(b.geo, b.mat, list.length);
        list.forEach((mat, i) => inst.setMatrixAt(i, mat));
        inst.instanceMatrix.needsUpdate = true;
        inst.castShadow = this.shadows && cast;
        inst.receiveShadow = this.shadows;
        inst.computeBoundingSphere();
        this.group.add(inst);
        this.instanced.push(inst);
      }
    }
    this.batches.clear();
  }

  private mesh(geo: THREE.BufferGeometry | null, m: Mat, cast = false, receive = false): THREE.Mesh | null {
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
    const tiles = this.track(tileTexture(th.floorA, th.floorB, th.grout));
    // Harbor Park sits on a pier so the sea frames the court; the other venues use a wide floor.
    const pier = arena.id === 'harbor_park';
    const fw = pier ? (hx + 10.5) * 2 : 190;
    const fd = pier ? (hz + 9.5) * 2 : 140;
    tiles.repeat.set(fw / 4, fd / 4);
    const floor = new THREE.Mesh(this.track(new THREE.PlaneGeometry(fw, fd)), this.std('#ffffff', 0.86, { map: tiles }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.03, pier ? -1 : 0);
    floor.receiveShadow = this.shadows;
    this.group.add(floor);
    if (pier) {
      const edgeM = this.std('#efe9da', 0.8);
      this.box(edgeM, fw + 0.8, 1, 0.8, 0, -0.52, fd / 2 - 1 + 0.4, 0, false);
      this.box(edgeM, 0.8, 1, fd, fw / 2 + 0.4, -0.52, -1, 0, false);
      this.box(edgeM, 0.8, 1, fd, -fw / 2 - 0.4, -0.52, -1, 0, false);
    }
    // Concourse apron around the court: a darker running band that frames the pitch.
    const apronM = this.std(th.grout, 0.75);
    const ap = 1.6;
    this.box(apronM, arena.length + 2 * ap + 4, 0.02, ap, 0, -0.01, hz + 0.55 + ap / 2, 0, false);
    this.box(apronM, arena.length + 2 * ap + 4, 0.02, ap, 0, -0.01, -hz - 0.55 - ap / 2, 0, false);

    const ft = this.track(fieldTexture(arena.length, arena.width, arena.goalWidth, { grassA: th.grassA, grassB: th.grassB, line: th.line }, this.quality === 'low' ? 1024 : 2048));
    const field = new THREE.Mesh(this.track(new THREE.PlaneGeometry(arena.length, arena.width)), this.std('#ffffff', 0.92, { map: ft }));
    field.rotation.x = -Math.PI / 2;
    field.receiveShadow = this.shadows;
    this.group.add(field);
  }

  private buildWalls(th: Theme, hx: number, hz: number): void {
    const arena = this.arena;
    const wallM = this.std(th.wall, 0.55);
    const topM = this.std(th.wallTop, 0.35, { metalness: 0.1 });
    const capM = this.std(ANCHOR_YELLOW, 0.38, { metalness: 0.1 });
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
      this.box(wallM, len + WT * 0.5, WH, WT, cx, WH / 2, cz, -ang);
      this.box(topM, len + WT * 0.5, 0.08, WT + 0.08, cx, WH + 0.04, cz, -ang, false);
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
        this.box(capM, 0.8, WH + 0.22, 0.8, sx * (hx - c + 0.05), (WH + 0.22) / 2, sz * (hz + WT / 2), 0);
        this.box(capM, 0.8, WH + 0.22, 0.8, sx * (hx + WT / 2), (WH + 0.22) / 2, sz * (hz - c + 0.05), 0);
      }
    // corner deck fill (outside the diagonal walls)
    const deckM = this.std(th.wall, 0.85, { side: THREE.DoubleSide });
    const deck = new Merger();
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
        deck.add(triG, m);
      }
    triG.dispose();
    this.mesh(deck.build(), deckM, false, true);

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
    const wallM = this.std(THEMES[arena.id].wall, 0.55);
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

      // goal floor tint
      const gf = new THREE.Mesh(PLANE, this.track(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, depthWrite: false })));
      gf.rotation.x = -Math.PI / 2;
      gf.scale.set(gd, arena.goalWidth, 1);
      gf.position.set(gx + (sx * gd) / 2, 0.012, 0);
      this.group.add(gf);
      // goal-line glow strip on the pitch
      const strip = new THREE.Mesh(PLANE, this.track(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false })));
      strip.rotation.x = -Math.PI / 2;
      strip.scale.set(0.24, arena.goalWidth, 1);
      strip.position.set(gx - sx * 0.12, 0.014, 0);
      this.group.add(strip);

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
      // walls behind the goal
      this.box(wallM, 0.55, 0.62, arena.goalWidth + 1.2, gx + sx * (gd + 0.55 / 2 + 0.05), 0.31, 0, 0);
    }
  }

  private buildAnchors(hx: number): void {
    const arena = this.arena;
    const low = this.quality === 'low';
    const postM = this.std('#cfd5db', 0.3, { metalness: low ? 0.15 : 0.55 });
    const capM = this.std(ANCHOR_YELLOW, 0.32, { metalness: 0.1 });
    const navyM = this.std('#24344e', 0.4, { metalness: 0.3 });
    const ledM = this.track(new THREE.MeshBasicMaterial({ color: '#8dffb0', toneMapped: false }));
    const haloT = this.track(ringTexture(0.72));
    const groundRingT = this.track(ringTexture(0.8, 14));
    const rotor = new Merger();
    for (const a of arena.anchors) {
      const ringMat = this.std(ANCHOR_YELLOW, 0.25, { metalness: low ? 0.1 : 0.45, emissive: new THREE.Color(ANCHOR_YELLOW), emissiveIntensity: 0.15 });
      const ring = new THREE.Mesh(TORUS, ringMat);
      ring.castShadow = this.shadows;
      const head = new THREE.Vector3();
      if (a.kind === 'rail') {
        // which wall are we on?
        const onEnd = Math.abs(a.x) > hx;
        const ox = onEnd ? Math.sign(a.x) : 0;
        const oz = onEnd ? 0 : Math.sign(a.z);
        const px = a.x + ox * 0.15;
        const pz = a.z + oz * 0.15;
        this.inst(CYL, postM, 0.2, 2.3, 0.2, px, 1.15, pz);
        this.inst(CYL, navyM, 0.27, 0.12, 0.27, px, 0.06, pz);
        this.box(capM, 0.78, 0.5, 0.78, px, 2.5, pz, 0);
        this.box(navyM, 0.84, 0.07, 0.84, px, 2.27, pz, 0, false);
        this.box(navyM, 0.36, 0.2, 0.36, px - ox * 0.38, 2.44, pz - oz * 0.38, 0);
        // status light facing the pitch
        this.box(ledM, onEnd ? 0.02 : 0.3, 0.05, onEnd ? 0.3 : 0.02, px - ox * 0.395, 2.62, pz - oz * 0.395, 0, false);
        head.set(a.x - ox * 0.5, 2.1, a.z - oz * 0.5);
        ring.position.copy(head);
        ring.rotation.y = onEnd ? Math.PI / 2 : 0;
      } else {
        // Hovering anchor drone: a yellow body with the ring underneath; no structure crosses the pitch.
        head.set(a.x, 3.2, a.z);
        this.box(capM, 0.7, 0.32, 0.7, a.x, 3.62, a.z, 0);
        this.box(navyM, 1.5, 0.08, 0.16, a.x, 3.82, a.z, Math.PI / 4, false);
        this.box(navyM, 1.5, 0.08, 0.16, a.x, 3.82, a.z, -Math.PI / 4, false);
        this.box(ledM, 0.3, 0.04, 0.3, a.x, 3.45, a.z, 0, false);
        for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          rotor.addAt(DISC, a.x + dx * 0.53, 3.88, a.z + dz * 0.53, -Math.PI / 2, 0, 0, 0.36, 0.36, 1);
          this.inst(CYL, navyM, 0.05, 0.1, 0.05, a.x + dx * 0.53, 3.86, a.z + dz * 0.53, 0, false);
        }
        ring.position.copy(head);
        ring.rotation.x = Math.PI / 2;
        const gr = new THREE.Mesh(PLANE, this.track(new THREE.MeshBasicMaterial({ map: groundRingT, color: ANCHOR_YELLOW, transparent: true, opacity: 0.45, depthWrite: false })));
        gr.rotation.x = -Math.PI / 2;
        gr.scale.set(1.5, 1.5, 1);
        gr.position.set(a.x, 0.016, a.z);
        this.group.add(gr);
      }
      this.group.add(ring);
      const halo = new THREE.Mesh(PLANE, this.track(new THREE.MeshBasicMaterial({ map: haloT, color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, depthTest: false, toneMapped: false })));
      halo.position.copy(head);
      halo.renderOrder = 5;
      this.group.add(halo);
      this.anchors.push({ head, ring, ringMat, halo, glow: 0 });
    }
    if (!rotor.empty) {
      const m = this.mesh(rotor.build(), this.track(new THREE.MeshBasicMaterial({ map: this.track(ringTexture(0.15)), color: '#dfe7f2', transparent: true, opacity: 0.35, depthWrite: false })));
      if (m) m.renderOrder = 2;
    }
  }

  // ------------------------------------------------------------------ surroundings

  private buildSurroundings(th: Theme, hx: number, hz: number): void {
    const id = this.arena.id;
    const low = this.quality === 'low';
    const standM = this.std(th.stand, 0.8);
    const seatM = this.std(th.seat, 0.6);
    const railM = this.std(th.rail, 0.3, { metalness: low ? 0.2 : 0.6 });
    const canopyM = this.std(th.canopy, 0.45, { side: THREE.DoubleSide, metalness: 0.1 });
    const steelM = this.std('#8d949c', 0.35, { metalness: low ? 0.2 : 0.6 });
    const seats: [number, number, number][] = [];

    // north stand (three tiers), split into three blocks with canopies
    const tiers = 3;
    const z0 = -hz - 2.2;
    const tier = (bw: number, bx: number, t: number, zz: number) => {
      const h = 0.5 + t * 0.55;
      this.box(standM, bw, h, 1.3, bx, h / 2, zz, 0, false);
      this.box(seatM, bw - 0.1, 0.12, 0.42, bx, h + 0.06, zz - 0.3, 0, false);
      this.box(railM, bw, 0.04, 0.04, bx, h + 0.42, zz + 0.62, 0, false);
    };
    for (let b = -1; b <= 1; b++) {
      const bw = (hx * 2 - 4) / 3 - 0.8;
      const bx = b * ((hx * 2 - 4) / 3);
      for (let t = 0; t < tiers; t++) {
        tier(bw, bx, t, z0 - t * 1.3);
        const n = Math.floor(bw / 0.75);
        for (let i = 0; i < n; i++) seats.push([bx - bw / 2 + 0.4 + i * 0.75, 0.5 + t * 0.55, z0 - t * 1.3]);
      }
      if (id !== 'championship_dome') {
        const canopy = new THREE.Mesh(PLANE, canopyM);
        canopy.scale.set(bw + 0.4, 2.6, 1);
        canopy.rotation.x = -Math.PI / 2 + 0.3;
        canopy.position.set(bx, 3.9, z0 - 3.0);
        this.group.add(canopy);
        for (const s of [-1, 1]) this.inst(CYL, steelM, 0.07, 4.2, 0.07, bx + (s * bw) / 2, 2.1, z0 - 4.1, 0, false);
        // canopy edge beam
        this.box(steelM, bw + 0.4, 0.1, 0.1, bx, 3.9 + Math.sin(0.3) * 1.3, z0 - 3.0 + Math.cos(0.3) * 1.3, 0, false);
      }
    }
    // end stands behind each goal
    for (const sx of [-1, 1]) {
      const x0 = sx * (hx + this.arena.goalDepth + 2.4);
      for (let t = 0; t < 2; t++) {
        const len = hz * 2 - 5;
        const h = 0.5 + t * 0.55;
        const xx = x0 + sx * t * 1.3;
        this.box(standM, 1.3, h, len, xx, h / 2, 0, 0, false);
        this.box(seatM, 0.42, 0.12, len - 0.1, xx + sx * 0.3, h + 0.06, 0, 0, false);
        this.box(railM, 0.04, 0.04, len, xx - sx * 0.62, h + 0.42, 0, 0, false);
        const n = Math.floor(len / 0.8);
        for (let i = 0; i < n; i++) seats.push([xx, h, -len / 2 + 0.4 + i * 0.8]);
      }
    }
    if (id === 'championship_dome') {
      // extra ring of upper tiers all round for the big-match feel
      for (let t = 0; t < 4; t++) {
        const zz = z0 - tiers * 1.3 - t * 1.4;
        const h = 2.2 + t * 0.7;
        this.box(standM, hx * 2 + 16, h, 1.4, 0, h / 2, zz, 0, false);
        this.box(seatM, hx * 2 + 15.8, 0.12, 0.45, 0, h + 0.06, zz - 0.3, 0, false);
        const n = Math.floor((hx * 2 + 16) / 0.75);
        for (let i = 0; i < n; i++) seats.push([-(hx + 8) + 0.4 + i * 0.75, h, zz]);
      }
      for (const sx of [-1, 1])
        for (let t = 0; t < 3; t++) {
          const xx = sx * (hx + this.arena.goalDepth + 5.2 + t * 1.4);
          const h = 1.7 + t * 0.7;
          this.box(standM, 1.4, h, hz * 2 + 8, xx, h / 2, -2, 0, false);
          this.box(seatM, 0.45, 0.12, hz * 2 + 7.8, xx + sx * 0.3, h + 0.06, -2, 0, false);
          const n = Math.floor((hz * 2 + 8) / 0.8);
          for (let i = 0; i < n; i++) seats.push([xx, h, -2 - (hz + 4) + 0.4 + i * 0.8]);
        }
    }
    this.buildCrowd(th, seats);

    // venue sign on the camera-side wall
    const sign = new THREE.Mesh(PLANE, this.track(new THREE.MeshBasicMaterial({ map: this.track(labelTexture(this.arena.name, '#f3f5ef', '#17273e')), transparent: true })));
    sign.scale.set(7.5, 1.4, 1);
    sign.rotation.x = -0.95;
    sign.position.set(0, 0.5, hz + 1.9);
    this.group.add(sign);

    this.buildLights(th, hx, hz);
    if (id === 'harbor_park') this.harborBackdrop(hx, hz);
    else if (id === 'foundry_court') this.foundryBackdrop(hx, hz);
    else if (id === 'skyline_stadium') this.skylineBackdrop(hx, hz);
    else this.domeBackdrop(hx, hz);
  }

  /** Instanced robot fans: bodies, heads and (medium / high) waving flags in the team colours. */
  private buildCrowd(th: Theme, seats: [number, number, number][]): void {
    const fill = this.quality === 'low' ? 0.3 : this.quality === 'medium' ? 0.6 : 0.82;
    const picked = seats.filter(() => Math.random() < fill);
    if (!picked.length) return;
    const bodyG = this.track(new THREE.CapsuleGeometry(0.2, 0.22, 3, 8));
    const headG = this.track(new THREE.SphereGeometry(0.17, 10, 8));
    const bm = this.track(new THREE.MeshStandardMaterial({ roughness: 0.55 }));
    const hm = this.track(new THREE.MeshStandardMaterial({ roughness: 0.3 }));
    this.crowdBodies = new THREE.InstancedMesh(bodyG, bm, picked.length);
    this.crowdHeads = new THREE.InstancedMesh(headG, hm, picked.length);
    this.crowdPos = new Float32Array(picked.length * 5);
    const col = new THREE.Color();
    const flags: number[] = [];
    const hx = this.arena.length / 2;
    picked.forEach((s, i) => {
      this.crowdPos[i * 5] = s[0] + (Math.random() - 0.5) * 0.15;
      this.crowdPos[i * 5 + 1] = s[1] + 0.3;
      this.crowdPos[i * 5 + 2] = s[2];
      this.crowdPos[i * 5 + 3] = Math.random() * 6.28;
      this.crowdPos[i * 5 + 4] = 0.88 + Math.random() * 0.24;
      // Each end leans toward the team that defends it; the long stand is mixed.
      const end = s[0] < -hx ? 0 : s[0] > hx ? 1 : -1;
      const r = Math.random();
      if (end >= 0 && r < 0.5) col.set(this.teamColors[end as 0 | 1]);
      else if (end < 0 && r < 0.36) col.set(this.teamColors[r < 0.18 ? 0 : 1]);
      else col.set(th.crowd[Math.floor(Math.random() * th.crowd.length)]);
      col.offsetHSL(0, 0, (Math.random() - 0.5) * 0.08);
      this.crowdBodies!.setColorAt(i, col);
      const hr = Math.random();
      col.set(hr < 0.55 ? '#f4f6f2' : hr < 0.75 ? '#c9d0d8' : hr < 0.88 ? '#2b3a55' : th.crowd[Math.floor(Math.random() * th.crowd.length)]);
      this.crowdHeads!.setColorAt(i, col);
      if (this.quality !== 'low' && Math.random() < 0.08 && flags.length < 70 * 5) {
        flags.push(this.crowdPos[i * 5] + 0.18, this.crowdPos[i * 5 + 1] + 0.55, s[2], Math.random() * 6.28, end >= 0 ? end : Math.random() < 0.5 ? 0 : 1);
      }
    });
    this.group.add(this.crowdBodies, this.crowdHeads);
    this.instanced.push(this.crowdBodies, this.crowdHeads);
    if (flags.length) {
      const fg = new Merger();
      fg.addAt(BOX, 0, 0.35, 0, 0, 0, 0, 0.03, 0.7, 0.03);
      const cloth = new THREE.PlaneGeometry(0.48, 0.3, 4, 1);
      cloth.translate(0.24, 0.55, 0);
      fg.add(cloth, new THREE.Matrix4());
      cloth.dispose();
      const flagG = fg.build()!;
      this.track(flagG);
      const n = flags.length / 5;
      this.flagPos = new Float32Array(flags);
      this.crowdFlags = new THREE.InstancedMesh(flagG, this.track(new THREE.MeshStandardMaterial({ roughness: 0.7, side: THREE.DoubleSide })), n);
      for (let i = 0; i < n; i++) {
        col.set(this.teamColors[this.flagPos[i * 5 + 4]]);
        this.crowdFlags.setColorAt(i, col);
      }
      this.crowdFlags.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(this.crowdFlags);
      this.instanced.push(this.crowdFlags);
    }
    this.writeCrowd(0);
    this.writeFlags(0);
  }

  /** Floodlight towers (day / sunset venues) with their light cones, and the beam material. */
  private buildLights(th: Theme, hx: number, hz: number): void {
    const low = this.quality === 'low';
    if (th.beamOpacity > 0 && !low) {
      this.beamMat = this.track(
        new THREE.MeshBasicMaterial({
          map: this.track(beamTexture()),
          color: th.lamp,
          transparent: true,
          opacity: th.beamOpacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
          fog: false,
        }),
      );
    }
    if (th.rig !== 'day' && th.rig !== 'sunset') return;
    const steel = this.std('#5d6675', 0.45, { metalness: low ? 0.2 : 0.6 });
    const lamps = new Merger();
    const beams = new Merger();
    const lampOn = th.rig === 'sunset';
    const lampMat = this.track(new THREE.MeshBasicMaterial({ map: this.track(lampPanelTexture()), color: lampOn ? '#ffffff' : '#9aa0a8', toneMapped: !lampOn }));
    const towers: [number, number][] = [
      [-(hx + 4.5), -(hz + 7.2)],
      [hx + 4.5, -(hz + 7.2)],
    ];
    const H = 13.5;
    for (const [x, z] of towers) {
      this.inst(CYL, steel, 0.28, H, 0.28, x, H / 2, z, 0, false);
      this.inst(CYL, steel, 0.5, 0.3, 0.5, x, 0.15, z, 0, false);
      // lamp head facing the pitch, tilted down at it
      const aim = Math.atan2(-x, -z);
      const target = new THREE.Vector3(x * 0.35, 0, z * 0.15);
      const hc = new THREE.Vector3(x, H + 0.6, z);
      const tilt = Math.atan2(hc.y, Math.hypot(target.x - x, target.z - z));
      this.inst(BOX, steel, 4.4, 2.4, 0.3, hc.x, hc.y, hc.z, aim, false, tilt);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, aim, 0, 'YXZ'));
      const front = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      const lp = hc.clone().addScaledVector(front, 0.17);
      lamps.add(LAMP_PLANE, new THREE.Matrix4().compose(lp, q, _s.set(1, 1, 1)));
      if (this.beamMat) this.beam(beams, lp, target, 4.2);
    }
    this.mesh(lamps.build(), lampMat);
    if (this.beamMat) {
      const bm = this.mesh(beams.build(), this.beamMat);
      if (bm) bm.renderOrder = 4;
    }
  }

  /** Adds an open cone from a lamp to a ground point to `m` (apex at the lamp). */
  private beam(m: Merger, from: THREE.Vector3, to: THREE.Vector3, radius: number): void {
    const dir = to.clone().sub(from);
    const len = dir.length();
    const g = new THREE.ConeGeometry(radius, len, 28, 1, true);
    g.translate(0, -len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(DOWN, dir.normalize());
    m.add(g, new THREE.Matrix4().compose(from, q, _s.set(1, 1, 1)));
    g.dispose();
  }

  private harborBackdrop(hx: number, hz: number): void {
    buildHarborScenery(this.group, -hz - 9.5, (d) => this.track(d), this.quality !== 'low');
    // palms and planters near the camera-side corners
    const planter = this.std('#e9e6dc', 0.8);
    for (const sx of [-1, 1]) {
      this.box(planter, 2.2, 0.5, 2.2, sx * (hx + 3.2), 0.25, hz + 2.6, 0);
      this.group.add(makePalm(sx * (hx + 3.2), 0.5, hz + 2.6, 3.4, (d) => this.track(d)));
      this.group.add(makePalm(sx * (hx + 7.5), 0, -hz - 5, 4.2, (d) => this.track(d)));
    }
    // bunting along the north canopies
    if (this.quality !== 'low') this.bunting(-hx + 1, hx - 1, -hz - 3.8, 4.15);
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
      const sag = (t: number) => y - Math.sin(Math.PI * ((t - x1) / (x2 - x1))) * 0.45;
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

  private foundryBackdrop(hx: number, hz: number): void {
    const steel = this.std('#3b3632', 0.6, { metalness: 0.35 });
    const zb = -hz - 9;
    this.box(steel, hx * 2 + 30, 14, 1, 0, 7, zb, 0, false);
    const glow = this.track(new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff8a2a').multiplyScalar(1.4) }));
    const glow2 = this.track(new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd27a').multiplyScalar(1.6) }));
    const furnaceM = this.std('#2a2623', 0.8);
    const lowQ = this.quality === 'low';
    for (const x of [-hx * 0.7, 0, hx * 0.7]) {
      this.box(furnaceM, 6.4, 6.4, 0.6, x, 3.2, zb + 0.6, 0, false);
      this.box(glow, 5, 4.6, 0.02, x, 2.9, zb + 0.95, 0, false);
      this.box(glow2, 3.2, 2.6, 0.02, x, 2.2, zb + 0.97, 0, false);
      // riveted lintel
      this.box(steel, 6.8, 0.5, 0.9, x, 6.0, zb + 0.75, 0, false);
      const pl = new THREE.PointLight('#ff8a2a', 60, 30, 1.6);
      pl.position.set(x, 3, zb + 3);
      this.group.add(pl);
    }
    // girders and hazard-striped side walls
    for (const x of [-hx - 6, -hx * 0.35, hx * 0.35, hx + 6]) this.box(steel, 0.8, 14, 0.8, x, 7, zb + 0.9, 0, false);
    this.box(steel, hx * 2 + 30, 0.7, 0.9, 0, 12.5, zb + 0.9, 0, false);
    const hazard = this.std('#e9a23a', 0.5);
    const dark = this.std('#1d1a18', 0.6);
    for (const sx of [-1, 1]) {
      this.box(steel, 1, 9, hz * 2 + 22, sx * (hx + 9.5), 4.5, -2, 0, false);
      for (let i = 0; i < 12; i++) this.box(i % 2 ? dark : hazard, 0.2, 0.5, 1.2, sx * (hx + 8.95), 1.2, -hz - 4 + i * 2.4, 0, false);
    }
    // hanging industrial lamps with light cones onto the court
    const lampM = this.track(new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe3b0').multiplyScalar(1.5) }));
    const beams = new Merger();
    for (const x of [-hx * 0.55, 0, hx * 0.55]) {
      this.box(dark, 0.06, 2.5, 0.06, x, 9.2, -hz - 4, 0, false);
      this.box(steel, 1.9, 0.35, 0.8, x, 8.1, -hz - 4, 0, false);
      this.box(lampM, 1.6, 0.05, 0.6, x, 7.9, -hz - 4, 0, false);
      if (this.beamMat) this.beam(beams, new THREE.Vector3(x, 7.88, -hz - 4), new THREE.Vector3(x * 1.1, 0, -hz * 0.35), 3.4);
    }
    if (this.beamMat) {
      const bm = this.mesh(beams.build(), this.beamMat);
      if (bm) bm.renderOrder = 4;
    }
    // drifting embers rising from the furnaces
    if (!lowQ) {
      const n = 70;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const fx = [-hx * 0.7, 0, hx * 0.7][i % 3];
        this.emberData.push({ x: fx + (Math.random() - 0.5) * 4.5, y: Math.random() * 10, z: zb + 1.2 + Math.random() * 2.5, vy: 0.6 + Math.random() * 1.1, sway: Math.random() * 6.28, life: 0 });
      }
      const g = this.track(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      const m = this.track(
        new THREE.PointsMaterial({ map: blobTexture(), color: new THREE.Color('#ffb05a').multiplyScalar(1.6), size: 0.22, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
      );
      this.embers = new THREE.Points(g, m);
      this.embers.frustumCulled = false;
      this.group.add(this.embers);
    }
  }

  private skylineBackdrop(hx: number, hz: number): void {
    const lit = '#ffd27a';
    const mats = ['#3a3566', '#4a3f78', '#2f2c58', '#56437a'].map((cc) => {
      const t = this.track(windowsTexture(cc, lit));
      return this.std('#ffffff', 0.6, { map: t, emissiveMap: t, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.6 });
    });
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const beacons = new Merger();
    for (let i = 0; i < 26; i++) {
      const x = -60 + i * 4.8 + rnd() * 2;
      const h = 8 + rnd() * 22;
      const w = 3 + rnd() * 2.5;
      const z = -hz - 22 - rnd() * 14;
      this.box(mats[i % mats.length], w, h, w, x, h / 2 - 9, z, 0, false);
      if (h > 22) beacons.addAt(BALL, x, h - 9 + 0.5, z, 0, 0, 0, 0.35, 0.35, 0.35);
    }
    for (const sx of [-1, 1])
      for (let i = 0; i < 6; i++) {
        const h = 10 + rnd() * 16;
        this.box(mats[(i + 1) % mats.length], 4, h, 4, sx * (hx + 20 + rnd() * 10), h / 2 - 9, -hz - 6 + i * 7, 0, false);
      }
    // aircraft warning beacons on the tallest towers (blink)
    this.beaconMat = this.track(new THREE.MeshBasicMaterial({ color: '#ff3030', toneMapped: false }));
    this.mesh(beacons.build(), this.beaconMat);
    // rooftop edge parapet with a warm light line
    const parapet = this.std('#6f7390', 0.7);
    this.box(parapet, hx * 2 + 26, 0.9, 0.6, 0, 0.45, -hz - 11.5, 0, false);
    for (const sx of [-1, 1]) this.box(parapet, 0.6, 0.9, hz * 2 + 26, sx * (hx + 12.5), 0.45, 0, 0, false);
    const strip = this.track(new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc887').multiplyScalar(1.3) }));
    this.box(strip, hx * 2 + 26, 0.06, 0.62, 0, 0.92, -hz - 11.5, 0, false);
    // sunset disc with a soft corona
    const sun = new THREE.Mesh(this.track(new THREE.CircleGeometry(7, 40)), this.track(new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe2a0').multiplyScalar(1.25), fog: false })));
    sun.position.set(-14, 2, -95);
    this.group.add(sun);
    const corona = new THREE.Mesh(PLANE, this.track(new THREE.MeshBasicMaterial({ map: blobTexture(), color: '#ffb070', transparent: true, opacity: 0.55, depthWrite: false, fog: false })));
    corona.scale.set(42, 42, 1);
    corona.position.set(-14, 2, -96);
    this.group.add(corona);
  }

  private domeBackdrop(hx: number, hz: number): void {
    const shell = this.std('#0f1a3a', 0.9);
    this.box(shell, hx * 2 + 40, 22, 1, 0, 11, -hz - 13.5, 0, false);
    for (const sx of [-1, 1]) this.box(shell, 1, 22, hz * 2 + 40, sx * (hx + 12.5), 11, 0, 0, false);
    // roof ribs over the far stands only (never between the match camera and the pitch)
    const rib = this.std('#1b2a55', 0.5, { metalness: 0.4 });
    for (let i = -3; i <= 3; i++) this.box(rib, 0.5, 0.5, 12, i * 7, 17, -hz - 14, 0, false);
    // lighting truss ring over the pitch with lamp clusters and cones
    const truss = this.std('#9aa6bf', 0.35, { metalness: 0.6 });
    const lampM = this.track(new THREE.MeshBasicMaterial({ color: new THREE.Color('#dff0ff').multiplyScalar(1.6) }));
    const beams = new Merger();
    const yR = 13;
    const zR = -hz - 8.5;
    this.box(truss, hx * 2 + 6, 0.35, 0.35, 0, yR + 0.6, zR, 0, false);
    this.box(truss, hx * 2 + 6, 0.2, 0.2, 0, yR - 0.2, zR, 0, false);
    for (const x of [-hx * 0.75, -hx * 0.25, hx * 0.25, hx * 0.75]) {
      this.box(truss, 2.4, 0.5, 0.8, x, yR, zR, 0, false);
      this.box(lampM, 2.2, 0.05, 0.6, x, yR - 0.27, zR + 0.1, 0, false);
      if (this.beamMat) this.beam(beams, new THREE.Vector3(x, yR - 0.3, zR), new THREE.Vector3(x * 0.85, 0, -hz * 0.15), 4.6);
    }
    for (const sx of [-1, 1]) {
      this.box(truss, 0.35, 0.35, hz * 2 + 4, sx * (hx + 9), yR + 0.6, -2, 0, false);
      for (const z of [-hz * 0.5, hz * 0.3]) {
        this.box(truss, 0.8, 0.5, 2.0, sx * (hx + 9), yR, z, 0, false);
        this.box(lampM, 0.6, 0.05, 1.8, sx * (hx + 9) - sx * 0.1, yR - 0.27, z, 0, false);
        if (this.beamMat) this.beam(beams, new THREE.Vector3(sx * (hx + 9), yR - 0.3, z), new THREE.Vector3(sx * hx * 0.55, 0, z * 0.6), 4.0);
      }
    }
    if (this.beamMat) {
      const bm = this.mesh(beams.build(), this.beamMat);
      if (bm) bm.renderOrder = 4;
    }
    // championship banner
    const banner = new THREE.Mesh(PLANE, this.track(new THREE.MeshBasicMaterial({ map: this.track(labelTexture('Championship', '#17273e', '#f6c542')), transparent: true })));
    banner.scale.set(11, 2, 1);
    banner.position.set(0, 9.2, -hz - 12.9);
    this.group.add(banner);
    const blue = this.track(new THREE.MeshBasicMaterial({ color: new THREE.Color('#2f6fe4').multiplyScalar(1.5), toneMapped: false }));
    this.box(blue, hx * 2 + 24, 0.25, 0.25, 0, 6.6, -hz - 12.8, 0, false);
    this.box(blue, hx * 2 + 24, 0.12, 0.12, 0, 11.8, -hz - 12.8, 0, false);
    // camera flashes twinkling in the stands
    if (this.quality !== 'low') {
      const n = 46;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const side = Math.random();
        if (side < 0.6) {
          pos[i * 3] = (Math.random() - 0.5) * (hx * 2 + 14);
          pos[i * 3 + 1] = 1.4 + Math.random() * 4;
          pos[i * 3 + 2] = -hz - 2.5 - Math.random() * 9;
        } else {
          const sx = side < 0.8 ? -1 : 1;
          pos[i * 3] = sx * (hx + 4.5 + Math.random() * 6);
          pos[i * 3 + 1] = 1.0 + Math.random() * 3;
          pos[i * 3 + 2] = (Math.random() - 0.5) * (hz * 2 + 4);
        }
      }
      const g = this.track(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const sizes = new Float32Array(n);
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
      this.flashLife = sizes;
      const m = this.track(new THREE.PointsMaterial({ map: blobTexture(), vertexColors: true, size: 0.55, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      this.flashes = new THREE.Points(g, m);
      this.flashes.frustumCulled = false;
      this.group.add(this.flashes);
    }
  }

  // ------------------------------------------------------------------ animation

  private writeCrowd(time: number): void {
    if (!this.crowdBodies || !this.crowdHeads) return;
    const d = this.dummy;
    const n = this.crowdBodies.count;
    const ex = this.excitement;
    for (let i = 0; i < n; i++) {
      const ph = this.crowdPos[i * 5 + 3];
      const sc = this.crowdPos[i * 5 + 4];
      const hop = ex > 0.01 ? Math.abs(Math.sin(time * 9 + ph)) * 0.32 * ex : 0;
      d.position.set(this.crowdPos[i * 5], this.crowdPos[i * 5 + 1] + hop, this.crowdPos[i * 5 + 2]);
      d.rotation.set(0, 0, ex > 0.01 ? Math.sin(time * 5 + ph) * 0.12 * ex : 0);
      d.scale.setScalar(sc);
      d.updateMatrix();
      this.crowdBodies.setMatrixAt(i, d.matrix);
      d.position.y += 0.36 * sc;
      d.updateMatrix();
      this.crowdHeads.setMatrixAt(i, d.matrix);
    }
    this.crowdBodies.instanceMatrix.needsUpdate = true;
    this.crowdHeads.instanceMatrix.needsUpdate = true;
  }

  private writeFlags(time: number): void {
    const f = this.crowdFlags;
    if (!f) return;
    const d = this.dummy;
    const ex = this.excitement;
    const n = f.count;
    for (let i = 0; i < n; i++) {
      const ph = this.flagPos[i * 5 + 3];
      const hop = ex > 0.01 ? Math.abs(Math.sin(time * 9 + ph)) * 0.32 * ex : 0;
      d.position.set(this.flagPos[i * 5], this.flagPos[i * 5 + 1] - 0.3 + hop, this.flagPos[i * 5 + 2]);
      const wave = Math.sin(time * (2.2 + ex * 6) + ph);
      d.rotation.set(0, wave * (0.5 + ex * 0.5), wave * 0.15 * (1 + ex));
      d.scale.set(1 + Math.sin(time * 7 + ph) * 0.06, 1, 1);
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
    for (const a of this.anchors) {
      const target = a.glow;
      const cur = a.ringMat.emissiveIntensity;
      const g = cur + ((target > 0 ? 1.6 : 0.15) - cur) * Math.min(1, dt * 14);
      a.ringMat.emissiveIntensity = g;
      const pulse = target > 0 ? 1.25 + (reduced ? 0 : Math.sin(time * 7) * 0.08) : 1;
      a.ring.scale.setScalar(a.ring.scale.x + (pulse - a.ring.scale.x) * Math.min(1, dt * 14));
      const hm = a.halo.material as THREE.MeshBasicMaterial;
      hm.opacity += ((target > 0 ? 0.95 : 0) - hm.opacity) * Math.min(1, dt * 16);
      a.halo.visible = hm.opacity > 0.02;
      if (a.halo.visible) {
        // 1 = the anchor you would grab, 2 = attached
        hm.color.set(target >= 2 ? '#7ff3ff' : '#fff3c2');
        a.halo.quaternion.copy(camera.quaternion);
        const s = 1.5 + (reduced ? 0 : Math.sin(time * 7) * 0.1);
        a.halo.scale.set(s, s, 1);
      }
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
    if (this.beaconMat) this.beaconMat.color.setRGB(Math.sin(time * 3.2) > 0.6 ? 1.6 : 0.25, 0.05, 0.05);
    if (this.embers && !reduced) this.updateEmbers(dt);
    if (this.flashes) this.updateFlashes(dt, reduced);

    if (this.excitement > 0.01) {
      this.excitement = Math.max(0, this.excitement - dt * 0.35);
      if (!reduced && this.quality !== 'low') {
        this.writeCrowd(time);
        this.crowdDirty = true;
      }
    } else if (this.crowdDirty) {
      this.excitement = 0;
      this.writeCrowd(time);
      this.crowdDirty = false;
    }
    // Flags wave at 30 Hz at most; frozen with reduced motion.
    if (this.crowdFlags && !reduced && time - this.lastFlagTime > 1 / 30) {
      this.lastFlagTime = time;
      this.writeFlags(time);
    }
  }

  private updateEmbers(dt: number): void {
    const pts = this.embers!;
    const pos = pts.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const hz = this.arena.width / 2;
    const zb = -hz - 9;
    for (let i = 0; i < this.emberData.length; i++) {
      const e = this.emberData[i];
      e.y += e.vy * dt;
      e.sway += dt * 1.7;
      if (e.y > 11) {
        e.y = 0.5 + Math.random() * 1.5;
        e.z = zb + 1.2 + Math.random() * 2.5;
      }
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
      else if (Math.random() < rate / n * 3) l = 1;
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
const CYL = new THREE.CylinderGeometry(1, 1, 1, 14);
/** Unit tube along +y centred on the origin (for goal frames). */
const TUBE = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true);
const BALL = new THREE.SphereGeometry(1, 16, 12);
const DISC = new THREE.CircleGeometry(1, 20);
const TORUS = new THREE.TorusGeometry(0.32, 0.085, 12, 28);
const LAMP_PLANE = new THREE.PlaneGeometry(4.0, 2.0);

/** Builds a palm frond: a tapering leaf bent downward along its length. */
function frondGeometry(len: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(len, 0.62, 10, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + len / 2; // 0..len from the crown
    const t = x / len;
    const y = p.getY(i);
    const w = Math.sin(Math.PI * Math.min(1, t * 1.05)) * (1 - t * 0.35);
    p.setXYZ(i, x, -t * t * len * 0.55, y * w);
    // fold the leaf along its rib
    p.setY(i, p.getY(i) + Math.abs(y * w) * 0.35);
  }
  g.computeVertexNormals();
  return g;
}

export function makePalm(x: number, y: number, z: number, h: number, track: <T extends { dispose(): void }>(d: T) => T): THREE.Group {
  const g = new THREE.Group();
  const trunkM = track(new THREE.MeshStandardMaterial({ color: '#a8845a', roughness: 0.9 }));
  const leafM = track(new THREE.MeshStandardMaterial({ color: '#4fae63', roughness: 0.65, side: THREE.DoubleSide }));
  // Gently curved trunk of stacked, tapering rings; fronds and coconuts merged into single meshes.
  const trunk = new Merger();
  const seg = 7;
  const lean = 0.09;
  let tx = 0;
  for (let i = 0; i < seg; i++) {
    const t = i / seg;
    const r = 0.2 - t * 0.07;
    tx = Math.sin(t * 1.4) * lean * h;
    trunk.addAt(RING_SEG, tx, (i + 0.5) * (h / seg), 0, 0, 0, Math.sin(t * 1.4) * 0.12, r, h / seg, r);
  }
  const top = new THREE.Vector3(Math.sin(1.4) * lean * h * 0.95, h, 0);
  const nuts = new Merger();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    nuts.addAt(BALL, top.x + Math.cos(a) * 0.17, h - 0.12, Math.sin(a) * 0.17, 0, 0, 0, 0.13, 0.13, 0.13);
  }
  const trunkG = trunk.build();
  if (trunkG) {
    const tm = new THREE.Mesh(track(trunkG), trunkM);
    g.add(tm);
  }
  const nutG = nuts.build();
  if (nutG) g.add(new THREE.Mesh(track(nutG), track(new THREE.MeshStandardMaterial({ color: '#6b5132', roughness: 0.7 }))));
  const fronds = new Merger();
  const frond = frondGeometry(2.5);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + (i % 2) * 0.2;
    const lift = i % 2 ? 0.35 : 0.1;
    fronds.add(frond, new THREE.Matrix4().compose(_p.set(top.x, h + 0.05, top.z), _q.setFromEuler(_e.set(0, -a, lift, 'YXZ')), _s.set(1, 1, 1)));
  }
  frond.dispose();
  const frondG = fronds.build();
  if (frondG) g.add(new THREE.Mesh(track(frondG), leafM));
  g.position.set(x, y, z);
  return g;
}

const RING_SEG = new THREE.CylinderGeometry(1, 1.12, 1, 12);

/** Sea, quay, islands, lighthouse, boats and domed buildings beyond `zEdge` (shared with the menu stage). */
export function buildHarborScenery(group: THREE.Group, zEdge: number, track: <T extends { dispose(): void }>(d: T) => T, detailed: boolean): void {
  const sea = new THREE.Mesh(track(new THREE.PlaneGeometry(520, 420)), track(new THREE.MeshStandardMaterial({ color: '#2b95d4', roughness: 0.22, metalness: 0.1 })));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.9, zEdge - 60);
  group.add(sea);
  const quay = new THREE.Mesh(BOX, track(new THREE.MeshStandardMaterial({ color: '#efe9da', roughness: 0.8 })));
  quay.scale.set(240, 1, 0.8);
  quay.position.set(0, -0.45, zEdge);
  group.add(quay);

  const green = track(new THREE.MeshStandardMaterial({ color: '#63b574', roughness: 0.9 }));
  const rock = track(new THREE.MeshStandardMaterial({ color: '#d8c7a2', roughness: 0.9 }));
  const greens = new Merger();
  const rocks = new Merger();
  const island = (x: number, z: number, sx: number, sy: number, sz: number) => {
    rocks.addAt(BALL, x, -0.9, z, 0, 0, 0, sx * 1.08, sy * 0.55, sz * 1.08);
    greens.addAt(BALL, x, -0.6, z, 0, 0, 0, sx, sy, sz);
    greens.addAt(BALL, x + sx * 0.25, -0.6 + sy * 0.25, z - sz * 0.1, 0, 0, 0, sx * 0.55, sy * 0.95, sz * 0.6);
  };
  island(-34, zEdge - 46, 15, 4.5, 8);
  island(30, zEdge - 60, 20, 6, 9);
  island(64, zEdge - 40, 10, 3.2, 6);
  const rg = rocks.build();
  if (rg) group.add(new THREE.Mesh(track(rg), rock));
  const gg = greens.build();
  if (gg) group.add(new THREE.Mesh(track(gg), green));

  // lighthouse
  const lh = new THREE.Group();
  const whiteM = track(new THREE.MeshStandardMaterial({ color: '#fbfaf5', roughness: 0.5 }));
  const redM = track(new THREE.MeshStandardMaterial({ color: '#e2534b', roughness: 0.5 }));
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Mesh(CYL, i % 2 ? redM : whiteM);
    const r = 1.25 - i * 0.14;
    seg.scale.set(r, 2, r);
    seg.position.y = 1 + i * 2;
    lh.add(seg);
  }
  const lamp = new THREE.Mesh(CYL, track(new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff3b8').multiplyScalar(1.4) })));
  lamp.scale.set(0.6, 0.9, 0.6);
  lamp.position.y = 8.45;
  lh.add(lamp);
  const roof = new THREE.Mesh(track(new THREE.ConeGeometry(0.9, 1, 12)), redM);
  roof.position.y = 9.4;
  lh.add(roof);
  lh.position.set(-30, 3.2, zEdge - 44);
  group.add(lh);

  // domed harbour buildings
  const domeM = track(new THREE.MeshStandardMaterial({ color: '#f4f2ea', roughness: 0.4 }));
  const glassM = track(new THREE.MeshStandardMaterial({ color: '#8fd3ee', roughness: 0.12, metalness: 0.3 }));
  const domes = new Merger();
  const bands = new Merger();
  for (const [x, z, s] of [[34, zEdge - 58, 4.6], [44, zEdge - 55, 3.2], [-52, zEdge - 30, 3.6]] as [number, number, number][]) {
    domes.addAt(BALL, x, 4.2, z, 0, 0, 0, s, s * 0.75, s);
    bands.addAt(CYL, x, 4.2, z, 0, 0, 0, s * 1.01, s * 0.3, s * 1.01);
  }
  group.add(new THREE.Mesh(track(domes.build()!), domeM), new THREE.Mesh(track(bands.build()!), glassM));

  // soft clouds on the horizon
  const cloudM = track(new THREE.MeshBasicMaterial({ map: track(cloudTexture()), transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
  const clouds = new Merger();
  for (const [x, y, z, s] of [[-90, 30, -200, 60], [-20, 42, -230, 80], [70, 34, -210, 64], [150, 28, -180, 54], [-160, 36, -170, 58]] as [number, number, number, number][]) {
    clouds.addAt(PLANE, x, y, zEdge + z, 0, 0, 0, s, s * 0.5, 1);
  }
  const cg = clouds.build();
  if (cg) group.add(new THREE.Mesh(track(cg), cloudM));

  if (detailed) {
    // sailboats
    const hulls = new Merger();
    const sails = new Merger();
    const sailG = new THREE.ConeGeometry(1, 2.6, 3);
    for (const [x, z] of [[-12, zEdge - 20], [8, zEdge - 30], [22, zEdge - 16], [-48, zEdge - 18], [-31, zEdge + 16], [32, zEdge + 24], [-29, zEdge + 34], [27, zEdge + 6]] as [number, number][]) {
      hulls.addAt(BOX, x, -0.6, z, 0, 0, 0, 2.4, 0.5, 0.8);
      sails.addAt(sailG, x + 0.1, 1.05, z, 0, 0, 0, 1, 1, 0.12);
    }
    sailG.dispose();
    group.add(new THREE.Mesh(track(hulls.build()!), whiteM), new THREE.Mesh(track(sails.build()!), whiteM));
    // wind turbines on the far island
    const turb = new Merger();
    for (const x of [22, 27]) {
      turb.addAt(CYL, x, 7.5, zEdge - 62, 0, 0, 0, 0.12, 7, 0.12);
      for (let i = 0; i < 3; i++) {
        turb.addAt(BOX, x + Math.sin((i * Math.PI * 2) / 3) * 1.3, 11 + Math.cos((i * Math.PI * 2) / 3) * 1.3, zEdge - 61.8, 0, 0, -(i * Math.PI * 2) / 3, 0.18, 2.6, 0.06);
      }
    }
    group.add(new THREE.Mesh(track(turb.build()!), whiteM));
  }
}
