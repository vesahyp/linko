import { newRun, step } from '../src/game/sim';
import { playHeadless } from './hand';

/**
 * `make balance [RUNS=12] [WAVES=12]`: the hand (a thumb's limits, tools/hand.ts)
 * plays RUNS runs, one line each: the wave it died on, the hull left, and what
 * gravity did in the fight: the share of hits that bent on the way, enemies
 * the planet took, slingshots, hull lost to the planet.
 */
declare const process: { argv: string[]; exitCode?: number };
const runs = Number(process.argv[2] || 12);
const waves = Number(process.argv[3] || 12);
const reached: number[] = [];
for (let i = 0; i < runs; i++) {
  const seed = 1000 + i * 7919;
  const s = playHeadless(newRun(seed), step, waves);
  const t = [...s.waveTallies, s.tally];
  const sum = (k: keyof (typeof t)[0]) => t.reduce((a, x) => a + (x[k] as number), 0);
  const end = s.ship.dead ? `died on wave ${s.wave}` : `cleared ${s.wave}`;
  reached.push(s.ship.dead ? s.wave - 1 : s.wave);
  console.log(
    `seed ${String(seed).padStart(6)}  ${end.padEnd(16)} ${Math.round(s.time)}s  hull ${Math.round(s.ship.hp)}/${s.ship.maxHp}  kills ${s.kills}  bent hits ${Math.round((100 * sum('bentHits')) / Math.max(1, sum('hits')))}%  planet kills ${sum('planetKills')}  slingshots ${sum('slingshots')}  planet dmg ${sum('planetDamage')}  bent hurts ${sum('bentHurts')}/${sum('hurts')}  ups ${Object.entries(s.ship.upgrades).filter(([, v]) => v).map(([k, v]) => k + v).join(' ')}`,
  );
}
reached.sort((a, b) => a - b);
console.log(`waves cleared: median ${reached[Math.floor(reached.length / 2)]}, min ${reached[0]}, max ${reached[reached.length - 1]}`);
