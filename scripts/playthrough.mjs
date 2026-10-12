// A run on an emulated iPhone in landscape, played by the hand (tools/hand.ts:
// a player with a thumb's reaction time, thumb speed, attention and aim), every
// input a real touch through Chrome's touch pipeline (CDP Input.dispatchTouchEvent):
// the left thumb lands and drags the move stick, the right thumb lands, holds to
// charge, drags to aim and lifts to fire, a tap on the pod button, a tap on the
// upgrade card between waves. The hand only says where its thumbs are; this
// script puts them on the glass.
//
// `make playthrough [SEED=7] [WAVES=6]`. Needs `make shots-setup` once. Serves a
// production build (the dev server hot-reloads mid-run when a file is saved).
// Writes shots/playthrough/: run.webm, a screenshot every two seconds, and
// summary.json. Exits non-zero when the page throws, when the run dies before
// wave 3, or when a cleared wave shows the planet doing nothing: no hit curved
// by it, no enemy into it, no slingshot.
import { chromium, devices } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

const SEED = Number(process.env.SEED || 7);
const WAVES = Number(process.env.WAVES || 6);
const OUT = 'shots/playthrough';
const freePort = () =>
  new Promise((resolve) => {
    const srv = createServer();
    srv.listen(0, () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
const port = Number(process.env.PORT) || (await freePort());

execFileSync('npx', ['vite', 'build', '--logLevel', 'error'], { stdio: 'inherit' });
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) rmSync(join(OUT, f), { recursive: true, force: true });
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
for (let i = 0; ; i++) {
  if (await fetch(`http://localhost:${port}/linko/`).then((r) => r.ok, () => false)) break;
  if (i > 60) throw new Error(`no preview server on port ${port}`);
  await new Promise((r) => setTimeout(r, 500));
}

let failed = false;
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failed = true;
};
const phone = devices['iPhone 15 landscape'];
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...phone, hasTouch: true, recordVideo: { dir: join(OUT, 'tmp'), size: phone.viewport } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const cdp = await ctx.newCDPSession(page);
const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });

let summary = null;
try {
  await page.goto(`http://localhost:${port}/linko/?hand=1&seed=${SEED}`);
  await page.screenshot({ path: `${OUT}/title.png` });
  await page.getByRole('button', { name: 'Play', exact: true }).tap();
  await page.waitForFunction(() => window.__sim && window.__hand && window.__layout, null, { timeout: 15000 });
  const { w, h } = await page.evaluate(() => window.__layout);
  // where each thumb lands: the left low on the left half, the right low on the right half, clear of the pod button
  const L = { x: w * 0.2, y: h * 0.62 };
  const R = { x: w * 0.68, y: h * 0.55 };
  const fingers = new Map(); // 'L' | 'R' -> {x, y, id}
  const ids = { L: 1, R: 2, P: 3 };
  const pts = () => [...fingers.values()].map((f) => ({ x: f.x, y: f.y, id: f.id }));
  let podTaps = 0;
  let shot = 0;
  let picks = 0;
  const t0 = Date.now();
  const waveLog = [];
  while (Date.now() - t0 < 6 * 60 * 1000) {
    const st = await page.evaluate(() => {
      const s = window.__sim;
      return { hand: window.__hand, phase: s.phase, wave: s.wave, time: s.time, dead: s.ship.dead, deadTime: s.deadTime, hp: s.ship.hp, tallies: s.waveTallies.length };
    });
    if (st.dead && st.deadTime > 1.7) break;
    if (st.phase === 'pick') {
      // lift the thumbs, tap the card the hand wants
      if (fingers.size) {
        await touch('touchEnd', []);
        fingers.clear();
      }
      if (st.wave >= WAVES) break;
      if (st.hand.pick) {
        await page.screenshot({ path: `${OUT}/cards-wave-${st.wave}.png` });
        await page.locator(`button[data-id="${st.hand.pick}"]`).tap();
        picks++;
        waveLog.push({ wave: st.wave, pick: st.hand.pick, hp: Math.round(st.hp), at: Math.round(st.time) });
      }
      await page.waitForTimeout(150);
      continue;
    }
    const th = st.hand.thumbs;
    for (const [k, base, off] of [
      ['L', L, th.move],
      ['R', R, th.right],
    ]) {
      if (off && !fingers.has(k)) {
        fingers.set(k, { x: base.x, y: base.y, id: ids[k] });
        await touch('touchStart', pts());
      }
      if (!off && fingers.has(k)) {
        const f = fingers.get(k);
        fingers.delete(k);
        await touch('touchEnd', [{ x: f.x, y: f.y, id: f.id }]);
      }
      if (off) {
        const f = fingers.get(k);
        f.x = Math.max(1, Math.min(w - 1, base.x + off.x));
        f.y = Math.max(1, Math.min(h - 1, base.y + off.y));
      }
    }
    if (fingers.size) await touch('touchMove', pts());
    if (st.hand.podTaps > podTaps) {
      podTaps = st.hand.podTaps;
      const p = await page.evaluate(() => window.__layout.pod);
      fingers.set('P', { x: p.x + 3, y: p.y - 2, id: ids.P });
      await touch('touchStart', pts());
      await page.waitForTimeout(60);
      fingers.delete('P');
      await touch('touchEnd', [{ x: p.x + 3, y: p.y - 2, id: ids.P }]);
    }
    if (st.time >= shot * 2) {
      await page.screenshot({ path: `${OUT}/f-${String(Math.round(st.time)).padStart(3, '0')}.png` });
      shot++;
    }
    await page.waitForTimeout(25);
  }
  summary = await page.evaluate(() => {
    const s = window.__sim;
    return { wave: s.wave, dead: s.ship.dead, time: Math.round(s.time), hp: Math.round(s.ship.hp), score: s.score, kills: s.kills, upgrades: s.ship.upgrades, tallies: s.phase === 'pick' ? s.waveTallies : [...s.waveTallies, s.tally] };
  });
  summary.picks = waveLog;
  if (summary.dead) {
    await page.getByRole('button', { name: 'Play again' }).waitFor({ timeout: 5000 });
    await page.screenshot({ path: `${OUT}/end.png` });
  }
  summary.seed = SEED;
  writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
  console.log(`seed ${SEED}: ${summary.dead ? `died on wave ${summary.wave}` : `reached wave ${summary.wave}`} at ${summary.time} s, score ${summary.score}, kills ${summary.kills}, hull ${summary.hp}, ${picks} cards picked`);
  summary.tallies.forEach((t, i) => {
    const bent = t.hits ? Math.round((100 * t.bentHits) / t.hits) : 0;
    console.log(`  wave ${i + 1}: ${t.hits} hits, ${bent}% bent by the planet, ${t.planetKills} into the planet, ${t.slingshots} slingshots, ${t.planetDamage} hull to the planet, hurt ${t.hurts} times (${t.bentHurts} by bent shots)`);
  });
  check(summary.wave >= 3, 'the hand reaches wave 3');
  const cleared = summary.tallies.slice(0, summary.dead ? summary.wave - 1 : summary.tallies.length);
  cleared.forEach((t, i) => check(t.bentHits >= Math.max(3, t.hits * 0.1) || t.planetKills > 0 || t.slingshots > 0, `wave ${i + 1}: the planet changed the fight`));
  check(errors.length === 0, `no page errors${errors.length ? ':\n' + errors.join('\n') : ''}`);
} catch (err) {
  console.error(err);
  failed = true;
} finally {
  const video = page.video();
  await ctx.close();
  if (video) {
    renameSync(await video.path(), join(OUT, 'run.webm'));
    rmSync(join(OUT, 'tmp'), { recursive: true, force: true });
    console.log(`video: ${OUT}/run.webm`);
  }
  await browser.close();
  server.kill();
}
process.exit(failed ? 1 : 0);
