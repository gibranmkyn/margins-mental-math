import { formatNumber as f } from '../../format';
import { randomInt } from '../../random';
import type { ChartBlock } from '../../types';
import { choiceOptions } from '../scenario/options';
import { approx, pick } from '../scenario/text';
import type { ScenarioTemplate } from '../template';
import { looksCharted, unitOption, until, years } from './charts';
import { splitShares } from './pie-amount';

interface Setting {
  intro: string;
  title: string;
  /** What the pie splits, for prompts: "revenue". */
  whole: string;
  slices: string[];
  /** Total in $m. */
  total: [number, number];
}

const SETTINGS: Setting[] = [
  {
    intro: 'A sports-goods maker sells across five product lines.',
    title: 'Revenue by product line',
    whole: 'revenue',
    slices: ['Footwear', 'Apparel', 'Bikes', 'Outdoor', 'Fitness'],
    total: [60, 400],
  },
  {
    intro: 'A media group earns money from four kinds of business.',
    title: 'Revenue by business',
    whole: 'revenue',
    slices: ['Streaming', 'Advertising', 'Licensing', 'Events'],
    total: [120, 900],
  },
  {
    intro: 'A fruit grower sells its harvest through four routes to market.',
    title: 'Sales by route to market',
    whole: 'sales',
    slices: ['Supermarkets', 'Wholesale', 'Export', 'Farm shop'],
    total: [10, 80],
  },
];

/**
 * A revenue-mix pie. Tier 1 asks one slice’s new share after it grows and the
 * rest stand still; tier 2 gives one slice’s amount and asks two others’
 * combined; tier 3 shows the mix in two years, with each year’s total, and asks
 * one slice’s growth.
 */
export const pieShift: ScenarioTemplate = {
  id: 'pie-shift',
  skill: 'pie-charts',
  tiers: [1, 2, 3],
  build(tier, random) {
    const s = pick(random, SETTINGS);
    const n = s.slices.length;

    return until(() => {
      const shares = splitShares(random, n);
      const x = randomInt(random, 0, n - 1);
      const pie = (title: string, values: number[], note?: string): ChartBlock => ({
        type: 'chart',
        chart: 'pie',
        title,
        unit: `Share of ${s.whole}, %`,
        categories: s.slices,
        series: [{ name: title, values }],
        labelled: true,
        decimals: 0,
        suffix: '%',
        highlight: x,
        ...(note ? { note } : {}),
      });
      const intro = { type: 'paragraph' as const, text: s.intro };

      if (tier === 1) {
        const growth = pick(random, [20, 25, 40, 50, 60, 75, 100]);
        const grown = (shares[x]! * (100 + growth)) / 100;
        const truth = (grown / (100 + grown - shares[x]!)) * 100;
        const chart = pie(s.title, shares);
        if (looksCharted(truth, chart)) return null;
        const { options, correctIndex, correct } = choiceOptions(truth, random, {
          format: unitOption('', '%'),
          finestStep: 0.1,
          // Growing the share itself, forgetting the total grows too.
          traps: [grown],
        });
        return {
          targetTimeMs: 75_000,
          prompt: `If ${s.slices[x]} grows by ${growth}% and the other ${['two', 'three', 'four', 'five'][n - 3]} stay the same, what share of ${s.whole} will ${s.slices[x]} make up?`,
          context: [intro, chart],
          answer: { kind: 'choice', options, correctIndex },
          solution: [
            `Work per 100 of today’s ${s.whole}: ${s.slices[x]} goes from ${shares[x]} to ${exact(grown)}`,
            `New total: 100 − ${shares[x]} + ${exact(grown)} = ${exact(100 + grown - shares[x]!)}`,
            `New share: ${exact(grown)} ÷ ${exact(100 + grown - shares[x]!)} = ${approx(truth)}%`,
            `Closest option: ${correct}`,
          ],
          shortcut: `Treat today’s total as 100: the slice becomes ${exact(grown)} and the total ${exact(100 + grown - shares[x]!)}, so the share is a little under ${exact(grown)}%.`,
        };
      }

      if (tier === 2) {
        const amount = randomInt(random, s.total[0], s.total[1]) * shares[x]! / 100;
        const given = Math.round(amount * 10) / 10;
        if (given <= 0) return null;
        const others = [0, 1, 2, 3, 4].slice(0, n).filter((i) => i !== x);
        const y = others[randomInt(random, 0, others.length - 1)]!;
        const z = others.filter((i) => i !== y)[randomInt(random, 0, others.length - 2)]!;
        const [p, q] = y < z ? [y, z] : [z, y];
        const pair = shares[p]! + shares[q]!;
        const truth = (given / shares[x]!) * pair;
        const chart = pie(s.title, shares);
        if (looksCharted(truth, chart)) return null;
        const { options, correctIndex, correct } = choiceOptions(truth, random, {
          format: unitOption('$', 'm'),
          finestStep: 0.01,
          // Taking the pair's share of the one slice instead of the whole.
          traps: [(given * pair) / 100],
        });
        return {
          targetTimeMs: 75_000,
          prompt: `${s.slices[x]} brought in $${f(given)}m. Roughly how much did ${s.slices[p]} and ${s.slices[q]} bring in together?`,
          context: [intro, chart],
          answer: { kind: 'choice', options, correctIndex },
          solution: [
            `Total: $${f(given)}m ÷ ${shares[x]}% = $${approx(given / shares[x]! * 100)}m`,
            `${s.slices[p]} + ${s.slices[q]}: ${shares[p]}% + ${shares[q]}% = ${pair}%`,
            `${pair}% × $${approx(given / shares[x]! * 100)}m = $${approx(truth)}m`,
            `Closest option: ${correct}`,
          ],
          shortcut: `Skip the total: scale ${s.slices[x]}’s $${f(given)}m by the ratio of shares, ${pair} to ${shares[x]}.`,
        };
      }

      const [y0, y1] = years(random, 2) as [string, string];
      const t0 = randomInt(random, s.total[0], s.total[1]);
      const t1 = Math.round(t0 * (1 + randomInt(random, -5, 25) / 100));
      // Next year's mix drifts a few points from this year's.
      const later = shares.map((v) => Math.max(5, v + randomInt(random, -4, 4)));
      const drift = 100 - later.reduce((a, b) => a + b, 0);
      const biggest = later.indexOf(Math.max(...later));
      later[biggest] = later[biggest]! + drift;
      if (later.some((v) => v < 5)) return null;
      const a = (shares[x]! * t0) / 100;
      const b = (later[x]! * t1) / 100;
      const truth = (b / a - 1) * 100;
      const first = pie(`${s.title}, ${y0}`, shares, `Total ${s.whole} in ${y0}: $${f(t0)}m`);
      const second = pie(`${s.title}, ${y1}`, later, `Total ${s.whole} in ${y1}: $${f(t1)}m`);
      // The asked slice's share moves, so the answer is neither the total's growth nor the share's alone.
      if (later[x] === shares[x] || truth < 5 || looksCharted(truth, first, second)) return null;
      const { options, correctIndex, correct } = choiceOptions(truth, random, {
        format: unitOption('', '%'),
        finestStep: 0.1,
        // The growth of the total, or of the share alone.
        traps: [(t1 / t0 - 1) * 100, (later[x]! / shares[x]! - 1) * 100],
      });
      return {
        targetTimeMs: 105_000,
        prompt: `By roughly what percentage did ${s.slices[x]}’s ${s.whole} grow from ${y0} to ${y1}?`,
        context: [intro, first, second],
        answer: { kind: 'choice', options, correctIndex },
        solution: [
          `${y0}: ${shares[x]}% × $${f(t0)}m = $${approx(a)}m`,
          `${y1}: ${later[x]}% × $${f(t1)}m = $${approx(b)}m`,
          `Growth: ${approx(b)} ÷ ${approx(a)} − 1 = ${approx(truth)}%`,
          `Closest option: ${correct}`,
        ],
        shortcut: `Multiply the share’s change by the total’s: the share moves ×${approx(later[x]! / shares[x]!)} and the total ×${approx(t1 / t0)}, so ${approx(later[x]! / shares[x]!)} × ${approx(t1 / t0)} gives ×${approx(b / a)} in all.`,
      };
    });
  },
};

/** A sum of whole shares and a grown share, printed in full: 108.4, never 108. */
function exact(value: number): string {
  return f(Math.round(value * 100) / 100);
}
