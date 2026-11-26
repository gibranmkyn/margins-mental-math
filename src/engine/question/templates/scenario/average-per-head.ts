import { formatFixed, formatNumber as f } from '../../format';
import { randomInt } from '../../random';
import type { ScenarioTemplate } from '../template';
import { choiceOptions } from './options';
import { approx, pick, randomStep } from './text';

interface Setting {
  intro: string;
  /** The people the revenue is shared over, plural: "sales reps". */
  people: string;
  person: string;
  /** Two business lines, for tier 3. */
  lines: [string, string];
  revenue: [number, number];
  headcount: [number, number];
}

const SETTINGS: Setting[] = [
  {
    intro: 'A medical-devices company wants to know whether its sales force is becoming more productive.',
    people: 'sales reps',
    person: 'sales rep',
    lines: ['Implants', 'Diagnostics'],
    revenue: [180, 700],
    headcount: [30, 110],
  },
  {
    intro: 'An advertising agency tracks how much revenue each of its account managers brings in.',
    people: 'account managers',
    person: 'account manager',
    lines: ['Brand', 'Digital'],
    revenue: [40, 220],
    headcount: [15, 70],
  },
  {
    intro: 'A software firm reviews revenue per engineer in its consulting arm.',
    people: 'engineers',
    person: 'engineer',
    lines: ['Cloud', 'Security'],
    revenue: [60, 400],
    headcount: [40, 260],
  },
];

const WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six'];

/**
 * Averages over time from a yearly table. Tier 1 is the average yearly revenue;
 * tier 2 the average of each year's revenue per head over the last few years
 * only (the table shows one more year than is asked about); tier 3 the same
 * across two business lines combined. Traps: including the extra year, and
 * dividing total revenue by total headcount instead of averaging each year.
 */
export const averagePerHead: ScenarioTemplate = {
  id: 'average-per-head',
  skill: 'averages-mixes',
  tiers: [1, 2, 3],
  build(tier, random) {
    const s = pick(random, SETTINGS);
    const years = randomInt(random, 4, 5) + (tier === 1 ? 0 : 1);
    const asked = tier === 1 ? years : years - 1;
    const first = randomInt(random, 2016, 2025 - years);
    const labels = Array.from({ length: years }, (_, i) => String(first + i));
    const lineCount = tier === 3 ? 2 : 1;

    const lines = Array.from({ length: lineCount }, () => {
      let revenue = randomStep(random, s.revenue[0], s.revenue[1], tier === 1 ? 10 : 5);
      let heads = randomInt(random, s.headcount[0], s.headcount[1]);
      return labels.map(() => {
        const row = { revenue, heads };
        revenue = Math.max(10, Math.round((revenue * (1 + randomInt(random, -5, 15) / 100)) / 5) * 5);
        heads = Math.max(5, heads + randomInt(random, -3, 10));
        return row;
      });
    });

    const recent = labels.map((_, i) => i).slice(years - asked);
    const revenueAt = (i: number) => lines.reduce((sum, l) => sum + l[i]!.revenue, 0);
    const headsAt = (i: number) => lines.reduce((sum, l) => sum + l[i]!.heads, 0);
    const perHead = (i: number) => revenueAt(i) / headsAt(i);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

    const truth = tier === 1 ? mean(recent.map(revenueAt)) : mean(recent.map(perHead));
    const all = labels.map((_, i) => i);
    const traps =
      tier === 1
        ? [recent.map(revenueAt).reduce((a, b) => a + b, 0) / (asked - 1), revenueAt(Math.floor(years / 2))]
        : [
            mean(all.map(perHead)),
            recent.map(revenueAt).reduce((a, b) => a + b, 0) / recent.map(headsAt).reduce((a, b) => a + b, 0),
            ...(tier === 3 ? [mean(recent.map((i) => mean(lines.map((l) => l[i]!.revenue / l[i]!.heads))))] : []),
          ];
    const { options, correctIndex, correct } = choiceOptions(truth, random, {
      format: (value, decimals) => `$${formatFixed(value, decimals)}m`,
      finestStep: 0.001,
      traps,
    });

    const headers =
      tier === 3
        ? ['Year', ...s.lines.flatMap((l) => [`${l} revenue`, `${l} ${s.people.split(' ').at(-1)}`])]
        : ['Year', 'Revenue ($ million)', ...(tier === 1 ? [] : [s.people[0]!.toUpperCase() + s.people.slice(1)])];
    const rows = labels.map((year, i) => [
      year,
      ...lines.flatMap((l) => [f(l[i]!.revenue), ...(tier === 1 ? [] : [f(l[i]!.heads)])]),
    ]);

    const lastYear = labels.at(-1)!;
    const span = `${labels[years - asked]} to ${lastYear}`;
    const prompt =
      tier === 1
        ? `Which of the following is closest to the average yearly revenue from ${span}?`
        : `Which of the following is closest to the average revenue per ${s.person}${tier === 3 ? ' across both lines' : ''} over the last ${WORDS[asked]} years (${span}), taking each year’s figure and averaging them?`;

    const solution =
      tier === 1
        ? [`Total: ${recent.map((i) => f(revenueAt(i))).join(' + ')} = ${f(recent.reduce((sum, i) => sum + revenueAt(i), 0))}`, `Average: ÷ ${asked} = ${approx(truth)}`]
        : [
            ...recent.map((i) =>
              tier === 3
                ? `${labels[i]}: (${lines.map((l) => f(l[i]!.revenue)).join(' + ')}) ÷ (${lines.map((l) => f(l[i]!.heads)).join(' + ')}) = ${approx(perHead(i))}`
                : `${labels[i]}: ${f(revenueAt(i))} ÷ ${f(headsAt(i))} = ${approx(perHead(i))}`,
            ),
            `Average of the ${WORDS[asked]} years: ${approx(truth)}`,
          ];
    solution.push(`Closest option: ${correct}`);
    const shortcut =
      tier === 1
        ? `Pick a round base near the middle and average the differences from it; that keeps the sums small.`
        : `Check which years are asked for before calculating: the table starts in ${labels[0]}, but only ${span} count. ${tier === 3 ? 'Add the two lines within each year before dividing.' : 'Each year’s ratio is close to the others, so a rough average of them is enough to separate the options.'}`;

    return {
      targetTimeMs: [50_000, 90_000, 120_000][tier - 1]!,
      prompt,
      context: [
        { type: 'paragraph', text: s.intro },
        { type: 'table', title: tier === 1 ? 'Revenue by year' : tier === 3 ? `Revenue ($ million) and ${s.people} by year` : `Revenue and ${s.people} by year`, headers, rows },
      ],
      answer: { kind: 'choice', options, correctIndex },
      solution,
      shortcut,
    };
  },
};
