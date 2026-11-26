import { formatNumber as f } from '../../format';
import { randomInt } from '../../random';
import type { ScenarioTemplate } from '../template';
import { choiceOptions } from './options';
import { approx, percentOption, pick, randomStep, until } from './text';

interface Setting {
  intro: string;
  title: string;
  segments: [string, string, string];
  /** What is measured, completing "growth in ... revenue". */
  measure: string;
}

const SETTINGS: Setting[] = [
  {
    intro: 'A pet-food maker is reviewing how its sales channels have developed.',
    title: 'Sales by channel ($ million)',
    segments: ['Supermarkets', 'Pet stores', 'Online'],
    measure: 'sales',
  },
  {
    intro: 'A business-software company is preparing a board update on its regions.',
    title: 'Revenue by region ($ million)',
    segments: ['North America', 'Europe', 'Asia-Pacific'],
    measure: 'revenue',
  },
  {
    intro: 'A hotel group wants to understand which of its brands is driving growth.',
    title: 'Room revenue by brand ($ million)',
    segments: ['Budget', 'Midscale', 'Luxury'],
    measure: 'room revenue',
  },
  {
    intro: 'A dairy cooperative is looking at the trend in each of its product lines.',
    title: 'Sales by product line ($ million)',
    segments: ['Milk', 'Cheese', 'Yoghurt'],
    measure: 'sales',
  },
];

/**
 * Growth read off a table of yearly figures. Tier 1 asks for the total change
 * between two years; tier 2 for the average annual (compound) growth of one
 * segment; tier 3 for the average annual growth of two segments combined.
 * The traps: dividing the total change by the number of years, and counting
 * the columns rather than the gaps between them.
 */
export const growthRate: ScenarioTemplate = {
  id: 'growth-rate',
  skill: 'growth-trends',
  tiers: [1, 2, 3],
  build(tier, random) {
    const s = pick(random, SETTINGS);
    const gaps = tier === 1 ? randomInt(random, 1, 3) : randomInt(random, 2, 4);
    const firstYear = randomInt(random, 2015, 2024 - gaps);
    const years = Array.from({ length: gaps + 1 }, (_, i) => firstYear + i);

    // Each segment: a start value and a bumpy path of yearly growth. Redraw until the
    // segments asked about grew clearly, and (for yearly rates) not implausibly fast.
    const { series, chosen, start, finalEnd } = until(
      () => {
        const series = s.segments.map(() => {
          let value = randomStep(random, 40, 400, tier === 1 ? 5 : 1);
          const path = [value];
          for (let i = 0; i < gaps; i++) {
            value = Math.round(value * (1 + randomInt(random, -4, 24) / 100));
            path.push(value);
          }
          return path;
        });
        const chosen = tier === 3 ? twoOf(randomInt(random, 0, 2)) : [randomInt(random, 0, 2)];
        const start = chosen.reduce((sum, i) => sum + series[i]![0]!, 0);
        const finalEnd = chosen.reduce((sum, i) => sum + series[i]![gaps]!, 0);
        return { series, chosen, start, finalEnd };
      },
      // Yearly rates of at least 3.5%, so options a point apart are close neighbours rather than double or half.
      (d) => d.finalEnd / d.start >= Math.max(1.06, tier === 1 ? 0 : 1.035 ** gaps) && d.finalEnd / d.start <= 2.6,
    );

    const total = finalEnd / start - 1;
    const truth = tier === 1 ? total * 100 : ((finalEnd / start) ** (1 / gaps) - 1) * 100;

    const { options, correctIndex, correct } = choiceOptions(truth, random, {
      format: percentOption,
      finestStep: 0.1,
      traps: tier === 1 ? [(1 - start / finalEnd) * 100] : [(total / gaps) * 100, ((finalEnd / start) ** (1 / (gaps + 1)) - 1) * 100],
    });

    const names = chosen.map((i) => s.segments[i]!);
    const subject = names.length === 1 ? names[0]! : `${names[0]} and ${names[1]} combined`;
    const lastYear = years[gaps]!;
    const prompt =
      tier === 1
        ? `By what percentage did ${subject} ${s.measure} grow between ${firstYear} and ${lastYear}? Choose the closest.`
        : `Which of the following is closest to the average annual growth rate of ${subject} ${s.measure} between ${firstYear} and ${lastYear}?`;

    const solution: string[] = [];
    if (chosen.length > 1) {
      solution.push(`${firstYear}: ${chosen.map((i) => f(series[i]![0]!)).join(' + ')} = ${f(start)}`);
      solution.push(`${lastYear}: ${chosen.map((i) => f(series[i]![gaps]!)).join(' + ')} = ${f(finalEnd)}`);
    }
    if (tier === 1) {
      solution.push(`Growth: (${f(finalEnd)} − ${f(start)}) ÷ ${f(start)} = ${approx(truth)}%`);
    } else {
      solution.push(`Growth factor: ${f(finalEnd)} ÷ ${f(start)} = ${approx(finalEnd / start)}`);
      solution.push(`${gaps} years of growth (${firstYear} to ${lastYear}): ${approx(finalEnd / start)} to the power 1/${gaps} = ${approx(1 + truth / 100)}, so ${approx(truth)}% a year`);
    }
    solution.push(`Closest option: ${correct}`);

    const shortcut =
      tier === 1
        ? `Take the difference over the starting value: (${f(finalEnd)} − ${f(start)}) ÷ ${f(start)}. Dividing by the later year gives a smaller, wrong figure.`
        : `Count the gaps, not the columns: ${firstYear} to ${lastYear} is ${gaps} years. Then test options by compounding: a total rise of ${approx(total * 100)}% over ${gaps} years is a bit less than ${approx((total / gaps) * 100)}% a year, because growth compounds.`;

    return {
      targetTimeMs: [60_000, 100_000, 120_000][tier - 1]!,
      prompt,
      context: [
        { type: 'paragraph', text: s.intro },
        {
          type: 'table',
          title: s.title,
          headers: ['', ...years.map(String)],
          rows: s.segments.map((name, i) => [name, ...series[i]!.map((v) => f(v))]),
        },
      ],
      answer: { kind: 'choice', options, correctIndex },
      solution,
      shortcut,
    };
  },
};

function twoOf(skip: number): number[] {
  return [0, 1, 2].filter((i) => i !== skip);
}
