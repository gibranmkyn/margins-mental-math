import { formatNumber as f } from '../../format';
import { randomInt } from '../../random';
import type { ScenarioTemplate } from '../template';
import { shuffledOptions } from './options';
import { approx, percent, pick, until } from './text';

interface Setting {
  intro: string;
  /** What is ranked, plural, and its row label. */
  things: string;
  label: string;
  names: string[];
  /** The bad event, completing "Risk of ...". */
  event: string;
}

const SETTINGS: Setting[] = [
  {
    intro: 'A car maker is reviewing the risk that a key supplier fails to deliver next year.',
    things: 'suppliers',
    label: 'Supplier',
    names: ['P', 'Q', 'R', 'S', 'T'],
    event: 'a delivery failure',
  },
  {
    intro: 'A port operator is assessing the chance of serious storm damage at each of its terminals.',
    things: 'terminals',
    label: 'Terminal',
    names: ['J', 'K', 'L', 'M', 'N'],
    event: 'serious storm damage',
  },
  {
    intro: 'A software company is weighing the risk that one of its major projects overruns badly.',
    things: 'projects',
    label: 'Project',
    names: ['V', 'W', 'X', 'Y', 'Z'],
    event: 'a major overrun',
  },
];

/**
 * Rank risks by expected cost, probability × cost if it happens. Tier 1 ranks
 * four, tier 2 five; tier 3 builds the cost from months of disruption ×
 * profit lost per month. Distractors rank by the cost alone, by the
 * probability alone, or swap the closest pair.
 */
export const riskRanking: ScenarioTemplate = {
  id: 'risk-ranking',
  skill: 'expected-value',
  tiers: [1, 2, 3],
  build(tier, random) {
    const s = pick(random, SETTINGS);
    const count = tier === 1 ? 4 : 5;
    const names = s.names.slice(0, count);
    const gap = [0.1, 0.06, 0.05][tier - 1]!;

    const rows = until(
      () =>
        names.map(() => {
          const probability = randomInt(random, 1, 12) * 5;
          const months = tier === 3 ? randomInt(random, 1, 9) : 1;
          const monthly = tier === 3 ? randomInt(random, 2, 30) / 2 : randomInt(random, 1, 40);
          const cost = months * monthly;
          return { probability, months, monthly, cost, expected: (probability / 100) * cost };
        }),
      (rs) => {
        const sorted = rs.map((r) => r.expected).sort((a, b) => a - b);
        const costs = new Set(rs.map((r) => r.cost));
        const chances = new Set(rs.map((r) => r.probability));
        return costs.size === count && chances.size === count && sorted.every((v, i) => i === 0 || v > sorted[i - 1]! * (1 + gap));
      },
    );

    const most = random.next() < 0.6;
    const order = (key: (i: number) => number) =>
      names
        .map((n, i) => ({ n, v: key(i) }))
        .sort((a, b) => (most ? b.v - a.v : a.v - b.v))
        .map((x) => x.n);
    const correctOrder = order((i) => rows[i]!.expected);
    const text = (o: string[]) => o.join(', ');
    const swap = (o: string[], k: number) => {
      const c = [...o];
      [c[k], c[k + 1]] = [c[k + 1]!, c[k]!];
      return c;
    };
    const closest = correctOrder
      .slice(1)
      .map((n, k) => ({ k, ratio: Math.abs(rows[names.indexOf(correctOrder[k]!)]!.expected / rows[names.indexOf(n)]!.expected - 1) }))
      .sort((a, b) => a.ratio - b.ratio);
    const distractors = [
      text(order((i) => rows[i]!.cost)),
      text(order((i) => rows[i]!.probability)),
      text(swap(correctOrder, closest[0]!.k)),
      text(swap(correctOrder, closest[1]!.k)),
      ...[0, 1, 2].map((k) => text(swap(swap(correctOrder, k), k + 1 < count - 1 ? k + 1 : 0))),
    ];
    const { options, correctIndex, correct } = shuffledOptions(text(correctOrder), distractors, random);

    const headers = [s.label, 'Probability', ...(tier === 3 ? ['Months lost', 'Profit lost per month ($ million)'] : ['Cost if it happens ($ million)'])];
    const tableRows = names.map((n, i) => {
      const r = rows[i]!;
      return [n, percent(r.probability), ...(tier === 3 ? [f(r.months), f(r.monthly)] : [f(r.cost)])];
    });
    const solution = names.map((n, i) => {
      const r = rows[i]!;
      return tier === 3
        ? `${n}: ${r.probability}% × ${f(r.months)} × ${f(r.monthly)} = ${approx(r.expected)}`
        : `${n}: ${r.probability}% × ${f(r.cost)} = ${approx(r.expected)}`;
    });
    solution.push(`Ranking: ${correct}`);

    return {
      targetTimeMs: [60_000, 80_000, 110_000][tier - 1]!,
      prompt: `Ranking the ${s.things} by expected cost, which order runs from the ${most ? 'one to worry about most to the one to worry about least' : 'one to worry about least to the one to worry about most'}?`,
      context: [
        { type: 'paragraph', text: s.intro },
        { type: 'table', title: `Risk of ${s.event}, by ${s.label.toLowerCase()}`, headers, rows: tableRows },
      ],
      answer: { kind: 'choice', options, correctIndex },
      solution,
      shortcut: `A small chance of a huge cost can outweigh a likely small one, so never rank on one column. Turn each probability into a decimal first: ${rows[0]!.probability}% of ${f(rows[0]!.cost)} is ${f(rows[0]!.probability / 100)} × ${f(rows[0]!.cost)} = ${f(rows[0]!.expected)}, and only the close pairs need exact work.`,
    };
  },
};
