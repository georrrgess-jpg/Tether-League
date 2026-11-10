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

/**
 * Cache lookup with least-recently-used eviction: new club colours, numbers and expressions would otherwise
 * keep adding GPU textures for the whole session. An evicted texture still referenced by a material is simply
 * uploaded again by three.js the next time it is drawn.
 */
function cached(cache: Map<string, THREE.Texture>, key: string, cap: number, make: () => THREE.Texture): THREE.Texture {
  let t = cache.get(key);
  if (t) {
    cache.delete(key);
    cache.set(key, t);
    return t;
  }
  t = make();
  cache.set(key, t);
  while (cache.size > cap) {
    const [oldKey, old] = cache.entries().next().value as [string, THREE.Texture];
    cache.delete(oldKey);
    old.dispose();
  }
  return t;
}

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
  // 512 x 256 keeps the eyes crisp on the menu podium close-ups.
  return cached(faceCache, `${face}|${exp}|${color}`, 48, () => {
    const [c, g] = makeCanvas(512, 256);
    drawFace(g, 512, 256, face, exp, color);
    return tex(c);
  });
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
  // side panels with piping (u = 0.25 / 0.75 are the flanks)
  for (const cx of [W * 0.25, W * 0.75]) {
    const grad = g.createLinearGradient(cx - W * 0.06, 0, cx + W * 0.06, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.5, 'rgba(0,0,0,0.16)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(cx - W * 0.06, 0, W * 0.12, H);
    g.fillStyle = secondary;
    g.fillRect(cx - W * 0.004, H * 0.07, W * 0.008, H * 0.83);
  }
  // fabric shading: lighter across the chest, darker toward the hem
  const fab = g.createLinearGradient(0, 0, 0, H);
  fab.addColorStop(0, 'rgba(255,255,255,0.10)');
  fab.addColorStop(0.45, 'rgba(255,255,255,0)');
  fab.addColorStop(1, 'rgba(0,0,0,0.16)');
  g.fillStyle = fab;
  g.fillRect(0, 0, W, H);
  // collar and hem trim
  g.fillStyle = secondary;
  g.fillRect(0, 0, W, H * 0.07);
  g.fillRect(0, H * 0.9, W, H * 0.1);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(0, H * 0.07, W, H * 0.012);
  g.fillRect(0, H * 0.888, W, H * 0.012);
  // numbers: front at u=0.5, back at the seam; bold outline keeps them readable from the match camera
  // Navy ink from mid-light colours up (Sun Yellow, Mint, Chrome, Ivory): white ink on them read poorly even
  // with the outline. Luminance here is linear, so 0.45 sits around sRGB mid-grey 0.7.
  const light = luminance(primary) > 0.45;
  const ink = light ? '#17273E' : '#ffffff';
  const rim = light ? 'rgba(255,255,255,0.75)' : 'rgba(15,26,44,0.85)';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  const label = String(number).padStart(2, '0');
  // The back number sits higher and a little smaller, above the robot's jet pack.
  for (const [cx, cy, size] of [[W / 2, 0.48, 0.56], [0, 0.33, 0.4], [W, 0.33, 0.4]] as [number, number, number][]) {
    g.font = `800 italic ${Math.round(H * size)}px Kanit, "Arial Black", sans-serif`;
    g.strokeStyle = rim;
    g.lineWidth = H * size * 0.15;
    g.strokeText(label, cx, H * cy);
    g.fillStyle = ink;
    g.fillText(label, cx, H * cy);
  }
}

const jerseyCache = new Map<string, THREE.Texture>();

export function jerseyTexture(pattern: string, primary: string, secondary: string, number: number): THREE.Texture {
  return cached(jerseyCache, `${pattern}|${primary}|${secondary}|${number}`, 24, () => {
    const [c, g] = makeCanvas(1024, 256);
    drawJersey(g, 1024, 256, pattern, primary, secondary, number);
    const t = tex(c);
    t.wrapS = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  });
}

/** Jersey numbers depend on the display font; drop cached textures once web fonts have loaded. */
export function clearJerseyCache(): void {
  for (const t of jerseyCache.values()) t.dispose();
  jerseyCache.clear();
}

let ballCache: { map: THREE.Texture; bump: THREE.Texture } | null = null;

/**
 * Panelled match ball, computed on the sphere so panels are not stretched at the poles: every pixel of an
 * equirectangular map is assigned to the nearest of 12 pentagon centres (icosahedron vertices) or
 * 20 hexagon centres (face centres), giving the classic 32-panel ball. Seams and a little panel "puff"
 * shading come from the distance to the nearest neighbouring panel. A matching bump map adds seam depth.
 */
export function ballMaps(): { map: THREE.Texture; bump: THREE.Texture } {
  if (ballCache) return ballCache;
  const W = 1024;
  const H = 512;
  const t = (1 + Math.sqrt(5)) / 2;
  const verts: number[][] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map((v) => {
    const l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
  });
  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  const centers: number[][] = [...verts];
  for (const f of faces) {
    const x = verts[f[0]][0] + verts[f[1]][0] + verts[f[2]][0];
    const y = verts[f[0]][1] + verts[f[1]][1] + verts[f[2]][1];
    const z = verts[f[0]][2] + verts[f[1]][2] + verts[f[2]][2];
    const l = Math.hypot(x, y, z);
    centers.push([x / l, y / l, z / l]);
  }
  // Pentagons are smaller than hexagons on a real ball: weight their distance up a little.
  const weight = centers.map((_, i) => (i < 12 ? 1.16 : 1));
  const [mc, mg] = makeCanvas(W, H);
  const [bc, bg] = makeCanvas(W, H);
  const img = mg.createImageData(W, H);
  const bump = bg.createImageData(W, H);
  const white = [247, 248, 244];
  const navy = [26, 40, 66];
  const accent = [18, 188, 210];
  const seam = [196, 201, 208];
  for (let py = 0; py < H; py++) {
    const theta = ((py + 0.5) / H) * Math.PI;
    const st = Math.sin(theta);
    const y = Math.cos(theta);
    for (let px = 0; px < W; px++) {
      const phi = ((px + 0.5) / W) * Math.PI * 2;
      const x = -Math.cos(phi) * st;
      const z = Math.sin(phi) * st;
      let d1 = 9;
      let d2 = 9;
      let i1 = 0;
      for (let i = 0; i < 32; i++) {
        const c = centers[i];
        const dot = x * c[0] + y * c[1] + z * c[2];
        const d = Math.acos(Math.max(-1, Math.min(1, dot))) * weight[i];
        if (d < d1) {
          d2 = d1;
          d1 = d;
          i1 = i;
        } else if (d < d2) d2 = d;
      }
      const edge = d2 - d1; // angular distance to the panel boundary (approx.)
      const seamW = 0.018;
      const panel = i1 < 12 ? navy : i1 === 12 || i1 === 25 ? accent : white;
      // Anti-aliased seam: blend panel and seam colour across about one texel either side of the edge.
      const k = Math.max(0, Math.min(1, (edge - seamW * 0.55) / (seamW * 0.9)));
      const blend = k * k * (3 - 2 * k);
      // Panels bulge slightly: darker toward the seams.
      const puff = (1 - 0.13 * Math.exp(-Math.max(0, edge - seamW) / 0.05)) * (0.82 + 0.18 * blend);
      const o = (py * W + px) * 4;
      img.data[o] = (seam[0] + (panel[0] - seam[0]) * blend) * puff;
      img.data[o + 1] = (seam[1] + (panel[1] - seam[1]) * blend) * puff;
      img.data[o + 2] = (seam[2] + (panel[2] - seam[2]) * blend) * puff;
      img.data[o + 3] = 255;
      const h = 40 + blend * Math.min(215, 100 + Math.max(0, edge - seamW) * 1400);
      bump.data[o] = bump.data[o + 1] = bump.data[o + 2] = h;
      bump.data[o + 3] = 255;
    }
  }
  mg.putImageData(img, 0, 0);
  bg.putImageData(bump, 0, 0);
  const map = tex(mc);
  map.anisotropy = 8;
  const bumpTex = tex(bc, false);
  ballCache = { map, bump: bumpTex };
  return ballCache;
}

export interface FieldPaint {
  grassA: string;
  grassB: string;
  line: string;
}

/** Deterministic pseudo-random sequence for repeatable procedural art. */
function seeded(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 100000) / 100000;
  };
}

let grassTile: HTMLCanvasElement | null = null;
/** Small tileable grass-blade noise used as an overlay on the pitch. */
function grassNoise(): HTMLCanvasElement {
  if (grassTile) return grassTile;
  const N = 256;
  const [c, g] = makeCanvas(N, N);
  const rnd = seeded(91);
  g.fillStyle = 'rgb(128,128,128)';
  g.fillRect(0, 0, N, N);
  for (let i = 0; i < 5200; i++) {
    const v = Math.floor(70 + rnd() * 120);
    g.fillStyle = `rgb(${v},${v},${v})`;
    const x = rnd() * N;
    const y = rnd() * N;
    const len = 2 + rnd() * 5;
    g.fillRect(x, y, 1, len);
    // wrap blades crossing the tile edge so the pattern tiles seamlessly
    if (y + len > N) g.fillRect(x, y - N, 1, len);
  }
  // soft clumps
  for (let i = 0; i < 60; i++) {
    const x = rnd() * N;
    const y = rnd() * N;
    const r = 6 + rnd() * 18;
    const dark = rnd() < 0.5;
    for (const ox of [-N, 0, N])
      for (const oy of [-N, 0, N]) {
        const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        grad.addColorStop(0, dark ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)');
        grad.addColorStop(1, 'rgba(128,128,128,0)');
        g.fillStyle = grad;
        g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
  }
  grassTile = c;
  return c;
}

/**
 * Striped pitch with regulation-style markings, drawn to scale (canvas spans the full field rectangle):
 * mown stripes with a soft sheen across each stripe, a faint cross-cut, blade noise, light wear in the
 * goalmouths and centre circle, and painted lines with a slight bleed.
 */
export function fieldTexture(length: number, width: number, goalWidth: number, paint: FieldPaint, res: number): THREE.Texture {
  const S = res / length;
  const W = Math.round(length * S);
  const H = Math.round(width * S);
  const [c, g] = makeCanvas(W, H);
  const stripes = Math.round(length / 2.125);
  for (let i = 0; i < stripes; i++) {
    const x0 = Math.floor((i / stripes) * W);
    const w = Math.ceil(W / stripes) + 1;
    g.fillStyle = i % 2 === 0 ? paint.grassA : paint.grassB;
    g.fillRect(x0, 0, w, H);
    // mower sheen: each stripe catches the light a little more on one side
    const sh = g.createLinearGradient(x0, 0, x0 + w, 0);
    const lit = i % 2 === 0;
    sh.addColorStop(0, lit ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.035)');
    sh.addColorStop(0.5, 'rgba(255,255,255,0)');
    sh.addColorStop(1, lit ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)');
    g.fillStyle = sh;
    g.fillRect(x0, 0, w, H);
  }
  // faint cross-cut bands
  const bands = Math.round(width / 2.5);
  for (let j = 0; j < bands; j++) {
    if (j % 2) continue;
    g.fillStyle = 'rgba(255,255,255,0.022)';
    g.fillRect(0, Math.floor((j / bands) * H), W, Math.ceil(H / bands));
  }
  // blade noise overlay
  const pat = g.createPattern(grassNoise(), 'repeat');
  if (pat) {
    g.save();
    g.globalCompositeOperation = 'overlay';
    g.globalAlpha = 0.32;
    g.fillStyle = pat;
    g.fillRect(0, 0, W, H);
    g.restore();
  }
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
  wear(W / 2, H / 2, 2.6 * S, 2.6 * S, 0.07);
  wear(1.6 * S, H / 2, 2.2 * S, (goalWidth / 2) * S, 0.1);
  wear(W - 1.6 * S, H / 2, 2.2 * S, (goalWidth / 2) * S, 0.1);
  // vignette toward the walls
  const vg = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.62);
  vg.addColorStop(0, 'rgba(255,255,255,0.05)');
  vg.addColorStop(1, 'rgba(0,20,30,0.18)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);

  const m = 0.6 * S;
  const boxW = (goalWidth + 5) * S;
  const boxD = 5 * S;
  const smallW = (goalWidth + 1.6) * S;
  const smallD = 2 * S;
  const lines = (lw: number, alpha: number) => {
    g.globalAlpha = alpha;
    g.strokeStyle = paint.line;
    g.fillStyle = paint.line;
    g.lineWidth = lw;
    g.strokeRect(m, m, W - m * 2, H - m * 2);
    g.beginPath();
    g.moveTo(W / 2, m);
    g.lineTo(W / 2, H - m);
    g.stroke();
    g.beginPath();
    g.arc(W / 2, H / 2, 3 * S, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(W / 2, H / 2, 0.22 * S + (lw - Math.max(2, 0.11 * S)) / 2, 0, Math.PI * 2);
    g.fill();
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
      // corner arcs
      for (const sy of [m, H - m]) {
        g.beginPath();
        g.arc(x0, sy, 0.5 * S, 0, Math.PI * 2);
        g.stroke();
      }
    }
    g.globalAlpha = 1;
  };
  const lw = Math.max(2, 0.11 * S);
  lines(lw * 2.2, 0.08); // paint bleed into the grass
  lines(lw, 0.94);
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

/** Diamond goal-net mesh with small knots; one texture repeat = one net cell. */
export function netMeshTexture(): THREE.Texture {
  const N = 128;
  const [c, g] = makeCanvas(N, N);
  g.clearRect(0, 0, N, N);
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 5;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(0, N / 2);
  g.lineTo(N / 2, 0);
  g.lineTo(N, N / 2);
  g.lineTo(N / 2, N);
  g.closePath();
  g.stroke();
  // wrapped half-lines at the corners keep the diamond lattice continuous
  for (const [x, y] of [[0, 0], [N, 0], [0, N], [N, N]]) {
    g.beginPath();
    g.moveTo(x, y - N / 2);
    g.lineTo(x + N / 2, y);
    g.lineTo(x, y + N / 2);
    g.lineTo(x - N / 2, y);
    g.closePath();
    g.stroke();
  }
  g.fillStyle = '#ffffff';
  for (const [x, y] of [[0, N / 2], [N / 2, 0], [N, N / 2], [N / 2, N]]) {
    g.beginPath();
    g.arc(x, y, 4.5, 0, Math.PI * 2);
    g.fill();
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

export function tileTexture(a: string, b: string, grout: string): THREE.Texture {
  const [c, g] = makeCanvas(128, 128);
  g.fillStyle = grout;
  g.fillRect(0, 0, 128, 128);
  const rnd = seeded(a.length * 31 + b.charCodeAt(1));
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 2; x++) {
      g.fillStyle = (x + y) % 2 ? a : b;
      g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
      // a little stone grain and a soft bevel so the paving does not look flat
      for (let i = 0; i < 40; i++) {
        g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.04)';
        g.fillRect(x * 64 + 3 + rnd() * 56, y * 64 + 3 + rnd() * 56, 1 + rnd() * 3, 1 + rnd() * 3);
      }
      g.fillStyle = 'rgba(255,255,255,0.07)';
      g.fillRect(x * 64 + 2, y * 64 + 2, 60, 2);
      g.fillStyle = 'rgba(0,0,0,0.06)';
      g.fillRect(x * 64 + 2, y * 64 + 60, 60, 2);
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


/**
 * Scrolling LED advertising strip (one repeat = 16:1). Sections: league wordmark, home colour chevrons,
 * venue name, away colour chevrons and a slogan, finished with a fine LED dot mask.
 */
export function ledBoardTexture(teamColors: [string, string], venue: string, accent: string): THREE.Texture {
  const W = 2048;
  const H = 128;
  const [c, g] = makeCanvas(W, H);
  g.fillStyle = '#0b1222';
  g.fillRect(0, 0, W, H);
  const font = (px: number) => `800 italic ${px}px Kanit, "Arial Black", sans-serif`;
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  const word = (text: string, x: number, w: number, fg: string, size = 66) => {
    g.font = font(size);
    let s = size;
    while (g.measureText(text).width > w - 40 && s > 20) {
      s -= 2;
      g.font = font(s);
    }
    g.fillStyle = fg;
    g.fillText(text, x + w / 2, H / 2 + 4);
  };
  const chevrons = (x: number, w: number, color: string) => {
    g.fillStyle = color;
    g.fillRect(x, 0, w, H);
    g.fillStyle = 'rgba(255,255,255,0.28)';
    for (let i = 0; i < 6; i++) {
      const cx = x + 30 + i * (w / 6);
      g.beginPath();
      g.moveTo(cx, 18);
      g.lineTo(cx + 26, H / 2);
      g.lineTo(cx, H - 18);
      g.lineTo(cx + 14, H - 18);
      g.lineTo(cx + 40, H / 2);
      g.lineTo(cx + 14, 18);
      g.closePath();
      g.fill();
    }
  };
  word('TETHER LEAGUE', 0, 560, '#ffffff', 70);
  g.fillStyle = '#f6c542';
  g.fillRect(90, H - 22, 380, 6);
  chevrons(560, 300, teamColors[0]);
  word(venue.toUpperCase(), 860, 520, accent, 62);
  chevrons(1380, 300, teamColors[1]);
  word('SWING  •  KICK  •  SCORE', 1680, 368, '#ffffff', 46);
  // LED pixel mask
  g.fillStyle = 'rgba(0,0,0,0.32)';
  for (let x = 0; x < W; x += 6) g.fillRect(x, 0, 1.6, H);
  for (let y = 0; y < H; y += 6) g.fillRect(0, y, W, 1.6);
  const t = tex(c);
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Floodlight lamp panel: a grid of bright lamps in dark housings. */
export function lampPanelTexture(): THREE.Texture {
  const [c, g] = makeCanvas(128, 64);
  g.fillStyle = '#2a3140';
  g.fillRect(0, 0, 128, 64);
  for (let y = 0; y < 3; y++)
    for (let x = 0; x < 6; x++) {
      const cx = 11 + x * 21;
      const cy = 11 + y * 21;
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, 9);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.6, '#fff4d8');
      grad.addColorStop(1, '#8d8a80');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(cx, cy, 8.5, 0, Math.PI * 2);
      g.fill();
    }
  return tex(c);
}

/** Vertical fade used on additive light-beam cones (bright at the lamp, gone at the ground). */
export function beamTexture(): THREE.Texture {
  const [c, g] = makeCanvas(8, 128);
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 8, 128);
  return tex(c, false);
}

/** Soft cumulus cloud billboard. */
export function cloudTexture(): THREE.Texture {
  const [c, g] = makeCanvas(256, 128);
  const rnd = seeded(5);
  for (let i = 0; i < 14; i++) {
    const x = 40 + rnd() * 176;
    const y = 60 + (rnd() - 0.5) * 34 - Math.sin(((x - 40) / 176) * Math.PI) * 18;
    const r = 18 + rnd() * 30;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // flat, slightly shaded base
  const base = g.createLinearGradient(0, 70, 0, 110);
  base.addColorStop(0, 'rgba(210,225,240,0)');
  base.addColorStop(1, 'rgba(210,225,240,0)');
  g.fillStyle = base;
  g.fillRect(0, 70, 256, 40);
  return tex(c);
}
