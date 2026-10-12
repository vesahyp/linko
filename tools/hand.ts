import type { SimState, SimInput } from '../src/game/state';
import { W, H } from '../src/game/state';
import { gravity, NO_RETURN } from '../src/game/physics';
import { thrustOf, topSpeedOf, pickUpgrade } from '../src/game/sim';
import type { UpgradeId } from '../src/game/content';
import { DRAG_MIN, moveFromOffset, STICK_RADIUS } from '../src/input/stick';
import { Rng } from '../src/game/rng';

/**
 * The hand: a player with a thumb's limits, never the perfect bot. It looks
 * every reaction time (about a quarter second), sees only the shots near
 * the ship and misses some of those, and moves its thumb at a thumb's speed,
 * so what it decides arrives late and a little off. It knows the planet
 * pulls, the way a player who has died to it does: it tries a handful of
 * stick positions a moment ahead and keeps the one that looks safest, with
 * some noise in the judging.
 *
 * Its output is two thumbs and a tap, in css px from where each thumb
 * landed: the same thing a person does with the screen. `toInput` runs that
 * through the touch input's own stick arithmetic for the headless checks;
 * the playthrough (scripts/playthrough.mjs) turns it into real touches on
 * an emulated iPhone.
 */
export interface Thumbs {
  /** left thumb offset from its landing point, css px; null when lifted */
  move: { x: number; y: number } | null;
  /** right thumb: down, and its offset from its landing point */
  right: { x: number; y: number } | null;
  /** a tap on the pod button this tick */
  podTap: boolean;
}

export interface HandProfile {
  /** seconds between looks */
  look: [number, number];
  /** thumb speed, css px per second */
  thumbSpeed: number;
  /** how far from the ship it notices shots */
  sight: number;
  /** chance to miss a given shot in a look */
  miss: number;
  /** noise added to each candidate's danger, relative */
  judge: number;
  /** aim error when it drags to aim, radians */
  aimErr: number;
  /** how many shots it can track at once: the nearest ones */
  attention: number;
}

export const HUMAN: HandProfile = { look: [0.22, 0.36], thumbSpeed: 600, sight: 220, miss: 0.25, judge: 0.4, aimErr: 0.16, attention: 6 };

/** What a player takes when the cards come, most wanted first, with a little whim. */
const WANT: UpgradeId[] = ['spread', 'wave', 'armor', 'rapid', 'bits', 'missiles', 'engine', 'heavy', 'podgun'];

export class Hand {
  private rng: Rng;
  private nextLook = 0;
  private wantMove: { x: number; y: number } | null = null;
  private move: { x: number; y: number } | null = null;
  private right: { x: number; y: number } | null = null;
  private rightWant: { x: number; y: number } | null = null;
  private chargeUntil = 0;
  private restUntil = 0;
  private podAt = 0;
  private podOutUntil = 0;
  private lastT = 0;
  private wasDown = false;
  private aimedThisHold = false;

  constructor(seed: number, readonly p: HandProfile = HUMAN) {
    this.rng = new Rng(seed ^ 0x5eed);
  }

  /** One tick of the hand at sim time `s.time`. Call at any rate; it keeps its own clock. */
  tick(s: SimState): Thumbs {
    const now = s.time;
    const dt = Math.min(0.1, Math.max(0, now - this.lastT));
    this.lastT = now;
    let podTap = false;
    if (s.phase !== 'fight' || s.ship.dead) {
      this.move = null;
      this.wantMove = null;
      this.right = null;
      this.rightWant = null;
      return { move: null, right: null, podTap: false };
    }
    if (now >= this.nextLook) {
      this.nextLook = now + this.rng.range(this.p.look[0], this.p.look[1]);
      this.wantMove = this.chooseMove(s);
      // the right thumb: hold to charge, sometimes drag at a target, let go
      if (!this.right && now >= this.restUntil && s.enemies.length) {
        this.right = { x: 0, y: 0 };
        this.rightWant = { x: 0, y: 0 };
        this.chargeUntil = now + this.rng.range(0.45, 1.4);
        this.aimedThisHold = this.rng.chance(0.4);
      } else if (this.right && now >= this.chargeUntil) {
        this.right = null;
        this.rightWant = null;
        this.restUntil = now + this.rng.range(0.1, 0.45);
      }
      if (this.right && this.aimedThisHold) {
        // drag at the biggest thing near, in a straight line: a thumb does not do orbital sums
        const t = this.target(s);
        if (t) {
          const a = Math.atan2(t.y - s.ship.y, t.x - s.ship.x) + this.rng.range(-this.p.aimErr, this.p.aimErr);
          this.rightWant = { x: Math.cos(a) * 45, y: Math.sin(a) * 45 };
        }
      }
      // the pod: out at a crowd, back after a while
      const n = s.enemies.length;
      if (!this.right && now > this.podAt) {
        if (s.pod.mode === 'docked' && n >= 5 && this.rng.chance(0.35)) {
          podTap = true;
          this.podOutUntil = now + this.rng.range(3, 7);
          this.podAt = now + 1;
        } else if (s.pod.mode === 'out' && (now > this.podOutUntil || n <= 2)) {
          podTap = true;
          this.podAt = now + 2;
        }
      }
    }
    this.move = this.follow(this.move, this.wantMove, dt);
    this.right = this.right ? this.follow(this.right, this.rightWant, dt) : null;
    return { move: this.move, right: this.right, podTap };
  }

  /** The thumb moves toward where the hand wants it, at a thumb's speed. */
  private follow(cur: { x: number; y: number } | null, want: { x: number; y: number } | null, dt: number) {
    if (!want) return null;
    if (!cur) return { x: want.x * 0.3, y: want.y * 0.3 };
    const dx = want.x - cur.x;
    const dy = want.y - cur.y;
    const d = Math.hypot(dx, dy);
    const stepLen = this.p.thumbSpeed * dt;
    if (d <= stepLen) return { ...want };
    return { x: cur.x + (dx / d) * stepLen, y: cur.y + (dy / d) * stepLen };
  }

  private target(s: SimState) {
    let best = null;
    let bd = Infinity;
    for (const e of s.enemies) {
      const d = Math.hypot(e.x - s.ship.x, e.y - s.ship.y) - e.r * 4;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  /** Try stick positions a moment ahead; keep the one that looks safest. */
  private chooseMove(s: SimState): { x: number; y: number } | null {
    const sh = s.ship;
    const p = s.planet;
    const horizon = 0.8;
    const stepT = 0.1;
    const n = Math.round(horizon / stepT);
    // the shots it sees, flown forward under the pull
    const seen: number[][] = [];
    const near = s.bullets
      .filter((b) => b.team === 'enemy' && Math.hypot(b.x - sh.x, b.y - sh.y) <= this.p.sight)
      .sort((a, b) => Math.hypot(a.x - sh.x, a.y - sh.y) - Math.hypot(b.x - sh.x, b.y - sh.y))
      .slice(0, this.p.attention);
    for (const b of near) {
      if (this.rng.chance(this.p.miss)) continue;
      const path: number[] = [];
      let x = b.x;
      let y = b.y;
      let vx = b.vx;
      let vy = b.vy;
      for (let i = 0; i < n; i++) {
        for (let k = 0; k < 3; k++) {
          const g = gravity(p, x, y);
          vx += (g.ax * stepT) / 3;
          vy += (g.ay * stepT) / 3;
          x += (vx * stepT) / 3;
          y += (vy * stepT) / 3;
        }
        path.push(x, y, b.r);
      }
      seen.push(path);
    }
    const cands: ({ x: number; y: number } | null)[] = [null];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      cands.push({ x: Math.cos(a), y: Math.sin(a) });
      if (i % 2 === 0) cands.push({ x: Math.cos(a) * 0.45, y: Math.sin(a) * 0.45 });
    }
    const thrust = thrustOf(s);
    const top = topSpeedOf(s);
    let best: { x: number; y: number } | null = null;
    let bestCost = Infinity;
    for (const c of cands) {
      let x = sh.x;
      let y = sh.y;
      let vx = sh.vx;
      let vy = sh.vy;
      let cost = 0;
      for (let i = 0; i < n; i++) {
        for (let k = 0; k < 3; k++) {
          const h = stepT / 3;
          const g = gravity(p, x, y);
          let ax = g.ax;
          let ay = g.ay;
          if (c) {
            const m = Math.hypot(c.x, c.y);
            const dvx = c.x * top - vx;
            const dvy = c.y * top - vy;
            const dv = Math.hypot(dvx, dvy) || 1;
            const want = Math.min(thrust, dv * 5) * Math.min(1, m / 0.3);
            ax += (dvx / dv) * want;
            ay += (dvy / dv) * want;
          }
          vx += ax * h;
          vy += ay * h;
          x += vx * h;
          y += vy * h;
        }
        const w = 1 - i / (n + 2);
        for (const path of seen) {
          const d = Math.hypot(path[i * 3] - x, path[i * 3 + 1] - y) - path[i * 3 + 2] - 8;
          if (d < 26) cost += w * (26 - d) * 4;
        }
        for (const e of s.enemies) {
          const ex = e.x + e.vx * stepT * (i + 1);
          const ey = e.y + e.vy * stepT * (i + 1);
          const d = Math.hypot(ex - x, ey - y) - e.r - 10;
          if (d < 40) cost += w * (40 - d) * 3;
        }
        const r = Math.hypot(x - p.x, y - p.y);
        if (r < NO_RETURN + 25) cost += w * (NO_RETURN + 25 - r) * 5;
        if (r < p.r + 14) cost += 400;
        const edge = Math.min(x, W - x, y, H - y);
        if (edge < 30) cost += w * (30 - edge) * 2;
      }
      // a player likes the middle distance: room to see, close enough to hit
      const r = Math.hypot(x - p.x, y - p.y);
      if (r > 260) cost += (r - 260) * 0.15;
      if (c === null) cost += 6;
      cost *= 1 + this.rng.range(0, this.p.judge);
      cost += this.rng.range(0, 8);
      if (cost < bestCost) {
        bestCost = cost;
        best = c;
      }
    }
    return best ? { x: best.x * STICK_RADIUS * 0.95, y: best.y * STICK_RADIUS * 0.95 } : null;
  }

  /** Between waves: a card, the way a player picks. */
  pick(s: SimState): UpgradeId {
    if (s.offers.includes('repair') && s.ship.hp < s.ship.maxHp * 0.45) return 'repair';
    const ranked = [...s.offers].sort((a, b) => WANT.indexOf(a) - WANT.indexOf(b));
    return this.rng.chance(0.75) ? ranked[0] : this.rng.pick(s.offers);
  }

  /** The thumbs as the touch input would read them: the headless path. */
  toInput(t: Thumbs): SimInput {
    const mv = t.move ? moveFromOffset(t.move.x, t.move.y) : { mx: 0, my: 0 };
    const down = !!t.right;
    const dragged = !!t.right && Math.hypot(t.right.x, t.right.y) > DRAG_MIN;
    const release = this.wasDown && !down;
    const inp: SimInput = { mx: mv.mx, my: mv.my, charging: down, aimed: dragged, ax: 0, ay: 0, release, pod: t.podTap };
    if (dragged && t.right) {
      const d = Math.hypot(t.right.x, t.right.y);
      inp.ax = t.right.x / d;
      inp.ay = t.right.y / d;
    }
    // a release keeps the aim of the drag it ends
    if (release && this.lastDrag) {
      inp.aimed = true;
      inp.ax = this.lastDrag.x;
      inp.ay = this.lastDrag.y;
    }
    this.lastDrag = dragged ? { x: inp.ax, y: inp.ay } : down ? null : this.lastDrag;
    if (release) this.lastDrag = null;
    this.wasDown = down;
    return inp;
  }
  private lastDrag: { x: number; y: number } | null = null;
}

/** A whole run by the hand, headless. Returns the state at the end. */
export function playHeadless(s: SimState, step: (s: SimState, i: SimInput) => void, maxWave: number, maxTime = 900): SimState {
  const hand = new Hand(s.seed);
  while (!s.ship.dead && s.time < maxTime) {
    if (s.phase === 'pick') {
      if (s.wave >= maxWave) break;
      pickUpgrade(s, hand.pick(s));
      continue;
    }
    step(s, hand.toInput(hand.tick(s)));
    s.sounds.length = 0;
  }
  return s;
}
