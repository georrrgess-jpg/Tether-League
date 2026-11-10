export type CosmeticKind = 'face' | 'pattern' | 'trail' | 'celebration' | 'badge' | 'topper' | 'title' | 'color' | 'ball';

/**
 * How an item can be obtained.
 * - starter: owned from the start.
 * - shop: bought with credits (price in `credits`) or with a free pick; some also appear as track / mastery rewards.
 * - level / achievement / mastery: earned-only, granted by the Club Road, an achievement tier or chassis mastery.
 *   They can never be bought or picked.
 * - opponent: used by AI clubs only; never sold, never owned by the player.
 */
export type CosmeticUnlock = 'starter' | 'shop' | 'level' | 'achievement' | 'mastery' | 'opponent';

export interface CosmeticDef {
  id: string;
  kind: CosmeticKind;
  name: string;
  blurb: string;
  unlock: CosmeticUnlock;
  /** Shop price. Only meaningful when unlock is 'shop'; 0 otherwise. */
  credits: number;
  /** Colour items only: the swatch colour. */
  hex?: string;
}

const shop = (id: string, kind: CosmeticKind, name: string, blurb: string, credits: number): CosmeticDef => ({ id, kind, name, blurb, unlock: 'shop', credits });
const starter = (id: string, kind: CosmeticKind, name: string, blurb: string): CosmeticDef => ({ id, kind, name, blurb, unlock: 'starter', credits: 0 });
const earned = (unlock: 'level' | 'achievement' | 'mastery', id: string, kind: CosmeticKind, name: string, blurb: string, hex?: string): CosmeticDef => ({ id, kind, name, blurb, unlock, credits: 0, ...(hex ? { hex } : {}) });
const opponent = (id: string, name: string): CosmeticDef => ({ id, kind: 'badge', name, blurb: '', unlock: 'opponent', credits: 0 });

export const COSMETICS: CosmeticDef[] = [
  // Match balls (textures.ballMaps): the club's ball, used in its matches
  starter('ball_classic', 'ball', 'Classic Panels', 'The league ball: white panels, navy seams.'),
  // Faces (drawn by textures.drawFace)
  starter('face_basic', 'face', 'Basic Eyes', 'Friendly rounded eyes.'),
  shop('face_star', 'face', 'Star Face', 'Star-shaped eyes for big moments.', 160),
  shop('face_pixel', 'face', 'Pixel Smile', 'Chunky retro pixels with a grin.', 200),
  shop('face_visor', 'face', 'Focus Visor', 'One clean scanning bar.', 200),
  shop('face_cheeky', 'face', 'Cheeky Wink', 'One eye always winking.', 280),
  // Jersey patterns (drawn by textures.drawJersey)
  starter('pattern_plain', 'pattern', 'Plain Kit', 'Solid club colour.'),
  shop('pattern_stripe', 'pattern', 'Stripe Kit', 'Classic vertical stripes.', 160),
  shop('pattern_chevron', 'pattern', 'Chevron Kit', 'A bold V across the chest.', 200),
  shop('pattern_hoops', 'pattern', 'Hoop Kit', 'Horizontal hoops.', 200),
  shop('pattern_sash', 'pattern', 'Sash Kit', 'A diagonal sash.', 280),
  // Tether cables / trails (drawn by matchView)
  starter('trail_standard', 'trail', 'Standard Cable', 'Clean club-colour line.'),
  shop('trail_comet', 'trail', 'Comet Trail', 'A bright head with a tapering tail.', 400),
  shop('trail_spark', 'trail', 'Spark Ribbon', 'Twin ribbons with a crackle of sparks.', 480),
  shop('trail_aurora', 'trail', 'Aurora Wake', 'A soft two-tone glow.', 600),
  // Celebrations (robotView)
  starter('celebration_wave', 'celebration', 'Friendly Wave', 'A cheerful two-arm wave.'),
  shop('celebration_spin', 'celebration', 'Victory Spin', 'A full pirouette.', 400),
  shop('celebration_jacks', 'celebration', 'Jumping Jacks', 'Big star jumps.', 460),
  shop('celebration_dance', 'celebration', 'Robo Shuffle', 'A side-to-side shuffle.', 540),
  // Badges (ui/badge.ts)
  starter('badge_shield', 'badge', 'Harbor Shield', 'A lifebuoy on a shield.'),
  starter('badge_wave', 'badge', 'Tidal Crest', 'A rolling wave.'),
  starter('badge_bolt', 'badge', 'Bolt Crest', 'A lightning bolt.'),
  starter('badge_star', 'badge', 'Star Crest', 'A simple star.'),
  shop('badge_sunburst', 'badge', 'Sunburst Badge', 'A radiant sun.', 180),
  shop('badge_hook', 'badge', 'Hook Crest', 'A grappling hook on a rope.', 200),
  shop('badge_gull', 'badge', 'Harbor Gull', 'A gull in full glide.', 240),
  shop('badge_anchor', 'badge', 'Anchor Badge', 'The tether hook itself.', 260),
  shop('badge_orbit', 'badge', 'Orbit Ring', 'A ball circling its anchor.', 300),
  earned('level', 'badge_lighthouse', 'badge', 'Lighthouse', 'A beacon for a club on the rise.'),
  earned('level', 'badge_compass', 'badge', 'Compass Rose', 'For a club that knows where it is heading.'),
  earned('level', 'badge_knot', 'badge', 'Sailor Knot', 'A tether tied tight.'),
  earned('level', 'badge_laurel', 'badge', 'Laurel Wreath', 'Veteran honours.'),
  earned('level', 'badge_supernova', 'badge', 'Supernova', 'A burst of light for a star club.'),
  earned('level', 'badge_crown', 'badge', 'Crown Crest', 'Royalty of the Club Road.'),
  earned('achievement', 'badge_net', 'badge', 'Goal Net', 'Goal Getter, gold tier.'),
  earned('achievement', 'badge_glove', 'badge', 'Safe Hands', 'Safe Hands, gold tier.'),
  earned('achievement', 'badge_swirl', 'badge', 'Swing Swirl', 'Swing Artist, gold tier.'),
  earned('achievement', 'badge_medal', 'badge', 'Medal Crest', 'Golden Touch, gold tier.'),
  earned('achievement', 'badge_cup', 'badge', 'Cup Crest', 'Silverware, silver tier.'),
  earned('achievement', 'badge_chevrons', 'badge', 'Streak Chevrons', 'On a Roll, gold tier.'),
  earned('achievement', 'badge_link', 'badge', 'Chain Link', 'Provider, gold tier.'),
  earned('mastery', 'badge_cog', 'badge', 'Balance Cog', 'All-Rounder mastery 2.'),
  earned('mastery', 'badge_wing', 'badge', 'Scout Wing', 'Scout mastery 2.'),
  earned('mastery', 'badge_tower', 'badge', 'Bulwark Tower', 'Bulwark mastery 2.'),
  earned('mastery', 'badge_arc', 'badge', 'Glider Arc', 'Glider mastery 2.'),
  earned('mastery', 'badge_cog_master', 'badge', 'Master Cog', 'All-Rounder mastery 9.'),
  earned('mastery', 'badge_wing_master', 'badge', 'Master Wing', 'Scout mastery 9.'),
  earned('mastery', 'badge_tower_master', 'badge', 'Master Tower', 'Bulwark mastery 9.'),
  earned('mastery', 'badge_arc_master', 'badge', 'Master Arc', 'Glider mastery 9.'),
  // Toppers (head accessories; rendered by robotView; this exact set of ids only)
  starter('topper_none', 'topper', 'No Topper', 'Clean dome.'),
  starter('topper_antenna', 'topper', 'Signal Antenna', 'A springy antenna with a glowing tip.'),
  shop('topper_fin', 'topper', 'Aero Fin', 'A swept racing fin.', 240),
  shop('topper_headset', 'topper', 'Pro Headset', 'Over-ear headset with a mic boom.', 300),
  shop('topper_horns', 'topper', 'Bolt Horns', 'Two short lightning horns.', 360),
  shop('topper_propeller', 'topper', 'Propeller Cap', 'Spins when you swing.', 440),
  shop('topper_halo', 'topper', 'Hover Halo', 'A floating glowing ring.', 650),
  earned('level', 'topper_crown', 'topper', 'Champion Crown', 'Club Road level 40. Earned, not bought.'),
  // Club titles (shown under the club name)
  starter('title_newcomers', 'title', 'Newcomers', 'Every club starts somewhere.'),
  earned('level', 'title_upcomers', 'title', 'Up-and-Comers', 'Club Road level 3.'),
  earned('level', 'title_rope_runners', 'title', 'Rope Runners', 'Club Road level 11.'),
  earned('level', 'title_swing_society', 'title', 'Swing Society', 'Club Road level 17.'),
  earned('level', 'title_contenders', 'title', 'Contenders', 'Club Road level 24.'),
  earned('level', 'title_crowd_favourites', 'title', 'Crowd Favourites', 'Club Road level 31.'),
  earned('level', 'title_elite', 'title', 'Elite Squad', 'Club Road level 36.'),
  earned('level', 'title_legends', 'title', 'Legends of the Rope', 'Club Road level 39.'),
  earned('achievement', 'title_goal_machine', 'title', 'Goal Machine', 'Hat-trick Heroes, gold tier.'),
  earned('achievement', 'title_the_wall', 'title', 'The Wall', 'Brick Wall, gold tier.'),
  earned('achievement', 'title_comeback_kings', 'title', 'Comeback Kings', 'Comeback Kids, gold tier.'),
  earned('achievement', 'title_champions', 'title', 'Champions', 'Silverware, bronze tier.'),
  earned('achievement', 'title_overtime', 'title', 'Never Say Die', 'Sudden Death, gold tier.'),
  earned('achievement', 'title_globetrotters', 'title', 'Globetrotters', 'Home and Away, gold tier.'),
  earned('mastery', 'title_allround_spec', 'title', 'All-Round Specialists', 'All-Rounder mastery 5.'),
  earned('mastery', 'title_scout_spec', 'title', 'Scout Specialists', 'Scout mastery 5.'),
  earned('mastery', 'title_bulwark_spec', 'title', 'Bulwark Specialists', 'Bulwark mastery 5.'),
  earned('mastery', 'title_glider_spec', 'title', 'Glider Specialists', 'Glider mastery 5.'),
  earned('mastery', 'title_allround_master', 'title', 'All-Round Masters', 'All-Rounder mastery 10.'),
  earned('mastery', 'title_scout_master', 'title', 'Scout Masters', 'Scout mastery 10.'),
  earned('mastery', 'title_bulwark_master', 'title', 'Bulwark Masters', 'Bulwark mastery 10.'),
  earned('mastery', 'title_glider_master', 'title', 'Glider Masters', 'Glider mastery 10.'),
  // Earned club colours (the twelve CLUB_COLORS are free)
  earned('level', 'color_mint', 'color', 'Mint', 'Club Road level 12.', '#6FD9B5'),
  earned('level', 'color_chrome', 'color', 'Chrome', 'Club Road level 20.', '#AEB8C4'),
  earned('level', 'color_lava', 'color', 'Lava', 'Club Road level 27.', '#FF5A36'),
  earned('level', 'color_gold', 'color', 'Trophy Gold', 'Club Road level 30.', '#D9A520'),
  // Opponent-only badges (never sold)
  opponent('badge_gear', 'Gear'),
  opponent('badge_skyline', 'Skyline'),
  opponent('badge_comet', 'Comet'),
  opponent('badge_flame', 'Flame'),
];

/** Null-prototype lookup so ids such as "constructor" can never resolve to inherited members. */
export const COSMETIC_BY_ID: Record<string, CosmeticDef> = Object.assign(Object.create(null), Object.fromEntries(COSMETICS.map((c) => [c.id, c])));

export const STARTER_COSMETICS = COSMETICS.filter((c) => c.unlock === 'starter').map((c) => c.id);

/** Starter and shop items of a kind (what can be chosen at setup or bought). */
export function cosmeticsOfKind(kind: CosmeticKind): CosmeticDef[] {
  return COSMETICS.filter((c) => c.kind === kind && (c.unlock === 'starter' || c.unlock === 'shop'));
}

/** Every item of a kind the player could ever own: starter, shop and earned-only (never opponent-only). */
export function catalogOfKind(kind: CosmeticKind): CosmeticDef[] {
  return COSMETICS.filter((c) => c.kind === kind && c.unlock !== 'opponent');
}

/** True for items the player may own (anything but opponent-only). */
export const isOwnableCosmetic = (id: string): boolean => {
  const d = COSMETIC_BY_ID[id];
  return !!d && d.unlock !== 'opponent';
};

export const isEarnedOnly = (id: string): boolean => {
  const u = COSMETIC_BY_ID[id]?.unlock;
  return u === 'level' || u === 'achievement' || u === 'mastery';
};

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

/**
 * Earned colours: club colour id `x` is owned as cosmetic `color_x`. Kept out of CLUB_COLORS so the
 * first-run setup only offers the free palette.
 */
export const EARNED_COLORS: { id: string; name: string; hex: string; item: string }[] = COSMETICS.filter((c) => c.kind === 'color').map((c) => ({ id: c.id.slice(6), name: c.name, hex: c.hex!, item: c.id }));

export const colorHex = (id: string): string => CLUB_COLORS.find((c) => c.id === id)?.hex ?? EARNED_COLORS.find((c) => c.id === id)?.hex ?? '#12BCD2';

export interface RobotLook {
  chassis: 'all_rounder' | 'scout' | 'bulwark' | 'glider';
  primary: string;
  secondary: string;
  number: number;
  face: string;
  pattern: string;
  trail: string;
  celebration: string;
  /** Head accessory cosmetic id (see COSMETICS kind 'topper'); undefined or 'topper_none' = none. */
  topper?: string;
}
