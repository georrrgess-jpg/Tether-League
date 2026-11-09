/**
 * Central gameplay tuning. Every value here started from design/data/game_config.json and was then
 * adjusted through headless bot matches (tools/simulate.ts) and browser playtests.
 * See BUILD_STATUS.md for the list of deliberate changes.
 */
export const RULES_VERSION = 1;

export const TUNING = {
  sim: {
    hz: 60,
    substeps: 2,
    maxCatchupSteps: 5,
  },
  match: {
    regulationSeconds: 180,
    kickoffCountdown: 3,
    goalCountdown: 2,
    goalCelebration: 2.4,
    goalCelebrationMinSkip: 0.7,
    endHold: 1.6,
  },
  robot: {
    radius: 0.62,
    mass: 1,
    maxRunSpeed: 5.2,
    acceleration: 24,
    braking: 26,
    /** Deceleration while carrying more than run speed with input held (momentum retention). */
    carryDecel: 4.2,
    /** Deceleration above run speed with no input. */
    coastDecel: 8,
    /** Sideways steering authority while above run speed. */
    steerAccel: 13,
    bumpRestitution: 0.25,
  },
  tether: {
    acquisitionRange: 11.2,
    minLength: 2.4,
    maxLength: 11.2,
    maxHoldSeconds: 1.9,
    warnSeconds: 0.45,
    cooldownSeconds: 0.35,
    /** Passive reel-in while attached. */
    reelUnitsPerSecond: 1.2,
    /** Extra reel-in / pay-out when steering toward / away from the anchor. */
    steerReel: 3.4,
    maxSpeed: 10.5,
    /** Tangential acceleration while swinging (scaled 55%..100% by steering along the swing). */
    swingAccel: 10.5,
    /** Fraction of outward speed converted to swing speed when the rope first snaps taut. */
    snapConvert: 0.7,
    /** Minimum swing speed granted on attach so a stationary beginner starts moving. */
    startSpeed: 3.2,
    pressBuffer: 0.22,
  },
  ball: {
    radius: 0.42,
    mass: 0.35,
    maxSpeed: 18,
    wallRestitution: 0.82,
    netRestitution: 0.12,
    /** Exponential drag coefficient (1/s). */
    drag: 0.42,
    /** Constant rolling deceleration (units/s^2). */
    rolling: 0.55,
    robotRestitution: 0.3,
  },
  kick: {
    range: 1.48,
    cooldownSeconds: 0.28,
    inputBufferSeconds: 0.12,
    /** Ball speed from a standing kick. */
    baseSpeed: 8.6,
    /** Added ball speed per unit of robot speed toward the kick direction. */
    forwardVelocityFactor: 0.76,
    speedCap: 16.6,
    /** After kicking, the kicker does not collide with the ball for this long (prevents self-blocks). */
    ghostSeconds: 0.16,
    /** Assisted pass: speed = passBase + passPerUnit * distance (never above the natural kick speed). */
    passBase: 5.6,
    passPerUnit: 0.62,
  },
  assist: {
    /** Max aim correction (radians) for off / light / strong. */
    maxAngle: [0, 0.14, 0.3],
  },
  stats: {
    assistWindow: 6,
    saveDebounce: 1.5,
    passWindow: 4,
  },
} as const;

export const DT = 1 / TUNING.sim.hz;
