import * as THREE from 'three';
import type { ArenaDef } from '../../content/arenas';
import { makeCanvas } from './textures';

/**
 * Procedural surface art for the arenas: the pitch and its markings, the floor around each venue, water,
 * brick, the city under the rooftop and the big screens. Everything is drawn on canvases at run time (no
 * image assets). Tileable canvases are cached; the textures made from them belong to the caller.
 */

/** Deterministic pseudo-random sequence (mulberry32) so venues look the same every match. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const canvases = new Map<string, HTMLCanvasElement>();
function cachedCanvas(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): HTMLCanvasElement {
  let c = canvases.get(key);
  if (!c) {
    const made = makeCanvas(w, h);
    c = made[0];
    draw(made[1], w, h);
    canvases.set(key, c);
  }
  return c;
}

function tex(c: HTMLCanvasElement, repeat = false, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Draws `fn` at every wrapped copy of (x, y) so marks that cross a tile edge stay seamless. */
function wrapped(n: number, x: number, y: number, r: number, fn: (x: number, y: number) => void): void {
  for (const ox of x < r ? [0, n] : x > n - r ? [0, -n] : [0])
    for (const oy of y < r ? [0, n] : y > n - r ? [0, -n] : [0]) fn(x + ox, y + oy);
}

// ------------------------------------------------------------------ pitch

export type Mow = 'stripes' | 'bands' | 'checker' | 'diamond';
export type Emblem = 'wave' | 'cog' | 'towers' | 'star';

export interface PitchPaint {
  a: string;
  b: string;
  line: string;
  mow: Mow;
  emblem: Emblem;
}

/**
 * Pitch markings in field units (origin at the centre spot): `[0, x1, z1, x2, z2]` is a line,
 * `[1, cx, cz, r, a0, a1]` an arc and `[2, cx, cz, r]` a filled spot. The boundary line runs 0.6 inside the
 * walls and follows the corner cuts, so it shows the real playing area.
 */
export function pitchMarks(a: ArenaDef): number[][] {
  const m = 0.6;
  const bx = a.length / 2 - m;
  const bz = a.width / 2 - m;
  const k = a.corner + m * (Math.SQRT2 - 1);
  const dx = a.length / 2 - k;
  const dz = a.width / 2 - k;
  const out: number[][] = [[0, 0, -bz, 0, bz], [1, 0, 0, 3, 0, Math.PI * 2], [2, 0, 0, 0.22]];
  const bw = (a.goalWidth + 5) / 2;
  const sw = (a.goalWidth + 1.6) / 2;
  for (const s of [-1, 1]) {
    out.push([0, -dx, s * bz, dx, s * bz], [0, s * bx, -dz, s * bx, dz]);
    for (const t of [-1, 1]) out.push([0, s * dx, t * bz, s * bx, t * dz]);
    const x0 = s * bx;
    for (const [d, w] of [[5, bw], [2, sw]]) {
      const x1 = s * (bx - d);
      out.push([0, x0, -w, x1, -w], [0, x1, -w, x1, w], [0, x1, w, x0, w]);
    }
    out.push([1, s * (bx - 5), 0, 2.2, s < 0 ? -Math.PI / 2 : Math.PI / 2, s < 0 ? Math.PI / 2 : Math.PI * 1.5], [2, s * (bx - 3.6), 0, 0.16]);
  }
  return out;
}

function paintMarks(g: CanvasRenderingContext2D, marks: number[][], S: number, hx: number, hz: number, lw: number, color: string, alpha: number): void {
  g.save();
  g.globalAlpha = alpha;
  g.strokeStyle = g.fillStyle = color;
  g.lineWidth = lw;
  g.lineCap = 'square';
  g.translate(hx * S, hz * S);
  for (const m of marks) {
    g.beginPath();
    if (m[0] === 0) {
      g.moveTo(m[1] * S, m[2] * S);
      g.lineTo(m[3] * S, m[4] * S);
      g.stroke();
    } else if (m[0] === 1) {
      g.arc(m[1] * S, m[2] * S, m[3] * S, m[4], m[5]);
      g.stroke();
    } else {
      g.arc(m[1] * S, m[2] * S, m[3] * S + (lw - Math.max(2, 0.11 * S)) / 2, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
}

/** Flat geometry (in the XZ plane, facing up) for the pitch markings: crisp at any resolution. */
export function markGeometry(marks: number[][], w: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const v = (x: number, z: number) => pos.push(x, 0, z) / 3 - 1;
  const tri = (a: number, b: number, c: number) => {
    const ax = pos[a * 3];
    const az = pos[a * 3 + 2];
    // keep every triangle wound to face +y
    if ((pos[b * 3 + 2] - az) * (pos[c * 3] - ax) - (pos[b * 3] - ax) * (pos[c * 3 + 2] - az) > 0) idx.push(a, b, c);
    else idx.push(a, c, b);
  };
  const h = w / 2;
  for (const m of marks) {
    if (m[0] === 0) {
      const dx = m[3] - m[1];
      const dz = m[4] - m[2];
      const l = Math.hypot(dx, dz) || 1;
      const ux = (dx / l) * h;
      const uz = (dz / l) * h;
      const a = v(m[1] - ux + uz, m[2] - uz - ux);
      const b = v(m[1] - ux - uz, m[2] - uz + ux);
      const c = v(m[3] + ux - uz, m[4] + uz + ux);
      const d = v(m[3] + ux + uz, m[4] + uz - ux);
      tri(a, b, c);
      tri(a, c, d);
    } else if (m[0] === 1) {
      const n = Math.max(8, Math.ceil(Math.abs(m[5] - m[4]) * 10));
      let pa = -1;
      let pb = -1;
      for (let i = 0; i <= n; i++) {
        const t = m[4] + ((m[5] - m[4]) * i) / n;
        const a = v(m[1] + Math.cos(t) * (m[3] - h), m[2] + Math.sin(t) * (m[3] - h));
        const b = v(m[1] + Math.cos(t) * (m[3] + h), m[2] + Math.sin(t) * (m[3] + h));
        if (i) {
          tri(pa, pb, b);
          tri(pa, b, a);
        }
        pa = a;
        pb = b;
      }
    } else {
      const c = v(m[1], m[2]);
      let p = -1;
      for (let i = 0; i <= 14; i++) {
        const t = (i / 14) * Math.PI * 2;
        const q = v(m[1] + Math.cos(t) * m[3], m[2] + Math.sin(t) * m[3]);
        if (i) tri(c, p, q);
        p = q;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const nor = new Float32Array(pos.length);
  for (let i = 1; i < nor.length; i += 3) nor[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/** Small tileable blade noise laid over the pitch colours. */
function turfNoise(): HTMLCanvasElement {
  return cachedCanvas('turf', 256, 256, (g, N) => {
    const rnd = seededRandom(91);
    g.fillStyle = 'rgb(128,128,128)';
    g.fillRect(0, 0, N, N);
    for (let i = 0; i < 5200; i++) {
      const v = Math.floor(70 + rnd() * 120);
      g.fillStyle = `rgb(${v},${v},${v})`;
      const x = rnd() * N;
      const y = rnd() * N;
      const len = 2 + rnd() * 5;
      g.fillRect(x, y, 1, len);
      if (y + len > N) g.fillRect(x, y - N, 1, len);
    }
    for (let i = 0; i < 60; i++) {
      const r = 6 + rnd() * 18;
      const dark = rnd() < 0.5;
      wrapped(N, rnd() * N, rnd() * N, r, (x, y) => {
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, dark ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)');
        grad.addColorStop(1, 'rgba(128,128,128,0)');
        g.fillStyle = grad;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      });
    }
  });
}

function emblem(g: CanvasRenderingContext2D, kind: Emblem, R: number): void {
  g.beginPath();
  if (kind === 'wave') {
    // three rolling waves
    g.lineWidth = R * 0.17;
    g.lineCap = 'round';
    for (let k = -1; k <= 1; k++) {
      const w = R * (k === 0 ? 0.92 : 0.7);
      g.beginPath();
      for (let i = 0; i <= 40; i++) {
        const x = -w + (2 * w * i) / 40;
        const y = k * R * 0.45 + Math.sin((i / 40) * Math.PI * 3 + k) * R * 0.13;
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.stroke();
    }
    return;
  }
  if (kind === 'cog') {
    const teeth = 10;
    for (let i = 0; i < teeth * 4; i++) {
      const a = (i / (teeth * 4)) * Math.PI * 2;
      const r = i % 4 < 2 ? R : R * 0.78;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.moveTo(R * 0.4, 0);
    g.arc(0, 0, R * 0.4, 0, Math.PI * 2, true);
    g.fill('evenodd');
    return;
  }
  if (kind === 'towers') {
    const hs = [0.75, 1.3, 1.0, 1.6, 0.85];
    const w = R * 0.3;
    hs.forEach((h, i) => g.rect((i - 2.5) * (w + R * 0.06) + R * 0.03, R * 0.72 - h * R * 0.9, w, h * R * 0.9));
    g.rect(-R, R * 0.72, R * 2, R * 0.1);
    g.fill();
    return;
  }
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const r = i % 2 ? R * 0.44 : R;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
}

/**
 * The pitch, drawn to scale (the canvas spans the whole field rectangle): mowing pattern, blade noise, a
 * tone-on-tone club emblem in the centre circle, light wear in the goalmouths and a soft vignette toward the
 * walls. The markings are painted in when `lines` is set; otherwise only their soft bleed is drawn and the
 * view lays crisp geometry over it.
 */
export function pitchTexture(arena: ArenaDef, p: PitchPaint, res: number, lines: boolean): THREE.Texture {
  const S = res / arena.length;
  const W = res;
  const H = Math.round(arena.width * S);
  const [c, g] = makeCanvas(W, H);
  g.fillStyle = p.a;
  g.fillRect(0, 0, W, H);
  g.fillStyle = p.b;
  const sheen = (x: number, y: number, w: number, h: number, lit: boolean, across: boolean) => {
    const sh = across ? g.createLinearGradient(0, y, 0, y + h) : g.createLinearGradient(x, 0, x + w, 0);
    sh.addColorStop(0, lit ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)');
    sh.addColorStop(0.5, 'rgba(255,255,255,0)');
    sh.addColorStop(1, lit ? 'rgba(0,0,0,0.025)' : 'rgba(255,255,255,0.025)');
    g.fillStyle = sh;
    g.fillRect(x, y, w, h);
    g.fillStyle = p.b;
  };
  if (p.mow === 'stripes' || p.mow === 'bands') {
    const across = p.mow === 'bands';
    const n = Math.round((across ? arena.width : arena.length) / 2.13);
    const full = across ? H : W;
    for (let i = 0; i < n; i++) {
      const a0 = Math.floor((i / n) * full);
      const a1 = Math.floor(((i + 1) / n) * full);
      const x = across ? 0 : a0;
      const y = across ? a0 : 0;
      const w = across ? W : a1 - a0;
      const h = across ? a1 - a0 : H;
      if (i % 2) g.fillRect(x, y, w, h);
      sheen(x, y, w, h, i % 2 === 0, across);
    }
  } else if (p.mow === 'checker') {
    const nx = Math.round(arena.length / 2.6);
    const nz = Math.round(arena.width / 2.6);
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++) {
        const x = Math.floor((i / nx) * W);
        const y = Math.floor((j / nz) * H);
        const w = Math.floor(((i + 1) / nx) * W) - x;
        const h = Math.floor(((j + 1) / nz) * H) - y;
        if ((i + j) % 2) g.fillRect(x, y, w, h);
        sheen(x, y, w, h, (i + j) % 2 === 0, false);
      }
  } else {
    // criss-cross cut: two sets of diagonal passes that overlap into diamonds
    const d = 2.2 * S;
    g.globalAlpha = 0.62;
    for (const dir of [1, -1]) {
      g.save();
      g.translate(W / 2, H / 2);
      g.rotate((dir * Math.PI) / 4);
      for (let x = -W; x < W; x += d * 2) g.fillRect(x - d / 2, -W, d, W * 2);
      g.restore();
    }
    g.globalAlpha = 1;
  }
  const pat = g.createPattern(turfNoise(), 'repeat');
  if (pat) {
    g.save();
    g.globalCompositeOperation = 'overlay';
    g.globalAlpha = 0.3;
    g.fillStyle = pat;
    g.fillRect(0, 0, W, H);
    g.restore();
  }
  // club emblem inside the centre circle
  g.save();
  g.translate(W / 2, H / 2);
  g.fillStyle = g.strokeStyle = 'rgba(255,255,255,0.1)';
  emblem(g, p.emblem, 1.75 * S);
  g.restore();
  // wear: goalmouths and centre spot are a touch paler
  const wear = (x: number, y: number, rx: number, ry: number, a: number) => {
    g.save();
    g.translate(x, y);
    g.scale(1, ry / rx);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    grad.addColorStop(0, `rgba(222,214,170,${a})`);
    grad.addColorStop(1, 'rgba(222,214,170,0)');
    g.fillStyle = grad;
    g.fillRect(-rx, -rx, rx * 2, rx * 2);
    g.restore();
  };
  wear(W / 2, H / 2, 1.2 * S, 1.2 * S, 0.06);
  wear(1.6 * S, H / 2, 2.2 * S, (arena.goalWidth / 2) * S, 0.11);
  wear(W - 1.6 * S, H / 2, 2.2 * S, (arena.goalWidth / 2) * S, 0.11);
  const vg = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.62);
  vg.addColorStop(0, 'rgba(255,255,255,0.05)');
  vg.addColorStop(1, 'rgba(0,20,30,0.2)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);
  const marks = pitchMarks(arena);
  const lw = Math.max(2, 0.11 * S);
  paintMarks(g, marks, S, arena.length / 2, arena.width / 2, lw * 2.4, p.line, 0.09);
  if (lines) paintMarks(g, marks, S, arena.length / 2, arena.width / 2, lw, p.line, 0.94);
  return tex(c);
}

/** Tileable normal map of short turf blades: gives the pitch a soft nap under the key light. */
export function turfNormalTexture(): THREE.Texture {
  const c = cachedCanvas('turfN', 256, 256, (g, N) => {
    const rnd = seededRandom(17);
    const h = new Float32Array(N * N);
    for (let i = 0; i < 9000; i++) {
      const x = Math.floor(rnd() * N);
      const y = Math.floor(rnd() * N);
      const len = 2 + Math.floor(rnd() * 5);
      const v = 0.4 + rnd() * 0.6;
      for (let k = 0; k < len; k++) h[((y + k) % N) * N + x] += v * (1 - k / len);
    }
    const img = g.createImageData(N, N);
    const at = (x: number, y: number) => h[((y + N) % N) * N + ((x + N) % N)];
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const dx = (at(x + 1, y) - at(x - 1, y)) * 0.9;
        const dy = (at(x, y + 1) - at(x, y - 1)) * 0.9;
        const l = Math.hypot(dx, dy, 1);
        const o = (y * N + x) * 4;
        img.data[o] = 128 - (dx / l) * 127;
        img.data[o + 1] = 128 + (dy / l) * 127;
        img.data[o + 2] = 128 + (1 / l) * 127;
        img.data[o + 3] = 255;
      }
    g.putImageData(img, 0, 0);
  });
  return tex(c, true, false);
}

// ------------------------------------------------------------------ floors and walls

export type FloorKind = 'planks' | 'plate' | 'pavers' | 'polish' | 'terrace';

/** Tileable ground around a venue; one repeat covers 4 x 4 world units. */
export function floorTexture(kind: FloorKind): THREE.Texture {
  const c = cachedCanvas('floor_' + kind, 512, 512, (g, N) => {
    const rnd = seededRandom(kind.length * 977 + kind.charCodeAt(1));
    const speck = (n: number, a: number, s = 2) => {
      for (let i = 0; i < n; i++) {
        g.fillStyle = rnd() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`;
        g.fillRect(rnd() * N, rnd() * N, 1 + rnd() * s, 1 + rnd() * s);
      }
    };
    if (kind === 'planks') {
      // sun-bleached boardwalk: boards run along v with staggered butt joints
      const n = 12;
      const bw = N / n;
      const tones = ['#c9ab7c', '#c2a172', '#d2b688', '#bd9c6e', '#cdb083'];
      for (let i = 0; i < n; i++) {
        const x = i * bw;
        let y = -rnd() * N;
        while (y < N) {
          const len = N * (0.45 + rnd() * 0.5);
          g.fillStyle = tones[Math.floor(rnd() * tones.length)];
          g.fillRect(x, y, bw, len);
          g.fillStyle = 'rgba(70,45,20,0.5)';
          g.fillRect(x, y, bw, 2);
          g.fillStyle = 'rgba(60,40,20,0.55)';
          for (const nx of [0.22, 0.78]) g.fillRect(x + bw * nx - 1, y + 6, 2, 2);
          y += len;
        }
        for (let k = 0; k < 9; k++) {
          g.fillStyle = rnd() < 0.5 ? 'rgba(90,60,25,0.07)' : 'rgba(255,245,220,0.08)';
          g.fillRect(x + 3 + rnd() * (bw - 6), 0, 1, N);
        }
        g.fillStyle = 'rgba(64,42,20,0.6)';
        g.fillRect(x, 0, 2, N);
        g.fillStyle = 'rgba(255,250,235,0.16)';
        g.fillRect(x + 2, 0, 1, N);
      }
      speck(500, 0.03);
    } else if (kind === 'plate') {
      // foundry floor: worn steel plates with tread, rivets and oil stains
      for (let j = 0; j < 2; j++)
        for (let i = 0; i < 2; i++) {
          const v = 70 + Math.floor(rnd() * 8);
          g.fillStyle = `rgb(${v + 3},${v + 1},${v})`;
          g.fillRect(i * 256, j * 256, 256, 256);
        }
      g.lineWidth = 2;
      g.lineCap = 'round';
      for (let y = 8; y < N; y += 16)
        for (let x = 8; x < N; x += 16) {
          const d = ((x + y) / 16) % 2 ? 4 : -4;
          g.strokeStyle = 'rgba(255,240,220,0.055)';
          g.beginPath();
          g.moveTo(x - 4, y - d);
          g.lineTo(x + 4, y + d);
          g.stroke();
        }
      for (let i = 0; i < 16; i++) {
        const r = 18 + rnd() * 46;
        wrapped(N, rnd() * N, rnd() * N, r, (x, y) => {
          const grad = g.createRadialGradient(x, y, 0, x, y, r);
          grad.addColorStop(0, 'rgba(0,0,0,0.16)');
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = grad;
          g.fillRect(x - r, y - r, r * 2, r * 2);
        });
      }
      for (let k = 0; k < 2; k++) {
        g.fillStyle = 'rgba(0,0,0,0.5)';
        g.fillRect(k * 256, 0, 3, N);
        g.fillRect(0, k * 256, N, 3);
        g.fillStyle = 'rgba(255,235,210,0.1)';
        g.fillRect(k * 256 + 3, 0, 1, N);
        g.fillRect(0, k * 256 + 3, N, 1);
      }
      g.fillStyle = 'rgba(190,180,170,0.5)';
      for (let j = 0; j < 4; j++)
        for (let i = 0; i < 4; i++) {
          g.beginPath();
          g.arc(i * 128 + (i % 2 ? -14 : 14), j * 128 + (j % 2 ? -14 : 14), 3, 0, Math.PI * 2);
          g.fill();
        }
      speck(900, 0.035);
    } else if (kind === 'pavers') {
      // rooftop: slate pavers, one per world unit
      for (let j = 0; j < 4; j++)
        for (let i = 0; i < 4; i++) {
          const v = rnd() * 10 - 5;
          g.fillStyle = `rgb(${88 + v},${92 + v},${120 + v})`;
          g.fillRect(i * 128, j * 128, 128, 128);
          g.fillStyle = 'rgba(255,255,255,0.05)';
          g.fillRect(i * 128 + 2, j * 128 + 2, 124, 3);
          g.fillStyle = 'rgba(20,18,40,0.55)';
          g.fillRect(i * 128, j * 128, 128, 2);
          g.fillRect(i * 128, j * 128, 2, 128);
        }
      speck(1800, 0.04);
    } else if (kind === 'polish') {
      // indoor concourse: large dark tiles with a faint sheen and a gold inlay line
      for (let j = 0; j < 2; j++)
        for (let i = 0; i < 2; i++) {
          g.fillStyle = (i + j) % 2 ? '#1c2a4f' : '#182446';
          g.fillRect(i * 256, j * 256, 256, 256);
          const sh = g.createLinearGradient(i * 256, j * 256, i * 256 + 256, j * 256 + 256);
          sh.addColorStop(0, 'rgba(255,255,255,0.05)');
          sh.addColorStop(0.5, 'rgba(255,255,255,0)');
          sh.addColorStop(1, 'rgba(0,0,0,0.06)');
          g.fillStyle = sh;
          g.fillRect(i * 256, j * 256, 256, 256);
        }
      g.fillStyle = 'rgba(120,150,220,0.22)';
      for (let k = 0; k < 2; k++) {
        g.fillRect(k * 256, 0, 2, N);
        g.fillRect(0, k * 256, N, 2);
      }
      g.fillStyle = 'rgba(246,197,66,0.35)';
      g.fillRect(0, 0, N, 2);
      g.fillRect(0, 0, 2, N);
      speck(500, 0.03, 1);
    } else {
      // clubhouse terrace: warm stone slabs in a staggered bond
      g.fillStyle = '#cfc2ad';
      g.fillRect(0, 0, N, N);
      for (let j = 0; j < 4; j++)
        for (let i = -1; i < 2; i++) {
          const x = i * 256 + (j % 2 ? 128 : 0);
          const v = rnd() * 10 - 5;
          g.fillStyle = `rgb(${236 + v},${228 + v},${212 + v})`;
          g.fillRect(x + 3, j * 128 + 3, 250, 122);
          g.fillStyle = 'rgba(255,255,255,0.3)';
          g.fillRect(x + 3, j * 128 + 3, 250, 3);
          g.fillStyle = 'rgba(120,100,70,0.12)';
          g.fillRect(x + 3, j * 128 + 121, 250, 4);
        }
      speck(1400, 0.03);
    }
  });
  return tex(c, true);
}

/** Tileable running-bond brickwork; one repeat covers 2 x 2 world units. */
export function brickTexture(): THREE.Texture {
  const c = cachedCanvas('brick', 256, 256, (g, N) => {
    const rnd = seededRandom(404);
    g.fillStyle = '#3a2823';
    g.fillRect(0, 0, N, N);
    for (let j = 0; j < 8; j++)
      for (let i = -1; i < 4; i++) {
        const v = rnd() * 26 - 13;
        g.fillStyle = `rgb(${150 + v},${78 + v * 0.6},${56 + v * 0.5})`;
        g.fillRect(i * 64 + (j % 2 ? 32 : 0) + 2, j * 32 + 2, 60, 28);
        g.fillStyle = 'rgba(255,220,190,0.1)';
        g.fillRect(i * 64 + (j % 2 ? 32 : 0) + 2, j * 32 + 2, 60, 3);
      }
  });
  return tex(c, true);
}

/** Tileable sea surface: light ripples and darker troughs, meant to be tinted by the material. */
export function waterTexture(): THREE.Texture {
  const c = cachedCanvas('water', 256, 256, (g, N) => {
    const rnd = seededRandom(33);
    g.fillStyle = 'rgb(206,226,236)';
    g.fillRect(0, 0, N, N);
    for (let i = 0; i < 26; i++) {
      const r = 20 + rnd() * 40;
      wrapped(N, rnd() * N, rnd() * N, r, (x, y) => {
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, 'rgba(120,170,205,0.35)');
        grad.addColorStop(1, 'rgba(120,170,205,0)');
        g.fillStyle = grad;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      });
    }
    g.lineCap = 'round';
    for (let i = 0; i < 90; i++) {
      const w = 8 + rnd() * 22;
      const bend = (rnd() - 0.5) * 5;
      g.strokeStyle = `rgba(255,255,255,${0.35 + rnd() * 0.5})`;
      g.lineWidth = 1 + rnd() * 1.6;
      wrapped(N, rnd() * N, rnd() * N, w, (x, y) => {
        g.beginPath();
        g.moveTo(x - w / 2, y);
        g.quadraticCurveTo(x, y + bend, x + w / 2, y);
        g.stroke();
      });
    }
  });
  return tex(c, true);
}

/** Tileable night city seen from above: blocks, lit windows and streets with traffic lights. */
export function cityTexture(): THREE.Texture {
  const c = cachedCanvas('city', 512, 512, (g, N) => {
    const rnd = seededRandom(2077);
    g.fillStyle = '#17132f';
    g.fillRect(0, 0, N, N);
    const lights = ['#ffd27a', '#ffd27a', '#ffe9b8', '#ff7ad9', '#7fe9ff'];
    for (let j = 0; j < 4; j++)
      for (let i = 0; i < 4; i++) {
        const x0 = i * 128 + 14;
        const y0 = j * 128 + 14;
        g.fillStyle = ['#2a2552', '#241f48', '#30295c'][Math.floor(rnd() * 3)];
        g.fillRect(x0, y0, 100, 100);
        // a few roofs per block
        for (let k = 0; k < 5; k++) {
          const w = 18 + rnd() * 34;
          const h = 18 + rnd() * 34;
          const x = x0 + rnd() * (100 - w);
          const y = y0 + rnd() * (100 - h);
          g.fillStyle = `rgba(${70 + rnd() * 40},${62 + rnd() * 30},${120 + rnd() * 40},0.9)`;
          g.fillRect(x, y, w, h);
          g.fillStyle = lights[Math.floor(rnd() * lights.length)];
          g.globalAlpha = 0.5 + rnd() * 0.5;
          for (let q = 0; q < 6; q++) g.fillRect(x + 2 + rnd() * (w - 5), y + h - 4 - rnd() * 3, 3, 3);
          g.globalAlpha = 1;
        }
      }
    // streets: warm lamps and a few head / tail lights
    for (let k = 0; k < 4; k++)
      for (let t = 6; t < N; t += 16) {
        g.fillStyle = rnd() < 0.7 ? 'rgba(255,214,140,0.85)' : rnd() < 0.5 ? 'rgba(255,90,90,0.9)' : 'rgba(255,255,255,0.9)';
        g.fillRect(k * 128 + 5, t, 3, 3);
        g.fillStyle = rnd() < 0.7 ? 'rgba(255,214,140,0.85)' : 'rgba(255,90,90,0.9)';
        g.fillRect(t, k * 128 + 5, 3, 3);
      }
  });
  return tex(c, true);
}

/** Big-screen graphic for the final venue: league mark, a star and the two clubs' colours. */
export function screenTexture(teamColors: [string, string], title: string): THREE.Texture {
  const [c, g] = makeCanvas(256, 128);
  g.fillStyle = '#0c1630';
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = teamColors[0];
  g.fillRect(0, 0, 26, 128);
  g.fillStyle = teamColors[1];
  g.fillRect(230, 0, 26, 128);
  g.fillStyle = '#f6c542';
  g.save();
  g.translate(128, 40);
  emblem(g, 'star', 26);
  g.restore();
  g.fillRect(48, 76, 160, 3);
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = 30;
  do {
    g.font = `800 italic ${size}px Kanit, "Arial Black", sans-serif`;
    size -= 2;
  } while (g.measureText(title).width > 172 && size > 10);
  g.fillText(title, 128, 102);
  g.fillStyle = 'rgba(0,0,0,0.28)';
  for (let x = 0; x < 256; x += 4) g.fillRect(x, 0, 1, 128);
  for (let y = 0; y < 128; y += 4) g.fillRect(0, y, 256, 1);
  return tex(c);
}
