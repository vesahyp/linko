// Frame sheets: the playthrough's screenshots in grids of twelve, with the sim
// time on each, so a whole run can be read at a glance. `make sheets` after
// `make playthrough` writes shots/playthrough/sheet-N.png; `make sheets
// FROM=0 TO=30` writes one sheet of that stretch, sheet-0-30s.png.
import { chromium } from 'playwright';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'shots/playthrough';
const [from, to] = [process.argv[2], process.argv[3]].map((v) => (v === undefined || v === '' ? null : Number(v)));
const frames = readdirSync(DIR)
  .filter((f) => /^f-\d+\.png$/.test(f))
  .filter((f) => from === null || (parseInt(f.slice(2)) >= from && parseInt(f.slice(2)) <= to))
  .sort();
const per = from === null ? 12 : frames.length;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1800, height: 1100 } });
for (let k = 0; k * per < frames.length; k++) {
  const group = frames.slice(k * per, k * per + per);
  const imgs = group.map((f) => `<figure><img src="data:image/png;base64,${readFileSync(join(DIR, f)).toString('base64')}"><figcaption>${parseInt(f.slice(2))} s</figcaption></figure>`).join('');
  await page.setContent(`<style>body{margin:0;background:#000;display:grid;grid-template-columns:repeat(3,600px);align-content:start}figure{margin:0;position:relative}img{width:600px;display:block}figcaption{position:absolute;left:6px;bottom:4px;color:#ff0;font:bold 16px sans-serif}</style>${imgs}`);
  const name = from === null ? `sheet-${k + 1}.png` : `sheet-${from}-${to}s.png`;
  await page.screenshot({ path: join(DIR, name), fullPage: true });
  console.log(`${DIR}/${name}`);
}
await browser.close();
