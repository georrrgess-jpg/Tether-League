import * as THREE from 'three';
import type { RobotLook } from '../../content/cosmetics';
import { faceTexture, jerseyTexture, shade, type Expression } from './textures';

/**
 * Procedural robot: rounded white shell, navy joints, dark face screen with glowing eyes, club jersey.
 * All animation is presentation only; the simulation body is a circle and never reads this.
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

const WHITE = '#f4f6f2';
const NAVY = '#24344e';

const geo = {
  torso: null as THREE.BufferGeometry | null,
  head: null as THREE.BufferGeometry | null,
  visor: null as THREE.BufferGeometry | null,
  ear: null as THREE.BufferGeometry | null,
  limb: null as THREE.BufferGeometry | null,
  joint: null as THREE.BufferGeometry | null,
  boot: null as THREE.BufferGeometry | null,
  fin: null as THREE.BufferGeometry | null,
  box: null as THREE.BufferGeometry | null,
};

function ensureGeo(): void {
  if (geo.torso) return;
  const pts: THREE.Vector2[] = [];
  const prof: [number, number][] = [
    [0.001, 0.0], [0.15, 0.0], [0.205, 0.035], [0.245, 0.13], [0.275, 0.25], [0.268, 0.34], [0.215, 0.41], [0.12, 0.445], [0.001, 0.455],
  ];
  for (const [r, y] of prof) pts.push(new THREE.Vector2(r, y));
  geo.torso = new THREE.LatheGeometry(pts, 28, Math.PI, Math.PI * 2);
  geo.head = new THREE.SphereGeometry(0.3, 28, 20);
  geo.visor = new THREE.SphereGeometry(0.306, 24, 12, Math.PI / 2 - 1.0, 2.0, 1.08, 0.86);
  geo.ear = new THREE.CylinderGeometry(0.095, 0.095, 0.07, 18);
  geo.limb = new THREE.CapsuleGeometry(0.066, 0.17, 4, 10);
  geo.joint = new THREE.SphereGeometry(0.085, 14, 10);
  geo.boot = new THREE.SphereGeometry(0.1, 14, 10);
  geo.fin = new THREE.ConeGeometry(0.11, 0.42, 4);
  geo.box = new THREE.BoxGeometry(1, 1, 1);
}

const tmpV = new THREE.Vector3();

export class RobotView {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private torso!: THREE.Mesh;
  private head = new THREE.Group();
  private visorMat!: THREE.MeshBasicMaterial;
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private handR!: THREE.Mesh;
  private jerseyMat!: THREE.MeshStandardMaterial;
  private accentMats: THREE.MeshStandardMaterial[] = [];
  private secondaryMats: THREE.MeshStandardMaterial[] = [];
  private extras = new THREE.Group();
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
  private hipY = 0.36;
  private yaw = 0;
  /** Extra scale applied by the menu stage. */
  scale = 1;

  constructor(look: RobotLook, shadows: boolean) {
    ensureGeo();
    this.root.add(this.body);
    this.build(shadows);
    this.setLook(look);
  }

  private mat(color: string, rough = 0.42): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.02 });
  }

  private build(shadows: boolean): void {
    const white = this.mat(WHITE, 0.35);
    const navy = this.mat(NAVY, 0.55);
    this.jerseyMat = this.mat('#ffffff', 0.6);
    const accent = this.mat('#12bcd2', 0.4);
    this.accentMats.push(accent);

    const add = (parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh => {
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = shadows;
      parent.add(mesh);
      return mesh;
    };

    this.torso = add(this.body, geo.torso!, this.jerseyMat, 0, this.hipY - 0.03, 0);
    // pelvis
    const pelvis = add(this.body, geo.joint!, navy, 0, this.hipY, 0);
    pelvis.scale.set(1.9, 0.9, 1.5);

    // head
    this.head.position.set(0, 1.02, 0.01);
    this.body.add(this.head);
    const skull = add(this.head, geo.head!, white);
    skull.scale.set(1.14, 0.93, 1.0);
    this.visorMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const visor = new THREE.Mesh(geo.visor!, this.visorMat);
    visor.scale.set(1.14, 0.93, 1.0);
    visor.position.set(0, 0.035, 0.012);
    this.head.add(visor);
    for (const s of [-1, 1]) {
      const ear = add(this.head, geo.ear!, accent, s * 0.345, 0.0, 0);
      ear.rotation.z = Math.PI / 2;
    }
    // Team-coloured crown stripe: keeps the side readable from the elevated match camera.
    const crown = add(this.head, geo.head!, accent, 0, 0.012, -0.02);
    crown.scale.set(0.42, 0.945, 0.99);
    const neck = add(this.body, geo.joint!, navy, 0, 0.8, 0);
    neck.scale.set(1.1, 0.7, 1.1);

    // arms
    for (const [grp, s] of [[this.armL, -1], [this.armR, 1]] as [THREE.Group, number][]) {
      grp.position.set(s * 0.315, 0.7, 0);
      this.body.add(grp);
      add(grp, geo.joint!, navy);
      add(grp, geo.limb!, white, 0, -0.17, 0);
      const hand = add(grp, geo.joint!, navy, 0, -0.34, 0);
      hand.scale.setScalar(1.08);
      if (s === 1) {
        this.handR = hand;
        // tether emitter band
        const band = add(grp, geo.ear!, this.mat('#f6c542', 0.4), 0, -0.25, 0);
        band.scale.set(0.82, 0.7, 0.82);
      }
    }
    // legs
    for (const [grp, s] of [[this.legL, -1], [this.legR, 1]] as [THREE.Group, number][]) {
      grp.position.set(s * 0.125, this.hipY, 0);
      this.body.add(grp);
      const thigh = add(grp, geo.limb!, navy, 0, -0.13, 0);
      thigh.scale.set(1.05, 0.8, 1.05);
      const boot = add(grp, geo.boot!, white, 0, -0.285, 0.035);
      boot.scale.set(1.05, 0.72, 1.55);
      const sole = add(grp, geo.boot!, accent, 0, -0.32, 0.035);
      sole.scale.set(1.08, 0.3, 1.6);
    }
    this.body.add(this.extras);
  }

  setLook(look: RobotLook): void {
    this.look = { ...look };
    const primary = look.primary;
    for (const m of this.accentMats) {
      m.color.set(primary);
      m.emissive.set(primary);
      m.emissiveIntensity = 0.25;
    }
    this.eyeColor = shade(primary, 0.45);
    this.jerseyMat.map = jerseyTexture(look.pattern, primary, look.secondary, look.number);
    this.jerseyMat.needsUpdate = true;
    this.applyFace(true);

    // chassis silhouette
    const b = this.body;
    this.extras.clear();
    this.secondaryMats.length = 0;
    let torsoX = 1, torsoZ = 1, torsoY = 1, headS = 1, armS = 1, legY = 1, legSpread = 0.125, shoulder = 0.315;
    const sec = this.mat(look.secondary, 0.45);
    const white = this.mat(WHITE, 0.35);
    const prim = this.accentMats[0];
    const shadows = this.torso.castShadow;
    const addExtra = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = shadows;
      this.extras.add(mesh);
      return mesh;
    };
    switch (look.chassis) {
      case 'scout': {
        torsoX = 0.86; torsoZ = 0.9; torsoY = 0.96; headS = 0.93; legY = 1.22; armS = 0.92; shoulder = 0.275;
        const stalk = addExtra(geo.limb!, this.mat(NAVY), 0.12, 1.36, -0.05);
        stalk.scale.set(0.28, 0.9, 0.28);
        const tip = addExtra(geo.joint!, prim, 0.12, 1.5, -0.05);
        tip.scale.setScalar(0.62);
        const visorFin = addExtra(geo.fin!, sec, 0, 1.28, -0.12);
        visorFin.scale.set(0.5, 0.45, 1.2);
        visorFin.rotation.x = -0.9;
        break;
      }
      case 'bulwark': {
        torsoX = 1.24; torsoZ = 1.14; torsoY = 1.0; headS = 1.04; legY = 0.86; armS = 1.22; legSpread = 0.17; shoulder = 0.39;
        for (const s of [-1, 1]) {
          const pad = addExtra(geo.joint!, white, s * 0.4, 0.76, 0);
          pad.scale.set(1.75, 1.25, 1.75);
          const stripe = addExtra(geo.box!, sec, s * 0.4, 0.83, 0);
          stripe.scale.set(0.06, 0.1, 0.3);
        }
        const bumper = addExtra(geo.box!, this.mat(NAVY), 0, 0.47, 0.25);
        bumper.scale.set(0.42, 0.09, 0.08);
        break;
      }
      case 'glider': {
        torsoX = 0.94; torsoZ = 0.96; headS = 0.98; armS = 0.96;
        for (const s of [-1, 1]) {
          const wing = addExtra(geo.fin!, sec, s * 0.2, 0.74, -0.27);
          wing.scale.set(0.5, 1.35, 1.5);
          wing.rotation.set(-1.25, 0, s * 0.7);
          const tipFin = addExtra(geo.fin!, prim, s * 0.33, 1.1, -0.1);
          tipFin.scale.set(0.3, 0.55, 0.9);
          tipFin.rotation.set(-0.9, 0, s * 0.5);
        }
        const crest = addExtra(geo.fin!, prim, 0, 1.3, -0.08);
        crest.scale.set(0.3, 0.6, 1.3);
        crest.rotation.x = -1.0;
        break;
      }
      default:
        break;
    }
    this.secondaryMats.push(sec);
    this.torso.scale.set(torsoX, torsoY, torsoZ);
    this.head.scale.setScalar(headS);
    this.armL.scale.setScalar(armS);
    this.armR.scale.setScalar(armS);
    this.armL.position.x = -shoulder;
    this.armR.position.x = shoulder;
    this.legL.scale.set(1, legY, 1);
    this.legR.scale.set(1, legY, 1);
    this.legL.position.x = -legSpread;
    this.legR.position.x = legSpread;
    // Longer / shorter legs raise or lower the whole body so feet stay on the ground.
    b.position.y = (legY - 1) * 0.33;
  }

  private applyFace(force = false): void {
    const exp: Expression = this.blink > 0 && (this.expression === 'neutral' || this.expression === 'focus') ? 'blink' : this.expression;
    const t = faceTexture(this.look.face, exp, this.eyeColor);
    if (force || this.visorMat.map !== t) {
      this.visorMat.map = t;
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
  }

  dispose(): void {
    this.jerseyMat.dispose();
    this.visorMat.dispose();
    for (const m of this.accentMats) m.dispose();
    for (const m of this.secondaryMats) m.dispose();
  }
}

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
