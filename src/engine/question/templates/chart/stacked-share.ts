import { formatNumber as f } from '../../format';
import { randomInt } from '../../random';
import type { ChartBlock } from '../../types';
import { choiceOptions } from '../scenario/options';
import { approx, pick } from '../scenario/text';
import type { ScenarioTemplate } from '../template';
import { looksCharted, snap, unitOption, until, years } from './charts';
import { estimateOptions, readable, readingBand } from './estimate';

interface Setting {
  intro: string;
  market: string;
  brands: string[];
  /** Market size range, $m. */
  size: [number, number];
}

const SETTINGS: Setting[] = [
  {
    intro: 'A private-equity fund is looking at the sparkling-water market and the brands competing in it.',
    market: 'sparkling-water',
    brands: ['Fizz', 'Brook', 'Alpine', 'Others'],
    size: [180, 480],
  },
  {
    intro: 'A pet-food maker tracks its share of the premium dog-food market against its rivals.',
    market: 'premium dog-food',
    brands: ['Kibble Co', 'Waggs', 'Others'],
    size: [90, 300],
  },
  {
    intro: 'An investor is weighing up the market for home fitness apps.',
    market: 'fitness-app',
    brands: ['Pulse', 'Stride', 'Core', 'Others'],
    size: [60, 220],
  },
];

/**
 * 100% stacked bars of market share, with the market’s size printed above
 * each bar. Tier 1 labels the shares and asks one brand’s sales in a year;
 * tier 2 asks the same with shares read off 10% gridlines; tier 3 labels the
 * shares and asks the brand’s sales growth, which mixes share and market growth.
 */
export const stackedShare: ScenarioTemplate = {
  id: 'stacked-share',
  skill: 'stacked-bar-charts',
  tiers: [1, 2, 3],
  build(tier, random) {
    const s = pick(random, SETTINGS);
    const labels = years(random, tier === 3 ? 4 : 3);
    const labelled = tier !== 2;
    const n = s.brands.length;
    // Estimated shares sit on whole 2% marks: a fifth of a gridline.
    const grain = labelled ? 1 : 2;

    return until(() => {
      let size = randomInt(random, s.size[0], s.size[1]);
      const sizes = labels.map(() => {
        const now = Math.round(size);
        size = size * (1 + randomInt(random, -4, 14) / 100);
        return now;
      });
      // Shares drift a few points a year rather than jumping about.
      let parts = s.brands.slice(0, -1).map(() => snap(randomInt(random, 12, 40), grain));
      const shares = labels.map((_, k) => {
        if (k > 0) parts = parts.map((v) => snap(v + randomInt(random, -5, 6), grain));
        return [...parts, 100 - parts.reduce((a, b) => a + b, 0)];
      });
      if (shares.some((row) => row.some((v) => v < 12))) return null;

      // An estimated share is the bottom segment, read straight off the axis.
      const x = labelled ? randomInt(random, 0, n - 2) : 0;
      const brand = s.brands[x]!;
      const chart: ChartBlock = {
        type: 'chart',
        chart: 'stacked-bar-100',
        title: `Share of ${s.market} sales`,
        unit: 'Share of sales, %; market size above the bars',
        categories: labels,
        series: s.brands.map((name, i) => ({ name, values: shares.map((row) => row[i]!) })),
        axis: { min: 0, max: 100, step: labelled ? 20 : 10 },
        labelled,
        decimals: 0,
        suffix: '%',
        highlight: x,
        barNotes: sizes.map((m) => `$${f(m)}m`),
      };
      const intro = { type: 'paragraph' as const, text: s.intro };
      const share = (k: number) => shares[k]![x]!;

      if (tier !== 3) {
        const k = randomInt(random, 0, labels.length - 1);
        const truth = (share(k) * sizes[k]!) / 100;
        if (looksCharted(truth, chart)) return null;
        const format = unitOption('$', 'm');
        const answer = (c: ChartBlock) => (c.series[x]!.values[k]! * sizes[k]!) / 100;
        // An estimated segment is tall enough that a misreading moves the sales only a little.
        const band = readingBand(chart, answer);
        if (!labelled && !readable(truth, band)) return null;
        const { options, correctIndex, correct } = labelled
          ? choiceOptions(truth, random, { format, finestStep: 0.1, traps: [(share(k) * sizes[0]!) / 100] })
          : estimateOptions(truth, band, random, { format, finestStep: 1 });
        const reading = labelled ? `${brand}’s share in ${labels[k]}: ${share(k)}%` : `Reading ${brand}’s segment in ${labels[k]}: about ${share(k)}%`;
        return {
          targetTimeMs: labelled ? 60_000 : 75_000,
          prompt: `Roughly what were ${brand}’s sales in ${labels[k]}?`,
          context: [intro, chart],
          answer: { kind: 'choice', options, correctIndex },
          solution: [reading, `Sales: ${share(k)}% × $${f(sizes[k]!)}m = $${approx(truth)}m`, `Closest option: ${correct}`],
          shortcut: labelled
            ? `Take 10% of the market and scale: $${f(sizes[k]! / 10)}m × ${f(share(k) / 10)} = $${approx(truth)}m.`
            : `Count the 10% gridlines the ${brand} segment spans, then take that many tenths of $${f(sizes[k]!)}m.`,
        };
      }

      const last = labels.length - 1;
      const a = (share(0) * sizes[0]!) / 100;
      const b = (share(last) * sizes[last]!) / 100;
      const truth = (b / a - 1) * 100;
      if (truth < 5 || looksCharted(truth, chart)) return null;
      const { options, correctIndex, correct } = choiceOptions(truth, random, {
        format: unitOption('', '%'),
        finestStep: 0.1,
        // Market growth alone, or the change in share alone.
        traps: [(sizes[last]! / sizes[0]! - 1) * 100, (share(last) / share(0) - 1) * 100],
      });
      return {
        targetTimeMs: 105_000,
        prompt: `By roughly what percentage did ${brand}’s sales grow from ${labels[0]} to ${labels[last]}?`,
        context: [intro, chart],
        answer: { kind: 'choice', options, correctIndex },
        solution: [
          `${labels[0]}: ${share(0)}% × $${f(sizes[0]!)}m = $${approx(a)}m`,
          `${labels[last]}: ${share(last)}% × $${f(sizes[last]!)}m = $${approx(b)}m`,
          `Growth: ${approx(b)} ÷ ${approx(a)} − 1 = ${approx(truth)}%`,
          `Closest option: ${correct}`,
        ],
        shortcut: `Multiply the two growth factors: share ×${approx(share(last) / share(0))} and market ×${approx(sizes[last]! / sizes[0]!)} give ×${approx(b / a)} in sales.`,
      };
    });
  },
};
