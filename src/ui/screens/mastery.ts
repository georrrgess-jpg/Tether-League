import type { App } from '../../app';
import { CHASSIS, type ChassisId } from '../../content/chassis';
import { COSMETIC_BY_ID } from '../../content/cosmetics';
import { MASTERY_MAX, MASTERY_RANKS, MASTERY_SIGNATURE, SIGNATURE_LABEL, masteryRank, masteryReward, type MasteryReward, type SignatureStat } from '../../content/progression';
import { describeMasteryReward, masteryProgress } from '../../progression/mastery';
import { h, icon } from '../dom';
import { meter } from '../widgets';
import { itemThumb } from './thumbs';

/** A small shield in the rank's colour with the rank initial (Unranked shows a dash). */
export function rankEmblem(rank: number, size: 'sm' | 'lg' = 'sm'): HTMLElement {
  const r = MASTERY_RANKS[Math.max(0, Math.min(MASTERY_RANKS.length - 1, rank))];
  const letter = rank === 0 ? '–' : r.name[0];
  return h('span', { class: `rank-emblem rank-${rank} is-${size}`, style: `--rank:${r.color}`, role: 'img', 'aria-label': `${r.name} rank` },
    h('span', { class: 're-shield' }, h('b', null, letter)),
  );
}

function rewardThumb(app: App, r: MasteryReward): HTMLElement {
  if (r.kind === 'credits') return h('span', { class: 'rw-thumb mt-credits' }, icon('coin'));
  if (r.kind === 'pick') return h('span', { class: 'rw-thumb mt-pick' }, icon('gift'));
  return itemThumb(app, r.id);
}

function rewardShort(r: MasteryReward): string {
  if (r.kind === 'credits') return `${r.amount} cr`;
  if (r.kind === 'pick') return 'Free pick';
  return COSMETIC_BY_ID[r.id]?.name ?? 'Reward';
}

function signatureLine(stat: SignatureStat, w: number): string {
  const [one] = SIGNATURE_LABEL[stat];
  return stat === 'cleanSheet' ? `+${w} for a clean sheet` : `+${w} per ${one}`;
}

/**
 * Chassis mastery for one chassis: rank, level and XP, the next reward, the signature bonus that speeds it up,
 * and the full 20-level reward track. Display only: rewards are paid by commitMatch.
 */
export function masteryView(app: App, id: ChassisId): HTMLElement {
  const save = app.save;
  const c = CHASSIS[id];
  const owned = save.owned.includes(`chassis:${id}`);
  const xp = save.progress.mastery[id] ?? 0;
  const mp = masteryProgress(xp);
  const rank = masteryRank(mp.level);
  const r = MASTERY_RANKS[rank];
  const nextRank = MASTERY_RANKS[rank + 1];
  const claimed = save.progress.masteryClaimed[id] ?? 0;
  const sig = MASTERY_SIGNATURE[id];

  const head = h('div', { class: 'mv-head' },
    rankEmblem(rank, 'lg'),
    h('div', { class: 'mv-title' },
      h('small', { class: 'label-caps' }, `${c.name} mastery`),
      h('b', { class: 'mv-rank', style: `--rank:${r.color}` }, rank === 0 ? 'Unranked' : `${r.name} rank`),
      h('span', { class: 'mv-level' }, `Level ${mp.level} of ${MASTERY_MAX}`),
    ),
    h('div', { class: 'mv-xp' },
      meter(mp.max ? 1 : mp.frac, `${c.name} mastery`, 'teal', mp.max ? 100 : Math.round(mp.frac * 100)),
      h('small', null, mp.max ? 'Mastered: every reward collected' : `${xp - mp.from} / ${mp.to - mp.from} XP · ${mp.to - xp} to level ${mp.level + 1}${nextRank ? ` · ${nextRank.name} at ${nextRank.from}` : ''}`),
    ),
  );

  const next = mp.max ? null : masteryReward(id, mp.level + 1);
  const nextCard = h('div', { class: 'mv-next' },
    next ? rewardThumb(app, next) : h('span', { class: 'rw-thumb' }, icon('trophy')),
    h('div', null,
      h('small', { class: 'label-caps' }, next ? `Next reward · level ${mp.level + 1}` : 'All rewards collected'),
      h('b', null, next ? describeMasteryReward(next) : `${c.name} Legend`),
    ),
  );

  const sigCard = h('div', { class: 'mv-sig' },
    h('div', { class: 'mv-sig-head' }, icon('star'), h('b', null, `Signature: ${sig.name}`)),
    h('p', null, `${sig.blurb} Earned on top of your match XP, up to +${sig.cap} mastery XP a match.`),
    h('ul', { class: 'mv-sig-list' }, (Object.entries(sig.weights) as [SignatureStat, number][]).map(([s, w]) => h('li', { class: 'chip' }, signatureLine(s, w)))),
  );

  // Reward track: one node per level, coloured by the rank it belongs to.
  const track = h('ol', { class: 'mv-track', 'aria-label': `${c.name} mastery rewards` },
    Array.from({ length: MASTERY_MAX }, (_, i) => {
      const l = i + 1;
      const rw = masteryReward(id, l);
      const lr = masteryRank(l);
      const state = l <= claimed ? 'is-claimed' : l === mp.level + 1 ? 'is-next' : 'is-locked';
      const firstOfRank = MASTERY_RANKS[lr].from === l;
      return h('li', { class: `mv-node ${state}${firstOfRank ? ' rank-start' : ''}`, style: `--rank:${MASTERY_RANKS[lr].color}`, title: `Level ${l}: ${describeMasteryReward(rw)}` },
        firstOfRank ? h('span', { class: 'mv-rank-tag' }, MASTERY_RANKS[lr].name) : null,
        h('span', { class: 'mv-lvl' }, String(l)),
        rewardThumb(app, rw),
        h('small', null, rewardShort(rw)),
        h('span', { class: 'mv-state' }, l <= claimed ? icon('check') : null),
      );
    }),
  );
  // Scroll the next reward into view once laid out.
  requestAnimationFrame(() => {
    const n = track.querySelector('.is-next') as HTMLElement | null;
    if (n) track.scrollLeft = Math.max(0, n.offsetLeft - track.clientWidth / 2 + n.offsetWidth / 2);
  });

  return h('section', { class: `panel mastery-view${owned ? '' : ' is-locked'}`, 'aria-label': `${c.name} mastery` },
    head,
    owned ? null : h('p', { class: 'mv-locked' }, icon('lock'), `Unlock the ${c.name} to start earning its mastery. Rewards below are what it pays.`),
    h('div', { class: 'mv-row' }, nextCard, sigCard),
    track,
    h('p', { class: 'muted mv-foot' }, `Ranks: ${MASTERY_RANKS.slice(1).map((x) => `${x.name} ${x.from}`).join(' · ')}. Your robot wears its rank as a coloured belt. Mastery is cosmetic: it never changes how a chassis plays.`),
  );
}
