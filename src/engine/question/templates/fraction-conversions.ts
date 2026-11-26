import { formatNumber as f } from '../format';
import { randomInt } from '../random';
import type { Random } from '../random';
import type { Marking, Tier } from '../types';
import { gcd, pick, toCents } from './arithmetic';
import type { QuestionBody, Template } from './template';

const TOLERANCE: Marking = { mode: 'tolerance', percent: 3 };

/**
 * Fraction and percent conversions.
 * Tier 1: a fraction over 2, 4, 5, 8, 10 or 20 as a percentage. Exact.
 * Tier 2: a fraction over 16, 25, 40 or 50, an unsimplified friendly fraction,
 * or a percentage back to a fraction's top number. Exact.
 * Tier 3: an unfriendly fraction (thirds, sixths, sevenths, ninths, elevenths,
 * twelfths), possibly unsimplified, as a percentage: an estimation drill
 * marked within 3%, stated to two decimal places.
 */
export const fractionConversions: Template = {
  skill: 'fraction-conversions',
  tiers: [1, 2, 3],
  build(tier, random) {
    if (tier === 1) return toPercent(tier, properFraction(random, [2, 4, 5, 8, 10, 20]), 1);
    if (tier === 3) return awkward(random);
    const kind = randomInt(random, 0, 2);
    if (kind === 0) return toPercent(tier, properFraction(random, [16, 25, 40, 50]), 1);
    if (kind === 1) return toPercent(tier, properFraction(random, [4, 5, 8, 20]), randomInt(random, 2, 9));
    return toTop(properFraction(random, [4, 5, 8, 10, 16, 20, 25, 40]));
  },
};

const TARGET_MS: Record<Tier, number> = { 1: 8000, 2: 15000, 3: 20000 };

type Fraction = { top: number; bottom: number };

/** A fraction in lowest terms, less than one, over one of the given denominators. */
function properFraction(random: Random, bottoms: readonly number[]): Fraction {
  const bottom = pick(random, bottoms);
  for (;;) {
    const top = randomInt(random, 1, bottom - 1);
    if (gcd(top, bottom) === 1) return { top, bottom };
  }
}

/** What 1/bottom is as a percentage, exactly. */
const unitPercent = (bottom: number) => 100 / bottom;

/** Fraction to percentage, shown scaled up by `scale` when that is more than one. */
function toPercent(tier: Tier, { top, bottom }: Fraction, scale: number): QuestionBody {
  const [shownTop, shownBottom] = [top * scale, bottom * scale];
  const percent = (top * 100) / bottom;
  const simplify = scale > 1 ? `Simplify: ${f(shownTop)}/${f(shownBottom)} = ${f(top)}/${f(bottom)}; ` : '';
  const known =
    top === 1
      ? `1/${f(bottom)} is 100 ÷ ${f(bottom)} = ${f(percent)}%`
      : `1/${f(bottom)} is ${f(unitPercent(bottom))}%, so ${f(top)}/${f(bottom)} is ${f(top)} × ${f(unitPercent(bottom))}% = ${f(percent)}%`;
  return {
    targetTimeMs: TARGET_MS[tier],
    prompt: `${f(shownTop)}/${f(shownBottom)} as %`,
    context: [],
    answer: { kind: 'numeric', value: percent, marking: { mode: 'exact' }, unit: '%' },
    solution: [`${f(shownTop)} ÷ ${f(shownBottom)} = ${f(top / bottom)}`, `${f(top / bottom)} × 100 = ${f(percent)}%`],
    shortcut: simplify + known,
  };
}

/** A percentage back to the top number of a fraction with a given bottom: 62.5% = ?/8. */
function toTop({ top, bottom }: Fraction): QuestionBody {
  const percent = (top * 100) / bottom;
  return {
    targetTimeMs: TARGET_MS[2],
    prompt: `${f(percent)}% = ?/${f(bottom)}`,
    context: [],
    answer: { kind: 'numeric', value: top, marking: { mode: 'exact' }, unit: '' },
    solution: [`${f(percent)}% = ${f(percent / 100)}`, `${f(percent / 100)} × ${f(bottom)} = ${f(top)}`],
    shortcut: `1/${f(bottom)} is ${f(unitPercent(bottom))}%, and ${f(percent)} ÷ ${f(unitPercent(bottom))} = ${f(top)}`,
  };
}

/** Memorised one-decimal values of awkward unit fractions. */
const KNOWN: Record<number, number> = { 3: 33.3, 6: 16.7, 7: 14.3, 9: 11.1, 11: 9.1, 12: 8.3 };

function awkward(random: Random): QuestionBody {
  const { top, bottom } = properFraction(random, [3, 6, 7, 9, 11, 12]);
  const scale = random.next() < 0.6 ? randomInt(random, 2, 9) : 1;
  const [shownTop, shownBottom] = [top * scale, bottom * scale];
  const stated = toCents((top * 100) / bottom);
  const decimal = Math.round((top / bottom) * 10_000) / 10_000;
  const unit = KNOWN[bottom]!;
  const estimate = Math.round(top * unit * 10) / 10;
  const simplify = scale > 1 ? `Simplify: ${f(shownTop)}/${f(shownBottom)} = ${f(top)}/${f(bottom)}; ` : '';
  const known = top === 1 ? `1/${f(bottom)} ≈ ${f(unit)}%` : `1/${f(bottom)} ≈ ${f(unit)}%, so ${f(top)}/${f(bottom)} ≈ ${f(top)} × ${f(unit)}% ≈ ${f(estimate)}%`;
  return {
    targetTimeMs: TARGET_MS[3],
    prompt: `${f(shownTop)}/${f(shownBottom)} as %`,
    context: [],
    answer: { kind: 'numeric', value: stated, marking: TOLERANCE, unit: '%' },
    solution: [`${f(shownTop)} ÷ ${f(shownBottom)} ≈ ${f(decimal)}`, `${f(decimal)} × 100 ≈ ${f(stated)}%`],
    shortcut: simplify + known,
  };
}
