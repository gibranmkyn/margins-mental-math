import { createQuestion, markAnswer, pressKey, readEntry } from '../question';
import type { DrillQuestion, DrillSkill, Key, Mark, Random } from '../question';
import { bestSprintScore } from './history';
import { drawNew } from './lengths';
import type { Progress } from './types';

/** A sprint lasts 60 seconds. */
export const SPRINT_MS = 60_000;

/** Sprints are always tier 1, so a personal best stays comparable from one sprint to the next. */
export const SPRINT_TIER = 1;

/** The owner's highest sprint score in a skill, or null while there is none above zero. */
export function personalBest(progress: Progress, skill: DrillSkill): number | null {
  const best = bestSprintScore(progress, skill);
  return best > 0 ? best : null;
}

/** The next drill of a sprint: never the same prompt as the one before it, while the tier has another. */
export function nextSprintQuestion(skill: DrillSkill, random: Random, previousPrompt: string | null = null): DrillQuestion {
  return drawNew(() => createQuestion(skill, SPRINT_TIER, random), (q) => q.prompt === previousPrompt);
}

/** A sprint's running count: correct answers (the score) and answers given. */
export interface SprintTally {
  score: number;
  attempted: number;
}

export const SPRINT_START: SprintTally = { score: 0, attempted: 0 };

/** A sprint's drill answered and counted: the new tally and its mark (with the right answer to show). */
export interface SprintAnswered {
  kind: 'answered';
  tally: SprintTally;
  mark: Mark;
}

/** Count one answered drill: every answer is attempted, a correct one also scores. */
function count(tally: SprintTally, mark: Mark): SprintAnswered {
  return { kind: 'answered', tally: { score: tally.score + (mark.correct ? 1 : 0), attempted: tally.attempted + 1 }, mark };
}

/** Mark one sprint answer and count it. */
export function answerSprint(tally: SprintTally, question: DrillQuestion, value: number): SprintAnswered {
  return count(tally, markAnswer(question, { kind: 'numeric', value }));
}

/** Where a sprint's drill stands after a key press: still being typed, or answered and counted. */
export type SprintStep = { kind: 'typing'; entry: string } | SprintAnswered;

/**
 * Type one key into a sprint's entry. A right answer is taken the moment the
 * entry reads as a number the question marks correct (by the same reading and
 * marking as Submit); anything else stays on the board to keep typing.
 */
export function typeIntoSprint(tally: SprintTally, question: DrillQuestion, entry: string, key: Key): SprintStep {
  const next = pressKey(entry, key);
  const typed = readEntry(next);
  if (typed) {
    const answered = answerSprint(tally, question, typed.value);
    if (answered.mark.correct) return answered;
  }
  return { kind: 'typing', entry: next };
}

/** Skip a sprint's drill, whatever is typed: attempted and missed, with the right answer to show. */
export function skipSprint(tally: SprintTally, question: DrillQuestion): SprintAnswered {
  return count(tally, { correct: false, expected: question.answer.value });
}
