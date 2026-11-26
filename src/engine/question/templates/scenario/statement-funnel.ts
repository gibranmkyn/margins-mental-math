import { formatNumber as f } from '../../format';
import { randomInt } from '../../random';
import type { ScenarioTemplate } from '../template';
import type { Statement, StatementMaker } from './options';
import { statementOptions } from './options';
import { percent, pick, randomStep, shuffle } from './text';

interface Setting {
  intro: string;
  /** Everyone counted, plural: "visitors". */
  people: string;
  /** How they split, and the segment followed further (first in the list). */
  splitTitle: string;
  segments: [string, string, string];
  /** What the followed segment did; each a verb phrase without "or" or "and". */
  outcomesTitle: string;
  outcomes: [string, string, string];
  /** The outcome followed one step further at tier 3, and the sub-split shown. */
  subTitle: string;
  sub: string;
}

const SETTINGS: Setting[] = [
  {
    intro: 'An online homeware shop tracked every visit to its website last month.',
    people: 'visitors',
    splitTitle: 'Visitors by device',
    segments: ['mobile', 'desktop', 'tablet'],
    outcomesTitle: 'What mobile visitors did',
    outcomes: ['bought something', 'filled a basket but left', 'signed up for emails'],
    subTitle: 'Delivery chosen by mobile visitors who bought something',
    sub: 'chose next-day delivery',
  },
  {
    intro: 'A science museum surveyed its visitors over the summer holidays.',
    people: 'visitors',
    splitTitle: 'Visitors by ticket type',
    segments: ['family', 'adult', 'school'],
    outcomesTitle: 'What family visitors did besides the galleries',
    outcomes: ['ate at the café', 'saw the planetarium show', 'bought a membership'],
    subTitle: 'Spend of family visitors who ate at the café',
    sub: 'spent more than $40',
  },
  {
    intro: 'A lender reviewed every loan application it received last quarter.',
    people: 'applicants',
    splitTitle: 'Applicants by channel',
    segments: ['app', 'branch', 'broker'],
    outcomesTitle: 'Outcome of app applications',
    outcomes: ['were approved', 'were referred for checks', 'withdrew'],
    subTitle: 'App applicants who were approved',
    sub: 'also opened a savings account',
  },
];

/**
 * Exactly one of four statements about a two-level (tier 3: three-level)
 * breakdown is true. Shares of a share multiply; sub-shares add only within
 * the same group. Every false statement is a recognisable slip: forgetting the
 * first split, multiplying the wrong pair, or comparing a share of a share
 * with a whole share.
 */
export const statementFunnel: ScenarioTemplate = {
  id: 'statement-funnel',
  skill: 'testing-statements',
  tiers: [1, 2, 3],
  build(tier, random) {
    const s = pick(random, SETTINGS);
    const unit = tier === 3 ? 10 : 5;
    const lead = randomStep(random, 30, 70, unit);
    const second = randomStep(random, 10, 100 - lead - 10, unit);
    const shares = [lead, second, 100 - lead - second];
    const outcomes = shuffle(random, [randomStep(random, 10, 35, 5), randomStep(random, 10, 30, 5), randomStep(random, 5, 25, 5)]);
    const sub = randomStep(random, 20, 80, 10);
    const [seg, pop] = [s.segments[0], s.people];
    const of = (p: number, q: number) => (p * q) / 100;
    const differs = (a: number, b: number) => Math.abs(a - b) > 0.06 * Math.max(a, b);

    /** A share stated as true, or as one of the given slips that is clearly different. */
    const stated = (truth: number, slips: number[], want: boolean): number | null => {
      if (want) return truth;
      const usable = slips.filter((x) => x > 0 && x < 100 && differs(x, truth));
      return usable.length > 0 ? pick(random, usable) : null;
    };
    const statement = (text: string, working: string, about: string): Statement => ({ text, working, about });
    const cap = (t: string) => t[0]!.toUpperCase() + t.slice(1);

    const makers: StatementMaker[] = [
      (want) => {
        const i = randomInt(random, 0, 2);
        const truth = of(lead, outcomes[i]!);
        const p = stated(truth, [outcomes[i]!, of(shares[1]!, outcomes[i]!), of(shares[2]!, outcomes[i]!)], want);
        if (p === null) return null;
        return statement(
          `${f(p)}% of all ${pop} were ${seg} ${pop} who ${s.outcomes[i]}`,
          `${cap(seg)} ${pop} who ${s.outcomes[i]}: ${lead}% × ${outcomes[i]}% = ${f(truth)}% of all ${pop}`,
          `one-${i}`,
        );
      },
      (want) => {
        const [i, j] = shuffle(random, [0, 1, 2]) as [number, number, number];
        const truth = outcomes[i]! + outcomes[j]!;
        const p = stated(truth, [of(lead, truth), outcomes[i]! * 2, Math.abs(outcomes[i]! - outcomes[j]!)], want);
        if (p === null) return null;
        return statement(
          `${f(p)}% of ${seg} ${pop} ${s.outcomes[i]} or ${s.outcomes[j]}`,
          `Within ${seg} ${pop}: ${outcomes[i]}% + ${outcomes[j]}% = ${f(truth)}%`,
          `within-${Math.min(i, j)}-${Math.max(i, j)}`,
        );
      },
      (want) => {
        const i = randomInt(random, 0, 2);
        const k = randomInt(random, 1, 2);
        const left = of(lead, outcomes[i]!);
        if (!differs(left, shares[k]!) || Math.abs(left - shares[k]!) < 1) return null;
        if (left > shares[k]! !== want) return null;
        return statement(
          `More ${pop} were ${seg} ${pop} who ${s.outcomes[i]} than were ${s.segments[k]} ${pop}`,
          `${lead}% × ${outcomes[i]}% = ${f(left)}% against ${shares[k]}% ${s.segments[k]}`,
          `compare-${i}-${k}`,
        );
      },
      ...(tier >= 2
        ? [
            ((want) => {
              const [i, j] = shuffle(random, [0, 1, 2]) as [number, number, number];
              const truth = of(lead, outcomes[i]! + outcomes[j]!);
              const p = stated(truth, [outcomes[i]! + outcomes[j]!, of(lead, outcomes[i]!), of(lead, outcomes[i]!) + outcomes[j]!], want);
              if (p === null) return null;
              return statement(
                `${f(p)}% of all ${pop} were ${seg} ${pop} who ${s.outcomes[i]} or ${s.outcomes[j]}`,
                `${lead}% × (${outcomes[i]}% + ${outcomes[j]}%) = ${f(truth)}% of all ${pop}`,
                `two-${Math.min(i, j)}-${Math.max(i, j)}`,
              );
            }) as StatementMaker,
          ]
        : []),
      ...(tier === 3
        ? [
            ((want) => {
              const truth = of(of(lead, outcomes[0]!), sub);
              const p = stated(truth, [of(outcomes[0]!, sub), of(lead, sub), of(lead, outcomes[0]!)], want);
              if (p === null) return null;
              return statement(
                `${f(p)}% of all ${pop} were ${seg} ${pop} who ${s.outcomes[0]} and ${s.sub}`,
                `${lead}% × ${outcomes[0]}% × ${sub}% = ${f(truth)}% of all ${pop}`,
                'three',
              );
            }) as StatementMaker,
          ]
        : []),
    ];
    const { options, correctIndex, correct, workings } = statementOptions(makers, random);

    const context = [
      { type: 'paragraph' as const, text: s.intro },
      { type: 'table' as const, title: s.splitTitle, headers: ['Group', `Share of ${pop}`], rows: s.segments.map((g, i) => [cap(g), percent(shares[i]!)]) },
      {
        type: 'table' as const,
        title: s.outcomesTitle,
        headers: ['Outcome', `Share of ${seg} ${pop}`],
        rows: [...s.outcomes.map((o, i) => [cap(o), percent(outcomes[i]!)]), ['None of these', percent(100 - outcomes.reduce((a, b) => a + b, 0))]],
      },
      ...(tier === 3
        ? [{ type: 'table' as const, title: s.subTitle, headers: ['Outcome', 'Share'], rows: [[cap(s.sub), percent(sub)], ['Did not', percent(100 - sub)]] }]
        : []),
    ];

    return {
      targetTimeMs: [70_000, 100_000, 120_000][tier - 1]!,
      prompt: 'Which one of these statements follows from the data?',
      context,
      answer: { kind: 'choice', options, correctIndex },
      solution: [...workings, `The only true statement: ${correct}`],
      shortcut: `Write every figure as a share of all ${pop} before comparing: multiply down the levels (${lead}% of ${pop} are ${seg}, so ${seg} figures shrink by that factor), and add shares only when they belong to the same group.`,
    };
  },
};
