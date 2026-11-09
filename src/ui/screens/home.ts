import type { App, ScreenView } from '../../app';
import { ROUNDS, playerRank } from '../../career/career';
import { ARENAS } from '../../content/arenas';
import { CLUBS, DIVISIONS } from '../../content/clubs';
import { careerMatchInfo } from '../../game/setup';
import { describeLevelReward, levelProgress } from '../../progression/progression';
import { badgeSvg } from '../badge';
import { h, icon } from '../dom';
import { clubBadge, shell } from '../shell';

export function trophyShelf(app: App): HTMLElement {
  const save = app.save;
  const slots = DIVISIONS.map((d, i) => {
    const won = save.trophies.filter((t) => t.division === i).length;
    return h('div', { class: `trophy${won ? ' is-won' : ''}`, title: won ? `${d.trophy}${won > 1 ? ` ×${won}` : ''}` : `${d.trophy}: win the ${d.name} playoff final` },
      icon('trophy'),
      h('small', null, won ? d.trophy : d.name),
      won > 1 ? h('b', { class: 'count' }, `×${won}`) : null,
    );
  });
  const empty = save.trophies.length === 0;
  return h('section', { class: 'panel-dark shelf', 'aria-label': 'Trophy shelf' },
    h('div', { class: 'shelf-head' }, icon('star'), h('div', null, h('b', { class: 'display' }, empty ? 'Improve your club' : 'Trophy shelf'), h('small', null, empty ? 'Win a division playoff to earn your first trophy' : `${save.trophies.length} won · ${save.seasons.length} season${save.seasons.length === 1 ? '' : 's'} played`))),
    h('div', { class: 'trophies' }, slots),
  );
}

export function homeScreen(app: App): ScreenView {
  const save = app.save;
  const career = save.career;
  const div = DIVISIONS[career.division];
  const info = careerMatchInfo(save);
  const lp = levelProgress(save.xp);

  let card: HTMLElement;
  if (info) {
    const opp = info.club;
    const kindLabel = info.next.kind === 'league' ? div.name : info.next.kind === 'semi' ? `${div.trophy} · Semi-final` : `${div.trophy} · Final`;
    card = h('section', { class: 'panel next-card' },
      h('div', { class: 'next-comp' }, icon('trophy'), h('span', { class: 'display' }, kindLabel)),
      h('div', { class: 'versus' },
        h('div', { class: 'vs-team' }, clubBadge(app, 'big'), h('b', null, save.club.name)),
        h('span', { class: 'vs' }, 'VS'),
        h('div', { class: 'vs-team' }, h('span', { class: 'badge big', html: badgeSvg(opp.badge, opp.primary, opp.secondary) }), h('b', null, opp.name)),
      ),
      h('p', { class: 'muted center' }, `${ARENAS[info.arena].name} · ${info.next.home ? 'Home' : 'Away'} · ${opp.styleLabel}`),
      h('button', { class: 'btn btn-primary btn-big', 'data-autofocus': true, onclick: () => app.navigate('prematch?mode=career') }, icon('play'), 'Play next match'),
    );
  } else if (career.phase === 'complete' && career.result) {
    const r = career.result;
    const text = r.stage === 'champion' ? `${div.trophy} winners!` : r.stage === 'finalist' ? 'Runners-up' : r.stage === 'semifinalist' ? 'Semi-finalists' : `Finished ${ordinal(r.rank)}`;
    card = h('section', { class: 'panel next-card' },
      h('div', { class: 'next-comp' }, icon('trophy'), h('span', { class: 'display' }, `${div.name} · Season ${career.seasonNo}`)),
      h('h2', { class: 'display center big-line' }, text),
      h('p', { class: 'muted center' }, r.promoted ? `Promoted to the ${DIVISIONS[career.division + 1].name}.` : 'Another season awaits.'),
      h('button', { class: 'btn btn-primary btn-big', 'data-autofocus': true, onclick: () => app.navigate('league') }, icon('next'), 'Season review'),
    );
  } else {
    card = h('section', { class: 'panel next-card' }, h('p', null, 'No fixture available.'), h('button', { class: 'btn btn-primary', onclick: () => app.navigate('league') }, 'Open league hub'));
  }

  const played = career.fixtures.filter((f) => f.done && (f.home === 'player' || f.away === 'player')).length;
  const strip = h('button', { class: 'panel-dark season-strip', onclick: () => app.navigate('league'), 'aria-label': 'Open league hub' },
    h('div', { class: 'ss-top' }, icon('star'), h('b', null, div.name), h('span', null, career.phase === 'regular' ? `Match ${Math.min(ROUNDS, played + 1)}/${ROUNDS} · ${ordinal(playerRank(career))} place` : career.phase === 'complete' ? 'Season complete' : 'Playoffs')),
    h('div', { class: 'pips' }, Array.from({ length: ROUNDS }, (_, i) => h('i', { class: i < played ? 'on' : i === played && career.phase === 'regular' ? 'now' : '' }))),
  );

  const goal = h('div', { class: 'panel-dark goal-card' },
    h('div', { class: 'gc-row' }, h('b', null, `Club level ${lp.level}`), h('span', null, `${save.xp - lp.from} / ${lp.to - lp.from} XP`)),
    h('div', { class: 'bar' }, h('i', { style: `width:${Math.round(lp.frac * 100)}%` })),
    h('div', { class: 'gc-row' }, h('span', { class: 'muted' }, `Next: ${describeLevelReward(lp.level + 1)}`),
      save.picks > 0 ? h('button', { class: 'chip chip-yellow', onclick: () => app.navigate('club') }, icon('gift'), `${save.picks} free pick${save.picks > 1 ? 's' : ''}`) : null),
  );

  const side = h('div', { class: 'home-side' }, card, strip, goal,
    h('div', { class: 'row-2' },
      h('button', { class: 'btn btn-dark', onclick: () => app.navigate('prematch?mode=quick') }, icon('ball'), 'Quick match'),
      h('button', { class: 'btn btn-dark', onclick: () => app.navigate('play') }, 'All modes'),
    ),
  );

  const el = shell(app, { nav: 'play', cls: 'home' }, h('div', { class: 'stage-slot' }), side, trophyShelf(app));
  return { el, stage: { shot: 'duo', moods: ['idle', 'idle'] } };
}

export function ordinal(n: number): string {
  return `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
}

export function playScreen(app: App): ScreenView {
  const info = careerMatchInfo(app.save);
  const div = DIVISIONS[app.save.career.division];
  const mode = (title: string, text: string, ic: string, action: string, onClick: (() => void) | null, primary = false) =>
    h('section', { class: `panel mode-card${onClick ? '' : ' is-future'}` },
      h('div', { class: 'mode-icon' }, icon(ic)),
      h('h2', { class: 'display' }, title),
      h('p', null, text),
      onClick ? h('button', { class: `btn ${primary ? 'btn-primary' : 'btn-cyan'}`, onclick: onClick, 'data-autofocus': primary || null }, action) : h('span', { class: 'chip' }, icon('lock'), action),
    );
  const el = shell(app, { nav: 'play', title: 'Play', subtitle: 'Choose how to play', back: 'home', dim: true },
    h('div', { class: 'mode-grid' },
      mode('Club Career', info ? `${div.name}: next up ${CLUBS[info.next.opponent].name}. Ten league matches, then a four-team playoff for the ${div.trophy}.` : `${div.name}: review your season and start the next one.`, 'trophy', info ? 'Next fixture' : 'League hub', () => app.navigate(info ? 'prematch?mode=career' : 'league'), true),
      mode('Quick Match', 'One match with your choice of arena, opponent, difficulty and length. Earns reduced credits and XP; does not affect the league.', 'ball', 'Set up match', () => app.navigate('prematch?mode=quick')),
      mode('Academy & Trials', 'Playable lessons for every skill and six medal trials with personal bests.', 'academy', 'Open academy', () => app.navigate('academy')),
      mode('Online & Local Versus', 'Not part of this release. Matches here are always against bots.', 'club', 'Not available', null),
    ),
  );
  return { el };
}
