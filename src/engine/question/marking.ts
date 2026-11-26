import type { Mark, Question, Submission } from './types';

/** Mark a submitted answer against a question. */
export function markAnswer(question: Question, submission: Submission): Mark {
  const { answer } = question;
  if (answer.kind === 'choice') {
    return { correct: submission.kind === 'choice' && submission.index === answer.correctIndex, expected: answer.correctIndex };
  }
  if (submission.kind !== 'numeric') return { correct: false, expected: answer.value };
  switch (answer.marking.mode) {
    case 'exact':
      return { correct: isSameNumber(submission.value, answer.value), expected: answer.value };
    case 'tolerance':
      return { correct: isWithin(submission.value, answer.value, answer.marking.percent), expected: answer.value };
  }
}

/**
 * Floating-point representation error at the scale of the numbers compared.
 * Scaled by machine epsilon, not a fixed fraction, so a near miss on a
 * billion-sized answer (one unit off) is still a miss.
 */
function representationError(...values: number[]): number {
  return 8 * Number.EPSILON * Math.max(1, ...values.map(Math.abs));
}

/** Equal up to floating-point representation error, so 0.1 + 0.2 still equals 0.3. */
function isSameNumber(a: number, b: number): boolean {
  return Math.abs(a - b) <= representationError(a, b);
}

/** Within `percent` of the true value, boundary included (up to representation error). */
function isWithin(typed: number, truth: number, percent: number): boolean {
  const allowed = (Math.abs(truth) * percent) / 100;
  return Math.abs(typed - truth) <= allowed + representationError(typed, truth);
}
