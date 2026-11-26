import { listAuthoredQuestions } from '../question';
import type { Question } from '../question';
import { localDay, recordDay } from './days';
import type { Progress } from './types';

/** What the sibling rule reads of a question: its identity and the booklet question it is modelled on, if it says. */
export type Kin = Pick<Question, 'id' | 'modelledOn'>;

/**
 * Siblings: two authored questions modelled on the same booklet question, or an
 * authored question and the booklet question it is modelled on. Questions that do
 * not say what they are modelled on have no siblings, and neither do generated ones.
 */
export function areSiblings(a: Kin, b: Kin): boolean {
  return (
    (a.modelledOn !== undefined && (a.modelledOn === b.modelledOn || a.modelledOn === b.id)) ||
    (b.modelledOn !== undefined && b.modelledOn === a.id)
  );
}

/** Not already among `picked`, and no sibling of any of them: whether a question may join a sitting. */
export function fits(question: Kin, picked: readonly Kin[]): boolean {
  return picked.every((p) => p.id !== question.id && !areSiblings(question, p));
}

/** No sibling of any of `others` (the same question is no sibling of itself). */
export function noSiblingOf(question: Kin, others: readonly Kin[]): boolean {
  return others.every((o) => !areSiblings(question, o));
}

/** The items `prefer` keeps, when it keeps any; otherwise all of them. */
export function preferring<T>(items: readonly T[], prefer: (item: T) => boolean): readonly T[] {
  const kept = items.filter(prefer);
  return kept.length > 0 ? kept : items;
}

const AUTHORED_BY_ID: ReadonlyMap<string, Question> = new Map(listAuthoredQuestions().map((q) => [q.id, q]));

/**
 * The booklet and authored questions answered on the local day of `now`, wherever
 * (session, spot check or mock): the ones a new sitting steers clear of the siblings
 * of, while it has other questions to choose from. Read from the answers kept in full,
 * so it needs nothing stored beyond them.
 */
export function answeredToday(progress: Progress, now: Date): Kin[] {
  const today = localDay(now);
  const kin = new Map<string, Kin>();
  for (const a of progress.answers) {
    if (a.source === 'generated' || recordDay(a, a.answeredAt) !== today) continue;
    kin.set(a.questionId, AUTHORED_BY_ID.get(a.questionId) ?? { id: a.questionId });
  }
  return [...kin.values()];
}
