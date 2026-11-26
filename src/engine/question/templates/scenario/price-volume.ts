import { formatFixed, formatNumber as f } from '../../format';
import { randomInt } from '../../random';
import type { Random } from '../../random';
import type { ScenarioTemplate } from '../template';
import { choiceOptions } from './options';
import { cents, money, pick, randomStep } from './text';

interface Product {
  name: string;
  units: [number, number];
  price: [number, number];
}

interface Setting {
  intro: string;
  products: [Product, Product, Product];
}

const SETTINGS: Setting[] = [
  {
    intro: 'A bakery-café chain is reviewing its prices for next year.',
    products: [
      { name: 'Coffee', units: [200_000, 900_000], price: [250, 450] },
      { name: 'Pastries', units: [100_000, 500_000], price: [180, 380] },
      { name: 'Sandwiches', units: [50_000, 300_000], price: [450, 850] },
    ],
  },
  {
    intro: 'A garden-supplies wholesaler is planning next season’s price list.',
    products: [
      { name: 'Compost bags', units: [40_000, 200_000], price: [600, 1_400] },
      { name: 'Seed packs', units: [100_000, 600_000], price: [150, 450] },
      { name: 'Planters', units: [10_000, 60_000], price: [1_500, 4_500] },
    ],
  },
  {
    intro: 'A cinema operator is resetting prices across its sites.',
    products: [
      { name: 'Tickets', units: [300_000, 1_200_000], price: [800, 1_400] },
      { name: 'Popcorn', units: [100_000, 500_000], price: [450, 750] },
      { name: 'Drinks', units: [150_000, 600_000], price: [300, 550] },
    ],
  },
];

interface Line {
  product: Product;
  units: number;
  /** Dollars. */
  price: number;
  priceChange: number;
  volumeChange: number;
  cost: number;
  costChange: number;
}

/**
 * Next year's revenue (or profit) after price and volume changes: the
 * changes multiply rather than add. Tier 2 has several product lines to
 * total; tier 3 asks for profit with unit costs also moving.
 */
export const priceVolume: ScenarioTemplate = {
  id: 'price-volume',
  skill: 'percentages-in-context',
  tiers: [1, 2, 3],
  build(tier, random) {
    const s = pick(random, SETTINGS);
    const count = tier === 2 ? randomInt(random, 2, 3) : 1;
    const lines: Line[] = s.products.slice(0, count).map((product) => makeLine(product, tier, random));

    const revenueNext = (l: Line) => l.units * (1 + l.volumeChange / 100) * l.price * (1 + l.priceChange / 100);
    const costNext = (l: Line) => l.units * (1 + l.volumeChange / 100) * l.cost * (1 + l.costChange / 100);
    const truth = lines.reduce((sum, l) => sum + revenueNext(l) - (tier === 3 ? costNext(l) : 0), 0);
    // Adding the percentage changes instead of multiplying them.
    const additive = lines.reduce(
      (sum, l) =>
        sum +
        l.units * l.price * (1 + (l.priceChange + l.volumeChange) / 100) -
        (tier === 3 ? l.units * l.cost * (1 + (l.costChange + l.volumeChange) / 100) : 0),
      0,
    );

    const millions = truth >= 1_000_000;
    const scale = millions ? 1_000_000 : 1_000;
    const suffix = millions ? 'm' : 'k';
    const { options, correctIndex, correct } = choiceOptions(truth / scale, random, {
      format: (value, decimals) => `$${formatFixed(value, decimals)}${suffix}`,
      finestStep: millions ? 0.01 : 1,
      traps: [additive / scale, tier === 3 ? lines.reduce((sum, l) => sum + revenueNext(l), 0) / scale : additive / scale],
    });

    const signed = (pct: number) => `${pct >= 0 ? '+' : '−'}${f(Math.abs(pct))}%`;
    const factor = (pct: number) => f(1 + pct / 100);
    const headers = ['Product', 'Units sold last year', 'Price last year', 'Price change', 'Volume change'];
    if (tier === 3) headers.push('Unit cost last year', 'Unit cost change');
    const rows = lines.map((l) => [
      l.product.name,
      f(l.units),
      cents(l.price),
      signed(l.priceChange),
      signed(l.volumeChange),
      ...(tier === 3 ? [cents(l.cost), signed(l.costChange)] : []),
    ]);

    const solution = lines.flatMap((l) => {
      const steps = [
        `${l.product.name} revenue: ${f(l.units)} × ${cents(l.price)} × ${factor(l.priceChange)} × ${factor(l.volumeChange)} = ${money(round(revenueNext(l)))}`,
      ];
      if (tier === 3) {
        steps.push(
          `${l.product.name} costs: ${f(l.units)} × ${cents(l.cost)} × ${factor(l.costChange)} × ${factor(l.volumeChange)} = ${money(round(costNext(l)))}`,
          `Profit: ${money(round(revenueNext(l)))} − ${money(round(costNext(l)))} = ${money(round(truth))}`,
        );
      }
      return steps;
    });
    if (lines.length > 1) solution.push(`Total: ${lines.map((l) => money(round(revenueNext(l)))).join(' + ')} = ${money(round(truth))}`);
    solution.push(`Closest option: ${correct}`);

    const l0 = lines[0]!;
    const combined = (1 + l0.priceChange / 100) * (1 + l0.volumeChange / 100);
    const shortcut =
      tier === 3
        ? `Work per unit and multiply once: new margin is ${cents(l0.price)} × ${factor(l0.priceChange)} − ${cents(l0.cost)} × ${factor(l0.costChange)} = ${cents(l0.price * (1 + l0.priceChange / 100) - l0.cost * (1 + l0.costChange / 100))} a unit, on ${f(l0.units)} × ${factor(l0.volumeChange)} = ${f(Math.round(l0.units * (1 + l0.volumeChange / 100)))} units next year.`
        : `Combine the changes into one factor before touching the big numbers: ${factor(l0.priceChange)} × ${factor(l0.volumeChange)} = ${f(Math.round(combined * 10_000) / 10_000)}, a ${signed(Math.round((combined - 1) * 10_000) / 100)} change in revenue rather than the ${signed(l0.priceChange + l0.volumeChange)} you get by adding the changes.`;

    return {
      targetTimeMs: [70_000, 110_000, 130_000][tier - 1]!,
      prompt:
        tier === 3
          ? 'If every planned change happens, which of the following is closest to next year’s profit?'
          : `If every planned change happens, which of the following is closest to next year’s ${lines.length > 1 ? 'total revenue' : 'revenue'}?`,
      context: [
        { type: 'paragraph', text: s.intro },
        // One product reads better as a list than as a one-row table on a phone.
        lines.length > 1
          ? { type: 'table', title: 'Last year and planned changes', headers, rows }
          : { type: 'list', items: headers.map((h, i) => `${h}: ${rows[0]![i]}`) },
      ],
      answer: { kind: 'choice', options, correctIndex },
      solution,
      shortcut,
    };
  },
};

function makeLine(product: Product, tier: number, random: Random): Line {
  const units = randomStep(random, product.units[0], product.units[1], tier === 1 ? 10_000 : 1_000);
  const priceCents = randomStep(random, product.price[0], product.price[1], tier === 1 ? 50 : 10);
  const raise = random.next() < 0.6;
  const priceChange = (raise ? 1 : -1) * randomStep(random, 2, 15, 1);
  const volumeChange = (raise ? -1 : 1) * randomStep(random, 2, 20, 1);
  const costCents = Math.round((priceCents * randomInt(random, 30, 60)) / 100);
  const costChange = randomStep(random, 2, 12, 1);
  return { product, units, price: priceCents / 100, priceChange, volumeChange, cost: costCents / 100, costChange };
}

function round(value: number): number {
  return Math.round(value);
}
