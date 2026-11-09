import * as THREE from 'three';
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

  constructor(readonly canvas: HTMLCanvasElement, setting: QualitySetting) {
    this.setting = setting;
    this.quality = setting === 'auto' ? Gfx.guessQuality() : setting;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.quality !== 'low', powerPreference: 'high-performance', alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.applyQuality();
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      this.onContextLost?.();
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
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

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (this.contextLost) return;
    this.renderer.render(scene, camera);
  }
}
