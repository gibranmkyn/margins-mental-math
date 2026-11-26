import { formatNumber as f } from '../../format';
import { randomInt } from '../../random';
import type { ScenarioTemplate } from '../template';
import { approx, oneDecimal, pick, randomStep, until } from './text';

interface Setting {
  intro: string;
  /** The whole, e.g. "the company's revenue". */
  whole: string;
  /** The fast-growing part. */
  part: string;
  /** Other parts, for the tier 3 table. */
  others: [string, string, string, string];
  /** The unit, for the table title. */
  unit: string;
  /** An amount in words: "$240 million". */
  amount: (n: string) => string;
}

const SETTINGS: Setting[] = [
  {
    intro: 'A sportswear brand sells through wholesale partners, its own shops and its website.',
    whole: 'total sales',
    part: 'Website',
    others: ['Wholesale', 'Own shops', 'Outlets', 'Concessions'],
    unit: '$ million',
    amount: (n) => `$${n} million`,
  },
  {
    intro: 'A national energy supplier is tracking how its generation mix is changing.',
    whole: 'total generation',
    part: 'Solar',
    others: ['Gas', 'Wind', 'Hydro', 'Nuclear'],
    unit: 'terawatt-hours',
    amount: (n) => `${n} terawatt-hours`,
  },
  {
    intro: 'An insurer is watching its products as customers shift towards new cover.',
    whole: 'total premiums',
    part: 'Pet insurance',
    others: ['Motor', 'Home', 'Travel', 'Life'],
    unit: '$ million',
    amount: (n) => `$${n} million`,
  },
  {
    intro: 'A city transport authority is following how commuters travel to work.',
    whole: 'all commuter trips',
    part: 'Cycling',
    others: ['Car', 'Bus', 'Rail', 'Walking'],
    unit: 'million trips a year',
    amount: (n) => `${n} million trips a year`,
  },
];

/**
 * The minimum number of years, among the options, for a fast-growing part to
 * pass a threshold. Tier 1 compounds one amount to an absolute target; tier 2
 * grows a share when the whole grows too; tier 3 first reads the share off a
 * table. Growing one part faster than the whole moves the share by roughly the
 * difference in growth rates each year, compounded.
 */
export const shareShift: ScenarioTemplate = {
  id: 'share-shift',
  skill: 'growth-trends',
  tiers: [1, 2, 3],
  build(tier, random) {
    const s = pick(random, SETTINGS);
    const step = pick(random, tier === 1 ? [1, 2] : [2, 3, 5]);
    // Where the answer sits among the four option years, drawn first so every letter is as likely.
    const position = randomInt(random, 0, 3);

    const draw = () => {
      const partGrowth = randomInt(random, tier === 1 ? 5 : 8, 25);
      const wholeGrowth = tier === 1 ? 0 : randomInt(random, 1, Math.min(8, partGrowth - 4));
      const others = s.others.map(() => randomStep(random, 20, 200, 5));
      const part = tier === 3 ? randomStep(random, 10, 60, 1) : randomStep(random, 20, 400, 5);
      const whole = tier === 3 ? part + others.reduce((a, b) => a + b, 0) : 0;
      const share = tier === 2 ? randomInt(random, 8, 30) : tier === 3 ? (part / whole) * 100 : 0;
      const target = tier === 1 ? Math.round((part * (1.6 + random.next() * 2.4)) / 10) * 10 : pick(random, [25, 30, 35, 40, 45, 50, 60]);
      const ratio = (1 + partGrowth / 100) / (1 + wholeGrowth / 100);
      const startLevel = tier === 1 ? part : share;
      const exact = Math.log(target / startLevel) / Math.log(ratio);
      return { partGrowth, wholeGrowth, others, part, whole, share, target, ratio, startLevel, exact };
    };
    const d = until(draw, (c) => {
      // At least four steps out, so neighbouring option years are close to each other next to the answer.
      if (!(c.exact > 3 * step && c.exact < 8 * step)) return false;
      // Every option year must land clearly above or below the target.
      const crossing = Math.ceil(c.exact / step);
      const lowest = crossing - position;
      for (let m = lowest; m <= lowest + 3; m++) {
        const level = c.startLevel * c.ratio ** (m * step);
        if (Math.abs(Math.log(level / c.target)) < 0.03) return false;
      }
      // A share can never pass 100%, so even the latest option year must stay well below it.
      return tier === 1 || c.startLevel * c.ratio ** ((lowest + 3) * step) <= 98;
    });

    // Four option years on a grid; the first one past the target sits anywhere among them.
    const crossing = Math.ceil(d.exact / step);
    const lowest = crossing - position;
    const years = [0, 1, 2, 3].map((k) => (lowest + k) * step);
    const answerYears = crossing * step;
    const label = (n: number) => (n === 1 ? '1 year' : `${n} years`);
    const options = years.map(label);
    const correct = label(answerYears);
    const correctIndex = options.indexOf(correct);

    const context =
      tier === 3
        ? [
            { type: 'paragraph' as const, text: s.intro },
            {
              type: 'table' as const,
              title: `This year (${s.unit})`,
              headers: ['Segment', 'Volume'],
              rows: [[s.part, f(d.part)], ...s.others.map((name, i) => [name, f(d.others[i]!)])],
            },
          ]
        : [{ type: 'paragraph' as const, text: s.intro }];
    const growthText =
      tier === 1
        ? `${s.part} is ${s.amount(f(d.part))} this year and grows by ${d.partGrowth}% a year.`
        : tier === 2
          ? `${s.part} makes up ${d.share}% of ${s.whole} this year. ${s.part} grows by ${d.partGrowth}% a year and ${s.whole} by ${d.wholeGrowth}% a year.`
          : `${s.part} is expected to grow by ${d.partGrowth}% a year and ${s.whole} by ${d.wholeGrowth}% a year.`;
    context.push({ type: 'paragraph', text: growthText });

    const prompt =
      tier === 1
        ? `If that growth continues, which of the following is the MINIMUM number of years before ${s.part} exceeds ${s.amount(f(d.target))}?`
        : `If these growth rates continue, which of the following is the MINIMUM number of years before ${s.part} makes up more than ${d.target}% of ${s.whole}?`;

    const levelAt = (n: number) => d.startLevel * d.ratio ** n;
    const show = (n: number) => (tier === 1 ? s.amount(approx(levelAt(n))) : `${approx(levelAt(n))}%`);
    const solution = [
      ...(tier === 3 ? [`Share this year: ${f(d.part)} ÷ ${f(d.whole)} = ${approx(d.share)}%`] : []),
      tier === 1
        ? `Each year multiplies ${s.part} by ${f(1 + d.partGrowth / 100)}`
        : `Each year the share is multiplied by ${f(1 + d.partGrowth / 100)} ÷ ${f(1 + d.wholeGrowth / 100)} = ${approx(d.ratio)}`,
      ...years.map((n) => `After ${label(n)}: ${show(n)}${levelAt(n) > d.target ? ' (above)' : ' (not yet)'}`),
      `First option past the threshold: ${correct}`,
    ];
    const shortcut =
      tier === 1
        ? `Use the rule of 72: at ${d.partGrowth}% a year an amount doubles in about ${oneDecimal(72 / d.partGrowth)} years. The target is ${oneDecimal(d.target / d.part)} times today's level, so count doublings.`
        : `The share grows by roughly ${d.partGrowth - d.wholeGrowth}% a year (the gap between the two rates), so by the rule of 72 it doubles in about ${oneDecimal(72 / (d.partGrowth - d.wholeGrowth))} years; going from ${approx(d.startLevel)}% to ${d.target}% is a ${oneDecimal(d.target / d.startLevel)}-fold rise.`;

    return {
      targetTimeMs: [70_000, 100_000, 130_000][tier - 1]!,
      prompt,
      context,
      answer: { kind: 'choice', options, correctIndex },
      solution,
      shortcut,
    };
  },
};
