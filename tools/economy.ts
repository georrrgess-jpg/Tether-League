/**
 * Economy and pacing check: plays N real bot matches (the player's robot driven by a bot stand-in a little
 * above the division's level) through the real commitMatch / commitTrial / commitLesson, with a player who
 * spends credits and picks, and prints the pacing numbers used to tune src/content/progression.ts.
 *   npx vite-node tools/economy.ts [matches=150] [seed=7]
 */
import { nextPlayerMatch } from '../src/career/career';
import { ARENAS } from '../src/content/arenas';
import { CHASSIS, CHASSIS_ORDER, type ChassisDef, type ChassisId } from '../src/content/chassis';
import { CLUBS, DIVISIONS } from '../src/content/clubs';
import { COSMETICS } from '../src/content/cosmetics';
import { ROAD_LENGTH } from '../src/content/progression';
import { LESSONS, TRIALS, TRIAL_ORDER } from '../src/content/trials';
import { BotDirector, CLUB_STYLE, DIFFICULTY, TENDENCY, difficultyAt } from '../src/game/ai/bot';
import type { MatchResult } from '../src/game/modes/matchMode';
import { careerMatchInfo } from '../src/game/setup';
import { Match } from '../src/game/sim/match';
import { Rng, hashString } from '../src/game/sim/rng';
import { emptyCommand } from '../src/game/sim/types';
import { masteryLevel } from '../src/progression/mastery';
import { commitLesson, commitMatch, commitTrial, describeLevelReward, levelFor, purchase, rerollObjective, startNextSeason, usePick } from '../src/progression/progression';
import { defaultClub, newSave } from '../src/storage/save';
import { defaultSettings } from '../src/storage/settings';

const N = Number(process.argv[2] ?? 150);
const SEED = Number(process.argv[3] ?? 7);
const rng = new Rng(SEED);
const save = newSave(defaultClub(), defaultSettings(), SEED);

for (const l of LESSONS) commitLesson(save, l.id); // onboarding

const levelAt: number[] = [];
const rows: string[] = [];
const sessions: { levels: number; objectives: number; achievements: number }[] = [];
let matchCredits = 0;
let totalCredits = 0;
let totalXp = 0;
let objectives = 0;
let tiers = 0;
let wins = 0;
let spent = 0;
const bought: string[] = [];
const firstLevelMatch: Record<number, number> = {};
let careerMatches = 0;
let rerolls = 0;
let shopDone = 0;
const stuck: Record<number, number> = {};

function play(info: { arena: keyof typeof ARENAS; opp: number; mate: number; me: number; minutes: number }, seed: number, chassis: ChassisId): Omit<MatchResult, 'matchId' | 'kind' | 'fixtureId' | 'opponent'> {
  const ch: [ChassisDef, ChassisDef, ChassisDef, ChassisDef] = [CHASSIS[chassis], CHASSIS.all_rounder, CHASSIS.all_rounder, CHASSIS.all_rounder];
  const m = new Match({ arena: ARENAS[info.arena], chassis: ch, human: -1, assist: 1, regulationSeconds: info.minutes * 60 });
  const bots = new BotDirector(m.world, [
    { robot: 0, difficulty: difficultyAt(info.me), style: CLUB_STYLE.balanced },
    { robot: 1, difficulty: difficultyAt(info.mate), style: TENDENCY.supportive.style },
    { robot: 2, difficulty: difficultyAt(info.opp), style: CLUB_STYLE.balanced },
    { robot: 3, difficulty: difficultyAt(info.opp), style: CLUB_STYLE.balanced },
  ], seed);
  const cmds = [emptyCommand(), emptyCommand(), emptyCommand(), emptyCommand()];
  let prev = m.phase;
  let ticks = 0;
  while (!m.finished && ticks++ < 60 * 60 * 15) {
    if (m.phase === 'play') bots.update(cmds);
    m.step(cmds);
    if (prev !== 'countdown' && m.phase === 'countdown') bots.reset();
    prev = m.phase;
  }
  return { arena: info.arena, score: [m.score[0], m.score[1]], won: m.winner === 0, overtime: m.overtime, duration: m.elapsed, player: { ...m.stats[0] }, mate: { ...m.stats[1] }, goals: m.goals.map((g) => ({ ...g })) };
}

/** A plausible spender: uses picks on the priciest shop item, buys the cheapest one it can afford with a 50-credit cushion. */
function shop(): void {
  const items = COSMETICS.filter((c) => c.unlock === 'shop' && !save.owned.includes(c.id)).sort((a, b) => a.credits - b.credits);
  while (save.picks > 0 && items.length) {
    const top = items.pop()!;
    if (usePick(save, top.id) === 'ok') bought.push(`${top.id} (pick)`);
  }
  for (const c of items) {
    if (save.credits >= c.credits + 50 && purchase(save, c.id) === 'ok') {
      spent += c.credits;
      bought.push(c.id);
    }
  }
}

let session = { levels: 0, objectives: 0, achievements: 0 };
for (let i = 1; i <= N; i++) {
  const ownedChassis = CHASSIS_ORDER.filter((c) => save.owned.includes(`chassis:${c}`));
  // Switch to a newly unlocked chassis now and then, so mastery is spread like a curious player's.
  const chassis = ownedChassis[Math.floor(i / 30) % ownedChassis.length];
  save.club.chassis = chassis;
  const quick = i % 6 === 0;
  let result: MatchResult;
  let label: string;
  if (!quick) {
    if (!nextPlayerMatch(save.career)) startNextSeason(save);
    const info = careerMatchInfo(save)!;
    const div = DIVISIONS[save.career.division];
    const base = play({ arena: info.arena, opp: info.level, mate: Math.max(1, info.level), me: div.level + 0.35, minutes: 3 }, hashString(info.next.id) ^ save.career.seed, chassis);
    result = { ...base, matchId: `c-${info.next.id}`, kind: info.next.kind === 'league' ? 'career' : 'playoff', fixtureId: info.next.id, opponent: info.club.name };
    label = info.label;
    careerMatches++;
  } else {
    const arenas = (['harbor_park'] as (keyof typeof ARENAS)[]).concat(save.seasons.length ? ['foundry_court'] : []);
    const d = rng.next() < 0.5 ? 0 : 1;
    const base = play({ arena: rng.pick(arenas), opp: d, mate: 1, me: d + 0.3, minutes: 3 }, 9000 + i, chassis);
    result = { ...base, matchId: `q-${i}`, kind: 'quick', opponent: CLUBS.ember_works.name };
    label = 'Quick';
  }
  const before = { credits: save.credits, xp: save.xp, level: levelFor(save.xp) };
  const rec = commitMatch(save, result, { label, opponentId: 'x', chassis });
  matchCredits += rec.rewards.filter((l) => l.source === 'match').reduce((a, l) => a + l.credits, 0);
  if (rec.won) wins++;
  const doneObj = rec.progress.objectives.filter((o) => o.done).length;
  objectives += doneObj;
  tiers += rec.progress.achievements.length;
  totalCredits += save.credits - before.credits;
  totalXp += save.xp - before.xp;
  const lv = levelFor(save.xp);
  for (let l = before.level + 1; l <= lv; l++) firstLevelMatch[l] = i;
  session.levels += lv - before.level;
  session.objectives += doneObj;
  session.achievements += rec.progress.achievements.length;
  // a trial attempt every 8 matches, medal drawn from a skill that improves with time
  if (i % 8 === 0) {
    const id = TRIAL_ORDER[(i / 8) % TRIAL_ORDER.length];
    const def = TRIALS[id];
    const skill = Math.min(3, Math.floor(rng.next() * 2 + i / 50));
    const score = [def.unit === 'time' ? def.bronze + 5 : def.bronze - 1, def.bronze, def.silver, def.gold][skill];
    const lb = levelFor(save.xp);
    const c0 = save.credits;
    const o = commitTrial(save, id, score);
    totalCredits += save.credits - c0;
    objectives += o.progress.objectives.filter((x) => x.done).length;
    session.objectives += o.progress.objectives.filter((x) => x.done).length;
    tiers += o.progress.achievements.length;
    const la = levelFor(save.xp);
    for (let l = lb + 1; l <= la; l++) firstLevelMatch[l] = i;
    session.levels += la - lb;
  }
  shop();
  if (!shopDone && COSMETICS.every((c) => c.unlock !== 'shop' || save.owned.includes(c.id))) shopDone = i;
  // The player uses the free reroll on an objective that has been stuck for 8 matches.
  save.progress.objectives.forEach((o, slot) => {
    stuck[o.uid] = (stuck[o.uid] ?? 0) + 1;
    if (stuck[o.uid] >= 8 && save.progress.rerolls > 0 && rerollObjective(save, slot)) rerolls++;
  });
  if (i % 5 === 0) {
    sessions.push(session);
    session = { levels: 0, objectives: 0, achievements: 0 };
  }
  levelAt[i] = levelFor(save.xp);
  if (i % 10 === 0) {
    const mastery = CHASSIS_ORDER.map((c) => `${c.slice(0, 4)}:${masteryLevel(save.progress.mastery[c])}`).join(' ');
    rows.push(`${String(i).padStart(4)} | lvl ${String(levelAt[i]).padStart(2)} | earned ${String(totalCredits).padStart(6)} cr ${String(totalXp).padStart(6)} xp | obj ${String(objectives).padStart(3)} | tiers ${String(tiers).padStart(3)} | div ${save.career.division} s${save.career.seasonNo} trophies ${save.trophies.length} | ${mastery} | bank ${save.credits}`);
  }
}

console.log(`\n${N} matches (${careerMatches} career, ${N - careerMatches} quick), seed ${SEED}; win rate ${Math.round((wins / N) * 100)}%`);
console.log(`avg per match: match lines ${(matchCredits / N).toFixed(0)} credits; everything ${(totalCredits / N).toFixed(0)} credits, ${(totalXp / N).toFixed(0)} XP; objectives ${(objectives / N).toFixed(2)} (rerolls used ${rerolls})`);
console.log('\nmatch | level | cumulative earnings | objectives | achievement tiers | career | mastery | bank');
for (const r of rows) console.log(r);

const gaps: number[] = [];
let prevM = 0;
for (let l = 1; l <= ROAD_LENGTH; l++) if (firstLevelMatch[l]) {
  gaps.push(firstLevelMatch[l] - prevM);
  prevM = firstLevelMatch[l];
}
const band = (a: number, b: number) => {
  const g = gaps.slice(a - 1, b);
  return g.length ? (g.reduce((x, y) => x + y, 0) / g.length).toFixed(1) : '-';
};
console.log(`\nmatches per level: 1-5 ${band(1, 5)}, 6-15 ${band(6, 15)}, 16-30 ${band(16, 30)}, 31-40 ${band(31, 40)}`);
console.log('\nClub Road unlocks (level: match):');
const keys = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 35, 40];
console.log(keys.map((l) => `  L${l} ${describeLevelReward(l)}: ${firstLevelMatch[l] ? `match ${firstLevelMatch[l]}` : 'not reached'}`).join('\n'));

const empty = sessions.slice(0, 20).map((s, i) => (s.levels + s.objectives === 0 ? i + 1 : 0)).filter(Boolean);
console.log(`\nsessions of 5 matches: ${sessions.length}; first 20 with no level-up and no objective: ${empty.length ? empty.join(', ') : 'none'}`);
console.log(`  level-ups per session: ${sessions.map((s) => s.levels).join(' ')}`);
console.log(`  objectives per session: ${sessions.map((s) => s.objectives).join(' ')}`);

const perMatch = matchCredits / N;
const prices = COSMETICS.filter((c) => c.unlock === 'shop').map((c) => c.credits);
const chassisPrices = CHASSIS_ORDER.filter((c) => CHASSIS[c].credits > 0).map((c) => CHASSIS[c].credits);
console.log(`\nshop: ${prices.length} cosmetics ${Math.min(...prices)}-${Math.max(...prices)} cr (${(Math.min(...prices) / perMatch).toFixed(1)}-${(Math.max(...prices) / perMatch).toFixed(1)} matches of match income), chassis ${chassisPrices.join('/')} (${(Math.max(...chassisPrices) / perMatch).toFixed(1)} matches)`);
console.log(`  all shop cosmetics: ${prices.reduce((a, b) => a + b, 0)} cr; spent ${spent}; owned shop items after ${N}: ${COSMETICS.filter((c) => c.unlock === 'shop' && save.owned.includes(c.id)).length}/${prices.length}${shopDone ? ` (complete at match ${shopDone})` : ''}; bank ${save.credits}`);
console.log(`  first buys: ${bought.slice(0, 8).join(', ')}`);
console.log(`  earned-only owned: ${COSMETICS.filter((c) => c.unlock !== 'shop' && c.unlock !== 'starter' && save.owned.includes(c.id)).length}/${COSMETICS.filter((c) => c.unlock === 'level' || c.unlock === 'achievement' || c.unlock === 'mastery').length}`);
console.log(`  chassis owned at: ${CHASSIS_ORDER.slice(1).map((c) => `${CHASSIS[c].name} L${CHASSIS[c].unlockLevel} match ${firstLevelMatch[CHASSIS[c].unlockLevel] ?? '-'}`).join(', ')}`);
