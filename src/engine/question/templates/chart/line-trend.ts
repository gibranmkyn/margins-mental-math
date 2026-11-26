import { formatNumber as f } from '../../format';
import { randomInt } from '../../random';
import type { ChartBlock } from '../../types';
import { choiceOptions } from '../scenario/options';
import { approx, oneDecimal, pick } from '../scenario/text';
import type { ScenarioTemplate } from '../template';
import { niceAxis } from './axis';
import { looksCharted, snap, unitOption, until, years } from './charts';
import { estimateOptions, readable, readingBand } from './estimate';

interface Setting {
  intro: string;
  title: string;
  unit: string;
  /** What the lines measure, for prompts: "average price". */
  measure: string;
  names: [string, string];
  prefix: string;
  suffix: string;
  range: [number, number];
}

const SETTINGS: Setting[] = [
  {
    intro: 'A coffee roaster compares the average shelf price of its bags with its main rival’s.',
    title: 'Average shelf price per bag',
    unit: 'Price, $',
    measure: 'shelf price',
    names: ['Roastly', 'Rival'],
    prefix: '$',
    suffix: '',
    range: [6, 16],
  },
  {
    intro: 'Two ride-hailing apps compete in the same city; an analyst plots their monthly active riders.',
    title: 'Monthly active riders',
    unit: 'Riders, thousands',
    measure: 'monthly active riders',
    names: ['Zoom', 'Hop'],
    prefix: '',
    suffix: 'k',
    range: [60, 240],
  },
  {
    intro: 'A dairy co-operative tracks milk collected from its two largest farms.',
    title: 'Milk collected',
    unit: 'Milk, million litres',
    measure: 'milk collection',
    names: ['Hillside', 'Meadow'],
    prefix: '',
    suffix: 'm',
    range: [20, 80],
  },
];

/**
 * Two lines over six years. Tier 1 labels every point and asks how far one
 * line sat above the other in a year; tier 2 asks how far one line rose over the
 * period, read off gridlines; tier 3 asks one line’s average across the six
 * years, read off gridlines.
 */
export const lineTrend: ScenarioTemplate = {
  id: 'line-trend',
  skill: 'line-charts',
  tiers: [1, 2, 3],
  build(tier, random) {
    const s = pick(random, SETTINGS);
    const labels = years(random, 6);
    const labelled = tier === 1;
    const smallValues = s.range[1] < 20;

    return until(() => {
      const x = randomInt(random, 0, 1);
      const lines = s.names.map((_, i) => {
        let v = randomInt(random, s.range[0] * 10, s.range[1] * 10) / 10;
        // Read off gridlines, the asked line climbs steadily, so its rise spans many gridlines.
        const trend = tier === 2 && i === x ? randomInt(random, 9, 14) : randomInt(random, -4, 12);
        return labels.map(() => {
          const now = v;
          v = v * (1 + (trend + randomInt(random, -7, 7)) / 100);
          return now;
        });
      });
      const all = lines.flat();
      const axis = niceAxis(Math.min(...all) * 0.85, Math.max(...all) * 1.05, labelled ? 6 : 10);
      if (axis.min < 0) return null;
      const decimals = labelled && smallValues ? 1 : 0;
      const draw = (v: number) => (labelled ? snap(v, 10 ** -decimals) : snap(v, axis.step / 5));
      const series = s.names.map((name, i) => ({ name, values: lines[i]!.map(draw) }));
      if (series.some((line) => line.values.some((v) => v <= axis.min || v > axis.max))) return null;
      const chart: ChartBlock = {
        type: 'chart',
        chart: 'line',
        title: s.title,
        unit: s.unit,
        categories: labels,
        series,
        axis,
        labelled,
        decimals,
        highlight: x,
      };
      const intro = { type: 'paragraph' as const, text: s.intro };
      const mine = series[x]!.values;
      const name = s.names[x]!;

      if (tier === 1) {
        const k = randomInt(random, 1, 5);
        const other = series[1 - x]!.values[k]!;
        const truth = (mine[k]! / other - 1) * 100;
        if (truth < 6 || looksCharted(truth, chart)) return null;
        const { options, correctIndex, correct } = choiceOptions(truth, random, {
          format: unitOption('', '%'),
          finestStep: 0.1,
          // Measuring the gap against the higher line.
          traps: [(1 - other / mine[k]!) * 100],
        });
        return {
          targetTimeMs: 60_000,
          prompt: `In ${labels[k]}, by what percentage was ${name}’s ${s.measure} above ${s.names[1 - x]}’s?`,
          context: [intro, chart],
          answer: { kind: 'choice', options, correctIndex },
          solution: [
            `${labels[k]}: ${name} ${s.prefix}${f(mine[k]!)}, ${s.names[1 - x]} ${s.prefix}${f(other)}`,
            `Gap: ${f(mine[k]!)} ÷ ${f(other)} − 1 = ${approx(truth)}%`,
            `Closest option: ${correct}`,
          ],
          shortcut: `Divide the gap by ${f(other)}, not ${f(mine[k]!)}: “above ${s.names[1 - x]}’s” makes ${s.names[1 - x]} the base.`,
        };
      }

      if (tier === 2) {
        // Read off gridlines, a percentage would swing too far with each misreading to set close options; the rise itself does not.
        const a = mine[0]!;
        const b = mine[5]!;
        const truth = b - a;
        const answer = (c: ChartBlock) => c.series[x]!.values[5]! - c.series[x]!.values[0]!;
        const band = readingBand(chart, answer);
        if (truth <= 0 || !readable(truth, band) || looksCharted(truth, chart)) return null;
        const { options, correctIndex, correct } = estimateOptions(truth, band, random, {
          format: amountOption(s),
          finestStep: smallValues ? 0.1 : 1,
          // Reading the first value off the axis floor instead of the line.
          traps: [b - axis.min],
        });
        return {
          targetTimeMs: 75_000,
          prompt: `By roughly how much did ${name}’s ${s.measure} rise from ${labels[0]} to ${labels[5]}?`,
          context: [intro, chart],
          answer: { kind: 'choice', options, correctIndex },
          solution: [
            `Reading ${name}’s line: ${labels[0]} ≈ ${s.prefix}${f(a)}, ${labels[5]} ≈ ${s.prefix}${f(b)}`,
            `Rise: ${f(b)} − ${f(a)} = ${f(snap(truth, 1e-6))}`,
            `Closest option: ${correct}`,
          ],
          shortcut: `Count gridlines between the two points rather than reading each value: about ${oneDecimal(truth / axis.step)} gaps of ${s.prefix}${f(axis.step)} each. The axis starts at ${s.prefix}${f(axis.min)}, so never measure from the bottom edge.`,
        };
      }

      const truth = mine.reduce((a, b) => a + b, 0) / mine.length;
      if (looksCharted(truth, chart)) return null;
      const answer = (c: ChartBlock) => c.series[x]!.values.reduce((a, b) => a + b, 0) / c.series[x]!.values.length;
      const band = readingBand(chart, answer);
      if (!readable(truth, band)) return null;
      const { options, correctIndex, correct } = estimateOptions(truth, band, random, {
        format: amountOption(s),
        finestStep: smallValues ? 0.1 : 1,
      });
      return {
        targetTimeMs: 90_000,
        prompt: `Roughly what was ${name}’s average ${s.measure} across the six years shown?`,
        context: [intro, chart],
        answer: { kind: 'choice', options, correctIndex },
        solution: [
          `Reading ${name}’s line: ${mine.map((v) => f(v)).join(', ')}`,
          `Average: ${f(snap(mine.reduce((a, b) => a + b, 0), 1e-6))} ÷ 6 = ${approx(truth)}`,
          `Closest option: ${correct}`,
        ],
        shortcut: `Pick a round level near the middle of the line and average the differences from it; points above and below cancel out.`,
      };
    });
  },
};

/** An amount option in the setting's unit; dollar amounts with cents show both decimals. */
function amountOption(s: Setting) {
  return (value: number, decimals: number) => unitOption(s.prefix, s.suffix)(value, s.prefix === '$' && decimals > 0 ? 2 : decimals);
}
