import type { App, ScreenView } from '../../app';
import { CHASSIS } from '../../content/chassis';
import { COSMETIC_BY_ID } from '../../content/cosmetics';
import { MASTERY_MAX, TIER_NAMES } from '../../content/progression';
import { MEDAL_NAMES, TRIALS, type TrialId } from '../../content/trials';
import { masteryProgress } from '../../progression/mastery';
import { describeLevelReward, levelProgress } from '../../progression/progression';
import type { Grant, ProgressReport, RewardLine } from '../../storage/save';
import { countUp, fmtTime, h, icon } from '../dom';
import { shell } from '../shell';
import { cardHead, meter } from '../widgets';
import { TIER_LABEL } from './progress';

const ITEM_ICON: Record<string, string> = { face: 'face', pattern: 'shirt', trail: 'trail', celebration: 'party', badge: 'save', topper: 'face', title: 'star', color: 'palette' };

function grantList(grants: Grant[]): HTMLElement | null {
  if (!grants.length) return null;
  const ic: Record<Grant['kind'], string> = { pick: 'gift', credits: 'coin', chassis: 'garage', arena: 'home', trophy: 'trophy', item: 'gift' };
  return h('ul', { class: 'grants' }, grants.map((g) => h('li', null, icon(g.kind === 'item' && g.item ? ITEM_ICON[COSMETIC_BY_ID[g.item]?.kind] ?? 'gift' : ic[g.kind]), h('div', null, h('b', null, g.label), h('span', null, g.detail)))));
}

/** What a committed match / trial moved: objectives, achievement tiers, mastery and level ups. Display only. */
export function progressSummary(app: App, report: ProgressReport, title = 'Progress', grants: Grant[] = []): HTMLElement | null {
  const items: HTMLElement[] = [];
  if (report.levelAfter > report.levelBefore) {
    const road = grants.filter((g) => g.label.startsWith('Club level')).map((g) => g.detail);
    items.push(h('li', { class: 'ps-level' }, icon('star'), h('div', null, h('b', null, report.levelAfter - report.levelBefore > 1 ? `Club level ${report.levelBefore} → ${report.levelAfter}` : `Club level ${report.levelAfter} reached`), h('span', null, road.length ? road.join(' · ') : 'Club Road reward collected'))));
  }
  for (const o of report.objectives) {
    items.push(h('li', { class: o.done ? 'ps-done' : '' }, icon(o.done ? 'check' : 'target'),
      h('div', null, h('b', null, o.text), h('span', null, o.done ? `${TIER_LABEL[o.tier]} objective complete` : `${o.before} → ${o.after} of ${o.target}`)),
      o.done ? null : meter(o.after / o.target, o.text, 'teal', o.after, o.target),
    ));
  }
  for (const a of report.achievements) {
    items.push(h('li', { class: 'ps-done' }, h('i', { class: `medal m${a.tier} is-on` }, icon('star')), h('div', null, h('b', null, a.name), h('span', null, `${TIER_NAMES[a.tier - 1]} tier earned`))));
  }
  const m = report.mastery;
  if (m && m.gained > 0) {
    const mp = masteryProgress(app.save.progress.mastery[m.chassis] ?? 0);
    items.push(h('li', { class: m.levelAfter > m.levelBefore ? 'ps-done' : '' }, icon('garage'),
      h('div', null, h('b', null, `${CHASSIS[m.chassis].name} mastery +${m.gained}`), h('span', null, m.levelAfter > m.levelBefore ? `Mastery level ${m.levelAfter} of ${MASTERY_MAX}` : `Level ${m.levelAfter} of ${MASTERY_MAX}`)),
      meter(mp.frac, `${CHASSIS[m.chassis].name} mastery`, 'teal'),
    ));
  }
  if (!items.length) return null;
  return h('section', { class: 'panel progress-summary' },
    cardHead('target', title, h('button', { class: 'link-btn', type: 'button', onclick: () => app.navigate('progress') }, 'Open', icon('next'))),
    h('ul', { class: 'ps-list' }, items),
  );
}

function lineList(lines: RewardLine[]): HTMLElement {
  return h('ul', { class: 'reward-lines' }, lines.map((l) => h('li', { class: `src-${l.source ?? 'match'}` }, h('span', null, l.label), h('b', { class: 'cr' }, `+${l.credits}`), h('b', { class: 'xp' }, `+${l.xp} XP`))));
}

/**
 * Results read the committed record only. Nothing on this screen pays rewards, so reopening it,
 * refreshing or double-clicking Continue cannot duplicate anything.
 */
export function resultsScreen(app: App, params: URLSearchParams): ScreenView {
  const save = app.save;
  const id = params.get('id') ?? '';
  const r = save.results.find((x) => x.matchId === id) ?? save.results[save.results.length - 1];
  if (!r) {
    queueMicrotask(() => app.navigate('home', true));
    return { el: h('div', { class: 'screen' }) };
  }
  const career = r.kind !== 'quick';
  const lp = levelProgress(save.xp);
  const leveled = r.progress.levelAfter > r.progress.levelBefore;

  const stat = (ic: string, label: string, value: number) => h('div', { class: 'stat' }, icon(ic), h('span', null, label), countUp(h('b', null), value, { ms: 700, delay: 300 }));
  const stats = h('section', { class: 'panel results-stats' },
    stat('ball', 'Goals', r.stats.goals),
    stat('assist', 'Assists', r.stats.assists),
    stat('save', 'Saves', r.stats.saves),
    stat('pass', 'Passes', r.stats.passes),
    stat('intercept', 'Interceptions', r.stats.interceptions),
    h('div', { class: 'title-badge' }, icon('star'), h('span', { class: 'display' }, r.title)),
    r.mateGoals > 0 ? h('p', { class: 'muted' }, `Your teammate scored ${r.mateGoals}.`) : null,
    r.stats.ownGoals > 0 ? h('p', { class: 'muted' }, `Own goals: ${r.stats.ownGoals}. It happens.`) : null,
  );

  const rewards = h('section', { class: 'panel results-rewards' },
    cardHead('gift', 'Match rewards'),
    r.rewards.length ? lineList(r.rewards) : h('p', { class: 'muted' }, 'Rewards for this match were already collected.'),
    h('div', { class: 'reward-total' },
      h('span', null, icon('coin'), countUp(h('span'), r.credits, { delay: 400, format: (n) => `+${Math.round(n)}` }), ' credits'),
      h('span', null, countUp(h('span'), r.xp, { delay: 400, format: (n) => `+${Math.round(n)}` }), ' club XP')),
    h('div', { class: 'gc-row' }, h('b', null, `Club level ${r.progress.levelAfter || lp.level}${leveled ? ' · level up!' : ''}`), h('span', null, `${save.xp - lp.from} / ${lp.to - lp.from} XP`)),
    meter(lp.frac, 'Club XP to next level', 'xp', save.xp - lp.from, lp.to - lp.from),
    h('p', { class: 'muted' }, `Next: ${describeLevelReward(lp.level + 1)}`),
    grantList(r.grants),
  );

  const records = r.newRecords.length ? h('div', { class: 'record-strip' }, icon('star'), r.newRecords.join(' · ')) : null;

  const actions = h('div', { class: 'results-actions' },
    h('button', { class: 'btn btn-dark', onclick: () => app.navigate('home', true) }, icon('home'), 'Club home'),
    save.picks > 0 ? h('button', { class: 'btn btn-cyan', onclick: () => app.navigate('club') }, icon('gift'), 'Use free pick') : null,
    career
      ? h('button', { class: 'btn btn-primary btn-big', 'data-autofocus': true, onclick: () => app.navigate('league', true) }, icon('play'), r.seasonComplete ? 'Season review' : 'Continue season')
      : h('button', { class: 'btn btn-primary btn-big', 'data-autofocus': true, onclick: () => app.navigate('prematch?mode=quick', true) }, icon('retry'), 'Rematch'),
  );

  const head = h('div', { class: `results-head ${r.won ? 'won' : 'lost'}` },
    h('h1', { class: 'display' }, r.won ? 'Victory' : 'Defeat'),
    h('div', { class: 'final-score', 'aria-label': `Final score ${r.score[0]} to ${r.score[1]}` }, h('b', { class: 'us' }, String(r.score[0])), h('span', { 'aria-hidden': 'true' }, '–'), h('b', { class: 'them' }, String(r.score[1]))),
    h('p', null, `${r.label} · v ${r.opponent}${r.overtime ? ' · after overtime' : ''}`),
    r.won ? null : h('p', { class: 'rh-note' }, 'Completion rewards are yours either way. The Academy has drills for whatever went wrong.'),
  );

  const el = shell(app, { nav: 'play', cls: `results ${r.won ? 'is-won' : 'is-lost'}`, dock: actions },
    h('div', { class: 'results-grid' },
      h('div', { class: 'results-left' }, head, h('div', { class: 'stage-slot' }), stats),
      h('div', { class: 'results-right' }, rewards, progressSummary(app, r.progress, 'Progress this match', r.grants), records),
    ),
  );
  return { el, stage: { shot: 'duo', moods: r.won ? ['celebrate', 'celebrate'] : ['sad', 'sad'] } };
}

export function formatTrialScore(id: TrialId, score: number | null): string {
  if (score === null) return '—';
  return TRIALS[id].unit === 'time' ? fmtTime(score) : String(score);
}

export function medalIcons(medal: number, size = ''): HTMLElement {
  return h('span', { class: `medals ${size}` }, [1, 2, 3].map((m) => h('i', { class: `medal m${m}${medal >= m ? ' is-on' : ''}`, title: MEDAL_NAMES[m] }, icon('star'))));
}

export function trialResultScreen(app: App, params: URLSearchParams): ScreenView {
  const rep = app.lastTrial;
  const id = params.get('id') as TrialId;
  if (!rep || rep.id !== id || !TRIALS[id]) {
    queueMicrotask(() => app.navigate('academy', true));
    return { el: h('div', { class: 'screen' }) };
  }
  const def = TRIALS[id];
  const rec = app.save.trials[id];
  const o = rep.outcome;
  const next = o.medal < 3 ? (def.unit === 'time' ? `${MEDAL_NAMES[o.medal + 1]}: ${fmtTime([def.bronze, def.silver, def.gold][o.medal])} or faster` : `${MEDAL_NAMES[o.medal + 1]}: ${[def.bronze, def.silver, def.gold][o.medal]} or more`) : 'Gold standard reached. Chase your personal best.';
  const dock = h('div', { class: 'results-actions' },
    h('button', { class: 'btn btn-dark', onclick: () => app.navigate(`academy?tab=trials&trial=${id}`, true) }, icon('academy'), 'Back to academy'),
    h('button', { class: 'btn btn-primary btn-big', 'data-autofocus': true, onclick: () => app.startTrial(id) }, icon('retry'), 'Retry'),
  );
  const el = shell(app, { nav: 'academy', eyebrow: 'Trial result', title: def.name, subtitle: def.skill, back: `academy?tab=trials&trial=${id}`, dim: true, cls: 'trial-result', dock },
    h('section', { class: 'panel trial-panel' },
      h('div', { class: 'trial-score' }, h('small', null, rep.score === null ? 'No score' : 'Your score'), h('b', { class: 'display' }, formatTrialScore(id, rep.score)), medalIcons(o.medal, 'big'),
        h('span', { class: 'chip' }, o.medal ? `${MEDAL_NAMES[o.medal]} medal` : 'No medal this time')),
      h('div', { class: 'kv' }, h('span', null, 'Personal best'), h('b', null, `${formatTrialScore(id, rec?.best ?? null)}${o.newBest && rep.score !== null ? ' · new best!' : ''}`)),
      h('div', { class: 'kv' }, h('span', null, 'Next target'), h('b', null, next)),
      o.paidMedals.length ? h('div', { class: 'kv' }, h('span', null, `First ${o.paidMedals.join(' + ')} reward`), h('b', null, `+${o.credits} credits · +${o.xp} XP`)) : h('p', { class: 'muted' }, o.medal ? 'Medal rewards are paid once per tier. Improving your best is its own reward from here.' : rep.score === null ? 'That attempt did not finish. The objective is shown again before you start.' : 'Reach bronze to earn your first medal reward.'),
      o.bonus.length ? lineList(o.bonus) : null,
      grantList(o.grants),
      h('p', { class: 'muted' }, def.objective),
    ),
    progressSummary(app, o.progress, 'Progress from this attempt', o.grants),
  );
  return { el };
}
