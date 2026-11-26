import { formatFixed, formatNumber as f } from '../../format';
import { randomInt } from '../../random';
import type { Tier } from '../../types';
import type { ScenarioTemplate } from '../template';
import { approx, pick, until } from './text';

interface Column {
  header: string;
  range: [number, number];
  /** Decimals shown; 0 rounds to three significant figures. */
  decimals: number;
}

interface Setting {
  intro: string;
  /** Row label prefix: "Country". */
  label: string;
  names: [string, string, string, string];
  /** The measure asked about, as the prompt names it. */
  measure: string;
  columns: Column[];
  /** How the measure is built from the columns, in display order. */
  combine(values: number[]): number;
  /** One worked line: "W: 80,700 ÷ 6.70". */
  working(values: string[]): string;
}

const SETTINGS: Record<Tier, Setting[]> = {
  1: [
    {
      intro: 'A drugs company compares household incomes in four markets it may enter.',
      label: 'Country',
      names: ['W', 'X', 'Y', 'Z'],
      measure: 'average household income in US dollars',
      columns: [
        { header: 'Average income (local currency)', range: [20_000, 600_000], decimals: 0 },
        { header: 'Local currency per US dollar', range: [0.8, 12], decimals: 2 },
      ],
      combine: ([income, rate]) => income! / rate!,
      working: ([income, rate]) => `${income} ÷ ${rate}`,
    },
    {
      intro: 'An aviation analyst compares four regional airlines.',
      label: 'Airline',
      names: ['P', 'Q', 'R', 'S'],
      measure: 'revenue per passenger',
      columns: [
        { header: 'Revenue ($ million)', range: [150, 2_400], decimals: 0 },
        { header: 'Passengers (million)', range: [1.5, 18], decimals: 1 },
      ],
      combine: ([revenue, passengers]) => revenue! / passengers!,
      working: ([revenue, passengers]) => `${revenue} ÷ ${passengers}`,
    },
  ],
  2: [
    {
      intro: 'A coffee chain looks at drinking habits in four markets.',
      label: 'Country',
      names: ['K', 'L', 'M', 'N'],
      measure: 'coffee consumption per person, in litres',
      columns: [
        { header: 'Cups per person per year', range: [150, 1_200], decimals: 0 },
        { header: 'Average cup size (litres)', range: [0.08, 0.45], decimals: 2 },
      ],
      combine: ([cups, size]) => cups! * size!,
      working: ([cups, size]) => `${cups} × ${size}`,
    },
    {
      intro: 'A gym operator compares the busiest of its clubs.',
      label: 'Club',
      names: ['North', 'South', 'East', 'West'],
      measure: 'number of visits per month',
      columns: [
        { header: 'Members', range: [800, 6_000], decimals: 0 },
        { header: 'Visits per member per month', range: [2, 14], decimals: 1 },
      ],
      combine: ([members, visits]) => members! * visits!,
      working: ([members, visits]) => `${members} × ${visits}`,
    },
  ],
  3: [
    {
      intro: 'A café chain is comparing how saturated four cities are.',
      label: 'City',
      names: ['Avonford', 'Brackley', 'Carsworth', 'Dunmere'],
      measure: 'number of cups sold per café',
      columns: [
        { header: 'Population (thousand)', range: [200, 3_000], decimals: 0 },
        { header: 'Cups per person per year', range: [100, 700], decimals: 0 },
        { header: 'Cafés', range: [80, 1_500], decimals: 0 },
      ],
      combine: ([people, cups, cafes]) => (people! * cups!) / cafes!,
      working: ([people, cups, cafes]) => `${people} × ${cups} ÷ ${cafes}`,
    },
    {
      intro: 'A supermarket group is checking whether its tills keep up with demand.',
      label: 'Store',
      names: ['Harbour', 'Market', 'Station', 'Park'],
      measure: 'number of purchases per checkout',
      columns: [
        { header: 'Visitors per week', range: [8_000, 60_000], decimals: 0 },
        { header: 'Share who buy (%)', range: [40, 95], decimals: 0 },
        { header: 'Checkouts', range: [6, 40], decimals: 0 },
      ],
      combine: ([visitors, share, tills]) => (visitors! * share!) / 100 / tills!,
      working: ([visitors, share, tills]) => `${visitors} × ${share}% ÷ ${tills}`,
    },
  ],
};

/**
 * Which of four entities is highest on a measure built from table columns:
 * a ratio (tier 1), a product (tier 2), or both (tier 3), with the leader
 * closer to the runner-up as the tier rises. The trap is the entity that leads
 * on the most eye-catching column.
 */
export const highestRatio: ScenarioTemplate = {
  id: 'highest-ratio',
  skill: 'ratios-comparisons',
  tiers: [1, 2, 3],
  build(tier, random) {
    const s = pick(random, SETTINGS[tier]);
    const margin = [0.06, 0.04, 0.03][tier - 1]!;
    const shown = (value: number, decimals: number) => (decimals === 0 ? f(value) : formatFixed(value, decimals));

    const rows = until(
      () =>
        s.names.map(() => {
          const values = s.columns.map((c) => {
            const scale = 10 ** c.decimals;
            const raw = randomInt(random, Math.round(c.range[0] * scale), Math.round(c.range[1] * scale)) / scale;
            return c.decimals === 0 ? threeFigures(raw) : raw;
          });
          return { values, measure: s.combine(values) };
        }),
      (rs) => {
        const sorted = rs.map((r) => r.measure).sort((a, b) => b - a);
        return sorted[0]! > sorted[1]! * (1 + margin);
      },
    );
    const best = rows.reduce((top, r, i) => (r.measure > rows[top]!.measure ? i : top), 0);
    const options = s.names.map((n) => (n.length === 1 ? `${s.label} ${n}` : n));
    const correct = options[best]!;

    const solution = rows.map(
      (r, i) => `${s.names[i]}: ${s.working(r.values.map((v, k) => shown(v, s.columns[k]!.decimals)))} = ${approx(r.measure)}`,
    );
    solution.push(`Highest: ${correct}`);
    const shortcut =
      tier === 1
        ? 'Round each figure to two significant figures and divide; only the two leaders need a careful second look.'
        : tier === 2
          ? 'Round to two significant figures and multiply; a big first column can be undone by a small second one.'
          : 'Compare ratios before multiplying: work out the column you divide by first, and keep only the two leaders for exact arithmetic.';

    return {
      targetTimeMs: [50_000, 70_000, 100_000][tier - 1]!,
      prompt: `Which ${s.label.toLowerCase()} comes out highest on ${s.measure}?`,
      context: [
        { type: 'paragraph', text: s.intro },
        {
          type: 'table',
          title: `${s.label} comparison`,
          headers: [s.label, ...s.columns.map((c) => c.header)],
          rows: rows.map((r, i) => [s.names[i]!, ...r.values.map((v, k) => shown(v, s.columns[k]!.decimals))]),
        },
      ],
      answer: { kind: 'choice', options, correctIndex: best },
      solution,
      shortcut,
    };
  },
};

/** Round to three significant figures: 20,214 -> 20,200. */
function threeFigures(value: number): number {
  if (value < 100) return value;
  const unit = 10 ** (Math.floor(Math.log10(value)) - 2);
  return Math.round(value / unit) * unit;
}
