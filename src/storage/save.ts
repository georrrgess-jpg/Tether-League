import { newSeason, validCareer, type CareerState, type SeasonResult } from '../career/career';
import { ARENA_ORDER, type ArenaId } from '../content/arenas';
import { CHASSIS, CHASSIS_ORDER, type ChassisId } from '../content/chassis';
import { CLUB_COLORS, COSMETIC_BY_ID, EARNED_COLORS, STARTER_COSMETICS, isOwnableCosmetic } from '../content/cosmetics';
import { DIVISIONS } from '../content/clubs';
import { ACHIEVEMENT_BY_ID, MASTERY_MAX, OBJECTIVE_BY_ID, roadReward, type ObjectiveTier } from '../content/progression';
import { LESSONS, TRIALS, type TrialId } from '../content/trials';
import { hashString } from '../game/sim/rng';
import { settleAchievements } from '../progression/achievements';
import { ensureObjectives } from '../progression/objectives';
import { grantChassis, grantItem, legacyLevelValue, legacyThreshold, levelFor, levelThreshold } from '../progression/road';
import { defaultSettings, sanitizeSettings, type Settings } from './settings';

/**
 * Versioned save data. One complete snapshot is written at a time; the previous valid snapshot is kept
 * so a failed or corrupted write never erases a working save.
 */
export const SAVE_VERSION = 2;
const KEY = 'tether-league/save';
const KEY_PREV = 'tether-league/save.prev';
const KEY_NEXT = 'tether-league/save.next';

export interface ClubProfile {
  name: string;
  badge: string;
  /** Colour ids from CLUB_COLORS. */
  primary: string;
  secondary: string;
  numbers: [number, number];
  chassis: ChassisId;
  mateChassis: ChassisId;
  face: string;
  pattern: string;
  trail: string;
  celebration: string;
  /** Head accessory (cosmetic kind 'topper'). */
  topper: string;
  /** Club title (cosmetic kind 'title'), shown under the club name. */
  title: string;
}

export interface Records {
  matches: number;
  wins: number;
  goals: number;
  assists: number;
  saves: number;
  passes: number;
  interceptions: number;
  swingGoals: number;
  bestGoals: number;
  bestSaves: number;
  bestMargin: number;
  streak: number;
  bestStreak: number;
  /** Lifetime counters added in save version 2 (start at 0 for migrated saves). */
  shots: number;
  cleanSheets: number;
  overtimeWins: number;
  comebackWins: number;
  hatTricks: number;
  careerWins: number;
}

export interface ActiveObjective {
  /** Draw number (unique per save). */
  uid: number;
  id: string;
  progress: number;
}

/** Club objectives, achievements and chassis mastery (save version 2). */
export interface ProgressState {
  /** Exactly three, in slot order easy / medium / hard. */
  objectives: ActiveObjective[];
  objectiveSeed: number;
  /** Number of objectives drawn so far; feeds the seeded draw. */
  objectiveSeq: number;
  objectivesDone: number;
  /** Free objective swaps available (0 or 1; refilled by each completed match). */
  rerolls: number;
  /** Highest tier paid per achievement id (0..3). */
  achievements: Record<string, number>;
  /** Mastery XP per chassis (the player's own robot only). */
  mastery: Record<ChassisId, number>;
  /** Highest mastery level paid per chassis. */
  masteryClaimed: Record<ChassisId, number>;
  /** Wins per arena. */
  arenaWins: Partial<Record<ArenaId, number>>;
}

export interface TrialRecord {
  best: number | null;
  medal: 0 | 1 | 2 | 3;
  /** Highest medal tier already paid out. */
  rewarded: 0 | 1 | 2 | 3;
  attempts: number;
  rulesVersion: number;
}

export type RewardSource = 'match' | 'season' | 'objective' | 'achievement' | 'mastery' | 'trial' | 'lesson';

export interface RewardLine {
  label: string;
  credits: number;
  xp: number;
  /** What paid it (absent on version-1 records: treated as 'match'). */
  source?: RewardSource;
}

export const GRANT_KINDS = ['pick', 'credits', 'chassis', 'arena', 'trophy', 'item'] as const;

export interface Grant {
  kind: (typeof GRANT_KINDS)[number];
  label: string;
  detail: string;
  /** Cosmetic id for 'item' grants. */
  item?: string;
}

export interface ObjectiveStep {
  id: string;
  text: string;
  tier: ObjectiveTier;
  before: number;
  after: number;
  target: number;
  done: boolean;
}

export interface AchievementStep {
  id: string;
  name: string;
  tier: 1 | 2 | 3;
}

export interface MasteryStep {
  chassis: ChassisId;
  gained: number;
  levelBefore: number;
  levelAfter: number;
}

/** What a commit moved besides the reward lines: shown on result screens, never used to pay. */
export interface ProgressReport {
  objectives: ObjectiveStep[];
  achievements: AchievementStep[];
  mastery: MasteryStep | null;
  levelBefore: number;
  levelAfter: number;
}

export const emptyReport = (level = 0): ProgressReport => ({ objectives: [], achievements: [], mastery: null, levelBefore: level, levelAfter: level });

/** Immutable record of a completed match, built once when the result is committed. */
export interface CommittedResult {
  matchId: string;
  kind: 'career' | 'playoff' | 'quick';
  label: string;
  arena: ArenaId;
  opponentId: string;
  opponent: string;
  score: [number, number];
  won: boolean;
  overtime: boolean;
  stats: { goals: number; assists: number; saves: number; passes: number; interceptions: number; shots: number; swingKicks: number; ownGoals: number };
  mateGoals: number;
  title: string;
  rewards: RewardLine[];
  credits: number;
  xp: number;
  xpBefore: number;
  grants: Grant[];
  newRecords: string[];
  seasonComplete: boolean;
  /** Objectives, achievement tiers, mastery and club levels this match moved. */
  progress: ProgressReport;
  at: number;
}

export interface Trophy {
  division: number;
  seasonNo: number;
}

export interface Prefs {
  tendency: 'supportive' | 'aggressive' | 'defensive';
  quickDifficulty: 'rookie' | 'club' | 'pro';
  quickArena: ArenaId;
  quickOpponent: string;
  quickMinutes: number;
  relaxed: boolean;
}

export interface SaveGame {
  version: number;
  createdAt: number;
  updatedAt: number;
  club: ClubProfile;
  settings: Settings;
  credits: number;
  xp: number;
  /** Cosmetic ids and `chassis:<id>` entries. */
  owned: string[];
  /** Unspent free cosmetic picks from club milestones. */
  picks: number;
  /** Club levels whose reward has been granted. */
  claimedLevels: number[];
  career: CareerState;
  seasons: SeasonResult[];
  trophies: Trophy[];
  records: Records;
  trials: Partial<Record<TrialId, TrialRecord>>;
  lessons: string[];
  flags: Record<string, boolean>;
  /** Recent committed match ids (idempotency ledger). */
  committed: string[];
  results: CommittedResult[];
  prefs: Prefs;
  matchSeq: number;
  progress: ProgressState;
}

export function defaultClub(): ClubProfile {
  return {
    name: 'Harbor Sparks',
    badge: 'badge_shield',
    primary: 'cyan',
    secondary: 'navy',
    numbers: [7, 11],
    chassis: 'all_rounder',
    mateChassis: 'all_rounder',
    face: 'face_basic',
    pattern: 'pattern_plain',
    trail: 'trail_standard',
    celebration: 'celebration_wave',
    topper: 'topper_antenna',
    title: 'title_newcomers',
  };
}

export function emptyRecords(): Records {
  return {
    matches: 0, wins: 0, goals: 0, assists: 0, saves: 0, passes: 0, interceptions: 0, swingGoals: 0, bestGoals: 0, bestSaves: 0, bestMargin: 0, streak: 0, bestStreak: 0,
    shots: 0, cleanSheets: 0, overtimeWins: 0, comebackWins: 0, hatTricks: 0, careerWins: 0,
  };
}

const perChassis = (): Record<ChassisId, number> => ({ all_rounder: 0, scout: 0, bulwark: 0, glider: 0 });

export function emptyProgress(seed: number): ProgressState {
  return { objectives: [], objectiveSeed: seed >>> 0, objectiveSeq: 0, objectivesDone: 0, rerolls: 0, achievements: {}, mastery: perChassis(), masteryClaimed: perChassis(), arenaWins: {} };
}

export function newSave(club: ClubProfile = defaultClub(), settings: Settings = defaultSettings(), seed = (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0): SaveGame {
  const now = Date.now();
  const save: SaveGame = {
    version: SAVE_VERSION,
    createdAt: now,
    updatedAt: now,
    club,
    settings,
    credits: 0,
    xp: 0,
    owned: [...STARTER_COSMETICS, 'chassis:all_rounder'],
    picks: 0,
    claimedLevels: [],
    career: newSeason(0, 1, seed),
    seasons: [],
    trophies: [],
    records: emptyRecords(),
    trials: {},
    lessons: [],
    flags: {},
    committed: [],
    results: [],
    prefs: { tendency: 'supportive', quickDifficulty: 'rookie', quickArena: 'harbor_park', quickOpponent: 'ember_works', quickMinutes: 3, relaxed: false },
    matchSeq: 0,
    progress: emptyProgress(hashString(`objectives-${seed}`)),
  };
  ensureObjectives(save);
  return save;
}

// ---------------------------------------------------------------------------
// validation
// ---------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const int = (v: unknown, lo: number, hi: number, def: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : def);
const str = (v: unknown, def: string, max = 40): string => (typeof v === 'string' && v.length <= max ? v : def);

export function cleanClubName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const n = name.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 18);
  return n.length >= 2 ? n : 'Harbor Sparks';
}

function sanitizeClub(raw: unknown, owned: string[]): ClubProfile {
  const d = defaultClub();
  if (!isObj(raw)) return d;
  const colorOk = (v: unknown, def: string) => (typeof v === 'string' && (CLUB_COLORS.some((c) => c.id === v) || EARNED_COLORS.some((c) => c.id === v && owned.includes(c.item))) ? v : def);
  const cos = (v: unknown, kind: string, def: string) => (typeof v === 'string' && COSMETIC_BY_ID[v]?.kind === kind && owned.includes(v) ? v : def);
  const chassis = (v: unknown): ChassisId => (typeof v === 'string' && Object.hasOwn(CHASSIS, v) && owned.includes(`chassis:${v}`) ? (v as ChassisId) : 'all_rounder');
  const nums = Array.isArray(raw.numbers) ? raw.numbers : [];
  let n0 = int(nums[0], 0, 99, 7);
  const n1 = int(nums[1], 0, 99, 11);
  if (n0 === n1) n0 = (n1 + 1) % 100;
  let primary = colorOk(raw.primary, d.primary);
  const secondary = colorOk(raw.secondary, d.secondary);
  if (primary === secondary) primary = primary === 'cyan' ? 'navy' : 'cyan';
  return {
    name: cleanClubName(str(raw.name, d.name, 60)),
    badge: cos(raw.badge, 'badge', d.badge),
    primary,
    secondary,
    numbers: [n0, n1],
    chassis: chassis(raw.chassis),
    mateChassis: chassis(raw.mateChassis),
    face: cos(raw.face, 'face', d.face),
    pattern: cos(raw.pattern, 'pattern', d.pattern),
    trail: cos(raw.trail, 'trail', d.trail),
    celebration: cos(raw.celebration, 'celebration', d.celebration),
    topper: cos(raw.topper, 'topper', d.topper),
    title: cos(raw.title, 'title', d.title),
  };
}

function sanitizeResult(raw: unknown): CommittedResult | null {
  if (!isObj(raw) || typeof raw.matchId !== 'string') return null;
  const score = Array.isArray(raw.score) ? raw.score : [];
  const st = isObj(raw.stats) ? raw.stats : {};
  const lines = Array.isArray(raw.rewards) ? raw.rewards : [];
  const grants = Array.isArray(raw.grants) ? raw.grants : [];
  return {
    matchId: raw.matchId.slice(0, 80),
    kind: raw.kind === 'career' || raw.kind === 'playoff' ? raw.kind : 'quick',
    label: str(raw.label, '', 60),
    arena: ARENA_ORDER.includes(raw.arena as ArenaId) ? (raw.arena as ArenaId) : 'harbor_park',
    opponentId: str(raw.opponentId, '', 40),
    opponent: str(raw.opponent, 'Opponent', 40),
    score: [int(score[0], 0, 99, 0), int(score[1], 0, 99, 0)],
    won: raw.won === true,
    overtime: raw.overtime === true,
    stats: {
      goals: int(st.goals, 0, 99, 0), assists: int(st.assists, 0, 99, 0), saves: int(st.saves, 0, 99, 0), passes: int(st.passes, 0, 999, 0),
      interceptions: int(st.interceptions, 0, 999, 0), shots: int(st.shots, 0, 999, 0), swingKicks: int(st.swingKicks, 0, 999, 0), ownGoals: int(st.ownGoals, 0, 99, 0),
    },
    mateGoals: int(raw.mateGoals, 0, 99, 0),
    title: str(raw.title, '', 30),
    rewards: lines.filter(isObj).slice(0, 40).map((l) => ({ label: str(l.label, '', 80), credits: int(l.credits, 0, 9999, 0), xp: int(l.xp, 0, 9999, 0), source: REWARD_SOURCES.includes(l.source as RewardSource) ? (l.source as RewardSource) : 'match' })),
    credits: int(raw.credits, 0, 99999, 0),
    xp: int(raw.xp, 0, 99999, 0),
    xpBefore: int(raw.xpBefore, 0, 9999999, 0),
    grants: grants.filter(isObj).slice(0, 40).map((g) => {
      const kind = GRANT_KINDS.includes(g.kind as Grant['kind']) ? (g.kind as Grant['kind']) : 'credits';
      const out: Grant = { kind, label: str(g.label, '', 60), detail: str(g.detail, '', 120) };
      if (kind === 'item' && typeof g.item === 'string' && isOwnableCosmetic(g.item)) out.item = g.item;
      return out;
    }),
    newRecords: (Array.isArray(raw.newRecords) ? raw.newRecords : []).filter((x): x is string => typeof x === 'string').slice(0, 6).map((x) => x.slice(0, 60)),
    seasonComplete: raw.seasonComplete === true,
    progress: sanitizeReport(raw.progress),
    at: int(raw.at, 0, 8e15, 0),
  };
}

const REWARD_SOURCES: RewardSource[] = ['match', 'season', 'objective', 'achievement', 'mastery', 'trial', 'lesson'];

function sanitizeReport(raw: unknown): ProgressReport {
  if (!isObj(raw)) return emptyReport();
  const objectives: ObjectiveStep[] = [];
  for (const o of (Array.isArray(raw.objectives) ? raw.objectives : []).slice(0, 12)) {
    if (!isObj(o) || typeof o.id !== 'string' || !OBJECTIVE_BY_ID[o.id]) continue;
    const def = OBJECTIVE_BY_ID[o.id];
    objectives.push({ id: def.id, text: def.text, tier: def.tier, before: int(o.before, 0, def.target, 0), after: int(o.after, 0, def.target, 0), target: def.target, done: o.done === true });
  }
  const achievements: AchievementStep[] = [];
  for (const a of (Array.isArray(raw.achievements) ? raw.achievements : []).slice(0, 40)) {
    if (!isObj(a) || typeof a.id !== 'string' || !ACHIEVEMENT_BY_ID[a.id]) continue;
    achievements.push({ id: a.id, name: ACHIEVEMENT_BY_ID[a.id].name, tier: int(a.tier, 1, 3, 1) as 1 | 2 | 3 });
  }
  let mastery: MasteryStep | null = null;
  if (isObj(raw.mastery) && typeof raw.mastery.chassis === 'string' && Object.hasOwn(CHASSIS, raw.mastery.chassis)) {
    const m = raw.mastery;
    mastery = { chassis: m.chassis as ChassisId, gained: int(m.gained, 0, 99999, 0), levelBefore: int(m.levelBefore, 0, MASTERY_MAX, 0), levelAfter: int(m.levelAfter, 0, MASTERY_MAX, 0) };
  }
  return { objectives, achievements, mastery, levelBefore: int(raw.levelBefore, 0, 100000, 0), levelAfter: int(raw.levelAfter, 0, 100000, 0) };
}

function sanitizeProgress(raw: unknown, seedFallback: number): ProgressState {
  const p = isObj(raw) ? raw : {};
  const out = emptyProgress(typeof p.objectiveSeed === 'number' && Number.isInteger(p.objectiveSeed) && p.objectiveSeed >= 0 && p.objectiveSeed <= 0xffffffff ? p.objectiveSeed : hashString(`objectives-${seedFallback}`));
  out.objectiveSeq = int(p.objectiveSeq, 0, 99999999, 0);
  out.objectivesDone = int(p.objectivesDone, 0, 9999999, 0);
  out.rerolls = int(p.rerolls, 0, 1, 0);
  const seen = new Set<string>();
  for (const o of (Array.isArray(p.objectives) ? p.objectives : []).slice(0, 3)) {
    if (!isObj(o) || typeof o.id !== 'string' || !OBJECTIVE_BY_ID[o.id] || seen.has(o.id)) continue;
    seen.add(o.id);
    const def = OBJECTIVE_BY_ID[o.id];
    out.objectives.push({ uid: int(o.uid, 0, 99999999, 0), id: def.id, progress: int(o.progress, 0, def.target - 1, 0) });
  }
  const ach = isObj(p.achievements) ? p.achievements : {};
  for (const id of Object.keys(ach)) if (ACHIEVEMENT_BY_ID[id]) {
    const t = int(ach[id], 0, 3, 0);
    if (t > 0) out.achievements[id] = t;
  }
  const m = isObj(p.mastery) ? p.mastery : {};
  const mc = isObj(p.masteryClaimed) ? p.masteryClaimed : {};
  for (const id of CHASSIS_ORDER) {
    out.mastery[id] = int(m[id], 0, 9999999, 0);
    out.masteryClaimed[id] = int(mc[id], 0, MASTERY_MAX, 0);
  }
  const aw = isObj(p.arenaWins) ? p.arenaWins : {};
  for (const a of ARENA_ORDER) {
    const n = int(aw[a], 0, 9999999, 0);
    if (n > 0) out.arenaWins[a] = n;
  }
  return out;
}

/**
 * Version 1 -> 2: the Club Road replaces the old level rewards.
 * - Levels a v1 save had claimed are carried onto the new track: every new level whose threshold is at or
 *   below the XP of the highest old claimed level counts as claimed. Their item and chassis rewards are
 *   granted; credits and picks are topped up only by the amount the new levels exceed what the old ones
 *   paid, so nothing is paid twice and nothing already received is taken away. Later levels pay normally
 *   at the next commit.
 * - Achievement tiers already met by the existing records are marked earned and their items granted, but
 *   their credits / XP are not paid retroactively (the counters added in v2 start from zero).
 * - Objectives are seeded from the save's creation time; mastery starts from nothing.
 */
function migrateToV2(save: SaveGame): void {
  const old = save.claimedLevels;
  if (old.length) {
    const top = legacyThreshold(Math.max(...old));
    const reach = levelFor(Math.min(save.xp, top));
    let oldCredits = 0;
    let oldPicks = 0;
    for (const l of old) {
      const v = legacyLevelValue(l);
      oldCredits += v.credits;
      oldPicks += v.picks;
    }
    let newCredits = 0;
    let newPicks = 0;
    const claimed: number[] = [];
    const before = save.credits;
    for (let l = 1; l <= reach && levelThreshold(l) <= top; l++) {
      claimed.push(l);
      const r = roadReward(l);
      if (r.kind === 'credits') newCredits += r.amount;
      else if (r.kind === 'pick') newPicks++;
      else if (r.kind === 'chassis') grantChassis(save, r.id, 0, '');
      else grantItem(save, r.id, r.fallback, '');
    }
    // grantItem pays fallback credits for already-owned shop items: count them as new-track value.
    newCredits += save.credits - before;
    save.credits = Math.min(9999999, before + Math.max(0, newCredits - oldCredits));
    save.picks = Math.min(99, save.picks + Math.max(0, newPicks - oldPicks));
    save.claimedLevels = claimed;
    save.flags.roadCarried = true;
  }
  settleAchievements(save, false);
}

/** Schema migrations by source version. Each returns data for the next version. */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {
  // 0 -> 1: pre-release saves stored unlocked chassis in a separate list.
  0: (raw) => {
    const owned = Array.isArray(raw.owned) ? [...raw.owned] : [];
    if (Array.isArray(raw.chassisOwned)) for (const c of raw.chassisOwned) if (typeof c === 'string') owned.push(`chassis:${c}`);
    const { chassisOwned: _drop, ...rest } = raw;
    return { ...rest, owned, version: 1 };
  },
  // 1 -> 2: Club Road, objectives, achievements, mastery, topper and title. The data changes are applied
  // after validation by migrateToV2, which needs the typed save.
  1: (raw) => ({ ...raw, version: 2 }),
};

export class SaveError extends Error {}

/** Validates arbitrary data into a SaveGame. Throws SaveError when it is not a Tether League save at all. */
export function validateSave(input: unknown): SaveGame {
  if (!isObj(input)) throw new SaveError('Not a save file.');
  let raw = input;
  let version = typeof raw.version === 'number' ? raw.version : -1;
  const fromVersion = version;
  if (version < 0 || version > SAVE_VERSION || !Number.isInteger(version)) throw new SaveError('Unsupported save version.');
  while (version < SAVE_VERSION) {
    const m = MIGRATIONS[version];
    if (!m) throw new SaveError('Unsupported save version.');
    raw = m(raw);
    version++;
  }
  if (!isObj(raw.club)) throw new SaveError('Save is missing the club profile.');

  const ownedRaw = Array.isArray(raw.owned) ? raw.owned : [];
  const owned = new Set<string>([...STARTER_COSMETICS, 'chassis:all_rounder']);
  for (const o of ownedRaw) {
    if (typeof o !== 'string') continue;
    if (o.startsWith('chassis:') ? Object.hasOwn(CHASSIS, o.slice(8)) : isOwnableCosmetic(o)) owned.add(o);
  }
  const ownedList = [...owned];

  const seedFallback = int(raw.createdAt, 0, 8e15, 1) >>> 0;
  let career: CareerState;
  // A rebuilt season reuses its division/season numbers, so ledger entries for that season must be
  // dropped or the replayed fixtures would be treated as already committed.
  let rebuilt = '';
  if (validCareer(raw.career)) career = raw.career;
  else {
    const c = isObj(raw.career) ? raw.career : {};
    career = newSeason(int(c.division, 0, DIVISIONS.length - 1, 0), int(c.seasonNo, 1, 9999, 1), seedFallback);
    rebuilt = `c-d${career.division}s${career.seasonNo}`;
  }
  const stale = (id: string) => rebuilt !== '' && (id.startsWith(`${rebuilt}r`) || id.startsWith(`${rebuilt}-`));

  const seasons: SeasonResult[] = [];
  for (const s of Array.isArray(raw.seasons) ? raw.seasons : []) {
    if (!isObj(s)) continue;
    const stage = (['champion', 'finalist', 'semifinalist', 'missed'] as const).includes(s.stage as SeasonResult['stage']) ? (s.stage as SeasonResult['stage']) : 'missed';
    seasons.push({
      division: int(s.division, 0, DIVISIONS.length - 1, 0), seasonNo: int(s.seasonNo, 1, 9999, 1), rank: int(s.rank, 1, 6, 6),
      wins: int(s.wins, 0, 10, 0), losses: int(s.losses, 0, 10, 0), gf: int(s.gf, 0, 999, 0), ga: int(s.ga, 0, 999, 0),
      stage, champion: str(s.champion, '', 40), promoted: s.promoted === true,
    });
  }
  const trophies: Trophy[] = [];
  for (const t of Array.isArray(raw.trophies) ? raw.trophies : []) {
    if (isObj(t)) trophies.push({ division: int(t.division, 0, DIVISIONS.length - 1, 0), seasonNo: int(t.seasonNo, 1, 9999, 1) });
  }

  const rec = isObj(raw.records) ? raw.records : {};
  const records = emptyRecords();
  for (const k of Object.keys(records) as (keyof Records)[]) records[k] = int(rec[k], 0, 9999999, 0);
  if (records.streak > records.bestStreak) records.bestStreak = records.streak;

  const trials: SaveGame['trials'] = {};
  const tr = isObj(raw.trials) ? raw.trials : {};
  for (const id of Object.keys(TRIALS) as TrialId[]) {
    const t = tr[id];
    if (!isObj(t)) continue;
    const rv = int(t.rulesVersion, 0, 999, 0);
    const medal = int(t.medal, 0, 3, 0) as 0 | 1 | 2 | 3;
    const rewarded = int(t.rewarded, 0, 3, 0) as 0 | 1 | 2 | 3;
    const best = typeof t.best === 'number' && Number.isFinite(t.best) && t.best >= 0 && t.best < 100000 ? t.best : null;
    // Records from other rule versions are not comparable: keep paid reward flags, drop the score.
    trials[id] = rv === TRIALS[id].rulesVersion ? { best, medal, rewarded, attempts: int(t.attempts, 0, 999999, 0), rulesVersion: rv } : { best: null, medal: 0, rewarded, attempts: 0, rulesVersion: TRIALS[id].rulesVersion };
  }

  const flags: Record<string, boolean> = {};
  if (isObj(raw.flags)) for (const k of Object.keys(raw.flags).slice(0, 60)) if (raw.flags[k] === true && k.length < 40) flags[k] = true;

  const p = isObj(raw.prefs) ? raw.prefs : {};
  const prefs: Prefs = {
    tendency: (['supportive', 'aggressive', 'defensive'] as const).includes(p.tendency as Prefs['tendency']) ? (p.tendency as Prefs['tendency']) : 'supportive',
    quickDifficulty: (['rookie', 'club', 'pro'] as const).includes(p.quickDifficulty as Prefs['quickDifficulty']) ? (p.quickDifficulty as Prefs['quickDifficulty']) : 'rookie',
    quickArena: ARENA_ORDER.includes(p.quickArena as ArenaId) ? (p.quickArena as ArenaId) : 'harbor_park',
    quickOpponent: str(p.quickOpponent, 'ember_works'),
    quickMinutes: [2, 3, 5].includes(p.quickMinutes as number) ? (p.quickMinutes as number) : 3,
    relaxed: p.relaxed === true,
  };

  const results: CommittedResult[] = [];
  for (const r of (Array.isArray(raw.results) ? raw.results : []).slice(-12)) {
    const c = sanitizeResult(r);
    if (c) results.push(c);
  }

  const createdAt = int(raw.createdAt, 0, 8e15, Date.now());
  const save: SaveGame = {
    version: SAVE_VERSION,
    createdAt,
    updatedAt: int(raw.updatedAt, 0, 8e15, Date.now()),
    club: sanitizeClub(raw.club, ownedList),
    settings: sanitizeSettings(raw.settings),
    credits: int(raw.credits, 0, 9999999, 0),
    xp: int(raw.xp, 0, 9999999, 0),
    owned: ownedList,
    picks: int(raw.picks, 0, 99, 0),
    claimedLevels: (Array.isArray(raw.claimedLevels) ? raw.claimedLevels : []).filter((n): n is number => Number.isInteger(n) && n > 0 && n < 100000).slice(0, 5000),
    career,
    seasons: seasons.slice(-40),
    trophies: trophies.slice(-40),
    records,
    trials,
    lessons: (Array.isArray(raw.lessons) ? raw.lessons : []).filter((l): l is string => typeof l === 'string' && LESSONS.some((d) => d.id === l)),
    flags,
    committed: (Array.isArray(raw.committed) ? raw.committed : []).filter((c): c is string => typeof c === 'string' && c.length < 80 && !stale(c)).slice(-80),
    results,
    prefs,
    matchSeq: int(raw.matchSeq, 0, 99999999, 0),
    progress: sanitizeProgress(fromVersion < 2 ? null : raw.progress, createdAt),
  };
  if (fromVersion < 2) migrateToV2(save);
  ensureObjectives(save);
  return save;
}

// ---------------------------------------------------------------------------
// persistence
// ---------------------------------------------------------------------------

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface LoadOutcome {
  save: SaveGame | null;
  /** 'ok' current snapshot, 'recovered' fell back to the previous snapshot, 'corrupt' nothing usable, 'empty' first run, 'unavailable' storage blocked. */
  status: 'ok' | 'recovered' | 'corrupt' | 'empty' | 'unavailable';
}

function parse(text: string | null): SaveGame | null {
  if (!text) return null;
  try {
    return validateSave(JSON.parse(text));
  } catch {
    return null;
  }
}

export function loadSave(storage: StorageLike | null): LoadOutcome {
  if (!storage) return { save: null, status: 'unavailable' };
  let cur: string | null;
  let prev: string | null;
  try {
    cur = storage.getItem(KEY);
    prev = storage.getItem(KEY_PREV);
  } catch {
    return { save: null, status: 'unavailable' };
  }
  const a = parse(cur);
  if (a) return { save: a, status: 'ok' };
  const b = parse(prev);
  if (b) return { save: b, status: 'recovered' };
  return { save: null, status: cur || prev ? 'corrupt' : 'empty' };
}

/**
 * Writes a complete snapshot: stage -> verify -> rotate current to previous -> promote.
 * Returns false (leaving the existing snapshots untouched as far as possible) when storage fails.
 */
export function writeSave(storage: StorageLike | null, save: SaveGame): boolean {
  if (!storage) return false;
  try {
    save.updatedAt = Date.now();
    const text = JSON.stringify(save);
    storage.setItem(KEY_NEXT, text);
    if (storage.getItem(KEY_NEXT) !== text) throw new Error('verify failed');
    const cur = storage.getItem(KEY);
    if (cur && parse(cur)) storage.setItem(KEY_PREV, cur);
    storage.setItem(KEY, text);
    storage.removeItem(KEY_NEXT);
    return true;
  } catch {
    try {
      storage.removeItem(KEY_NEXT);
    } catch {
      /* ignore */
    }
    return false;
  }
}

export function clearSave(storage: StorageLike | null): void {
  if (!storage) return;
  try {
    storage.removeItem(KEY);
    storage.removeItem(KEY_PREV);
    storage.removeItem(KEY_NEXT);
  } catch {
    /* ignore */
  }
}

export function exportSave(save: SaveGame): string {
  return JSON.stringify({ game: 'tether-league', exportedAt: new Date().toISOString(), save }, null, 1);
}

/** Parses and validates an exported file without touching the current profile. */
export function importSave(text: string): SaveGame {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new SaveError('It is not valid save data (JSON).');
  }
  if (!isObj(data) || data.game !== 'tether-league' || !isObj(data.save)) throw new SaveError('It is not a Tether League save.');
  return validateSave(data.save);
}

export function browserStorage(): StorageLike | null {
  try {
    const s = window.localStorage;
    const k = 'tether-league/probe';
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}
