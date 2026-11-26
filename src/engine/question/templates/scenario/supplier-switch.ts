import { formatNumber as f } from '../../format';
import { randomInt } from '../../random';
import type { ScenarioTemplate } from '../template';
import { cents, money, pick, randomStep, until } from './text';

interface Setting {
  intro: string;
  /** What is sold now and what might replace it. */
  current: string;
  next: string;
  unit: string;
  /** Selling price and purchase cost, in cents. */
  price: [number, number];
  volume: [number, number];
}

const SETTINGS: Setting[] = [
  {
    intro: 'A burger chain is considering replacing the beef patty in its classic burger with a plant-based patty.',
    current: 'beef patties',
    next: 'plant-based patties',
    unit: 'burger',
    price: [450, 900],
    volume: [1_000_000, 4_000_000],
  },
  {
    intro: 'A coffee-shop chain is thinking of making oat milk, rather than dairy milk, the default in its lattes.',
    current: 'dairy milk',
    next: 'oat milk',
    unit: 'latte',
    price: [300, 520],
    volume: [2_000_000, 6_000_000],
  },
  {
    intro: 'A hotel group is reviewing the supplier of the welcome hamper left in each suite.',
    current: 'current hampers',
    next: 'hampers from a new supplier',
    unit: 'hamper',
    price: [2_500, 6_000],
    volume: [200_000, 800_000],
  },
  {
    intro: 'A garden-centre chain is weighing a peat-free compost to replace its own-brand compost.',
    current: 'own-brand compost',
    next: 'peat-free compost',
    unit: 'bag',
    price: [600, 1_400],
    volume: [400_000, 1_600_000],
  },
];

/**
 * Profit change from switching supplier, built line by line. Tier 1 changes
 * the price and the purchase cost; tier 2 adds volume-tiered purchase prices;
 * tier 3 also sells more units, so per-unit costs that apply to both products
 * suddenly matter. Options pair two amounts with both directions, so getting
 * the sign wrong is as costly as getting the amount wrong.
 */
export const supplierSwitch: ScenarioTemplate = {
  id: 'supplier-switch',
  skill: 'unit-economics',
  tiers: [1, 2, 3],
  build(tier, random) {
    const s = pick(random, SETTINGS);
    // The four statements run from the bigger fall to the bigger rise; which one is true is drawn first.
    const position = randomInt(random, 0, 3);
    const rises = position >= 2;
    const bigger = position === 0 || position === 3;
    const d = until(
      () => {
        const volume = randomStep(random, s.volume[0], s.volume[1], tier === 3 ? 200_000 : 100_000);
        const price = randomStep(random, s.price[0], s.price[1], 10);
        const costNow = randomStep(random, price * 0.3, price * 0.5, 5);
        const other = randomStep(random, price * 0.1, price * 0.3, 5);
        const priceNext = tier === 1 ? price + randomStep(random, -price * 0.1, price * 0.15, 10) : price;
        const firstCost = costNow + randomStep(random, -price * 0.06, price * 0.1, 5);
        const laterCost = tier === 1 ? firstCost : firstCost - randomStep(random, price * 0.03, price * 0.12, 5);
        const threshold = tier === 1 ? 0 : randomStep(random, volume * 0.3, volume * 0.9, 100_000);
        const growth = tier === 3 ? pick(random, [5, 10, 15, 20, 25]) : 0;
        const volumeNext = (volume * (100 + growth)) / 100;
        const purchaseNext = tier === 1 ? volumeNext * firstCost : threshold * firstCost + (volumeNext - threshold) * laterCost;
        // All in cents.
        const profitNow = volume * (price - costNow - other);
        const profitNext = volumeNext * (priceNext - other) - purchaseNext;
        const change = (profitNext - profitNow) / 100;
        return { volume, price, costNow, other, priceNext, firstCost, laterCost, threshold, growth, volumeNext, purchaseNext, profitNow, profitNext, change };
      },
      (c) =>
        c.laterCost > 0 &&
        c.firstCost > 0 &&
        c.price - c.costNow - c.other > 0 &&
        Math.abs(c.change) >= 10_000 &&
        Math.round(c.change) % (bigger ? 200 : 100) === 0 &&
        c.change > 0 === rises &&
        (tier === 1 || c.threshold < c.volume),
      2_000,
    );

    const change = Math.round(d.change);
    const size = Math.abs(change);
    const other = bigger ? size / 2 : size * 2;
    const statement = (amount: number) => `Profit ${amount >= 0 ? 'rises' : 'falls'} by ${money(Math.abs(amount))} a year`;
    const correct = statement(change);
    // Both amounts in both directions, from the biggest fall to the biggest rise.
    const ordered = [-Math.max(size, other), -Math.min(size, other), Math.min(size, other), Math.max(size, other)].map(statement);

    const items = [
      `Units sold a year now: ${f(d.volume)}`,
      `Selling price now: ${cents(d.price / 100)} a ${s.unit}`,
      `Purchase cost of ${s.current}: ${cents(d.costNow / 100)} a ${s.unit}`,
      tier === 1
        ? `Purchase cost of ${s.next}: ${cents(d.firstCost / 100)} a ${s.unit}`
        : `Purchase cost of ${s.next}: ${cents(d.firstCost / 100)} a ${s.unit} for the first ${f(d.threshold)} a year, then ${cents(d.laterCost / 100)} a ${s.unit}`,
      ...(tier === 1 ? [`Selling price with ${s.next}: ${cents(d.priceNext / 100)} a ${s.unit}`] : []),
      `Other costs: ${cents(d.other / 100)} a ${s.unit}, whichever is used`,
    ];

    const solution = [
      `Profit now: ${f(d.volume)} × (${cents(d.price / 100)} − ${cents(d.costNow / 100)} − ${cents(d.other / 100)}) = ${money(d.profitNow / 100)}`,
      ...(tier === 3 ? [`Units after the switch: ${f(d.volume)} × ${f(1 + d.growth / 100)} = ${f(d.volumeNext)}`] : []),
      tier === 1
        ? `Purchases after the switch: ${f(d.volumeNext)} × ${cents(d.firstCost / 100)} = ${money(d.purchaseNext / 100)}`
        : `Purchases after the switch: ${f(d.threshold)} × ${cents(d.firstCost / 100)} + ${f(d.volumeNext - d.threshold)} × ${cents(d.laterCost / 100)} = ${money(d.purchaseNext / 100)}`,
      `Profit after: ${f(d.volumeNext)} × (${cents(d.priceNext / 100)} − ${cents(d.other / 100)}) − ${money(d.purchaseNext / 100)} = ${money(d.profitNext / 100)}`,
      `Change: ${money(d.profitNext / 100)} − ${money(d.profitNow / 100)} = ${change < 0 ? '−' : '+'}${money(size)}, so: ${correct}`,
    ];
    const shortcut =
      tier === 3
        ? `Split it: the extra ${f(d.volumeNext - d.volume)} units each earn the margin at the cheaper rate, while every unit up to ${f(d.volume)} gains or loses only the difference in purchase cost. Other costs per unit matter only for the extra units.`
        : `Work on differences per unit only: price and cost that stay the same cancel out. ${tier === 2 ? `Here the first ${f(d.threshold)} units change cost by ${cents(Math.abs(d.firstCost - d.costNow) / 100)} each and the rest by ${cents(Math.abs(d.laterCost - d.costNow) / 100)} each.` : `Each ${s.unit} changes margin by ${cents(Math.abs(d.priceNext - d.firstCost - d.price + d.costNow) / 100)}, so multiply that by the units sold.`}`;

    return {
      targetTimeMs: [70_000, 100_000, 130_000][tier - 1]!,
      prompt: `If the company switches to ${s.next}${tier === 3 ? ` and sells ${d.growth}% more ${s.unit}s as a result` : ', selling the same number of units'}, which of the following statements is accurate?`,
      context: [
        { type: 'paragraph', text: s.intro },
        { type: 'list', items },
      ],
      answer: { kind: 'choice', options: ordered, correctIndex: ordered.indexOf(correct) },
      solution,
      shortcut,
    };
  },
};
