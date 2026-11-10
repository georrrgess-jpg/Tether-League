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
  } else if (face === 'face_heart') {
    const heart = (x: number, y: number, s: number) => {
      g.beginPath();
      g.moveTo(x, y + s * 0.95);
      g.bezierCurveTo(x - s * 1.35, y + s * 0.05, x - s * 0.95, y - s * 1.05, x, y - s * 0.38);
      g.bezierCurveTo(x + s * 0.95, y - s * 1.05, x + s * 1.35, y + s * 0.05, x, y + s * 0.95);
      g.fill();
    };
    const s = exp === 'wow' ? H * 0.27 : exp === 'focus' ? H * 0.17 : exp === 'happy' ? H * 0.25 : H * 0.22;
    const lift = exp === 'happy' ? -H * 0.04 : 0;
    heart(cx - ex, cy + lift, s);
    heart(cx + ex, cy + lift, s);
    if (exp === 'sad') {
      // cracked hearts
      g.shadowBlur = 0;
      g.strokeStyle = '#05080e';
      g.lineWidth = H * 0.045;
      for (const x of [cx - ex, cx + ex]) {
        g.beginPath();
        g.moveTo(x + s * 0.05, cy - s * 0.4);
        g.lineTo(x - s * 0.2, cy - s * 0.02);
        g.lineTo(x + s * 0.18, cy + s * 0.25);
        g.lineTo(x - s * 0.02, cy + s * 0.9);
        g.stroke();
      }
    }
    if (exp === 'happy') {
      g.lineWidth = H * 0.06;
      g.beginPath();
      g.arc(cx, cy + H * 0.2, W * 0.06, Math.PI * 0.12, Math.PI * 0.88);
      g.stroke();
    }
  } else if (face === 'face_determined') {
    // slanted "game face" eyes under heavy brows (inner ends low); sad flips the brows up
    const sad = exp === 'sad';
    const open = exp === 'wow' ? 1.25 : exp === 'focus' ? 0.55 : 1;
    for (const side of [-1, 1]) {
      const x = cx + side * ex;
      const inner = -side; // toward the centre
      const top = cy - eh * 0.26 * open;
      const bot = cy + eh * 0.38 * open;
      const slope = sad ? -eh * 0.18 : eh * 0.22;
      if (exp === 'happy') {
        arcEye(x, true);
      } else {
        g.beginPath();
        g.moveTo(x - inner * ew * 0.62, top - slope * 0.5);
        g.lineTo(x + inner * ew * 0.62, top + slope * 0.5);
        g.lineTo(x + inner * ew * 0.62, bot);
        g.lineTo(x - inner * ew * 0.62, bot);
        g.closePath();
        g.fill();
      }
      // brow
      const by = cy - eh * (exp === 'wow' ? 0.9 : 0.78);
      const bs = sad ? -eh * 0.24 : exp === 'wow' ? eh * 0.08 : eh * 0.3;
      g.lineWidth = H * 0.085;
      g.beginPath();
      g.moveTo(x - inner * ew * 0.85, by - bs * 0.5);
      g.lineTo(x + inner * ew * 0.75, by + bs * 0.5);
      g.stroke();
    }
    if (exp === 'happy') {
      g.lineWidth = H * 0.06;
      g.beginPath();
      g.arc(cx + W * 0.01, cy + H * 0.12, W * 0.07, Math.PI * 0.2, Math.PI * 0.75);
      g.stroke();
    }
  } else if (face === 'face_sleepy') {
    // half-closed lids: the top of each eye cut flat by a lid line; wide awake on 'wow'
    if (exp === 'happy') {
      arcEye(cx - ex, true);
      arcEye(cx + ex, true);
    } else if (exp === 'wow') {
      g.beginPath();
      g.ellipse(cx - ex, cy, ew * 0.72, eh * 0.6, 0, 0, Math.PI * 2);
      g.ellipse(cx + ex, cy, ew * 0.72, eh * 0.6, 0, 0, Math.PI * 2);
      g.fill();
    } else {
      const lid = exp === 'focus' ? 0.22 : 0.02;
      for (const side of [-1, 1]) {
        const x = cx + side * ex;
        const droop = exp === 'sad' ? side * eh * 0.12 : 0;
        g.save();
        g.beginPath();
        g.moveTo(x - ew, cy - eh * lid - droop);
        g.lineTo(x + ew, cy - eh * lid + droop);
        g.lineTo(x + ew, cy + eh);
        g.lineTo(x - ew, cy + eh);
        g.closePath();
        g.clip();
        g.beginPath();
        g.ellipse(x, cy + eh * 0.04, ew * 0.66, eh * 0.46, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
        g.lineWidth = H * 0.06;
        g.beginPath();
        g.moveTo(x - ew * 0.85, cy - eh * lid - droop * 1.1 - H * 0.03);
        g.lineTo(x + ew * 0.85, cy - eh * lid + droop * 1.1 - H * 0.03);
        g.stroke();
      }
      if (exp === 'neutral') {
        // a small drifting "z"
        g.lineWidth = H * 0.035;
        const zx = cx + ex + ew * 1.25;
        const zy = cy - eh * 0.75;
        const zs = H * 0.08;
        g.beginPath();
        g.moveTo(zx, zy);
        g.lineTo(zx + zs, zy);
        g.lineTo(zx, zy + zs);
        g.lineTo(zx + zs, zy + zs);
        g.stroke();
      }
    }
  } else if (face === 'face_cat') {
    // almond eyes with slit pupils and a little "w" mouth
    const almond = (x: number, w: number, h: number, tilt: number) => {
      g.beginPath();
      g.moveTo(x - w, cy + tilt);
      g.quadraticCurveTo(x, cy - h * 2, x + w, cy - tilt);
      g.quadraticCurveTo(x, cy + h * 2, x - w, cy + tilt);
      g.fill();
    };
    if (exp === 'happy') {
      arcEye(cx - ex, true);
      arcEye(cx + ex, true);
    } else {
      const h = exp === 'wow' ? eh * 0.5 : exp === 'focus' ? eh * 0.24 : eh * 0.4;
      for (const side of [-1, 1]) {
        const x = cx + side * ex;
        const tilt = exp === 'sad' ? -side * eh * 0.12 : side * eh * 0.1;
        almond(x, ew * 0.95, h, tilt);
        g.save();
        g.shadowBlur = 0;
        g.fillStyle = '#05080e';
        g.beginPath();
        g.ellipse(x, cy, exp === 'wow' ? ew * 0.34 : ew * 0.13, h * 0.82, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    }
    g.lineWidth = H * 0.045;
    const my = cy + H * 0.27;
    const mw = W * 0.035;
    if (exp === 'sad') {
      g.beginPath();
      g.arc(cx, my + H * 0.05, mw, Math.PI * 1.15, Math.PI * 1.85);
      g.stroke();
    } else
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.arc(cx + sx * mw, my - H * 0.02, mw, Math.PI * 0.05, Math.PI * 0.95);
        g.stroke();
      }
  } else if (face === 'face_led') {
    // dot-matrix display: every pixel of the grid is visible, the lit ones glow
    const cols = 25;
    const rows = 9;
    const cell = Math.min((W * 0.86) / cols, (H * 0.8) / rows);
    const x0 = cx - (cols * cell) / 2 + cell / 2;
    const y0 = cy - (rows * cell) / 2 + cell / 2;
    const glyphs: Record<string, string[]> = {
      neutral: ['.###.', '#####', '#####', '#####', '.###.'],
      focus: ['.....', '#####', '#####', '.....', '.....'],
      happy: ['..#..', '.#.#.', '#...#', '.....', '.....'],
      wow: ['.###.', '#...#', '#...#', '#...#', '.###.'],
      sad: ['.....', '#...#', '#...#', '.###.', '.....'],
    };
    const glyph = glyphs[exp] ?? glyphs.neutral;
    const lit = new Set<number>();
    for (const [ox, mirror] of [[4, false], [16, true]] as [number, boolean][])
      glyph.forEach((row, r) => {
        for (let k = 0; k < 5; k++) if ((mirror ? row[4 - k] : row[k]) === '#') lit.add((r + 2) * cols + ox + k);
      });
    if (exp === 'happy') for (const k of [10, 11, 12, 13, 14]) lit.add(7 * cols + k);
    g.save();
    g.shadowBlur = 0;
    g.globalAlpha = 0.13;
    for (let r = 0; r < rows; r++)
      for (let k = 0; k < cols; k++) {
        if (lit.has(r * cols + k)) continue;
        g.beginPath();
        g.arc(x0 + k * cell, y0 + r * cell, cell * 0.3, 0, Math.PI * 2);
        g.fill();
      }
    g.restore();
    g.shadowBlur = H * 0.08;
    for (const i of lit) {
      g.beginPath();
      g.arc(x0 + (i % cols) * cell, y0 + Math.floor(i / cols) * cell, cell * 0.42, 0, Math.PI * 2);
      g.fill();
    }
  } else if (face === 'face_target') {
    // lock-on reticles
    if (exp === 'happy') {
      arcEye(cx - ex, true);
      arcEye(cx + ex, true);
    } else if (exp === 'sad') {
      arcEye(cx - ex, false);
      arcEye(cx + ex, false);
    } else {
      const r = exp === 'wow' ? H * 0.25 : exp === 'focus' ? H * 0.15 : H * 0.2;
      g.lineWidth = H * 0.05;
      for (const x of [cx - ex, cx + ex]) {
        g.beginPath();
        g.arc(x, cy, r, 0, Math.PI * 2);
        g.stroke();
        g.beginPath();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          g.moveTo(x + dx * r * 0.55, cy + dy * r * 0.55);
          g.lineTo(x + dx * r * 1.35, cy + dy * r * 1.35);
        }
        g.stroke();
        g.beginPath();
        g.arc(x, cy, r * 0.24, 0, Math.PI * 2);
        g.fill();
      }
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
    case 'pattern_pinstripe': {
      const n = 40;
      g.globalAlpha = 0.85;
      for (let i = 0; i < n; i++) g.fillRect(((i + 0.5) / n) * W - W * 0.0025, 0, W * 0.005, H);
      g.globalAlpha = 1;
      break;
    }
    case 'pattern_halves':
      // left and right halves (the front seam runs down the middle of the chest, the back seam at u = 0)
      g.fillRect(W / 2, 0, W / 2, H);
      break;
    case 'pattern_check': {
      // soft check: trim-colour squares at low strength, so the number stays the boldest thing on the shirt
      const s = H / 7;
      g.globalAlpha = 0.24;
      for (let y = 0; y * s < H; y++) for (let x = 0; x * s < W; x++) if ((x + y) % 2 === 0) g.fillRect(x * s, y * s, s, s);
      g.globalAlpha = 1;
      break;
    }
    case 'pattern_fade': {
      // trim colour rising from the hem through a halftone
      const s = H / 14;
      for (let y = 0; y * s < H; y++) {
        const t = Math.max(0, Math.min(1, ((y + 0.5) * s / H - 0.42) / 0.5));
        if (t <= 0) continue;
        const r = s * 0.72 * Math.sqrt(t);
        for (let x = 0; x * s <= W + s; x++) {
          g.beginPath();
          g.arc(x * s + (y % 2 ? s / 2 : 0), (y + 0.5) * s, r, 0, Math.PI * 2);
          g.fill();
        }
      }
      break;
    }
    case 'pattern_bolt': {
      // a lightning band right round the chest, with a bright edge
      const jag = [-1, 0.9, -0.35, 1, -0.8, 0.45, -1, 0.85, -0.3, 1];
      const zig = (y0: number) => {
        const pts: [number, number][] = [];
        const n = jag.length * 2;
        for (let i = 0; i <= n; i++) pts.push([(i / n) * W, y0 + jag[i % jag.length] * H * 0.1]);
        return pts;
      };
      const top = zig(H * 0.66);
      const bot = zig(H * 0.82);
      g.beginPath();
      top.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      for (let i = bot.length - 1; i >= 0; i--) g.lineTo(bot[i][0], bot[i][1]);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.45)';
      g.lineWidth = H * 0.018;
      g.beginPath();
      top.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
      break;
    }
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
  // Patterns that put the trim colour behind the number (halves, fade) use the dark-kit ink whenever either
  // colour is dark: white ink with a navy rim reads on light and dark grounds alike.
  const mixed = pattern === 'pattern_halves' || pattern === 'pattern_fade';
  const light = luminance(primary) > 0.45 && (!mixed || luminance(secondary) > 0.45);
  const ink = light ? '#17273E' : '#ffffff';
  const rim = light ? 'rgba(255,255,255,0.75)' : mixed ? 'rgba(15,26,44,0.95)' : 'rgba(15,26,44,0.85)';
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

// ----------------------------------------------------------------------------- match balls

/**
 * Maps for one match ball skin. `emissive` (use with `emissiveIntensity` and a white emissive colour) is set
 * only for skins that glow; `metalness` / `roughness` are optional material hints (Chrome Orb). Materials that
 * ignore the optional fields still show a correct, if less shiny, ball.
 */
export interface BallMaps {
  map: THREE.Texture;
  bump: THREE.Texture;
  emissive?: THREE.Texture;
  emissiveIntensity?: number;
  metalness?: number;
  roughness?: number;
}

/** One surface sample: colour and glow 0..255 per channel, bump height 0..255. */
interface BallSample {
  r: number;
  g: number;
  b: number;
  h: number;
  er: number;
  eg: number;
  eb: number;
}

interface BallSkin {
  /** Paints the unit-sphere point (x, y, z). Glow channels start at 0. */
  paint: (x: number, y: number, z: number, o: BallSample) => void;
  glow?: number;
  metalness?: number;
  roughness?: number;
}

type RGB = [number, number, number];
const rgb = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
function put(o: BallSample, c: RGB, k = 1): void {
  o.r = c[0] * k;
  o.g = c[1] * k;
  o.b = c[2] * k;
}
/** o.rgb = mix(o.rgb, c, t) */
function over(o: BallSample, c: RGB, t: number): void {
  o.r += (c[0] - o.r) * t;
  o.g += (c[1] - o.g) * t;
  o.b += (c[2] - o.b) * t;
}
function glowOf(o: BallSample, c: RGB, k: number): void {
  o.er = Math.max(o.er, c[0] * k);
  o.eg = Math.max(o.eg, c[1] * k);
  o.eb = Math.max(o.eb, c[2] * k);
}

const norm3 = (v: number[]): number[] => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};

let icoData: { verts: number[][]; faces: number[][] } | null = null;
function ico(): { verts: number[][]; faces: number[][] } {
  if (icoData) return icoData;
  const t = (1 + Math.sqrt(5)) / 2;
  const verts = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(norm3);
  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  icoData = { verts, faces };
  return icoData;
}

/** Classic 32-panel layout: 12 pentagon centres (icosahedron vertices) then 20 hexagon centres (face centres). */
let classicPts: number[][] | null = null;
function classicCentres(): number[][] {
  if (classicPts) return classicPts;
  const { verts, faces } = ico();
  classicPts = [...verts, ...faces.map((f) => norm3([0, 1, 2].map((k) => verts[f[0]][k] + verts[f[1]][k] + verts[f[2]][k])))];
  return classicPts;
}

/** Honeycomb layout: a frequency-3 geodesic sphere (12 pentagons, the icosahedron vertices first, and 80 hexagons). */
let hivePts: number[][] | null = null;
function hiveCentres(): number[][] {
  if (hivePts) return hivePts;
  const { verts, faces } = ico();
  const out: number[][] = [...verts];
  const seen = new Set(verts.map((v) => v.map((c) => c.toFixed(4)).join()));
  for (const f of faces)
    for (let i = 0; i <= 3; i++)
      for (let j = 0; j <= 3 - i; j++) {
        const k = 3 - i - j;
        const p = norm3([0, 1, 2].map((c) => i * verts[f[0]][c] + j * verts[f[1]][c] + k * verts[f[2]][c]));
        const key = p.map((c) => c.toFixed(4)).join();
        if (!seen.has(key)) {
          seen.add(key);
          out.push(p);
        }
      }
  hivePts = out;
  return out;
}

/** Nearest panel centre and the angular gap to the next nearest (an approximate distance to the seam). */
const near = { i: 0, edge: 0 };
function nearest(cs: number[][], x: number, y: number, z: number, pentWeight = 1): typeof near {
  let d1 = 9;
  let d2 = 9;
  let i1 = 0;
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    const dot = x * c[0] + y * c[1] + z * c[2];
    if (dot < 0.5) continue; // too far to be either of the two nearest
    const d = Math.acos(Math.min(1, dot)) * (i < 12 ? pentWeight : 1);
    if (d < d1) {
      d2 = d1;
      d1 = d;
      i1 = i;
    } else if (d < d2) d2 = d;
  }
  near.i = i1;
  near.edge = d2 - d1;
  return near;
}

/** Stitched panel look shared by the panelled balls: anti-aliased seam, panels puffed toward their centres. */
function panel(o: BallSample, col: RGB, seam: RGB, edge: number, seamW: number, puffW = 0.05): void {
  const k = clamp01((edge - seamW * 0.55) / (seamW * 0.9));
  const blend = k * k * (3 - 2 * k);
  const puff = (1 - 0.13 * Math.exp(-Math.max(0, edge - seamW) / puffW)) * (0.82 + 0.18 * blend);
  o.r = (seam[0] + (col[0] - seam[0]) * blend) * puff;
  o.g = (seam[1] + (col[1] - seam[1]) * blend) * puff;
  o.b = (seam[2] + (col[2] - seam[2]) * blend) * puff;
  o.h = 40 + blend * Math.min(215, 100 + Math.max(0, edge - seamW) * 1400);
}

/** Smooth deterministic 3D noise (sum of rotated sines), roughly -1..1. */
function wave3(x: number, y: number, z: number, f: number, s: number): number {
  return (
    Math.sin(x * f * 1.7 + y * f * 0.6 + s) * Math.sin(y * f * 1.3 - z * f * 0.9 + s * 1.7) +
    0.5 * Math.sin(z * f * 2.9 + x * f * 1.1 + s * 2.3) * Math.sin(x * f * 2.3 - y * f * 2.1) +
    0.25 * Math.sin((x + y + z) * f * 4.7 + s * 3.1)
  ) / 1.25;
}

/** Deterministic hash of an integer lattice cell, 0..1. */
function hash3(i: number, j: number, k: number): number {
  let h = (i * 374761393 + j * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const NAVY_BALL = rgb('#1a2842');
const WHITE_BALL = rgb('#f7f8f4');
const SEAM_GREY = rgb('#c4c9d0');

const BALL_SKINS: Record<string, BallSkin> = {
  ball_classic: {
    paint(x, y, z, o) {
      const n = nearest(classicCentres(), x, y, z, 1.16);
      panel(o, n.i < 12 ? NAVY_BALL : n.i === 12 || n.i === 25 ? [18, 188, 210] : WHITE_BALL, SEAM_GREY, n.edge, 0.018);
    },
  },
  ball_beach: {
    // Six gores round the poles, white caps, a coral valve on one cap.
    paint(x, y, z, o) {
      const cols: RGB[] = [rgb('#e8423a'), rgb('#f6c230'), rgb('#2f7fe4'), rgb('#fbfaf4'), rgb('#f48a2c'), rgb('#12bcd2')];
      const st = Math.sqrt(Math.max(0, 1 - y * y));
      const lon = Math.atan2(z, x) + Math.PI;
      const g = (lon / (Math.PI * 2)) * 6;
      const gi = Math.min(5, Math.floor(g));
      const toSeam = Math.min(g - gi, gi + 1 - g) * ((Math.PI * 2) / 6) * st;
      const cap = Math.acos(Math.min(1, Math.abs(y)));
      const capEdge = cap - 0.36;
      if (capEdge < 0) {
        panel(o, rgb('#fbfaf4'), rgb('#9aa3ad'), -capEdge, 0.016, 0.08);
        if (y > 0 && cap < 0.07) over(o, rgb('#ec5f8e'), smooth(0.07, 0.055, cap));
      } else panel(o, cols[gi], rgb('#9aa3ad'), Math.min(toSeam, capEdge), 0.016, 0.08);
    },
  },
  ball_hive: {
    // Honeycomb: amber hexagons in white walls, navy pentagons.
    paint(x, y, z, o) {
      const n = nearest(hiveCentres(), x, y, z);
      const tone = hash3(n.i, 7, 3);
      const col: RGB = n.i < 12 ? NAVY_BALL : tone < 0.18 ? rgb('#ffd35a') : tone < 0.32 ? rgb('#f08a1c') : rgb('#f6a92a');
      panel(o, col, rgb('#fbf7ea'), n.edge, 0.034, 0.03);
    },
  },
  ball_retro: {
    // 18 stitched panels (three per cube face, turned on neighbouring faces): toy red, yellow and blue round a
    // cream middle strip; cream stitches over every seam.
    paint(x, y, z, o) {
      const p = [x, y, z];
      const ab = [Math.abs(x), Math.abs(y), Math.abs(z)];
      const a = ab[0] >= ab[1] && ab[0] >= ab[2] ? 0 : ab[1] >= ab[2] ? 1 : 2;
      const b = (a + 1) % 3;
      const c = (a + 2) % 3;
      const u = p[b] / ab[a];
      const strip = u < -1 / 3 ? 0 : u < 1 / 3 ? 1 : 2;
      const stripEdge = Math.min(Math.abs(u + 1 / 3), Math.abs(u - 1 / 3)) * ab[a] * 0.9;
      const rival = ab[b] > ab[c] ? b : c;
      const faceEdge = (ab[a] - ab[rival]) * 0.75;
      const cols: RGB[] = [rgb('#e2403a'), rgb('#f4c02c'), rgb('#2f6fe4')];
      const col = strip === 1 ? rgb('#f6efdd') : cols[a];
      const edge = Math.min(stripEdge, faceEdge);
      panel(o, col, rgb('#5a3f34'), edge, 0.02, 0.06);
      // stitches: short cream dashes across the seam
      const along = faceEdge < stripEdge ? p[rival === b ? c : b] : p[c] / ab[a];
      if (edge < 0.03 && (along * 34 - Math.floor(along * 34)) < 0.45) over(o, rgb('#fff4d6'), smooth(0.03, 0.018, edge));
    },
  },
  ball_comet: {
    // Flames rising toward one pole, with dark comic-book contour lines between the bands.
    glow: 0.5,
    paint(x, y, z, o) {
      const lon = Math.atan2(z, x);
      const f = y * 1.15 + 0.24 * Math.sin(lon * 5 + y * 4) + 0.11 * Math.sin(lon * 11 - y * 7 + 1.3) + 0.05 * Math.sin(lon * 23 + y * 13);
      const stops: [number, RGB][] = [[-1.2, rgb('#8e1a2a')], [-0.4, rgb('#e2322e')], [0.12, rgb('#ff6a14')], [0.6, rgb('#ffbe2e')], [1.05, rgb('#fff3c4')]];
      let i = 0;
      while (i < stops.length - 2 && f > stops[i + 1][0]) i++;
      const t = clamp01((f - stops[i][0]) / (stops[i + 1][0] - stops[i][0]));
      const s = t * t * (3 - 2 * t);
      // banded: hold each colour, blend quickly near the next stop (cel-shaded flames)
      const band = smooth(0.62, 0.9, s);
      const a = stops[i][1];
      const bb = stops[i + 1][1];
      o.r = a[0] + (bb[0] - a[0]) * band;
      o.g = a[1] + (bb[1] - a[1]) * band;
      o.b = a[2] + (bb[2] - a[2]) * band;
      let line = 0;
      for (const th of [-0.4, 0.12, 0.6]) line = Math.max(line, smooth(0.035, 0.012, Math.abs(f - th) * 1.4));
      over(o, rgb('#5b0f1c'), line * 0.75);
      o.h = 120 + f * 40 - line * 70;
      if (f > -0.4) glowOf(o, [o.r, o.g * 0.8, o.b * 0.5], 0.45 * smooth(-0.4, 0.6, f) * (1 - line));
    },
  },
  ball_neon: {
    // Dark shell with glowing tram lines: cyan round the equator, magenta pole to pole, yellow studs.
    glow: 1.6,
    roughness: 0.3,
    paint(x, y, z, o) {
      put(o, rgb('#1d2342'));
      // faint hex texture so the dark shell still shows its spin
      const n = nearest(classicCentres(), x, y, z, 1.16);
      if (n.i % 3 === 0) over(o, rgb('#2c3463'), 1);
      over(o, rgb('#0b0e1e'), smooth(0.03, 0.008, n.edge));
      o.h = 120 - smooth(0.03, 0.008, n.edge) * 60;
      const lines: [number, RGB][] = [
        [Math.min(Math.abs(y - 0.17), Math.abs(y + 0.17)), rgb('#3ff2ff')],
        [Math.min(Math.abs(z - 0.17), Math.abs(z + 0.17)), rgb('#ff4fd8')],
      ];
      for (const [d, c] of lines) {
        const core = smooth(0.034, 0.02, d);
        const halo = smooth(0.08, 0.02, d) * 0.35;
        over(o, c, Math.max(core, halo));
        over(o, [255, 255, 255], smooth(0.012, 0.004, d) * 0.6);
        glowOf(o, c, Math.max(core, halo * 0.6));
      }
      const stud = Math.min(Math.hypot(x - 1, y, z), Math.hypot(x + 1, y, z));
      const k = smooth(0.12, 0.1, stud);
      over(o, rgb('#ffe14d'), k);
      glowOf(o, rgb('#ffe14d'), k);
    },
  },
  ball_chrome: {
    // Mirror panels in two tones of steel, deep black engraving, one gold pentagon.
    metalness: 0.9,
    roughness: 0.2,
    paint(x, y, z, o) {
      const n = nearest(classicCentres(), x, y, z, 1.16);
      const col: RGB = n.i === 0 ? rgb('#f0be46') : n.i < 12 ? rgb('#8b95a3') : n.i % 2 ? rgb('#e4e9ef') : rgb('#c3cad4');
      panel(o, col, rgb('#1d2128'), n.edge, 0.016, 0.06);
      // brushed sheen across each panel
      const sheen = 0.035 * Math.sin((x * 3 + y * 5 - z * 4) * 4);
      o.r *= 1 + sheen;
      o.g *= 1 + sheen;
      o.b *= 1 + sheen;
    },
  },
  ball_galaxy: {
    // Indigo night with pink and cyan nebulae, a bright galactic band and a field of stars.
    glow: 1.2,
    paint(x, y, z, o) {
      put(o, rgb('#241a5e'));
      const pink = clamp01(wave3(x, y, z, 2.2, 0.3) * 0.9 + 0.15);
      const cyan = clamp01(wave3(z, x, y, 2.6, 2.1) * 0.9 - 0.05);
      over(o, rgb('#e45cc8'), pink * 0.85);
      over(o, rgb('#4fc8ff'), cyan * 0.75);
      // galactic band along a tilted great circle
      const band = Math.abs(x * 0.42 + y * 0.82 + z * 0.39);
      const bk = smooth(0.32, 0.0, band) * (0.55 + 0.45 * wave3(x, y, z, 6, 1.4));
      over(o, rgb('#ffe6fb'), clamp01(bk) * 0.7);
      glowOf(o, [o.r, o.g, o.b], 0.28 + clamp01(bk) * 0.3);
      // stars: one candidate per 3D lattice cell, so they stay round at the poles
      const S = 22;
      const fx = x * S;
      const fy = y * S;
      const fz = z * S;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const iz = Math.floor(fz);
      const hsh = hash3(ix, iy, iz);
      if (hsh < 0.5) {
        const cx = ix + 0.25 + hash3(iy, iz, ix) * 0.5;
        const cy = iy + 0.25 + hash3(iz, ix, iy) * 0.5;
        const cz = iz + 0.25 + hash3(ix + 3, iy, iz) * 0.5;
        const d = Math.hypot(fx - cx, fy - cy, fz - cz);
        const r = hsh < 0.06 ? 0.34 : 0.18;
        const k = smooth(r, r * 0.35, d);
        over(o, [255, 255, 255], k);
        glowOf(o, [255, 255, 255], k);
        o.h = 128 + k * 60;
        return;
      }
      o.h = 128;
    },
  },
  ball_playbook: {
    // White ball with faint panel seams and chalk-talk marks: navy X, coral O and a dashed teal arrow.
    paint(x, y, z, o) {
      const n = nearest(classicCentres(), x, y, z, 1.16);
      panel(o, WHITE_BALL, rgb('#d3d7dc'), n.edge, 0.012);
      if (n.i >= 12) return;
      const c = classicCentres()[n.i];
      // local frame on the pentagon centre
      let t1 = [c[2], 0, -c[0]];
      if (Math.hypot(t1[0], t1[2]) < 0.2) t1 = [0, -c[2], c[1]];
      t1 = norm3(t1);
      const t2 = [c[1] * t1[2] - c[2] * t1[1], c[2] * t1[0] - c[0] * t1[2], c[0] * t1[1] - c[1] * t1[0]];
      const u = x * t1[0] + y * t1[1] + z * t1[2];
      const v = x * t2[0] + y * t2[1] + z * t2[2];
      const kind = n.i % 3;
      let d = 9;
      let col = NAVY_BALL;
      if (kind === 0) {
        if (Math.max(Math.abs(u), Math.abs(v)) < 0.15) d = Math.min(Math.abs(u - v), Math.abs(u + v)) / Math.SQRT2;
        d -= 0.03;
      } else if (kind === 1) {
        d = Math.abs(Math.hypot(u, v) - 0.12) - 0.03;
        col = rgb('#ec5f6e');
      } else {
        col = rgb('#1595b8');
        // dashed shaft and a solid head
        if (u > -0.2 && u < 0.06 && (u + 0.2) / 0.065 - Math.floor((u + 0.2) / 0.065) < 0.6) d = Math.abs(v) - 0.024;
        if (u >= 0.05 && u < 0.2) d = Math.min(d, Math.abs(v) - (0.2 - u) * 0.75);
      }
      const k = smooth(0.006, -0.004, d);
      over(o, col, k);
    },
  },
};

const ballCache = new Map<string, BallMaps>();

/**
 * Match ball maps for a skin id (see COSMETICS kind 'ball'; unknown ids give the classic ball). Each skin is
 * painted on the sphere itself and written to an equirectangular map, so nothing stretches at the poles.
 * Skins are cached (at most four sets, least recently used dropped first).
 */
export function ballMaps(skin = 'ball_classic'): BallMaps {
  const id = BALL_SKINS[skin] ? skin : 'ball_classic';
  const hit = ballCache.get(id);
  if (hit) {
    ballCache.delete(id);
    ballCache.set(id, hit);
    return hit;
  }
  const def = BALL_SKINS[id];
  const W = 1024;
  const H = 512;
  const [mc, mg] = makeCanvas(W, H);
  const [bc, bg] = makeCanvas(W, H);
  const img = mg.createImageData(W, H);
  const bump = bg.createImageData(W, H);
  const glow = def.glow ? makeCanvas(W, H) : null;
  const gimg = glow ? glow[1].createImageData(W, H) : null;
  const o: BallSample = { r: 0, g: 0, b: 0, h: 128, er: 0, eg: 0, eb: 0 };
  for (let py = 0; py < H; py++) {
    const theta = ((py + 0.5) / H) * Math.PI;
    const st = Math.sin(theta);
    const y = Math.cos(theta);
    for (let px = 0; px < W; px++) {
      const phi = ((px + 0.5) / W) * Math.PI * 2;
      o.h = 128;
      o.er = o.eg = o.eb = 0;
      def.paint(-Math.cos(phi) * st, y, Math.sin(phi) * st, o);
      const i = (py * W + px) * 4;
      img.data[i] = o.r;
      img.data[i + 1] = o.g;
      img.data[i + 2] = o.b;
      img.data[i + 3] = 255;
      bump.data[i] = bump.data[i + 1] = bump.data[i + 2] = o.h;
      bump.data[i + 3] = 255;
      if (gimg) {
        gimg.data[i] = o.er;
        gimg.data[i + 1] = o.eg;
        gimg.data[i + 2] = o.eb;
        gimg.data[i + 3] = 255;
      }
    }
  }
  mg.putImageData(img, 0, 0);
  bg.putImageData(bump, 0, 0);
  const map = tex(mc);
  map.anisotropy = 8;
  const out: BallMaps = { map, bump: tex(bc, false) };
  if (glow && gimg) {
    glow[1].putImageData(gimg, 0, 0);
    out.emissive = tex(glow[0]);
    out.emissiveIntensity = def.glow;
  }
  if (def.metalness != null) out.metalness = def.metalness;
  if (def.roughness != null) out.roughness = def.roughness;
  ballCache.set(id, out);
  while (ballCache.size > 4) {
    const [oldId, old] = ballCache.entries().next().value as [string, BallMaps];
    ballCache.delete(oldId);
    old.map.dispose();
    old.bump.dispose();
    old.emissive?.dispose();
  }
  return out;
}

const ballThumbs = new Map<string, string>();

/**
 * PNG data URL of a shaded preview sphere for a ball skin (UI thumbnails). Painted with the same surface
 * functions as the match maps, tilted so the poles and seams show, lit from the top left.
 */
export function ballThumbDataUrl(id: string, size = 96): string {
  const skinId = BALL_SKINS[id] ? id : 'ball_classic';
  const key = `${skinId}|${size}`;
  const hit = ballThumbs.get(key);
  if (hit) return hit;
  const def = BALL_SKINS[skinId];
  const [c, g] = makeCanvas(size, size);
  const img = g.createImageData(size, size);
  const R = size / 2 - 1.5;
  const C = size / 2;
  const L = norm3([-0.45, 0.65, 0.62]);
  const metal = def.metalness ?? 0;
  // view rotation: tilt toward the camera, then turn
  const ax = -0.5;
  const ay = 0.7;
  const cxr = Math.cos(ax);
  const sxr = Math.sin(ax);
  const cyr = Math.cos(ay);
  const syr = Math.sin(ay);
  const o: BallSample = { r: 0, g: 0, b: 0, h: 128, er: 0, eg: 0, eb: 0 };
  for (let py = 0; py < size; py++)
    for (let px = 0; px < size; px++) {
      const sx = (px + 0.5 - C) / R;
      const sy = (C - (py + 0.5)) / R;
      const r2 = sx * sx + sy * sy;
      const i = (py * size + px) * 4;
      const alpha = clamp01((1 - Math.sqrt(r2)) * R + 0.5);
      if (alpha <= 0) continue;
      const nz = Math.sqrt(Math.max(0, 1 - r2));
      // rotate the view normal into ball space
      const y1 = sy * cxr - nz * sxr;
      const z1 = sy * sxr + nz * cxr;
      const x2 = sx * cyr + z1 * syr;
      const z2 = -sx * syr + z1 * cyr;
      o.h = 128;
      o.er = o.eg = o.eb = 0;
      def.paint(x2, y1, z2, o);
      const ndl = Math.max(0, sx * L[0] + sy * L[1] + nz * L[2]);
      // reflection of the view vector (0,0,1) about n, against the light
      const rz = 2 * nz * nz - 1;
      const rdl = Math.max(0, 2 * nz * sx * L[0] + 2 * nz * sy * L[1] + rz * L[2]);
      const spec = Math.pow(rdl, metal > 0.5 ? 18 : 42) * (metal > 0.5 ? 0.9 : 0.55);
      // metals reflect a bright sky over a darker horizon instead of diffuse light
      const ry = 2 * nz * sy;
      const diff = metal > 0.5 ? (ry > -0.08 ? 1.02 + 0.2 * ry : 0.5 + 0.25 * (1 + ry)) * (0.75 + 0.3 * ndl) : 0.42 + 0.68 * ndl;
      const rim = 1 - 0.25 * Math.pow(1 - nz, 3);
      const eg = def.glow ? 0.75 : 0;
      img.data[i] = Math.min(255, o.r * diff * rim + spec * 255 + o.er * eg);
      img.data[i + 1] = Math.min(255, o.g * diff * rim + spec * 255 + o.eg * eg);
      img.data[i + 2] = Math.min(255, o.b * diff * rim + spec * 255 + o.eb * eg);
      img.data[i + 3] = alpha * 255;
    }
  g.putImageData(img, 0, 0);
  const url = c.toDataURL('image/png');
  ballThumbs.set(key, url);
  if (ballThumbs.size > 48) ballThumbs.delete(ballThumbs.keys().next().value as string);
  return url;
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

/**
 * CSS background for a small horizontal trail swatch (UI thumbnails), matching how each trail id is drawn in
 * a match (MatchView's Trail): the head of the trail is on the right.
 */
export function trailThumbCss(id: string, primary: string, secondary: string): string {
  switch (id) {
    case 'trail_comet':
      return `linear-gradient(90deg, transparent, ${primary} 60%, #fff)`;
    case 'trail_spark':
      return `repeating-linear-gradient(90deg, ${primary} 0 8px, #fff3a8 8px 12px)`;
    case 'trail_aurora':
      return `linear-gradient(90deg, transparent, ${secondary}, ${primary})`;
    case 'trail_ember':
      return 'linear-gradient(90deg, transparent, #b3150c 25%, #ff5a1a 55%, #ffb02e 80%, #fff0a0)';
    case 'trail_prism':
      return 'linear-gradient(90deg, transparent, #ff3b3b 15%, #ffb02e 30%, #f6e94a 45%, #3fe07a 60%, #2fb8ff 75%, #8a5cf0 90%, #ff4fd8)';
    case 'trail_chalk':
      return `repeating-linear-gradient(90deg, transparent 0 6px, ${shade(primary, 0.55)} 6px 14px), linear-gradient(90deg, transparent, ${primary})`;
    default:
      return `linear-gradient(90deg, transparent, ${primary})`;
  }
}
