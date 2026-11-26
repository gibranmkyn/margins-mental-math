import { formatNumber as f, formatShort as short } from '../format';
import { randomInt } from '../random';
import type { Random } from '../random';
import type { Marking, Tier } from '../types';
import { pick, toCents } from './arithmetic';
import type { QuestionBody, Template } from './template';

const TOLERANCE: Marking = { mode: 'tolerance', percent: 3 };
const ALLOWED_ERROR = TOLERANCE.mode === 'tolerance' ? TOLERANCE.percent / 100 : 0;
/** Shortcuts are kept to cases where they land comfortably inside the tolerance. */
const SHORTCUT_ERROR = ALLOWED_ERROR * 0.9;

/**
 * Compound growth, an estimation drill marked within 3%; stated values are
 * given to two decimal places.
 * Tier 1: a round amount at 5, 10 or 20% for two or three years.
 * Tier 2: an unround amount at 3 to 12% for three to six years.
 * Tier 3: long horizons that the rule of 72 cracks, either growing an amount
 * forward or finding the CAGR between two amounts.
 */
export const compoundGrowth: Template = {
  skill: 'compound-growth',
  tiers: [1, 2, 3],
  build(tier, random) {
    if (tier === 3) return random.next() < 0.5 ? doublingForward(random) : doublingCagr(random);
    for (;;) {
      const { base, rate, years } = tier === 1 ? gentle(random) : steeper(random);
      const question = growForward(tier, base, rate, years);
      if (question) return question;
    }
  },
};

const TARGET_MS: Record<Tier, number> = { 1: 20000, 2: 30000, 3: 35000 };

function gentle(random: Random) {
  const base = random.next() < 0.5 ? 100 * randomInt(random, 1, 9) : 1000 * randomInt(random, 1, 9);
  return { base, rate: pick(random, [5, 10, 20]), years: randomInt(random, 2, 3) };
}

function steeper(random: Random) {
  return { base: 50 * randomInt(random, 5, 99), rate: randomInt(random, 3, 12), years: randomInt(random, 3, 6) };
}

/**
 * Grow an amount year by year. The shortcut is simple growth plus the
 * interest-on-interest term, n(n − 1)/2 × r²; returns null when that estimate
 * would miss by more than the tolerance allows.
 */
function growForward(tier: Tier, base: number, rate: number, years: number): QuestionBody | null {
  const r = rate / 100;
  const truth = base * (1 + r) ** years;
  const simple = years * rate;
  // Whole percents and whole numbers, so the shortcut stays in the head.
  const extra = Math.round(((years * (years - 1)) / 2) * r * r * 100);
  const total = simple + extra;
  const uplift = Math.round((base * total) / 100);
  const estimate = base + uplift;
  if (Math.abs(estimate - truth) > SHORTCUT_ERROR * truth) return null;

  const solution: string[] = [];
  let running = base;
  for (let year = 1; year <= years; year++) {
    const next = running * (1 + r);
    const rounded = toCents(next);
    solution.push(`Year ${year}: ${f(toCents(running))} × ${f(1 + r)} ${Math.abs(rounded - next) < 1e-9 ? '=' : '≈'} ${f(rounded)}`);
    running = next;
  }
  return {
    targetTimeMs: TARGET_MS[tier],
    prompt: `${f(base)} at ${f(rate)}% for ${years} yrs`,
    context: [],
    answer: { kind: 'numeric', value: toCents(truth), marking: TOLERANCE, unit: '' },
    solution,
    shortcut:
      (extra > 0
        ? `${years} years at ${f(rate)}% is ${f(simple)}% simple growth plus about ${f(extra)}% interest on interest, ${f(total)}% in all: `
        : `${years} years at ${f(rate)}% is ${f(simple)}% simple growth; the interest on interest is under half a percent: `) +
      `${f(base)} + ${f(total)}% of it (${f(uplift)}) ≈ ${f(estimate)}`,
  };
}

/** Rate and years whose product is 72 (one doubling) or 144 (two). */
const DOUBLING_PAIRS = [
  [4, 18],
  [6, 12],
  [8, 9],
  [9, 8],
  [12, 6],
  [6, 24],
  [8, 18],
  [9, 16],
  [12, 12],
] as const;

/** A starting amount: two figures then zeros, so it often reads in shorthand. */
function amount(random: Random): number {
  return randomInt(random, 12, 95) * 10 ** pick(random, [1, 2, 4, 5]);
}

function doublingForward(random: Random): QuestionBody {
  for (;;) {
    const [rate, years] = pick(random, DOUBLING_PAIRS);
    const base = amount(random);
    const factor = (1 + rate / 100) ** years;
    const truth = base * factor;
    const doublingYears = 72 / rate;
    const doublings = years / doublingYears;
    const estimate = base * 2 ** doublings;
    if (Math.abs(estimate - truth) > SHORTCUT_ERROR * truth) continue;
    return {
      targetTimeMs: TARGET_MS[3],
      prompt: `${short(base)} at ${f(rate)}% for ${years} yrs`,
      context: [],
      answer: { kind: 'numeric', value: toCents(truth), marking: TOLERANCE, unit: '' },
      solution: [
        `Growth factor: ${f(1 + rate / 100)} multiplied ${years} times ≈ ${f(round4(factor))}`,
        `${f(base)} × ${f(round4(factor))} ≈ ${f(toCents(truth))}`,
      ],
      shortcut:
        `Rule of 72: at ${f(rate)}% it doubles every 72 ÷ ${f(rate)} = ${f(doublingYears)} years, ` +
        `so ${years} years is ${doublings === 1 ? 'one doubling' : `${doublings} doublings`}: ` +
        `${f(base)} × ${f(2 ** doublings)} ≈ ${f(estimate)}`,
    };
  }
}

function doublingCagr(random: Random): QuestionBody {
  for (;;) {
    const multiple = pick(random, [2, 4] as const);
    const years = multiple === 2 ? pick(random, [6, 8, 9, 12, 18, 24]) : pick(random, [12, 16, 18, 24]);
    const start = amount(random);
    const end = start * multiple;
    const yearly = multiple ** (1 / years);
    const truth = (yearly - 1) * 100;
    const perDoubling = years / Math.log2(multiple);
    const estimate = 72 / perDoubling;
    if (Math.abs(estimate - truth) > SHORTCUT_ERROR * truth) continue;
    const stated = toCents(truth);
    return {
      targetTimeMs: TARGET_MS[3],
      prompt: `CAGR ${short(start)} → ${short(end)}, ${years} yrs`,
      context: [],
      answer: { kind: 'numeric', value: stated, marking: TOLERANCE, unit: '%' },
      solution: [
        `Growth multiple: ${f(end)} ÷ ${f(start)} = ${multiple}`,
        `Yearly factor: the number that multiplied ${years} times gives ${multiple}, ≈ ${f(round4(yearly))}`,
        `CAGR = ${f(round4(yearly))} − 1 ≈ ${f(stated)}%`,
      ],
      shortcut:
        multiple === 2
          ? `Rule of 72: doubling in ${years} years means 72 ÷ ${years} ≈ ${f(estimate)}%`
          : `Quadrupling is two doublings of ${f(perDoubling)} years each; rule of 72: 72 ÷ ${f(perDoubling)} ≈ ${f(estimate)}%`,
    };
  }
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
