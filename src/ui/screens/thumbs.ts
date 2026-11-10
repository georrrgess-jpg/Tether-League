import type { App } from '../../app';
import { COSMETIC_BY_ID, colorHex } from '../../content/cosmetics';
import { badgeSvg, topperSvg } from '../badge';
import { ballThumbDataUrl } from '../../game/render/textures';
import { h, icon } from '../dom';

// Topper thumbnails live with the badges (full set, kept in step with the 3D toppers).
export { topperSvg } from '../badge';

/** A thumbnail for any cosmetic id that does not need the 3D renderer (badges, toppers, titles, colours). */
export function itemThumb(app: App, id: string, cls = ''): HTMLElement {
  const d = COSMETIC_BY_ID[id];
  const c = app.save.club;
  if (!d) return h('span', { class: `rw-thumb ${cls}` }, icon('gift'));
  if (d.kind === 'badge') return h('span', { class: `rw-thumb badge-thumb ${cls}`, html: badgeSvg(id, colorHex(c.primary), colorHex(c.secondary)) });
  if (d.kind === 'topper') return h('span', { class: `rw-thumb ${cls}`, html: topperSvg(id, colorHex(c.primary)) });
  if (d.kind === 'color') return h('span', { class: `rw-thumb ${cls}` }, h('i', { class: 'color-dot', style: `background:${d.hex}` }));
  if (d.kind === 'title') return h('span', { class: `rw-thumb ${cls}` }, icon('star'));
  if (d.kind === 'ball') return ballThumb(id, `rw-thumb ${cls}`);
  const ic: Record<string, string> = { face: 'face', pattern: 'shirt', trail: 'trail', celebration: 'party' };
  return h('span', { class: `rw-thumb ${cls}` }, icon(ic[d.kind] ?? 'gift'));
}

/** Match ball thumbnail: the renderer's shaded preview sphere for the ball skin. */
export function ballThumb(id: string, cls = 'thumb ball'): HTMLElement {
  try {
    return h('img', { class: cls, src: ballThumbDataUrl(id, 128), alt: '', draggable: 'false' });
  } catch {
    return h('span', { class: `${cls} is-generic` }, icon('ball'));
  }
}
