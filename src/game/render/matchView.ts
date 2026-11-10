import * as THREE from 'three';
import type { ArenaDef } from '../../content/arenas';
import type { RobotLook } from '../../content/cosmetics';
import { TUNING } from '../../content/tuning';
import type { SimEvent, World } from '../sim/types';
import { ArenaView, type Quality } from './arenaView';
import type { Gfx } from './gfx';
import { RobotView, type RobotMood, type RobotPose } from './robotView';
import { ballMaps, blobTexture, ringTexture, shade, type Expression } from './textures';

export interface Marker {
  kind: 'ring' | 'disc' | 'line' | 'gate';
  x: number;
  z: number;
  x2?: number;
  z2?: number;
  r?: number;
  width?: number;
  color: string;
  opacity?: number;
  pulse?: boolean;
}

export interface ViewFrame {
  alpha: number;
  dt: number;
  /** Highlighted anchor index or -1. */
  preview: number;
  /** Draw the faint link line to the previewed anchor. */
  link: boolean;
  /** Manual swing is lined up with the player's target: the rope glows green ("let go now"). */
  swingCue?: boolean;
  aimX: number;
  aimZ: number;
  showAim: boolean;
  moods: RobotMood[];
  expressions?: (Expression | null)[];
  human: number;
  reduced: boolean;
  shake: boolean;
}

export interface MatchViewOptions {
  arena: ArenaDef;
  looks: RobotLook[];
  human: number;
  /** Colours of the -x goal (team 0) and +x goal (team 1). */
  teamColors: [string, string];
  ballOutline: boolean;
}

const PLANE = new THREE.PlaneGeometry(1, 1);
const UP = new THREE.Vector3(0, 1, 0);
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();
const q1 = new THREE.Quaternion();
const m4 = new THREE.Matrix4();
const col = new THREE.Color();

const TRAIL_N = 20;
/** Robots are drawn larger than their collision circle for readability at the fixed camera distance. */
const ROBOT_SCALE = 1.75;
const BALL_SCALE = 1.2;

class Trail {
  mesh: THREE.Mesh;
  private pos: Float32Array;
  private colr: Float32Array;
  private pts: number[] = [];
  private c1 = new THREE.Color();
  private c2 = new THREE.Color();
  private width = 0.3;
  private style = 'trail_standard';

  constructor() {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(TRAIL_N * 2 * 3);
    this.colr = new Float32Array(TRAIL_N * 2 * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.colr, 3));
    const idx: number[] = [];
    for (let i = 0; i < TRAIL_N - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  setStyle(style: string, primary: string, secondary: string): void {
    this.style = style;
    this.c1.set(shade(primary, 0.25));
    this.c2.set(style === 'trail_aurora' ? secondary : primary);
    if (style === 'trail_comet') this.c1.set('#ffffff');
    this.width = style === 'trail_spark' ? 0.18 : style === 'trail_comet' ? 0.42 : 0.3;
  }

  update(x: number, z: number, y: number, active: boolean): void {
    const pts = this.pts;
    if (active) {
      const n = pts.length;
      if (n < 3 || Math.hypot(pts[n - 3] - x, pts[n - 1] - z) > 0.22) pts.push(x, y, z);
      else {
        pts[n - 3] = x;
        pts[n - 2] = y;
        pts[n - 1] = z;
      }
      while (pts.length > TRAIL_N * 3) pts.splice(0, 3);
    } else if (pts.length) pts.splice(0, Math.min(pts.length, 6));
    const count = pts.length / 3;
    this.mesh.visible = count >= 2;
    if (!this.mesh.visible) return;
    const p = this.pos;
    const c = this.colr;
    for (let i = 0; i < TRAIL_N; i++) {
      const k = Math.min(i, count - 1);
      const px = pts[k * 3];
      const py = pts[k * 3 + 1];
      const pz = pts[k * 3 + 2];
      const k2 = Math.min(k + 1, count - 1);
      const k0 = Math.max(k - 1, 0);
      let dx = pts[k2 * 3] - pts[k0 * 3];
      let dz = pts[k2 * 3 + 2] - pts[k0 * 3 + 2];
      const dl = Math.hypot(dx, dz) || 1;
      dx /= dl;
      dz /= dl;
      const t = count > 1 ? k / (count - 1) : 1; // 0 = oldest, 1 = head
      const w = this.width * (this.style === 'trail_comet' ? t * t : 0.35 + 0.65 * t) * (i < count ? 1 : 0);
      p[i * 6] = px - dz * w;
      p[i * 6 + 1] = 0.06 + py * 0.5;
      p[i * 6 + 2] = pz + dx * w;
      p[i * 6 + 3] = px + dz * w;
      p[i * 6 + 4] = 0.06 + py * 0.5;
      p[i * 6 + 5] = pz - dx * w;
      const f = t * t;
      const r = (this.c2.r + (this.c1.r - this.c2.r) * t) * f;
      const g = (this.c2.g + (this.c1.g - this.c2.g) * t) * f;
      const b = (this.c2.b + (this.c1.b - this.c2.b) * t) * f;
      c[i * 6] = c[i * 6 + 3] = r;
      c[i * 6 + 1] = c[i * 6 + 4] = g;
      c[i * 6 + 2] = c[i * 6 + 5] = b;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.color.needsUpdate = true;
  }

  clear(): void {
    this.pts.length = 0;
    this.mesh.visible = false;
  }
}

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number; size: number; grav: number; spin: number; rot: number;
  r: number; g: number; b: number;
}

export class MatchView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(34, 1, 0.5, 400);
  readonly arenaView: ArenaView;
  readonly robots: RobotView[] = [];
  private arena: ArenaDef;
  private quality: Quality;
  private opts: MatchViewOptions;
  private prev: Float32Array;
  private ball: THREE.Mesh;
  private ballTrail = new Trail();
  private ballShadow: THREE.Mesh;
  private ballRing: THREE.Mesh;
  private shadows: THREE.Mesh[] = [];
  private rings: THREE.Mesh[] = [];
  private ropes: THREE.Mesh[] = [];
  private ropeGlow: THREE.Mesh[] = [];
  private ropeGrow: number[] = [];
  private trails: Trail[] = [];
  private youMarker: THREE.Mesh;
  private aimRing: THREE.Mesh;
  private aimLine: THREE.Mesh;
  private linkLine: THREE.Mesh;
  private ropeColors: string[] = [];
  private holdArc: THREE.Mesh;
  private flashes: { mesh: THREE.Mesh; life: number; max: number; size: number }[] = [];
  private particles: Particle[] = [];
  private pMesh: THREE.InstancedMesh;
  private pCap: number;
  private markerGroup = new THREE.Group();
  private markerPulse: THREE.Mesh[] = [];
  private time = 0;
  private timers: { t: number; fn: () => void }[] = [];
  private focus = 0;
  private focusTarget = 0;
  private focusX = 0;
  private goalLight = new THREE.PointLight('#ffffff', 0, 26, 1.4);
  private goalLightLevel = 0;
  private shake = 0;
  private camBase = new THREE.Vector3();
  private camTarget = new THREE.Vector3(0, 0, 0.6);
  private ray = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private poses: RobotPose[] = [];
  private disposables: { dispose(): void }[] = [];
  private lookColors: string[] = [];

  constructor(private gfx: Gfx, opts: MatchViewOptions) {
    this.opts = opts;
    this.arena = opts.arena;
    this.quality = gfx.quality;
    const shadows = this.quality === 'high';
    this.arenaView = new ArenaView(opts.arena, this.quality, opts.teamColors);
    this.scene.add(this.arenaView.group);
    this.scene.background = this.arenaView.background;
    this.scene.fog = this.arenaView.fog;

    const blob = blobTexture();
    const ringT = this.track(ringTexture(0.74));
    const diamondT = this.track(ringTexture(0.6, 22));
    this.prev = new Float32Array((opts.looks.length + 1) * 2);

    opts.looks.forEach((look, i) => {
      const rv = new RobotView(look, shadows);
      rv.scale = ROBOT_SCALE;
      this.robots.push(rv);
      this.scene.add(rv.root);
      this.lookColors.push(look.primary);
      const sh = new THREE.Mesh(PLANE, this.track(new THREE.MeshBasicMaterial({ map: blob, color: '#06202a', transparent: true, opacity: 0.42, depthWrite: false })));
      sh.rotation.x = -Math.PI / 2;
      sh.renderOrder = 1;
      this.scene.add(sh);
      this.shadows.push(sh);
      // Team identity: solid ring for the player's team, dashed ring for the opposition.
      const isHuman = i === opts.human;
      const sameTeam = opts.human < 0 ? i < 2 : i < 2 === opts.human < 2;
      const ring = new THREE.Mesh(
        PLANE,
        this.track(new THREE.MeshBasicMaterial({ map: sameTeam ? ringT : diamondT, color: isHuman ? '#ffffff' : look.primary, transparent: true, opacity: isHuman ? 0.95 : 0.8, depthWrite: false })),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.renderOrder = 1;
      this.scene.add(ring);
      this.rings.push(ring);

      const ropeColor = shade(look.primary, 0.35);
      this.ropeColors.push(ropeColor);
      const rope = new THREE.Mesh(ROPE_GEO, this.track(new THREE.MeshBasicMaterial({ color: ropeColor })));
      const glow = new THREE.Mesh(ROPE_GEO, this.track(new THREE.MeshBasicMaterial({ color: look.primary, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false })));
      rope.visible = glow.visible = false;
      this.scene.add(rope, glow);
      this.ropes.push(rope);
      this.ropeGlow.push(glow);
      this.ropeGrow.push(0);

      const tr = new Trail();
      tr.setStyle(look.trail, look.primary, look.secondary);
      this.trails.push(tr);
      this.scene.add(tr.mesh);
      this.disposables.push(tr.mesh.geometry, tr.mesh.material as THREE.Material);
      this.poses.push({ x: 0, z: 0, facing: 0, vx: 0, vz: 0, tethered: false, ax: 0, az: 0, kickAge: 9, kickDir: 0, bumpAge: 9, mood: 'play', reduced: false });
    });

    // ball
    // Drawn a little larger than the collision circle (like the robots) so it reads at the match camera.
    const ballGeo = this.track(new THREE.SphereGeometry(TUNING.ball.radius * BALL_SCALE, 48, 32));
    const maps = ballMaps();
    const ballMat =
      this.quality === 'low'
        ? new THREE.MeshStandardMaterial({ map: maps.map, roughness: 0.4 })
        : new THREE.MeshPhysicalMaterial({ map: maps.map, bumpMap: maps.bump, bumpScale: 1.4, roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.18 });
    this.ball = new THREE.Mesh(ballGeo, this.track(ballMat));
    this.ball.castShadow = shadows;
    this.scene.add(this.ball);
    this.ballTrail.setStyle('trail_comet', '#ffffff', '#cfefff');
    this.scene.add(this.ballTrail.mesh);
    this.disposables.push(this.ballTrail.mesh.geometry, this.ballTrail.mesh.material as THREE.Material);
    this.ballShadow = new THREE.Mesh(PLANE, this.track(new THREE.MeshBasicMaterial({ map: blob, color: '#04161d', transparent: true, opacity: 0.55, depthWrite: false })));
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.ballShadow.scale.set(1.6, 1.6, 1);
    this.ballShadow.renderOrder = 1;
    this.scene.add(this.ballShadow);
    this.ballRing = new THREE.Mesh(PLANE, this.track(new THREE.MeshBasicMaterial({ map: ringT, color: '#ffffff', transparent: true, opacity: 0, depthWrite: false })));
    this.ballRing.rotation.x = -Math.PI / 2;
    this.ballRing.renderOrder = 2;
    this.scene.add(this.ballRing);

    // player marker
    const cone = this.track(new THREE.ConeGeometry(0.22, 0.38, 4));
    this.youMarker = new THREE.Mesh(cone, this.track(new THREE.MeshBasicMaterial({ color: '#ffe36a' })));
    this.youMarker.rotation.x = Math.PI;
    this.youMarker.visible = opts.human >= 0;
    this.scene.add(this.youMarker);

    this.aimRing = new THREE.Mesh(PLANE, this.track(new THREE.MeshBasicMaterial({ map: this.track(ringTexture(0.55, 30)), color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false })));
    this.aimRing.rotation.x = -Math.PI / 2;
    this.aimRing.scale.set(0.9, 0.9, 1);
    this.aimRing.renderOrder = 3;
    this.scene.add(this.aimRing);
    this.aimLine = new THREE.Mesh(PLANE, this.track(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false })));
    this.aimLine.renderOrder = 2;
    this.scene.add(this.aimLine);
    this.linkLine = new THREE.Mesh(PLANE, this.track(new THREE.MeshBasicMaterial({ color: '#ffe9a3', transparent: true, opacity: 0.38, depthWrite: false })));
    this.linkLine.renderOrder = 2;
    this.scene.add(this.linkLine);
    const arcGeo = this.track(new THREE.RingGeometry(1.18, 1.34, 40, 1));
    this.holdArc = new THREE.Mesh(arcGeo, this.track(new THREE.MeshBasicMaterial({ color: '#ffe36a', transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide })));
    this.holdArc.rotation.x = -Math.PI / 2;
    this.holdArc.renderOrder = 3;
    this.holdArc.visible = false;
    this.scene.add(this.holdArc);

    // flash rings pool
    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(PLANE, this.track(new THREE.MeshBasicMaterial({ map: ringT, color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })));
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.renderOrder = 3;
      this.scene.add(mesh);
      this.flashes.push({ mesh, life: 0, max: 1, size: 1 });
    }

    this.pCap = this.quality === 'low' ? 90 : 260;
    this.pMesh = new THREE.InstancedMesh(PLANE, this.track(new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide })), this.pCap);
    this.pMesh.count = 0;
    this.pMesh.frustumCulled = false;
    this.pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pMesh.setColorAt(0, col.set('#ffffff'));
    this.scene.add(this.pMesh);
    this.scene.add(this.markerGroup);
    if (this.quality !== 'low') this.scene.add(this.goalLight);

    this.resize();
  }

  private track<T extends { dispose(): void }>(d: T): T {
    this.disposables.push(d);
    return d;
  }

  /** Fit the whole court (goals, anchors and a HUD margin) for the current aspect ratio. */
  resize(): void {
    const aspect = this.gfx.width / this.gfx.height;
    const cam = this.camera;
    cam.aspect = aspect;
    cam.updateProjectionMatrix();
    const hx = this.arena.length / 2 + this.arena.goalDepth + 1.3;
    const hz = this.arena.width / 2;
    const pitch = aspect < 1 ? 1.15 : 0.86;
    const dir = v1.set(0, Math.sin(pitch), Math.cos(pitch));
    const pts: [number, number, number][] = [
      [-hx, 0, hz + 1.6], [hx, 0, hz + 1.6], [-hx, 1.9, -hz - 0.8], [hx, 1.9, -hz - 0.8], [0, 2.6, -hz - 0.8], [0, 0, hz + 1.6],
    ];
    const topLimit = aspect < 1 ? 0.7 : 0.8;
    // Touch devices keep a little more room below the pitch for the on-screen controls.
    const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    const bottomLimit = coarse && aspect >= 1 ? -0.84 : -0.96;
    let lo = 12;
    let hi = 220;
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      cam.position.copy(this.camTarget).addScaledVector(dir, mid);
      cam.lookAt(this.camTarget);
      cam.updateMatrixWorld();
      let ok = true;
      for (const p of pts) {
        v2.set(p[0], p[1], p[2]).project(cam);
        if (Math.abs(v2.x) > 0.975 || v2.y > topLimit || v2.y < bottomLimit) {
          ok = false;
          break;
        }
      }
      if (ok) hi = mid;
      else lo = mid;
    }
    cam.position.copy(this.camTarget).addScaledVector(dir, hi);
    cam.lookAt(this.camTarget);
    cam.updateMatrixWorld();
    this.camBase.copy(cam.position);
  }

  /** Projects a screen point onto the gameplay plane. */
  screenToField(clientX: number, clientY: number, out: { x: number; z: number }): boolean {
    const rect = this.gfx.canvas.getBoundingClientRect();
    v2.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1, 0.5);
    this.ray.setFromCamera(new THREE.Vector2(v2.x, v2.y), this.camera);
    const hit = this.ray.ray.intersectPlane(this.ground, v3);
    if (!hit) return false;
    out.x = hit.x;
    out.z = hit.z;
    return true;
  }

  /** Projects a field point to CSS pixels (for DOM hints). */
  fieldToScreen(x: number, y: number, z: number, out: { x: number; y: number }): void {
    v2.set(x, y, z).project(this.camera);
    out.x = (v2.x * 0.5 + 0.5) * this.gfx.width;
    out.y = (-v2.y * 0.5 + 0.5) * this.gfx.height;
  }

  /** Store current positions as the interpolation base. Call before each simulation step. */
  snapshot(w: World): void {
    const p = this.prev;
    for (let i = 0; i < w.robots.length; i++) {
      p[i * 2] = w.robots[i].x;
      p[i * 2 + 1] = w.robots[i].z;
    }
    const n = w.robots.length;
    p[n * 2] = w.ball.x;
    p[n * 2 + 1] = w.ball.z;
  }

  /** After a teleporting reset, avoid interpolating across the jump. */
  snap(w: World): void {
    this.snapshot(w);
    for (const t of this.trails) t.clear();
    this.ballTrail.clear();
    this.focusTarget = 0; // kickoff: camera back to the full-pitch view
  }

  setMarkers(markers: Marker[]): void {
    for (const c of [...this.markerGroup.children]) {
      const m = c as THREE.Mesh;
      (m.material as THREE.Material).dispose();
      if (m.geometry !== PLANE && m.geometry !== POST_GEO) m.geometry.dispose();
    }
    this.markerGroup.clear();
    this.markerPulse.length = 0;
    const ringT = ringTexture(0.8);
    const discT = blobTexture();
    for (const mk of markers) {
      const op = mk.opacity ?? 0.85;
      if (mk.kind === 'ring' || mk.kind === 'disc') {
        const mesh = new THREE.Mesh(PLANE, new THREE.MeshBasicMaterial({ map: mk.kind === 'ring' ? ringT : discT, color: mk.color, transparent: true, opacity: op, depthWrite: false }));
        mesh.rotation.x = -Math.PI / 2;
        const s = (mk.r ?? 1) * 2;
        mesh.scale.set(s, s, 1);
        mesh.position.set(mk.x, 0.02, mk.z);
        mesh.renderOrder = 1;
        mesh.userData.base = s;
        this.markerGroup.add(mesh);
        if (mk.pulse) this.markerPulse.push(mesh);
      } else {
        const x2 = mk.x2 ?? mk.x;
        const z2 = mk.z2 ?? mk.z;
        const len = Math.hypot(x2 - mk.x, z2 - mk.z);
        const mesh = new THREE.Mesh(PLANE, new THREE.MeshBasicMaterial({ color: mk.color, transparent: true, opacity: op * (mk.kind === 'gate' ? 0.45 : 1), depthWrite: false }));
        mesh.rotation.set(-Math.PI / 2, 0, -Math.atan2(z2 - mk.z, x2 - mk.x));
        mesh.scale.set(len, mk.width ?? 0.25, 1);
        mesh.position.set((mk.x + x2) / 2, 0.02, (mk.z + z2) / 2);
        mesh.renderOrder = 1;
        this.markerGroup.add(mesh);
        if (mk.kind === 'gate') {
          for (const [px, pz] of [[mk.x, mk.z], [x2, z2]]) {
            const post = new THREE.Mesh(POST_GEO, new THREE.MeshBasicMaterial({ color: mk.color }));
            post.position.set(px, 0.55, pz);
            this.markerGroup.add(post);
          }
        }
      }
    }
  }

  // ---------------- effects ----------------

  private spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: string, grav = 6): void {
    if (this.particles.length >= this.pCap) return;
    col.set(color);
    this.particles.push({ x, y, z, vx, vy, vz, life, max: life, size, grav, spin: (Math.random() - 0.5) * 12, rot: Math.random() * 6, r: col.r, g: col.g, b: col.b });
  }

  burst(x: number, y: number, z: number, n: number, speed: number, color: string, dirX = 0, dirZ = 0, size = 0.12): void {
    const count = this.quality === 'low' ? Math.ceil(n / 2) : n;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.spawn(x, y, z, Math.cos(a) * s * 0.7 + dirX * speed, 1 + Math.random() * 2.2, Math.sin(a) * s * 0.7 + dirZ * speed, 0.3 + Math.random() * 0.35, size * (0.7 + Math.random() * 0.6), color);
    }
  }

  flash(x: number, z: number, size: number, color: string, life = 0.3): void {
    const f = this.flashes.find((q) => q.life <= 0) ?? this.flashes[0];
    f.life = f.max = life;
    f.size = size;
    f.mesh.position.set(x, 0.03, z);
    (f.mesh.material as THREE.MeshBasicMaterial).color.set(color);
    f.mesh.visible = true;
  }

  confetti(x: number, z: number, colors: string[], n: number): void {
    const count = this.quality === 'low' ? Math.ceil(n / 3) : n;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 2 + Math.random() * 6;
      this.spawn(x + (Math.random() - 0.5) * 2, 0.6 + Math.random(), z + (Math.random() - 0.5) * 3, Math.cos(a) * s, 5 + Math.random() * 6, Math.sin(a) * s, 1.1 + Math.random() * 0.9, 0.16 + Math.random() * 0.1, colors[i % colors.length], 9);
    }
  }

  /** Translate simulation events into visual feedback. */
  onSimEvents(w: World, events: SimEvent[], reduced: boolean): void {
    for (const e of events) {
      switch (e.type) {
        case 'kick': {
          const r = w.robots[e.robot];
          const p = Math.max(0, Math.min(1, e.power));
          this.flash(w.ball.x, w.ball.z, 1.3 + p * 1.6, e.swing ? '#ffe36a' : '#ffffff', 0.28);
          this.burst(w.ball.x, 0.35, w.ball.z, 5 + Math.round(p * 8), 2 + p * 3, e.swing ? '#ffe36a' : '#ffffff', r.lastKickDirX * 0.8, r.lastKickDirZ * 0.8);
          if (e.swing && !reduced) this.shake = Math.max(this.shake, 0.12);
          break;
        }
        case 'touch':
          if (e.speed > 3.5) this.burst(w.ball.x, 0.3, w.ball.z, 3, 1.6, '#ffffff', 0, 0, 0.08);
          break;
        case 'wall':
          if (e.speed > 3) {
            this.burst(e.x + e.nx * 0.2, 0.3, e.z + e.nz * 0.2, 4, 1 + e.speed * 0.15, '#f3f5ef', e.nx * 0.5, e.nz * 0.5, 0.09);
            this.flash(e.x + e.nx * 0.3, e.z + e.nz * 0.3, 0.9 + e.speed * 0.05, '#ffffff', 0.2);
          }
          break;
        case 'post':
          this.burst(e.x, 0.6, e.z, 8, 2.5, '#ffe36a');
          if (!reduced) this.shake = Math.max(this.shake, 0.08);
          break;
        case 'bump': {
          const a = w.robots[e.a];
          const b = w.robots[e.b];
          this.burst((a.x + b.x) / 2, 0.7, (a.z + b.z) / 2, 5, 2, '#fff3c2', 0, 0, 0.1);
          break;
        }
        case 'attach': {
          this.ropeGrow[e.robot] = 0;
          const h = this.arenaView.anchors[e.anchor].head;
          this.burst(h.x, h.y, h.z, 6, 1.6, '#ffe36a', 0, 0, 0.09);
          break;
        }
        case 'release': {
          const r = w.robots[e.robot];
          if (e.speed > 6) {
            const s = Math.hypot(r.vx, r.vz) || 1;
            this.burst(r.x, 0.5, r.z, 7, 1.4, shade(this.lookColors[e.robot], 0.4), (-r.vx / s) * 1.2, (-r.vz / s) * 1.2, 0.1);
          }
          break;
        }
        case 'tetherFail': {
          const r = w.robots[e.robot];
          this.flash(r.x, r.z, 1.5, '#e96a64', 0.22);
          break;
        }
        case 'net':
          break;
        case 'goal': {
          const sx = e.side === 1 ? 1 : -1;
          const scoring = e.side === 1 ? 0 : 1;
          const color = this.opts.teamColors[scoring];
          this.arenaView.flashGoal(e.side);
          this.arenaView.excite(1);
          this.goalCelebration(w, sx, color, reduced);
          break;
        }
      }
    }
  }

  /** Run `fn` after `delay` seconds of rendered time (presentation only). */
  private schedule(delay: number, fn: () => void): void {
    this.timers.push({ t: delay, fn });
  }

  /** A rocket from the ground that bursts into a sphere of sparks. */
  private firework(x: number, z: number, height: number, colors: string[]): void {
    this.spawn(x, 0.4, z, 0, height * 2.4, 0, 0.42, 0.12, '#fff3c2', 0);
    this.schedule(0.42, () => {
      const n = this.quality === 'low' ? 14 : 34;
      for (let i = 0; i < n; i++) {
        const u = Math.random() * 2 - 1;
        const a = Math.random() * Math.PI * 2;
        const k = Math.sqrt(1 - u * u);
        const sp = 3.5 + Math.random() * 2.5;
        this.spawn(x, height, z, Math.cos(a) * k * sp, u * sp + 1, Math.sin(a) * k * sp, 0.9 + Math.random() * 0.6, 0.15, colors[i % colors.length], 2.6);
      }
      this.goalLight.position.set(x, height, z);
      this.goalLight.color.set(colors[0]);
      this.goalLightLevel = Math.max(this.goalLightLevel, 1);
    });
  }

  /**
   * Goal celebration: shockwave rings at the goal mouth, fireworks over the goal, a spotlight on the
   * scorer and a camera push-in (no push-in or fireworks with reduced motion).
   */
  private goalCelebration(w: World, sx: number, color: string, reduced: boolean): void {
    const gx = sx * w.hx;
    const colors = [color, '#ffffff', '#f6c542'];
    for (let k = 0; k < 3; k++) this.schedule(k * 0.14, () => this.flash(gx - sx * 0.6, 0, 5 + k * 3.5, k === 1 ? '#ffffff' : color, 0.7));
    const scorer = w.robots[w.ball.lastTouchRobot];
    if (scorer) {
      for (let k = 0; k < 4; k++) this.schedule(0.2 + k * 0.35, () => this.flash(scorer.x, scorer.z, 2.6, '#f6c542', 0.5));
    }
    if (reduced) return;
    this.confetti(gx - sx * 1, 0, colors, 70);
    this.shake = Math.max(this.shake, 0.3);
    // Fireworks burst low over the pitch in front of the goal so they stay in view during the push-in.
    const gw = w.arena.goalWidth / 2 + 1.5;
    this.firework(gx - sx * 2.5, -gw, 3.6, colors);
    this.schedule(0.22, () => this.firework(gx - sx * 2.5, gw, 4.0, colors));
    this.schedule(0.5, () => this.firework(gx - sx * 5, 0, 4.6, colors));
    // Camera eases toward the goal for the celebration and back at the next kickoff.
    this.focusX = gx * 0.55;
    this.focusTarget = 1;
  }

  private updateParticles(dt: number): void {
    const ps = this.particles;
    let n = 0;
    q1.copy(this.camera.quaternion);
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy -= p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.03) {
        p.y = 0.03;
        p.vy *= -0.3;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
      p.rot += p.spin * dt;
      ps[n] = p;
      const s = p.size * Math.min(1, (p.life / p.max) * 2.2);
      v1.set(p.x, p.y, p.z);
      v2.set(s, s * (0.55 + 0.45 * Math.abs(Math.sin(p.rot))), s);
      m4.compose(v1, q1, v2);
      this.pMesh.setMatrixAt(n, m4);
      this.pMesh.setColorAt(n, col.setRGB(p.r, p.g, p.b));
      n++;
    }
    ps.length = n;
    this.pMesh.count = n;
    if (n > 0) {
      this.pMesh.instanceMatrix.needsUpdate = true;
      if (this.pMesh.instanceColor) this.pMesh.instanceColor.needsUpdate = true;
    }
  }

  private placeStrip(mesh: THREE.Mesh, x1: number, z1: number, x2: number, z2: number, width: number): void {
    const len = Math.hypot(x2 - x1, z2 - z1);
    mesh.rotation.set(-Math.PI / 2, 0, -Math.atan2(z2 - z1, x2 - x1));
    mesh.scale.set(len, width, 1);
    mesh.position.set((x1 + x2) / 2, 0.025, (z1 + z2) / 2);
  }

  render(w: World, f: ViewFrame): void {
    const dt = f.dt;
    this.time += dt;
    const t = this.time;
    const a = f.alpha;
    const p = this.prev;
    const tick = w.tick;
    const hz = TUNING.sim.hz;
    const n = w.robots.length;

    const humanAttached = f.human >= 0 && w.robots[f.human].tState === 'attached';
    this.arenaView.setAnchorGlow(f.preview, humanAttached ? 2 : 1);

    for (let i = 0; i < n; i++) {
      const r = w.robots[i];
      const x = p[i * 2] + (r.x - p[i * 2]) * a;
      const z = p[i * 2 + 1] + (r.z - p[i * 2 + 1]) * a;
      const pose = this.poses[i];
      pose.x = x;
      pose.z = z;
      pose.facing = r.facing;
      pose.vx = r.vx;
      pose.vz = r.vz;
      pose.tethered = r.tState === 'attached';
      if (pose.tethered) {
        const an = w.arena.anchors[r.tAnchor];
        pose.ax = an.x;
        pose.az = an.z;
      }
      pose.kickAge = (tick - r.lastKickTick) / hz;
      pose.kickDir = Math.atan2(r.lastKickDirZ, r.lastKickDirX);
      pose.bumpAge = (tick - r.lastBumpTick) / hz;
      pose.mood = f.moods[i];
      pose.reduced = f.reduced;
      const rv = this.robots[i];
      rv.update(dt, pose);

      const forced = f.expressions?.[i];
      if (forced) rv.setExpression(forced);
      else if (pose.mood === 'celebrate') rv.setExpression('happy');
      else if (pose.mood === 'sad') rv.setExpression('sad');
      else if (pose.bumpAge < 0.35) rv.setExpression('wow');
      else if (pose.kickAge < 0.4) rv.setExpression('happy');
      else if (pose.tethered || Math.hypot(r.vx, r.vz) > 6.5) rv.setExpression('focus');
      else rv.setExpression('neutral');

      const lift = rv.lift;
      const sh = this.shadows[i];
      const ss = 2.5 - lift * 1.5;
      sh.position.set(x, 0.015, z);
      sh.scale.set(ss, ss, 1);
      const ring = this.rings[i];
      ring.position.set(x, 0.02, z);
      const rs = i === f.human ? 2.25 : 2.0;
      ring.scale.set(rs, rs, 1);
      if (i !== f.human) ring.rotation.z = t * 0.6;

      // rope
      const rope = this.ropes[i];
      const glow = this.ropeGlow[i];
      if (pose.tethered) {
        this.ropeGrow[i] = Math.min(1, this.ropeGrow[i] + dt / 0.07);
        const head = this.arenaView.anchors[r.tAnchor].head;
        rv.handWorld(v1);
        v2.copy(head).sub(v1);
        const full = v2.length();
        const len = full * this.ropeGrow[i];
        v2.normalize();
        q1.setFromUnitVectors(UP, v2);
        for (const m of [rope, glow]) {
          m.visible = true;
          m.position.copy(v1).addScaledVector(v2, len / 2);
          m.quaternion.copy(q1);
        }
        const warn = r.tTime > TUNING.tether.maxHoldSeconds - TUNING.tether.warnSeconds;
        const thick = warn && !f.reduced ? 1 + Math.sin(t * 40) * 0.35 : 1;
        rope.scale.set(thick, len, thick);
        const cue = i === f.human && !!f.swingCue;
        glow.scale.set(cue ? 5 : 3.2, len, cue ? 5 : 3.2);
        (rope.material as THREE.MeshBasicMaterial).color.set(cue ? '#8dffb0' : this.ropeColors[i]);
        (glow.material as THREE.MeshBasicMaterial).color.set(cue ? '#8dffb0' : this.opts.looks[i].primary);
      } else {
        rope.visible = glow.visible = false;
      }
      const sp = Math.hypot(r.vx, r.vz);
      this.trails[i].update(x, z, lift, !f.reduced && (pose.tethered || sp > TUNING.robot.maxRunSpeed * 1.2));
      if (r.chassis && this.opts.looks[i].trail === 'trail_spark' && (pose.tethered || sp > 7) && !f.reduced && Math.random() < 0.35) {
        this.spawn(x, 0.3, z, (Math.random() - 0.5) * 2, 1.5, (Math.random() - 0.5) * 2, 0.35, 0.07, '#fff3a8', 5);
      }
    }

    // ball
    const b = w.ball;
    const bx = p[n * 2] + (b.x - p[n * 2]) * a;
    const bz = p[n * 2 + 1] + (b.z - p[n * 2 + 1]) * a;
    this.ball.position.set(bx, TUNING.ball.radius * BALL_SCALE, bz);
    const bs = Math.hypot(b.vx, b.vz);
    if (bs > 0.05) {
      v1.set(b.vz, 0, -b.vx).normalize();
      this.ball.rotateOnWorldAxis(v1, (bs * dt) / TUNING.ball.radius);
    }
    // Streak behind a hard-hit ball (shots and swing kicks), never over the ball itself.
    this.ballTrail.update(bx, bz, 0.25, !f.reduced && bs > 10.5);
    this.ballShadow.position.set(bx, 0.016, bz);

    // player-only helpers
    const h = f.human;
    if (h >= 0) {
      const r = w.robots[h];
      const pose = this.poses[h];
      this.youMarker.position.set(pose.x, 2.95 + this.robots[h].lift + (f.reduced ? 0 : Math.sin(t * 4) * 0.05), pose.z);
      this.youMarker.rotation.y = t * 2;
      const dBall = Math.hypot(b.x - r.x, b.z - r.z);
      const kickable = dBall <= TUNING.kick.range && r.kickCd <= 0;
      const rm = this.ballRing.material as THREE.MeshBasicMaterial;
      const target = kickable ? 0.95 : this.opts.ballOutline ? 0.55 : 0;
      rm.opacity += (target - rm.opacity) * Math.min(1, dt * 18);
      rm.color.set(kickable ? '#ffe36a' : '#ffffff');
      const brs = kickable ? 1.7 + (f.reduced ? 0 : Math.sin(t * 10) * 0.07) : 1.4;
      this.ballRing.scale.set(brs, brs, 1);
      this.ballRing.position.set(bx, 0.022, bz);

      this.aimRing.visible = f.showAim;
      if (f.showAim) {
        this.aimRing.position.set(f.aimX, 0.03, f.aimZ);
        this.aimRing.rotation.z = t * 0.8;
      }
      // short kick-direction hint from the ball
      const showLine = kickable && (f.showAim || true);
      this.aimLine.visible = showLine;
      if (showLine) {
        let dx = f.aimX - bx;
        let dz = f.aimZ - bz;
        const dl = Math.hypot(dx, dz) || 1;
        dx /= dl;
        dz /= dl;
        const len = Math.min(3.2, Math.max(1.2, dl - 0.5));
        this.placeStrip(this.aimLine, bx + dx * 0.5, bz + dz * 0.5, bx + dx * (0.5 + len), bz + dz * (0.5 + len), 0.1);
      }
      // Optional faint line to the anchor you would grab (off by default; the anchor halo is the main cue).
      const showLink = f.link && f.preview >= 0 && r.tState === 'ready';
      this.linkLine.visible = showLink;
      if (showLink) {
        const an = w.arena.anchors[f.preview];
        this.placeStrip(this.linkLine, pose.x, pose.z, an.x, an.z, 0.07);
        (this.linkLine.material as THREE.MeshBasicMaterial).opacity = 0.35;
      }
      this.holdArc.visible = false;
    } else {
      this.aimRing.visible = this.aimLine.visible = this.linkLine.visible = this.holdArc.visible = false;
      (this.ballRing.material as THREE.MeshBasicMaterial).opacity = this.opts.ballOutline ? 0.55 : 0;
      this.ballRing.position.set(bx, 0.022, bz);
      this.ballRing.scale.set(1.4, 1.4, 1);
    }

    for (const fl of this.flashes) {
      if (fl.life <= 0) continue;
      fl.life -= dt;
      const k = 1 - Math.max(0, fl.life) / fl.max;
      const s = fl.size * (0.4 + k * 0.9);
      fl.mesh.scale.set(s, s, 1);
      (fl.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.9;
      if (fl.life <= 0) fl.mesh.visible = false;
    }
    for (const m of this.markerPulse) {
      const s = m.userData.base * (1 + (f.reduced ? 0 : Math.sin(t * 5) * 0.06));
      m.scale.set(s, s, 1);
    }
    this.updateParticles(dt);

    // timed presentation effects
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) {
        this.timers.splice(i, 1);
        tm.fn();
      }
    }
    if (this.goalLightLevel > 0) {
      this.goalLightLevel = Math.max(0, this.goalLightLevel - dt * 1.6);
      this.goalLight.intensity = this.goalLightLevel * 90;
    }
    // Goal push-in: ease toward the scoring end and 25% closer, then back at kickoff.
    const ft = f.reduced ? 0 : this.focusTarget;
    this.focus += (ft - this.focus) * Math.min(1, dt * (ft > this.focus ? 2.6 : 3.5));
    const fz = this.focus * this.focus * (3 - 2 * this.focus);
    v3.set(this.focusX, 0, this.camTarget.z);
    this.camera.position.copy(this.camBase).lerp(v3, 0.25 * fz);
    this.camera.position.x += this.focusX * 0.55 * fz;
    // camera shake (opt-in, never with reduced motion)
    if (this.shake > 0.001 && f.shake && !f.reduced) {
      this.shake *= Math.exp(-dt * 9);
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
    } else this.shake = 0;
    this.arenaView.update(dt, t, this.camera, f.reduced);
    this.gfx.render(this.scene, this.camera);
  }

  dispose(): void {
    this.setMarkers([]);
    for (const r of this.robots) r.dispose();
    for (const d of this.disposables) d.dispose();
    this.arenaView.dispose();
    this.pMesh.dispose();
  }
}

const ROPE_GEO = new THREE.CylinderGeometry(0.035, 0.035, 1, 6);
const POST_GEO = new THREE.CylinderGeometry(0.09, 0.09, 1.1, 8);
