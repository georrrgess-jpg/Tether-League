import type { App, ScreenView } from '../../app';
import { ROUNDS, playerRank } from '../../career/career';
import { ARENAS } from '../../content/arenas';
import { CLUBS, DIVISIONS } from '../../content/clubs';
import { careerMatchInfo } from '../../game/setup';
import { describeLevelReward, levelProgress } from '../../progression/progression';
import { badgeSvg } from '../badge';
import { h, icon } from '../dom';
import { clubBadge, shell } from '../shell';
import { meter } from '../widgets';
import { nearestObjective } from './progress';

/** Friendly note shown when the next career opponent has eased off after recent defeats. */
export function comebackChip(ease: { losses: number; amount: number } | null): HTMLElement | null {
  if (!ease) return null;
  const why = ease.losses > 1 ? `after ${ease.losses} defeats in a row` : 'after a defeat';
  return h('div', { class: 'chip-boost', role: 'note', title: 'Opponents ease off a little after career defeats. Win to reset it.' },
    icon('boost'), h('span', null, h('b', null, 'Comeback boost'), h('br'), `Opponents ease off ${why}`));
}

export function ordinal(n: number): string {
  return `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
}

/** The two clubs facing each other, with a VS medallion. Shared by home, season hub and pre-match. */
export function versus(left: { badge: HTMLElement; name: string; sub?: Node | null }, right: { badge: HTMLElement; name: string; sub?: Node | null }): HTMLElement {
  const side = (s: typeof left, cls: string) => h('div', { class: `vs-team ${cls}` }, s.badge, h('div', { class: 'vs-name' }, h('b', null, s.name), s.sub ?? null));
  return h('div', { class: 'versus' }, side(left, 'vs-l'), h('span', { class: 'vs', 'aria-label': 'versus' }, 'VS'), side(right, 'vs-r'));
}

export function homeScreen(app: App): ScreenView {
  const save = app.save;
  const career = save.career;
  const div = DIVISIONS[career.division];
  const info = careerMatchInfo(save);
  const lp = levelProgress(save.xp);
  const played = career.fixtures.filter((f) => f.done && (f.home === 'player' || f.away === 'player')).length;

  // ---- next fixture card (the one obvious action)
  let card: HTMLElement;
  let heading: string;
  if (info) {
    heading = 'Ready to play';
    const opp = info.club;
    const kindLabel = info.next.kind === 'league' ? div.name : info.next.kind === 'semi' ? `${div.trophy} semi-final` : `${div.trophy} final`;
    card = h('section', { class: 'fixture-card', 'aria-label': 'Next match' },
      h('div', { class: 'fc-head' }, icon('trophy'), h('span', { class: 'fc-comp' }, kindLabel), h('span', { class: 'chip chip-peach' }, info.next.kind === 'league' ? `Round ${info.next.round} of ${ROUNDS}` : 'Playoffs')),
      h('div', { class: 'fc-body' },
        versus(
          { badge: clubBadge(app, 'big'), name: save.club.name, sub: h('span', { class: 'chip chip-cyan' }, `Lv. ${lp.level}`) },
          { badge: h('span', { class: 'badge big', html: badgeSvg(opp.badge, opp.primary, opp.secondary) }), name: opp.name },
        ),
        h('div', { class: 'fc-meta' },
          h('span', { class: 'chip' }, icon('pin'), ARENAS[info.arena].name),
          h('span', { class: 'chip' }, icon('home'), info.next.home ? 'Home' : 'Away'),
          h('span', { class: 'chip' }, icon('lines'), opp.styleLabel),
        ),
        comebackChip(info.ease),
        h('button', { class: 'btn btn-primary btn-big fc-play', 'data-autofocus': true, onclick: () => app.navigate('prematch?mode=career') }, icon('play'), 'Play next match'),
      ),
    );
  } else if (career.phase === 'complete' && career.result) {
    const r = career.result;
    const text = r.stage === 'champion' ? `${div.trophy} winners!` : r.stage === 'finalist' ? 'Runners-up' : r.stage === 'semifinalist' ? 'Semi-finalists' : `Finished ${ordinal(r.rank)}`;
    heading = r.stage === 'champion' ? 'Champions!' : 'Season complete';
    card = h('section', { class: 'fixture-card', 'aria-label': 'Season result' },
      h('div', { class: 'fc-head' }, icon('trophy'), h('span', { class: 'fc-comp' }, div.name), h('span', { class: 'chip chip-peach' }, `Season ${career.seasonNo}`)),
      h('div', { class: 'fc-body' },
        h('p', { class: 'fc-result' }, text),
        h('p', { class: 'muted center' }, r.promoted ? `Promoted to the ${DIVISIONS[career.division + 1].name}.` : 'Another season awaits.'),
        h('button', { class: 'btn btn-primary btn-big fc-play', 'data-autofocus': true, onclick: () => app.navigate('league') }, icon('next'), 'Season review'),
      ),
    );
  } else {
    heading = 'Matchday';
    card = h('section', { class: 'fixture-card' },
      h('div', { class: 'fc-head' }, icon('trophy'), h('span', { class: 'fc-comp' }, div.name)),
      h('div', { class: 'fc-body' },
        h('p', { class: 'center' }, 'Your season is being decided.'),
        h('button', { class: 'btn btn-primary btn-big fc-play', 'data-autofocus': true, onclick: () => app.navigate('league') }, icon('next'), 'Open season hub'),
      ),
    );
  }

  // ---- secondary destinations, visually quieter
  const seasonLine = career.phase === 'regular'
    ? `Match ${Math.min(ROUNDS, played + 1)}/${ROUNDS}${played ? ` · ${ordinal(playerRank(career))}` : ''}`
    : career.phase === 'complete' ? 'Season complete' : 'Playoffs';
  const tile = (cls: string, ic: string, label: string, sub: string, route: string) =>
    h('button', { class: `home-tile ${cls}`, type: 'button', onclick: () => app.navigate(route) },
      h('span', { class: 'ht-icon' }, icon(ic)),
      h('span', { class: 'ht-text' }, h('b', null, label), h('small', null, sub)),
      h('span', { class: 'ht-go', 'aria-hidden': 'true' }, icon('next')),
    );
  const tiles = h('div', { class: 'home-tiles' },
    tile('t-quick', 'ball', 'Quick match', 'Any arena, any club', 'prematch?mode=quick'),
    tile('t-season', 'calendar', 'Season hub', seasonLine, 'league'),
    tile('t-modes', 'grid', 'All modes', 'Academy and trials', 'play'),
  );

  // ---- next goal: club XP toward the next level (violet = club XP), plus the closest objective
  const near = nearestObjective(save);
  const goal = h('section', { class: 'goal-card', 'aria-label': 'Next goal' },
    h('div', { class: 'gc-top' },
      h('span', { class: 'gc-tag' }, icon('target'), 'Next goal'),
      save.picks > 0 ? h('button', { class: 'chip chip-yellow gc-pick', type: 'button', onclick: () => app.navigate('club'), title: 'Use a free pick in Club customisation' }, icon('gift'), `${save.picks} free pick${save.picks > 1 ? 's' : ''}`) : null,
    ),
    h('button', { class: 'gc-main', type: 'button', onclick: () => app.navigate('progress'), 'aria-label': `Reach club level ${lp.level + 1}: ${save.xp - lp.from} of ${lp.to - lp.from} XP. Open Progress.` },
      h('span', { class: 'gc-title' }, `Reach club level ${lp.level + 1}`),
      h('span', { class: 'gc-xp' }, `${save.xp - lp.from} / ${lp.to - lp.from} XP`),
      icon('next'),
    ),
    meter(lp.frac, 'Club XP to next level', 'xp', save.xp - lp.from, lp.to - lp.from),
    h('div', { class: 'gc-foot' },
      h('span', { class: 'gc-reward' }, icon('gift'), h('span', null, 'Reward: ', h('b', null, describeLevelReward(lp.level + 1)))),
      near
        ? h('button', { class: 'gc-obj', type: 'button', title: near.text, onclick: () => app.navigate('progress'), 'aria-label': `Objective: ${near.text}, ${near.progress} of ${near.target}. Open Progress.` },
            icon('target'), h('span', { class: 'gc-obj-text' }, near.text), h('b', null, `${near.progress}/${near.target}`))
        : null,
    ),
  );

  // ---- honours: the latest trophy, or the one this season is playing for
  const latest = save.trophies[save.trophies.length - 1];
  const trophy = latest
    ? h('button', { class: 'trophy-card is-won', type: 'button', onclick: () => app.navigate('club?tab=records'), 'aria-label': `Latest trophy: ${DIVISIONS[latest.division].trophy}. Open records.` },
        h('span', { class: 'tc-cup' }, icon('trophy')),
        h('span', { class: 'tc-text' }, h('small', null, icon('check'), 'Earned'), h('b', null, DIVISIONS[latest.division].trophy), h('span', null, `${save.trophies.length} troph${save.trophies.length === 1 ? 'y' : 'ies'} · ${save.seasons.length} season${save.seasons.length === 1 ? '' : 's'} played`)),
        icon('next'),
      )
    : h('button', { class: 'trophy-card', type: 'button', onclick: () => app.navigate('league'), 'aria-label': `Next trophy: ${div.trophy}. Open season hub.` },
        h('span', { class: 'tc-cup' }, icon('trophy')),
        h('span', { class: 'tc-text' }, h('small', null, 'Play for'), h('b', null, div.trophy), h('span', null, `Win the ${div.name} playoff final`)),
        icon('next'),
      );

  const stage = h('div', { class: 'home-stage' },
    h('div', { class: 'home-hello' },
      clubBadge(app, 'hh-badge'),
      h('div', null, h('span', { class: 'hh-club' }, save.club.name), h('h1', { class: 'hh-title' }, heading)),
    ),
    h('div', { class: 'stage-slot' }),
  );

  const el = shell(app, { nav: 'play', cls: 'home' },
    h('div', { class: 'home-grid' }, stage, h('div', { class: 'home-side' }, card, tiles), goal, trophy),
  );
  return { el, stage: { shot: 'duo', moods: ['idle', 'idle'] } };
}

export function playScreen(app: App): ScreenView {
  const info = careerMatchInfo(app.save);
  const div = DIVISIONS[app.save.career.division];
  const mode = (cls: string, title: string, text: string, ic: string, action: string, onClick: (() => void) | null, primary = false) =>
    h('section', { class: `mode-card ${cls}${onClick ? '' : ' is-future'}` },
      h('div', { class: 'mc-icon' }, icon(ic)),
      h('h2', { class: 'mc-title' }, title),
      h('p', null, text),
      onClick
        ? h('button', { class: `btn ${primary ? 'btn-primary' : 'btn-dark'}`, onclick: onClick, 'data-autofocus': primary || null }, icon(primary ? 'play' : 'next'), action)
        : h('span', { class: 'chip' }, icon('lock'), action),
    );
  const el = shell(app, { nav: 'play', title: 'All modes', subtitle: 'Choose how to play', back: 'home', dim: true, cls: 'modes' },
    h('div', { class: 'mode-grid' },
      mode('m-career', 'Club Career', info ? `${div.name}: next up ${CLUBS[info.next.opponent].name}. Ten league matches, then a four-team playoff for the ${div.trophy}.` : `${div.name}: review your season and start the next one.`, 'trophy', info ? 'Next fixture' : 'Season hub', () => app.navigate(info ? 'prematch?mode=career' : 'league'), true),
      mode('m-quick', 'Quick Match', 'One match with your choice of arena, opponent, difficulty and length. Earns reduced credits and XP; does not affect the league.', 'ball', 'Set up match', () => app.navigate('prematch?mode=quick')),
      mode('m-academy', 'Academy', 'Playable lessons for every skill, six medal trials with personal bests, and the playbook of team plays.', 'academy', 'Open academy', () => app.navigate('academy')),
      mode('m-future', 'Online & Local Versus', 'Not part of this release. Matches here are always against bots.', 'club', 'Not available', null),
    ),
  );
  return { el };
}
