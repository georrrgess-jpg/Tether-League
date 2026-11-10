import type { App, ScreenView } from '../../app';
import { DIVISIONS } from '../../content/clubs';
import { CLUB_COLORS, COSMETIC_BY_ID, colorHex, cosmeticsOfKind, type CosmeticKind, type RobotLook } from '../../content/cosmetics';
import { drawFace, drawJersey, makeCanvas } from '../../game/render/textures';
import { playerLooks } from '../../game/setup';
import { purchase, usePick } from '../../progression/progression';
import { cleanClubName, type ClubProfile } from '../../storage/save';
import { badgeSvg } from '../badge';
import { h, icon } from '../dom';
import { shell } from '../shell';
import { ordinal } from './home';
import { swatches } from './setup';

type Tab = 'colors' | 'pattern' | 'face' | 'trail' | 'celebration' | 'badge' | 'identity' | 'records';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'colors', label: 'Colours', icon: 'palette' },
  { id: 'pattern', label: 'Jersey', icon: 'shirt' },
  { id: 'face', label: 'Face', icon: 'face' },
  { id: 'trail', label: 'Trail', icon: 'trail' },
  { id: 'celebration', label: 'Celebrate', icon: 'party' },
  { id: 'badge', label: 'Badge', icon: 'save' },
  { id: 'identity', label: 'Name', icon: 'edit' },
  { id: 'records', label: 'Records', icon: 'trophy' },
];

function thumb(kind: CosmeticKind, id: string, primary: string, secondary: string): HTMLElement {
  if (kind === 'badge') return h('span', { class: 'thumb', html: badgeSvg(id, primary, secondary) });
  if (kind === 'face') {
    const [c, g] = makeCanvas(120, 60);
    drawFace(g, 120, 60, id, 'neutral', '#7ff3ff');
    c.className = 'thumb face';
    return c;
  }
  if (kind === 'pattern') {
    const [c, g] = makeCanvas(256, 64);
    drawJersey(g, 256, 64, id, primary, secondary, 7);
    const [d, g2] = makeCanvas(64, 64);
    g2.drawImage(c, 96, 0, 64, 64, 0, 0, 64, 64);
    d.className = 'thumb jersey';
    return d;
  }
  if (kind === 'trail') {
    const cols: Record<string, string> = { trail_standard: `linear-gradient(90deg, transparent, ${primary})`, trail_comet: `linear-gradient(90deg, transparent, ${primary} 60%, #fff)`, trail_spark: `repeating-linear-gradient(90deg, ${primary} 0 8px, #fff3a8 8px 12px)`, trail_aurora: `linear-gradient(90deg, transparent, ${secondary}, ${primary})` };
    return h('span', { class: 'thumb trail', style: `background:${cols[id] ?? primary}` });
  }
  return h('span', { class: 'thumb' }, icon('party'));
}

/**
 * Customisation works on a draft: nothing changes on the club until Save look, and Cancel restores
 * the saved appearance. Purchases are separate, explicit transactions.
 */
export function clubScreen(app: App, params: URLSearchParams): ScreenView {
  const save = app.save;
  let draft: ClubProfile = JSON.parse(JSON.stringify(save.club));
  let tab: Tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'colors') as Tab;
  let busy = false;
  const body = h('div', { class: 'club-body' });
  const tabs = h('div', { class: 'club-tabs', role: 'tablist', 'aria-label': 'Customise' });
  const foot = h('div', { class: 'panel-dark club-foot' });

  const dirty = () => JSON.stringify(draft) !== JSON.stringify(save.club);
  const fieldOf = (kind: CosmeticKind): keyof ClubProfile => ((kind === 'pattern' ? 'pattern' : kind) as keyof ClubProfile);
  const unowned = () => (['face', 'pattern', 'trail', 'celebration', 'badge'] as CosmeticKind[]).filter((k) => !save.owned.includes(draft[fieldOf(k)] as string));

  const preview = () => {
    const base = playerLooks(save);
    const look = (i: number): RobotLook => ({ ...base[i], primary: colorHex(draft.primary), secondary: colorHex(draft.secondary), face: draft.face, pattern: draft.pattern, trail: draft.trail, celebration: draft.celebration, number: draft.numbers[i] });
    app.stage.setLooks([look(0), look(1)]);
    app.stage.setMoods(tab === 'celebration' ? 'celebrate' : 'idle', 'idle');
  };

  const items = (kind: CosmeticKind) => {
    const field = fieldOf(kind);
    const p = colorHex(draft.primary);
    const s = colorHex(draft.secondary);
    return h('div', { class: 'item-grid' },
      cosmeticsOfKind(kind).map((c) => {
        const owned = save.owned.includes(c.id);
        const selected = draft[field] === c.id;
        const equipped = save.club[field] === c.id;
        const afford = save.credits >= c.credits;
        return h('button', { class: `item${selected ? ' is-selected' : ''}${owned ? '' : ' is-locked'}`, 'aria-pressed': String(selected), title: c.blurb, onclick: () => {
          (draft[field] as string) = c.id;
          render();
        } },
          thumb(kind, c.id, p, s),
          h('span', { class: 'item-name' }, c.name),
          h('span', { class: 'item-state' }, equipped ? h('span', { class: 'chip chip-cyan' }, icon('check'), 'Equipped') : owned ? h('span', { class: 'chip' }, 'Owned') : h('span', { class: `chip${afford ? ' chip-yellow' : ''}` }, icon(afford ? 'coin' : 'lock'), String(c.credits))),
        );
      }),
    );
  };

  const records = () => {
    const r = save.records;
    const kv = (a: string, b: string | number) => h('div', { class: 'kv' }, h('span', null, a), h('b', null, String(b)));
    return h('div', { class: 'records' },
      h('div', { class: 'rec-col' }, h('h3', { class: 'section-head' }, icon('star'), 'Club records'),
        r.matches === 0 ? h('p', { class: 'muted' }, 'Play your first match to start your record book.') : null,
        kv('Matches played', r.matches), kv('Wins', `${r.wins} (${r.matches ? Math.round((r.wins / r.matches) * 100) : 0}%)`), kv('Best win streak', r.bestStreak), kv('Biggest win', r.bestMargin ? `by ${r.bestMargin}` : '—'),
        kv('Goals', r.goals), kv('Swing goals', r.swingGoals), kv('Assists', r.assists), kv('Saves', r.saves), kv('Most goals in a match', r.bestGoals), kv('Most saves in a match', r.bestSaves)),
      h('div', { class: 'rec-col' }, h('h3', { class: 'section-head' }, icon('trophy'), 'Honours'),
        save.trophies.length ? h('ul', { class: 'history' }, save.trophies.slice().reverse().map((t) => h('li', null, h('b', null, DIVISIONS[t.division].trophy), h('span', null, `Season ${t.seasonNo}`)))) : h('p', { class: 'muted' }, 'No trophies yet. Win a division playoff final to engrave the first one.'),
        h('h3', { class: 'section-head' }, icon('calendar'), 'Seasons'),
        save.seasons.length ? h('ul', { class: 'history' }, save.seasons.slice().reverse().slice(0, 10).map((s) => h('li', null, h('b', null, `S${s.seasonNo} · ${DIVISIONS[s.division].name}`), h('span', null, `${ordinal(s.rank)} · ${s.wins}W ${s.losses}L`)))) : h('p', { class: 'muted' }, 'Your first season is under way.')),
    );
  };

  const identity = () => {
    const name = h('input', { class: 'text-input', type: 'text', maxlength: '18', value: draft.name, 'aria-label': 'Club name', autocomplete: 'off', spellcheck: 'false' }) as HTMLInputElement;
    name.addEventListener('input', () => {
      draft.name = name.value;
      footer();
    });
    const num = (i: 0 | 1) => {
      const el = h('input', { class: 'text-input num', type: 'number', min: '0', max: '99', value: String(draft.numbers[i]), 'aria-label': i === 0 ? 'Your number' : 'Teammate number' }) as HTMLInputElement;
      el.addEventListener('change', () => {
        let v = Math.max(0, Math.min(99, Math.round(Number(el.value) || 0)));
        if (v === draft.numbers[1 - i]) v = (v + 1) % 100;
        draft.numbers[i] = v;
        render();
      });
      return el;
    };
    return h('div', { class: 'identity' },
      h('label', { class: 'field' }, h('span', null, 'Club name (2–18 characters)'), name),
      h('div', { class: 'row-2' }, h('label', { class: 'field' }, h('span', null, 'Your number'), num(0)), h('label', { class: 'field' }, h('span', null, 'Teammate number'), num(1))),
    );
  };

  const footer = () => {
    const missing = unowned();
    const nameOk = draft.name.trim().length >= 2;
    let buy: HTMLElement | null = null;
    if (missing.length) {
      const kind = missing[0];
      const id = draft[fieldOf(kind)] as string;
      const def = COSMETIC_BY_ID[id];
      const afford = save.credits >= def.credits;
      const act = (fn: () => string, done: string) => async () => {
        if (busy) return;
        busy = true;
        const res = fn();
        busy = false;
        if (res === 'ok') {
          app.persist();
          app.toast(done, 'good');
          render();
        } else app.toast(res === 'insufficient' ? `You need ${def.credits - save.credits} more credits.` : res === 'no_pick' ? 'No free picks left.' : 'Already owned.', 'bad');
      };
      buy = h('div', { class: 'buy-bar' },
        h('span', null, icon('lock'), h('b', null, def.name), ' is not owned yet. Previewing only.'),
        save.picks > 0 ? h('button', { class: 'btn btn-primary btn-small', onclick: act(() => usePick(save, id), `${def.name} unlocked with a free pick!`) }, icon('gift'), `Use free pick (${save.picks})`) : null,
        h('button', { class: `btn btn-small ${afford ? 'btn-cyan' : 'is-disabled'}`, 'aria-disabled': String(!afford), onclick: act(() => purchase(save, id), `${def.name} purchased!`) }, icon('coin'), afford ? `Buy · ${def.credits}` : `Need ${def.credits - save.credits} more`),
      );
    }
    foot.replaceChildren(
      buy ?? h('span', { class: 'foot-note' }, save.picks > 0 ? h('span', { class: 'chip chip-yellow' }, icon('gift'), `${save.picks} free pick${save.picks > 1 ? 's' : ''}: choose any locked item`) : h('span', { class: 'muted' }, dirty() ? 'Unsaved changes' : 'Earn credits and free picks by playing matches and trials.')),
      h('div', { class: 'foot-actions' },
        h('button', { class: 'btn btn-ghost on-dark', disabled: !dirty(), onclick: () => {
          draft = JSON.parse(JSON.stringify(save.club));
          render();
        } }, 'Cancel'),
        h('button', { class: 'btn btn-primary', disabled: !dirty() || missing.length > 0 || !nameOk, title: missing.length ? 'Unlock the previewed item first' : !nameOk ? 'Enter a club name' : null, onclick: () => {
          draft.name = cleanClubName(draft.name);
          save.club = JSON.parse(JSON.stringify(draft));
          app.persist();
          app.toast('Look saved.', 'good');
          app.refresh();
        } }, icon('check'), 'Save look'),
      ),
    );
  };

  const render = () => {
    tabs.replaceChildren(...TABS.map((t) => h('button', { class: `tab${t.id === tab ? ' is-active' : ''}`, role: 'tab', 'aria-selected': String(t.id === tab), onclick: () => {
      tab = t.id;
      render();
    } }, icon(t.icon), h('span', null, t.label))));
    const colorName = (id: string) => CLUB_COLORS.find((c) => c.id === id)?.name ?? id;
    let content: HTMLElement;
    if (tab === 'colors') {
      content = h('div', { class: 'color-tab' },
        h('div', { class: 'field' }, h('span', null, `Main colour · ${colorName(draft.primary)}`), swatches(draft.primary, draft.secondary, (id) => {
          draft.primary = id;
          render();
        }, 'Main colour')),
        h('div', { class: 'field' }, h('span', null, `Trim colour · ${colorName(draft.secondary)}`), swatches(draft.secondary, draft.primary, (id) => {
          draft.secondary = id;
          render();
        }, 'Trim colour')),
        h('p', { class: 'muted' }, 'If an opponent wears similar colours they switch to an away kit for that match.'),
      );
    } else if (tab === 'identity') content = identity();
    else if (tab === 'records') content = records();
    else content = items(tab);
    body.replaceChildren(h('section', { class: 'panel club-panel' }, content));
    footer();
    preview();
  };

  const el = shell(app, { nav: 'club', title: save.club.name, subtitle: 'Club customisation', cls: 'club' }, tabs, h('div', { class: 'stage-slot' }), body, foot);
  queueMicrotask(render);
  return { el, stage: { shot: 'duo', moods: ['idle', 'idle'] }, dispose: () => app.syncStage(true) };
}
