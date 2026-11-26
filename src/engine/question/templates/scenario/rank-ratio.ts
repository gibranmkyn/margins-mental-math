import { formatNumber as f } from '../../format';
import { randomInt } from '../../random';
import type { ScenarioTemplate } from '../template';
import { shuffledOptions } from './options';
import { approx, percent, pick, shuffle, until } from './text';

interface Setting {
  intro: string;
  /** What the entities are, plural: "practices". */
  things: string;
  label: string;
  /** Numerator: noun as used in "fees per consultant", and its column header. */
  numerator: string;
  numeratorHeader: string;
  numeratorRange: [number, number];
  /** Decimals shown for the numerator. */
  decimals: number;
  /** Denominator, singular, and its column header (plural). */
  denominator: string;
  denominatorHeader: string;
  denominatorRange: [number, number];
  /** Whether the numerator is money, so a profit margin can apply to it (tier 3). */
  money: boolean;
}

const SETTINGS: Setting[] = [
  {
    intro: 'An engineering consultancy compares the productivity of its practice areas.',
    things: 'practices',
    label: 'Practice',
    numerator: 'fees',
    numeratorHeader: 'Fees ($ million)',
    numeratorRange: [4, 60],
    decimals: 1,
    denominator: 'consultant',
    denominatorHeader: 'Consultants',
    denominatorRange: [12, 140],
    money: true,
  },
  {
    intro: 'A furniture retailer ranks its stores on how well they use their space.',
    things: 'stores',
    label: 'Store',
    numerator: 'sales',
    numeratorHeader: 'Sales ($ thousand)',
    numeratorRange: [2_000, 14_000],
    decimals: 0,
    denominator: 'square metre',
    denominatorHeader: 'Square metres of floor space',
    denominatorRange: [800, 4_000],
    money: true,
  },
  {
    intro: 'A food manufacturer benchmarks the energy efficiency of its plants.',
    things: 'plants',
    label: 'Plant',
    numerator: 'output',
    numeratorHeader: 'Output (tonnes)',
    numeratorRange: [5_000, 60_000],
    decimals: 0,
    denominator: 'megawatt-hour',
    denominatorHeader: 'Megawatt-hours of energy used',
    denominatorRange: [1_500, 12_000],
    money: false,
  },
  {
    intro: 'A housing charity compares its regional fundraising teams.',
    things: 'regions',
    label: 'Region',
    numerator: 'donations',
    numeratorHeader: 'Donations ($ million)',
    numeratorRange: [3, 45],
    decimals: 1,
    denominator: 'fundraiser',
    denominatorHeader: 'Fundraisers',
    denominatorRange: [8, 90],
    money: false,
  },
];

// Not A to E: those are the option letters, and "A: C, D, A, B" cannot be read.
const LETTERS = ['P', 'Q', 'R', 'S', 'T'];

/**
 * Rank four or five entities by a ratio read off a table. Tier 1 ranks four
 * with wide gaps; tier 2 five with narrower gaps; tier 3 ranks by profit per
 * head, so each numerator is first multiplied by a margin. Distractors swap
 * the closest pair, or rank by the numerator or the denominator alone.
 */
export const rankRatio: ScenarioTemplate = {
  id: 'rank-ratio',
  skill: 'ratios-comparisons',
  tiers: [1, 2, 3],
  build(tier, random) {
    const s = pick(random, tier === 3 ? SETTINGS.filter((x) => x.money) : SETTINGS);
    const count = tier === 1 ? 4 : 5;
    const gap = [0.1, 0.05, 0.04][tier - 1]!;
    const letters = LETTERS.slice(0, count);
    const scale = 10 ** s.decimals;

    const d = until(
      () => {
        const rows = letters.map(() => {
          // Figures to three significant figures, as an exhibit would show them.
          const denominator = threeFigures(randomInt(random, s.denominatorRange[0], s.denominatorRange[1]));
          const numerator = threeFigures(randomInt(random, s.numeratorRange[0] * scale, s.numeratorRange[1] * scale)) / scale;
          const margin = tier === 3 ? randomInt(random, 4, 30) : 100;
          return { denominator, numerator, margin, ratio: (numerator * margin) / 100 / denominator };
        });
        return rows;
      },
      (rows) => {
        const sorted = rows.map((r) => r.ratio).sort((a, b) => a - b);
        return sorted.every((v, i) => i === 0 || v > sorted[i - 1]! * (1 + gap));
      },
    );

    const descending = random.next() < 0.5;
    const order = (key: (i: number) => number, desc: boolean) =>
      letters
        .map((l, i) => ({ l, v: key(i) }))
        .sort((a, b) => (desc ? b.v - a.v : a.v - b.v))
        .map((x) => x.l);
    const correctOrder = order((i) => d[i]!.ratio, descending);
    const text = (o: string[]) => o.join(', ');

    // The adjacent pair with the smallest relative gap is where a hurried estimate slips.
    const gaps = correctOrder.slice(1).map((l, k) => {
      const a = d[letters.indexOf(correctOrder[k]!)]!.ratio;
      const b = d[letters.indexOf(l)]!.ratio;
      return { k, gap: Math.abs(a - b) / Math.min(a, b) };
    });
    gaps.sort((x, y) => x.gap - y.gap);
    const swapAt = (o: string[], k: number) => {
      const c = [...o];
      [c[k], c[k + 1]] = [c[k + 1]!, c[k]!];
      return c;
    };
    const distractors = [
      text(swapAt(correctOrder, gaps[0]!.k)),
      text(order((i) => d[i]!.numerator, descending)),
      ...(tier === 3 ? [text(order((i) => d[i]!.numerator / d[i]!.denominator, descending))] : []),
      text(order((i) => -d[i]!.denominator, descending)),
      text(swapAt(correctOrder, gaps[1]!.k)),
      text(swapAt(swapAt(correctOrder, gaps[0]!.k), gaps[2]?.k ?? gaps[1]!.k)),
      ...shuffle(random, [0, 1, 2]).map((k) => text(swapAt(correctOrder, k))),
    ];
    const { options, correctIndex, correct } = shuffledOptions(text(correctOrder), distractors, random);

    const measure = tier === 3 ? `profit per ${s.denominator}` : `${s.numerator} per ${s.denominator}`;
    const headers = [s.label, s.numeratorHeader, s.denominatorHeader, ...(tier === 3 ? ['Profit margin'] : [])];
    const rows = letters.map((l, i) => [
      l,
      f(d[i]!.numerator),
      f(d[i]!.denominator),
      ...(tier === 3 ? [percent(d[i]!.margin)] : []),
    ]);

    const solution = letters.map((l, i) => {
      const r = d[i]!;
      return tier === 3
        ? `${l}: ${f(r.numerator)} × ${r.margin}% ÷ ${f(r.denominator)} = ${approx(r.ratio)}`
        : `${l}: ${f(r.numerator)} ÷ ${f(r.denominator)} = ${approx(r.ratio)}`;
    });
    solution.push(`Ranking: ${correct}`);
    const shortcut = `Estimate each ratio to two figures and only refine the pair that is close: here ${correctOrder[gaps[0]!.k]} and ${correctOrder[gaps[0]!.k + 1]} are nearest, so check those two carefully. Ranking by ${s.numerator} alone is the trap.`;

    return {
      targetTimeMs: [60_000, 90_000, 120_000][tier - 1]!,
      prompt: `Which of the following ranks the ${s.things} by ${measure}, from ${descending ? 'highest to lowest' : 'lowest to highest'}?`,
      context: [
        { type: 'paragraph', text: s.intro },
        { type: 'table', title: `${s.label} data, last year`, headers, rows },
      ],
      answer: { kind: 'choice', options, correctIndex },
      solution,
      shortcut,
    };
  },
};

/** Round a whole number to three significant figures: 20,214 -> 20,200. */
function threeFigures(value: number): number {
  const unit = 10 ** Math.max(0, Math.floor(Math.log10(value)) - 2);
  return Math.round(value / unit) * unit;
}
