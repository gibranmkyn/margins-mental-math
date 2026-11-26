import { describe, expect, it } from 'vitest';
import { createRandom, listBookletQuestions } from '../question';
import type { Question } from '../question';
import { applyEvent, chooseMock, chooseNextSession, initialProgress, MOCK_LENGTHS, MOCK_PASS_PERCENT, mockMix, mockTimedOut, retryStatus, totals } from './index';
import type { Happening, MockPlan, Progress } from './index';
import { NO_BOOKLETS } from '../question/test-support/booklets';

const MORNING = new Date('2026-11-25T08:00:00Z');

/** Answer questions right or wrong in one earlier session. */
function answered(progress: Progress, questions: readonly Question[], correct: boolean): Progress {
  for (const question of questions) {
    progress = applyEvent(progress, { type: 'answer-recorded', sessionId: 'earlier', question, correct, timeMs: 60_000 }, MORNING).progress;
  }
  return progress;
}

const ids = (questions: readonly Question[]) => questions.map((q) => q.id);
const fromBooklets = (questions: Question[]) => questions.filter((q) => q.source === 'booklet');

describe('choosing a mock', () => {
  it('comes in two lengths: 10 questions in 20 minutes and 26 in 55', () => {
    const short = chooseMock(initialProgress(), 'short', MORNING, createRandom(1));
    expect(short.questions).toHaveLength(10);
    expect(short.timeLimitMs).toBe(20 * 60_000);

    const full = chooseMock(initialProgress(), 'full', MORNING, createRandom(1));
    expect(full.questions).toHaveLength(26);
    expect(full.timeLimitMs).toBe(55 * 60_000);

    expect(MOCK_LENGTHS.short).toEqual({ questions: 10, minutes: 20 });
    expect(MOCK_LENGTHS.full).toEqual({ questions: 26, minutes: 55 });
  });

  it('is made only of multiple-choice scenario and chart questions, none repeated', () => {
    for (let seed = 0; seed < 30; seed++) {
      const mock = chooseMock(initialProgress(), 'full', MORNING, createRandom(seed));
      for (const q of mock.questions) expect(q.answer.kind).toBe('choice');
      expect(new Set(mock.questions.map((q) => q.id)).size).toBe(26);
    }
  });

  it.skipIf(NO_BOOKLETS)('is about half booklet questions, the rest generated or authored', () => {
    for (let seed = 0; seed < 30; seed++) {
      const short = chooseMock(initialProgress(), 'short', MORNING, createRandom(seed));
      expect(fromBooklets(short.questions)).toHaveLength(5);
      const full = chooseMock(initialProgress(), 'full', MORNING, createRandom(seed));
      expect(fromBooklets(full.questions)).toHaveLength(13);
      for (const q of full.questions.filter((x) => x.source !== 'booklet')) expect(['generated', 'authored']).toContain(q.source);
    }
  });

  it.runIf(NO_BOOKLETS)('is all generated or authored when there are no booklets', () => {
    expect(mockMix(initialProgress(), 'short')).toEqual({ booklet: 0, other: 10, half: 5 });
    for (let seed = 0; seed < 10; seed++) {
      const full = chooseMock(initialProgress(), 'full', MORNING, createRandom(seed));
      expect(full.questions).toHaveLength(26);
      for (const q of full.questions) expect(['generated', 'authored']).toContain(q.source);
    }
  });

  it.skipIf(NO_BOOKLETS)('draws only booklet questions not yet answered correctly; a miss leaves a question open', () => {
    const all = listBookletQuestions();
    const right = all.slice(0, all.length - 8);
    const missed = all.slice(all.length - 8, all.length - 5);
    const progress = answered(answered(initialProgress(), right, true), missed, false);
    const open = new Set(all.slice(all.length - 8).map((q) => q.id));
    for (let seed = 0; seed < 20; seed++) {
      const mock = chooseMock(progress, 'short', MORNING, createRandom(seed));
      const booklet = fromBooklets(mock.questions);
      expect(booklet).toHaveLength(5);
      for (const q of booklet) expect(open.has(q.id)).toBe(true);
    }
  });

  it.skipIf(NO_BOOKLETS)('fills with generated and authored questions when the open booklet questions run short', () => {
    const all = listBookletQuestions();
    const progress = answered(initialProgress(), all.slice(3), true);
    expect(mockMix(progress, 'full')).toEqual({ booklet: 3, other: 23, half: 13 });
    const mock = chooseMock(progress, 'full', MORNING, createRandom(4));
    expect(mock.questions).toHaveLength(26);
    expect(ids(fromBooklets(mock.questions)).sort()).toEqual(ids(all.slice(0, 3)).sort());

    const finished = answered(initialProgress(), all, true);
    expect(mockMix(finished, 'short')).toEqual({ booklet: 0, other: 10, half: 5 });
    const none = chooseMock(finished, 'short', MORNING, createRandom(4));
    expect(none.questions).toHaveLength(10);
    expect(fromBooklets(none.questions)).toHaveLength(0);
  });

  it.skipIf(NO_BOOKLETS)('spreads generated and authored questions across scenario and chart skills, and mixes the booklet ones in', () => {
    const mock = chooseMock(initialProgress(), 'full', MORNING, createRandom(9));
    const other = mock.questions.filter((q) => q.source !== 'booklet');
    expect(new Set(other.map((q) => q.skill)).size).toBe(other.length);
    expect(other.some((q) => q.context.some((b) => b.type === 'chart'))).toBe(true);
    const sources = mock.questions.map((q) => (q.source === 'booklet' ? 'b' : 'o')).join('');
    expect(sources).not.toMatch(/^b{13}|b{13}$/);
  });

  it('is reproduced exactly by the same random seed', () => {
    const a = chooseMock(initialProgress(), 'full', MORNING, createRandom(21));
    const b = chooseMock(initialProgress(), 'full', MORNING, createRandom(21));
    expect(ids(a.questions)).toEqual(ids(b.questions));
    expect(a.id).toBe(b.id);
  });
});

const AFTER = new Date('2026-11-25T08:19:00Z');

function correctIndex(question: Question): number {
  if (question.answer.kind !== 'choice') throw new Error('Choice expected');
  return question.answer.correctIndex;
}

function wrongIndex(question: Question): number {
  if (question.answer.kind !== 'choice') throw new Error('Choice expected');
  return (question.answer.correctIndex + 1) % question.answer.options.length;
}

/** Sit a mock: 'r' right, 'w' wrong, '-' left unanswered, one letter per question. */
function sit(progress: Progress, mock: MockPlan, pattern: string, timeMs = 15 * 60_000) {
  const choices = mock.questions.map((q, i) => (pattern[i] === 'r' ? correctIndex(q) : pattern[i] === 'w' ? wrongIndex(q) : null));
  return applyEvent(progress, { type: 'mock-finished', mock, choices, timesMs: mock.questions.map(() => 50_000), timeMs }, AFTER);
}

function finished(happened: Happening[]) {
  const found = happened.find((h) => h.kind === 'mock-finished');
  if (!found || found.kind !== 'mock-finished') throw new Error('No mock-finished');
  return found.mock;
}

const shortMock = () => chooseMock(initialProgress(), 'short', MORNING, createRandom(3));
const fullMock = () => chooseMock(initialProgress(), 'full', MORNING, createRandom(3));

describe('scoring a mock', () => {
  it('passes at 70%', () => {
    expect(MOCK_PASS_PERCENT).toBe(70);
  });

  it('scores one mark per correct answer; 7 of 10 passes, 6 of 10 does not', () => {
    const pass = finished(sit(initialProgress(), shortMock(), 'rrrrrrrww-').happened);
    expect(pass).toMatchObject({ length: 'short', questionCount: 10, correctCount: 7, answeredCount: 9, percent: 70, passed: true });

    const fail = finished(sit(initialProgress(), shortMock(), 'rrrrrrwww-').happened);
    expect(fail).toMatchObject({ correctCount: 6, percent: 60, passed: false });
  });

  it('needs 19 of 26 to pass a full mock: 18 of 26 is 69%', () => {
    const pass = finished(sit(initialProgress(), fullMock(), 'r'.repeat(19) + 'w'.repeat(7)).happened);
    expect(pass).toMatchObject({ questionCount: 26, correctCount: 19, percent: 73, passed: true });
    const fail = finished(sit(initialProgress(), fullMock(), 'r'.repeat(18) + '-'.repeat(8)).happened);
    expect(fail).toMatchObject({ correctCount: 18, answeredCount: 18, percent: 69, passed: false });
  });

  it('scores an unanswered mock as zero and a clean one as 100%', () => {
    expect(finished(sit(initialProgress(), shortMock(), '----------').happened)).toMatchObject({ correctCount: 0, answeredCount: 0, percent: 0, passed: false });
    expect(finished(sit(initialProgress(), shortMock(), 'rrrrrrrrrr').happened)).toMatchObject({ correctCount: 10, percent: 100, passed: true });
  });

  it("keeps every question with the owner's answer, the correct answer and whether it was right", () => {
    const mock = shortMock();
    const result = finished(sit(initialProgress(), mock, 'rw--------').happened);
    expect(result.questions).toHaveLength(10);
    expect(result.questions[0]).toEqual({
      questionId: mock.questions[0]!.id,
      skill: mock.questions[0]!.skill,
      tier: mock.questions[0]!.tier,
      source: mock.questions[0]!.source,
      chosen: correctIndex(mock.questions[0]!),
      correctIndex: correctIndex(mock.questions[0]!),
      correct: true,
    });
    expect(result.questions[1]).toMatchObject({ chosen: wrongIndex(mock.questions[1]!), correct: false });
    expect(result.questions[2]).toMatchObject({ chosen: null, correctIndex: correctIndex(mock.questions[2]!), correct: false });
  });

  it('lists missed and unanswered questions, with what a retry needs to bring each back', () => {
    const mock = shortMock();
    const { happened } = sit(initialProgress(), mock, 'rrrrrrrw-r');
    const misses = happened.find((h) => h.kind === 'mock-finished' && h.mock.id === mock.id);
    if (!misses || misses.kind !== 'mock-finished') throw new Error('No mock-finished');
    expect(misses.missed.map((m) => m.questionId)).toEqual([mock.questions[7]!.id, mock.questions[8]!.id]);
    for (const [i, m] of misses.missed.entries()) {
      const q = mock.questions[7 + i]!;
      expect(m).toMatchObject({ questionId: q.id, skill: q.skill, tier: q.tier, source: q.source, correct: false });
    }
  });
});

describe('mock history', () => {
  it('keeps every finished mock in progress, with when it finished and the time used', () => {
    let progress = initialProgress();
    progress = sit(progress, shortMock(), 'rrrrrrrww-', 12 * 60_000).progress;
    progress = sit(progress, fullMock(), 'r'.repeat(20) + '------').progress;
    expect(progress.mocks).toHaveLength(2);
    expect(progress.mocks[0]).toMatchObject({ length: 'short', correctCount: 7, passed: true, timeMs: 12 * 60_000, finishedAt: AFTER.toISOString() });
    expect(progress.mocks[1]).toMatchObject({ length: 'full', correctCount: 20, passed: true });
  });

  it('never records more time than the mock allowed', () => {
    const mock = shortMock();
    expect(sit(initialProgress(), mock, 'r---------', 21 * 60_000).progress.mocks[0]!.timeMs).toBe(20 * 60_000);
  });

  it('says when the time ran out, so the result can tell the owner it was submitted at zero', () => {
    expect(mockTimedOut(sit(initialProgress(), shortMock(), 'r---------', 20 * 60_000).progress.mocks[0]!)).toBe(true);
    expect(mockTimedOut(sit(initialProgress(), shortMock(), 'r---------', 12 * 60_000).progress.mocks[0]!)).toBe(false);
  });

  it('records each answered question as an answer, so a booklet question answered correctly in a mock leaves the open pool', () => {
    const mock = shortMock();
    const { progress } = sit(initialProgress(), mock, 'rrrrrwwww-');
    expect(totals(progress)).toMatchObject({ answered: 9, correct: 5, sessionsFinished: 0 });
    const right = new Set(mock.questions.slice(0, 5).map((q) => q.id));
    const later = chooseMock(progress, 'full', AFTER, createRandom(1));
    for (const q of fromBooklets(later.questions)) expect(right.has(q.id)).toBe(false);
  });

  it('earns XP for correct answers only, and promotes when it crosses a level', () => {
    const none = sit(initialProgress(), shortMock(), 'wwwww-----');
    expect(none.progress.xp).toBe(0);
    expect(finished(none.happened).xp).toBe(0);

    const clean = sit(initialProgress(), fullMock(), 'r'.repeat(26));
    expect(clean.progress.xp).toBeGreaterThan(0);
    expect(finished(clean.happened).xp).toBe(clean.progress.xp);
    expect(clean.happened.some((h) => h.kind === 'level-up')).toBe(true);
  });

  it('ignores a mock finished twice', () => {
    const mock = shortMock();
    const once = sit(initialProgress(), mock, 'rrrrrrrww-').progress;
    const twice = sit(once, mock, 'rrrrrrrrrr');
    expect(twice.progress).toBe(once);
    expect(twice.happened).toEqual([]);
  });
});

describe('the mock badge', () => {
  const badgeWins = (happened: Happening[]) => happened.flatMap((h) => (h.kind === 'badge-unlocked' ? [h.id] : []));

  it('unlocks Mock passed on the first mock at 70% or more, and only once', () => {
    const failed = sit(initialProgress(), shortMock(), 'rrrrrrwww-');
    expect(badgeWins(failed.happened)).not.toContain('mock-pass');

    const passed = sit(failed.progress, fullMock(), 'r'.repeat(19) + '-'.repeat(7));
    expect(badgeWins(passed.happened)).toContain('mock-pass');
    expect(passed.progress.badges.filter((b) => b.id === 'mock-pass')).toHaveLength(1);

    const again = sit(passed.progress, chooseMock(passed.progress, 'short', AFTER, createRandom(8)), 'rrrrrrrrrr');
    expect(badgeWins(again.happened)).not.toContain('mock-pass');
  });

  it('is not earned at 18 of 26, just under the pass mark', () => {
    expect(badgeWins(sit(initialProgress(), fullMock(), 'r'.repeat(18) + 'w'.repeat(8)).happened)).not.toContain('mock-pass');
  });
});

describe('mock misses as retries', () => {
  it('schedules every wrong and every unanswered question as a retry; right answers are not', () => {
    const mock = shortMock();
    const { progress } = sit(initialProgress(), mock, 'rrrrrrrw--');
    expect(retryStatus(progress, AFTER)).toEqual({ pending: 3, due: 3 });
    expect(progress.retries.map((r) => r.id).sort()).toEqual(ids(mock.questions.slice(7)).sort());
  });

  it.skipIf(NO_BOOKLETS)('brings a missed booklet question back as the same question in the next session of its skill', () => {
    const mock = shortMock();
    const booklet = mock.questions.findIndex((q) => q.source === 'booklet');
    const missed = mock.questions[booklet]!;
    const pattern = mock.questions.map((_, i) => (i === booklet ? '-' : 'r')).join('');
    const { progress } = sit(initialProgress(), mock, pattern);
    const next = chooseNextSession(progress, new Date(AFTER.getTime() + 60_000), createRandom(5), { skill: missed.skill });
    expect(next.retries).toEqual([missed.id]);
    expect(next.questions.map((q) => q.id)).toContain(missed.id);
  });
});
