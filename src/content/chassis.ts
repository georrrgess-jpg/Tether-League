export type ChassisId = 'all_rounder' | 'scout' | 'bulwark' | 'glider';

export interface ChassisDef {
  id: ChassisId;
  name: string;
  tagline: string;
  strength: string;
  weakness: string;
  credits: number;
  /** Club level that unlocks the chassis for free (0 = starter). */
  unlockLevel: number;
  /** Multipliers applied to the base robot tuning. Collision radius, kick reach and tether range are shared. */
  mod: {
    acceleration: number;
    braking: number;
    mass: number;
    /** <1 keeps release momentum longer, >1 loses it sooner. */
    releaseDrag: number;
    /** Swing acceleration multiplier. */
    swing: number;
    /** Steering authority while carrying momentum. */
    steer: number;
  };
}

export const CHASSIS: Record<ChassisId, ChassisDef> = {
  all_rounder: {
    id: 'all_rounder',
    name: 'All-Rounder',
    tagline: 'Balanced control',
    strength: 'Consistent control and contact in every situation.',
    weakness: 'No specialised advantage.',
    credits: 0,
    unlockLevel: 0,
    mod: { acceleration: 1, braking: 1, mass: 1, releaseDrag: 1, swing: 1, steer: 1 },
  },
  scout: {
    id: 'scout',
    name: 'Scout',
    tagline: 'Quick off the mark',
    strength: 'Fast acceleration, sharp stops and quick swing build-up.',
    weakness: 'Light in challenges and sheds release momentum sooner.',
    credits: 400,
    unlockLevel: 4,
    mod: { acceleration: 1.14, braking: 1.1, mass: 0.84, releaseDrag: 1.22, swing: 1.08, steer: 1.1 },
  },
  bulwark: {
    id: 'bulwark',
    name: 'Bulwark',
    tagline: 'Hard to shift',
    strength: 'Wins shoulder-to-shoulder challenges and holds a defensive line.',
    weakness: 'Slower to accelerate and recover. Still displaceable.',
    credits: 500,
    unlockLevel: 6,
    mod: { acceleration: 0.88, braking: 0.95, mass: 1.22, releaseDrag: 1, swing: 0.93, steer: 0.92 },
  },
  glider: {
    id: 'glider',
    name: 'Glider',
    tagline: 'Carries momentum',
    strength: 'Keeps release speed for longer, great for swing attacks.',
    weakness: 'Slow braking and wide turns.',
    credits: 500,
    unlockLevel: 8,
    mod: { acceleration: 0.95, braking: 0.8, mass: 0.95, releaseDrag: 0.72, swing: 1, steer: 0.82 },
  },
};

export const CHASSIS_ORDER: ChassisId[] = ['all_rounder', 'scout', 'bulwark', 'glider'];

/** Qualitative 0..1 bars derived from the real modifiers (shown in the garage). */
export function chassisBars(c: ChassisDef): { label: string; value: number }[] {
  const n = (v: number, lo: number, hi: number) => Math.max(0.08, Math.min(1, (v - lo) / (hi - lo)));
  return [
    { label: 'Acceleration', value: n(c.mod.acceleration, 0.7, 1.25) },
    { label: 'Handling', value: n((c.mod.braking + c.mod.steer) / 2, 0.65, 1.2) },
    { label: 'Stability', value: n(c.mod.mass, 0.65, 1.35) },
    { label: 'Momentum', value: n(1 / c.mod.releaseDrag, 0.65, 1.5) },
  ];
}
