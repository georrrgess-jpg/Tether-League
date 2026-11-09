import type { App, ScreenView } from '../../app';
import { CLUB_COLORS, cosmeticsOfKind } from '../../content/cosmetics';
import { cleanClubName } from '../../storage/save';
import { badgeSvg } from '../badge';
import { h, icon } from '../dom';
import { wordmark } from '../shell';

export function swatches(selected: string, disabled: string, onPick: (id: string) => void, label: string): HTMLElement {
  return h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': label },
    CLUB_COLORS.map((c) =>
      h('button', {
        class: `swatch${c.id === selected ? ' is-selected' : ''}`,
        style: `--sw:${c.hex}`,
        role: 'radio',
        'aria-checked': String(c.id === selected),
        'aria-label': c.name,
        title: c.id === disabled ? `${c.name} (used as your other colour)` : c.name,
        disabled: c.id === disabled,
        onclick: () => onPick(c.id),
      }, c.id === selected ? icon('check') : null),
    ),
  );
}

export function setupScreen(app: App): ScreenView {
  const club = app.save.club;
  const root = h('div', { class: 'screen setup' });
  const colorName = (id: string) => CLUB_COLORS.find((c) => c.id === id)?.name ?? id;

  const form = () => {
    const name = h('input', { class: 'text-input', type: 'text', maxlength: '18', value: club.name, 'aria-label': 'Club name', autocomplete: 'off', spellcheck: 'false' }) as HTMLInputElement;
    const err = h('p', { class: 'field-error', role: 'alert' });
    const valid = () => {
      const v = name.value.trim();
      if (v.length < 2) {
        err.textContent = 'Use at least 2 characters.';
        return false;
      }
      err.textContent = '';
      return true;
    };
    name.addEventListener('input', valid);
    const rerender = () => {
      club.name = name.value;
      app.syncStage();
      panel.replaceWith((panel = form()));
    };
    const create = () => {
      if (!valid()) {
        name.focus();
        return;
      }
      club.name = cleanClubName(name.value);
      app.hasClub = true;
      app.persist();
      root.replaceChildren(top, welcome(), slot);
    };
    let panel = h('div', { class: 'panel setup-panel' },
      h('div', { class: 'panel-title' }, 'Create your club', h('small', null, 'Everything can be changed later')),
      h('label', { class: 'field' }, h('span', null, 'Club name'), name, err),
      h('div', { class: 'field' }, h('span', null, `Main colour · ${colorName(club.primary)}`), swatches(club.primary, club.secondary, (id) => {
        club.primary = id;
        rerender();
      }, 'Main colour')),
      h('div', { class: 'field' }, h('span', null, `Trim colour · ${colorName(club.secondary)}`), swatches(club.secondary, club.primary, (id) => {
        club.secondary = id;
        rerender();
      }, 'Trim colour')),
      h('div', { class: 'field' }, h('span', null, 'Badge'),
        h('div', { class: 'badge-row', role: 'radiogroup', 'aria-label': 'Badge' },
          cosmeticsOfKind('badge').filter((b) => b.credits === 0).map((b) =>
            h('button', {
              class: `badge-pick${club.badge === b.id ? ' is-selected' : ''}`, role: 'radio', 'aria-checked': String(club.badge === b.id), 'aria-label': b.name, title: b.name,
              html: badgeSvg(b.id, CLUB_COLORS.find((c) => c.id === club.primary)!.hex, CLUB_COLORS.find((c) => c.id === club.secondary)!.hex),
              onclick: () => {
                club.badge = b.id;
                rerender();
              },
            }),
          ),
        ),
      ),
      h('button', { class: 'btn btn-primary btn-big', onclick: create, 'data-autofocus': true }, icon('play'), 'Create club'),
    );
    return panel;
  };

  const welcome = () =>
    h('div', { class: 'panel setup-panel' },
      h('div', { class: 'panel-title' }, `Welcome, ${club.name}!`),
      h('p', null, 'Tether League is 2v2 robot football with a twist: hold a tether to swing from an anchor, then let go to launch with your momentum.'),
      h('p', { class: 'muted' }, 'A short practice (about two minutes) teaches moving, swinging and kicking. You can skip it and find it later in the Academy.'),
      h('div', { class: 'stack' },
        h('button', { class: 'btn btn-primary btn-big', 'data-autofocus': true, onclick: () => app.startLesson('move', 'onboarding') }, icon('academy'), 'Start practice'),
        h('button', { class: 'btn btn-ghost', onclick: () => {
          app.save.flags.onboarded = true;
          app.persist();
          app.navigate('home', true);
        } }, 'Skip to my club'),
      ),
    );

  const top = h('header', { class: 'topbar' }, wordmark());
  const slot = h('div', { class: 'stage-slot' });
  root.append(top, form(), slot);
  return { el: root, stage: { shot: 'duo', moods: ['ready', 'idle'] } };
}
