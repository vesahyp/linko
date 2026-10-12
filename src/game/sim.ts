import { ENEMIES, UPGRADES, UPGRADE_BY_ID, WAVES, type EnemyKind, type UpgradeId } from './content';
import { angleDiff, gravity, orbitSpeed, solveAim, NO_RETURN } from './physics';
import {
  createState,
  DT,
  H,
  W,
  newTally,
  type Bullet,
  type Enemy,
  type SimInput,
  type SimState,
  type Spawn,
  type Team,
} from './state';

export { DT };

export const SHIP_R = 10;
const POD_R = 9;
const BIT_R = 6;
const BASE_THRUST = 470;
const BASE_SPEED = 260;
/** a shot that left the gun this far off the line it hit on was bent by the planet */
const BENT = (12 * Math.PI) / 180;
/** inside this radius the well charges the wave cannon faster and a fast exit is a slingshot */
export const WELL = 130;
const SLING_SPEED = 300;

export function newRun(seed: number): SimState {
  const s = createState(seed);
  // the run opens in orbit: let go of the stick and the ship falls round the planet
  const r = Math.hypot(s.ship.x - s.planet.x, s.ship.y - s.planet.y);
  s.ship.vx = 0;
  s.ship.vy = -orbitSpeed(r) * 0.92;
  startWave(s, 1);
  return s;
}

/** After wave 6 the waves repeat, tougher: more hull, faster shots, one more of each. */
export function cycleOf(wave: number): number {
  return Math.floor((wave - 1) / WAVES.length);
}

export function startWave(s: SimState, n: number): void {
  s.wave = n;
  s.waveTime = 0;
  s.phase = 'fight';
  s.tally = newTally();
  const def = WAVES[(n - 1) % WAVES.length];
  const c = cycleOf(n);
  s.queue = def.spawns.map((sp) => ({ ...sp, count: sp.count + (sp.kind === 'carrier' ? 0 : c) }));
  s.banner = { text: `Wave ${n}`, sub: c ? `${def.name} · round ${c + 1}` : def.name, life: 2.4 };
  s.sounds.push('wave');
}

// ---------------------------------------------------------------- upgrades

export function upgradeLevel(s: SimState, id: UpgradeId): number {
  return s.ship.upgrades[id];
}

/** Three cards, none at its last level. Field Repair is offered only to a damaged hull. */
export function rollOffers(s: SimState): UpgradeId[] {
  const sh = s.ship;
  const open = UPGRADES.filter((u) => u.id !== 'repair' && sh.upgrades[u.id] < u.levels.length).map((u) => u.id);
  s.rng.shuffle(open);
  const out = open.slice(0, 3);
  if (sh.hp < sh.maxHp * 0.6) out[2] = 'repair';
  return out;
}

export function applyUpgrade(s: SimState, id: UpgradeId): void {
  const sh = s.ship;
  if (id === 'repair') {
    sh.hp = Math.min(sh.maxHp, sh.hp + 35);
  } else {
    sh.upgrades[id] = Math.min(UPGRADE_BY_ID[id].levels.length, sh.upgrades[id] + 1);
  }
  if (id === 'armor') {
    sh.maxHp = 100 + 40 * sh.upgrades.armor;
    sh.hp = sh.maxHp;
  }
  s.sounds.push('upgrade');
}

/** The pick between waves: the card, then the next wave. */
export function pickUpgrade(s: SimState, id: UpgradeId): void {
  if (s.phase !== 'pick') return;
  applyUpgrade(s, id);
  s.offers = [];
  s.ship.invuln = Math.max(s.ship.invuln, 1.2);
  startWave(s, s.wave + 1);
}

// ---------------------------------------------------------------- numbers

export function thrustOf(s: SimState): number {
  return BASE_THRUST * (1 + 0.2 * s.ship.upgrades.engine);
}
export function topSpeedOf(s: SimState): number {
  return BASE_SPEED * (1 + 0.12 * s.ship.upgrades.engine);
}
export function shotSpeedOf(s: SimState): number {
  return 520 * (1 - 0.12 * s.ship.upgrades.heavy);
}
const shotDamage = (s: SimState) => 1 + 0.6 * s.ship.upgrades.heavy;
const fireInterval = (s: SimState) => 0.22 / [1, 1.3, 1.6, 2][s.ship.upgrades.rapid];
export const CHARGE_SPEED = 400;
/** seconds for a full charge, before the well */
export function chargeTime(s: SimState): number {
  return 1.1 / (1 + 0.35 * Math.min(2, s.ship.upgrades.wave));
}

// ---------------------------------------------------------------- spawning

function addEnemy(s: SimState, kind: EnemyKind, x: number, y: number, vx: number, vy: number): Enemy {
  const d = ENEMIES[kind];
  const hpMul = 1 + 0.8 * cycleOf(s.wave);
  const e: Enemy = {
    id: s.nextId++,
    kind,
    x,
    y,
    vx,
    vy,
    hp: d.hp * hpMul,
    maxHp: d.hp * hpMul,
    r: d.r,
    angle: Math.atan2(vy, vx),
    t: 0,
    gunCd: s.rng.range(1, 2.2),
    hx: x,
    hy: y,
    flash: 0,
    entering: 0,
    seed: s.rng.next(),
    phase: s.rng.range(0, Math.PI * 2),
    burst: 0,
  };
  s.enemies.push(e);
  return e;
}

/** A point on an edge, just outside it, and a velocity in. */
function edgeEntry(s: SimState, from: Spawn['from'], i: number, n: number) {
  const f = (i + 1) / (n + 1);
  const jitter = s.rng.range(-20, 20);
  switch (from) {
    case 'left':
      return { x: -20, y: H * (0.15 + 0.7 * f) + jitter, vx: 210, vy: 0 };
    case 'right':
      return { x: W + 20, y: H * (0.15 + 0.7 * f) + jitter, vx: -210, vy: 0 };
    case 'top':
      return { x: W * (0.15 + 0.7 * f) + jitter, y: -20, vx: 0, vy: 190 };
    default:
      return { x: W * (0.15 + 0.7 * f) + jitter, y: H + 20, vx: 0, vy: -190 };
  }
}

function spawnGroup(s: SimState, sp: Spawn): void {
  const p = s.planet;
  if (sp.from === 'orbit') {
    // A chain on one orbit: the first warps in, the rest follow it on the
    // same path, a fixed time behind. No engines: the planet flies them.
    const r = s.rng.range(150, 195);
    const dir = s.rng.chance(0.5) ? 1 : -1;
    // enter on the side away from the ship, so the chain is seen coming round
    const away = Math.atan2(s.ship.y - p.y, s.ship.x - p.x) + Math.PI;
    const v = orbitSpeed(r);
    const gap = 26 / r;
    for (let i = 0; i < sp.count; i++) {
      const a = away - dir * i * gap;
      const x = p.x + Math.cos(a) * r;
      const y = p.y + Math.sin(a) * r * 0.98;
      const e = addEnemy(s, sp.kind, x, y, -Math.sin(a) * v * dir, Math.cos(a) * v * dir);
      e.entering = 0.5;
      e.gunCd = 4 + i * 0.8 + s.rng.range(0, 1.5);
      e.burst = 1 + i * 0.35;
      e.phase = dir;
    }
    s.rings.push({ x: p.x + Math.cos(away) * r, y: p.y + Math.sin(away) * r, r: 6, grow: 90, life: 0.6, max: 0.6, color: ENEMIES[sp.kind].color });
    s.sounds.push('warp');
    return;
  }
  for (let i = 0; i < sp.count; i++) {
    const at = edgeEntry(s, sp.from, i, sp.count);
    const e = addEnemy(s, sp.kind, at.x, at.y, at.vx, at.vy);
    e.entering = sp.kind === 'carrier' ? 2.5 : 0.7;
    if (sp.kind === 'carrier') {
      e.phase = 0;
      e.vx = -90;
    }
    // where it will hold, for the ones that hover
    const side = sp.from === 'left' ? -1 : sp.from === 'right' ? 1 : s.rng.chance(0.5) ? -1 : 1;
    if (sp.kind === 'lancer' || sp.kind === 'miner') {
      e.hx = W / 2 + side * s.rng.range(230, 360);
      e.hy = sp.kind === 'miner' ? (sp.from === 'bottom' ? H - 80 : 80) : s.rng.range(70, H - 70);
    }
    if (sp.kind === 'spinner') {
      // the spinner's own slow circle round the planet; phase is its angle
      e.phase = Math.atan2(at.y - p.y, at.x - p.x);
      e.hx = s.rng.range(200, 230);
    }
  }
  if (sp.kind === 'carrier') s.banner = { text: 'Carrier', sub: 'Shoot the core', life: 2.6 };
}

// ---------------------------------------------------------------- shots

function shot(s: SimState, team: Team, kind: Bullet['kind'], x: number, y: number, angle: number, speed: number, dmg: number, r: number, life: number, inherit = { vx: 0, vy: 0 }): Bullet {
  const b: Bullet = {
    x,
    y,
    vx: inherit.vx + Math.cos(angle) * speed,
    vy: inherit.vy + Math.sin(angle) * speed,
    r,
    dmg,
    team,
    life,
    kind,
    a0: angle,
    pierce: 0,
    target: -1,
    hit: null,
    trail: [x, y],
  };
  s.bullets.push(b);
  return b;
}

function nearestEnemy(s: SimState, x: number, y: number, maxD = Infinity): Enemy | null {
  let best: Enemy | null = null;
  let bd = maxD;
  for (const e of s.enemies) {
    if (e.entering > 0.3) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

/**
 * The auto-aim for a gun at (x, y): the nearest enemy a curved shot can
 * reach, then the next. Returns the launch angle, or null with nothing to
 * shoot at.
 */
function autoAim(s: SimState, x: number, y: number, speed: number, life: number, inherit: { vx: number; vy: number }): { angle: number; target: Enemy } | null {
  const order = s.enemies.filter((e) => e.entering <= 0.3).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
  for (const e of order.slice(0, 4)) {
    const sol = solveAim(s.planet, x, y, inherit.vx * 2, inherit.vy * 2, speed, e.x, e.y, e.vx, e.vy, life, e.r + 6);
    if (sol) return { angle: sol.angle, target: e };
  }
  return null;
}

function fireMain(s: SimState, angle: number): void {
  const sh = s.ship;
  const lvl = sh.upgrades.spread;
  const sp = shotSpeedOf(s);
  const dmg = shotDamage(s);
  const r = 2.5 + sh.upgrades.heavy * 0.8;
  const inherit = { vx: sh.vx * 0.5, vy: sh.vy * 0.5 };
  const nx = Math.cos(angle + Math.PI / 2);
  const ny = Math.sin(angle + Math.PI / 2);
  const mx = sh.x + Math.cos(angle) * 12;
  const my = sh.y + Math.sin(angle) * 12;
  const spreads = [[0], [0, 0], [-0.13, 0, 0.13], [-0.27, -0.13, 0, 0.13, 0.27]][lvl];
  spreads.forEach((da, i) => {
    const off = lvl === 1 ? (i === 0 ? -4 : 4) : 0;
    shot(s, 'player', 'shot', mx + nx * off, my + ny * off, angle + da, sp, dmg, r, 1.0, inherit);
  });
  s.sounds.push('shot');
}

/** Where the charge would go if released now: the drag, else the auto-aim, else the nose. The renderer draws its path. */
export function chargeAngle(s: SimState, inp: SimInput): number {
  const sh = s.ship;
  if (inp.aimed) return Math.atan2(inp.ay, inp.ax);
  const aim = autoAim(s, sh.x, sh.y, CHARGE_SPEED, 1.6, { vx: sh.vx * 0.5, vy: sh.vy * 0.5 });
  return aim ? aim.angle : sh.angle;
}

function fireCharge(s: SimState, inp: SimInput): void {
  const sh = s.ship;
  const c = sh.charge;
  sh.charge = 0;
  if (c < 0.2) return;
  const inherit = { vx: sh.vx * 0.5, vy: sh.vy * 0.5 };
  const angle = chargeAngle(s, inp);
  const wave = sh.upgrades.wave;
  const dmg = (6 + 34 * c) * (1 + 0.35 * wave);
  const angles = wave >= 3 && c > 0.95 ? [angle - 0.2, angle, angle + 0.2] : [angle];
  for (const a of angles) {
    const b = shot(s, 'player', 'charge', sh.x + Math.cos(a) * 14, sh.y + Math.sin(a) * 14, a, CHARGE_SPEED, dmg, 6 + 11 * c, 1.6, inherit);
    b.pierce = dmg;
    b.hit = [];
  }
  sh.angle = angle;
  s.shake = Math.max(s.shake, 2 + 5 * c);
  s.sounds.push(c > 0.9 ? 'beam' : 'charge-shot');
  // recoil: the cannon pushes the ship back a little, which near the planet matters
  sh.vx -= Math.cos(angle) * 60 * c;
  sh.vy -= Math.sin(angle) * 60 * c;
}

function enemyShot(s: SimState, x: number, y: number, angle: number, speed: number, kind: Bullet['kind'] = 'orb', dmg = 12, r = 4.5, life = 6): Bullet {
  const sp = speed * (1 + 0.15 * cycleOf(s.wave));
  return shot(s, 'enemy', kind, x, y, angle, sp, dmg, r, life);
}

/** Aim at the ship with gravity in the sum, so the shot arrives curved. Falls back to straight at it. */
function aimAtShip(s: SimState, x: number, y: number, speed: number, err: number): number {
  const sh = s.ship;
  const sol = solveAim(s.planet, x, y, 0, 0, speed, sh.x, sh.y, sh.vx * 0.5, sh.vy * 0.5, 3, 30);
  const a = sol ? sol.angle : Math.atan2(sh.y - y, sh.x - x);
  return a + s.rng.range(-err, err);
}

// ---------------------------------------------------------------- damage

function burst(s: SimState, x: number, y: number, n: number, color: string, speed: number, size: number, life: number): void {
  for (let i = 0; i < n; i++) {
    const a = s.rng.range(0, Math.PI * 2);
    const v = s.rng.range(0.2, 1) * speed;
    s.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: s.rng.range(0.5, 1) * life, max: life, size: s.rng.range(0.6, 1.2) * size, color, grav: true });
  }
}

function explode(s: SimState, x: number, y: number, size: number, color: string): void {
  burst(s, x, y, Math.round(10 + size * 1.6), color, 120 + size * 6, 2.2, 0.9);
  burst(s, x, y, Math.round(6 + size * 0.6), '#fff6d8', 80 + size * 3, 3, 0.45);
  s.rings.push({ x, y, r: size * 0.6, grow: 120 + size * 6, life: 0.4, max: 0.4, color });
  s.rings.push({ x, y, r: 2, grow: 60 + size * 3, life: 0.25, max: 0.25, color: '#ffffff' });
  s.shake = Math.max(s.shake, Math.min(10, size * 0.25));
}

function killEnemy(s: SimState, e: Enemy, byPlanet: boolean): void {
  const def = ENEMIES[e.kind];
  e.hp = 0;
  s.kills++;
  const pts = Math.round(def.score * (1 + cycleOf(s.wave)) * (byPlanet ? 2 : 1));
  s.score += pts;
  s.floaters.push({ x: e.x, y: e.y - 10, text: byPlanet ? `+${pts} planet` : `+${pts}`, color: byPlanet ? '#ffcf5a' : '#ffffff', life: 0.9 });
  explode(s, e.x, e.y, e.kind === 'carrier' ? 90 : e.r * 1.6, def.color);
  if (e.kind === 'carrier') {
    for (let i = 0; i < 6; i++) explode(s, e.x + s.rng.range(-40, 40), e.y + s.rng.range(-20, 20), 30, '#ffd27a');
    s.shake = 14;
    s.sounds.push('bigboom');
  } else s.sounds.push(e.r > 12 ? 'boom' : 'pop');
  if (byPlanet) s.tally.planetKills++;
}

function hurtEnemy(s: SimState, e: Enemy, dmg: number, b: Bullet | null): void {
  if (e.hp <= 0) return;
  e.hp -= dmg;
  e.flash = 0.08;
  if (b) {
    s.tally.hits++;
    if (angleDiff(b.a0, Math.atan2(b.vy, b.vx)) > BENT) s.tally.bentHits++;
  }
  if (e.hp <= 0) killEnemy(s, e, false);
}

export type HurtSource = 'shot' | 'ram' | 'planet' | 'mine';

function hurtShip(s: SimState, dmg: number, src: HurtSource, b: Bullet | null = null): void {
  const sh = s.ship;
  if (sh.dead || sh.invuln > 0) return;
  sh.hp -= dmg;
  sh.invuln = 0.7;
  s.shake = Math.max(s.shake, 6);
  s.sounds.push('hurt');
  s.tally.hurts++;
  if (b && angleDiff(b.a0, Math.atan2(b.vy, b.vx)) > BENT) s.tally.bentHurts++;
  if (src === 'planet') s.tally.planetDamage += dmg;
  burst(s, sh.x, sh.y, 12, '#9fe8ff', 140, 2, 0.5);
  if (sh.hp <= 0) {
    sh.hp = 0;
    sh.dead = true;
    s.phase = 'dead';
    s.deadTime = 0;
    explode(s, sh.x, sh.y, 70, '#7fdcff');
    explode(s, sh.x, sh.y, 40, '#ffffff');
    s.shake = 16;
    s.sounds.push('bigboom');
    s.pod.mode = 'out';
  }
}

// ---------------------------------------------------------------- the step

export function step(s: SimState, inp: SimInput): void {
  s.time += DT;
  if (s.banner && (s.banner.life -= DT) <= 0) s.banner = null;
  s.shake = Math.max(0, s.shake - DT * 30);
  stepEffects(s);
  if (s.phase === 'dead') {
    s.deadTime += DT;
    stepBullets(s);
    stepEnemies(s);
    return;
  }
  if (s.phase === 'pick') return;
  s.waveTime += DT;
  for (let i = s.queue.length - 1; i >= 0; i--) {
    if (s.queue[i].at <= s.waveTime) {
      spawnGroup(s, s.queue[i]);
      s.queue.splice(i, 1);
    }
  }
  stepShip(s, inp);
  stepPod(s, inp);
  stepEnemies(s);
  stepBullets(s);
  collide(s);
  s.enemies = s.enemies.filter((e) => e.hp > 0 && e.x > -200 && e.x < W + 200 && e.y > -200 && e.y < H + 200);
  if (s.queue.length === 0 && s.enemies.length === 0 && s.phase === 'fight') {
    s.waveTallies.push(s.tally);
    s.phase = 'pick';
    s.offers = rollOffers(s);
    s.ship.charge = 0;
    // the sky clears: what is still in flight burns out as sparks
    for (const b of s.bullets) if (b.team === 'enemy') burst(s, b.x, b.y, 2, '#ff9bd0', 40, 1.5, 0.4);
    s.bullets = s.bullets.filter((b) => b.team === 'player');
    s.sounds.push('clear');
  }
}

function stepShip(s: SimState, inp: SimInput): void {
  const sh = s.ship;
  const p = s.planet;
  sh.invuln = Math.max(0, sh.invuln - DT);
  const g = gravity(p, sh.x, sh.y);
  // The engine: the stick asks for a velocity, the engine pushes toward it
  // up to its thrust. The pull is never cancelled for you: it adds on top.
  // A thumb off the stick is a free fall.
  const mag = Math.min(1, Math.hypot(inp.mx, inp.my));
  let ax = g.ax;
  let ay = g.ay;
  sh.thrust = 0;
  if (mag > 0.05) {
    const top = topSpeedOf(s);
    const dvx = (inp.mx / mag) * top * mag - sh.vx;
    const dvy = (inp.my / mag) * top * mag - sh.vy;
    const dv = Math.hypot(dvx, dvy) || 1;
    const t = thrustOf(s);
    const want = Math.min(t, dv * 5);
    ax += (dvx / dv) * want;
    ay += (dvy / dv) * want;
    sh.thrust = want / t;
  }
  sh.vx += ax * DT;
  sh.vy += ay * DT;
  // above top speed the excess bleeds away in about a second: a slingshot
  // gives a burst, not a new top speed
  const sp = Math.hypot(sh.vx, sh.vy);
  const cap = topSpeedOf(s) * 1.05;
  if (sp > cap) {
    const k = (cap + (sp - cap) * Math.exp(-1.6 * DT)) / sp;
    sh.vx *= k;
    sh.vy *= k;
  }
  sh.x += sh.vx * DT;
  sh.y += sh.vy * DT;
  // the arena edge is a soft wall
  const m = 14;
  if (sh.x < m) (sh.x = m), (sh.vx = Math.abs(sh.vx) * 0.3);
  if (sh.x > W - m) (sh.x = W - m), (sh.vx = -Math.abs(sh.vx) * 0.3);
  if (sh.y < m) (sh.y = m), (sh.vy = Math.abs(sh.vy) * 0.3);
  if (sh.y > H - m) (sh.y = H - m), (sh.vy = -Math.abs(sh.vy) * 0.3);
  // the planet: a hit hurts by how hard, and bounces
  const dx = sh.x - p.x;
  const dy = sh.y - p.y;
  const d = Math.hypot(dx, dy);
  if (d < p.r + SHIP_R) {
    const nx = dx / d;
    const ny = dy / d;
    const vn = sh.vx * nx + sh.vy * ny;
    sh.x = p.x + nx * (p.r + SHIP_R + 1);
    sh.y = p.y + ny * (p.r + SHIP_R + 1);
    if (vn < 0) {
      sh.vx -= 1.7 * vn * nx;
      sh.vy -= 1.7 * vn * ny;
    }
    burst(s, sh.x - nx * SHIP_R, sh.y - ny * SHIP_R, 16, '#ffb070', 160, 2.4, 0.6);
    hurtShip(s, Math.round(14 + Math.max(0, -vn) * 0.05), 'planet');
  }
  // the slingshot: in through the well, out fast
  const inWell = d < WELL;
  const speed = Math.hypot(sh.vx, sh.vy);
  if (inWell) s.wellSpeed = Math.max(s.wellSpeed, speed);
  if (s.inWell && !inWell) {
    if (s.wellSpeed > SLING_SPEED) {
      s.tally.slingshots++;
      s.score += 25;
      sh.charge = Math.min(1, sh.charge + 0.5);
      s.floaters.push({ x: sh.x, y: sh.y - 16, text: 'SLINGSHOT', color: '#7ff0ff', life: 1.1 });
      s.rings.push({ x: sh.x, y: sh.y, r: 8, grow: 140, life: 0.35, max: 0.35, color: '#7ff0ff' });
      s.sounds.push('sling');
    }
    s.wellSpeed = 0;
  }
  s.inWell = inWell;

  // the guns point where the right thumb drags, else at what the auto-aim picks
  const inherit = { vx: sh.vx * 0.5, vy: sh.vy * 0.5 };
  sh.gunCd -= DT;
  let aimAngle: number | null = null;
  if (inp.charging && inp.aimed) aimAngle = Math.atan2(inp.ay, inp.ax);
  if (sh.gunCd <= 0) {
    let a = aimAngle;
    if (a === null) {
      const aim = autoAim(s, sh.x, sh.y, shotSpeedOf(s), 1.0, inherit);
      a = aim ? aim.angle : null;
    }
    if (a !== null) {
      sh.angle = a;
      fireMain(s, a);
      sh.gunCd = fireInterval(s);
    } else sh.gunCd = 0.05;
  }
  if (aimAngle !== null) sh.angle = aimAngle;

  // the wave cannon: hold to charge, faster deep in the well
  sh.charging = inp.charging;
  if (inp.charging) sh.charge = Math.min(1, sh.charge + (DT / chargeTime(s)) * (d < WELL ? 1.8 : 1));
  if (inp.release) fireCharge(s, inp);

  // missiles: out of the racks, then they steer
  const ml = sh.upgrades.missiles;
  if (ml) {
    sh.missileCd -= DT;
    const target = nearestEnemy(s, sh.x, sh.y, 600);
    if (sh.missileCd <= 0 && target) {
      sh.missileCd = 1.0;
      const n = [0, 1, 2, 4][ml];
      for (let i = 0; i < n; i++) {
        const side = i % 2 ? 1 : -1;
        const a = sh.angle + side * (Math.PI / 2) * (0.7 + 0.3 * Math.floor(i / 2));
        const b = shot(s, 'player', 'missile', sh.x, sh.y, a, 160, 3, 3, 2.6, inherit);
        b.target = target.id;
      }
      s.sounds.push('missile');
    }
  }

  // bits: hover round the ship, block shots, fire with the main gun's aim
  const bl = sh.upgrades.bits;
  if (bl) {
    sh.bitCd -= DT;
    if (sh.bitCd <= 0 && s.enemies.length) {
      sh.bitCd = bl >= 3 ? 0.22 : 0.45;
      for (const bp of bitPositions(s)) shot(s, 'player', 'bit', bp.x, bp.y, sh.angle, 480, 0.8, 2, 0.9, inherit);
    }
  }
}

/** Where the bits are this moment. */
export function bitPositions(s: SimState): { x: number; y: number }[] {
  const sh = s.ship;
  const n = Math.min(2, sh.upgrades.bits);
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = s.time * 3 + i * Math.PI;
    out.push({ x: sh.x + Math.cos(a) * 24, y: sh.y + Math.sin(a) * 24 });
  }
  return out;
}

/** The pod docks on the nose, or flies free: launched, it falls round the planet like anything else. */
function stepPod(s: SimState, inp: SimInput): void {
  const pod = s.pod;
  const sh = s.ship;
  const p = s.planet;
  pod.t += DT;
  for (const [id, t] of pod.hitCd) if (t - DT <= 0) pod.hitCd.delete(id);
  else pod.hitCd.set(id, t - DT);
  if (inp.pod) {
    if (pod.mode === 'docked') {
      let a = sh.angle;
      if (inp.aimed) a = Math.atan2(inp.ay, inp.ax);
      else {
        const t = nearestEnemy(s, sh.x, sh.y);
        if (t) a = Math.atan2(t.y - sh.y, t.x - sh.x);
      }
      pod.mode = 'out';
      pod.t = 0;
      pod.vx = sh.vx + Math.cos(a) * 340;
      pod.vy = sh.vy + Math.sin(a) * 340;
      s.sounds.push('pod');
    } else if (pod.mode === 'out') {
      pod.mode = 'return';
      pod.t = 0;
      s.sounds.push('pod-back');
    }
  }
  const pl = sh.upgrades.podgun;
  if (pod.mode === 'docked') {
    pod.x = sh.x + Math.cos(sh.angle) * 17;
    pod.y = sh.y + Math.sin(sh.angle) * 17;
    pod.vx = sh.vx;
    pod.vy = sh.vy;
  } else {
    const g = gravity(p, pod.x, pod.y);
    pod.vx += g.ax * DT;
    pod.vy += g.ay * DT;
    if (pod.mode === 'return') {
      const dx = sh.x - pod.x;
      const dy = sh.y - pod.y;
      const d = Math.hypot(dx, dy) || 1;
      // home in, and brake the sideways drift so it does not orbit the ship
      const want = Math.min(420, d * 4);
      pod.vx += ((dx / d) * want - pod.vx) * Math.min(1, 6 * DT);
      pod.vy += ((dy / d) * want - pod.vy) * Math.min(1, 6 * DT);
      if (d < 18 || sh.dead) {
        if (!sh.dead) {
          pod.mode = 'docked';
          s.sounds.push('dock');
        }
      }
    }
    const sp = Math.hypot(pod.vx, pod.vy);
    if (sp > 420) {
      pod.vx *= 420 / sp;
      pod.vy *= 420 / sp;
    }
    pod.x += pod.vx * DT;
    pod.y += pod.vy * DT;
    // bounces off the planet and the edges; it cannot be destroyed
    const dx = pod.x - p.x;
    const dy = pod.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < p.r + POD_R) {
      const nx = dx / d;
      const ny = dy / d;
      const vn = pod.vx * nx + pod.vy * ny;
      pod.x = p.x + nx * (p.r + POD_R);
      pod.y = p.y + ny * (p.r + POD_R);
      if (vn < 0) {
        pod.vx -= 1.8 * vn * nx;
        pod.vy -= 1.8 * vn * ny;
      }
      burst(s, pod.x, pod.y, 6, '#ffb070', 90, 1.6, 0.4);
    }
    if (pod.x < POD_R || pod.x > W - POD_R) pod.vx = -pod.vx * 0.8;
    if (pod.y < POD_R || pod.y > H - POD_R) pod.vy = -pod.vy * 0.8;
    pod.x = Math.max(POD_R, Math.min(W - POD_R, pod.x));
    pod.y = Math.max(POD_R, Math.min(H - POD_R, pod.y));
  }
  if (sh.dead) return;
  pod.gunCd -= DT;
  if (pod.gunCd <= 0) {
    const t = nearestEnemy(s, pod.x, pod.y, 420);
    if (t) {
      pod.gunCd = pl >= 2 ? 0.28 : 0.45;
      const a = pod.mode === 'docked' ? sh.angle : Math.atan2(t.y - pod.y, t.x - pod.x);
      const fan = pl >= 3 ? [-0.3, -0.15, 0, 0.15, 0.3] : pl >= 1 ? [-0.18, 0, 0.18] : [0];
      for (const da of fan) shot(s, 'player', 'bit', pod.x, pod.y, a + da, 460, 1, 2.5, 0.8, { vx: pod.vx * 0.5, vy: pod.vy * 0.5 });
    } else pod.gunCd = 0.1;
  }
}

function steerTo(e: Enemy, tvx: number, tvy: number, thrust: number, gax: number, gay: number, cancelGravity: boolean): void {
  // the engine pushes toward the wanted velocity; a hoverer also pushes against the pull
  let ax = (tvx - e.vx) * 3;
  let ay = (tvy - e.vy) * 3;
  if (cancelGravity) {
    ax -= gax;
    ay -= gay;
  }
  const a = Math.hypot(ax, ay);
  if (a > thrust) {
    ax *= thrust / a;
    ay *= thrust / a;
  }
  e.vx += ax * DT;
  e.vy += ay * DT;
}

function stepEnemies(s: SimState): void {
  const p = s.planet;
  const sh = s.ship;
  const straggling = s.queue.length === 0 && s.enemies.length <= 3;
  for (const e of s.enemies) {
    if (e.hp <= 0) continue;
    e.t += DT;
    e.flash = Math.max(0, e.flash - DT);
    const entering = e.entering > 0;
    e.entering = Math.max(0, e.entering - DT);
    const def = ENEMIES[e.kind];
    const g = gravity(p, e.x, e.y);
    const gx = entering ? 0 : g.ax;
    const gy = entering ? 0 : g.ay;
    e.gunCd -= DT;
    const alive = !sh.dead;
    switch (e.kind) {
      case 'dart': {
        // falls round its orbit with no engine; after its turn, peels off and dives the ship
        const peel = e.gunCd < 0;
        // a chain in orbit fires slow shots at the ship as it comes round
        e.burst -= DT;
        if (!peel && !entering && alive && e.burst <= 0) {
          e.burst = 2.6 + e.seed * 1.6;
          if (Math.hypot(sh.x - e.x, sh.y - e.y) < 420) enemyShot(s, e.x, e.y, aimAtShip(s, e.x, e.y, 150, 0.1), 150, 'orb', 8, 4);
        }
        if (peel && alive) {
          const lead = 0.4;
          const dx = sh.x + sh.vx * lead - e.x;
          const dy = sh.y + sh.vy * lead - e.y;
          const d = Math.hypot(dx, dy) || 1;
          steerTo(e, (dx / d) * 230, (dy / d) * 230, def.thrust, gx, gy, false);
          if (e.gunCd < -0.6 && e.gunCd > -0.6 - DT * 1.5 && d < 360) {
            enemyShot(s, e.x, e.y, aimAtShip(s, e.x, e.y, 170, 0.12), 170);
          }
          // a dart that has dived for long climbs back into an orbit and tries again
          if (e.gunCd < -4.5) e.gunCd = 2 + e.seed * 2;
        }
        e.vx += gx * DT;
        e.vy += gy * DT;
        break;
      }
      case 'lancer': {
        // the last ones left close in, so a wave never waits on one at the far edge
        if (straggling && Math.floor(e.t / 3) !== Math.floor((e.t - DT) / 3)) {
          const a = s.rng.range(0, Math.PI * 2);
          e.hx = Math.max(60, Math.min(W - 60, sh.x + Math.cos(a) * 200));
          e.hy = Math.max(60, Math.min(H - 60, sh.y + Math.sin(a) * 200));
        } else if (e.t > 6 && Math.floor(e.t / 6) !== Math.floor((e.t - DT) / 6)) {
          e.hy = Math.max(60, Math.min(H - 60, e.hy + s.rng.range(-120, 120)));
          e.hx = Math.max(60, Math.min(W - 60, e.hx + s.rng.range(-60, 60)));
        }
        const dx = e.hx - e.x;
        const dy = e.hy - e.y;
        const d = Math.hypot(dx, dy) || 1;
        const v = Math.min(150, d * 1.6);
        steerTo(e, (dx / d) * v, (dy / d) * v, def.thrust, gx, gy, true);
        e.vx += gx * DT;
        e.vy += gy * DT;
        // a burst of three, aimed with the pull in the sum
        if (e.gunCd <= 0 && !entering && alive) {
          enemyShot(s, e.x, e.y, aimAtShip(s, e.x, e.y, 185, 0.05), 185);
          s.sounds.push('eshot');
          e.burst++;
          e.gunCd = e.burst % 3 === 0 ? 2.4 + e.seed : 0.16;
        }
        break;
      }
      case 'diver': {
        if (!entering && alive) {
          const lead = 0.25;
          const dx = sh.x + sh.vx * lead - e.x;
          const dy = sh.y + sh.vy * lead - e.y;
          const d = Math.hypot(dx, dy) || 1;
          steerTo(e, (dx / d) * 300, (dy / d) * 300, def.thrust, gx, gy, false);
        }
        e.vx += gx * DT;
        e.vy += gy * DT;
        break;
      }
      case 'spinner': {
        // a slow circle of its own round the planet, rings of shots
        e.phase += (DT * 0.16) / (1 + e.seed);
        const tx = p.x + Math.cos(e.phase) * e.hx * 1.5;
        const ty = p.y + Math.sin(e.phase) * e.hx * 0.75;
        steerTo(e, (tx - e.x) * 1.5, (ty - e.y) * 1.5, def.thrust * 3, gx, gy, true);
        e.vx += gx * DT;
        e.vy += gy * DT;
        if (e.gunCd <= 0 && !entering && alive) {
          e.gunCd = 2.4;
          const n = 12;
          const rot = e.t * 0.7;
          for (let i = 0; i < n; i++) enemyShot(s, e.x, e.y, rot + (i / n) * Math.PI * 2, 105, 'orb', 9, 4.5, 7);
          s.sounds.push('ering');
        }
        break;
      }
      case 'miner': {
        if (straggling) e.hx += (sh.x - e.hx) * DT * 0.5;
        const tx = e.hx + Math.sin(e.t * 0.4 + e.seed * 6) * 140;
        const ty = e.hy;
        steerTo(e, (tx - e.x) * 1.2, (ty - e.y) * 1.2, def.thrust, gx, gy, true);
        e.vx += gx * DT;
        e.vy += gy * DT;
        if (e.gunCd <= 0 && !entering && alive) {
          e.gunCd = 2.2;
          // a mine thrown sideways into an orbit that sinks toward the planet
          const rx = e.x - p.x;
          const ry = e.y - p.y;
          const r = Math.hypot(rx, ry);
          const dir = e.seed > 0.5 ? 1 : -1;
          const v = orbitSpeed(r) * 0.75;
          const m = shot(s, 'enemy', 'mine', e.x, e.y, Math.atan2(rx * dir, -ry * dir), v, 18, 6, 14);
          m.pierce = 2;
          s.sounds.push('mine');
        }
        break;
      }
      case 'carrier': {
        if (entering) {
          e.vx = -90;
          e.vy = 0;
          break;
        }
        // a long slow ellipse round the planet, on rails
        e.phase += DT * 0.16;
        const tx = p.x + Math.cos(e.phase) * 300;
        const ty = p.y + Math.sin(e.phase) * 140;
        e.vx = (tx - e.x) * 2;
        e.vy = (ty - e.y) * 2;
        if (!alive) break;
        const k = Math.floor(e.t * 60) % 600;
        if (k === 0 || k === 300) {
          for (let i = 0; i < 16; i++) enemyShot(s, e.x, e.y, e.t + (i / 16) * Math.PI * 2, 110, 'orb', 10, 5, 7);
          s.sounds.push('ering');
        }
        if (k % 80 === 40) {
          for (const side of [-1, 1]) {
            const ox = e.x + side * 26;
            enemyShot(s, ox, e.y, aimAtShip(s, ox, e.y, 190, 0.04), 190);
          }
          s.sounds.push('eshot');
        }
        if (k === 150 && s.enemies.filter((o) => o.kind === 'dart').length < 6) {
          for (let i = 0; i < 3; i++) {
            const d = addEnemy(s, 'dart', e.x, e.y, e.vx + s.rng.range(-60, 60), e.vy + s.rng.range(-60, 60));
            d.gunCd = -0.1;
            d.entering = 0.3;
          }
        }
        break;
      }
    }
    e.x += e.vx * DT;
    e.y += e.vy * DT;
    const sp = Math.hypot(e.vx, e.vy);
    if (e.kind !== 'carrier' && sp > 20) e.angle = Math.atan2(e.vy, e.vx);
    if (e.kind === 'carrier') e.angle = 0;
    // keep the ones that hover inside
    if (!entering && e.kind !== 'dart' && e.kind !== 'diver') {
      e.x = Math.max(e.r, Math.min(W - e.r, e.x));
      e.y = Math.max(e.r, Math.min(H - e.r, e.y));
    }
    // darts and divers that leave the arena come back in
    if (!entering && (e.kind === 'dart' || e.kind === 'diver')) {
      if (e.x < -30 || e.x > W + 30) e.vx = -e.vx * 0.6;
      if (e.y < -30 || e.y > H + 30) e.vy = -e.vy * 0.6;
    }
    // the planet takes anything that hits it
    if (!entering && e.kind !== 'carrier' && Math.hypot(e.x - p.x, e.y - p.y) < p.r + e.r * 0.6) {
      killEnemy(s, e, true);
    }
  }
}

function stepBullets(s: SimState): void {
  const p = s.planet;
  const byId = new Map(s.enemies.map((e) => [e.id, e]));
  for (const b of s.bullets) {
    b.life -= DT;
    const g = gravity(p, b.x, b.y);
    b.vx += g.ax * DT;
    b.vy += g.ay * DT;
    if (b.kind === 'missile') {
      let t = byId.get(b.target);
      if (!t || t.hp <= 0) {
        const n = nearestEnemy(s, b.x, b.y, 400);
        if (n) {
          t = n;
          b.target = n.id;
        }
      }
      if (t) {
        const dx = t.x - b.x;
        const dy = t.y - b.y;
        const d = Math.hypot(dx, dy) || 1;
        b.vx += (dx / d) * 520 * DT;
        b.vy += (dy / d) * 520 * DT;
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > 340) {
          b.vx *= 340 / sp;
          b.vy *= 340 / sp;
        }
      }
    }
    if (b.kind === 'mine' && !s.ship.dead) {
      // a mine drifts toward a ship that comes close
      const dx = s.ship.x - b.x;
      const dy = s.ship.y - b.y;
      const d = Math.hypot(dx, dy);
      if (d < 80) {
        b.vx += (dx / d) * 160 * DT;
        b.vy += (dy / d) * 160 * DT;
      }
    }
    b.x += b.vx * DT;
    b.y += b.vy * DT;
    if (Math.round(s.time * 60) % 2 === 0) {
      b.trail.push(b.x, b.y);
      if (b.trail.length > 20) b.trail.splice(0, 2);
    }
    if (g.r < p.r + b.r * 0.5) {
      b.life = 0;
      burst(s, b.x, b.y, b.kind === 'charge' ? 14 : 3, b.team === 'player' ? '#9fe8ff' : '#ffb0d8', 60, 1.4, 0.35);
    }
    if (b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30) b.life = 0;
  }
  s.bullets = s.bullets.filter((b) => b.life > 0);
}

function collide(s: SimState): void {
  const sh = s.ship;
  const pod = s.pod;
  const bits = bitPositions(s);
  for (const b of s.bullets) {
    if (b.life <= 0) continue;
    if (b.team === 'player') {
      for (const e of s.enemies) {
        if (e.hp <= 0 || e.entering > 0.3) continue;
        if (b.hit && b.hit.includes(e.id)) continue;
        const dx = e.x - b.x;
        const dy = e.y - b.y;
        if (dx * dx + dy * dy > (e.r + b.r) ** 2) continue;
        if (b.kind === 'charge') {
          // the charge pierces: it spends its damage on what it kills and flies on
          const spend = Math.min(b.pierce, e.hp);
          hurtEnemy(s, e, b.pierce, b);
          b.pierce -= spend;
          b.hit!.push(e.id);
          s.rings.push({ x: b.x, y: b.y, r: 4, grow: 80, life: 0.2, max: 0.2, color: '#bff4ff' });
          if (b.pierce <= 0.5) b.life = 0;
        } else {
          hurtEnemy(s, e, b.dmg, b);
          b.life = 0;
          burst(s, b.x, b.y, 2, '#bff4ff', 70, 1.3, 0.2);
        }
        if (b.life <= 0) break;
      }
      // player shots break mines
      if (b.life > 0) {
        for (const m of s.bullets) {
          if (m.kind !== 'mine' || m.life <= 0) continue;
          if (Math.hypot(m.x - b.x, m.y - b.y) < m.r + b.r + 2) {
            m.pierce -= b.dmg;
            if (b.kind !== 'charge') b.life = 0;
            if (m.pierce <= 0) {
              m.life = 0;
              s.score += 5;
              explode(s, m.x, m.y, 14, '#ffe066');
              s.sounds.push('pop');
            }
            break;
          }
        }
      }
      continue;
    }
    // enemy shots: the pod and the bits eat them
    if (b.kind !== 'mine') {
      if (Math.hypot(pod.x - b.x, pod.y - b.y) < POD_R + b.r) {
        b.life = 0;
        burst(s, b.x, b.y, 3, '#ffd9a0', 60, 1.3, 0.25);
        continue;
      }
      let eaten = false;
      for (const bp of bits) {
        if (Math.hypot(bp.x - b.x, bp.y - b.y) < BIT_R + b.r) {
          eaten = true;
          break;
        }
      }
      if (eaten) {
        b.life = 0;
        burst(s, b.x, b.y, 3, '#ffd9a0', 60, 1.3, 0.25);
        continue;
      }
    }
    if (sh.dead) continue;
    if (Math.hypot(sh.x - b.x, sh.y - b.y) < SHIP_R * 0.7 + b.r) {
      if (sh.invuln > 0) continue;
      b.life = 0;
      if (b.kind === 'mine') explode(s, b.x, b.y, 16, '#ffe066');
      hurtShip(s, b.dmg, b.kind === 'mine' ? 'mine' : 'shot', b);
    }
  }
  // bodies
  for (const e of s.enemies) {
    if (e.hp <= 0 || e.entering > 0.3) continue;
    // the launched pod rams
    if (pod.mode !== 'docked' && !pod.hitCd.has(e.id) && Math.hypot(e.x - pod.x, e.y - pod.y) < e.r + POD_R) {
      pod.hitCd.set(e.id, 0.3);
      hurtEnemy(s, e, 4 + 2 * sh.upgrades.podgun, null);
      burst(s, pod.x, pod.y, 6, '#ffe2a8', 120, 1.8, 0.3);
      s.sounds.push('clang');
    }
    if (sh.dead || e.hp <= 0) continue;
    if (Math.hypot(e.x - sh.x, e.y - sh.y) < e.r + SHIP_R * 0.8) {
      const def = ENEMIES[e.kind];
      if (sh.invuln <= 0) hurtShip(s, def.ram, 'ram');
      if (e.kind !== 'carrier') hurtEnemy(s, e, 10, null);
    }
  }
  s.bullets = s.bullets.filter((b) => b.life > 0);
}

function stepEffects(s: SimState): void {
  const p = s.planet;
  for (const q of s.particles) {
    q.life -= DT;
    if (q.grav) {
      const g = gravity(p, q.x, q.y);
      q.vx += g.ax * DT;
      q.vy += g.ay * DT;
      if (g.r < p.r) q.life = 0;
    }
    q.vx *= 1 - 0.6 * DT;
    q.vy *= 1 - 0.6 * DT;
    q.x += q.vx * DT;
    q.y += q.vy * DT;
  }
  s.particles = s.particles.filter((q) => q.life > 0);
  if (s.particles.length > 700) s.particles.splice(0, s.particles.length - 700);
  for (const r of s.rings) {
    r.life -= DT;
    r.r += r.grow * DT;
  }
  s.rings = s.rings.filter((r) => r.life > 0);
  for (const f of s.floaters) {
    f.life -= DT;
    f.y -= 30 * DT;
  }
  s.floaters = s.floaters.filter((f) => f.life > 0);
}

/** The radius below which the base engine cannot climb out. The renderer draws it. */
export { NO_RETURN };
