import { keyLabel, type Settings } from '../storage/settings';
import { h, icon } from './dom';

/**
 * Compact key-cap strip describing the core controls for the player's current device and bindings,
 * followed by the two pass plays (long ball and give-and-go). Full play descriptions live in the
 * Academy playbook.
 */
export function controlsStrip(settings: Settings, touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches): HTMLElement {
  const k = settings.keys;
  const cap = (t: string) => h('kbd', { class: 'cap' }, t);
  const item = (keys: HTMLElement[], label: string) => h('div', { class: 'ctl' }, h('span', { class: 'caps' }, keys), h('small', null, label));
  const pass = touch ? 'PASS' : [keyLabel(k.pass[0]), keyLabel(k.pass[1])].filter((x) => x && x !== '—').join(' / ') || 'PASS';
  const items = touch
    ? [
        item([cap('Left thumb')], 'Move'),
        item([cap('SWING')], 'Tap: launch · Hold: steer'),
        item([cap('KICK')], 'Tap or drag to aim'),
        item([cap('PASS')], 'To teammate · call for it'),
      ]
    : [
        item([cap(keyLabel(k.up[0])), cap(keyLabel(k.left[0])), cap(keyLabel(k.down[0])), cap(keyLabel(k.right[0]))], 'Move'),
        item([cap('Right click'), cap(keyLabel(k.tether[0]))], 'Swing (tap) · hold to steer'),
        item([cap('Left click'), cap(keyLabel(k.kick[0]))], 'Kick: one press'),
        item([cap(keyLabel(k.pass[0])), cap(keyLabel(k.pass[1]))], 'Pass · call for it'),
      ];
  return h('div', { class: 'controls-wrap' },
    h('div', { class: 'controls-strip', 'aria-label': 'Controls' }, items),
    h('ul', { class: 'plays-strip', 'aria-label': 'Pass plays' },
      h('li', null, icon('pass'), h('span', null, h('b', null, `Hold ${pass}`), ': long ball')),
      h('li', null, icon('assist'), h('span', null, h('b', null, `${pass} again after passing`), ': give-and-go')),
    ),
  );
}
