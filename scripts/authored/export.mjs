// Usage: node scripts/authored/export.mjs <contentDir> <outDir> <batchCount> [ids comma-separated]
// Writes batches of questions with only what the owner sees (context, prompt, options): no answer,
// solution or check, so an independent checker must solve each one from the visible text.
import fs from 'node:fs';
import path from 'node:path';
const [contentDir, outDir, batchCountArg, idsArg] = process.argv.slice(2);
const only = idsArg ? new Set(idsArg.split(',')) : null;
const entries = fs.readdirSync(contentDir).filter((f) => f.endsWith('.json')).sort()
  .flatMap((f) => JSON.parse(fs.readFileSync(path.join(contentDir, f), 'utf8')))
  .filter((e) => !only || only.has(e.id));
// Shuffle deterministically so a batch mixes skills and tiers.
let s = Number(process.env.SEED ?? 12345); const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
const order = entries.map((e) => [rnd(), e]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
const n = Number(batchCountArg);
fs.mkdirSync(outDir, { recursive: true });
const letters = 'ABCDE';
for (let b = 0; b < n; b++) {
  const batch = order.filter((_, i) => i % n === b).map((e) => ({
    id: e.id,
    context: e.context,
    question: e.prompt,
    options: Object.fromEntries(e.options.map((o, i) => [letters[i], o])),
  }));
  fs.writeFileSync(path.join(outDir, `batch-${b + 1}.json`), JSON.stringify(batch, null, 2));
}
console.log(`${order.length} questions in ${n} batches`);
