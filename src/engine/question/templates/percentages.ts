import { formatNumber as f } from '../format';
import { randomInt } from '../random';
import type { Random } from '../random';
import type { Tier } from '../types';
import { gcd, pick } from './arithmetic';
import type { QuestionBody, Template } from './template';

/**
 * Simple percentages, always marked exactly.
 * Tier 1: a round percentage of a two- or three-digit number.
 * Tier 2: an unround whole percentage of a larger number.
 * Tier 3: either a half-percent such as 37.5% of a large number, or one
 * number as a percentage of another.
 */
export const percentages: Template = {
  skill: 'percentages',
  tiers: [1, 2, 3],
  build(tier, random) {
    if (tier === 1) return percentOf(tier, roundCase(random), roundShortcut);
    if (tier === 2) return percentOf(tier, unroundCase(random), splitShortcut);
    return random.next() < 0.5 ? percentOf(tier, halfCase(random), fractionShortcut) : asPercentOf(random);
  },
};

const TARGET_MS: Record<Tier, number> = { 1: 8000, 2: 15000, 3: 20000 };

const ROUND = [1, 5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90] as const;
const HALVES = [2.5, 7.5, 12.5, 17.5, 22.5, 37.5, 62.5, 87.5] as const;

type Case = { p: number; n: number };

/** The smallest whole number that p% of always leaves whole: 100 / gcd(p, 100), halves included. */
function wholeStep(p: number): number {
  const [top, bottom] = asFraction(p);
  return bottom / gcd(top, bottom);
}

/** p% as a fraction in lowest terms: 37.5% -> [3, 8]. */
function asFraction(p: number): [number, number] {
  const top = Math.round(p * 10);
  const divisor = gcd(top, 1000);
  return [top / divisor, 1000 / divisor];
}

/** A multiple of `step` in [min, max]. */
function multipleIn(random: Random, step: number, min: number, max: number): number {
  return step * randomInt(random, Math.ceil(min / step), Math.floor(max / step));
}

function roundCase(random: Random): Case {
  const p = pick(random, ROUND);
  return { p, n: multipleIn(random, wholeStep(p), 40, 990) };
}

function unroundCase(random: Random): Case {
  let p = randomInt(random, 3, 97);
  while (p % 5 === 0) p = randomInt(random, 3, 97);
  return { p, n: multipleIn(random, wholeStep(p), 200, 9_900) };
}

function halfCase(random: Random): Case {
  const p = pick(random, HALVES);
  return { p, n: multipleIn(random, wholeStep(p), 1_000, 24_000) };
}

function percentOf(tier: Tier, { p, n }: Case, shortcut: (p: number, n: number, answer: number) => string): QuestionBody {
  const answer = Math.round((p * n) / 100);
  const onePercent = n / 100;
  return {
    targetTimeMs: TARGET_MS[tier],
    prompt: `${f(p)}% of ${f(n)}`,
    context: [],
    answer: { kind: 'numeric', value: answer, marking: { mode: 'exact' }, unit: '' },
    solution: [`1% of ${f(n)} = ${f(n)} ÷ 100 = ${f(onePercent)}`, `${f(p)}% = ${f(p)} × ${f(onePercent)} = ${f(answer)}`],
    shortcut: shortcut(p, n, answer),
  };
}

/** Halve, quarter, or build from 10%. */
function roundShortcut(p: number, n: number, answer: number): string {
  const ten = n / 10;
  switch (p) {
    case 1:
      return `1% moves the point two places: ${f(n)} ÷ 100 = ${f(answer)}`;
    case 5:
      return `5% is half of 10%: ${f(ten)} ÷ 2 = ${f(answer)}`;
    case 10:
      return `10% moves the point one place: ${f(n)} ÷ 10 = ${f(answer)}`;
    case 15:
      return `15% is 10% plus half of it: ${f(ten)} + ${f(ten / 2)} = ${f(answer)}`;
    case 25:
      return `25% is a quarter, so halve twice: ${f(n)} ÷ 2 = ${f(n / 2)}, ÷ 2 = ${f(answer)}`;
    case 50:
      return `50% is half: ${f(n)} ÷ 2 = ${f(answer)}`;
    case 75:
      return `75% is the whole less a quarter: ${f(n)} − ${f(n / 4)} = ${f(answer)}`;
    default:
      return `10% is ${f(ten)}, so ${f(p)}% is ${f(p / 10)} × ${f(ten)} = ${f(answer)}`;
  }
}

/** Split the percentage at the nearest ten: 36% = 30% + 6%, 38% = 40% − 2%. */
function splitShortcut(p: number, n: number, answer: number): string {
  const units = p % 10;
  const tens = units <= 5 ? p - units : p + (10 - units);
  const rest = Math.abs(p - tens);
  const tensPart = (tens * n) / 100;
  const restPart = (rest * n) / 100;
  if (tens === 0) return `${f(p)}% is ${f(p)} × 1%: ${f(p)} × ${f(n / 100)} = ${f(answer)}`;
  const sign = p > tens ? '+' : '−';
  return `${f(p)}% = ${f(tens)}% ${sign} ${f(rest)}%: ${f(tensPart)} ${sign} ${f(restPart)} = ${f(answer)}`;
}

/** Half-percentages are friendly fractions: 37.5% is 3/8. */
function fractionShortcut(p: number, n: number, answer: number): string {
  const [top, bottom] = asFraction(p);
  const part = n / bottom;
  if (top === 1) return `${f(p)}% is 1/${bottom}: ${f(n)} ÷ ${bottom} = ${f(answer)}`;
  return `${f(p)}% is ${top}/${bottom}: ${f(n)} ÷ ${bottom} = ${f(part)}, × ${top} = ${f(answer)}`;
}

/** One number as a percentage of another, with a whole-number answer. */
function asPercentOf(random: Random): QuestionBody {
  let p = randomInt(random, 2, 98);
  while (p % 10 === 0) p = randomInt(random, 2, 98);
  const base = multipleIn(random, wholeStep(p), 120, 4_800);
  const part = (p * base) / 100;
  const divisor = gcd(part, base);
  const [top, bottom] = [part / divisor, base / divisor];
  const scale = 100 / bottom;
  const simplified = bottom === base ? '' : ` = ${f(top)}/${f(bottom)}`;
  const scaled = bottom === 100 ? '' : ` = ${f(top * scale)}/100`;
  return {
    targetTimeMs: TARGET_MS[3],
    prompt: `${f(part)} as % of ${f(base)}`,
    context: [],
    answer: { kind: 'numeric', value: p, marking: { mode: 'exact' }, unit: '%' },
    solution: [`${f(part)} ÷ ${f(base)} = ${f(part / base)}`, `${f(part / base)} × 100 = ${f(p)}%`],
    shortcut: `Simplify, then scale to hundredths: ${f(part)}/${f(base)}${simplified}${scaled} = ${f(p)}%`,
  };
}
