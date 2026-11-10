import { describe, expect, it } from 'vitest';
import { newSeason, nextPlayerMatch, validCareer } from '../src/career/career';
import { DIVISIONS } from '../src/content/clubs';
import { STARTER_COSMETICS } from '../src/content/cosmetics';
import { TRIALS } from '../src/content/trials';
import type { MatchResult } from '../src/game/modes/matchMode';
import type { RobotStats } from '../src/game/sim/match';
import { REWARDS, commitMatch, commitTrial, purchase, startNextSeason } from '../src/progression/progression';
import {
  SAVE_VERSION,
  SaveError,
  clearSave,
  defaultClub,
  exportSave,
  importSave,
  loadSave,
  newSave,
  validateSave,
  writeSave,
  type SaveGame,
  type StorageLike,
} from '../src/storage/save';
import { defaultSettings } from '../src/storage/settings';

const KEY = 'tether-league/save';
const KEY_PREV = 'tether-league/save.prev';
const KEY_NEXT = 'tether-league/save.next';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  /** Keys whose writes throw (simulates quota errors); '*' fails every write. */
  failSet = new Set<string>();
  failGet = false;
  /** When set, stored values are silently truncated (simulates a broken backend that corrupts writes). */
  truncate = false;
  writes = 0;
  getItem(key: string): string | null {
    if (this.failGet) throw new Error('storage blocked');
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    if (this.failSet.has('*') || this.failSet.has(key)) throw new Error('QuotaExceededError');
    this.writes++;
    this.data.set(key, this.truncate ? value.slice(0, Math.floor(value.length / 2)) : value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

function freshSave(seed = 777): SaveGame {
  return newSave(defaultClub(), defaultSettings(), seed);
}

function stats(p: Partial<RobotStats> = {}): RobotStats {
  return { goals: 0, assists: 0, saves: 0, shots: 0, passes: 0, interceptions: 0, kicks: 0, swingKicks: 0, swings: 0, ownGoals: 0, longBalls: 0, giveAndGos: 0, wallPasses: 0, oneTouchGoals: 0, ...p };
}

function quick(id: string, p: Partial<MatchResult> = {}): MatchResult {
  return { matchId: id, kind: 'quick', arena: 'harbor_park', opponent: 'Ember Works', score: [2, 1], won: true, overtime: false, duration: 120, player: stats({ goals: 1 }), mate: stats({ goals: 1 }), goals: [], ...p };
}

const CTX = { label: 'Test', opponentId: 'ember_works' };

/** A save with some of everything in it: purchases, equipped items, results, a season in progress, trials. */
function richSave(): SaveGame {
  const save = freshSave(31337);
  save.club.name = 'Rope Rockets';
  save.credits = 2000;
  expect(purchase(save, 'face_star')).toBe('ok');
  expect(purchase(save, 'trail_comet')).toBe('ok');
  expect(purchase(save, 'chassis:scout')).toBe('ok');
  save.club.face = 'face_star';
  save.club.trail = 'trail_comet';
  save.club.chassis = 'scout';
  save.club.primary = 'red';
  save.club.numbers = [9, 23];
  commitMatch(save, quick('q-1'), CTX);
  for (let i = 0; i < 4; i++) {
    const next = nextPlayerMatch(save.career)!;
    commitMatch(save, quick(`c-${next.id}`, { kind: 'career', fixtureId: next.id, score: i % 2 ? [1, 3] : [4, 2], won: i % 2 === 0 }), CTX);
  }
  commitTrial(save, 'swing_school', TRIALS.swing_school.silver);
  commitTrial(save, 'clean_release', TRIALS.clean_release.bronze);
  save.lessons.push('move', 'tether');
  save.flags.seenIntro = true;
  save.prefs.quickDifficulty = 'club';
  save.prefs.quickArena = 'foundry_court';
  save.settings.masterVolume = 0.25;
  save.settings.aimAssistance = 'strong';
  save.matchSeq = 5;
  return save;
}

describe('save round trip', () => {
  it('newSave -> writeSave -> loadSave returns an equal save with status ok', () => {
    const storage = new MemoryStorage();
    const save = freshSave();
    expect(writeSave(storage, save)).toBe(true);
    const out = loadSave(storage);
    expect(out.status).toBe('ok');
    expect(out.save).toEqual(save);
    expect(out.save).not.toBe(save);
    // The staging slot is cleaned up.
    expect(storage.data.has(KEY_NEXT)).toBe(false);
    expect(storage.data.has(KEY)).toBe(true);
  });

  it('a save with progress, purchases, equipped items and results survives the round trip unchanged', () => {
    const storage = new MemoryStorage();
    const save = richSave();
    expect(writeSave(storage, save)).toBe(true);
    const out = loadSave(storage);
    expect(out.status).toBe('ok');
    expect(out.save).toEqual(save);
    expect(out.save!.club).toMatchObject({ name: 'Rope Rockets', face: 'face_star', trail: 'trail_comet', chassis: 'scout', primary: 'red', numbers: [9, 23] });
    expect(out.save!.career.fixtures.filter((f) => f.done)).toHaveLength(12);
    // Loading is idempotent: validate(validate(x)) == validate(x).
    expect(validateSave(clone(out.save))).toEqual(out.save);
  });

  it('refreshing mid-flow does not duplicate rewards: a reloaded save still knows the committed match', () => {
    const storage = new MemoryStorage();
    const save = freshSave();
    const next = nextPlayerMatch(save.career)!;
    const res = quick(`c-${next.id}`, { kind: 'career', fixtureId: next.id, score: [3, 2] });
    const rec = commitMatch(save, res, CTX);
    writeSave(storage, save);

    const loaded = loadSave(storage).save!;
    const before = clone(loaded);
    const again = commitMatch(loaded, res, CTX);
    expect({ ...again, at: 0 }).toEqual({ ...rec, at: 0 });
    expect(loaded).toEqual(before);
    expect(loaded.credits).toBe(save.credits);
    expect(loaded.xp).toBe(save.xp);
    expect(loaded.career.fixtures.filter((f) => f.done)).toHaveLength(3);
  });

  it('empty storage reports empty; no storage or blocked storage reports unavailable', () => {
    expect(loadSave(new MemoryStorage())).toEqual({ save: null, status: 'empty' });
    expect(loadSave(null)).toEqual({ save: null, status: 'unavailable' });
    const blocked = new MemoryStorage();
    blocked.failGet = true;
    expect(loadSave(blocked)).toEqual({ save: null, status: 'unavailable' });
    expect(writeSave(null, freshSave())).toBe(false);
    expect(writeSave(blocked, freshSave())).toBe(false);
  });

  it('clearSave removes every snapshot', () => {
    const storage = new MemoryStorage();
    writeSave(storage, freshSave());
    writeSave(storage, freshSave());
    clearSave(storage);
    expect(storage.data.size).toBe(0);
    expect(loadSave(storage).status).toBe('empty');
    clearSave(null); // must not throw
  });
});

describe('corruption and storage failure', () => {
  function twoSnapshots(): { storage: MemoryStorage; older: SaveGame; newer: SaveGame } {
    const storage = new MemoryStorage();
    const older = freshSave();
    older.credits = 10;
    writeSave(storage, older);
    const olderCopy = clone(older);
    const newer = older;
    newer.credits = 20;
    writeSave(storage, newer);
    return { storage, older: olderCopy, newer };
  }

  it('keeps the previous snapshot when a new one is written', () => {
    const { storage, older, newer } = twoSnapshots();
    expect(loadSave(storage).save!.credits).toBe(20);
    expect(JSON.parse(storage.data.get(KEY_PREV)!).credits).toBe(10);
    expect(validateSave(JSON.parse(storage.data.get(KEY_PREV)!))).toEqual(older);
    expect(validateSave(JSON.parse(storage.data.get(KEY)!))).toEqual(newer);
  });

  it('falls back to the previous valid snapshot when the current one is corrupted', () => {
    const corruptions = ['{"version":1,"club":{"na', 'not json at all', '[]', 'null', '{"version":99}', '{"hello":"world"}', ''];
    for (const garbage of corruptions) {
      const { storage, older } = twoSnapshots();
      if (garbage === '') storage.data.delete(KEY);
      else storage.data.set(KEY, garbage);
      const out = loadSave(storage);
      expect(out.status, garbage).toBe('recovered');
      expect(out.save).toEqual(older);
      expect(out.save!.credits).toBe(10);
    }
  });

  it('reports corrupt (and no save) when both snapshots are unusable', () => {
    const { storage } = twoSnapshots();
    storage.data.set(KEY, '{broken');
    storage.data.set(KEY_PREV, '{"version":1}');
    expect(loadSave(storage)).toEqual({ save: null, status: 'corrupt' });
    // Only one slot present and broken is also corrupt, not empty.
    const one = new MemoryStorage();
    one.data.set(KEY, 'garbage');
    expect(loadSave(one)).toEqual({ save: null, status: 'corrupt' });
  });

  it('writing over a corrupted current snapshot does not replace the good previous one with garbage', () => {
    const { storage, older } = twoSnapshots();
    storage.data.set(KEY, '{broken');
    const fresh = loadSave(storage).save!;
    expect(fresh.credits).toBe(10);
    fresh.credits = 30;
    expect(writeSave(storage, fresh)).toBe(true);
    expect(loadSave(storage)).toMatchObject({ status: 'ok' });
    expect(loadSave(storage).save!.credits).toBe(30);
    // The fallback is still the last good snapshot.
    storage.data.set(KEY, 'broken again');
    const out = loadSave(storage);
    expect(out.status).toBe('recovered');
    expect(out.save).toEqual(older);
  });

  it('storage that throws on setItem: writeSave returns false and the stored snapshot is still loadable', () => {
    const storage = new MemoryStorage();
    const save = freshSave();
    save.credits = 111;
    expect(writeSave(storage, save)).toBe(true);
    const stored = storage.data.get(KEY)!;

    storage.failSet.add('*');
    save.credits = 999;
    expect(writeSave(storage, save)).toBe(false);
    expect(storage.data.get(KEY)).toBe(stored);
    const out = loadSave(storage);
    expect(out.status).toBe('ok');
    expect(out.save!.credits).toBe(111);
    // Recovers once storage works again.
    storage.failSet.clear();
    expect(writeSave(storage, save)).toBe(true);
    expect(loadSave(storage).save!.credits).toBe(999);
  });

  it('a failure at any single step of the write leaves a loadable, uncorrupted save behind', () => {
    for (const failing of [KEY_NEXT, KEY_PREV, KEY]) {
      const storage = new MemoryStorage();
      const save = freshSave();
      save.credits = 1;
      writeSave(storage, save);
      save.credits = 2;
      writeSave(storage, save);

      storage.failSet.add(failing);
      save.credits = 3;
      expect(writeSave(storage, save), failing).toBe(false);
      const out = loadSave(storage);
      expect(out.status, failing).toBe('ok');
      // Never the half-written value, never older than what was already safely stored.
      expect(out.save!.credits, failing).toBe(2);
      expect(storage.data.has(KEY_NEXT)).toBe(false);
      const prev = validateSave(JSON.parse(storage.data.get(KEY_PREV)!));
      expect([1, 2]).toContain(prev.credits);
    }
  });

  it('a backend that silently corrupts writes is detected by the verify step and does not clobber the good save', () => {
    const storage = new MemoryStorage();
    const save = freshSave();
    save.credits = 5;
    writeSave(storage, save);
    storage.truncate = true;
    save.credits = 6;
    expect(writeSave(storage, save)).toBe(false);
    storage.truncate = false;
    const out = loadSave(storage);
    expect(out.status).toBe('ok');
    expect(out.save!.credits).toBe(5);
  });
});

describe('validateSave', () => {
  it('rejects non-objects, missing or future versions and saves without a club with SaveError', () => {
    const bad: unknown[] = [
      null,
      undefined,
      42,
      'save',
      [],
      [freshSave()],
      {},
      { club: defaultClub() },
      { ...freshSave(), version: SAVE_VERSION + 1 },
      { ...freshSave(), version: 999 },
      { ...freshSave(), version: -1 },
      { ...freshSave(), version: 0.5 },
      { ...freshSave(), version: '1' },
      { ...freshSave(), version: Number.NaN },
      { version: SAVE_VERSION },
      { version: SAVE_VERSION, club: 'Harbor Sparks' },
      { version: SAVE_VERSION, club: null },
    ];
    for (const b of bad) {
      expect(() => validateSave(b), JSON.stringify(b)?.slice(0, 60)).toThrow(SaveError);
    }
  });

  it('accepts a minimal save and fills every field with safe defaults', () => {
    const s = validateSave({ version: SAVE_VERSION, club: {} });
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.credits).toBe(0);
    expect(s.xp).toBe(0);
    expect(s.picks).toBe(0);
    expect(s.owned).toEqual([...STARTER_COSMETICS, 'chassis:all_rounder']);
    expect(s.club).toEqual(defaultClub());
    expect(validCareer(s.career)).toBe(true);
    expect(s.career).toMatchObject({ division: 0, seasonNo: 1, phase: 'regular' });
    expect(s.seasons).toEqual([]);
    expect(s.trophies).toEqual([]);
    expect(s.results).toEqual([]);
    expect(s.committed).toEqual([]);
    expect(s.trials).toEqual({});
    expect(s.settings).toEqual(defaultSettings());
    // And it is a fully usable save.
    const next = nextPlayerMatch(s.career)!;
    commitMatch(s, quick(`c-${next.id}`, { kind: 'career', fixtureId: next.id }), CTX);
    expect(s.credits).toBeGreaterThan(0);
  });

  it('clamps negative, NaN, infinite and huge credits / xp / picks', () => {
    const cases: [unknown, number][] = [
      [-500, 0],
      [Number.NaN, 0],
      [Number.POSITIVE_INFINITY, 0],
      [Number.NEGATIVE_INFINITY, 0],
      ['1000', 0],
      [null, 0],
      [1e15, 9999999],
      [12.6, 13],
      [250, 250],
    ];
    for (const [input, expected] of cases) {
      const raw: any = clone(freshSave());
      raw.credits = input;
      raw.xp = input;
      const s = validateSave(raw);
      expect(s.credits, String(input)).toBe(expected);
      expect(s.xp, String(input)).toBe(expected);
      expect(Number.isInteger(s.credits) && s.credits >= 0).toBe(true);
    }
    const raw: any = clone(freshSave());
    raw.picks = 1e9;
    expect(validateSave(raw).picks).toBeLessThanOrEqual(99);
    raw.picks = -3;
    expect(validateSave(raw).picks).toBe(0);
  });

  it('drops unknown, malformed and never-sold owned ids, keeps valid ones and always restores the starters', () => {
    const raw: any = clone(freshSave());
    raw.owned = ['face_star', 'face_star', 'chassis:scout', 'face_nonexistent', 'chassis:tank', 'chassis:', 'badge_gear', 42, null, { id: 'face_pixel' }, '__proto__', 'constructor'];
    const s = validateSave(raw);
    expect(s.owned).toContain('face_star');
    expect(s.owned).toContain('chassis:scout');
    expect(s.owned.filter((o) => o === 'face_star')).toHaveLength(1);
    for (const gone of ['face_nonexistent', 'chassis:tank', 'chassis:', 'badge_gear', '__proto__', 'constructor']) expect(s.owned).not.toContain(gone);
    expect(s.owned.every((o) => typeof o === 'string')).toBe(true);
    for (const starter of [...STARTER_COSMETICS, 'chassis:all_rounder']) expect(s.owned).toContain(starter);
    expect(s.owned).toHaveLength(STARTER_COSMETICS.length + 1 + 2);

    raw.owned = 'everything';
    expect(validateSave(raw).owned).toEqual([...STARTER_COSMETICS, 'chassis:all_rounder']);
  });

  it('un-equips cosmetics and chassis that are not owned, and keeps the ones that are', () => {
    const raw: any = clone(freshSave());
    raw.club = { ...raw.club, face: 'face_star', pattern: 'pattern_sash', trail: 'trail_aurora', celebration: 'celebration_dance', badge: 'badge_anchor', chassis: 'glider', mateChassis: 'bulwark' };
    const stripped = validateSave(clone(raw));
    expect(stripped.club).toMatchObject({ face: 'face_basic', pattern: 'pattern_plain', trail: 'trail_standard', celebration: 'celebration_wave', badge: 'badge_shield', chassis: 'all_rounder', mateChassis: 'all_rounder' });

    raw.owned.push('face_star', 'trail_aurora', 'chassis:glider');
    const kept = validateSave(clone(raw));
    expect(kept.club).toMatchObject({ face: 'face_star', pattern: 'pattern_plain', trail: 'trail_aurora', celebration: 'celebration_wave', badge: 'badge_shield', chassis: 'glider', mateChassis: 'all_rounder' });

    // An item of the wrong kind cannot be equipped in a slot, even if owned.
    raw.club.face = 'trail_aurora';
    raw.club.chassis = 'face_star';
    const wrong = validateSave(clone(raw));
    expect(wrong.club.face).toBe('face_basic');
    expect(wrong.club.chassis).toBe('all_rounder');
  });

  it('sanitises the club profile: name, colours and numbers', () => {
    const raw: any = clone(freshSave());
    raw.club = { name: '  <b>Rope\u0007   Rockets</b> and a very long tail  ', primary: 'cyan', secondary: 'cyan', numbers: [5, 5] };
    const s = validateSave(raw);
    expect(s.club.name).not.toMatch(/[<>\u0000-\u001f]/);
    expect(s.club.name.length).toBeLessThanOrEqual(18);
    expect(s.club.name.length).toBeGreaterThanOrEqual(2);
    expect(s.club.primary).not.toBe(s.club.secondary);
    expect(s.club.numbers[0]).not.toBe(s.club.numbers[1]);

    raw.club = { name: 'x', primary: 'ultraviolet', secondary: 7, numbers: [-4, 1e6] };
    const d = validateSave(raw);
    expect(d.club.name).toBe(defaultClub().name);
    expect(d.club.primary).toBe(defaultClub().primary);
    expect(d.club.secondary).toBe(defaultClub().secondary);
    expect(d.club.numbers).toEqual([0, 99]);
  });

  it('rebuilds an invalid career instead of throwing, keeping division and season number when it can', () => {
    const raw: any = clone(richSave());
    const good = clone(raw.career);
    expect(validateSave(clone(raw)).career).toEqual(good);

    const broken: [string, (c: any) => unknown, number, number][] = [
      ['fixtures truncated', (c) => ({ ...c, fixtures: c.fixtures.slice(0, 7) }), 0, 1],
      ['self fixture', (c) => ({ ...c, fixtures: c.fixtures.map((f: any, i: number) => (i === 2 ? { ...f, away: f.home } : f)) }), 0, 1],
      ['level done fixture', (c) => ({ ...c, fixtures: c.fixtures.map((f: any, i: number) => (i === 0 ? { ...f, hg: 1, ag: 1 } : f)) }), 0, 1],
      ['division 2 season 3, no fixtures', () => ({ division: 2, seasonNo: 3, fixtures: [] }), 2, 3],
      ['out-of-range division', () => ({ division: 77, seasonNo: -5 }), DIVISIONS.length - 1, 1],
      ['string', () => 'garbage', 0, 1],
      ['null', () => null, 0, 1],
      ['missing', () => undefined, 0, 1],
    ];
    for (const [label, edit, division, seasonNo] of broken) {
      const r: any = clone(raw);
      r.career = edit(clone(good));
      let s!: SaveGame;
      expect(() => (s = validateSave(r)), label).not.toThrow();
      expect(validCareer(s.career), label).toBe(true);
      expect(s.career, label).toMatchObject({ division, seasonNo, phase: 'regular' });
      expect(s.career.fixtures.every((f) => !f.done)).toBe(true);
      // Nothing else was lost.
      expect(s.credits).toBe(raw.credits);
      expect(s.xp).toBe(raw.xp);
      expect(s.owned).toEqual(raw.owned);
      expect(s.results).toHaveLength(raw.results.length);
      expect(s.records).toEqual(raw.records);
    }
  });

  // KNOWN DEFECT (src/storage/save.ts validateSave + src/progression/progression.ts commitMatch): when an invalid
  // career is rebuilt, the new season reuses the same division / season number, so its match ids
  // (`c-d<div>s<season>...`) can collide with ids already in the `committed` ledger from the lost season.
  // commitMatch then treats the new match as "already committed": it pays nothing and, worse, never records the
  // fixture, so the rebuilt career cannot progress past that match (always true for a playoff tie the player
  // had already played, e.g. `c-d0s1-sf1`). Remove `.fails` once a rebuild also invalidates those ledger ids
  // (or bumps the season number).
  it('a rebuilt career can be played to the end even though the lost season had committed matches', () => {
    const save = freshSave(2024);
    // Play the whole league stage and the semi-final, then lose the career data.
    for (let i = 0; i < 11; i++) {
      const next = nextPlayerMatch(save.career)!;
      commitMatch(save, quick(`c-${next.id}`, { kind: next.kind === 'league' ? 'career' : 'playoff', fixtureId: next.id, score: [3, 0] }), CTX);
    }
    expect(save.career.phase).toBe('final');
    const raw: any = clone(save);
    raw.career.fixtures = raw.career.fixtures.slice(0, 5);
    const rebuilt = validateSave(raw);
    expect(rebuilt.career).toMatchObject({ division: 0, seasonNo: 1, phase: 'regular' });

    // Replay the rebuilt season, always winning, exactly as the game would (match id = `c-<fixture id>`).
    for (let guard = 0; guard < 14; guard++) {
      const next = nextPlayerMatch(rebuilt.career);
      if (!next) break;
      commitMatch(rebuilt, quick(`c-${next.id}`, { kind: next.kind === 'league' ? 'career' : 'playoff', fixtureId: next.id, score: [3, 0] }), CTX);
    }
    expect(rebuilt.career.phase).toBe('complete');
  });

  it('migrates a version-0 save with chassisOwned to the current version', () => {
    const v1 = clone(freshSave()) as any;
    const { owned: _owned, ...rest } = v1;
    const v0 = { ...rest, version: 0, owned: ['face_star'], chassisOwned: ['scout', 'bogus', 7], credits: 321, xp: 222, club: { ...v1.club, chassis: 'scout', face: 'face_star' } };
    const s = validateSave(v0);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.owned).toContain('chassis:scout');
    expect(s.owned).toContain('face_star');
    expect(s.owned).toContain('chassis:all_rounder');
    expect(s.owned).not.toContain('chassis:bogus');
    expect(s.owned.some((o) => o.includes('7'))).toBe(false);
    expect('chassisOwned' in s).toBe(false);
    // Equipped items that were legitimately owned stay equipped through the migration.
    expect(s.club.chassis).toBe('scout');
    expect(s.club.face).toBe('face_star');
    expect(s.credits).toBe(321);
    expect(s.xp).toBe(222);
    expect(s.career).toEqual(v1.career);
    // The input object is not mutated by the migration.
    expect(v0.version).toBe(0);
    expect(v0.chassisOwned).toEqual(['scout', 'bogus', 7]);

    // A version-0 save without the legacy list still loads.
    const bare = validateSave({ version: 0, club: {} });
    expect(bare.version).toBe(SAVE_VERSION);
    expect(bare.owned).toEqual([...STARTER_COSMETICS, 'chassis:all_rounder']);
    // And a migrated save round-trips through storage as a current-version save.
    const storage = new MemoryStorage();
    storage.data.set(KEY, JSON.stringify(v0));
    const loaded = loadSave(storage);
    expect(loaded.status).toBe('ok');
    expect(loaded.save).toEqual(s);
  });

  it('trial records from a different rules version lose their score but keep the rewarded tier', () => {
    const raw: any = clone(freshSave());
    const current = TRIALS.swing_school.rulesVersion;
    raw.trials = {
      swing_school: { best: 7.5, medal: 3, rewarded: 3, attempts: 12, rulesVersion: current + 1 },
      clean_release: { best: 5, medal: 2, rewarded: 2, attempts: 4, rulesVersion: TRIALS.clean_release.rulesVersion - 1 },
      bank_shot: { best: 20, medal: 2, rewarded: 2, attempts: 3, rulesVersion: TRIALS.bank_shot.rulesVersion },
      pass_window: { best: -4, medal: 9, rewarded: 9, attempts: -2, rulesVersion: TRIALS.pass_window.rulesVersion },
      made_up_trial: { best: 1, medal: 3, rewarded: 3, attempts: 1, rulesVersion: 1 },
      counterattack: 'gold please',
    };
    const s = validateSave(raw);
    expect(s.trials.swing_school).toEqual({ best: null, medal: 0, rewarded: 3, attempts: 0, rulesVersion: current });
    expect(s.trials.clean_release).toEqual({ best: null, medal: 0, rewarded: 2, attempts: 0, rulesVersion: TRIALS.clean_release.rulesVersion });
    // Same rules version: kept as is.
    expect(s.trials.bank_shot).toEqual({ best: 20, medal: 2, rewarded: 2, attempts: 3, rulesVersion: TRIALS.bank_shot.rulesVersion });
    // Out-of-range values are clamped rather than trusted.
    expect(s.trials.pass_window).toEqual({ best: null, medal: 3, rewarded: 3, attempts: 0, rulesVersion: TRIALS.pass_window.rulesVersion });
    expect(Object.keys(s.trials).sort()).toEqual(['bank_shot', 'clean_release', 'pass_window', 'swing_school']);

    // Earning the medals again under the new rules pays only tiers that were never paid.
    const before = { credits: s.credits, xp: s.xp };
    const gold = commitTrial(s, 'swing_school', TRIALS.swing_school.gold);
    expect(gold).toMatchObject({ medal: 3, newBest: true, credits: 0, xp: 0, paidMedals: [] });
    // No medal money; only objective / achievement rewards from this attempt (shown as bonus lines).
    expect(s.credits - before.credits).toBe(gold.bonus.reduce((a, l) => a + l.credits, 0) + gold.grants.reduce((a, g) => a + (g.kind === 'credits' ? Number(/\+(\d+)/.exec(g.detail)?.[1] ?? 0) : 0), 0));
    const release = commitTrial(s, 'clean_release', TRIALS.clean_release.gold);
    expect(release.paidMedals).toEqual(['Gold']);
    expect(release.credits).toBe(REWARDS.trialMedal[3].credits);
  });

  it('sanitises history lists: bounded lengths, typed entries, no junk', () => {
    const raw: any = clone(richSave());
    raw.committed = [...Array.from({ length: 200 }, (_v, i) => `id-${i}`), 5, null, 'x'.repeat(200)];
    raw.results = [...Array.from({ length: 30 }, (_v, i) => ({ ...raw.results[0], matchId: `r-${i}`, credits: -50, score: [1e9, 'x'] })), 'junk', null, { noId: true }];
    raw.seasons = [{ division: 99, seasonNo: -1, rank: 44, wins: 500, losses: -3, gf: 'a', ga: 2, stage: 'legend', champion: 5, promoted: 'yes' }, 'junk'];
    raw.trophies = [{ division: -2, seasonNo: 0 }, 7];
    raw.lessons = ['move', 'fly', 3];
    raw.flags = { a: true, b: 'yes', c: false };
    raw.claimedLevels = [1, 2, 2.5, -1, 'x', 3];
    raw.records = { matches: -5, wins: 'many', goals: 3.4 };
    const s = validateSave(raw);
    expect(s.committed).toHaveLength(80);
    expect(s.committed.every((c) => typeof c === 'string' && c.length < 80)).toBe(true);
    expect(s.committed[s.committed.length - 1]).toBe('id-199');
    expect(s.results.length).toBeLessThanOrEqual(12);
    for (const r of s.results) {
      expect(r.credits).toBeGreaterThanOrEqual(0);
      expect(r.score[0]).toBeLessThanOrEqual(99);
      expect(r.score[1]).toBe(0);
    }
    expect(s.seasons).toEqual([{ division: DIVISIONS.length - 1, seasonNo: 1, rank: 6, wins: 10, losses: 0, gf: 0, ga: 2, stage: 'missed', champion: '', promoted: false }]);
    expect(s.trophies).toEqual([{ division: 0, seasonNo: 1 }]);
    expect(s.lessons).toEqual(['move']);
    expect(s.flags).toEqual({ a: true });
    expect(s.claimedLevels).toEqual([1, 2, 3]);
    expect(s.records).toMatchObject({ matches: 0, wins: 0, goals: 3 });
  });

  it('never mutates its input', () => {
    const raw = clone(richSave()) as any;
    raw.credits = -5;
    raw.owned.push('bogus');
    const snapshot = clone(raw);
    validateSave(raw);
    expect(raw).toEqual(snapshot);
  });
});

describe('export / import', () => {
  it('round-trips a save through the export format', () => {
    for (const save of [freshSave(), richSave()]) {
      const text = exportSave(save);
      expect(typeof text).toBe('string');
      const wrapper = JSON.parse(text);
      expect(wrapper.game).toBe('tether-league');
      const back = importSave(text);
      expect(back).toEqual(save);
      expect(back).not.toBe(save);
    }
  });

  it('an imported save keeps working: progress, ownership and idempotency ledger intact', () => {
    const save = richSave();
    const back = importSave(exportSave(save));
    expect(purchase(back, 'face_star')).toBe('owned');
    const before = clone(back);
    commitMatch(back, quick('q-1'), CTX); // already committed before the export
    expect(back).toEqual(before);
    const next = nextPlayerMatch(back.career)!;
    expect(next.round).toBe(5);
  });

  it('rejects invalid JSON and JSON that is not a Tether League export with SaveError', () => {
    const save = freshSave();
    const bad = [
      '',
      'not json',
      '{"game":"tether-league","save":',
      'null',
      '[]',
      '42',
      '"tether-league"',
      '{}',
      JSON.stringify({ game: 'other-game', save }),
      JSON.stringify({ save }),
      JSON.stringify({ game: 'tether-league' }),
      JSON.stringify({ game: 'tether-league', save: null }),
      JSON.stringify({ game: 'tether-league', save: [save] }),
      JSON.stringify(save), // a raw save without the export wrapper
      JSON.stringify({ game: 'tether-league', save: { ...save, version: SAVE_VERSION + 1 } }),
      JSON.stringify({ game: 'tether-league', save: { version: SAVE_VERSION } }),
    ];
    for (const text of bad) {
      expect(() => importSave(text), text.slice(0, 50)).toThrow(SaveError);
    }
  });

  it('a failed import does not touch what is in storage', () => {
    const storage = new MemoryStorage();
    const save = richSave();
    writeSave(storage, save);
    const stored = storage.data.get(KEY);
    expect(() => importSave('{"game":"tether-league","save":{"version":42}}')).toThrow(SaveError);
    expect(storage.data.get(KEY)).toBe(stored);
    expect(loadSave(storage).save).toEqual(save);
  });

  it('an import is sanitised like any other load (tampered values are clamped, unowned items un-equipped)', () => {
    const save = freshSave();
    const wrapper = JSON.parse(exportSave(save));
    wrapper.save.credits = 1e12;
    wrapper.save.xp = -1;
    wrapper.save.owned.push('chassis:warp_drive');
    wrapper.save.club.chassis = 'glider';
    wrapper.save.club.trail = 'trail_aurora';
    const back = importSave(JSON.stringify(wrapper));
    expect(back.credits).toBe(9999999);
    expect(back.xp).toBe(0);
    expect(back.owned).not.toContain('chassis:warp_drive');
    expect(back.club.chassis).toBe('all_rounder');
    expect(back.club.trail).toBe('trail_standard');
  });

  it('a completed season survives export / import and can still roll over to the next one', () => {
    const save = freshSave(55);
    for (let guard = 0; guard < 14; guard++) {
      const next = nextPlayerMatch(save.career);
      if (!next) break;
      commitMatch(save, quick(`c-${next.id}`, { kind: next.kind === 'league' ? 'career' : 'playoff', fixtureId: next.id, score: [2, 0] }), CTX);
    }
    expect(save.career.phase).toBe('complete');
    const back = importSave(exportSave(save));
    expect(back).toEqual(save);
    expect(startNextSeason(back)).toBe(true);
    expect(back.career).toMatchObject({ division: 1, seasonNo: 2, phase: 'regular' });
    expect(back.trophies).toHaveLength(1);
    expect(back.career).toEqual(newSeason(1, 2, back.career.seed));
  });
});
