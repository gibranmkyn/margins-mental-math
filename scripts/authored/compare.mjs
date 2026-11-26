// Usage: node scripts/authored/compare.mjs <contentDir> [--map <outDir>.map.json] <answersFile...>
// Compares checker answers with the bank; prints disagreements and writes nothing.
// With --map (from export-candidates.mjs), answers name opaque ids, translated back through the map;
// an answer on a question whose visible text changed since the export is reported, not compared.
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const at = args.indexOf('--map');
const map = at >= 0 ? JSON.parse(fs.readFileSync(args[at + 1], 'utf8')) : null;
const [contentDir, ...answerFiles] = at >= 0 ? args.filter((_, i) => i !== at && i !== at + 1) : args;
const entries = fs.readdirSync(contentDir).filter((f) => f.endsWith('.json')).sort()
  .flatMap((f) => JSON.parse(fs.readFileSync(path.join(contentDir, f), 'utf8')));
const byId = new Map(entries.map((e) => [e.id, e]));
function fingerprint(e) {
  const text = JSON.stringify({ context: e.context, prompt: e.prompt, options: e.options });
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0; }
  return hash.toString(16).padStart(8, '0');
}
const answers = answerFiles.flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
let agree = 0; const disagree = [];
for (const a of answers) {
  const seen = map ? map[a.id] : { id: a.id };
  const e = seen && byId.get(seen.id); if (!e) { console.log('unknown', a.id); continue; }
  if (seen.fingerprint && seen.fingerprint !== fingerprint(e)) { console.log('changed since the export', a.id, e.id); continue; }
  const idx = 'ABCDE'.indexOf(a.choice);
  if (idx === e.correctIndex) agree++; else disagree.push({ id: e.id, checker: a.choice, bank: 'ABCDE'[e.correctIndex], note: a.working });
}
console.log(`answers ${answers.length}, agree ${agree}, disagree ${disagree.length}`);
for (const d of disagree) console.log(JSON.stringify(d));
