import type { App, ScreenView } from '../../app';
import { CHASSIS, CHASSIS_ORDER } from '../../content/chassis';
import { COSMETIC_BY_ID } from '../../content/cosmetics';
import { ACHIEVEMENTS, ACHIEVEMENT_REWARD, MASTERY_MAX, OBJECTIVE_BY_ID, ROAD_LENGTH, ROAD_PRESTIGE, ROAD_REPEAT_CREDITS, TIER_NAMES, masteryReward, roadReward, type AchievementDef, type ObjectiveTier, type TrackReward } from '../../content/progression';
import { achievementText, achievementValue, tierReached } from '../../progression/achievements';
import { describeMasteryReward, masteryProgress, totalMasteryLevels } from '../../progression/mastery';
import { objectiveReward } from '../../progression/objectives';
import { REWARDS, describeTrackReward, levelProgress, rerollObjective } from '../../progression/progression';
import type { SaveGame } from '../../storage/save';
import { h, icon } from '../dom';
import { clubTitle, shell } from '../shell';
import { cardHead, meter, tabBar } from '../widgets';
import { CHASSIS_ICON } from './garage';
import { medalIcons } from './results';
import { itemThumb } from './thumbs';

export const TIER_LABEL: Record<ObjectiveTier, string> = { easy: 'Quick', medium: 'Session', hard: 'Chase' };

type ProgressTab = 'overview' | 'road' | 'mastery' | 'achievements';

function rewardIcon(app: App, r: TrackReward): HTMLElement {
  if (r.kind === 'item') return itemThumb(app, r.id);
  return h('span', { class: 'rw-thumb' }, icon(r.kind === 'credits' ? 'coin' : r.kind === 'pick' ? 'gift' : 'garage'));
}

function shortReward(r: TrackReward): string {
  if (r.kind === 'credits') return `${r.amount} cr`;
  if (r.kind === 'pick') return 'Free pick';
  if (r.kind === 'chassis') return CHASSIS[r.id].name;
  return COSMETIC_BY_ID[r.id]?.name ?? r.id;
}

/** One Club Road level card: claimed / next / upcoming. */
function roadStep(app: App, l: number): HTMLElement {
  const save = app.save;
  const lp = levelProgress(save.xp);
  const r = roadReward(l);
  const claimed = save.claimedLevels.includes(l) && l <= lp.level;
  const next = l === lp.level + 1;
  const state = claimed ? 'is-claimed' : next ? 'is-next' : 'is-ahead';
  return h('li', { class: `road-step ${state}${ROAD_PRESTIGE.includes(l) ? ' is-prestige' : ''}${l > ROAD_LENGTH ? ' is-repeat' : ''}`, title: `Level ${l}: ${describeTrackReward(r)}`, 'data-level': String(l) },
    next ? h('span', { class: 'rs-flag' }, 'Next reward') : null,
    h('span', { class: 'rs-level' }, String(l)),
    rewardIcon(app, r),
    h('span', { class: 'rs-name' }, shortReward(r)),
    h('span', { class: 'rs-state' }, claimed ? h('span', null, icon('check'), 'Claimed') : next ? h('span', null, `${lp.to - save.xp} XP`) : h('span', null, `Level ${l}`)),
  );
}

/** The Club Road: a horizontal track of every level. */
export function roadTrack(app: App): HTMLElement {
  const lp = levelProgress(app.save.xp);
  const last = Math.max(ROAD_LENGTH, lp.level + 4);
  const cards = [];
  for (let l = 1; l <= last; l++) cards.push(roadStep(app, l));
  const list = h('ol', { class: 'road-track', tabindex: '0', 'aria-label': `Club Road levels 1 to ${last}. You are level ${lp.level}.` }, cards);
  queueMicrotask(() => {
    const cur = list.querySelector<HTMLElement>('.is-next');
    if (cur) list.scrollLeft = Math.max(0, cur.offsetLeft - list.clientWidth / 2 + cur.offsetWidth / 2);
  });
  return list;
}

/** Nearest objective to completion (highest fraction, easier first). */
export function nearestObjective(save: SaveGame): { id: string; progress: number; target: number; text: string } | null {
  let best: { id: string; progress: number; target: number; text: string; f: number } | null = null;
  for (const o of save.progress.objectives) {
    const d = OBJECTIVE_BY_ID[o.id];
    if (!d) continue;
    const f = o.progress / d.target;
    if (!best || f > best.f) best = { id: d.id, progress: o.progress, target: d.target, text: d.text, f };
  }
  return best;
}

/** Club level medallion, XP bar, next reward and free picks: the strip at the top of Progress. */
function levelStrip(app: App): HTMLElement {
  const save = app.save;
  const lp = levelProgress(save.xp);
  const next = roadReward(lp.level + 1);
  return h('section', { class: 'panel lvl-strip', 'aria-label': 'Club level' },
    h('div', { class: 'lvl-medal', 'aria-label': `Club level ${lp.level}` }, h('small', null, 'Level'), h('b', null, String(lp.level))),
    h('div', { class: 'lvl-xp' },
      h('div', { class: 'lvl-xp-top' }, h('b', null, `${save.xp - lp.from} / ${lp.to - lp.from} XP`), clubTitle(app) ? h('span', { class: 'chip chip-violet' }, clubTitle(app)) : null),
      meter(lp.frac, 'Club XP to next level', 'xp', save.xp - lp.from, lp.to - lp.from),
    ),
    h('div', { class: 'lvl-next' }, rewardIcon(app, next), h('span', null, h('small', null, `Level ${lp.level + 1}`), h('b', null, describeTrackReward(next)))),
    save.picks > 0 ? h('button', { class: 'btn btn-primary lvl-pick', type: 'button', onclick: () => app.navigate('club'), title: 'Free picks unlock any shop item in Club customisation' }, icon('gift'), `${save.picks} free pick${save.picks > 1 ? 's' : ''}`) : null,
  );
}

function objectivesPanel(app: App, full = true): HTMLElement {
  const save = app.save;
  const p = save.progress;
  const rows = p.objectives.map((o, slot) => {
    const d = OBJECTIVE_BY_ID[o.id];
    const r = objectiveReward(d);
    return h('li', { class: `objective-row tier-${d.tier}` },
      h('span', { class: `tier-chip tier-${d.tier}` }, TIER_LABEL[d.tier]),
      h('div', { class: 'or-main' },
        h('div', { class: 'or-top' }, h('b', null, d.text), h('span', { class: 'or-reward' }, `+${r.xp} XP · +${r.credits}`, icon('coin'))),
        h('div', { class: 'or-bar' }, meter(o.progress / d.target, d.text, 'teal', o.progress, d.target), h('span', { class: 'or-count' }, `${o.progress}/${d.target}`)),
        d.scope === 'match' ? h('small', { class: 'muted' }, 'In one match') : null,
      ),
      p.rerolls > 0 ? h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => {
        if (rerollObjective(save, slot)) {
          app.persist();
          app.toast('Objective swapped.', 'good');
          app.refresh();
        }
      }, 'aria-label': `Swap objective: ${d.text}` }, icon('swap'), 'Swap') : null,
    );
  });
  return h('section', { class: 'panel objectives-panel', 'aria-labelledby': 'obj-h' },
    cardHead('target', 'Club objectives', `${p.objectivesDone} completed${p.rerolls > 0 ? ` · ${p.rerolls} free swap${p.rerolls > 1 ? 's' : ''}` : ''}`, 'obj-h'),
    h('ol', { class: 'objective-list' }, rows),
    full ? h('p', { class: 'muted' }, p.rerolls > 0 ? 'One free swap: use it on any objective you would rather not chase.' : 'Finish a match to earn a free swap.', ` Objectives never expire. Quick matches pay ${Math.round(REWARDS.quickFactor * 100)}% of the reward.`) : null,
  );
}

function roadPanel(app: App): HTMLElement {
  const save = app.save;
  const lp = levelProgress(save.xp);
  const from = Math.max(1, Math.min(lp.level - 2, Math.max(ROAD_LENGTH, lp.level + 4) - 4));
  const steps = [];
  for (let l = from; l < from + 5; l++) steps.push(roadStep(app, l));
  return h('section', { class: 'panel road-panel', 'aria-labelledby': 'road-h' },
    cardHead('road', 'Club Road', h('button', { class: 'link-btn', type: 'button', onclick: () => go('road') }, 'Full road', icon('next')), 'road-h'),
    h('p', { class: 'muted road-sub' }, 'Level up with club XP to collect every reward.'),
    h('ol', { class: 'road-mini' }, steps),
    save.picks > 0
      ? h('div', { class: 'pick-row' }, icon('gift'), h('div', null, h('b', null, `${save.picks} free pick${save.picks > 1 ? 's' : ''}`), h('small', null, 'Choose any shop item in Club customisation')), h('button', { class: 'btn btn-cyan btn-small', type: 'button', onclick: () => app.navigate('club') }, icon('club'), 'Use'))
      : h('div', { class: 'pick-row is-quiet' }, icon('info'), h('div', null, h('b', null, `${ROAD_LENGTH} levels`), h('small', null, `Each level after ${ROAD_LENGTH} pays ${ROAD_REPEAT_CREDITS} credits.`))),
  );
  function go(t: ProgressTab) {
    app.navigate(`progress?tab=${t}`);
  }
}

function masteryMini(app: App): HTMLElement {
  const save = app.save;
  return h('section', { class: 'panel mastery-mini', 'aria-labelledby': 'mm-h' },
    cardHead('garage', 'Chassis mastery', h('button', { class: 'link-btn', type: 'button', onclick: () => app.navigate('progress?tab=mastery') }, `${totalMasteryLevels(save)} / ${CHASSIS_ORDER.length * MASTERY_MAX}`, icon('next')), 'mm-h'),
    h('ul', { class: 'mm-grid' }, CHASSIS_ORDER.map((id) => {
      const owned = save.owned.includes(`chassis:${id}`);
      const mp = masteryProgress(save.progress.mastery[id] ?? 0);
      return h('li', { class: `mm-card${save.club.chassis === id ? ' is-equipped' : ''}${owned ? '' : ' is-locked'}`, title: owned ? `${CHASSIS[id].name}: mastery ${mp.level} of ${MASTERY_MAX}. Open in the Garage` : `${CHASSIS[id].name}: locked`, role: 'button', tabindex: '0', onclick: () => app.navigate(`garage?c=${id}&tab=mastery`), onkeydown: (e: Event) => { const k = (e as KeyboardEvent).key; if (k === 'Enter' || k === ' ') { e.preventDefault(); app.navigate(`garage?c=${id}&tab=mastery`); } } },
        h('b', null, CHASSIS[id].name),
        h('span', { class: 'mm-icon' }, icon(owned ? CHASSIS_ICON[id] : 'lock')),
        h('small', null, `${mp.level} / ${MASTERY_MAX}`),
        meter(mp.max ? 1 : mp.frac, `${CHASSIS[id].name} mastery`, 'teal'),
      );
    })),
  );
}

function masteryPanel(app: App): HTMLElement {
  const save = app.save;
  const rows = CHASSIS_ORDER.map((id) => {
    const c = CHASSIS[id];
    const owned = save.owned.includes(`chassis:${id}`);
    const mp = masteryProgress(save.progress.mastery[id] ?? 0);
    const next = mp.max ? null : masteryReward(id, mp.level + 1);
    return h('li', { class: `mastery-row${owned ? '' : ' is-locked'}${save.club.chassis === id ? ' is-equipped' : ''}` },
      h('span', { class: 'mr-icon' }, icon(owned ? CHASSIS_ICON[id] : 'lock')),
      h('div', { class: 'mr-main' },
        h('div', { class: 'mr-top' },
          h('b', null, c.name),
          save.club.chassis === id ? h('span', { class: 'chip chip-cyan' }, 'Equipped') : null,
          h('span', { class: 'mr-level' }, `Mastery ${mp.level}/${MASTERY_MAX}`),
        ),
        meter(mp.frac, `${c.name} mastery`, 'teal', Math.round(mp.frac * 100)),
        h('p', { class: 'muted' }, !owned ? `Locked: free at club level ${c.unlockLevel} or in the Garage.` : mp.max ? 'Mastered. Every reward collected.' : `Next: ${describeMasteryReward(next!)} · ${mp.to - (save.progress.mastery[id] ?? 0)} XP to go`),
      ),
      h('button', { class: 'btn btn-small mr-open', type: 'button', onclick: () => app.navigate(`garage?c=${id}&tab=mastery`), 'aria-label': `Open ${c.name} mastery in the Garage` }, 'Rewards', icon('next')),
    );
  });
  return h('section', { class: 'panel mastery-panel', 'aria-labelledby': 'mas-h' },
    cardHead('garage', 'Chassis mastery', `${totalMasteryLevels(save)} / ${CHASSIS_ORDER.length * MASTERY_MAX} levels`, 'mas-h'),
    h('ul', { class: 'mastery-list' }, rows),
    h('p', { class: 'muted' }, 'The chassis your robot uses earns the match XP as mastery, plus a signature bonus for playing to its strengths. See every reward in the Garage. Rewards are cosmetic: mastery never changes how a chassis plays.'),
  );
}

interface AchState {
  a: AchievementDef;
  value: number;
  paid: number;
  reached: number;
  done: boolean;
  nextIdx: number;
  target: number;
  frac: number;
}

function achState(save: SaveGame, a: AchievementDef): AchState {
  const value = achievementValue(save, a.stat);
  const paid = save.progress.achievements[a.id] ?? 0;
  const reached = Math.max(paid, tierReached(a, value));
  const done = paid >= 3;
  const nextIdx = Math.min(2, paid);
  const target = a.tiers[nextIdx];
  const prevT = paid > 0 ? a.tiers[paid - 1] : 0;
  const frac = done ? 1 : Math.max(0, Math.min(1, (value - prevT) / (target - prevT)));
  return { a, value, paid, reached, done, nextIdx, target, frac };
}

const ACH_ICONS = ['target', 'swing', 'assist', 'save', 'pass', 'trophy', 'star', 'boost'];
const achIcon = (a: AchievementDef) => {
  const s = String(a.stat).toLowerCase();
  if (s.includes('goal')) return 'target';
  if (s.includes('swing')) return 'swing';
  if (s.includes('assist')) return 'assist';
  if (s.includes('save') || s.includes('clean')) return 'save';
  if (s.includes('pass')) return 'pass';
  if (s.includes('win') || s.includes('trophy') || s.includes('season')) return 'trophy';
  if (s.includes('medal') || s.includes('trial')) return 'medal';
  return ACH_ICONS[a.id.length % ACH_ICONS.length];
};

function achCard(st: AchState, compact = false): HTMLElement {
  const { a, value, paid, reached, done, nextIdx, target, frac } = st;
  const item = a.items?.[nextIdx as 0 | 1 | 2];
  const rw = ACHIEVEMENT_REWARD[nextIdx];
  return h('li', { class: `ach-card${done ? ' is-done' : ''}${reached > paid ? ' is-pending' : ''}` },
    h('span', { class: 'ach-icon' }, icon(achIcon(a))),
    h('div', { class: 'ach-main' },
      h('div', { class: 'ach-top' }, h('b', null, a.name), medalIcons(paid)),
      h('p', null, done ? achievementText(a, 2) : achievementText(a, nextIdx)),
      h('div', { class: 'ach-bar' }, meter(frac, `${a.name} progress`, 'teal', Math.min(value, target), target), h('span', null, done ? 'Complete' : `${Math.min(value, target)} / ${target}`)),
      compact ? null : done ? null : h('small', { class: 'ach-reward' }, `${TIER_NAMES[nextIdx]}: +${rw.xp} XP · +${rw.credits} credits${item ? ` · ${COSMETIC_BY_ID[item]?.name}` : ''}`),
      reached > paid ? h('small', { class: 'ach-pending' }, 'Reached: paid at your next match, trial or lesson.') : null,
    ),
  );
}

function achievementsPanel(app: App): HTMLElement {
  const save = app.save;
  const all = ACHIEVEMENTS.map((a) => achState(save, a));
  const earned = all.reduce((n, s) => n + s.paid, 0);
  return h('section', { class: 'panel achievements-panel', 'aria-labelledby': 'ach-h' },
    cardHead('trophy', 'Achievements', `${earned} / ${ACHIEVEMENTS.length * 3} tiers`, 'ach-h'),
    h('ul', { class: 'ach-grid' }, all.map((s) => achCard(s))),
  );
}

function achievementsStrip(app: App): HTMLElement {
  const save = app.save;
  const all = ACHIEVEMENTS.map((a) => achState(save, a));
  const earned = all.reduce((n, s) => n + s.paid, 0);
  const near = all.filter((s) => !s.done).sort((x, y) => y.frac - x.frac).slice(0, 3);
  return h('section', { class: 'panel ach-strip', 'aria-labelledby': 'achs-h' },
    cardHead('trophy', 'Achievements', `${earned} / ${ACHIEVEMENTS.length * 3} tiers`, 'achs-h'),
    h('div', { class: 'ach-strip-row' },
      h('ul', { class: 'ach-row' }, near.map((s) => achCard(s, true))),
      h('button', { class: 'btn btn-primary view-all', type: 'button', onclick: () => app.navigate('progress?tab=achievements', true) }, 'View all', icon('next')),
    ),
  );
}

export function progressScreen(app: App, params: URLSearchParams): ScreenView {
  const save = app.save;
  const tab: ProgressTab = (['overview', 'road', 'mastery', 'achievements'] as ProgressTab[]).find((t) => t === params.get('tab')) ?? 'overview';
  const tabs = tabBar<ProgressTab>([
    { id: 'overview', label: 'Overview', icon: 'grid' },
    { id: 'road', label: 'Road', icon: 'road' },
    { id: 'mastery', label: 'Mastery', icon: 'layers' },
    { id: 'achievements', label: 'Achievements', short: 'Awards', icon: 'trophy' },
  ], tab, (t) => app.navigate(`progress${t === 'overview' ? '' : `?tab=${t}`}`, true), 'Progress sections');

  let body: HTMLElement;
  if (tab === 'overview') {
    body = h('div', { class: 'prog-overview' }, levelStrip(app), roadPanel(app), objectivesPanel(app, false), masteryMini(app), achievementsStrip(app));
  } else if (tab === 'road') {
    const lp = levelProgress(save.xp);
    body = h('div', { class: 'prog-road' }, levelStrip(app),
      h('section', { class: 'panel road-full', 'aria-labelledby': 'rf-h' },
        cardHead('road', 'Club Road', `Level ${lp.level} of ${ROAD_LENGTH}`, 'rf-h'),
        roadTrack(app),
        h('p', { class: 'muted' }, `Every level has a reward, paid the moment you reach it. After level ${ROAD_LENGTH} each level pays ${ROAD_REPEAT_CREDITS} credits. Gold-edged levels are milestones.`, save.flags.roadCarried ? ' Levels from your earlier progress were carried onto the road.' : ''),
      ),
      objectivesPanel(app),
    );
  } else if (tab === 'mastery') {
    body = h('div', { class: 'prog-single' }, masteryPanel(app));
  } else {
    body = h('div', { class: 'prog-single' }, achievementsPanel(app));
  }
  const el = shell(app, { nav: 'progress', title: 'Progress', subtitle: 'Club Road, objectives, mastery & achievements', dim: true, cls: `progress tab-${tab}`, headExtra: tabs }, body);
  return { el };
}
