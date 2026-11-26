import { formatNumber as f } from '../../format';
import { randomInt } from '../../random';
import type { ScenarioTemplate } from '../template';
import type { StatementMaker } from './options';
import { statementOptions } from './options';
import { approx, pick, randomStep, threshold } from './text';

interface Setting {
  intro: string;
  title: string;
  regions: [string, string, string];
}

const SETTINGS: Setting[] = [
  {
    intro: 'A European payments company is reviewing its markets before a funding round.',
    title: 'Revenue by market ($ million)',
    regions: ['the Nordics', 'Iberia', 'Benelux'],
  },
  {
    intro: 'A frozen-food maker is reviewing how each of its sales regions has performed.',
    title: 'Revenue by sales region ($ million)',
    regions: ['the North', 'the Midlands', 'the South'],
  },
  {
    intro: 'A hotel booking platform compares its three biggest destinations.',
    title: 'Revenue by destination ($ million)',
    regions: ['Lisbon', 'Prague', 'Vienna'],
  },
];

/**
 * Exactly one of four statements about a revenue table is true. Statements
 * test percentage growth, comparing growth between rows, shares of a total,
 * growth of the total and (tier 3) average yearly growth. Each true or false
 * call clears its threshold by a wide margin, so careful arithmetic decides,
 * not rounding.
 */
export const statementGrowth: ScenarioTemplate = {
  id: 'statement-growth',
  skill: 'testing-statements',
  tiers: [1, 2, 3],
  build(tier, random) {
    const s = pick(random, SETTINGS);
    const span = tier + 1;
    const first = randomInt(random, 2016, 2025 - span);
    const years = Array.from({ length: span }, (_, i) => first + i);
    const data = s.regions.map(() => {
      let value = randomStep(random, 40, 400, 5);
      return years.map((_, i) => {
        if (i > 0) value = Math.round(value * (1 + randomInt(random, 1, 22) / 100));
        return value;
      });
    });
    const totals = years.map((_, i) => data.reduce((sum, row) => sum + row[i]!, 0));
    const last = span - 1;
    const pickYears = (): [number, number] => {
      const a = randomInt(random, 0, last - 1);
      return [a, randomInt(random, a + 1, last)];
    };
    const growth = (row: number[], a: number, b: number) => (row[b]! / row[a]! - 1) * 100;
    const Cap = (name: string) => name[0]!.toUpperCase() + name.slice(1);

    const makers: StatementMaker[] = [
      (want) => {
        const r = randomInt(random, 0, 2);
        const [a, b] = pickYears();
        const actual = growth(data[r]!, a, b);
        const more = random.next() < 0.6;
        const x = threshold(random, actual, more, want);
        if (x === null) return null;
        return {
          text: `Revenue in ${s.regions[r]} grew by ${more ? 'more' : 'less'} than ${x}% between ${years[a]} and ${years[b]}`,
          working: `${Cap(s.regions[r]!)}: ${f(data[r]![b]!)} ÷ ${f(data[r]![a]!)} − 1 = ${approx(actual)}%`,
          about: `growth-${r}-${a}-${b}`,
        };
      },
      (want) => {
        const [a, b] = pickYears();
        const [r1, r2] = [randomInt(random, 0, 2), randomInt(random, 0, 2)];
        if (r1 === r2) return null;
        const [g1, g2] = [growth(data[r1]!, a, b), growth(data[r2]!, a, b)];
        if (Math.abs(g1 - g2) < 2 || Math.abs(g1 - g2) < 0.1 * Math.max(g1, g2)) return null;
        const [fast, slow] = (g1 > g2) === want ? [r1, r2] : [r2, r1];
        return {
          text: `Revenue in ${s.regions[fast]} grew faster than revenue in ${s.regions[slow]} between ${years[a]} and ${years[b]}`,
          working: `Growth ${years[a]}–${years[b]}: ${s.regions[r1]} ${approx(g1)}%, ${s.regions[r2]} ${approx(g2)}%`,
          about: `compare-${Math.min(r1, r2)}-${Math.max(r1, r2)}-${a}-${b}`,
        };
      },
      (want) => {
        const r = randomInt(random, 0, 2);
        const y = randomInt(random, 0, last);
        const actual = (data[r]![y]! / totals[y]!) * 100;
        const more = random.next() < 0.5;
        const x = threshold(random, actual, more, want);
        if (x === null) return null;
        return {
          text: `${Cap(s.regions[r]!)} accounted for ${more ? 'more' : 'less'} than ${x}% of total revenue in ${years[y]}`,
          working: `Share of ${s.regions[r]} in ${years[y]}: ${f(data[r]![y]!)} ÷ ${f(totals[y]!)} = ${approx(actual)}%`,
          about: `share-${r}-${y}`,
        };
      },
      (want) => {
        const [a, b] = pickYears();
        const actual = growth(totals, a, b);
        const more = random.next() < 0.6;
        const x = threshold(random, actual, more, want);
        if (x === null) return null;
        return {
          text: `Total revenue grew by ${more ? 'more' : 'less'} than ${x}% between ${years[a]} and ${years[b]}`,
          working: `Total: ${f(totals[b]!)} ÷ ${f(totals[a]!)} − 1 = ${approx(actual)}%`,
          about: `total-${a}-${b}`,
        };
      },
      ...(tier === 3
        ? [
            ((want) => {
              const r = randomInt(random, 0, 2);
              const actual = ((data[r]![last]! / data[r]![0]!) ** (1 / last) - 1) * 100;
              const more = random.next() < 0.5;
              const x = threshold(random, actual, more, want);
              if (x === null) return null;
              return {
                text: `Revenue in ${s.regions[r]} grew by an average of ${more ? 'more' : 'less'} than ${x}% a year between ${years[0]} and ${years[last]}`,
                working: `${Cap(s.regions[r]!)}: (${f(data[r]![last]!)} ÷ ${f(data[r]![0]!)}) to the power 1/${last} − 1 = ${approx(actual)}% a year`,
                about: `average-${r}`,
              };
            }) as StatementMaker,
          ]
        : []),
    ];
    const { options, correctIndex, correct, workings } = statementOptions(makers, random);

    return {
      targetTimeMs: [75_000, 100_000, 130_000][tier - 1]!,
      prompt: 'Which of the following statements is supported by the data in the table?',
      context: [
        { type: 'paragraph', text: s.intro },
        {
          type: 'table',
          title: s.title,
          headers: ['', ...years.map(String)],
          rows: [...s.regions.map((r, i) => [Cap(r), ...data[i]!.map((v) => f(v))]), ['Total', ...totals.map((v) => f(v))]],
        },
      ],
      answer: { kind: 'choice', options, correctIndex },
      solution: [...workings, `The only true statement: ${correct}`],
      shortcut:
        'Test each statement only as precisely as it needs: a threshold far from the true figure can be settled with rounded numbers, so save exact work for the close calls. Growth compares the change with the earlier year, never the later one.',
    };
  },
};
