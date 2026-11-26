import { createRandom, retryQuestion } from '../question';
import type { MissedQuestion, Question } from '../question';
import { sessionKindFor } from './lengths';
import { fits } from './siblings';
import type { Progress, Retry, SessionKind } from './types';

/** A retry answered correctly returns once more three days later, then clears. */
const FINAL_RETURN_DAYS = 3;

/** How many retries are waiting, and how many of them the next session of their kind would bring back. */
export interface RetryStatus {
  pending: number;
  due: number;
}

/**
 * Counts only retries that can still be built: one whose content is gone (a removed
 * question, a renamed template) stays stored, in case it returns, but is never shown
 * as pending, since nothing the owner does could clear it.
 */
export function retryStatus(progress: Progress, now: Date): RetryStatus {
  const live = progress.retries.filter((r) => questionFor(r) !== null);
  return { pending: live.length, due: live.filter((r) => isDue(r, now)).length };
}

function isDue(retry: Retry, now: Date): boolean {
  return Date.parse(retry.dueAt) <= now.getTime();
}

/** Retries due by `now` for a session of one kind, in any skill, the longest waiting first. */
export function dueRetries(progress: Progress, kind: SessionKind, now: Date): Retry[] {
  return progress.retries
    .filter((r) => isDue(r, now) && sessionKindFor(r.skill) === kind)
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
}

/**
 * The questions due retries come back as in the next session of a kind, whoever
 * picked it (the app, the owner, a booklet): the longest waiting first, at most
 * `room` of them. Retries whose content is gone are skipped, and so is a retry that
 * is a sibling of one already taken: it stays due and waits for a later session.
 */
export function retryQuestions(progress: Progress, kind: SessionKind, now: Date, room: number): Question[] {
  const taken: Question[] = [];
  for (const retry of dueRetries(progress, kind, now)) {
    if (taken.length >= room) break;
    const question = questionFor(retry);
    if (question && fits(question, taken)) taken.push(question);
  }
  return taken;
}

/** The question a retry comes back as next time; null if it can no longer be built (its content is gone). */
export function questionFor(retry: Retry): Question | null {
  try {
    return retryQuestion(retry, createRandom(retrySeed(retry)));
  } catch {
    return null;
  }
}

/**
 * What an answer does to the retries. A miss schedules the question for the next
 * session of its kind, or keeps its retry pending. A due retry answered correctly
 * returns once more about three days later, and is cleared when that is answered
 * correctly too. Any other correct answer leaves the retries alone.
 */
export function retriesAfterAnswer(retries: Retry[], question: MissedQuestion, correct: boolean, now: Date): Retry[] {
  const retry = retries.find((r) => r.questionId === question.id);
  if (!retry) {
    if (correct) return retries;
    return [...retries, comeBack({ id: question.id, skill: question.skill, tier: question.tier, source: question.source, returns: 0 }, 'next', now)];
  }
  const others = retries.filter((r) => r !== retry);
  if (!correct) return [...others, comeBack({ ...retry, returns: retry.returns + 1 }, 'next', now)];
  if (!isDue(retry, now)) return retries;
  if (retry.stage === 'final') return others;
  return [...others, comeBack({ ...retry, returns: retry.returns + 1 }, 'final', finalReturn(now))];
}

/** A retry set to come back at a stage from a time, with the question it will come back as. */
function comeBack(retry: Omit<Retry, 'stage' | 'dueAt' | 'questionId'>, stage: Retry['stage'], dueAt: Date): Retry {
  const scheduled = { ...retry, stage, dueAt: dueAt.toISOString(), questionId: retry.id };
  if (retry.source !== 'generated') return scheduled;
  return { ...scheduled, questionId: questionFor(scheduled)?.id ?? retry.id };
}

/** Three days after `now`, at the same local time of day (so a change of clocks in between does not move it). */
function finalReturn(now: Date): Date {
  const at = new Date(now);
  at.setDate(at.getDate() + FINAL_RETURN_DAYS);
  return at;
}

/**
 * The seed for a retry's next question: fixed by the missed question and how many
 * times it has come back, so the question is the same however often a session is planned.
 */
function retrySeed(retry: Pick<Retry, 'id' | 'returns'>): number {
  let hash = 0x811c9dc5;
  for (const char of `${retry.id}#${retry.returns}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
