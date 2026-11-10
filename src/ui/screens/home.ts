import type { App, ScreenView } from '../../app';
import { ROUNDS, playerRank } from '../../career/career';
import { ARENAS } from '../../content/arenas';
import { CLUBS, DIVISIONS } from '../../content/clubs';
import { careerMatchInfo } from '../../game/setup';
import { describeLevelReward, levelProgress } from '../../progression/progression';
import { badgeSvg } from '../badge';
import { h, icon } from '../dom';
import { clubBadge, shell } from '../shell';
import { nearestObjective } from './progress';

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

/** Friendly note shown when the next career opponent has eased off after recent defeats. */
export function comebackChip(ease: { losses: number; amount: number } | null): HTMLElement | null {
  if (!ease) return null;
  const why = ease.losses > 1 ? `after ${ease.losses} defeats in a row` : 'after a defeat';
  return h('div', { class: 'chip-boost', role: 'note', title: 'Opponents ease off a little after career defeats. Win to reset it.' },
    icon('boost'), h('span', null, h('b', null, 'Comeback boost'), h('br'), `Opponents ease off ${why}`));
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
    card = h('section', { class: 'panel next-card', 'aria-label': 'Next match' },
      h('div', { class: 'next-comp' }, icon('trophy'), h('span', { class: 'display' }, kindLabel), info.next.kind === 'league' ? h('span', { class: 'chip' }, `Round ${info.next.round}`) : null),
      h('div', { class: 'versus' },
        h('div', { class: 'vs-team' }, clubBadge(app, 'big'), h('b', null, save.club.name)),
        h('span', { class: 'vs' }, 'VS'),
        h('div', { class: 'vs-team' }, h('span', { class: 'badge big', html: badgeSvg(opp.badge, opp.primary, opp.secondary) }), h('b', null, opp.name)),
      ),
      h('div', { class: 'next-meta' },
        h('span', { class: 'chip' }, icon('map'), ARENAS[info.arena].name),
        h('span', { class: 'chip' }, info.next.home ? 'Home' : 'Away'),
        h('span', { class: 'chip' }, opp.styleLabel),
      ),
      comebackChip(info.ease),
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
    card = h('section', { class: 'panel next-card' },
      h('div', { class: 'next-comp' }, icon('trophy'), h('span', { class: 'display' }, div.name)),
      h('p', { class: 'center' }, 'Your season is being decided.'),
      h('button', { class: 'btn btn-primary btn-big', 'data-autofocus': true, onclick: () => app.navigate('league') }, icon('next'), 'Open season hub'));
  }

  const played = career.fixtures.filter((f) => f.done && (f.home === 'player' || f.away === 'player')).length;
  const strip = h('button', { class: 'panel-dark season-strip', onclick: () => app.navigate('league'), 'aria-label': 'Open season hub' },
    h('div', { class: 'ss-top' }, icon('star'), h('b', null, div.name), h('span', null, career.phase === 'regular' ? `Match ${Math.min(ROUNDS, played + 1)}/${ROUNDS} · ${played ? `${ordinal(playerRank(career))} place` : 'Season opener'}` : career.phase === 'complete' ? 'Season complete' : 'Playoffs'), icon('next')),
    h('div', { class: 'pips' }, Array.from({ length: ROUNDS }, (_, i) => h('i', { class: i < played ? 'on' : i === played && career.phase === 'regular' ? 'now' : '' }))),
  );

  const tiles = h('div', { class: 'home-tiles' },
    h('button', { class: 'tile t-quick tilt', onclick: () => app.navigate('prematch?mode=quick') }, icon('ball'), 'Quick match'),
    h('button', { class: 'tile t-season tilt', onclick: () => app.navigate('league') }, icon('calendar'), 'Season hub'),
    h('button', { class: 'tile t-modes tilt', onclick: () => app.navigate('play') }, icon('grid'), 'All modes'),
  );

  // Next goals: the club level bar with its next reward, and the objective closest to done.
  const near = nearestObjective(save);
  const goal = h('section', { class: 'panel-dark goal-card next-goals', 'aria-label': 'Next goals' },
    h('div', { class: 'gc-row' }, h('b', null, `Club level ${lp.level}`), h('span', null, `${save.xp - lp.from} / ${lp.to - lp.from} XP`)),
    h('div', { class: 'bar yellow' }, h('i', { style: `width:${Math.round(lp.frac * 100)}%` })),
    h('div', { class: 'gc-row' }, h('span', { class: 'ng-next' }, icon('gift'), h('span', null, 'Next: ', h('b', null, describeLevelReward(lp.level + 1)))),
      save.picks > 0 ? h('button', { class: 'chip chip-yellow', onclick: () => app.navigate('club') }, icon('gift'), `${save.picks} free pick${save.picks > 1 ? 's' : ''}`) : null),
    near
      ? h('button', { class: 'ng-objective', title: near.text, onclick: () => app.navigate('progress'), 'aria-label': `Objective: ${near.text}, ${near.progress} of ${near.target}. Open Progress.` },
          icon('target'),
          h('span', { class: 'ng-text' }, near.text),
          h('span', { class: 'ng-count' }, `${near.progress}/${near.target}`),
          icon('next'),
          h('span', { class: 'bar' }, h('i', { style: `width:${Math.round((near.progress / near.target) * 100)}%` })),
        )
      : h('button', { class: 'ng-objective', onclick: () => app.navigate('progress') }, icon('target'), h('span', { class: 'ng-text' }, 'Objectives and rewards'), icon('next')),
  );

  const side = h('div', { class: 'home-side' }, card, tiles, strip, goal);

  const el = shell(app, { nav: 'play', cls: 'home' }, h('div', { class: 'stage-slot' }), side, trophyShelf(app));
  return { el, stage: { shot: 'duo', moods: ['idle', 'idle'] } };
}

export function ordinal(n: number): string {
  return `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
}

export function playScreen(app: App): ScreenView {
  const info = careerMatchInfo(app.save);
  const div = DIVISIONS[app.save.career.division];
  const mode = (cls: string, title: string, text: string, ic: string, action: string, onClick: (() => void) | null, primary = false) =>
    h('section', { class: `mode-card ${cls}${onClick ? ' tilt' : ' is-future'}` },
      h('span', { class: 'mode-mark', 'aria-hidden': 'true' }, icon(ic)),
      h('div', { class: 'mode-icon' }, icon(ic)),
      h('h2', { class: 'display' }, title),
      h('p', null, text),
      onClick ? h('button', { class: `btn ${primary ? 'btn-dark btn-big' : 'btn-dark'}`, onclick: onClick, 'data-autofocus': primary || null }, icon(primary ? 'play' : 'next'), action) : h('span', { class: 'chip' }, icon('lock'), action),
    );
  const el = shell(app, { nav: 'play', title: 'Play', subtitle: 'Choose how to play', back: 'home', dim: true },
    h('div', { class: 'mode-grid' },
      mode('m-career', 'Club Career', info ? `${div.name}: next up ${CLUBS[info.next.opponent].name}. Ten league matches, then a four-team playoff for the ${div.trophy}.` : `${div.name}: review your season and start the next one.`, 'trophy', info ? 'Next fixture' : 'Season hub', () => app.navigate(info ? 'prematch?mode=career' : 'league'), true),
      mode('m-quick', 'Quick Match', 'One match with your choice of arena, opponent, difficulty and length. Earns reduced credits and XP; does not affect the league.', 'ball', 'Set up match', () => app.navigate('prematch?mode=quick')),
      mode('m-academy', 'Academy & Trials', 'Playable lessons for every skill and six medal trials with personal bests.', 'academy', 'Open academy', () => app.navigate('academy')),
      mode('m-future', 'Online & Local Versus', 'Not part of this release. Matches here are always against bots.', 'club', 'Not available', null),
    ),
  );
  return { el };
}
