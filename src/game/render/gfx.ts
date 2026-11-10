import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Quality } from './arenaView';

export type QualitySetting = 'auto' | Quality;

/** One shared WebGL renderer for the match, garage and menu stage. */
export class Gfx {
  readonly renderer: THREE.WebGLRenderer;
  quality: Quality;
  width = 1;
  height = 1;
  contextLost = false;
  onContextRestored: (() => void) | null = null;
  onContextLost: (() => void) | null = null;
  private setting: QualitySetting;
  private slowFrames = 0;
  private frames = 0;
  private envTarget: THREE.WebGLRenderTarget | null = null;

  constructor(readonly canvas: HTMLCanvasElement, setting: QualitySetting) {
    this.setting = setting;
    this.quality = setting === 'auto' ? Gfx.guessQuality() : setting;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.quality !== 'low', powerPreference: 'high-performance', alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Filmic tone mapping keeps bright emissives (eyes, thrusters, floodlights) from clipping and gives the
    // glossy shells a soft highlight roll-off. Scenes are lit for exposure 1.0 and tune it per venue.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.applyQuality();
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      this.onContextLost?.();
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      // The prefiltered environment lived in GPU memory: rebuild it before scenes render again.
      if (this.envTarget) this.envTarget.dispose();
      this.envTarget = null;
      this.onContextRestored?.();
    });
  }

  static guessQuality(): Quality {
    const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    const cores = navigator.hardwareConcurrency ?? 4;
    if (coarse || cores <= 4) return 'medium';
    return 'high';
  }

  setQuality(setting: QualitySetting): boolean {
    const next = setting === 'auto' ? (this.setting === 'auto' ? this.quality : Gfx.guessQuality()) : setting;
    this.setting = setting;
    const changed = next !== this.quality;
    this.quality = next;
    this.applyQuality();
    return changed;
  }

  private applyQuality(): void {
    const dpr = window.devicePixelRatio || 1;
    const cap = this.quality === 'high' ? 2 : this.quality === 'medium' ? 1.5 : 1;
    this.renderer.setPixelRatio(Math.min(dpr, cap));
    this.renderer.shadowMap.enabled = this.quality === 'high';
    this.resize();
  }

  resize(): void {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
  }

  /**
   * Auto quality: if frames are consistently slow, step down one tier.
   * Returns true when the tier changed (scenes should rebuild).
   */
  reportFrame(dtMs: number): boolean {
    if (this.setting !== 'auto' || this.quality === 'low') return false;
    this.frames++;
    if (dtMs > 26) this.slowFrames++;
    if (this.frames >= 180) {
      const slow = this.slowFrames / this.frames;
      this.frames = 0;
      this.slowFrames = 0;
      if (slow > 0.5) {
        this.quality = this.quality === 'high' ? 'medium' : 'low';
        this.applyQuality();
        return true;
      }
    }
    return false;
  }

  /**
   * Prefiltered studio environment (three's RoomEnvironment through PMREM) for glossy reflections on
   * robots, goal frames and the ball. Generated once per renderer on first use and shared by every scene.
   * Returns null while the context is lost.
   */
  environment(): THREE.Texture | null {
    if (this.contextLost) return null;
    if (!this.envTarget) {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const room = new RoomEnvironment();
      this.envTarget = pmrem.fromScene(room, 0.04);
      room.dispose();
      pmrem.dispose();
    }
    return this.envTarget.texture;
  }

  /** Releases GPU resources owned by this object (the environment map). */
  dispose(): void {
    this.envTarget?.dispose();
    this.envTarget = null;
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (this.contextLost) return;
    this.renderer.render(scene, camera);
  }
}
