// Rasterises public/favicon.svg into the PNG icons the manifest and iOS need.
// Run once after changing the icon: node scripts/make-icons.mjs
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const svg = await readFile(new URL('../public/favicon.svg', import.meta.url), 'utf8');
const targets = [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['apple-touch-icon.png', 180, 1],
  // Maskable icons get cropped to a circle; shrink the art into the safe zone.
  ['icon-maskable-512.png', 512, 0.72],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, scale] of targets) {
  await page.setViewportSize({ width: size, height: size });
  const art = Math.round(size * scale);
  await page.setContent(
    `<body style="margin:0;background:#0b0b0c;display:grid;place-items:center;height:${size}px">` +
      `<div style="width:${art}px;height:${art}px">${svg.replace('<svg', `<svg width="${art}" height="${art}"`)}</div></body>`,
  );
  await page.screenshot({ path: new URL(`../public/${name}`, import.meta.url).pathname });
}
await browser.close();
