import type { App, ScreenView } from '../../app';
import { ARENAS } from '../../content/arenas';
import { PLAYS, PLAY_ORDER, type PlayId } from '../../content/plays';
import { LESSONS, MEDAL_NAMES, TRIALS, TRIAL_ORDER, type LessonId, type TrialId } from '../../content/trials';
import { keyLabel } from '../../storage/settings';
import { fmtTime, h, icon } from '../dom';
import { shell } from '../shell';
import { currentInput, tabBar } from '../widgets';
import { arenaDiagram } from './prematch';
import { formatTrialScore, medalIcons } from './results';

type AcademyTab = 'lessons' | 'trials' | 'plays';
type InputKind = 'keyboard' | 'touch' | 'pad';

/** What each play's Records counter counts (display text only). */
const RECORD_LABEL: Record<string, string> = {
  longBalls: 'long balls found a teammate',
  giveAndGos: 'give-and-goes completed',
  wallPasses: 'wall passes',
  oneTouchGoals: 'one-touch goals',
};

/** The backdrop colour the arena diagram uses, so the preview frame blends with it. */
function arenaBackdrop(id: TrialDefArena): string {
  return arenaDiagram(id).querySelector('rect')?.getAttribute('fill') ?? '#2f6f5c';
}
type TrialDefArena = (typeof TRIALS)[TrialId]['arena'];

export function academyScreen(app: App, params: URLSearchParams): ScreenView {
  const save = app.save;
  const firstOpenTrial = TRIAL_ORDER.find((t) => (save.trials[t]?.medal ?? 0) < 3) ?? TRIAL_ORDER[0];
  const firstLesson = (LESSONS.find((l) => !save.lessons.includes(l.id)) ?? LESSONS[0]).id;
  // New players start on Lessons until every lesson is done; then Trials.
  let tab: AcademyTab = (['lessons', 'trials', 'plays'] as AcademyTab[]).find((t) => t === params.get('tab')) ?? (LESSONS.every((l) => save.lessons.includes(l.id)) ? 'trials' : 'lessons');
  let trial: TrialId = (TRIAL_ORDER as string[]).includes(params.get('trial') ?? '') ? (params.get('trial') as TrialId) : firstOpenTrial;
  let lesson: LessonId = firstLesson;
  let play: PlayId = PLAY_ORDER[0];
  let input: InputKind = currentInput();

  const tabsSlot = h('div', { class: 'ac-tabs' });
  const list = h('div', { class: 'ac-list', role: 'listbox', 'aria-label': 'Academy items' });
  const detail = h('section', { class: 'panel ac-detail', 'aria-live': 'polite' });
  const dock = h('div', { class: 'dock-row ac-dock' });

  const row = (opts: { selected: boolean; ic: string; name: string; sub: string; right?: Node | null; done?: boolean; onPick: () => void }) =>
    h('button', { class: `ac-item${opts.selected ? ' is-selected' : ''}${opts.done ? ' is-done' : ''}`, type: 'button', role: 'option', 'aria-selected': String(opts.selected), onclick: opts.onPick },
      h('span', { class: 'ai-icon' }, icon(opts.ic)),
      h('span', { class: 'ai-text' }, h('b', null, opts.name), h('small', null, opts.sub)),
      opts.right ?? icon('next'),
    );

  const renderTrials = () => {
    list.replaceChildren(...TRIAL_ORDER.map((id) => {
      const t = TRIALS[id];
      return row({ selected: id === trial, ic: t.icon, name: t.name, sub: t.skill, right: medalIcons(save.trials[id]?.medal ?? 0), onPick: () => {
        trial = id;
        render();
      } });
    }));
    const t = TRIALS[trial];
    const rec = save.trials[trial];
    const thr = (v: number) => (t.unit === 'time' ? fmtTime(v) : String(v));
    const medal = rec?.medal ?? 0;
    const th = (m: 1 | 2 | 3, v: number) =>
      h('div', { class: `thr m${m}${medal >= m ? ' is-won' : ''}` }, h('i', { class: `medal m${m} is-on` }, icon('star')), h('span', null, h('small', null, MEDAL_NAMES[m]), h('b', null, thr(v))));
    detail.replaceChildren(
      h('div', { class: 'ad-head' },
        h('div', { class: 'ad-title' }, h('h2', null, t.name, h('span', { class: 'chip chip-cyan' }, 'Trial')), h('p', null, t.skill)),
        h('div', { class: 'thresholds', 'aria-label': `Medal targets (${t.unit === 'time' ? 'lower is better' : 'higher is better'})` }, th(1, t.bronze), th(2, t.silver), th(3, t.gold)),
      ),
      h('div', { class: 'ad-preview', style: `background:${arenaBackdrop(t.arena)}` },
        arenaDiagram(t.arena),
        h('span', { class: 'ap-icon', 'aria-hidden': 'true' }, icon(t.icon)),
        h('span', { class: 'ap-arena' }, icon('pin'), ARENAS[t.arena].name),
      ),
      h('div', { class: 'ad-foot' },
        h('p', { class: 'ad-objective' }, icon('info'), h('span', null, t.objective)),
        h('div', { class: 'ad-best' }, icon('trophy'), h('b', null, 'Best'), h('span', { class: `chip ${rec?.best != null ? 'chip-yellow' : 'chip-cyan'}` }, rec?.best != null ? formatTrialScore(trial, rec.best) : 'Not attempted'),
          rec?.attempts ? h('small', null, `${rec.attempts} attempt${rec.attempts === 1 ? '' : 's'}`) : null),
      ),
      h('p', { class: 'muted ad-scoring' }, t.scoring, ' ', t.unit === 'time' ? 'Lower times are better.' : 'Higher scores are better.'),
    );
    dock.replaceChildren(
      h('div', { class: 'dock-info' }, h('b', null, t.name), h('small', null, medal ? `${MEDAL_NAMES[medal]} medal won${medal < 3 ? ` · next: ${MEDAL_NAMES[medal + 1]} ${thr([t.bronze, t.silver, t.gold][medal])}` : ''}` : `Bronze ${thr(t.bronze)} earns the first medal reward`)),
      h('button', { class: 'btn btn-primary btn-big', type: 'button', 'data-autofocus': true, onclick: () => app.startTrial(trial) }, icon('play'), 'Start trial'),
    );
  };

  const renderLessons = () => {
    list.replaceChildren(...LESSONS.map((l, i) => {
      const done = save.lessons.includes(l.id);
      return row({ selected: l.id === lesson, ic: l.icon, name: l.name, sub: `Lesson ${i + 1} · ${l.summary}`, done, right: done ? h('span', { class: 'chip chip-green' }, icon('check'), 'Done') : h('span', { class: 'chip chip-violet' }, 'New'), onPick: () => {
        lesson = l.id;
        render();
      } });
    }));
    const idx = LESSONS.findIndex((l) => l.id === lesson);
    const l = LESSONS[idx];
    const done = save.lessons.includes(l.id);
    const doneCount = LESSONS.filter((x) => save.lessons.includes(x.id)).length;
    detail.replaceChildren(
      h('div', { class: 'ad-head' },
        h('div', { class: 'ad-title' }, h('h2', null, l.name, h('span', { class: 'chip chip-violet' }, 'Lesson')), h('p', null, `Lesson ${idx + 1} of ${LESSONS.length}`)),
        h('div', { class: 'lesson-progress' }, h('b', null, `${doneCount}/${LESSONS.length}`), h('small', null, 'lessons done')),
      ),
      h('div', { class: 'ad-preview is-lesson' },
        h('span', { class: 'ap-big', 'aria-hidden': 'true' }, icon(l.icon)),
        h('ol', { class: 'lesson-steps', 'aria-label': 'Lessons' }, LESSONS.map((x, i) => h('li', { class: `${save.lessons.includes(x.id) ? 'is-done' : ''}${x.id === l.id ? ' is-current' : ''}` }, h('i', null, save.lessons.includes(x.id) ? icon('check') : String(i + 1)), h('span', null, x.name)))),
      ),
      h('div', { class: 'ad-foot' },
        h('p', { class: 'ad-objective' }, icon('info'), h('span', null, l.summary)),
        h('div', { class: 'ad-best' }, done ? h('span', { class: 'chip chip-green' }, icon('check'), 'Completed') : h('span', { class: 'chip chip-violet' }, 'Not played yet')),
      ),
      h('p', { class: 'muted ad-scoring' }, 'Every lesson is played, one skill per step. The first completion pays a small reward.'),
    );
    dock.replaceChildren(
      h('div', { class: 'dock-info' }, h('b', null, l.name), h('small', null, done ? 'Completed · replay any time' : 'About a minute · first completion pays a reward')),
      h('button', { class: 'btn btn-primary btn-big', type: 'button', 'data-autofocus': true, onclick: () => app.startLesson(l.id) }, icon('play'), done ? 'Replay lesson' : 'Play lesson'),
    );
  };

  const renderPlays = () => {
    list.replaceChildren(...PLAY_ORDER.map((id) => {
      const p = PLAYS[id];
      const n = save.records[p.record] ?? 0;
      return row({ selected: id === play, ic: p.icon, name: p.name, sub: p.summary, right: h('span', { class: `chip${n ? ' chip-yellow' : ''}`, title: `${n} ${RECORD_LABEL[p.record] ?? 'in your records'}` }, String(n)), onPick: () => {
        play = id;
        render();
      } });
    }));
    const p = PLAYS[play];
    const n = save.records[p.record] ?? 0;
    const keys = save.settings.keys;
    const passKeys = [keyLabel(keys.pass[0]), keyLabel(keys.pass[1])].filter((x) => x !== '—').join(' / ');
    const kickKeys = [keyLabel(keys.kick[0]), keyLabel(keys.kick[1])].filter((x) => x !== '—').join(' / ');
    const inputs: { id: InputKind; label: string; ic: string }[] = [
      { id: 'keyboard', label: 'Keyboard', ic: 'keyboard' },
      { id: 'touch', label: 'Touch', ic: 'touch' },
      { id: 'pad', label: 'Gamepad', ic: 'pad' },
    ];
    detail.replaceChildren(
      h('div', { class: 'ad-head' },
        h('div', { class: 'ad-title' }, h('h2', null, p.name, h('span', { class: 'chip chip-yellow' }, 'Team play')), h('p', null, p.summary)),
        h('div', { class: 'play-count' }, h('b', null, String(n)), h('small', null, RECORD_LABEL[p.record] ?? 'in your records')),
      ),
      h('div', { class: 'howto' },
        h('div', { class: 'howto-head' }, h('b', null, 'How to'),
          h('div', { class: 'seg', role: 'group', 'aria-label': 'Show controls for' },
            inputs.map((x) => h('button', { type: 'button', 'aria-pressed': String(input === x.id), onclick: () => {
              input = x.id;
              render();
            } }, icon(x.ic), ` ${x.label}`)),
          ),
        ),
        h('p', { class: 'howto-text' }, p.how[input]),
        input === 'keyboard' ? h('p', { class: 'muted' }, 'Your keys: PASS ', h('kbd', { class: 'cap' }, passKeys || '—'), ' · KICK ', h('kbd', { class: 'cap' }, 'Left click'), ' ', h('kbd', { class: 'cap' }, kickKeys || '—'), '. Change them in Settings → Controls.') : null,
      ),
      h('div', { class: 'tip' }, icon('star'), h('div', null, h('b', null, 'Skill'), h('p', null, p.skill))),
      h('p', { class: 'muted ad-scoring' }, 'Plays work in every match. Your lifetime counts are kept in Club → Records.'),
    );
    dock.replaceChildren(
      h('div', { class: 'dock-info' }, h('b', null, p.name), h('small', null, `Try it in a match · ${n} so far`)),
      h('button', { class: 'btn btn-dark btn-big', type: 'button', 'data-autofocus': true, onclick: () => app.navigate('prematch?mode=quick') }, icon('ball'), 'Quick match'),
    );
  };

  const render = () => {
    const lessonsLeft = LESSONS.filter((l) => !save.lessons.includes(l.id)).length;
    tabsSlot.replaceChildren(tabBar<AcademyTab>([
      { id: 'lessons', label: 'Lessons', icon: 'list', badge: lessonsLeft ? String(lessonsLeft) : null },
      { id: 'trials', label: 'Trials', icon: 'target' },
      { id: 'plays', label: 'Playbook', icon: 'assist' },
    ], tab, (t) => {
      tab = t;
      render();
    }, 'Academy sections', 'ac-tabbar'));
    detail.className = `panel ac-detail is-${tab}`;
    if (tab === 'trials') renderTrials();
    else if (tab === 'lessons') renderLessons();
    else renderPlays();
  };
  render();

  const el = shell(app, { nav: 'academy', titleIcon: 'academy', title: 'Academy', subtitle: 'Learn · Practise · Master', dim: true, cls: 'academy', dock },
    h('div', { class: 'academy-grid' },
      h('section', { class: 'panel ac-side' }, tabsSlot, list),
      detail,
    ),
  );
  return { el };
}
