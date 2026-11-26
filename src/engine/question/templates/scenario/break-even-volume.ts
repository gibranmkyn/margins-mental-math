import { formatNumber as f } from '../../format';
import { randomInt } from '../../random';
import type { Random } from '../../random';
import type { ContextBlock } from '../../types';
import type { ScenarioTemplate } from '../template';
import { choiceOptions } from './options';
import { approx, money, pick, plainOption, randomStep } from './text';

interface Setting {
  intro: string;
  product: string;
  units: string;
  price: [number, number];
  /** Plausible annual volume for this kind of business. */
  volume: [number, number];
  /** Variable cost lines shown at tiers 2 and 3. */
  lines: [string, string];
  /** Fixed cost lines shown at tiers 2 and 3. */
  fixed: [string, string, string];
}

const SETTINGS: Setting[] = [
  {
    intro: 'A regional craft brewery plans to add a seasonal ale to its range.',
    product: 'the seasonal ale',
    units: 'cases',
    volume: [6_000, 40_000],
    price: [28, 64],
    lines: ['brewing ingredients', 'bottles and packaging'],
    fixed: ['extra brewer salary', 'fermentation tank lease', 'launch marketing'],
  },
  {
    intro: 'A furniture maker is considering a flat-pack standing desk sold online.',
    product: 'the desk',
    units: 'desks',
    volume: [1_500, 12_000],
    price: [180, 420],
    lines: ['timber and steel frame', 'delivery'],
    fixed: ['design team', 'tooling depreciation', 'online advertising'],
  },
  {
    intro: 'A meal-kit start-up wants to launch a family-sized vegetarian box.',
    product: 'the family box',
    units: 'boxes',
    volume: [10_000, 60_000],
    price: [42, 88],
    lines: ['ingredients', 'packaging and courier'],
    fixed: ['recipe development', 'cold-store rent', 'brand campaign'],
  },
  {
    intro: 'A bicycle retailer is weighing an own-brand electric bike.',
    product: 'the e-bike',
    units: 'bikes',
    volume: [300, 2_500],
    price: [1400, 3200],
    lines: ['frame, motor and battery', 'assembly labour'],
    fixed: ['showroom space', 'mechanic training', 'warranty administration'],
  },
  {
    intro: 'A skincare brand is preparing to launch a vitamin C serum.',
    product: 'the serum',
    units: 'bottles',
    volume: [10_000, 80_000],
    price: [24, 70],
    lines: ['formulation', 'bottle and label'],
    fixed: ['regulatory testing', 'influencer campaign', 'product manager'],
  },
];

/**
 * Break-even volume: fixed costs ÷ contribution per unit. Tier 1 gives single
 * totals; tier 2 splits the costs into lines to add; tier 3 adds a sales
 * commission charged as a share of the price.
 */
export const breakEvenVolume: ScenarioTemplate = {
  id: 'break-even-volume',
  skill: 'break-even-payback',
  tiers: [1, 2, 3],
  build(tier, random) {
    const s = pick(random, SETTINGS);
    const priceStep = s.price[1] >= 1000 ? 50 : 1;
    const price = randomStep(random, s.price[0], s.price[1], priceStep);
    const commissionPct = tier === 3 ? pick(random, [5, 8, 10, 12, 15]) : 0;
    const commission = (price * commissionPct) / 100;
    // Tier 1 keeps the contribution round so the division comes out exact; ragged above.
    const contributionStep = tier === 1 ? priceStep * 5 : priceStep;
    const baseContribution = randomStep(random, price * 0.3, price * 0.65, contributionStep);
    const variableTotal = price - baseContribution;
    const contribution = baseContribution - commission;

    const volumeStep = s.volume[1] >= 10_000 ? 100 : 10;
    const volume = tier === 1 ? randomStep(random, s.volume[0], s.volume[1], volumeStep) : randomInt(random, s.volume[0], s.volume[1]);
    const fixedTotal = tier === 1 ? contribution * volume : Math.round((contribution * volume) / 1_000) * 1_000;
    const breakEven = fixedTotal / contribution;

    const context: ContextBlock[] = [{ type: 'paragraph', text: s.intro }];
    const solution: string[] = [];
    if (tier === 1) {
      context.push({
        type: 'table',
        title: `Economics of ${s.product}`,
        headers: ['Item', 'Value'],
        rows: [
          ['Price per unit', money(price)],
          ['Variable cost per unit', money(variableTotal)],
          ['Annual fixed costs', money(fixedTotal)],
        ],
      });
      solution.push(`Contribution per unit: ${money(price)} − ${money(variableTotal)} = ${money(contribution)}`);
    } else {
      const v1 = Math.round((variableTotal * randomInt(random, 55, 80)) / 100 / priceStep) * priceStep;
      const v2 = variableTotal - v1;
      const fixedParts = splitThree(fixedTotal, random);
      const items = [
        `Price: ${money(price)} per unit`,
        `Variable cost, ${s.lines[0]}: ${money(v1)} per unit`,
        `Variable cost, ${s.lines[1]}: ${money(v2)} per unit`,
        ...(tier === 3 ? [`Variable cost, sales commission: ${commissionPct}% of price`] : []),
        ...s.fixed.map((name, i) => `Fixed cost, ${name}: ${money(fixedParts[i]!)} a year`),
      ];
      context.push({ type: 'list', items });
      solution.push(`Fixed costs: ${fixedParts.map(money).join(' + ')} = ${money(fixedTotal)}`);
      if (tier === 3) {
        solution.push(`Commission: ${commissionPct}% × ${money(price)} = ${money(commission)}`);
        solution.push(
          `Contribution per unit: ${money(price)} − ${money(v1)} − ${money(v2)} − ${money(commission)} = ${money(contribution)}`,
        );
      } else {
        solution.push(`Contribution per unit: ${money(price)} − ${money(v1)} − ${money(v2)} = ${money(contribution)}`);
      }
    }

    const { options, correctIndex, correct } = choiceOptions(breakEven, random, {
      format: plainOption,
      finestStep: 1,
      // Dividing by the price instead of the contribution is the classic slip.
      traps: [fixedTotal / price, fixedTotal / (price - variableTotal)],
    });
    solution.push(`Break-even volume: ${money(fixedTotal)} ÷ ${money(contribution)} = ${approx(breakEven)} ${s.units}`);
    solution.push(`Closest option: ${correct}`);

    const thousands = fixedTotal / 1_000;
    const shortcut =
      tier === 3
        ? `Fold the commission into the price: ${money(price)} × ${f(1 - commissionPct / 100)} = ${money(price - commission)}, less ${money(variableTotal)} of other variable cost leaves ${money(contribution)}; then work in thousands: ${f(thousands)}k ÷ ${money(contribution)} ≈ ${approx(breakEven / 1_000)}k ${s.units}.`
        : `Work in thousands: ${money(fixedTotal)} is ${f(thousands)}k, and ${f(thousands)}k ÷ ${money(contribution)} ≈ ${approx(breakEven / 1_000)}k ${s.units}. Only the contribution matters, never the price alone.`;

    return {
      targetTimeMs: [60_000, 90_000, 120_000][tier - 1]!,
      prompt: `Which of the following is closest to the number of ${s.units} it must sell each year to break even?`,
      context,
      answer: { kind: 'choice', options, correctIndex },
      solution,
      shortcut,
    };
  },
};

/** Split a total into three positive cost lines that add back to it exactly. */
function splitThree(total: number, random: Random): [number, number, number] {
  const unit = total >= 30_000 ? 1_000 : 100;
  const a = Math.round((total * randomInt(random, 30, 48)) / 100 / unit) * unit;
  const b = Math.round((total * randomInt(random, 18, 32)) / 100 / unit) * unit;
  return [a, b, total - a - b];
}
