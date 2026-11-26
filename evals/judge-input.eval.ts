import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { candidates, fingerprintText, judgements, sources } from './lib';
import type { Candidate } from './lib';
import { blind, candidateItem, distractorsItem, fromQuestion, judgeItemId, judgePrompt, pair } from './judge-view';
import type { Plain } from './judge-view';

/**
 * Writes what each judge sees, in one neutral format for candidates and booklet
 * questions alike: no source labels, no booklet name or case title, no ids that
 * give a question away. `npm run eval:judge-input` (after `npm run eval:candidates`).
 *
 *   evals/judge-input/<judge>/batch-NN.json   candidates ready for judging (see evals/README.md)
 *   evals/judge-input/key.json                which candidate each item id is (never shown to a judge)
 *   evals/calibration/input/<judge>.json      the calibration set: booklet questions and broken copies
 *   evals/calibration/key.json                its expected verdicts, never shown to a judge
 *
 * Every item id is a fingerprint of the judge's prompt and of what the judge saw
 * (evals/judge-view.ts): a verdict saved against it counts only while neither changes.
 * What each judge receives is stated in its prompt, evals/judges/<judge>.md.
 */

const BATCH = 10;

/** A deterministic shuffle, so an export can be repeated exactly. */
function shuffled<T>(items: T[], seed: number): T[] {
  let s = seed;
  const next = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  return items.map((item) => [next(), item] as const).sort((a, b) => a[0] - b[0]).map(([, item]) => item);
}

function batches<T>(items: T[]): T[][] {
  return Array.from({ length: Math.ceil(items.length / BATCH) }, (_, i) => items.slice(i * BATCH, (i + 1) * BATCH));
}

function write(path: string, data: unknown): void {
  const url = new URL(path, import.meta.url);
  mkdirSync(new URL('.', url), { recursive: true });
  writeFileSync(url, JSON.stringify(data, null, 1) + '\n');
}

const sourcePlain = (id: string) => fromQuestion(sources.get(id)!);
const nn = (i: number) => String(i + 1).padStart(2, '0');

// ---------- Candidates ----------

/** The candidates the last `npm run eval:candidates` found ready: every gate but the blind solve, fidelity and variety pass. */
const reportFiles = import.meta.glob<Array<{ id: string; ready: boolean }>>('./report/candidates.json', { eager: true, import: 'default' });
const report = Object.values(reportFiles)[0];

function exportCandidates(ready: Candidate[]): string[] {
  const out = './judge-input/';
  // Batches from an earlier export would otherwise linger when fewer candidates are ready now.
  rmSync(new URL(out, import.meta.url), { recursive: true, force: true });
  const order = shuffled(ready, 17);
  const key: Record<string, string> = {};
  const keep = <T extends { id: string }>(c: Candidate, item: T) => ((key[item.id] = c.id), item);
  batches(order).forEach((group, i) => {
    for (const judge of ['ambiguity', 'realism', 'distractors', 'difficulty'])
      write(`${out}${judge}/batch-${nn(i)}.json`, group.map((c) => keep(c, candidateItem(judge, c, sourcePlain(c.modelledOn)))));
  });

  // Pending batches: only the candidates with no verdict that counts for that judge (never judged, or changed since,
  // or judged under an earlier prompt). A fix round, or a round beside admitted variants, judges these instead of every batch.
  const pending: Record<string, Record<string, string[]>> = {};
  for (const judge of ['ambiguity', 'realism', 'distractors', 'difficulty']) {
    const waiting = order.filter((c) => {
      const id = candidateItem(judge, c, sourcePlain(c.modelledOn)).id;
      return !judgements.some((j) => j.judge === judge && j.id === id);
    });
    batches(waiting).forEach((group, i) => {
      const file = `${out}${judge}/pending-${nn(i)}.json`;
      write(file, group.map((c) => keep(c, candidateItem(judge, c, sourcePlain(c.modelledOn)))));
      ((pending[judge] ??= {})[`evals/judge-input/${judge}/pending-${nn(i)}.json`] = group.map((c) => c.id));
    });
  }
  write(`${out}pending.json`, pending);
  write(`${out}key.json`, key);
  return [
    `${ready.length} candidates in ${Math.ceil(ready.length / BATCH)} batches per judge, written to evals/judge-input/`,
    `pending (no verdict that counts): ${['ambiguity', 'realism', 'distractors', 'difficulty']
      .map((j) => `${j} ${Object.values(pending[j] ?? {}).flat().length}`)
      .join(', ')}; files and candidate ids in evals/judge-input/pending.json`,
  ];
}

// ---------- Calibration ----------

/**
 * A deliberately broken copy of a booklet question, with one known defect for one judge.
 * `edits` replace text in the question as served (each `from` must occur exactly once in
 * its JSON); fields given in full (`prompt`, `options`, `correctIndex`, `solution`, `shortcut`)
 * replace the source's. `round: 2` or `round: 3` marks copies added for a later round's rules: they
 * are numbered after every earlier item, so earlier ids stay stable.
 */
interface Broken {
  judge: 'ambiguity' | 'distractors' | 'realism' | 'difficulty';
  basedOn: string;
  defect: string;
  round?: number;
  edits?: Array<{ from: string; to: string }>;
  prompt?: string;
  options?: string[];
  correctIndex?: number;
  solution?: string[];
  shortcut?: string;
}

const brokenFiles = import.meta.glob<Broken[]>('./calibration/broken.json', { eager: true, import: 'default' });
const broken = Object.values(brokenFiles).flat();
/** Faithful candidates written to the brief (also the worked examples in evals/WRITING.md): every judge should pass them. */
const faithfulFiles = import.meta.glob<Candidate[]>('./calibration/faithful.json', { eager: true, import: 'default' });
const faithful = Object.values(faithfulFiles).flat();
/**
 * Rewrites of booklet questions at the same difficulty (new company, wording and numbers; the same steps and traps),
 * for the difficulty judge only: it should pass each one paired with its source. Without them its should-pass items
 * are mostly booklet questions paired with themselves, which test nothing about parity.
 */
type Rewrite = Plain & { id: string; modelledOn: string };
const rewriteFiles = import.meta.glob<Rewrite[]>('./calibration/rewrites.json', { eager: true, import: 'default' });
const rewrites = Object.values(rewriteFiles).flat();

/** Booklet questions every judge should pass: no booklet note (so no disputed key), spread across booklets and skills. */
export const CALIBRATION_REAL = [
  'bcg-q03', 'bcg-q14', 'pst1-q05', 'pst1-q17', 'pst1-q22', 'pst1-q24', 'pst2-q02', 'pst2-q12', 'pst2-q21', 'pst3-q11',
  'pst3-q14', 'pst3-q19', 'pracA-q06', 'pracA-q23', 'pracB-q07', 'pracB-q12', 'pracB-q23', 'pracC-q05', 'pracC-q16', 'sample-q07',
];
/**
 * Booklet questions added for the second round's rules, for one judge each, numbered after the first round:
 * ambiguity: an exact-value question whose computed value is near, not equal to, its option (pracA-q23);
 * distractors: a statement about something the data does not cover (pracB-q11)
 * and an option ruled out by another option alone, a cost that is part of another (pracC-q23).
 */
const CALIBRATION_REAL_ROUND2: Record<string, string[]> = { ambiguity: ['pracA-q23'], distractors: ['pracB-q11', 'pracC-q23'] };
/**
 * Booklet questions added with the filler rule (evals/judges/distractors.md, "Fillers"), numbered after round 2: each keeps
 * one wrong option no slip lands on (pst2-q15 a ranking, pst2-q03 a step of a coarse scale, pst2-q19 a numeric value).
 */
const CALIBRATION_REAL_ROUND3: Record<string, string[]> = { distractors: ['pst2-q15', 'pst2-q03', 'pst2-q19'] };
/**
 * The retired real-or-generated judge had 20 calibration items here (10 booklet questions, 10 bank questions). They are
 * no longer written, but still take their numbers, so that the ids of the items after them stay stable.
 */
const RETIRED_REAL_OR_GENERATED_ITEMS = 20;

function applyBroken(b: Broken): Plain {
  const source = sourcePlain(b.basedOn);
  let text = JSON.stringify(source);
  for (const { from, to } of b.edits ?? []) {
    const count = text.split(from).length - 1;
    if (count !== 1) throw new Error(`calibration ${b.basedOn} (${b.defect}): "${from}" occurs ${count} times, not once`);
    text = text.replace(from, to);
  }
  const edited = JSON.parse(text) as Plain;
  return {
    ...edited,
    ...(b.prompt !== undefined && { prompt: b.prompt }),
    ...(b.options !== undefined && { options: b.options }),
    ...(b.correctIndex !== undefined && { correctIndex: b.correctIndex }),
    ...(b.solution !== undefined && { solution: b.solution }),
    ...(b.shortcut !== undefined && { shortcut: b.shortcut }),
  };
}

type Judge = 'ambiguity' | 'distractors' | 'realism' | 'difficulty';
const JUDGE_NAMES: Judge[] = ['ambiguity', 'distractors', 'realism', 'difficulty'];
interface CalItem {
  kind: string;
  basedOn: string;
  plain: Plain;
  defect?: string | undefined;
}

/**
 * A calibration item as its judge sees it. Its id is `cal-NNN-` and a fingerprint of the judge's prompt
 * and the item: verdicts saved before a prompt or an input changed no longer match and show as not judged.
 */
function renderCal(judge: Judge, n: number, item: CalItem): { id: string } {
  const build = (id: string): { id: string } => {
    if (judge === 'ambiguity' || judge === 'realism') return blind(id, item.plain);
    if (judge === 'distractors') return distractorsItem(id, item.plain, item.basedOn);
    return pair(id, item.plain, sourcePlain(item.basedOn));
  };
  const id = `cal-${String(n).padStart(3, '0')}-${judgeItemId(judge, `cal-${n}`, build(''), 'x').slice(2)}`;
  return build(id);
}

function exportCalibration(): string[] {
  // The calibration set is built from broken copies, faithful candidates and rewrites of booklet questions, kept
  // privately beside the booklets; unless all three are there nothing is written, so an earlier key is not overwritten
  // with a partial one.
  if (broken.length === 0 || faithful.length === 0 || rewrites.length === 0)
    return ['calibration: skipped, needs all of evals/calibration/broken.json, faithful.json and rewrites.json'];
  const key: Array<{ id: string; judge: string; kind: string; expectFail: boolean; defect?: string; basedOn: string }> = [];
  let n = 0;
  const files: Record<string, Array<{ id: string }>> = {};
  const add = (judge: Judge, item: CalItem, expectFail: boolean) => {
    const rendered = renderCal(judge, ++n, item);
    key.push({ id: rendered.id, judge, kind: item.kind, expectFail, ...(item.defect ? { defect: item.defect } : {}), basedOn: item.basedOn });
    (files[judge] ??= []).push(rendered);
  };
  for (const judge of JUDGE_NAMES) {
    const items: CalItem[] = [
      ...CALIBRATION_REAL.map((id) => ({ kind: 'booklet', basedOn: id, plain: sourcePlain(id) })),
      ...faithful.map((c) => ({ kind: 'faithful', basedOn: c.modelledOn, plain: c as Plain })),
      ...broken.filter((b) => b.judge === judge && !b.round).map((b) => ({ kind: 'broken', basedOn: b.basedOn, plain: applyBroken(b), defect: b.defect })),
    ];
    for (const item of shuffled(items, judge.length * 31)) add(judge, item, item.kind === 'broken');
  }
  n += RETIRED_REAL_OR_GENERATED_ITEMS;
  // The rewrites were added later: numbered after every other first-round item so that earlier ids stay stable.
  for (const r of rewrites) add('difficulty', { kind: 'rewrite', basedOn: r.modelledOn, plain: r }, false);
  // Each later round's items, numbered after all of those.
  for (const [round, real] of [
    [2, CALIBRATION_REAL_ROUND2],
    [3, CALIBRATION_REAL_ROUND3],
  ] as const) {
    for (const judge of JUDGE_NAMES) {
      for (const id of real[judge] ?? []) add(judge, { kind: 'booklet', basedOn: id, plain: sourcePlain(id) }, false);
      for (const b of broken.filter((x) => x.judge === judge && x.round === round)) add(judge, { kind: 'broken', basedOn: b.basedOn, plain: applyBroken(b), defect: b.defect }, true);
    }
  }
  // Shuffled within each judge's file, so that an item's position gives nothing away.
  const seeds: Record<string, number> = { ambiguity: 7, distractors: 11, realism: 13, difficulty: 59 };
  for (const [judge, items] of Object.entries(files)) write(`./calibration/input/${judge}.json`, shuffled(items, seeds[judge] ?? 1));
  write('./calibration/key.json', key);
  return [
    `calibration: ${key.length} items (${broken.length} broken copies, ${faithful.length} faithful candidates, ${rewrites.length} difficulty rewrites) written to evals/calibration/input/, key in evals/calibration/key.json`,
    `prompt fingerprints: ${JUDGE_NAMES.map((j) => `${j} ${fingerprintText(judgePrompt(j))}`).join(', ')}`,
  ];
}

it('writes the judge inputs', () => {
  for (const id of [...CALIBRATION_REAL, ...Object.values(CALIBRATION_REAL_ROUND2).flat(), ...Object.values(CALIBRATION_REAL_ROUND3).flat()]) expect(sources.has(id), id).toBe(true);
  for (const b of [...broken.map((x) => x.basedOn), ...faithful.map((c) => c.modelledOn), ...rewrites.map((r) => r.modelledOn)]) expect(sources.has(b), b).toBe(true);
  for (const judge of JUDGE_NAMES) expect(judgePrompt(judge).length, judge).toBeGreaterThan(100);
  const ready = new Set((report ?? []).filter((r) => r.ready).map((r) => r.id));
  const lines = [...exportCandidates(candidates.filter((c) => ready.has(c.id))), ...exportCalibration()];
  if (!report) lines.unshift('no evals/report/candidates.json: run npm run eval:candidates first; no candidates exported');
  write('./judge-input/summary.json', lines);
});
