import { contextText, numbersIn } from '../src/engine/question/authored-verify';
import type { ContextBlock } from '../src/engine/question';

/**
 * Variety: a candidate must be a new question, not its source or a sibling (another
 * candidate modelled on the same source) with the names and numbers swapped. Two
 * measures, both grounded in the booklets (evals/README.md, "Variety thresholds"):
 * how many setting words two contexts share, and how many of one's numbers the
 * other reuses.
 */

/** Words that set no scene: function words, calendar words (a variant keeps the source's days or months), and exhibit labels. */
const STOP = new Set(
  [
    'the and for are was were with from that this its has have had all which what how many much each per their than not but can will would been into also only over such any most more less other these those they them there then when where while who whom whose total',
    'year years yearly annual annually month months monthly week weeks weekly day days daily quarter quarterly half',
    'mon tue wed thu fri sat sun monday tuesday wednesday thursday friday saturday sunday weekday weekdays weekend weekends',
    'jan feb mar apr may jun jul aug sep sept oct nov dec january february march april june july august september october november december',
    'chart table exhibit figure graph doc document source note',
  ]
    .join(' ')
    .split(' '),
);

/**
 * The words that set the scene: paragraphs, lists, titles and notes, and (with `labels`) the
 * exhibit's labels too: headers, row labels, units, categories, series names. Numbers and short
 * words left out. The variety check compares a candidate with its source and siblings without the
 * labels, which variants of one source legitimately share ("Profit margin", "Other reason"): a
 * renamed copy still shows in the story and titles, and in its numbers.
 */
export function settingWords(context: ContextBlock[], labels = true): Set<string> {
  const texts = context.flatMap((b) => {
    switch (b.type) {
      case 'paragraph':
        return [b.text];
      case 'list':
        return b.items;
      case 'table':
        return [b.title ?? '', ...(labels ? [...b.headers, ...b.rows.flat().filter((cell) => numbersIn(cell).length === 0)] : [])];
      case 'chart':
        return [b.title, b.note ?? '', ...(labels ? [b.unit, ...b.categories, ...b.series.map((s) => s.name)] : [])];
    }
  });
  return new Set(
    texts
      .join(' ')
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
      // A plural counts as its singular: "profits" and "profit" are one word here.
      .map((w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)),
  );
}

/**
 * Business vocabulary every setting uses ("revenue", "cost", "customer", "monthly"):
 * words found in at least `minDocs` of the documents (booklet cases and authored
 * questions). Sharing them says nothing; sharing the rest ("gardening", "loyalty",
 * a company's name) means sharing a setting.
 */
export function genericWords(docs: Set<string>[], minDocs = 5): Set<string> {
  const counts = new Map<string, number>();
  for (const doc of docs) for (const w of doc) counts.set(w, (counts.get(w) ?? 0) + 1);
  return new Set([...counts].filter(([, n]) => n >= minDocs).map(([w]) => w));
}

/** Shared setting words over all setting words, generic vocabulary left out: 0 for unrelated settings, 1 for the same words. */
export function overlap(a: Set<string>, b: Set<string>, generic: Set<string>): number {
  const own = (s: Set<string>) => [...s].filter((w) => !generic.has(w));
  const x = own(a);
  const y = new Set(own(b));
  const shared = x.filter((w) => y.has(w)).length;
  return shared / (x.length + y.size - shared || 1);
}

/** Numbers that say nothing about a question by themselves: years, small counts, 100. */
const ordinary = (n: number) => (Number.isInteger(n) && n >= 1990 && n <= 2035) || (Number.isInteger(n) && n <= 12) || n === 100;

/** Round numbers: one significant digit (40, 3,000, 0.2), or two ending in 5 with zeros or a decimal point after (1,500, 250, 2.5; not 35, 1,520 or 6,850). */
export function isRound(n: number): boolean {
  const digits = String(Math.abs(n)).replace('.', '').replace(/^0+/, '').replace(/0+$/, '');
  return digits.length <= 1 || (digits.length === 2 && digits.endsWith('5') && (Math.abs(n) >= 100 || !Number.isInteger(n)));
}

/** The distinct numbers of a text worth comparing; round numbers left out unless `round`. */
export function telling(texts: string[], round = true): Set<number> {
  return new Set(texts.flatMap(numbersIn).filter((n) => !ordinary(n) && (round || !isRound(n))));
}

/**
 * The text whose numbers the variety check compares: context and prompt, with chart category labels
 * left out (bars "1" to "50" of a cumulative chart, a chart's years), as the setting words leave out
 * labels: variants of one source share the categories its structure dictates. Values, notes and
 * everything else stay.
 */
export function numberText(context: ContextBlock[], prompt: string): string[] {
  return [...contextText(context.map((b) => (b.type === 'chart' ? { ...b, categories: [] } : b))), prompt];
}

/** How many of `mine` also appear in `theirs`, and what share of `mine` that is. */
export function reused(mine: Set<number>, theirs: Set<number>): { count: number; share: number } {
  const count = [...mine].filter((n) => theirs.has(n)).length;
  return { count, share: mine.size === 0 ? 0 : count / mine.size };
}

/**
 * Above these a candidate repeats its source or a sibling. Re-measured for round 2 on the booklets,
 * with exhibit labels (headers, row labels, units, categories, series names) left out of the setting
 * words, since variants of one source legitimately share the labels its structure dictates: setting
 * overlap between questions of different cases has a 99th percentile of 0.065 and exceeds 0.2 in 0 of
 * 5,039 pairs; between questions of one case (one company, one story) its median is 0.41; the pilot's
 * siblings (different settings by design) have a median of 0.04 and a maximum of 0.16. So 0.2 still
 * separates a renamed copy from a new story.
 * Numbers: round numbers (1,500, 250, 40, 2.5: `isRound`) are left out as well as years, whole numbers
 * up to 12 and 100. Two booklet questions from different cases then share three or more telling numbers
 * making up over a quarter of one's numbers in 1.3% of pairs (3.0% with round numbers counted), so the
 * rule costs a writer little and still catches reused irregular figures.
 */
export const THRESHOLDS = {
  /** Setting words shared with the source, or with another candidate modelled on the same source. */
  setting: 0.2,
  /**
   * Setting words shared with a sibling, waiting or admitted, once the family has more than 4 variants (evals/README.md,
   * "Changes to the criteria"). The 95th percentile of the 419 sibling pairs admitted by round 2 (four per family at most)
   * was 0.156: a bigger family's new variant must be as far from every sibling as nineteen in twenty of those were.
   */
  settingLargeFamily: 0.15,
  /** Share of its telling numbers found in the source or a sibling, counted only from `numberCount` numbers up. */
  numberShare: 0.25,
  numberCount: 3,
} as const;
