import type { App, ScreenView } from '../../app';
import { CHASSIS, CHASSIS_ORDER, chassisBars, type ChassisId } from '../../content/chassis';
import { playerLooks } from '../../game/setup';
import { levelFor, purchase } from '../../progression/progression';
import { h, icon } from '../dom';
import { shell } from '../shell';
import { shirt } from '../widgets';

export const CHASSIS_ICON: Record<ChassisId, string> = { all_rounder: 'lightning', scout: 'target', bulwark: 'shield', glider: 'lines' };

export function garageScreen(app: App, params: URLSearchParams): ScreenView {
  const save = app.save;
  let selected: ChassisId = (params.get('c') as ChassisId) in CHASSIS ? (params.get('c') as ChassisId) : save.club.chassis;
  let who: 'me' | 'mate' = params.get('who') === 'mate' ? 'mate' : 'me';
  const picker = h('div', { class: 'chassis-picker', role: 'radiogroup', 'aria-label': 'Chassis' });
  const detail = h('section', { class: 'panel chassis-detail', 'aria-live': 'polite' });
  const dock = h('div', { class: 'garage-dock' });
  const slot = h('div', { class: 'stage-slot' });
  let busy = false;

  const owned = (id: ChassisId) => save.owned.includes(`chassis:${id}`);
  const preview = () => {
    const looks = playerLooks(save);
    app.stage.setLooks([{ ...looks[who === 'me' ? 0 : 1], chassis: selected }, looks[1]]);
  };

  const render = () => {
    const level = levelFor(save.xp);
    const current = who === 'me' ? save.club.chassis : save.club.mateChassis;
    picker.replaceChildren(
      ...CHASSIS_ORDER.map((id) => {
        const c = CHASSIS[id];
        const isOwned = owned(id);
        const mine = save.club.chassis === id;
        const mate = save.club.mateChassis === id;
        const state = isOwned ? (mine && mate ? 'You + mate' : mine ? 'You' : mate ? 'Teammate' : 'Owned') : `${c.credits} cr · Lv ${c.unlockLevel}`;
        return h('button', {
          class: `chassis-btn${id === selected ? ' is-selected' : ''}${isOwned ? '' : ' is-locked'}${id === current ? ' is-equipped' : ''}`,
          type: 'button',
          role: 'radio',
          'aria-checked': String(id === selected),
          'aria-label': `${c.name}: ${isOwned ? state : `locked, ${c.credits} credits or club level ${c.unlockLevel}`}`,
          onclick: () => {
            selected = id;
            render();
          },
        },
          h('span', { class: 'cb-icon' }, icon(isOwned ? CHASSIS_ICON[id] : 'lock')),
          h('span', { class: 'cb-text' }, h('b', null, c.name), h('small', null, state)),
        );
      }),
    );

    const c = CHASSIS[selected];
    const isOwned = owned(selected);
    // Each bar shows a marker for the chassis currently equipped on the robot being edited.
    const eq = chassisBars(CHASSIS[current]);
    const same = current === selected;
    detail.replaceChildren(
      h('div', { class: 'cd-main' },
        h('h2', { class: 'cd-name' }, c.name),
        h('p', { class: 'cd-tag' }, c.tagline),
        h('div', { class: 'stat-bars' },
          chassisBars(c).map((b, i) => {
            const d = b.value - eq[i].value;
            return h('div', { class: 'stat-row' },
              h('span', { class: 'sr-label' }, b.label),
              h('div', { class: 'bar tone-gold', role: 'img', 'aria-label': `${b.label}: ${Math.round(b.value * 10)} of 10${same ? '' : `, equipped ${Math.round(eq[i].value * 10)}`}` },
                h('i', { style: `width:${Math.round(b.value * 100)}%` }),
                same ? null : h('em', { class: 'eq-mark', style: `left:${Math.round(eq[i].value * 100)}%`, title: 'Equipped' }),
              ),
              same || Math.abs(d) < 0.03 ? h('b', { class: 'delta' }) : h('b', { class: `delta ${d > 0 ? 'up' : 'down'}`, 'aria-hidden': 'true' }, d > 0 ? '▲' : '▼'),
            );
          }),
        ),
        h('p', { class: 'muted cd-note' }, same ? 'All chassis share the same size, kick reach and tether range: these are sidegrades, not upgrades.' : `Navy marks show your equipped ${CHASSIS[current].name}. All chassis share size, kick reach and tether range.`),
      ),
      h('div', { class: 'cd-side' },
        h('div', { class: 'trait good' }, icon('check'), h('div', null, h('b', null, 'Strengths'), h('p', null, c.strength))),
        h('div', { class: 'trait bad' }, icon('info'), h('div', null, h('b', null, 'Tradeoff'), h('p', null, c.weakness))),
        isOwned ? null : h('div', { class: 'trait locked' }, icon('lock'), h('div', null, h('b', null, 'Locked'), h('p', null, `Free at club level ${c.unlockLevel} (you are level ${level}), or buy it now for ${c.credits} credits.`))),
      ),
    );

    const equip = isOwned
      ? h('button', { class: `btn btn-primary btn-big${same ? ' is-equipped' : ''}`, type: 'button', disabled: same, 'data-autofocus': !same || null, onclick: () => {
          if (who === 'me') save.club.chassis = selected;
          else save.club.mateChassis = selected;
          app.persist();
          app.toast(`${c.name} equipped for ${who === 'me' ? 'your robot' : 'your teammate'}. It applies from the next match.`, 'good');
          render();
        } }, icon('check'), same ? 'Equipped' : 'Equip')
      : h('button', { class: `btn btn-primary btn-big${save.credits < c.credits ? ' is-disabled' : ''}`, type: 'button', 'aria-disabled': String(save.credits < c.credits), 'data-autofocus': true, onclick: async () => {
          if (busy) return;
          if (save.credits < c.credits) {
            app.toast(`You need ${c.credits - save.credits} more credits for the ${c.name}.`, 'bad');
            return;
          }
          busy = true;
          const ok = await app.confirm({ title: `Buy ${c.name}?`, body: `Spend ${c.credits} of your ${save.credits} credits. You can test drive it first for free.`, confirm: `Buy for ${c.credits}` });
          busy = false;
          if (!ok) return;
          const res = purchase(save, `chassis:${selected}`);
          if (res === 'ok') {
            app.persist();
            app.toast(`${c.name} unlocked!`, 'good');
            app.navigate(`garage?c=${selected}${who === 'mate' ? '&who=mate' : ''}`, true);
          } else app.toast(res === 'insufficient' ? 'Not enough credits.' : 'Already owned.', 'bad');
        } }, icon('coin'), `Buy · ${c.credits}`);
    const robot = (w: 'me' | 'mate') => {
      const n = shirt(save.club.numbers[w === 'me' ? 0 : 1]);
      const ch = CHASSIS[w === 'me' ? save.club.chassis : save.club.mateChassis].name;
      return h('button', { class: `robot-pick${who === w ? ' is-selected' : ''}`, type: 'button', role: 'radio', 'aria-checked': String(who === w), onclick: () => {
        who = w;
        selected = w === 'me' ? save.club.chassis : save.club.mateChassis;
        render();
      } },
        icon(w === 'me' ? 'face' : 'club'),
        h('span', { class: 'rp-text' }, h('b', null, w === 'me' ? 'You' : 'Teammate'), h('small', null, `Robot #${n} · ${ch}`)),
        who === w ? h('span', { class: 'rp-check', 'aria-hidden': 'true' }, icon('check')) : null,
      );
    };
    dock.replaceChildren(
      h('div', { class: 'robot-picks', role: 'radiogroup', 'aria-label': 'Robot to equip' }, robot('me'), robot('mate')),
      h('div', { class: 'garage-actions' },
        equip,
        h('button', { class: 'btn btn-dark btn-big', type: 'button', 'data-autofocus': (isOwned && same) || null, onclick: () => app.startTestDrive(selected) }, icon('target'), 'Test drive'),
      ),
    );
    preview();
  };

  // drag to rotate the preview
  let dragX: number | null = null;
  slot.addEventListener('pointerdown', (e) => {
    dragX = e.clientX;
    slot.setPointerCapture(e.pointerId);
    slot.classList.add('is-dragging');
  });
  slot.addEventListener('pointermove', (e) => {
    if (dragX === null) return;
    app.stage.rotate((e.clientX - dragX) * 0.012);
    dragX = e.clientX;
  });
  const end = () => {
    dragX = null;
    slot.classList.remove('is-dragging');
  };
  slot.addEventListener('pointerup', end);
  slot.addEventListener('pointercancel', end);

  render();
  const el = shell(app, { nav: 'garage', title: 'Garage', subtitle: 'Robot selection', cls: 'garage', dock },
    h('div', { class: 'garage-grid' },
      h('div', { class: 'garage-stage' }, slot, h('span', { class: 'drag-hint', 'aria-hidden': 'true' }, icon('rotate'), 'Drag to rotate')),
      h('div', { class: 'garage-right' }, h('span', { class: 'label-caps' }, 'Chassis (sidegrades)'), picker, detail),
    ),
  );
  queueMicrotask(preview);
  return { el, stage: { shot: 'solo', moods: ['ready', 'idle'] }, dispose: () => app.syncStage(true) };
}
