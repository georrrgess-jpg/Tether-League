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
import { ordinal } from './home';

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
  return h('div', { class: 'bracket' }, h('div', { class: 'b-col' }, sf1, sf2), h('div', { class: 'b-col b-final' }, fin,
    s.champion ? h('div', { class: 'champion' }, icon('trophy'), h('span', null, `${clubName(app, s.champion)} are champions`)) : null));
}

export function leagueScreen(app: App): ScreenView {
  const save = app.save;
  const s = save.career;
  const div = DIVISIONS[s.division];
  const table = standings(s);
  const info = careerMatchInfo(save);
  const playedMine = s.fixtures.filter((f) => f.done && (f.home === PLAYER_ID || f.away === PLAYER_ID)).length;

  const rows = table.map((r, i) =>
    h('tr', { class: `${r.club === PLAYER_ID ? 'is-me' : ''}${i < 4 ? ' is-top' : ''}` },
      h('td', { class: 'rank' }, String(i + 1)),
      h('td', { class: 'club' }, clubBadgeFor(app, r.club), h('span', null, clubName(app, r.club))),
      h('td', null, String(r.played)),
      h('td', null, String(r.wins)),
      h('td', null, String(r.losses)),
      h('td', null, (r.gd > 0 ? '+' : '') + r.gd),
      h('td', { class: 'pts' }, String(r.points)),
    ),
  );
  const standingsPanel = h('section', { class: 'panel-dark league-standings' },
    h('h2', { class: 'section-head' }, icon('trophy'), 'Standings'),
    h('table', { class: 'table' },
      h('thead', null, h('tr', null, h('th', null, '#'), h('th', { class: 'club' }, 'Club'), h('th', { title: 'Played' }, 'P'), h('th', { title: 'Wins' }, 'W'), h('th', { title: 'Losses' }, 'L'), h('th', { title: 'Goal difference' }, 'GD'), h('th', { title: 'Points' }, 'Pts'))),
      h('tbody', null, rows),
    ),
    h('p', { class: 'muted' }, 'Top four reach the playoffs.'),
  );

  let center: HTMLElement;
  if (info) {
    const opp = info.club;
    center = h('section', { class: 'panel-dark league-next' },
      h('div', { class: 'ln-tag display' }, info.next.kind === 'league' ? `Next match · Round ${info.next.round}` : info.next.kind === 'semi' ? 'Playoff semi-final' : 'Playoff final'),
      h('div', { class: 'versus on-dark' },
        h('div', { class: 'vs-team' }, clubBadgeFor(app, PLAYER_ID, 'big'), h('b', null, save.club.name)),
        h('span', { class: 'vs' }, 'VS'),
        h('div', { class: 'vs-team' }, clubBadgeFor(app, opp.id, 'big'), h('b', null, opp.name)),
      ),
      h('div', { class: 'ln-meta' }, h('span', { class: 'chip' }, ARENAS[info.arena].name), h('span', { class: 'chip' }, info.next.home ? 'Home' : 'Away'), h('span', { class: 'chip' }, opp.styleLabel)),
      h('button', { class: 'btn btn-primary btn-big', 'data-autofocus': true, onclick: () => app.navigate('prematch?mode=career') }, icon('play'), 'Play match'),
    );
  } else if (s.phase === 'complete' && s.result) {
    const r = s.result;
    center = h('section', { class: 'panel-dark league-next' },
      h('div', { class: 'ln-tag display' }, 'Season complete'),
      h('h2', { class: 'display big-line' }, r.stage === 'champion' ? 'Champions!' : r.stage === 'finalist' ? 'Runners-up' : r.stage === 'semifinalist' ? 'Semi-finalists' : `Finished ${ordinal(r.rank)}`),
      h('p', { class: 'muted' }, r.promoted ? `You are promoted to the ${DIVISIONS[s.division + 1].name}.` : r.stage === 'champion' ? 'You hold the top title. Defend it next season.' : `Win the playoff final to earn promotion${s.division < DIVISIONS.length - 1 ? ` to the ${DIVISIONS[s.division + 1].name}` : ''}.`),
      h('button', { class: 'btn btn-primary btn-big', 'data-autofocus': true, onclick: () => {
        if (startNextSeason(save)) {
          app.persist();
          app.toast(`Season ${save.career.seasonNo} begins in the ${DIVISIONS[save.career.division].name}.`, 'good');
        }
        app.refresh();
      } }, icon('next'), 'Start next season'),
    );
  } else {
    center = h('section', { class: 'panel-dark league-next' }, h('p', null, 'Your season is being decided…'));
  }

  const mine = s.fixtures.filter((f) => f.home === PLAYER_ID || f.away === PLAYER_ID);
  const schedule = h('section', { class: 'panel-dark league-schedule' },
    h('h2', { class: 'section-head' }, icon('calendar'), 'Season schedule'),
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
          h('span', { class: 'fx-name' }, `${home ? 'v' : 'at'} ${clubName(app, opp)}`),
          f.done ? h('b', { class: 'fx-score' }, `${my}–${their}${f.ot ? ' OT' : ''}`) : h('span', { class: 'fx-score muted' }, next ? 'Next' : '–'),
          f.done ? h('span', { class: `fx-res ${my > their ? 'w' : 'l'}` }, my > their ? 'W' : 'L') : h('span', { class: 'fx-res' }),
        );
      }),
    ),
  );

  const playoffs = h('section', { class: 'panel-dark league-playoffs' }, h('h2', { class: 'section-head' }, icon('trophy'), s.phase === 'regular' ? 'Playoffs (as it stands)' : 'Playoffs'), bracket(app, s));

  const rules = h('details', { class: 'panel-dark league-rules' },
    h('summary', null, icon('info'), 'League rules'),
    h('ul', null,
      h('li', null, 'Six clubs play each other twice: ten league matches each.'),
      h('li', null, 'Every match has a winner. Level after three minutes means sudden-death overtime.'),
      h('li', null, 'A win is 3 points, a loss 0. Ties in the table are split by goal difference, then goals scored.'),
      h('li', null, 'The top four enter the playoffs: 1st v 4th and 2nd v 3rd, then a final.'),
      h('li', null, `Winning the final earns the ${div.trophy} and promotion. Any other finish keeps you in the ${div.name} for another season, with all credits and unlocks kept.`),
      h('li', null, 'Other clubs\' results are simulated once per round from club strength and style, and never change afterwards.'),
    ),
  );

  const history = save.seasons.length
    ? h('section', { class: 'panel-dark league-history' },
        h('h2', { class: 'section-head' }, icon('star'), 'Season history'),
        h('ul', { class: 'history' }, save.seasons.slice().reverse().slice(0, 8).map((r) =>
          h('li', null, h('b', null, `S${r.seasonNo} · ${DIVISIONS[r.division].name}`), h('span', null, `${ordinal(r.rank)} · ${r.wins}W ${r.losses}L · ${r.stage === 'champion' ? 'Champions' : r.stage === 'finalist' ? 'Final' : r.stage === 'semifinalist' ? 'Semi-final' : 'No playoff'}`)),
        )),
      )
    : null;

  const promo = h('div', { class: 'panel-dark promo' }, icon('trophy'),
    h('div', null, h('small', null, s.division < DIVISIONS.length - 1 ? 'Promotion to' : 'Defend the'), h('b', { class: 'display' }, s.division < DIVISIONS.length - 1 ? DIVISIONS[s.division + 1].name : div.trophy)),
    h('div', { class: 'promo-steps' },
      ['Top four', 'Semi-final', 'Final'].map((label, i) => {
        const stageIdx = s.phase === 'regular' ? 0 : s.phase === 'semis' ? 1 : s.phase === 'final' ? 2 : 3;
        const inSemis = s.semis.some((t) => t.a === PLAYER_ID || t.b === PLAYER_ID);
        const inFinal = !!s.final && (s.final.a === PLAYER_ID || s.final.b === PLAYER_ID);
        const done = i === 0 ? inSemis : i === 1 ? inFinal : s.champion === PLAYER_ID;
        const failed = !done && stageIdx > i;
        return h('span', { class: `step${done ? ' is-done' : ''}${failed ? ' is-failed' : ''}${stageIdx === i ? ' is-now' : ''}` }, h('i', null, done ? icon('check') : null), label);
      }),
    ),
    h('span', { class: 'chip chip-cyan' }, s.phase === 'regular' ? `Played ${playedMine}/${ROUNDS}` : s.phase === 'complete' ? 'Complete' : 'Playoffs'),
  );

  const el = shell(app, { nav: 'play', title: 'Season hub', subtitle: `${div.name} · Season ${s.seasonNo}`, back: 'home', dim: true, cls: 'league' },
    h('div', { class: 'league-grid' }, standingsPanel, h('div', { class: 'league-mid' }, center, promo), h('div', { class: 'league-right' }, schedule, playoffs), h('div', { class: 'league-foot' }, rules, history)),
  );
  return { el };
}

export function seasonScreen(app: App): ScreenView {
  // The season review lives in the league hub; this route keeps old links working.
  queueMicrotask(() => app.navigate('league', true));
  return { el: h('div', { class: 'screen' }) };
}
