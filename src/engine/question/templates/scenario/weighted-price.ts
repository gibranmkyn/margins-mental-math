import { randomInt } from '../../random';
import type { ScenarioTemplate } from '../template';
import { choiceOptions } from './options';
import { approx, cents, moneyOption, percent, percentOption, pick, randomStep, shuffle, until } from './text';

interface Setting {
  intro: string;
  /** Column header for the bands and their names. */
  band: string;
  names: [string, string, string, string];
  /** What one unit is: "customer", "seat", "cup". */
  unit: string;
  /** Prices in cents, cheapest band first. */
  price: [number, number];
}

const SETTINGS: Setting[] = [
  {
    intro: 'A mobile network sells several monthly plans and wants to know what an average customer is worth.',
    band: 'Plan',
    names: ['Basic', 'Standard', 'Plus', 'Unlimited'],
    unit: 'customer per month',
    price: [800, 6_000],
  },
  {
    intro: 'A regional airline sells seats on its main route in several fare classes.',
    band: 'Fare class',
    names: ['Saver', 'Flex', 'Premium', 'Business'],
    unit: 'seat',
    price: [4_000, 40_000],
  },
  {
    intro: 'A smoothie bar sells its drinks in several sizes.',
    band: 'Size',
    names: ['Small', 'Medium', 'Large', 'Jumbo'],
    unit: 'drink',
    price: [300, 900],
  },
  {
    intro: 'A theatre sells tickets in several price zones.',
    band: 'Zone',
    names: ['Balcony', 'Circle', 'Stalls', 'Front stalls'],
    unit: 'ticket',
    price: [1_500, 9_000],
  },
];

/**
 * Averages over a mix: weight each band by its share of volume. Tier 1 asks
 * for the average price over three bands; tier 2 for the average margin when
 * every band earns the same profit per unit; tier 3 for the average margin
 * when profit differs by band. Traps: the simple average of prices, and the
 * average of the band margins.
 */
export const weightedPrice: ScenarioTemplate = {
  id: 'weighted-price',
  skill: 'averages-mixes',
  tiers: [1, 2, 3],
  build(tier, random) {
    const s = pick(random, SETTINGS);
    const count = tier === 1 ? 3 : 4;
    const names = s.names.slice(0, count);
    const priceStep = s.price[1] >= 10_000 ? 500 : s.price[1] >= 2_000 ? 50 : 10;

    const d = until(
      () => {
        const prices = [...new Set(names.map(() => randomStep(random, s.price[0], s.price[1], priceStep)))].sort((a, b) => a - b);
        const shares = splitShares(count, random);
        // Profits as round as the prices: a $40 fare earns $15, never $14.65.
        const profit = randomStep(random, prices[0]! * 0.2, prices[0]! * 0.8, priceStep);
        const profits = prices.map((p) => randomStep(random, p * 0.1, p * 0.5, priceStep));
        return { prices, shares, profit, profits };
      },
      (c) => c.prices.length === count && c.shares.every((x) => x > 0),
    );

    const average = d.prices.reduce((sum, p, i) => sum + (p * d.shares[i]!) / 100, 0);
    const simple = d.prices.reduce((a, b) => a + b, 0) / count;
    const averageProfit = d.profits.reduce((sum, m, i) => sum + (m * d.shares[i]!) / 100, 0);
    const truth = tier === 1 ? average / 100 : tier === 2 ? (d.profit / average) * 100 : (averageProfit / average) * 100;
    const traps =
      tier === 1
        ? [simple / 100]
        : tier === 2
          ? [(d.profit / simple) * 100]
          : [(d.profits.reduce((sum, m, i) => sum + m / d.prices[i]!, 0) / count) * 100, (d.profits.reduce((a, b) => a + b, 0) / d.prices.reduce((a, b) => a + b, 0)) * 100];

    const { options, correctIndex, correct } = choiceOptions(truth, random, {
      format: tier === 1 ? moneyOption : percentOption,
      finestStep: 0.01,
      traps,
    });

    const headers = [s.band, 'Share of volume', 'Price each', ...(tier === 3 ? ['Gross profit each'] : [])];
    const rows = names.map((n, i) => [n, percent(d.shares[i]!), cents(d.prices[i]! / 100), ...(tier === 3 ? [cents(d.profits[i]! / 100)] : [])]);

    const weighted = names.map((_, i) => `${d.shares[i]}% × ${cents(d.prices[i]! / 100)}`).join(' + ');
    const solution = [`Average price: ${weighted} = ${cents(Math.round(average) / 100)}`];
    if (tier === 2) solution.push(`Average margin: ${cents(d.profit / 100)} ÷ ${cents(average / 100)} = ${approx(truth)}%`);
    if (tier === 3) {
      solution.push(`Average profit: ${names.map((_, i) => `${d.shares[i]}% × ${cents(d.profits[i]! / 100)}`).join(' + ')} = ${cents(Math.round(averageProfit) / 100)}`);
      solution.push(`Average margin: ${cents(averageProfit / 100)} ÷ ${cents(average / 100)} = ${approx(truth)}%`);
    }
    solution.push(`Closest option: ${correct}`);
    const shortcut =
      tier === 1
        ? `Start from the cheapest price and add only the extra each band pays, weighted by its share: the shares tilt the average towards the big bands, so it is not the simple average.`
        : `Weight first, divide last: build the average price (and ${tier === 3 ? 'the average profit' : 'keep the one profit figure'}) across the mix, then take one ratio. Averaging the bands' own margins ignores how much each sells.`;

    return {
      targetTimeMs: [60_000, 90_000, 120_000][tier - 1]!,
      prompt:
        tier === 1
          ? `Which of the following is closest to the average price per ${s.unit} across all sales?`
          : `Which of the following is closest to the average gross margin across all sales, as a percentage of revenue?`,
      context: [
        { type: 'paragraph', text: s.intro },
        { type: 'table', title: 'Sales mix', headers, rows },
        ...(tier === 2 ? [{ type: 'paragraph' as const, text: `Every ${s.band.toLowerCase()} earns a gross profit of ${cents(d.profit / 100)} per ${s.unit}.` }] : []),
      ],
      answer: { kind: 'choice', options, correctIndex },
      solution,
      shortcut,
    };
  },
};

/** Shares in steps of 5% that add to 100%, each at least 10%. */
function splitShares(count: number, random: { next(): number }): number[] {
  const shares = Array.from({ length: count }, () => 10);
  for (let left = 100 - 10 * count; left > 0; left -= 5) shares[randomInt(random, 0, count - 1)]! += 5;
  return shuffle(random, shares);
}
