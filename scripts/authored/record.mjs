// Usage: node scripts/authored/record.mjs <contentDir> <outFile> [--map <outDir>.map.json] <answersFile...>
// Records, for every question the checker AGREED on, the fingerprint of the visible text it saw and its choice.
// Disagreements are not recorded (so those questions stay unadmitted until fixed and re-checked).
// With --map (from export-candidates.mjs), answers name opaque ids, translated back through the map, and an
// answer is recorded only if the question's visible text is still the text exported (its fingerprint in the map).
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const at = args.indexOf('--map');
const map = at >= 0 ? JSON.parse(fs.readFileSync(args[at + 1], 'utf8')) : null;
const [contentDir, outFile, ...answerFiles] = at >= 0 ? args.filter((_, i) => i !== at && i !== at + 1) : args;
const entries = fs.readdirSync(contentDir).filter((f) => f.endsWith('.json')).sort()
  .flatMap((f) => JSON.parse(fs.readFileSync(path.join(contentDir, f), 'utf8')));
const byId = new Map(entries.map((e) => [e.id, e]));
function fingerprint(e) {
  const text = JSON.stringify({ context: e.context, prompt: e.prompt, options: e.options });
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0; }
  return hash.toString(16).padStart(8, '0');
}
const existing = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};
for (const a of answerFiles.flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')))) {
  const seen = map ? map[a.id] : { id: a.id };
  const e = seen && byId.get(seen.id); const choice = 'ABCDE'.indexOf(a.choice);
  if (!e) continue;
  if (seen.fingerprint && seen.fingerprint !== fingerprint(e)) { console.log(`not recorded, changed since the export: ${e.id}`); continue; }
  if (choice === e.correctIndex) existing[e.id] = { fingerprint: fingerprint(e), choice };
}
const sorted = Object.fromEntries(Object.keys(existing).sort().map((k) => [k, existing[k]]));
fs.writeFileSync(outFile, JSON.stringify(sorted, null, 2) + '\n');
console.log(`recorded ${Object.keys(sorted).length}`);
