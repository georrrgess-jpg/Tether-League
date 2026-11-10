import type { App } from '../app';
import { COSMETIC_BY_ID, colorHex } from '../content/cosmetics';
import { levelProgress } from '../progression/progression';
import { badgeSvg } from './badge';
import { h, icon } from './dom';

export type NavId = 'play' | 'progress' | 'club' | 'garage' | 'academy' | 'settings';

const NAV: { id: NavId; route: string; label: string; icon: string }[] = [
  { id: 'play', route: 'home', label: 'Play', icon: 'play' },
  { id: 'progress', route: 'progress', label: 'Progress', icon: 'target' },
  { id: 'club', route: 'club', label: 'Club', icon: 'club' },
  { id: 'garage', route: 'garage', label: 'Garage', icon: 'garage' },
  { id: 'academy', route: 'academy', label: 'Academy', icon: 'academy' },
  { id: 'settings', route: 'settings', label: 'Settings', icon: 'settings' },
];

export function wordmark(): HTMLElement {
  return h('div', { class: 'wordmark', 'aria-label': 'Tether League' }, h('span', null, 'Tether'), h('span', null, 'League'), h('i', { 'aria-hidden': 'true' }, icon('ball')));
}

export function clubBadge(app: App, cls = ''): HTMLElement {
  const c = app.save.club;
  return h('span', { class: `badge ${cls}`, html: badgeSvg(c.badge, colorHex(c.primary), colorHex(c.secondary)) });
}

export function creditsChip(app: App): HTMLElement {
  return h('div', { class: 'credits', title: 'Credits earned from matches and trials' }, icon('coin'), h('b', null, app.save.credits.toLocaleString()));
}

export interface ShellOptions {
  nav: NavId;
  title?: string;
  subtitle?: string;
  /** Route for the back button; omitted on top-level destinations. */
  back?: string;
  /** Label for the back button (defaults to "Back"). */
  backLabel?: string;
  /** Dim the 3D stage behind the content (screens that do not feature the robots). */
  dim?: boolean;
  cls?: string;
  /** Action bar pinned below the content (never scrolls away): the screen's main actions. */
  dock?: Node | null;
}

/** The equipped club title's display name ('' when none). */
export function clubTitle(app: App): string {
  return COSMETIC_BY_ID[app.save.club.title]?.name ?? '';
}

/** Common frame for menu screens: wordmark, club chip, credits, stable six-item navigation. */
export function shell(app: App, o: ShellOptions, ...content: (Node | null)[]): HTMLElement {
  const lp = levelProgress(app.save.xp);
  const nav = h('nav', { class: 'nav', 'aria-label': 'Main' },
    NAV.map((n) =>
      h('button', { class: `nav-btn n-${n.id}${n.id === o.nav ? ' is-active' : ''}`, title: n.label, 'aria-current': n.id === o.nav ? 'page' : null, onclick: () => app.navigate(n.route) },
        h('span', { class: 'nav-ic' }, icon(n.icon)), h('span', { class: 'nav-label' }, n.label)),
    ),
  );
  const top = h('header', { class: 'topbar' },
    wordmark(),
    o.title
      ? h('div', { class: 'screen-title' },
          o.back ? h('button', { class: 'back-btn is-back', 'aria-label': o.backLabel ?? 'Back', title: o.backLabel ?? 'Back', onclick: () => app.navigate(o.back!) }, icon('back'), h('span', null, 'Back')) : null,
          h('div', { class: 'st-text' }, h('h1', { class: 'display' }, o.title), o.subtitle ? h('p', null, o.subtitle) : null),
        )
      : h('div', { class: 'screen-title' }),
    h('div', { class: 'top-right' },
      h('button', { class: 'club-chip', onclick: () => app.navigate('club'), title: 'Club', 'aria-label': `${app.save.club.name}, club level ${lp.level}. Open club.` },
        clubBadge(app),
        h('span', { class: 'cc-text' }, h('b', null, app.save.club.name), h('small', null, `Level ${lp.level}${clubTitle(app) ? ` · ${clubTitle(app)}` : ''}`)),
        h('span', { class: 'cc-level', 'aria-hidden': 'true' }, String(lp.level)),
      ),
      creditsChip(app),
    ),
  );
  return h('div', { class: `screen sec-${o.nav}${o.dim ? ' dim' : ''}${o.dock ? ' has-dock' : ''} ${o.cls ?? ''}` },
    top, nav, h('main', { class: 'content' }, content),
    o.dock ? h('div', { class: 'dock' }, o.dock) : null,
  );
}
