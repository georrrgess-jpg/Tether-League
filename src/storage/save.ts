import { newSeason, validCareer, type CareerState, type SeasonResult } from '../career/career';
import { ARENA_ORDER, type ArenaId } from '../content/arenas';
import { CHASSIS, type ChassisId } from '../content/chassis';
import { CLUB_COLORS, COSMETIC_BY_ID, STARTER_COSMETICS } from '../content/cosmetics';
import { DIVISIONS } from '../content/clubs';
import { LESSONS, TRIALS, type TrialId } from '../content/trials';
import { defaultSettings, sanitizeSettings, type Settings } from './settings';

/**
 * Versioned save data. One complete snapshot is written at a time; the previous valid snapshot is kept
 * so a failed or corrupted write never erases a working save.
 */
export const SAVE_VERSION = 1;
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
}

export interface TrialRecord {
  best: number | null;
  medal: 0 | 1 | 2 | 3;
  /** Highest medal tier already paid out. */
  rewarded: 0 | 1 | 2 | 3;
  attempts: number;
  rulesVersion: number;
}

export interface RewardLine {
  label: string;
  credits: number;
  xp: number;
}

export interface Grant {
  kind: 'pick' | 'credits' | 'chassis' | 'arena' | 'trophy';
  label: string;
  detail: string;
}

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
  };
}

export function emptyRecords(): Records {
  return { matches: 0, wins: 0, goals: 0, assists: 0, saves: 0, passes: 0, interceptions: 0, swingGoals: 0, bestGoals: 0, bestSaves: 0, bestMargin: 0, streak: 0, bestStreak: 0 };
}

export function newSave(club: ClubProfile = defaultClub(), settings: Settings = defaultSettings(), seed = (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0): SaveGame {
  const now = Date.now();
  return {
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
  };
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
  const colorOk = (v: unknown, def: string) => (typeof v === 'string' && CLUB_COLORS.some((c) => c.id === v) ? v : def);
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
    rewards: lines.filter(isObj).slice(0, 8).map((l) => ({ label: str(l.label, '', 40), credits: int(l.credits, 0, 9999, 0), xp: int(l.xp, 0, 9999, 0) })),
    credits: int(raw.credits, 0, 99999, 0),
    xp: int(raw.xp, 0, 99999, 0),
    xpBefore: int(raw.xpBefore, 0, 9999999, 0),
    grants: grants.filter(isObj).slice(0, 8).map((g) => ({ kind: (['pick', 'credits', 'chassis', 'arena', 'trophy'] as const).includes(g.kind as Grant['kind']) ? (g.kind as Grant['kind']) : 'credits', label: str(g.label, '', 60), detail: str(g.detail, '', 120, ) })),
    newRecords: (Array.isArray(raw.newRecords) ? raw.newRecords : []).filter((x): x is string => typeof x === 'string').slice(0, 6).map((x) => x.slice(0, 60)),
    seasonComplete: raw.seasonComplete === true,
    at: int(raw.at, 0, 8e15, 0),
  };
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
};

export class SaveError extends Error {}

/** Validates arbitrary data into a SaveGame. Throws SaveError when it is not a Tether League save at all. */
export function validateSave(input: unknown): SaveGame {
  if (!isObj(input)) throw new SaveError('Not a save file.');
  let raw = input;
  let version = typeof raw.version === 'number' ? raw.version : -1;
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
    if (o.startsWith('chassis:') ? Object.hasOwn(CHASSIS, o.slice(8)) : COSMETIC_BY_ID[o] && COSMETIC_BY_ID[o].credits >= 0) owned.add(o);
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

  return {
    version: SAVE_VERSION,
    createdAt: int(raw.createdAt, 0, 8e15, Date.now()),
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
  };
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
    throw new SaveError('That file is not valid JSON.');
  }
  if (!isObj(data) || data.game !== 'tether-league' || !isObj(data.save)) throw new SaveError('That file is not a Tether League save.');
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
