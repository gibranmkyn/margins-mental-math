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
  /** What each bar counts, for prompts: "sales", "rooms". */
  measure: string;
  places: string[];
  /** The places as a group, for prompts: "regions". */
  group: string;
  range: [number, number];
}

const SETTINGS: Setting[] = [
  {
    intro: 'A soft-drinks maker is deciding where to put next year’s marketing budget.',
    title: 'Sales by region',
    unit: 'Sales, million litres',
    measure: 'sales',
    places: ['North', 'South', 'East', 'West', 'Centre'],
    group: 'regions',
    range: [20, 140],
  },
  {
    intro: 'A hotel group compares the size of its estate in each country before selling some properties.',
    title: 'Rooms by country',
    unit: 'Rooms, thousands',
    measure: 'rooms',
    places: ['France', 'Spain', 'Italy', 'Poland', 'Sweden'],
    group: 'countries',
    range: [8, 60],
  },
  {
    intro: 'A building society tracks new mortgage lending through its city branches.',
    title: 'New mortgages by city',
    unit: 'New mortgages, thousands',
    measure: 'new mortgages',
    places: ['Leeds', 'Derby', 'York', 'Hull', 'Bath'],
    group: 'cities',
    range: [4, 30],
  },
];

/**
 * Bars by region. Tier 1 labels the bars and asks two regions’ share of the
 * total; tier 2 asks how many times one region’s bar is another’s, read off
 * gridlines; tier 3 shows two years side by side, read off gridlines, and asks
 * one region’s share of the later year’s total.
 */
export const barShare: ScenarioTemplate = {
  id: 'bar-share',
  skill: 'bar-charts',
  tiers: [1, 2, 3],
  build(tier, random) {
    const s = pick(random, SETTINGS);
    const places = s.places;
    const labelled = tier === 1;
    const [y0, y1] = years(random, 2) as [string, string];

    return until(() => {
      // Read off gridlines, no bar is a stub, so a misreading barely moves a ratio of two.
      const low = tier === 2 ? Math.round(s.range[1] * 0.35) : s.range[0];
      const base = places.map(() => randomInt(random, low, s.range[1]));
      const later = base.map((v) => v * (1 + randomInt(random, -10, 60) / 100));
      const top = Math.max(...base, ...(tier === 3 ? later : []));
      const axis = niceAxis(0, top * 1.04, labelled ? 6 : 10);
      const draw = (v: number) => (labelled ? Math.round(v) : Math.max(axis.step / 5, snap(v, axis.step / 5)));
      const first = base.map(draw);
      const second = later.map(draw);
      const chart: ChartBlock = {
        type: 'chart',
        chart: 'bar',
        title: tier === 3 ? `${s.title}, ${y0} and ${y1}` : s.title,
        unit: s.unit,
        categories: places,
        series: tier === 3 ? [{ name: y0, values: first }, { name: y1, values: second }] : [{ name: s.title, values: first }],
        axis,
        labelled,
        decimals: 0,
      };
      const intro = { type: 'paragraph' as const, text: s.intro };

      if (tier === 1) {
        const i = randomInt(random, 0, 3);
        const j = randomInt(random, i + 1, 4);
        const total = first.reduce((a, b) => a + b, 0);
        const pair = first[i]! + first[j]!;
        const truth = (pair / total) * 100;
        if (looksCharted(truth, chart)) return null;
        const { options, correctIndex, correct } = choiceOptions(truth, random, {
          format: unitOption('', '%'),
          finestStep: 0.1,
          // Dividing by the rest instead of the total.
          traps: [(pair / (total - pair)) * 100],
        });
        return {
          targetTimeMs: 75_000,
          prompt: `What share of total ${s.measure} across the five did ${places[i]} and ${places[j]} account for together?`,
          context: [intro, chart],
          answer: { kind: 'choice', options, correctIndex },
          solution: [
            `${places[i]} + ${places[j]}: ${f(first[i]!)} + ${f(first[j]!)} = ${f(pair)}`,
            `Total: ${first.map(f).join(' + ')} = ${f(total)}`,
            `Share: ${f(pair)} ÷ ${f(total)} = ${approx(truth)}%`,
            `Closest option: ${correct}`,
          ],
          shortcut: `Anchor on a tenth of the total: 10% of ${f(total)} is ${approx(total / 10)}, and ${f(pair)} is ${approx(pair / (total / 10))} of those tenths, so ${approx(truth)}%.`,
        };
      }

      if (tier === 2) {
        const order = first.map((_, k) => k).sort((a, b) => first[b]! - first[a]!);
        const big = order[randomInt(random, 0, 1)]!;
        const small = order[randomInt(random, 3, 4)]!;
        const a = first[big]!;
        const b = first[small]!;
        const truth = a / b;
        if (truth < 1.5 || looksCharted(truth, chart)) return null;
        const answer = (c: ChartBlock) => c.series[0]!.values[big]! / c.series[0]!.values[small]!;
        // Both bars stand tall enough against the gridlines that a misreading barely moves the ratio.
        const band = readingBand(chart, answer);
        if (!readable(truth, band)) return null;
        const { options, correctIndex, correct } = estimateOptions(truth, band, random, {
          format: unitOption('', '×'),
          finestStep: 0.1,
        });
        return {
          targetTimeMs: 60_000,
          prompt: `${capital(s.measure)} in ${places[big]} were roughly how many times ${s.measure} in ${places[small]}?`,
          context: [intro, chart],
          answer: { kind: 'choice', options, correctIndex },
          solution: [
            `Reading the bars: ${places[big]} ≈ ${f(a)}, ${places[small]} ≈ ${f(b)}`,
            `Ratio: ${f(a)} ÷ ${f(b)} = ${approx(truth)}`,
            `Closest option: ${correct}`,
          ],
          shortcut: `Count gridlines instead of reading values: ${places[big]} stands about ${oneDecimal(a / axis.step)} gaps tall, ${places[small]} about ${oneDecimal(b / axis.step)}; the ratio of the counts is the ratio of the bars.`,
        };
      }

      // One region's share of the later year's total: five bars of one colour read and added, then one divided.
      const k = randomInt(random, 0, 4);
      const total = second.reduce((x, y) => x + y, 0);
      const truth = (second[k]! / total) * 100;
      const answer = (c: ChartBlock) => (c.series[1]!.values[k]! / c.series[1]!.values.reduce((x, y) => x + y, 0)) * 100;
      const band = readingBand(chart, answer);
      // At least 14%, so whole-percent options a few points apart stay close neighbours.
      if (truth < 14 || !readable(truth, band) || looksCharted(truth, chart)) return null;
      const { options, correctIndex, correct } = estimateOptions(truth, band, random, {
        format: unitOption('', '%'),
        finestStep: 1,
        // Dividing by both years' bars, or by the earlier year's total.
        traps: [(second[k]! / (total + first.reduce((x, y) => x + y, 0))) * 100, (second[k]! / first.reduce((x, y) => x + y, 0)) * 100],
      });
      return {
        targetTimeMs: 75_000,
        prompt: `Roughly what share of the five ${s.group}’ combined ${s.measure} in ${y1} came from ${places[k]}?`,
        context: [intro, chart],
        answer: { kind: 'choice', options, correctIndex },
        solution: [
          `Reading the ${y1} bars: ${places.map((p, i) => `${p} ≈ ${f(second[i]!)}`).join(', ')}`,
          `Total: ${second.map(f).join(' + ')} = ${f(total)}`,
          `Share: ${f(second[k]!)} ÷ ${f(total)} = ${approx(truth)}%`,
          `Closest option: ${correct}`,
        ],
        shortcut: `Use only the ${y1} bars. Count each in gridlines of ${f(axis.step)}: ${places[k]} is about ${oneDecimal(second[k]! / axis.step)} of about ${oneDecimal(total / axis.step)} in all, roughly ${approx(truth)}%.`,
      };
    });
  },
};

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
