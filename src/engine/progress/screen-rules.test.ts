import { describe, expect, it } from 'vitest';
import { createQuestion, createRandom, listBooklets, markAnswer } from '../question';
import type { DrillQuestion } from '../question';
import { answerSprint } from './sprints';
import { applyEvent, bookletStatus, drillTimeTrend, initialProgress, libraryTotals, mockMix, SPRINT_START, totals } from './index';
import type { AnswerRecord, Progress } from './index';
import { NO_BOOKLETS } from '../question/test-support/booklets';

const at = (day: number, hour = 12) => new Date(2026, 10, day, hour, 0);

function drill(skill: AnswerRecord['skill'], when: Date, timeMs: number, correct = true): AnswerRecord {
  return { sessionId: 's', questionId: `q${when.getTime()}${timeMs}`, skill, tier: 1, source: 'generated', correct, timeMs, metTarget: true, xp: 10, answeredAt: when.toISOString() };
}

describe('lifetime accuracy (shown on Home, Profile and Trends)', () => {
  it('has none before the first answer', () => {
    expect(totals(initialProgress()).accuracy).toBeNull();
  });

  it('is the share of answers correct, as a whole percent', () => {
    const answers = [drill('addition', at(1), 1), drill('addition', at(1), 2), drill('addition', at(1), 3, false)];
    expect(totals({ ...initialProgress(), answers }).accuracy).toBe(67);
  });
});

describe('how a mock is made up (shown before starting it)', () => {
  it('aims for half from the booklets, rounded down', () => {
    expect(mockMix(initialProgress(), 'short').half).toBe(5);
    expect(mockMix(initialProgress(), 'full').half).toBe(13);
  });
});

describe('a sprint answer', () => {
  const question = createQuestion('addition', 1, createRandom(4)) as DrillQuestion;
  const right = question.answer.value;

  it('counts a correct answer for the score and as attempted', () => {
    const { tally, mark } = answerSprint(SPRINT_START, question, right);
    expect(tally).toEqual({ score: 1, attempted: 1 });
    expect(mark).toEqual(markAnswer(question, { kind: 'numeric', value: right }));
  });

  it('counts a miss only as attempted', () => {
    const { tally, mark } = answerSprint({ score: 4, attempted: 6 }, question, right + 1);
    expect(tally).toEqual({ score: 4, attempted: 7 });
    expect(mark.correct).toBe(false);
  });
});

describe('time per drill against the week before (shown on Trends)', () => {
  it('is the change in seconds, to a tenth, and says when it is faster', () => {
    const p: Progress = {
      ...initialProgress(),
      answers: [drill('addition', at(5), 40_000), drill('addition', at(11), 30_000), drill('addition', at(12), 20_000), drill('addition', at(18), 10_000)],
    };
    expect(drillTimeTrend(p, at(18, 22))).toMatchObject({ changeMs: -20_000, faster: true });
  });

  it('rounds to a tenth of a second; no change is not faster', () => {
    const p: Progress = { ...initialProgress(), answers: [drill('addition', at(5), 10_020), drill('addition', at(12), 10_000)] };
    expect(drillTimeTrend(p, at(18))).toMatchObject({ changeMs: 0, faster: false });
  });

  it('has no change until both weeks have drills', () => {
    const p: Progress = { ...initialProgress(), answers: [drill('addition', at(18), 10_000)] };
    expect(drillTimeTrend(p, at(18))).toMatchObject({ changeMs: null, faster: false });
  });
});

describe('the library in total (shown on Home and Library)', () => {
  it('adds up every booklet, and gives each its share correct', () => {
    const status = bookletStatus(initialProgress());
    const all = listBooklets();
    expect(libraryTotals(status)).toEqual({
      correct: 0,
      total: all.reduce((sum, b) => sum + b.questions.length, 0),
      waiting: all.reduce((sum, b) => sum + b.waiting, 0),
    });
    expect(status.every((b) => b.percent === 0)).toBe(true);
  });

  it.skipIf(NO_BOOKLETS)('counts a booklet question answered correctly', () => {
    const question = listBooklets()[0]!.questions[0]!;
    if (question.answer.kind !== 'choice') throw new Error('choice expected');
    const progress = applyEvent(initialProgress(), { type: 'answer-recorded', sessionId: 's', question, correct: true, timeMs: 1 }, at(1)).progress;
    const status = bookletStatus(progress);
    expect(libraryTotals(status).correct).toBe(1);
    // The BCG booklet comes first and serves 7 questions: 1 of 7 is 14%.
    expect(status[0]).toMatchObject({ id: 'bcg', total: 7, percent: 14 });
  });
});
