import { audio } from '../../audio/audio';
import { ARENAS, type ArenaId } from '../../content/arenas';
import { CHASSIS } from '../../content/chassis';
import type { RobotLook } from '../../content/cosmetics';
import { TUNING } from '../../content/tuning';
import { keyLabel, type Settings } from '../../storage/settings';
import { badgeSvg, isLight } from '../../ui/badge';
import { fmtClock, h } from '../../ui/dom';
import { BotDirector, type BotStyle, type Difficulty } from '../ai/bot';
import type { RobotMood } from '../render/robotView';
import type { Expression } from '../render/textures';
import type { PlayMode, PlaySession } from '../session';
import { Match, type GoalRecord, type RobotStats } from '../sim/match';
import type { Command, World } from '../sim/types';

export interface TeamInfo {
  id: string;
  name: string;
  badge: string;
  primary: string;
  secondary: string;
}

export interface MatchSetup {
  matchId: string;
  kind: 'career' | 'playoff' | 'quick';
  fixtureId?: string;
  label: string;
  arena: ArenaId;
  home: TeamInfo;
  away: TeamInfo;
  /** Robot looks by id: 0 player, 1 teammate, 2-3 opponents. */
  looks: [RobotLook, RobotLook, RobotLook, RobotLook];
  oppDifficulty: Difficulty;
  oppStyle: BotStyle;
  mateDifficulty: Difficulty;
  mateStyle: BotStyle;
  assist: 0 | 1 | 2;
  regulationSeconds: number;
  seed: number;
  hints: boolean;
}

export interface MatchResult {
  matchId: string;
  kind: MatchSetup['kind'];
  fixtureId?: string;
  arena: ArenaId;
  opponent: string;
  score: [number, number];
  won: boolean;
  overtime: boolean;
  duration: number;
  player: RobotStats;
  mate: RobotStats;
  goals: GoalRecord[];
}

export class MatchMode implements PlayMode {
  readonly match: Match;
  readonly world: World;
  readonly human = 0;
  readonly looks: RobotLook[];
  readonly teamColors: [string, string];
  readonly hud: HTMLElement;
  readonly title: string;
  readonly leaveNote: string;
  teleported = false;
  private bots: BotDirector;
  private prevPhase: Match['phase'] = 'countdown';
  private endHold = 0;
  private elScore: [HTMLElement, HTMLElement];
  private elClock: HTMLElement;
  private elPhase: HTMLElement;
  private elBanner: HTMLElement;
  private elCount: HTMLElement;
  private elToasts: HTMLElement;
  private elHint: HTMLElement;
  private bannerT = 0;
  private lastClock = '';
  private hintKey = '';
  private lastCall = -999;
  private rushedTold = 0;
  private lastRushed = -999;

  constructor(readonly setup: MatchSetup, private settings: () => Settings) {
    const look = setup.looks;
    this.match = new Match({
      arena: ARENAS[setup.arena],
      chassis: [CHASSIS[look[0].chassis], CHASSIS[look[1].chassis], CHASSIS[look[2].chassis], CHASSIS[look[3].chassis]],
      human: 0,
      assist: setup.assist,
      regulationSeconds: setup.regulationSeconds,
    });
    this.world = this.match.world;
    this.looks = look;
    this.teamColors = [setup.home.primary, setup.away.primary];
    this.title = `${setup.home.name} v ${setup.away.name}`;
    this.leaveNote =
      setup.kind === 'quick'
        ? 'Leave this quick match? It will not count and earns no rewards.'
        : 'Leave this match? The fixture stays unplayed with no rewards, and you can start it again from the league hub.';
    this.bots = new BotDirector(
      this.world,
      [
        { robot: 1, difficulty: setup.mateDifficulty, style: setup.mateStyle },
        { robot: 2, difficulty: setup.oppDifficulty, style: setup.oppStyle },
        { robot: 3, difficulty: setup.oppDifficulty, style: setup.oppStyle },
      ],
      setup.seed,
    );

    const team = (t: TeamInfo, side: 'home' | 'away') => {
      const score = h('span', { class: 'score' }, '0');
      const el = h('div', { class: `team team-${side}${isLight(t.primary) ? ' is-light' : ''}`, style: `--team:${t.primary}` },
        h('span', { class: 'badge', html: badgeSvg(t.badge, t.primary, t.secondary) }),
        h('span', { class: 'tname' }, t.name),
        score,
      );
      return [el, score] as const;
    };
    const [homeEl, homeScore] = team(setup.home, 'home');
    const [awayEl, awayScore] = team(setup.away, 'away');
    this.elScore = [homeScore, awayScore];
    this.elClock = h('span', { class: 'time' }, fmtClock(setup.regulationSeconds));
    this.elPhase = h('small', { class: 'phase' }, setup.label);
    this.elBanner = h('div', { class: 'banner', 'aria-live': 'polite' });
    this.elCount = h('div', { class: 'countdown' });
    this.elToasts = h('div', { class: 'toasts' });
    this.elHint = h('div', { class: 'hint' });
    // Short team-coloured wipe as the match opens.
    const wipe = h('div', { class: 'match-wipe', style: `--home:${setup.home.primary};--away:${setup.away.primary}` }, h('b', null, `${setup.home.name}  v  ${setup.away.name}`));
    setTimeout(() => wipe.remove(), 1600);
    this.hud = h('div', { class: 'hud' },
      wipe,
      h('div', { class: 'scorebar' }, homeEl, h('div', { class: 'clock' }, this.elClock, this.elPhase), awayEl),
      this.elBanner,
      this.elCount,
      this.elToasts,
      this.elHint,
    );
  }

  inputLive(): boolean {
    return this.match.phase === 'play';
  }

  private toast(text: string, kind = ''): void {
    const el = h('div', { class: `toast ${kind}` }, text);
    this.elToasts.appendChild(el);
    while (this.elToasts.children.length > 3) this.elToasts.firstChild!.remove();
    setTimeout(() => el.remove(), 1900);
  }

  private banner(text: string, sub: string, cls: string, seconds: number, color?: string): void {
    this.elBanner.className = `banner show ${cls}`;
    this.elBanner.replaceChildren(h('strong', null, text), sub ? h('span', null, sub) : '');
    this.bannerT = seconds;
    if (color) {
      // Goal: team-coloured stripes sweep across the screen behind the letters, which pop in one by one.
      const letters = h('strong', { class: 'goal-letters' }, [...text].map((ch, i) => h('i', { style: `animation-delay:${i * 45}ms` }, ch === ' ' ? '\u00a0' : ch)));
      this.elBanner.replaceChildren(letters, sub ? h('span', null, sub) : '');
      this.elBanner.classList.add('goal');
      this.elBanner.style.setProperty('--team', color);
      const sweep = h('div', { class: 'goal-sweep', style: `--team:${color}` }, h('i'), h('i'), h('i'));
      this.hud.appendChild(sweep);
      setTimeout(() => sweep.remove(), 1600);
    }
  }

  tick(cmds: Command[]): void {
    const m = this.match;
    if (m.phase === 'play' && cmds[0].pass) {
      const me = this.world.robots[0];
      const b = this.world.ball;
      if (Math.hypot(b.x - me.x, b.z - me.z) > TUNING.kick.range + 0.4) {
        this.bots.requestPass(0);
        if (this.world.tick - this.lastCall > 60) {
          this.lastCall = this.world.tick;
          this.toast('Calling for the ball!');
        }
      }
    }
    if (m.phase === 'play') this.bots.update(cmds);
    m.step(cmds);
    if (m.phase === 'countdown' && this.prevPhase !== 'countdown') {
      this.bots.reset();
      this.teleported = true;
      if (!this.elBanner.classList.contains('neutral')) this.elBanner.className = 'banner';
    }
    this.prevPhase = m.phase;

    for (const e of this.world.events) {
      if (e.type === 'kick' && e.robot === 0 && e.rushed && this.rushedTold < 4 && this.world.tick - this.lastRushed > 240) {
        this.rushedTold++;
        this.lastRushed = this.world.tick;
        this.toast('Rushed shot! One press per kick is stronger', 'bad');
      }
    }
    for (const e of m.events) {
      switch (e.type) {
        case 'countdown':
          this.elCount.textContent = String(e.n);
          this.elCount.className = 'countdown show';
          audio.play('countdown');
          break;
        case 'go':
          this.elCount.textContent = 'GO!';
          this.elCount.className = 'countdown show go';
          setTimeout(() => (this.elCount.className = 'countdown'), 600);
          audio.play('go');
          break;
        case 'goal': {
          const rec = e.record;
          const ours = rec.team === 0;
          this.elScore[0].textContent = String(m.score[0]);
          this.elScore[1].textContent = String(m.score[1]);
          this.elScore[rec.team].classList.remove('bump');
          void this.elScore[rec.team].offsetWidth;
          this.elScore[rec.team].classList.add('bump');
          let sub = '';
          if (rec.ownGoalBy >= 0) sub = 'Own goal';
          else if (rec.scorer >= 0) {
            const who = rec.scorer === 0 ? 'You' : `#${String(this.looks[rec.scorer].number).padStart(2, '0')}`;
            sub = rec.scorer === 0 ? 'You scored!' : `${who} scores`;
            if (rec.assist >= 0) sub += rec.assist === 0 ? ' · your assist' : ` · assist #${String(this.looks[rec.assist].number).padStart(2, '0')}`;
          }
          this.banner(rec.swing && rec.ownGoalBy < 0 ? 'SWING GOAL!' : 'GOAL!', sub, ours ? 'ours' : 'theirs', TUNING.match.goalCelebration + 0.8, rec.team === 0 ? this.setup.home.primary : this.setup.away.primary);
          audio.play(ours ? 'goal' : 'concede');
          audio.cheer(ours ? 1 : 0.5);
          break;
        }
        case 'overtime':
          this.banner('OVERTIME', 'Next goal wins', 'neutral', 2.4);
          this.elPhase.textContent = 'Sudden death';
          audio.play('whistle');
          break;
        case 'final':
          this.banner('FULL TIME', `${m.score[0]} – ${m.score[1]}`, m.score[0] > m.score[1] ? 'ours' : 'theirs', 5);
          audio.play('whistle');
          audio.cheer(0.7);
          break;
        case 'save':
          if (e.robot === 0) {
            this.toast('SAVE!', 'good');
            audio.play('gate', { intensity: 0.7 });
          }
          audio.cheer(0.4);
          break;
        case 'pass':
          if (e.from === 0) this.toast('Pass completed');
          else if (e.to === 0) this.toast('Pass received', 'good');
          break;
        case 'intercept':
          if (e.robot === 0) this.toast('Interception', 'good');
          break;
        case 'shot':
          break;
      }
    }
    if (m.phase === 'ended') this.endHold += 1 / TUNING.sim.hz;
  }

  frame(dt: number, session: PlaySession): void {
    const m = this.match;
    const clock = m.overtime ? 'OT' : fmtClock(m.clock);
    if (clock !== this.lastClock) {
      this.lastClock = clock;
      this.elClock.textContent = clock;
      this.elClock.classList.toggle('late', !m.overtime && m.clock <= 10 && m.phase !== 'ended');
    }
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.elBanner.className = 'banner';
    }

    // One contextual hint at a time, retired once the action has been used a few times.
    let key = '';
    let text = '';
    const w = this.world;
    if (this.setup.hints && this.settings().showHints && m.phase === 'play') {
      const u = session.input.used;
      const k = this.settings().keys;
      const touch = session.input.touchSeen;
      if (u.move < 2) {
        key = 'move';
        text = touch ? 'Drag the left side of the screen to move' : `Move with ${keyLabel(k.up[0])} ${keyLabel(k.left[0])} ${keyLabel(k.down[0])} ${keyLabel(k.right[0])}. You attack the right-hand goal`;
      } else if (u.kick < 2) {
        key = 'kick';
        text = touch ? 'Tap KICK near the ball, or drag it to aim' : `Left click (or ${keyLabel(k.kick[0])}) near the ball to kick toward your aim`;
      } else if (u.pass < 1 && m.elapsed > 20) {
        key = 'pass';
        text = touch ? 'Tap PASS to pass to your teammate. Without the ball, PASS calls for it' : `Press ${keyLabel(k.pass[0])} to pass to your teammate. Without the ball, it calls for a pass`;
      } else if (u.tether < 3) {
        key = 'tether';
        text = touch
          ? 'Tap SWING: you swing from the glowing anchor and launch the way you are heading. Tap again to let go early'
          : `Tap right mouse (or ${keyLabel(k.tether[0])}): you swing from the glowing anchor and launch the way you are moving. Tap again to let go early`;
      }
    }
    if (key !== this.hintKey) {
      this.hintKey = key;
      this.elHint.textContent = text;
      this.elHint.classList.toggle('show', key !== '');
    }
  }

  moods(out: RobotMood[], expr: (Expression | null)[]): void {
    const m = this.match;
    for (let i = 0; i < 4; i++) {
      const team = i < 2 ? 0 : 1;
      expr[i] = null;
      if (m.phase === 'goal') out[i] = team === m.lastGoalTeam ? 'celebrate' : 'sad';
      else if (m.phase === 'ended') out[i] = m.winner === team ? 'celebrate' : 'sad';
      else if (m.phase === 'countdown') out[i] = 'idle';
      else out[i] = 'play';
    }
  }

  /** Slow motion for the first moments of a goal, as the ball hits the net. */
  timeScale(): number {
    const m = this.match;
    return m.phase === 'goal' && m.phaseTime > TUNING.match.goalCelebration - 0.45 ? 0.4 : 1;
  }

  done(): boolean {
    return this.match.phase === 'ended' && this.endHold >= TUNING.match.endHold;
  }

  crowdLevel(): number {
    return 0.5;
  }

  musicIntensity(): number {
    const m = this.match;
    const close = Math.abs(m.score[0] - m.score[1]) <= 1;
    return m.phase !== 'ended' && close && (m.overtime || m.clock < 45) ? 1 : 0;
  }

  debug(): string {
    return `mate: ${this.bots.debug(1)} | opp: ${this.bots.debug(2)} / ${this.bots.debug(3)} | phase ${this.match.phase}`;
  }

  result(): MatchResult {
    const m = this.match;
    return {
      matchId: this.setup.matchId,
      kind: this.setup.kind,
      fixtureId: this.setup.fixtureId,
      arena: this.setup.arena,
      opponent: this.setup.away.name,
      score: [m.score[0], m.score[1]],
      won: m.winner === 0,
      overtime: m.overtime,
      duration: m.elapsed,
      player: { ...m.stats[0] },
      mate: { ...m.stats[1] },
      goals: m.goals.map((g) => ({ ...g })),
    };
  }

  dispose(): void {}
}
