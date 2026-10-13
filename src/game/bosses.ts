import { ENEMIES, type EnemyKind } from './content';
import { DT, H, W, type Enemy, type Part, type SimState } from './state';
import { addEnemy } from './sim';
import { aimAt, beam, enemyShot, fan, ring } from './patterns';
import { explode } from './fx';

/**
 * The three bosses. Each is one Enemy with parts: armour turns shots away,
 * guns can be shot off, and the weak point holds the boss's life and takes
 * damage only while open. Each changes its attack at phase thresholds:
 * phase 2 and 3 are set in `phaseOf`, and the attacks read `e.phase`.
 */

function part(name: string, kind: Part['kind'], ox: number, oy: number, r: number, hp = 0): Part {
  return { name, kind, ox, oy, r, hp, maxHp: hp, open: kind !== 'weak', dead: false, flash: 0, gunCd: 1, burst: 0 };
}

export function makeBoss(s: SimState, kind: EnemyKind): Enemy {
  const e = addEnemy(s, kind, W + 140, H / 2, 0, 0);
  const hp = e.hp;
  const gunHp = (n: number) => n * (1 + 0.5 * s.loop);
  e.phase = 1;
  switch (kind) {
    case 'warden':
      e.parts = [
        part('core', 'weak', -36, 0, 17, hp),
        part('gun-top', 'gun', -22, -80, 16, gunHp(160)),
        part('gun-bottom', 'gun', -22, 80, 16, gunHp(160)),
        part('hull', 'armor', 14, 0, 52),
        part('wing-top', 'armor', 0, -50, 32),
        part('wing-bottom', 'armor', 0, 50, 32),
      ];
      break;
    case 'serpent': {
      e.parts = [part('head', 'weak', 0, 0, 18, hp)];
      e.parts[0].open = true;
      // the body can be shot off segment by segment; the head is the life
      for (let i = 1; i <= 10; i++) e.parts.push(part(`seg-${i}`, 'gun', 0, 0, 14 - i * 0.3, gunHp(55)));
      e.parts.push(part('gun-tail', 'gun', 0, 0, 12, gunHp(200)));
      e.trail = [];
      break;
    }
    case 'bulwark':
      e.parts = [
        part('bridge', 'weak', -44, 0, 16, hp),
        part('turret-1', 'gun', -60, -125, 14, gunHp(220)),
        part('turret-2', 'gun', -60, 125, 14, gunHp(220)),
        part('turret-3', 'gun', -86, -58, 14, gunHp(220)),
        part('gun-hatch', 'gun', -86, 58, 13, gunHp(130)),
        part('plate', 'armor', -50, 0, 25),
        part('hull-top', 'armor', 22, -100, 48),
        part('hull-mid', 'armor', 26, 0, 58),
        part('hull-bottom', 'armor', 22, 100, 48),
      ];
      break;
    default:
      break;
  }
  for (const p of e.parts!) p.gunCd = 1.5 + s.rng.range(0, 1);
  return e;
}

const get = (e: Enemy, name: string) => e.parts!.find((p) => p.name === name)!;
const alive = (p: Part) => !p.dead;

function phaseOf(e: Enemy): number {
  const f = e.hp / e.maxHp;
  const guns = e.parts!.filter((p) => p.kind === 'gun' && (e.kind !== 'bulwark' || p.name.startsWith('turret')) && !p.name.startsWith('seg-'));
  if (f < 0.25 || (e.kind === 'bulwark' && f < 0.3)) return 3;
  if (e.kind === 'warden' && (f < 0.6 || guns.every((p) => p.dead))) return 2;
  if (e.kind === 'serpent' && f < 0.6) return 2;
  if (e.kind === 'bulwark' && guns.every((p) => p.dead)) return 2;
  return 1;
}

export function stepBoss(s: SimState, e: Enemy): void {
  for (const p of e.parts!) p.flash = Math.max(0, p.flash - DT);
  const ph = phaseOf(e);
  if (ph !== e.phase) {
    e.phase = ph;
    s.banner = { text: `${ENEMIES[e.kind].name}`, sub: ph === 2 ? 'Phase 2' : 'Phase 3: enraged', life: 1.6 };
    s.flash = Math.max(s.flash, 0.3);
    s.shake = Math.max(s.shake, 8);
    s.sounds.push('alarm');
  }
  const live = !s.ship.dead;
  if (e.kind === 'warden') warden(s, e, live);
  else if (e.kind === 'serpent') serpent(s, e, live);
  else bulwark(s, e, live);
}

function warden(s: SimState, e: Enemy, live: boolean): void {
  const t = e.t;
  // in from the right, then a slow bob, faster when enraged
  const tx = W - 120;
  e.x += (tx - e.x) * Math.min(1, 1.2 * DT);
  e.y = H / 2 + Math.sin(t * (e.phase === 3 ? 0.8 : 0.5)) * 62;
  const core = get(e, 'core');
  const cycle = t % 5;
  const wasOpen = core.open;
  core.open = e.phase === 3 || (e.phase === 2 ? cycle < 3.5 : cycle >= 3 && t > 3);
  if (core.open && !wasOpen) s.sounds.push('open');
  if (!live || t < 2.5) return;
  const cx = e.x + core.ox;
  const cy = e.y + core.oy;
  // the gun pods: aimed bursts of three, staggered
  for (const g of e.parts!.filter((p) => p.kind === 'gun' && alive(p))) {
    g.gunCd -= DT;
    if (g.gunCd <= 0) {
      g.burst++;
      g.gunCd = g.burst % 3 === 0 ? 1.7 : 0.16;
      enemyShot(s, e.x + g.ox, e.y + g.oy, aimAt(s, e.x + g.ox, e.y + g.oy), 175);
    }
  }
  core.gunCd -= DT;
  if (e.phase === 1) {
    if (core.open && !wasOpen) fan(s, cx, cy, aimAt(s, cx, cy), 7, 0.9, 150);
  } else if (core.open && core.gunCd <= 0) {
    // a turning spiral out of the open core
    core.gunCd = e.phase === 3 ? 0.08 : 0.11;
    const rot = t * (e.phase === 3 ? 2.6 : 2.0);
    for (let k = 0; k < 2; k++) enemyShot(s, cx, cy, Math.PI + rot + k * Math.PI, e.phase === 3 ? 135 : 120);
  }
  // a beam down the line the warning shows: step off it. In phase 3 a second one follows where you went
  e.gunCd -= DT;
  if (e.phase >= 2 && e.gunCd <= 0) {
    e.gunCd = e.phase === 3 ? 4.5 : 6.5;
    beam(s, e.id, core.ox, core.oy, cx, cy, aimAt(s, cx, cy), 0, 1.0, 0.8, 16);
    e.burst = e.phase === 3 ? 1 : 0;
  }
  if (e.burst === 1 && e.gunCd < 3.1) {
    e.burst = 0;
    beam(s, e.id, core.ox, core.oy, cx, cy, aimAt(s, cx, cy), 0, 0.8, 0.7, 14);
  }
  if (e.phase === 3 && Math.floor(t / 1.6) !== Math.floor((t - DT) / 1.6)) ring(s, cx, cy, 14, 115, t);
}

function serpent(s: SimState, e: Enemy, live: boolean): void {
  // the head flies a figure of eight; the body follows its path
  const speed = e.phase >= 2 ? 1.3 : 1;
  e.phase = Math.max(e.phase, 1);
  e.burst += DT * speed;
  const u = e.burst;
  const hx = W * 0.63 + Math.sin(u * 0.42) * 180;
  const hy = H / 2 + Math.sin(u * 0.84 + 0.6) * 125;
  const enter = Math.min(1, e.t / 3);
  e.x = W + 140 + (hx - (W + 140)) * enter;
  e.y = H / 2 + (hy - H / 2) * enter;
  const tr = e.trail!;
  tr.push(e.x, e.y);
  if (tr.length > 1400) tr.splice(0, 2);
  const n = tr.length / 2;
  let k = 0;
  for (const p of e.parts!) {
    if (p.name === 'head') continue;
    k++;
    const back = Math.max(0, n - 1 - k * 11);
    p.ox = tr[back * 2] - e.x;
    p.oy = tr[back * 2 + 1] - e.y;
  }
  if (!live || e.t < 3) return;
  // phase 1: the segments fire in turn, down the body
  e.gunCd -= DT;
  const segs = e.parts!.filter((p) => p.name.startsWith('seg-') && alive(p));
  if (e.gunCd <= 0 && segs.length) {
    e.index = (e.index + 1) % segs.length;
    const sg = segs[e.index];
    const x = e.x + sg.ox;
    const y = e.y + sg.oy;
    if (e.phase === 3) {
      e.gunCd = 0.3;
      ring(s, x, y, 5, 100, e.t + e.index);
    } else {
      e.gunCd = e.phase === 2 ? 0.38 : 0.5;
      enemyShot(s, x, y, aimAt(s, x, y), 140);
    }
  }
  // phase 2 on: the head fires fans
  const head = get(e, 'head');
  head.gunCd -= DT;
  if (e.phase >= 2 && head.gunCd <= 0) {
    head.gunCd = 2.0;
    fan(s, e.x, e.y, aimAt(s, e.x, e.y), 5, 0.7, 160);
  }
  // the tail gun: slow aimed pairs while it lasts
  const tail = get(e, 'gun-tail');
  if (alive(tail)) {
    tail.gunCd -= DT;
    if (tail.gunCd <= 0) {
      tail.gunCd = 1.4;
      const x = e.x + tail.ox;
      const y = e.y + tail.oy;
      fan(s, x, y, aimAt(s, x, y), 2, 0.25, 150);
    }
  }
}

function bulwark(s: SimState, e: Enemy, live: boolean): void {
  const t = e.t;
  e.x += (W - 105 - e.x) * Math.min(1, 0.8 * DT);
  e.y = H / 2 + Math.sin(t * 0.4) * 24;
  const plate = get(e, 'plate');
  const bridge = get(e, 'bridge');
  if (e.phase >= 2 && !plate.dead) {
    // the turrets are gone: the plating over the bridge blows off
    plate.dead = true;
    explode(s, e.x + plate.ox, e.y + plate.oy, 60, '#ffb070');
    s.sounds.push('bigboom');
  }
  bridge.open = plate.dead;
  if (!live || t < 3) return;
  for (const g of e.parts!.filter((p) => p.kind === 'gun' && alive(p))) {
    g.gunCd -= DT;
    if (g.gunCd > 0) continue;
    const x = e.x + g.ox;
    const y = e.y + g.oy;
    if (g.name === 'gun-hatch') {
      g.gunCd = 2.6;
      const m = enemyShot(s, x, y, Math.PI + s.rng.range(-0.5, 0.5), 70, 'mine');
      m.pierce = 3;
      s.sounds.push('mine');
    } else if (g.name === 'turret-3') {
      g.gunCd = 2.1;
      fan(s, x, y, aimAt(s, x, y), 5, 0.8, 160);
    } else {
      g.burst++;
      g.gunCd = g.burst % 3 === 0 ? 1.9 : 0.15;
      enemyShot(s, x, y, aimAt(s, x, y), 175);
    }
  }
  if (e.phase < 2) return;
  const bx = e.x + bridge.ox;
  const by = e.y + bridge.oy;
  bridge.gunCd -= DT;
  if (bridge.gunCd <= 0) {
    bridge.gunCd = e.phase === 3 ? 0.09 : 0.13;
    const rot = t * 1.8;
    for (let k = 0; k < (e.phase === 3 ? 3 : 2); k++) enemyShot(s, bx, by, Math.PI + rot + (k * Math.PI * 2) / (e.phase === 3 ? 3 : 2), 120);
  }
  e.gunCd -= DT;
  if (e.gunCd <= 0) {
    e.gunCd = e.phase === 3 ? 5.5 : 3;
    if (e.phase === 3) {
      // two beams that cross: get to the middle, then out of it
      beam(s, e.id, bridge.ox, bridge.oy, bx, by, Math.PI - 0.55, 0.3, 1.1, 1.2, 14);
      beam(s, e.id, bridge.ox, bridge.oy, bx, by, Math.PI + 0.55, -0.3, 1.1, 1.2, 14);
      ring(s, bx, by, 16, 110, t);
    } else fan(s, bx, by, aimAt(s, bx, by), 7, 1.0, 150);
  }
}
