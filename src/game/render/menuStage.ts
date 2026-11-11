import * as THREE from 'three';
import type { RobotLook } from '../../content/cosmetics';
import { floorTexture } from './arenaTextures';
import { buildHarborScenery, buntingGeometry, gullFlock, makePalm } from './arenaView';
import type { Gfx } from './gfx';
import { RobotView, type RobotMood, type RobotPose } from './robotView';
import { ballMaps, beamTexture, blobTexture, skyTexture, type Expression } from './textures';

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
  private ring: THREE.MeshStandardMaterial;
  private banner: THREE.MeshStandardMaterial;
  private bannerStripe: THREE.MeshStandardMaterial;
  private time = 0;
  private disposables: { dispose(): void }[] = [];
  private shadows: THREE.Mesh[] = [];
  private platform = new THREE.Group();
  private sweep: THREE.Mesh;
  private sweepMat: THREE.MeshBasicMaterial;
  private spotMat: THREE.MeshBasicMaterial | null = null;
  private bannerGrp = new THREE.Group();
  private lowEnv: THREE.Texture | null = null;
  private water: THREE.Texture;
  private gulls: THREE.Mesh;
  /** Optional club match ball resting on the platform (Club screen ball tab); null = none shown. */
  private ball: THREE.Mesh | null = null;
  private ballId = '';
  private ballOn = false;
  reduced = false;

  constructor(private gfx: Gfx) {
    const track = <T extends { dispose(): void }>(d: T): T => {
      this.disposables.push(d);
      return d;
    };
    const shadows = gfx.quality === 'high';
    this.scene.background = track(skyTexture([[0, '#3f9fe6'], [0.5, '#8fd0f5'], [0.78, '#dff4ff'], [1, '#f7fbff']]));
    const low = gfx.quality === 'low';
    // Medium / high light the clubhouse with the shared studio environment for glossy shells and a
    // reflective platform; the hemisphere light steps back to keep the same overall level.
    this.scene.add(new THREE.HemisphereLight('#e8f5ff', '#b9a98c', low ? 1.1 : 0.7));
    // cool rim light from behind separates the robots from the bright harbour backdrop
    const rim = new THREE.DirectionalLight('#cfe6ff', 1.4);
    rim.position.set(4, 6, -8);
    this.scene.add(rim);
    const sun = new THREE.DirectionalLight('#fff0d0', 2.6);
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
    const tiles = track(floorTexture('terrace'));
    tiles.repeat.set(13, 13);
    const floor = new THREE.Mesh(track(new THREE.CircleGeometry(26, 48)), std('#ffffff', 0.85, { map: tiles }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = shadows;
    this.scene.add(floor);

    // platform: brushed-metal plinth, a dark lacquered turntable top that reflects the robots' surroundings,
    // a glowing club-colour ring and a light that sweeps slowly round the rim
    const base = new THREE.Mesh(track(new THREE.CylinderGeometry(2.55, 2.75, 0.34, 64)), std('#d3d8de', 0.3, { metalness: low ? 0.2 : 0.7 }));
    base.position.y = 0.17;
    base.receiveShadow = shadows;
    base.castShadow = shadows;
    const topMat = low
      ? std('#2a3446', 0.25, { metalness: 0.2 })
      : track(new THREE.MeshPhysicalMaterial({ color: '#253045', roughness: 0.32, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.06 }));
    const top = new THREE.Mesh(track(new THREE.CylinderGeometry(2.3, 2.3, 0.06, 64)), topMat);
    top.position.y = 0.36;
    top.receiveShadow = shadows;
    const inlay = new THREE.Mesh(track(new THREE.RingGeometry(1.55, 1.6, 64)), track(new THREE.MeshBasicMaterial({ color: '#8fa3c2', transparent: true, opacity: 0.35 })));
    inlay.rotation.x = -Math.PI / 2;
    inlay.position.y = 0.392;
    this.ring = std('#12bcd2', 0.3, { emissive: new THREE.Color('#12bcd2'), emissiveIntensity: 1.1 });
    const ring = new THREE.Mesh(track(new THREE.TorusGeometry(2.42, 0.05, 10, 96)), this.ring);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.36;
    this.sweepMat = track(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.sweep = new THREE.Mesh(track(new THREE.TorusGeometry(2.42, 0.075, 8, 32, Math.PI * 0.35)), this.sweepMat);
    this.sweep.rotation.x = Math.PI / 2;
    this.sweep.position.y = 0.36;
    this.platform.add(base, top, inlay, ring, this.sweep);
    // soft overhead spotlight cone onto the platform (medium / high)
    if (!low) {
      this.spotMat = track(new THREE.MeshBasicMaterial({ map: track(beamTexture()), color: '#fff6e4', transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      const cone = new THREE.Mesh(track(new THREE.ConeGeometry(2.6, 9, 40, 1, true)), this.spotMat);
      cone.position.set(0, 4.9, 0);
      cone.renderOrder = 2;
      this.platform.add(cone);
    }
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
    // The banner hangs from its pole and sways gently (the group pivots at the pole).
    this.bannerGrp.position.set(-6, 6.55, -9.9);
    const cloth = new THREE.Mesh(track(new THREE.PlaneGeometry(1.5, 2.6)), this.banner);
    cloth.position.set(0, -1.35, 0);
    const stripe = new THREE.Mesh(track(new THREE.PlaneGeometry(1.5, 0.4)), this.bannerStripe);
    stripe.position.set(0, -2.3, 0.02);
    const emblem = new THREE.Mesh(track(new THREE.RingGeometry(0.28, 0.46, 32)), std('#ffffff', 0.7, { side: THREE.DoubleSide }));
    emblem.position.set(0, -1.1, 0.02);
    this.bannerGrp.add(cloth, stripe, emblem);
    const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 12)), std('#8d949c', 0.3, { metalness: 0.6 }));
    pole.rotation.z = Math.PI / 2;
    pole.position.set(-6, 6.55, -9.9);
    this.scene.add(this.bannerGrp, pole);

    // plants
    this.scene.add(makePalm(-9.5, 0, -6.5, 4.6, track), makePalm(9.8, 0, -7, 5.2, track));
    const potG = track(new THREE.CylinderGeometry(0.7, 0.5, 0.9, 14));
    for (const x of [-9.5, 9.8]) {
      const pot = new THREE.Mesh(potG, ivory);
      pot.position.set(x, 0.45, x < 0 ? -6.5 : -7);
      this.scene.add(pot);
    }
    const scenery = new THREE.Group();
    this.water = buildHarborScenery(scenery, -16, track, true);
    scenery.position.y = -3.5;
    this.scene.add(scenery);
    // seaside dressing: bunting strung between the columns and gulls wheeling over the bay
    const flagM = track(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    for (const x of [-12, 0, 12]) this.scene.add(new THREE.Mesh(track(buntingGeometry(x - 5.6, x + 5.6, 8.4, -10.1, 0.9, ['#f6c542', '#ffffff', '#35c3d4', '#ef5d50'])), flagM));
    this.gulls = new THREE.Mesh(track(gullFlock(1)), track(new THREE.MeshBasicMaterial({ color: '#f7fafc', side: THREE.DoubleSide })));
    this.gulls.position.set(-7, 6.2, -34);
    this.gulls.scale.setScalar(2.4);
    this.scene.add(this.gulls);

    const blob = blobTexture();
    for (let i = 0; i < 2; i++) {
      const sh = new THREE.Mesh(track(new THREE.PlaneGeometry(1, 1)), track(new THREE.MeshBasicMaterial({ map: blob, color: '#101a26', transparent: true, opacity: 0.4, depthWrite: false })));
      sh.rotation.x = -Math.PI / 2;
      this.scene.add(sh);
      this.shadows.push(sh);
      this.poses.push({ x: 0, z: 0, facing: Math.PI / 2, vx: 0, vz: 0, tethered: false, ax: 0, az: 0, kickAge: 9, kickDir: 0, bumpAge: 9, mood: 'idle', reduced: false });
    }
  }

  /** Studio reflections (see MatchView): scene-wide on medium / high, robots only on low. */
  private applyEnvironment(): void {
    const env = this.gfx.environment();
    if (this.gfx.quality !== 'low') {
      if (this.scene.environment !== env) {
        this.scene.environment = env;
        this.scene.environmentIntensity = 0.25;
      }
    } else if (this.lowEnv !== env) {
      this.lowEnv = env;
      for (const r of this.robots) r.setEnvironment(env, 0.85);
    }
  }

  setColors(primary: string, secondary: string): void {
    this.ring.color.set(primary);
    this.ring.emissive.set(primary);
    this.sweepMat?.color.set(primary).lerp(new THREE.Color('#ffffff'), 0.5);
    this.banner.color.set(primary);
    this.bannerStripe.color.set(secondary);
  }

  setLooks(looks: RobotLook[]): void {
    // An empty list (App.syncStage(true)) forgets the applied looks so the next call re-applies them, e.g.
    // to pick up jersey textures redrawn once the number font has loaded.
    if (!looks.length) {
      this.looks = [];
      return;
    }
    const shadows = this.gfx.quality === 'high';
    looks.forEach((look, i) => {
      if (!this.robots[i]) {
        const rv = new RobotView(look, shadows, this.gfx.quality);
        rv.scale = 1.45;
        if (this.lowEnv) rv.setEnvironment(this.lowEnv, 0.85);
        this.robots[i] = rv;
        this.scene.add(rv.root);
      } else if (JSON.stringify(this.looks[i]) !== JSON.stringify(look)) this.robots[i].setLook(look);
      this.looks[i] = { ...look };
    });
    if (looks[0]) this.setColors(looks[0].primary, looks[0].secondary);
  }

  /**
   * Shows the club's match ball (COSMETICS kind 'ball') resting at the front of the platform, slowly turning, or
   * hides it with null. Ball maps are cached in textures.ts and shared with the match.
   */
  setBall(id: string | null): void {
    this.ballOn = !!id;
    if (!id) return;
    if (!this.ball) {
      const geo = new THREE.SphereGeometry(0.42, 48, 32);
      this.disposables.push(geo);
      this.ball = new THREE.Mesh(geo, new THREE.MeshStandardMaterial());
      this.ball.castShadow = this.gfx.quality === 'high';
      this.ball.position.set(0.05, 0.39 + 0.42, 1.0);
      this.scene.add(this.ball);
    }
    if (id === this.ballId) return;
    this.ballId = id;
    const m = ballMaps(id);
    (this.ball.material as THREE.Material).dispose();
    const mat =
      this.gfx.quality === 'low'
        ? new THREE.MeshStandardMaterial({ map: m.map, roughness: m.roughness ?? 0.36, metalness: m.metalness ?? 0 })
        : new THREE.MeshPhysicalMaterial({ map: m.map, bumpMap: m.bump, bumpScale: 1.4, roughness: m.roughness ?? 0.42, metalness: m.metalness ?? 0, clearcoat: 1, clearcoatRoughness: 0.08 });
    if (this.gfx.quality === 'low') {
      mat.envMap = this.gfx.environment();
      mat.envMapIntensity = 0.7;
    }
    if (m.emissive) {
      mat.emissive.set('#ffffff');
      mat.emissiveMap = m.emissive;
      mat.emissiveIntensity = m.emissiveIntensity ?? 1;
    }
    this.ball.material = mat;
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
    this.ring.emissiveIntensity = 1.0 + (this.reduced ? 0 : Math.sin(this.time * 2) * 0.25);
    // calm ambient motion: a slow light sweep round the platform rim and a gently swaying banner
    if (!this.reduced) {
      this.sweep.rotation.z = this.time * 0.6;
      this.bannerGrp.rotation.x = Math.sin(this.time * 0.9) * 0.05;
      this.bannerGrp.rotation.z = Math.sin(this.time * 0.6 + 1) * 0.02;
      this.water.offset.set((this.time * 0.012) % 1, (this.time * 0.007) % 1);
      this.gulls.rotation.y = this.time * 0.2;
    }
    this.sweepMat.opacity = this.reduced ? 0 : 0.55 + Math.sin(this.time * 1.3) * 0.2;
    if (this.ball) {
      this.ball.visible = this.ballOn && !hidden;
      if (!this.reduced) this.ball.rotation.set(0.35, this.time * 0.5, 0.2);
    }
    this.applyEnvironment();
    this.gfx.renderer.toneMappingExposure = this.gfx.quality === 'low' ? 0.88 : 0.86;
    this.gfx.render(this.scene, cam);
  }

  dispose(): void {
    for (const r of this.robots) r.dispose();
    if (this.ball) (this.ball.material as THREE.Material).dispose();
    for (const d of this.disposables) d.dispose();
  }
}
