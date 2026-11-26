import { answeredCounts, sessionCounts } from './history';
import type { Progress } from './types';

export interface Totals {
  answered: number;
  correct: number;
  /** Correct answers as a whole percent of those answered; null before the first. */
  accuracy: number | null;
  sessionsFinished: number;
}

/** Lifetime counts, including answers from sessions left part-way. */
export function totals(progress: Progress): Totals {
  const { answered, correct } = answeredCounts(progress);
  return {
    answered,
    correct,
    accuracy: answered === 0 ? null : Math.round((correct / answered) * 100),
    sessionsFinished: sessionCounts(progress).finished,
  };
}
