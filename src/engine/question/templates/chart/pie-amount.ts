import { formatNumber as f } from '../../format';
import type { Random } from '../../random';
import { randomInt } from '../../random';
import type { ChartBlock } from '../../types';
import { choiceOptions } from '../scenario/options';
import { approx, pick } from '../scenario/text';
import type { ScenarioTemplate } from '../template';
import { looksCharted, unitOption, until } from './charts';

interface Setting {
  intro: (total: string) => string;
  title: string;
  /** What the pie splits, for prompts. */
  whole: string;
  slices: string[];
  /** Total in $m. */
  total: [number, number];
}

const SETTINGS: Setting[] = [
  {
    intro: (total) => `A regional bakery chain spent ${total} on operating costs last year and is looking for savings.`,
    title: 'Operating costs by type',
    whole: 'operating costs',
    slices: ['Ingredients', 'Staff', 'Rent', 'Energy', 'Delivery', 'Other'],
    total: [12, 90],
  },
  {
    intro: (total) => `A university’s IT department had a budget of ${total} last year.`,
    title: 'IT budget by area',
    whole: 'the IT budget',
    slices: ['Staff', 'Licences', 'Hardware', 'Cloud', 'Security'],
    total: [8, 60],
  },
  {
    intro: (total) => `A mid-sized airline’s costs came to ${total} last year.`,
    title: 'Airline costs by type',
    whole: 'costs',
    slices: ['Fuel', 'Crew', 'Airports', 'Leases', 'Upkeep', 'Other'],
    total: [400, 2_400],
  },
];

/**
 * A cost pie with every slice’s share printed and the total given in the
 * text. Tier 1 asks one slice’s amount; tier 2 two slices’ combined amount;
 * tier 3 how far the total falls if one slice is cut.
 */
export const pieAmount: ScenarioTemplate = {
  id: 'pie-amount',
  skill: 'pie-charts',
  tiers: [1, 2, 3],
  build(tier, random) {
    const s = pick(random, SETTINGS);

    return until(() => {
      const shares = splitShares(random, s.slices.length);
      const total = randomInt(random, s.total[0], s.total[1]);
      const x = randomInt(random, 0, s.slices.length - 2);
      const chart: ChartBlock = {
        type: 'chart',
        chart: 'pie',
        title: s.title,
        unit: `Share of ${s.whole}, %`,
        categories: s.slices,
        series: [{ name: s.title, values: shares }],
        labelled: true,
        decimals: 0,
        suffix: '%',
        highlight: x,
      };
      const intro = { type: 'paragraph' as const, text: s.intro(`$${f(total)}m`) };
      const money = unitOption('$', 'm');

      if (tier === 1) {
        const truth = (shares[x]! * total) / 100;
        if (looksCharted(truth, chart)) return null;
        const { options, correctIndex, correct } = choiceOptions(truth, random, { format: money, finestStep: 0.01 });
        return {
          targetTimeMs: 45_000,
          prompt: `Roughly how much was spent on ${s.slices[x]} last year?`,
          context: [intro, chart],
          answer: { kind: 'choice', options, correctIndex },
          solution: [`${s.slices[x]}: ${shares[x]}% of $${f(total)}m`, `${shares[x]}% × $${f(total)}m = $${approx(truth)}m`, `Closest option: ${correct}`],
          shortcut: `Take 1% of the total ($${f(total / 100)}m) and multiply by ${shares[x]}.`,
        };
      }

      if (tier === 2) {
        const y = randomInt(random, x + 1, s.slices.length - 1);
        const pair = shares[x]! + shares[y]!;
        const truth = (pair * total) / 100;
        if (looksCharted(truth, chart)) return null;
        const { options, correctIndex, correct } = choiceOptions(truth, random, { format: money, finestStep: 0.01 });
        return {
          targetTimeMs: 60_000,
          prompt: `Roughly how much was spent on ${s.slices[x]} and ${s.slices[y]} together?`,
          context: [intro, chart],
          answer: { kind: 'choice', options, correctIndex },
          solution: [
            `Combined share: ${shares[x]}% + ${shares[y]}% = ${pair}%`,
            `${pair}% × $${f(total)}m = $${approx(truth)}m`,
            `Closest option: ${correct}`,
          ],
          shortcut: `Add the shares first and multiply once: ${pair}% of $${f(total)}m.`,
        };
      }

      const cut = pick(random, [10, 15, 20, 25, 30, 40]);
      const truth = (shares[x]! * cut) / 100;
      // A fall of at least 3.5%, so options a point apart stay close neighbours.
      if (truth < 3.5 || looksCharted(truth, chart)) return null;
      const { options, correctIndex, correct } = choiceOptions(truth, random, {
        format: unitOption('', '%'),
        finestStep: 0.1,
        // Reading the cut as a cut to the whole.
        traps: [cut, (shares[x]! * cut) / (100 - shares[x]!)],
      });
      return {
        targetTimeMs: 60_000,
        prompt: `If spending on ${s.slices[x]} were cut by ${cut}% and nothing else changed, by roughly what percentage would ${s.whole} fall?`,
        context: [intro, chart],
        answer: { kind: 'choice', options, correctIndex },
        solution: [
          `${s.slices[x]} is ${shares[x]}% of ${s.whole}`,
          `Fall in the total: ${cut}% × ${shares[x]}% = ${approx(truth)}%`,
          `Closest option: ${correct}`,
        ],
        shortcut: `A cut to one slice moves the total by the cut times the slice’s share; the $${f(total)}m total is not needed.`,
      };
    });
  },
};

/** Whole-percent shares, each at least 5%, adding to 100. */
export function splitShares(random: Random, count: number): number[] {
  for (;;) {
    const weights = Array.from({ length: count }, () => randomInt(random, 4, 30));
    const sum = weights.reduce((a, b) => a + b, 0);
    const shares = weights.map((w) => Math.max(5, Math.round((w / sum) * 100)));
    const drift = 100 - shares.reduce((a, b) => a + b, 0);
    const biggest = shares.indexOf(Math.max(...shares));
    shares[biggest] = shares[biggest]! + drift;
    if (shares.every((v) => v >= 5)) return shares;
  }
}
