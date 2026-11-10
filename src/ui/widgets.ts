/** Small reusable UI pieces for the menu screens (tabs, bars, headings, empty states). */
import { h, icon } from './dom';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  icon?: string;
  /** Short extra text shown after the label (a count, "New"). */
  badge?: string | null;
  /** Shorter label for compact layouts (falls back to label). */
  short?: string;
}

/**
 * Tab row with roving focus: arrow keys move between tabs and select them (WAI-ARIA tabs pattern).
 * `onPick` is called with the chosen id; the caller re-renders.
 */
export function tabBar<T extends string>(items: TabItem<T>[], current: T, onPick: (id: T) => void, label: string, cls = ''): HTMLElement {
  const bar = h('div', { class: `tabs ${cls}`, role: 'tablist', 'aria-label': label });
  const buttons = items.map((t) =>
    h('button', {
      class: `tab${t.id === current ? ' is-active' : ''}`,
      role: 'tab',
      type: 'button',
      'data-tab': t.id,
      'aria-selected': String(t.id === current),
      tabindex: t.id === current ? '0' : '-1',
      title: t.label,
      onclick: () => {
        if (t.id !== current) onPick(t.id);
      },
    },
      t.icon ? icon(t.icon) : null,
      h('span', { class: 'tab-label' }, h('span', { class: 'tl-full' }, t.label), t.short && t.short !== t.label ? h('span', { class: 'tl-short', 'aria-hidden': 'true' }, t.short) : null),
      t.badge ? h('span', { class: 'tab-badge' }, t.badge) : null,
    ),
  );
  bar.append(...buttons);
  bar.addEventListener('keydown', (e) => {
    const i = buttons.findIndex((b) => b === document.activeElement);
    if (i < 0) return;
    let j = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % buttons.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + buttons.length) % buttons.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = buttons.length - 1;
    if (j < 0) return;
    e.preventDefault();
    const id = items[j].id;
    onPick(id);
    // The caller re-renders the bar; focus the new tab wherever it now lives.
    queueMicrotask(() => {
      const next = (bar.isConnected ? bar : document).querySelector<HTMLElement>(`[role="tablist"][aria-label="${label}"] [data-tab="${id}"]`);
      next?.focus();
    });
  });
  // keep the active tab in view when the row scrolls horizontally
  queueMicrotask(() => {
    const a = bar.querySelector<HTMLElement>('.is-active');
    if (a && bar.scrollWidth > bar.clientWidth) bar.scrollLeft = Math.max(0, a.offsetLeft - bar.clientWidth / 2 + a.offsetWidth / 2);
  });
  return bar;
}

/** A progress bar with an accessible value. `tone` picks the colour: xp (violet), mastery (teal), stat (gold). */
export function meter(frac: number, label: string, tone: 'xp' | 'teal' | 'gold' | 'violet' = 'teal', now?: number, max?: number): HTMLElement {
  const pct = Math.round(Math.max(0, Math.min(1, frac)) * 100);
  return h('div', {
    class: `bar tone-${tone}`,
    role: 'progressbar',
    'aria-label': label,
    'aria-valuemin': '0',
    'aria-valuemax': String(max ?? 100),
    'aria-valuenow': String(now ?? pct),
  }, h('i', { style: `width:${pct}%` }));
}

/** Panel heading: icon, title and an optional quiet note on the right. */
export function cardHead(ic: string, title: string, note?: Node | string | null, id?: string): HTMLElement {
  return h('div', { class: 'card-head' },
    h('span', { class: 'ch-icon' }, icon(ic)),
    h('h2', { class: 'ch-title', id: id ?? null }, title),
    note ? h('span', { class: 'ch-note' }, note) : null,
  );
}

/** Friendly placeholder for empty lists. */
export function emptyState(ic: string, text: string): HTMLElement {
  return h('div', { class: 'empty' }, icon(ic), h('p', null, text));
}

/** Two-digit robot number, as printed on the jerseys. */
export const shirt = (n: number): string => String(n).padStart(2, '0');

/** Best guess at the player's current input, for help text: touch, gamepad or keyboard and mouse. */
export function currentInput(): 'touch' | 'pad' | 'keyboard' {
  try {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
    if (pads.length) return 'pad';
  } catch {
    /* some embeds block the gamepad API */
  }
  if (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) return 'touch';
  return 'keyboard';
}
