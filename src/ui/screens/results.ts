import type { App, ScreenView } from '../../app';
import { MEDAL_NAMES, TRIALS, type TrialId } from '../../content/trials';
import { describeLevelReward, levelFor, levelProgress } from '../../progression/progression';
import type { Grant } from '../../storage/save';
import { fmtTime, h, icon } from '../dom';
import { shell } from '../shell';

function grantList(grants: Grant[]): HTMLElement | null {
  if (!grants.length) return null;
  const ic: Record<Grant['kind'], string> = { pick: 'gift', credits: 'coin', chassis: 'garage', arena: 'home', trophy: 'trophy' };
  return h('ul', { class: 'grants' }, grants.map((g) => h('li', null, icon(ic[g.kind]), h('div', null, h('b', null, g.label), h('span', null, g.detail)))));
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
  const levelBefore = levelFor(r.xpBefore);
  const leveled = lp.level > levelBefore;

  const stat = (ic: string, label: string, value: number) => h('div', { class: 'stat' }, icon(ic), h('span', null, label), h('b', null, String(value)));
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

  const rewards = h('section', { class: 'panel-dark results-rewards' },
    h('h2', { class: 'section-head' }, icon('gift'), 'Match rewards'),
    r.rewards.length
      ? h('ul', { class: 'reward-lines' }, r.rewards.map((l) => h('li', null, h('span', null, l.label), h('b', { class: 'cr' }, `+${l.credits}`), h('b', { class: 'xp' }, `+${l.xp} XP`))))
      : h('p', { class: 'muted' }, 'Rewards for this match were already collected.'),
    h('div', { class: 'reward-total' }, h('span', null, icon('coin'), `+${r.credits} credits`), h('span', null, `+${r.xp} club XP`)),
    h('div', { class: 'gc-row' }, h('b', null, `Club level ${lp.level}${leveled ? ' · level up!' : ''}`), h('span', null, `${save.xp - lp.from} / ${lp.to - lp.from}`)),
    h('div', { class: 'bar yellow' }, h('i', { style: `width:${Math.round(lp.frac * 100)}%` })),
    h('p', { class: 'muted' }, `Next: ${describeLevelReward(lp.level + 1)}`),
    grantList(r.grants),
  );

  const records = r.newRecords.length ? h('div', { class: 'record-strip' }, icon('star'), r.newRecords.join(' · ')) : null;

  const actions = h('div', { class: 'results-actions' },
    career
      ? h('button', { class: 'btn btn-cyan btn-big', 'data-autofocus': true, onclick: () => app.navigate('league', true) }, icon('play'), r.seasonComplete ? 'Season review' : 'Continue season')
      : h('button', { class: 'btn btn-cyan btn-big', 'data-autofocus': true, onclick: () => app.navigate('prematch?mode=quick', true) }, icon('retry'), 'Rematch'),
    h('button', { class: 'btn', onclick: () => app.navigate('home', true) }, icon('home'), 'Club home'),
    save.picks > 0 ? h('button', { class: 'btn btn-primary', onclick: () => app.navigate('club') }, icon('gift'), 'Use free pick') : null,
  );

  const head = h('div', { class: `results-head ${r.won ? 'won' : 'lost'}` },
    h('h1', { class: 'display' }, r.won ? 'Victory' : 'Defeat'),
    h('div', { class: 'final-score' }, h('b', { class: 'us' }, String(r.score[0])), h('span', null, '–'), h('b', { class: 'them' }, String(r.score[1]))),
    h('p', null, `${r.label} · v ${r.opponent}${r.overtime ? ' · after overtime' : ''}`),
    r.won ? null : h('p', { class: 'muted on-dark-text' }, 'Completion rewards are yours either way. The Academy has drills for whatever went wrong.'),
  );

  const el = shell(app, { nav: 'play', cls: 'results' }, head, stats, h('div', { class: 'stage-slot' }), rewards, records, actions);
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
  const el = shell(app, { nav: 'academy', title: def.name, subtitle: 'Trial result', back: 'academy', dim: true, cls: 'trial-result' },
    h('section', { class: 'panel trial-panel' },
      h('div', { class: 'trial-score' }, h('small', null, rep.score === null ? 'No score' : 'Your score'), h('b', { class: 'display' }, formatTrialScore(id, rep.score)), medalIcons(o.medal, 'big'),
        h('span', { class: 'chip' }, o.medal ? `${MEDAL_NAMES[o.medal]} medal` : 'No medal this time')),
      h('div', { class: 'kv' }, h('span', null, 'Personal best'), h('b', null, `${formatTrialScore(id, rec?.best ?? null)}${o.newBest && rep.score !== null ? ' · new best!' : ''}`)),
      h('div', { class: 'kv' }, h('span', null, 'Next target'), h('b', null, next)),
      o.paidMedals.length ? h('div', { class: 'kv' }, h('span', null, `First ${o.paidMedals.join(' + ')} reward`), h('b', null, `+${o.credits} credits · +${o.xp} XP`)) : h('p', { class: 'muted' }, o.medal ? 'Medal rewards are paid once per tier. Improving your best is its own reward from here.' : rep.score === null ? 'That attempt did not finish. The objective is shown again before you start.' : 'Reach bronze to earn your first medal reward.'),
      grantList(o.grants),
      h('p', { class: 'muted' }, def.objective),
      h('div', { class: 'dialog-actions' },
        h('button', { class: 'btn', onclick: () => app.navigate('academy', true) }, 'Back to academy'),
        h('button', { class: 'btn btn-cyan btn-big', 'data-autofocus': true, onclick: () => app.startTrial(id) }, icon('retry'), 'Retry'),
      ),
    ),
  );
  return { el };
}
