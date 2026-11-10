import type { App, ScreenView } from '../../app';
import { ROUNDS, standings, type CareerState, type Tie } from '../../career/career';
import { ARENAS } from '../../content/arenas';
import { CLUBS, DIVISIONS, PLAYER_ID } from '../../content/clubs';
import { colorHex } from '../../content/cosmetics';
import { careerMatchInfo } from '../../game/setup';
import { startNextSeason } from '../../progression/progression';
import { badgeSvg } from '../badge';
import { h, icon } from '../dom';
import { shell } from '../shell';
import { cardHead, emptyState, tabBar } from '../widgets';
import { comebackChip, ordinal, versus } from './home';

export function clubName(app: App, id: string): string {
  return id === PLAYER_ID ? app.save.club.name : (CLUBS[id]?.name ?? id);
}

export function clubBadgeFor(app: App, id: string, cls = ''): HTMLElement {
  if (id === PLAYER_ID) {
    const c = app.save.club;
    return h('span', { class: `badge ${cls}`, html: badgeSvg(c.badge, colorHex(c.primary), colorHex(c.secondary)) });
  }
  const c = CLUBS[id];
  return h('span', { class: `badge ${cls}`, html: badgeSvg(c.badge, c.primary, c.secondary) });
}

function bracket(app: App, s: CareerState): HTMLElement {
  const slot = (id: string | null, score: number | null, win: boolean) =>
    h('div', { class: `b-slot${id === PLAYER_ID ? ' is-me' : ''}${win ? ' is-win' : ''}${id ? '' : ' is-empty'}` },
      id ? clubBadgeFor(app, id) : h('span', { class: 'badge' }),
      h('span', { class: 'b-name' }, id ? clubName(app, id) : 'To be decided'),
      score !== null ? h('b', null, String(score)) : null,
    );
  const tie = (t: Tie | null, a: string | null, b: string | null, label: string) =>
    h('div', { class: 'b-tie' }, h('small', null, label),
      slot(t ? t.a : a, t && t.done ? t.ag : null, !!t && t.done && t.ag > t.bg),
      slot(t ? t.b : b, t && t.done ? t.bg : null, !!t && t.done && t.bg > t.ag),
    );
  let sf1: HTMLElement;
  let sf2: HTMLElement;
  if (s.semis.length === 2) {
    sf1 = tie(s.semis[0], null, null, 'Semi-final · 1st v 4th');
    sf2 = tie(s.semis[1], null, null, 'Semi-final · 2nd v 3rd');
  } else {
    const t = standings(s);
    const proj = s.fixtures.some((f) => f.done);
    sf1 = tie(null, proj ? t[0].club : null, proj ? t[3].club : null, 'Semi-final · 1st v 4th');
    sf2 = tie(null, proj ? t[1].club : null, proj ? t[2].club : null, 'Semi-final · 2nd v 3rd');
  }
  const fin = tie(s.final, null, null, 'Final');
  return h('div', { class: 'bracket' },
    h('div', { class: 'b-col' }, sf1, sf2),
    h('div', { class: 'b-link', 'aria-hidden': 'true' }, icon('next')),
    h('div', { class: 'b-col b-final' }, fin,
      s.champion ? h('div', { class: 'champion' }, icon('trophy'), h('span', null, `${clubName(app, s.champion)} are champions`)) : null),
  );
}

type HubTab = 'overview' | 'playoffs' | 'rules';

export function leagueScreen(app: App, params: URLSearchParams): ScreenView {
  const save = app.save;
  const s = save.career;
  const div = DIVISIONS[s.division];
  const info = careerMatchInfo(save);
  const playedMine = s.fixtures.filter((f) => f.done && (f.home === PLAYER_ID || f.away === PLAYER_ID)).length;
  let tab: HubTab = (['overview', 'playoffs', 'rules'] as HubTab[]).find((t) => t === params.get('tab')) ?? 'overview';

  // ---- hero: title and the next fixture
  const roundLabel = s.phase === 'regular' ? `Round ${Math.min(ROUNDS, playedMine + 1)}` : s.phase === 'complete' ? 'Complete' : 'Playoffs';
  let card: HTMLElement;
  if (info) {
    const opp = info.club;
    card = h('section', { class: 'hub-next', 'aria-label': 'Next match' },
      h('span', { class: 'hn-tag' }, info.next.kind === 'league' ? `Next match · Round ${info.next.round}` : info.next.kind === 'semi' ? 'Playoff semi-final' : 'Playoff final'),
      versus(
        { badge: clubBadgeFor(app, PLAYER_ID, 'big'), name: save.club.name },
        { badge: clubBadgeFor(app, opp.id, 'big'), name: opp.name },
      ),
      h('div', { class: 'fc-meta' },
        h('span', { class: 'chip' }, icon('pin'), ARENAS[info.arena].name),
        h('span', { class: 'chip' }, icon('home'), info.next.home ? 'Home' : 'Away'),
        h('span', { class: 'chip' }, icon('lines'), opp.styleLabel),
      ),
      comebackChip(info.ease),
      h('button', { class: 'btn btn-primary btn-big', 'data-autofocus': true, onclick: () => app.navigate('prematch?mode=career') }, icon('play'), 'Play match'),
    );
  } else if (s.phase === 'complete' && s.result) {
    const r = s.result;
    card = h('section', { class: 'hub-next', 'aria-label': 'Season result' },
      h('span', { class: 'hn-tag' }, 'Season complete'),
      h('p', { class: 'fc-result' }, r.stage === 'champion' ? 'Champions!' : r.stage === 'finalist' ? 'Runners-up' : r.stage === 'semifinalist' ? 'Semi-finalists' : `Finished ${ordinal(r.rank)}`),
      h('p', { class: 'muted center' }, r.promoted ? `You are promoted to the ${DIVISIONS[s.division + 1].name}.` : r.stage === 'champion' ? 'You hold the top title. Defend it next season.' : `Win the playoff final to earn promotion${s.division < DIVISIONS.length - 1 ? ` to the ${DIVISIONS[s.division + 1].name}` : ''}.`),
      h('button', { class: 'btn btn-primary btn-big', 'data-autofocus': true, onclick: () => {
        if (startNextSeason(save)) {
          app.persist();
          app.toast(`Season ${save.career.seasonNo} begins in the ${DIVISIONS[save.career.division].name}.`, 'good');
        }
        app.refresh();
      } }, icon('next'), 'Start next season'),
    );
  } else {
    card = h('section', { class: 'hub-next' }, h('span', { class: 'hn-tag' }, 'Playoffs'), h('p', { class: 'center' }, 'Your season is being decided…'));
  }

  const hero = h('div', { class: 'hub-hero' },
    h('button', { class: 'back-btn is-back', type: 'button', 'aria-label': 'Back', onclick: () => app.navigate('home') }, icon('back'), h('span', null, 'Back')),
    h('div', { class: 'stage-slot' }),
    h('div', { class: 'hub-title' },
      h('span', { class: 'ht-eyebrow' }, 'Season hub'),
      h('h1', { class: 'ht-name' }, div.name),
      h('span', { class: 'ht-sub' }, h('i', { 'aria-hidden': 'true' }), `Season ${s.seasonNo} · ${roundLabel}`),
    ),
    card,
  );

  // ---- overview panels
  const table = standings(s);
  const standingsPanel = () => h('section', { class: 'panel hub-standings' },
    cardHead('trophy', 'Standings', 'Top four reach the playoffs'),
    h('table', { class: 'table' },
      h('thead', null, h('tr', null, h('th', null, '#'), h('th', { class: 'club' }, 'Club'), h('th', { title: 'Played' }, 'P'), h('th', { title: 'Wins' }, 'W'), h('th', { title: 'Losses' }, 'L'), h('th', { title: 'Goal difference' }, 'GD'), h('th', { title: 'Points' }, 'Pts'))),
      h('tbody', null, table.map((r, i) =>
        h('tr', { class: `${r.club === PLAYER_ID ? 'is-me' : ''}${i < 4 ? ' is-top' : ''}` },
          h('td', { class: 'rank' }, h('span', null, String(i + 1))),
          h('td', { class: 'club' }, h('div', { class: 'tclub' }, clubBadgeFor(app, r.club), h('span', null, clubName(app, r.club)))),
          h('td', null, String(r.played)),
          h('td', null, String(r.wins)),
          h('td', null, String(r.losses)),
          h('td', null, (r.gd > 0 ? '+' : '') + r.gd),
          h('td', { class: 'pts' }, h('b', null, String(r.points))),
        ),
      )),
    ),
  );

  const stageIdx = s.phase === 'regular' ? 0 : s.phase === 'semis' ? 1 : s.phase === 'final' ? 2 : 3;
  const inSemis = s.semis.some((t) => t.a === PLAYER_ID || t.b === PLAYER_ID);
  const inFinal = !!s.final && (s.final.a === PLAYER_ID || s.final.b === PLAYER_ID);
  const promo = () => h('section', { class: 'panel hub-promo' },
    cardHead('trophy', s.division < DIVISIONS.length - 1 ? 'Promotion path' : 'Title defence', s.phase === 'regular' ? `Played ${playedMine}/${ROUNDS}` : null),
    h('ol', { class: 'promo-steps' },
      [['Top 4', '(league)'], ['Semi-', 'finals'], ['Final', '']].map(([a, b], i) => {
        const done = i === 0 ? inSemis : i === 1 ? inFinal : s.champion === PLAYER_ID;
        const failed = !done && stageIdx > i;
        return h('li', { class: `step${done ? ' is-done' : ''}${failed ? ' is-failed' : ''}${stageIdx === i ? ' is-now' : ''}${i === 2 ? ' is-final' : ''}` },
          done ? icon('check') : null, h('b', null, a), b ? h('small', null, b) : null);
      }),
    ),
    h('p', { class: 'muted center' }, 'Top four advance to the playoffs. Win the final for the trophy.'),
    h('span', { class: 'chip chip-cyan promo-chip' }, s.division < DIVISIONS.length - 1 ? `Promotion to ${DIVISIONS[s.division + 1].name}` : `Defend the ${div.trophy}`),
  );

  const history = () => h('section', { class: 'panel hub-history' },
    cardHead('rotate', 'Season history'),
    save.seasons.length
      ? h('ul', { class: 'history' }, save.seasons.slice().reverse().slice(0, 6).map((r) =>
          h('li', null, h('b', null, `S${r.seasonNo} · ${DIVISIONS[r.division].name}`),
            h('span', { class: `chip ${r.stage === 'champion' ? 'chip-yellow' : ''}` }, r.stage === 'champion' ? icon('trophy') : null,
              `${r.stage === 'champion' ? 'Champions' : r.stage === 'finalist' ? 'Final' : r.stage === 'semifinalist' ? 'Semi-final' : ordinal(r.rank)} · ${r.wins}W ${r.losses}L`)),
        ))
      : emptyState('calendar', `Season ${s.seasonNo} is your first. Finished seasons are recorded here.`),
  );

  const mine = s.fixtures.filter((f) => f.home === PLAYER_ID || f.away === PLAYER_ID);
  const schedule = () => h('section', { class: 'panel hub-schedule' },
    cardHead('calendar', 'Season schedule', `${ROUNDS} rounds`),
    h('ol', { class: 'fixtures' },
      mine.map((f) => {
        const home = f.home === PLAYER_ID;
        const opp = home ? f.away : f.home;
        const my = home ? f.hg : f.ag;
        const their = home ? f.ag : f.hg;
        const next = info?.next.id === f.id;
        return h('li', { class: `${f.done ? (my > their ? 'is-win' : 'is-loss') : ''}${next ? ' is-next' : ''}` },
          h('span', { class: 'fx-r' }, `R${f.round}`),
          clubBadgeFor(app, opp),
          h('span', { class: 'fx-name' }, `${home ? 'vs' : 'at'} ${clubName(app, opp)}`),
          f.done
            ? h('span', { class: `fx-res ${my > their ? 'w' : 'l'}` }, `${my > their ? 'W' : 'L'} ${my}–${their}${f.ot ? ' OT' : ''}`)
            : next ? h('span', { class: 'fx-res next' }, 'Next') : h('span', { class: 'fx-res' }, '–'),
        );
      }),
    ),
  );

  const playoffs = () => h('section', { class: 'panel hub-playoffs' },
    cardHead('trophy', s.phase === 'regular' ? 'Playoffs (as it stands)' : 'Playoffs', div.trophy),
    bracket(app, s),
    h('p', { class: 'muted' }, s.phase === 'regular' ? 'The bracket fills from the current table. It is fixed when the regular season ends.' : 'Every playoff match has a winner: level after three minutes goes to sudden-death overtime.'),
  );

  const rules = () => h('section', { class: 'panel hub-rules' },
    cardHead('info', 'League rules'),
    h('ul', { class: 'rules' },
      h('li', null, 'Six clubs play each other twice: ten league matches each.'),
      h('li', null, 'Every match has a winner. Level after three minutes means sudden-death overtime.'),
      h('li', null, 'A win is 3 points, a loss 0. Ties in the table are split by goal difference, then goals scored.'),
      h('li', null, 'The top four enter the playoffs: 1st v 4th and 2nd v 3rd, then a final.'),
      h('li', null, `Winning the final earns the ${div.trophy} and promotion. Any other finish keeps you in the ${div.name} for another season, with all credits and unlocks kept.`),
      h('li', null, 'Other clubs\' results are simulated once per round from club strength and style, and never change afterwards.'),
      h('li', null, 'Season prize money is paid by final position and playoff stage when the season ends.'),
    ),
  );

  const tabsSlot = h('div', { class: 'hub-tabs' });
  const body = h('div', { class: 'hub-body' });
  const render = () => {
    tabsSlot.replaceChildren(tabBar<HubTab>([
      { id: 'overview', label: 'Season overview', short: 'Overview', icon: 'trophy' },
      { id: 'playoffs', label: 'Playoffs', icon: 'grid' },
      { id: 'rules', label: 'Rules', icon: 'info' },
    ], tab, (t) => {
      tab = t;
      history_replace(t);
      render();
    }, 'Season hub sections'));
    body.className = `hub-body is-${tab}`;
    if (tab === 'overview') body.replaceChildren(standingsPanel(), h('div', { class: 'hub-mid' }, promo(), history()), schedule());
    else if (tab === 'playoffs') body.replaceChildren(playoffs(), promo());
    else body.replaceChildren(rules(), history());
  };
  // Remember the tab in the address so Back returns to it, without re-rendering the screen.
  const history_replace = (t: HubTab) => {
    try {
      window.history.replaceState(null, '', `#/league${t === 'overview' ? '' : `?tab=${t}`}`);
    } catch {
      /* sandboxed frames may block history changes */
    }
  };
  render();

  const el = shell(app, { nav: 'play', cls: 'league' }, hero, tabsSlot, body);
  return { el, stage: { shot: 'duo', moods: ['ready', 'idle'] } };
}

export function seasonScreen(app: App): ScreenView {
  // The season review lives in the league hub; this route keeps old links working.
  queueMicrotask(() => app.navigate('league', true));
  return { el: h('div', { class: 'screen' }) };
}
