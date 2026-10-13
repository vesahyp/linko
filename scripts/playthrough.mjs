// A run on an emulated iPhone 15 in landscape, played by the hand (tools/hand.ts:
// a player with a thumb's reaction time, thumb speed, attention and judgement),
// every input a real touch through Chrome's touch pipeline (CDP
// Input.dispatchTouchEvent): the left thumb lands and drags the ship, lifts and
// lands again when it runs out of glass; the right thumb holds to charge and
// lifts to fire; a tap on the pod button; a tap on a card between stages. The
// hand only says where its thumbs are; this script puts them on the glass.
//
// `make playthrough [SEED=7] [UPTO=3]` plays until the ship is lost or UPTO
// stages are cleared. Needs `make shots-setup` once. Serves a production build
// (the dev server hot-reloads mid-run when a file is saved). Writes
// shots/playthrough/: run.webm, a screenshot every two seconds, the title, the
// cards and the end screen, and summary.json. Exits non-zero when the page
// throws, when the hand does not beat the first boss, when the screen is never
// busy (40 enemy shots in the air at once), or when stage 1 gives no power-ups.
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
const STAGES_UPTO = Number(process.env.WAVES || 3);
try {
  await page.goto(`http://localhost:${port}/linko/?hand=1&seed=${SEED}`);
  await page.screenshot({ path: `${OUT}/title.png` });
  await page.getByRole('button', { name: 'Play', exact: true }).tap();
  await page.waitForFunction(() => window.__sim && window.__hand && window.__layout, null, { timeout: 15000 });
  const { w, h } = await page.evaluate(() => window.__layout);
  // the right thumb lands low on the right, clear of the pod button
  const R = { x: w * 0.78, y: h * 0.45 };
  const ids = { L: 1, R: 2, P: 3 };
  const fingers = new Map();
  const pts = () => [...fingers.values()];
  let podTaps = 0;
  let shot = 0;
  let cleared = 0;
  const t0 = Date.now();
  const log = [];
  let ticks = 0;
  while (Date.now() - t0 < 9 * 60 * 1000) {
    const st = await page.evaluate(() => {
      const s = window.__sim;
      return { hand: window.__hand, phase: s.phase, stage: s.stage, time: s.time, dead: s.ship.dead, phaseTime: s.phaseTime, hp: s.ship.hp };
    });
    if (st.dead && st.phaseTime > 1.8) break;
    if (st.phase === 'pick') {
      if (fingers.size) {
        await touch('touchEnd', []);
        fingers.clear();
      }
      cleared++;
      if (cleared >= STAGES_UPTO) break;
      await page.screenshot({ path: `${OUT}/cards-stage-${st.stage}.png` });
      const want = await page.evaluate(() => window.__hand.pick);
      if (want) {
        await page.locator(`button[data-id="${want}"]`).tap();
        log.push({ stage: st.stage, pick: want, hp: Math.round(st.hp), at: Math.round(st.time) });
      }
      await page.waitForTimeout(300);
      continue;
    }
    const th = st.hand.thumbs;
    // left thumb: where the hand has it, or lifted
    if (th.move) {
      const p = { x: Math.max(1, Math.min(w - 1, th.move.x)), y: Math.max(1, Math.min(h - 1, th.move.y)), id: ids.L };
      if (!fingers.has('L')) {
        fingers.set('L', p);
        await touch('touchStart', pts());
      } else fingers.set('L', p);
    } else if (fingers.has('L')) {
      const f = fingers.get('L');
      fingers.delete('L');
      await touch('touchEnd', [f]);
    }
    // right thumb: down while charging, a little wobble, up to fire
    if (th.right && !fingers.has('R')) {
      fingers.set('R', { x: R.x, y: R.y, id: ids.R });
      await touch('touchStart', pts());
    } else if (!th.right && fingers.has('R')) {
      const f = fingers.get('R');
      fingers.delete('R');
      await touch('touchEnd', [f]);
    } else if (fingers.has('R')) fingers.set('R', { x: R.x + Math.random() * 3, y: R.y + Math.random() * 3, id: ids.R });
    if (fingers.size) await touch('touchMove', pts());
    if (st.hand.podTaps > podTaps) {
      podTaps = st.hand.podTaps;
      const p = await page.evaluate(() => window.__layout.pod);
      const f = { x: p.x + 2, y: p.y - 2, id: ids.P };
      fingers.set('P', f);
      await touch('touchStart', pts());
      await page.waitForTimeout(60);
      fingers.delete('P');
      await touch('touchEnd', [f]);
    }
    if (st.time >= shot * 2) {
      await page.screenshot({ path: `${OUT}/f-${String(Math.round(st.time)).padStart(3, '0')}.png` });
      shot++;
    }
    ticks++;
    await page.waitForTimeout(8);
  }
  console.log(`touch updates: ${(ticks / ((Date.now() - t0) / 1000)).toFixed(0)} a second`);
  summary = await page.evaluate(() => {
    const s = window.__sim;
    return { stage: s.stage, dead: s.ship.dead, time: Math.round(s.time), hp: Math.round(s.ship.hp), score: s.score, kills: s.kills, ship: { gun: s.ship.gun, level: s.ship.gunLevel, speed: s.ship.speed, missiles: s.ship.missiles, bits: s.ship.bits, cards: s.ship.cards }, tallies: s.phase === 'pick' ? s.stageTallies : [...s.stageTallies, s.tally] };
  });
  summary.picks = log;
  summary.seed = SEED;
  if (summary.dead) {
    await page.getByRole('button', { name: /Continue stage/ }).waitFor({ timeout: 5000 });
    await page.screenshot({ path: `${OUT}/end.png` });
  }
  writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
  console.log(`seed ${SEED}: ${summary.dead ? `ship lost on stage ${summary.stage}` : `cleared ${cleared} stages`} at ${summary.time} s, score ${summary.score}, kills ${summary.kills}, ${summary.ship.gun} ${summary.ship.level} S${summary.ship.speed} M${summary.ship.missiles} B${summary.ship.bits}`);
  summary.tallies.forEach((t, i) => {
    console.log(`  stage ${i + 1}: ${t.formations} formations wiped, ${t.drops} power-ups, ${t.hurts} hits taken (${Object.entries(t.hurtBy).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}), up to ${t.peakShots} enemy shots at once, ${t.pings} shots off armour${t.bossTime ? `, boss down in ${Math.round(t.bossTime)} s` : ''}`);
  });
  const bosses = summary.tallies.reduce((a, t) => a + t.bosses, 0);
  check(bosses >= 1, 'the hand beats the first boss');
  check(Math.max(...summary.tallies.map((t) => t.peakShots)) >= 40, 'the screen gets busy: 40 or more enemy shots in the air at once');
  check(summary.tallies[0].drops >= 3, 'stage 1 gives the hand power-ups');
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
