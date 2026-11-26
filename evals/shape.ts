import { onGridline, readingPositions } from '../scripts/authored/chart-readings.mjs';
import { APPROXIMATE, contextText, numbersIn, optionValues, problemsOf } from '../src/engine/question/authored-verify';
import type { ContextBlock, Question } from '../src/engine/question';

/**
 * The shape of a question: what it looks like to the owner, measured the same way
 * for a candidate and for the booklet question it is modelled on. The fidelity
 * checks compare two shapes; the batch checks compare the shapes of a whole set.
 */

export const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

/**
 * What the owner does with the options: compute a number, build a formula, put
 * things in order, test statements (long options, read and checked one by one), or
 * pick between short names (a country, a year, "twice as much").
 */
export type OptionKind = 'numeric' | 'formula' | 'ranking' | 'statement' | 'label';

/** An escape option a booklet sometimes adds to numbers: "None of the above", "Cannot be determined from the data". */
const ESCAPE = /none of the above|cannot be determined|not enough information|insufficient information|lack sufficient/i;
/** A threshold is a claim to test, not a number to compute: "Less than 3,400", "At least 1,700". */
const THRESHOLD = /\b(less|more|fewer|greater) than\b|\bat (least|most)\b|\b(over|under|below|above)\b/i;
const NUMBER_TOKEN = /[−-]?[$€£]?\d[\d,]*(?:\.\d+)?%?/g;
/** Operators as the booklets write them; a lone x or dash between spaces is a times or minus sign. */
const OPERATOR = /[×÷*/=<>+^]|\s[x−–-]\s/;

/** "(s – vc) x 500 / k", "q/((a+b)×120×d)", "m > u×v + g×f": operators between short symbols and numbers, nothing else. */
function isFormula(option: string): boolean {
  if (!OPERATOR.test(option)) return false;
  const rest = option
    .replace(NUMBER_TOKEN, ' ')
    .replace(/[×÷*/=<>+^()[\]−–-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && t !== 'x');
  return rest.length > 0 && rest.every((t) => /^[A-Za-z]{1,3}$/.test(t));
}

/** "B, D, A, C", "2, 5, 1, 4, 3": the same three or more short items in a different order in every option. */
function isRanking(options: string[]): boolean {
  const items = options.map((o) => o.split(/\s*,\s*/));
  if (!items.every((list) => list.length >= 3 && list.every((t) => /^\w{1,3}$/.test(t)))) return false;
  const key = (list: string[]) => [...list].sort().join();
  return items.every((list) => key(list) === key(items[0]!));
}

const isYear = (option: string) => /^\s*(19|20)\d\d\s*$/.test(option);

export function optionKind(options: string[]): OptionKind {
  if (options.every(isFormula)) return 'formula';
  if (isRanking(options)) return 'ranking';
  const values = options.filter((o) => !ESCAPE.test(o));
  const numeric = (o: string) => numbersIn(o).length === 1 && wordCount(o) <= 4 && !THRESHOLD.test(o);
  if (values.length >= options.length - 1 && values.every(numeric) && !values.every(isYear)) return 'numeric';
  if (options.every((o) => THRESHOLD.test(o) && numbersIn(o).length > 0)) return 'statement';
  if (options.every((o) => wordCount(o) >= 5)) return 'statement';
  return 'label';
}

export interface Shape {
  optionKind: OptionKind;
  options: number;
  tables: number;
  /** Chart kinds, sorted. */
  charts: string[];
  /** Per chart, in the same order: whether values are printed (true) or read from gridlines (false). */
  chartsLabelled: boolean[];
  /** Words of paragraphs and lists: the story around the data. */
  proseWords: number;
  promptWords: number;
  /** Table cells holding a number, plus every charted value: how much data there is to read. */
  dataCells: number;
  /** Every number written in the context and prompt (chart values included). */
  numbersGiven: number;
  /** The prompt asks for the closest or approximate value. */
  approximate: boolean;
  /** Values a reader must read off gridlines (charts without printed values; stack edges and waterfall levels as read). */
  gridReadings: number;
  /** How many of those lie exactly on a gridline, where reading them takes no estimate. */
  onGridline: number;
  /** Numeric options only: whether they are listed in ascending order (undefined for other kinds). */
  ascending: boolean | undefined;
}

export function shapeOf(context: ContextBlock[], prompt: string, options: string[]): Shape {
  const charts = context.flatMap((b) => (b.type === 'chart' ? [b] : [])).sort((a, b) => (a.chart < b.chart ? -1 : a.chart > b.chart ? 1 : 0));
  return {
    optionKind: optionKind(options),
    options: options.length,
    tables: context.filter((b) => b.type === 'table').length,
    charts: charts.map((c) => c.chart),
    chartsLabelled: charts.map((c) => c.labelled),
    proseWords: context.reduce(
      (n, b) => n + (b.type === 'paragraph' ? wordCount(b.text) : b.type === 'list' ? b.items.reduce((m, i) => m + wordCount(i), 0) : 0),
      0,
    ),
    promptWords: wordCount(prompt),
    dataCells: context.reduce(
      (n, b) =>
        n +
        (b.type === 'table'
          ? b.rows.flat().filter((cell) => numbersIn(cell).length > 0).length
          : b.type === 'chart'
            ? b.series.reduce((m, s) => m + s.values.length, 0)
            : 0),
      0,
    ),
    numbersGiven: [...contextText(context), prompt].flatMap(numbersIn).length,
    approximate: APPROXIMATE.test(prompt),
    ...gridline(context),
    ascending: ascendingOptions(options),
  };
}

function gridline(context: ContextBlock[]): { gridReadings: number; onGridline: number } {
  const positions = context.flatMap((b) => (b.type === 'chart' ? readingPositions(b) : []));
  return { gridReadings: positions.length, onGridline: positions.filter((p) => onGridline(p.value, p.axis)).length };
}

/** For numeric options (escape options aside): listed in ascending order or not. */
function ascendingOptions(options: string[]): boolean | undefined {
  if (optionKind(options) !== 'numeric') return undefined;
  // Mixed scales of one unit ("$700,000" beside "$2.5 million") are compared as amounts.
  const listed = options.filter((o) => !ESCAPE.test(o));
  if (problemsOf(() => optionValues(listed)).length > 0) return undefined;
  const values = optionValues(listed);
  return values.every((v, i) => i === 0 || v > values[i - 1]!);
}

/**
 * How far a candidate's share of gridline values may sit from its source's: no more than 15 points
 * above (gridline values make the reading easier) and no more than 30 below (harder than the source,
 * which the difficulty judge weighs too). Measured on the booklets: among the 20 questions with charts
 * read from gridlines, the share runs from 15% to 100% (median about 43%).
 */
export const GRIDLINE_BAND = { above: 0.15, below: 0.3 } as const;

export const optionsOf = (q: Question) => (q.answer.kind === 'choice' ? q.answer.options : []);
export const shapeOfQuestion = (q: Question) => shapeOf(q.context, q.prompt, optionsOf(q));

/**
 * The bands a candidate's measures must fall in around its source's: a share of the
 * source's value either way, plus a fixed slack so that small sources are not held
 * to a word or two. Grounded in the booklets (evals/README.md, "Fidelity bands"):
 * every booklet question passes against itself with each measure a quarter longer or
 * shorter; prose may move more than data, since rewording changes length but the
 * exhibit keeps its size. Against another booklet question of the same skill, 8% of
 * pairs pass all four bands and 1.3% pass the whole shape (0.8% with the tier too).
 */
export const BANDS = {
  proseWords: { low: 0.7, high: 1.4, slack: 6 },
  promptWords: { low: 0.7, high: 1.4, slack: 4 },
  dataCells: { low: 0.75, high: 1.33, slack: 2 },
  numbersGiven: { low: 0.75, high: 1.33, slack: 3 },
} as const;

export type Banded = keyof typeof BANDS;

export function withinBand(measure: Banded, value: number, source: number): boolean {
  const { low, high, slack } = BANDS[measure];
  return value >= source * low - slack && value <= source * high + slack;
}

/** The whole-number range a candidate's measure must fall in, for a source's value: what a writer aims for. */
export function bandRange(measure: Banded, source: number): [number, number] {
  const { low, high, slack } = BANDS[measure];
  return [Math.max(0, Math.ceil(source * low - slack)), Math.floor(source * high + slack)];
}

const BAND_LABEL: Record<Banded, string> = {
  proseWords: 'words of context',
  promptWords: 'words of prompt',
  dataCells: 'data cells',
  numbersGiven: 'numbers given',
};

/** How one shape departs from its source's: every difference that would make it a different kind of question. */
export function shapeProblems(mine: Shape, theirs: Shape): string[] {
  const problems: string[] = [];
  if (mine.optionKind !== theirs.optionKind) problems.push(`${mine.optionKind} options, source ${theirs.optionKind}`);
  if (mine.options !== theirs.options) problems.push(`${mine.options} options, source ${theirs.options}`);
  if (mine.tables !== theirs.tables) problems.push(`${mine.tables} tables, source ${theirs.tables}`);
  if (mine.charts.join() !== theirs.charts.join()) problems.push(`charts [${mine.charts}], source [${theirs.charts}]`);
  else if (mine.chartsLabelled.join() !== theirs.chartsLabelled.join())
    problems.push(`charts printed/read from gridlines [${mine.chartsLabelled}], source [${theirs.chartsLabelled}]`);
  if (mine.approximate !== theirs.approximate)
    problems.push(theirs.approximate ? 'source asks for the closest value, this does not' : 'asks for the closest value, source does not');
  for (const measure of Object.keys(BANDS) as Banded[]) {
    if (!withinBand(measure, mine[measure], theirs[measure])) problems.push(`${mine[measure]} ${BAND_LABEL[measure]}, source ${theirs[measure]}`);
  }
  if (theirs.gridReadings > 0 && mine.gridReadings > 0) {
    const share = (s: Shape) => s.onGridline / s.gridReadings;
    const pct = (x: number) => `${Math.round(x * 100)}%`;
    if (share(mine) > share(theirs) + GRIDLINE_BAND.above + 1e-9)
      problems.push(`${mine.onGridline} of ${mine.gridReadings} chart values to read sit on a gridline (${pct(share(mine))}), source ${pct(share(theirs))}: put more between gridlines`);
    else if (share(mine) < share(theirs) - GRIDLINE_BAND.below - 1e-9)
      problems.push(`${mine.onGridline} of ${mine.gridReadings} chart values to read sit on a gridline (${pct(share(mine))}), source ${pct(share(theirs))}: put more on gridlines`);
  }
  return problems;
}
