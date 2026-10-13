import { newRun, step, hurtPart, pickCard, startStage, SHIP_R } from '../src/game/sim';
import { makeBoss } from '../src/game/bosses';
import { NO_INPUT, type SimState } from '../src/game/state';
import { STAGES, heightAt } from '../src/game/content';
import { playHeadless } from './hand';

/**
 * `make sim-check`: the rules that make Linko what it is, asserted headless.
 * Each stage fills the screen and ends in its boss; a boss's armour turns
 * shots away, its guns can be shot off, its weak point only takes damage
 * open, and it changes phase; crystals set the gun; the pod docks on the
 * side it comes home to; a full charge goes through a line of enemies; the
 * hand (a thumb's limits, tools/hand.ts) beats the first boss most of the
 * time, dies often enough, and can finish; a seed replays the same run.
 */
declare const process: { argv: string[]; exitCode?: number };

let failed = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failed++;
};

/** A ship nothing can hurt, for watching a stage play out. */
function ghost(s: SimState): SimState {
  s.ship.invuln = 1e9;
  return s;
}

// every stage fills the screen and reaches its boss
for (let n = 1; n <= STAGES.length; n++) {
  const s = ghost(newRun(5, n));
  let most = 0;
  let mostShots = 0;
  let boss = false;
  for (let i = 0; i < 60 * 100 && !boss; i++) {
    step(s, NO_INPUT);
    s.sounds.length = 0;
    most = Math.max(most, s.enemies.length);
    mostShots = Math.max(mostShots, s.bullets.filter((b) => b.team === 'enemy').length);
    if (s.boss !== null) boss = true;
  }
  check(boss, `stage ${n} (${STAGES[n - 1].name}) reaches its boss, the ${STAGES[n - 1].boss}`);
  check(most >= 10, `stage ${n} has ${most} enemies up at once`);
  check(mostShots >= 25, `stage ${n} has ${mostShots} enemy shots in the air at once before its boss`);
  // turrets stand only where there is terrain
  const def = STAGES[n - 1];
  const bad = def.script.filter((l) => l.form === 'turret').filter((l) => heightAt(l.at === 'ceil' ? def.ceil : def.floor, l.t * 45 + 800) <= 0);
  check(bad.length === 0, `stage ${n}: every turret line stands on terrain${bad.length ? ` (not at ${bad.map((l) => l.t).join(', ')} s)` : ''}`);
}

// a boss's parts
{
  const s = ghost(newRun(5, 1));
  const w = makeBoss(s, 'warden');
  const core = w.parts!.find((p) => p.kind === 'weak')!;
  const hull = w.parts!.find((p) => p.kind === 'armor')!;
  const gun = w.parts!.find((p) => p.kind === 'gun')!;
  core.open = false;
  const hp0 = w.hp;
  check(!hurtPart(s, w, hull, 10, 0, 0) && w.hp === hp0, 'armour turns a shot away');
  check(!hurtPart(s, w, core, 10, 0, 0) && w.hp === hp0, 'a shut weak point turns a shot away');
  core.open = true;
  check(hurtPart(s, w, core, 10, 0, 0) && w.hp === hp0 - 10, 'an open weak point takes the damage');
  hurtPart(s, w, gun, 1e6, 0, 0);
  check(gun.dead, 'a boss gun can be shot off');
  const phases = new Set<number>();
  for (const kind of ['warden', 'serpent', 'bulwark'] as const) {
    const t = ghost(newRun(5, 1));
    const b = makeBoss(t, kind);
    phases.clear();
    for (const f of [1, 0.5, 0.2]) {
      b.hp = b.maxHp * f;
      // the Bulwark's phase 2 is its turrets shot off, not its hull
      if (kind === 'bulwark' && f < 1) for (const p of b.parts!) if (p.name.startsWith('turret')) p.dead = true;
      for (let i = 0; i < 30; i++) step(t, NO_INPUT);
      phases.add(b.phase);
    }
    check(phases.size === 3, `the ${kind} goes through three phases (${[...phases].join(', ')})`);
  }
}

// crystals and items
{
  const s = ghost(newRun(5, 1));
  const at = (kind: Parameters<typeof s.drops.push>[0]['kind']) => {
    s.drops.push({ x: s.ship.x, y: s.ship.y, kind, t: 0 });
    step(s, NO_INPUT);
  };
  at('red');
  const a = `${s.ship.gun} ${s.ship.gunLevel}`;
  at('red');
  const b = `${s.ship.gun} ${s.ship.gunLevel}`;
  at('blue');
  const c = `${s.ship.gun} ${s.ship.gunLevel}`;
  check(a === 'spread 1' && b === 'spread 2' && c === 'laser 2', `crystals: red sets the spread, red again raises it, blue changes to the laser and keeps the level (${a}, ${b}, ${c})`);
  at('speed');
  at('missile');
  at('bit');
  check(s.ship.speed === 1 && s.ship.missiles === 1 && s.ship.bits === 1, 'S, M and B items each add their part');
}

// the pod launches, holds, comes home, and docks on the side it comes from
{
  const s = ghost(newRun(5, 1));
  step(s, { ...NO_INPUT, pod: true });
  for (let i = 0; i < 90; i++) step(s, NO_INPUT);
  const out = s.pod.mode === 'out' && s.pod.x > 500;
  // fly past it, then call it home from in front: it docks behind
  for (let i = 0; i < 150; i++) step(s, { ...NO_INPUT, target: { x: 740, y: s.ship.y } });
  step(s, { ...NO_INPUT, target: { x: 740, y: s.ship.y }, pod: true });
  for (let i = 0; i < 90; i++) step(s, { ...NO_INPUT, target: { x: 740, y: s.ship.y } });
  check(out && s.pod.mode === 'back', `the pod flies out ahead, and docks behind when it comes home from behind (${s.pod.mode})`);
}

// a full charge goes through a line of enemies
{
  const s = ghost(newRun(5, 1));
  s.cursor = 1e9;
  s.enemies = [];
  for (let i = 0; i < 6; i++) {
    const e = makeLine(s, 300 + i * 30);
    e.vx = 0;
  }
  for (let i = 0; i < 70; i++) step(s, { ...NO_INPUT, charging: true });
  step(s, { ...NO_INPUT, release: true });
  for (let i = 0; i < 40; i++) step(s, NO_INPUT);
  const left = s.enemies.filter((e) => e.hp > 0).length;
  check(left === 0, `a full charge goes through a line of six popcorn (${6 - left} down)`);
}

function makeLine(s: SimState, x: number) {
  const id = s.nextId++;
  const en = {
    id, kind: 'popcorn' as const, x, y: s.ship.y, vx: 0, vy: 0, hp: 2, maxHp: 2, r: 8, angle: Math.PI, t: 0, gunCd: 99, burst: 0, flash: 0,
    formation: 0, index: 0, y0: s.ship.y, d: 0, anchor: null, drop: null, seed: 0, parts: null, phase: 1, trail: null,
  };
  s.enemies.push(en);
  return en;
}

// the hand: beats the first boss most of the time, dies often enough, can finish
{
  const runs = 12;
  let warden = 0;
  let deaths = 0;
  let all = 0;
  const ends: string[] = [];
  for (let i = 0; i < runs; i++) {
    const s = playHeadless(newRun(3000 + i * 31), step, 3);
    const ts = [...s.stageTallies, ...(s.phase === 'pick' ? [] : [s.tally])];
    const bosses = ts.reduce((a, t) => a + t.bosses, 0);
    if (bosses >= 1) warden++;
    if (bosses >= 3) all++;
    if (s.ship.dead) deaths++;
    ends.push(s.ship.dead ? `lost ${s.stage}${s.boss !== null ? 'B' : ''}` : 'clear');
  }
  console.log(`      hand, ${runs} runs: ${ends.join(' ')}`);
  check(warden >= runs * 0.75, `the hand beats the Warden in ${warden} of ${runs} runs`);
  check(deaths >= runs * 0.25, `the hand loses its ship in ${deaths} of ${runs} runs`);
  check(all >= 1, `the hand clears all three stages in ${all} of ${runs} runs`);
}

// a seed replays the same run; a card leads to the next stage
{
  const a = playHeadless(newRun(77), step, 1);
  const b = playHeadless(newRun(77), step, 1);
  check(a.score === b.score && a.time === b.time, `seed 77 replays the same run (score ${a.score}, ${a.time.toFixed(1)} s)`);
  const s = newRun(9, 1);
  s.phase = 'pick';
  s.offers = ['plates', 'capacitor', 'magnet'];
  pickCard(s, 'plates');
  check(s.stage === 2 && s.ship.maxHp === 140, 'a card after stage 1 raises the hull and starts stage 2');
  startStage(s, 3, 0);
  void SHIP_R;
}

if (failed) {
  console.log(`${failed} failed`);
  process.exitCode = 1;
}
