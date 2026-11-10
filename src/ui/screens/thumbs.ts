import type { App } from '../../app';
import { COSMETIC_BY_ID, colorHex } from '../../content/cosmetics';
import { badgeSvg } from '../badge';
import { h, icon } from '../dom';

/** Small original SVG drawings of the eight head toppers on a robot dome (UI thumbnails only). */
export function topperSvg(id: string, accent = '#12BCD2'): string {
  const ink = '#17273E';
  const st = `fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"`;
  let top = '';
  switch (id) {
    case 'topper_antenna':
      top = `<path ${st} d="M32 30V12"/><circle cx="32" cy="10" r="4.5" fill="${accent}" stroke="${ink}" stroke-width="2.5"/>`;
      break;
    case 'topper_fin':
      top = `<path d="M24 31c4-12 14-20 26-22-4 8-6 15-6 22z" fill="${accent}" stroke="${ink}" stroke-width="2.5" stroke-linejoin="round"/>`;
      break;
    case 'topper_headset':
      top = `<path ${st} d="M14 36c0-14 8-22 18-22s18 8 18 22"/><rect x="9" y="33" width="9" height="13" rx="4" fill="${accent}" stroke="${ink}" stroke-width="2.5"/><rect x="46" y="33" width="9" height="13" rx="4" fill="${accent}" stroke="${ink}" stroke-width="2.5"/><path ${st} d="M14 46c2 6 8 8 14 8"/>`;
      break;
    case 'topper_horns':
      top = `<path d="M20 30l-6-16 10 6 1-8 5 16z" fill="${accent}" stroke="${ink}" stroke-width="2.5" stroke-linejoin="round"/><path d="M44 30l6-16-10 6-1-8-5 16z" fill="${accent}" stroke="${ink}" stroke-width="2.5" stroke-linejoin="round"/>`;
      break;
    case 'topper_propeller':
      top = `<path ${st} d="M32 30v-14"/><ellipse cx="22" cy="14" rx="10" ry="3.5" fill="${accent}" stroke="${ink}" stroke-width="2.5"/><ellipse cx="42" cy="14" rx="10" ry="3.5" fill="#F6C542" stroke="${ink}" stroke-width="2.5"/><circle cx="32" cy="14" r="3" fill="${ink}"/>`;
      break;
    case 'topper_halo':
      top = `<ellipse cx="32" cy="12" rx="16" ry="5" fill="none" stroke="#F6C542" stroke-width="5"/><ellipse cx="32" cy="12" rx="16" ry="5" fill="none" stroke="${ink}" stroke-width="1.5"/>`;
      break;
    case 'topper_crown':
      top = `<path d="M18 30l-3-18 9 7 8-12 8 12 9-7-3 18z" fill="#F6C542" stroke="${ink}" stroke-width="2.5" stroke-linejoin="round"/><circle cx="32" cy="22" r="2.5" fill="#E24B4B"/>`;
      break;
    default:
      top = '';
  }
  return `<svg viewBox="0 0 64 64" class="topper-svg" aria-hidden="true"><path d="M10 58c0-16 10-28 22-28s22 12 22 28z" fill="#E6E9E0" stroke="${ink}" stroke-width="3"/><rect x="18" y="44" width="28" height="8" rx="4" fill="${ink}"/><circle cx="25" cy="48" r="2" fill="#7ff3ff"/><circle cx="39" cy="48" r="2" fill="#7ff3ff"/>${top}</svg>`;
}

/** A thumbnail for any cosmetic id that does not need the 3D renderer (badges, toppers, titles, colours). */
export function itemThumb(app: App, id: string, cls = ''): HTMLElement {
  const d = COSMETIC_BY_ID[id];
  const c = app.save.club;
  if (!d) return h('span', { class: `rw-thumb ${cls}` }, icon('gift'));
  if (d.kind === 'badge') return h('span', { class: `rw-thumb badge-thumb ${cls}`, html: badgeSvg(id, colorHex(c.primary), colorHex(c.secondary)) });
  if (d.kind === 'topper') return h('span', { class: `rw-thumb ${cls}`, html: topperSvg(id, colorHex(c.primary)) });
  if (d.kind === 'color') return h('span', { class: `rw-thumb ${cls}` }, h('i', { class: 'color-dot', style: `background:${d.hex}` }));
  if (d.kind === 'title') return h('span', { class: `rw-thumb ${cls}` }, icon('star'));
  const ic: Record<string, string> = { face: 'face', pattern: 'shirt', trail: 'trail', celebration: 'party' };
  return h('span', { class: `rw-thumb ${cls}` }, icon(ic[d.kind] ?? 'gift'));
}
