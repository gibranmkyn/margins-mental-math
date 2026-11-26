import { formatNumber as f } from '../../format';
import { randomInt } from '../../random';
import type { ScenarioTemplate } from '../template';
import type { StatementMaker } from './options';
import { statementOptions } from './options';
import { approx, percent, pick, randomStep, threshold } from './text';

const INTROS = [
  'A subscription meal-kit company has grown quickly but its board is worried about profitability.',
  'A regional airline is preparing results for its lenders.',
  'A chain of climbing gyms is reviewing its last few years before opening new sites.',
  'A specialist insurer is looking back at its results to set targets.',
];

/**
 * Exactly one of four statements about revenue and profit margin is true.
 * Profit (revenue × margin) and costs (revenue − profit) are never shown, so
 * every statement needs them built first. The trap pairs are years where
 * revenue and margin move in opposite directions.
 */
export const statementMargin: ScenarioTemplate = {
  id: 'statement-margin',
  skill: 'testing-statements',
  tiers: [1, 2, 3],
  build(tier, random) {
    const intro = pick(random, INTROS);
    const span = tier + 2;
    const first = randomInt(random, 2015, 2025 - span);
    const years = Array.from({ length: span }, (_, i) => first + i);
    let revenue = randomStep(random, 60, 600, 5);
    let margin = randomInt(random, 6, 30);
    const rows = years.map((_, i) => {
      if (i > 0) {
        revenue = Math.max(20, Math.round(revenue * (1 + randomInt(random, -8, 25) / 100)));
        margin = Math.min(40, Math.max(2, margin + randomInt(random, -6, 5)));
      }
      return { revenue, margin, profit: (revenue * margin) / 100, cost: (revenue * (100 - margin)) / 100 };
    });
    const pair = (): [number, number] => {
      const a = randomInt(random, 0, span - 2);
      return [a, randomInt(random, a + 1, span - 1)];
    };
    const money = (v: number) => `$${approx(v)} million`;

    const makers: StatementMaker[] = [
      (want) => {
        const [a, b] = pair();
        const [pa, pb] = [rows[a]!.profit, rows[b]!.profit];
        if (Math.abs(pa - pb) < 0.06 * Math.max(pa, pb)) return null;
        const [hi, lo] = (pa > pb) === want ? [a, b] : [b, a];
        return {
          text: `Profit was higher in ${years[hi]} than in ${years[lo]}`,
          working: `Profit: ${years[a]} ${f(rows[a]!.revenue)} × ${rows[a]!.margin}% = ${approx(pa)}, ${years[b]} ${f(rows[b]!.revenue)} × ${rows[b]!.margin}% = ${approx(pb)}`,
          about: `profit-${a}-${b}`,
        };
      },
      (want) => {
        const y = randomInt(random, 0, span - 1);
        const more = random.next() < 0.5;
        const x = threshold(random, rows[y]!.cost, more, want);
        if (x === null) return null;
        return {
          text: `Costs were ${more ? 'more' : 'less'} than $${f(x)} million in ${years[y]}`,
          working: `Costs in ${years[y]}: ${f(rows[y]!.revenue)} × (100% − ${rows[y]!.margin}%) = ${money(rows[y]!.cost)}`,
          about: `cost-${y}`,
        };
      },
      (want) => {
        const [a, b] = pair();
        const total = rows.slice(a, b + 1).reduce((sum, r) => sum + r.revenue, 0);
        const more = random.next() < 0.5;
        const x = threshold(random, total, more, want);
        if (x === null || b - a < 1) return null;
        return {
          text: `Revenue from ${years[a]} to ${years[b]} added up to ${more ? 'more' : 'less'} than $${f(x)} million`,
          working: `Revenue ${years[a]}–${years[b]}: ${rows.slice(a, b + 1).map((r) => f(r.revenue)).join(' + ')} = ${money(total)}`,
          about: `revenue-${a}-${b}`,
        };
      },
      (want) => {
        const [a, b] = pair();
        const actual = (rows[b]!.profit / rows[a]!.profit - 1) * 100;
        if (actual < 3) return null;
        const more = random.next() < 0.6;
        const x = threshold(random, actual, more, want);
        if (x === null) return null;
        return {
          text: `Profit grew by ${more ? 'more' : 'less'} than ${x}% between ${years[a]} and ${years[b]}`,
          working: `Profit growth: ${approx(rows[b]!.profit)} ÷ ${approx(rows[a]!.profit)} − 1 = ${approx(actual)}%`,
          about: `profit-${a}-${b}`,
        };
      },
      (want) => {
        const [a, b] = pair();
        const costGrowth = (rows[b]!.cost / rows[a]!.cost - 1) * 100;
        const revenueGrowth = (rows[b]!.revenue / rows[a]!.revenue - 1) * 100;
        if (revenueGrowth < 2 || Math.abs(costGrowth - revenueGrowth) < 1.5) return null;
        const faster = costGrowth > revenueGrowth;
        if (faster !== want) return null;
        return {
          text: `Costs grew faster than revenue between ${years[a]} and ${years[b]}`,
          working: `${years[a]}–${years[b]}: costs ${approx(rows[a]!.cost)} to ${approx(rows[b]!.cost)} (${approx(costGrowth)}%), revenue ${approx(revenueGrowth)}%`,
          about: `costs-faster-${a}-${b}`,
        };
      },
    ];
    const { options, correctIndex, correct, workings } = statementOptions(makers, random);

    return {
      targetTimeMs: [80_000, 110_000, 130_000][tier - 1]!,
      prompt: 'Which of the following statements is supported by the data in the table?',
      context: [
        { type: 'paragraph', text: intro },
        {
          type: 'table',
          title: 'Results by year',
          headers: ['Year', 'Revenue ($ million)', 'Profit margin'],
          rows: rows.map((r, i) => [String(years[i]), f(r.revenue), percent(r.margin)]),
        },
      ],
      answer: { kind: 'choice', options, correctIndex },
      solution: [...workings, `The only true statement: ${correct}`],
      shortcut:
        'Build the missing columns once (profit = revenue × margin; costs = revenue − profit) and test every statement from them. Costs grow faster than revenue exactly when the margin falls, so no arithmetic is needed for that kind.',
    };
  },
};
