import type { SimState, SimInput } from '../src/game/state';
import { W, H } from '../src/game/state';
import { ceilY, floorY, pickCard, topSpeed, SHIP_R } from '../src/game/sim';
import type { CardId } from '../src/game/content';
import { applyDrag, GAIN, MOVE_ZONE } from '../src/input/stick';
import { Rng } from '../src/game/rng';

/**
 * The hand: a player with a thumb's limits, never the perfect bot. It looks
 * every reaction time (about a quarter second), sees only the shots nearest
 * the ship and misses some of those, and moves its thumb at a thumb's speed,
 * so what it decides arrives late. Each look it tries a handful of places
 * to fly to a moment ahead and keeps the one that looks safest, with noise
 * in the judging, a liking for lining up with what it wants to shoot, and a
 * pull toward power-ups.
 *
 * Its output is where its thumbs are on the screen, in css px: the left
 * thumb drags the ship (relative, src/input/stick.ts), the right one holds
 * to charge, a tap on the pod button. `toInput` runs that through the touch
 * input's own drag rule for the headless checks; the playthrough
 * (scripts/playthrough.mjs) puts the same thumbs on an emulated iPhone as
 * real touches.
 */
export interface Thumbs {
  /** left thumb, css px; null when lifted */
  move: { x: number; y: number } | null;
  /** right thumb down: charging */
  right: boolean;
  /** a tap on the pod button this tick */
  podTap: boolean;
}

export interface HandProfile {
  /** seconds between looks */
  look: [number, number];
  /** thumb speed, css px per second */
  thumbSpeed: number;
  /** how far from the ship it notices shots, world units */
  sight: number;
  /** how many shots it can track at once: the nearest */
  attention: number;
  /** chance to miss a tracked shot in a look */
  miss: number;
  /** noise in judging a spot, relative */
  judge: number;
}

export const HUMAN: HandProfile = { look: [0.22, 0.36], thumbSpeed: 600, sight: 220, attention: 6, miss: 0.25, judge: 0.5 };

/** The screen the hand assumes when headless: an iPhone 15 in landscape. */
export const PHONE = { w: 852, h: 393, scale: 385 / 390 };

const WANT_CARDS: CardId[] = ['plates', 'capacitor', 'overdrive', 'bigwave', 'podarmor', 'magnet'];

export class Hand {
  private rng: Rng;
  private nextLook = 0;
  private want: { x: number; y: number } | null = null;
  private finger: { x: number; y: number } | null = null;
  private relandAt = 0;
  /** the hand's model of the input's target: what its thumb has asked for */
  private target: { x: number; y: number } = { x: 0, y: 0 };
  private charging = false;
  private chargeUntil = 0;
  private restUntil = 0;
  private podAt = 3;
  private lastT = 0;
  private lastFinger: { x: number; y: number } | null = null;
  private wasCharging = false;
  private inTarget: { x: number; y: number } = { x: 0, y: 0 };

  constructor(seed: number, readonly p: HandProfile = HUMAN) {
    this.rng = new Rng(seed ^ 0x5eed);
  }

  /**
   * One tick at sim time `s.time`. `view` is the screen. The hand steers by
   * its own model of the drag target (what its thumb has asked for), never by
   * the page's input: in the page its touches arrive later than it moves, and
   * steering by a stale target made it overshoot into the walls.
   */
  tick(s: SimState, view = PHONE): Thumbs {
    const now = s.time;
    const dt = Math.min(0.1, Math.max(0, now - this.lastT));
    this.lastT = now;
    if (s.phase === 'pick' || s.phase === 'dead' || s.ship.dead) {
      this.finger = null;
      this.charging = false;
      return { move: null, right: false, podTap: false };
    }
    let podTap = false;
    if (now >= this.nextLook) {
      this.nextLook = now + this.rng.range(this.p.look[0], this.p.look[1]);
      this.want = this.choose(s);
      // the right thumb: hold, let go, rest; longer holds at big things
      const big = s.enemies.some((e) => e.parts || e.kind === 'gunship' || e.kind === 'spinner');
      if (!this.charging && now >= this.restUntil && s.enemies.length) {
        this.charging = true;
        this.chargeUntil = now + (big ? this.rng.range(0.8, 1.3) : this.rng.range(0.35, 0.9));
      } else if (this.charging && now >= this.chargeUntil) {
        this.charging = false;
        this.restUntil = now + this.rng.range(0.15, 0.5);
      }
      // the pod: out at a boss or a gunship, back after a while
      if (now > this.podAt && !this.charging) {
        const docked = s.pod.mode === 'front' || s.pod.mode === 'back';
        if (docked && big && this.rng.chance(0.3)) {
          podTap = true;
          this.podAt = now + this.rng.range(5, 10);
        } else if (s.pod.mode === 'out' && (!big || this.rng.chance(0.15))) {
          podTap = true;
          this.podAt = now + 2;
        }
      }
    }
    // the left thumb: land, drag toward where the hand wants the ship, re-land when it runs out of glass
    if (!this.finger) {
      if (now >= this.relandAt && this.want) {
        this.finger = { x: view.w * 0.3 + this.rng.range(-20, 20), y: view.h * 0.6 + this.rng.range(-20, 20) };
        this.target = { x: s.ship.x, y: s.ship.y };
      }
    } else if (this.want) {
      const dxW = this.want.x - this.target.x;
      const dyW = this.want.y - this.target.y;
      let dx = (dxW * view.scale) / GAIN;
      let dy = (dyW * view.scale) / GAIN;
      const d = Math.hypot(dx, dy);
      const lim = this.p.thumbSpeed * dt;
      if (d > lim) {
        dx *= lim / d;
        dy *= lim / d;
      }
      const nx = this.finger.x + dx;
      const ny = this.finger.y + dy;
      if (nx < 18 || nx > view.w * MOVE_ZONE - 18 || ny < 18 || ny > view.h - 18) {
        this.finger = null;
        this.relandAt = now + 0.07;
      } else {
        this.finger = { x: nx, y: ny };
        this.target = applyDrag(this.target, dx, dy, view.scale);
      }
    }
    return { move: this.finger ? { ...this.finger } : null, right: this.charging, podTap };
  }

  /** Try places to be a moment ahead; keep the one that looks safest. */
  private choose(s: SimState): { x: number; y: number } {
    const sh = s.ship;
    const horizon = 0.7;
    const stepT = 0.1;
    const n = Math.round(horizon / stepT);
    const seen = s.bullets
      .filter((b) => b.team === 'enemy' && Math.hypot(b.x - sh.x, b.y - sh.y) < this.p.sight)
      .sort((a, b) => Math.hypot(a.x - sh.x, a.y - sh.y) - Math.hypot(b.x - sh.x, b.y - sh.y))
      .slice(0, this.p.attention)
      .filter(() => !this.rng.chance(this.p.miss));
    // what it wants to shoot: a boss's open weak point or live gun, else the nearest thing ahead
    let aimY = sh.y;
    let bestD = Infinity;
    for (const e of s.enemies) {
      if (e.parts) {
        const w = e.parts.find((p) => p.kind === 'weak' && p.open) ?? e.parts.find((p) => p.kind === 'gun' && !p.dead);
        if (w) {
          aimY = e.y + w.oy;
          bestD = 0;
        }
        continue;
      }
      const d = e.x - sh.x;
      if (d > 0 && d < bestD) {
        bestD = d;
        aimY = e.y;
      }
    }
    const top = topSpeed(s);
    const cands: { x: number; y: number }[] = [{ x: sh.x, y: sh.y }];
    for (const r of [45, 90, 140]) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        cands.push({ x: Math.max(20, Math.min(W - 20, sh.x + Math.cos(a) * r)), y: Math.max(16, Math.min(H - 16, sh.y + Math.sin(a) * r)) });
      }
    }
    let best = cands[0];
    let bestCost = Infinity;
    for (const c of cands) {
      let cost = 0;
      const dist = Math.hypot(c.x - sh.x, c.y - sh.y);
      for (let i = 1; i <= n; i++) {
        const t = i * stepT;
        // the ship flies straight at the spot, as fast as it can
        const f = dist > 0 ? Math.min(1, (top * 0.85 * t) / dist) : 1;
        const x = sh.x + (c.x - sh.x) * f;
        const y = sh.y + (c.y - sh.y) * f;
        const w = 1 - i / (n + 3);
        for (const b of seen) {
          const d = Math.hypot(b.x + b.vx * t - x, b.y + b.vy * t - y) - b.r - SHIP_R;
          if (d < 20) cost += w * (20 - d) * 6;
        }
        for (const e of s.enemies) {
          if (e.parts) {
            for (const p of e.parts) {
              if (p.dead) continue;
              const d = Math.hypot(e.x + p.ox - x, e.y + p.oy - y) - p.r - 12;
              if (d < 30) cost += w * (30 - d) * 4;
            }
            continue;
          }
          const d = Math.hypot(e.x + e.vx * t - x, e.y + e.vy * t - y) - e.r - 12;
          if (d < 30) cost += w * (30 - d) * 3;
        }
        for (const bm of s.beams) {
          const ca = Math.cos(bm.angle);
          const sa = Math.sin(bm.angle);
          const along = (x - bm.x) * ca + (y - bm.y) * sa;
          const off = Math.abs(-(x - bm.x) * sa + (y - bm.y) * ca);
          if (along > 0 && off < bm.width + 50) cost += w * (bm.width + 50 - off) * (bm.warn > 0 ? 2 : 6);
        }
        const fy = floorY(s, x);
        const cy = ceilY(s, x);
        if (y > fy - 22) cost += w * (y - (fy - 22)) * 5;
        if (y < cy + 22) cost += w * (cy + 22 - y) * 5;
      }
      // where a shooter player likes to be: the left third, lined up with the target
      if (c.x > 300) cost += (c.x - 300) * 0.25;
      if (c.x < 70) cost += (70 - c.x) * 0.25;
      cost += Math.abs(c.y - aimY) * 0.12;
      // power-ups are worth a detour
      for (const d of s.drops) {
        const dd = Math.hypot(d.x - 65 * 0.4 - c.x, d.y - c.y);
        if (dd < 140) cost -= 60 * (1 - dd / 140);
      }
      cost *= 1 + this.rng.range(0, this.p.judge);
      cost += this.rng.range(0, 6);
      if (cost < bestCost) {
        bestCost = cost;
        best = c;
      }
    }
    return best;
  }

  /** Between stages: a card, the way a player picks. */
  pick(s: SimState): CardId {
    if (s.offers.includes('plates') && s.ship.hp < s.ship.maxHp * 0.6) return 'plates';
    const ranked = [...s.offers].sort((a, b) => WANT_CARDS.indexOf(a) - WANT_CARDS.indexOf(b));
    return this.rng.chance(0.75) ? ranked[0] : this.rng.pick(s.offers);
  }

  /** The thumbs as the touch input would read them: the headless path. */
  toInput(s: SimState, t: Thumbs, view = PHONE): SimInput {
    if (t.move && !this.lastFinger) this.inTarget = { x: s.ship.x, y: s.ship.y };
    else if (t.move && this.lastFinger) this.inTarget = applyDrag(this.inTarget, t.move.x - this.lastFinger.x, t.move.y - this.lastFinger.y, view.scale);
    this.lastFinger = t.move;
    const release = this.wasCharging && !t.right;
    this.wasCharging = t.right;
    return { target: t.move ? { ...this.inTarget } : null, mx: 0, my: 0, charging: t.right, release, pod: t.podTap };
  }
}

/** A whole run by the hand, headless, to a stage limit. Returns the state at the end. */
export function playHeadless(s: SimState, step: (s: SimState, i: SimInput) => void, maxStages: number, maxTime = 1200): SimState {
  const hand = new Hand(s.seed);
  let cleared = 0;
  while (!s.ship.dead && s.time < maxTime) {
    if (s.phase === 'pick') {
      cleared++;
      if (cleared >= maxStages) break;
      pickCard(s, hand.pick(s));
      continue;
    }
    step(s, hand.toInput(s, hand.tick(s)));
    s.sounds.length = 0;
  }
  return s;
}
