import { formatNumber as f } from '../../format';
import type { ScenarioTemplate } from '../template';
import { choiceOptions } from './options';
import { approx, money, percentOption, pick, randomStep, until } from './text';

interface Setting {
  intro: string;
  item: string;
  cost: [number, number];
  promotion: string;
  fee: string;
}

const SETTINGS: Setting[] = [
  {
    intro: 'An outdoor-gear shop is pricing a new two-person tent for the spring season.',
    item: 'tent',
    cost: [60, 180],
    promotion: 'Spring promotion',
    fee: 'Card processing fee',
  },
  {
    intro: 'An online electronics retailer is setting the price of a pair of wireless headphones.',
    item: 'pair of headphones',
    cost: [30, 140],
    promotion: 'Launch-week discount',
    fee: 'Marketplace commission',
  },
  {
    intro: 'A florist with a delivery app is pricing a premium seasonal bouquet.',
    item: 'bouquet',
    cost: [12, 48],
    promotion: 'Weekday offer',
    fee: 'Delivery app commission',
  },
  {
    intro: 'A kitchenware brand is setting the price of a cast-iron casserole dish in its own stores.',
    item: 'casserole dish',
    cost: [24, 90],
    promotion: 'Store-wide sale',
    fee: 'Franchise royalty',
  },
];

const MARKUPS = [20, 25, 30, 40, 50, 60, 75, 80, 100, 120, 150];

/**
 * Gross margin as a share of the price actually paid, after a markup on cost,
 * a discount off the shelf price and (tier 3) a fee charged on the price paid.
 * The classic slips are treating the markup as the margin, and adding or
 * subtracting percentages that apply to different bases.
 */
export const markupDiscount: ScenarioTemplate = {
  id: 'markup-discount',
  skill: 'percentages-in-context',
  tiers: [1, 2, 3],
  build(tier, random) {
    const s = pick(random, SETTINGS);
    const cost = randomStep(random, s.cost[0], s.cost[1], tier === 1 ? 4 : 1);
    const { markup, discount, fee } = until(
      () => ({
        markup: pick(random, MARKUPS),
        discount: tier === 1 ? 0 : pick(random, [5, 10, 15, 20, 25, 30, 35, 40]),
        fee: tier === 3 ? pick(random, [2, 3, 4, 5, 6, 8, 10, 12, 15]) : 0,
      }),
      (d) => marginOf(d.markup, d.discount, d.fee) >= 6,
    );
    const shelf = cost * (1 + markup / 100);
    const paid = shelf * (1 - discount / 100);
    const feeAmount = (paid * fee) / 100;
    const truth = marginOf(markup, discount, fee);

    const { options, correctIndex, correct } = choiceOptions(truth, random, {
      format: percentOption,
      finestStep: 0.1,
      traps: [
        markup - discount - fee,
        ((markup - discount) / (100 + markup - discount)) * 100 - fee,
        ...(tier === 3 ? [marginOf(markup, discount, 0)] : []),
      ],
    });

    const items = [
      `Bought in at: ${money(cost)} a ${s.item}`,
      `Shelf price: cost plus a markup of ${markup}%`,
      ...(tier >= 2 ? [`${s.promotion}: ${discount}% off the shelf price`] : []),
      ...(tier === 3 ? [`${s.fee}: ${fee}% of the price the customer pays`] : []),
    ];

    const solution = [
      `Shelf price: ${money(cost)} × ${f(1 + markup / 100)} = ${money(round2(shelf))}`,
      ...(tier >= 2 ? [`Price paid: ${money(round2(shelf))} × ${f(1 - discount / 100)} = ${money(round2(paid))}`] : []),
      ...(tier === 3 ? [`${s.fee}: ${fee}% × ${money(round2(paid))} = ${money(round2(feeAmount))}`] : []),
      `Gross profit: ${money(round2(paid))} − ${money(cost)}${tier === 3 ? ` − ${money(round2(feeAmount))}` : ''} = ${money(round2(paid - cost - feeAmount))}`,
      `Margin: ${money(round2(paid - cost - feeAmount))} ÷ ${money(round2(paid))} = ${approx(truth)}%`,
      `Closest option: ${correct}`,
    ];

    const factor = (1 + markup / 100) * (1 - discount / 100);
    const shortcut =
      `Ignore the ${money(cost)}: call cost 1, so the customer pays ${tier === 1 ? f(1 + markup / 100) : `${f(1 + markup / 100)} × ${f(1 - discount / 100)} = ${approx(factor)}`}` +
      ` and the margin is 1 − 1 ÷ ${approx(factor)}${tier === 3 ? `, less the ${fee}% fee` : ''}; a markup of ${markup}% is never a margin of ${markup}%.`;

    return {
      targetTimeMs: [60_000, 90_000, 110_000][tier - 1]!,
      prompt: `Which of the following is closest to the gross margin on each ${s.item} sold${tier >= 2 ? ' at the discounted price' : ''}, as a percentage of the price the customer pays${tier === 3 ? ' and after the fee' : ''}?`,
      context: [
        { type: 'paragraph', text: s.intro },
        { type: 'list', items },
      ],
      answer: { kind: 'choice', options, correctIndex },
      solution,
      shortcut,
    };
  },
};

/** Margin on the price paid, in percent: 1 − fee − 1 ÷ ((1 + markup)(1 − discount)). */
function marginOf(markup: number, discount: number, fee: number): number {
  return (1 - fee / 100 - 1 / ((1 + markup / 100) * (1 - discount / 100))) * 100;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
