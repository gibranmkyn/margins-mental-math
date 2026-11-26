import { describe, expect, it } from 'vitest';
import { createRandom } from '../question';
import { applyEvent, BADGES, chooseMock, chooseNextSession, DEFAULT_DAILY_GOAL, initialProgress, streakStatus } from './index';
import type { Progress } from './index';

/** Local-time date, so tests do not depend on the machine's time zone. */
const at = (day: number, hour = 12, minute = 0) => new Date(2026, 10, day, hour, minute);

let counter = 0;
/** Answer every drill of one session correctly in 1s each and finish it at `when`. */
function finishSession(progress: Progress, when: Date, startedAt: Date = when): Progress {
  const plan = chooseNextSession(progress, startedAt, createRandom(++counter));
  let p = progress;
  for (const question of plan.questions) {
    p = applyEvent(p, { type: 'answer-recorded', sessionId: plan.id, question, correct: true, timeMs: 1000 }, startedAt).progress;
  }
  return applyEvent(p, { type: 'session-finished', sessionId: plan.id }, when).progress;
}

describe('streak', () => {
  it('is zero before any session is finished', () => {
    const s = streakStatus(initialProgress(), at(10));
    expect(s).toMatchObject({ current: 0, longest: 0, securedToday: false });
  });

  it('starts at one when a session is finished today', () => {
    const p = finishSession(initialProgress(), at(10));
    expect(streakStatus(p, at(10, 20))).toMatchObject({ current: 1, longest: 1, securedToday: true });
  });

  it('extends on each consecutive day and counts one day once however many sessions', () => {
    let p = finishSession(initialProgress(), at(10));
    p = finishSession(p, at(10, 15));
    p = finishSession(p, at(11));
    p = finishSession(p, at(12));
    expect(streakStatus(p, at(12, 18))).toMatchObject({ current: 3, longest: 3, securedToday: true });
  });

  it('survives today until today is over: yesterday counted, today not yet secured', () => {
    let p = finishSession(initialProgress(), at(10));
    p = finishSession(p, at(11));
    expect(streakStatus(p, at(12, 9))).toMatchObject({ current: 2, securedToday: false });
  });

  it('breaks after a missed day but keeps the longest streak', () => {
    let p = finishSession(initialProgress(), at(10));
    p = finishSession(p, at(11));
    p = finishSession(p, at(12));
    expect(streakStatus(p, at(14))).toMatchObject({ current: 0, longest: 3, securedToday: false });
    p = finishSession(p, at(14));
    expect(streakStatus(p, at(14, 20))).toMatchObject({ current: 1, longest: 3 });
  });

  it('counts a session by the day it finished, either side of midnight', () => {
    // Started at 23:58 on the 10th, finished at 00:03 on the 11th.
    let p = finishSession(initialProgress(), at(11, 0, 3), at(10, 23, 58));
    expect(streakStatus(p, at(11, 1))).toMatchObject({ current: 1, securedToday: true });
    expect(streakStatus(p, at(10, 23, 59))).toMatchObject({ securedToday: false });
    // 23:59 on the 10th and 00:01 on the 11th are consecutive days.
    p = finishSession(initialProgress(), at(10, 23, 59));
    p = finishSession(p, at(11, 0, 1));
    expect(streakStatus(p, at(11, 0, 2))).toMatchObject({ current: 2, longest: 2 });
  });

  it('is not extended by answers in a session that was left unfinished', () => {
    const plan = chooseNextSession(initialProgress(), at(10), createRandom(99));
    const p = applyEvent(initialProgress(), { type: 'answer-recorded', sessionId: plan.id, question: plan.questions[0]!, correct: true, timeMs: 1000 }, at(10)).progress;
    expect(streakStatus(p, at(10, 13))).toMatchObject({ current: 0, securedToday: false });
  });
});

/** Finish a mock (all unanswered, or at zero) at `when`; the questions were seen from `startedAt`. */
function finishMock(progress: Progress, when: Date, startedAt: Date = when): Progress {
  const mock = chooseMock(progress, 'short', startedAt, createRandom(++counter));
  const choices = mock.questions.map(() => null);
  return applyEvent(progress, { type: 'mock-finished', mock, choices, timesMs: mock.questions.map(() => 0), timeMs: mock.timeLimitMs }, when).progress;
}

function finishSprint(progress: Progress, when: Date): Progress {
  return applyEvent(progress, { type: 'sprint-finished', skill: 'addition', score: 12, attempted: 14 }, when).progress;
}

describe('streak and mocks', () => {
  it('counts a day with only a finished mock, and secures today', () => {
    const p = finishMock(initialProgress(), at(10));
    expect(streakStatus(p, at(10, 20))).toMatchObject({ current: 1, longest: 1, securedToday: true });
  });

  it('chains mock-only days with session days into one streak', () => {
    let p = finishSession(initialProgress(), at(10));
    p = finishMock(p, at(11));
    p = finishSession(p, at(12));
    p = finishMock(p, at(13));
    expect(streakStatus(p, at(13, 20))).toMatchObject({ current: 4, longest: 4, securedToday: true });
    expect(streakStatus(p, at(14, 8))).toMatchObject({ current: 4, securedToday: false });
    expect(streakStatus(p, at(15, 8))).toMatchObject({ current: 0, longest: 4 });
  });

  it('counts a mock on the day it finished, even when started before midnight', () => {
    const p = finishMock(initialProgress(), at(11, 0, 3), at(10, 23, 58));
    expect(streakStatus(p, at(10, 23, 59))).toMatchObject({ securedToday: false });
    expect(streakStatus(p, at(11, 1))).toMatchObject({ current: 1, securedToday: true });
    const q = finishSession(finishMock(initialProgress(), at(10, 23, 59)), at(11, 0, 1));
    expect(streakStatus(q, at(11, 0, 2))).toMatchObject({ current: 2, longest: 2 });
  });

  it('keeps a mock on the day recorded when the time zone later changes', () => {
    const p = finishMock(initialProgress(), at(10, 23, 30));
    expect(p.mocks[0]!.day).toBe('2026-11-10');
    const { day: _day, ...legacy } = p.mocks[0]!;
    // A record from before the day was kept falls back to its timestamp.
    const old = { ...p, mocks: [legacy] };
    expect(streakStatus(old, at(10, 23, 45))).toMatchObject({ current: 1, securedToday: true });
  });

  it('does not count a day with only a sprint', () => {
    const p = finishSprint(initialProgress(), at(10));
    expect(streakStatus(p, at(10, 20))).toMatchObject({ current: 0, longest: 0, securedToday: false });
    const q = finishSprint(finishSession(initialProgress(), at(10)), at(11));
    expect(streakStatus(q, at(11, 20))).toMatchObject({ current: 1, securedToday: false });
  });

  it('feeds the streak badges', () => {
    let p = initialProgress();
    for (const d of [10, 11, 12]) p = finishMock(p, at(d));
    const badge = BADGES.find((b) => b.id === 'streak-3')!;
    expect(badge.earned(p, { now: at(12, 20) })).toBe(true);
    expect(badge.earned(finishMock(finishMock(initialProgress(), at(10)), at(11)), { now: at(11, 20) })).toBe(false);
  });
});

describe('daily goal', () => {
  it('defaults to 100 XP', () => {
    expect(DEFAULT_DAILY_GOAL).toBe(100);
    expect(streakStatus(initialProgress(), at(10)).dailyGoal).toBe(100);
  });

  it('shows progress from XP earned today only, capped display left to the screen', () => {
    let p = finishSession(initialProgress(), at(10));
    const earned = p.xp;
    expect(earned).toBeGreaterThan(0);
    expect(streakStatus(p, at(10, 20))).toMatchObject({ xpToday: earned, goalMet: false });
    expect(streakStatus(p, at(11, 8)).xpToday).toBe(0);
  });

  it('is met once today\'s XP reaches the goal, and can be adjusted', () => {
    let p = finishSession(initialProgress(), at(10));
    const earned = p.xp;
    p = applyEvent(p, { type: 'daily-goal-set', goal: earned }, at(10)).progress;
    expect(streakStatus(p, at(10, 20))).toMatchObject({ dailyGoal: earned, goalMet: true });
    p = applyEvent(p, { type: 'daily-goal-set', goal: earned + 1 }, at(10)).progress;
    expect(streakStatus(p, at(10, 20)).goalMet).toBe(false);
  });

  it('ignores a goal that is not a positive whole number', () => {
    const p = initialProgress();
    for (const goal of [0, -5, 2.5, Number.NaN]) {
      expect(applyEvent(p, { type: 'daily-goal-set', goal }, at(10)).progress.dailyGoal).toBe(100);
    }
  });

  it('never breaks the streak when missed: streak intact with goal unmet', () => {
    let p = applyEvent(initialProgress(), { type: 'daily-goal-set', goal: 100000 }, at(10)).progress;
    p = finishSession(p, at(10));
    p = finishSession(p, at(11));
    expect(streakStatus(p, at(11, 22))).toMatchObject({ current: 2, securedToday: true, goalMet: false });
    expect(streakStatus(p, at(12, 7))).toMatchObject({ current: 2, goalMet: false });
  });
});
