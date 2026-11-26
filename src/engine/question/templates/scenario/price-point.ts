import { formatNumber as f } from '../../format';
import { randomInt } from '../../random';
import type { ScenarioTemplate } from '../template';
import { cents, money, pick, randomStep, until } from './text';

interface Setting {
  intro: string;
  /** What the price is for, singular: "day pass". */
  unit: string;
  /** Who buys, plural: "skiers". */
  customers: string;
  extras: string;
  /** Lowest price option and the gap between options, in cents. */
  price: [number, number];
  gap: number[];
  /** Cost of serving one unit, as a share of the lowest price. */
  cost: [number, number];
  /** Customers per week at the lowest price. */
  volume: [number, number];
  /** What each customer spends on extras, in cents. */
  spend: [number, number];
  /** Units each customer buys (tier 3 only); [1, 1] means one each. */
  perCustomer: [number, number];
  perCustomerLabel: string;
}

const SETTINGS: Setting[] = [
  {
    intro: 'A ski resort is choosing next season’s price for a day pass.',
    unit: 'day pass',
    customers: 'skiers',
    extras: 'food and drink on the mountain',
    price: [4_000, 6_000],
    gap: [500, 1_000],
    cost: [0.3, 0.6],
    volume: [3_000, 9_000],
    spend: [1_500, 4_000],
    perCustomer: [1, 1],
    perCustomerLabel: '',
  },
  {
    intro: 'A cinema chain is testing ticket prices for weekday evenings.',
    unit: 'ticket',
    customers: 'film-goers',
    extras: 'snacks',
    price: [700, 1_000],
    gap: [100, 150, 200],
    cost: [0.3, 0.6],
    volume: [6_000, 20_000],
    spend: [400, 1_200],
    perCustomer: [1, 1],
    perCustomerLabel: '',
  },
  {
    intro: 'An electric-vehicle charging hub on a motorway is setting its price per kilowatt-hour.',
    unit: 'kilowatt-hour',
    customers: 'drivers',
    extras: 'the hub’s café',
    price: [40, 60],
    gap: [5, 10],
    cost: [0.5, 0.8],
    volume: [2_000, 6_000],
    spend: [500, 1_500],
    perCustomer: [25, 45],
    perCustomerLabel: 'Kilowatt-hours per driver',
  },
  {
    intro: 'A bowling alley is reviewing the price of a game on weekend afternoons.',
    unit: 'game',
    customers: 'groups',
    extras: 'food and drink',
    price: [500, 800],
    gap: [100, 150],
    cost: [0.2, 0.5],
    volume: [600, 1_800],
    spend: [2_000, 6_000],
    perCustomer: [8, 16],
    perCustomerLabel: 'Games per group',
  },
];

/**
 * The price that maximises profit, from a table of price options and the
 * demand expected at each. Tier 1 is (price − cost) × volume; tier 2 adds the
 * profit each customer brings on extras, which pulls the best price down; tier
 * 3 also lets each customer buy less as the price rises. The traps are the
 * highest margin and the highest volume.
 */
export const pricePoint: ScenarioTemplate = {
  id: 'price-point',
  skill: 'unit-economics',
  tiers: [1, 2, 3],
  build(tier, random) {
    // Settings where each customer buys several units (a charge, a run of games) only make sense once tier 3 counts units.
    const s = pick(random, tier === 3 ? SETTINGS.slice(2) : SETTINGS.slice(0, 2));
    // Which of the four prices wins is drawn first, so the answer is as likely to be any of them.
    const target = randomInt(random, 0, 3);
    const d = until(
      () => {
        const gap = pick(random, s.gap);
        const lowest = randomStep(random, s.price[0], s.price[1], gap);
        const prices = [0, 1, 2, 3].map((k) => lowest + k * gap);
        const cost = randomStep(random, prices[0]! * s.cost[0], prices[0]! * s.cost[1], 5);
        // Customers fall as the price rises, at an uneven pace.
        let customers = randomStep(random, s.volume[0], s.volume[1], 100);
        const volumes = prices.map((_, k) => {
          // Gentle losses up to the winning price, steep ones after it.
          const loss = k <= target ? randomInt(random, 1, 14) : randomInt(random, 22, 45);
          if (k > 0) customers = Math.round((customers * (1 - loss / 100)) / 10) * 10;
          return customers;
        });
        let units = randomInt(random, s.perCustomer[0], s.perCustomer[1]);
        const perCustomer = prices.map((_, k) => {
          if (k > 0 && tier === 3) units = Math.max(1, units - randomInt(random, 1, 4));
          return tier === 3 ? units : 1;
        });
        // Whole-dollar spend at a margin in steps of 5% keeps the profit per customer in whole cents.
        const spend = tier === 1 ? 0 : randomStep(random, s.spend[0], s.spend[1], 100);
        const margin = tier === 1 ? 0 : randomStep(random, 20, 60, 5);
        const profits = prices.map((p, k) => volumes[k]! * ((p - cost) * perCustomer[k]! + (spend * margin) / 100));
        return { prices, cost, volumes, perCustomer, spend, margin, profits };
      },
      (c) => {
        const sorted = [...c.profits].sort((a, b) => b - a);
        return sorted[0]! > 0 && sorted[0]! > sorted[1]! * 1.04 && c.profits.indexOf(sorted[0]!) === target;
      },
      2_000,
    );

    const best = d.profits.indexOf(Math.max(...d.profits));
    const priceText = (p: number) => (d.prices.every((x) => x % 100 === 0) ? money(p / 100) : cents(p / 100));
    const options = d.prices.map(priceText);
    const correct = options[best]!;

    const headers = [`Price per ${s.unit}`, `${s.customers[0]!.toUpperCase()}${s.customers.slice(1)} per week`, ...(tier === 3 ? [s.perCustomerLabel] : [])];
    const rows = d.prices.map((p, k) => [priceText(p), f(d.volumes[k]!), ...(tier === 3 ? [f(d.perCustomer[k]!)] : [])]);
    const items = [
      `Cost of providing each ${s.unit}: ${cents(d.cost / 100)}`,
      ...(tier >= 2 ? [`Each of the ${s.customers} also spends ${money(d.spend / 100)} on ${s.extras}, at a margin of ${d.margin}%`] : []),
    ];

    const extra = (d.spend * d.margin) / 100 / 100;
    const solution = d.prices.map((p, k) => {
      const per = tier === 3 ? `(${cents((p - d.cost) / 100)} × ${f(d.perCustomer[k]!)}${tier === 3 ? ` + ${cents(extra)}` : ''})` : tier === 2 ? `(${cents((p - d.cost) / 100)} + ${cents(extra)})` : cents((p - d.cost) / 100);
      return `At ${priceText(p)}: ${f(d.volumes[k]!)} × ${per} = ${money(Math.round(d.profits[k]!) / 100)} a week`;
    });
    solution.push(`Highest profit at: ${correct}`);
    const shortcut =
      tier === 1
        ? `Compare margin × volume only: each step up in price adds margin per ${s.unit} but loses customers; the cost per ${s.unit} is what turns price into margin.`
        : `Fold the extras into the margin first: each of the ${s.customers} brings ${cents(extra)} on ${s.extras}, so add that to the ${tier === 3 ? 'margin per visit' : `margin per ${s.unit}`} before multiplying by the number of ${s.customers}.`;

    return {
      targetTimeMs: [70_000, 100_000, 130_000][tier - 1]!,
      prompt: `Which price per ${s.unit} gives the highest weekly profit${tier >= 2 ? `, including ${s.extras}` : ''}?`,
      context: [
        { type: 'paragraph', text: s.intro },
        { type: 'table', title: 'Expected demand at each price option', headers, rows },
        { type: 'list', items },
      ],
      answer: { kind: 'choice', options, correctIndex: best },
      solution,
      shortcut,
    };
  },
};
