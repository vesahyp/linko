import { newRun, step } from '../src/game/sim';
import { playHeadless } from './hand';

/**
 * `make balance [RUNS=12] [STAGES=3]`: the hand (a thumb's limits,
 * tools/hand.ts) plays RUNS runs, one line each: where it ended, the hull
 * left, the drops it took, the formations it wiped, the most enemy shots in
 * the air at once, and its build.
 */
declare const process: { argv: string[]; exitCode?: number };
const runs = Number(process.argv[2] || 12);
const stages = Number(process.argv[3] || 3);
const ends: string[] = [];
let clears = 0;
for (let i = 0; i < runs; i++) {
  const seed = 1000 + i * 7919;
  const s = playHeadless(newRun(seed), step, stages);
  const ts = [...s.stageTallies, ...(s.phase === 'pick' ? [] : [s.tally])];
  const sum = (k: keyof (typeof ts)[0]) => ts.reduce((a, x) => a + (x[k] as number), 0);
  const peak = Math.max(...ts.map((t) => t.peakShots));
  const bosses = sum('bosses');
  if (bosses >= stages) clears++;
  const where = s.ship.dead ? `died stage ${s.stage}${s.boss ? ' boss' : ''} ${Math.round(s.stageTime)}s` : `cleared ${bosses}`;
  ends.push(where);
  const sh = s.ship;
  const by: Record<string, number> = {};
  for (const t of ts) for (const [k, v] of Object.entries(t.hurtBy)) by[k] = (by[k] ?? 0) + v;
  console.log(
    `seed ${String(seed).padStart(6)}  ${where.padEnd(22)} ${String(Math.round(s.time)).padStart(4)}s  hull ${Math.round(sh.hp)}/${sh.maxHp}  bosses ${bosses}  hurt ${sum('hurts')}  drops ${sum('drops')}  wiped ${sum('formations')}  peak shots ${peak}  boss fights ${ts.filter((t) => t.bossTime).map((t) => Math.round(t.bossTime) + 's').join(' ') || '-'}  lost to ${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(', ')}  ${sh.gun} ${sh.gunLevel} S${sh.speed} M${sh.missiles} B${sh.bits}`,
  );
}
console.log(`cleared all ${stages}: ${clears} of ${runs}`);
