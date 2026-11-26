import { formatNumber as f } from '../../format';
import { randomInt } from '../../random';
import type { ContextBlock } from '../../types';
import type { ScenarioTemplate } from '../template';
import { choiceOptions } from './options';
import { approx, money, moneyOption, pick, randomStep } from './text';

interface Setting {
  intro: string;
  /** Plural unit of output: "kg of linen". */
  units: string;
  /** Singular, for "cost per ...". */
  unit: string;
  /** Typical daily volume. */
  daily: [number, number];
  step: number;
  /** Cost per unit the economics should land near, in dollars. */
  costPerUnit: [number, number];
  costs: [string, string];
}

const SETTINGS: Setting[] = [
  {
    intro: 'An industrial laundry washes bed linen for hotels. It works Monday to Friday.',
    units: 'kg of linen',
    unit: 'kg',
    daily: [3_000, 9_000],
    step: 100,
    costPerUnit: [0.35, 1.4],
    costs: ['Energy and water', 'Detergent'],
  },
  {
    intro: 'A customer-service centre answers calls for an energy supplier. It is open Monday to Friday.',
    units: 'calls',
    unit: 'call',
    daily: [1_200, 4_000],
    step: 10,
    costPerUnit: [2.5, 9],
    costs: ['Telephony and software', 'Office rent'],
  },
  {
    intro: 'A regional parcel depot sorts parcels for onward delivery. It runs Monday to Friday.',
    units: 'parcels',
    unit: 'parcel',
    daily: [8_000, 30_000],
    step: 100,
    costPerUnit: [0.35, 0.9],
    costs: ['Conveyor maintenance', 'Building costs'],
  },
  {
    intro: 'A recycling plant sorts mixed waste delivered by council trucks. It accepts deliveries Monday to Friday.',
    units: 'tonnes',
    unit: 'tonne',
    daily: [300, 1_500],
    step: 10,
    costPerUnit: [4, 18],
    costs: ['Machine hire', 'Site rent'],
  },
];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

/**
 * Cost per unit of output over a week: weekly cost ÷ the week's volume, where
 * the volume must first be added up from the days. Tier 2 splits the cost into
 * lines; tier 3 builds the staff cost from headcount, hours and pay rate. The
 * trap is dividing by an average day or spreading the week over seven days.
 */
export const costPerUnit: ScenarioTemplate = {
  id: 'cost-per-unit',
  skill: 'unit-economics',
  tiers: [1, 2, 3],
  build(tier, random) {
    const s = pick(random, SETTINGS);
    const base = randomStep(random, s.daily[0], s.daily[1], s.step);
    const volumes = DAYS.map(() => Math.max(s.step, Math.round((base * (0.5 + random.next())) / s.step) * s.step));
    const total = volumes.reduce((a, b) => a + b, 0);
    const target = s.costPerUnit[0] + random.next() * (s.costPerUnit[1] - s.costPerUnit[0]);
    const weekly = Math.round((total * target) / 100) * 100;

    // Split the weekly cost: staff takes the larger share.
    let staff = weekly;
    let lines: number[] = [];
    let staffing = { people: 0, hours: 0, rate: 0 };
    if (tier >= 2) {
      const other = Math.round((weekly * randomInt(random, 25, 45)) / 100 / 100) * 100;
      const first = Math.round((other * randomInt(random, 30, 70)) / 100 / 10) * 10;
      lines = [first, other - first];
      staff = weekly - other;
    }
    if (tier === 3) {
      const hours = pick(random, [35, 37.5, 38, 40]);
      const rate = randomInt(random, 14, 32);
      const people = Math.max(2, Math.round(staff / (hours * rate)));
      staffing = { people, hours, rate };
      staff = people * hours * rate;
    }
    const cost = staff + lines.reduce((a, b) => a + b, 0);
    const truth = cost / total;

    const { options, correctIndex, correct } = choiceOptions(truth, random, {
      format: moneyOption,
      finestStep: 0.01,
      // Spreading the week over seven days, or leaving out the non-staff costs.
      traps: [cost / ((total / 5) * 7), tier >= 2 ? staff / total : truth * 1.2],
    });

    const context: ContextBlock[] = [
      { type: 'paragraph', text: s.intro },
      { type: 'table', title: `Volume handled last week (${s.units})`, headers: ['Day', 'Volume'], rows: DAYS.map((day, i) => [day, f(volumes[i]!)]) },
    ];
    if (tier === 1) {
      context.push({ type: 'paragraph', text: `Its total cost last week was ${money(cost)}.` });
    } else {
      context.push({
        type: 'list',
        items: [
          tier === 3
            ? `Staff: ${staffing.people} people, each paid for ${f(staffing.hours)} hours a week at ${money(staffing.rate)} an hour`
            : `Staff: ${money(staff)} a week`,
          `${s.costs[0]}: ${money(lines[0]!)} a week`,
          `${s.costs[1]}: ${money(lines[1]!)} a week`,
        ],
      });
    }

    const solution = [
      `Volume: ${volumes.map((v) => f(v)).join(' + ')} = ${f(total)} ${s.units}`,
      ...(tier === 3 ? [`Staff: ${staffing.people} × ${f(staffing.hours)} × ${money(staffing.rate)} = ${money(staff)}`] : []),
      ...(tier >= 2 ? [`Weekly cost: ${money(staff)} + ${money(lines[0]!)} + ${money(lines[1]!)} = ${money(cost)}`] : []),
      `Cost per ${s.unit}: ${money(cost)} ÷ ${f(total)} = $${approx(truth)}`,
      `Closest option: ${correct}`,
    ];
    const shortcut = `Add the five working days, never an average day or a seven-day week, then divide in thousands: ${approx(cost / 1_000)} ÷ ${approx(total / 1_000)} ≈ $${approx(truth)} per ${s.unit}.`;

    return {
      targetTimeMs: [60_000, 90_000, 110_000][tier - 1]!,
      prompt: `Which of the following is closest to last week's cost per ${s.unit}${tier === 1 ? '' : ', counting every cost listed'}?`,
      context,
      answer: { kind: 'choice', options, correctIndex },
      solution,
      shortcut,
    };
  },
};
