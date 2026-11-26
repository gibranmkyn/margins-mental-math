import { formatNumber as f } from '../../format';
import { randomInt } from '../../random';
import type { ChartBlock } from '../../types';
import { choiceOptions } from '../scenario/options';
import { approx, oneDecimal, pick } from '../scenario/text';
import type { ScenarioTemplate } from '../template';
import { niceAxis } from './axis';
import { looksCharted, snap, unitOption, until } from './charts';
import { estimateOptions, readable, readingBand } from './estimate';

interface Setting {
  intro: string;
  /** The business, completing "What was ...’s operating margin?" */
  name: string;
  /** The three operating costs between gross profit and operating profit. */
  costs: [string, string, string];
  /** Revenue range, $m. */
  revenue: [number, number];
  /** Cost of goods as a percentage of revenue. */
  goods: [number, number];
}

const SETTINGS: Setting[] = [
  {
    intro: 'A furniture retailer shows how last year’s revenue turned into operating profit.',
    name: 'the retailer',
    costs: ['Staff', 'Rent', 'Marketing'],
    revenue: [200, 900],
    goods: [45, 62],
  },
  {
    intro: 'A craft brewery walks its lender through last year’s accounts, from revenue down to operating profit.',
    name: 'the brewery',
    costs: ['Staff', 'Distribution', 'Marketing'],
    revenue: [90, 300],
    goods: [35, 55],
  },
  {
    intro: 'A medical device maker presents last year’s profit and loss as a waterfall, from revenue down to operating profit.',
    name: 'the device maker',
    costs: ['R&D', 'Sales', 'Admin'],
    revenue: [300, 1_200],
    goods: [30, 48],
  },
];

/**
 * A profit and loss walk: revenue, cost of goods, gross profit, three
 * operating costs, operating profit, with the two profits as subtotal bars.
 * Tier 1 labels the bars and asks the operating margin; tier 2 asks the gross
 * margin, read off gridlines;
 * tier 3 labels the bars and asks how far operating profit falls if the cost
 * of goods rises, which leverage makes far more than the rise itself.
 */
export const marginWalk: ScenarioTemplate = {
  id: 'margin-walk',
  skill: 'waterfall-charts',
  tiers: [1, 2, 3],
  build(tier, random) {
    const s = pick(random, SETTINGS);
    const labelled = tier !== 2;

    return until(() => {
      const rawRevenue = randomInt(random, s.revenue[0], s.revenue[1]);
      const axis = niceAxis(0, rawRevenue * 1.04, labelled ? 6 : 10);
      const draw = (v: number) => (labelled ? Math.round(v) : snap(v, axis.step / 5));
      const revenue = draw(rawRevenue);
      const goods = draw((rawRevenue * randomInt(random, s.goods[0], s.goods[1])) / 100);
      const costs = s.costs.map(() => draw((rawRevenue * randomInt(random, 5, 16)) / 100));
      const gross = revenue - goods;
      const profit = gross - costs.reduce((a, b) => a + b, 0);
      if ([goods, ...costs].some((v) => v <= 0) || profit < revenue * 0.05 || revenue > axis.max) return null;

      const chart: ChartBlock = {
        type: 'chart',
        chart: 'waterfall',
        title: 'From revenue to operating profit, last year',
        unit: '$m',
        categories: ['Revenue', 'Cost of goods', 'Gross profit', ...s.costs, 'Operating profit'],
        series: [{ name: 'Profit and loss', values: [revenue, -goods, gross, ...costs.map((v) => -v), profit] }],
        totals: [0, 2, 6],
        axis,
        labelled,
        decimals: 0,
      };
      const intro = { type: 'paragraph' as const, text: s.intro };

      if (tier === 1) {
        const truth = (profit / revenue) * 100;
        if (looksCharted(truth, chart)) return null;
        const { options, correctIndex, correct } = choiceOptions(truth, random, {
          format: unitOption('', '%'),
          finestStep: 0.1,
          // Gross margin, or operating profit over gross profit.
          traps: [(gross / revenue) * 100, (profit / gross) * 100],
          trapReach: Infinity,
        });
        return {
          targetTimeMs: 60_000,
          prompt: `What was ${s.name}’s operating margin last year?`,
          context: [intro, { ...chart, highlight: 6 }],
          answer: { kind: 'choice', options, correctIndex },
          solution: [`Operating profit ${f(profit)}, revenue ${f(revenue)}`, `Margin: ${f(profit)} ÷ ${f(revenue)} = ${approx(truth)}%`, `Closest option: ${correct}`],
          shortcut: `Margin is profit over revenue, the first bar, not over gross profit: 10% of ${f(revenue)} is ${approx(revenue / 10)}, and ${f(profit)} is ${approx(profit / (revenue / 10))} of those.`,
        };
      }

      if (tier === 2) {
        // Read off gridlines, two tall bars set a share closely; the three thin cost bars would not.
        const truth = (gross / revenue) * 100;
        const answer = (c: ChartBlock) => (c.series[0]!.values[2]! / c.series[0]!.values[0]!) * 100;
        const band = readingBand(chart, answer);
        if (!readable(truth, band) || looksCharted(truth, chart)) return null;
        const { options, correctIndex, correct } = estimateOptions(truth, band, random, {
          format: unitOption('', '%'),
          finestStep: 1,
          // Operating profit, or the cost of goods, taken over revenue.
          traps: [(profit / revenue) * 100, (goods / revenue) * 100],
        });
        // A margin never reaches 100%, so neither may an option.
        if (options.some((o) => Number.parseFloat(o) >= 100)) return null;
        return {
          targetTimeMs: 75_000,
          prompt: `Roughly what was ${s.name}’s gross margin last year?`,
          context: [intro, chart],
          answer: { kind: 'choice', options, correctIndex },
          solution: [
            `Reading the bars: revenue ends at about ${f(revenue)}, gross profit at about ${f(gross)}`,
            `Gross margin: ${f(gross)} ÷ ${f(revenue)} = ${approx(truth)}%`,
            `Closest option: ${correct}`,
          ],
          shortcut: `Gross profit is the first subtotal bar, after cost of goods only. Count gridlines: about ${oneDecimal(gross / axis.step)} of ${oneDecimal(revenue / axis.step)} for revenue.`,
        };
      }

      const rise = pick(random, [5, 10, 15, 20]);
      const truth = ((goods * rise) / 100 / profit) * 100;
      if (truth < rise * 1.5 || looksCharted(truth, chart)) return null;
      const { options, correctIndex, correct } = choiceOptions(truth, random, {
        format: unitOption('', '%'),
        finestStep: 0.1,
        // The rise itself, or the fall measured against gross profit.
        traps: [rise, ((goods * rise) / 100 / gross) * 100],
        trapReach: Infinity,
      });
      return {
        targetTimeMs: 90_000,
        prompt: `If the cost of goods rose by ${rise}% and everything else stayed the same, by roughly what percentage would operating profit fall?`,
        context: [intro, { ...chart, highlight: 1 }],
        answer: { kind: 'choice', options, correctIndex },
        solution: [
          `Extra cost: ${rise}% × ${f(goods)} = ${approx((goods * rise) / 100)}`,
          `Fall in operating profit: ${approx((goods * rise) / 100)} ÷ ${f(profit)} = ${approx(truth)}%`,
          `Closest option: ${correct}`,
        ],
        shortcut: `Cost of goods is ${approx(goods / profit)} times operating profit, so a ${rise}% rise in it takes ${approx(goods / profit)} × ${rise}% off profit.`,
      };
    });
  },
};
