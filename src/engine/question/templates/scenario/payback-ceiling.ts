import { formatFixed, formatNumber as f } from '../../format';
import { randomInt } from '../../random';
import type { ScenarioTemplate } from '../template';
import { choiceOptions } from './options';
import { money, pick, randomStep } from './text';

interface Setting {
  intro: string;
  /** What the money is spent on: "fit-out". */
  investment: string;
  /** "members", "desks rented", "units let". */
  customers: string;
  /** One customer, in the worked solution: "member", "desk", "unit". */
  one: string;
  customersRange: [number, number];
  /** Monthly fee per customer. */
  fee: [number, number];
  feeLabel: string;
  variableLabel: string;
  overheads: [string, string];
  campaign: string;
}

const SETTINGS: Setting[] = [
  {
    intro: 'A budget gym chain is assessing a new site in a commuter town.',
    investment: 'fit-out',
    customers: 'Paying members expected',
    one: 'member',
    customersRange: [1_200, 4_000],
    fee: [18, 40],
    feeLabel: 'Membership fee per member per month',
    variableLabel: 'Variable cost per member per month (towels, card fees, wear)',
    overheads: ['Rent per month', 'Staff per month'],
    campaign: 'one-off opening campaign',
  },
  {
    intro: 'A co-working operator is considering a new floor in a city-centre office block.',
    investment: 'refurbishment',
    customers: 'Desks rented expected',
    one: 'desk',
    customersRange: [150, 600],
    fee: [180, 420],
    feeLabel: 'Fee per desk per month',
    variableLabel: 'Variable cost per desk per month (coffee, cleaning, utilities)',
    overheads: ['Lease per month', 'Community team per month'],
    campaign: 'one-off broker commission package',
  },
  {
    intro: 'A self-storage company is looking at converting an empty warehouse.',
    investment: 'conversion',
    customers: 'Storage units let expected',
    one: 'unit',
    customersRange: [400, 1_500],
    fee: [45, 120],
    feeLabel: 'Rent per unit per month',
    variableLabel: 'Variable cost per unit per month (insurance, billing)',
    overheads: ['Property costs per month', 'Site staff per month'],
    campaign: 'one-off local advertising push',
  },
];

/**
 * The most worth investing for a required payback: monthly profit × 12 ×
 * the payback limit. Tier 2 states the limit in months; tier 3 also charges a
 * one-off campaign that must come out of the same payback.
 */
export const paybackCeiling: ScenarioTemplate = {
  id: 'payback-ceiling',
  skill: 'break-even-payback',
  tiers: [1, 2, 3],
  build(tier, random) {
    const s = pick(random, SETTINGS);
    const customers = randomStep(random, s.customersRange[0], s.customersRange[1], tier === 1 ? 100 : 10);
    const fee = randomInt(random, s.fee[0], s.fee[1]);
    const variable = Math.round(fee * (randomInt(random, 10, 30) / 100));
    const margin = fee - variable;
    const contribution = customers * margin;
    // Overheads take 35–65% of contribution, in round hundreds.
    const overheadTotal = Math.round((contribution * (randomInt(random, 35, 65) / 100)) / 100) * 100;
    const overheadA = Math.round((overheadTotal * (randomInt(random, 45, 65) / 100)) / 100) * 100;
    const overheadB = overheadTotal - overheadA;
    const monthlyProfit = contribution - overheadTotal;

    const months = tier === 1 ? pick(random, [24, 36, 48, 60]) : pick(random, [18, 24, 30, 36, 42, 48, 54]);
    const limitText = tier === 1 ? `${months / 12} years` : `${months} months`;
    const campaign = tier === 3 ? Math.round((monthlyProfit * randomInt(random, 2, 6)) / 1_000) * 1_000 : 0;
    const ceiling = monthlyProfit * months - campaign;

    // Options in $ thousands: "$1,240k".
    const { options, correctIndex, correct } = choiceOptions(ceiling / 1_000, random, {
      format: (value, decimals) => `$${formatFixed(value, decimals)}k`,
      finestStep: 1,
      // Forgetting the overheads, or using the full fee as profit, are the usual slips.
      traps: [(contribution * months - campaign) / 1_000, ((customers * fee - overheadTotal) * months - campaign) / 1_000],
    });

    const listItems = [
      `${s.customers}: ${f(customers)}`,
      `${s.feeLabel}: ${money(fee)}`,
      `${s.variableLabel}: ${money(variable)}`,
      `${s.overheads[0]}: ${money(overheadA)}`,
      `${s.overheads[1]}: ${money(overheadB)}`,
      ...(tier === 3 ? [`${s.campaign[0]!.toUpperCase()}${s.campaign.slice(1)}: ${money(campaign)}`] : []),
    ];

    const solution = [
      `Margin per ${s.one}: ${money(fee)} − ${money(variable)} = ${money(margin)} a month`,
      `Contribution: ${f(customers)} × ${money(margin)} = ${money(contribution)} a month`,
      `Profit after overheads: ${money(contribution)} − ${money(overheadA)} − ${money(overheadB)} = ${money(monthlyProfit)} a month`,
      `Over ${f(months)} months: ${money(monthlyProfit)} × ${f(months)} = ${money(monthlyProfit * months)}`,
      ...(tier === 3 ? [`Less the one-off cost: ${money(monthlyProfit * months)} − ${money(campaign)} = ${money(ceiling)}`] : []),
      `Closest option: ${correct}`,
    ];

    const yearly = monthlyProfit * 12;
    // Months that are not whole years: multiply by them directly, split at the nearest ten.
    const round = Math.round(months / 10) * 10;
    const rest = months - round;
    const split =
      rest === 0
        ? `${money(monthlyProfit)} × ${round / 10} = ${money(monthlyProfit * (round / 10))}, then × 10 = ${money(monthlyProfit * months)}`
        : `${money(monthlyProfit)} × ${round} = ${money(monthlyProfit * round)}, ${rest > 0 ? 'plus' : 'less'} × ${Math.abs(rest)} = ${money(monthlyProfit * Math.abs(rest))}, gives ${money(monthlyProfit * months)}`;
    const after = tier === 3 ? ' Take the one-off cost off at the end.' : '';
    const shortcut =
      months % 12 === 0
        ? `Annualise once: ${money(monthlyProfit)} × 12 = ${money(yearly)} a year, then × ${months / 12} years.${after}`
        : `Multiply by the ${f(months)} months directly, split at a round number: ${split}.${after}`;

    return {
      targetTimeMs: [75_000, 100_000, 130_000][tier - 1]!,
      prompt: `The company only invests if the site pays back its ${s.investment}${tier === 3 ? ` and a ${s.campaign}` : ''} within ${limitText}. Which of the following is closest to the most it should spend on the ${s.investment}?`,
      context: [
        { type: 'paragraph', text: s.intro },
        { type: 'list', items: listItems },
        { type: 'paragraph', text: 'Assume the site is full from the first month and all figures stay flat.' },
      ],
      answer: { kind: 'choice', options, correctIndex },
      solution,
      shortcut,
    };
  },
};
