import { formatNumber as f } from '../../format';
import { randomInt } from '../../random';
import type { Random } from '../../random';
import type { ScenarioTemplate } from '../template';
import { choiceOptions } from './options';
import { approx, percent, pick, plainOption, randomStep } from './text';

interface Setting {
  intro: (n: string) => string;
  /** Row label for the first split, e.g. "Share of leavers". */
  shareLabel: string;
  /** Row label for the second split, e.g. "Of these, joined a rival". */
  followLabel: string;
  /** Category headers, five of them. */
  reasons: [string, string, string, string, string];
  /** What happened next, completing "How many of the surveyed customers ... ?" */
  follow: string;
  size: [number, number];
}

const SETTINGS: Setting[] = [
  {
    intro: (n) => `A mobile network surveyed ${n} customers who cancelled their contract in the past year, asking the main reason and where they went next.`,
    shareLabel: 'Share of cancellations',
    followLabel: 'Of these, moved to a rival network',
    reasons: ['Price', 'Coverage', 'Service', 'Moved abroad', 'Other'],
    follow: 'moved to a rival network',
    size: [3_000, 12_000],
  },
  {
    intro: (n) => `A retail bank asked ${n} customers who closed their current account why they left and whether they opened an account elsewhere.`,
    shareLabel: 'Share of closures',
    followLabel: 'Of these, opened an account with another bank',
    reasons: ['Fees', 'Mobile app', 'Branch closure', 'Life event', 'Other'],
    follow: 'opened an account with another bank',
    size: [3_000, 9_000],
  },
  {
    intro: (n) => `A streaming service polled ${n} subscribers who cancelled last quarter about their reason and whether they signed up to a competitor.`,
    shareLabel: 'Share of cancellations',
    followLabel: 'Of these, joined a competitor',
    reasons: ['Price rise', 'Catalogue', 'Ads', 'Sharing rules', 'Other'],
    follow: 'joined a competitor',
    size: [3_000, 20_000],
  },
];

/**
 * A share of a share of a survey: respondents × first split × second split.
 * Tier 1 asks about one reason, tier 2 about two, tier 3 about everyone, each
 * reason with its own follow-on share. The table runs sideways, five reasons wide.
 */
export const shareOfShare: ScenarioTemplate = {
  id: 'share-of-share',
  skill: 'percentages-in-context',
  tiers: [1, 2, 3],
  build(tier, random) {
    const s = pick(random, SETTINGS);
    const size = randomStep(random, s.size[0], s.size[1], tier === 1 ? 1_000 : 100);
    const shares = splitHundred(random);
    const follows = shares.map(() => randomStep(random, 20, 80, 5));
    const chosen = tier === 1 ? [randomInt(random, 0, 3)] : tier === 2 ? twoOf(random) : [0, 1, 2, 3, 4];

    const counts = chosen.map((i) => (size * shares[i]! * follows[i]!) / 10_000);
    const truth = counts.reduce((a, b) => a + b, 0);
    const shareSum = chosen.reduce((sum, i) => sum + shares[i]!, 0);

    const reasonText = chosen.map((i) => `“${s.reasons[i]}”`).join(' or ');
    const prompt =
      tier === 3
        ? `How many of the surveyed customers ${s.follow}? Choose the closest.`
        : `How many of the surveyed customers gave ${reasonText} as their main reason and ${s.follow}? Choose the closest.`;

    const { options, correctIndex, correct } = choiceOptions(truth, random, {
      format: plainOption,
      finestStep: 1,
      // Stopping after the first share, or adding the follow-on shares across reasons.
      traps: [
        (size * shareSum) / 100,
        tier === 2 ? (size * shareSum * chosen.reduce((sum, i) => sum + follows[i]!, 0)) / 2 / 10_000 : truth * 1.5,
      ],
    });

    const steps = chosen.map(
      (i, k) => `${s.reasons[i]}: ${f(size)} × ${shares[i]}% × ${follows[i]}% = ${approx(counts[k]!)}`,
    );
    const solution =
      chosen.length === 1
        ? [...steps, `Closest option: ${correct}`]
        : [...steps, `Total: ${counts.map(approx).join(' + ')} = ${approx(truth)}`, `Closest option: ${correct}`];

    const first = chosen[0]!;
    const shortcut =
      chosen.length === 1
        ? `Multiply the two shares first: ${shares[first]}% × ${follows[first]}% = ${f((shares[first]! * follows[first]!) / 100)}% of everyone surveyed, then take that share of ${f(size)}.`
        : `Work in percentages of the whole survey, add them, and multiply by ${f(size)} only once at the end: ${chosen.map((i) => `${f((shares[i]! * follows[i]!) / 100)}%`).join(' + ')} = ${f(chosen.reduce((sum, i) => sum + (shares[i]! * follows[i]!) / 100, 0))}%.`;

    return {
      targetTimeMs: [60_000, 90_000, 120_000][tier - 1]!,
      prompt,
      context: [
        { type: 'paragraph', text: s.intro(f(size)) },
        {
          type: 'table',
          title: 'Survey results',
          headers: ['', ...s.reasons],
          rows: [
            [s.shareLabel, ...shares.map(percent)],
            [s.followLabel, ...follows.map(percent)],
          ],
        },
      ],
      answer: { kind: 'choice', options, correctIndex },
      solution,
      shortcut,
    };
  },
};

/** Five shares in whole percent, each at least 5%, adding to 100%; the last is "Other". */
function splitHundred(random: Random): number[] {
  const shares = [0, 0, 0, 0].map(() => randomStep(random, 8, 22, 1));
  const total = shares.reduce((a, b) => a + b, 0);
  return [...shares, 100 - total];
}

function twoOf(random: Random): number[] {
  const a = randomInt(random, 0, 3);
  const b = (a + randomInt(random, 1, 3)) % 4;
  return [Math.min(a, b), Math.max(a, b)];
}
