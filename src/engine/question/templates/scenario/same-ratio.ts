import { formatFixed, formatNumber as f } from '../../format';
import { randomInt } from '../../random';
import type { ScenarioTemplate } from '../template';
import { choiceOptions } from './options';
import { approx, pick, randomStep, until } from './text';

interface Setting {
  intro: string;
  /** Row label header and row names. */
  label: string;
  names: string[];
  /** The part of interest and the rest, as column headers. */
  part: string;
  rest: string;
  /** The part in running text: "online sales". */
  partText: string;
  /** "sold the same share online": completes "If every region ... as". */
  same: string;
  unit: string;
}

const SETTINGS: Setting[] = [
  {
    intro: 'A home-furnishings retailer compares how much of each region’s sales are made online.',
    label: 'Region',
    names: ['North', 'Midlands', 'South', 'East', 'West'],
    part: 'Online sales',
    rest: 'In-store sales',
    partText: 'online sales',
    same: 'made the same share of its sales online',
    unit: '$ million',
  },
  {
    intro: 'A utility reviews how much of the electricity generated in each of its areas comes from renewables.',
    label: 'Area',
    names: ['Coastal', 'Valley', 'Upland', 'Metro', 'Plains'],
    part: 'Renewable generation',
    rest: 'Other generation',
    partText: 'renewable generation',
    same: 'generated the same share of its electricity from renewables',
    unit: 'gigawatt-hours',
  },
  {
    intro: 'A bank looks at how much of each division’s lending goes to small businesses.',
    label: 'Division',
    names: ['Retail', 'Corporate', 'Rural', 'Property', 'Specialist'],
    part: 'Small-business lending',
    rest: 'Other lending',
    partText: 'small-business lending',
    same: 'lent the same share to small businesses',
    unit: '$ million',
  },
];

/**
 * Apply one row's proportion to every row: if each row had row K's share,
 * the part would be K's share × the grand total. Tier 1 shows the part and the
 * total; tier 2 shows the part and the rest, so totals must be built; tier 3
 * asks how much bigger the part would be than today, taking K as the leader.
 * Traps: using K's part-to-rest ratio as if it were a share, averaging the
 * shares, and forgetting to subtract today's figure.
 */
export const sameRatio: ScenarioTemplate = {
  id: 'same-ratio',
  skill: 'ratios-comparisons',
  tiers: [1, 2, 3],
  build(tier, random) {
    const s = pick(random, SETTINGS);
    const count = tier === 1 ? 4 : 5;
    const names = s.names.slice(0, count);
    const rows = until(
      () =>
        names.map(() => {
          const total = randomStep(random, 20, 400, tier === 1 ? 10 : 1);
          const part = Math.max(1, Math.round((total * randomInt(random, 8, 50)) / 100));
          return { total, part, rest: total - part, share: part / total };
        }),
      (rs) => {
        const shares = rs.map((r) => r.share).sort((a, b) => b - a);
        // At tier 3 the answer is a whole count; at least 34, so options ten apart stay close neighbours.
        const gain = shares[0]! * rs.reduce((sum, r) => sum + r.total, 0) - rs.reduce((sum, r) => sum + r.part, 0);
        return shares[0]! > shares[1]! * 1.05 && (tier !== 3 || gain >= 34);
      },
    );
    const leader = rows.reduce((top, r, i) => (r.share > rows[top]!.share ? i : top), 0);
    const k = tier === 3 ? leader : randomInt(random, 0, count - 1);
    const key = rows[k]!;
    const grand = rows.reduce((sum, r) => sum + r.total, 0);
    const partNow = rows.reduce((sum, r) => sum + r.part, 0);
    const projected = key.share * grand;
    const truth = tier === 3 ? projected - partNow : projected;

    const averageShare = rows.reduce((sum, r) => sum + r.share, 0) / count;
    const { options, correctIndex, correct } = choiceOptions(truth, random, {
      format: (value, decimals) => formatFixed(value, decimals),
      finestStep: tier === 3 ? 1 : 0.1,
      traps:
        tier === 3
          ? [projected, (key.part / key.rest) * grand - partNow]
          : [(key.part / key.rest) * grand, averageShare * grand, tier === 2 ? key.share * rows.reduce((sum, r) => sum + r.rest, 0) : truth],
    });

    const headers = [s.label, s.part, tier === 1 ? `Total` : s.rest];
    const tableRows = rows.map((r, i) => [names[i]!, f(r.part), f(tier === 1 ? r.total : r.rest)]);
    const name = names[k]!;
    const prompt =
      tier === 3
        ? `${name} has the highest share of ${s.partText}. If every ${s.label.toLowerCase()} ${s.same} as ${name}, by how much would total ${s.partText} exceed today’s total (${s.unit})? Choose the closest.`
        : `If every ${s.label.toLowerCase()} ${s.same} as ${name}, which of the following is closest to total ${s.partText} across all ${s.label.toLowerCase()}s (${s.unit})?`;

    const solution = [
      tier === 1
        ? `${name}'s share: ${f(key.part)} ÷ ${f(key.total)} = ${approx(key.share * 100)}%`
        : `${name}'s share: ${f(key.part)} ÷ (${f(key.part)} + ${f(key.rest)}) = ${approx(key.share * 100)}%`,
      tier === 1
        ? `Grand total: ${rows.map((r) => f(r.total)).join(' + ')} = ${f(grand)}`
        : `Grand total: ${rows.map((r) => `${f(r.part)} + ${f(r.rest)}`).join(' + ')} = ${f(grand)}`,
      `At ${name}'s share: ${approx(key.share * 100)}% × ${f(grand)} = ${approx(projected)}`,
      ...(tier === 3 ? [`Today: ${rows.map((r) => f(r.part)).join(' + ')} = ${f(partNow)}, so the increase is ${approx(projected)} − ${f(partNow)} = ${approx(truth)}`] : []),
      `Closest option: ${correct}`,
    ];
    const shortcut = `Only two numbers matter: ${name}'s share (part ÷ its own total, not part ÷ rest) and the grand total. Multiply them once${tier === 3 ? ', then take off today’s total' : ''}.`;

    return {
      targetTimeMs: [60_000, 90_000, 120_000][tier - 1]!,
      prompt,
      context: [
        { type: 'paragraph', text: s.intro },
        { type: 'table', title: `${s.label} figures, last year (${s.unit})`, headers, rows: tableRows },
      ],
      answer: { kind: 'choice', options, correctIndex },
      solution,
      shortcut,
    };
  },
};
