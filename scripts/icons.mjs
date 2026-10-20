// The home-screen icons as PNG, drawn from public/icon.svg: iOS ignores an SVG
// apple-touch-icon, and Android wants 192 and 512. `make icons` after changing
// the SVG; the PNGs are committed.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/icon.svg', 'utf8');
const browser = await chromium.launch();
for (const [name, size] of [
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  // iOS rounds the corners itself: the square fills the whole icon
  await page.setContent(`<style>body{margin:0;background:#070a1e}svg{width:${size}px;height:${size}px;display:block}</style>${svg.replace('rx="96"', 'rx="0"')}`);
  await page.screenshot({ path: `public/${name}` });
  await page.close();
  console.log(`public/${name}`);
}
await browser.close();
