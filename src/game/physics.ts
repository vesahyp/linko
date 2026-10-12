import type { Planet } from './state';
import { W, H } from './state';

/**
 * The planet's pull. Everything that moves feels it: the ship, the pod, the
 * enemies, every bullet, the sparks of an explosion.
 *
 * The pull falls off as r^-1.5, softer than real gravity's r^-2, so it still
 * bends a shot at the arena's edge, and it is stronger than the ship's engine
 * inside NO_RETURN: a ship that drops that low and does not already move fast
 * enough sideways falls in.
 */
export const G_REF = 240;
export const R_REF = 130;
export const G_POWER = 1.5;

/** Pull at distance r, world units per second squared. */
export function pullAt(r: number): number {
  return G_REF * Math.pow(R_REF / r, G_POWER);
}

/** The radius where the pull equals the base engine's thrust. */
export const NO_RETURN = R_REF * Math.pow(G_REF / 470, 1 / G_POWER);

/** The speed of a circular orbit at radius r. */
export function orbitSpeed(r: number): number {
  return Math.sqrt(pullAt(r) * r);
}

const out = { ax: 0, ay: 0, r: 0 };

/** Acceleration toward the planet at (x, y). Returns a shared object; copy what you need. */
export function gravity(p: Planet, x: number, y: number): { ax: number; ay: number; r: number } {
  const dx = p.x - x;
  const dy = p.y - y;
  const r = Math.hypot(dx, dy) || 1;
  const a = pullAt(Math.max(r, p.r * 0.8));
  out.ax = (dx / r) * a;
  out.ay = (dy / r) * a;
  out.r = r;
  return out;
}

/** The angle between two directions, 0..PI. */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d < -Math.PI) d += Math.PI * 2;
  if (d > Math.PI) d -= Math.PI * 2;
  return Math.abs(d);
}

/**
 * Where a free body goes: the same integration the sim uses, at a coarser
 * step. Stops at the planet or outside the arena. Used for the aim line, the
 * ship's path line and the auto-aim.
 */
export function predict(p: Planet, x: number, y: number, vx: number, vy: number, time: number, step = 1 / 30, gScale = 1): number[] {
  const pts = [x, y];
  const n = Math.ceil(time / step);
  for (let i = 0; i < n; i++) {
    const g = gravity(p, x, y);
    vx += g.ax * gScale * step;
    vy += g.ay * gScale * step;
    x += vx * step;
    y += vy * step;
    pts.push(x, y);
    if (g.r < p.r) break;
    if (x < -40 || x > W + 40 || y < -40 || y > H + 40) break;
  }
  return pts;
}

/**
 * The auto-aim: the launch angle whose curved path passes nearest to a
 * moving target. Gravity is part of the answer, so a target behind the
 * planet gets a shot that goes round it. Returns the angle and how close the
 * best path came, or null when no path comes within `tol`.
 */
export function solveAim(
  p: Planet,
  sx: number,
  sy: number,
  svx: number,
  svy: number,
  speed: number,
  tx: number,
  ty: number,
  tvx: number,
  tvy: number,
  life: number,
  tol: number,
): { angle: number; miss: number } | null {
  const direct = Math.atan2(ty - sy, tx - sx);
  let best = { angle: direct, miss: Infinity };
  const tryAngle = (a: number) => {
    let x = sx;
    let y = sy;
    let vx = svx * 0.5 + Math.cos(a) * speed;
    let vy = svy * 0.5 + Math.sin(a) * speed;
    const step = 1 / 30;
    let miss = Infinity;
    for (let t = step; t <= life; t += step) {
      const g = gravity(p, x, y);
      vx += g.ax * step;
      vy += g.ay * step;
      x += vx * step;
      y += vy * step;
      if (g.r < p.r) break;
      const d = Math.hypot(x - (tx + tvx * t), y - (ty + tvy * t));
      if (d < miss) miss = d;
      if (x < -40 || x > W + 40 || y < -40 || y > H + 40) break;
    }
    if (miss < best.miss) best = { angle: a, miss };
  };
  for (let k = -18; k <= 18; k++) tryAngle(direct + (k * Math.PI) / 18);
  // finer near the line, where a shot round the planet lives
  for (let k = -6; k <= 6; k++) if (k % 2) tryAngle(direct + (k * Math.PI) / 36);
  const coarse = best.angle;
  for (let k = -4; k <= 4; k++) if (k) tryAngle(coarse + (k * Math.PI) / 72);
  return best.miss <= tol ? best : null;
}
