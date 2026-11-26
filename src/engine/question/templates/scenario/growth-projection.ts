import { formatFixed, formatNumber as f } from '../../format';
import { randomInt } from '../../random';
import type { ScenarioTemplate } from '../template';
import { choiceOptions } from './options';
import { approx, percent, pick, randomStep, until } from './text';

interface Setting {
  intro: string;
  title: string;
  segments: [string, string, string];
}

const SETTINGS: Setting[] = [
  {
    intro: 'An online marketplace is building a three-year plan for its product categories.',
    title: 'Sales by category ($ million)',
    segments: ['Home and garden', 'Toys', 'Beauty'],
  },
  {
    intro: 'A logistics company is projecting its business lines for an investor presentation.',
    title: 'Revenue by business line ($ million)',
    segments: ['Freight', 'Warehousing', 'Last-mile delivery'],
  },
  {
    intro: 'A media group is forecasting where its revenue will come from.',
    title: 'Revenue by format ($ million)',
    segments: ['Print', 'Podcasts', 'Events'],
  },
];

/**
 * Projection: each segment keeps growing by the same total factor over the
 * next stretch of years as over the last one, so future = now × (now ÷ then).
 * Tier 1 projects one segment; tier 2 adds up two or three segments, each at
 * its own rate; tier 3 turns projected revenue into profit with each segment's
 * margin. The trap is projecting the absolute change (a straight line) rather
 * than the growth rate, or growing the total at one blended rate.
 */
export const growthProjection: ScenarioTemplate = {
  id: 'growth-projection',
  skill: 'growth-trends',
  tiers: [1, 2, 3],
  build(tier, random) {
    const s = pick(random, SETTINGS);
    const span = randomInt(random, 2, 4);
    const now = randomInt(random, 2023, 2026);
    const then = now - span;
    const later = now + span;

    const rows = s.segments.map(() => {
      const past = randomStep(random, 40, 300, tier === 1 ? 10 : 1);
      const current = until(
        () => Math.round(past * (0.85 + random.next() * 0.9)),
        (c) => Math.abs(c / past - 1) >= 0.08,
      );
      const margin = randomStep(random, 4, 30, 1);
      return { past, current, margin };
    });
    const chosen = tier === 1 ? [randomInt(random, 0, 2)] : tier === 2 ? pick(random, [[0, 1], [1, 2], [0, 2], [0, 1, 2]]) : [0, 1, 2];

    const projected = (i: number) => (rows[i]!.current ** 2) / rows[i]!.past;
    const valueOf = (i: number) => projected(i) * (tier === 3 ? rows[i]!.margin / 100 : 1);
    const truth = chosen.reduce((sum, i) => sum + valueOf(i), 0);

    const straight = chosen.reduce((sum, i) => sum + (2 * rows[i]!.current - rows[i]!.past) * (tier === 3 ? rows[i]!.margin / 100 : 1), 0);
    const sumNow = chosen.reduce((sum, i) => sum + rows[i]!.current, 0);
    const sumPast = chosen.reduce((sum, i) => sum + rows[i]!.past, 0);
    const blended = (sumNow ** 2) / sumPast;

    const { options, correctIndex, correct } = choiceOptions(truth, random, {
      format: (value, decimals) => `$${formatFixed(value, decimals)}m`,
      finestStep: 0.1,
      traps: [straight, tier === 2 ? blended : truth * 1.25, tier === 3 ? chosen.reduce((sum, i) => sum + rows[i]!.current * (rows[i]!.margin / 100), 0) : straight],
    });

    const headers = ['', String(then), String(now), ...(tier === 3 ? [`Profit margin ${now}`] : [])];
    const tableRows = s.segments.map((name, i) => [
      name,
      f(rows[i]!.past),
      f(rows[i]!.current),
      ...(tier === 3 ? [percent(rows[i]!.margin)] : []),
    ]);
    const names = chosen.map((i) => s.segments[i]!);
    const subject =
      tier === 3 ? 'the total profit of all three' : names.length === 1 ? `${names[0]} revenue` : `the combined revenue of ${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

    const solution = chosen.map((i) => {
      const r = rows[i]!;
      const base = `${s.segments[i]}: ${f(r.current)} × (${f(r.current)} ÷ ${f(r.past)}) = ${approx(projected(i))}`;
      return tier === 3 ? `${base}, profit ${approx(projected(i))} × ${r.margin}% = ${approx(valueOf(i))}` : base;
    });
    if (chosen.length > 1) solution.push(`Total: ${chosen.map((i) => approx(valueOf(i))).join(' + ')} = ${approx(truth)}`);
    solution.push(`Closest option: ${correct}`);

    const first = rows[chosen[0]!]!;
    const shortcut = `Apply each segment's own growth factor once more: ${s.segments[chosen[0]!]} grew by ${approx((first.current / first.past - 1) * 100)}% from ${then} to ${now}, so grow ${f(first.current)} by the same ${approx((first.current / first.past - 1) * 100)}%. Adding the same absolute change again (a straight line) undershoots growth and overshoots decline.`;

    return {
      targetTimeMs: [60_000, 100_000, 130_000][tier - 1]!,
      prompt: `If each line keeps changing at the same rate from ${now} to ${later} as it did from ${then} to ${now}${tier === 3 ? ', and margins stay at their ' + now + ' levels' : ''}, which of the following is closest to ${subject}${tier === 3 ? ' lines' : ''} in ${later}?`,
      context: [
        { type: 'paragraph', text: s.intro },
        { type: 'table', title: s.title, headers, rows: tableRows },
      ],
      answer: { kind: 'choice', options, correctIndex },
      solution,
      shortcut,
    };
  },
};
