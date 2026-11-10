import type { App } from '../app';
import { COSMETIC_BY_ID, colorHex } from '../content/cosmetics';
import { levelProgress } from '../progression/progression';
import { badgeSvg } from './badge';
import { h, icon } from './dom';

export type NavId = 'play' | 'progress' | 'club' | 'garage' | 'academy' | 'settings';

const NAV: { id: NavId; route: string; label: string; icon: string }[] = [
  { id: 'play', route: 'home', label: 'Play', icon: 'play' },
  { id: 'progress', route: 'progress', label: 'Progress', icon: 'bars' },
  { id: 'club', route: 'club', label: 'Club', icon: 'club' },
  { id: 'garage', route: 'garage', label: 'Garage', icon: 'garage' },
  { id: 'academy', route: 'academy', label: 'Academy', icon: 'academy' },
  { id: 'settings', route: 'settings', label: 'Settings', icon: 'settings' },
];

export function wordmark(): HTMLElement {
  return h('div', { class: 'wordmark', role: 'img', 'aria-label': 'Tether League' },
    h('span', { class: 'wm-text', 'aria-hidden': 'true' }, h('span', null, 'Tether'), h('span', null, 'League')),
    h('i', { 'aria-hidden': 'true' }, icon('ball')),
  );
}

export function clubBadge(app: App, cls = ''): HTMLElement {
  const c = app.save.club;
  return h('span', { class: `badge ${cls}`, html: badgeSvg(c.badge, colorHex(c.primary), colorHex(c.secondary)) });
}

export function creditsChip(app: App): HTMLElement {
  return h('div', { class: 'credits', title: 'Credits: earned from matches and trials, spent in the shop', 'aria-label': `${app.save.credits.toLocaleString()} credits` }, icon('coin'), h('b', null, app.save.credits.toLocaleString()));
}

export interface ShellOptions {
  nav: NavId;
  /** Big page heading. Omit for screens that build their own (home). */
  title?: string;
  /** Small label above the title (e.g. "Club" above "Customisation"). */
  eyebrow?: string;
  subtitle?: string;
  /** Icon tile shown before the title. */
  titleIcon?: string;
  /** Route for the back button; omitted on top-level destinations. */
  back?: string;
  /** Label for the back button (defaults to "Back"). */
  backLabel?: string;
  /** Wash the 3D stage behind the content (screens that do not feature the robots). */
  dim?: boolean;
  cls?: string;
  /** Extra node on the right of the page head (tabs, chips). */
  headExtra?: Node | null;
  /** Action bar pinned below the content (never scrolls away): the screen's main actions. */
  dock?: Node | null;
}

/** The equipped club title's display name ('' when none). */
export function clubTitle(app: App): string {
  return COSMETIC_BY_ID[app.save.club.title]?.name ?? '';
}

/** Page heading row: back button, optional icon tile, eyebrow, title, subtitle and an extra slot. */
export function pageHead(app: App, o: Pick<ShellOptions, 'title' | 'eyebrow' | 'subtitle' | 'titleIcon' | 'back' | 'backLabel' | 'headExtra'>): HTMLElement {
  return h('div', { class: 'page-head' },
    o.back ? h('button', { class: 'back-btn is-back', type: 'button', 'aria-label': o.backLabel ?? 'Back', title: o.backLabel ?? 'Back', onclick: () => app.navigate(o.back!) }, icon('back'), h('span', null, o.backLabel ?? 'Back')) : null,
    o.titleIcon ? h('span', { class: 'ph-icon', 'aria-hidden': 'true' }, icon(o.titleIcon)) : null,
    h('div', { class: 'ph-text' },
      o.eyebrow ? h('span', { class: 'ph-eyebrow' }, o.eyebrow) : null,
      h('h1', { class: 'ph-title' }, o.title ?? ''),
      o.subtitle ? h('p', { class: 'ph-sub' }, o.subtitle) : null,
    ),
    o.headExtra ? h('div', { class: 'ph-extra' }, o.headExtra) : null,
  );
}

/**
 * Common frame for menu screens: a navy top bar with the wordmark, the six-item navigation and the
 * club / credits chips; a page head; scrolling content; and an optional pinned action dock. On portrait
 * phones the navigation moves to a bottom tab bar (pure CSS).
 */
export function shell(app: App, o: ShellOptions, ...content: (Node | null)[]): HTMLElement {
  const lp = levelProgress(app.save.xp);
  const title = clubTitle(app);
  const nav = h('nav', { class: 'nav', 'aria-label': 'Main' },
    NAV.map((n) =>
      h('button', {
        class: `nav-btn n-${n.id}${n.id === o.nav ? ' is-active' : ''}`,
        type: 'button',
        title: n.label,
        'aria-current': n.id === o.nav ? 'page' : null,
        onclick: () => app.navigate(n.route),
      }, h('span', { class: 'nav-ic' }, icon(n.icon)), h('span', { class: 'nav-label' }, n.label)),
    ),
  );
  const right = h('div', { class: 'top-right' },
    h('button', { class: 'club-chip', type: 'button', onclick: () => app.navigate('club'), title: 'Club', 'aria-label': `${app.save.club.name}, club level ${lp.level}. Open club.` },
      clubBadge(app),
      h('span', { class: 'cc-level', 'aria-hidden': 'true' }, String(lp.level)),
      h('span', { class: 'cc-text' }, h('b', null, app.save.club.name), h('small', null, `Level ${lp.level}${title ? ` · ${title}` : ''}`)),
    ),
    creditsChip(app),
  );
  const head = o.title ? pageHead(app, o) : null;
  return h('div', { class: `screen sec-${o.nav}${o.dim ? ' dim' : ''}${o.dock ? ' has-dock' : ''}${head ? ' has-head' : ''} ${o.cls ?? ''}` },
    h('div', { class: 'topbar', 'aria-hidden': 'true' }),
    h('div', { class: 'brand' }, wordmark()),
    nav,
    right,
    head,
    h('main', { class: 'content' }, content),
    o.dock ? h('div', { class: 'dock' }, o.dock) : null,
  );
}
