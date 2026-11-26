import { describe, expect, it } from 'vitest';
import { createRandom, listBookletQuestions, listBooklets, markAnswer } from '../question';
import type { Question } from '../question';
import { applyEvent, bookletAfter, bookletStatus, chooseBookletSession, chooseNextSession, continueBooklet, initialProgress } from './index';
import type { Progress } from './index';
import { NO_BOOKLETS } from '../question/test-support/booklets';

const EVENING = new Date('2026-11-24T19:30:00Z');

function bookletQuestion(id: string): Question {
  const q = listBookletQuestions().find((x) => x.id === id);
  if (!q) throw new Error(`No booklet question ${id}`);
  return q;
}

/** Answer booklet questions by id, right or wrong, in one session. */
function answer(progress: Progress, answers: Array<[string, boolean]>, sessionId = 'before'): Progress {
  for (const [id, right] of answers) {
    const question = bookletQuestion(id);
    if (question.answer.kind !== 'choice') throw new Error('Choice expected');
    const { correctIndex, options } = question.answer;
    const mark = markAnswer(question, { kind: 'choice', index: right ? correctIndex : (correctIndex + 1) % options.length });
    progress = applyEvent(progress, { type: 'answer-recorded', sessionId, question, correct: mark.correct, timeMs: 70_000 }, EVENING).progress;
  }
  return progress;
}

const ids = (questions: Question[]) => questions.map((q) => q.id);

/** A booklet's questions in booklet order, as the question engine serves them (counts are not pinned here). */
function bookletIds(id: string): string[] {
  const booklet = listBooklets().find((b) => b.id === id);
  if (!booklet) throw new Error(`No booklet ${id}`);
  return ids(booklet.questions);
}

describe.skipIf(NO_BOOKLETS)('the booklet library', () => {
  it('lists all 8 booklets with none answered correctly at first', () => {
    const status = bookletStatus(initialProgress());
    expect(status).toHaveLength(8);
    expect(status.find((b) => b.name === 'McKinsey PST 1')).toMatchObject({ id: 'pst1', correct: 0, total: bookletIds('pst1').length, finished: false });
    for (const b of status) expect(b).toMatchObject({ correct: 0, total: bookletIds(b.id).length, waiting: 0 });
  });

  it('counts each booklet question answered correctly once, however often, and ignores misses', () => {
    let progress = answer(initialProgress(), [
      ['pst1-q05', true],
      ['pst1-q06', false],
      ['pst1-q05', true],
      ['pracC-q02', true],
    ]);
    progress = answer(progress, [['pst1-q06', false]], 'later');
    const status = bookletStatus(progress);
    expect(status.find((b) => b.id === 'pst1')).toMatchObject({ correct: 1, total: bookletIds('pst1').length });
    expect(status.find((b) => b.id === 'pracC')).toMatchObject({ correct: 1, total: bookletIds('pracC').length });
    expect(status.find((b) => b.id === 'pst2')).toMatchObject({ correct: 0 });
  });

  it('counts a booklet as finished once every question it serves has been answered correctly', () => {
    const sample = bookletIds('sample');
    const [last, ...others] = [...sample].reverse();
    let progress = answer(initialProgress(), others.map((id): [string, boolean] => [id, true]));
    expect(bookletStatus(progress).find((b) => b.id === 'sample')).toMatchObject({ correct: sample.length - 1, finished: false });
    progress = answer(progress, [[last!, true]]);
    expect(bookletStatus(progress).find((b) => b.id === 'sample')).toMatchObject({ correct: sample.length, total: sample.length, finished: true });
  });
});

describe.skipIf(NO_BOOKLETS)('the booklet to continue', () => {
  it('is the first booklet in the library at first', () => {
    expect(continueBooklet(initialProgress())).toBe('bcg');
  });

  it('is the booklet last answered in, while it has questions not yet answered correctly', () => {
    const progress = answer(initialProgress(), [
      ['pst1-q05', true],
      ['pracC-q02', false],
    ]);
    expect(continueBooklet(progress)).toBe('pracC');
  });

  it('moves to the first unfinished booklet once the last one is finished, and is none when all are', () => {
    let progress = answer(initialProgress(), [['bcg-q01', true], ...bookletIds('sample').map((id): [string, boolean] => [id, true])]);
    expect(continueBooklet(progress)).toBe('bcg');
    const everything = listBookletQuestions().map((q): [string, boolean] => [q.id, true]);
    progress = answer(initialProgress(), everything);
    expect(continueBooklet(progress)).toBeUndefined();
  });

  it('goes back to a half-done booklet, not a fresh one, once the booklet just worked on is finished (QA L23)', () => {
    const pst2 = bookletIds('pst2');
    let progress = answer(initialProgress(), pst2.slice(0, 3).map((id): [string, boolean] => [id, true]));
    progress = answer(progress, bookletIds('sample').map((id): [string, boolean] => [id, true]));
    expect(continueBooklet(progress)).toBe('pst2');
  });
});

describe.skipIf(NO_BOOKLETS)('another session after a booklet session', () => {
  it('carries on in the same booklet while it has questions left', () => {
    const progress = answer(initialProgress(), [['pst1-q05', true]]);
    expect(bookletAfter(progress, 'pst1')).toBe('pst1');
  });

  it('moves on to the booklet to continue once that one is finished, rather than replaying it', () => {
    const pst2 = bookletIds('pst2');
    let progress = answer(initialProgress(), [[pst2[0]!, true]]);
    progress = answer(progress, bookletIds('sample').map((id): [string, boolean] => [id, true]));
    expect(bookletAfter(progress, 'sample')).toBe('pst2');
  });

  it('replays the booklet from the top only when every booklet is finished', () => {
    const progress = answer(initialProgress(), listBookletQuestions().map((q): [string, boolean] => [q.id, true]));
    expect(bookletAfter(progress, 'sample')).toBe('sample');
  });
});

describe('booklet sessions', () => {
  // Collected even when its tests are skipped, so it must not throw without the booklets.
  const pst1 = NO_BOOKLETS ? [] : bookletIds('pst1');
  const right = (list: string[]) => list.map((id): [string, boolean] => [id, true]);

  it.skipIf(NO_BOOKLETS)('start a fresh booklet with its first three questions in booklet order', () => {
    const plan = chooseBookletSession(initialProgress(), 'pst1', EVENING, createRandom(1));
    expect(ids(plan.questions)).toEqual(pst1.slice(0, 3));
    expect(plan.questions[0]!.id).toBe('pst1-q03');
    expect(plan).toMatchObject({ kind: 'scenario', booklet: 'pst1' });
  });

  it.skipIf(NO_BOOKLETS)('continue from the first question not yet answered correctly, skipping those already right', () => {
    const [a, b, c, d, e] = pst1;
    const progress = answer(initialProgress(), [
      [a!, true],
      [b!, false],
      [c!, true],
    ]);
    const plan = chooseBookletSession(progress, 'pst1', EVENING, createRandom(2));
    expect(ids(plan.questions)).toEqual([b, d, e]);
  });

  it.skipIf(NO_BOOKLETS)('serve fewer than three when fewer are left, and start over once the booklet is finished', () => {
    let progress = answer(initialProgress(), right(pst1.slice(0, -2)));
    expect(ids(chooseBookletSession(progress, 'pst1', EVENING, createRandom(3)).questions)).toEqual(pst1.slice(-2));
    progress = answer(progress, right(pst1.slice(-2)));
    expect(ids(chooseBookletSession(progress, 'pst1', EVENING, createRandom(4)).questions)).toEqual(pst1.slice(0, 3));
  });

  it.skipIf(NO_BOOKLETS)('are recorded as scenario sessions when finished, and move the library on', () => {
    let progress = initialProgress();
    const plan = chooseBookletSession(progress, 'pracB', EVENING, createRandom(5));
    progress = answer(
      progress,
      plan.questions.map((q) => [q.id, true]),
      plan.id,
    );
    const finished = applyEvent(progress, { type: 'session-finished', sessionId: plan.id }, EVENING);
    expect(finished.happened).toContainEqual(expect.objectContaining({ kind: 'session-finished', score: 3, total: 3 }));
    expect(finished.progress.sessions.at(-1)).toMatchObject({ kind: 'scenario' });
    expect(bookletStatus(finished.progress).find((b) => b.id === 'pracB')).toMatchObject({ correct: 3 });
  });

  it('refuse a booklet that does not exist', () => {
    expect(() => chooseBookletSession(initialProgress(), 'nope', EVENING, createRandom(6))).toThrow();
  });
});

describe.skipIf(NO_BOOKLETS)('booklet questions in scenario sessions', () => {
  // Six testing-statements questions at tier 3 come from the booklets.
  const skill = 'testing-statements';
  const tier = 3;
  const pool = listBookletQuestions().filter((q) => q.skill === skill && q.tier === tier);

  it('appear in some scenario sessions of their skill and tier, at most one per session, labelled with their booklet', () => {
    expect(pool.length).toBeGreaterThan(2);
    let sessionsWithBooklet = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const plan = chooseNextSession(initialProgress(), EVENING, createRandom(seed), { skill, tier });
      expect(plan.questions).toHaveLength(3);
      expect(new Set(ids(plan.questions)).size).toBe(3);
      const booklet = plan.questions.filter((q) => q.source === 'booklet');
      expect(booklet.length).toBeLessThanOrEqual(1);
      for (const q of booklet) {
        expect(q).toMatchObject({ skill, tier });
        expect(q.booklet?.name.length).toBeGreaterThan(0);
      }
      if (booklet.length > 0) sessionsWithBooklet++;
    }
    expect(sessionsWithBooklet).toBeGreaterThan(10);
    expect(sessionsWithBooklet).toBeLessThan(50);
  });

  it('are only those not yet answered correctly, so a solved booklet question is not served again as new', () => {
    const [solved, ...rest] = pool;
    const progress = answer(initialProgress(), [[solved!.id, true]]);
    const seen = new Set<string>();
    for (let seed = 1; seed <= 80; seed++) {
      const plan = chooseNextSession(progress, EVENING, createRandom(seed), { skill, tier });
      for (const q of plan.questions) if (q.source === 'booklet') seen.add(q.id);
    }
    expect(seen.has(solved!.id)).toBe(false);
    expect(seen.size).toBeGreaterThan(0);
    for (const id of seen) expect(ids(rest)).toContain(id);

    const allSolved = answer(initialProgress(), pool.map((q) => [q.id, true]));
    for (let seed = 1; seed <= 30; seed++) {
      const plan = chooseNextSession(allSolved, EVENING, createRandom(seed), { skill, tier });
      expect(plan.questions.filter((q) => q.source === 'booklet')).toEqual([]);
    }
  });
});
