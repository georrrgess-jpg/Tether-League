import type { App, ScreenView } from '../../app';
import { CHASSIS, CHASSIS_ORDER, chassisBars, type ChassisId } from '../../content/chassis';
import { LESSONS, TRIALS, TRIAL_ORDER, type TrialId } from '../../content/trials';
import { playerLooks } from '../../game/setup';
import { levelFor, purchase } from '../../progression/progression';
import { fmtTime, h, icon } from '../dom';
import { shell } from '../shell';
import { seg } from './prematch';
import { formatTrialScore, medalIcons } from './results';

export function garageScreen(app: App, params: URLSearchParams): ScreenView {
  const save = app.save;
  let selected: ChassisId = (params.get('c') as ChassisId) in CHASSIS ? (params.get('c') as ChassisId) : save.club.chassis;
  let who: 'me' | 'mate' = 'me';
  const list = h('div', { class: 'chassis-list', role: 'listbox', 'aria-label': 'Chassis' });
  const detail = h('section', { class: 'panel chassis-detail' });
  const actions = h('div', { class: 'garage-actions' });
  const slot = h('div', { class: 'stage-slot' });
  let busy = false;

  const owned = (id: ChassisId) => save.owned.includes(`chassis:${id}`);
  const preview = () => {
    const looks = playerLooks(save);
    app.stage.setLooks([{ ...looks[who === 'me' ? 0 : 1], chassis: selected }, looks[1]]);
  };

  const render = () => {
    const level = levelFor(save.xp);
    list.replaceChildren(
      ...CHASSIS_ORDER.map((id) => {
        const c = CHASSIS[id];
        const isOwned = owned(id);
        const equipped = save.club.chassis === id || save.club.mateChassis === id;
        return h('button', { class: `chassis-item${id === selected ? ' is-selected' : ''}${isOwned ? '' : ' is-locked'}`, role: 'option', 'aria-selected': String(id === selected), onclick: () => {
          selected = id;
          render();
        } },
          h('span', { class: 'ci-name display' }, c.name),
          h('span', { class: 'ci-tag' }, c.tagline),
          h('span', { class: 'ci-state' },
            isOwned
              ? equipped
                ? h('span', { class: 'chip chip-cyan' }, icon('check'), save.club.chassis === id && save.club.mateChassis === id ? 'Both' : save.club.chassis === id ? 'You' : 'Teammate')
                : h('span', { class: 'chip' }, 'Owned')
              : h('span', { class: 'chip' }, icon('lock'), `${c.credits}`),
          ),
        );
      }),
    );
    const c = CHASSIS[selected];
    const isOwned = owned(selected);
    const parts: (HTMLElement | null)[] = [
      h('div', { class: 'panel-title' }, c.name, h('small', null, c.tagline)),
      h('div', { class: 'bars' }, chassisBars(c).map((b) => h('div', { class: 'bar-row' }, h('span', null, b.label), h('div', { class: 'bar' }, h('i', { style: `width:${Math.round(b.value * 100)}%` }))))),
      h('div', { class: 'trait good' }, icon('check'), h('span', null, c.strength)),
      h('div', { class: 'trait bad' }, icon('info'), h('span', null, c.weakness)),
      h('p', { class: 'muted' }, 'All chassis share the same size, kick reach and tether range. These are sidegrades, not upgrades.'),
      isOwned ? null : h('p', { class: 'locked-note' }, icon('lock'), `Unlocks free at club level ${c.unlockLevel} (you are level ${level}), or buy it now for ${c.credits} credits.`),
    ];
    detail.replaceChildren(...parts.filter((x): x is HTMLElement => !!x));
    const current = who === 'me' ? save.club.chassis : save.club.mateChassis;
    const equip = isOwned
      ? h('button', { class: 'btn btn-primary btn-big', disabled: current === selected, onclick: () => {
          if (who === 'me') save.club.chassis = selected;
          else save.club.mateChassis = selected;
          app.persist();
          app.toast(`${c.name} equipped for ${who === 'me' ? 'your robot' : 'your teammate'}. It applies from the next match.`, 'good');
          render();
        } }, current === selected ? icon('check') : null, current === selected ? 'Equipped' : 'Equip')
      : h('button', { class: `btn btn-primary btn-big${save.credits < c.credits ? ' is-disabled' : ''}`, 'aria-disabled': String(save.credits < c.credits), onclick: async () => {
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
            app.refresh();
          } else app.toast(res === 'insufficient' ? 'Not enough credits.' : 'Already owned.', 'bad');
        } }, icon('coin'), `Buy · ${c.credits}`);
    actions.replaceChildren(
      seg([{ value: 'me', label: `Your robot #${String(save.club.numbers[0]).padStart(2, '0')}` }, { value: 'mate', label: `Teammate #${String(save.club.numbers[1]).padStart(2, '0')}` }] as { value: 'me' | 'mate'; label: string }[], who, (v) => {
        who = v;
        render();
      }, 'Robot to equip'),
      equip,
      h('button', { class: 'btn btn-dark', onclick: () => app.startTestDrive(selected) }, icon('target'), 'Test drive'),
    );
    preview();
  };

  // drag to rotate the preview
  let dragX: number | null = null;
  slot.addEventListener('pointerdown', (e) => {
    dragX = e.clientX;
    slot.setPointerCapture(e.pointerId);
  });
  slot.addEventListener('pointermove', (e) => {
    if (dragX === null) return;
    app.stage.rotate((e.clientX - dragX) * 0.012);
    dragX = e.clientX;
  });
  slot.addEventListener('pointerup', () => (dragX = null));
  slot.addEventListener('pointercancel', () => (dragX = null));

  const el = shell(app, { nav: 'garage', title: 'Garage', subtitle: 'Robot selection', cls: 'garage' }, list, slot, detail, actions);
  queueMicrotask(render);
  return { el, stage: { shot: 'solo', moods: ['ready', 'idle'] }, dispose: () => app.syncStage(true) };
}

export function academyScreen(app: App): ScreenView {
  const save = app.save;
  let selected: TrialId = TRIAL_ORDER.find((t) => (save.trials[t]?.medal ?? 0) < 3) ?? 'swing_school';
  const detail = h('section', { class: 'panel trial-detail' });
  const trialList = h('div', { class: 'trial-list' });

  const render = () => {
    trialList.replaceChildren(
      ...TRIAL_ORDER.map((id) => {
        const t = TRIALS[id];
        const rec = save.trials[id];
        return h('button', { class: `trial-item${id === selected ? ' is-selected' : ''}`, 'aria-pressed': String(id === selected), onclick: () => {
          selected = id;
          render();
        } },
          h('span', { class: 'ti-icon' }, icon(t.icon)),
          h('span', { class: 'ti-text' }, h('b', { class: 'display' }, t.name), h('small', null, t.skill)),
          medalIcons(rec?.medal ?? 0),
        );
      }),
    );
    const t = TRIALS[selected];
    const rec = save.trials[selected];
    const thr = (v: number) => (t.unit === 'time' ? fmtTime(v) : String(v));
    detail.replaceChildren(
      h('div', { class: 'panel-title' }, t.name, h('small', null, t.skill)),
      h('p', { class: 'objective' }, t.objective),
      h('p', { class: 'muted' }, t.scoring),
      h('div', { class: 'thresholds' },
        h('span', { class: 'th m1' }, icon('star'), `Bronze ${thr(t.bronze)}`),
        h('span', { class: 'th m2' }, icon('star'), `Silver ${thr(t.silver)}`),
        h('span', { class: 'th m3' }, icon('star'), `Gold ${thr(t.gold)}`),
      ),
      h('div', { class: 'best-line' }, icon('timer'), h('span', null, 'Best'), h('b', { class: 'display' }, formatTrialScore(selected, rec?.best ?? null)), rec?.attempts ? h('small', null, `${rec.attempts} attempt${rec.attempts === 1 ? '' : 's'}`) : h('small', null, 'Not attempted yet')),
      h('button', { class: 'btn btn-cyan btn-big', onclick: () => app.startTrial(selected) }, icon('play'), 'Start trial'),
    );
  };
  render();

  const lessons = h('section', { class: 'panel-dark lessons' },
    h('h2', { class: 'section-head' }, icon('academy'), 'Lessons'),
    h('div', { class: 'lesson-list' },
      LESSONS.map((l, i) => {
        const done = save.lessons.includes(l.id);
        return h('button', { class: `lesson-item${done ? ' is-done' : ''}`, onclick: () => app.startLesson(l.id) },
          h('span', { class: 'li-num' }, done ? icon('check') : String(i + 1)),
          h('span', { class: 'li-text' }, h('b', null, l.name), h('small', null, l.summary)),
          h('span', { class: 'li-go' }, done ? 'Replay' : 'Try it'),
        );
      }),
    ),
    h('p', { class: 'muted' }, 'Every lesson is played, one skill per step. First completion pays a small reward.'),
  );

  const el = shell(app, { nav: 'academy', title: 'Academy', subtitle: 'Learn. Improve. Master.', dim: true, cls: 'academy' },
    lessons,
    h('section', { class: 'panel-dark trials' }, h('h2', { class: 'section-head' }, icon('target'), 'Skill trials'), trialList),
    detail,
  );
  return { el };
}
