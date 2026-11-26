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
  /** What is measured, completing "By what percentage did ... grow". */
  measure: string;
  prefix: string;
  suffix: string;
  /** Range of the first year's value. */
  start: [number, number];
}

const SETTINGS: Setting[] = [
  {
    intro: 'A coffee chain has been opening stores across the country and wants to know how fast its sales are moving.',
    title: 'Coffee chain revenue',
    unit: 'Revenue, $m',
    measure: 'revenue',
    prefix: '$',
    suffix: 'm',
    start: [40, 160],
  },
  {
    intro: 'A budget airline is planning fleet orders from its passenger history.',
    title: 'Passengers carried',
    unit: 'Passengers, millions',
    measure: 'the number of passengers',
    prefix: '',
    suffix: 'm',
    start: [12, 60],
  },
  {
    intro: 'A project-management software company reports its paying subscribers at each year end.',
    title: 'Paying subscribers',
    unit: 'Subscribers at year end, thousands',
    measure: 'the subscriber base',
    prefix: '',
    suffix: 'k',
    start: [30, 140],
  },
  {
    intro: 'A private clinic group is reviewing demand before opening another site.',
    title: 'Patient visits',
    unit: 'Patient visits, thousands',
    measure: 'the number of patient visits',
    prefix: '',
    suffix: 'k',
    start: [50, 200],
  },
];

/**
 * Revenue-style bars over five or six years. Tier 1 labels the bars and asks
 * the growth between two named years; tier 2 asks the growth over the whole
 * period with the bars read off gridlines; tier 3 labels the bars and asks
 * where the period's average yearly increase would take the figure two years on.
 */
export const barGrowth: ScenarioTemplate = {
  id: 'bar-growth',
  skill: 'bar-charts',
  tiers: [1, 2, 3],
  build(tier, random) {
    const s = pick(random, SETTINGS);
    const count = tier === 2 ? 6 : randomInt(random, 5, 6);
    const labels = years(random, count);
    const labelled = tier !== 2;

    return until(() => {
      const values: number[] = [];
      let v = randomInt(random, s.start[0], s.start[1]);
      for (let i = 0; i < count; i++) {
        values.push(v);
        // Read off gridlines, the rise must stand many gridlines tall, so those years grow briskly.
        v = v * (1 + randomInt(random, labelled ? -6 : 12, 24) / 100);
      }
      const axis = niceAxis(0, Math.max(...values) * 1.04, labelled ? 6 : 10);
      // Labelled bars print whole numbers; estimated bars sit on fifths of a gridline.
      const drawn = values.map((x) => (labelled ? Math.round(x) : Math.max(axis.step / 5, snap(x, axis.step / 5))));
      const chart: ChartBlock = {
        type: 'chart',
        chart: 'bar',
        title: s.title,
        unit: s.unit,
        categories: labels,
        series: [{ name: s.title, values: drawn }],
        axis,
        labelled,
        decimals: 0,
      };

      let from = 0;
      let to = count - 1;
      if (tier === 1) {
        from = randomInt(random, 0, count - 3);
        to = randomInt(random, from + 2, count - 1);
      }
      const a = drawn[from]!;
      const b = drawn[to]!;
      const fy = labels[from]!;
      const ty = labels[to]!;

      if (tier === 3) {
        const yearly = (b - a) / (count - 1);
        const truth = b + 2 * yearly;
        if (yearly <= 0 || looksCharted(truth, chart)) return null;
        const later = String(Number(ty) + 2);
        const { options, correctIndex, correct } = choiceOptions(truth, random, {
          format: unitOption(s.prefix, s.suffix),
          finestStep: 0.1,
          // Compounding the last year's change, or adding the whole period's rise once.
          traps: [b + (b - a), b + 2 * (b - drawn[to - 1]!)],
        });
        return {
          targetTimeMs: 90_000,
          prompt: `If ${s.measure} keeps rising by the average yearly increase of ${fy}–${ty}, what will it be in ${later}, two years after ${ty}?`,
          context: [{ type: 'paragraph', text: s.intro }, chart],
          answer: { kind: 'choice', options, correctIndex },
          solution: [
            `Rise over the period: ${f(b)} − ${f(a)} = ${f(b - a)}`,
            `Average yearly increase: ${f(b - a)} ÷ ${count - 1} = ${approx(yearly)}`,
            `${later}: ${f(b)} + 2 × ${approx(yearly)} = ${approx(truth)}`,
            `Closest option: ${correct}`,
          ],
          shortcut: `${count - 1} yearly steps separate ${fy} and ${ty}; two more steps add 2/${count - 1} of the whole rise: ${f(b - a)} × 2/${count - 1} ≈ ${approx(2 * yearly)} on top of ${f(b)}.`,
        };
      }

      if (tier === 2) {
        // Read off gridlines, a percentage would swing too far with each misread bar to set close options; the rise itself does not.
        const truth = b - a;
        const answer = (c: ChartBlock) => c.series[0]!.values[to]! - c.series[0]!.values[from]!;
        const band = readingBand(chart, answer);
        if (truth <= 0 || !readable(truth, band) || looksCharted(truth, chart)) return null;
        const { options, correctIndex, correct } = estimateOptions(truth, band, random, { format: unitOption(s.prefix, s.suffix), finestStep: 1 });
        const step = axis.step;
        return {
          targetTimeMs: 75_000,
          prompt: `By roughly how much did ${s.measure} rise from ${fy} to ${ty}?`,
          context: [{ type: 'paragraph', text: s.intro }, chart],
          answer: { kind: 'choice', options, correctIndex },
          solution: [`Reading the bars: ${fy} ≈ ${f(a)}, ${ty} ≈ ${f(b)}`, `Rise: ${f(b)} − ${f(a)} = ${f(truth)}`, `Closest option: ${correct}`],
          shortcut: `Count the gridlines between the two bar tops instead of reading each bar: about ${oneDecimal(truth / step)} gaps of ${f(step)} each, so a rise of about ${f(snap(truth, 1e-6))}.`,
        };
      }

      const truth = (b / a - 1) * 100;
      if (truth < 8 || looksCharted(truth, chart)) return null;
      const { options, correctIndex, correct } = choiceOptions(truth, random, {
        format: unitOption('', '%'),
        finestStep: 0.1,
        // Growth measured against the later year, or the plain difference read as a percentage.
        traps: [(1 - a / b) * 100, b - a],
      });
      return {
        targetTimeMs: 60_000,
        prompt: `By roughly what percentage did ${s.measure} grow from ${fy} to ${ty}?`,
        context: [{ type: 'paragraph', text: s.intro }, chart],
        answer: { kind: 'choice', options, correctIndex },
        solution: [`${fy} = ${f(a)}, ${ty} = ${f(b)}`, `Growth: ${f(b)} ÷ ${f(a)} − 1 = ${approx(truth)}%`, `Closest option: ${correct}`],
        shortcut: `Compare the rise with the start: ${f(b - a)} on ${f(a)} is ${approx(truth / 100)} of it, about ${approx(truth)}%.`,
      };
    });
  },
};
