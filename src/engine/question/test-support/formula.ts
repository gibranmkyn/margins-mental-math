import type { Question } from '../types';
import { listItems } from './read';

/**
 * Test support: read a formula option the way the owner would and evaluate it.
 * Grammar: + − × ÷ and parentheses, numbers with thousands commas, a trailing
 * % meaning "hundredths of", and letters or letter groups as variables.
 */
export function evaluate(formula: string, vars: Record<string, number>): number {
  const tokens = formula.match(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|[A-Za-z]+|[()+−×÷%-]/g) ?? [];
  const stripped = formula.replace(/\s+/g, '');
  if (tokens.join('') !== stripped) throw new Error(`Unreadable formula: ${formula}`);
  let at = 0;
  const peek = () => tokens[at];
  const take = () => tokens[at++]!;

  const factor = (): number => {
    const token = take();
    let value: number;
    if (token === '(') {
      value = expression();
      if (take() !== ')') throw new Error(`Unbalanced: ${formula}`);
    } else if (/^\d/.test(token)) {
      value = Number(token.replaceAll(',', ''));
    } else if (/^[A-Za-z]+$/.test(token)) {
      if (!(token in vars)) throw new Error(`Unknown letter ${token} in ${formula}`);
      value = vars[token]!;
    } else {
      throw new Error(`Unexpected ${token} in ${formula}`);
    }
    if (peek() === '%') {
      take();
      value /= 100;
    }
    return value;
  };
  const term = (): number => {
    let value = factor();
    while (peek() === '×' || peek() === '÷') value = take() === '×' ? value * factor() : value / factor();
    return value;
  };
  const expression = (): number => {
    let value = term();
    while (peek() === '+' || peek() === '−' || peek() === '-') value = take() === '+' ? value + term() : value - term();
    return value;
  };

  const result = expression();
  if (at !== tokens.length) throw new Error(`Trailing tokens in ${formula}`);
  return result;
}

/** The letter whose definition ("x = meaning") matches. */
export function letter(q: Question, meaning: RegExp): string {
  const item = listItems(q).find((i) => / = /.test(i) && meaning.test(i.split(' = ')[1]!));
  if (!item) throw new Error(`No letter defined as ${meaning} in ${q.id}`);
  return item.split(' = ')[0]!.trim();
}

/** Every letter defined in the question. */
export function letters(q: Question): string[] {
  return listItems(q)
    .filter((i) => /^[A-Za-z]+ = /.test(i))
    .map((i) => i.split(' = ')[0]!);
}

function same(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

/**
 * Judge each formula against the intended quantity at several points: the
 * values shown in the question, if any, and random positive values for every
 * letter. A formula is right only if it matches at every point.
 */
export function judgeFormulas(
  formulas: string[],
  names: string[],
  truth: (vars: Record<string, number>) => number,
  shown: Record<string, number>[] = [],
  seed = 1,
): boolean[] {
  const points = [...shown, ...randomPoints(names, 8, seed)];
  return formulas.map((formula) => points.every((vars) => same(evaluate(formula, vars), truth(vars))));
}

/**
 * Whether two formulas are algebraically different: at some random point
 * their values differ by more than 1%. Equivalent formulas agree everywhere.
 */
export function differ(a: string, b: string, names: string[]): boolean {
  return randomPoints(names, 12, 7).some((vars) => {
    const x = evaluate(a, vars);
    const y = evaluate(b, vars);
    return Math.abs(x - y) > 0.01 * Math.max(Math.abs(x), Math.abs(y));
  });
}

/** Points with every letter set to an awkward value, so coincidences are vanishingly unlikely. */
function randomPoints(names: string[], count: number, seed: number): Record<string, number>[] {
  let state = seed * 2654435761;
  const next = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  return Array.from({ length: count }, () => Object.fromEntries(names.map((n) => [n, 0.37 + next() * 9.1])));
}
