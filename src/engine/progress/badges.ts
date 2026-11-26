import { hasBooklets } from '../question';
import { bookletStatus } from './booklets';
import { answeredCounts, bestSprintScore, sessionCounts } from './history';
import { streakStatus } from './streak';
import type { BadgeUnlock, Progress } from './types';

/** What a rule may look at besides history: the clock. */
export interface BadgeContext {
  now: Date;
}

export interface BadgeDefinition {
  id: string;
  /** The milestone's number, for the seal: "7", "100", "70%". */
  mark: string;
  name: string;
  /** What earns it, in a short line. */
  how: string;
  earned(progress: Progress, context: BadgeContext): boolean;
}

const STREAKS = [3, 7, 14, 30];
const ANSWERED = [100, 500, 1000];
const SPRINT_SCORES = [10, 20, 30];

const perfectSessions = (p: Progress) => sessionCounts(p).perfect;
const bestSprint = (p: Progress) => bestSprintScore(p);

/** Every badge, in the order the profile shows them. Rules read history, so each is a pure function of progress. */
export const BADGES: readonly BadgeDefinition[] = [
  ...STREAKS.map<BadgeDefinition>((days) => ({
    id: `streak-${days}`,
    mark: String(days),
    name: `${days}-day streak`,
    how: `Finish a session ${days} days running.`,
    earned: (p, { now }) => streakStatus(p, now).longest >= days,
  })),
  ...ANSWERED.map<BadgeDefinition>((count) => ({
    id: `answered-${count}`,
    mark: String(count),
    name: `${count.toLocaleString('en-US')} answered`,
    how: `Answer ${count.toLocaleString('en-US')} questions.`,
    earned: (p) => answeredCounts(p).answered >= count,
  })),
  {
    id: 'perfect-1',
    mark: '1/1',
    name: 'Clean sheet',
    how: 'Get every question right in a session of three or more.',
    earned: (p) => perfectSessions(p) >= 1,
  },
  {
    id: 'perfect-10',
    mark: '10',
    name: 'Ten clean sheets',
    how: 'Get every question right in 10 sessions of three or more.',
    earned: (p) => perfectSessions(p) >= 10,
  },
  ...SPRINT_SCORES.map<BadgeDefinition>((score) => ({
    id: `sprint-${score}`,
    mark: String(score),
    name: `Sprint of ${score}`,
    how: `Score ${score} in a 60-second sprint.`,
    earned: (p) => bestSprint(p) >= score,
  })),
  {
    id: 'mock-pass',
    mark: '70%',
    name: 'Mock passed',
    how: 'Score 70% or more in a mock.',
    // A mock's pass is judged once, against the pass mark, when it finishes (see mocks.ts).
    earned: (p) => p.mocks.some((m) => m.passed),
  },
  // The booklet badges only where there are booklets to finish (the booklet files are private, so a public checkout has none).
  ...(hasBooklets()
    ? [
        {
          id: 'booklet-1',
          mark: '1',
          name: 'Booklet done',
          how: 'Answer every question in a booklet correctly.',
          earned: (p: Progress) => bookletStatus(p).some((b) => b.finished),
        },
        {
          id: 'booklet-all',
          mark: 'All',
          name: 'Every booklet',
          how: 'Finish all the booklets.',
          earned: (p: Progress) => {
            const status = bookletStatus(p);
            return status.length > 0 && status.every((b) => b.finished);
          },
        },
      ]
    : []),
];

export function badgeById(id: string): BadgeDefinition | undefined {
  return BADGES.find((b) => b.id === id);
}

/**
 * Unlocks every badge whose rule now holds and that is not unlocked yet. A badge unlocks once:
 * what is already in `progress.badges` is never offered again, and never removed.
 */
export function unlockBadges(progress: Progress, context: BadgeContext): { progress: Progress; unlocked: BadgeDefinition[] } {
  const have = new Set(progress.badges.map((b) => b.id));
  const unlocked = BADGES.filter((b) => !have.has(b.id) && b.earned(progress, context));
  if (unlocked.length === 0) return { progress, unlocked };
  const added: BadgeUnlock[] = unlocked.map((b) => ({ id: b.id, unlockedAt: context.now.toISOString() }));
  return { progress: { ...progress, badges: [...progress.badges, ...added] }, unlocked };
}
