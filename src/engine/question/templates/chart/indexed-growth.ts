import { formatNumber as f } from '../../format';
import { randomInt } from '../../random';
import type { ChartBlock } from '../../types';
import { choiceOptions } from '../scenario/options';
import { approx, pick } from '../scenario/text';
import type { ScenarioTemplate } from '../template';
import { niceAxis } from './axis';
import { looksCharted, snap, unitOption, until, years } from './charts';
import { estimateOptions, readable, readingBand } from './estimate';

interface Setting {
  intro: string;
  title: string;
  /** What is indexed, for prompts and the base-year list. */
  measure: string;
  names: [string, string, string];
  /** First-year values, $m. */
  base: [number, number];
}

const SETTINGS: Setting[] = [
  {
    intro: 'An analyst compares how fast listed supermarket chains have grown, with each chain’s revenue indexed to its first year.',
    title: 'Revenue growth of listed grocers',
    measure: 'revenue',
    names: ['Freshco', 'Basket', 'Greenway'],
    base: [120, 900],
  },
  {
    intro: 'A games publisher benchmarks its operating profit against its rivals, each indexed to its first year.',
    title: 'Operating profit by publisher',
    measure: 'operating profit',
    names: ['Pixel', 'Arcadia', 'Ludo'],
    base: [20, 160],
  },
  {
    intro: 'A consultancy compares the fee income of its regional offices, each indexed to its first year.',
    title: 'Fee income by office',
    measure: 'fee income',
    names: ['Leeds', 'Bristol', 'Glasgow'],
    base: [8, 60],
  },
];

/**
 * Indexed lines: every series starts at 100, so the chart shows growth and the
 * actual values come from the first-year figures listed beside it. Tier 1
 * labels two lines and asks one firm’s final-year value; tier 2 asks the same
 * from three lines read off gridlines; tier 3 labels two lines and asks the gap
 * between two firms’ final-year values.
 */
export const indexedGrowth: ScenarioTemplate = {
  id: 'indexed-growth',
  skill: 'line-charts',
  tiers: [1, 2, 3],
  build(tier, random) {
    const s = pick(random, SETTINGS);
    const labels = years(random, 6);
    const labelled = tier !== 2;
    const count = tier === 2 ? 3 : 2;

    return until(() => {
      const lines = s.names.slice(0, count).map(() => {
        let v = 100;
        const trend = randomInt(random, -3, 14);
        return labels.map((_, k) => {
          if (k > 0) v = v * (1 + (trend + randomInt(random, -6, 6)) / 100);
          return v;
        });
      });
      const all = lines.flat();
      const axis = niceAxis(Math.min(...all, 100) * 0.92, Math.max(...all) * 1.04, labelled ? 6 : 8);
      const draw = (v: number, k: number) => (k === 0 ? 100 : labelled ? Math.round(v) : snap(v, axis.step / 5));
      const series = s.names.slice(0, count).map((name, i) => ({ name, values: lines[i]!.map(draw) }));
      if (series.some((x) => x.values.some((v) => v <= axis.min || v > axis.max))) return null;
      const bases = series.map(() => randomInt(random, s.base[0], s.base[1]));
      const x = randomInt(random, 0, count - 1);
      const chart: ChartBlock = {
        type: 'chart',
        chart: 'indexed-line',
        title: s.title,
        unit: `Index of ${s.measure}, ${labels[0]} = 100`,
        categories: labels,
        series,
        axis,
        labelled,
        decimals: 0,
        highlight: x,
      };
      const context = [
        { type: 'paragraph' as const, text: s.intro },
        { type: 'list' as const, items: series.map((line, i) => `${line.name}, ${s.measure} in ${labels[0]}: $${f(bases[i]!)}m`) },
        chart,
      ];
      const last = labels[5]!;
      const final = (i: number) => (bases[i]! * series[i]!.values[5]!) / 100;
      const name = s.names[x]!;

      if (tier !== 3) {
        const index = series[x]!.values[5]!;
        const truth = final(x);
        if (Math.abs(index - 100) < 15 || looksCharted(truth, chart)) return null;
        const format = unitOption('$', 'm');
        const answer = (c: ChartBlock) => (bases[x]! * c.series[x]!.values[5]!) / 100;
        const band = readingBand(chart, answer);
        if (!labelled && !readable(truth, band)) return null;
        const { options, correctIndex, correct } = labelled
          ? choiceOptions(truth, random, {
              format,
              finestStep: 0.1,
              // Reading the index as the value, or adding the index points as $m.
              traps: [bases[x]! + index - 100],
            })
          : estimateOptions(truth, band, random, { format, finestStep: 0.1 });
        return {
          targetTimeMs: labelled ? 60_000 : 75_000,
          prompt: `Roughly what was ${name}’s ${s.measure} in ${last}?`,
          context,
          answer: { kind: 'choice', options, correctIndex },
          solution: [
            `${name}’s index in ${last}: ${labelled ? '' : 'about '}${f(index)}, so ${f(index / 100)} times its ${labels[0]} level`,
            `${s.measure.charAt(0).toUpperCase()}${s.measure.slice(1)}: $${f(bases[x]!)}m × ${f(index / 100)} = $${approx(truth)}m`,
            `Closest option: ${correct}`,
          ],
          shortcut: `An index is a multiplier on the first year (${f(index)} means ×${f(index / 100)}); lines that cross only show who grew faster, not who is bigger.`,
        };
      }

      const y = 1 - x;
      const gap = final(x) - final(y);
      // Ask about the gap between the larger and the smaller firm in the last year.
      if (gap < Math.max(final(x), final(y)) * 0.12 || looksCharted(gap, chart)) return null;
      const { options, correctIndex, correct } = choiceOptions(gap, random, {
        format: unitOption('$', 'm'),
        finestStep: 0.01,
        // Comparing first-year values, or the index points.
        traps: [bases[x]! - bases[y]!, series[x]!.values[5]! - series[y]!.values[5]!],
      });
      return {
        targetTimeMs: 105_000,
        prompt: `In ${last}, by roughly how much did ${name}’s ${s.measure} exceed ${s.names[y]}’s?`,
        context,
        answer: { kind: 'choice', options, correctIndex },
        solution: [
          // Whole $m times a two-decimal multiplier: printed in full, so the gap is the plain difference shown.
          `${name}: $${f(bases[x]!)}m × ${f(series[x]!.values[5]! / 100)} = $${cents(final(x))}m`,
          `${s.names[y]}: $${f(bases[y]!)}m × ${f(series[y]!.values[5]! / 100)} = $${cents(final(y))}m`,
          `Gap: ${cents(final(x))} − ${cents(final(y))} = $${cents(gap)}m`,
          `Closest option: ${correct}`,
        ],
        shortcut: `Turn each index into money before comparing; the higher line need not be the bigger firm.`,
      };
    });
  },
};

/** A product of whole $m and a two-decimal index, printed exactly: 200.34. */
function cents(value: number): string {
  return f(Math.round(value * 100) / 100);
}
