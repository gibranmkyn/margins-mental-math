import {
  APPROXIMATE,
  createSamples,
  ensureGrounded,
  evaluateBoolean,
  evaluateNumber,
  formulaToExpression,
  optionTolerance,
  optionValue,
  optionValues,
  problemsOf,
  vacuityProblem,
} from '../src/engine/question/authored-verify';
import type { Candidate } from './lib';

/**
 * The trap gate. A candidate declares the traps of its source as it reproduces them: each a
 * common slip, the wrong option it leads to, and, where one exists, a machine-checkable account
 * of how it gets there. The gate checks that every declared slip lands on a wrong option and
 * clearly not on the correct one (a question whose common mistake still gives the right answer
 * no longer tests its source's trap), and that the candidate declares as many trapped options as
 * its source has (evals/source-distractors.json), so the declaration cannot be satisfied by one
 * token trap.
 *
 *   value check    `result`: the slip's result, an expression grounded like `check.answer`;
 *                  its nearest option must be the declared one, clearly.
 *   best check     `result` with `rule` ("nearest", or "at-least" / "at-most" for a minimum or
 *                  maximum threshold: the first option at or above / at or below the result), or
 *                  `scores`: the check's scores as the slip computes them. Required when every
 *                  option is a number (thresholds, whole years); optional for names and plans.
 *   truth check    `holds` (optional): a boolean expression, true, showing what the slip makes of
 *                  the declared option ("its margin is higher": `20 > 13`). Not vacuous.
 *   formula check  `target` (optional): the formula the slip builds, in the check's symbols; it
 *                  must equal the declared option everywhere.
 */
export interface Trap {
  /** The mistake, in a few words: "forgets to annualise the monthly fee". */
  slip: string;
  /** The wrong option it leads to, exactly as written in `options`. */
  option: string;
  result?: string;
  rule?: 'nearest' | 'at-least' | 'at-most';
  scores?: string[];
  holds?: string;
  target?: string;
}

/** What each booklet question's wrong options are built from (evals/source-distractors.json). */
export interface SourceDistractors {
  kind: string;
  traps: Array<{ option: string; slip: string }>;
  notCovered: number;
  noBasis: number;
  dominated: number;
  wideGrid: boolean;
  unexplained: number;
  /**
   * Common slips that, in the booklet question itself, still land on its correct option (each
   * computed with its numbers: `working`). A candidate reproducing one of these is at parity with its
   * source; the distractors judge is told them through `sourceHas` and fails only other such slips.
   */
  slipsOnAnswer?: Array<{ slip: string; working: string }>;
  /**
   * Wrong options no common slip or pair of slips lands on that the booklet question keeps anyway (a filler):
   * the option, its kind, `note` (what the distractors judge is told, without the source's figures) and
   * `working` (the slips tried). The judge passes a candidate's filler only where its source lists one of the
   * same kind, and no more of them than the source (evals/judges/distractors.md, "Fillers").
   */
  fillers?: Array<{ option: string; kind: FillerKind; note: string; working: string }>;
}

export type FillerKind = 'ranking' | 'coarse' | 'numeric' | 'formula' | 'statement' | 'label';

/** At most this many distinct trapped options are required, whatever the source has. */
export const MAX_REQUIRED_TRAPS = 3;

/**
 * How many distinct wrong options a candidate's declared traps must reach: its source's count, at most 3.
 * Parity: a source whose analysis records no trap (every wrong option a filler, a grid or the like:
 * pst3-q14, pst3-q26) requires none. A source with no analysis at all requires 1.
 */
export function requiredTraps(source: SourceDistractors | undefined): number {
  if (!source) return 1;
  const distinct = new Set(source.traps.map((t) => t.option)).size;
  return Math.min(MAX_REQUIRED_TRAPS, distinct);
}

const CLEAR = 0.005;

function nearestOption(values: number[], result: number): number[] {
  const distances = values.map((v) => Math.abs(v - result));
  return distances.map((d, i) => [d, i] as const).sort((a, b) => a[0] - b[0]).map(([, i]) => i);
}

/** Where a slip's result lands under a rule, or undefined when it lands on no option. */
function landing(values: number[], result: number, rule: 'nearest' | 'at-least' | 'at-most'): number | undefined {
  if (rule === 'nearest') return nearestOption(values, result)[0];
  const candidates = values.map((v, i) => [v, i] as const).filter(([v]) => (rule === 'at-least' ? v >= result - 1e-9 : v <= result + 1e-9));
  if (candidates.length === 0) return undefined;
  candidates.sort((a, b) => (rule === 'at-least' ? a[0] - b[0] : b[0] - a[0]));
  return candidates[0]![1];
}

function trapProblems(c: Candidate, trap: Trap, n: number): string[] {
  const problems: string[] = [];
  const what = `trap ${n} ("${trap.slip ?? ''}")`;
  const need = (ok: boolean, message: string) => {
    if (!ok) problems.push(`${what}: ${message}`);
  };
  need(typeof trap.slip === 'string' && trap.slip.trim().split(/\s+/).length >= 3, 'describe the slip in a few words');
  const target = c.options.indexOf(trap.option);
  need(target >= 0, `"${trap.option}" is not one of the options`);
  need(target !== c.correctIndex, 'leads to the correct option: the slip must lead to a wrong one');
  if (target < 0 || target === c.correctIndex) return problems;
  const letter = (i: number) => 'ABCDE'[i] ?? '?';
  const check = c.check;
  const run = (f: () => void) => problems.push(...problemsOf(f).map((p) => `${what}: ${p}`));

  if (check.kind === 'value' || (check.kind === 'best' && trap.result !== undefined)) {
    if (trap.result === undefined) return [...problems, `${what}: a value question needs \`result\`, the slip's result`];
    run(() => {
      ensureGrounded(c, trap.result!, check.kind === 'best');
      if (!/[-+*/]/.test(trap.result!)) throw new Error(`"${trap.result}" should be a calculation, not a bare number`);
      const result = evaluateNumber(c, trap.result!);
      const values = optionValues(c.options);
      const rule = check.kind === 'value' ? 'nearest' : (trap.rule ?? 'nearest');
      if (check.kind === 'value' && trap.rule && trap.rule !== 'nearest') throw new Error('a value check reads the nearest option; `rule` applies to best checks');
      const lands = landing(values, result, rule);
      if (lands === undefined) throw new Error(`the slip gives ${result}, which reaches no option ${rule}`);
      if (lands !== target) throw new Error(`the slip gives ${result}, which leads to ${letter(lands)} (${c.options[lands]}), not ${letter(target)}`);
      // Clearly there: a small rounding of the slip's result must not move it to another option.
      for (const wobble of [1 - CLEAR, 1 + CLEAR]) {
        const moved = landing(values, result * wobble, rule);
        if (moved !== target) throw new Error(`the slip gives ${result}, on the edge between ${letter(target)} and ${letter(moved ?? target)}`);
      }
      if (rule === 'nearest') {
        const correct = values[c.correctIndex]!;
        const option = c.options[c.correctIndex]!;
        const accepted = Math.abs(correct - result) <= optionTolerance(c.options, c.correctIndex) + 1e-9 || (APPROXIMATE.test(c.prompt) && Math.abs(correct - result) <= Math.abs(result) * 0.05);
        if (accepted) throw new Error(`the slip gives ${result}, close enough to the correct option ${option} to be marked right`);
      }
    });
  } else if (check.kind === 'best' && trap.scores !== undefined) {
    run(() => {
      if (trap.scores!.length !== c.options.length) throw new Error('one score per option');
      for (const s of trap.scores!) ensureGrounded(c, s, true);
      const scores = trap.scores!.map((s) => evaluateNumber(c, s));
      const ordered = [...scores].sort((a, b) => (check.pick === 'max' ? b - a : a - b));
      const winner = scores.indexOf(ordered[0]!);
      if (winner !== target) throw new Error(`under the slip the scores ${scores} pick ${letter(winner)}, not ${letter(target)}`);
      if (Math.abs(ordered[0]! - ordered[1]!) <= Math.abs(ordered[0]!) * CLEAR) throw new Error(`under the slip the scores ${scores} pick no clear winner`);
    });
  } else if (check.kind === 'best') {
    const numeric = c.options.every((o) => problemsOf(() => optionValue(o)).length === 0);
    need(!numeric, 'every option is a number: give `result` (with `rule` for a threshold) or `scores`');
  } else if (check.kind === 'truth' && trap.holds !== undefined) {
    run(() => {
      ensureGrounded(c, trap.holds!, true);
      const vacuous = vacuityProblem(c, trap.holds!);
      if (vacuous) throw new Error(vacuous);
      if (!evaluateBoolean(c, trap.holds!)) throw new Error(`"${trap.holds}" is false: it should show what the slip makes true`);
    });
  } else if (check.kind === 'formula' && trap.target !== undefined) {
    run(() => {
      ensureGrounded(c, trap.target!);
      const option = formulaToExpression(trap.option);
      for (const sample of createSamples(c, check.symbols)) {
        const a = evaluateNumber(c, trap.target!, sample);
        const b = evaluateNumber(c, option, sample);
        if (Math.abs(a - b) > 1e-9 * Math.max(1, Math.abs(a))) throw new Error(`"${trap.target}" is not the formula of ${letter(target)}`);
      }
    });
  }
  if (check.kind !== 'best' && trap.scores !== undefined) need(false, '`scores` applies to best checks');
  if (check.kind !== 'truth' && trap.holds !== undefined) need(false, '`holds` applies to truth checks');
  if (check.kind !== 'formula' && trap.target !== undefined) need(false, '`target` applies to formula checks');
  return problems;
}

/**
 * The trap gate for one candidate: every declared trap sound, and as many trapped options as its source has.
 * A candidate of a source with no recorded trap need declare none; any it does declare must still be sound.
 */
export function trapGateProblems(c: Candidate, source: SourceDistractors | undefined): string[] {
  const declared = (c as Candidate & { traps?: unknown }).traps;
  const required = requiredTraps(source);
  if (declared !== undefined && !Array.isArray(declared)) return ['`traps` must be a list (evals/WRITING.md, "Traps")'];
  const traps = (declared ?? []) as Trap[];
  if (traps.length === 0 && required > 0) return ['declares no traps: list the source\'s traps as this candidate reproduces them (evals/WRITING.md, "Traps")'];
  const problems = traps.flatMap((t, i) => trapProblems(c, t, i + 1));
  const reached = new Set(traps.map((t) => t.option).filter((o) => c.options.indexOf(o) >= 0 && c.options.indexOf(o) !== c.correctIndex));
  if (reached.size < required) problems.push(`traps lead to ${reached.size} wrong option${reached.size === 1 ? '' : 's'}; its source has traps on ${required}`);
  return problems;
}
