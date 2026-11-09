/** Club badges as inline SVG (original shapes). Used across menus, HUD and results. */

function emblem(id: string, fg: string): string {
  const s = `fill="none" stroke="${fg}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"`;
  const f = `fill="${fg}"`;
  switch (id) {
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
    ${emblem(id, fg)}
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
