import * as THREE from 'three';

/** Canvas-generated textures. Everything here is original procedural art; no external image assets. */

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function shade(hex: string, amount: number): string {
  const c = new THREE.Color(hex);
  if (amount >= 0) c.lerp(new THREE.Color('#ffffff'), amount);
  else c.lerp(new THREE.Color('#000000'), -amount);
  return '#' + c.getHexString();
}

/** Relative luminance 0..1, used to pick readable number colours. */
export function luminance(hex: string): number {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

export type Expression = 'neutral' | 'happy' | 'focus' | 'wow' | 'sad' | 'blink';

const faceCache = new Map<string, THREE.Texture>();

function star(g: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fill();
}

export function drawFace(g: CanvasRenderingContext2D, W: number, H: number, face: string, exp: Expression, color: string): void {
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#1c2a3f');
  grad.addColorStop(0.45, '#0b111c');
  grad.addColorStop(1, '#05080e');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // glossy sweep
  g.fillStyle = 'rgba(255,255,255,0.07)';
  g.beginPath();
  g.ellipse(W * 0.3, H * 0.08, W * 0.5, H * 0.22, -0.2, 0, Math.PI * 2);
  g.fill();

  g.fillStyle = color;
  g.strokeStyle = color;
  g.shadowColor = color;
  g.shadowBlur = H * 0.14;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const ex = W * 0.2;
  const cy = H * 0.5;
  const cx = W / 2;
  const ew = W * 0.12;
  const eh = H * 0.34;

  const arcEye = (x: number, up: boolean) => {
    g.lineWidth = H * 0.11;
    g.beginPath();
    if (up) g.arc(x, cy + eh * 0.25, ew * 0.75, Math.PI * 1.08, Math.PI * 1.92);
    else g.arc(x, cy - eh * 0.4, ew * 0.75, Math.PI * 0.12, Math.PI * 0.88);
    g.stroke();
  };
  const lineEye = (x: number) => {
    g.lineWidth = H * 0.1;
    g.beginPath();
    g.moveTo(x - ew * 0.7, cy);
    g.lineTo(x + ew * 0.7, cy);
    g.stroke();
  };

  if (exp === 'blink') {
    lineEye(cx - ex);
    lineEye(cx + ex);
  } else if (face === 'face_visor') {
    const h = exp === 'wow' ? H * 0.3 : exp === 'focus' ? H * 0.1 : H * 0.16;
    rr(g, cx - W * 0.33, cy - h / 2 + (exp === 'sad' ? H * 0.08 : 0), W * 0.66, h, h / 2);
    if (exp === 'happy') {
      g.lineWidth = H * 0.07;
      g.beginPath();
      g.arc(cx, cy + H * 0.12, W * 0.12, Math.PI * 0.15, Math.PI * 0.85);
      g.stroke();
    }
  } else if (face === 'face_pixel') {
    const px = H * 0.11;
    const eye = (x: number) => {
      if (exp === 'happy') {
        g.fillRect(x - px * 1.5, cy - px * 0.5, px, px);
        g.fillRect(x - px * 0.5, cy - px * 1.5, px, px);
        g.fillRect(x + px * 0.5, cy - px * 0.5, px, px);
      } else if (exp === 'sad') {
        g.fillRect(x - px, cy - px * 0.2, px * 2, px);
      } else if (exp === 'wow') {
        g.fillRect(x - px * 1.5, cy - px * 2, px * 3, px * 3);
      } else {
        g.fillRect(x - px, cy - px * (exp === 'focus' ? 1 : 1.6), px * 2, px * (exp === 'focus' ? 1.4 : 2.4));
      }
    };
    eye(cx - ex);
    eye(cx + ex);
    // pixel mouth
    const my = cy + H * 0.26;
    if (exp === 'sad') {
      g.fillRect(cx - px * 1.5, my, px * 3, px * 0.8);
    } else {
      g.fillRect(cx - px * 2.5, my - px * 0.8, px, px * 0.8);
      g.fillRect(cx - px * 1.5, my, px * 3, px * 0.8);
      g.fillRect(cx + px * 1.5, my - px * 0.8, px, px * 0.8);
    }
  } else if (face === 'face_star') {
    if (exp === 'happy') {
      arcEye(cx - ex, true);
      arcEye(cx + ex, true);
    } else if (exp === 'sad') {
      arcEye(cx - ex, false);
      arcEye(cx + ex, false);
    } else {
      const r = exp === 'wow' ? H * 0.3 : exp === 'focus' ? H * 0.19 : H * 0.24;
      star(g, cx - ex, cy, r);
      star(g, cx + ex, cy, r);
    }
  } else {
    const wink = face === 'face_cheeky';
    if (exp === 'happy') {
      arcEye(cx - ex, true);
      arcEye(cx + ex, true);
    } else if (exp === 'sad') {
      arcEye(cx - ex, false);
      arcEye(cx + ex, false);
    } else if (exp === 'wow') {
      g.beginPath();
      g.ellipse(cx - ex, cy, ew * 0.75, eh * 0.62, 0, 0, Math.PI * 2);
      g.ellipse(cx + ex, cy, ew * 0.75, eh * 0.62, 0, 0, Math.PI * 2);
      g.fill();
    } else {
      const h = exp === 'focus' ? eh * 0.6 : eh;
      rr(g, cx - ex - ew / 2, cy - h / 2, ew, h, ew * 0.45);
      if (wink) arcEye(cx + ex, true);
      else rr(g, cx + ex - ew / 2, cy - h / 2, ew, h, ew * 0.45);
    }
    if (wink && exp !== 'sad') {
      g.lineWidth = H * 0.06;
      g.beginPath();
      g.arc(cx, cy + H * 0.2, W * 0.07, Math.PI * 0.1, Math.PI * 0.9);
      g.stroke();
    }
  }
  g.shadowBlur = 0;
}

export function faceTexture(face: string, exp: Expression, color: string): THREE.Texture {
  const key = `${face}|${exp}|${color}`;
  let t = faceCache.get(key);
  if (!t) {
    const [c, g] = makeCanvas(160, 80);
    drawFace(g, 160, 80, face, exp, color);
    t = tex(c);
    faceCache.set(key, t);
  }
  return t;
}

export function drawJersey(g: CanvasRenderingContext2D, W: number, H: number, pattern: string, primary: string, secondary: string, number: number): void {
  g.fillStyle = primary;
  g.fillRect(0, 0, W, H);
  g.fillStyle = secondary;
  switch (pattern) {
    case 'pattern_stripe': {
      const n = 12;
      for (let i = 0; i < n; i += 2) g.fillRect((i / n) * W + W / n / 2, 0, W / n, H);
      break;
    }
    case 'pattern_hoops':
      g.fillRect(0, H * 0.2, W, H * 0.14);
      g.fillRect(0, H * 0.52, W, H * 0.14);
      break;
    case 'pattern_chevron':
      for (const cx of [0, W / 2, W]) {
        g.beginPath();
        g.moveTo(cx - W * 0.2, H * 0.08);
        g.lineTo(cx, H * 0.36);
        g.lineTo(cx + W * 0.2, H * 0.08);
        g.lineTo(cx + W * 0.2, H * 0.24);
        g.lineTo(cx, H * 0.52);
        g.lineTo(cx - W * 0.2, H * 0.24);
        g.closePath();
        g.fill();
      }
      break;
    case 'pattern_sash':
      for (const cx of [0, W / 2, W]) {
        g.beginPath();
        g.moveTo(cx - W * 0.2, H * 0.05);
        g.lineTo(cx - W * 0.1, H * 0.05);
        g.lineTo(cx + W * 0.2, H * 0.8);
        g.lineTo(cx + W * 0.1, H * 0.8);
        g.closePath();
        g.fill();
      }
      break;
    default:
      break;
  }
  // collar and hem trim
  g.fillStyle = secondary;
  g.fillRect(0, 0, W, H * 0.07);
  g.fillRect(0, H * 0.9, W, H * 0.1);
  // numbers: front at u=0.5, back at the seam
  const light = luminance(primary) > 0.62;
  g.fillStyle = light ? '#17273E' : '#ffffff';
  g.strokeStyle = light ? 'rgba(255,255,255,0.5)' : 'rgba(23,39,62,0.55)';
  g.lineWidth = H * 0.05;
  g.font = `800 italic ${Math.round(H * 0.5)}px Kanit, "Arial Black", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const label = String(number).padStart(2, '0');
  for (const cx of [W / 2, 0, W]) {
    g.strokeText(label, cx, H * 0.47);
    g.fillText(label, cx, H * 0.47);
  }
}

const jerseyCache = new Map<string, THREE.Texture>();

export function jerseyTexture(pattern: string, primary: string, secondary: string, number: number): THREE.Texture {
  const key = `${pattern}|${primary}|${secondary}|${number}`;
  let t = jerseyCache.get(key);
  if (!t) {
    const [c, g] = makeCanvas(512, 128);
    drawJersey(g, 512, 128, pattern, primary, secondary, number);
    t = tex(c);
    t.wrapS = THREE.RepeatWrapping;
    jerseyCache.set(key, t);
  }
  return t;
}

/** Jersey numbers depend on the display font; drop cached textures once web fonts have loaded. */
export function clearJerseyCache(): void {
  for (const t of jerseyCache.values()) t.dispose();
  jerseyCache.clear();
}

let ballTex: THREE.Texture | null = null;
export function ballTexture(): THREE.Texture {
  if (ballTex) return ballTex;
  const [c, g] = makeCanvas(256, 128);
  g.fillStyle = '#fbfbf6';
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#22344f';
  const spots: [number, number][] = [
    [32, 30], [96, 20], [160, 34], [224, 22], [0, 78], [64, 70], [128, 84], [192, 72], [256, 78], [40, 116], [110, 122], [176, 114], [236, 120],
  ];
  for (const [x, y] of spots) {
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
      g.lineTo(x + Math.cos(a) * 15, y + Math.sin(a) * 11);
    }
    g.closePath();
    g.fill();
  }
  ballTex = tex(c);
  return ballTex;
}

export interface FieldPaint {
  grassA: string;
  grassB: string;
  line: string;
}

/** Striped pitch with regulation-style markings, drawn to scale (canvas spans the full field rectangle). */
export function fieldTexture(length: number, width: number, goalWidth: number, paint: FieldPaint, res: number): THREE.Texture {
  const S = res / length;
  const W = Math.round(length * S);
  const H = Math.round(width * S);
  const [c, g] = makeCanvas(W, H);
  const stripes = Math.round(length / 2.125);
  for (let i = 0; i < stripes; i++) {
    g.fillStyle = i % 2 === 0 ? paint.grassA : paint.grassB;
    g.fillRect(Math.floor((i / stripes) * W), 0, Math.ceil(W / stripes) + 1, H);
  }
  // soft mowing noise
  g.globalAlpha = 0.05;
  for (let i = 0; i < 900; i++) {
    g.fillStyle = i % 2 ? '#ffffff' : '#000000';
    g.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 5, 1.5);
  }
  g.globalAlpha = 1;
  // vignette toward the walls
  const vg = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.62);
  vg.addColorStop(0, 'rgba(255,255,255,0.06)');
  vg.addColorStop(1, 'rgba(0,20,30,0.16)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);

  g.strokeStyle = paint.line;
  g.fillStyle = paint.line;
  g.lineWidth = Math.max(2, 0.11 * S);
  const m = 0.6 * S;
  g.strokeRect(m, m, W - m * 2, H - m * 2);
  g.beginPath();
  g.moveTo(W / 2, m);
  g.lineTo(W / 2, H - m);
  g.stroke();
  g.beginPath();
  g.arc(W / 2, H / 2, 3 * S, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.arc(W / 2, H / 2, 0.22 * S, 0, Math.PI * 2);
  g.fill();
  const boxW = (goalWidth + 5) * S;
  const boxD = 5 * S;
  const smallW = (goalWidth + 1.6) * S;
  const smallD = 2 * S;
  for (const side of [0, 1]) {
    const x0 = side === 0 ? m : W - m;
    const dir = side === 0 ? 1 : -1;
    g.strokeRect(Math.min(x0, x0 + dir * boxD), H / 2 - boxW / 2, boxD, boxW);
    g.strokeRect(Math.min(x0, x0 + dir * smallD), H / 2 - smallW / 2, smallD, smallW);
    g.beginPath();
    g.arc(x0 + dir * boxD, H / 2, 2.2 * S, side === 0 ? -Math.PI / 2 : Math.PI / 2, side === 0 ? Math.PI / 2 : Math.PI * 1.5);
    g.stroke();
    g.beginPath();
    g.arc(x0 + dir * 3.6 * S, H / 2, 0.16 * S, 0, Math.PI * 2);
    g.fill();
  }
  const t = tex(c);
  t.anisotropy = 8;
  return t;
}

export function netTexture(color: string): THREE.Texture {
  const [c, g] = makeCanvas(64, 64);
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = color;
  g.lineWidth = 5;
  g.strokeRect(0, 0, 64, 64);
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function tileTexture(a: string, b: string, grout: string): THREE.Texture {
  const [c, g] = makeCanvas(128, 128);
  g.fillStyle = grout;
  g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 2; x++) {
      g.fillStyle = (x + y) % 2 ? a : b;
      g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
    }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function skyTexture(stops: [number, string][]): THREE.Texture {
  const [c, g] = makeCanvas(16, 256);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  for (const [p, col] of stops) grad.addColorStop(p, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 256);
  return tex(c);
}

/** Soft round blob used for ground shadows and glows. */
let blobTex: THREE.Texture | null = null;
export function blobTexture(): THREE.Texture {
  if (blobTex) return blobTex;
  const [c, g] = makeCanvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  blobTex = tex(c, false);
  return blobTex;
}

/** Ring decal; `dash` > 0 draws a dashed ring. */
export function ringTexture(inner: number, dash = 0): THREE.Texture {
  const [c, g] = makeCanvas(128, 128);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 64 * (1 - inner);
  if (dash > 0) g.setLineDash([dash, dash * 0.7]);
  g.beginPath();
  g.arc(64, 64, 64 * (1 + inner) * 0.5 - 1, 0, Math.PI * 2);
  g.stroke();
  return tex(c, false);
}

export function windowsTexture(base: string, lit: string): THREE.Texture {
  const [c, g] = makeCanvas(64, 128);
  g.fillStyle = base;
  g.fillRect(0, 0, 64, 128);
  for (let y = 4; y < 124; y += 10)
    for (let x = 4; x < 60; x += 10) {
      if (Math.random() < 0.55) {
        g.fillStyle = lit;
        g.globalAlpha = 0.5 + Math.random() * 0.5;
        g.fillRect(x, y, 6, 6);
      }
    }
  g.globalAlpha = 1;
  return tex(c);
}

export function labelTexture(text: string, fg: string, bg: string): THREE.Texture {
  const [c, g] = makeCanvas(512, 96);
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(0, 0, 512, 96, 20);
  g.fill();
  g.fillStyle = fg;
  let size = 54;
  g.font = `800 italic ${size}px Kanit, "Arial Black", sans-serif`;
  const tw = g.measureText(text.toUpperCase()).width;
  if (tw > 460) {
    size = Math.floor((size * 460) / tw);
    g.font = `800 italic ${size}px Kanit, "Arial Black", sans-serif`;
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text.toUpperCase(), 256, 52);
  return tex(c);
}
