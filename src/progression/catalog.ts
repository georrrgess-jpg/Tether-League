import { CHASSIS, CHASSIS_ORDER } from '../content/chassis';
import { COSMETIC_BY_ID } from '../content/cosmetics';
import { ACHIEVEMENTS, MASTERY_MAX, ROAD_LENGTH, TIER_NAMES, masteryReward, roadReward } from '../content/progression';

/** Where an earned-only item comes from, for locked items in customisation and the Progress screen. */
export function itemSource(id: string): string {
  const d = COSMETIC_BY_ID[id];
  if (!d) return '';
  if (d.unlock === 'starter') return 'Starter item';
  if (d.unlock === 'opponent') return 'Not available';
  const parts: string[] = [];
  for (let l = 1; l <= ROAD_LENGTH; l++) {
    const r = roadReward(l);
    if (r.kind === 'item' && r.id === id) parts.push(`Club Road level ${l}`);
  }
  for (const a of ACHIEVEMENTS) {
    for (const [t, item] of Object.entries(a.items ?? {})) if (item === id) parts.push(`${a.name} achievement (${TIER_NAMES[Number(t)].toLowerCase()})`);
  }
  for (const c of CHASSIS_ORDER) {
    for (let l = 1; l <= MASTERY_MAX; l++) {
      const r = masteryReward(c, l);
      if (r.kind === 'item' && r.id === id) parts.push(`${CHASSIS[c].name} mastery ${l}`);
    }
  }
  if (d.unlock === 'shop') return parts.length ? `Shop, or free at ${parts.join(' / ')}` : 'Shop';
  return parts.length ? `Earned at ${parts.join(' / ')}` : 'Earned';
}
