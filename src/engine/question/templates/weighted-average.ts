import { formatNumber as f } from '../format';
import { randomInt } from '../random';
import type { Random } from '../random';
import type { Marking, Tier } from '../types';
import { MINUS, pick, toCents, twoFigures } from './arithmetic';
import type { QuestionBody, Template } from './template';

const TOLERANCE: Marking = { mode: 'tolerance', percent: 3 };
const ALLOWED_ERROR = TOLERANCE.mode === 'tolerance' ? TOLERANCE.percent / 100 : 0;
const SHORTCUT_ERROR = ALLOWED_ERROR * 0.9;

/**
 * Weighted average and mix.
 * Tier 1: two groups given as percentage shares. Exact.
 * Tier 2: three groups given as counts, or the mix: the share of the higher
 * value that produces a given average. Exact.
 * Tier 3: two groups with unround counts: an estimation drill marked within
 * 3%, stated to two decimal places.
 */
export const weightedAverage: Template = {
  skill: 'weighted-average',
  tiers: [1, 2, 3],
  build(tier, random) {
    if (tier === 1) return twoShares(random);
    if (tier === 2) return random.next() < 0.5 ? threeCounts(random) : mix(random);
    return unroundCounts(random);
  },
};

const TARGET_MS: Record<Tier, number> = { 1: 15000, 2: 25000, 3: 30000 };

/** Two different values. */
function twoValues(draw: () => number): [number, number] {
  const a = draw();
  let b = draw();
  while (b === a) b = draw();
  return [a, b];
}

/** "move 40% of the way from 10 to 20": 10 + 4 = 14. */
function moveToward(from: number, to: number, sharePercent: number, result: number, approx = false): string {
  const shift = ((to - from) * sharePercent) / 100;
  const sign = shift >= 0 ? '+' : MINUS;
  return `${f(from)} ${sign} ${f(Math.abs(shift))} ${approx ? '≈' : '='} ${f(result)}`;
}

function twoShares(random: Random): QuestionBody {
  const p1 = 10 * randomInt(random, 1, 9);
  const p2 = 100 - p1;
  const [v1, v2] = twoValues(() => 5 * randomInt(random, 1, 19));
  const answer = (p1 * v1 + p2 * v2) / 100;
  // Anchor on the larger share and move toward the smaller one.
  const [base, other, otherShare] = p1 >= p2 ? [v1, v2, p2] : [v2, v1, p1];
  return {
    targetTimeMs: TARGET_MS[1],
    prompt: `${p1}% at ${f(v1)}, ${p2}% at ${f(v2)}`,
    context: [],
    answer: { kind: 'numeric', value: answer, marking: { mode: 'exact' }, unit: '' },
    solution: [
      `${p1}% × ${f(v1)} = ${f((p1 * v1) / 100)}`,
      `${p2}% × ${f(v2)} = ${f((p2 * v2) / 100)}`,
      `${f((p1 * v1) / 100)} + ${f((p2 * v2) / 100)} = ${f(answer)}`,
    ],
    shortcut: `Start at ${f(base)} and move ${otherShare}% of the way to ${f(other)}: ${moveToward(base, other, otherShare, answer)}`,
  };
}

/** Counts that add to 10 or 20, so the average stays at two decimal places at most. */
const COUNT_SETS = [
  [2, 3, 5],
  [1, 4, 5],
  [3, 3, 4],
  [1, 2, 7],
  [2, 2, 6],
  [4, 6, 10],
  [3, 5, 12],
  [2, 8, 10],
  [5, 7, 8],
] as const;

function threeCounts(random: Random): QuestionBody {
  const counts = [...pick(random, COUNT_SETS)].sort(() => random.next() - 0.5);
  const values: number[] = [];
  while (values.length < 3) {
    const v = randomInt(random, 4, 60);
    if (!values.includes(v)) values.push(v);
  }
  const groups = counts.map((count, i) => ({ count, value: values[i]! }));
  const total = counts.reduce((a, b) => a + b, 0);
  const sum = groups.reduce((s, g) => s + g.count * g.value, 0);
  const answer = sum / total;
  // Measure from the lowest value, so every group's gap adds and none is negative.
  const anchor = groups.reduce((low, g) => (g.value < low.value ? g : low));
  const deviations = groups.map((g) => g.count * (g.value - anchor.value));
  const deviationSum = deviations.reduce((a, b) => a + b, 0);
  const shift = deviationSum / total;
  return {
    targetTimeMs: TARGET_MS[2],
    prompt: groups.map((g) => `${g.count} at ${f(g.value)}`).join(', '),
    context: [],
    answer: { kind: 'numeric', value: answer, marking: { mode: 'exact' }, unit: '' },
    solution: [
      `Total: ${groups.map((g) => `${g.count} × ${f(g.value)}`).join(' + ')} = ${f(sum)}`,
      `Count: ${counts.join(' + ')} = ${total}`,
      `${f(sum)} ÷ ${total} = ${f(answer)}`,
    ],
    shortcut:
      `Measure from ${f(anchor.value)}: the gaps above it weigh ${deviations.filter((d) => d > 0).map(f).join(' and ')}, ` +
      `together ${f(deviationSum)}, ÷ ${total} = ${f(shift)}, so ${f(anchor.value)} + ${f(shift)} = ${f(answer)}`,
  };
}

/** The share of the higher value in a mix that averages a given amount. */
function mix(random: Random): QuestionBody {
  const low = randomInt(random, 2, 40);
  const high = low + 20 * randomInt(random, 1, 4);
  const share = 5 * randomInt(random, 2, 18);
  const avg = low + ((high - low) * share) / 100;
  const above = avg - low;
  const gap = high - low;
  return {
    targetTimeMs: TARGET_MS[2],
    prompt: `${f(low)} and ${f(high)} average ${f(avg)}. % at ${f(high)}?`,
    context: [],
    answer: { kind: 'numeric', value: share, marking: { mode: 'exact' }, unit: '%' },
    solution: [
      `The average sits ${f(avg)} − ${f(low)} = ${f(above)} above ${f(low)}`,
      `The whole gap is ${f(high)} − ${f(low)} = ${f(gap)}`,
      `Share at ${f(high)} = ${f(above)} ÷ ${f(gap)} = ${f(share)}%`,
    ],
    shortcut: `Distance from the low end over the whole gap: ${f(above)}/${f(gap)} = ${f(share)}%`,
  };
}

function unroundCounts(random: Random): QuestionBody {
  for (;;) {
    const c1 = randomInt(random, 120, 1_900);
    const c2 = randomInt(random, 120, 1_900);
    const [v1, v2] = twoValues(() => randomInt(random, 3, 60));
    const total = c1 + c2;
    const truth = (c1 * v1 + c2 * v2) / total;
    // Anchor on the bigger group and move toward the smaller by its rounded share.
    const [base, other, otherCount] = c1 >= c2 ? [v1, v2, c2] : [v2, v1, c1];
    const share = Math.round((twoFigures(otherCount) / twoFigures(total)) * 100);
    const estimate = toCents(base + ((other - base) * share) / 100);
    if (Math.abs(estimate - truth) > SHORTCUT_ERROR * truth) continue;
    const stated = toCents(truth);
    return {
      targetTimeMs: TARGET_MS[3],
      prompt: `${f(c1)} at ${f(v1)}, ${f(c2)} at ${f(v2)}`,
      context: [],
      answer: { kind: 'numeric', value: stated, marking: TOLERANCE, unit: '' },
      solution: [
        `Total: ${f(c1)} × ${f(v1)} + ${f(c2)} × ${f(v2)} = ${f(c1 * v1)} + ${f(c2 * v2)} = ${f(c1 * v1 + c2 * v2)}`,
        `Count: ${f(c1)} + ${f(c2)} = ${f(total)}`,
        `${f(c1 * v1 + c2 * v2)} ÷ ${f(total)} ≈ ${f(stated)}`,
      ],
      shortcut:
        `The ${f(otherCount)} at ${f(other)} are about ${f(twoFigures(otherCount))}/${f(twoFigures(total))} ≈ ${share}% of the total; ` +
        `start at ${f(base)} and move that share of the way: ${moveToward(base, other, share, estimate, true)}`,
    };
  }
}
