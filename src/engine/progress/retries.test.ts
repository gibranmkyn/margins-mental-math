import { describe, expect, it } from 'vitest';
import { createQuestion, createRandom, listAuthoredQuestions, listBooklets } from '../question';
import type { Question } from '../question';
import { applyEvent, chooseBookletSession, chooseNextSession, initialProgress, retryStatus } from './index';
import type { Progress, SessionChoice, SessionPlan } from './index';
import { fixedQuestions, NO_BOOKLETS } from '../question/test-support/booklets';

/** Local-time dates, so tests do not depend on the machine's time zone. */
const at = (day: number, hour = 12, minute = 0) => new Date(2026, 10, day, hour, minute);

const templateOf = (id: string) => id.replace(/-t\d-\d+$/, '');

function answer(progress: Progress, question: Question, correct: boolean, when: Date, sessionId = `s-${when.getTime()}`): Progress {
  return applyEvent(progress, { type: 'answer-recorded', sessionId, question, correct, timeMs: 5000 }, when).progress;
}

let seed = 0;
function plan(progress: Progress, when: Date, choice?: SessionChoice): SessionPlan {
  return chooseNextSession(progress, when, createRandom(++seed), choice);
}

/** The questions in a plan that are retries. */
function retriesIn(session: SessionPlan): Question[] {
  return session.questions.filter((q) => session.retries?.includes(q.id));
}

/** Answer a plan's retry questions, right or wrong, as one session at `when`. */
function answerRetries(progress: Progress, session: SessionPlan, correct: boolean, when: Date): Progress {
  for (const question of retriesIn(session)) progress = answer(progress, question, correct, when, session.id);
  return progress;
}

const missedDrill = createQuestion('multiplication', 2, createRandom(11));
/** A missed question that returns as itself: a booklet question, or an authored one without the booklets. */
const missedFixed = fixedQuestions('percentages-in-context')[0]!;

describe('retries', () => {
  it('schedule a missed drill for the next drill session, as a fresh drill of the same kind', () => {
    const progress = answer(initialProgress(), missedDrill, false, at(10, 9));
    const next = plan(progress, at(10, 9, 5));
    expect(next.kind).toBe('drill');
    const [retry, ...others] = retriesIn(next);
    expect(others).toHaveLength(0);
    expect(retry).toMatchObject({ skill: 'multiplication', tier: 2, source: 'generated' });
    expect(templateOf(retry!.id)).toBe(templateOf(missedDrill.id));
    expect(retry!.id).not.toBe(missedDrill.id);
  });

  it.skipIf(NO_BOOKLETS)('bring a missed booklet question back as the same question in the next scenario session', () => {
    const progress = answer(initialProgress(), missedFixed, false, at(10, 9));
    const next = plan(progress, at(10, 9, 5), { skill: 'percentages-in-context' });
    expect(retriesIn(next)).toEqual([missedFixed]);
  });

  it('return once more about three days after a correct retry, then clear', () => {
    let progress = answer(initialProgress(), missedDrill, false, at(10, 9));
    expect(retryStatus(progress, at(10, 9, 5))).toEqual({ pending: 1, due: 1 });

    const first = plan(progress, at(10, 18));
    progress = answerRetries(progress, first, true, at(10, 18));
    // Answered correctly: still pending, but not due again until three days later, at the same time of day.
    expect(retryStatus(progress, at(10, 18, 5))).toEqual({ pending: 1, due: 0 });
    for (const when of [at(11, 9), at(12, 23, 59), at(13, 17, 59)]) expect(retriesIn(plan(progress, when))).toHaveLength(0);

    const final = plan(progress, at(13, 18));
    const [again] = retriesIn(final);
    expect(again).toMatchObject({ skill: 'multiplication', tier: 2 });
    expect(templateOf(again!.id)).toBe(templateOf(missedDrill.id));
    expect(again!.id).not.toBe(retriesIn(first)[0]!.id);

    progress = answerRetries(progress, final, true, at(13, 18));
    expect(retryStatus(progress, at(13, 19))).toEqual({ pending: 0, due: 0 });
    expect(retriesIn(plan(progress, at(20)))).toHaveLength(0);
  });

  it('come back no sooner than three days after a correct retry, even one answered just before midnight', () => {
    let progress = answer(initialProgress(), missedDrill, false, at(10, 9));
    progress = answerRetries(progress, plan(progress, at(10, 23, 59)), true, at(10, 23, 59));
    // Two days and a minute later is too soon for "about three days".
    expect(retryStatus(progress, at(13, 0, 0))).toEqual({ pending: 1, due: 0 });
    expect(retryStatus(progress, at(13, 23, 59))).toEqual({ pending: 1, due: 1 });
  });

  it('stay pending while answered wrongly, coming back in each next session', () => {
    let progress = answer(initialProgress(), missedFixed, false, at(10, 9));
    for (const day of [10, 11, 12]) {
      const session = plan(progress, at(day, 20), { skill: 'percentages-in-context' });
      expect(retriesIn(session)).toEqual([missedFixed]);
      progress = answerRetries(progress, session, false, at(day, 20));
      expect(retryStatus(progress, at(day, 20, 1))).toEqual({ pending: 1, due: 1 });
    }
  });

  it('start over when the final return is answered wrongly', () => {
    let progress = answer(initialProgress(), missedFixed, false, at(10, 9));
    const choice = { skill: 'percentages-in-context' } as const;
    progress = answerRetries(progress, plan(progress, at(10, 20), choice), true, at(10, 20));
    progress = answerRetries(progress, plan(progress, at(13, 21), choice), false, at(13, 21));
    // Back to the next session, then the three-day return once more.
    expect(retriesIn(plan(progress, at(13, 22), choice))).toEqual([missedFixed]);
    progress = answerRetries(progress, plan(progress, at(13, 22), choice), true, at(13, 22));
    expect(retryStatus(progress, at(16, 21))).toEqual({ pending: 1, due: 0 });
    progress = answerRetries(progress, plan(progress, at(16, 22, 30), choice), true, at(16, 22, 30));
    expect(retryStatus(progress, at(16, 23)).pending).toBe(0);
  });

  it('come back in sessions of their own kind only', () => {
    const progress = answer(initialProgress(), missedFixed, false, at(10, 9));
    expect(retriesIn(plan(progress, at(10, 10), { skill: 'addition' }))).toHaveLength(0);
    const drills = answer(initialProgress(), missedDrill, false, at(10, 9));
    expect(retriesIn(plan(drills, at(10, 10), { skill: 'percentages-in-context' }))).toHaveLength(0);
  });

  it('join the next session of their kind, whoever picked it: the app, or the owner choosing another skill', () => {
    const progress = answer(initialProgress(), missedDrill, false, at(10, 9));
    // The owner misses a multiplication drill, then picks addition: the retry comes back there.
    const owner = plan(progress, at(10, 10), { skill: 'addition' });
    expect(owner.skill).toBe('addition');
    expect(retriesIn(owner)).toHaveLength(1);
    expect(retriesIn(owner)[0]).toMatchObject({ skill: 'multiplication', tier: 2 });
    expect(retriesIn(plan(progress, at(10, 10), { skill: 'multiplication' }))).toHaveLength(1);
    const picked = plan(progress, at(10, 10));
    expect(picked.skill).not.toBe('multiplication');
    expect(retriesIn(picked)).toHaveLength(1);
  });

  it.skipIf(NO_BOOKLETS)('join a booklet session too, after the booklet\'s own questions, which keep at least the first place', () => {
    const missedAuthored = listAuthoredQuestions().find((q) => q.skill === 'growth-trends')!;
    const progress = answer(initialProgress(), missedAuthored, false, at(10, 9));
    const session = chooseBookletSession(progress, 'pst1', at(10, 10), createRandom(1));
    expect(session.questions).toHaveLength(3);
    expect(session.questions[0]!.booklet?.booklet).toBe('pst1');
    expect(session.questions.slice(0, 2).every((q) => q.booklet?.booklet === 'pst1')).toBe(true);
    expect(session.retries).toEqual([missedAuthored.id]);
    expect(session.questions[2]!.id).toBe(missedAuthored.id);
  });

  it.skipIf(NO_BOOKLETS)('in a booklet session, a missed question of that booklet keeps its place in booklet order, once, marked as the retry', () => {
    const first = listBooklets().find((b) => b.id === 'pst1')!.questions[0]!;
    const progress = answer(initialProgress(), first, false, at(10, 9));
    const session = chooseBookletSession(progress, 'pst1', at(10, 10), createRandom(1));
    expect(session.questions).toHaveLength(3);
    expect(session.questions[0]!.id).toBe(first.id);
    expect(session.questions.filter((q) => q.id === first.id)).toHaveLength(1);
    expect(session.retries).toEqual([first.id]);
  });

  it.skipIf(NO_BOOKLETS)('leave drill retries out of a booklet session', () => {
    const progress = answer(initialProgress(), missedDrill, false, at(10, 9));
    expect(chooseBookletSession(progress, 'pst1', at(10, 10), createRandom(1)).retries).toBeUndefined();
  });

  it('never make a session longer, and leave the session its own skill', () => {
    let progress = initialProgress();
    for (let i = 0; i < 8; i++) progress = answer(progress, createQuestion('division', 1, createRandom(100 + i)), false, at(10, 9, i));
    const drills = plan(progress, at(10, 10));
    expect(drills.questions).toHaveLength(5);
    expect(retriesIn(drills)).toHaveLength(4);
    expect(drills.questions[0]!.skill).toBe(drills.skill);
    expect(new Set(drills.questions.map((q) => q.prompt)).size).toBe(5);

    const booklet = fixedQuestions('percentages-in-context').slice(0, 4);
    let scenarios = initialProgress();
    for (const q of booklet) scenarios = answer(scenarios, q, false, at(10, 9));
    const session = plan(scenarios, at(10, 10), { skill: 'percentages-in-context' });
    expect(session.questions).toHaveLength(3);
    expect(retriesIn(session)).toHaveLength(2);
    expect(new Set(session.questions.map((q) => q.id)).size).toBe(3);
  });

  it('take the longest-waiting retries first', () => {
    const missed = fixedQuestions('percentages-in-context').slice(0, 4).reverse();
    let progress = initialProgress();
    missed.forEach((q, i) => (progress = answer(progress, q, false, at(10, 9, i))));
    const session = plan(progress, at(10, 10), { skill: 'percentages-in-context' });
    expect(retriesIn(session).map((q) => q.id)).toEqual([missed[0]!.id, missed[1]!.id]);
  });

  it('are never created by sprint misses', () => {
    const progress = applyEvent(initialProgress(), { type: 'sprint-finished', skill: 'addition', score: 3, attempted: 9 }, at(10, 9)).progress;
    expect(retryStatus(progress, at(10, 10))).toEqual({ pending: 0, due: 0 });
  });

  it('leave correct answers outside retries alone', () => {
    const progress = answer(initialProgress(), missedDrill, true, at(10, 9));
    expect(retryStatus(progress, at(10, 10)).pending).toBe(0);
  });

  it('can be built again from the plan: the same retry comes back as the same question until answered', () => {
    const progress = answer(initialProgress(), missedDrill, false, at(10, 9));
    expect(retriesIn(plan(progress, at(10, 10)))[0]!.id).toBe(retriesIn(plan(progress, at(10, 11)))[0]!.id);
  });
});

describe('a retry whose question can no longer be built', () => {
  const gone = { id: 'pst9-q99', skill: 'percentages-in-context', tier: 2, source: 'booklet', questionId: 'pst9-q99', stage: 'next', dueAt: at(9).toISOString(), returns: 0 } as const;
  const renamed = { id: 'retired-template-t1-5', skill: 'growth-trends', tier: 1, source: 'generated', questionId: 'retired-template-t1-5', stage: 'next', dueAt: at(9).toISOString(), returns: 0 } as const;

  it('is not counted as pending, so Home never shows a retry nothing can clear', () => {
    const progress: Progress = { ...answer(initialProgress(), missedDrill, false, at(10, 9)), retries: [] };
    const withGone: Progress = { ...answer(initialProgress(), missedDrill, false, at(10, 9)) };
    withGone.retries = [...withGone.retries, gone, renamed];
    expect(retryStatus(progress, at(10, 10))).toEqual({ pending: 0, due: 0 });
    expect(retryStatus(withGone, at(10, 10))).toEqual({ pending: 1, due: 1 });
  });

  it('is skipped by session planning without taking a place', () => {
    const progress: Progress = { ...initialProgress(), retries: [gone] };
    const session = plan(progress, at(10, 10), { skill: 'percentages-in-context' });
    expect(session.questions).toHaveLength(3);
    expect(session.retries).toBeUndefined();
  });
});
