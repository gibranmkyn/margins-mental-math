import { dayNumber, dayNumberOf, recordDay } from './days';
import { streakDayNumbers } from './history';
import type { Progress } from './types';

export const DEFAULT_DAILY_GOAL = 100;

export interface StreakStatus {
  /** Consecutive days with a finished session or mock. Still alive on a day when none is finished yet. */
  current: number;
  longest: number;
  /** A session or a mock has been finished today. */
  securedToday: boolean;
  dailyGoal: number;
  /** XP earned today, from every answer given and every sprint finished today. */
  xpToday: number;
  goalMet: boolean;
}

/**
 * Streak and daily goal as of `now`. Days are local calendar days; a session or mock counts
 * on the day it finished and an answer on the day it was given, as recorded then.
 */
export function streakStatus(progress: Progress, now: Date): StreakStatus {
  const today = dayNumber(now);
  const days = streakDayNumbers(progress);

  let longest = 0;
  let run = 0;
  let previous: number | null = null;
  for (const day of days) {
    run = previous !== null && day === previous + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }
  const securedToday = previous === today;
  const alive = previous !== null && previous >= today - 1;
  const current = alive ? run : 0;

  const xpToday =
    progress.answers.filter((a) => dayNumberOf(recordDay(a, a.answeredAt)) === today).reduce((sum, a) => sum + a.xp, 0) +
    progress.sprints.filter((s) => dayNumberOf(recordDay(s, s.finishedAt)) === today).reduce((sum, s) => sum + (s.xp ?? 0), 0);

  return {
    current,
    longest,
    securedToday,
    dailyGoal: progress.dailyGoal,
    xpToday,
    goalMet: xpToday >= progress.dailyGoal,
  };
}
