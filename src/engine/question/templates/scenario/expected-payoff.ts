import { formatFixed, formatNumber as f } from '../../format';
import { randomInt } from '../../random';
import type { ScenarioTemplate } from '../template';
import { choiceOptions } from './options';
import { approx, percent, pick, until } from './text';

interface Setting {
  intro: string;
  /** The single bet at tier 1: what is won and what it costs to try. */
  win: string;
  cost: string;
  /** Tier 2 and 3: the project and its scenarios. */
  project: string;
  scenarios: [string, string, string];
  /** The safer alternative at tier 3. */
  alternative: string;
}

const SETTINGS: Setting[] = [
  {
    intro: 'A construction firm is weighing where to put its money this year.',
    win: 'the profit on the contract if the bid wins',
    cost: 'the cost of preparing the bid',
    project: 'building a new logistics park on its own land',
    scenarios: ['Strong demand', 'Expected demand', 'Weak demand'],
    alternative: 'selling the land now',
  },
  {
    intro: 'A film studio is deciding which projects to back.',
    win: 'the profit if the pilot is picked up for a full series',
    cost: 'the cost of shooting the pilot',
    project: 'making a big-budget sequel',
    scenarios: ['Box-office hit', 'Solid run', 'Flop'],
    alternative: 'licensing the rights to another studio',
  },
  {
    intro: 'A mining company is weighing its options at an early-stage copper site.',
    win: 'the profit from the deposit if drilling confirms it',
    cost: 'the cost of the drilling programme',
    project: 'developing the mine itself',
    scenarios: ['High copper price', 'Base copper price', 'Low copper price'],
    alternative: 'selling the site to a larger miner',
  },
];

/**
 * Expected value: probability-weighted payoffs less what must be spent up
 * front. Tier 1 is one bet that wins or loses; tier 2 a project with three
 * scenarios, one of them a loss; tier 3 compares that project with a certain
 * alternative. Traps: averaging the payoffs without the probabilities,
 * forgetting the upfront cost, and taking the most likely scenario.
 */
export const expectedPayoff: ScenarioTemplate = {
  id: 'expected-payoff',
  skill: 'expected-value',
  tiers: [1, 2, 3],
  build(tier, random) {
    const s = pick(random, SETTINGS);
    const signed = (v: number) => (v < 0 ? `−$${f(-v)} million` : `$${f(v)} million`);
    const option = (value: number, decimals: number) => `$${formatFixed(value, decimals)}m`;

    if (tier === 1) {
      const d = until(
        () => ({ p: randomInt(random, 2, 18) * 5, win: randomInt(random, 4, 60), cost: randomInt(random, 2, 30) / 10 }),
        (c) => (c.p / 100) * c.win - c.cost >= 0.5,
      );
      const truth = (d.p / 100) * d.win - d.cost;
      const { options, correctIndex, correct } = choiceOptions(truth, random, {
        format: option,
        finestStep: 0.01,
        traps: [(d.p / 100) * d.win, d.win - d.cost, d.win / 2 - d.cost],
      });
      return {
        targetTimeMs: 50_000,
        prompt: 'Which of the following is closest to the expected value of going ahead, after the cost of trying?',
        context: [
          { type: 'paragraph', text: s.intro },
          {
            type: 'list',
            items: [`Chance of success: ${percent(d.p)}`, `Payoff if successful (${s.win}): ${signed(d.win)}`, `Cost of trying (${s.cost}): ${signed(d.cost)}, spent either way`],
          },
        ],
        answer: { kind: 'choice', options, correctIndex },
        solution: [`Expected payoff: ${d.p}% × ${signed(d.win)} = $${approx((d.p / 100) * d.win)} million`, `Less the cost: $${approx((d.p / 100) * d.win)} million − ${signed(d.cost)} = $${approx(truth)} million`, `Closest option: ${correct}`],
        shortcut: `Expected value is the payoff scaled by its chance, then everything that is spent for sure comes off in full: ${d.p}% of ${f(d.win)} is ${f(d.win / 10)} × ${f(d.p / 10)}, before the cost is taken off.`,
      };
    }

    const d = until(
      () => {
        const pHigh = randomInt(random, 2, 7) * 5;
        const pLow = randomInt(random, 2, 7) * 5;
        const probabilities = [pHigh, 100 - pHigh - pLow, pLow];
        const payoffs = [randomInt(random, 40, 160), randomInt(random, 15, 70), -randomInt(random, 5, 50)];
        const investment = tier === 2 ? randomInt(random, 2, 25) : 0;
        const alternative = tier === 3 ? randomInt(random, 5, 40) : 0;
        const expected = probabilities.reduce((sum, p, i) => sum + (p / 100) * payoffs[i]!, 0);
        return { probabilities, payoffs, investment, alternative, expected };
      },
      (c) => c.probabilities[1]! >= 20 && c.payoffs[0]! > c.payoffs[1]! * 1.5 && c.expected - c.investment - c.alternative >= 2,
    );
    const truth = d.expected - d.investment - d.alternative;
    const simple = d.payoffs.reduce((a, b) => a + b, 0) / 3;
    const { options, correctIndex, correct } = choiceOptions(truth, random, {
      format: option,
      finestStep: 0.01,
      traps: [simple - d.investment - d.alternative, d.expected, d.payoffs[1]! - d.investment - d.alternative],
    });

    const rows = s.scenarios.map((name, i) => [name, percent(d.probabilities[i]!), signed(d.payoffs[i]!)]);
    const prompt =
      tier === 2
        ? `Which of the following is closest to the expected profit of ${s.project}, after the upfront spend?`
        : `By how much does the expected profit of ${s.project} exceed the certain profit of ${s.alternative}? Choose the closest.`;
    const extra =
      tier === 2
        ? `Before any of this, the company must spend ${signed(d.investment)} up front, which is not included in the profits shown.`
        : `Alternatively, ${s.alternative} would bring a certain profit of ${signed(d.alternative)}.`;
    const weighted = s.scenarios.map((_, i) => `${d.probabilities[i]}% × ${signed(d.payoffs[i]!)}`).join(' + ');

    return {
      targetTimeMs: [50_000, 90_000, 110_000][tier - 1]!,
      prompt,
      context: [
        { type: 'paragraph', text: `${s.intro} The team is looking at ${s.project}.` },
        { type: 'table', title: 'Scenarios', headers: ['Scenario', 'Probability', 'Profit'], rows },
        { type: 'paragraph', text: extra },
      ],
      answer: { kind: 'choice', options, correctIndex },
      solution: [
        `Expected profit: ${weighted} = $${approx(d.expected)} million`,
        tier === 2
          ? `Less the upfront spend: $${approx(d.expected)} million − ${signed(d.investment)} = $${approx(truth)} million`
          : `Compared with ${s.alternative}: $${approx(d.expected)} million − ${signed(d.alternative)} = $${approx(truth)} million`,
        `Closest option: ${correct}`,
      ],
      shortcut: 'Weight every scenario, losses included, by its probability and add; a loss scenario subtracts. Probabilities in fifths and tenths make the sums quick: 25% is a quarter, 35% is a third plus a bit.',
    };
  },
};
