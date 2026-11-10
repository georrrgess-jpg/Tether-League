import type { App, ScreenView } from '../../app';
import { DIVISIONS } from '../../content/clubs';
import { CLUB_COLORS, COSMETIC_BY_ID, EARNED_COLORS, catalogOfKind, colorHex, isEarnedOnly, type CosmeticKind, type RobotLook } from '../../content/cosmetics';
import { PLAYS, PLAY_ORDER } from '../../content/plays';
import { drawFace, drawJersey, makeCanvas, trailThumbCss } from '../../game/render/textures';
import { playerLooks } from '../../game/setup';
import { itemSource } from '../../progression/catalog';
import { purchase, usePick } from '../../progression/progression';
import { cleanClubName, type ClubProfile } from '../../storage/save';
import { badgeSvg } from '../badge';
import { h, icon } from '../dom';
import { shell } from '../shell';
import { emptyState, shirt, tabBar } from '../widgets';
import { ordinal } from './home';
import { swatches } from './setup';
import { ballThumb, topperSvg } from './thumbs';

type Tab = 'colors' | 'pattern' | 'face' | 'trail' | 'celebration' | 'badge' | 'topper' | 'ball' | 'identity' | 'records';

const TABS: { id: Tab; label: string; short?: string; icon: string; title: string }[] = [
  { id: 'colors', label: 'Colours', icon: 'palette', title: 'Colours' },
  { id: 'pattern', label: 'Jersey', icon: 'shirt', title: 'Jersey' },
  { id: 'face', label: 'Face', icon: 'face', title: 'Face' },
  { id: 'trail', label: 'Trail', icon: 'trail', title: 'Tether trail' },
  { id: 'celebration', label: 'Celebrate', icon: 'party', title: 'Celebration' },
  { id: 'badge', label: 'Badge', icon: 'shield', title: 'Club badge' },
  { id: 'topper', label: 'Topper', icon: 'topper', title: 'Topper' },
  { id: 'ball', label: 'Ball', icon: 'ball', title: 'Match ball' },
  { id: 'identity', label: 'Name & title', short: 'Name', icon: 'edit', title: 'Name & title' },
  { id: 'records', label: 'Records', icon: 'trophy', title: 'Club records' },
];

/** Cosmetic kinds edited on this screen, each stored in the club profile field of the same name. */
const ITEM_KINDS: CosmeticKind[] = ['face', 'pattern', 'trail', 'celebration', 'badge', 'topper', 'ball', 'title'];

function thumb(kind: CosmeticKind, id: string, primary: string, secondary: string): HTMLElement {
  if (kind === 'badge') return h('span', { class: 'thumb', html: badgeSvg(id, primary, secondary) });
  if (kind === 'topper') return h('span', { class: 'thumb topper', html: topperSvg(id, primary) });
  if (kind === 'ball') return ballThumb(id);
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
  if (kind === 'trail') return h('span', { class: 'thumb trail' }, h('i', { style: `background:${trailThumbCss(id, primary, secondary)}` }));
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
  let colorTarget: 'main' | 'trim' = 'main';
  let earnedFilter: 'owned' | 'locked' = EARNED_COLORS.some((c) => save.owned.includes(c.item)) ? 'owned' : 'locked';
  let busy = false;
  const tabsSlot = h('div', { class: 'club-tabs' });
  const body = h('section', { class: 'panel club-editor', 'aria-live': 'polite' });
  const foot = h('div', { class: 'club-foot' });

  const dirty = () => JSON.stringify(draft) !== JSON.stringify(save.club);
  const fieldOf = (kind: CosmeticKind): keyof ClubProfile => kind as keyof ClubProfile;
  const unowned = () => ITEM_KINDS.filter((k) => {
    const id = draft[fieldOf(k)];
    return typeof id === 'string' && !!COSMETIC_BY_ID[id] && !save.owned.includes(id);
  });

  const preview = () => {
    const base = playerLooks(save);
    const look = (i: number): RobotLook => ({ ...base[i], primary: colorHex(draft.primary), secondary: colorHex(draft.secondary), face: draft.face, pattern: draft.pattern, trail: draft.trail, celebration: draft.celebration, topper: draft.topper, number: draft.numbers[i] });
    app.stage.setLooks([look(0), look(1)]);
    app.stage.setMoods(tab === 'celebration' ? 'celebrate' : 'idle', 'idle');
    // The Ball tab shows the previewed match ball turning on the podium.
    app.stage.setBall(tab === 'ball' ? draft.ball : null);
  };

  const items = (kind: CosmeticKind) => {
    const field = fieldOf(kind);
    const p = colorHex(draft.primary);
    const s = colorHex(draft.secondary);
    const all = catalogOfKind(kind);
    if (!all.length) return emptyState('gift', 'Nothing to choose here yet.');
    return h('div', { class: 'item-grid', role: 'listbox', 'aria-label': TABS.find((t) => t.id === tab)?.title ?? '' },
      all.map((c) => {
        const owned = save.owned.includes(c.id);
        const selected = draft[field] === c.id;
        const equipped = save.club[field] === c.id;
        const afford = save.credits >= c.credits;
        const earned = isEarnedOnly(c.id);
        return h('button', {
          class: `item${selected ? ' is-selected' : ''}${owned ? ' is-owned' : ' is-locked'}${earned ? ' is-earned' : ''}${equipped ? ' is-equipped' : ''}`,
          type: 'button',
          role: 'option',
          'aria-selected': String(selected),
          title: owned ? c.blurb : `${c.blurb} ${itemSource(c.id)}.`,
          onclick: () => {
            (draft[field] as string) = c.id;
            render();
          },
        },
          h('span', { class: 'item-art' }, thumb(kind, c.id, p, s), owned ? null : h('span', { class: 'item-lock', 'aria-hidden': 'true' }, icon('lock'))),
          h('span', { class: 'item-name' }, c.name),
          h('span', { class: 'item-state' },
            equipped ? h('span', { class: 'chip chip-cyan' }, icon('check'), 'Equipped')
              : owned ? h('span', { class: 'chip' }, 'Owned')
              : earned ? h('span', { class: 'chip chip-earn' }, icon('star'), 'Earn')
              : h('span', { class: `chip${afford ? ' chip-yellow' : ''}` }, icon('coin'), String(c.credits))),
          selected ? h('span', { class: 'item-check', 'aria-hidden': 'true' }, icon('check')) : null,
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
      h('div', { class: 'rec-col' },
        h('h3', { class: 'section-head' }, icon('assist'), 'Plays'),
        PLAY_ORDER.map((id) => kv(PLAYS[id].name, r[PLAYS[id].record] ?? 0)),
        h('h3', { class: 'section-head' }, icon('trophy'), 'Honours'),
        save.trophies.length ? h('ul', { class: 'history' }, save.trophies.slice().reverse().map((t) => h('li', null, h('b', null, DIVISIONS[t.division].trophy), h('span', { class: 'chip chip-yellow' }, `Season ${t.seasonNo}`)))) : h('p', { class: 'muted' }, 'No trophies yet. Win a division playoff final to engrave the first one.'),
        h('h3', { class: 'section-head' }, icon('calendar'), 'Seasons'),
        save.seasons.length ? h('ul', { class: 'history' }, save.seasons.slice().reverse().slice(0, 10).map((s) => h('li', null, h('b', null, `S${s.seasonNo} · ${DIVISIONS[s.division].name}`), h('span', { class: 'chip' }, `${ordinal(s.rank)} · ${s.wins}W ${s.losses}L`)))) : h('p', { class: 'muted' }, 'Your first season is under way.')),
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
    const titles = catalogOfKind('title');
    const ownedTitles = titles.filter((t) => save.owned.includes(t.id));
    const titlePick = h('div', { class: 'title-picks', role: 'radiogroup', 'aria-label': 'Club title' },
      ownedTitles.map((t) => h('button', { class: `title-pick${draft.title === t.id ? ' is-selected' : ''}`, type: 'button', role: 'radio', 'aria-checked': String(draft.title === t.id), title: t.blurb, onclick: () => {
        draft.title = t.id;
        render();
      } }, draft.title === t.id ? icon('check') : icon('star'), t.name)),
    );
    return h('div', { class: 'identity' },
      h('label', { class: 'field' }, h('span', null, 'Club name (2–18 characters)'), name),
      h('div', { class: 'row-2' }, h('label', { class: 'field' }, h('span', null, 'Your number'), num(0)), h('label', { class: 'field' }, h('span', null, 'Teammate number'), num(1))),
      h('div', { class: 'field' }, h('span', null, `Club title · shown under your club name (${ownedTitles.length} of ${titles.length} earned)`), titlePick),
      ownedTitles.length < titles.length ? h('p', { class: 'muted' }, 'More titles come from the Club Road, achievements and chassis mastery (see Progress).') : null,
    );
  };

  const colorName = (id: string) => CLUB_COLORS.find((c) => c.id === id)?.name ?? EARNED_COLORS.find((c) => c.id === id)?.name ?? id;
  const colors = () => {
    const ownedEarned = EARNED_COLORS.filter((c) => save.owned.includes(c.item));
    const list = EARNED_COLORS.filter((c) => (earnedFilter === 'owned') === save.owned.includes(c.item));
    const earned = h('div', { class: 'earned' },
      h('div', { class: 'seg earned-filter', role: 'group', 'aria-label': 'Earned colours filter' },
        h('button', { type: 'button', 'aria-pressed': String(earnedFilter === 'owned'), onclick: () => {
          earnedFilter = 'owned';
          render();
        } }, icon('check'), ` Owned (${ownedEarned.length})`),
        h('button', { type: 'button', 'aria-pressed': String(earnedFilter === 'locked'), onclick: () => {
          earnedFilter = 'locked';
          render();
        } }, icon('lock'), ` Locked (${EARNED_COLORS.length - ownedEarned.length})`),
      ),
      list.length ? h('ul', { class: 'earned-list' },
        list.map((c) => {
          const owned = save.owned.includes(c.item);
          const inUse = draft.primary === c.id ? 'main' : draft.secondary === c.id ? 'trim' : '';
          const other = colorTarget === 'main' ? draft.secondary : draft.primary;
          const content = [
            h('span', { class: 'swatch-dot', style: `--sw:${c.hex}`, 'aria-hidden': 'true' }, owned ? null : icon('lock')),
            h('span', { class: 'ec-text' }, h('b', null, c.name), h('small', null, owned ? (inUse ? `In use as ${inUse}` : `Owned · tap to use as ${colorTarget}`) : itemSource(c.item))),
            inUse ? h('span', { class: 'ec-check', 'aria-hidden': 'true' }, icon('check')) : null,
          ];
          return h('li', null, owned
            ? h('button', { class: `earned-color${inUse ? ' is-selected' : ''}`, type: 'button', disabled: other === c.id || null, title: other === c.id ? `${c.name} is your ${colorTarget === 'main' ? 'trim' : 'main'} colour` : `Use ${c.name} as ${colorTarget} colour`, onclick: () => {
                if (colorTarget === 'main') draft.primary = c.id;
                else draft.secondary = c.id;
                render();
              } }, content)
            : h('div', { class: 'earned-color is-locked' }, content));
        }),
      ) : h('p', { class: 'muted earned-empty' }, earnedFilter === 'owned' ? 'No earned colours yet. They come from the Club Road.' : 'Every earned colour is unlocked.'),
    );
    return h('div', { class: 'color-tab' },
      h('div', { class: 'color-grids' },
        h('div', { class: 'field' }, h('span', null, 'Main colour · ', h('b', null, colorName(draft.primary))), swatches(draft.primary, draft.secondary, (id) => {
          draft.primary = id;
          render();
        }, 'Main colour')),
        h('div', { class: 'field' }, h('span', null, 'Trim colour · ', h('b', null, colorName(draft.secondary))), swatches(draft.secondary, draft.primary, (id) => {
          draft.secondary = id;
          render();
        }, 'Trim colour')),
        h('p', { class: 'muted' }, 'If an opponent wears similar colours they switch to an away kit for that match.'),
      ),
      h('div', { class: 'color-earned' },
        h('div', { class: 'field' }, h('span', null, 'Earned · use as'),
          h('div', { class: 'seg', role: 'group', 'aria-label': 'Apply earned colour to' },
            h('button', { type: 'button', 'aria-pressed': String(colorTarget === 'main'), onclick: () => {
              colorTarget = 'main';
              render();
            } }, 'Main'),
            h('button', { type: 'button', 'aria-pressed': String(colorTarget === 'trim'), onclick: () => {
              colorTarget = 'trim';
              render();
            } }, 'Trim'),
          ),
        ),
        earned,
      ),
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
      const earnedOnly = isEarnedOnly(id);
      const act = (fn: () => string, done: string) => async () => {
        if (busy) return;
        busy = true;
        const res = fn();
        busy = false;
        if (res === 'ok') {
          app.persist();
          app.toast(done, 'good');
          app.refreshChrome();
          render();
        } else app.toast(res === 'insufficient' ? `You need ${def.credits - save.credits} more credits.` : res === 'no_pick' ? 'No free picks left.' : res === 'earned' ? 'This item is earned through play, not bought.' : 'Already owned.', 'bad');
      };
      buy = earnedOnly
        ? h('div', { class: 'buy-bar is-earned' },
            h('span', { class: 'bb-text' }, icon('lock'), h('span', null, h('b', null, def.name), ` is earned, not bought. ${itemSource(id)}. Previewing only.`)),
            h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => app.navigate('progress') }, icon('target'), 'See progress'),
          )
        : h('div', { class: 'buy-bar' },
            h('span', { class: 'bb-text' }, icon('lock'), h('span', null, h('b', null, def.name), ' is not owned yet. Previewing only.')),
            save.picks > 0 ? h('button', { class: 'btn btn-small btn-primary', type: 'button', onclick: act(() => usePick(save, id), `${def.name} unlocked with a free pick!`) }, icon('gift'), `Use free pick (${save.picks})`) : null,
            h('button', { class: `btn btn-small btn-cyan${afford ? '' : ' is-disabled'}`, type: 'button', 'aria-disabled': String(!afford), onclick: act(() => purchase(save, id), `${def.name} purchased!`) }, icon('coin'), afford ? `Buy · ${def.credits}` : `Need ${def.credits - save.credits} more`),
          );
    }
    foot.replaceChildren(
      buy ?? h('span', { hidden: true }),
      h('div', { class: 'save-bar' },
        h('span', { class: 'sb-note' },
          save.picks > 0
            ? h('span', { class: 'chip chip-yellow' }, icon('gift'), `${save.picks} free pick${save.picks > 1 ? 's' : ''}`)
            : null,
          h('span', null, dirty() ? 'Unsaved changes' : save.picks > 0 ? 'Choose any shop item' : 'Earn credits and free picks by playing'),
        ),
        h('button', { class: 'btn btn-ghost', type: 'button', disabled: !dirty(), onclick: () => {
          draft = JSON.parse(JSON.stringify(save.club));
          render();
        } }, 'Cancel'),
        h('button', { class: 'btn btn-primary btn-save', type: 'button', disabled: !dirty() || missing.length > 0 || !nameOk, title: missing.length ? 'Unlock the previewed item first' : !nameOk ? 'Enter a club name' : null, onclick: () => {
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
    tabsSlot.replaceChildren(tabBar<Tab>(TABS.map((t) => {
      const kind = ITEM_KINDS.includes(t.id as CosmeticKind) ? (t.id as CosmeticKind) : null;
      const changed = kind ? draft[fieldOf(kind)] !== save.club[fieldOf(kind)] : t.id === 'colors' ? draft.primary !== save.club.primary || draft.secondary !== save.club.secondary : false;
      return { id: t.id, label: t.label, short: t.short, icon: t.icon, badge: changed ? '•' : null };
    }), tab, (t) => {
      tab = t;
      render();
    }, 'Customise'));
    const meta = TABS.find((t) => t.id === tab)!;
    let content: HTMLElement;
    let note: string | null = null;
    if (tab === 'colors') content = colors();
    else if (tab === 'identity') content = identity();
    else if (tab === 'records') content = records();
    else {
      content = items(tab);
      const all = catalogOfKind(tab);
      note = `${all.filter((c) => save.owned.includes(c.id)).length} of ${all.length} owned`;
    }
    body.className = `panel club-editor tab-${tab}`;
    body.replaceChildren(
      h('div', { class: 'ed-head' }, h('h2', { class: 'ed-title' }, meta.title), note ? h('span', { class: 'ch-note' }, note) : null),
      h('div', { class: 'ed-body' }, content),
    );
    footer();
    preview();
  };

  const el = shell(app, { nav: 'club', eyebrow: 'Club', title: 'Customisation', subtitle: save.club.name, cls: 'club', dock: foot },
    tabsSlot, h('div', { class: 'club-grid' }, h('div', { class: 'stage-slot' }), body));
  render();
  // show() applies the saved look and moods after building the screen; re-apply the preview after it.
  queueMicrotask(preview);
  return { el, stage: { shot: 'duo', moods: ['idle', 'idle'] }, dispose: () => {
    app.stage.setBall(null);
    app.syncStage(true);
  } };
}
