export type CosmeticKind = 'face' | 'pattern' | 'trail' | 'celebration' | 'badge';

export interface CosmeticDef {
  id: string;
  kind: CosmeticKind;
  name: string;
  blurb: string;
  /** 0 = owned from the start. */
  credits: number;
}

export const COSMETICS: CosmeticDef[] = [
  // Faces
  { id: 'face_basic', kind: 'face', name: 'Basic Eyes', blurb: 'Friendly rounded eyes.', credits: 0 },
  { id: 'face_star', kind: 'face', name: 'Star Face', blurb: 'Star-shaped eyes for big moments.', credits: 100 },
  { id: 'face_pixel', kind: 'face', name: 'Pixel Smile', blurb: 'Chunky retro pixels with a grin.', credits: 150 },
  { id: 'face_visor', kind: 'face', name: 'Focus Visor', blurb: 'One clean scanning bar.', credits: 150 },
  { id: 'face_cheeky', kind: 'face', name: 'Cheeky Wink', blurb: 'One eye always winking.', credits: 200 },
  // Jersey patterns
  { id: 'pattern_plain', kind: 'pattern', name: 'Plain Kit', blurb: 'Solid club colour.', credits: 0 },
  { id: 'pattern_stripe', kind: 'pattern', name: 'Stripe Kit', blurb: 'Classic vertical stripes.', credits: 100 },
  { id: 'pattern_chevron', kind: 'pattern', name: 'Chevron Kit', blurb: 'A bold V across the chest.', credits: 150 },
  { id: 'pattern_hoops', kind: 'pattern', name: 'Hoop Kit', blurb: 'Horizontal hoops.', credits: 150 },
  { id: 'pattern_sash', kind: 'pattern', name: 'Sash Kit', blurb: 'A diagonal sash.', credits: 200 },
  // Tether cables / trails
  { id: 'trail_standard', kind: 'trail', name: 'Standard Cable', blurb: 'Clean club-colour line.', credits: 0 },
  { id: 'trail_comet', kind: 'trail', name: 'Comet Trail', blurb: 'A bright head with a tapering tail.', credits: 250 },
  { id: 'trail_spark', kind: 'trail', name: 'Spark Ribbon', blurb: 'Twin ribbons with a crackle of sparks.', credits: 300 },
  { id: 'trail_aurora', kind: 'trail', name: 'Aurora Wake', blurb: 'A soft two-tone glow.', credits: 400 },
  // Celebrations
  { id: 'celebration_wave', kind: 'celebration', name: 'Friendly Wave', blurb: 'A cheerful two-arm wave.', credits: 0 },
  { id: 'celebration_spin', kind: 'celebration', name: 'Victory Spin', blurb: 'A full pirouette.', credits: 250 },
  { id: 'celebration_jacks', kind: 'celebration', name: 'Jumping Jacks', blurb: 'Big star jumps.', credits: 300 },
  { id: 'celebration_dance', kind: 'celebration', name: 'Robo Shuffle', blurb: 'A side-to-side shuffle.', credits: 350 },
  // Badges
  { id: 'badge_shield', kind: 'badge', name: 'Harbor Shield', blurb: 'A lifebuoy on a shield.', credits: 0 },
  { id: 'badge_wave', kind: 'badge', name: 'Tidal Crest', blurb: 'A rolling wave.', credits: 0 },
  { id: 'badge_bolt', kind: 'badge', name: 'Bolt Crest', blurb: 'A lightning bolt.', credits: 0 },
  { id: 'badge_star', kind: 'badge', name: 'Star Crest', blurb: 'A simple star.', credits: 0 },
  { id: 'badge_sunburst', kind: 'badge', name: 'Sunburst Badge', blurb: 'A radiant sun.', credits: 150 },
  { id: 'badge_anchor', kind: 'badge', name: 'Anchor Badge', blurb: 'The tether hook itself.', credits: 200 },
  // Opponent-only badges (never sold)
  { id: 'badge_gear', kind: 'badge', name: 'Gear', blurb: '', credits: -1 },
  { id: 'badge_skyline', kind: 'badge', name: 'Skyline', blurb: '', credits: -1 },
  { id: 'badge_comet', kind: 'badge', name: 'Comet', blurb: '', credits: -1 },
  { id: 'badge_flame', kind: 'badge', name: 'Flame', blurb: '', credits: -1 },
];

/** Null-prototype lookup so ids such as "constructor" can never resolve to inherited members. */
export const COSMETIC_BY_ID: Record<string, CosmeticDef> = Object.assign(Object.create(null), Object.fromEntries(COSMETICS.map((c) => [c.id, c])));

export const STARTER_COSMETICS = COSMETICS.filter((c) => c.credits === 0).map((c) => c.id);

export function cosmeticsOfKind(kind: CosmeticKind): CosmeticDef[] {
  return COSMETICS.filter((c) => c.kind === kind && c.credits >= 0);
}

/** Club colours offered at setup and in customisation. Names accompany every swatch. */
export const CLUB_COLORS: { id: string; name: string; hex: string }[] = [
  { id: 'cyan', name: 'Harbor Cyan', hex: '#12BCD2' },
  { id: 'blue', name: 'Deep Blue', hex: '#2F6FE4' },
  { id: 'violet', name: 'Violet', hex: '#8A5CF0' },
  { id: 'pink', name: 'Coral Pink', hex: '#EC5F8E' },
  { id: 'red', name: 'Signal Red', hex: '#E24B4B' },
  { id: 'orange', name: 'Ember Orange', hex: '#F48A2C' },
  { id: 'yellow', name: 'Sun Yellow', hex: '#F2C230' },
  { id: 'green', name: 'Pitch Green', hex: '#3FB86B' },
  { id: 'teal', name: 'Tide Teal', hex: '#1E9C8E' },
  { id: 'navy', name: 'Night Navy', hex: '#24395C' },
  { id: 'ivory', name: 'Ivory', hex: '#F1EEE3' },
  { id: 'plum', name: 'Plum', hex: '#7A3B74' },
];

export const colorHex = (id: string): string => CLUB_COLORS.find((c) => c.id === id)?.hex ?? '#12BCD2';

export interface RobotLook {
  chassis: 'all_rounder' | 'scout' | 'bulwark' | 'glider';
  primary: string;
  secondary: string;
  number: number;
  face: string;
  pattern: string;
  trail: string;
  celebration: string;
}
