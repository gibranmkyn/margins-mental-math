import { formatNumber as f } from '../../format';
import { randomInt } from '../../random';
import type { ChartBlock } from '../../types';
import { choiceOptions } from '../scenario/options';
import { approx, pick } from '../scenario/text';
import type { ScenarioTemplate } from '../template';
import { looksCharted, snap, unitOption, until } from './charts';
import { estimateOptions, readable, readingBand } from './estimate';

interface Setting {
  intro: (count: number, total: string) => string;
  title: string;
  /** What is ranked: singular and plural. */
  one: string;
  many: string;
  /** What is measured, completing "Roughly what are the ... of the 3rd largest market?" */
  measure: string;
  /** Number of things ranked. */
  count: [number, number];
  /** The total, in `scale`. */
  total: [number, number];
  scale: 'bn' | 'm';
}

const SETTINGS: Setting[] = [
  {
    intro: (count, total) =>
      `A drug maker wants to grow in emerging markets. Prescription drug sales across the ${count} largest emerging markets are projected to reach ${total} in ten years.`,
    title: 'Projected sales in ten years, by market',
    one: 'market',
    many: 'markets',
    measure: 'projected sales',
    count: [30, 50],
    total: [80, 240],
    scale: 'bn',
  },
  {
    intro: (count, total) => `A software company sells to ${count} business customers, who paid it ${total} last year in total.`,
    title: 'Revenue by customer, last year',
    one: 'customer',
    many: 'customers',
    measure: 'revenue',
    count: [120, 400],
    total: [24, 90],
    scale: 'm',
  },
  {
    intro: (count, total) => `A supermarket chain ranks its ${count} stores by sales before deciding where to refit first. Together they sold ${total} last year.`,
    title: 'Sales by store, last year',
    one: 'store',
    many: 'stores',
    measure: 'sales',
    count: [40, 90],
    total: [300, 980],
    scale: 'm',
  },
  {
    intro: (count, total) => `A snack maker sells ${count} products. Its revenue last year was ${total}.`,
    title: 'Revenue by product, last year',
    one: 'product',
    many: 'products',
    measure: 'revenue',
    count: [25, 60],
    total: [110, 460],
    scale: 'm',
  },
];

const TOP = 5;

export function ordinal(n: number): string {
  return `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
}

/**
 * Pareto bars: the running share of a total held by the largest one, two, ...
 * five members, then all of them. Tier 1 labels the bars and asks one
 * member's amount; tier 2 asks the combined amount of the 2nd to the 4th or
 * 5th largest, with bars read off 10% gridlines; tier 3 labels the bars and
 * asks how much the total would rise if one member grew. Each asked share is
 * the step from the bar before; the trap of reading the bar as the share is
 * among the options whenever an option can sit above the answer.
 */
export const cumulativeShare: ScenarioTemplate = {
  id: 'cumulative-share',
  skill: 'cumulative-charts',
  tiers: [1, 2, 3],
  build(tier, random) {
    const s = pick(random, SETTINGS);
    const labelled = tier !== 2;
    // Estimated bars stand on whole 2% marks: a fifth of a 10% gridline.
    const grain = labelled ? 1 : 2;

    return until(() => {
      const count = randomInt(random, s.count[0], s.count[1]);
      const total = randomInt(random, s.total[0], s.total[1]);
      const totalText = `$${f(total)}${s.scale}`;

      // Own shares fall with rank; the bars are their running totals.
      // Read off gridlines, the run asked about is a flatter tail, so its step stands tall.
      const own: number[] = [tier === 2 ? randomInt(random, 15, 22) : randomInt(random, 14, 30)];
      for (let k = 1; k < TOP; k++) own.push((own[k - 1]! * (tier === 2 ? randomInt(random, 80, 95) : randomInt(random, 55, 92))) / 100);
      let running = 0;
      const bars = own.map((v) => snap((running += v), grain));
      if (bars.at(-1)! > 85) return null;
      const values = [...bars, 100];
      const steps = bars.map((v, k) => v - (k > 0 ? bars[k - 1]! : 0));
      // Ranked largest first, so each step is smaller than the one before, and none is a sliver.
      if (steps.some((v, k) => v < 4 || (k > 0 && v >= steps[k - 1]!))) return null;

      const chart: ChartBlock = {
        type: 'chart',
        chart: 'cumulative',
        title: s.title,
        unit: `Cumulative share of ${s.measure}, %; largest ${s.one} first`,
        categories: [...bars.map((_, k) => `Top ${k + 1}`), `All ${count}`],
        series: [{ name: 'Cumulative share', values }],
        axis: { min: 0, max: 100, step: labelled ? 20 : 10 },
        labelled,
        decimals: 0,
        suffix: '%',
        note: `Total, all ${count} ${s.many}: ${totalText}`,
      };

      // Tiers 1 and 3 ask one of the 2nd to 4th largest: a step between two bars, never the first bar alone.
      // Tier 2 asks the 2nd to the 4th or 5th largest together, so the step stands tall against 10% gridlines.
      const first = tier === 2 ? 2 : randomInt(random, 2, 4);
      const last = tier === 2 ? randomInt(random, 4, 5) : first;
      const below = bars[first - 2]!;
      const at = bars[last - 1]!;
      const share = at - below;
      const amount = (share * total) / 100;
      const format = unitOption('$', s.scale);
      const intro = { type: 'paragraph' as const, text: s.intro(count, totalText) };
      const who = first === last ? `the ${ordinal(first)} largest ${s.one}` : `the ${ordinal(first)} to ${ordinal(last)} largest ${s.many}`;
      const reading = labelled
        ? `Top ${first - 1} = ${below}%, Top ${last} = ${at}%`
        : `Reading the bars: Top ${first - 1} ≈ ${below}%, Top ${last} ≈ ${at}%`;
      const stepLine = `The bars are cumulative, so ${who} ${first === last ? 'is' : 'are'} the step between them: ${at}% − ${below}% = ${share}%`;
      const tenth =
        share === 10
          ? `${share}% is simply a tenth of ${totalText}: $${approx(total / 10)}${s.scale}.`
          : `10% of ${totalText} is $${approx(total / 10)}${s.scale}, so ${share}% is ${f(share / 10)} times that, about $${approx(amount)}${s.scale}.`;

      if (tier !== 3) {
        const truth = amount;
        // Reading the last bar as the asked share, or reading the bar before it.
        const traps = [at, below].map((v) => (v * total) / 100);
        if (looksCharted(truth, chart) || traps.some((t) => Math.abs(t - truth) < truth * 0.25)) return null;
        const answer = (c: ChartBlock) => ((c.series[0]!.values[last - 1]! - c.series[0]!.values[first - 2]!) * total) / 100;
        const band = readingBand(chart, answer);
        if (!labelled && !readable(truth, band)) return null;
        // The classic trap, the bar read as the share, is on offer whenever an option can sit above the answer.
        const { options, correctIndex, correct } = labelled
          ? choiceOptions(truth, random, { format, finestStep: 0.01, traps, trapReach: Infinity })
          : estimateOptions(truth, band, random, { format, finestStep: 0.1, traps, trapReach: Infinity });
        const what = s.measure === 'revenue' ? 'revenue' : s.measure;
        const verb = `${s.measure === 'revenue' ? 'is' : 'are'} the ${first !== last ? 'combined ' : ''}${what}`;
        return {
          targetTimeMs: labelled ? 60_000 : 75_000,
          prompt: `Roughly what ${verb} of ${who}?`,
          context: [intro, chart],
          answer: { kind: 'choice', options, correctIndex },
          solution: [reading, stepLine, `${capital(s.measure)}: ${share}% × ${totalText} = $${approx(truth)}${s.scale}`, `Closest option: ${correct}`],
          shortcut: `Never read a cumulative bar as one ${s.one}: subtract the bar before ${first === last ? 'it' : 'the run'}. ${tenth}`,
        };
      }

      const growth = pick(random, [10, 15, 20, 25, 30, 40, 50]);
      const truth = (amount * growth) / 100;
      const traps = [(at * total * growth) / 10_000, (below * total * growth) / 10_000];
      // At least 0.4 in the total's unit, so options a tenth apart stay close neighbours.
      if (truth < 0.4 || looksCharted(truth, chart) || traps.some((t) => Math.abs(t - truth) < truth * 0.25)) return null;
      const { options, correctIndex, correct } = choiceOptions(truth, random, { format, finestStep: 0.01, traps, trapReach: Infinity });
      return {
        targetTimeMs: 90_000,
        prompt: `If ${who} grew by ${growth}% and every other ${s.one} stayed the same, by roughly how much would the total rise?`,
        context: [intro, chart],
        answer: { kind: 'choice', options, correctIndex },
        solution: [
          reading,
          stepLine,
          `Its ${s.measure}: ${share}% × ${totalText} = $${approx(amount)}${s.scale}`,
          `Rise: ${growth}% × $${approx(amount)}${s.scale} = $${approx(truth)}${s.scale}`,
          `Closest option: ${correct}`,
        ],
        shortcut: `Multiply the shares first: ${growth}% of ${share}% is ${f((growth * share) / 100)}% of the total, then take that of ${totalText}.`,
      };
    });
  },
};

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
