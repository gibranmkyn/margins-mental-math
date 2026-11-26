import { formatNumber as f } from '../../format';
import { randomInt } from '../../random';
import type { ChartBlock } from '../../types';
import { choiceOptions } from '../scenario/options';
import { approx, pick } from '../scenario/text';
import type { ScenarioTemplate } from '../template';
import { looksCharted, snap, unitOption, until } from './charts';
import { estimateOptions, readable, readingBand } from './estimate';

interface Setting {
  intro: string;
  title: string;
  /** What the bars add up: "cost", "premium income". */
  measure: string;
  /** Who is grouped: singular and plural. */
  one: string;
  many: string;
  /** "the average cost per patient", completed by " in group C". */
  average: string;
  /** Members in each group, A to E: the costliest group is the smallest. */
  members: [number, number][];
  /** Value per member in group A, in dollars; later groups fall from it. */
  topValue: [number, number];
}

const GROUPS = ['A', 'B', 'C', 'D', 'E'];

const SETTINGS: Setting[] = [
  {
    intro:
      'A hospital groups the patients of its emergency department by how often they came in last year. Group A, the most frequent visitors, costs the most per patient to look after; group E the least.',
    title: 'Emergency department costs, last year',
    measure: 'cost',
    one: 'patient',
    many: 'patients',
    average: 'the average cost per patient',
    members: [
      [1_500, 4_000],
      [4_000, 9_000],
      [8_000, 15_000],
      [12_000, 24_000],
      [20_000, 40_000],
    ],
    topValue: [900, 2_400],
  },
  {
    intro:
      'A commercial insurer groups its policies by the premium each one pays. Group A holds the largest policies and group E the smallest.',
    title: 'Premium income by policy group, last year',
    measure: 'premium income',
    one: 'policy',
    many: 'policies',
    average: 'the average premium per policy',
    members: [
      [2_000, 6_000],
      [8_000, 20_000],
      [20_000, 45_000],
      [40_000, 80_000],
      [60_000, 140_000],
    ],
    topValue: [12_000, 30_000],
  },
  {
    intro:
      'A homeware retailer groups its loyalty-card members by how much they spent last year. Group A spent the most per member and group E the least.',
    title: 'Loyalty members’ spending, last year',
    measure: 'spending',
    one: 'member',
    many: 'members',
    average: 'the average spend per member',
    members: [
      [3_000, 8_000],
      [8_000, 18_000],
      [15_000, 30_000],
      [25_000, 50_000],
      [40_000, 90_000],
    ],
    topValue: [800, 2_000],
  },
];

/**
 * Cumulative share of a total across five groups ranked by value per member,
 * with each group's size listed beside the chart (the booklets' hospital and
 * insurer exhibits). Tier 1 labels the bars and asks a group's average per
 * member; tier 2 asks the average across groups B to D together, with bars
 * read off 10% gridlines; tier 3
 * labels the bars and compares two groups' averages. A group's share is the
 * step from the bar before; reading the bar as the share is offered whenever an
 * option can sit above the answer.
 */
export const cumulativeGroups: ScenarioTemplate = {
  id: 'cumulative-groups',
  skill: 'cumulative-charts',
  tiers: [1, 2, 3],
  build(tier, random) {
    const s = pick(random, SETTINGS);
    const labelled = tier !== 2;
    const grain = labelled ? 1 : 2;

    return until(() => {
      // Members rounded to hundreds; value per member falls from group to group.
      const members = s.members.map(([lo, hi]) => randomInt(random, lo / 100, hi / 100) * 100);
      let value = randomInt(random, s.topValue[0], s.topValue[1]);
      const amounts = members.map((n) => {
        const amount = n * value;
        value *= randomInt(random, 30, 75) / 100;
        return amount;
      });
      const whole = amounts.reduce((a, b) => a + b, 0);
      let running = 0;
      const bars = amounts.map((a, k) => (k === amounts.length - 1 ? 100 : snap(((running += a) / whole) * 100, grain)));
      const steps = bars.map((v, k) => v - (k > 0 ? bars[k - 1]! : 0));
      if (steps.some((v) => v < 6)) return null;
      // Ranked by value per member: as charted, each group's share per member is below the one before.
      const perMember = steps.map((v, k) => v / members[k]!);
      if (perMember.some((v, k) => k > 0 && v >= perMember[k - 1]! * 0.9)) return null;

      // The total, in $m to one decimal place, close to what the groups add up to.
      const totalM = Math.round(whole / 100_000) / 10;
      if (totalM < 1) return null;
      const totalText = `$${f(totalM)}m`;
      const total = totalM * 1_000_000;

      const chart: ChartBlock = {
        type: 'chart',
        chart: 'cumulative',
        title: s.title,
        unit: `Cumulative share of ${s.measure}, %; group A first`,
        categories: GROUPS.map((_, k) => (k === 0 ? 'A' : `A–${GROUPS[k]}`)),
        series: [{ name: 'Cumulative share', values: bars }],
        axis: { min: 0, max: 100, step: labelled ? 20 : 10 },
        labelled,
        decimals: 0,
        suffix: '%',
        note: `Total ${s.measure}: ${totalText}`,
      };
      const context = [
        { type: 'paragraph' as const, text: s.intro },
        { type: 'list' as const, items: GROUPS.map((g, k) => `Group ${g}: ${f(members[k]!)} ${s.many}`) },
        chart,
      ];
      const share = (k: number) => steps[k]!;
      const average = (k: number) => (share(k) * total) / 100 / members[k]!;
      const reading = (k: number) =>
        `${labelled ? '' : 'Reading the bars: '}${chart.categories[k - 1]} ${labelled ? '=' : '≈'} ${bars[k - 1]}%, ${chart.categories[k]} ${labelled ? '=' : '≈'} ${bars[k]}%`;
      const stepLine = (k: number) => `Group ${GROUPS[k]}’s share is the step between them: ${bars[k]}% − ${bars[k - 1]}% = ${share(k)}%`;
      const groupAmount = (k: number) => `Group ${GROUPS[k]}: ${share(k)}% × ${totalText} = $${approx((share(k) * totalM) / 100)}m`;

      if (tier === 2) {
        // Groups B to D together: a step between two bars tall enough to read off 10% gridlines.
        const asked = members[1]! + members[2]! + members[3]!;
        const joint = bars[3]! - bars[0]!;
        const truth = (joint * total) / 100 / asked;
        // The A–D bar read as their share, or bar A.
        const traps = [(bars[3]! * total) / 100 / asked, (bars[0]! * total) / 100 / asked];
        const answer = (c: ChartBlock) => ((c.series[0]!.values[3]! - c.series[0]!.values[0]!) * total) / 100 / asked;
        const band = readingBand(chart, answer);
        if (!readable(truth, band) || looksCharted(truth, chart) || traps.some((t) => Math.abs(t - truth) < truth * 0.25)) return null;
        const { options, correctIndex, correct } = estimateOptions(truth, band, random, { format: unitOption('$', ''), finestStep: 1, traps, trapReach: Infinity });
        const amountM = (joint * totalM) / 100;
        return {
          targetTimeMs: 90_000,
          prompt: `Roughly what is ${s.average} across groups B to D together?`,
          context,
          answer: { kind: 'choice', options, correctIndex },
          solution: [
            `Reading the bars: A ≈ ${bars[0]}%, A–D ≈ ${bars[3]}%`,
            `Groups B to D hold the step between them: ${bars[3]}% − ${bars[0]}% = ${joint}%`,
            `Their ${s.measure}: ${joint}% × ${totalText} = $${approx(amountM)}m`,
            `${capital(s.many)} in B to D: ${f(members[1]!)} + ${f(members[2]!)} + ${f(members[3]!)} = ${f(asked)}`,
            `Per ${s.one}: $${approx(amountM)}m ÷ ${f(asked)} = $${approx(truth)}`,
            `Closest option: ${correct}`,
          ],
          shortcut: `Subtract bar A from bar A–D; never read A–D as B to D. Then millions over thousands gives thousands: $${approx(amountM)}m ÷ ${approx(asked / 1000)}k is about ${approx(truth / 1000)} thousand dollars per ${s.one}.`,
        };
      }

      if (tier === 1) {
        // B to D: a step between two bars.
        const k = randomInt(random, 1, 3);
        const truth = average(k);
        // The bar read as the group's share, or the bar before it.
        const traps = [(bars[k]! * total) / 100 / members[k]!, (bars[k - 1]! * total) / 100 / members[k]!];
        if (looksCharted(truth, chart) || traps.some((t) => Math.abs(t - truth) < truth * 0.25)) return null;
        const format = unitOption('$', '');
        // The classic trap, the bar read as the share, is on offer whenever an option can sit above the answer.
        const { options, correctIndex, correct } = choiceOptions(truth, random, { format, finestStep: 1, traps, trapReach: Infinity });
        return {
          targetTimeMs: labelled ? 75_000 : 90_000,
          prompt: `Roughly what is ${s.average} in group ${GROUPS[k]}?`,
          context,
          answer: { kind: 'choice', options, correctIndex },
          solution: [
            reading(k),
            stepLine(k),
            groupAmount(k),
            `Per ${s.one}: $${approx((share(k) * totalM) / 100)}m ÷ ${f(members[k]!)} = $${approx(truth)}`,
            `Closest option: ${correct}`,
          ],
          shortcut: `Subtract the bar before, never read the bar alone. Then millions over thousands gives thousands: $${approx((share(k) * totalM) / 100)}m ÷ ${f(members[k]! / 1000)}k is ${approx(truth / 1000)} thousand dollars per ${s.one}.`,
        };
      }

      const j = randomInt(random, 1, 2);
      const k = randomInt(random, j + 1, 4);
      const truth = average(j) / average(k);
      const trap = (bars[j]! / members[j]!) / (bars[k]! / members[k]!);
      if (truth < 1.5 || looksCharted(truth, chart) || Math.abs(trap - truth) < truth * 0.25) return null;
      const { options, correctIndex, correct } = choiceOptions(truth, random, {
        format: unitOption('', '×'),
        finestStep: 0.01,
        traps: [trap],
        trapReach: Infinity,
      });
      return {
        targetTimeMs: 105_000,
        prompt: `On average, roughly how many times as much ${s.measure} does a ${s.one} in group ${GROUPS[j]} account for as a ${s.one} in group ${GROUPS[k]}?`,
        context,
        answer: { kind: 'choice', options, correctIndex },
        solution: [
          `Group ${GROUPS[j]}: ${bars[j]}% − ${bars[j - 1]}% = ${share(j)}% of ${s.measure}, ${f(members[j]!)} ${s.many}`,
          `Group ${GROUPS[k]}: ${bars[k]}% − ${bars[k - 1]}% = ${share(k)}% of ${s.measure}, ${f(members[k]!)} ${s.many}`,
          `Ratio: (${share(j)} ÷ ${f(members[j]!)}) ÷ (${share(k)} ÷ ${f(members[k]!)}) = ${approx(truth)}`,
          `Closest option: ${correct}`,
        ],
        shortcut: `The total cancels out, so compare shares per ${s.one}: (${share(j)} ÷ ${share(k)}) × (${f(members[k]! / 1000)}k ÷ ${f(members[j]! / 1000)}k) = ${approx(truth)} times.`,
      };
    });
  },
};

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
