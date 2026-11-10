/** Club badges as inline SVG (original shapes). Used across menus, HUD and results. */

/** Small five-point star centred on (x, y). */
function starPath(x: number, y: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(`${(x + Math.cos(a) * rr).toFixed(1)} ${(y + Math.sin(a) * rr).toFixed(1)}`);
  }
  return `M${pts.join('L')}z`;
}

/** Rays (or gear teeth) around a centre. */
function rays(n: number, r0: number, r1: number, phase = 0): string {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = phase + (i * 2 * Math.PI) / n;
    d += `M${(48 + Math.cos(a) * r0).toFixed(1)} ${(46 + Math.sin(a) * r0).toFixed(1)}L${(48 + Math.cos(a) * r1).toFixed(1)} ${(46 + Math.sin(a) * r1).toFixed(1)}`;
  }
  return d;
}

const MASTER_SUFFIX = '_master';

function emblem(id: string, fg: string, bg: string): string {
  const s = `fill="none" stroke="${fg}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"`;
  const f = `fill="${fg}"`;
  if (id.endsWith(MASTER_SUFFIX)) {
    // Mastery 9 badges: the chassis emblem, slightly smaller, under three stars.
    const base = emblem(id.slice(0, -MASTER_SUFFIX.length), fg, bg);
    return `<g transform="translate(48 54) scale(0.74) translate(-48 -46)">${base}</g><path ${f} d="${starPath(34, 24, 5)}${starPath(48, 20, 6)}${starPath(62, 24, 5)}"/>`;
  }
  switch (id) {
    case 'badge_hook':
      return `<circle ${s} cx="48" cy="20" r="5"/><path ${s} d="M48 25v37M48 62c-12 0-18-6-18-16M48 62c12 0 18-6 18-16M30 46l-4 6M66 46l4 6"/>`;
    case 'badge_gull':
      return `<path ${s} stroke-width="6" d="M18 50c10-12 20-12 30 2 10-14 20-14 30-2"/><circle ${f} cx="48" cy="64" r="4"/>`;
    case 'badge_orbit':
      return `<ellipse ${s} cx="48" cy="46" rx="28" ry="12" transform="rotate(-22 48 46)"/><circle ${f} cx="48" cy="46" r="9"/><circle ${f} cx="71" cy="34" r="5"/>`;
    case 'badge_lighthouse':
      return `<path ${f} d="M41 74l3-36h8l3 36z"/><path ${f} d="M39 36h18l-3-9H42z"/><path ${s} stroke-width="4" d="M33 28 19 22M63 28l14-6M33 34H18M63 34h15"/>`;
    case 'badge_compass':
      return `<circle ${s} stroke-width="4" cx="48" cy="46" r="26"/><path ${f} d="M48 22l7 24-7 24-7-24z"/><path ${f} opacity="0.55" d="M24 46l24-6 24 6-24 6z"/>`;
    case 'badge_knot':
      return `<path ${s} d="M48 40c-8-11-26-11-26 0s18 11 26 0 26-11 26 0-18 11-26 0z"/><path ${s} d="M44 46c-4 8-8 16-14 26M52 46c4 8 8 16 14 26"/>`;
    case 'badge_laurel':
      return `<path ${s} stroke-width="4" d="M36 74c-14-10-18-30-8-46M60 74c14-10 18-30 8-46"/><path ${f} d="M26 60c-6-2-8-7-7-11 5 1 8 5 7 11zM24 46c-6-3-6-8-4-12 5 2 6 7 4 12zM28 34c-4-4-3-9 0-12 4 3 4 8 0 12zM70 60c6-2 8-7 7-11-5 1-8 5-7 11zM72 46c6-3 6-8 4-12-5 2-6 7-4 12zM68 34c4-4 3-9 0-12-4 3-4 8 0 12z"/><path ${f} d="${starPath(48, 46, 11)}"/>`;
    case 'badge_supernova':
      return `<path ${f} d="M48 14l7 25 25 7-25 7-7 25-7-25-25-7 25-7z"/><path ${s} stroke-width="3" d="${rays(4, 18, 26, Math.PI / 4)}"/>`;
    case 'badge_crown':
      return `<path ${f} d="M24 64l-4-30 16 12 12-20 12 20 16-12-4 30z"/><path ${f} d="M24 68h48v7H24z"/><circle fill="${bg}" cx="48" cy="54" r="4"/>`;
    case 'badge_net':
      return `<path ${s} d="M20 68V28h56v40"/><path ${s} stroke-width="2.5" d="M20 41h56M20 54h56M34 28v40M48 28v40M62 28v40"/><circle ${f} cx="48" cy="62" r="8"/>`;
    case 'badge_glove':
      return `<path ${f} d="M33 70V44c0-4 6-4 6 0V28c0-4 6-4 6 0v-4c0-4 6-4 6 0v4c0-4 6-4 6 0v12c1-4 6-4 6 0v16c0 9-7 16-16 16h-3c-6 0-11-3-11-2z"/>`;
    case 'badge_swirl':
      return `<path ${s} d="M50 46a5 5 0 1 1 5-6c0 8-7 14-15 14s-16-8-16-18 10-20 22-20 24 10 24 26"/><circle ${f} cx="74" cy="48" r="5"/>`;
    case 'badge_medal':
      return `<path ${f} d="M34 16h9l7 20h-9zM62 16h-9l-7 20h9z"/><circle ${f} cx="48" cy="56" r="17"/><path fill="${bg}" d="${starPath(48, 56, 9)}"/>`;
    case 'badge_cup':
      return `<path ${f} d="M34 20h28v14a14 14 0 0 1-28 0z"/><path ${s} stroke-width="4" d="M34 25h-8c0 9 4 13 10 13M62 25h8c0 9-4 13-10 13M48 48v12"/><path ${f} d="M37 64h22v8H37z"/>`;
    case 'badge_chevrons':
      return `<path ${s} stroke-width="7" d="M26 74l22-14 22 14M26 56l22-14 22 14M26 38l22-14 22 14"/>`;
    case 'badge_link':
      return `<rect ${s} x="16" y="38" width="36" height="18" rx="9" transform="rotate(-30 34 47)"/><rect ${s} x="44" y="38" width="36" height="18" rx="9" transform="rotate(-30 62 47)"/>`;
    case 'badge_cog':
      return `<path ${s} stroke-width="8" d="${rays(8, 18, 25)}"/><circle ${s} stroke-width="6" cx="48" cy="46" r="15"/><circle ${f} cx="48" cy="46" r="5"/>`;
    case 'badge_wing':
      return `<path ${f} d="M18 60c16-4 28-16 36-34 3 10 1 18-3 25 9-2 17-9 23-18 0 16-11 28-26 32-11 3-22 2-30-5z"/>`;
    case 'badge_tower':
      return `<path ${f} d="M32 74V42h-4V24h8v7h6v-7h12v7h6v-7h8v18h-4v32z"/><path fill="${bg}" d="M43 74V60a5 5 0 0 1 10 0v14z"/>`;
    case 'badge_arc':
      return `<path ${s} stroke-width="6" d="M16 64c12-28 52-28 64 0"/><path ${f} d="M36 40l26-10-9 18-5-6z"/>`;
    case 'badge_wave':
      return `<path ${s} d="M22 58c8-10 16-10 24 0s16 10 24 0M22 44c8-10 16-10 24 0s16 10 24 0"/><circle ${f} cx="62" cy="30" r="5"/>`;
    case 'badge_bolt':
      return `<path ${f} d="M54 16 28 54h16l-6 30 28-40H50z"/>`;
    case 'badge_star':
      return `<path ${f} d="M48 18l8.500 17.500 19.500 2.500-14.500 13.500 3.500 19L48 61.500 30.500 70.500l3.500-19L19.500 38l19.500-2.500z"/>`;
    case 'badge_sunburst':
      return `<circle ${f} cx="48" cy="48" r="12"/><path ${s} d="M48 18v9M48 69v9M18 48h9M69 48h9M27 27l6.500 6.500M62.500 62.500 69 69M27 69l6.500-6.500M62.500 33.500 69 27"/>`;
    case 'badge_anchor':
      return `<circle ${s} cx="48" cy="24" r="7"/><path ${s} d="M48 31v42M34 42h28M24 56c2 12 12 17 24 17s22-5 24-17"/>`;
    case 'badge_gear':
      return `<circle ${s} cx="48" cy="48" r="13"/><path ${s} stroke-width="9" d="M48 20v6M48 70v6M20 48h6M70 48h6M28.500 28.500l4 4M63.500 63.500l4 4M28.500 67.500l4-4M63.500 32.500l4-4"/>`;
    case 'badge_skyline':
      return `<path ${f} d="M20 72V50h10v22zM33 72V34h12v38zM48 72V24h12v48zM63 72V42h12v30z"/>`;
    case 'badge_comet':
      return `<circle ${f} cx="60" cy="36" r="12"/><path ${s} d="M48 46 22 72M56 54 36 76M42 40 20 56"/>`;
    case 'badge_flame':
      return `<path ${f} d="M48 14c4 12 18 18 18 36a18 18 0 0 1-36 0c0-8 4-12 7-17 2 5 4 7 7 8-2-10 0-18 4-27z"/>`;
    default:
      // lifebuoy
      return `<circle ${s} stroke-width="11" cx="48" cy="46" r="16"/>`;
  }
}

export function badgeSvg(id: string, primary: string, secondary: string): string {
  const light = isLight(primary);
  const fg = light ? '#17273E' : '#ffffff';
  return `<svg viewBox="0 0 96 96" class="badge-svg" aria-hidden="true">
    <path d="M48 5 86 17v30c0 22-15 36-38 44C25 83 10 69 10 47V17z" fill="${secondary}"/>
    <path d="M48 12 80 22v25c0 18-12 30-32 37-20-7-32-19-32-37V22z" fill="${primary}"/>
    <path d="M48 12 80 22v25c0 18-12 30-32 37z" fill="#000" opacity="0.08"/>
    ${emblem(id, fg, primary)}
  </svg>`;
}

export function isLight(hex: string): boolean {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 165;
}

/** Perceptual-ish distance between two colours, used to detect kit clashes. */
export function colorDistance(a: string, b: string): number {
  const p = (hex: string) => {
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [r1, g1, b1] = p(a);
  const [r2, g2, b2] = p(b);
  const rm = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}
