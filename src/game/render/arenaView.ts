import * as THREE from 'three';
import type { ArenaDef, ArenaId } from '../../content/arenas';
import { fieldTexture, labelTexture, netTexture, ringTexture, skyTexture, tileTexture, windowsTexture } from './textures';

export type Quality = 'low' | 'medium' | 'high';

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
  canopy: string;
  sun: string;
  sunIntensity: number;
  sunPos: [number, number, number];
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  crowd: string[];
}

const THEMES: Record<ArenaId, Theme> = {
  harbor_park: {
    sky: [[0, '#3f9fe6'], [0.55, '#8fd0f5'], [1, '#e2f6ff']],
    fog: null,
    grassA: '#4aa588', grassB: '#429a7e', line: '#f4faf5',
    wall: '#eeeadf', wallTop: '#fbf9f2',
    floorA: '#d6dadd', floorB: '#cbd0d4', grout: '#b9bfc4',
    stand: '#e9e6dc', canopy: '#f6c542',
    sun: '#fff1d2', sunIntensity: 2.6, sunPos: [-16, 26, 14],
    hemiSky: '#dff1ff', hemiGround: '#7f9c8c', hemiIntensity: 0.9,
    crowd: ['#12bcd2', '#f48a2c', '#f3f5ef', '#f6c542', '#7a8aa0', '#51c998'],
  },
  foundry_court: {
    sky: [[0, '#120d0b'], [0.6, '#2b1a12'], [1, '#5a2d14']],
    fog: '#1a120e',
    grassA: '#428f72', grassB: '#3a856a', line: '#f0ece0',
    wall: '#6b665f', wallTop: '#8a847a',
    floorA: '#3d3935', floorB: '#35312e', grout: '#262321',
    stand: '#4a4540', canopy: '#e9a23a',
    sun: '#ffd7a6', sunIntensity: 2.0, sunPos: [-8, 28, 14],
    hemiSky: '#ffcf9c', hemiGround: '#40302a', hemiIntensity: 0.95,
    crowd: ['#f48a2c', '#e9a23a', '#8c8177', '#d8d2c6', '#12bcd2', '#b2553a'],
  },
  skyline_stadium: {
    sky: [[0, '#2b2466'], [0.45, '#8a4a8f'], [0.75, '#f08a5a'], [1, '#ffd79a']],
    fog: null,
    grassA: '#43a086', grassB: '#3b957c', line: '#fff6ea',
    wall: '#dcd6de', wallTop: '#f1ecf2',
    floorA: '#8f93a8', floorB: '#858aa0', grout: '#70748a',
    stand: '#bdb7c9', canopy: '#f6a94a',
    sun: '#ffc58f', sunIntensity: 2.2, sunPos: [-22, 20, -6],
    hemiSky: '#cdb9ff', hemiGround: '#6f6a8c', hemiIntensity: 1.25,
    crowd: ['#8a5cf0', '#f48a2c', '#f3f5ef', '#12bcd2', '#ec5f8e', '#f6c542'],
  },
  championship_dome: {
    sky: [[0, '#070c1f'], [0.6, '#101c44'], [1, '#1f3a7a']],
    fog: '#0b1330',
    grassA: '#48aa86', grassB: '#3f9f7c', line: '#ffffff',
    wall: '#e6ebf5', wallTop: '#ffffff',
    floorA: '#1d2a4d', floorB: '#192545', grout: '#131c36',
    stand: '#243463', canopy: '#f6c542',
    sun: '#eef4ff', sunIntensity: 2.4, sunPos: [-6, 34, 10],
    hemiSky: '#b9ccff', hemiGround: '#2a3a66', hemiIntensity: 1.1,
    crowd: ['#12bcd2', '#f48a2c', '#f3f5ef', '#f6c542', '#5f7fd6', '#e96a64', '#51c998'],
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

export class ArenaView {
  readonly group = new THREE.Group();
  readonly anchors: AnchorView[] = [];
  readonly background: THREE.Texture;
  readonly fog: THREE.Fog | null;
  readonly sun: THREE.DirectionalLight;
  private crowdBodies: THREE.InstancedMesh | null = null;
  private crowdHeads: THREE.InstancedMesh | null = null;
  private crowdPos: Float32Array = new Float32Array(0);
  private goalMats: THREE.MeshStandardMaterial[] = [];
  private netMeshes: THREE.Group[] = [];
  private goalFlash: [number, number] = [0, 0];
  private excitement = 0;
  private crowdDirty = false;
  private disposables: { dispose(): void }[] = [];
  private dummy = new THREE.Object3D();
  private instanced: THREE.InstancedMesh[] = [];

  constructor(private arena: ArenaDef, private quality: Quality, teamColors: [string, string]) {
    const th = THEMES[arena.id];
    const hx = arena.length / 2;
    const hz = arena.width / 2;
    const shadows = quality === 'high';

    this.background = this.track(skyTexture(th.sky));
    this.fog = th.fog ? new THREE.Fog(th.fog, 70, 150) : null;

    const hemi = new THREE.HemisphereLight(th.hemiSky, th.hemiGround, th.hemiIntensity);
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
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.03;
    }
    this.group.add(this.sun, this.sun.target);

    const std = (color: string, rough = 0.8, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
      this.track(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }));
    // Static boxes are batched into one instanced mesh per material to keep draw calls low.
    const batches = new Map<THREE.Material, { cast: THREE.Matrix4[]; flat: THREE.Matrix4[] }>();
    const tmpQ = new THREE.Quaternion();
    const tmpP = new THREE.Vector3();
    const tmpS = new THREE.Vector3();
    const Y = new THREE.Vector3(0, 1, 0);
    const box = (m: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number, ry = 0, cast = true): void => {
      let b = batches.get(m);
      if (!b) batches.set(m, (b = { cast: [], flat: [] }));
      const mat = new THREE.Matrix4().compose(tmpP.set(x, y, z), tmpQ.setFromAxisAngle(Y, ry), tmpS.set(sx, sy, sz));
      (cast ? b.cast : b.flat).push(mat);
    };
    const flushBoxes = () => {
      for (const [m, b] of batches) {
        for (const [list, cast] of [[b.cast, true], [b.flat, false]] as [THREE.Matrix4[], boolean][]) {
          if (!list.length) continue;
          const inst = new THREE.InstancedMesh(BOX, m, list.length);
          list.forEach((mat, i) => inst.setMatrixAt(i, mat));
          inst.instanceMatrix.needsUpdate = true;
          inst.castShadow = shadows && cast;
          inst.receiveShadow = shadows;
          inst.frustumCulled = false;
          this.group.add(inst);
          this.instanced.push(inst);
        }
      }
    };

    // --- ground ---
    const tiles = this.track(tileTexture(th.floorA, th.floorB, th.grout));
    // Harbor Park sits on a pier so the sea frames the court; the other venues use a wide floor.
    const pier = arena.id === 'harbor_park';
    const fw = pier ? (hx + 10.5) * 2 : 190;
    const fd = pier ? (hz + 9.5) * 2 : 140;
    tiles.repeat.set(fw / 4, fd / 4);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(fw, fd), std('#ffffff', 0.9, { map: tiles }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.03, pier ? -1 : 0);
    if (pier) {
      const edgeM = std('#efe9da', 0.8);
      box(edgeM, fw + 0.8, 1, 0.8, 0, -0.52, fd / 2 - 1 + 0.4, 0, false);
      box(edgeM, 0.8, 1, fd, fw / 2 + 0.4, -0.52, -1, 0, false);
      box(edgeM, 0.8, 1, fd, -fw / 2 - 0.4, -0.52, -1, 0, false);
    }
    floor.receiveShadow = shadows;
    this.group.add(floor);
    this.disposables.push(floor.geometry);

    const ft = this.track(fieldTexture(arena.length, arena.width, arena.goalWidth, { grassA: th.grassA, grassB: th.grassB, line: th.line }, quality === 'low' ? 1024 : 2048));
    const field = new THREE.Mesh(new THREE.PlaneGeometry(arena.length, arena.width), std('#ffffff', 0.95, { map: ft }));
    field.rotation.x = -Math.PI / 2;
    field.receiveShadow = shadows;
    this.group.add(field);
    this.disposables.push(field.geometry);

    // --- walls ---
    const wallM = std(th.wall, 0.7);
    const topM = std(th.wallTop, 0.6);
    const capM = std(ANCHOR_YELLOW, 0.5);
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
      box(wallM, len + WT * 0.5, WH, WT, cx, WH / 2, cz, -ang);
      box(topM, len + WT * 0.5, 0.08, WT + 0.08, cx, WH + 0.04, cz, -ang, false);
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
        box(capM, 0.8, WH + 0.22, 0.8, sx * (hx - c + 0.05), (WH + 0.22) / 2, sz * (hz + WT / 2), 0);
        box(capM, 0.8, WH + 0.22, 0.8, sx * (hx + WT / 2), (WH + 0.22) / 2, sz * (hz - c + 0.05), 0);
      }
    // corner deck fill (outside the diagonal walls)
    const deckM = std(th.wall, 0.85);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const tri = new THREE.Shape();
        tri.moveTo(0, 0);
        tri.lineTo(c + 1, 0);
        tri.lineTo(0, c + 1);
        tri.closePath();
        const g = new THREE.ShapeGeometry(tri);
        this.disposables.push(g);
        const m = new THREE.Mesh(g, deckM);
        m.rotation.x = -Math.PI / 2;
        m.scale.set(-sx, sz, 1);
        m.position.set(sx * (hx + 0.5), 0.02, sz * (hz + 0.5));
        (m.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
        m.receiveShadow = shadows;
        this.group.add(m);
      }

    // --- goals ---
    const netT = this.track(netTexture('rgba(255,255,255,0.9)'));
    for (const side of [0, 1] as const) {
      const sx = side === 0 ? -1 : 1;
      const color = teamColors[side];
      const gm = std(color, 0.4, { emissive: new THREE.Color(color), emissiveIntensity: 0.35 });
      this.goalMats.push(gm);
      const GH = 2.15;
      const gd = arena.goalDepth;
      const gx = sx * hx;
      const post = (z: number) => {
        const p = new THREE.Mesh(CYL, gm);
        p.scale.set(0.16, GH, 0.16);
        p.position.set(gx, GH / 2, z);
        p.castShadow = shadows;
        this.group.add(p);
      };
      post(-gh);
      post(gh);
      box(gm, 0.3, 0.3, arena.goalWidth + 0.3, gx, GH, 0, 0);
      box(gm, gd, 0.16, 0.16, gx + (sx * gd) / 2, GH, -gh, 0);
      box(gm, gd, 0.16, 0.16, gx + (sx * gd) / 2, GH, gh, 0);
      box(gm, 0.2, GH, 0.2, gx + sx * gd, GH / 2, -gh, 0);
      box(gm, 0.2, GH, 0.2, gx + sx * gd, GH / 2, gh, 0);
      box(gm, 0.16, 0.16, arena.goalWidth, gx + sx * gd, GH, 0, 0);
      // goal floor tint
      const gf = new THREE.Mesh(PLANE, this.track(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28 })));
      gf.rotation.x = -Math.PI / 2;
      gf.scale.set(gd, arena.goalWidth, 1);
      gf.position.set(gx + (sx * gd) / 2, 0.012, 0);
      this.group.add(gf);
      // goal-line glow strip on the pitch
      const strip = new THREE.Mesh(PLANE, this.track(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 })));
      strip.rotation.x = -Math.PI / 2;
      strip.scale.set(0.28, arena.goalWidth, 1);
      strip.position.set(gx - sx * 0.14, 0.014, 0);
      this.group.add(strip);
      // net
      const net = new THREE.Group();
      const nm = (rx: number, rz: number) => {
        const t = netT.clone();
        t.needsUpdate = true;
        t.repeat.set(rx, rz);
        this.track(t);
        return this.track(new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
      };
      const back = new THREE.Mesh(PLANE, nm(arena.goalWidth * 2.2, GH * 2.2));
      back.scale.set(arena.goalWidth, GH, 1);
      back.rotation.y = Math.PI / 2;
      back.position.set(sx * gd, GH / 2, 0);
      net.add(back);
      for (const z of [-gh, gh]) {
        const s = new THREE.Mesh(PLANE, nm(gd * 2.2, GH * 2.2));
        s.scale.set(gd, GH, 1);
        s.position.set((sx * gd) / 2, GH / 2, z);
        net.add(s);
      }
      const top = new THREE.Mesh(PLANE, nm(gd * 2.2, arena.goalWidth * 2.2));
      top.scale.set(gd, arena.goalWidth, 1);
      top.rotation.x = -Math.PI / 2;
      top.position.set((sx * gd) / 2, GH, 0);
      net.add(top);
      net.position.set(gx, 0, 0);
      this.group.add(net);
      this.netMeshes.push(net);
      // walls behind the goal
      box(wallM, WT, WH, arena.goalWidth + 1.2, gx + sx * (gd + WT / 2 + 0.05), WH / 2, 0, 0);
    }

    // --- anchors ---
    const postM = std('#cfd3d6', 0.5, { metalness: 0.2 });
    const haloT = this.track(ringTexture(0.72));
    const groundRingT = this.track(ringTexture(0.8, 14));
    for (const a of arena.anchors) {
      const ringMat = std(ANCHOR_YELLOW, 0.35, { emissive: new THREE.Color(ANCHOR_YELLOW), emissiveIntensity: 0.15 });
      const ring = new THREE.Mesh(TORUS, ringMat);
      ring.castShadow = shadows;
      const head = new THREE.Vector3();
      if (a.kind === 'rail') {
        // which wall are we on?
        const onEnd = Math.abs(a.x) > hx;
        const ox = onEnd ? Math.sign(a.x) : 0;
        const oz = onEnd ? 0 : Math.sign(a.z);
        const px = a.x + ox * 0.15;
        const pz = a.z + oz * 0.15;
        const pillar = new THREE.Mesh(CYL, postM);
        pillar.scale.set(0.2, 2.3, 0.2);
        pillar.position.set(px, 1.15, pz);
        pillar.castShadow = shadows;
        this.group.add(pillar);
        box(capM, 0.78, 0.5, 0.78, px, 2.5, pz, 0);
        box(std('#24344e', 0.5), 0.36, 0.2, 0.36, px - ox * 0.38, 2.44, pz - oz * 0.38, 0);
        head.set(a.x - ox * 0.5, 2.1, a.z - oz * 0.5);
        ring.position.copy(head);
        ring.rotation.y = onEnd ? Math.PI / 2 : 0;
      } else {
        // Hovering anchor drone: a yellow body with the ring underneath; no structure crosses the pitch.
        head.set(a.x, 3.2, a.z);
        box(capM, 0.7, 0.32, 0.7, a.x, 3.62, a.z, 0);
        box(std('#24344e', 0.5), 1.5, 0.08, 0.16, a.x, 3.82, a.z, Math.PI / 4, false);
        box(std('#24344e', 0.5), 1.5, 0.08, 0.16, a.x, 3.82, a.z, -Math.PI / 4, false);
        ring.position.copy(head);
        ring.rotation.x = Math.PI / 2;
        const gr = new THREE.Mesh(PLANE, this.track(new THREE.MeshBasicMaterial({ map: groundRingT, color: ANCHOR_YELLOW, transparent: true, opacity: 0.45, depthWrite: false })));
        gr.rotation.x = -Math.PI / 2;
        gr.scale.set(1.5, 1.5, 1);
        gr.position.set(a.x, 0.016, a.z);
        this.group.add(gr);
      }
      this.group.add(ring);
      const halo = new THREE.Mesh(PLANE, this.track(new THREE.MeshBasicMaterial({ map: haloT, color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, depthTest: false })));
      halo.position.copy(head);
      halo.renderOrder = 5;
      this.group.add(halo);
      this.anchors.push({ head, ring, ringMat, halo, glow: 0 });
    }
    this.buildSurroundings(th, hx, hz, std, box);
    flushBoxes();
  }

  private track<T extends { dispose(): void }>(d: T): T {
    this.disposables.push(d);
    return d;
  }

  private buildSurroundings(
    th: Theme,
    hx: number,
    hz: number,
    std: (color: string, rough?: number, extra?: Partial<THREE.MeshStandardMaterialParameters>) => THREE.MeshStandardMaterial,
    box: (m: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number, ry?: number, cast?: boolean) => void,
  ): void {
    const id = this.arena.id;
    const low = this.quality === 'low';
    const standM = std(th.stand, 0.85);
    const canopyM = std(th.canopy, 0.6, { side: THREE.DoubleSide });
    const seats: [number, number, number][] = [];

    // north stand (three tiers), split into three blocks with canopies
    const tiers = 3;
    const z0 = -hz - 2.2;
    for (let b = -1; b <= 1; b++) {
      const bw = (hx * 2 - 4) / 3 - 0.8;
      const bx = b * ((hx * 2 - 4) / 3);
      for (let t = 0; t < tiers; t++) {
        box(standM, bw, 0.5 + t * 0.55, 1.3, bx, (0.5 + t * 0.55) / 2, z0 - t * 1.3, 0, false);
        const n = Math.floor(bw / 0.75);
        for (let i = 0; i < n; i++) seats.push([bx - bw / 2 + 0.4 + i * 0.75, 0.5 + t * 0.55, z0 - t * 1.3]);
      }
      if (id !== 'championship_dome') {
        const canopy = new THREE.Mesh(PLANE, canopyM);
        canopy.scale.set(bw + 0.4, 2.6, 1);
        canopy.rotation.x = -Math.PI / 2 + 0.3;
        canopy.position.set(bx, 3.9, z0 - 3.0);
        this.group.add(canopy);
        for (const s of [-1, 1]) box(std('#8d949c', 0.5), 0.12, 4.2, 0.12, bx + (s * bw) / 2, 2.1, z0 - 4.1, 0, false);
      }
    }
    // end stands behind each goal
    for (const sx of [-1, 1]) {
      const x0 = sx * (hx + this.arena.goalDepth + 2.4);
      for (let t = 0; t < 2; t++) {
        const len = hz * 2 - 5;
        box(standM, 1.3, 0.5 + t * 0.55, len, x0 + sx * t * 1.3, (0.5 + t * 0.55) / 2, 0, 0, false);
        const n = Math.floor(len / 0.8);
        for (let i = 0; i < n; i++) seats.push([x0 + sx * t * 1.3, 0.5 + t * 0.55, -len / 2 + 0.4 + i * 0.8]);
      }
    }
    if (id === 'championship_dome') {
      // extra ring of upper tiers all round for the big-match feel
      for (let t = 0; t < 4; t++) {
        const zz = z0 - tiers * 1.3 - t * 1.4;
        box(standM, hx * 2 + 16, 2.2 + t * 0.7, 1.4, 0, (2.2 + t * 0.7) / 2, zz, 0, false);
        const n = Math.floor((hx * 2 + 16) / 0.75);
        for (let i = 0; i < n; i++) seats.push([-(hx + 8) + 0.4 + i * 0.75, 2.2 + t * 0.7, zz]);
      }
      for (const sx of [-1, 1])
        for (let t = 0; t < 3; t++) {
          const xx = sx * (hx + this.arena.goalDepth + 5.2 + t * 1.4);
          box(standM, 1.4, 1.7 + t * 0.7, hz * 2 + 8, xx, (1.7 + t * 0.7) / 2, -2, 0, false);
          const n = Math.floor((hz * 2 + 8) / 0.8);
          for (let i = 0; i < n; i++) seats.push([xx, 1.7 + t * 0.7, -2 - (hz + 4) + 0.4 + i * 0.8]);
        }
    }

    // crowd
    const fill = low ? 0.3 : this.quality === 'medium' ? 0.6 : 0.82;
    const picked = seats.filter(() => Math.random() < fill);
    if (picked.length) {
      const bodyG = new THREE.CapsuleGeometry(0.2, 0.22, 3, 8);
      const headG = new THREE.SphereGeometry(0.17, 10, 8);
      this.disposables.push(bodyG, headG);
      const bm = this.track(new THREE.MeshStandardMaterial({ roughness: 0.7 }));
      const hm = this.track(new THREE.MeshStandardMaterial({ color: '#f4f6f2', roughness: 0.5 }));
      this.crowdBodies = new THREE.InstancedMesh(bodyG, bm, picked.length);
      this.crowdHeads = new THREE.InstancedMesh(headG, hm, picked.length);
      this.crowdPos = new Float32Array(picked.length * 4);
      const col = new THREE.Color();
      picked.forEach((s, i) => {
        this.crowdPos[i * 4] = s[0] + (Math.random() - 0.5) * 0.15;
        this.crowdPos[i * 4 + 1] = s[1] + 0.3;
        this.crowdPos[i * 4 + 2] = s[2];
        this.crowdPos[i * 4 + 3] = Math.random() * 6.28;
        col.set(th.crowd[Math.floor(Math.random() * th.crowd.length)]);
        this.crowdBodies!.setColorAt(i, col);
      });
      this.group.add(this.crowdBodies, this.crowdHeads);
      this.writeCrowd(0);
    }

    // venue sign on the camera-side wall
    const sign = new THREE.Mesh(PLANE, this.track(new THREE.MeshBasicMaterial({ map: this.track(labelTexture(this.arena.name, '#f3f5ef', '#17273e')), transparent: true })));
    sign.scale.set(7.5, 1.4, 1);
    sign.rotation.x = -0.95;
    sign.position.set(0, 0.5, hz + 1.9);
    this.group.add(sign);

    if (id === 'harbor_park') this.harborBackdrop(hx, hz, std, box);
    else if (id === 'foundry_court') this.foundryBackdrop(hx, hz, std, box);
    else if (id === 'skyline_stadium') this.skylineBackdrop(hx, hz, std, box);
    else this.domeBackdrop(hx, hz, std, box);
  }

  private harborBackdrop(hx: number, hz: number, std: (c: string, r?: number, e?: Partial<THREE.MeshStandardMaterialParameters>) => THREE.MeshStandardMaterial, box: (m: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number, ry?: number, cast?: boolean) => void): void {
    buildHarborScenery(this.group, -hz - 9.5, (d) => this.track(d), this.quality !== 'low');
    // palms and planters near the camera-side corners
    for (const sx of [-1, 1]) {
      box(std('#e9e6dc', 0.8), 2.2, 0.5, 2.2, sx * (hx + 3.2), 0.25, hz + 2.6, 0);
      this.group.add(makePalm(sx * (hx + 3.2), 0.5, hz + 2.6, 3.4, (d) => this.track(d)));
      this.group.add(makePalm(sx * (hx + 7.5), 0, -hz - 5, 4.2, (d) => this.track(d)));
    }
  }

  private foundryBackdrop(hx: number, hz: number, std: (c: string, r?: number, e?: Partial<THREE.MeshStandardMaterialParameters>) => THREE.MeshStandardMaterial, box: (m: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number, ry?: number, cast?: boolean) => void): void {
    const steel = std('#3b3632', 0.7, { metalness: 0.3 });
    const zb = -hz - 9;
    box(steel, hx * 2 + 30, 14, 1, 0, 7, zb, 0, false);
    const glow = this.track(new THREE.MeshBasicMaterial({ color: '#ff8a2a' }));
    const glow2 = this.track(new THREE.MeshBasicMaterial({ color: '#ffc04a' }));
    for (const x of [-hx * 0.7, 0, hx * 0.7]) {
      box(std('#2a2623', 0.8), 6.4, 6.4, 0.6, x, 3.2, zb + 0.6, 0, false);
      const g = new THREE.Mesh(PLANE, glow);
      g.scale.set(5, 4.6, 1);
      g.position.set(x, 2.9, zb + 0.95);
      this.group.add(g);
      const g2 = new THREE.Mesh(PLANE, glow2);
      g2.scale.set(3.2, 2.6, 1);
      g2.position.set(x, 2.2, zb + 0.97);
      this.group.add(g2);
      const pl = new THREE.PointLight('#ff8a2a', 60, 30, 1.6);
      pl.position.set(x, 3, zb + 3);
      this.group.add(pl);
    }
    // girders and hazard-striped side walls
    for (const x of [-hx - 6, -hx * 0.35, hx * 0.35, hx + 6]) box(steel, 0.8, 14, 0.8, x, 7, zb + 0.9, 0, false);
    const hazard = std('#e9a23a', 0.6);
    for (const sx of [-1, 1]) {
      box(steel, 1, 9, hz * 2 + 22, sx * (hx + 9.5), 4.5, -2, 0, false);
      for (let i = 0; i < 6; i++) box(hazard, 0.2, 0.5, 1.4, sx * (hx + 8.95), 1.2, -hz - 4 + i * 5, 0, false);
    }
    // hanging lamps
    const lampM = this.track(new THREE.MeshBasicMaterial({ color: '#ffe3b0' }));
    for (const x of [-hx * 0.55, 0, hx * 0.55]) {
      box(std('#2a2623'), 0.08, 2.5, 0.08, x, 9.2, -hz - 4, 0, false);
      const l = new THREE.Mesh(BOX, lampM);
      l.scale.set(1.6, 0.25, 0.6);
      l.position.set(x, 7.9, -hz - 4);
      this.group.add(l);
    }
  }

  private skylineBackdrop(hx: number, hz: number, std: (c: string, r?: number, e?: Partial<THREE.MeshStandardMaterialParameters>) => THREE.MeshStandardMaterial, box: (m: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number, ry?: number, cast?: boolean) => void): void {
    const lit = '#ffd27a';
    const mats = ['#3a3566', '#4a3f78', '#2f2c58', '#56437a'].map((cc) => {
      const t = this.track(windowsTexture(cc, lit));
      return std('#ffffff', 0.8, { map: t, emissiveMap: t, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.55 });
    });
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 26; i++) {
      const x = -60 + i * 4.8 + rnd() * 2;
      const h = 8 + rnd() * 22;
      const w = 3 + rnd() * 2.5;
      box(mats[i % mats.length], w, h, w, x, h / 2 - 9, -hz - 22 - rnd() * 14, 0, false);
    }
    for (const sx of [-1, 1])
      for (let i = 0; i < 6; i++) {
        const h = 10 + rnd() * 16;
        box(mats[(i + 1) % mats.length], 4, h, 4, sx * (hx + 20 + rnd() * 10), h / 2 - 9, -hz - 6 + i * 7, 0, false);
      }
    // rooftop edge parapet
    const parapet = std('#6f7390', 0.8);
    box(parapet, hx * 2 + 26, 0.9, 0.6, 0, 0.45, -hz - 11.5, 0, false);
    for (const sx of [-1, 1]) box(parapet, 0.6, 0.9, hz * 2 + 26, sx * (hx + 12.5), 0.45, 0, 0, false);
    // sunset disc
    const sun = new THREE.Mesh(new THREE.CircleGeometry(7, 32), this.track(new THREE.MeshBasicMaterial({ color: '#ffe2a0', fog: false })));
    this.disposables.push(sun.geometry);
    sun.position.set(-14, 2, -95);
    this.group.add(sun);
  }

  private domeBackdrop(hx: number, hz: number, std: (c: string, r?: number, e?: Partial<THREE.MeshStandardMaterialParameters>) => THREE.MeshStandardMaterial, box: (m: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number, ry?: number, cast?: boolean) => void): void {
    const shell = std('#0f1a3a', 0.9);
    box(shell, hx * 2 + 40, 22, 1, 0, 11, -hz - 13.5, 0, false);
    for (const sx of [-1, 1]) box(shell, 1, 22, hz * 2 + 40, sx * (hx + 12.5), 11, 0, 0, false);
    // light rigs
    const lampM = this.track(new THREE.MeshBasicMaterial({ color: '#dff0ff' }));
    const beamM = this.track(new THREE.MeshBasicMaterial({ color: '#9ec8ff', transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    const cone = new THREE.ConeGeometry(4.5, 15, 16, 1, true);
    this.disposables.push(cone);
    for (const x of [-hx * 0.75, -hx * 0.25, hx * 0.25, hx * 0.75]) {
      const l = new THREE.Mesh(BOX, lampM);
      l.scale.set(2.2, 0.35, 0.7);
      l.position.set(x, 12.5, -hz - 9);
      this.group.add(l);
      if (this.quality !== 'low') {
        const b = new THREE.Mesh(cone, beamM);
        b.position.set(x * 0.8, 6, -hz - 2);
        b.rotation.x = 0.5;
        this.group.add(b);
      }
    }
    // championship banner
    const banner = new THREE.Mesh(PLANE, this.track(new THREE.MeshBasicMaterial({ map: this.track(labelTexture('Championship', '#17273e', '#f6c542')), transparent: true })));
    banner.scale.set(11, 2, 1);
    banner.position.set(0, 9.2, -hz - 12.9);
    this.group.add(banner);
    const blue = std('#2f6fe4', 0.5, { emissive: new THREE.Color('#2f6fe4'), emissiveIntensity: 0.6 });
    box(blue, hx * 2 + 24, 0.25, 0.25, 0, 6.6, -hz - 12.8, 0, false);
  }

  private writeCrowd(time: number): void {
    if (!this.crowdBodies || !this.crowdHeads) return;
    const d = this.dummy;
    const n = this.crowdBodies.count;
    const ex = this.excitement;
    for (let i = 0; i < n; i++) {
      const ph = this.crowdPos[i * 4 + 3];
      const hop = ex > 0.01 ? Math.abs(Math.sin(time * 9 + ph)) * 0.32 * ex : 0;
      d.position.set(this.crowdPos[i * 4], this.crowdPos[i * 4 + 1] + hop, this.crowdPos[i * 4 + 2]);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(1);
      d.updateMatrix();
      this.crowdBodies.setMatrixAt(i, d.matrix);
      d.position.y += 0.36;
      d.updateMatrix();
      this.crowdHeads.setMatrixAt(i, d.matrix);
    }
    this.crowdBodies.instanceMatrix.needsUpdate = true;
    this.crowdHeads.instanceMatrix.needsUpdate = true;
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
    for (let s = 0; s < 2; s++) {
      if (this.goalFlash[s] > 0 || this.goalMats[s].emissiveIntensity > 0.36) {
        this.goalFlash[s] = Math.max(0, this.goalFlash[s] - dt * 0.9);
        const f = this.goalFlash[s];
        this.goalMats[s].emissiveIntensity = 0.35 + f * (reduced ? 0.6 : 1.4 + Math.sin(time * 30) * 0.5);
        const net = this.netMeshes[s];
        const bulge = reduced ? 0 : Math.sin(f * Math.PI) * 0.22;
        net.scale.set(1 + bulge, 1 + bulge * 0.3, 1);
      }
    }
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
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.crowdBodies?.dispose();
    this.crowdHeads?.dispose();
    for (const i of this.instanced) i.dispose();
  }
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const PLANE = new THREE.PlaneGeometry(1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 14);
const TORUS = new THREE.TorusGeometry(0.32, 0.085, 10, 20);

export function makePalm(x: number, y: number, z: number, h: number, track: <T extends { dispose(): void }>(d: T) => T): THREE.Group {
  const g = new THREE.Group();
  const trunkM = track(new THREE.MeshStandardMaterial({ color: '#a8845a', roughness: 0.9 }));
  const leafM = track(new THREE.MeshStandardMaterial({ color: '#4fb065', roughness: 0.8, side: THREE.DoubleSide }));
  const trunk = new THREE.Mesh(CYL, trunkM);
  trunk.scale.set(0.16, h, 0.16);
  trunk.position.y = h / 2;
  trunk.rotation.z = 0.08;
  g.add(trunk);
  const leafG = track(new THREE.ConeGeometry(0.42, 2.3, 4));
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.Mesh(leafG, leafM);
    const a = (i / 7) * Math.PI * 2;
    leaf.scale.set(1, 1, 0.25);
    leaf.position.set(Math.cos(a) * 0.85, h + 0.15, Math.sin(a) * 0.85);
    leaf.rotation.set(0, -a, -Math.PI / 2 - 0.45);
    g.add(leaf);
  }
  g.position.set(x, y, z);
  return g;
}

/** Sea, quay, islands, lighthouse, boats and domed buildings beyond `zEdge` (shared with the menu stage). */
export function buildHarborScenery(group: THREE.Group, zEdge: number, track: <T extends { dispose(): void }>(d: T) => T, detailed: boolean): void {
  const sea = new THREE.Mesh(track(new THREE.PlaneGeometry(520, 420)), track(new THREE.MeshStandardMaterial({ color: '#2f9bd8', roughness: 0.35, metalness: 0.1 })));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.9, zEdge - 60);
  group.add(sea);
  const quay = new THREE.Mesh(BOX, track(new THREE.MeshStandardMaterial({ color: '#efe9da', roughness: 0.8 })));
  quay.scale.set(240, 1, 0.8);
  quay.position.set(0, -0.45, zEdge);
  group.add(quay);

  const green = track(new THREE.MeshStandardMaterial({ color: '#63b574', roughness: 0.9 }));
  const rock = track(new THREE.MeshStandardMaterial({ color: '#d8c7a2', roughness: 0.9 }));
  const sph = track(new THREE.SphereGeometry(1, 18, 12));
  const island = (x: number, z: number, sx: number, sy: number, sz: number) => {
    const base = new THREE.Mesh(sph, rock);
    base.scale.set(sx * 1.08, sy * 0.55, sz * 1.08);
    base.position.set(x, -0.9, z);
    group.add(base);
    const top = new THREE.Mesh(sph, green);
    top.scale.set(sx, sy, sz);
    top.position.set(x, -0.6, z);
    group.add(top);
  };
  island(-34, zEdge - 46, 15, 4.5, 8);
  island(30, zEdge - 60, 20, 6, 9);
  island(64, zEdge - 40, 10, 3.2, 6);

  // lighthouse
  const lh = new THREE.Group();
  const whiteM = track(new THREE.MeshStandardMaterial({ color: '#fbfaf5', roughness: 0.6 }));
  const redM = track(new THREE.MeshStandardMaterial({ color: '#e2534b', roughness: 0.6 }));
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Mesh(CYL, i % 2 ? redM : whiteM);
    const r = 1.25 - i * 0.14;
    seg.scale.set(r, 2, r);
    seg.position.y = 1 + i * 2;
    lh.add(seg);
  }
  const lamp = new THREE.Mesh(CYL, track(new THREE.MeshBasicMaterial({ color: '#fff3b8' })));
  lamp.scale.set(0.6, 0.9, 0.6);
  lamp.position.y = 8.45;
  lh.add(lamp);
  const roof = new THREE.Mesh(track(new THREE.ConeGeometry(0.9, 1, 12)), redM);
  roof.position.y = 9.4;
  lh.add(roof);
  lh.position.set(-30, 3.2, zEdge - 44);
  group.add(lh);

  // domed harbour buildings
  const domeM = track(new THREE.MeshStandardMaterial({ color: '#f4f2ea', roughness: 0.5 }));
  const glassM = track(new THREE.MeshStandardMaterial({ color: '#8fd3ee', roughness: 0.2, metalness: 0.2 }));
  for (const [x, z, s] of [[34, zEdge - 58, 4.6], [44, zEdge - 55, 3.2], [-52, zEdge - 30, 3.6]] as [number, number, number][]) {
    const d = new THREE.Mesh(sph, domeM);
    d.scale.set(s, s * 0.75, s);
    d.position.set(x, 4.2, z);
    group.add(d);
    const band = new THREE.Mesh(CYL, glassM);
    band.scale.set(s * 1.01, s * 0.3, s * 1.01);
    band.position.set(x, 4.2, z);
    group.add(band);
  }
  if (detailed) {
    // sailboats
    const hullM = whiteM;
    const sailG = track(new THREE.ConeGeometry(1, 2.6, 3));
    for (const [x, z] of [[-12, zEdge - 20], [8, zEdge - 30], [22, zEdge - 16], [-48, zEdge - 18], [-31, zEdge + 16], [32, zEdge + 24], [-29, zEdge + 34], [27, zEdge + 6]] as [number, number][]) {
      const hull = new THREE.Mesh(BOX, hullM);
      hull.scale.set(2.4, 0.5, 0.8);
      hull.position.set(x, -0.6, z);
      group.add(hull);
      const sail = new THREE.Mesh(sailG, whiteM);
      sail.scale.set(1, 1, 0.12);
      sail.position.set(x + 0.1, 1.05, z);
      group.add(sail);
    }
    // wind turbines on the far island
    for (const x of [22, 27]) {
      const mast = new THREE.Mesh(CYL, whiteM);
      mast.scale.set(0.12, 7, 0.12);
      mast.position.set(x, 7.5, zEdge - 62);
      group.add(mast);
      for (let i = 0; i < 3; i++) {
        const blade = new THREE.Mesh(BOX, whiteM);
        blade.scale.set(0.18, 2.6, 0.06);
        blade.position.set(x + Math.sin((i * Math.PI * 2) / 3) * 1.3, 11 + Math.cos((i * Math.PI * 2) / 3) * 1.3, zEdge - 61.8);
        blade.rotation.z = -(i * Math.PI * 2) / 3;
        group.add(blade);
      }
    }
  }
}
