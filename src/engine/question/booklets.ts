import type { ChartBlock, ContextBlock, Question, ScenarioSkill, Tier } from './types';

/**
 * Booklet questions: transcribed from the owner's practice test booklets and kept,
 * as transcribed, in `content/booklets/<booklet>.json`. The transcription predates
 * the question model, so each entry is mapped here: its topic to a scenario skill,
 * its difficulty to a tier, its explanation to worked steps, its tip to the shortcut.
 * An exhibit the transcription wrote down as a table "(chart)" is shown redrawn as
 * a chart of the original type, from `content/exhibits/<booklet>.json`; a question
 * whose chart exhibit has no redraw yet is held back.
 *
 * Both folders are private and may be absent (a public checkout has neither): then
 * there are no booklets and no booklet questions, and `hasBooklets()` says so.
 */
export interface BookletEntry {
  id: string;
  /** The booklet's name, e.g. "Practice booklet 1". */
  source: string;
  caseTitle: string;
  /** The question's number in the booklet. */
  number: number;
  topic: string;
  difficulty: number;
  context: Array<
    | { type: 'p'; text: string }
    | { type: 'list'; items: string[] }
    | { type: 'table'; title?: string; headers: string[]; rows: string[][] }
  >;
  question: string;
  options: string[];
  answer: number;
  explanation: string;
  tip?: string;
  /** Something the owner should know about the booklet's own answer, e.g. why its key is kept where the booklet disagrees with itself. */
  note?: string;
}

/**
 * A booklet exhibit redrawn from the PDF: the chart-titled tables it replaces, in the
 * questions that show it, and the blocks shown instead (its charts, and any part of
 * the exhibit that was a true table in the booklet).
 */
export interface Exhibit {
  id: string;
  /** The page of the booklet PDF the exhibit is drawn from. */
  page: number;
  /** Titles of the transcribed tables this exhibit replaces. */
  replaces: string[];
  /** The questions that show the exhibit. */
  questions: string[];
  blocks: Array<ChartBlock | { type: 'table'; title?: string; headers: string[]; rows: string[][] }>;
}

/** One of the owner's practice test booklets, with the questions it can serve so far, in booklet order. */
export interface Booklet {
  id: string;
  name: string;
  questions: Question[];
  /** Questions held back because a chart exhibit of theirs is not redrawn yet. */
  waiting: number;
}

/** The transcription's topics, as scenario skills. */
const TOPIC_SKILLS: Record<string, ScenarioSkill> = {
  breakeven: 'break-even-payback',
  percentages: 'percentages-in-context',
  growth: 'growth-trends',
  'unit-economics': 'unit-economics',
  ratios: 'ratios-comparisons',
  averages: 'averages-mixes',
  formula: 'building-formulas',
  'data-check': 'testing-statements',
  'expected-value': 'expected-value',
};

/** Questions the transcription filed under "other", placed by what they ask. */
const OTHER_SKILLS: Record<string, ScenarioSkill> = {
  // Which statement about staffing costs is valid.
  'pracC-q20': 'testing-statements',
  // Rank four countries by risk from tabled measures.
  'pracB-q19': 'ratios-comparisons',
  // Which figure cannot be determined from the data.
  'pst2-q13': 'testing-statements',
};

/** Expected time by tier, matching the scenario templates and the authored bank. */
const TARGET_TIME_MS: Record<Tier, number> = { 1: 60_000, 2: 90_000, 3: 120_000 };

/** A table transcribed from a drawn chart says so in its title: "Exhibit 1 (chart): ...", "Doc 2 (chart; ...)". */
const CHART_TITLE = /\(chart\b/i;

/** The transcriber's provenance note, left out of the worked steps. */
const TRANSCRIBER_NOTE = /^The booklet's key gives only the answer/;

const files = import.meta.glob<BookletEntry[]>('../../../content/booklets/*.json', { eager: true, import: 'default' });
const exhibitFiles = import.meta.glob<Exhibit[]>('../../../content/exhibits/*.json', { eager: true, import: 'default' });
const exhibits: Exhibit[] = Object.values(exhibitFiles).flat();

type TranscribedBlock = BookletEntry['context'][number];

function isChartTable(block: TranscribedBlock): boolean {
  return block.type === 'table' && CHART_TITLE.test(block.title ?? '');
}

/** The redrawn exhibit that replaces a chart-titled table in one question, if there is one. */
function exhibitFor(entry: BookletEntry, block: TranscribedBlock): Exhibit | undefined {
  if (block.type !== 'table') return undefined;
  return exhibits.find((x) => x.questions.includes(entry.id) && x.replaces.includes(block.title ?? ''));
}

export function skillFor(entry: BookletEntry): ScenarioSkill | undefined {
  return OTHER_SKILLS[entry.id] ?? TOPIC_SKILLS[entry.topic];
}

/** True while the question's data includes a chart exhibit that has not been redrawn. */
export function needsChart(entry: BookletEntry): boolean {
  return entry.context.some((block) => isChartTable(block) && !exhibitFor(entry, block));
}

/**
 * The question's context as shown: each chart-titled table swapped for its redrawn
 * exhibit, which stands where the first table it replaces stood.
 */
function contextOf(entry: BookletEntry): ContextBlock[] {
  const shown = new Set<Exhibit>();
  return entry.context.flatMap((block): ContextBlock[] => {
    const exhibit = isChartTable(block) ? exhibitFor(entry, block) : undefined;
    if (!exhibit) return [toBlock(block)];
    if (shown.has(exhibit)) return [];
    shown.add(exhibit);
    return exhibit.blocks;
  });
}

/** Every transcribed entry, booklet by booklet, each in booklet order (the transcription's order). */
export function bookletEntries(): Array<{ id: string; name: string; entries: BookletEntry[] }> {
  return Object.values(files)
    .filter((entries) => entries.length > 0)
    .map((entries) => ({ id: bookletId(entries[0]!), name: entries[0]!.source, entries }))
    .sort((a, b) => (a.name < b.name ? -1 : 1));
}

/** "pst1-q05" -> "pst1". */
function bookletId(entry: BookletEntry): string {
  return entry.id.replace(/-q\d+$/, '');
}

const booklets: Booklet[] = bookletEntries().map(({ id, name, entries }) => {
  const ready = entries.filter((entry) => !needsChart(entry));
  const parted = holdsTwoSets(entries);
  return {
    id,
    name,
    questions: ready.map((entry) => toQuestion(id, entry, parted ? partOf(entry) : undefined)),
    waiting: entries.length - ready.length,
  };
});

/** True when question numbers restart part-way: the booklet holds a second numbered practice set. */
function holdsTwoSets(entries: BookletEntry[]): boolean {
  return entries.some((entry, i) => i > 0 && entry.number <= entries[i - 1]!.number);
}

/** The practice set, as the transcription notes it after the case title: "Some Case (second practice set)". */
function partOf(entry: BookletEntry): string {
  const set = /\(([^)]+)\)\s*$/.exec(entry.caseTitle);
  if (!set) throw new Error(`${entry.id}: a booklet with two sets needs the set named after the case title`);
  return set[1]!;
}

const served: Question[] = booklets.flatMap((b) => b.questions);

function toQuestion(booklet: string, entry: BookletEntry, part: string | undefined): Question {
  const skill = skillFor(entry);
  if (!skill) throw new Error(`${entry.id}: no skill for topic ${entry.topic}`);
  const tier = entry.difficulty as Tier;
  return {
    id: entry.id,
    skill,
    tier,
    source: 'booklet',
    targetTimeMs: TARGET_TIME_MS[tier],
    prompt: entry.question,
    context: contextOf(entry),
    answer: { kind: 'choice', options: entry.options, correctIndex: entry.answer },
    solution: steps(entry.explanation),
    shortcut: entry.tip ?? '',
    ...(entry.note !== undefined && { note: entry.note }),
    booklet: { booklet, name: entry.source, caseTitle: entry.caseTitle, number: entry.number, ...(part ? { part } : {}) },
  };
}

function toBlock(block: TranscribedBlock): ContextBlock {
  return block.type === 'p' ? { type: 'paragraph', text: block.text } : block;
}

/**
 * The explanation as worked steps, one sentence per step. A sentence ends at a full
 * stop, question or exclamation mark followed by a space and a capital, digit or
 * sign, but not after an abbreviation ("vs.", "e.g.", "approx."). The transcriber's
 * note that a booklet's key gave only the answer is about provenance, not method, so
 * it is left out.
 */
function steps(explanation: string): string[] {
  return explanation
    .split(/(?<!\b(?:vs|e\.g|i\.e|approx|Inc|ltd|etc)\.)(?<=[.!?])\s+(?=[A-Z0-9$€£(−-])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !TRANSCRIBER_NOTE.test(s));
}

/** Every booklet, its questions in booklet order. */
export function allBooklets(): readonly Booklet[] {
  return booklets;
}

/** True when the private booklet files are present and serve at least one question. */
export function hasBooklets(): boolean {
  return served.length > 0;
}

/** Every booklet question the engine serves, booklet by booklet. */
export function bookletQuestions(): readonly Question[] {
  return served;
}

/** The booklet questions for one scenario skill and tier. */
export function bookletFor(skill: ScenarioSkill, tier: Tier): Question[] {
  return served.filter((q) => q.skill === skill && q.tier === tier);
}
