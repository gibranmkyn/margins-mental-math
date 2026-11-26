import { formatNumber as f } from '../../format';
import { randomInt } from '../../random';
import type { ScenarioTemplate } from '../template';
import { choiceOptions } from './options';
import { approx, money, pick, plainOption, randomStep, until } from './text';

interface GroupSetting {
  intro: string;
  /** What is counted, plural: "stores". */
  things: string;
  /** Measure averaged, with its unit in words: "weekly sales". */
  measure: string;
  /** Three groups, lowest average first. */
  groups: [string, string, string];
  /** Group averages range, in whole units of the measure. */
  average: [number, number];
  amount: (n: number) => string;
}

const GROUPS: GroupSetting[] = [
  {
    intro: 'A convenience-store chain runs its shops in different formats.',
    things: 'stores',
    measure: 'weekly sales per store',
    groups: ['Kiosk', 'Neighbourhood', 'Flagship'],
    average: [20, 160],
    amount: (n) => `$${f(n)} thousand`,
  },
  {
    intro: 'A dental group has clinics of different sizes across the country.',
    things: 'clinics',
    measure: 'patients seen per clinic per month',
    groups: ['Single-chair', 'Standard', 'Hub'],
    average: [150, 1_400],
    amount: (n) => f(n),
  },
  {
    intro: 'A farming cooperative groups its member farms by size.',
    things: 'farms',
    measure: 'milk output per farm per day',
    groups: ['Small', 'Medium', 'Large'],
    average: [400, 4_000],
    amount: (n) => `${f(n)} litres`,
  },
];

interface DonorSetting {
  intro: string;
  donors: string;
  groups: [string, string, string];
}

const DONORS: DonorSetting[] = [
  {
    intro: 'A wildlife charity groups the employees of its corporate partners by how often they hear from the charity.',
    donors: 'employees',
    groups: ['Never contacted', 'Occasional contact', 'Regular contact'],
  },
  {
    intro: 'A university fundraising office groups its alumni by how engaged they are.',
    donors: 'alumni',
    groups: ['Not engaged', 'Lightly engaged', 'Highly engaged'],
  },
];

/**
 * Work backwards from an average to a missing count. Tier 1 has two groups
 * and a known total; tier 2 three groups, one count known; tier 3 recovers a
 * per-head amount from a projected total after a flat uplift, with one group
 * giving twice another. The trap is splitting the total evenly or stopping at
 * the smaller group's amount.
 */
export const missingCount: ScenarioTemplate = {
  id: 'missing-count',
  skill: 'averages-mixes',
  tiers: [1, 2, 3],
  build(tier, random) {
    if (tier === 3) return donorQuestion(random);
    const s = pick(random, GROUPS);
    const unit = s.average[1] >= 1_000 ? 10 : 1;
    const d = until(
      () => {
        const averages = [0, 1, 2].map(() => randomStep(random, s.average[0], s.average[1], unit)).sort((a, b) => a - b);
        const total = pick(random, [100, 120, 150, 160, 200, 240, 250, 300, 400]);
        const top = randomInt(random, 34, total - 40);
        const bottom = tier === 1 ? total - top : randomInt(random, 20, total - top - 20);
        const counts = [bottom, total - top - bottom, top];
        const overall = counts.reduce((sum, n, i) => sum + n * averages[i]!, 0) / total;
        return { averages, counts, total, overall };
      },
      (c) =>
        // Group averages well apart, so the balance is not a knife-edge.
        c.averages[1]! - c.averages[0]! >= (s.average[1] - s.average[0]) * 0.15 &&
        c.averages[2]! - c.averages[1]! >= (s.average[1] - s.average[0]) * 0.15 &&
        // The overall average must come out to cents (or hundredths), so it can be shown exactly.
        Math.abs(c.overall * 100 - Math.round(c.overall * 100)) < 1e-6,
    );
    const [low, mid, high] = d.averages as [number, number, number];
    const truth = d.counts[2]!;
    const shown = tier === 1 ? [0, 2] : [0, 1, 2];

    const { options, correctIndex, correct } = choiceOptions(truth, random, {
      format: plainOption,
      finestStep: 1,
      traps: [d.total / shown.length, d.total - d.counts[0]! - truth],
    });

    const items = shown.map((i) => `${s.groups[i]} ${s.things}: average ${s.measure} of ${s.amount(d.averages[i]!)}`);
    const known = tier === 2 ? ` ${f(d.counts[0]!)} of them are ${s.groups[0]} ${s.things}.` : '';
    const context = [
      { type: 'paragraph' as const, text: `${s.intro} It has ${f(d.total)} ${s.things} in all, with an average ${s.measure} of ${s.amount(d.overall)} across the whole network.${known}` },
      { type: 'list' as const, items },
    ];

    const solution =
      tier === 1
        ? [
            `Let x be the number of ${s.groups[2]} ${s.things}: ${f(low)} × (${f(d.total)} − x) + ${f(high)} × x = ${f(d.total)} × ${f(d.overall)}`,
            `x × (${f(high)} − ${f(low)}) = ${f(d.total)} × (${f(d.overall)} − ${f(low)})`,
            `x = ${f(d.total * (d.overall - low))} ÷ ${f(high - low)} = ${f(truth)}`,
          ]
        : [
            `The other two groups hold ${f(d.total)} − ${f(d.counts[0]!)} = ${f(d.total - d.counts[0]!)} ${s.things}; let x be the ${s.groups[2]} ones`,
            `${f(d.counts[0]!)} × ${f(low)} + ${f(mid)} × (${f(d.total - d.counts[0]!)} − x) + ${f(high)} × x = ${f(d.total)} × ${f(d.overall)}`,
            `x × (${f(high)} − ${f(mid)}) = ${f(d.total * d.overall - d.counts[0]! * low - (d.total - d.counts[0]!) * mid)}, so x = ${f(truth)}`,
          ];
    solution.push(`Closest option: ${correct}`);
    // Two groups: the overall average sits as far along the gap from the low to the high average as the high group's share of the count.
    const along = (d.overall - low) / (high - low);
    const shortcut =
      tier === 1
        ? `The overall average is ${f(d.overall - low)} above the ${s.groups[0]} average, out of a ${f(high - low)} gap to the ${s.groups[2]} one: about ${approx(along * 100)}% of the way. That is the ${s.groups[2]} share of the ${s.things}: ${approx(along * 100)}% of ${f(d.total)} is ${f(truth)}.`
        : `Think in gaps from the average: every ${s.groups[2]} ${s.things.replace(/s$/, '')} sits ${f(high - d.overall)} above it and must balance the shortfall of the others. Balance the shortfalls and surpluses, then divide by the top group’s surplus.`;

    return {
      targetTimeMs: [70_000, 110_000, 130_000][tier - 1]!,
      prompt: `How many of the ${s.things} are ${s.groups[2]} ${s.things}?`,
      context,
      answer: { kind: 'choice', options, correctIndex },
      solution,
      shortcut,
    };
  },
};

function donorQuestion(random: { next(): number }) {
  const s = pick(random, DONORS);
  const counts = [randomStep(random, 20_000, 90_000, 100), randomStep(random, 6_000, 30_000, 100), randomStep(random, 1_500, 9_000, 100)];
  const light = randomStep(random, 20, 90, 5);
  const uplift = randomStep(random, 10, 60, 5);
  const people = counts.reduce((a, b) => a + b, 0);
  const total = uplift * people + counts[1]! * light + counts[2]! * light * 2;
  const truth = light * 2;

  const { options, correctIndex, correct } = choiceOptions(truth, random, {
    format: (value) => money(value),
    finestStep: 1,
    traps: [light, (total - uplift * people) / (counts[1]! + counts[2]!), total / people],
  });

  return {
    targetTimeMs: 130_000,
    prompt: `Which of the following is closest to what one of the ${s.groups[2].toLowerCase()} ${s.donors} gives a year today?`,
    context: [
      { type: 'paragraph' as const, text: s.intro },
      {
        type: 'table' as const,
        title: `${s.donors[0]!.toUpperCase()}${s.donors.slice(1)} by group`,
        headers: ['Group', `Number of ${s.donors}`],
        rows: s.groups.map((g, i) => [g, f(counts[i]!)]),
      },
      {
        type: 'paragraph' as const,
        text: `Today, each of the ${s.groups[2].toLowerCase()} group gives twice as much a year as each of the ${s.groups[1].toLowerCase()} group, and the ${s.groups[0].toLowerCase()} group gives nothing. A new campaign would raise every person’s yearly gift by ${money(uplift)}, including those who give nothing today, bringing the total to ${money(total)} a year.`,
      },
    ],
    answer: { kind: 'choice' as const, options, correctIndex },
    solution: [
      `Uplift: ${f(people)} people × ${money(uplift)} = ${money(uplift * people)}`,
      `Given today: ${money(total)} − ${money(uplift * people)} = ${money(total - uplift * people)}`,
      `With x for the ${s.groups[1].toLowerCase()} gift: ${f(counts[1]!)}x + ${f(counts[2]!)} × 2x = ${f(counts[1]! + 2 * counts[2]!)}x = ${money(total - uplift * people)}, so x = ${money(light)}`,
      `The ${s.groups[2].toLowerCase()} gift is 2x = ${money(truth)}`,
      `Closest option: ${correct}`,
    ],
    shortcut: `Strip out the uplift first (it applies to all ${f(people)}), then count the ${s.groups[2].toLowerCase()} group double: ${f(counts[1]!)} + 2 × ${f(counts[2]!)} = ${f(counts[1]! + 2 * counts[2]!)} "light-gift units". Remember the question asks for the bigger gift (${money(truth)}, not ${money(light)}).`,
  };
}
