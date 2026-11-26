import type { Happening } from './events';
import type { MockPlan } from './mocks';
import type { SessionPlan } from './types';

/** A mock being sat, as saved after every change so a reload or the phone closing the app loses nothing. */
export interface MockInProgress {
  kind: 'mock';
  plan: MockPlan;
  /** Wall-clock start (ms since the epoch): the mock's time keeps running while the app is away. */
  startedAt: number;
  /** The question showing. */
  index: number;
  /** The option chosen for each question; null while unanswered. */
  choices: Array<number | null>;
  flagged: boolean[];
  /** Time spent on each question so far, while the app was visible. */
  spentMs: number[];
}

/** A session being played. Its answers are already recorded; this is only what is needed to carry on. */
export interface SessionInProgress {
  kind: 'session';
  plan: SessionPlan;
  /** One per question answered, in order. */
  results: boolean[];
  levelUps: string[];
  badges: Array<Extract<Happening, { kind: 'badge-unlocked' }>>;
  /** Wall-clock time of the last change (ms since the epoch). */
  savedAt: number;
}

export type RunInProgress = MockInProgress | SessionInProgress;

/** A session left longer than this is not picked up again: it ends, its answers kept. */
export const SESSION_RESUME_MS = 60 * 60_000;

export type Resume =
  | { action: 'resume-mock'; run: MockInProgress }
  /** The time ran out while the app was away: submit with the answers saved. */
  | { action: 'submit-mock'; run: MockInProgress; timeMs: number }
  /** Carry on from the first question not yet answered. */
  | { action: 'resume-session'; run: SessionInProgress; index: number }
  /** Every question was answered: finish it as of its last answer (`at`), so the day it was played counts. */
  | { action: 'finish-session'; run: SessionInProgress; at: Date }
  /** Part-answered and left too long ago: end it without recording a finished session, its answers kept. */
  | { action: 'end-session' };

/** What to do with a run found in progress when the app opens. */
export function resumeRun(run: RunInProgress, now: Date): Resume {
  const at = now.getTime();
  if (run.kind === 'mock') {
    const { timeLimitMs } = run.plan;
    if (at >= run.startedAt + timeLimitMs) return { action: 'submit-mock', run, timeMs: timeLimitMs };
    return { action: 'resume-mock', run };
  }
  if (run.results.length >= run.plan.questions.length) return { action: 'finish-session', run, at: new Date(run.savedAt) };
  if (at - run.savedAt > SESSION_RESUME_MS) return { action: 'end-session' };
  return { action: 'resume-session', run, index: run.results.length };
}
