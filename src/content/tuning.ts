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
    /** Deceleration while carrying more than run speed (momentum retention). */
    carryDecel: 3.2,
    /** Deceleration above run speed with no input, once the launch window has passed. */
    coastDecel: 4.5,
    /** Right after a tether release the robot keeps its launch speed almost fully for this long. */
    launchWindow: 0.5,
    /** Deceleration during the launch window (applies with or without input). */
    launchDecel: 1.3,
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
    /** Passive reel-in while attached. Shortening the rope speeds the swing up (angular momentum). */
    reelUnitsPerSecond: 1.5,
    maxSpeed: 12.2,
    /** Tangential acceleration while swinging. Movement input does not brake or steer a swing. */
    swingAccel: 13,
    /** Fraction of outward speed converted to swing speed when the rope first snaps taut. */
    snapConvert: 0.85,
    /** Minimum swing speed granted on attach so a stationary robot is immediately moving. */
    startSpeed: 5.5,
    pressBuffer: 0.22,
  },
  ball: {
    radius: 0.42,
    mass: 0.35,
    maxSpeed: 18,
    wallRestitution: 0.9,
    /** Lively walls: a real impact (normal speed above wallBoostMin) leaves the wall this much faster. */
    wallBoost: 1.3,
    wallBoostMin: 2.2,
    netRestitution: 0.12,
    /** Posts keep their old, deader bounce. */
    postRestitution: 0.74,
    /** Lofted balls (long ball): gravity, air drag and the first bounce. */
    gravity: 24,
    airDrag: 0.12,
    /** Above this height a lofted ball flies over robots. */
    headHeight: 1.3,
    /** A lofted ball above this height cannot enter the goal; it comes back off the frame. */
    crossbar: 2.1,
    bounceRestitution: 0.36,
    /** Horizontal speed kept on a landing bounce, so a long ball sits down near its target. */
    landingFriction: 0.6,
    bounceMin: 2,
    /** Exponential drag coefficient (1/s). */
    drag: 0.42,
    /** Constant rolling deceleration (units/s^2). */
    rolling: 0.55,
    robotRestitution: 0.12,
  },
  kick: {
    range: 1.48,
    cooldownSeconds: 0.28,
    inputBufferSeconds: 0.16,
    /** Ball speed from a standing kick. */
    baseSpeed: 8.2,
    /** Added ball speed per unit of robot speed toward the kick direction. */
    forwardVelocityFactor: 0.76,
    speedCap: 16.2,
    /** After kicking, the kicker does not collide with the ball for this long (prevents self-blocks). */
    ghostSeconds: 0.16,
    /** Assisted pass: speed = passBase + passPerUnit * distance (never above the natural kick speed). */
    passBase: 5.6,
    passPerUnit: 0.62,
    /** The pass button buffers a little longer than a kick so it can be pressed just before the ball arrives. */
    passBufferSeconds: 0.22,
    /** Kick-button mashing: each press adds 1, decaying at this rate per second. */
    mashDecay: 3.2,
    /** Above this level a kick is "rushed": weaker and less accurate. A deliberate press or double tap stays below. */
    mashThreshold: 2.6,
    rushedPower: 0.5,
    /** Cooldown after a rushed kick: a masher cannot chain pokes. */
    rushedCooldown: 0.95,
    /** Max aim error of a rushed kick (radians). */
    rushedError: 0.4,
    /** Kicking against your own running direction keeps this share of the base speed. */
    backwardPower: 0.72,
    /** How far ahead (seconds of teammate movement, capped) a pass is led. */
    passLeadMax: 0.6,
    /** A pass whose straight lane an opponent blocks is banked off a side wall when that lane is clear. */
    bankLaneWidth: 1.15,
    /** Extra pace on a banked pass over the straight-pass formula for its route length. */
    bankExtra: 0.8,
    /** Shooting first time off a teammate's pass (within this many seconds) adds power. */
    oneTouchWindow: 1.4,
    oneTouchBonus: 1.14,
    /** A kick can only meet a ball below this height. */
    reachHeight: 1.0,
    /** Long ball: charge 0..1 maps to a carry of lobMin..lobMax units. */
    lobMin: 6,
    lobMax: 24,
    /** Releasing within this much of the ideal charge is a perfect long ball (lands on the target). */
    lobPerfect: 0.07,
    /** Max sideways error (radians) of a badly weighted long ball. */
    lobMaxError: 0.14,
    /** A long ball is led this far (seconds of the receiver's movement, capped). */
    lobLeadMax: 0.9,
    /** PASS input: released before this (seconds) it is a ground pass; held longer it charges a long ball. */
    lobHoldSeconds: 0.18,
    /** Seconds of holding (after lobHoldSeconds) to reach full long-ball charge. */
    lobChargeSeconds: 1.0,
    /** Give-and-go: the return pass is led this far into the runner's path. */
    giveGoLead: 0.85,
    /** A return pass within this many seconds of the first pass completes a give-and-go. */
    giveGoWindow: 4,
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
