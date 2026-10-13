import type { SimState } from './state';

/**
 * Explosions and sparks. They use the sim's RNG like everything else on the
 * state, so a replay draws the same sparks; they never change the fight.
 */
export function burst(s: SimState, x: number, y: number, n: number, color: string, speed: number, size: number, life: number): void {
  for (let i = 0; i < n; i++) {
    const a = s.rng.range(0, Math.PI * 2);
    const v = s.rng.range(0.2, 1) * speed;
    s.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: s.rng.range(0.5, 1) * life, max: life, size: s.rng.range(0.6, 1.3) * size, color });
  }
}

/** A blast: a fireball of sparks, a white core, two shock rings, and shake by size. */
export function explode(s: SimState, x: number, y: number, size: number, color: string): void {
  burst(s, x, y, Math.round(12 + size * 1.4), color, 110 + size * 6, 2.6, 0.8);
  burst(s, x, y, Math.round(8 + size * 0.6), '#fff4d0', 70 + size * 3, 3.4, 0.4);
  burst(s, x, y, Math.round(4 + size * 0.3), '#ff6a2a', 40 + size * 2, 5, 0.6);
  s.rings.push({ x, y, r: size * 0.5, grow: 100 + size * 7, life: 0.45, max: 0.45, color, width: 3 });
  s.rings.push({ x, y, r: 2, grow: 50 + size * 4, life: 0.22, max: 0.22, color: '#ffffff', width: 5 });
  s.shake = Math.max(s.shake, Math.min(12, size * 0.22));
}

export function floater(s: SimState, x: number, y: number, text: string, color = '#ffffff'): void {
  s.floaters.push({ x, y, text, color, life: 0.9 });
}
