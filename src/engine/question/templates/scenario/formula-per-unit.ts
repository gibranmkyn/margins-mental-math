import { formatFixed, formatNumber as f } from '../../format';
import { randomInt } from '../../random';
import type { ScenarioTemplate } from '../template';
import { shuffledOptions } from './options';
import { approx, pick, randomStep } from './text';

interface Setting {
  intro: string;
  /** What is sold, singular, and the products compared. */
  item: string;
  products: [string, string, string];
  /** The size of one item and its unit: "volume of one bottle, in litres". */
  size: string;
  sizeUnit: string;
  /** Small and scaled-up units: per litre, per 1,000 litres. */
  perUnit: string;
  perScaled: string;
  scaleText: string;
  /** An irrelevant variable to tempt: "bottles sold per day". */
  volume: string;
  /** Ranges for the example table: price and cost in cents, size in hundredths, volume. */
  price: [number, number];
  size_: [number, number];
  sizeStep: number;
  count: [number, number];
}

const SETTINGS: Setting[] = [
  {
    intro: 'A cold-pressed juice company sells several bottle sizes and wants one measure to compare them.',
    item: 'bottle',
    products: ['Shot', 'Classic', 'Family'],
    size: 'volume of one bottle, in litres',
    sizeUnit: 'litres',
    perUnit: 'litre of juice',
    perScaled: '1,000 litres of juice',
    scaleText: '1,000',
    volume: 'bottles sold per day',
    price: [250, 750],
    size_: [10, 150],
    sizeStep: 5,
    count: [200, 2_000],
  },
  {
    intro: 'An artisan bakery sells loaves of different weights to cafés and wants to compare their profitability.',
    item: 'loaf',
    products: ['Rye', 'Sourdough', 'Seeded'],
    size: 'weight of one loaf, in kg',
    sizeUnit: 'kg',
    perUnit: 'kg of bread',
    perScaled: 'tonne of bread (1 tonne = 1,000 kg)',
    scaleText: '1,000',
    volume: 'loaves sold per week',
    price: [200, 650],
    size_: [40, 120],
    sizeStep: 5,
    count: [300, 3_000],
  },
  {
    intro: 'A print shop takes jobs that tie up its press for different lengths of time.',
    item: 'job',
    products: ['Leaflets', 'Posters', 'Brochures'],
    size: 'minutes of press time one job takes',
    sizeUnit: 'minutes',
    perUnit: 'minute of press time',
    perScaled: 'hour of press time',
    scaleText: '60',
    volume: 'jobs taken per month',
    price: [4_000, 40_000],
    size_: [1_000, 12_000],
    sizeStep: 500,
    count: [50, 600],
  },
];

/**
 * Choose the formula for profit per unit of capacity. Tier 1 is profit per
 * small unit; tier 2 scales to a bigger unit (1,000 or 60); tier 3 also sells
 * at a percentage discount. Distractors invert the size, misplace the scale,
 * drop the cost, apply the discount to the wrong thing, or drag in an
 * irrelevant variable. None is algebraically equivalent to the answer. A table
 * of three products gives the letters real values to test a formula against.
 */
export const formulaPerUnit: ScenarioTemplate = {
  id: 'formula-per-unit',
  skill: 'building-formulas',
  tiers: [1, 2, 3],
  build(tier, random) {
    const s = pick(random, SETTINGS);
    const K = s.scaleText;
    const margin = tier === 3 ? '(p × (1 − d%) − c)' : '(p − c)';

    let correct: string;
    let distractors: string[];
    if (tier === 1) {
      correct = '(p − c) ÷ v';
      distractors = ['(p − c) × v', 'p ÷ v − c', '(p − c) × n ÷ v', '(p − c) ÷ (v × n)', 'p ÷ (c × v)'];
    } else if (tier === 2) {
      correct = `(p − c) × ${K} ÷ v`;
      distractors = [`(p − c) × v ÷ ${K}`, `(p − c) ÷ (v × ${K})`, `(p × ${K}) ÷ (c × v)`, `(p − c) × n × ${K} ÷ v`, `p × ${K} ÷ v`];
    } else {
      correct = `${margin} × ${K} ÷ v`;
      distractors = [
        `(p − d% − c) × ${K} ÷ v`,
        `(p × d% − c) × ${K} ÷ v`,
        `${margin} × v ÷ ${K}`,
        `(p − c) × (1 − d%) × ${K} ÷ v`,
        `(p − c × (1 − d%)) × ${K} ÷ v`,
      ];
    }
    const chosen = pick(random, [
      [0, 1, 2],
      [1, 2, 3],
      [2, 3, 4],
      [0, 2, 4],
      [0, 3, 4],
    ]).map((i) => distractors[i]!);
    const { options, correctIndex } = shuffledOptions(correct, chosen, random);

    const discount = randomStep(random, 5, 30, 5);
    const rows = s.products.map((name) => {
      const price = randomStep(random, s.price[0], s.price[1], s.price[1] >= 10_000 ? 500 : 10);
      const cost = randomStep(random, price * 0.2, price * 0.55, s.price[1] >= 10_000 ? 100 : 5);
      const size = randomStep(random, s.size_[0], s.size_[1], s.sizeStep) / 100;
      const count = randomInt(random, s.count[0], s.count[1]);
      return { name, price: price / 100, cost: cost / 100, size, count };
    });

    const definitions = [
      `p = selling price of one ${s.item}, in $`,
      `c = cost of making one ${s.item}, in $`,
      `v = ${s.size}`,
      `n = ${s.volume}`,
      ...(tier === 3 ? ['d = discount off the selling price, in %'] : []),
    ];
    const per = tier === 1 ? s.perUnit : s.perScaled;
    const scale = tier === 1 ? 1 : Number(K.replace(',', ''));
    const first = rows[0]!;
    const value = ((first.price * (1 - (tier === 3 ? discount : 0) / 100) - first.cost) * scale) / first.size;
    const solution = [
      tier === 3 ? `Price after the discount: p × (1 − d%); profit per ${s.item}: p × (1 − d%) − c` : `Profit per ${s.item}: p − c`,
      `One ${s.item} uses v, so profit per ${s.perUnit}: ${margin} ÷ v`,
      ...(tier === 1 ? [] : [`Scale up by ${K}: ${correct}`]),
      `n (${s.volume}) does not change profit per unit, so it has no place in the formula`,
      `Check with ${first.name}: ${approx(value)} dollars per ${per}`,
      `Correct formula: ${correct}`,
    ];
    const shortcut = `Test the direction of each letter: a bigger margin must raise the result and a bigger ${s.item} (bigger v) must lower it, so v belongs underneath.${tier === 1 ? ' Letters that do not change the profit on one item, like n, never belong.' : ` Then check the scale: per ${per} is ${K === '60' ? '60 times' : '1,000 times'} the figure per ${s.perUnit}.`}`;

    return {
      targetTimeMs: [50_000, 70_000, 90_000][tier - 1]!,
      prompt: `Which of the following formulas gives the profit per ${per} for any of the products${tier === 3 ? ', when every ' + s.item + ' is sold at a discount of d%' : ''}?`,
      context: [
        { type: 'paragraph', text: `${s.intro} For each product the team uses these letters:` },
        { type: 'list', items: definitions },
        {
          type: 'table',
          title: `Products under review${tier === 3 ? ` (planned discount d = ${discount}%)` : ''}`,
          headers: ['Product', 'p ($)', 'c ($)', `v (${s.sizeUnit})`, 'n'],
          rows: rows.map((r) => [r.name, formatFixed(r.price, 2), formatFixed(r.cost, 2), f(r.size), f(r.count)]),
        },
      ],
      answer: { kind: 'choice', options, correctIndex },
      solution,
      shortcut,
    };
  },
};
