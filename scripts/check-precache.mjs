// Fails the build when a built file the app needs offline is missing from the service worker's
// precache: Workbox leaves out a file over its size limit without an error.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
const listed = new Set([...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]));
const counts = new Map();
for (const m of sw.matchAll(/url:"([^"]+)"/g)) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);

const walk = (dir) => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : [join(dir, name)]));
const needed = walk(dist)
  .map((file) => relative(dist, file))
  .filter((file) => /\.(js|css|html|woff2|png|svg|webmanifest)$/.test(file) && !/^(sw|workbox-[\w-]+)\.js$/.test(file));

const missing = needed.filter((file) => !listed.has(file));
const twice = [...counts].filter(([, n]) => n > 1).map(([url]) => url);
if (missing.length > 0 || twice.length > 0) {
  if (missing.length > 0) console.error(`Not precached, so not available offline: ${missing.join(', ')}`);
  if (twice.length > 0) console.error(`Precached twice: ${twice.join(', ')}`);
  process.exit(1);
}
console.log(`precache check: all ${needed.length} built files listed once in sw.js`);
