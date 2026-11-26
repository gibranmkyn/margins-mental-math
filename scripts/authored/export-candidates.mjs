// Usage: node scripts/authored/export-candidates.mjs <contentDir> <outDir> <batchCount> [ids comma-separated]
// The blind-solve export for candidates (content/candidates). As export.mjs, with two differences:
//
// 1. Opaque ids. A candidate's id (bk-pst2-q19-c) names its source and its variant letter, so the solver
//    sees `s-<8 hex>` instead. The key is written beside the output folder, never inside it:
//    <outDir>.map.json = { "<opaque id>": { "id": "<candidate id>", "fingerprint": "<visible text fingerprint>" } }.
//    Give the solver only <outDir>/batch-N.json, and pass the map to compare.mjs and record.mjs with --map.
//    The opaque id is random per export, so two exports cannot be lined up to recover a candidate.
//
// 2. Charts read from gridlines. A chart with `labelled: false` shows the owner a drawing, not numbers. Its
//    values are handed to the solver as readings (scripts/authored/chart-readings.mjs): each rounded to the
//    nearest quarter of a gridline step, exact on a gridline or midway between two, with a `readings` line
//    stating the gridlines. That is the precision evals/judges/ambiguity.md grants a careful reader; a
//    question whose key does not survive it is too fragile to admit.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readChart, readingsNote } from './chart-readings.mjs';

const [contentDir, outDir, batchCountArg, idsArg] = process.argv.slice(2);
if (!contentDir || !outDir || !batchCountArg) {
  console.error('Usage: node scripts/authored/export-candidates.mjs <contentDir> <outDir> <batchCount> [ids comma-separated]');
  process.exit(1);
}
const only = idsArg ? new Set(idsArg.split(',').filter(Boolean)) : null;
const entries = fs.readdirSync(contentDir).filter((f) => f.endsWith('.json')).sort()
  .flatMap((f) => JSON.parse(fs.readFileSync(path.join(contentDir, f), 'utf8')))
  .filter((e) => !only || only.has(e.id));

/** The fingerprint of the visible text, as authored-verify.ts and record.mjs compute it. */
function fingerprint(e) {
  const text = JSON.stringify({ context: e.context, prompt: e.prompt, options: e.options });
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0; }
  return hash.toString(16).padStart(8, '0');
}

const asRead = (block) =>
  block.type === 'chart' && !block.labelled && block.axis ? { ...readChart(block), readings: readingsNote(block) } : block;

// Shuffle so a batch mixes sources and skills (seeded, so a run can be repeated with SEED).
let s = Number(process.env.SEED ?? 24680);
const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
const order = entries.map((e) => [rnd(), e]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
const n = Number(batchCountArg);
fs.mkdirSync(outDir, { recursive: true });
const map = {};
const letters = 'ABCDE';
const used = new Set();
const opaque = () => {
  let id;
  do id = `s-${crypto.randomBytes(4).toString('hex')}`; while (used.has(id));
  used.add(id);
  return id;
};
for (let b = 0; b < n; b++) {
  const batch = order.filter((_, i) => i % n === b).map((e) => {
    const id = opaque();
    map[id] = { id: e.id, fingerprint: fingerprint(e) };
    return { id, context: e.context.map(asRead), question: e.prompt, options: Object.fromEntries(e.options.map((o, i) => [letters[i], o])) };
  });
  fs.writeFileSync(path.join(outDir, `batch-${b + 1}.json`), JSON.stringify(batch, null, 2));
}
const mapFile = `${outDir.replace(/\/+$/, '')}.map.json`;
fs.writeFileSync(mapFile, JSON.stringify(map, null, 2) + '\n');
console.log(`${order.length} questions in ${n} batches in ${outDir}; private id map in ${mapFile} (do not give it to the solver)`);
