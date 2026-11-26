import type { Random } from '../../random';
import { randomInt } from '../../random';

export interface ChoiceOptions {
  options: string[];
  correctIndex: number;
  /** The correct option's text, for the worked solution. */
  correct: string;
}

export interface OptionStyle {
  /** Formats an option value with the given number of decimals, e.g. (v, d) => `$${formatFixed(v, d)}`. */
  format(value: number, decimals: number): string;
  /** The finest rounding step allowed, a power of ten: 1 for whole people or dollars. Default 0.01. */
  finestStep?: number;
  /** Values a careless method would reach; each is offered as a wrong option when it fits beside the correct one. */
  traps?: number[];
  /** How many spacings from the correct option a trap may land and still be offered. Default 4. */
  trapReach?: number;
}

export interface GridOptions extends ChoiceOptions {
  /** One per trap in the style, in order: whether that careless answer landed on an option of its own. */
  trapsOffered: boolean[];
}

const OPTION_COUNT = 4;
const TRAP_REACH = 4;
/** No option is below this share of the correct one: "$10" beside hundreds is no distractor. */
const LOWEST_SHARE = 0.1;
/** Room to spare: every answer the owner could reasonably reach sits this much inside half a spacing. */
const MARGIN = 1.1;

/**
 * Four ascending options for a true value, exact or read off a chart.
 *
 * Where the correct option sits is drawn first, evenly over A to D, so no
 * letter is a better guess than another. The options are then laid on the
 * tightest grid that keeps every answer the owner could reasonably reach
 * (`band`: just the true value for an exact sum; the range a misreading of a
 * chart allows) inside half a spacing of the correct option, so exactly one
 * option is closest, with room to spare.
 *
 * For a value worked out exactly, distractors share the correct option's last
 * printed digit, so a last-digit trick never picks it out: they sit a whole
 * number of tens of that digit away. A value read off gridlines has no exact
 * last digit to work out, so its options sit on round steps (15, 30, 45, 60)
 * at no more precision than the spacing makes meaningful: never $190.3m beside
 * $200.3m. No option falls below a tenth of the correct one.
 */
export function optionGrid(truth: number, band: [number, number], random: Random, style: OptionStyle, estimate: boolean): GridOptions {
  if (!(truth > 0) || !Number.isFinite(truth)) throw new Error(`Options need a positive true value, got ${truth}`);
  const position = randomInt(random, 0, OPTION_COUNT - 1);
  const { unit, spacing, decimals } = tightestGrid(truth, band, style.finestStep ?? 0.01, estimate);
  const correct = clean(Math.round(truth / unit) * unit);
  const floor = Math.max(unit, correct * LOWEST_SHARE);
  const below = Math.max(0, Math.min(position, Math.floor((correct - floor) / spacing + 1e-9)));

  const offsets = Array.from({ length: OPTION_COUNT }, (_, i) => i - below);
  const fixed = new Set<number>([0]);
  const reach = style.trapReach ?? TRAP_REACH;
  const trapsOffered = (style.traps ?? []).map((trap) => {
    const k = Math.round((trap - correct) / spacing);
    if (k === 0 || Math.abs(k) > reach) return false;
    if (offsets.includes(k)) {
      fixed.add(k);
      return true;
    }
    if (k < 0 && correct + k * spacing < floor - 1e-9) return false;
    // A trap beyond the window takes the place of the outermost option on its side, so the correct option keeps its letter.
    const side = offsets.filter((o) => Math.sign(o) === Math.sign(k) && !fixed.has(o));
    if (side.length === 0) return false;
    const outermost = k > 0 ? Math.max(...side) : Math.min(...side);
    offsets[offsets.indexOf(outermost)] = k;
    fixed.add(k);
    return true;
  });

  offsets.sort((a, b) => a - b);
  const options = offsets.map((k) => style.format(clean(correct + k * spacing), decimals));
  const correctIndex = offsets.indexOf(0);
  return { options, correctIndex, correct: options[correctIndex]!, trapsOffered };
}

/**
 * Four ascending options for a value worked out exactly from the figures
 * shown: the true value at three significant figures (or the finest step
 * allowed), with distractors ten rounding steps apart.
 */
export function choiceOptions(truth: number, random: Random, style: OptionStyle): GridOptions {
  return optionGrid(truth, [truth, truth], random, style, false);
}

interface Grid {
  /** What the correct option is rounded to. */
  unit: number;
  /** The gap between neighbouring options. */
  spacing: number;
  decimals: number;
}

/**
 * The tightest grid for a value: the smallest spacing that keeps every answer
 * in the band closest to the correct option, by a clear margin.
 */
function tightestGrid(truth: number, band: [number, number], finest: number, estimate: boolean): Grid {
  const fits = (unit: number, spacing: number) => {
    const correct = Math.round(truth / unit) * unit;
    const off = Math.abs(truth - correct);
    const reach = Math.max(band[1] - correct, correct - band[0], off);
    // Strictly closest by a clear margin, never a rounding hair.
    return correct > 0 && spacing / 2 >= MARGIN * reach && spacing - 2 * off >= truth * 0.006;
  };
  const decimalsOf = (unit: number) => Math.max(0, -Math.floor(Math.log10(unit) + 1e-9));
  const magnitude = Math.floor(Math.log10(truth));

  if (!estimate) {
    // Three significant figures (or the finest step), distractors whole tens of the last digit apart.
    for (let power = Math.max(magnitude - 2, Math.round(Math.log10(finest))); ; power++) {
      const unit = clean(10 ** power);
      for (const m of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
        const spacing = clean(m * 10 * unit);
        if (fits(unit, spacing)) return { unit, spacing, decimals: decimalsOf(unit) };
      }
      if (unit > truth * 100) throw new Error(`No option grid for ${truth}`);
    }
  }

  // An estimate: round spacings, each option printed to a whole fraction of the spacing (a half to a fifteenth).
  for (let power = magnitude - 3; power <= magnitude + 1; power++) {
    for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8]) {
      const spacing = clean(m * 10 ** power);
      const units = [5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01]
        .map((u) => clean(u * 10 ** power))
        .filter((u) => u >= finest - 1e-12 && Number.isInteger(Math.round((spacing / u) * 1e6) / 1e6) && spacing / u >= 2 && spacing / u <= 15);
      const unit = units.find((u) => fits(u, spacing));
      if (unit !== undefined) return { unit, spacing, decimals: decimalsOf(unit) };
    }
  }
  throw new Error(`No option grid for ${truth} in [${band[0]}, ${band[1]}]`);
}

/** Strips floating-point dust: 2.7400000000000002 -> 2.74. */
function clean(value: number): number {
  return Number(value.toPrecision(12));
}

/**
 * Four options that are words rather than values (rankings, formulas,
 * statements): the correct one and three distractors, shuffled so the
 * correct one can sit anywhere.
 */
export function shuffledOptions(correct: string, distractors: string[], random: Random): ChoiceOptions {
  const unique = [...new Set(distractors.filter((d) => d !== correct))];
  if (unique.length < OPTION_COUNT - 1) throw new Error(`Need ${OPTION_COUNT - 1} distinct distractors, got ${unique.length}`);
  const options = [correct, ...unique.slice(0, OPTION_COUNT - 1)];
  for (let i = options.length - 1; i > 0; i--) {
    const j = randomInt(random, 0, i);
    [options[i], options[j]] = [options[j]!, options[i]!];
  }
  return { options, correctIndex: options.indexOf(correct), correct };
}

/**
 * A statement maker: given whether the statement should be true, returns its
 * text and the working that decides it, or null when the data cannot support
 * a statement of that kind with a clear margin.
 */
export type StatementMaker = (wantTrue: boolean) => Statement | null;

export interface Statement {
  text: string;
  working: string;
  /** What the statement is about; two statements about the same thing would give each other away. */
  about: string;
}

export interface StatementOptions extends ChoiceOptions {
  /** One line of working per option, in option order. */
  workings: string[];
}

/**
 * Exactly one true statement and three false ones, drawn from different
 * makers where possible so the four test different readings of the data.
 */
export function statementOptions(makers: StatementMaker[], random: Random): StatementOptions {
  const order = makers.map((maker) => ({ maker, key: random.next() })).sort((a, b) => a.key - b.key).map((m) => m.maker);
  let truth: Statement | null = null;
  let truthMaker: StatementMaker | undefined;
  for (const maker of order) {
    truth = maker(true);
    truthMaker = maker;
    if (truth) break;
  }
  if (!truth) throw new Error('No true statement could be made');
  const falses: Statement[] = [];
  const used = new Set([truth.about]);
  // A first pass draws each false statement from a different kind; later passes may repeat a kind on a new subject.
  for (let round = 0; round < 12 && falses.length < OPTION_COUNT - 1; round++) {
    for (const maker of order) {
      if (falses.length >= OPTION_COUNT - 1) break;
      if (round === 0 && maker === truthMaker) continue;
      const made = maker(false);
      if (made && !used.has(made.about)) {
        used.add(made.about);
        falses.push(made);
      }
    }
  }
  if (falses.length < OPTION_COUNT - 1) throw new Error('Not enough false statements');
  const all = [truth, ...falses];
  for (let i = all.length - 1; i > 0; i--) {
    const j = randomInt(random, 0, i);
    [all[i], all[j]] = [all[j]!, all[i]!];
  }
  const options = all.map((a) => a.text);
  return { options, correctIndex: options.indexOf(truth.text), correct: truth.text, workings: all.map((a) => a.working) };
}
