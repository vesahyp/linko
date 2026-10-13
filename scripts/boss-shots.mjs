// Each boss mid-fight on an emulated iPhone 15 in landscape: ?stage=N&boss=1
// starts the stage at its boss with the build a run has by then, ?god=1 keeps
// the idle ship alive, and a screenshot every few seconds shows the phases as
// the pod and the guns wear the boss down. `make boss-shots` (needs
// `make shots-setup`); writes shots/bosses/.
import { chromium, devices } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';

const OUT = 'shots/bosses';
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
const browser = await chromium.launch();
try {
  for (const stage of [1, 2, 3]) {
    const ctx = await browser.newContext({ ...devices['iPhone 15 landscape'], hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${port}/linko/?stage=${stage}&boss=1&god=1&seed=3&speed=2`);
    await page.getByRole('button', { name: 'Play', exact: true }).tap();
    for (const t of [8, 16, 26, 40]) {
      await page.waitForFunction((t) => window.__sim && window.__sim.stageTime >= t + window.__sim.cursor * 0, t + 70, { timeout: 120000 }).catch(() => {});
      // the pod goes out half way, so it works the boss over too
      if (t === 16) await page.tap('.podbtn', { force: true }).catch(() => {});
      await page.screenshot({ path: `${OUT}/stage-${stage}-${t}s.png` });
    }
    console.log(`${OUT}/stage-${stage}-*.png`);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
