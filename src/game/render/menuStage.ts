import * as THREE from 'three';
import type { RobotLook } from '../../content/cosmetics';
import { buildHarborScenery, makePalm } from './arenaView';
import type { Gfx } from './gfx';
import { RobotView, type RobotMood, type RobotPose } from './robotView';
import { blobTexture, skyTexture, tileTexture, type Expression } from './textures';

export type StageShot = 'duo' | 'solo' | 'hidden';

/**
 * Clubhouse scene behind the menus: robots on a platform with the harbour beyond.
 * The camera frames whatever screen rectangle the current layout reserves for the robots.
 */
export class MenuStage {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 0.3, 500);
  private robots: RobotView[] = [];
  private poses: RobotPose[] = [];
  private looks: RobotLook[] = [];
  private moods: RobotMood[] = ['idle', 'idle'];
  private shot: StageShot = 'duo';
  private frame = { cx: 0.5, cy: 0.5, w: 0.5, h: 0.6 };
  private cur = { cx: 0.5, cy: 0.5, zoom: 1, yaw: 0 };
  private yawTarget = 0;
  private spin = 0;
  private ring: THREE.MeshStandardMaterial;
  private banner: THREE.MeshStandardMaterial;
  private bannerStripe: THREE.MeshStandardMaterial;
  private time = 0;
  private disposables: { dispose(): void }[] = [];
  private shadows: THREE.Mesh[] = [];
  private platform = new THREE.Group();
  reduced = false;

  constructor(private gfx: Gfx) {
    const track = <T extends { dispose(): void }>(d: T): T => {
      this.disposables.push(d);
      return d;
    };
    const shadows = gfx.quality === 'high';
    this.scene.background = track(skyTexture([[0, '#3f9fe6'], [0.5, '#8fd0f5'], [0.78, '#dff4ff'], [1, '#f7fbff']]));
    this.scene.add(new THREE.HemisphereLight('#e8f5ff', '#b9a98c', 1.15));
    const sun = new THREE.DirectionalLight('#fff0d0', 2.4);
    sun.position.set(-6, 10, 8);
    if (shadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      const sc = sun.shadow.camera;
      sc.left = -5;
      sc.right = 5;
      sc.top = 5;
      sc.bottom = -5;
      sc.near = 1;
      sc.far = 30;
      sun.shadow.bias = -0.0008;
      sun.shadow.normalBias = 0.02;
    }
    this.scene.add(sun);

    const std = (color: string, rough = 0.7, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => track(new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra }));

    // terrace floor
    const tiles = track(tileTexture('#efe7d8', '#e6dccb', '#d2c6b2'));
    tiles.repeat.set(14, 14);
    const floor = new THREE.Mesh(track(new THREE.CircleGeometry(26, 48)), std('#ffffff', 0.85, { map: tiles }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = shadows;
    this.scene.add(floor);

    // platform
    const base = new THREE.Mesh(track(new THREE.CylinderGeometry(2.55, 2.75, 0.34, 48)), std('#c9ced3', 0.45, { metalness: 0.25 }));
    base.position.y = 0.17;
    base.receiveShadow = shadows;
    base.castShadow = shadows;
    const top = new THREE.Mesh(track(new THREE.CylinderGeometry(2.3, 2.3, 0.06, 48)), std('#aab1b9', 0.4, { metalness: 0.3 }));
    top.position.y = 0.36;
    top.receiveShadow = shadows;
    this.ring = std('#12bcd2', 0.4, { emissive: new THREE.Color('#12bcd2'), emissiveIntensity: 1.1 });
    const ring = new THREE.Mesh(track(new THREE.TorusGeometry(2.42, 0.05, 8, 64)), this.ring);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.36;
    this.platform.add(base, top, ring);
    const blockG = track(new THREE.BoxGeometry(0.75, 0.3, 0.42));
    const yellow = std('#f6c542', 0.5);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const b = new THREE.Mesh(blockG, yellow);
      b.position.set(Math.cos(a) * 2.62, 0.2, Math.sin(a) * 2.62);
      b.rotation.y = -a + Math.PI / 2;
      b.castShadow = shadows;
      this.platform.add(b);
    }
    this.scene.add(this.platform);

    // balustrade and arches framing the harbour view
    const ivory = std('#f3efe4', 0.7);
    const rail = new THREE.Mesh(track(new THREE.BoxGeometry(60, 0.16, 0.3)), ivory);
    rail.position.set(0, 1.0, -9.5);
    this.scene.add(rail);
    const postG = track(new THREE.BoxGeometry(0.22, 1, 0.22));
    for (let x = -28; x <= 28; x += 2) {
      const p = new THREE.Mesh(postG, ivory);
      p.position.set(x, 0.5, -9.5);
      this.scene.add(p);
    }
    const colG = track(new THREE.CylinderGeometry(0.42, 0.5, 9, 16));
    const archG = track(new THREE.TorusGeometry(6, 0.42, 10, 32, Math.PI));
    for (const x of [-12, 0, 12]) {
      const arch = new THREE.Mesh(archG, ivory);
      arch.position.set(x, 8.6, -10.5);
      this.scene.add(arch);
    }
    for (const x of [-18, -6, 6, 18]) {
      const c = new THREE.Mesh(colG, ivory);
      c.position.set(x, 4.5, -10.5);
      this.scene.add(c);
    }
    const beam = new THREE.Mesh(track(new THREE.BoxGeometry(60, 1.2, 1)), ivory);
    beam.position.set(0, 15.2, -10.5);
    this.scene.add(beam);

    // club banner
    this.banner = std('#12bcd2', 0.8, { side: THREE.DoubleSide });
    this.bannerStripe = std('#17273e', 0.8, { side: THREE.DoubleSide });
    const cloth = new THREE.Mesh(track(new THREE.PlaneGeometry(1.5, 2.6)), this.banner);
    cloth.position.set(-6, 5.2, -9.9);
    const stripe = new THREE.Mesh(track(new THREE.PlaneGeometry(1.5, 0.4)), this.bannerStripe);
    stripe.position.set(-6, 4.25, -9.88);
    const emblem = new THREE.Mesh(track(new THREE.RingGeometry(0.28, 0.46, 24)), std('#ffffff', 0.7, { side: THREE.DoubleSide }));
    emblem.position.set(-6, 5.45, -9.88);
    const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 8)), std('#8d949c', 0.4));
    pole.rotation.z = Math.PI / 2;
    pole.position.set(-6, 6.55, -9.9);
    this.scene.add(cloth, stripe, emblem, pole);

    // plants
    this.scene.add(makePalm(-9.5, 0, -6.5, 4.6, track), makePalm(9.8, 0, -7, 5.2, track));
    const potG = track(new THREE.CylinderGeometry(0.7, 0.5, 0.9, 14));
    for (const x of [-9.5, 9.8]) {
      const pot = new THREE.Mesh(potG, ivory);
      pot.position.set(x, 0.45, x < 0 ? -6.5 : -7);
      this.scene.add(pot);
    }
    const scenery = new THREE.Group();
    buildHarborScenery(scenery, -16, track, true);
    scenery.position.y = -3.5;
    this.scene.add(scenery);

    const blob = blobTexture();
    for (let i = 0; i < 2; i++) {
      const sh = new THREE.Mesh(track(new THREE.PlaneGeometry(1, 1)), track(new THREE.MeshBasicMaterial({ map: blob, color: '#101a26', transparent: true, opacity: 0.4, depthWrite: false })));
      sh.rotation.x = -Math.PI / 2;
      this.scene.add(sh);
      this.shadows.push(sh);
      this.poses.push({ x: 0, z: 0, facing: Math.PI / 2, vx: 0, vz: 0, tethered: false, ax: 0, az: 0, kickAge: 9, kickDir: 0, bumpAge: 9, mood: 'idle', reduced: false });
    }
  }

  setColors(primary: string, secondary: string): void {
    this.ring.color.set(primary);
    this.ring.emissive.set(primary);
    this.banner.color.set(primary);
    this.bannerStripe.color.set(secondary);
  }

  setLooks(looks: RobotLook[]): void {
    const shadows = this.gfx.quality === 'high';
    looks.forEach((look, i) => {
      if (!this.robots[i]) {
        const rv = new RobotView(look, shadows);
        rv.scale = 1.45;
        this.robots[i] = rv;
        this.scene.add(rv.root);
      } else if (JSON.stringify(this.looks[i]) !== JSON.stringify(look)) this.robots[i].setLook(look);
      this.looks[i] = { ...look };
    });
    if (looks[0]) this.setColors(looks[0].primary, looks[0].secondary);
  }

  setShot(shot: StageShot): void {
    this.shot = shot;
  }

  setMoods(a: RobotMood, b: RobotMood = a): void {
    this.moods = [a, b];
  }

  /** Screen rectangle (0..1 units) the robots should occupy. */
  setFrame(cx: number, cy: number, w: number, h: number): void {
    this.frame = { cx, cy, w, h };
  }

  /** Drag-to-rotate support for the garage preview. */
  rotate(delta: number): void {
    this.yawTarget += delta;
  }

  resetRotation(): void {
    this.yawTarget = 0;
  }

  render(dt: number): void {
    this.time += dt;
    const solo = this.shot === 'solo';
    const hidden = this.shot === 'hidden';
    const k = Math.min(1, dt * 6);
    // Size the view so the subject (about 5 units wide for the duo, 3 for one robot) fits the frame.
    const aspect = this.gfx.width / this.gfx.height;
    const subjectW = solo ? 4.6 : 7.6;
    const subjectH = solo ? 4.3 : 4.9;
    const fovV = (this.camera.fov * Math.PI) / 180;
    const distH = subjectH / (2 * Math.tan(fovV / 2) * Math.max(0.15, this.frame.h));
    const distW = subjectW / (2 * Math.tan(fovV / 2) * aspect * Math.max(0.15, this.frame.w));
    const dist = Math.max(distH, distW, 5);
    const zoomTarget = dist;
    this.cur.zoom += (zoomTarget - this.cur.zoom) * k;
    this.cur.cx += (this.frame.cx - this.cur.cx) * k;
    this.cur.cy += (this.frame.cy - this.cur.cy) * k;
    this.cur.yaw += (this.yawTarget - this.cur.yaw) * Math.min(1, dt * 10);

    const cam = this.camera;
    cam.aspect = aspect;
    const d = this.cur.zoom;
    cam.position.set(0, 1.7 + d * 0.2, d);
    cam.lookAt(0, 1.45, 0);
    // Shift the projection so the platform centre lands on the frame centre.
    const W = this.gfx.width;
    const H = this.gfx.height;
    cam.setViewOffset(W, H, (0.5 - this.cur.cx) * W, (0.5 - this.cur.cy) * H, W, H);
    cam.updateProjectionMatrix();

    const n = this.robots.length;
    for (let i = 0; i < n; i++) {
      const rv = this.robots[i];
      const visible = !hidden && (i === 0 || !solo);
      rv.root.visible = visible;
      this.shadows[i].visible = visible;
      if (!visible) continue;
      const p = this.poses[i];
      const tx = solo ? 0 : i === 0 ? -0.95 : 1.0;
      const tz = solo ? 0.1 : i === 0 ? 0.25 : -0.15;
      p.x += (tx - p.x) * k;
      p.z += (tz - p.z) * k;
      p.facing = Math.PI / 2 + (solo ? 0 : i === 0 ? -0.22 : 0.26) - (i === 0 ? this.cur.yaw : 0);
      p.mood = this.moods[i];
      p.reduced = this.reduced;
      rv.update(dt, p);
      rv.root.position.y += 0.39;
      const mood = this.moods[i];
      const exp: Expression = mood === 'celebrate' ? 'happy' : mood === 'sad' ? 'sad' : mood === 'ready' ? 'happy' : 'neutral';
      rv.setExpression(exp);
      const s = 1.9 - rv.lift;
      this.shadows[i].position.set(p.x, 0.4, p.z);
      this.shadows[i].scale.set(s, s, 1);
    }
    this.spin += dt;
    this.ring.emissiveIntensity = 1.0 + (this.reduced ? 0 : Math.sin(this.time * 2) * 0.25);
    this.gfx.render(this.scene, cam);
  }

  dispose(): void {
    for (const r of this.robots) r.dispose();
    for (const d of this.disposables) d.dispose();
  }
}
