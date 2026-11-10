import type { App, ScreenView } from '../../app';
import { CHASSIS, CHASSIS_ORDER } from '../../content/chassis';
import { COSMETIC_BY_ID } from '../../content/cosmetics';
import { ACHIEVEMENTS, ACHIEVEMENT_REWARD, MASTERY_MAX, OBJECTIVE_BY_ID, ROAD_LENGTH, ROAD_PRESTIGE, ROAD_REPEAT_CREDITS, TIER_NAMES, masteryReward, roadReward, type ObjectiveTier, type TrackReward } from '../../content/progression';
import { achievementText, achievementValue, tierReached } from '../../progression/achievements';
import { describeMasteryReward, masteryProgress } from '../../progression/mastery';
import { objectiveReward } from '../../progression/objectives';
import { REWARDS, describeTrackReward, levelProgress, rerollObjective } from '../../progression/progression';
import type { SaveGame } from '../../storage/save';
import { h, icon } from '../dom';
import { clubTitle, shell } from '../shell';
import { medalIcons } from './results';
import { itemThumb } from './thumbs';

export const TIER_LABEL: Record<ObjectiveTier, string> = { easy: 'Quick', medium: 'Session', hard: 'Chase' };

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

/** The Club Road: a horizontal track of every level, claimed / next / upcoming. */
export function roadTrack(app: App, compact = false): HTMLElement {
  const save = app.save;
  const lp = levelProgress(save.xp);
  const last = Math.max(ROAD_LENGTH, lp.level + 4);
  const cards = [];
  for (let l = 1; l <= last; l++) {
    const r = roadReward(l);
    const claimed = save.claimedLevels.includes(l) && l <= lp.level;
    const next = l === lp.level + 1;
    const state = claimed ? 'is-claimed' : next ? 'is-next' : 'is-ahead';
    cards.push(h('li', { class: `road-step ${state}${ROAD_PRESTIGE.includes(l) ? ' is-prestige' : ''}${l > ROAD_LENGTH ? ' is-repeat' : ''}`, title: `Level ${l}: ${describeTrackReward(r)}`, 'data-level': String(l) },
      h('span', { class: 'rs-level display' }, String(l)),
      rewardIcon(app, r),
      h('span', { class: 'rs-name' }, shortReward(r)),
      h('span', { class: 'rs-state' }, claimed ? h('span', null, icon('check'), 'Claimed') : next ? h('span', null, `${lp.to - save.xp} XP`) : h('span', null, `Level ${l}`)),
    ));
  }
  const list = h('ol', { class: 'road-track', tabindex: '0', 'aria-label': `Club Road levels 1 to ${last}. You are level ${lp.level}.` }, cards);
  queueMicrotask(() => {
    const cur = list.querySelector<HTMLElement>('.is-next');
    if (cur) list.scrollLeft = Math.max(0, cur.offsetLeft - list.clientWidth / 2 + cur.offsetWidth / 2);
  });
  if (compact) return list;
  const r = roadReward(lp.level + 1);
  return h('section', { class: 'panel road-panel', 'aria-labelledby': 'road-h' },
    h('div', { class: 'road-head' },
      h('div', { class: 'road-level' }, h('small', null, 'Club level'), h('b', { class: 'display' }, String(lp.level))),
      h('div', { class: 'road-meta' },
        h('h2', { class: 'section-head', id: 'road-h' }, icon('star'), 'Club Road', clubTitle(app) ? h('span', { class: 'chip' }, clubTitle(app)) : null),
        h('div', { class: 'bar yellow', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(lp.to - lp.from), 'aria-valuenow': String(save.xp - lp.from), 'aria-label': 'XP to next level' }, h('i', { style: `width:${Math.round(lp.frac * 100)}%` })),
        h('p', { class: 'road-next' }, h('span', null, `${save.xp - lp.from} / ${lp.to - lp.from} XP`), h('span', null, 'Next: ', h('b', null, describeTrackReward(r)))),
      ),
      save.picks > 0 ? h('button', { class: 'btn btn-primary btn-small', onclick: () => app.navigate('club') }, icon('gift'), `${save.picks} free pick${save.picks > 1 ? 's' : ''}`) : null,
    ),
    list,
    h('p', { class: 'muted' }, `Every level has a reward. After level ${ROAD_LENGTH} each level pays ${ROAD_REPEAT_CREDITS} credits.`, save.flags.roadCarried ? ' Levels from your earlier progress were carried onto the road.' : ''),
  );
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

function objectivesPanel(app: App): HTMLElement {
  const save = app.save;
  const p = save.progress;
  const rows = p.objectives.map((o, slot) => {
    const d = OBJECTIVE_BY_ID[o.id];
    const r = objectiveReward(d);
    return h('li', { class: `objective-row tier-${d.tier}` },
      h('div', { class: 'or-top' },
        h('span', { class: `chip tier-chip tier-${d.tier}` }, TIER_LABEL[d.tier]),
        h('b', null, d.text),
      ),
      h('div', { class: 'or-bar' },
        h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(d.target), 'aria-valuenow': String(o.progress), 'aria-label': d.text }, h('i', { style: `width:${Math.round((o.progress / d.target) * 100)}%` })),
        h('span', { class: 'or-count' }, `${o.progress}/${d.target}`),
      ),
      h('div', { class: 'or-foot' },
        h('span', { class: 'or-reward' }, `+${r.xp} XP · +${r.credits}`, icon('coin')),
        d.scope === 'match' ? h('span', { class: 'muted' }, 'in one match') : null,
        p.rerolls > 0 ? h('button', { class: 'btn btn-ghost btn-small', onclick: () => {
          if (rerollObjective(save, slot)) {
            app.persist();
            app.toast('Objective swapped.', 'good');
            app.refresh();
          }
        }, 'aria-label': `Swap objective: ${d.text}` }, icon('retry'), 'Swap') : null,
      ),
    );
  });
  return h('section', { class: 'panel objectives-panel', 'aria-labelledby': 'obj-h' },
    h('h2', { class: 'section-head', id: 'obj-h' }, icon('target'), 'Club objectives', h('small', { class: 'muted' }, `${p.objectivesDone} completed`)),
    h('ol', { class: 'objective-list' }, rows),
    h('p', { class: 'muted' }, p.rerolls > 0 ? 'You have one free swap: use it on any objective you would rather not chase.' : 'Finish a match to earn one free swap.', ` Objectives never expire. Quick matches pay ${Math.round(REWARDS.quickFactor * 100)}% of the reward.`),
  );
}

function masteryPanel(app: App): HTMLElement {
  const save = app.save;
  const rows = CHASSIS_ORDER.map((id) => {
    const c = CHASSIS[id];
    const owned = save.owned.includes(`chassis:${id}`);
    const mp = masteryProgress(save.progress.mastery[id] ?? 0);
    const next = mp.max ? null : masteryReward(id, mp.level + 1);
    return h('li', { class: `mastery-row${owned ? '' : ' is-locked'}` },
      h('div', { class: 'mr-top' },
        h('b', null, c.name),
        save.club.chassis === id ? h('span', { class: 'chip chip-cyan' }, 'Equipped') : null,
        h('span', { class: 'mr-level' }, `Mastery ${mp.level}/${MASTERY_MAX}`),
      ),
      h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(mp.frac * 100)), 'aria-label': `${c.name} mastery` }, h('i', { style: `width:${Math.round(mp.frac * 100)}%` })),
      h('p', { class: 'muted' }, !owned ? `Locked: free at club level ${c.unlockLevel} or in the Garage.` : mp.max ? 'Mastered. Every reward collected.' : `Next: ${describeMasteryReward(next!)} · ${mp.to - (save.progress.mastery[id] ?? 0)} XP to go`),
    );
  });
  return h('section', { class: 'panel mastery-panel', 'aria-labelledby': 'mas-h' },
    h('h2', { class: 'section-head', id: 'mas-h' }, icon('garage'), 'Chassis mastery'),
    h('ul', { class: 'mastery-list' }, rows),
    h('p', { class: 'muted' }, 'The chassis your robot uses earns the match XP as mastery. Rewards are cosmetic: mastery never changes how a chassis plays.'),
  );
}

function achievementsPanel(app: App): HTMLElement {
  const save = app.save;
  let earned = 0;
  const cards = ACHIEVEMENTS.map((a) => {
    const value = achievementValue(save, a.stat);
    const paid = save.progress.achievements[a.id] ?? 0;
    const reached = Math.max(paid, tierReached(a, value));
    earned += paid;
    const done = paid >= 3;
    const nextIdx = Math.min(2, paid);
    const target = a.tiers[nextIdx];
    const prevT = paid > 0 ? a.tiers[paid - 1] : 0;
    const frac = done ? 1 : Math.max(0, Math.min(1, (value - prevT) / (target - prevT)));
    const item = a.items?.[nextIdx as 0 | 1 | 2];
    const rw = ACHIEVEMENT_REWARD[nextIdx];
    return h('li', { class: `ach-card${done ? ' is-done' : ''}${reached > paid ? ' is-pending' : ''}` },
      h('div', { class: 'ach-top' }, h('b', null, a.name), medalIcons(paid)),
      h('p', null, done ? achievementText(a, 2) : achievementText(a, nextIdx)),
      h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(target), 'aria-valuenow': String(Math.min(value, target)), 'aria-label': `${a.name} progress` }, h('i', { style: `width:${Math.round(frac * 100)}%` })),
      h('div', { class: 'ach-foot' },
        h('span', null, done ? 'Complete' : `${Math.min(value, target)} / ${target}`),
        done ? null : h('span', { class: 'ach-reward' }, `${TIER_NAMES[nextIdx]}: +${rw.xp} XP · +${rw.credits}`, icon('coin'), item ? ` · ${COSMETIC_BY_ID[item]?.name}` : ''),
      ),
      reached > paid ? h('p', { class: 'muted' }, 'Reached: paid at your next match, trial or lesson.') : null,
    );
  });
  return h('section', { class: 'panel achievements-panel', 'aria-labelledby': 'ach-h' },
    h('h2', { class: 'section-head', id: 'ach-h' }, icon('trophy'), 'Achievements', h('small', { class: 'muted' }, `${earned} of ${ACHIEVEMENTS.length * 3} tiers`)),
    h('ul', { class: 'ach-grid' }, cards),
  );
}

export function progressScreen(app: App): ScreenView {
  const el = shell(app, { nav: 'progress', title: 'Progress', subtitle: 'Club Road, objectives, achievements and mastery', dim: true, cls: 'progress' },
    roadTrack(app),
    h('div', { class: 'progress-grid' }, objectivesPanel(app), masteryPanel(app)),
    achievementsPanel(app),
  );
  return { el };
}
