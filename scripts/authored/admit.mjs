// Usage: node scripts/authored/admit.mjs [--dry-run] [--no-eval]      (npm run admit:candidates -- --dry-run)
//
// Moves the candidates the candidate evals found admissible from content/candidates into the authored bank:
//   - each entry, without its `traps`, into content/authored/<skill>.json (its id, `modelledOn` and content unchanged);
//   - its blind-solve record from content/candidates/checks into content/authored/checks/independent-check.json;
//   - its `traps` into content/candidates/admitted/traps.json, which the app does not bundle and the evals do not read
//     as candidates, so a later eval can still see them.
// Candidates that are not admissible stay where they are; a candidate file left empty is removed. Judge verdicts stay
// in content/candidates/judgements.
//
// The admissible list is read from evals/report/candidates.json (`admit: true`). By default the evals are run first
// (`vitest run --config vitest.evals.config.ts candidates`) so the list is fresh; with --no-eval the existing report is
// used, and refused if it is missing or older than any candidate, record, verdict, bank file or eval source.
// Before moving anything every admitted candidate's blind-solve record must match its current text (fingerprint) and
// agree with its key, and the bank's answer positions must stay within 18% to 32%; one problem and nothing moves.
// Idempotent: a second run finds nothing left to move, and a run cut short is finished by the next one.
// --dry-run prints what would move and writes nothing (the evals still run, writing only their own report).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const at = (...parts) => path.join(root, ...parts);
const rel = (file) => path.relative(root, file);
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const noEval = args.includes('--no-eval');
const unknown = args.filter((a) => a !== '--dry-run' && a !== '--no-eval');
if (unknown.length > 0) fail(`unknown argument ${unknown.join(' ')}; usage: node scripts/authored/admit.mjs [--dry-run] [--no-eval]`);
// Admission rests on the candidate evals, which compare candidates with the private booklet files (gitignored).
const BOOKLETS = at('content/booklets');
if (!fs.existsSync(BOOKLETS) || !fs.readdirSync(BOOKLETS).some((f) => f.endsWith('.json')))
  fail('needs the private booklet source set in content/booklets (the candidate evals compare every candidate with it); nothing moved');

const CANDIDATES = at('content/candidates');
const CANDIDATE_CHECKS = at('content/candidates/checks');
const BANK = at('content/authored');
const BANK_CHECKS = at('content/authored/checks/independent-check.json');
const TRAPS = at('content/candidates/admitted/traps.json');
const REPORT = at('evals/report/candidates.json');
/** Positions of the correct option across the bank's four-option questions, as the bank's content test holds them. */
const POSITION_BAND = [0.18, 0.32];

function fail(message) {
  console.error(`admit: ${message}`);
  process.exit(1);
}

const jsonFiles = (dir) =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .map((f) => path.join(dir, f))
    : [];
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
};
const sortedKeys = (record) => Object.fromEntries(Object.keys(record).sort().map((k) => [k, record[k]]));

/** FNV-1a over the visible text, as `fingerprint()` in src/engine/question/authored-verify.ts. */
function fingerprint(e) {
  const text = JSON.stringify({ context: e.context, prompt: e.prompt, options: e.options });
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** What the bank keeps of a candidate: everything but its traps, which only the evals read. */
function bankEntry(candidate) {
  const { traps: _traps, ...entry } = candidate;
  return entry;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------- The scorecard, fresh ----------

/** Everything the scorecard is computed from: a report older than any of these may be out of date. */
function scorecardInputs() {
  const evalSources = fs
    .readdirSync(at('evals'))
    .filter((f) => /\.(ts|json)$/.test(f))
    .map((f) => at('evals', f));
  const judgePrompts = fs
    .readdirSync(at('evals/judges'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => at('evals/judges', f));
  return [
    ...jsonFiles(CANDIDATES),
    ...jsonFiles(CANDIDATE_CHECKS),
    ...jsonFiles(at('content/candidates/judgements')),
    ...jsonFiles(BANK),
    ...jsonFiles(at('content/authored/checks')),
    ...evalSources,
    ...judgePrompts,
    at('src/engine/question/authored-verify.ts'),
    at('src/engine/question/chart-check.ts'),
  ];
}

if (!noEval) {
  console.log('Running the candidate evals (vitest run --config vitest.evals.config.ts candidates) ...');
  const run = spawnSync('npx', ['vitest', 'run', '--config', 'vitest.evals.config.ts', 'candidates'], { cwd: root, encoding: 'utf8' });
  if (run.status !== 0) {
    process.stderr.write(run.stdout ?? '');
    process.stderr.write(run.stderr ?? '');
    fail('the candidate evals failed, so there is no fresh scorecard; nothing moved');
  }
}
if (!fs.existsSync(REPORT)) fail(`no scorecard at ${rel(REPORT)}: run npm run eval:candidates (or drop --no-eval)`);
const reportTime = fs.statSync(REPORT).mtimeMs;
const newer = scorecardInputs().filter((f) => fs.existsSync(f) && fs.statSync(f).mtimeMs > reportTime);
if (newer.length > 0)
  fail(`${rel(REPORT)} is older than ${newer.slice(0, 5).map(rel).join(', ')}${newer.length > 5 ? ` and ${newer.length - 5} more` : ''}: run npm run eval:candidates (or drop --no-eval)`);

const rows = read(REPORT);
if (!Array.isArray(rows)) fail(`${rel(REPORT)} is not the candidates scorecard`);
const admissible = rows.filter((r) => r.admit === true);

// ---------- Where everything is now ----------

/** Candidates by id, with the file holding each. */
const candidateFiles = new Map(jsonFiles(CANDIDATES).map((f) => [f, read(f)]));
const candidates = new Map();
for (const [file, entries] of candidateFiles) for (const e of entries) candidates.set(e.id, { file, entry: e });

const candidateCheckFiles = new Map(jsonFiles(CANDIDATE_CHECKS).map((f) => [f, read(f)]));
const candidateCheck = (id) => {
  for (const [file, records] of candidateCheckFiles) if (records[id]) return { file, record: records[id] };
  return undefined;
};

const bankFiles = new Map(jsonFiles(BANK).map((f) => [f, read(f)]));
const bank = new Map();
for (const [file, entries] of bankFiles) for (const e of entries) bank.set(e.id, { file, entry: e });
const bankChecks = fs.existsSync(BANK_CHECKS) ? read(BANK_CHECKS) : {};
const traps = fs.existsSync(TRAPS) ? read(TRAPS) : {};

// ---------- What moves, checked before anything does ----------

const problems = [];
const moves = [];
const alreadyAdmitted = [];
for (const row of admissible) {
  const id = row.id;
  const found = candidates.get(id);
  const inBank = bank.get(id);
  if (!found) {
    if (inBank) alreadyAdmitted.push(id);
    else problems.push(`${id}: admissible in the scorecard, but in neither content/candidates nor content/authored`);
    continue;
  }
  const c = found.entry;
  if (typeof c.modelledOn !== 'string' || c.modelledOn !== row.modelledOn) problems.push(`${id}: modelledOn ${c.modelledOn} differs from the scorecard's ${row.modelledOn}`);
  if (!/^bk-[A-Za-z0-9]+-q\d+-[a-z]+$/.test(id) || !id.startsWith(`bk-${c.modelledOn}-`)) problems.push(`${id}: not a bk-<booklet question>-<letter> id naming ${c.modelledOn}`);
  if (!/^[a-z]+(-[a-z]+)*$/.test(c.skill ?? '')) problems.push(`${id}: skill ${c.skill}`);
  const check = candidateCheck(id);
  if (!check) problems.push(`${id}: no blind-solve record in ${rel(CANDIDATE_CHECKS)}`);
  else if (check.record.fingerprint !== fingerprint(c)) problems.push(`${id}: changed since its blind solve (record ${check.record.fingerprint}, now ${fingerprint(c)})`);
  else if (check.record.choice !== c.correctIndex) problems.push(`${id}: the blind solver chose ${check.record.choice}, the key says ${c.correctIndex}`);
  const entry = bankEntry(c);
  if (inBank && !same(inBank.entry, entry)) problems.push(`${id}: a different question with this id is already in ${rel(inBank.file)}`);
  if (check && bankChecks[id] && !same(bankChecks[id], check.record)) problems.push(`${id}: ${rel(BANK_CHECKS)} already holds a different record for this id`);
  if (Array.isArray(c.traps) && traps[id] && !same(traps[id], c.traps)) problems.push(`${id}: ${rel(TRAPS)} already holds different traps for this id`);
  moves.push({ id, row, from: found.file, to: path.join(BANK, `${c.skill}.json`), entry, record: check?.record, checkFile: check?.file, traps: c.traps, resumed: Boolean(inBank) });
}

// The bank as it would be, for the one bank-wide rule admission can break: answer positions.
const after = [...[...bank.values()].map((b) => b.entry), ...moves.filter((m) => !m.resumed).map((m) => m.entry)];
const fourOption = after.filter((e) => e.options.length === 4);
const shares = [0, 1, 2, 3].map((p) => fourOption.filter((e) => e.correctIndex === p).length / (fourOption.length || 1));
const percent = (x) => `${Math.round(x * 1000) / 10}%`;
shares.forEach((s, p) => {
  if (s < POSITION_BAND[0] || s > POSITION_BAND[1])
    problems.push(`the bank would have ${percent(s)} of its four-option answers at ${'ABCD'[p]}, outside ${percent(POSITION_BAND[0])} to ${percent(POSITION_BAND[1])}`);
});

// ---------- Report ----------

/** Why a candidate is not admissible, in a few words, from its scorecard row. */
function whyNot(r) {
  const reasons = [];
  for (const [gate, list] of Object.entries(r.gates ?? {})) if (list.length > 0) reasons.push(`${gate}: ${list[0]}`);
  if ((r.fidelity ?? []).length > 0) reasons.push(`fidelity: ${r.fidelity[0]}`);
  if ((r.variety ?? []).length > 0) reasons.push(`variety: ${r.variety[0]}`);
  for (const judge of ['ambiguity', 'distractors', 'realism', 'difficulty']) {
    const j = r.judged?.[judge];
    if (!j) reasons.push(`not yet judged: ${judge}`);
    else if (j.fail) reasons.push(`${judge} judge failed it${j.why ? `: ${j.why}` : ''}`);
  }
  if (r.judged?.owner?.fail) reasons.push(`owner failed it${r.judged.owner.why ? `: ${r.judged.owner.why}` : ''}`);
  return reasons.join('; ') || 'not admissible';
}

const verb = dryRun ? 'Would move' : 'Moving';
console.log(`Scorecard ${rel(REPORT)}${noEval ? '' : ' (fresh)'}: ${rows.length} candidates, ${admissible.length} admissible.`);
if (alreadyAdmitted.length > 0) console.log(`Already in the bank: ${alreadyAdmitted.length} (${alreadyAdmitted.join(', ')}).`);
const resumed = moves.filter((m) => m.resumed);
if (resumed.length > 0) console.log(`Already copied into the bank by a run cut short, still to be removed from content/candidates: ${resumed.map((m) => m.id).join(', ')}.`);

const byTarget = new Map();
for (const m of moves) byTarget.set(m.to, [...(byTarget.get(m.to) ?? []), m]);
console.log(`\n${verb} ${moves.length} into content/authored${moves.length > 0 ? ':' : '.'}`);
for (const [to, list] of [...byTarget].sort()) {
  const tiers = [1, 2, 3].map((t) => list.filter((m) => m.entry.tier === t).length);
  console.log(`  ${rel(to)}  +${list.length} (tier 1/2/3: ${tiers.join('/')}): ${list.map((m) => m.id).join(', ')}`);
}

const leaving = new Map();
for (const m of moves) leaving.set(m.from, (leaving.get(m.from) ?? 0) + 1);
const emptied = [...leaving].filter(([file, n]) => candidateFiles.get(file).length === n).map(([file]) => path.basename(file));
const thinned = [...leaving].filter(([file, n]) => candidateFiles.get(file).length > n).map(([file, n]) => `${path.basename(file)} (${candidateFiles.get(file).length - n} left)`);
console.log(`\nBlind-solve records: ${moves.length} to ${rel(BANK_CHECKS)} (each matching its question's current text and agreeing with its key).`);
console.log(`Traps: ${moves.filter((m) => Array.isArray(m.traps)).length} questions' traps to ${rel(TRAPS)} (eval metadata, not shipped).`);
if (emptied.length > 0) console.log(`Candidate files emptied and removed: ${emptied.join(', ')}.`);
if (thinned.length > 0) console.log(`Candidate files kept for what stays: ${thinned.join(', ')}.`);

const moving = new Set(moves.map((m) => m.id));
const staying = [...candidates.keys()].filter((id) => !moving.has(id));
console.log(`\nStaying in content/candidates: ${staying.length}.`);
const rowById = new Map(rows.map((r) => [r.id, r]));
for (const id of staying) console.log(`  ${id}: ${rowById.has(id) ? whyNot(rowById.get(id)) : 'not in the scorecard'}`);

const bankCount = bank.size + moves.filter((m) => !m.resumed).length;
console.log(
  `\nThe bank: ${bank.size} questions now, ${bankCount} after; correct answer at A/B/C/D across its ${fourOption.length} four-option questions: ${shares.map(percent).join(' / ')} (each must be ${percent(POSITION_BAND[0])} to ${percent(POSITION_BAND[1])}).`,
);

if (problems.length > 0) {
  console.error(`\nRefusing to move anything: ${problems.length} problem${problems.length === 1 ? '' : 's'}.`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
// Blind-solve records a run cut short left behind for questions already in the bank with the same record.
const orphans = [...candidateCheckFiles.values()].flatMap((records) =>
  Object.keys(records).filter((id) => !candidates.has(id) && bank.has(id) && same(bankChecks[id], records[id])),
);
if (orphans.length > 0) console.log(`Records left behind in ${rel(CANDIDATE_CHECKS)} for questions already admitted, to remove: ${orphans.join(', ')}.`);

if (dryRun) {
  console.log('\nDry run: nothing written.');
  process.exit(0);
}
if (moves.length === 0 && orphans.length === 0) {
  console.log('\nNothing to move.');
  process.exit(0);
}

// ---------- Move: into the bank first, then out of content/candidates, so a run cut short leaves nothing lost ----------

for (const [to, list] of byTarget) {
  const entries = bankFiles.get(to) ?? [];
  const ids = new Set(entries.map((e) => e.id));
  const added = [...entries, ...list.filter((m) => !ids.has(m.id)).map((m) => m.entry)];
  // By id: the au- questions keep their order, admitted bk- ones follow them.
  write(to, added.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
}
for (const m of moves) bankChecks[m.id] = m.record;
write(BANK_CHECKS, sortedKeys(bankChecks));
for (const m of moves) if (Array.isArray(m.traps)) traps[m.id] = m.traps;
write(TRAPS, sortedKeys(traps));

for (const [file, entries] of candidateFiles) {
  if (!leaving.has(file)) continue;
  const left = entries.filter((e) => !moving.has(e.id));
  if (left.length === 0) fs.rmSync(file);
  else write(file, left);
}
const leavingChecks = new Set([...moving, ...orphans]);
for (const [file, records] of candidateCheckFiles) {
  if (!Object.keys(records).some((id) => leavingChecks.has(id))) continue;
  write(file, sortedKeys(Object.fromEntries(Object.entries(records).filter(([id]) => !leavingChecks.has(id)))));
}

console.log(`\nMoved ${moves.length}. Now run: npm run typecheck && npm test && npm run build`);
