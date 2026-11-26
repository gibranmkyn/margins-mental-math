import { formatNumber as f } from '../../format';
import { randomInt } from '../../random';
import type { ScenarioTemplate } from '../template';
import { shuffledOptions } from './options';
import { pick, randomStep } from './text';

interface Setting {
  intro: string;
  /** The role, plural and singular. */
  people: string;
  person: string;
  names: [string, string, string];
  /** The two kinds of business that earn a bonus, singular, pluralised with "s". */
  first: string;
  firstValue: string;
  second: string;
  secondValue: string;
  /** Ranges for the example table. */
  base: [number, number];
  firstCount: [number, number];
  firstAmount: [number, number];
  secondCount: [number, number];
  secondAmount: [number, number];
}

const SETTINGS: Setting[] = [
  {
    intro: 'An industrial-gas supplier is reviewing how it pays its sales representatives.',
    people: 'sales representatives',
    person: 'sales representative',
    names: ['Rep 1', 'Rep 2', 'Rep 3'],
    first: 'existing account',
    firstValue: 'average yearly spend',
    second: 'new account',
    secondValue: 'average first-year spend',
    base: [30_000, 60_000],
    firstCount: [20, 80],
    firstAmount: [20_000, 120_000],
    secondCount: [3, 20],
    secondAmount: [10_000, 80_000],
  },
  {
    intro: 'An estate agency wants to compare what its agents really earn for each hour they work.',
    people: 'agents',
    person: 'agent',
    names: ['Agent A', 'Agent B', 'Agent C'],
    first: 'home sale',
    firstValue: 'average price',
    second: 'letting',
    secondValue: 'average yearly rent',
    base: [20_000, 40_000],
    firstCount: [10, 50],
    firstAmount: [200_000, 600_000],
    secondCount: [10, 60],
    secondAmount: [9_000, 30_000],
  },
  {
    intro: 'A recruitment firm is checking how its consultants’ pay adds up.',
    people: 'consultants',
    person: 'consultant',
    names: ['Consultant X', 'Consultant Y', 'Consultant Z'],
    first: 'permanent placement',
    firstValue: 'average starting salary',
    second: 'contractor placement',
    secondValue: 'average yearly billing',
    base: [25_000, 45_000],
    firstCount: [8, 40],
    firstAmount: [35_000, 90_000],
    secondCount: [4, 25],
    secondAmount: [60_000, 200_000],
  },
];

/**
 * Choose the formula for hourly pay made of a base salary and commission.
 * Tier 1 has one commission and hours per year as a letter; tier 2 two
 * commissions and hours built from day, week and year; tier 3 takes a
 * percentage deduction off the whole pay. Distractors keep the share instead
 * of the commission, swap the rates, add count and value, flip the division
 * by hours, or deduct from the base alone. None is algebraically equivalent.
 */
export const formulaPay: ScenarioTemplate = {
  id: 'formula-pay',
  skill: 'building-formulas',
  tiers: [1, 2, 3],
  build(tier, random) {
    const s = pick(random, SETTINGS);
    const [r1, r2] = [pick(random, [1, 2, 3, 4, 5]), pick(random, [8, 10, 12, 15, 20, 25])];
    const hours = { day: pick(random, [7, 8, 9]), week: pick(random, [4, 5]), year: pick(random, [44, 45, 46, 47, 48]) };
    const H = tier === 1 ? 'H' : `(${hours.day} × ${hours.week} × ${hours.year})`;
    const one = `E × S × ${r1}%`;
    const two = `N × T × ${r2}%`;

    let correct: string;
    let distractors: string[];
    if (tier === 1) {
      correct = `(B + ${one}) ÷ H`;
      distractors = [
        `(B + E × S × (1 − ${r1}%)) ÷ H`,
        `(B + (E + S) × ${r1}%) ÷ H`,
        `(B + E × S ÷ ${r1}%) ÷ H`,
        `(B + ${one}) × H`,
        `B ÷ H + ${one}`,
      ];
    } else if (tier === 2) {
      correct = `(B + ${one} + ${two}) ÷ ${H}`;
      distractors = [
        `(B + E × S × ${r2}% + N × T × ${r1}%) ÷ ${H}`,
        `(B + E × S × (1 − ${r1}%) + N × T × (1 − ${r2}%)) ÷ ${H}`,
        `(B + (E + S) × ${r1}% + (N + T) × ${r2}%) ÷ ${H}`,
        `(B + E × S ÷ ${r1}% + N × T ÷ ${r2}%) × ${H}`,
        `(${one} + ${two}) ÷ ${H}`,
      ];
    } else {
      correct = `(B + ${one} + ${two}) × (1 − t%) ÷ ${H}`;
      distractors = [
        `(B + ${one} + ${two}) × t% ÷ ${H}`,
        `(B × (1 − t%) + ${one} + ${two}) ÷ ${H}`,
        `(B + ${one} + ${two}) ÷ ${H} − t%`,
        `(B + E × S × ${r2}% + N × T × ${r1}%) × (1 − t%) ÷ ${H}`,
        `(B + ${one} + ${two}) ÷ ((1 − t%) × ${H})`,
      ];
    }
    const chosen = pick(random, [
      [0, 1, 2],
      [1, 2, 3],
      [2, 3, 4],
      [0, 2, 4],
      [0, 3, 4],
      [1, 3, 4],
    ]).map((i) => distractors[i]!);
    const { options, correctIndex } = shuffledOptions(correct, chosen, random);

    const definitions = [
      `B = base salary a year, in $`,
      `E = number of ${s.first}s in the year`,
      `S = ${s.firstValue} of one ${s.first}, in $ (the ${s.person} earns ${r1}% of it)`,
      ...(tier === 1
        ? ['H = hours worked a year']
        : [`N = number of ${s.second}s in the year`, `T = ${s.secondValue} of one ${s.second}, in $ (the ${s.person} earns ${r2}% of it)`]),
      ...(tier === 3 ? ['t = share of pay deducted for tax and pension, in %'] : []),
    ];
    const rows = s.names.map((name) => [
      name,
      f(randomStep(random, s.base[0], s.base[1], 1_000)),
      f(randomInt(random, s.firstCount[0], s.firstCount[1])),
      f(randomStep(random, s.firstAmount[0], s.firstAmount[1], 1_000)),
      ...(tier === 1
        ? [f(randomInt(random, 1_500, 2_100))]
        : [f(randomInt(random, s.secondCount[0], s.secondCount[1])), f(randomStep(random, s.secondAmount[0], s.secondAmount[1], 500))]),
      ...(tier === 3 ? [`${randomInt(random, 18, 40)}%`] : []),
    ]);
    const headers = ['', 'B ($)', 'E', 'S ($)', ...(tier === 1 ? ['H'] : ['N', 'T ($)']), ...(tier === 3 ? ['t'] : [])];

    const works = `whose working year is ${hours.year} weeks of ${hours.week} days, ${hours.day} hours a day`;
    const solution = [
      `Commission on each kind of business is count × value × rate: ${one}${tier === 1 ? '' : ` and ${two}`}`,
      `Yearly pay: B + ${one}${tier === 1 ? '' : ` + ${two}`}`,
      ...(tier === 3 ? ['Deductions take t% of all of it, leaving × (1 − t%)'] : []),
      tier === 1 ? 'Hourly: divide by H' : `Hours a year: ${hours.day} × ${hours.week} × ${hours.year}; divide by them`,
      `Correct formula: ${correct}`,
    ];
    const shortcut = `Read the formula aloud as money: a commission of ${r1}% keeps ${r1}%, not ${100 - r1}%, and hours always go underneath pay. Then test one ${s.person} from the table in your head: the result should be tens of dollars an hour.`;

    return {
      targetTimeMs: [50_000, 75_000, 95_000][tier - 1]!,
      prompt: `Which of the following formulas gives the ${tier === 3 ? 'take-home pay' : 'pay'} per hour of ${/^[aeiou]/.test(s.person) ? 'an' : 'a'} ${s.person}${tier === 1 ? '' : ` ${works}`}${tier === 3 ? ', after deductions' : ''}?`,
      context: [
        { type: 'paragraph', text: `${s.intro} Each ${s.person} earns a base salary plus commission. The firm uses these letters:` },
        { type: 'list', items: definitions },
        { type: 'table', title: `Three ${s.people}, last year`, headers, rows },
      ],
      answer: { kind: 'choice', options, correctIndex },
      solution,
      shortcut,
    };
  },
};
