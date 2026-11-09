import { DT, TUNING } from '../../content/tuning';
import { Rng } from '../sim/rng';
import { attackDir, type Command, type Robot, type World } from '../sim/types';
import { predictBall } from '../sim/world';

/**
 * Bots drive robots through the same Command interface as a human. Difficulty changes reaction time,
 * aim error, anticipation and decision quality only: never speed, reach, tether range or cooldowns.
 */
export type DifficultyId = 'rookie' | 'club' | 'pro';

export interface Difficulty {
  id: DifficultyId;
  name: string;
  summary: string;
  reaction: [number, number];
  kickDelay: [number, number];
  /** Standard deviation of kick aim error in radians. */
  aimError: number;
  /** 0 = chases the ball's current position, 1 = runs to the predicted intercept. */
  anticipation: number;
  /** Chance per eligible decision to use a tether route. */
  tetherUse: number;
  passSkill: number;
  dribble: number;
  /** Chance per decision to hesitate briefly. */
  mistake: number;
}

export const DIFFICULTY: Record<DifficultyId, Difficulty> = {
  rookie: {
    id: 'rookie',
    name: 'Rookie',
    summary: 'Slow reactions, loose aim and simple runs. A forgiving first opponent.',
    reaction: [0.3, 0.45],
    kickDelay: [0.22, 0.45],
    aimError: 0.32,
    anticipation: 0.35,
    tetherUse: 0.1,
    passSkill: 0.3,
    dribble: 0.25,
    mistake: 0.1,
  },
  club: {
    id: 'club',
    name: 'Club',
    summary: 'Passes, predicts rebounds and swings back to defend.',
    reaction: [0.18, 0.3],
    kickDelay: [0.12, 0.26],
    aimError: 0.15,
    anticipation: 0.75,
    tetherUse: 0.45,
    passSkill: 0.6,
    dribble: 0.5,
    mistake: 0.03,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    summary: 'Sharp coverage, accurate finishing and deliberate swing attacks.',
    reaction: [0.1, 0.2],
    kickDelay: [0.06, 0.14],
    aimError: 0.07,
    anticipation: 1,
    tetherUse: 0.85,
    passSkill: 0.8,
    dribble: 0.6,
    mistake: 0,
  },
};

export const DIFFICULTY_ORDER: DifficultyId[] = ['rookie', 'club', 'pro'];

/** Positional preferences. These shift where a bot likes to be; they do not change its competence. */
export interface BotStyle {
  /** How far ahead of the ball the support robot waits in attack (negative = behind). */
  lead: number;
  /** Lateral offset of support runs. */
  width: number;
  /** Guard position while defending, as a fraction of the goal-to-ball distance. */
  guard: number;
  /** Multiplier on pass preference. */
  pass: number;
  shootRange: number;
  /** Drops back to cover when the partner attacks deep. */
  cover: boolean;
}

export type TendencyId = 'supportive' | 'aggressive' | 'defensive';
export type ClubStyleId = 'pressure' | 'passing' | 'wide' | 'counter' | 'balanced';

export const TENDENCY: Record<TendencyId, { name: string; summary: string; style: BotStyle }> = {
  supportive: {
    name: 'Supportive',
    summary: 'Stays available for a pass and covers behind you when you attack.',
    style: { lead: 2.5, width: 5.5, guard: 0.4, pass: 1.3, shootRange: 11.5, cover: true },
  },
  aggressive: {
    name: 'Aggressive',
    summary: 'Makes forward runs toward goal whenever the back is covered.',
    style: { lead: 7, width: 4.5, guard: 0.5, pass: 0.9, shootRange: 13, cover: false },
  },
  defensive: {
    name: 'Defensive',
    summary: 'Holds a deeper position and looks for interceptions.',
    style: { lead: -4, width: 3.5, guard: 0.33, pass: 1.1, shootRange: 11, cover: true },
  },
};

export const CLUB_STYLE: Record<ClubStyleId, BotStyle> = {
  pressure: { lead: 5.5, width: 4, guard: 0.46, pass: 0.8, shootRange: 13.5, cover: false },
  passing: { lead: 5, width: 6.5, guard: 0.4, pass: 1.5, shootRange: 11, cover: true },
  wide: { lead: 4, width: 7.5, guard: 0.4, pass: 1.2, shootRange: 12, cover: true },
  counter: { lead: 1, width: 5, guard: 0.34, pass: 1, shootRange: 12.5, cover: true },
  balanced: { lead: 4, width: 5.5, guard: 0.4, pass: 1, shootRange: 12, cover: true },
};

interface KickPlan {
  kind: 'shoot' | 'pass' | 'clear' | 'push' | 'dribble';
  ax: number;
  az: number;
  power: number;
}

interface BotState {
  id: number;
  diff: Difficulty;
  style: BotStyle;
  role: 'challenger' | 'support';
  thinkIn: number;
  tx: number;
  tz: number;
  arrive: boolean;
  kick: KickPlan | null;
  kickWait: number;
  redecide: number;
  tether: { anchor: number; dir: 1 | -1; age: number } | null;
  hesitate: number;
  stuckT: number;
  sx: number;
  sz: number;
  stuckCount: number;
  unstuck: number;
  ux: number;
  uz: number;
}

const PRED_STEPS = 26;
const PRED_DT = 0.1;
const R = TUNING.robot.radius;

export interface BotSpec {
  robot: number;
  difficulty: Difficulty;
  style: BotStyle;
}

export class BotDirector {
  private w: World;
  private rng: Rng;
  private bots: BotState[] = [];
  private byId: (BotState | null)[] = [];
  private pred = new Float32Array(PRED_STEPS * 2);
  private predTick = -999;
  private eta: number[] = [];
  private ix: number[] = [];
  private iz: number[] = [];
  private challenger: [number, number] = [-1, -1];
  private roleTick = -999;

  constructor(world: World, specs: BotSpec[], seed: number) {
    this.w = world;
    this.rng = new Rng(seed);
    for (const r of world.robots) {
      this.byId[r.id] = null;
      this.eta[r.id] = 9;
      this.ix[r.id] = 0;
      this.iz[r.id] = 0;
    }
    for (const s of specs) {
      const st: BotState = {
        id: s.robot,
        diff: s.difficulty,
        style: s.style,
        role: 'support',
        thinkIn: this.rng.range(0, 0.15),
        tx: world.robots[s.robot].x,
        tz: world.robots[s.robot].z,
        arrive: true,
        kick: null,
        kickWait: 0,
        redecide: 0,
        tether: null,
        hesitate: 0,
        stuckT: 0,
        sx: 0,
        sz: 0,
        stuckCount: 0,
        unstuck: 0,
        ux: 0,
        uz: 0,
      };
      this.bots.push(st);
      this.byId[s.robot] = st;
    }
  }

  /** Human-readable role for the debug overlay. */
  debug(robot: number): string {
    const b = this.byId[robot];
    if (!b) return 'human';
    return `${b.role}${b.tether ? ' +tether' : ''}${b.kick ? ' ' + b.kick.kind : ''}`;
  }

  /** Forget plans after a kickoff reset. */
  reset(): void {
    for (const b of this.bots) {
      const r = this.w.robots[b.id];
      b.kick = null;
      b.tether = null;
      b.thinkIn = this.rng.range(0.02, 0.2);
      b.tx = r.x;
      b.tz = r.z;
      b.unstuck = 0;
      b.stuckCount = 0;
      b.hesitate = 0;
    }
    this.roleTick = -999;
    this.predTick = -999;
  }

  update(cmds: Command[]): void {
    const w = this.w;
    if (w.tick - this.predTick >= 6) {
      predictBall(w, this.pred, PRED_STEPS, PRED_DT);
      this.predTick = w.tick;
      for (const r of w.robots) this.computeIntercept(r);
    }
    if (w.tick - this.roleTick >= 12) {
      this.assignRoles();
      this.roleTick = w.tick;
    }
    for (const b of this.bots) this.act(b, cmds[b.id]);
  }

  private computeIntercept(r: Robot): void {
    const p = this.pred;
    const speed = TUNING.robot.maxRunSpeed * 0.95;
    const cur = Math.hypot(r.vx, r.vz);
    for (let i = 0; i < PRED_STEPS; i++) {
      const t = (i + 1) * PRED_DT;
      const d = Math.hypot(p[i * 2] - r.x, p[i * 2 + 1] - r.z) - 0.75;
      // Robots already carrying swing speed cover a little more ground.
      if (d <= speed * t + Math.max(0, cur - speed) * Math.min(t, 0.8) * 0.6) {
        this.eta[r.id] = t;
        this.ix[r.id] = p[i * 2];
        this.iz[r.id] = p[i * 2 + 1];
        return;
      }
    }
    const lx = p[(PRED_STEPS - 1) * 2];
    const lz = p[(PRED_STEPS - 1) * 2 + 1];
    this.eta[r.id] = PRED_STEPS * PRED_DT + Math.hypot(lx - r.x, lz - r.z) / speed;
    this.ix[r.id] = lx;
    this.iz[r.id] = lz;
  }

  private assignRoles(): void {
    const w = this.w;
    for (let team = 0 as 0 | 1; team <= 1; team++) {
      const members = w.robots.filter((r) => r.team === team);
      if (members.length === 1) {
        this.challenger[team] = members[0].id;
        continue;
      }
      const [a, b] = members;
      const cur = this.challenger[team];
      let ea = this.eta[a.id];
      let eb = this.eta[b.id];
      // Humans decide for themselves: the bot yields unless it is clearly better placed.
      if (a.human) ea -= 0.3;
      if (b.human) eb -= 0.3;
      if (cur === a.id) ea -= 0.3;
      if (cur === b.id) eb -= 0.3;
      let pick = ea <= eb ? a.id : b.id;
      const human = a.human ? a : b.human ? b : null;
      if (human) {
        const bot = human === a ? b : a;
        // When the ball threatens our goal and the bot is closer, it must go regardless.
        const gx = -attackDir(team as 0 | 1) * w.hx;
        const danger = Math.hypot(w.ball.x - gx, w.ball.z) < 8;
        if (danger && this.eta[bot.id] < this.eta[human.id]) pick = bot.id;
      }
      this.challenger[team] = pick;
    }
    for (const b of this.bots) {
      const team = w.robots[b.id].team;
      b.role = this.challenger[team] === b.id ? 'challenger' : 'support';
    }
  }

  private mate(r: Robot): Robot | null {
    for (const o of this.w.robots) if (o.team === r.team && o.id !== r.id) return o;
    return null;
  }

  /** Smallest distance from any opponent to the segment a->b (only opponents alongside the segment count). */
  private laneClearance(team: 0 | 1, ax: number, az: number, bx: number, bz: number): number {
    let best = 99;
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz || 1;
    for (const o of this.w.robots) {
      if (o.team === team) continue;
      const t = ((o.x - ax) * dx + (o.z - az) * dz) / len2;
      if (t < 0.05 || t > 1) continue;
      const d = Math.hypot(ax + dx * t - o.x, az + dz * t - o.z);
      if (d < best) best = d;
    }
    return best;
  }

  private think(b: BotState): void {
    const w = this.w;
    const r = w.robots[b.id];
    const ball = w.ball;
    const att = attackDir(r.team);
    const rng = this.rng;
    b.thinkIn = rng.range(b.diff.reaction[0], b.diff.reaction[1]);
    if (b.diff.mistake > 0 && rng.chance(b.diff.mistake)) b.hesitate = rng.range(0.15, 0.4);

    const goalX = att * w.hx;
    const ownX = -goalX;
    const mate = this.mate(r);
    const a = b.diff.anticipation;
    const px = ball.x + (this.ix[r.id] - ball.x) * a;
    const pz = ball.z + (this.iz[r.id] - ball.z) * a;

    let minOppEta = 9;
    for (const o of w.robots) if (o.team !== r.team) minOppEta = Math.min(minOppEta, this.eta[o.id]);
    const ourEta = Math.min(this.eta[r.id], mate ? this.eta[mate.id] : 9);
    const control = ourEta < minOppEta - 0.2;
    const attacking = ball.x * att > -2 || control;
    // The support robot only leaves its guard position when the team clearly reaches the ball first.
    const supportUp = control && ball.x * att > -w.hx * 0.35;

    if (b.role === 'challenger' || this.eta[r.id] < 0.45) {
      // Arrive slightly behind the ball relative to the direction we want to send it.
      let gx = goalX - px;
      let gz = -pz * 0.6;
      const gl = Math.hypot(gx, gz) || 1;
      gx /= gl;
      gz /= gl;
      const behind = (px - r.x) * gx + (pz - r.z) * gz;
      const dist = Math.hypot(px - r.x, pz - r.z);
      if (attacking && dist > 1.4) {
        if (behind > -0.3 * dist) {
          b.tx = px - gx * 0.55;
          b.tz = pz - gz * 0.55;
        } else {
          // We are ahead of the ball: curl around it instead of knocking it backwards.
          const side = (pz - r.z) * gx - (px - r.x) * gz > 0 ? 1 : -1;
          b.tx = px - gx * 0.9 - gz * side * 0.9;
          b.tz = pz - gz * 0.9 + gx * side * 0.9;
        }
      } else if (!attacking) {
        // Defending: get goal-side of the ball.
        const ox = ownX - px;
        const oz = -pz;
        const ol = Math.hypot(ox, oz) || 1;
        b.tx = px + (ox / ol) * 0.35;
        b.tz = pz + (oz / ol) * 0.35;
      } else {
        b.tx = px;
        b.tz = pz;
      }
      b.arrive = false;
    } else {
      const st = b.style;
      if (supportUp) {
        let lead = st.lead;
        const mateDeep = mate ? mate.x * att > w.hx * 0.4 : false;
        if (st.cover && mateDeep) lead = Math.min(lead, -3.5);
        let side = Math.abs(ball.z) > 1.5 ? -Math.sign(ball.z) : Math.sign(r.z) || 1;
        // Do not stand in the challenger's shooting lane.
        if (mate && Math.abs(mate.z - side * st.width) < 2 && Math.abs(ball.z) <= 1.5) side = -side;
        b.tx = Math.max(-w.hx + 4, Math.min(w.hx - 3.5, ball.x + att * lead));
        b.tz = Math.max(-w.hz + 2, Math.min(w.hz - 2, side * st.width));
        if (st.cover && mateDeep) b.tz *= 0.4;
      } else {
        // Guard the line between the ball and our goal, coming out further as the ball is further away.
        const bx = this.pred[4 * 2];
        const bz = this.pred[4 * 2 + 1];
        const dx = bx - ownX;
        const dz = bz;
        const d = Math.hypot(dx, dz) || 1;
        const out = Math.max(2.2, Math.min(7, d * st.guard));
        b.tx = ownX + (dx / d) * out;
        b.tz = (dz / d) * out;
        // A goal-bound ball: step onto its path.
        for (let i = 0; i < PRED_STEPS; i++) {
          const qx = this.pred[i * 2];
          const qz = this.pred[i * 2 + 1];
          if ((qx - ownX) * att < 1.2 && Math.abs(qz) < w.arena.goalWidth / 2 + 0.6) {
            const k = Math.max(0, i - 2);
            b.tx = this.pred[k * 2];
            b.tz = this.pred[k * 2 + 1];
            break;
          }
        }
      }
      b.arrive = true;
    }
    b.tx = Math.max(-w.hx + R, Math.min(w.hx - R, b.tx));
    b.tz = Math.max(-w.hz + R, Math.min(w.hz - R, b.tz));

    // Tether route: only when it is meaningfully faster than running.
    if (!b.tether && r.tState === 'ready' && rng.chance(b.diff.tetherUse)) {
      const dist = Math.hypot(b.tx - r.x, b.tz - r.z);
      const ballNear = Math.hypot(ball.x - r.x, ball.z - r.z) < 3;
      if (dist > 7 && !ballNear) this.planTether(b, r);
    }
  }

  private planTether(b: BotState, r: Robot): void {
    const w = this.w;
    const T = TUNING.tether;
    const run = TUNING.robot.maxRunSpeed;
    const tx = b.tx;
    const tz = b.tz;
    const runTime = Math.hypot(tx - r.x, tz - r.z) / run;
    let bestTime = runTime * 0.82;
    let best = -1;
    let bestDir: 1 | -1 = 1;
    const anchors = w.arena.anchors;
    for (let i = 0; i < anchors.length; i++) {
      const c = anchors[i];
      const rr = Math.hypot(r.x - c.x, r.z - c.z);
      if (rr < 3.2 || rr > T.acquisitionRange - 0.3) continue;
      const dT = Math.hypot(tx - c.x, tz - c.z);
      if (dT <= rr * 1.08) continue;
      const phiT = Math.atan2(tz - c.z, tx - c.x);
      const alpha = Math.acos(rr / dT);
      const th0 = Math.atan2(r.z - c.z, r.x - c.x);
      const nx = (r.x - c.x) / rr;
      const nz = (r.z - c.z) / rr;
      const vt = r.vx * -nz + r.vz * nx;
      for (let s = -1; s <= 1; s += 2) {
        if (vt * s < -0.8) continue;
        const thr = phiT - s * alpha;
        let arc = s * (thr - th0);
        while (arc < 0) arc += Math.PI * 2;
        while (arc >= Math.PI * 2) arc -= Math.PI * 2;
        if (arc < 0.3 || arc > 2.3) continue;
        const swingTime = (arc * rr) / 8;
        if (swingTime > T.maxHoldSeconds - 0.15) continue;
        // The arc must stay on the field.
        let ok = true;
        for (let k = 1; k <= 3; k++) {
          const th = th0 + s * arc * (k / 3);
          const qx = c.x + Math.cos(th) * rr;
          const qz = c.z + Math.sin(th) * rr;
          if (Math.abs(qx) > w.hx - R - 0.1 || Math.abs(qz) > w.hz - R - 0.1) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        const rem = Math.sqrt(Math.max(0, dT * dT - rr * rr));
        const remTime = rem <= 9 ? rem / 8.5 : 9 / 8.5 + (rem - 9) / run;
        const total = swingTime + remTime;
        if (total < bestTime) {
          bestTime = total;
          best = i;
          bestDir = s as 1 | -1;
        }
      }
    }
    if (best >= 0) b.tether = { anchor: best, dir: bestDir, age: 0 };
  }

  private decideKick(b: BotState): KickPlan {
    const w = this.w;
    const r = w.robots[b.id];
    const ball = w.ball;
    const att = attackDir(r.team);
    const rng = this.rng;
    const goalX = att * w.hx;
    const ownX = -goalX;
    const gh = w.arena.goalWidth / 2;
    const mate = this.mate(r);
    const K = TUNING.kick;

    let pressure = 99;
    let nearest: Robot | null = null;
    for (const o of w.robots) {
      if (o.team === r.team) continue;
      const d = Math.hypot(o.x - ball.x, o.z - ball.z);
      if (d < pressure) {
        pressure = d;
        nearest = o;
      }
    }
    const err = () => rng.gauss() * b.diff.aimError;
    const aimAt = (x: number, z: number, e: number): [number, number] => {
      const ang = Math.atan2(z - ball.z, x - ball.x) + e;
      const d = Math.max(4, Math.hypot(x - ball.x, z - ball.z));
      return [ball.x + Math.cos(ang) * d, ball.z + Math.sin(ang) * d];
    };

    const dGoal = Math.hypot(goalX - ball.x, ball.z);
    const inFront = (goalX - ball.x) * att > 0.8;
    if (inFront && dGoal < b.style.shootRange) {
      let bestZ = 0;
      let bestClear = -1;
      for (const z of [0, -(gh - 0.8), gh - 0.8]) {
        const c = this.laneClearance(r.team, ball.x, ball.z, goalX, z) + (z === 0 ? -0.15 : 0);
        if (c > bestClear) {
          bestClear = c;
          bestZ = z;
        }
      }
      if (bestClear > 0.8 || dGoal < 5.5) {
        const [ax, az] = aimAt(goalX, bestZ, err());
        return { kind: 'shoot', ax, az, power: 1 };
      }
    }

    if (mate && rng.chance(Math.min(0.95, b.diff.passSkill * b.style.pass))) {
      const md = Math.hypot(mate.x - ball.x, mate.z - ball.z);
      const ahead = (mate.x - ball.x) * att;
      let mateOpen = 99;
      for (const o of w.robots) if (o.team !== r.team) mateOpen = Math.min(mateOpen, Math.hypot(o.x - mate.x, o.z - mate.z));
      const lead = Math.min(0.7, md / 13);
      const lx = mate.x + mate.vx * lead;
      const lz = mate.z + mate.vz * lead;
      const lane = this.laneClearance(r.team, ball.x, ball.z, lx, lz);
      const mateNearOwnGoal = (mate.x - ownX) * att < 5;
      if (md > 3.5 && md < 17 && lane > 1.1 && mateOpen > 2 && !mateNearOwnGoal && (ahead > 1.5 || (pressure < 2.4 && ahead > -4))) {
        const [ax, az] = aimAt(lx, lz, err() * 0.7);
        const natural = Math.min(K.speedCap, K.baseSpeed + K.forwardVelocityFactor * Math.max(0, r.vx * (ax - ball.x) + r.vz * (az - ball.z)) / Math.max(1, Math.hypot(ax - ball.x, az - ball.z)));
        const want = K.passBase + K.passPerUnit * md + 0.8;
        return { kind: 'pass', ax, az, power: Math.max(0.45, Math.min(1, want / natural)) };
      }
    }

    const ownDist = (ball.x - ownX) * att;
    if (ownDist < 9) {
      let side = Math.abs(ball.z) > 1 ? Math.sign(ball.z) : rng.chance(0.5) ? 1 : -1;
      if (nearest && Math.sign(nearest.z - ball.z) === side && Math.abs(nearest.z - ball.z) < 3) side = -side;
      const [ax, az] = aimAt(ball.x + att * 9, side * (w.hz - 1.5), err());
      return { kind: 'clear', ax, az, power: 1 };
    }

    if (pressure < 2.5) {
      let z = ball.z * 0.4;
      if (nearest) z += Math.sign(ball.z - nearest.z || 1) * 2.5;
      const [ax, az] = aimAt(ball.x + att * 8, z, err());
      return { kind: 'push', ax, az, power: 0.75 };
    }

    if (rng.chance(b.diff.dribble)) return { kind: 'dribble', ax: goalX, az: 0, power: 1 };
    const [ax, az] = aimAt(goalX, ball.z * 0.3, err());
    return { kind: 'push', ax, az, power: 0.8 };
  }

  private act(b: BotState, c: Command): void {
    const w = this.w;
    const r = w.robots[b.id];
    const ball = w.ball;
    c.tether = false;
    c.kick = false;
    c.power = 1;
    c.anchor = -1;
    c.mx = 0;
    c.mz = 0;
    c.ax = ball.x;
    c.az = ball.z;

    b.thinkIn -= DT;
    if (b.thinkIn <= 0) this.think(b);

    const ballDist = Math.hypot(ball.x - r.x, ball.z - r.z);
    let tx = b.tx;
    let tz = b.tz;

    // Close to the ball the challenger tracks it continuously (within its reaction-limited plan).
    if (b.role === 'challenger' && ballDist < 2.2 && !(b.kick && b.kick.kind === 'dribble')) {
      tx = ball.x + ball.vx * 0.08;
      tz = ball.z + ball.vz * 0.08;
    }

    // --- unstuck ---
    b.stuckT += DT;
    if (b.stuckT > 0.5) {
      const moved = Math.hypot(r.x - b.sx, r.z - b.sz);
      const wants = Math.hypot(tx - r.x, tz - r.z) > 1.2;
      b.stuckCount = moved < 0.2 && wants ? b.stuckCount + 1 : 0;
      b.sx = r.x;
      b.sz = r.z;
      b.stuckT = 0;
      if (b.stuckCount >= 2) {
        const ang = this.rng.range(0, Math.PI * 2);
        b.ux = Math.max(-w.hx + 1, Math.min(w.hx - 1, r.x + Math.cos(ang) * 2.5));
        b.uz = Math.max(-w.hz + 1, Math.min(w.hz - 1, r.z + Math.sin(ang) * 2.5));
        b.unstuck = 0.55;
        b.stuckCount = 0;
        b.tether = null;
      }
    }
    if (b.unstuck > 0) {
      b.unstuck -= DT;
      tx = b.ux;
      tz = b.uz;
    }

    if (b.hesitate > 0) {
      b.hesitate -= DT;
    } else if (b.tether && (r.tState === 'attached' || r.tState === 'ready')) {
      const plan = b.tether;
      plan.age += DT;
      const a = w.arena.anchors[plan.anchor];
      const dx = r.x - a.x;
      const dz = r.z - a.z;
      const d = Math.hypot(dx, dz) || 1;
      c.mx = (-dz / d) * plan.dir;
      c.mz = (dx / d) * plan.dir;
      c.anchor = plan.anchor;
      c.tether = true;
      if (r.tState === 'attached') {
        const sp = Math.hypot(r.vx, r.vz);
        const gx = tx - r.x;
        const gz = tz - r.z;
        const gl = Math.hypot(gx, gz);
        if (sp > 1 && gl > 0.5) {
          const cos = (r.vx * gx + r.vz * gz) / (sp * gl);
          const cross = (r.vx * gz - r.vz * gx) * plan.dir;
          // Release when the velocity points at the target, or has just swung past it.
          if (cos > 0.992 || (cos > 0.6 && cross < 0) || gl < 2 || ballDist < 1.3) {
            c.tether = false;
            b.tether = null;
          }
        }
        if (r.tTime > TUNING.tether.maxHoldSeconds - 0.08) b.tether = null;
      } else if (plan.age > 0.15) {
        b.tether = null;
        c.tether = false;
      }
    } else {
      if (b.tether) b.tether = null;
      const dx = tx - r.x;
      const dz = tz - r.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.12) {
        const k = b.arrive ? Math.min(1, d / 0.9) : 1;
        c.mx = (dx / d) * k;
        c.mz = (dz / d) * k;
      }
    }

    // --- kicking ---
    if (ballDist <= TUNING.kick.range - 0.06 && !w.goalLatch) {
      if (!b.kick) {
        b.kick = this.decideKick(b);
        b.kickWait = this.rng.range(b.diff.kickDelay[0], b.diff.kickDelay[1]);
        b.redecide = 0.3;
      }
      const k = b.kick;
      if (k.kind === 'dribble') {
        // Run through the ball toward goal; reconsider regularly.
        const att = attackDir(r.team);
        let gx = att * w.hx - ball.x;
        let gz = -ball.z;
        const gl = Math.hypot(gx, gz) || 1;
        gx /= gl;
        gz /= gl;
        const behind = (ball.x - r.x) * gx + (ball.z - r.z) * gz;
        if (b.unstuck <= 0 && b.hesitate <= 0 && !b.tether) {
          const mx = behind > 0.1 ? ball.x + gx * 1.5 - r.x : ball.x - gx * 0.9 - r.x;
          const mz = behind > 0.1 ? ball.z + gz * 1.5 - r.z : ball.z - gz * 0.9 - r.z;
          const ml = Math.hypot(mx, mz) || 1;
          c.mx = mx / ml;
          c.mz = mz / ml;
        }
        b.redecide -= DT;
        if (b.redecide <= 0) {
          b.kick = this.decideKick(b);
          b.redecide = 0.3;
          b.kickWait = 0.05;
        }
      } else {
        c.ax = k.ax;
        c.az = k.az;
        b.kickWait -= DT;
        if (b.kickWait <= 0 && r.kickCd <= 0 && b.hesitate <= 0) {
          c.kick = true;
          c.power = k.power;
          b.kick = null;
        }
      }
    } else if (ballDist > TUNING.kick.range + 0.4) {
      b.kick = null;
    }
  }
}

/** Blends the declared tiers: level 0 = Rookie, 1 = Club, 2 = Pro. Used for career divisions. */
export function difficultyAt(level: number): Difficulty {
  const l = Math.max(0, Math.min(2, level));
  const a = l <= 1 ? DIFFICULTY.rookie : DIFFICULTY.club;
  const b = l <= 1 ? DIFFICULTY.club : DIFFICULTY.pro;
  const t = l <= 1 ? l : l - 1;
  const mix = (x: number, y: number) => x + (y - x) * t;
  const near = t < 0.5 ? a : b;
  return {
    id: near.id,
    name: t < 0.3 ? a.name : t > 0.8 ? b.name : `${a.name}+`,
    summary: near.summary,
    reaction: [mix(a.reaction[0], b.reaction[0]), mix(a.reaction[1], b.reaction[1])],
    kickDelay: [mix(a.kickDelay[0], b.kickDelay[0]), mix(a.kickDelay[1], b.kickDelay[1])],
    aimError: mix(a.aimError, b.aimError),
    anticipation: mix(a.anticipation, b.anticipation),
    tetherUse: mix(a.tetherUse, b.tetherUse),
    passSkill: mix(a.passSkill, b.passSkill),
    dribble: mix(a.dribble, b.dribble),
    mistake: mix(a.mistake, b.mistake),
  };
}
