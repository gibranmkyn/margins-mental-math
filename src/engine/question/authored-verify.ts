import { chartProblems } from './chart-check';
import { createRandom } from './random';
import type { ContextBlock, ScenarioSkill, Tier } from './types';

/**
 * The checks an authored question must pass, as plain functions: each either
 * throws with the reason or returns the list of problems it found. The content
 * tests run them on the authored bank; the candidate evals run the same ones on
 * questions waiting to be admitted, so both hold a question to one standard.
 */

// ---------- The content, as written in the files ----------

/** How an entry's stated answer is reproduced. Expressions are JavaScript arithmetic. */
export type Check =
  /** Options are numbers; `answer` computes the true value in the options' own unit. */
  | { kind: 'value'; answer: string }
  /** Options are choices (names, years, plans); one score per option, the best of which is correct. */
  | { kind: 'best'; pick: 'max' | 'min'; scores: string[] }
  /**
   * Options are statements; one boolean expression per option, exactly one of which holds.
   * A wrong statement the data does not cover at all (no prices given, a flow between groups
   * the survey never tracks, "main reason" read as "only reason") cannot be tested by an
   * expression: it is written `{ "notCovered": "<one-line reason>" }`, counts as not holding,
   * and is left to the blind solve and the judges. It can never be the correct option.
   */
  | { kind: 'truth'; statements: Statement[] }
  /**
   * Options are formulas in the named symbols, written as the owner sees them
   * (× ÷ − allowed). Each is evaluated at random values of the symbols and
   * compared with `target`, the quantity worked out from first principles.
   */
  | { kind: 'formula'; symbols: string[]; target: string };

/** A truth-check statement: a boolean expression over the question's numbers, or the honest marker for one the data does not cover. */
export type Statement = string | { notCovered: string };

export const isNotCovered = (s: Statement): s is { notCovered: string } => typeof s === 'object' && s !== null && 'notCovered' in s;

export interface Entry {
  id: string;
  skill: ScenarioSkill;
  tier: Tier;
  targetTimeMs?: number;
  context: ContextBlock[];
  prompt: string;
  options: string[];
  correctIndex: number;
  solution: string[];
  shortcut: string;
  check: Check;
}

export interface CheckRecord {
  /** Fingerprint of the visible text (context, prompt, options) the checker saw. */
  fingerprint: string;
  /** The option the independent checker chose, solving from the visible text only. */
  choice: number;
}

/** A booklet question as transcribed, as far as the originality check reads it. */
export interface BookletText {
  id: string;
  /** The booklet's name: "Practice booklet 1". */
  source?: string;
  caseTitle: string;
  context: Array<{ type: string; text?: string; items?: string[]; title?: string; headers?: string[]; rows?: string[][] }>;
  question: string;
  options: string[];
  explanation?: string;
  tip?: string;
}

/** A booklet exhibit as redrawn (content/exhibits), as far as the originality check reads it: the text it prints. */
export interface ExhibitText {
  id: string;
  questions: string[];
  blocks: Array<{
    title?: string;
    unit?: string;
    note?: string;
    xUnit?: string;
    text?: string;
    items?: string[];
    categories?: string[];
    series?: Array<{ name?: string }>;
    headers?: string[];
    rows?: string[][];
    barNotes?: string[];
    barNoteRows?: Array<{ name?: string; notes?: string[] }>;
    groups?: Array<{ name?: string }>;
  }>;
}

function ensure(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** The problems a check throws, as a list: empty when it passes. */
export function problemsOf(check: () => void): string[] {
  try {
    check();
    return [];
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
}

// ---------- Reading what the owner sees ----------

export function contextText(blocks: ContextBlock[]): string[] {
  return blocks.flatMap((b) => {
    switch (b.type) {
      case 'paragraph':
        return [b.text];
      case 'list':
        return b.items;
      case 'table':
        return [...(b.title ? [b.title] : []), ...b.headers, ...b.rows.flat()];
      case 'chart':
        return [
          b.title,
          b.unit,
          ...b.categories,
          ...b.series.flatMap((s) => [s.name, ...s.values.map(String)]),
          ...(b.barNotes ?? []),
          ...(b.barNoteRows ?? []).flatMap((r) => [r.name, ...r.notes]),
          ...(b.groups ?? []).map((g) => g.name),
          ...(b.xUnit ? [b.xUnit] : []),
          ...(b.x ?? []).map(String),
          ...(b.note ? [b.note] : []),
        ];
    }
  });
}

/** The data the owner is given: context and prompt, not the options. */
export function givenText(e: Entry): string[] {
  return [...contextText(e.context), e.prompt];
}

export function visibleText(e: Entry): string[] {
  return [...givenText(e), ...e.options, ...e.solution, e.shortcut];
}

const NUMBER = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;

/** Every number written in a piece of text: "$1,250.50 and 12%" -> [1250.5, 12]. */
export function numbersIn(text: string): number[] {
  return [...text.matchAll(NUMBER)].map((m) => Number(m[0].replaceAll(',', '')));
}

/** An option's one number with its sign: "−$40k" -> -40, "12.5%" -> 12.5. */
export function optionValue(option: string): number {
  const found = [...option.matchAll(NUMBER)];
  ensure(found.length === 1, `"${option}" should show exactly one number`);
  const match = found[0]!;
  const negative = /[−-]\s*[$€£]?\s*$/.test(option.slice(0, match.index));
  return (negative ? -1 : 1) * Number(match[0].replaceAll(',', ''));
}

/** An option with its number blanked out, so options can be compared for unit and scale. */
export function optionShape(option: string): string {
  return option.replace(/[−-]?\s*([$€£]?)\s*(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/, '$1#');
}

/** Scale words written after a number: "$2.5 million", "$40k", "€1.2bn". */
const SCALES: Record<string, number> = { thousand: 1e3, k: 1e3, million: 1e6, mn: 1e6, m: 1e6, billion: 1e9, bn: 1e9 };
const SCALE_AFTER_NUMBER = /#\s*(thousand|million|billion|mn|bn|m|k)(?![A-Za-z])/i;

/**
 * An option read as an amount of one unit: "$2.5 million" -> { unit: "$#", scale: 1,000,000, amount: 2,500,000 },
 * "$700,000" -> { unit: "$#", scale: 1, amount: 700,000 }. Throws unless it shows exactly one number.
 */
export function optionAmount(option: string): { unit: string; scale: number; amount: number } {
  const value = optionValue(option);
  const shape = optionShape(option);
  const word = SCALE_AFTER_NUMBER.exec(shape)?.[1];
  const scale = word ? SCALES[word.toLowerCase()]! : 1;
  // Singular and plural are one unit: "1 percentage point" beside "4 percentage points", "1 minute" beside "5 minutes".
  const unit = (word ? shape.replace(SCALE_AFTER_NUMBER, '#') : shape)
    .replace(/(?<=[a-z]{2})s\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { unit, scale, amount: value * scale };
}

/**
 * The options' values, for comparing with a calculation. When every option has one shape ("$1.2m", "$3.6m"),
 * the numbers as written, in the options' own unit. When they mix scales of one unit, as booklet question
 * pracA-q14 does ("$700,000" beside "$2.5 million"), each is read as an amount of the plain unit (dollars),
 * and a calculation must give its value in that unit. Singular and plural count as one unit ("1 minute",
 * "5 minutes", as pst3-q14 and pracC-q17 have them). Throws when the options differ in unit ("12%" beside
 * "0.5 percentage points", "$5" beside "€5") or any option cannot be read as one number.
 */
export function optionValues(options: string[]): number[] {
  if (new Set(options.map(optionShape)).size === 1) return options.map(optionValue);
  const amounts = options.map(optionAmount);
  ensure(new Set(amounts.map((a) => a.unit)).size === 1, `options differ in unit or scale: ${options}`);
  return amounts.map((a) => a.amount);
}

/** Half the last digit an option displays, in the units `optionValues` gives: "$2.5 million" beside "$700,000" -> 50,000. */
export function optionTolerance(options: string[], index: number): number {
  const option = options[index]!;
  if (new Set(options.map(optionShape)).size === 1) return halfLastDigit(option);
  return halfLastDigit(option) * optionAmount(option).scale;
}

// ---------- Evaluating calculations ----------

/** Constants a calculation may use without the question stating them: units and small counts. */
const UNIT_CONSTANTS = new Set([24, 30, 52, 60, 100, 360, 365, 1_000, 10_000, 1_000_000, 1_000_000_000]);

const LITERAL = /(?<![\w.])\d+(?:\.\d+)?(?:e\d+)?/g;

/** Literal numbers in an expression, ignoring digits inside identifiers. */
export function literalsIn(expression: string): number[] {
  return [...expression.matchAll(LITERAL)].map((m) => Number(m[0]));
}

/**
 * Every literal in a calculation must be a number the owner was given, or a
 * unit constant, so a calculation can never smuggle in its answer.
 */
export function ensureGrounded(e: Entry, expression: string, alsoOptions = false): void {
  const given = new Set([...givenText(e), ...(alsoOptions ? e.options : [])].flatMap(numbersIn));
  for (const literal of literalsIn(expression)) {
    const ok = given.has(literal) || UNIT_CONSTANTS.has(literal) || (Number.isInteger(literal) && literal <= 12);
    ensure(ok, `${e.id}: ${literal} in "${expression}" is not in the question`);
  }
}

function evaluate(expression: string, scope: Record<string, number> = {}): unknown {
  const names = Object.keys(scope);
  const fn = new Function(...names, 'abs', 'min', 'max', 'sqrt', 'log', 'pow', `"use strict"; return (${expression});`) as (
    ...args: unknown[]
  ) => unknown;
  return fn(...names.map((n) => scope[n]), Math.abs, Math.min, Math.max, Math.sqrt, Math.log, Math.pow);
}

export function evaluateNumber(e: Entry, expression: string, scope: Record<string, number> = {}): number {
  const value = evaluate(expression, scope);
  ensure(typeof value === 'number' && Number.isFinite(value), `${e.id}: "${expression}" gave ${String(value)}`);
  return value;
}

export function evaluateBoolean(e: Entry, expression: string): boolean {
  const verdict = evaluate(expression);
  ensure(typeof verdict === 'boolean', `${e.id}: "${expression}" is not true or false`);
  return verdict;
}

// ---------- Statements that test nothing ----------

/**
 * `a == b` rewritten as `__eq(a, b)` (and `!=` as `!__eq(a, b)`), so a test of equality can be
 * evaluated with a tolerance. A small splitter, enough for the arithmetic checks use: it splits at
 * `&&`, `||`, `?`, `:` and commas outside parentheses (all bind more loosely than `==`) and recurses
 * into parentheses.
 */
function tolerantEquality(source: string): string {
  const parts: string[] = [];
  const seps: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (depth === 0) {
      const two = source.slice(i, i + 2);
      if (two === '&&' || two === '||') {
        parts.push(source.slice(start, i));
        seps.push(two);
        start = i + 2;
        i++;
      } else if (ch === '?' || ch === ':' || ch === ',') {
        parts.push(source.slice(start, i));
        seps.push(ch);
        start = i + 1;
      }
    }
  }
  parts.push(source.slice(start));
  return parts.map(equalitySegment).reduce((acc, part, i) => acc + (i > 0 ? seps[i - 1] : '') + part, '');
}

function equalitySegment(segment: string): string {
  let inner = '';
  let depth = 0;
  let open = -1;
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i]!;
    if (ch === '(') {
      if (depth === 0) open = i;
      depth++;
    } else if (ch === ')') {
      depth--;
      if (depth === 0) inner += `(${tolerantEquality(segment.slice(open + 1, i))})`;
    } else if (depth === 0) inner += ch;
  }
  depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!;
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (depth === 0 && (ch === '=' || ch === '!') && inner[i + 1] === '=' && !'<>='.includes(inner[i - 1] ?? '')) {
      const width = inner[i + 2] === '=' ? 3 : 2;
      return `${ch === '!' ? '!' : ''}__eq(${inner.slice(0, i)}, ${inner.slice(i + width)})`;
    }
  }
  return inner;
}

/** Multipliers tried on each figure: log-spaced from a thousandth to a thousand times, about 1.2% apart. */
const PERTURBATIONS = Array.from({ length: 1201 }, (_, i) => 10 ** (-3 + i / 200));

/** The comparisons a statement joins with `&&` and `||` (outside parentheses, and inside a part wholly in parentheses). */
function atomsOf(expression: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < expression.length; i++) {
    const ch = expression[i]!;
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (depth === 0 && (expression.slice(i, i + 2) === '&&' || expression.slice(i, i + 2) === '||')) {
      parts.push(expression.slice(start, i));
      start = i + 2;
      i++;
    }
  }
  parts.push(expression.slice(start));
  return parts.flatMap((raw) => {
    const part = raw.trim().replace(/^!\s*/, '');
    if (part.startsWith('(') && part.endsWith(')')) {
      let d = 0;
      const wrapped = [...part].every((ch, i) => ((d += ch === '(' ? 1 : ch === ')' ? -1 : 0), d > 0 || i === part.length - 1));
      if (wrapped) {
        const inner = part.slice(1, -1);
        const atoms = atomsOf(inner);
        return atoms.length > 1 ? atoms : [inner];
      }
    }
    return [part];
  });
}

/** Whether an expression's verdict changes for some other value of one of its figures; undefined when it is not a true/false test. */
function dependsOnData(expression: string, figures: number[]): boolean | undefined {
  const used = figures.filter((n) => literalsIn(expression).includes(n));
  const names = used.map((_, i) => `__f${i}`);
  const body = tolerantEquality(
    expression.replace(LITERAL, (m) => {
      const k = used.indexOf(Number(m));
      return k >= 0 ? names[k]! : m;
    }),
  );
  // A surrogate of the comparison that changes wherever the comparison can: `a == b` read as
  // `a >= b` and `abs(x)` as `x`, so that a test of equality, or of being within a tolerance,
  // shows as a change of side instead of a point the scan might step over.
  const surrogateEq = (a: unknown, b: unknown) => (typeof a === 'number' && typeof b === 'number' ? a >= b : a === b);
  let fn: (...args: unknown[]) => unknown;
  try {
    fn = new Function(...names, '__eq', 'abs', 'min', 'max', 'sqrt', 'log', 'pow', `"use strict"; return (${body});`) as (...args: unknown[]) => unknown;
  } catch {
    return undefined;
  }
  const run = (values: number[]) => {
    try {
      return fn(...values, surrogateEq, (x: number) => x, Math.min, Math.max, Math.sqrt, Math.log, Math.pow);
    } catch {
      return undefined;
    }
  };
  const base = run(used);
  if (typeof base !== 'boolean') return undefined;
  for (let k = 0; k < used.length; k++) {
    for (const f of PERTURBATIONS) {
      const verdict = run(used.map((v, i) => (i === k ? v * f : v)));
      if (typeof verdict === 'boolean' && verdict !== base) return true;
    }
  }
  return false;
}

/**
 * Why a boolean expression tests nothing, or undefined when it does test the data. A statement
 * must test a figure from the question (not only 0, 1 and unit constants), use no `true`/`false`
 * and no multiplication by zero, and each comparison it joins with `&&` or `||` must give a
 * different verdict for some other value of one of its figures: each figure (every occurrence at
 * once) is scaled from a thousandth to a thousand times, with `a == b` watched as `a >= b` and
 * `abs(x) < t` as `x < t`, so that a test of equality or closeness shows as a change of side. `false && ...`, `0 > 1`, `70 * 0 == 70`, `20 == 0` and `x * 2 > x`
 * are caught; `29 < 22` (two figures compared) is not: whether a comparison of real figures is the
 * right test for its option is left to the blind solve and the judges.
 */
export function vacuityProblem(e: Entry, expression: string, alsoOptions = true): string | undefined {
  if (/\b(?:true|false)\b/.test(expression)) return `"${expression}" uses true or false instead of testing the data`;
  if (/(?<![\w.])0(?![\w.])\s*\*|\*\s*0(?![\w.])/.test(expression)) return `"${expression}" multiplies by zero`;
  const given = new Set([...givenText(e), ...(alsoOptions ? e.options : [])].flatMap(numbersIn));
  const figures = [...new Set(literalsIn(expression))].filter((n) => given.has(n) && n !== 0 && n !== 1);
  if (figures.length === 0) return `"${expression}" tests no figure from the question`;
  for (const atom of atomsOf(expression)) {
    if (dependsOnData(atom, figures) === false) return `"${atom.trim()}" in "${expression}" gives the same verdict whatever the data: it tests nothing`;
  }
  return undefined;
}

/** An option formula as written for the owner, as JavaScript: "(p − c) × 1,000 ÷ l" -> "(p - c) * 1000 / l", "^" a power, "2%" a hundredth of 2. */
export function formulaToExpression(option: string): string {
  return option
    .replace(/(\d),(\d{3})/g, '$1$2')
    .replace(/(\d+(?:\.\d+)?)%/g, '($1 / 100)')
    .replaceAll('×', '*')
    .replaceAll('÷', '/')
    .replaceAll('^', '**')
    .replace(/[−–]/g, '-');
}

/**
 * Approximate wording lets the correct option sit a little way from the true value: closest,
 * nearest, approximate(ly), approximates, roughly; "about" or "around" only before a number or
 * "how"/"what" ("about how many", "about 20%"), never as a preposition ("a conclusion about the
 * data", "concerned about"); "estimate" only as an instruction or with best/closest/rough ("estimate
 * the", "the best estimate"), never as a noun in the data ("the council's estimate of 150,000").
 * The authored bank's prompts match this exactly as they matched the looser rule it replaced.
 */
export const APPROXIMATE =
  /\b(?:closest|nearest|approximat\w*|roughly)\b|\b(?:about|around)\s+(?:how|what|[$€£]?\d)|\bestimate\s+(?:the|how|what)\b|\b(?:best|closest|rough|good)\s+estimate\b/i;

/** Half of an option's last displayed digit: "$1.2m" -> 0.05, "3,600" -> 0.5. */
export function halfLastDigit(option: string): number {
  const match = /\d+(?:\.(\d+))?(?!.*\d)/.exec(option.replaceAll(',', ''));
  const decimals = match?.[1]?.length ?? 0;
  return 0.5 * 10 ** -decimals;
}

/** Random values of a formula's symbols at which formulas are compared: 24 samples, fixed per entry. */
export function createSamples(e: Entry, symbols: string[]): Array<Record<string, number>> {
  const random = createRandom(e.id.length * 7919 + e.options.join('').length);
  return Array.from({ length: 24 }, () => Object.fromEntries(symbols.map((s) => [s, Math.round((1 + random.next() * 98) * 100) / 100])));
}

/** Throws unless the entry's calculation reproduces its stated answer from numbers the owner can see. */
export function verifyCalculation(e: Entry): void {
  const { check } = e;
  switch (check.kind) {
    case 'value': {
      ensureGrounded(e, check.answer);
      ensure(/[-+*/]/.test(check.answer), `${e.id}: a calculation, not a bare number`);
      const truth = evaluateNumber(e, check.answer);
      const values = optionValues(e.options);
      const distances = values.map((v) => Math.abs(v - truth));
      const best = Math.min(...distances);
      const correct = values[e.correctIndex]!;
      ensure(distances.indexOf(best) === e.correctIndex, `${e.id}: truth ${truth}, options ${e.options}`);
      const runnerUp = Math.min(...distances.filter((_, i) => i !== e.correctIndex));
      ensure(runnerUp - best > Math.abs(truth) * 0.005, `${e.id}: truth ${truth}, options ${e.options} — no clear closest option`);
      // The stated answer is the true value as displayed, or, where the prompt asks for the closest, within 5%.
      const asDisplayed = Math.abs(correct - truth) <= optionTolerance(e.options, e.correctIndex) + 1e-9;
      const nearEnough = APPROXIMATE.test(e.prompt) && Math.abs(correct - truth) <= Math.abs(truth) * 0.05;
      ensure(asDisplayed || nearEnough, `${e.id}: truth ${truth} vs stated ${e.options[e.correctIndex]}`);
      break;
    }
    case 'best': {
      ensure(check.scores.length === e.options.length, `${e.id}: one score per option`);
      for (const score of check.scores) ensureGrounded(e, score, true);
      const scores = check.scores.map((s) => evaluateNumber(e, s));
      const ordered = [...scores].sort((a, b) => (check.pick === 'max' ? b - a : a - b));
      const winner = scores.indexOf(ordered[0]!);
      ensure(winner === e.correctIndex, `${e.id}: scores ${scores}`);
      ensure(Math.abs(ordered[0]! - ordered[1]!) > Math.abs(ordered[0]!) * 0.005, `${e.id}: scores ${scores} — winner not clear`);
      break;
    }
    case 'truth': {
      ensure(check.statements.length === e.options.length, `${e.id}: one statement per option`);
      const verdicts = check.statements.map((s, i) => {
        if (isNotCovered(s)) {
          const reason = typeof s.notCovered === 'string' ? s.notCovered.trim() : '';
          ensure(reason.split(/\s+/).length >= 3 && !reason.includes('\n'), `${e.id}: option ${i + 1} is marked notCovered without a one-line reason`);
          ensure(i !== e.correctIndex, `${e.id}: the correct option cannot be one the data does not cover`);
          return false;
        }
        ensure(typeof s === 'string', `${e.id}: statement ${i + 1} is neither an expression nor { "notCovered": "..." }`);
        // A statement may test the numbers it states itself.
        ensureGrounded(e, s, true);
        ensure(literalsIn(s).length > 0, `${e.id}: "${s}" should test the data`);
        const vacuous = vacuityProblem(e, s);
        ensure(!vacuous, `${e.id}: ${vacuous}; if the data does not cover this option, write { "notCovered": "<why>" }`);
        return evaluateBoolean(e, s);
      });
      ensure(verdicts.filter(Boolean).length === 1, `${e.id}: verdicts ${verdicts} — exactly one statement must hold`);
      ensure(verdicts.indexOf(true) === e.correctIndex, `${e.id}: the statement that holds is not the stated answer`);
      break;
    }
    case 'formula': {
      ensureGrounded(e, check.target);
      const samples = createSamples(e, check.symbols);
      const formulas = e.options.map(formulaToExpression);
      for (const formula of formulas) {
        const unknown = (formula.match(/[A-Za-z_]\w*/g) ?? []).filter((name) => !check.symbols.includes(name));
        ensure(unknown.length === 0, `${e.id}: "${formula}" uses symbols not listed`);
        ensureGrounded(e, formula);
      }
      const agrees = (formula: string, sample: Record<string, number>) => {
        const target = evaluateNumber(e, check.target, sample);
        const value = evaluateNumber(e, formula, sample);
        return Math.abs(value - target) <= 1e-9 * Math.max(1, Math.abs(target));
      };
      formulas.forEach((formula, i) => {
        const matches = samples.filter((sample) => agrees(formula, sample)).length;
        if (i === e.correctIndex) ensure(matches === samples.length, `${e.id}: the correct formula must equal the target`);
        // A distractor must not be the target in disguise: it differs almost everywhere.
        else ensure(matches <= 1, `${e.id}: "${e.options[i]}" is equivalent to the target`);
      });
      break;
    }
  }
}

// ---------- Structure ----------

/** As for generated questions, except that a decimal may end a sentence ("rose to 2.5."); "1.2.3" is still malformed. */
const MALFORMED = /NaN|undefined|null|Infinity|\d[eE][+-]?\d|(?<![\d.,])0\d|\d,(?=\d)(?!\d{3}(?!\d))|\.\d+\.\d|-0(?![.\d])/;

/** A scenario with data, four or five distinct options, a worked solution and a shortcut. */
export function structureProblems(e: Entry, scenarioSkills: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  const need = (condition: boolean, message: string) => {
    if (!condition) problems.push(`${e.id}: ${message}`);
  };
  need(scenarioSkills.has(e.skill), `${e.skill} is not a scenario skill`);
  need([1, 2, 3].includes(e.tier), `tier ${e.tier}`);
  need(e.context.length > 0, 'no context');
  need(e.prompt.trim().length > 10, 'prompt too short');
  need(e.options.length >= 4 && e.options.length <= 5, `${e.options.length} options`);
  need(new Set(e.options).size === e.options.length, 'options repeat');
  need(Number.isInteger(e.correctIndex) && e.correctIndex >= 0 && e.correctIndex < e.options.length, `correctIndex ${e.correctIndex}`);
  need(e.solution.length >= 2, 'a worked solution needs at least two steps');
  need(e.shortcut.trim().length > 10, 'shortcut too short');
  e.context.forEach((block, i) => {
    if (block.type === 'table') for (const row of block.rows) need(row.length === block.headers.length, 'ragged table');
    if (block.type === 'chart') problems.push(...chartProblems(block, `${e.id} chart ${i + 1}`));
  });
  for (const text of visibleText(e)) need(!MALFORMED.test(text), `malformed number in "${text}"`);
  return problems;
}

/** The fields a bank entry may carry: what the app or the bank's tests read. A candidate's `traps` are stripped on admission. */
export const BANK_FIELDS: readonly string[] = ['id', 'skill', 'tier', 'targetTimeMs', 'context', 'prompt', 'options', 'correctIndex', 'solution', 'shortcut', 'check', 'modelledOn'];

/**
 * A bank entry's id and fields: `au-NNN` for a question written free, `bk-<booklet question>-<letter>` naming
 * its `modelledOn` for one modelled on a booklet question, and no field the app or the bank's tests do not read
 * (`extraFields` adds fields allowed before admission, such as a candidate's `traps`).
 */
export function bankFieldProblems(e: Entry & { modelledOn?: string }, extraFields: readonly string[] = []): string[] {
  const problems: string[] = [];
  const allowed = new Set([...BANK_FIELDS, ...extraFields]);
  for (const key of Object.keys(e)) if (!allowed.has(key)) problems.push(`${e.id}: field ${key} is not one the bank keeps`);
  if (e.modelledOn === undefined) {
    if (!/^au-\d{3}$/.test(e.id)) problems.push(`${e.id}: not an au-NNN id`);
  } else if (!/^bk-[A-Za-z0-9]+-q\d+-[a-z]+$/.test(e.id) || !e.id.startsWith(`bk-${e.modelledOn}-`)) {
    problems.push(`${e.id}: not a bk-<booklet question>-<letter> id naming ${e.modelledOn}`);
  }
  return problems;
}

/**
 * Numeric options share one unit, show distinct values and (for the authored bank) run in ascending
 * order. They may mix scales of that unit where each reads unambiguously as an amount ("$700,000"
 * beside "$2.5 million", as booklet question pracA-q14 has them: `optionValues`); options in different
 * units, or that do not read as one number each, are rejected. Candidates modelled on booklet questions
 * use `unorderedNumericOptionProblems`: the booklets do not always order their options, and forcing it
 * is a measurable tell.
 */
export function numericOptionProblems(e: Entry): string[] {
  return optionValueProblems(e, true);
}

/** As `numericOptionProblems`, without the ascending order: for candidates modelled on booklet questions. */
export function unorderedNumericOptionProblems(e: Entry): string[] {
  return optionValueProblems(e, false);
}

function optionValueProblems(e: Entry, ascending: boolean): string[] {
  if (e.check.kind !== 'value') return [];
  return problemsOf(() => {
    const values = (() => {
      try {
        return optionValues(e.options);
      } catch {
        throw new Error(`${e.id}: options differ in unit or scale: ${e.options}`);
      }
    })();
    ensure(new Set(values).size === values.length, `${e.id}: two options show the same value: ${e.options}`);
    if (ascending)
      ensure(
        values.every((v, i) => i === 0 || v > values[i - 1]!),
        `${e.id}: options not in ascending order: ${e.options}`,
      );
  });
}

// ---------- Fingerprints for the independent-check record ----------

/** FNV-1a over the visible text, as hex. The checker's record must carry the same value. */
export function fingerprint(e: Entry): string {
  const text = JSON.stringify({ context: e.context, prompt: e.prompt, options: e.options });
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** The problem with an entry's independent check, if any: missing, stale or in disagreement. */
export function independentCheckProblems(e: Entry, checks: Record<string, CheckRecord>): string[] {
  const record = checks[e.id];
  if (!record) return [`${e.id}: never independently checked`];
  if (record.fingerprint !== fingerprint(e)) return [`${e.id}: changed since its check, ${fingerprint(e)}`];
  if (record.choice !== e.correctIndex) return [`${e.id}: checker chose ${record.choice}, bank says ${e.correctIndex}`];
  return [];
}

// ---------- Originality against the booklets ----------

function bookletText(q: BookletText): string[] {
  const context = q.context.flatMap((b) => [b.text ?? '', ...(b.items ?? []), b.title ?? '', ...(b.headers ?? []), ...(b.rows ?? []).flat()]);
  return [q.caseTitle, ...context, q.question, ...q.options, q.explanation ?? '', q.tip ?? ''];
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9%$€£\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

const PHRASE_LENGTH = 8;

/** Every run of eight words in the texts. */
export function phrases(texts: string[]): Set<string> {
  const result = new Set<string>();
  for (const text of texts) {
    const w = words(text);
    for (let i = 0; i + PHRASE_LENGTH <= w.length; i++) result.add(w.slice(i, i + PHRASE_LENGTH).join(' '));
  }
  return result;
}

/** Ordinary English words that appear in booklet case titles; the names around them are what must not be reused. */
const ORDINARY_TITLE_WORDS = new Set(
  'saint hospital energy data learning capital innovation national public private partnerships modern art gallery service property tax inc ltd basketball league bakery imagine garbage shrimp shack practice set official sample'.split(
    ' ',
  ),
);

/** Company, product and person names in the booklets: case titles, their unusual words, and CamelCase brands. */
function bookletNames(booklets: BookletText[]): Set<string> {
  const names = new Set<string>(['McKinsey', 'BCG', 'MCP', 'PST']);
  for (const q of booklets) {
    const title = q.caseTitle.replace(/\(.*\)/, '').replace(/,?\s*(Inc\.|ltd\.)$/, '').trim();
    names.add(title);
    for (const word of title.split(/[\s,]+/)) {
      if (word.length > 2 && !ORDINARY_TITLE_WORDS.has(word.toLowerCase().replace(/[.,]$/, ''))) names.add(word);
    }
    for (const text of bookletText(q)) {
      // CamelCase brands (say, AcmeWorks) and invented names with a capital mid-sentence.
      for (const m of text.matchAll(/\b[A-Z][a-z]+[A-Z][A-Za-z]*\b/g)) names.add(m[0]);
    }
  }
  return names;
}

/** Figures distinctive enough to identify a booklet question: three or more significant digits. */
export function distinctiveFigures(texts: string[]): Set<number> {
  const figures = new Set<number>();
  for (const n of texts.flatMap(numbersIn)) {
    const digits = String(n).replace('.', '').replace(/^0+/, '').replace(/0+$/, '');
    if (digits.length >= 3 && !(n >= 1990 && n <= 2035 && Number.isInteger(n))) figures.add(n);
  }
  return figures;
}

/**
 * What of the booklets a question must not reuse: their eight-word phrases (questions and redrawn exhibits), their
 * whole short sentences and titles, their names, their distinctive figures.
 */
export interface BookletIndex {
  /** Every eight-word run of a booklet question or a redrawn exhibit, stock stems left out, with the booklet question it is in. */
  phrases: Map<string, string>;
  /** Whole booklet sentences and titles shorter than eight words that are not generic (`wholeUnits`), by their words. */
  wholes: Map<string, { id: string; text: string }>;
  /** Company, product and person names, and the test-makers' names (McKinsey, BCG, MCP, PST): matched as whole words, case kept. */
  names: Set<string>;
  /** Booklet names ("Practice booklet 1") and case titles, with and without their bracket: matched as whole words, any case. */
  titles: Set<string>;
  figures: Array<{ id: string; figures: Set<number> }>;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wholeWord = (s: string, flags = '') => new RegExp(`(?<![\\w])${escapeRegExp(s)}(?![\\w])`, flags);

/** The booklet names and case titles one piece of text carries: one rule for the originality gate and the review page. */
export function bookletNamesIn(text: string, index: BookletIndex): string[] {
  return [...[...index.names].filter((n) => wholeWord(n).test(text)), ...[...index.titles].filter((t) => wholeWord(t, 'i').test(text))];
}

/**
 * The test-writers' stock question stems, which several booklets share word for word
 * ("Which of the following statements is a valid conclusion, based on the data
 * presented in Table 1 and Exhibit 1?"). They identify no booklet question, so an
 * authored question may use them: their eight-word phrases are left out of the
 * index. Each stem is expanded for Table and Exhibit 1 to 4. Anything after the
 * stem ("closest to the average cost") is still checked.
 */
const STOCK_STEMS = [
  'Which of the following statements is a valid conclusion, based on the data presented in Table 1 and Exhibit 1?',
  'Which of the following statements is a valid conclusion about the data presented in Table 1?',
  'Which of the following statements is true, based on the information provided in Table 1?',
  'Which of the following statements is false, based on the information provided in Table 1?',
  'Which of the following statements can be concluded from the data in Table 1?',
  'Which of the following statements can be concluded based on the information provided in Table 1?',
  'Which of the following cannot be concluded from the information presented in Table 1?',
  'Which of the following can be determined from the information provided in Table 1?',
  'Which of the following statements is most accurate regarding the data in Table 1?',
  'Based on the data presented in Table 1 and Exhibit 1, which of the following statements is true?',
  'Which of the following figures is closest to the',
  'Which of the following values best approximates the',
  'Which of the following lists is the best ranking of the',
  'Which of the following would be the minimum',
  'to the nearest tenth of a percentage point',
];

/** Every stock stem, expanded for Table and Exhibit 1 to 4. */
function stockVariants(): string[] {
  return STOCK_STEMS.flatMap((stem) =>
    [1, 2, 3, 4].flatMap((n) => [stem.replaceAll('Table 1', `Table ${n}`), stem.replaceAll('Table 1', `Exhibit ${n}`)]).flatMap((s) =>
      [1, 2, 3, 4].map((n) => s.replaceAll('Exhibit 1', `Exhibit ${n}`)),
    ),
  );
}

/** Every piece of text a redrawn exhibit prints: titles, unit lines, notes, labels, cells. */
function exhibitText(x: ExhibitText): string[] {
  return x.blocks.flatMap((b) => [
    b.title ?? '',
    b.unit ?? '',
    b.note ?? '',
    b.xUnit ?? '',
    b.text ?? '',
    ...(b.items ?? []),
    ...(b.categories ?? []),
    ...(b.series ?? []).map((s) => s.name ?? ''),
    ...(b.headers ?? []),
    ...(b.rows ?? []).flat(),
    ...(b.barNotes ?? []),
    ...(b.barNoteRows ?? []).flatMap((r) => [r.name ?? '', ...(r.notes ?? [])]),
    ...(b.groups ?? []).map((g) => g.name ?? ''),
  ]);
}

/**
 * Sentences, split as the app splits a booklet explanation into worked steps (booklets.ts, `steps`): at a full stop,
 * question or exclamation mark followed by a space and a capital, digit or sign, not after an abbreviation.
 */
function sentencesOf(text: string): string[] {
  return text
    .split(/(?<!\b(?:vs|e\.g|i\.e|approx|Inc|ltd|etc)\.)(?<=[.!?])\s+(?=[A-Z0-9$€£(−-])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** The exhibit number before a title ("Exhibit 3:", "Table 1 (Company B):", "Doc 2:", "Exhibits 1 and 2:", "Chart A (chart):"), and the transcriber's notes in brackets. */
const TITLE_PREFIX = /^(?:[Ee]xhibits?|[Tt]ables?|[Dd]ocs?|[Ff]igures?|[Cc]harts?)\s+(?:\d+[a-z]?|[A-Z])\b[^:]{0,40}:\s*/;
const TRANSCRIBER_BRACKET = /\s*\((?:chart|approximate|extract)\b[^)]*\)/gi;

/** A title as the booklet's own words: no exhibit number, no transcriber's bracket. "Exhibit 3: Average first season spend" -> "Average first season spend". */
export function titleWords(title: string): string {
  return title.replace(TRANSCRIBER_BRACKET, '').replace(TITLE_PREFIX, '').trim();
}

/** Words that carry wording: not numbers, symbols or single letters ("Country D", "Quintile 5", "2010-2013", "$m" carry one word or none). */
const countedWords = (text: string): number => words(text).filter((w) => /[a-z]/.test(w) && w.replace(/[^a-z]/g, '').length > 1).length;

/** Fewest counted words for a whole booklet title or note, and for a whole booklet sentence, to be matched exactly. */
export const WHOLE_TITLE_WORDS = 3;
export const WHOLE_SENTENCE_WORDS = 6;

/**
 * The booklets' whole short sentences and titles, matched exactly (as a run of words, case and punctuation ignored)
 * even though they are shorter than the eight-word run: a booklet sentence of six or seven words ("Demand tracks
 * rainfall times the weather index.") or an exhibit title ("Exhibit 3: Average first season spend") identifies the
 * booklet as well as eight words of a paragraph do. Sentences are those of the booklet questions' paragraphs, list
 * items, questions, explanations (the served worked steps) and tips; titles are table and exhibit titles and the
 * redrawn exhibits' notes. Left out as generic, so allowed:
 * - a title or note with fewer than three words that carry wording, once its exhibit number is dropped ("Exhibit 1",
 *   "Exhibit 2: Colour", "Customer quintiles", "Index, Q1 2019 = 100", "2016-2019");
 * - a sentence with fewer than six such words ("Region D is largest.", "B is the false statement.", "So 12% is the
 *   lowest option.");
 * - an equation, any text with "=" ("Cost = volume × unit price", "Expected cost = probability × cost"): notation;
 * - anything inside a stock stem ("Which of the following statements is true?");
 * - unit lines ("Revenue, $m", "% of all respondents", "US$ per customer") and labels (table cells and headers,
 *   chart categories and series names, options): what the source's structure dictates, as the variety check treats them.
 * Eight-word runs of all of these are still in the phrase index.
 */
function wholeUnits(booklets: BookletText[], exhibits: ExhibitText[]): Map<string, { id: string; text: string }> {
  const stock = stockVariants().map((s) => ` ${words(s).join(' ')} `);
  const units = new Map<string, { id: string; text: string }>();
  const add = (id: string, text: string, kind: 'title' | 'sentence') => {
    const own = kind === 'title' ? titleWords(text) : text;
    const w = words(own);
    if (w.length === 0 || w.length >= PHRASE_LENGTH) return;
    if (own.includes('=')) return;
    if (countedWords(own) < (kind === 'title' ? WHOLE_TITLE_WORDS : WHOLE_SENTENCE_WORDS)) return;
    const key = w.join(' ');
    if (stock.some((s) => s.includes(` ${key} `))) return;
    if (!units.has(key)) units.set(key, { id, text: own });
  };
  for (const q of booklets) {
    for (const b of q.context) {
      if (b.text) for (const s of sentencesOf(b.text)) add(q.id, s, 'sentence');
      for (const item of b.items ?? []) for (const s of sentencesOf(item)) add(q.id, s, 'sentence');
      if (b.title) add(q.id, b.title, 'title');
    }
    for (const text of [q.question, q.explanation ?? '', q.tip ?? '']) for (const s of sentencesOf(text)) add(q.id, s, 'sentence');
  }
  for (const x of exhibits) {
    const id = x.questions[0] ?? x.id;
    for (const b of x.blocks) {
      if (b.title) add(id, b.title, 'title');
      if (b.note) add(id, b.note, 'title');
      for (const text of [b.text ?? '', ...(b.items ?? [])]) for (const s of sentencesOf(text)) add(id, s, 'sentence');
    }
  }
  return units;
}

/**
 * The booklets' text as the originality gate reads it. `exhibits` are the redrawn exhibits (content/exhibits): their
 * titles, unit lines, notes and labels are booklet text the questions show, so their eight-word runs and whole titles
 * are indexed beside the transcription's.
 */
export function indexBooklets(booklets: BookletText[], exhibits: ExhibitText[]): BookletIndex {
  const bookletPhrases = new Map<string, string>();
  const stock = phrases(stockVariants());
  for (const q of booklets) for (const p of phrases(bookletText(q))) if (!stock.has(p)) bookletPhrases.set(p, q.id);
  for (const x of exhibits) for (const p of phrases(exhibitText(x))) if (!stock.has(p) && !bookletPhrases.has(p)) bookletPhrases.set(p, x.questions[0] ?? x.id);
  return {
    phrases: bookletPhrases,
    wholes: wholeUnits(booklets, exhibits),
    names: bookletNames(booklets),
    titles: new Set(
      booklets.flatMap((q) => [...(q.source ? [q.source] : []), q.caseTitle, q.caseTitle.replace(/\(.*\)/, '').trim()]).filter((t) => t.length > 0),
    ),
    figures: booklets.map((q) => ({ id: q.id, figures: distinctiveFigures(bookletText(q)) })),
  };
}

/**
 * The booklet wording one piece of text carries: each eight-word run in the phrase index, and each whole booklet
 * sentence or title it contains as a run of words. One rule for the originality gate (each string of a question) and
 * for the review page, which withholds such a string and searches its finished page with it (evals/review.eval.ts).
 */
export function bookletWording(text: string, index: BookletIndex): Array<{ kind: 'phrase' | 'whole'; words: string; id: string; text: string }> {
  const found: Array<{ kind: 'phrase' | 'whole'; words: string; id: string; text: string }> = [];
  const w = words(text);
  for (const p of phrases([text])) {
    const id = index.phrases.get(p);
    if (id !== undefined) found.push({ kind: 'phrase', words: p, id, text: p });
  }
  const seen = new Set<string>();
  for (let length = 1; length < PHRASE_LENGTH; length++) {
    for (let i = 0; i + length <= w.length; i++) {
      const key = w.slice(i, i + length).join(' ');
      const unit = index.wholes.get(key);
      if (unit && !seen.has(key)) {
        seen.add(key);
        found.push({ kind: 'whole', words: key, id: unit.id, text: unit.text });
      }
    }
  }
  return found;
}

/**
 * Booklet wording, names or figures the entry copies. Wording is checked string by string (a paragraph, a title, a
 * unit line, a label, an option, a solution step): eight-word runs, and whole booklet sentences and titles.
 */
export function originalityProblems(e: Entry, index: BookletIndex): string[] {
  const problems: string[] = [];
  const texts = visibleText(e);
  const reported = new Set<string>();
  for (const text of texts) {
    for (const m of bookletWording(text, index)) {
      if (reported.has(m.words)) continue;
      reported.add(m.words);
      problems.push(m.kind === 'phrase' ? `${e.id} copies "${m.words}" (${m.id})` : `${e.id} repeats a whole booklet title or sentence, "${m.text}" (${m.id})`);
    }
  }
  for (const name of new Set(bookletNamesIn(texts.join(' '), index))) problems.push(`${e.id} uses the booklet name ${name}`);
  const figures = distinctiveFigures(givenText(e));
  for (const q of index.figures) {
    const shared = [...figures].filter((f) => q.figures.has(f));
    if (shared.length > 2) problems.push(`${e.id} shares figures ${shared} with ${q.id}`);
  }
  return problems;
}
