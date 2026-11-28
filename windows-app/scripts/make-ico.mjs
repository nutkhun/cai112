// Renders the app icon with a headless browser and writes assets/icon.png (512 px)
// and assets/icon.ico (16–256 px). Needs Playwright with Chromium:  node scripts/make-ico.mjs
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pngToIco from 'png-to-ico';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(here, '..', 'assets');
mkdirSync(assets, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`file://${path.join(here, 'icon.html')}`);
await page.evaluate(() => document.fonts.ready);

const render = async (size, options = {}) => {
  const dataUrl = await page.evaluate(([s, o]) => drawIcon(s, o), [size, options]);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
};

writeFileSync(path.join(assets, 'icon.png'), await render(512));
// Small sizes leave the words out: they would be unreadable.
const sizes = [[256, true], [128, true], [64, false], [48, false], [32, false], [24, false], [16, false]];
const pngs = [];
for (const [size, withText] of sizes) pngs.push(await render(size, { withText }));
writeFileSync(path.join(assets, 'icon.ico'), await pngToIco(pngs));
await browser.close();
console.log('Wrote assets/icon.png and assets/icon.ico');
