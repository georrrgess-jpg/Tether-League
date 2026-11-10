import { nextPlayerMatch, type NextMatch } from '../career/career';
import type { ArenaId } from '../content/arenas';
import type { ChassisId } from '../content/chassis';
import { CLUBS, DIVISIONS, type ClubDef } from '../content/clubs';
import { colorHex, type RobotLook } from '../content/cosmetics';
import type { SaveGame } from '../storage/save';
import { colorDistance } from '../ui/badge';
import { CLUB_STYLE, DIFFICULTY, TENDENCY, difficultyAt, type Difficulty } from './ai/bot';
import type { MatchSetup, TeamInfo } from './modes/matchMode';
import { hashString } from './sim/rng';

/** Builds match configuration from saved club data. Kept apart from UI so screens share one source. */

export function playerLooks(save: SaveGame): [RobotLook, RobotLook] {
  const c = save.club;
  const base = {
    primary: colorHex(c.primary),
    secondary: colorHex(c.secondary),
    face: c.face,
    pattern: c.pattern,
    trail: c.trail,
    celebration: c.celebration,
    topper: c.topper,
  };
  return [
    { ...base, chassis: c.chassis, number: c.numbers[0] },
    { ...base, chassis: c.mateChassis, number: c.numbers[1] },
  ];
}

export function playerTeam(save: SaveGame): TeamInfo {
  const c = save.club;
  return { id: 'player', name: c.name, badge: c.badge, primary: colorHex(c.primary), secondary: colorHex(c.secondary) };
}

/** Opponent kit, switching to the away colours when the home kit would be hard to tell apart. */
export function opponentTeam(save: SaveGame, club: ClubDef): { team: TeamInfo; awayKit: boolean } {
  const mine = colorHex(save.club.primary);
  const clash = colorDistance(mine, club.primary) < 150;
  if (!clash) return { team: { id: club.id, name: club.name, badge: club.badge, primary: club.primary, secondary: club.secondary }, awayKit: false };
  // Away kit; if that also clashes fall back to a guaranteed-contrast kit.
  let primary = club.away;
  if (colorDistance(mine, primary) < 150) primary = colorDistance(mine, '#F48A2C') >= 150 ? '#F48A2C' : '#24395C';
  return { team: { id: club.id, name: club.name, badge: club.badge, primary, secondary: club.primary }, awayKit: true };
}

const FACES = ['face_basic', 'face_visor', 'face_pixel', 'face_star', 'face_cheeky'];
const PATTERNS = ['pattern_plain', 'pattern_stripe', 'pattern_chevron', 'pattern_hoops', 'pattern_sash'];

/** Opponents never wear the same shirt numbers as the player's team (or each other), so robots are easy to tell apart. */
export function distinctNumbers(opp: [RobotLook, RobotLook], mine: [RobotLook, RobotLook]): [RobotLook, RobotLook] {
  const taken = new Set([mine[0].number, mine[1].number]);
  const out = opp.map((l) => {
    let n = l.number;
    while (taken.has(n)) n = (n % 99) + 1;
    taken.add(n);
    return n === l.number ? l : { ...l, number: n };
  });
  return [out[0], out[1]];
}

export function opponentLooks(club: ClubDef, team: TeamInfo, division: number): [RobotLook, RobotLook] {
  const h = hashString(club.id);
  const byStyle: Record<string, [ChassisId, ChassisId]> = {
    pressure: ['all_rounder', 'scout'],
    passing: ['all_rounder', 'glider'],
    wide: ['scout', 'glider'],
    counter: ['bulwark', 'all_rounder'],
    balanced: ['all_rounder', 'all_rounder'],
  };
  const chassis: [ChassisId, ChassisId] = division <= 0 ? ['all_rounder', 'all_rounder'] : byStyle[club.style];
  const base = {
    primary: team.primary,
    secondary: team.secondary,
    face: FACES[h % FACES.length],
    pattern: PATTERNS[(h >> 3) % PATTERNS.length],
    trail: 'trail_standard',
    celebration: ['celebration_wave', 'celebration_jacks', 'celebration_dance'][(h >> 5) % 3],
  };
  const n0 = 2 + (h % 8);
  return [
    { ...base, chassis: chassis[0], number: n0 },
    { ...base, chassis: chassis[1], number: n0 + 3 + ((h >> 7) % 5) },
  ];
}

const assistLevel = (save: SaveGame): 0 | 1 | 2 => (save.settings.aimAssistance === 'off' ? 0 : save.settings.aimAssistance === 'light' ? 1 : 2);

export interface CareerMatchInfo {
  next: NextMatch;
  club: ClubDef;
  arena: ArenaId;
  label: string;
  level: number;
  difficulty: Difficulty;
  /** Set when recent defeats have eased this opponent ("comeback boost"). */
  ease: { losses: number; amount: number } | null;
}

/** The player's teammate: a notch above the opposition, never below Club+. */
export function mateLevel(oppLevel: number): number {
  return Math.min(2, Math.max(1.2, oppLevel + 0.35));
}

/** Level eased per consecutive career defeat (1, 2, 3+). Losing streaks are not fun; this softens them. */
const EASE_BY_LOSSES = [0, 0.12, 0.25, 0.4];

/** Consecutive career/playoff defeats, most recent first. Quick matches do not count. */
export function careerLosingStreak(save: SaveGame): number {
  let n = 0;
  for (let i = save.results.length - 1; i >= 0; i--) {
    const r = save.results[i];
    if (r.kind === 'quick') continue;
    if (r.won) break;
    n++;
  }
  return n;
}

export function careerMatchInfo(save: SaveGame): CareerMatchInfo | null {
  const next = nextPlayerMatch(save.career);
  if (!next) return null;
  const div = DIVISIONS[save.career.division];
  const club = CLUBS[next.opponent];
  const arena = next.kind === 'final' ? div.homeArena : next.home ? div.homeArena : div.awayArena;
  const label = next.kind === 'league' ? `${div.name} · Round ${next.round}` : next.kind === 'semi' ? `${div.name} · Semi-final` : `${div.name} · Final`;
  // The declared "Relaxed" option lowers opponent level by half a tier. After career defeats the
  // next opponent eases off a little (shown to the player as a comeback boost).
  const losses = careerLosingStreak(save);
  const amount = EASE_BY_LOSSES[Math.min(EASE_BY_LOSSES.length - 1, losses)];
  const base = div.level + club.rating * 0.2 - (save.prefs.relaxed ? 0.5 : 0);
  const level = Math.max(0, base - amount);
  const ease = amount > 0 && base > 0 ? { losses, amount: Math.min(amount, base) } : null;
  return { next, club, arena, label, level, difficulty: difficultyAt(level), ease };
}

export function careerSetup(save: SaveGame): MatchSetup | null {
  const info = careerMatchInfo(save);
  if (!info) return null;
  const { team } = opponentTeam(save, info.club);
  const mine = playerLooks(save);
  const opp = opponentLooks(info.club, team, save.career.division);
  return {
    matchId: `c-${info.next.id}`,
    kind: info.next.kind === 'league' ? 'career' : 'playoff',
    fixtureId: info.next.id,
    label: info.label,
    arena: info.arena,
    home: playerTeam(save),
    away: team,
    looks: [mine[0], mine[1], ...distinctNumbers(opp, mine)],
    oppDifficulty: info.difficulty,
    oppStyle: CLUB_STYLE[info.club.style],
    // The teammate plays a notch above the opposition (Club+ at least), so it carries its share.
    mateDifficulty: difficultyAt(mateLevel(info.level)),
    mateStyle: TENDENCY[save.prefs.tendency].style,
    assist: assistLevel(save),
    regulationSeconds: 180,
    seed: hashString(info.next.id) ^ save.career.seed,
    hints: save.records.matches < 2,
    playHints: save.records.longBalls + save.records.giveAndGos < 3,
    ball: save.club.ball,
  };
}

export function quickSetup(save: SaveGame): MatchSetup {
  const club = CLUBS[save.prefs.quickOpponent] ?? CLUBS.ember_works;
  const { team } = opponentTeam(save, club);
  const mine = playerLooks(save);
  const diff = DIFFICULTY[save.prefs.quickDifficulty];
  const opp = opponentLooks(club, team, diff.id === 'rookie' ? 0 : 1);
  save.matchSeq++;
  return {
    matchId: `q-${save.createdAt}-${save.matchSeq}`,
    kind: 'quick',
    label: `Quick Match · ${diff.name}`,
    arena: save.prefs.quickArena,
    home: playerTeam(save),
    away: team,
    looks: [mine[0], mine[1], ...distinctNumbers(opp, mine)],
    oppDifficulty: diff,
    oppStyle: CLUB_STYLE[club.style],
    mateDifficulty: diff.id === 'pro' ? DIFFICULTY.pro : DIFFICULTY.club,
    mateStyle: TENDENCY[save.prefs.tendency].style,
    assist: assistLevel(save),
    regulationSeconds: save.prefs.quickMinutes * 60,
    seed: (Date.now() ^ (save.matchSeq * 2654435761)) >>> 0,
    hints: save.records.matches < 2,
    playHints: save.records.longBalls + save.records.giveAndGos < 3,
    ball: save.club.ball,
  };
}
