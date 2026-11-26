import { formatFixed, formatNumber as f } from '../../format';
import { randomInt } from '../../random';
import type { ScenarioTemplate } from '../template';
import { shuffledOptions } from './options';
import { pick, randomStep } from './text';

interface Setting {
  intro: string;
  /** What the staff handle, plural: "letters". */
  work: string;
  verb: string;
  periods: [string, string];
  /** Ranges for the example table: work in thousands, hours in thousands. */
  volume: [number, number];
  hours: [number, number];
}

const SETTINGS: Setting[] = [
  {
    intro: 'A parcel carrier wants to understand why its sorting hubs look less productive in the peak season.',
    work: 'parcels',
    verb: 'sorted',
    periods: ['January to October', 'November to December'],
    volume: [8_000, 30_000],
    hours: [40, 160],
  },
  {
    intro: 'A bank’s contact centre is comparing staffing in its quiet and busy months.',
    work: 'calls',
    verb: 'answered',
    periods: ['Quiet months', 'Busy months'],
    volume: [300, 1_200],
    hours: [30, 120],
  },
  {
    intro: 'An online grocer is reviewing staffing in its picking warehouse.',
    work: 'orders',
    verb: 'picked',
    periods: ['Weekdays', 'Weekends'],
    volume: [200, 900],
    hours: [20, 90],
  },
];

/**
 * Choose the formula linking paid hours, staff numbers and work done. Tier 1
 * asks for headcount from paid hours; tier 2 for work per employee; tier 3 for
 * staff cost per unit of work. The trap shared by all three is forgetting the
 * paid hours in which no work is done (sickness, training); others put the
 * monthly hours per employee on the wrong side or drag them in where they
 * cancel out. None is algebraically equivalent to the answer.
 */
export const formulaHeadcount: ScenarioTemplate = {
  id: 'formula-headcount',
  skill: 'building-formulas',
  tiers: [1, 2, 3],
  build(tier, random) {
    const s = pick(random, SETTINGS);
    const month = pick(random, [150, 155, 160, 165, 168]);
    const M = String(month);

    let correct: string;
    let distractors: string[];
    let quantity: string;
    if (tier === 1) {
      quantity = 'the average number of employees paid each month';
      correct = `(w + n) ÷ ${M}`;
      distractors = [`w ÷ ${M}`, `(w + n) × ${M}`, `${M} ÷ (w + n)`, `(w − n) ÷ ${M}`, `h ÷ (w + n)`];
    } else if (tier === 2) {
      quantity = `the average number of ${s.work} ${s.verb} per employee per month`;
      correct = `h × ${M} ÷ (w + n)`;
      distractors = [`h ÷ ((w + n) × ${M})`, `(w + n) × ${M} ÷ h`, `h × ${M} ÷ w`, `h ÷ ((w + n) × ${M} × r)`, `h × (w + n) ÷ ${M}`];
    } else {
      quantity = `the staff cost per ${s.work.replace(/s$/, '')} ${s.verb}`;
      correct = 'r × (w + n) ÷ h';
      distractors = ['r × w ÷ h', 'h ÷ (r × (w + n))', `r × (w + n) × ${M} ÷ h`, '(w + n) ÷ (r × h)', `r × ${M} ÷ h`];
    }
    const chosen = pick(random, [
      [0, 1, 2],
      [0, 2, 3],
      [0, 3, 4],
      [0, 1, 4],
      [1, 2, 3],
    ]).map((i) => distractors[i]!);
    const { options, correctIndex } = shuffledOptions(correct, chosen, random);

    const definitions = [
      `h = ${s.work} ${s.verb} per month`,
      'w = paid hours spent working per month',
      'n = paid hours not spent working per month (sickness, holiday, training)',
      'r = hourly rate of pay, in $',
    ];
    const rows = [
      [`Hourly rate of pay (r)`, ...s.periods.map(() => `$${formatFixed(randomStep(random, 1_100, 2_600, 50) / 100, 2)}`)],
      [`${s.work[0]!.toUpperCase()}${s.work.slice(1)} ${s.verb} (h, thousands)`, ...s.periods.map(() => f(randomStep(random, s.volume[0], s.volume[1], 10)))],
      ['Paid hours spent working (w, thousands)', ...s.periods.map(() => f(randomInt(random, s.hours[0], s.hours[1])))],
      ['Paid hours not spent working (n, thousands)', ...s.periods.map(() => f(randomInt(random, Math.round(s.hours[0] / 8), Math.round(s.hours[1] / 4))))],
    ];

    const solution = [
      `Every paid hour counts towards headcount, worked or not: total paid hours = w + n`,
      `Each employee is paid for ${M} hours a month, so employees = (w + n) ÷ ${M}`,
      ...(tier === 2 ? [`${s.work[0]!.toUpperCase()}${s.work.slice(1)} per employee = h ÷ ((w + n) ÷ ${M}) = ${correct}`] : []),
      ...(tier === 3 ? [`Staff cost = r × (w + n); per ${s.work.replace(/s$/, '')}, divide by h. The ${M} hours cancel out`] : []),
      `Correct formula: ${correct}`,
    ];
    const shortcut = `Track the units: hours ÷ (hours per employee) gives employees; ${s.work} ÷ employees gives ${s.work} per employee. Paid hours not worked still cost money and still need a person, so w alone is never enough.`;

    return {
      targetTimeMs: [45_000, 65_000, 85_000][tier - 1]!,
      prompt: `If every employee is paid for ${M} hours a month, which of the following formulas gives ${quantity}, for either period?`,
      context: [
        { type: 'paragraph', text: `${s.intro} The team uses these letters:` },
        { type: 'list', items: definitions },
        { type: 'table', title: 'Staffing and output, average per month', headers: ['', ...s.periods], rows },
      ],
      answer: { kind: 'choice', options, correctIndex },
      solution,
      shortcut,
    };
  },
};
