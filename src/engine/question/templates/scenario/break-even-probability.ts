import { formatNumber as f } from '../../format';
import { randomInt } from '../../random';
import type { ScenarioTemplate } from '../template';
import { choiceOptions } from './options';
import { approx, percentOption, pick, until } from './text';

interface Setting {
  intro: string;
  /** The venture and what success and failure mean. */
  venture: string;
  success: string;
  failure: string;
  /** What is spent up front, what is recovered on failure, and the extra cost of following up a success. */
  cost: string;
  salvage: string;
  launch: string;
}

const SETTINGS: Setting[] = [
  {
    intro: 'A biotech company is deciding whether to fund a clinical trial for a new treatment.',
    venture: 'the trial',
    success: 'the trial succeeds and the treatment is sold to a larger drug company',
    failure: 'the trial fails',
    cost: 'Cost of the trial',
    salvage: 'Value of the trial data if the trial fails (sold to researchers)',
    launch: 'Extra regulatory and manufacturing cost if the trial succeeds',
  },
  {
    intro: 'An energy company is considering drilling an exploration well offshore.',
    venture: 'the well',
    success: 'oil is found in commercial quantities',
    failure: 'the well is dry',
    cost: 'Cost of drilling',
    salvage: 'Resale value of the rig equipment if the well is dry',
    launch: 'Extra cost of connecting the well to a pipeline if oil is found',
  },
  {
    intro: 'A games studio is deciding whether to build a prototype for a publisher competition.',
    venture: 'the prototype',
    success: 'the prototype wins a publishing deal',
    failure: 'the prototype does not win',
    cost: 'Cost of building the prototype',
    salvage: 'Value of reusable code and art if it does not win',
    launch: 'Extra cost of finishing the game if it wins',
  },
];

/**
 * The minimum probability of success at which a venture is worth starting:
 * where expected payoff equals cost. Tier 1: p × payoff = cost. Tier 2: a
 * failure still recovers something, so p = (cost − salvage) ÷ (payoff −
 * salvage). Tier 3: success also needs a further spend, netted off the payoff.
 * Traps: ignoring the salvage, and netting it from one side only.
 */
export const breakEvenProbability: ScenarioTemplate = {
  id: 'break-even-probability',
  skill: 'expected-value',
  tiers: [1, 2, 3],
  build(tier, random) {
    const s = pick(random, SETTINGS);
    const d = until(
      () => {
        const payoff = randomInt(random, 20, 200);
        const cost = randomInt(random, 4, Math.round(payoff * 0.7));
        const salvage = tier >= 2 ? randomInt(random, 1, Math.max(1, Math.round(cost * 0.6))) : 0;
        const launch = tier === 3 ? randomInt(random, 3, Math.round(payoff * 0.4)) : 0;
        const p = ((cost - salvage) / (payoff - launch - salvage)) * 100;
        return { payoff, cost, salvage, launch, p };
      },
      (c) => c.p >= 8 && c.p <= 85 && c.payoff - c.launch > c.cost,
    );

    const { options, correctIndex, correct } = choiceOptions(d.p, random, {
      format: percentOption,
      finestStep: 0.1,
      traps: [(d.cost / d.payoff) * 100, ((d.cost - d.salvage) / d.payoff) * 100, (d.cost / (d.payoff - d.launch)) * 100],
    });

    const items = [
      `${s.cost}: $${f(d.cost)} million`,
      `Payoff if ${s.success}: $${f(d.payoff)} million`,
      ...(tier >= 2 ? [`${s.salvage}: $${f(d.salvage)} million`] : []),
      ...(tier === 3 ? [`${s.launch}: $${f(d.launch)} million`] : []),
    ];
    const net = d.payoff - d.launch;
    const solution = [
      'Break even where the expected payoff equals the cost: p × success + (1 − p) × failure = cost',
      ...(tier === 3 ? [`Net payoff on success: $${f(d.payoff)} million − $${f(d.launch)} million = $${f(net)} million`] : []),
      tier === 1
        ? `p = $${f(d.cost)} million ÷ $${f(d.payoff)} million = ${approx(d.p)}%`
        : `p = (${f(d.cost)} − ${f(d.salvage)}) ÷ (${f(net)} − ${f(d.salvage)}) = ${f(d.cost - d.salvage)} ÷ ${f(net - d.salvage)} = ${approx(d.p)}%`,
      `Closest option: ${correct}`,
    ];

    return {
      targetTimeMs: [50_000, 80_000, 110_000][tier - 1]!,
      prompt: `What is the minimum probability that ${s.success} for ${s.venture} to be worth starting on expected value? Choose the closest.`,
      context: [
        { type: 'paragraph', text: `${s.intro} If ${s.failure}${tier >= 2 ? ', only part of the money is recovered' : ', nothing is recovered'}.` },
        { type: 'list', items },
      ],
      answer: { kind: 'choice', options, correctIndex },
      solution,
      shortcut:
        tier === 1
          ? 'The break-even chance is simply cost ÷ payoff: the share of the prize you are paying to play.'
          : 'Count from the failure case: the money at risk is cost − salvage, and what success adds over failure is (net payoff − salvage). The break-even chance is the first divided by the second.',
    };
  },
};
