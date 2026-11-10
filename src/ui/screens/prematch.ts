import type { App, ScreenView } from '../../app';
import { ARENAS, ARENA_ORDER, type ArenaId } from '../../content/arenas';
import { CHASSIS } from '../../content/chassis';
import { CLUBS, DIVISIONS } from '../../content/clubs';
import { DIFFICULTY, DIFFICULTY_ORDER, TENDENCY, type TendencyId } from '../../game/ai/bot';
import { careerMatchInfo, careerSetup, opponentTeam, quickSetup } from '../../game/setup';
import { unlockedArenas } from '../../progression/progression';
import { h, icon } from '../dom';
import { controlsStrip } from '../controls';
import { standings } from '../../career/career';
import { REWARDS } from '../../progression/progression';
import { clubBadge, shell } from '../shell';
import { comebackChip } from './home';
import { clubBadgeFor } from './league';

export function seg<T extends string | number>(options: { value: T; label: string; title?: string }[], current: T, onPick: (v: T) => void, label: string): HTMLElement {
  return h('div', { class: 'seg', role: 'group', 'aria-label': label },
    options.map((o) => h('button', { 'aria-pressed': String(o.value === current), title: o.title ?? null, onclick: () => onPick(o.value) }, o.label)),
  );
}

/** Small top-down pitch diagram drawn to scale from the arena definition. */
export function arenaDiagram(id: ArenaId): HTMLElement {
  const a = ARENAS[id];
  const w = a.length + a.goalDepth * 2 + 2;
  const hgt = a.width + 3;
  const hx = a.length / 2;
  const hz = a.width / 2;
  const c = a.corner;
  const pts = [
    [-(hx - c), -hz], [hx - c, -hz], [hx, -(hz - c)], [hx, hz - c], [hx - c, hz], [-(hx - c), hz], [-hx, hz - c], [-hx, -(hz - c)],
  ].map((p) => p.join(',')).join(' ');
  const grass: Record<ArenaId, string> = { harbor_park: '#46a085', foundry_court: '#3f8a6d', skyline_stadium: '#40997f', championship_dome: '#44a47f' };
  const bg: Record<ArenaId, string> = { harbor_park: '#8fd0f5', foundry_court: '#3a2a20', skyline_stadium: '#8a4a8f', championship_dome: '#14204a' };
  const anchors = a.anchors.map((an) => `<circle cx="${an.x}" cy="${an.z}" r="0.55" fill="#f6c542" stroke="#17273e" stroke-width="0.18"/>`).join('');
  const gw = a.goalWidth / 2;
  const svg = `<svg viewBox="${-w / 2} ${-hgt / 2} ${w} ${hgt}" class="arena-svg" role="img" aria-label="${a.name} layout">
    <rect x="${-w / 2}" y="${-hgt / 2}" width="${w}" height="${hgt}" fill="${bg[id]}" rx="1.2"/>
    <polygon points="${pts}" fill="${grass[id]}" stroke="#f3f5ef" stroke-width="0.35"/>
    <line x1="0" y1="${-hz}" x2="0" y2="${hz}" stroke="#f3f5ef" stroke-width="0.14" opacity="0.8"/>
    <circle cx="0" cy="0" r="3" fill="none" stroke="#f3f5ef" stroke-width="0.14" opacity="0.8"/>
    <rect x="${-hx - a.goalDepth}" y="${-gw}" width="${a.goalDepth}" height="${a.goalWidth}" fill="#12bcd2" opacity="0.9"/>
    <rect x="${hx}" y="${-gw}" width="${a.goalDepth}" height="${a.goalWidth}" fill="#f48a2c" opacity="0.9"/>
    ${anchors}
  </svg>`;
  return h('div', { class: 'arena-diagram', html: svg });
}

export function prematchScreen(app: App, params: URLSearchParams): ScreenView {
  const save = app.save;
  const mode = params.get('mode') === 'quick' ? 'quick' : 'career';
  const info = mode === 'career' ? careerMatchInfo(save) : null;
  if (mode === 'career' && !info) {
    queueMicrotask(() => app.navigate('league', true));
    return { el: h('div', { class: 'screen' }) };
  }
  const prefs = save.prefs;
  const unlocked = unlockedArenas(save);
  if (!unlocked.includes(prefs.quickArena)) prefs.quickArena = 'harbor_park';
  const oppId = info ? info.club.id : (CLUBS[prefs.quickOpponent] ? prefs.quickOpponent : 'ember_works');
  const opp = CLUBS[oppId];
  const arena = info ? info.arena : prefs.quickArena;
  const kit = opponentTeam(save, opp);
  const change = (fn: () => void) => () => {
    fn();
    app.persist();
    app.refresh();
  };

  const start = () => {
    if (mode === 'career') {
      const setup = careerSetup(save);
      if (setup) app.startMatch(setup, oppId, 'league');
    } else {
      const setup = quickSetup(save);
      app.persist();
      app.startMatch(setup, oppId, 'prematch?mode=quick');
    }
  };

  /** Opponent's league position and recent form in this season (career only). */
  function scouting(): HTMLElement {
    const table = standings(save.career);
    const pos = table.findIndex((r) => r.club === oppId) + 1;
    const row = table.find((r) => r.club === oppId);
    const form = save.career.fixtures
      .filter((f) => f.done && (f.home === oppId || f.away === oppId))
      .slice(-3)
      .map((f) => {
        const won = f.home === oppId ? f.hg > f.ag : f.ag > f.hg;
        return h('i', { class: `form ${won ? 'w' : 'l'}`, title: won ? 'Win' : 'Loss' }, won ? 'W' : 'L');
      });
    if (!row || row.played === 0) return h('div', { class: 'scouting one' }, h('span', null, h('small', null, 'Scouting'), h('b', null, `First meeting of the season · ${opp.styleLabel}`)));
    return h('div', { class: 'scouting' },
      h('span', null, h('small', null, 'League position'), h('b', null, pos ? `${pos}${pos === 1 ? 'st' : pos === 2 ? 'nd' : pos === 3 ? 'rd' : 'th'}` : '–')),
      h('span', null, h('small', null, 'Record'), h('b', null, row ? `${row.wins}W ${row.losses}L` : '–')),
      h('span', null, h('small', null, 'Form'), h('b', { class: 'forms' }, form.length ? form : '–')),
    );
  }

  const tend = TENDENCY[prefs.tendency];
  const row = (label: string, control: Node, note?: string) => h('div', { class: 'opt' }, h('div', { class: 'opt-head' }, h('b', null, label), control), note ? h('p', { class: 'muted' }, note) : null);

  const options = h('section', { class: 'panel prematch-options' },
    h('h2', { class: 'section-head' }, icon('settings'), 'Match setup'),
    row('Teammate', seg((Object.keys(TENDENCY) as TendencyId[]).map((t) => ({ value: t, label: TENDENCY[t].name })), prefs.tendency, (v) => change(() => (prefs.tendency = v))(), 'Teammate tendency'), tend.summary),
    mode === 'quick'
      ? row('Difficulty', seg(DIFFICULTY_ORDER.map((d) => ({ value: d, label: DIFFICULTY[d].name })), prefs.quickDifficulty, (v) => change(() => (prefs.quickDifficulty = v))(), 'Difficulty'), DIFFICULTY[prefs.quickDifficulty].summary)
      : row('Opponent level', seg([{ value: 'std', label: `${info!.difficulty.name}` }, { value: 'relaxed', label: 'Relaxed' }], prefs.relaxed ? 'relaxed' : 'std', (v) => change(() => (prefs.relaxed = v === 'relaxed'))(), 'Opponent level'),
          prefs.relaxed ? 'Relaxed: opponents react slower and aim less accurately in every career match. Rewards and league rules are unchanged.' : `${DIVISIONS[save.career.division].name} standard. Bots never get extra speed or reach, only sharper reactions and aim.`),
    mode === 'quick' ? row('Match length', seg([2, 3, 5].map((m) => ({ value: m, label: `${m} min` })), prefs.quickMinutes, (v) => change(() => (prefs.quickMinutes = v))(), 'Match length')) : null,
    row('Aim assist', seg([{ value: 'off', label: 'Off' }, { value: 'light', label: 'Light' }, { value: 'strong', label: 'Strong' }] as { value: 'off' | 'light' | 'strong'; label: string }[], save.settings.aimAssistance, (v) => change(() => (save.settings.aimAssistance = v))(), 'Aim assist'),
      save.settings.aimAssistance === 'off' ? 'Kicks go exactly where you aim.' : 'Shots aimed close to the goal or a teammate are nudged on target. The ball is never teleported.'),
    row('Your robot', h('button', { class: 'btn btn-small btn-ghost', onclick: () => app.navigate('garage') }, icon('garage'), CHASSIS[save.club.chassis].name), `${CHASSIS[save.club.chassis].tagline}. Teammate: ${CHASSIS[save.club.mateChassis].name}.`),
  );

  const oppPick = mode === 'quick'
    ? row('Opponent', (() => {
        const sel = h('select', { class: 'select', 'aria-label': 'Opponent club' }, Object.values(CLUBS).map((c) => h('option', { value: c.id, selected: c.id === oppId }, c.name))) as HTMLSelectElement;
        sel.addEventListener('change', () => change(() => (prefs.quickOpponent = sel.value))());
        return sel;
      })(), `${opp.styleLabel}.`)
    : null;
  if (oppPick) options.insertBefore(oppPick, options.children[1]);

  const pay = (credits: number) => Math.round(credits * (mode === 'quick' ? REWARDS.quickFactor : 1));
  const matchup = h('section', { class: 'panel-dark prematch-matchup' },
    h('div', { class: 'ln-tag display' }, info ? info.label : 'Quick match'),
    h('div', { class: 'versus on-dark' },
      h('div', { class: 'vs-team' }, clubBadge(app, 'big'), h('b', null, save.club.name), h('small', null, 'Attacks right →')),
      h('span', { class: 'vs' }, 'VS'),
      h('div', { class: 'vs-team' }, clubBadgeFor(app, oppId, 'big'), h('b', null, opp.name), h('small', null, opp.styleLabel)),
    ),
    info ? comebackChip(info.ease) : null,
    kit.awayKit ? h('p', { class: 'muted center' }, `${opp.name} wear their away kit so the teams are easy to tell apart.`) : null,
    info ? scouting() : null,
    h('div', { class: 'stakes' },
      h('span', { class: 'chip' }, icon('coin'), `Play: +${pay(REWARDS.matchComplete.credits)}`),
      h('span', { class: 'chip chip-yellow' }, icon('trophy'), `Win: +${pay(REWARDS.matchComplete.credits + REWARDS.winBonus.credits)} credits`),
      h('span', { class: 'chip' }, icon('star'), 'Passes, saves and goals add a bonus'),
    ),
  );

  const arenaCard = h('section', { class: 'panel prematch-arena' },
    h('div', { class: 'arena-line' },
      arenaDiagram(arena),
      h('div', null, h('b', { class: 'display' }, ARENAS[arena].name), h('br'), h('span', { class: 'chip' }, ARENAS[arena].tag), h('p', { class: 'muted' }, ARENAS[arena].blurb),
        mode === 'quick' ? h('button', { class: 'btn btn-small btn-cyan', onclick: () => app.navigate('arenas') }, icon('map'), 'Change arena') : null),
    ),
  );

  const controls = h('section', { class: 'panel-dark prematch-controls' }, h('h2', { class: 'section-head' }, icon('info'), 'Controls'), controlsStrip(save.settings));

  const dock = h('div', { class: 'dock-row' },
    h('div', { class: 'dock-info' }, h('b', null, `${save.club.name} v ${opp.name}`), h('small', null, mode === 'career' ? 'Three minutes. Leaving mid-match keeps the fixture unplayed.' : `${prefs.quickMinutes} minutes. Quick matches pay ${Math.round(REWARDS.quickFactor * 100)}% rewards and never change the league.`)),
    h('button', { class: 'btn btn-primary btn-big', 'data-autofocus': true, onclick: start }, icon('play'), 'Start match'),
  );

  const el = shell(app, { nav: 'play', title: 'Pre-match', subtitle: info ? info.label : 'Quick match', back: mode === 'career' ? 'league' : 'home', dim: true, cls: 'prematch', dock },
    h('div', { class: 'prematch-grid' }, h('div', { class: 'prematch-left' }, matchup, arenaCard), h('div', { class: 'prematch-left' }, options, controls)));
  return { el };
}

export function arenasScreen(app: App): ScreenView {
  const save = app.save;
  const unlocked = unlockedArenas(save);
  let selected: ArenaId = unlocked.includes(save.prefs.quickArena) ? save.prefs.quickArena : 'harbor_park';
  const grid = h('div', { class: 'arena-grid' });
  const foot = h('div', { class: 'arena-foot' });
  const render = () => {
    grid.replaceChildren(
      ...ARENA_ORDER.map((id) => {
        const a = ARENAS[id];
        const open = unlocked.includes(id);
        return h('button', { class: `arena-card tilt${id === selected ? ' is-selected' : ''}${open ? '' : ' is-locked'}`, 'aria-pressed': String(id === selected), onclick: () => {
          selected = id;
          render();
        } },
          arenaDiagram(id),
          h('span', { class: 'arena-name display' }, a.name),
          h('span', { class: 'arena-state' }, open ? (id === selected ? icon('check') : null) : icon('lock')),
        );
      }),
    );
    const a = ARENAS[selected];
    const open = unlocked.includes(selected);
    foot.replaceChildren(
      h('div', { class: 'dock-info' }, h('b', null, a.name, ' · ', h('span', { class: 'accent' }, a.tag)), h('p', { class: 'muted' }, `${a.blurb} ${a.length} × ${a.width} units, ${a.anchors.length} anchors.`),
        open ? null : h('p', { class: 'locked-note' }, icon('lock'), `Locked: ${a.unlockHint}`)),
      open
        ? h('button', { class: 'btn btn-primary btn-big', 'data-autofocus': true, onclick: () => {
            save.prefs.quickArena = selected;
            app.persist();
            app.navigate('prematch?mode=quick');
          } }, 'Play here', icon('next'))
        : h('button', { class: 'btn btn-big', disabled: true }, icon('lock'), 'Locked'),
    );
  };
  render();
  const el = shell(app, { nav: 'play', title: 'Arena selection', subtitle: 'Quick match venue', back: 'prematch?mode=quick', dim: true, cls: 'arenas', dock: foot }, grid);
  return { el };
}
