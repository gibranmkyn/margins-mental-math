import { formatNumber as f } from '../../format';
import { randomInt } from '../../random';
import type { ChartBlock } from '../../types';
import { choiceOptions } from '../scenario/options';
import { approx, pick } from '../scenario/text';
import type { ScenarioTemplate } from '../template';
import { niceAxis } from './axis';
import { looksCharted, snap, unitOption, until, years } from './charts';
import { estimateOptions, readable, readingBand } from './estimate';

interface Cost {
  /** The bar's name. */
  name: string;
  /** Names the change in a sentence and contains the bar's name in lower case: "the rise in fuel costs". */
  phrase: string;
}

interface Setting {
  intro: string;
  /** The revenue gains, drawn first. */
  gains: [string, string];
  /** The cost increases, drawn after the gains. */
  costs: [Cost, Cost, Cost];
  /** Range of the first year's operating profit, $m. */
  start: [number, number];
}

const SETTINGS: Setting[] = [
  {
    intro: 'A coffee chain explains to its board how operating profit moved over the year: higher prices and more cups sold added to it, cost increases took away from it.',
    gains: ['Price', 'Volume'],
    costs: [
      { name: 'Coffee beans', phrase: 'dearer coffee beans' },
      { name: 'Wages', phrase: 'the rise in wages' },
      { name: 'Rent', phrase: 'the rent increase' },
    ],
    start: [60, 180],
  },
  {
    intro: 'A budget airline walks investors through the change in its operating profit: higher fares and more passengers added to it, cost increases took away from it.',
    gains: ['Fares', 'Passengers'],
    costs: [
      { name: 'Fuel', phrase: 'the rise in fuel costs' },
      { name: 'Crew pay', phrase: 'the rise in crew pay' },
      { name: 'Airport fees', phrase: 'higher airport fees' },
    ],
    start: [120, 400],
  },
  {
    intro: 'A software company breaks down the change in its operating profit: price rises and new customers added to it, cost increases took away from it.',
    gains: ['Price', 'New customers'],
    costs: [
      { name: 'Staff', phrase: 'the rise in staff costs' },
      { name: 'Hosting', phrase: 'higher hosting bills' },
      { name: 'Marketing', phrase: 'the extra marketing spend' },
    ],
    start: [40, 150],
  },
];

/**
 * A year-on-year operating profit bridge: last year's profit, two gains, three
 * cost increases, this year's profit. Tier 1 labels the bars and asks the
 * growth had one cost not risen; tier 2 asks the profit had costs stayed flat,
 * read off gridlines; tier 3 labels the bars and asks
 * what share of the gains the cost increases ate up.
 */
export const profitBridge: ScenarioTemplate = {
  id: 'profit-bridge',
  skill: 'waterfall-charts',
  tiers: [1, 2, 3],
  build(tier, random) {
    const s = pick(random, SETTINGS);
    const [y0, y1] = years(random, 2) as [string, string];
    const labelled = tier !== 2;

    return until(() => {
      const start = randomInt(random, s.start[0], s.start[1]);
      const rawGains = s.gains.map(() => (start * randomInt(random, tier === 2 ? 18 : 6, tier === 2 ? 40 : 30)) / 100);
      const rawCosts = s.costs.map(() => (-start * randomInt(random, 4, 22)) / 100);
      const raw = [start, ...rawGains, ...rawCosts];
      let peak = 0;
      raw.reduce((sum, v) => ((peak = Math.max(peak, sum + v)), sum + v), 0);
      const axis = niceAxis(0, peak * 1.04, labelled ? 6 : 10);
      // Labelled bars print whole numbers; estimated bars end on fifths of a gridline.
      const draw = (v: number) => (labelled ? Math.round(v) : snap(v, axis.step / 5));
      const drawn = raw.map(draw);
      if (drawn.some((v) => v === 0)) return null;
      const end = drawn.reduce((a, b) => a + b, 0);
      const values = [...drawn, end];
      let running = 0;
      for (const v of drawn) {
        running += v;
        if (running <= 0 || running > axis.max) return null;
      }
      const gains = drawn.slice(1, 3);
      const costs = drawn.slice(3, 6);
      const first = drawn[0]!;
      const names = [...s.gains, ...s.costs.map((c) => c.name)];
      const chart: ChartBlock = {
        type: 'chart',
        chart: 'waterfall',
        title: `Operating profit, ${y0} to ${y1}`,
        unit: 'Operating profit, $m',
        categories: [y0, ...names, y1],
        series: [{ name: 'Operating profit', values }],
        totals: [0, values.length - 1],
        axis,
        labelled,
        decimals: 0,
      };
      const intro = { type: 'paragraph' as const, text: s.intro };
      const signed = (v: number) => (v < 0 ? `−${f(-v)}` : `+${f(v)}`);

      if (tier === 1) {
        const c = randomInt(random, 0, 2);
        const cost = costs[c]!;
        const truth = ((end - cost) / first - 1) * 100;
        if (truth < 4 || looksCharted(truth, chart)) return null;
        const growth = (end / first - 1) * 100;
        const { options, correctIndex, correct } = choiceOptions(truth, random, {
          format: unitOption('', '%'),
          finestStep: 0.1,
          // The growth that happened, or the cost subtracted a second time.
          traps: [growth, ((end + cost) / first - 1) * 100].filter((t) => t > 0),
        });
        return {
          targetTimeMs: 75_000,
          prompt: `Excluding ${s.costs[c]!.phrase}, by roughly what percentage would operating profit have grown from ${y0} to ${y1}?`,
          context: [intro, { ...chart, highlight: 3 + c }],
          answer: { kind: 'choice', options, correctIndex },
          solution: [
            `${y1} profit without the ${s.costs[c]!.name} bar: ${f(end)} + ${f(-cost)} = ${f(end - cost)}`,
            `Growth on ${y0}: ${f(end - cost)} ÷ ${f(first)} − 1 = ${approx(truth)}%`,
            `Closest option: ${correct}`,
          ],
          shortcut: `Add the bar back rather than rebuilding the walk: ${f(end - cost - first)} more than ${y0}’s ${f(first)} is ${approx(truth)}%.`,
        };
      }

      if (tier === 2) {
        // One reading across to the axis: a percentage built from two misread bars would swing too far for close options.
        const gained = gains[0]! + gains[1]!;
        const truth = first + gained;
        const answer = (c: ChartBlock) => c.series[0]!.values[0]! + c.series[0]!.values[1]! + c.series[0]!.values[2]!;
        const band = readingBand(chart, answer);
        if (!readable(truth, band) || looksCharted(truth, chart)) return null;
        const { options, correctIndex, correct } = estimateOptions(truth, band, random, {
          format: unitOption('$', 'm'),
          finestStep: 1,
          // This year's actual profit, or last year's profit plus only the first gain.
          traps: [end, first + gains[0]!],
        });
        return {
          targetTimeMs: 75_000,
          prompt: `Had costs stayed flat, roughly what would operating profit have been in ${y1}?`,
          context: [intro, chart],
          answer: { kind: 'choice', options, correctIndex },
          solution: [
            `Flat costs remove the three cost bars, so ${y1} profit is where the walk stands after the two gains`,
            `Reading the bars: ${y0} ends at about ${f(first)}; ${s.gains[0]} ${signed(gains[0]!)} and ${s.gains[1]} ${signed(gains[1]!)} take the walk to about ${f(truth)}`,
            `Closest option: ${correct}`,
          ],
          shortcut: `Skip the cost bars entirely: read straight across from the end of the last gain bar to the axis.`,
        };
      }

      const gained = gains[0]! + gains[1]!;
      const lost = -(costs[0]! + costs[1]! + costs[2]!);
      const truth = (lost / gained) * 100;
      if (looksCharted(truth, chart)) return null;
      const { options, correctIndex, correct } = choiceOptions(truth, random, {
        format: unitOption('', '%'),
        finestStep: 0.1,
        // Cost increases against last year's profit, or against this year's.
        traps: [(lost / first) * 100, (lost / end) * 100],
      });
      return {
        targetTimeMs: 90_000,
        prompt: `Roughly what percentage of the gains from ${s.gains[0].toLowerCase()} and ${s.gains[1].toLowerCase()} did the cost increases offset?`,
        context: [intro, chart],
        answer: { kind: 'choice', options, correctIndex },
        solution: [
          `Gains: ${gains.map(signed).join(' ')} = ${f(gained)}`,
          `Cost increases: ${costs.map(signed).join(' ')} = −${f(lost)}`,
          `Offset: ${f(lost)} ÷ ${f(gained)} = ${approx(truth)}%`,
          `Closest option: ${correct}`,
        ],
        shortcut: `Compare the two sums, not the bars one by one: ${f(lost)} of ${f(gained)} is ${approx(truth / 100)} of it.`,
      };
    });
  },
};
