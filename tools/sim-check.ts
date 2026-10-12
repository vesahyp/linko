import { newRun, step, applyUpgrade, startWave, thrustOf } from '../src/game/sim';
import { createState, DT, NO_INPUT, type SimState } from '../src/game/state';
import { gravity, orbitSpeed, NO_RETURN, solveAim, angleDiff } from '../src/game/physics';
import { WAVES } from '../src/game/content';
import { playHeadless } from './hand';

/**
 * `make sim-check`: the rules that make Linko what it is, asserted headless.
 * The planet's pull has to hold an orbit, bend a shot, trap a low ship and
 * let the auto-aim shoot round it; the waves have to put several enemies up
 * at once; the hand (a thumb's limits, tools/hand.ts) has to get through the
 * first waves and also die sometimes; a seed has to replay the same run.
 */
declare const process: { argv: string[]; exitCode?: number };

let failed = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failed++;
};

// a free body in a circular orbit stays on it
{
  const s = createState(1);
  const p = s.planet;
  const r = 150;
  let x = p.x + r;
  let y = p.y;
  let vx = 0;
  let vy = -orbitSpeed(r);
  let lo = r;
  let hi = r;
  const period = (2 * Math.PI * r) / orbitSpeed(r);
  for (let t = 0; t < period * 3; t += DT) {
    const g = gravity(p, x, y);
    vx += g.ax * DT;
    vy += g.ay * DT;
    x += vx * DT;
    y += vy * DT;
    const d = Math.hypot(x - p.x, y - p.y);
    lo = Math.min(lo, d);
    hi = Math.max(hi, d);
  }
  check(hi / lo < 1.04, `an orbit at r=${r} holds for three turns (radius ${lo.toFixed(1)} to ${hi.toFixed(1)}, period ${period.toFixed(1)} s)`);
}

// a shot past the planet bends
{
  const s = createState(1);
  const p = s.planet;
  let x = p.x - 200;
  let y = p.y - 90;
  let vx = 520;
  let vy = 0;
  for (let t = 0; t < 0.9; t += DT) {
    const g = gravity(p, x, y);
    vx += g.ax * DT;
    vy += g.ay * DT;
    x += vx * DT;
    y += vy * DT;
  }
  const bend = (angleDiff(0, Math.atan2(vy, vx)) * 180) / Math.PI;
  check(bend > 15, `a main-gun shot passing 90 units from the planet turns ${bend.toFixed(0)} degrees`);
  let ex = p.x + 250;
  let ey = p.y - 120;
  let evx = -185;
  let evy = 0;
  for (let t = 0; t < 2; t += DT) {
    const g = gravity(p, ex, ey);
    evx += g.ax * DT;
    evy += g.ay * DT;
    ex += evx * DT;
    ey += evy * DT;
  }
  const eb = (angleDiff(Math.PI, Math.atan2(evy, evx)) * 180) / Math.PI;
  check(eb > 40, `an enemy shot passing 120 units from the planet turns ${eb.toFixed(0)} degrees`);
}

// below the line of no return the engine cannot climb out
{
  const climb = (r0: number) => {
    const s = newRun(3);
    s.enemies = [];
    // a group due much later keeps the wave open, so the step runs the ship
    s.queue = [{ at: 999, kind: 'dart', count: 1, from: 'left' }];
    s.ship.x = s.planet.x;
    s.ship.y = s.planet.y - r0;
    s.ship.vx = 0;
    s.ship.vy = 0;
    s.ship.invuln = 99;
    for (let i = 0; i < 60; i++) step(s, { ...NO_INPUT, mx: 0, my: -1 });
    return Math.hypot(s.ship.x - s.planet.x, s.ship.y - s.planet.y);
  };
  const low = climb(NO_RETURN - 12);
  const high = climb(NO_RETURN + 25);
  check(low < NO_RETURN - 12, `from rest ${Math.round(NO_RETURN - 12)} units out, full thrust away still falls (to ${low.toFixed(0)})`);
  check(high > NO_RETURN + 25, `from rest ${Math.round(NO_RETURN + 25)} units out, full thrust climbs (to ${high.toFixed(0)}); no return at ${NO_RETURN.toFixed(0)}, thrust ${thrustOf(newRun(1))}`);
}

// the auto-aim shoots round the planet at a target hidden behind it
{
  const s = createState(1);
  const p = s.planet;
  const sol = solveAim(p, p.x - 200, p.y, 0, 0, 400, p.x + 220, p.y, 0, 0, 1.6, 14);
  const direct = 0;
  check(!!sol && angleDiff(sol.angle, direct) > 0.08, `a target straight behind the planet gets a curved charge shot (launched ${sol ? ((angleDiff(sol.angle, direct) * 180) / Math.PI).toFixed(0) : '-'} degrees off the line)`);
}

// several enemies at once: the most on the field in each of the six waves
{
  for (let w = 1; w <= WAVES.length; w++) {
    const s = newRun(5);
    s.enemies = [];
    startWave(s, w);
    s.ship.invuln = 1e9;
    let most = 0;
    for (let i = 0; i < 60 * 20; i++) {
      step(s, NO_INPUT);
      most = Math.max(most, s.enemies.length);
      if (s.phase !== 'fight') break;
    }
    check(most >= 6, `wave ${w} (${WAVES[w - 1].name}) has ${most} enemies up at once`);
  }
}

// an upgrade shows in the numbers
{
  const s = newRun(1);
  applyUpgrade(s, 'armor');
  check(s.ship.maxHp === 140 && s.ship.hp === 140, 'Hull Plates raises and repairs the hull');
}

// the hand: through the first waves, and it can die
{
  const runs = 12;
  let past3 = 0;
  let deaths = 0;
  let bent = 0;
  let hits = 0;
  let planetKills = 0;
  const reached: number[] = [];
  for (let i = 0; i < runs; i++) {
    const s = playHeadless(newRun(2000 + i * 31), step, 12);
    const ts = [...s.waveTallies, s.tally];
    bent += ts.reduce((a, t) => a + t.bentHits, 0);
    hits += ts.reduce((a, t) => a + t.hits, 0);
    planetKills += ts.reduce((a, t) => a + t.planetKills, 0);
    const cleared = s.ship.dead ? s.wave - 1 : s.wave;
    reached.push(cleared);
    if (cleared >= 3) past3++;
    if (s.ship.dead) deaths++;
  }
  reached.sort((a, b) => a - b);
  console.log(`      hand, ${runs} runs: waves cleared ${reached.join(' ')}`);
  check(past3 >= runs * 0.75, `the hand clears wave 3 in ${past3} of ${runs} runs`);
  check(deaths >= 2, `the hand dies by wave 12 in ${deaths} of ${runs} runs`);
  check(bent / hits > 0.15, `${Math.round((100 * bent) / hits)}% of the hand's hits curved round the planet`);
  check(planetKills > runs * 5, `${planetKills} enemies hit the planet over the runs`);
}

// a seed replays the same run
{
  const a = playHeadless(newRun(77), step, 4) as SimState;
  const b = playHeadless(newRun(77), step, 4) as SimState;
  check(a.score === b.score && a.time === b.time, `seed 77 replays the same run (score ${a.score}, ${a.time.toFixed(1)} s)`);
}

if (failed) {
  console.log(`${failed} failed`);
  process.exitCode = 1;
}
