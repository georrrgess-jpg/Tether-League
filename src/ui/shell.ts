import type { App } from '../app';
import { colorHex } from '../content/cosmetics';
import { levelProgress } from '../progression/progression';
import { badgeSvg } from './badge';
import { h, icon } from './dom';

export type NavId = 'play' | 'club' | 'garage' | 'academy' | 'settings';

const NAV: { id: NavId; route: string; label: string; icon: string }[] = [
  { id: 'play', route: 'home', label: 'Play', icon: 'play' },
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
  /** Dim the 3D stage behind the content (screens that do not feature the robots). */
  dim?: boolean;
  cls?: string;
}

/** Common frame for menu screens: wordmark, club chip, credits, stable five-item navigation. */
export function shell(app: App, o: ShellOptions, ...content: (Node | null)[]): HTMLElement {
  const lp = levelProgress(app.save.xp);
  const nav = h('nav', { class: 'nav', 'aria-label': 'Main' },
    NAV.map((n) =>
      h('button', { class: `nav-btn${n.id === o.nav ? ' is-active' : ''}`, 'aria-current': n.id === o.nav ? 'page' : null, onclick: () => app.navigate(n.route) }, icon(n.icon), h('span', null, n.label)),
    ),
  );
  const top = h('header', { class: 'topbar' },
    wordmark(),
    o.title
      ? h('div', { class: 'screen-title' },
          o.back ? h('button', { class: 'back-btn is-back', 'aria-label': 'Back', onclick: () => app.navigate(o.back!) }, icon('back')) : null,
          h('div', null, h('h1', { class: 'display' }, o.title), o.subtitle ? h('p', null, o.subtitle) : null),
        )
      : h('div', { class: 'screen-title' }),
    h('div', { class: 'top-right' },
      h('button', { class: 'club-chip', onclick: () => app.navigate('club'), title: 'Club' },
        clubBadge(app),
        h('span', { class: 'cc-text' }, h('b', null, app.save.club.name), h('small', null, `Club level ${lp.level}`)),
      ),
      creditsChip(app),
    ),
  );
  return h('div', { class: `screen ${o.dim ? 'dim' : ''} ${o.cls ?? ''}` }, top, nav, h('main', { class: 'content' }, content));
}
