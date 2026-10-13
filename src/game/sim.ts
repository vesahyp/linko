import { CARDS, CARD_BY_ID, CRYSTAL_GUN, ENEMIES, STAGES, heightAt, type CardId, type DropKind, type EnemyKind, type Line } from './content';
import { createState, DT, H, W, SCROLL_SPEED, newTally, type Bullet, type Enemy, type Part, type SimInput, type SimState } from './state';
import { burst, explode, floater } from './fx';
import { aimAt, enemyShot, fan, ring, shot } from './patterns';
import { makeBoss, stepBoss } from './bosses';

export { DT };

/** The ship's hitbox: small, under a sprite about 30 units long. */
export const SHIP_R = 4;
export const POD_R = 10;
const BIT_R = 6;

// ---------------------------------------------------------------- runs and stages

export function newRun(seed: number, stage = 1): SimState {
  const s = createState(seed);
  startStage(s, stage, 0);
  return s;
}

/**
 * A continue: the same stage from its start, the build kept, the hull full,
 * the score back to nothing.
 */
export function continueRun(prev: SimState): SimState {
  const s = createState((prev.seed + 7919) >>> 0);
  const sh = s.ship;
  const p = prev.ship;
  sh.gun = p.gun;
  sh.gunLevel = p.gunLevel;
  sh.speed = p.speed;
  sh.missiles = p.missiles;
  sh.bits = p.bits;
  sh.cards = { ...p.cards };
  sh.maxHp = 100 + 40 * sh.cards.plates;
  sh.hp = sh.maxHp;
  startStage(s, prev.stage, prev.loop);
  return s;
}

export function startStage(s: SimState, stage: number, loop: number): void {
  s.stage = stage;
  s.loop = loop;
  s.stageTime = 0;
  s.scroll = 0;
  s.cursor = 0;
  s.boss = null;
  s.phase = 'play';
  s.phaseTime = 0;
  s.enemies = [];
  s.bullets = s.bullets.filter((b) => b.team === 'player');
  s.beams = [];
  s.formations.clear();
  s.tally = newTally();
  const def = STAGES[stage - 1];
  s.banner = { text: `Stage ${stage}${loop ? ` · round ${loop + 1}` : ''}`, sub: def.name, life: 2.6 };
  s.sounds.push('stage');
}

/** The floor's top edge on screen at x, or H with no floor there. */
export function floorY(s: SimState, x: number): number {
  return H - heightAt(STAGES[s.stage - 1].floor, s.scroll + x);
}
/** The ceiling's bottom edge on screen at x, or 0. */
export function ceilY(s: SimState, x: number): number {
  return heightAt(STAGES[s.stage - 1].ceil, s.scroll + x);
}

// ---------------------------------------------------------------- the cards

/** Three cards, none at its last level. */
export function rollOffers(s: SimState): CardId[] {
  const open = CARDS.filter((c) => s.ship.cards[c.id] < c.levels.length).map((c) => c.id);
  s.rng.shuffle(open);
  return open.slice(0, 3);
}

export function applyCard(s: SimState, id: CardId): void {
  const sh = s.ship;
  sh.cards[id] = Math.min(CARD_BY_ID[id].levels.length, sh.cards[id] + 1);
  if (id === 'plates') {
    sh.maxHp = 100 + 40 * sh.cards.plates;
    sh.hp = sh.maxHp;
  }
  s.sounds.push('upgrade');
}

/** The pick after a boss: the card, then the next stage. */
export function pickCard(s: SimState, id: CardId): void {
  if (s.phase !== 'pick') return;
  applyCard(s, id);
  s.offers = [];
  s.ship.invuln = Math.max(s.ship.invuln, 1.5);
  if (s.stage === STAGES.length) startStage(s, 1, s.loop + 1);
  else startStage(s, s.stage + 1, s.loop);
}

// ---------------------------------------------------------------- numbers

export function topSpeed(s: SimState): number {
  return 330 + 60 * s.ship.speed;
}
export function chargeTime(s: SimState): number {
  return 1.0 / (1 + [0, 0.3, 0.55, 0.8][s.ship.cards.capacitor]);
}
const fireRate = (s: SimState) => 1 + 0.2 * s.ship.cards.overdrive;
/** Enemies get tougher stage by stage, as the ship does, and again each loop. */
const hpMul = (s: SimState) => (1 + 0.5 * s.loop) * (1 + 0.3 * (s.stage - 1));

// ---------------------------------------------------------------- spawning

export function addEnemy(s: SimState, kind: EnemyKind, x: number, y: number, vx: number, vy: number): Enemy {
  const d = ENEMIES[kind];
  const hp = d.hp * hpMul(s);
  const e: Enemy = {
    id: s.nextId++,
    kind,
    x,
    y,
    vx,
    vy,
    hp,
    maxHp: hp,
    r: d.r,
    angle: Math.PI,
    t: 0,
    gunCd: s.rng.range(0.8, 2),
    burst: 0,
    flash: 0,
    formation: 0,
    index: 0,
    y0: y,
    d: 0,
    anchor: null,
    drop: null,
    seed: s.rng.next(),
    parts: null,
    phase: 0,
    trail: null,
  };
  s.enemies.push(e);
  return e;
}

function newFormation(s: SimState, n: number): number {
  const id = s.nextId++;
  s.formations.set(id, { left: n, escaped: false, size: n });
  return id;
}

function runLine(s: SimState, ln: Line): void {
  const y = (ln.y ?? 0.5) * H;
  const n = ln.n ?? 1;
  switch (ln.form) {
    case 'snake': {
      const f = newFormation(s, n);
      for (let i = 0; i < n; i++) {
        const e = addEnemy(s, 'popcorn', W + 20 + i * 30, y, -150, 0);
        e.formation = f;
        e.index = i;
        e.gunCd = 1.2 + s.rng.range(0, 3);
      }
      break;
    }
    case 'wall': {
      // a column with a gap two slots wide: shoot through it or fly through the gap
      const f = newFormation(s, n);
      const gap = s.rng.int(1, n - 2);
      const top = ceilY(s, W) + 24;
      const bottom = floorY(s, W) - 24;
      let k = 0;
      for (let i = 0; i < n + 2; i++) {
        if (i === gap || i === gap + 1) continue;
        const e = addEnemy(s, 'popcorn', W + 20, top + ((bottom - top) * i) / (n + 1), -110, 0);
        e.formation = f;
        e.index = k++;
        e.phase = 1;
        e.gunCd = 99;
      }
      s.formations.get(f)!.left = k;
      s.formations.get(f)!.size = k;
      break;
    }
    case 'v': {
      const f = newFormation(s, n);
      for (let i = 0; i < n; i++) {
        const side = i % 2 ? 1 : -1;
        const row = Math.ceil(i / 2);
        const e = addEnemy(s, 'swooper', W + 20 + row * 26, y + side * row * 24, -210, 0);
        e.formation = f;
        e.index = i;
        e.gunCd = 0.6 + row * 0.15;
      }
      break;
    }
    case 'rear': {
      // from behind: they cross the screen, turn and come back at the ship
      const f = newFormation(s, n);
      for (let i = 0; i < n; i++) {
        const e = addEnemy(s, 'chaser', -20 - i * 34, y + (i - (n - 1) / 2) * 30, 260, 0);
        e.formation = f;
        e.index = i;
      }
      s.sounds.push('warn-rear');
      floater(s, 30, y - 30, '◀ behind', '#c86bff');
      break;
    }
    case 'gunship': {
      const e = addEnemy(s, 'gunship', W + 30, y, -120, 0);
      e.y0 = y;
      e.gunCd = 1.2;
      break;
    }
    case 'carrier': {
      const e = addEnemy(s, 'carrier', W + 20, y, -70, 0);
      e.drop = ln.drop ?? 'red';
      break;
    }
    case 'spinner': {
      const e = addEnemy(s, 'spinner', W + 20, y, -90, 0);
      e.y0 = y;
      e.gunCd = 1;
      break;
    }
    case 'turret': {
      const at = ln.at ?? 'floor';
      const d = s.scroll + W + 20;
      const def = STAGES[s.stage - 1];
      const h = heightAt(at === 'floor' ? def.floor : def.ceil, d);
      if (h <= 0) break;
      const e = addEnemy(s, 'turret', W + 20, at === 'floor' ? H - h - 9 : h + 9, -SCROLL_SPEED, 0);
      e.anchor = at;
      e.d = d;
      e.gunCd = 1 + s.rng.range(0, 1);
      break;
    }
    case 'boss': {
      const kind = STAGES[s.stage - 1].boss;
      const b = makeBoss(s, kind);
      s.boss = b.id;
      s.banner = { text: 'Warning', sub: ENEMIES[kind].name, life: 2.6 };
      s.sounds.push('alarm');
      break;
    }
  }
}

// ---------------------------------------------------------------- damage and drops

function dropAt(s: SimState, x: number, y: number, kind: DropKind): void {
  s.drops.push({ x: Math.min(W - 30, x), y, kind, t: 0 });
}

/** A whole formation shot down drops something, picked by what the ship lacks. */
function formationDrop(s: SimState): DropKind {
  const sh = s.ship;
  const pool: [DropKind, number][] = [
    ['red', 1],
    ['blue', 1],
    ['yellow', 1],
    ['speed', sh.speed < 3 ? 1.2 : 0],
    ['missile', sh.missiles < 2 ? 1.2 : 0],
    ['bit', sh.bits < 2 ? 1.2 : 0],
    ['repair', sh.hp < sh.maxHp * 0.7 ? 2.5 : 0.3],
  ];
  return s.rng.weighted(pool, (p) => p[1])[0];
}

export function killEnemy(s: SimState, e: Enemy, byPlayer = true): void {
  if (e.hp <= -1e8) return;
  const def = ENEMIES[e.kind];
  e.hp = -1e9;
  if (!byPlayer) return;
  s.kills++;
  const pts = Math.round(def.score * (1 + s.loop));
  s.score += pts;
  floater(s, e.x, e.y - 12, `+${pts}`);
  explode(s, e.x, e.y, e.r * 1.8, def.color);
  s.sounds.push(e.r >= 14 ? 'boom' : 'pop');
  if (e.drop) dropAt(s, e.x, e.y, e.drop);
  if (e.formation) {
    const f = s.formations.get(e.formation);
    if (f) {
      f.left--;
      if (f.left <= 0 && !f.escaped && f.size >= 4) {
        s.tally.formations++;
        const bonus = 100 * f.size * (1 + s.loop);
        s.score += bonus;
        floater(s, e.x, e.y - 26, `ALL ${f.size}! +${bonus}`, '#ffe066');
        // one wiped formation in three leaves a power-up; the carriers are the sure ones
        if (s.rng.chance(0.33)) dropAt(s, e.x, e.y, formationDrop(s));
        s.sounds.push('bonus');
      }
    }
  }
}

function escape(s: SimState, e: Enemy): void {
  e.hp = -1e9;
  if (!e.formation) return;
  const f = s.formations.get(e.formation);
  if (f) {
    f.escaped = true;
    f.left--;
  }
}

export function hurtEnemy(s: SimState, e: Enemy, dmg: number): void {
  if (e.hp <= 0) return;
  e.hp -= dmg;
  e.flash = 0.07;
  s.tally.hits++;
  if (e.hp <= 0) killEnemy(s, e);
}

/** A hit on a boss part. Returns false when armour (or a shut weak point) turned it away. */
export function hurtPart(s: SimState, e: Enemy, p: Part, dmg: number, x: number, y: number): boolean {
  if (p.kind === 'armor' || (p.kind === 'weak' && !p.open)) {
    s.tally.pings++;
    burst(s, x, y, 2, '#d8e4ff', 90, 1.4, 0.15);
    s.sounds.push('ping');
    return false;
  }
  p.flash = 0.07;
  s.tally.hits++;
  if (p.kind === 'weak') {
    e.hp -= dmg;
    p.hp = e.hp;
    e.flash = 0.07;
    return true;
  }
  p.hp -= dmg;
  if (p.hp <= 0 && !p.dead) {
    p.dead = true;
    const px = e.x + p.ox;
    const py = e.y + p.oy;
    explode(s, px, py, 40, '#ffb070');
    const pts = 500 * (1 + s.loop);
    s.score += pts;
    floater(s, px, py - 14, `+${pts}`, '#ffe066');
    s.sounds.push('boom');
    if (p.name.startsWith('gun') || p.name.startsWith('turret')) dropAt(s, px, py, formationDrop(s));
  }
  return true;
}

export type HurtSource = 'shot' | 'ram' | 'wall' | 'beam';

export function hurtShip(s: SimState, dmg: number, src: HurtSource): void {
  const sh = s.ship;
  if (sh.dead || sh.invuln > 0) return;
  sh.hp -= dmg;
  s.tally.hurtBy[src] = (s.tally.hurtBy[src] ?? 0) + dmg;
  sh.invuln = 1.0;
  s.shake = Math.max(s.shake, 7);
  s.flash = Math.max(s.flash, 0.25);
  s.sounds.push('hurt');
  s.tally.hurts++;
  burst(s, sh.x, sh.y, 14, '#9fe8ff', 150, 2, 0.5);
  if (sh.hp <= 0) {
    sh.hp = 0;
    sh.dead = true;
    s.phase = 'dead';
    s.phaseTime = 0;
    explode(s, sh.x, sh.y, 80, '#7fdcff');
    explode(s, sh.x, sh.y, 40, '#ffffff');
    s.shake = 16;
    s.flash = 0.8;
    s.sounds.push('bigboom');
  }
}

// ---------------------------------------------------------------- the step

export function step(s: SimState, inp: SimInput): void {
  s.time += DT;
  if (s.banner && (s.banner.life -= DT) <= 0) s.banner = null;
  s.shake = Math.max(0, s.shake - DT * 30);
  s.flash = Math.max(0, s.flash - DT * 2.5);
  s.scroll += SCROLL_SPEED * DT;
  stepEffects(s);
  if (s.phase === 'pick') return;
  if (s.phase === 'dead') {
    s.phaseTime += DT;
    stepBullets(s);
    stepEnemies(s);
    return;
  }
  if (s.phase === 'clear') {
    s.phaseTime += DT;
    stepShip(s, inp);
    stepPod(s, inp);
    stepBullets(s);
    stepDrops(s);
    if (s.phaseTime > 3.2) {
      s.stageTallies.push(s.tally);
      s.phase = 'pick';
      s.offers = rollOffers(s);
    }
    return;
  }
  s.stageTime += DT;
  const script = STAGES[s.stage - 1].script;
  while (s.cursor < script.length && script[s.cursor].t <= s.stageTime) runLine(s, script[s.cursor++]);
  stepShip(s, inp);
  stepPod(s, inp);
  stepEnemies(s);
  stepBullets(s);
  stepBeams(s);
  stepDrops(s);
  collide(s);
  s.enemies = s.enemies.filter((e) => e.hp > 0);
  let shots = 0;
  for (const b of s.bullets) if (b.team === 'enemy') shots++;
  s.tally.peakShots = Math.max(s.tally.peakShots, shots);
}

/** The boss is dead: the screen clears, a pause, then the cards. */
export function bossDown(s: SimState, e: Enemy): void {
  e.hp = -1e9;
  s.kills++;
  const pts = ENEMIES[e.kind].score * (1 + s.loop);
  s.score += pts;
  s.tally.bosses++;
  s.tally.bossTime = e.t;
  s.boss = null;
  s.phase = 'clear';
  s.phaseTime = 0;
  for (let i = 0; i < 10; i++) explode(s, e.x + s.rng.range(-60, 60), e.y + s.rng.range(-60, 60), s.rng.range(30, 70), i % 2 ? '#ffd27a' : ENEMIES[e.kind].color);
  explode(s, e.x, e.y, 120, '#ffffff');
  s.shake = 18;
  s.flash = 1;
  floater(s, e.x, e.y - 40, `+${pts}`, '#ffe066');
  for (const b of s.bullets) if (b.team === 'enemy') burst(s, b.x, b.y, 2, '#ffb0d8', 40, 1.5, 0.4);
  s.bullets = s.bullets.filter((b) => b.team === 'player');
  s.beams = [];
  for (const o of s.enemies) if (o !== e && o.hp > 0) killEnemy(s, o);
  s.ship.hp = Math.min(s.ship.maxHp, s.ship.hp + 20);
  s.banner = { text: 'Stage clear', sub: `${ENEMIES[e.kind].name} down · hull +20`, life: 3 };
  s.sounds.push('bigboom', 'clear');
}

function stepShip(s: SimState, inp: SimInput): void {
  const sh = s.ship;
  if (sh.dead) return;
  sh.invuln = Math.max(0, sh.invuln - DT);
  const top = topSpeed(s);
  const ox = sh.x;
  const oy = sh.y;
  if (inp.target) {
    // the drag: fly at the point, as fast as the engine allows
    const dx = inp.target.x - sh.x;
    const dy = inp.target.y - sh.y;
    const d = Math.hypot(dx, dy);
    const stepLen = top * DT;
    if (d <= stepLen) {
      sh.x = inp.target.x;
      sh.y = inp.target.y;
    } else {
      sh.x += (dx / d) * stepLen;
      sh.y += (dy / d) * stepLen;
    }
  } else if (inp.mx || inp.my) {
    sh.x += inp.mx * top * 0.8 * DT;
    sh.y += inp.my * top * 0.8 * DT;
  }
  sh.x = Math.max(16, Math.min(W - 16, sh.x));
  sh.y = Math.max(12, Math.min(H - 12, sh.y));
  // the terrain: a scrape hurts and pushes off
  const fy = floorY(s, sh.x);
  const cy = ceilY(s, sh.x);
  if (sh.y > fy - 6) {
    sh.y = fy - 7;
    if (sh.invuln <= 0) burst(s, sh.x, fy, 10, '#ffb070', 120, 2, 0.4);
    hurtShip(s, 10, 'wall');
  }
  if (sh.y < cy + 6) {
    sh.y = cy + 7;
    if (sh.invuln <= 0) burst(s, sh.x, cy, 10, '#ffb070', 120, 2, 0.4);
    hurtShip(s, 10, 'wall');
  }
  sh.vx = (sh.x - ox) / DT;
  sh.vy = (sh.y - oy) / DT;

  // bits trail the ship, one above and one below
  for (let i = 0; i < 2; i++) {
    const bp = sh.bitPos[i];
    const tx = sh.x - 6;
    const ty = sh.y + (i ? 30 : -30);
    bp.x += (tx - bp.x) * Math.min(1, 9 * DT);
    bp.y += (ty - bp.y) * Math.min(1, 9 * DT);
  }

  // the main gun fires by itself
  sh.gunCd -= DT;
  if (sh.gunCd <= 0) fireGun(s);

  // the wave cannon
  sh.charging = inp.charging;
  if (inp.charging) {
    const before = sh.charge;
    sh.charge = Math.min(1, sh.charge + DT / chargeTime(s));
    if (before < 1 && sh.charge >= 1) s.sounds.push('charged');
  }
  if (inp.release) fireCharge(s);

  // missiles
  if (sh.missiles) {
    sh.missileCd -= DT;
    if (sh.missileCd <= 0 && s.enemies.length) {
      sh.missileCd = 0.9;
      for (let i = 0; i < sh.missiles; i++) {
        const b = shot(s, 'player', 'missile', sh.x, sh.y, i ? -0.9 : 0.9, 220, 3, 3, 2.4);
        b.target = -1;
      }
      s.sounds.push('missile');
    }
  }
  // bits fire forward
  if (sh.bits) {
    sh.bitCd -= DT;
    if (sh.bitCd <= 0) {
      sh.bitCd = 0.28 / fireRate(s);
      for (let i = 0; i < sh.bits; i++) shot(s, 'player', 'bit', sh.bitPos[i].x + 6, sh.bitPos[i].y, 0, 650, 0.8, 2.5, 1.3);
    }
  }
}

/** The main gun: its type from the last crystal, its level from how many of that colour. */
function fireGun(s: SimState): void {
  const sh = s.ship;
  const L = sh.gunLevel;
  const x = sh.x + 16;
  const y = sh.y;
  const rate = fireRate(s);
  switch (sh.gun) {
    case 'vulcan': {
      sh.gunCd = 0.11 / rate;
      if (L === 1) shot(s, 'player', 'shot', x, y, 0, 720, 1, 3, 1.2);
      else {
        shot(s, 'player', 'shot', x, y - 5, 0, 720, 1, 3, 1.2);
        shot(s, 'player', 'shot', x, y + 5, 0, 720, 1, 3, 1.2);
      }
      if (L >= 3) {
        shot(s, 'player', 'shot', x, y, -0.14, 700, 1, 3, 1.2);
        shot(s, 'player', 'shot', x, y, 0.14, 700, 1, 3, 1.2);
      }
      break;
    }
    case 'spread': {
      sh.gunCd = 0.17 / rate;
      const n = [3, 5, 7][L - 1];
      const arc = [0.4, 0.7, 0.95][L - 1];
      for (let i = 0; i < n; i++) shot(s, 'player', 'spread', x, y, -arc / 2 + (arc * i) / (n - 1), 560, 1.15, 3.5, 0.62);
      break;
    }
    case 'laser': {
      // straight lines through everything, and two diagonals that bounce off
      // the terrain: the R-Type answer to turrets on the floor and ceiling
      sh.gunCd = 0.15 / rate;
      const offs = [[0], [-6, 6], [-9, 0, 9]][L - 1];
      for (const o of offs) {
        const b = shot(s, 'player', 'laser', x + 10, y + o, 0, 1000, 1.25, 2.5 + L * 0.5, 0.9);
        b.hit = [];
      }
      sh.volley++;
      if (sh.volley % 2 === 0) {
        for (const a of [-0.55, 0.55]) {
          const b = shot(s, 'player', 'laser', x, y, a, 800, 0.5 + 0.15 * L, 2.5, 1.0);
          b.hit = [];
          b.bounces = 2;
        }
      }
      break;
    }
    case 'homing': {
      sh.gunCd = 0.2 / rate;
      const n = L + 1;
      for (let i = 0; i < n; i++) {
        const a = -0.6 + (1.2 * i) / (n - 1);
        shot(s, 'player', 'homing', x, y, a, 420, 1.1, 3, 1.4);
      }
      break;
    }
  }
  s.sounds.push('shot');
}

function fireCharge(s: SimState): void {
  const sh = s.ship;
  const c = sh.charge;
  sh.charge = 0;
  if (c < 0.25 || sh.dead) return;
  const bw = sh.cards.bigwave;
  const size = 1 + 0.3 * Math.min(2, bw);
  const dmg = (8 + 52 * c * c) * size;
  const angles = bw >= 3 && c >= 1 ? [-0.18, 0, 0.18] : [0];
  for (const a of angles) {
    const b = shot(s, 'player', 'charge', sh.x + 18, sh.y, a, 640, dmg, (5 + 17 * c) * size, 1.6);
    b.pierce = dmg;
    b.hit = [];
    b.level = c;
  }
  s.shake = Math.max(s.shake, 2 + 6 * c);
  s.sounds.push(c >= 1 ? 'beam' : 'charge-shot');
  s.rings.push({ x: sh.x + 18, y: sh.y, r: 6, grow: 160 * c, life: 0.25, max: 0.25, color: '#9ff3ff', width: 3 });
}

/** The pod: docked in front or behind, or out on its own; its guns follow the ship's crystal. */
function stepPod(s: SimState, inp: SimInput): void {
  const pod = s.pod;
  const sh = s.ship;
  pod.t += DT;
  for (const [id, t] of pod.hitCd) {
    if (t - DT <= 0) pod.hitCd.delete(id);
    else pod.hitCd.set(id, t - DT);
  }
  if (inp.pod && !sh.dead) {
    if (pod.mode === 'front' || pod.mode === 'back') {
      const dir = pod.mode === 'front' ? 1 : -1;
      pod.vx = dir * 520;
      pod.vy = 0;
      pod.mode = 'out';
      pod.t = 0;
      s.sounds.push('pod');
    } else {
      pod.mode = 'return';
      pod.t = 0;
      s.sounds.push('pod-back');
    }
  }
  const front = pod.mode === 'front';
  if (front || pod.mode === 'back') {
    pod.x = sh.x + (front ? 22 : -20);
    pod.y = sh.y;
  } else if (pod.mode === 'out') {
    // flies to the far edge it was launched toward, then holds there, drifting to the ship's height
    const hold = pod.vx >= 0 ? W * 0.8 : 50;
    const dx = hold - pod.x;
    pod.x += Math.sign(dx) * Math.min(Math.abs(dx), Math.abs(pod.vx) * DT);
    if (Math.abs(dx) < 4) pod.vx = Math.sign(pod.vx || 1) * 60;
    const dy = sh.y - pod.y;
    pod.y += Math.sign(dy) * Math.min(Math.abs(dy), 150 * DT);
  } else {
    const dx = sh.x - pod.x;
    const dy = sh.y - pod.y;
    const d = Math.hypot(dx, dy) || 1;
    const v = Math.min(d / DT, 560);
    pod.x += (dx / d) * v * DT;
    pod.y += (dy / d) * v * DT;
    if (d < 16 && !sh.dead) {
      pod.mode = pod.x >= sh.x ? 'front' : 'back';
      s.sounds.push('dock');
    }
  }
  if (sh.dead) return;
  // the pod's gun: forward unless docked behind or out behind
  pod.gunCd -= DT;
  if (pod.gunCd <= 0 && s.enemies.length) {
    pod.gunCd = (sh.cards.podarmor >= 3 ? 0.17 : 0.34) / fireRate(s);
    const back = pod.mode === 'back' || (pod.mode === 'out' && pod.vx < 0);
    const base = back ? Math.PI : 0;
    const x = pod.x + (back ? -8 : 8);
    switch (sh.gun) {
      case 'vulcan':
        shot(s, 'player', 'shot', x, pod.y, base, 720, 1, 3, 1.2);
        break;
      case 'spread':
        for (const a of [-0.3, 0, 0.3]) shot(s, 'player', 'spread', x, pod.y, base + a, 560, 1.1, 3.5, 0.6);
        break;
      case 'laser': {
        const b = shot(s, 'player', 'laser', x, pod.y, base, 1000, 1.2, 3, 0.9);
        b.hit = [];
        break;
      }
      case 'homing':
        for (const a of [-0.5, 0.5]) shot(s, 'player', 'homing', x, pod.y, base + a, 420, 1.1, 3, 1.4);
        break;
    }
  }
}

export function podRadius(s: SimState): number {
  return POD_R + 3 * Math.min(2, s.ship.cards.podarmor);
}

// ---------------------------------------------------------------- enemies

function stepEnemies(s: SimState): void {
  const sh = s.ship;
  const alive = !sh.dead;
  for (const e of s.enemies) {
    if (e.hp <= 0) continue;
    e.t += DT;
    e.flash = Math.max(0, e.flash - DT);
    e.gunCd -= DT;
    if (e.parts) {
      stepBoss(s, e);
      continue;
    }
    const onScreen = e.x > 0 && e.x < W - 10;
    switch (e.kind) {
      case 'popcorn': {
        // a snake: every one passes the same curve, so the line reads as one body
        if (e.phase === 0) {
          const k = (W + 20 - e.x) * 0.016;
          e.y = e.y0 + 55 * Math.sin(k);
          e.angle = Math.atan2(55 * 0.016 * -e.vx * Math.cos(k), e.vx);
        }
        if (e.gunCd <= 0 && onScreen && alive && e.x > sh.x + 60) {
          e.gunCd = s.rng.range(2.5, 5);
          enemyShot(s, e.x, e.y, aimAt(s, e.x, e.y), 140);
        }
        break;
      }
      case 'swooper': {
        // in fast, a turn toward the ship's height, one aimed shot, out
        if (e.x < W * 0.62) e.vy += Math.sign(sh.y - e.y) * 260 * DT;
        e.vy = Math.max(-160, Math.min(160, e.vy));
        if (e.gunCd <= 0 && e.burst === 0 && onScreen && alive) {
          e.burst = 1;
          enemyShot(s, e.x, e.y, aimAt(s, e.x, e.y), 170);
          s.sounds.push('eshot');
        }
        e.angle = Math.atan2(e.vy, e.vx);
        break;
      }
      case 'chaser': {
        // across from behind, then a turn back at the ship
        if (e.burst === 0 && e.x > W * 0.6 + e.index * 14) {
          e.burst = 1;
          if (alive) enemyShot(s, e.x, e.y, aimAt(s, e.x, e.y), 160);
        }
        if (e.burst === 1) {
          e.vx += (-240 - e.vx) * Math.min(1, 2 * DT);
          e.vy += (Math.sign(sh.y - e.y) * 120 - e.vy) * Math.min(1, 2 * DT);
        }
        e.angle = Math.atan2(e.vy, e.vx);
        break;
      }
      case 'gunship': {
        // in to its post, a bob, fans and rings, out after a while
        const post = W * 0.8;
        if (e.t < 14) {
          e.vx = (post - e.x) * 2;
          e.vy = (e.y0 + Math.sin(e.t * 1.1) * 40 - e.y) * 2;
        } else e.vx = Math.min(200, e.vx + 120 * DT);
        if (e.gunCd <= 0 && alive && e.x < W - 20 && e.t < 14) {
          e.burst++;
          e.gunCd = 1.5;
          if (e.burst % 3 === 0) ring(s, e.x, e.y, 12, 120, e.t);
          else fan(s, e.x - 10, e.y, aimAt(s, e.x, e.y), 5, 0.6, 165);
        }
        break;
      }
      case 'carrier': {
        e.vy = Math.cos(e.t * 2) * 50;
        break;
      }
      case 'turret': {
        // stands on the terrain and turns to the ship; aimed pairs
        e.x = e.d - s.scroll;
        e.angle = aimAt(s, e.x, e.y);
        if (e.gunCd <= 0 && onScreen && alive) {
          e.burst++;
          if (e.burst % 2 === 0) e.gunCd = 1.8 + e.seed;
          else e.gunCd = 0.22;
          enemyShot(s, e.x + Math.cos(e.angle) * 10, e.y + Math.sin(e.angle) * 10, e.angle, 150);
        }
        break;
      }
      case 'spinner': {
        // a spiral: three arms, turning, in bursts
        if (e.x < W * 0.72) e.vx = -18;
        e.vy = (e.y0 + Math.sin(e.t * 0.8) * 50 - e.y) * 1.5;
        if (e.gunCd <= 0 && alive && onScreen) {
          e.burst++;
          const inBurst = e.burst % 10 !== 0;
          e.gunCd = inBurst ? 0.2 : 1.4;
          if (inBurst) {
            const rot = e.t * 1.6;
            for (let k = 0; k < 3; k++) enemyShot(s, e.x, e.y, rot + (k * Math.PI * 2) / 3, 115);
          }
        }
        e.angle += DT * 3;
        break;
      }
      default:
        break;
    }
    if (e.kind !== 'turret') {
      e.x += e.vx * DT;
      e.y += e.vy * DT;
    }
    // gone off an edge, after it had time to come in
    if (e.t > 1.5 && (e.x < -50 || e.x > W + 70 || e.y < -60 || e.y > H + 60)) escape(s, e);
  }
}

// ---------------------------------------------------------------- bullets, beams, drops

function nearestEnemy(s: SimState, x: number, y: number, ahead: number): Enemy | null {
  let best: Enemy | null = null;
  let bd = Infinity;
  for (const e of s.enemies) {
    if (e.hp <= 0 || e.x < 0 || e.x > W) continue;
    if (ahead && (e.x - x) * ahead < -20) continue;
    let ex = e.x;
    let ey = e.y;
    if (e.parts) {
      const w = e.parts.find((p) => p.kind === 'weak' && p.open) ?? e.parts.find((p) => p.kind === 'gun' && !p.dead);
      if (w) {
        ex += w.ox;
        ey += w.oy;
      }
    }
    const d = Math.hypot(ex - x, ey - y);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

function stepBullets(s: SimState): void {
  const byId = new Map(s.enemies.map((e) => [e.id, e]));
  for (const b of s.bullets) {
    b.life -= DT;
    if (b.kind === 'homing' || b.kind === 'missile') {
      let t = byId.get(b.target);
      if (!t || t.hp <= 0) {
        t = nearestEnemy(s, b.x, b.y, Math.sign(b.vx) || 1) ?? undefined;
        b.target = t ? t.id : -1;
      }
      if (t) {
        let tx = t.x;
        let ty = t.y;
        if (t.parts) {
          const w = t.parts.find((p) => p.kind === 'weak' && p.open) ?? t.parts.find((p) => p.kind === 'gun' && !p.dead);
          if (w) {
            tx += w.ox;
            ty += w.oy;
          }
        }
        const want = Math.atan2(ty - b.y, tx - b.x);
        const cur = Math.atan2(b.vy, b.vx);
        let da = want - cur;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        const turn = (b.kind === 'missile' ? 7 : 5) * DT;
        const a = cur + Math.max(-turn, Math.min(turn, da));
        const sp = Math.min(b.kind === 'missile' ? 420 : 460, Math.hypot(b.vx, b.vy) + 400 * DT);
        b.vx = Math.cos(a) * sp;
        b.vy = Math.sin(a) * sp;
      }
    }
    if (b.kind === 'mine' && !s.ship.dead) {
      // a boss's mine drifts toward the ship
      const a = aimAt(s, b.x, b.y);
      b.vx += Math.cos(a) * 60 * DT;
      b.vy += Math.sin(a) * 60 * DT;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 110) {
        b.vx *= 110 / sp;
        b.vy *= 110 / sp;
      }
    }
    b.x += b.vx * DT;
    b.y += b.vy * DT;
    // a bouncing laser turns off the terrain and the screen's top and bottom
    if (b.bounces > 0) {
      const fy = Math.min(H, floorY(s, b.x));
      const cy = Math.max(0, ceilY(s, b.x));
      if ((b.y > fy && b.vy > 0) || (b.y < cy && b.vy < 0)) {
        b.vy = -b.vy;
        b.y = b.vy < 0 ? fy - 1 : cy + 1;
        b.bounces--;
        b.hit = [];
        burst(s, b.x, b.y, 3, '#9fd0ff', 60, 1.4, 0.2);
      }
    }
    if (b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30) b.life = 0;
    // the terrain stops shots
    else if (b.y > floorY(s, b.x) || b.y < ceilY(s, b.x)) {
      b.life = 0;
      burst(s, b.x, b.y, b.kind === 'charge' ? 12 : 2, b.team === 'player' ? '#9fe8ff' : '#ffb0d8', 60, 1.4, 0.3);
    }
  }
  s.bullets = s.bullets.filter((b) => b.life > 0);
}

/** Distance from a point to a beam's line. */
function beamDist(b: { x: number; y: number; angle: number }, px: number, py: number): number {
  const dx = px - b.x;
  const dy = py - b.y;
  const along = dx * Math.cos(b.angle) + dy * Math.sin(b.angle);
  if (along < 0) return Math.hypot(dx, dy);
  return Math.abs(-dx * Math.sin(b.angle) + dy * Math.cos(b.angle));
}

function stepBeams(s: SimState): void {
  const sh = s.ship;
  for (const b of s.beams) {
    const owner = s.enemies.find((e) => e.id === b.owner);
    if (owner) {
      b.x = owner.x + b.ox;
      b.y = owner.y + b.oy;
    } else b.life = 0;
    if (b.warn > 0) {
      b.warn -= DT;
      if (b.warn <= 0) s.sounds.push('laser');
      continue;
    }
    b.life -= DT;
    b.angle += b.sweep * DT;
    if (!sh.dead && beamDist(b, sh.x, sh.y) < b.width / 2 + SHIP_R) hurtShip(s, 20, 'beam');
    if (Math.random() < 0.5) burst(s, b.x + Math.cos(b.angle) * 30, b.y + Math.sin(b.angle) * 30, 1, '#ffd0f0', 120, 2, 0.3);
  }
  s.beams = s.beams.filter((b) => b.warn > 0 || b.life > 0);
}

function stepDrops(s: SimState): void {
  const sh = s.ship;
  const reach = [34, 110, 2000][Math.min(2, sh.cards.magnet)];
  for (const d of s.drops) {
    d.t += DT;
    const dx = sh.x - d.x;
    const dy = sh.y - d.y;
    const dist = Math.hypot(dx, dy);
    if (!sh.dead && dist < reach) {
      const v = 320 * DT;
      d.x += (dx / dist) * Math.min(dist, v);
      d.y += (dy / dist) * Math.min(dist, v);
    } else {
      d.x -= 65 * DT;
      d.y += Math.sin(d.t * 3) * 20 * DT;
    }
    if (!sh.dead && dist < 18) {
      collect(s, d.kind, d.x, d.y);
      d.t = -1;
    }
  }
  s.drops = s.drops.filter((d) => d.t >= 0 && d.x > -20);
}

function collect(s: SimState, kind: DropKind, x: number, y: number): void {
  const sh = s.ship;
  s.tally.drops++;
  s.sounds.push('powerup');
  s.rings.push({ x, y, r: 8, grow: 120, life: 0.3, max: 0.3, color: '#ffffff', width: 2 });
  let text = '';
  const gun = CRYSTAL_GUN[kind];
  if (gun) {
    if (sh.gun === gun) sh.gunLevel = Math.min(3, sh.gunLevel + 1);
    else {
      sh.gun = gun;
      sh.gunLevel = Math.max(1, sh.gunLevel);
    }
    text = `${gun.toUpperCase()} ${sh.gunLevel}`;
  } else if (kind === 'speed') {
    sh.speed = Math.min(3, sh.speed + 1);
    text = `SPEED ${sh.speed}`;
  } else if (kind === 'missile') {
    sh.missiles = Math.min(2, sh.missiles + 1);
    text = `MISSILES ${sh.missiles}`;
  } else if (kind === 'bit') {
    sh.bits = Math.min(2, sh.bits + 1);
    sh.bitPos[sh.bits - 1] = { x: sh.x, y: sh.y };
    text = `BIT ${sh.bits}`;
  } else if (kind === 'repair') {
    sh.hp = Math.min(sh.maxHp, sh.hp + 25);
    text = 'REPAIR';
  }
  floater(s, x, y - 14, text, '#9ff3ff');
}

// ---------------------------------------------------------------- collisions

function partAt(e: Enemy, x: number, y: number, r: number): Part | null {
  // guns and the weak point first, so armour behind them does not steal the hit
  let armor: Part | null = null;
  for (const p of e.parts!) {
    if (p.dead) continue;
    const dx = e.x + p.ox - x;
    const dy = e.y + p.oy - y;
    if (dx * dx + dy * dy > (p.r + r) ** 2) continue;
    if (p.kind === 'armor') armor = armor ?? p;
    else return p;
  }
  return armor;
}

function collide(s: SimState): void {
  const sh = s.ship;
  const pod = s.pod;
  const podR = podRadius(s);
  const mines = s.bullets.filter((m) => m.kind === 'mine');
  for (const b of s.bullets) {
    if (b.life <= 0) continue;
    if (b.team === 'player') {
      // shots break mines
      for (const m of mines) {
        if (m.life <= 0) continue;
        if (Math.hypot(m.x - b.x, m.y - b.y) < m.r + b.r) {
          m.pierce -= b.dmg;
          if (b.kind !== 'charge') b.life = 0;
          if (m.pierce <= 0) {
            m.life = 0;
            explode(s, m.x, m.y, 14, '#ff8ad0');
            s.score += 20;
          }
          break;
        }
      }
      if (b.life <= 0) continue;
      for (const e of s.enemies) {
        if (e.hp <= 0) continue;
        if (b.hit && b.hit.includes(e.id)) continue;
        if (e.parts) {
          const p = partAt(e, b.x, b.y, b.r);
          if (!p) continue;
          const took = hurtPart(s, e, p, b.kind === 'charge' ? b.pierce : b.dmg, b.x, b.y);
          if (b.kind === 'charge' && took) s.rings.push({ x: b.x, y: b.y, r: 6, grow: 140, life: 0.25, max: 0.25, color: '#bff4ff', width: 3 });
          b.life = 0;
          if (e.hp <= 0 && e.id === s.boss) bossDown(s, e);
          break;
        }
        const dx = e.x - b.x;
        const dy = e.y - b.y;
        if (dx * dx + dy * dy > (e.r + b.r) ** 2) continue;
        if (b.kind === 'charge' || b.kind === 'laser') {
          // these go through: a charge spends its damage on what it kills, a laser hits each once
          const dmg = b.kind === 'charge' ? b.pierce : b.dmg;
          const spend = Math.min(dmg, e.hp);
          hurtEnemy(s, e, dmg);
          b.hit!.push(e.id);
          if (b.kind === 'charge') {
            b.pierce -= spend;
            s.rings.push({ x: b.x, y: b.y, r: 4, grow: 90, life: 0.2, max: 0.2, color: '#bff4ff', width: 2 });
            if (b.pierce <= 0.5) b.life = 0;
          }
        } else {
          hurtEnemy(s, e, b.dmg);
          b.life = 0;
          burst(s, b.x, b.y, 2, '#bff4ff', 70, 1.3, 0.2);
        }
        if (b.life <= 0) break;
      }
      continue;
    }
    // enemy shots: the pod and the bits eat them
    if (Math.hypot(pod.x - b.x, pod.y - b.y) < podR + b.r) {
      b.life = 0;
      burst(s, b.x, b.y, 3, '#ffd9a0', 60, 1.3, 0.25);
      continue;
    }
    let eaten = false;
    for (let i = 0; i < sh.bits; i++) if (Math.hypot(sh.bitPos[i].x - b.x, sh.bitPos[i].y - b.y) < BIT_R + b.r) eaten = true;
    if (eaten) {
      b.life = 0;
      burst(s, b.x, b.y, 3, '#ffd9a0', 60, 1.3, 0.25);
      continue;
    }
    if (sh.dead || sh.invuln > 0) continue;
    if (Math.hypot(sh.x - b.x, sh.y - b.y) < SHIP_R + b.r * 0.8) {
      b.life = 0;
      if (b.kind === 'mine') explode(s, b.x, b.y, 16, '#ff8ad0');
      hurtShip(s, b.dmg, 'shot');
    }
  }
  // bodies: the pod rams, the ship gets rammed
  for (const e of s.enemies) {
    if (e.hp <= 0) continue;
    if (e.parts) {
      if (pod.mode !== 'front' && pod.mode !== 'back' && !pod.hitCd.has(e.id)) {
        const p = partAt(e, pod.x, pod.y, podR);
        if (p) {
          pod.hitCd.set(e.id, 0.15);
          hurtPart(s, e, p, 2 * (1 + Math.min(1, sh.cards.podarmor)), pod.x, pod.y);
          if (e.hp <= 0 && e.id === s.boss) {
            bossDown(s, e);
            continue;
          }
        }
      }
      if (!sh.dead && partAt(e, sh.x, sh.y, SHIP_R + 4)) hurtShip(s, ENEMIES[e.kind].ram, 'ram');
      continue;
    }
    if (!pod.hitCd.has(e.id) && Math.hypot(e.x - pod.x, e.y - pod.y) < e.r + podR) {
      pod.hitCd.set(e.id, 0.12);
      hurtEnemy(s, e, 2.5 * (1 + Math.min(1, sh.cards.podarmor)));
      burst(s, pod.x, pod.y, 5, '#ffe2a8', 110, 1.8, 0.25);
    }
    if (sh.dead || e.hp <= 0) continue;
    if (Math.hypot(e.x - sh.x, e.y - sh.y) < e.r + SHIP_R) {
      hurtShip(s, ENEMIES[e.kind].ram, 'ram');
      if (e.kind !== 'turret') hurtEnemy(s, e, 6);
    }
  }
  s.bullets = s.bullets.filter((b) => b.life > 0);
}

function stepEffects(s: SimState): void {
  for (const q of s.particles) {
    q.life -= DT;
    q.vx *= 1 - 1.5 * DT;
    q.vy *= 1 - 1.5 * DT;
    q.x += q.vx * DT;
    q.y += q.vy * DT;
  }
  s.particles = s.particles.filter((q) => q.life > 0);
  if (s.particles.length > 900) s.particles.splice(0, s.particles.length - 900);
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

export type { Bullet };
