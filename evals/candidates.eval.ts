import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  bankFieldProblems,
  bookletWording,
  contextText,
  fingerprint,
  independentCheckProblems,
  isNotCovered,
  numbersIn,
  optionValue,
  optionValues,
  originalityProblems,
  phrases,
  problemsOf,
  structureProblems,
  unorderedNumericOptionProblems,
  verifyCalculation,
} from '../src/engine/question/authored-verify';
import { drawChart } from '../src/ui/chart/layout';
import { candidateItem, fromQuestion } from './judge-view';
import { admitted, bank, bookletIndex, candidates, checks, judgements, JUDGES, OWNER, scenarioSkills, sourceDistractors, sources } from './lib';
import type { Candidate, Judgement } from './lib';
import { bandRange, BANDS, GRIDLINE_BAND, optionKind, optionsOf, shapeOf, shapeOfQuestion, shapeProblems } from './shape';
import type { Banded, Shape } from './shape';
import { requiredTraps, trapGateProblems } from './traps';
import { genericWords, numberText, overlap, reused, settingWords, telling, THRESHOLDS } from './variety';

/**
 * Evals for candidate questions: authored questions modelled on a booklet
 * question, waiting in `content/candidates/*.json` to be admitted to the bank.
 * A candidate is an authored entry plus `modelledOn`, the booklet question
 * whose structure it follows with a new company, wording and numbers.
 *
 * Per candidate, written to `evals/report/`:
 *   gates     - correct, original and drawable (the authored bank's own checks, plus charts drawn),
 *               and its source's traps declared and landing on wrong options (evals/traps.ts);
 *   fidelity  - it has the shape of the booklet question it is modelled on;
 *   variety   - it is not its source, a sibling or a bank question with names and numbers swapped;
 *   judged    - model judges' verdicts and the owner's, read from `content/candidates/judgements`.
 * For the batch: its measures against the booklets' and per source family (evals/README.md says which block).
 * For the judges: their calibration on booklet questions and broken copies (evals/calibration).
 */

// ---------- Gates ----------

/** A check that throws on malformed input (a missing field) reports the throw instead of stopping the run. */
function safely(check: () => string[]): string[] {
  try {
    return check();
  } catch (error) {
    return [`could not be checked: ${error instanceof Error ? error.message : String(error)}`];
  }
}

/** Every chart drawn at phone width, as the app draws it: marks at real coordinates and no unprintable text. */
function drawingProblems(c: Candidate): string[] {
  const problems: string[] = [];
  c.context.forEach((block, i) => {
    if (block.type !== 'chart') return;
    const what = `${c.id} chart ${i + 1}`;
    const drawing = drawChart(block, 358);
    if (drawing.marks.length === 0) problems.push(`${what}: draws nothing`);
    const numbers = drawing.marks.flatMap((m) => Object.values(m).flatMap((v): unknown[] => (typeof v === 'number' ? [v] : Array.isArray(v) ? v.flat() : [])));
    if (!numbers.every((n) => typeof n === 'number' && Number.isFinite(n))) problems.push(`${what}: drawn at an impossible position`);
    for (const m of drawing.marks) if (m.kind === 'text' && /NaN|undefined|Infinity/.test(m.text)) problems.push(`${what}: prints "${m.text}"`);
  });
  return problems;
}

/** Booklet wording in a trap's slip: the review page shows slips (for moved-claim variants) and would withhold it, so the gate fails it first. */
function slipWordingProblems(c: Candidate): string[] {
  return (c.traps ?? []).flatMap((t) => bookletWording(t.slip, bookletIndex).map((m) => `${c.id} trap slip "${t.slip}" carries booklet wording "${m.text}" (${m.id})`));
}

/** Copied eight-word phrases come in runs (a copied sentence of 20 words is 13 phrases): one line says how many, with the first. */
function summarisePhrases(problems: string[]): string[] {
  const copies = problems.filter((p) => p.includes(' copies "'));
  if (copies.length <= 1) return problems;
  return [...problems.filter((p) => !copies.includes(p)), `${copies[0]} and ${copies.length - 1} more booklet phrases`];
}

// ---------- Fidelity ----------

function fidelityProblems(c: Candidate): string[] {
  const source = sources.get(c.modelledOn);
  if (!source) return [`modelledOn "${c.modelledOn}" is not a booklet question`];
  const problems: string[] = [];
  if (c.skill !== source.skill) problems.push(`skill ${c.skill}, source ${source.skill}`);
  if (c.tier !== source.tier) problems.push(`tier ${c.tier}, source ${source.tier}`);
  // A statement the data does not cover is allowed only as often as the source has one.
  const marked = notCoveredCount(c);
  const allowed = sourceDistractors[source.id]?.notCovered ?? 0;
  if (marked > allowed)
    problems.push(`${marked} options marked notCovered, source has ${allowed} wrong statement${allowed === 1 ? '' : 's'} the data cannot settle`);
  return [...problems, ...shapeProblems(shapeOf(c.context, c.prompt, c.options), shapeOfQuestion(source))];
}

function notCoveredCount(c: Candidate): number {
  return c.check?.kind === 'truth' && Array.isArray(c.check.statements) ? c.check.statements.filter(isNotCovered).length : 0;
}

// ---------- Variety ----------

/** Generic business vocabulary: words in at least five booklet cases or authored questions. */
const generic = (() => {
  const cases = new Map<string, Set<string>>();
  for (const q of sources.values()) {
    const key = `${q.booklet!.booklet}/${q.booklet!.caseTitle}`;
    const words = cases.get(key) ?? new Set<string>();
    for (const w of settingWords(q.context, false)) words.add(w);
    cases.set(key, words);
  }
  // Admitted variants are left out: they would make their own sources' story words look generic.
  const admittedIds = new Set(admitted.map((e) => e.id));
  return genericWords([...cases.values(), ...bank.filter((q) => !admittedIds.has(q.id)).map((q) => settingWords(q.context, false))]);
})();

/** Context wording of the bank, so a candidate cannot repeat a bank question's eight-word phrases. */
const bankPhrases = new Map<string, string>();
for (const q of bank) for (const p of phrases(contextText(q.context))) bankPhrases.set(p, q.id);

/**
 * Context wording only: prompts may share a stem ("Which of the following statements
 * is true?"), as booklet questions do, but a story told twice is the same question.
 */
const candidatePhrases = new Map<string, Set<string>>();
for (const c of candidates) {
  const texts = (() => {
    try {
      return contextText(c.context);
    } catch {
      return [];
    }
  })();
  for (const p of phrases(texts)) {
    const owners = candidatePhrases.get(p) ?? new Set<string>();
    owners.add(c.id);
    candidatePhrases.set(p, owners);
  }
}

function varietyProblems(c: Candidate): string[] {
  const problems: string[] = [];
  // Exhibit labels, chart category labels and round numbers left out: variants of one source share them legitimately.
  const words = settingWords(c.context, false);
  const numbers = telling(numberText(c.context, c.prompt), false);
  const repeats = (other: { context: Candidate['context']; prompt: string }, name: string, bar: number = THRESHOLDS.setting) => {
    const shared = overlap(words, settingWords(other.context, false), generic);
    if (shared > bar) problems.push(`keeps the setting of ${name} (${Math.round(shared * 100)}% of setting words shared, at most ${Math.round(bar * 100)}%)`);
    const again = reused(numbers, telling(numberText(other.context, other.prompt), false));
    if (again.count >= THRESHOLDS.numberCount && again.share > THRESHOLDS.numberShare)
      problems.push(`reuses ${again.count} of its ${numbers.size} numbers from ${name}`);
  };
  const source = sources.get(c.modelledOn);
  if (source) repeats(source, `its source ${source.id}`);
  // A family above the base cap holds each new variant to a stricter setting bar against its siblings
  // (evals/README.md, "Changes to the criteria").
  const siblingBar = familySize(c.modelledOn) > MAX_VARIANTS_PER_SOURCE ? THRESHOLDS.settingLargeFamily : THRESHOLDS.setting;
  for (const sibling of candidates) if (sibling.id !== c.id && sibling.modelledOn === c.modelledOn) repeats(sibling, sibling.id, siblingBar);
  // Variants of the same source already in the authored bank count as siblings too.
  for (const done of admitted) if (done.id !== c.id && done.modelledOn === c.modelledOn) repeats(done, `admitted ${done.id}`, siblingBar);
  const clashes = new Set<string>();
  for (const p of phrases(contextText(c.context))) {
    const owner = bankPhrases.get(p);
    if (owner) clashes.add(owner);
    for (const other of candidatePhrases.get(p) ?? []) if (other !== c.id) clashes.add(other);
  }
  for (const id of clashes) problems.push(`shares context wording with ${id}`);
  return problems;
}

// ---------- The batch as a whole, against the booklets ----------

const share = <T>(items: T[], test: (item: T) => boolean) => (items.length === 0 ? 0 : items.filter(test).length / items.length);
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
const percent = (value: number) => `${Math.round(value * 100)}%`;

/** For numeric options: how far the nearest wrong option sits from the right one, as a fraction of it. An escape option ("None of the above") is skipped. */
function nearestDistractorGap(shape: Shape, options: string[], correctIndex: number): number | undefined {
  if (shape.optionKind !== 'numeric') return undefined;
  const readable = options.map((o) => problemsOf(() => optionValue(o)).length === 0);
  const amounts = problemsOf(() => optionValues(options.filter((_, i) => readable[i]))).length === 0 ? optionValues(options.filter((_, i) => readable[i])) : [];
  let next = 0;
  const values = options.map((_, i) => (readable[i] && amounts.length > 0 ? amounts[next++]! : NaN));
  const correct = values[correctIndex];
  if (correct === undefined || Number.isNaN(correct)) return undefined;
  const gaps = values.filter((v, i) => i !== correctIndex && !Number.isNaN(v)).map((v) => Math.abs(v - correct) / Math.abs(correct || 1));
  return gaps.length > 0 ? Math.min(...gaps) : undefined;
}

interface Profiled {
  skill: string;
  tier: number;
  shape: Shape;
  options: string[];
  correctIndex: number;
  /** Share of the numbers given that the worked solution never uses: the surplus data carried. */
  surplus: number;
  /** Context, prompt and options as text, for the register measures (currency, years). */
  text: string;
  /** Candidates only: whether the source's numeric options ascend. */
  sourceAscending?: boolean | undefined;
}

/** The currencies a question uses: $ (also USD, US$), € (EUR) and £ (GBP). */
function currencies(text: string): string[] {
  return [
    ...(/\$|\bUSD\b|\bdollars?\b/.test(text) ? ['$'] : []),
    ...(/€|\bEUR\b|\beuros?\b/i.test(text) ? ['€'] : []),
    ...(/£|\bGBP\b|\bpounds? sterling\b/.test(text) ? ['£'] : []),
  ];
}

/** The years a question names (1990 to 2039). */
const yearsIn = (text: string) => [...text.matchAll(/\b(199\d|20[0-3]\d)\b/g)].map((m) => Number(m[1]));

/** The booklets' data is dated 2004 to 2014 (2016 and 2023 appear only as projection horizons); a question naming a year after this reads as recent. */
const LATEST_BOOKLET_YEAR = 2016;

const profiledText = (context: Candidate['context'], prompt: string, options: string[]) => [...contextText(context), prompt, ...options].join('\n');

/**
 * The surplus data a question carries: the share of numbers in its context and prompt that its worked
 * solution never mentions. A rough measure (a solution may skip a number it uses through a total), but the
 * same for both sides: the booklets carry unused rows, columns and exhibits, and writers tend to give
 * exactly what the question needs.
 */
function surplusShare(context: Candidate['context'], prompt: string, solution: string[]): number {
  const given = [...contextText(context), prompt].flatMap(numbersIn);
  const used = new Set(solution.flatMap(numbersIn));
  return given.length === 0 ? 0 : given.filter((n) => !used.has(n)).length / given.length;
}

interface Profile {
  count: number;
  skills: Record<string, number>;
  tiers: Record<string, number>;
  optionKinds: Record<string, number>;
  positions: number[];
  withTable: number;
  withChart: number;
  chartsRead: number;
  approximate: number;
  medianProseWords: number;
  medianPromptWords: number;
  medianNumbersGiven: number;
  medianDistractorGap: number;
  medianSurplus: number;
  /** Of the questions with numeric options, the share listed in ascending order. */
  ascending: number;
  numericCount: number;
  /** Candidates: of those with numeric options, the share whose source lists its options in ascending order. */
  sourcesAscending: number;
  /** Of the questions naming a currency, the share naming each of $, € and £. */
  currencies: Record<string, number>;
  withCurrency: number;
  /** The share of questions naming a year, and of those, the share naming one after the booklets' range. */
  withYear: number;
  recentYear: number;
  /** Of all values read off gridlines, the share lying exactly on a gridline. */
  onGridline: number;
  gridReadings: number;
}

function profile(items: Profiled[]): Profile {
  const shares = (key: (item: Profiled) => string) => {
    const result: Record<string, number> = {};
    for (const item of items) result[key(item)] = (result[key(item)] ?? 0) + 1 / items.length;
    return result;
  };
  return {
    count: items.length,
    skills: shares((i) => i.skill),
    tiers: shares((i) => String(i.tier)),
    optionKinds: shares((i) => i.shape.optionKind),
    positions: [0, 1, 2, 3].map((p) => share(items, (i) => i.correctIndex === p)),
    withTable: share(items, (i) => i.shape.tables > 0),
    withChart: share(items, (i) => i.shape.charts.length > 0),
    chartsRead: share(items, (i) => i.shape.chartsLabelled.includes(false)),
    approximate: share(items, (i) => i.shape.approximate),
    medianProseWords: median(items.map((i) => i.shape.proseWords)),
    medianPromptWords: median(items.map((i) => i.shape.promptWords)),
    medianNumbersGiven: median(items.map((i) => i.shape.numbersGiven)),
    medianDistractorGap: median(items.flatMap((i) => nearestDistractorGap(i.shape, i.options, i.correctIndex) ?? [])),
    medianSurplus: median(items.map((i) => i.surplus)),
    ascending: share(
      items.filter((i) => i.shape.ascending !== undefined),
      (i) => i.shape.ascending === true,
    ),
    numericCount: items.filter((i) => i.shape.ascending !== undefined).length,
    sourcesAscending: share(
      items.filter((i) => i.shape.ascending !== undefined),
      (i) => i.sourceAscending === true,
    ),
    currencies: Object.fromEntries(
      ['$', '€', '£'].map((cur) => [cur, share(items.filter((i) => currencies(i.text).length > 0), (i) => currencies(i.text).includes(cur))]),
    ),
    withCurrency: items.filter((i) => currencies(i.text).length > 0).length,
    withYear: share(items, (i) => yearsIn(i.text).length > 0),
    recentYear: share(
      items.filter((i) => yearsIn(i.text).length > 0),
      (i) => Math.max(...yearsIn(i.text)) > LATEST_BOOKLET_YEAR,
    ),
    onGridline: items.reduce((n, i) => n + i.shape.onGridline, 0) / (items.reduce((n, i) => n + i.shape.gridReadings, 0) || 1),
    gridReadings: items.reduce((n, i) => n + i.shape.gridReadings, 0),
  };
}

/** Half the summed difference between two mixes: 0 when identical, 1 when disjoint. */
function mixDistance(a: Record<string, number>, b: Record<string, number>): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].reduce((sum, k) => sum + Math.abs((a[k] ?? 0) - (b[k] ?? 0)), 0) / 2;
}

/** A batch measure: what it compares, its rule and whether a miss blocks admission or only warns. */
interface Measure {
  measure: string;
  booklets: string;
  candidates: string;
  target: string;
  ok: boolean;
  /** A miss blocks: no candidate is admitted until it is fixed. Otherwise the line warns. */
  blocks: boolean;
}

const verdictOf = (m: Measure) => (m.ok ? 'ok' : m.blocks ? 'BLOCK' : 'warn');

/**
 * The batch against the booklets. Every line warns rather than blocks: each compares a mix that a batch of
 * 100 to 300 questions only approximates, and the per-candidate checks hold each question to its own source.
 * The answer-position line is enforced where it matters, on the whole bank, by the bank's content test and by
 * the admission script (scripts/authored/admit.mjs refuses an admission that would take any letter outside 18% to 32%).
 */
function batchRows(booklets: Profile, made: Profile, weight: { heavier: number; longer: number; count: number }): Measure[] {
  const within = (value: number, target: number, tolerance: number) => Math.abs(value - target) <= tolerance;
  const warn = (measure: string, b: string, c: string, target: string, ok: boolean): Measure => ({ measure, booklets: b, candidates: c, target, ok, blocks: false });
  const skillGap = mixDistance(booklets.skills, made.skills);
  const kindGap = mixDistance(booklets.optionKinds, made.optionKinds);
  const tierGap = mixDistance(booklets.tiers, made.tiers);
  const currencyGap = mixDistance(booklets.currencies, made.currencies);
  // The booklets' own answers sit unevenly (B 33%, D 17%); candidates are held to an even spread instead, as the bank is.
  const positionsOk = made.positions.every((p) => p >= 0.18 && p <= 0.32);
  const cur = (p: Profile) => `${['$', '€', '£'].map((c) => percent(p.currencies[c] ?? 0)).join(' / ')} of ${p.withCurrency}`;
  return [
    warn('Skill mix, distance from the booklets', '0%', percent(skillGap), 'at most 15%', skillGap <= 0.15),
    warn('Option kind mix, distance', '0%', percent(kindGap), 'at most 15%', kindGap <= 0.15),
    warn('Tier mix, distance', '0%', percent(tierGap), 'at most 15%', tierGap <= 0.15),
    warn('Correct answer at A / B / C / D', booklets.positions.map(percent).join(' / '), made.positions.map(percent).join(' / '), 'each 18% to 32%', positionsOk),
    warn('Questions with a table', percent(booklets.withTable), percent(made.withTable), 'within 15 points', within(made.withTable, booklets.withTable, 0.15)),
    warn('Questions with a chart', percent(booklets.withChart), percent(made.withChart), 'within 15 points', within(made.withChart, booklets.withChart, 0.15)),
    warn('Charts read from gridlines', percent(booklets.chartsRead), percent(made.chartsRead), 'within 15 points', within(made.chartsRead, booklets.chartsRead, 0.15)),
    warn('Prompts asking for the closest value', percent(booklets.approximate), percent(made.approximate), 'within 10 points', within(made.approximate, booklets.approximate, 0.1)),
    warn('Median words of context', String(booklets.medianProseWords), String(made.medianProseWords), 'within 30%', within(made.medianProseWords, booklets.medianProseWords, booklets.medianProseWords * 0.3)),
    warn('Median words of prompt', String(booklets.medianPromptWords), String(made.medianPromptWords), 'within 30%', within(made.medianPromptWords, booklets.medianPromptWords, booklets.medianPromptWords * 0.3)),
    warn('Median numbers given', String(booklets.medianNumbersGiven), String(made.medianNumbersGiven), 'within 30%', within(made.medianNumbersGiven, booklets.medianNumbersGiven, booklets.medianNumbersGiven * 0.3)),
    warn('Median gap to the nearest wrong number', percent(booklets.medianDistractorGap), percent(made.medianDistractorGap), 'within 8 points', within(made.medianDistractorGap, booklets.medianDistractorGap, 0.08)),
    warn('Median share of given numbers the solution never uses', percent(booklets.medianSurplus), percent(made.medianSurplus), 'within 10 points', within(made.medianSurplus, booklets.medianSurplus, 0.1)),
    // Held to the candidates' own sources (parity): a batch whose numeric sources all ascend may ascend throughout.
    warn(
      'Numeric options listed in ascending order',
      `${percent(booklets.ascending)} of ${booklets.numericCount} (their sources: ${percent(made.sourcesAscending)})`,
      `${percent(made.ascending)} of ${made.numericCount}`,
      'within 15 points of their sources',
      within(made.ascending, made.sourcesAscending, 0.15),
    ),
    warn('Of questions naming a currency, $ / € / £: distance', cur(booklets), `${cur(made)}: ${percent(currencyGap)}`, 'at most 15%', currencyGap <= 0.15),
    warn('Of questions naming a currency, £', percent(booklets.currencies['£'] ?? 0), percent(made.currencies['£'] ?? 0), 'within 10 points', within(made.currencies['£'] ?? 0, booklets.currencies['£'] ?? 0, 0.1)),
    warn('Questions naming a year', percent(booklets.withYear), percent(made.withYear), 'within 10 points', within(made.withYear, booklets.withYear, 0.1)),
    warn(`Of those, naming a year after ${LATEST_BOOKLET_YEAR}`, percent(booklets.recentYear), percent(made.recentYear), 'within 10 points', within(made.recentYear, booklets.recentYear, 0.1)),
    warn('Chart values to read that sit on a gridline', `${percent(booklets.onGridline)} of ${booklets.gridReadings}`, `${percent(made.onGridline)} of ${made.gridReadings}`, 'within 10 points', within(made.onGridline, booklets.onGridline, 0.1)),
    // Arithmetic no heavier than the source's, measured cheaply on the worked solutions; the difficulty judge decides per candidate.
    warn(
      "Worked numbers heavier than the source's (on average more than one significant digit more)",
      '-',
      `${percent(weight.count ? weight.heavier / weight.count : 0)} (${weight.heavier} of ${weight.count})`,
      'at most 10%',
      weight.heavier <= weight.count * 0.1,
    ),
    warn(
      "Worked solutions two or more steps longer than the source's",
      '-',
      `${percent(weight.count ? weight.longer / weight.count : 0)} (${weight.longer} of ${weight.count})`,
      'at most 10%',
      weight.longer <= weight.count * 0.1,
    ),
  ];
}

/** Significant digits of a number as written: "6,983" 4, "0.25" 2, "1,500" 2, "12%" 2. */
function significantDigits(written: string): number {
  const plain = written.replaceAll(',', '');
  const digits = plain.includes('.') ? plain.replace('.', '').replace(/^0+/, '') : plain.replace(/^0+/, '').replace(/0+$/, '');
  return Math.max(1, digits.length);
}

/** How heavy a worked solution is: its steps, and the mean significant digits of the numbers it works with. */
function solutionWeight(solution: string[]): { steps: number; digits: number } {
  const written = solution.flatMap((line) => [...line.matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g)].map((m) => m[0]));
  return { steps: solution.length, digits: written.length === 0 ? 0 : written.reduce((n, w) => n + significantDigits(w), 0) / written.length };
}

// ---------- Source families: a source's variants, waiting and admitted ----------

/**
 * At most this many variants of one booklet question, waiting and admitted together, where the correct option is the
 * same claim or formula in every variant (the pilot's decision: 3 to 4 per source).
 */
export const MAX_VARIANTS_PER_SOURCE = 4;
/**
 * At most this many where every variant's answer has to be worked out afresh from its own numbers (`answerIsComputed`).
 * With at most 2 per letter, 8 needs all four letters twice; a source that can hold its answer at 3 letters stops at 6,
 * at 2 letters at 4 (evals/README.md, "Changes to the criteria", 26 November 2026).
 */
export const MAX_VARIANTS_COMPUTED = 8;
/** At most this many variants of one booklet question with the correct answer at the same letter: more is learnable. */
export const MAX_SAME_LETTER_PER_SOURCE = 2;

/** An option with its numbers taken out: what a reader who skips the arithmetic still sees ("about #% fewer items per day"). */
const withoutNumbers = (option: string) =>
  option
    .toLowerCase()
    .replace(/[$€£]?\d[\d,.]*\s*(%|m|bn|k)?/g, '#')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Whether a booklet question's correct option has to be worked out afresh in every variant modelled on it. Numbers,
 * rankings and labels (a country, a year, "twice as much") change with the data. A statement does only when the keyed
 * one, its numbers taken out, reads the same as a wrong one, so that only the numbers decide (pracB-q09, whose
 * statements differ only in a percentage). A statement that makes a different claim from the others keeps that claim in
 * every variant (pracA-q24, whose keyed statement is the only one about which group gets least attention), so a reader
 * who knows the family can pick it without the data; a formula has the same shape every time and no arithmetic. Those stay at the base cap.
 */
export function answerIsComputed(options: string[], correctIndex: number): boolean {
  const kind = optionKind(options);
  if (kind === 'numeric' || kind === 'ranking' || kind === 'label') return true;
  if (kind !== 'statement' || options[correctIndex] === undefined) return false;
  const keyed = withoutNumbers(options[correctIndex]);
  return options.some((o, i) => i !== correctIndex && withoutNumbers(o) === keyed);
}

/** The family cap for one booklet question: 8 where its answer is worked out afresh in every variant, else 4. */
export function variantCap(sourceId: string): number {
  const q = sources.get(sourceId);
  if (!q || q.answer.kind !== 'choice') return MAX_VARIANTS_PER_SOURCE;
  return answerIsComputed(optionsOf(q), q.answer.correctIndex) ? MAX_VARIANTS_COMPUTED : MAX_VARIANTS_PER_SOURCE;
}

/**
 * At most this many variants of a statement source whose keyed claim moves: past the base cap of 4, every variant,
 * admitted and waiting, declares which of the source's claims it keys, and no claim is keyed by more than half of 8
 * (evals/README.md, "Changes to the criteria", 26 November 2026, "The keyed claim").
 */
export const MAX_VARIANTS_KEYED = 8;

/**
 * A round's declaration for one statement source (evals/round-N-sources.json): the kind of claim each option of the
 * source makes (`claims`, letter to claim; options making the same kind of claim share one), the options that can never
 * be the answer (`neverKeyed`: not covered by the data, or dominated), and the claim each variant keys (`keys`, variant id
 * to claim). Which claim a variant keys is a matter of meaning: a best joint match of each admitted variant's options to its
 * source's, by shared words, agreed with a reading by hand on 52 of 64, the misses on margins under 0.01. So it is declared
 * in the round's list, checked here for its arithmetic, and read by a person against the report's side-by-side.
 */
export interface ClaimPlan {
  claims: Record<string, string>;
  neverKeyed: string[];
  keys: Map<string, string>;
}

interface RoundSource {
  id: string;
  keyedClaim?: { claims: Record<string, string>; neverKeyed: string[] };
  admitted?: Array<{ id: string; keys?: string }>;
  /** Variants written in an earlier group of the round, still in content/candidates, when a later group opens the family. */
  waiting?: Array<{ id: string; keys?: string }>;
  new?: Array<{ id: string; keys?: string }>;
}
const roundFiles = import.meta.glob<{ groups?: Array<{ sources?: RoundSource[] }> }>('./round-*-sources.json', { eager: true, import: 'default' });

/** Every statement source a round's list declares keyed claims for, by source id. */
export const claimPlans: Map<string, ClaimPlan> = (() => {
  const plans = new Map<string, ClaimPlan>();
  for (const round of Object.values(roundFiles)) {
    for (const s of (round.groups ?? []).flatMap((g) => g.sources ?? [])) {
      if (!s.keyedClaim) continue;
      const plan = plans.get(s.id) ?? { claims: s.keyedClaim.claims, neverKeyed: s.keyedClaim.neverKeyed, keys: new Map<string, string>() };
      for (const v of [...(s.admitted ?? []), ...(s.waiting ?? []), ...(s.new ?? [])]) if (v.keys !== undefined) plan.keys.set(v.id, v.keys);
      plans.set(s.id, plan);
    }
  }
  return plans;
})();

/**
 * The keyed-claim rule for one statement family past 4: the source's own answer can be keyed; the options marked never
 * keyed are at least as many as the source's analysis records not covered or dominated (so a claim the data cannot
 * settle is not offered as one to key); every variant declares a claim the source makes on an option that can be true;
 * no claim is keyed by more than 4 variants, half of 8. The limit is a count, not a share of the family as it stands:
 * a share would block a family's first new variant (4 admitted on one claim and 1 new is 4 of 5) and would block the
 * survivors whenever some of its new variants are dropped. A count still stops any new variant joining a claim that
 * 4 admitted variants already key, which is the case the rule exists for.
 */
export function keyedClaimProblems(f: {
  sourceLetter: string;
  claims: Record<string, string>;
  neverKeyed: string[];
  recordedNever: number;
  variants: Array<{ id: string; keys: string | undefined }>;
}): string[] {
  const problems: string[] = [];
  if (f.neverKeyed.includes(f.sourceLetter)) problems.push(`the source's own answer (${f.sourceLetter}) is marked never keyed`);
  if (f.neverKeyed.length < f.recordedNever) problems.push(`${f.neverKeyed.length} option${f.neverKeyed.length === 1 ? '' : 's'} marked never keyed; the source's analysis records ${f.recordedNever} not covered or dominated`);
  const keyable = new Set(Object.entries(f.claims).filter(([letter]) => !f.neverKeyed.includes(letter)).map(([, claim]) => claim));
  const counts = new Map<string, number>();
  for (const v of f.variants) {
    if (v.keys === undefined) {
      problems.push(`${v.id} declares no keyed claim`);
      continue;
    }
    if (!keyable.has(v.keys)) problems.push(`${v.id} keys "${v.keys}", not a claim of the source that can be true`);
    counts.set(v.keys, (counts.get(v.keys) ?? 0) + 1);
  }
  const most = MAX_VARIANTS_KEYED / 2;
  for (const [claim, n] of counts) if (n > most) problems.push(`"${claim}" keyed by ${n} of ${f.variants.length} variants, at most ${most} (half of ${MAX_VARIANTS_KEYED})`);
  return problems;
}

/** The cap that applies to one family: `variantCap`, or 8 for a statement source whose keyed claims are declared. */
export function familyCap(sourceId: string): { cap: number; plan: ClaimPlan | undefined } {
  const cap = variantCap(sourceId);
  const q = sources.get(sourceId);
  const plan = claimPlans.get(sourceId);
  if (cap !== MAX_VARIANTS_PER_SOURCE || !plan || !q || q.answer.kind !== 'choice' || optionKind(optionsOf(q)) !== 'statement') return { cap, plan: undefined };
  return { cap: MAX_VARIANTS_KEYED, plan };
}

/** Variants of one booklet question, waiting and admitted together. */
function familySize(sourceId: string): number {
  return candidates.filter((c) => c.modelledOn === sourceId).length + admitted.filter((e) => e.modelledOn === sourceId).length;
}

/**
 * The family rules for one source, from its counts alone: the cap and at most 2 answers at one letter block. A family
 * with no waiting variant reviewed by the owner (the check for what no code measures: a repeated industry, a family that
 * reads alike) only warns, past the base cap of 4 as below it (evals/README.md, "Changes to the criteria", 26 November
 * 2026: the owner sample warns past 4). An owner verdict of off or reject still blocks its candidate (`ownerBlocks`).
 */
export function familyFindings(f: { cap: number; admitted: number; waiting: number; letters: string; reviewed: number }): { blocks: string[]; warns: string[] } {
  const total = f.admitted + f.waiting;
  const counts = new Map<string, number>();
  for (const l of f.letters) counts.set(l, (counts.get(l) ?? 0) + 1);
  const most = Math.max(0, ...counts.values());
  const blocks: string[] = [];
  const warns: string[] = [];
  if (total > f.cap) blocks.push(`${total} variants (${f.admitted} admitted, ${f.waiting} waiting), at most ${f.cap}`);
  if (most > MAX_SAME_LETTER_PER_SOURCE) blocks.push(`answers at ${f.letters}: ${most} at one letter, at most ${MAX_SAME_LETTER_PER_SOURCE}`);
  else if (most > 1) warns.push(`answers at ${f.letters}: target a different letter for each variant`);
  // A warning, not a block, at any family size: an absent owner verdict never holds a candidate back (evals/README.md,
  // "Owner review"). Past 4 this blocked until 26 November 2026; the owner made it a warning ("Changes to the criteria").
  if (f.waiting > 0 && f.reviewed === 0) {
    if (total > MAX_VARIANTS_PER_SOURCE) warns.push(`${total} variants, more than ${MAX_VARIANTS_PER_SOURCE}: the owner has reviewed none of its waiting variants`);
    else warns.push('the owner has reviewed none of its waiting variants');
  }
  return { blocks, warns };
}

interface Family {
  source: string;
  /** Its cap: 8 where the answer is worked out afresh in every variant or the keyed claim moves, else 4 (`familyCap`). */
  cap: number;
  /** Past 4 in a keyed-claim family: per waiting variant, its declared claim beside the source's option making it and its own answer, for a person to read. */
  keyedClaims: string[];
  waiting: string[];
  admitted: string[];
  letters: string;
  ownerReviewed: string[];
  /** Findings that block admission of the family's waiting candidates. */
  blocks: string[];
  /** Findings that only warn. */
  warns: string[];
}

/**
 * Per booklet question, its variants waiting in content/candidates and those already admitted: how many, where
 * their answers sit, and whether the owner has reviewed one of the waiting ones. A family finding that blocks holds
 * back every waiting candidate of that source; it does not touch other families.
 */
function families(ownerReviewed: Set<string>): Family[] {
  const ids = [...new Set(candidates.map((c) => c.modelledOn))].sort();
  return ids.map((source) => {
    const waiting = candidates.filter((c) => c.modelledOn === source);
    const done = admitted.filter((e) => e.modelledOn === source);
    const all = [...done, ...waiting];
    const letters = all.map((e) => 'ABCDE'[e.correctIndex] ?? '?').join('');
    const reviewed = waiting.filter((c) => ownerReviewed.has(c.id)).map((c) => c.id);
    const { cap, plan } = familyCap(source);
    const { blocks, warns } = familyFindings({ cap, admitted: done.length, waiting: waiting.length, letters, reviewed: reviewed.length });
    const keyedClaims: string[] = [];
    const q = sources.get(source);
    if (plan && q && q.answer.kind === 'choice' && all.length > MAX_VARIANTS_PER_SOURCE) {
      const sourceLetter = 'ABCDE'[q.answer.correctIndex] ?? '?';
      const recorded = sourceDistractors[source];
      blocks.push(
        ...keyedClaimProblems({
          sourceLetter,
          claims: plan.claims,
          neverKeyed: plan.neverKeyed,
          recordedNever: (recorded?.notCovered ?? 0) + (recorded?.dominated ?? 0),
          variants: all.map((e) => ({ id: e.id, keys: plan.keys.get(e.id) })),
        }),
      );
      const options = optionsOf(q);
      for (const c of waiting) {
        const claim = plan.keys.get(c.id);
        const letter = Object.entries(plan.claims).find(([, k]) => k === claim)?.[0];
        const sourceOption = letter ? options['ABCDE'.indexOf(letter)] : undefined;
        keyedClaims.push(`${c.id} keys "${claim ?? '?'}" (source ${letter ?? '?'}: "${sourceOption ?? '?'}"); its answer: "${c.options[c.correctIndex] ?? '?'}"`);
      }
    }
    return { source, cap, keyedClaims, waiting: waiting.map((c) => c.id), admitted: done.map((e) => e.id), letters, ownerReviewed: reviewed, blocks, warns };
  });
}

// ---------- Judge calibration ----------

/**
 * One calibration item's expected verdict: booklet questions, faithful candidates and (for the
 * difficulty judge) rewrites of booklet questions should pass; broken copies should fail.
 */
interface KeyItem {
  id: string;
  judge: string;
  kind: 'booklet' | 'faithful' | 'rewrite' | 'broken';
  expectFail: boolean;
  defect?: string;
  basedOn: string;
}

const keyFiles = import.meta.glob<KeyItem[]>('./calibration/key.json', { eager: true, import: 'default' });
const calibrationFiles = import.meta.glob<Judgement[]>('./calibration/judgements/*.json', { eager: true, import: 'default' });

/** The calibration bar: a judge is trusted when it passes at least 90% of what should pass and fails at least 80% of what should fail. */
export const CALIBRATION_BAR = { pass: 0.9, fail: 0.8 } as const;

function calibration(): { lines: string[]; trusted: Record<string, boolean> } {
  const key = Object.values(keyFiles).flat();
  const verdicts = Object.values(calibrationFiles).flat();
  const trusted: Record<string, boolean> = {};
  const rows: string[] = [];
  const misses: string[] = [];
  for (const judge of JUDGES) {
    const items = key.filter((k) => k.judge === judge);
    const scored = items.flatMap((k) => {
      const v = verdicts.find((x) => x.judge === judge && x.id === k.id);
      return v ? [{ k, v }] : [];
    });
    trusted[judge] = false;
    if (scored.length === 0) {
      rows.push(`| ${judge} | - | - | ${items.length} | NOT CALIBRATED |`);
      continue;
    }
    for (const { k, v } of scored)
      if (v.fail !== k.expectFail)
        misses.push(`- ${judge}, ${k.id} (${k.kind}${k.defect ? `: ${k.defect}` : ''}, from ${k.basedOn}): judged ${v.fail ? 'fail' : 'pass'}. ${v.why ?? ''}`);
    const good = scored.filter(({ k }) => !k.expectFail);
    const bad = scored.filter(({ k }) => k.expectFail);
    const goodOk = good.filter(({ v }) => !v.fail).length;
    const badOk = bad.filter(({ v }) => v.fail).length;
    const unjudged = items.length - scored.length;
    trusted[judge] = unjudged === 0 && goodOk >= good.length * CALIBRATION_BAR.pass && badOk >= bad.length * CALIBRATION_BAR.fail;
    rows.push(`| ${judge} | ${goodOk}/${good.length} | ${badOk}/${bad.length} | ${unjudged} | ${trusted[judge] ? 'trusted' : 'NOT TRUSTED'} |`);
  }
  const keyIds = new Set(key.map((k) => k.id));
  const staleCalibration = verdicts.filter((v) => !keyIds.has(v.id)).length;
  return {
    trusted,
    lines: [
      '## Judge calibration',
      '',
      'A judge is trusted when every calibration item has a verdict, it passes at least 90% of the booklet questions, faithful candidates and (difficulty) rewrites, and fails at least 80% of the broken copies. Recalibrate after any change to a judge prompt or the judge model.',
      '',
      ...(staleCalibration > 0
        ? [
            `${staleCalibration} calibration verdicts match no current item (each id carries a fingerprint of the judge's prompt and the item): delete them from evals/calibration/judgements/ and run that judge's calibration again.`,
            '',
          ]
        : []),
      '| Judge | Should pass, passed | Should fail, failed | Not judged | |',
      '|---|---|---|---|---|',
      ...rows,
      '',
      ...(misses.length > 0 ? ['Disagreements with the key:', '', ...misses, ''] : []),
    ],
  };
}

// ---------- The scorecard ----------

const GATES = ['structure', 'calculation', 'traps', 'chart drawn', 'originality', 'blind solve'] as const;
type Gate = (typeof GATES)[number];

interface Row {
  id: string;
  modelledOn: string;
  gates: Record<Gate, string[]>;
  fidelity: string[];
  variety: string[];
  judged: Record<string, { fail: boolean; why?: string; mark?: string }>;
  /** Everything a writer can check alone passes: every gate but the blind solve, fidelity and variety. */
  ready: boolean;
  /** Admissible on its own: ready, blind-solved, passed by all four judges, and not failed or rejected by the owner. */
  admissibleAlone: boolean;
  /** Source-family findings that hold it back (too many variants, too many answers at one letter). */
  blockedBy: string[];
  /** Admitted by `npm run admit:candidates`: admissible on its own and not held back by its family. */
  admit: boolean;
}

/** An owner verdict blocks admission when it fails the question or rejects it; an absent verdict does not. */
export const ownerBlocks = (v: { fail: boolean; mark?: string } | undefined): boolean => v !== undefined && (v.fail || v.mark === 'reject');

/** The per-candidate rule: ready, blind-solved, all four judges passed (each verdict on the current text and prompt), owner not against. */
export function admissibleAlone(ready: boolean, blindSolved: boolean, judged: Row['judged']): boolean {
  return ready && blindSolved && JUDGES.every((j) => judged[j] !== undefined && !judged[j].fail) && !ownerBlocks(judged[OWNER]);
}

/** A candidate's gates. The structure gate holds the bank's id and field rule too, so that what passes here passes the bank's tests. */
function gatesOf(c: Candidate, admittedIds: Set<string>): Record<Gate, string[]> {
  return {
    structure: safely(() => [
      ...structureProblems(c, scenarioSkills),
      ...unorderedNumericOptionProblems(c),
      ...bankFieldProblems(c, ['traps']),
      ...(admittedIds.has(c.id) ? [`${c.id}: the authored bank already has this id; give the next unused letter`] : []),
    ]),
    calculation: safely(() => problemsOf(() => verifyCalculation(c))),
    traps: safely(() => trapGateProblems(c, sourceDistractors[c.modelledOn])),
    'chart drawn': safely(() => drawingProblems(c)),
    originality: safely(() => summarisePhrases([...originalityProblems(c, bookletIndex), ...slipWordingProblems(c)])),
    'blind solve': safely(() => independentCheckProblems(c, checks)),
  };
}

function scoreCandidate(c: Candidate, admittedIds: Set<string>): Omit<Row, 'blockedBy' | 'admit'> {
  const gates = gatesOf(c, admittedIds);
  const judged: Row['judged'] = {};
  for (const judge of JUDGES) {
    const id = expectedJudgeId(c, judge);
    const j = id ? judgements.find((x) => x.judge === judge && x.id === id) : undefined;
    if (j) judged[judge] = { fail: j.fail, ...(j.why ? { why: j.why } : {}) };
  }
  const print = safely(() => [fingerprint(c)])[0];
  const owner = judgements.find((x) => x.judge === OWNER && x.id === c.id && (!x.fingerprint || x.fingerprint === print));
  if (owner) judged[OWNER] = { fail: owner.fail, ...(owner.why ? { why: owner.why } : {}), ...(owner.mark ? { mark: owner.mark } : {}) };
  const fidelity = safely(() => fidelityProblems(c));
  const variety = safely(() => varietyProblems(c));
  const ready = GATES.every((g) => g === 'blind solve' || gates[g].length === 0) && fidelity.length === 0 && variety.length === 0;
  return { id: c.id, modelledOn: c.modelledOn, gates, fidelity, variety, judged, ready, admissibleAlone: admissibleAlone(ready, gates['blind solve'].length === 0, judged) };
}

/**
 * The id a judge's verdict on this question must carry: the fingerprint of the judge's prompt and of
 * exactly what the judge was shown (evals/judge-view.ts). A verdict on an earlier version of the
 * question, or under an earlier prompt, carries another id and is not counted.
 */
function expectedJudgeId(c: Candidate | (typeof admitted)[number], judge: string): string | undefined {
  try {
    return candidateItem(judge, c, fromQuestion(sources.get(c.modelledOn)!)).id;
  } catch {
    return undefined;
  }
}

/**
 * Model-judge verdicts that match no current item: the question or the prompt changed since. Verdicts on variants
 * already admitted (content/authored, with `modelledOn`) count as current: they are history, not work to redo.
 */
function staleVerdicts(): Record<string, number> {
  const current = new Set([...candidates, ...admitted].flatMap((c) => JUDGES.flatMap((j) => expectedJudgeId(c, j) ?? [])));
  const stale: Record<string, number> = {};
  for (const j of judgements) if ((JUDGES as readonly string[]).includes(j.judge) && !current.has(j.id)) stale[j.judge] = (stale[j.judge] ?? 0) + 1;
  return stale;
}

function safelyNumber(f: () => number): number {
  try {
    return f();
  } catch {
    return 0;
  }
}

function shapeOrNothing(c: Candidate): Shape[] {
  try {
    return [shapeOf(c.context, c.prompt, c.options)];
  } catch {
    return [];
  }
}

function score(): { rows: Row[]; summary: string; batch: object } {
  const admittedIds = new Set(bank.map((q) => q.id));
  const alone = candidates.map((c) => scoreCandidate(c, admittedIds));
  const ownerReviewed = new Set(alone.filter((r) => r.judged[OWNER]).map((r) => r.id));
  const family = families(ownerReviewed);
  const familyOf = new Map(family.map((f) => [f.source, f]));
  const rows: Row[] = alone.map((r) => {
    const blockedBy = familyOf.get(r.modelledOn)?.blocks ?? [];
    return { ...r, blockedBy, admit: r.admissibleAlone && blockedBy.length === 0 };
  });
  const booklets = profile(
    [...sources.values()].map((q) => ({
      skill: q.skill,
      tier: q.tier,
      shape: shapeOfQuestion(q),
      options: optionsOf(q),
      correctIndex: q.answer.kind === 'choice' ? q.answer.correctIndex : 0,
      surplus: surplusShare(q.context, q.prompt, q.solution),
      text: profiledText(q.context, q.prompt, optionsOf(q)),
    })),
  );
  const made = profile(
    candidates.flatMap((c) =>
      shapeOrNothing(c).map((shape) => ({
        skill: c.skill,
        tier: c.tier,
        shape,
        options: c.options,
        correctIndex: c.correctIndex,
        surplus: safelyNumber(() => surplusShare(c.context, c.prompt, c.solution)),
        text: profiledText(c.context, c.prompt, c.options),
        sourceAscending: sources.has(c.modelledOn) ? shapeOfQuestion(sources.get(c.modelledOn)!).ascending : undefined,
      })),
    ),
  );
  const weighed = candidates.flatMap((c) => {
    const source = sources.get(c.modelledOn);
    if (!source || !Array.isArray(c.solution)) return [];
    const mine = solutionWeight(c.solution);
    const theirs = solutionWeight(source.solution);
    return [{ heavier: mine.digits > theirs.digits + 1, longer: mine.steps >= theirs.steps + 2 }];
  });
  const weight = { heavier: weighed.filter((w) => w.heavier).length, longer: weighed.filter((w) => w.longer).length, count: weighed.length };
  const measures = made.count === 0 ? [] : batchRows(booklets, made, weight);
  const familyBlocks = family.filter((f) => f.blocks.length > 0);
  const familyWarns = family.filter((f) => f.blocks.length === 0 && f.warns.length > 0);
  const { lines: calibrationLines, trusted } = calibration();
  const untrusted = JUDGES.filter((j) => !trusted[j]);

  const passRate = (failed: (row: Row) => boolean) => `${rows.filter((r) => !failed(r)).length}/${rows.length}`;
  const sourceCount = new Set(candidates.map((c) => c.modelledOn)).size;
  const stale = staleVerdicts();
  const staleTotal = Object.values(stale).reduce((a, b) => a + b, 0);
  const uncheckable = candidates.filter((c) => notCoveredCount(c) > 0);
  const awaitingJudges = rows.filter(
    (r) => !r.admissibleAlone && r.ready && r.gates['blind solve'].length === 0 && JUDGES.some((j) => !r.judged[j]) && JUDGES.every((j) => !r.judged[j]?.fail) && !ownerBlocks(r.judged[OWNER]),
  );

  const lines = [
    `# Candidate evals: ${rows.length} candidates from ${sourceCount} booklet questions`,
    '',
    `${rows.filter((r) => r.ready).length} ready for the blind solve and judges (every gate but the blind solve, fidelity and variety pass); ${rows.filter((r) => r.admissibleAlone).length} admissible on their own (all of that, the blind solve, all four judges, the owner not against); **${rows.filter((r) => r.admit).length} admitted by \`npm run admit:candidates\`** (less those held back by a source-family finding).`,
    '',
    ...(awaitingJudges.length > 0 ? [`${awaitingJudges.length} more would be admissible on their own but lack a judge verdict that counts: run the judges on evals/judge-input/<judge>/pending-NN.json (\`npm run eval:judge-input\`).`, ''] : []),
    ...(untrusted.length > 0 ? [`Judges not trusted (calibration below): ${untrusted.join(', ')}. Their verdicts still show, but recalibrate before relying on them.`, ''] : []),
    ...(staleTotal > 0
      ? [
          `${staleTotal} saved judge verdicts are stale and not counted (${Object.entries(stale)
            .map(([j, n]) => `${j} ${n}`)
            .join(', ')}): the candidate's text or the judge's prompt changed after the verdict.`,
          '',
        ]
      : []),
    '## Per-candidate checks (pass / total)',
    '',
    '| Layer | Check | Pass | Blocks |',
    '|---|---|---|---|',
    ...GATES.map((g) => `| Gate | ${g} | ${passRate((r) => r.gates[g].length > 0)} | yes |`),
    `| Fidelity | shape matches the booklet question it is modelled on | ${passRate((r) => r.fidelity.length > 0)} | yes |`,
    `| Variety | not its source, a sibling, an admitted variant or a bank question renamed | ${passRate((r) => r.variety.length > 0)} | yes |`,
    ...JUDGES.map((j) => `| Judged | ${j} (passed / judged) | ${rows.filter((r) => r.judged[j] && !r.judged[j].fail).length}/${rows.filter((r) => r.judged[j]).length} | yes |`),
    `| Owner | not failed or rejected (reviewed: ${rows.filter((r) => r.judged[OWNER]).length}) | ${passRate((r) => ownerBlocks(r.judged[OWNER]))} | yes |`,
    '',
    '## Source families',
    '',
    `Per booklet question, its waiting and admitted variants together: at most ${MAX_VARIANTS_COMPUTED} variants where every variant's answer is worked out afresh from its own numbers (numbers, rankings, labels, statements that differ only in their numbers), at most ${MAX_VARIANTS_KEYED} for a statement source whose round list declares the claim each variant keys (no claim keyed by more than ${MAX_VARIANTS_KEYED / 2}, none on an option the data cannot settle), at most ${MAX_VARIANTS_PER_SOURCE} otherwise, and at most ${MAX_SAME_LETTER_PER_SOURCE} with the answer at one letter. A miss blocks that source's waiting candidates. Warnings: answers sharing a letter at all (target: a different letter for each variant), and no waiting variant reviewed by the owner, at any family size (target: at least one per source; past ${MAX_VARIANTS_PER_SOURCE} this blocked until 26 November 2026, README "Changes to the criteria").`,
    '',
    `${family.length} sources; ${familyBlocks.length} blocked, ${familyWarns.length} with a warning only; the owner has reviewed a variant of ${family.filter((f) => f.ownerReviewed.length > 0).length}.`,
    '',
    ...familyBlocks.map((f) => `- BLOCK ${f.source} (${[...f.admitted, ...f.waiting].length} variants of at most ${f.cap}, answers ${f.letters}): ${[...f.blocks, ...f.warns.map((w) => `warn: ${w}`)].join('; ')}`),
    ...familyWarns.map((f) => `- warn ${f.source}: ${f.warns.join('; ')}`),
    '',
    ...(family.some((f) => f.keyedClaims.length > 0)
      ? [
          '### Keyed claims to read',
          '',
          'Past 4 in a statement family, each waiting variant keys the claim its round list declares. No code can tell which claim an option makes: read each answer against the source option beside it before admitting.',
          '',
          ...family.flatMap((f) => f.keyedClaims.map((line) => `- ${line}`)),
          '',
        ]
      : []),
    '## The batch against the booklets',
    '',
    ...(made.count === 0
      ? ['No candidates yet.', '']
      : [
          ...(made.count < 40 ? [`Only ${made.count} candidates: the batch measures are indicative until there are about 40.`, ''] : []),
          'Every line here warns; none blocks (evals/README.md, "Batch measures").',
          '',
          '| Measure | Booklets | Candidates | Target | |',
          '|---|---|---|---|---|',
          ...measures.map((m) => `| ${m.measure} | ${m.booklets} | ${m.candidates} | ${m.target} | ${verdictOf(m)} |`),
          '',
        ]),
    ...(uncheckable.length > 0
      ? [
          '## Options the code cannot check',
          '',
          `${uncheckable.length} candidates mark wrong statements \`notCovered\` (the data does not cover them). The calculation gate only confirms they are not the stated answer; for those options these candidates rely on the blind solve and the judges.`,
          '',
          ...uncheckable.map((c) => {
            const statements = c.check.kind === 'truth' ? c.check.statements : [];
            const marked = statements.flatMap((st, i) => (isNotCovered(st) ? [`${'ABCDE'[i]} (${st.notCovered})`] : []));
            return `- ${c.id}: ${marked.join('; ')}`;
          }),
          '',
        ]
      : []),
    ...calibrationLines,
    '## Candidates with findings',
    '',
    ...rows
      .filter((r) => !r.admissibleAlone)
      .flatMap((r) => [
        `- **${r.id}** (from ${r.modelledOn})${r.ready ? ': ready, waiting for the blind solve or judges' : ''}`,
        // A candidate not yet blind-solved is not a finding; a solver that disagreed, or a question changed since, is.
        ...Object.entries(r.gates).flatMap(([gate, problems]) => problems.filter((p) => !p.endsWith('never independently checked')).map((p) => `  - gate, ${gate}: ${p}`)),
        ...r.fidelity.map((p) => `  - fidelity: ${p}`),
        ...r.variety.map((p) => `  - variety: ${p}`),
        ...Object.entries(r.judged).flatMap(([judge, j]) => (judge === OWNER ? (ownerBlocks(j) ? [`  - owner: ${j.mark ?? 'fail'}${j.why ? `: ${j.why}` : ''}`] : []) : j.fail ? [`  - judged, ${judge}: ${j.why ?? 'failed'}`] : [])),
        ...(r.ready && r.gates['blind solve'].length > 0 ? ['  - not yet blind-solved'] : []),
        ...(r.ready ? JUDGES.filter((j) => !r.judged[j]).map((j) => `  - not yet judged: ${j}`) : []),
      ]),
    '',
  ];
  const batch = {
    measures: measures.map((m) => ({ ...m, verdict: verdictOf(m) })),
    families: family,
    calibration: trusted,
    admitted: rows.filter((r) => r.admit).map((r) => r.id),
  };
  return { rows, summary: lines.join('\n'), batch };
}

/**
 * Every booklet question as the app serves it (redrawn charts in place of the transcribed
 * tables), with the shape a candidate modelled on it must have: what a writer reads first.
 */
function writeSources(): void {
  mkdirSync(new URL('./report/sources/', import.meta.url), { recursive: true });
  for (const q of sources.values()) {
    const shape = shapeOfQuestion(q);
    const ranges = Object.fromEntries((Object.keys(BANDS) as Banded[]).map((m) => [m, bandRange(m, shape[m])]));
    const served = {
      id: q.id,
      booklet: q.booklet!.name,
      caseTitle: q.booklet!.caseTitle,
      skill: q.skill,
      tier: q.tier,
      context: q.context,
      prompt: q.prompt,
      options: optionsOf(q),
      correctIndex: q.answer.kind === 'choice' ? q.answer.correctIndex : -1,
      solution: q.solution,
      shortcut: q.shortcut,
      ...(q.note ? { note: q.note } : {}),
      fidelity: {
        skill: q.skill,
        tier: q.tier,
        optionKind: shape.optionKind,
        options: shape.options,
        tables: shape.tables,
        charts: shape.charts,
        chartsLabelled: shape.chartsLabelled,
        asksForClosest: shape.approximate,
        measured: { proseWords: shape.proseWords, promptWords: shape.promptWords, dataCells: shape.dataCells, numbersGiven: shape.numbersGiven },
        allowed: ranges,
        surplusShare: Math.round(surplusShare(q.context, q.prompt, q.solution) * 100) / 100,
        ...(shape.gridReadings > 0
          ? {
              chartValuesOnGridlines: {
                source: `${shape.onGridline} of ${shape.gridReadings}`,
                allowedShare: [
                  Math.max(0, Math.round((shape.onGridline / shape.gridReadings - GRIDLINE_BAND.below) * 100)),
                  Math.min(100, Math.round((shape.onGridline / shape.gridReadings + GRIDLINE_BAND.above) * 100)),
                ],
              },
            }
          : {}),
      },
      distractors: {
        traps: sourceDistractors[q.id]?.traps ?? [],
        trappedOptionsRequired: requiredTraps(sourceDistractors[q.id]),
        notCoveredAllowed: sourceDistractors[q.id]?.notCovered ?? 0,
        sourceHas: {
          noBasis: sourceDistractors[q.id]?.noBasis ?? 0,
          dominated: sourceDistractors[q.id]?.dominated ?? 0,
          wideGrid: sourceDistractors[q.id]?.wideGrid ?? false,
          slipsOnAnswer: sourceDistractors[q.id]?.slipsOnAnswer ?? [],
          fillers: sourceDistractors[q.id]?.fillers ?? [],
        },
      },
    };
    writeFileSync(new URL(`./report/sources/${q.id}.json`, import.meta.url), JSON.stringify(served, null, 1) + '\n');
  }
}

it('scores the candidates and writes the report', () => {
  const ids = candidates.map((c) => c.id);
  const repeated = ids.filter((id, i) => ids.indexOf(id) !== i);
  expect(repeated, 'candidate ids are unique').toEqual([]);
  const { rows, summary, batch } = score();
  mkdirSync(new URL('./report/', import.meta.url), { recursive: true });
  writeFileSync(new URL('./report/candidates.md', import.meta.url), summary);
  writeFileSync(new URL('./report/candidates.json', import.meta.url), JSON.stringify(rows, null, 1));
  writeFileSync(new URL('./report/batch.json', import.meta.url), JSON.stringify(batch, null, 1));
  writeSources();
});

/** The admission rule: an owner verdict that fails or rejects blocks; an absent one does not. */
it('admits as the README says', () => {
  const passed = Object.fromEntries(JUDGES.map((j) => [j, { fail: false }]));
  expect(admissibleAlone(true, true, passed)).toBe(true);
  expect(admissibleAlone(true, true, { ...passed, [OWNER]: { fail: false, mark: 'real' } })).toBe(true);
  expect(admissibleAlone(true, true, { ...passed, [OWNER]: { fail: true, mark: 'off' } })).toBe(false);
  expect(admissibleAlone(true, true, { ...passed, [OWNER]: { fail: true, mark: 'reject' } })).toBe(false);
  expect(admissibleAlone(true, true, { ...passed, [OWNER]: { fail: false, mark: 'reject' } })).toBe(false);
  expect(admissibleAlone(true, true, { ...passed, [OWNER]: { fail: true } })).toBe(false);
  // Every judge must have passed it: a missing verdict or a fail holds it back, as does a missing blind solve.
  const { distractors: _d, ...threeJudges } = passed;
  expect(admissibleAlone(true, true, threeJudges)).toBe(false);
  expect(admissibleAlone(true, true, { ...passed, distractors: { fail: true } })).toBe(false);
  expect(admissibleAlone(true, false, passed)).toBe(false);
  expect(admissibleAlone(false, true, passed)).toBe(false);
});

/**
 * What the evals admit passes the bank's own tests (src/engine/question/authored-content.test.ts) once admitted: each
 * per-entry rule there is applied to every candidate whose gates pass (the blind solve aside: its record moves with it),
 * in the form admission writes, without `traps`. The bank-wide rules (answer positions, unique ids) are admit.mjs's.
 */
it("admits only what the bank's tests accept", () => {
  const admittedIds = new Set(bank.map((q) => q.id));
  for (const c of candidates) {
    const gates = gatesOf(c, admittedIds);
    if (GATES.some((g) => g !== 'blind solve' && gates[g].length > 0)) continue;
    const { traps: _traps, ...entry } = c;
    const bankRules = safely(() => [
      ...(sources.has(entry.modelledOn) ? [] : [`${entry.id}: modelled on ${entry.modelledOn}, not a booklet question`]),
      ...bankFieldProblems(entry),
      ...structureProblems(entry, scenarioSkills),
      ...unorderedNumericOptionProblems(entry),
      ...problemsOf(() => verifyCalculation(entry)),
      ...originalityProblems(entry, bookletIndex),
    ]);
    expect(bankRules, c.id).toEqual([]);
  }
});

/** The new checks catch what they should and pass what they should, on the worked examples and copies of them broken on purpose. */
/** The faithful calibration candidates: the worked examples the trap checks below are run on. */
const faithfulFiles = import.meta.glob<Candidate[]>('./calibration/faithful.json', { eager: true, import: 'default' });

// These checks run on two faithful candidates and their sources' recorded distractors (evals/calibration/faithful.json,
// evals/source-distractors.json): data drawn from the private booklets, so skipped where it is not kept.
it.skipIf(Object.keys(faithfulFiles).length === 0 || Object.keys(sourceDistractors).length === 0)('checks traps and statements as the brief says', () => {
  const [years, perTonne] = Object.values(faithfulFiles).flat();
  expect(years && perTonne).toBeTruthy();
  const gate = (c: Candidate) => trapGateProblems(c, sourceDistractors[c.modelledOn]);
  expect(gate(years!)).toEqual([]);
  expect(gate(perTonne!)).toEqual([]);
  expect(gate({ ...years!, traps: [] })[0]).toMatch(/declares no traps/);
  // A slip declared on the right answer, a slip whose result is the right answer's, a threshold slip that still picks it.
  expect(gate({ ...perTonne!, traps: [{ slip: 'divides the right way round', option: '£1.09', result: '9600 / 8800' }] }).join()).toMatch(/correct option/);
  expect(gate({ ...perTonne!, traps: [{ slip: 'forgets nothing at all', option: '£0.89', result: '9600 / (2200 + 1400 + 1100 + 1700 + 2400)' }] }).join()).toMatch(/leads to C/);
  expect(gate({ ...years!, traps: [{ slip: 'rounds the payback down', option: '2', result: '40 / (8000 * 365 * 8 / 1000000 - 12 * 500 / 1000)', rule: 'at-least' }] }).join()).toMatch(/leads to C/);
  // Only one trapped option where the source has two.
  expect(gate({ ...years!, traps: years!.traps!.slice(0, 1) }).join()).toMatch(/source has traps on 2/);
  // Parity: a source with no recorded trap requires none, but a declared trap must still be sound.
  const noTrapSource = { ...sourceDistractors[perTonne!.modelledOn]!, traps: [] };
  expect(trapGateProblems({ ...perTonne!, traps: [] }, noTrapSource)).toEqual([]);
  const { traps: _none, ...noTraps } = perTonne!;
  expect(trapGateProblems(noTraps, noTrapSource)).toEqual([]);
  expect(trapGateProblems({ ...perTonne!, traps: [{ slip: 'divides the right way round', option: '£1.09', result: '9600 / 8800' }] }, noTrapSource).join()).toMatch(/correct option/);
  for (const id of ['pst3-q14', 'pst3-q26']) expect(requiredTraps(sourceDistractors[id])).toBe(0);
  // Placeholders in a truth check, and the honest marker.
  const truth = (statements: Array<string | { notCovered: string }>, correctIndex = 0): Candidate => ({
    ...perTonne!,
    options: ['Friday took the most material', 'Monday took more than Friday', 'Prices rose in the week', 'Tuesday took more than Monday'],
    correctIndex,
    check: { kind: 'truth', statements },
  });
  const calc = (c: Candidate) => problemsOf(() => verifyCalculation(c)).join();
  expect(calc(truth(['2400 > 2200 && 2400 > 1700', '2200 > 2400', { notCovered: 'the chart gives tonnages, no prices' }, '1400 > 2200']))).toBe('');
  expect(calc(truth(['2400 > 2200', '2200 > 2400', '1400 * 0 > 2200 * 0', '1400 > 2200']))).toMatch(/multiplies by zero/);
  expect(calc(truth(['2400 > 2200', '2200 > 2400', 'false && 1400 > 2200', '1400 > 2200']))).toMatch(/true or false/);
  expect(calc(truth(['2400 > 2200', '2200 > 2400', '0 > 1', '1400 > 2200']))).toMatch(/no figure/);
  expect(calc(truth(['2400 > 2200', '2200 > 2400', '1400 + 1100 > 2200 && 1400 == 0', '1400 > 2200']))).toMatch(/tests nothing/);
  expect(calc(truth(['2400 > 2200', '2200 > 2400', { notCovered: 'none' }, '1400 > 2200']))).toMatch(/one-line reason/);
  expect(calc(truth([{ notCovered: 'the chart gives tonnages, no prices' }, '2200 > 2400', '2400 > 2200', '1400 > 2200']))).toMatch(/correct option cannot/);
});

/** The family cap rises to 8 only where every variant's answer is worked out afresh; the rules around it hold (README, "Changes to the criteria"). */
it('caps families as the README says', () => {
  // Numbers, rankings and labels: worked out from each variant's own data.
  expect(answerIsComputed(['$1.8m', '$2.0m', '$2.2m', '$2.4m'], 0)).toBe(true);
  expect(answerIsComputed(['B, D, E, C, A', 'B, A, E, D, C', 'B, D, E, A, C', 'A, C, E, D, B'], 0)).toBe(true);
  expect(answerIsComputed(['Country A', 'Country B', 'Country C', 'Country D'], 3)).toBe(true);
  // Statements that differ only in their numbers: the numbers decide.
  expect(answerIsComputed(['About 3% fewer calls an hour than usual', 'About 5% fewer calls an hour than usual', 'About 3% more calls an hour than in any other week', 'About 5% more calls an hour than in any other week'], 1)).toBe(true);
  // A keyed claim unlike the others keeps its form in every variant; a formula has no arithmetic.
  expect(answerIsComputed(['Half of all members joined in the first year', 'Rural branches have been visited least often so far', 'Most passes were sold to frequent riders', 'The best opportunity lies in the city centre'], 1)).toBe(false);
  expect(answerIsComputed(['(a×r)/n', 'a/(n×r)', '(a×n)/r', 'a×n×r'], 0)).toBe(false);
  // On the booklet questions themselves.
  for (const id of ['pst2-q14', 'pst3-q03', 'pst1-q24', 'pst2-q03', 'pracB-q09', 'pracC-q03', 'pst3-q13', 'pracB-q06', 'pst1-q09']) expect(variantCap(id), id).toBe(MAX_VARIANTS_COMPUTED);
  for (const id of ['pracA-q24', 'pracC-q25', 'pst3-q20', 'pst2-q07', 'pst1-q15', 'pracB-q26', 'sample-q09', 'pst1-q03']) expect(variantCap(id), id).toBe(MAX_VARIANTS_PER_SOURCE);
  // Up to the cap with at most 2 per letter: no block.
  expect(familyFindings({ cap: 8, admitted: 4, waiting: 4, letters: 'ABCDDCBA', reviewed: 1 }).blocks).toEqual([]);
  // Past the cap, or 3 at one letter: blocks.
  expect(familyFindings({ cap: 4, admitted: 4, waiting: 1, letters: 'ABCDA', reviewed: 1 }).blocks.join()).toMatch(/at most 4/);
  expect(familyFindings({ cap: 8, admitted: 4, waiting: 5, letters: 'ABCDABCDA', reviewed: 1 }).blocks.join()).toMatch(/at most 8/);
  expect(familyFindings({ cap: 8, admitted: 4, waiting: 2, letters: 'BCBCBD', reviewed: 1 }).blocks.join()).toMatch(/3 at one letter/);
  // No owner review only warns, past 4 (since 26 November 2026) as up to 4.
  const large = familyFindings({ cap: 8, admitted: 4, waiting: 2, letters: 'ABCDAB', reviewed: 0 });
  expect(large.blocks).toEqual([]);
  expect(large.warns.join()).toMatch(/6 variants, more than 4: the owner has reviewed none/);
  const small = familyFindings({ cap: 8, admitted: 3, waiting: 1, letters: 'ABCD', reviewed: 0 });
  expect(small.blocks).toEqual([]);
  expect(small.warns.join()).toMatch(/owner has reviewed none/);
  // An owner verdict of off or reject still blocks that candidate, past 4 as below it; an absent one never does.
  const passed = Object.fromEntries(JUDGES.map((j) => [j, { fail: false }]));
  expect(admissibleAlone(true, true, { ...passed, [OWNER]: { fail: true, mark: 'off' } })).toBe(false);
  expect(admissibleAlone(true, true, { ...passed, [OWNER]: { fail: false, mark: 'reject' } })).toBe(false);
  expect(admissibleAlone(true, true, passed)).toBe(true);
  expect(THRESHOLDS.settingLargeFamily).toBeLessThan(THRESHOLDS.setting);
});

/** A statement family passes 4 only where its keyed claim moves, as its round list declares (README, "Changes to the criteria", "The keyed claim"). */
it('lets a statement family past 4 only where the keyed claim moves', () => {
  const claims = { A: 'share of a sub-total', B: 'share of the total', C: 'above a threshold', D: 'not covered' };
  const family = (keys: Array<string | undefined>) => keys.map((k, i) => ({ id: `v${i}`, keys: k }));
  const base = { sourceLetter: 'A', claims, neverKeyed: ['D'], recordedNever: 1 };
  // Four admitted on the usual claim, four new on others: at most 4 on any one, at any family size.
  expect(keyedClaimProblems({ ...base, variants: family(['share of a sub-total', 'share of a sub-total', 'share of a sub-total', 'share of a sub-total', 'share of the total', 'above a threshold', 'share of the total', 'above a threshold']) })).toEqual([]);
  // A fifth on the usual claim, an undeclared variant, a claim the data cannot settle, a claim the source does not make.
  expect(keyedClaimProblems({ ...base, variants: family(['share of a sub-total', 'share of a sub-total', 'share of a sub-total', 'share of a sub-total', 'share of a sub-total', 'share of the total']) }).join()).toMatch(/5 of 6 variants, at most 4 \(half of 8\)/);
  // The first new variant beside 4 admitted on the usual claim, or the survivors after a drop, are not held back.
  expect(keyedClaimProblems({ ...base, variants: family(['share of a sub-total', 'share of a sub-total', 'share of a sub-total', 'share of a sub-total', 'share of the total']) })).toEqual([]);
  expect(keyedClaimProblems({ ...base, variants: family(['share of a sub-total', undefined]) }).join()).toMatch(/v1 declares no keyed claim/);
  expect(keyedClaimProblems({ ...base, variants: family(['share of a sub-total', 'not covered']) }).join()).toMatch(/not a claim of the source that can be true/);
  expect(keyedClaimProblems({ ...base, variants: family(['share of a sub-total', 'a new claim']) }).join()).toMatch(/not a claim of the source that can be true/);
  // The never-keyed options cannot be fewer than the analysis records, nor include the source's own answer.
  expect(keyedClaimProblems({ ...base, neverKeyed: [], variants: [] }).join()).toMatch(/0 options marked never keyed; the source's analysis records 1/);
  expect(keyedClaimProblems({ ...base, neverKeyed: ['A', 'D'], variants: [] }).join()).toMatch(/own answer \(A\)/);
  // Every source a round list declares: a statement source at the base cap, every option given a claim, every admitted
  // variant's claim declared, and the planned family within 8 and the rule.
  expect(claimPlans.size).toBeGreaterThan(0);
  for (const [id, plan] of claimPlans) {
    const q = sources.get(id);
    expect(q?.answer.kind, id).toBe('choice');
    if (!q || q.answer.kind !== 'choice') continue;
    expect(variantCap(id), id).toBe(MAX_VARIANTS_PER_SOURCE);
    expect(familyCap(id).cap, id).toBe(MAX_VARIANTS_KEYED);
    expect(Object.keys(plan.claims).sort().join(''), id).toBe('ABCDE'.slice(0, optionsOf(q).length));
    const done = admitted.filter((e) => e.modelledOn === id).map((e) => e.id);
    const planned = [...new Set([...done, ...plan.keys.keys()])];
    expect(planned.length, id).toBeLessThanOrEqual(MAX_VARIANTS_KEYED);
    const recorded = sourceDistractors[id];
    const problems = keyedClaimProblems({
      sourceLetter: 'ABCDE'[q.answer.correctIndex]!,
      claims: plan.claims,
      neverKeyed: plan.neverKeyed,
      recordedNever: (recorded?.notCovered ?? 0) + (recorded?.dominated ?? 0),
      variants: planned.map((v) => ({ id: v, keys: plan.keys.get(v) })),
    });
    expect(problems, id).toEqual([]);
  }
  // A statement source with no declaration stays at 4.
  expect(familyCap('pracB-q07').cap).toBe(MAX_VARIANTS_PER_SOURCE);
});

/** The telling-numbers check compares values, not chart category labels: bars "1" to "50" are the source's structure, not its numbers. */
it('leaves chart category labels out of the numbers compared', () => {
  const chart = (text: string, categories: string[], values: number[]): Candidate['context'] => [
    { type: 'paragraph', text },
    { type: 'chart', chart: 'cumulative', title: 'Exhibit 2: Share of sales', unit: 'Share, %', categories, series: [{ name: 'Share', values }], axis: { min: 0, max: 100, step: 20 }, labelled: false, decimals: 0 },
  ];
  const labels = ['13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24'];
  const mine = telling(numberText(chart('Sales of 4,730 units.', labels, [17, 33, 47, 58, 64, 71, 77, 83, 88, 93, 97, 100]), 'Which is true?'), false);
  const theirs = telling(numberText(chart('Sales of 6,210 units.', labels, [21, 39, 52, 61, 69, 74, 79, 86, 91, 95, 98, 100]), 'Which is true?'), false);
  expect(reused(mine, theirs).count).toBe(0);
  expect(mine.has(13) || mine.has(24)).toBe(false);
  expect(mine.has(4730) && mine.has(47)).toBe(true);
  // Values and the rest of the text still count.
  const copy = telling(numberText(chart('Sales of 4,730 units.', ['A', 'B', 'C'], [17, 33, 47]), 'Which is true?'), false);
  expect(reused(copy, mine).count).toBe(4);
});
