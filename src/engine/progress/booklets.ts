import { listBooklets, listBookletQuestions, randomSeed } from '../question';
import type { Question, Random, Skill, Tier } from '../question';
import { bookletQuestionsLatestFirst, correctQuestionIds } from './history';
import { SCENARIOS_PER_SESSION } from './lengths';
import { retryQuestions } from './retries';
import { fits } from './siblings';
import type { Progress, SessionPlan } from './types';

/** One booklet in the library: how many of the questions it serves have been answered correctly. */
export interface BookletStatus {
  id: string;
  name: string;
  correct: number;
  total: number;
  /** Questions that wait for their chart exhibits to be redrawn, not yet in the total. */
  waiting: number;
  /** Every question it serves has been answered correctly at least once. */
  finished: boolean;
  /** Correct as a whole percent of the total. */
  percent: number;
}

/** The whole library: questions answered correctly, served, and waiting for their charts. */
export interface LibraryTotals {
  correct: number;
  total: number;
  waiting: number;
}

export function libraryTotals(booklets: readonly BookletStatus[]): LibraryTotals {
  return booklets.reduce((sum, b) => ({ correct: sum.correct + b.correct, total: sum.total + b.total, waiting: sum.waiting + b.waiting }), { correct: 0, total: 0, waiting: 0 });
}

/** Ids of the questions answered correctly at least once, anywhere. */
function answeredCorrectly(progress: Progress): Set<string> {
  return correctQuestionIds(progress);
}

/** The library: every booklet, in library order, with questions answered correctly out of the total. */
export function bookletStatus(progress: Progress): BookletStatus[] {
  const right = answeredCorrectly(progress);
  return listBooklets().map(({ id, name, questions, waiting }) => {
    const correct = questions.filter((q) => right.has(q.id)).length;
    const total = questions.length;
    return { id, name, correct, total, waiting, finished: total > 0 && correct === total, percent: total === 0 ? 0 : Math.round((correct / total) * 100) };
  });
}

/**
 * The booklet to pick up from: the one last answered in while it has questions not
 * yet answered correctly; once that one is finished, the unfinished booklet answered
 * in most recently (a half-done booklet before a fresh one); otherwise the first
 * unfinished booklet in the library. None once every booklet is finished.
 */
export function continueBooklet(progress: Progress): string | undefined {
  const status = bookletStatus(progress);
  const unfinished = new Set(status.filter((b) => !b.finished).map((b) => b.id));
  const bookletOf = new Map(listBookletQuestions().map((q) => [q.id, q.booklet!.booklet]));
  const worked = bookletQuestionsLatestFirst(progress).map((id) => bookletOf.get(id)!);
  const last = worked.find((b) => unfinished.has(b));
  if (last !== undefined) return last;
  return (status.find((b) => !b.finished && b.correct > 0) ?? status.find((b) => !b.finished))?.id;
}

/**
 * The booklet for another session straight after one in `bookletId`: the same one
 * while it has questions not yet answered correctly, else the booklet to continue,
 * and the same one again from the top only when every booklet is finished.
 */
export function bookletAfter(progress: Progress, bookletId: string): string {
  if (bookletStatus(progress).some((b) => b.id === bookletId && !b.finished)) return bookletId;
  return continueBooklet(progress) ?? bookletId;
}

/**
 * The next session in one booklet: up to three questions in booklet order, starting
 * from the first not yet answered correctly and skipping any already answered
 * correctly. Fewer than three when fewer are left; once the booklet is finished it
 * starts again from the top.
 *
 * Like any scenario session it brings back due scenario retries, after the
 * booklet's own questions and without making it longer; the booklet keeps at least
 * the first place. A due retry that is one of the booklet's next questions keeps its
 * place in booklet order, marked as the retry. A due retry that is a sibling of one
 * of the booklet's own questions in the session waits, still due, for a later session.
 */
export function chooseBookletSession(progress: Progress, bookletId: string, now: Date, random: Random): SessionPlan {
  const booklet = listBooklets().find((b) => b.id === bookletId);
  if (!booklet || booklet.questions.length === 0) throw new Error(`No booklet ${bookletId}`);
  const right = answeredCorrectly(progress);
  const open = booklet.questions.filter((q) => !right.has(q.id));
  const retries = retryQuestions(progress, 'scenario', now, SCENARIOS_PER_SESSION - 1);
  const pool = open.length > 0 ? open : booklet.questions;
  // The booklet's next questions in order, and the retries that are not among them after; fewer of
  // the booklet's own while that runs over three, down to the first place.
  let own = pool.slice(0, SCENARIOS_PER_SESSION);
  // A retry that is a sibling of one of the booklet's own questions waits for a later session.
  const others = () => retries.filter((r) => fits(r, own));
  while (own.length > 1 && own.length + others().length > SCENARIOS_PER_SESSION) own = own.slice(0, -1);
  const questions = [...own, ...others()];
  const retryIds = new Set(retries.map((q) => q.id));
  const returning = questions.filter((q) => retryIds.has(q.id)).map((q) => q.id);
  const first = questions[0]!;
  return {
    id: `s-${now.getTime().toString(36)}-${randomSeed(random).toString(36)}`,
    kind: 'scenario',
    skill: first.skill,
    tier: first.tier,
    questions,
    booklet: booklet.id,
    ...(returning.length > 0 && { retries: returning }),
  };
}

/** Booklet questions in a skill and tier not yet answered correctly: the ones a scenario session may draw on. */
export function openBookletQuestions(progress: Progress, skill: Skill, tier: Tier): Question[] {
  const right = answeredCorrectly(progress);
  return listBookletQuestions().filter((q) => q.skill === skill && q.tier === tier && !right.has(q.id));
}
