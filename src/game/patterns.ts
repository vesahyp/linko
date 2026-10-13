import type { Beam, Bullet, BulletKind, SimState, Team } from './state';

/**
 * Shots and the few bullet patterns every enemy and boss draws from. Enemy
 * shots all look the same (pink orbs with white cores) so a pattern reads at
 * a glance; only their number, speed and spacing change.
 */
export function shot(s: SimState, team: Team, kind: BulletKind, x: number, y: number, angle: number, speed: number, dmg: number, r: number, life: number): Bullet {
  const b: Bullet = { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r, dmg, team, life, kind, pierce: 0, hit: null, target: -1, level: 0 };
  s.bullets.push(b);
  return b;
}

/**
 * Enemy shots get faster each loop. No shot is fired from closer than 90
 * units to the ship: a thumb cannot react to one, so it would only be a
 * hit, never a dodge.
 */
export function enemyShot(s: SimState, x: number, y: number, angle: number, speed: number, kind: BulletKind = 'orb'): Bullet {
  if (!s.ship.dead && Math.hypot(s.ship.x - x, s.ship.y - y) < 90) {
    return { x, y, vx: 0, vy: 0, r: 0, dmg: 0, team: 'enemy', life: 0, kind, pierce: 0, hit: null, target: -1, level: 0 };
  }
  return shot(s, 'enemy', kind, x, y, angle, speed * 1.15 * (1 + 0.15 * s.loop), 20, kind === 'mine' ? 7 : 4.5, kind === 'mine' ? 9 : 7);
}

export function aimAt(s: SimState, x: number, y: number): number {
  return Math.atan2(s.ship.y - y, s.ship.x - x);
}

/** n shots spread over `arc` radians round `angle`. */
export function fan(s: SimState, x: number, y: number, angle: number, n: number, arc: number, speed: number): void {
  for (let i = 0; i < n; i++) enemyShot(s, x, y, angle + (n === 1 ? 0 : -arc / 2 + (arc * i) / (n - 1)), speed);
  s.sounds.push('eshot');
}

export function ring(s: SimState, x: number, y: number, n: number, speed: number, rot = 0): void {
  for (let i = 0; i < n; i++) enemyShot(s, x, y, rot + (i / n) * Math.PI * 2, speed);
  s.sounds.push('ering');
}

/** A boss beam: `warn` seconds of a thin line, then `life` seconds of beam, turning at `sweep` rad/s. */
export function beam(s: SimState, owner: number, ox: number, oy: number, x: number, y: number, angle: number, sweep: number, warn = 0.9, life = 1.2, width = 16): Beam {
  const b: Beam = { x, y, angle, sweep, width, warn, life, owner, ox, oy };
  s.beams.push(b);
  s.sounds.push('warn');
  return b;
}
