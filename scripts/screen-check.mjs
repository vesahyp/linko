// The play screen on an emulated iPhone 15 in landscape, two ways:
//   home-screen: the whole 852x393 screen, as the game runs when added to the
//     home screen, with the iPhone's safe area stood in (?safe=59,59,0,21: the
//     notch side, the other side, the top, the home bar; Chromium's emulation
//     has no notch of its own);
//   safari: Playwright's iPhone 15 landscape preset, 734x343, the part of the
//     screen Safari leaves a page beside its bars.
// Checks that the canvas covers the whole screen, that the stage is drawn out
// to both edges (no black letterbox), and that the HUD and the pod button sit
// inside the safe area. `make screen-check` (needs `make shots-setup`); writes
// shots/screen/.
import { chromium, devices } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';

const OUT = 'shots/screen';
const SAFE = { l: 59, r: 59, t: 0, b: 21 };
const port = await new Promise((resolve) => {
  const srv = createServer();
  srv.listen(0, () => {
    const p = srv.address().port;
    srv.close(() => resolve(p));
  });
});
execFileSync('npx', ['vite', 'build', '--logLevel', 'error'], { stdio: 'inherit' });
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
for (let i = 0; !(await fetch(`http://localhost:${port}/linko/`).then((r) => r.ok, () => false)); i++) {
  if (i > 60) throw new Error('no preview server');
  await new Promise((r) => setTimeout(r, 500));
}
let failed = false;
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failed = true;
};
const browser = await chromium.launch();
const phone = devices['iPhone 15 landscape'];
const cases = [
  { name: 'home-screen', ctx: { ...phone, viewport: { width: 852, height: 393 }, screen: { width: 852, height: 393 } }, safe: SAFE },
  { name: 'safari', ctx: phone, safe: { l: 0, r: 0, t: 0, b: 0 } },
];
try {
  for (const c of cases) {
    const ctx = await browser.newContext({ ...c.ctx, hasTouch: true });
    const page = await ctx.newPage();
    const S = c.safe;
    await page.goto(`http://localhost:${port}/linko/?safe=${S.l},${S.r},${S.t},${S.b}&seed=7&stage=1&god=1`);
    await page.screenshot({ path: `${OUT}/${c.name}-title.png` });
    await page.getByRole('button', { name: 'Play', exact: true }).tap();
    await page.waitForFunction(() => window.__sim && window.__sim.stageTime > 5, null, { timeout: 20000 });
    await page.screenshot({ path: `${OUT}/${c.name}-play.png` });
    const r = await page.evaluate(() => {
      const cv = document.querySelector('canvas');
      const b = cv.getBoundingClientRect();
      const g = cv.getContext('2d');
      const k = cv.width / b.width;
      const px = (x, y) => Array.from(g.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data);
      const hud = document.querySelector('.hull').getBoundingClientRect();
      const pause = document.querySelector('.pause').getBoundingClientRect();
      const pod = document.querySelector('.podbtn').getBoundingClientRect();
      return { vw: innerWidth, vh: innerHeight, cw: b.width, ch: b.height, left: px(2, b.height / 2), right: px(b.width - 2, b.height / 2), hudLeft: hud.left, pauseRight: pause.right, podRight: pod.right, podBottom: pod.bottom };
    });
    console.log(`${c.name}: screen ${r.vw}x${r.vh}, canvas ${r.cw}x${r.ch}; edge pixels left ${r.left.slice(0, 3)}, right ${r.right.slice(0, 3)}`);
    check(r.cw === r.vw && r.ch === r.vh, `${c.name}: the canvas covers the whole screen`);
    // the old letterbox was #020309; the stage's sky is lighter at every edge
    const lit = (p) => p[0] + p[1] + p[2] > 3 * 10;
    check(lit(r.left) && lit(r.right), `${c.name}: the stage is drawn out to the left and right edges${S.l ? ', under the notch too' : ''}`);
    check(r.hudLeft >= S.l && r.pauseRight <= r.vw - S.r, `${c.name}: the HUD sits inside the safe area (hull bar from ${Math.round(r.hudLeft)} px, pause to ${Math.round(r.pauseRight)} px)`);
    check(r.podRight <= r.vw - S.r && r.podBottom <= r.vh - S.b, `${c.name}: the pod button sits inside the safe area`);
    await ctx.close();
  }
  console.log(`${OUT}/home-screen-play.png, ${OUT}/safari-play.png`);
} finally {
  await browser.close();
  server.kill();
}
process.exit(failed ? 1 : 0);
