import type { ArenaId } from './arenas';
import { CHASSIS, CHASSIS_ORDER, type ChassisId } from './chassis';

/**
 * Progression content: the Club Road (club level track), the XP curve, chassis mastery, club objectives
 * and achievements. Pure data; the rules that pay these out live in src/progression/.
 *
 * Target pacing (checked with tools/economy.ts against real bot matches through commitMatch):
 *   - levels 1-5: about one level per match; levels 6-15: one every 1-2 matches;
 *   - levels 16-30: one every 2-3 matches; levels 31-40: one every 3-4 matches;
 *   - level 40 after roughly 100-120 matches, then a credits reward every few matches for ever.
 */

// ---------------------------------------------------------------------------
// XP curve
// ---------------------------------------------------------------------------

/** XP needed to go from level n-1 to level n. */
export function xpForLevel(n: number): number {
  if (n <= 0) return 0;
  return Math.min(XP_STEP_CAP, XP_STEP_BASE + XP_STEP_GROWTH * (n - 1));
}
export const XP_STEP_BASE = 180;
export const XP_STEP_GROWTH = 22;
export const XP_STEP_CAP = 650;

// ---------------------------------------------------------------------------
// Club Road
// ---------------------------------------------------------------------------

export type TrackReward =
  | { kind: 'credits'; amount: number }
  | { kind: 'pick' }
  | { kind: 'chassis'; id: ChassisId; fallback: number }
  /** A cosmetic, title or colour. `fallback` credits are paid instead if it is already owned (bought). */
  | { kind: 'item'; id: string; fallback: number };

export const ROAD_LENGTH = 40;
export const ROAD_REPEAT_CREDITS = 120;

const chassisAt = (level: number): ChassisId | undefined => CHASSIS_ORDER.find((id) => CHASSIS[id].unlockLevel === level);

/** Levels 1..40. Chassis rewards follow CHASSIS[...].unlockLevel (4 / 6 / 8). */
const ROAD_TABLE: Record<number, TrackReward> = {
  1: { kind: 'pick' },
  2: { kind: 'credits', amount: 100 },
  3: { kind: 'item', id: 'title_upcomers', fallback: 0 },
  5: { kind: 'item', id: 'topper_fin', fallback: 140 },
  7: { kind: 'item', id: 'badge_lighthouse', fallback: 0 },
  9: { kind: 'credits', amount: 150 },
  10: { kind: 'pick' },
  11: { kind: 'item', id: 'title_rope_runners', fallback: 0 },
  12: { kind: 'item', id: 'color_mint', fallback: 0 },
  13: { kind: 'credits', amount: 150 },
  14: { kind: 'item', id: 'badge_compass', fallback: 0 },
  15: { kind: 'credits', amount: 150 },
  16: { kind: 'credits', amount: 175 },
  17: { kind: 'item', id: 'title_swing_society', fallback: 0 },
  18: { kind: 'item', id: 'topper_headset', fallback: 180 },
  19: { kind: 'credits', amount: 175 },
  20: { kind: 'item', id: 'color_chrome', fallback: 0 },
  21: { kind: 'pick' },
  22: { kind: 'item', id: 'badge_knot', fallback: 0 },
  23: { kind: 'credits', amount: 200 },
  24: { kind: 'item', id: 'title_contenders', fallback: 0 },
  25: { kind: 'item', id: 'topper_halo', fallback: 390 },
  26: { kind: 'credits', amount: 200 },
  27: { kind: 'item', id: 'color_lava', fallback: 0 },
  28: { kind: 'item', id: 'badge_laurel', fallback: 0 },
  29: { kind: 'credits', amount: 200 },
  30: { kind: 'item', id: 'color_gold', fallback: 0 },
  31: { kind: 'item', id: 'title_crowd_favourites', fallback: 0 },
  32: { kind: 'credits', amount: 225 },
  33: { kind: 'pick' },
  34: { kind: 'item', id: 'badge_supernova', fallback: 0 },
  35: { kind: 'credits', amount: 250 },
  36: { kind: 'item', id: 'title_elite', fallback: 0 },
  37: { kind: 'credits', amount: 250 },
  38: { kind: 'item', id: 'badge_crown', fallback: 0 },
  39: { kind: 'item', id: 'title_legends', fallback: 0 },
  40: { kind: 'item', id: 'topper_crown', fallback: 0 },
};

export function roadReward(level: number): TrackReward {
  const c = chassisAt(level);
  if (c) return { kind: 'chassis', id: c, fallback: 150 };
  if (level <= ROAD_LENGTH && ROAD_TABLE[level]) return ROAD_TABLE[level];
  return { kind: 'credits', amount: ROAD_REPEAT_CREDITS };
}

/** Milestone levels shown with extra emphasis on the track. */
export const ROAD_PRESTIGE = [10, 20, 30, 40];

// ---------------------------------------------------------------------------
// Chassis mastery
// ---------------------------------------------------------------------------

export const MASTERY_MAX = 10;
/** Mastery XP from one level to the next (level n needs masteryStep(n) more). */
export const masteryStep = (n: number): number => 150 + 50 * (n - 1);

export type MasteryReward = { kind: 'credits'; amount: number } | { kind: 'pick' } | { kind: 'item'; id: string; fallback: number };

const MASTERY_ITEMS: Record<ChassisId, { badge: string; master: string; spec: string; masterTitle: string; themed: string; themedFallback: number }> = {
  all_rounder: { badge: 'badge_cog', master: 'badge_cog_master', spec: 'title_allround_spec', masterTitle: 'title_allround_master', themed: 'face_visor', themedFallback: 120 },
  scout: { badge: 'badge_wing', master: 'badge_wing_master', spec: 'title_scout_spec', masterTitle: 'title_scout_master', themed: 'trail_comet', themedFallback: 240 },
  bulwark: { badge: 'badge_tower', master: 'badge_tower_master', spec: 'title_bulwark_spec', masterTitle: 'title_bulwark_master', themed: 'pattern_hoops', themedFallback: 120 },
  glider: { badge: 'badge_arc', master: 'badge_arc_master', spec: 'title_glider_spec', masterTitle: 'title_glider_master', themed: 'trail_aurora', themedFallback: 360 },
};

/** Cosmetic rewards only: chassis are sidegrades and mastery never changes how a chassis plays. */
export function masteryReward(chassis: ChassisId, level: number): MasteryReward {
  const m = MASTERY_ITEMS[chassis];
  switch (level) {
    case 1: return { kind: 'credits', amount: 50 };
    case 2: return { kind: 'item', id: m.badge, fallback: 0 };
    case 3: return { kind: 'credits', amount: 75 };
    case 4: return { kind: 'item', id: m.themed, fallback: m.themedFallback };
    case 5: return { kind: 'item', id: m.spec, fallback: 0 };
    case 6: return { kind: 'credits', amount: 100 };
    case 7: return { kind: 'pick' };
    case 8: return { kind: 'credits', amount: 125 };
    case 9: return { kind: 'item', id: m.master, fallback: 0 };
    default: return { kind: 'item', id: m.masterTitle, fallback: 0 };
  }
}

// ---------------------------------------------------------------------------
// Club objectives
// ---------------------------------------------------------------------------

export type ObjectiveTier = 'easy' | 'medium' | 'hard';

/** Values the simulation and commit path really record (see objectiveFacts in src/progression/objectives.ts). */
export type MatchMetric =
  | 'goals' | 'assists' | 'saves' | 'passes' | 'interceptions' | 'shots' | 'swingGoals' | 'swingKicks'
  | 'wins' | 'careerMatches' | 'careerWins' | 'cleanSheets' | 'comebackWins' | 'firstGoal' | 'winBy2' | 'winBy3'
  | 'hatTrick' | 'goalAndSave' | 'arenaWin' | 'teamGoals'
  | 'plays' | 'longBalls' | 'giveAndGos' | 'wallPasses' | 'oneTouchGoals';
export type TrialMetric = 'trialBronze' | 'trialSilver' | 'trialGold';

export interface ObjectiveDef {
  id: string;
  tier: ObjectiveTier;
  text: string;
  target: number;
  /** 'total' adds up over matches; 'match' needs the target inside one match. */
  scope: 'total' | 'match';
  source: 'match' | 'trial';
  metric: MatchMetric | TrialMetric;
  /** Only offered once this arena is unlocked; arenaWin counts wins there. */
  arena?: ArenaId;
}

export const OBJECTIVE_REWARD: Record<ObjectiveTier, { credits: number; xp: number }> = {
  easy: { credits: 10, xp: 40 },
  medium: { credits: 20, xp: 70 },
  hard: { credits: 40, xp: 110 },
};

/** One slot per tier, so there is always a quick win, a session goal and a longer chase. */
export const OBJECTIVE_SLOTS: ObjectiveTier[] = ['easy', 'medium', 'hard'];

const o = (id: string, tier: ObjectiveTier, text: string, metric: ObjectiveDef['metric'], target: number, scope: 'total' | 'match' = 'total', extra: Partial<ObjectiveDef> = {}): ObjectiveDef => ({
  id, tier, text, metric, target, scope, source: metric.startsWith('trial') ? 'trial' : 'match', ...extra,
});

export const OBJECTIVES: ObjectiveDef[] = [
  // easy: usually done within one or two matches
  o('e_goals2', 'easy', 'Score 2 goals', 'goals', 2),
  o('e_saves2', 'easy', 'Make 2 saves', 'saves', 2),
  o('e_passes5', 'easy', 'Complete 5 passes', 'passes', 5),
  o('e_win1', 'easy', 'Win a match', 'wins', 1),
  o('e_intercept3', 'easy', 'Make 3 interceptions', 'interceptions', 3),
  o('e_assist1', 'easy', 'Set up a goal with an assist', 'assists', 1),
  o('e_shots6', 'easy', 'Take 6 shots', 'shots', 6),
  o('e_career2', 'easy', 'Play 2 career matches', 'careerMatches', 2),
  o('e_play1', 'easy', 'Complete a play: long ball, give-and-go or wall pass', 'plays', 1),
  o('e_trial_bronze', 'easy', 'Earn a bronze medal or better in any trial', 'trialBronze', 1),
  o('e_team4', 'easy', 'Your team scores 4 goals', 'teamGoals', 4),
  // medium: a session's work
  o('m_swing2', 'medium', 'Score 2 swing goals', 'swingGoals', 2),
  o('m_longball2', 'medium', 'Complete 2 long balls', 'longBalls', 2),
  o('m_givego2', 'medium', 'Complete 2 give-and-goes', 'giveAndGos', 2),
  o('m_passes6', 'medium', 'Complete 6 passes in one match', 'passes', 6, 'match'),
  o('m_clean1', 'medium', 'Keep a clean sheet', 'cleanSheets', 1),
  o('m_saves3', 'medium', 'Make 3 saves in one match', 'saves', 3, 'match'),
  o('m_cwins2', 'medium', 'Win 2 career matches', 'careerWins', 2),
  o('m_foundry', 'medium', 'Win a match at Foundry Court', 'arenaWin', 1, 'total', { arena: 'foundry_court' }),
  o('m_trial_silver', 'medium', 'Earn a silver medal or better in any trial', 'trialSilver', 1),
  o('m_goals2m', 'medium', 'Score 2 goals in one match', 'goals', 2, 'match'),
  o('m_assist2', 'medium', 'Make 2 assists', 'assists', 2),
  o('m_first2', 'medium', 'Score the opening goal in 2 matches', 'firstGoal', 2),
  o('m_by2', 'medium', 'Win by 2 goals or more', 'winBy2', 1),
  o('m_swingkicks6', 'medium', 'Hit 6 swing kicks', 'swingKicks', 6),
  // hard: a longer chase
  o('h_hattrick', 'hard', 'Score a hat-trick', 'hatTrick', 1),
  o('h_wins3', 'hard', 'Win 3 matches', 'wins', 3),
  o('h_comeback', 'hard', 'Win a match after falling behind', 'comebackWins', 1),
  o('h_clean2', 'hard', 'Keep 2 clean sheets', 'cleanSheets', 2),
  o('h_trial_gold', 'hard', 'Earn a gold medal in any trial', 'trialGold', 1),
  o('h_goal_save', 'hard', 'Score and make a save in the same match, twice', 'goalAndSave', 2),
  o('h_passes10', 'hard', 'Complete 10 passes in one match', 'passes', 10, 'match'),
  o('h_saves8', 'hard', 'Make 8 saves', 'saves', 8),
  o('h_skyline', 'hard', 'Win a match at Skyline Stadium', 'arenaWin', 1, 'total', { arena: 'skyline_stadium' }),
  o('h_dome', 'hard', 'Win a match at the Championship Dome', 'arenaWin', 1, 'total', { arena: 'championship_dome' }),
  o('h_by3', 'hard', 'Win by 3 goals or more', 'winBy3', 1),
  o('h_swing4', 'hard', 'Score 4 swing goals', 'swingGoals', 4),
  o('h_plays3m', 'hard', 'Complete 3 plays in one match', 'plays', 3, 'match'),
  o('h_onetouch2', 'hard', 'Score 2 one-touch goals', 'oneTouchGoals', 2),
];

export const OBJECTIVE_BY_ID: Record<string, ObjectiveDef> = Object.assign(Object.create(null), Object.fromEntries(OBJECTIVES.map((d) => [d.id, d])));

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

/** Lifetime values (computed from save data in src/progression/achievements.ts). */
export type AchievementStat =
  | 'goals' | 'swingGoals' | 'assists' | 'passes' | 'saves' | 'interceptions' | 'shots' | 'wins' | 'matches'
  | 'bestStreak' | 'bestMargin' | 'bestGoals' | 'bestSaves' | 'cleanSheets' | 'comebackWins' | 'overtimeWins' | 'hatTricks'
  | 'longBalls' | 'giveAndGos' | 'wallPasses' | 'oneTouchGoals'
  | 'trophies' | 'topDivision' | 'seasons' | 'finals' | 'trialMedals' | 'trialGolds' | 'lessons'
  | 'clubLevel' | 'objectivesDone' | 'bestMastery' | 'totalMastery' | 'playoffs' | 'shopOwned' | 'arenasWon';

export interface AchievementDef {
  id: string;
  name: string;
  /** Description with {n} for the tier target and {one|many} for a word that follows it. */
  text: string;
  stat: AchievementStat;
  tiers: [number, number, number];
  /** Optional earned-only item granted with a tier (index 0 bronze .. 2 gold). */
  items?: Partial<Record<0 | 1 | 2, string>>;
}

export const ACHIEVEMENT_REWARD: [{ credits: number; xp: number }, { credits: number; xp: number }, { credits: number; xp: number }] = [
  { credits: 10, xp: 25 },
  { credits: 25, xp: 50 },
  { credits: 60, xp: 90 },
];

export const TIER_NAMES = ['Bronze', 'Silver', 'Gold'] as const;

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'goal_getter', name: 'Goal Getter', text: 'Score {n} goals', stat: 'goals', tiers: [10, 50, 150], items: { 2: 'badge_net' } },
  { id: 'swing_artist', name: 'Swing Artist', text: 'Score {n} swing {goal|goals}', stat: 'swingGoals', tiers: [3, 15, 50], items: { 2: 'badge_swirl' } },
  { id: 'provider', name: 'Provider', text: 'Make {n} {assist|assists}', stat: 'assists', tiers: [5, 25, 75], items: { 2: 'badge_link' } },
  { id: 'pass_master', name: 'Pass Master', text: 'Complete {n} passes', stat: 'passes', tiers: [40, 200, 600] },
  { id: 'safe_hands', name: 'Safe Hands', text: 'Make {n} saves', stat: 'saves', tiers: [15, 75, 200], items: { 2: 'badge_glove' } },
  { id: 'ball_hawk', name: 'Ball Hawk', text: 'Make {n} interceptions', stat: 'interceptions', tiers: [40, 200, 600] },
  { id: 'shot_taker', name: 'Shot Taker', text: 'Take {n} shots', stat: 'shots', tiers: [50, 250, 750] },
  { id: 'winner', name: 'Winning Habit', text: 'Win {n} {match|matches}', stat: 'wins', tiers: [5, 30, 90] },
  { id: 'regular', name: 'Club Regular', text: 'Play {n} {match|matches}', stat: 'matches', tiers: [10, 50, 150] },
  { id: 'on_a_roll', name: 'On a Roll', text: 'Win {n} matches in a row', stat: 'bestStreak', tiers: [3, 6, 10], items: { 2: 'badge_chevrons' } },
  { id: 'big_win', name: 'Statement Win', text: 'Win a match by {n} goals', stat: 'bestMargin', tiers: [3, 5, 7] },
  { id: 'sharpshooter', name: 'Sharpshooter', text: 'Score {n} goals in one match', stat: 'bestGoals', tiers: [3, 4, 5] },
  { id: 'last_line', name: 'Last Line', text: 'Make {n} saves in one match', stat: 'bestSaves', tiers: [3, 5, 7] },
  { id: 'brick_wall', name: 'Brick Wall', text: 'Keep {n} clean {sheet|sheets}', stat: 'cleanSheets', tiers: [1, 5, 15], items: { 2: 'title_the_wall' } },
  { id: 'comeback', name: 'Comeback Kids', text: 'Win {n} {match|matches} after falling behind', stat: 'comebackWins', tiers: [1, 4, 12], items: { 2: 'title_comeback_kings' } },
  { id: 'sudden_death', name: 'Sudden Death', text: 'Win {n} {match|matches} in overtime', stat: 'overtimeWins', tiers: [1, 4, 10], items: { 2: 'title_overtime' } },
  { id: 'long_range', name: 'Long Range', text: 'Complete {n} long {ball|balls}', stat: 'longBalls', tiers: [5, 25, 75] },
  { id: 'playmaker', name: 'Playmaker', text: 'Complete {n} {give-and-go|give-and-goes}', stat: 'giveAndGos', tiers: [3, 15, 50] },
  { id: 'wall_artist', name: 'Off the Wall', text: 'Complete {n} wall {pass|passes}', stat: 'wallPasses', tiers: [3, 15, 40] },
  { id: 'first_time', name: 'First Time', text: 'Score {n} one-touch {goal|goals}', stat: 'oneTouchGoals', tiers: [3, 15, 40] },
  { id: 'hat_tricks', name: 'Hat-trick Heroes', text: 'Score {n} {hat-trick|hat-tricks}', stat: 'hatTricks', tiers: [1, 3, 8], items: { 2: 'title_goal_machine' } },
  { id: 'silverware', name: 'Silverware', text: 'Win {n} division {trophy|trophies}', stat: 'trophies', tiers: [1, 3, 6], items: { 0: 'title_champions', 1: 'badge_cup' } },
  { id: 'climber', name: 'The Climb', text: 'Reach division {n} of 5', stat: 'topDivision', tiers: [2, 3, 5] },
  { id: 'seasoned', name: 'Seasoned', text: 'Complete {n} {season|seasons}', stat: 'seasons', tiers: [1, 4, 10] },
  { id: 'finalists', name: 'Big Occasions', text: 'Reach {n} playoff {final|finals}', stat: 'finals', tiers: [1, 3, 7] },
  { id: 'medallist', name: 'Medallist', text: 'Hold {n} trial medal tiers (bronze 1, silver 2, gold 3)', stat: 'trialMedals', tiers: [3, 9, 18] },
  { id: 'golden_touch', name: 'Golden Touch', text: 'Hold gold in {n} {trial|trials}', stat: 'trialGolds', tiers: [1, 3, 6], items: { 2: 'badge_medal' } },
  { id: 'graduate', name: 'Academy Graduate', text: 'Complete {n} {lesson|lessons}', stat: 'lessons', tiers: [1, 3, 5] },
  { id: 'road_trip', name: 'Club Road', text: 'Reach club level {n}', stat: 'clubLevel', tiers: [10, 25, 40] },
  { id: 'objective_hunter', name: 'Objective Hunter', text: 'Complete {n} club objectives', stat: 'objectivesDone', tiers: [5, 25, 75] },
  { id: 'specialist', name: 'Specialist', text: 'Reach mastery level {n} with one chassis', stat: 'bestMastery', tiers: [4, 7, 10] },
  { id: 'full_garage', name: 'Full Garage', text: 'Earn {n} mastery levels across all chassis', stat: 'totalMastery', tiers: [8, 20, 40] },
  { id: 'playoff_regular', name: 'Playoff Regular', text: 'Reach the playoffs {n} {time|times}', stat: 'playoffs', tiers: [1, 4, 10] },
  { id: 'wardrobe', name: 'Wardrobe', text: 'Own {n} shop cosmetics', stat: 'shopOwned', tiers: [4, 12, 24] },
  { id: 'home_away', name: 'Home and Away', text: 'Win at {n} different {arena|arenas}', stat: 'arenasWon', tiers: [1, 2, 4], items: { 2: 'title_globetrotters' } },
];

export const ACHIEVEMENT_BY_ID: Record<string, AchievementDef> = Object.assign(Object.create(null), Object.fromEntries(ACHIEVEMENTS.map((d) => [d.id, d])));

// ---------------------------------------------------------------------------
// Season prize money
// ---------------------------------------------------------------------------

/** Paid when a season completes, on top of the season-complete line and title bonuses. */
export const SEASON_PRIZE = {
  /** By final league position 1..6. */
  rank: [80, 60, 45, 30, 20, 10],
  stage: { champion: 80, finalist: 50, semifinalist: 25, missed: 0 },
  /** Division multiplier: 1 + perDivision * division index. */
  perDivision: 0.2,
};

export function seasonPrize(division: number, rank: number, stage: 'champion' | 'finalist' | 'semifinalist' | 'missed'): number {
  const base = SEASON_PRIZE.rank[Math.max(0, Math.min(5, rank - 1))] + SEASON_PRIZE.stage[stage];
  return Math.round((base * (1 + SEASON_PRIZE.perDivision * Math.max(0, division))) / 5) * 5;
}
