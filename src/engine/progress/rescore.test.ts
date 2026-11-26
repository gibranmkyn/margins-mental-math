import { describe, expect, it } from 'vitest';
import { createRandom } from '../question';
import type { Question } from '../question';
import { applyEvent, chooseMock, chooseNextSession, initialProgress, rescoreXp } from './index';
import type { Progress } from './index';

const DAY_ONE = new Date(2026, 10, 20, 9, 0);

function correctIndex(q: Question): number {
  if (q.answer.kind !== 'choice') throw new Error('Choice expected');
  return q.answer.correctIndex;
}

/** A small mixed history made under today's rules: sessions, a session left part-way, a passed mock, a sprint. */
function history(): Progress {
  let p = initialProgress();
  let at = DAY_ONE.getTime();
  const tick = () => new Date((at += 90_000));
  for (const [n, choice] of [{ skill: 'addition', tier: 1 }, { skill: 'multiplication', tier: 3 }, { skill: 'break-even-payback', tier: 2 }].entries()) {
    const plan = chooseNextSession(p, tick(), createRandom(n + 1), choice as never);
    plan.questions.forEach((q, i) => {
      p = applyEvent(p, { type: 'answer-recorded', sessionId: plan.id, question: q, correct: i !== 2, timeMs: q.targetTimeMs * (i % 2 ? 0.8 : 1.2) }, tick()).progress;
    });
    p = applyEvent(p, { type: 'session-finished', sessionId: plan.id }, tick()).progress;
  }
  const left = chooseNextSession(p, tick(), createRandom(9), { skill: 'division', tier: 2 });
  p = applyEvent(p, { type: 'answer-recorded', sessionId: left.id, question: left.questions[0]!, correct: true, timeMs: 3000 }, tick()).progress;
  const mock = chooseMock(p, 'short', tick(), createRandom(4));
  const choices = mock.questions.map((q, i) => (i < 8 ? correctIndex(q) : null));
  p = applyEvent(p, { type: 'mock-finished', mock, choices, timesMs: mock.questions.map(() => 100_000), timeMs: 18 * 60_000 }, tick()).progress;
  p = applyEvent(p, { type: 'sprint-finished', skill: 'addition', score: 14, attempted: 16 }, tick()).progress;
  return p;
}

describe('rescoring XP from history', () => {
  it('leaves a history earned under today\'s rules exactly as it is', () => {
    const p = history();
    expect(p.xp).toBeGreaterThan(0);
    expect(rescoreXp(p)).toEqual(p);
  });

  it('recomputes inflated XP from the answers, mocks and sprints, so nobody keeps it', () => {
    const today = history();
    // The same history as an older build scored it: three times the XP on every answer,
    // sessions and mocks summing those, sprints earning nothing, and no target times stored.
    const inflated: Progress = {
      ...today,
      xp: 9999,
      answers: today.answers.map(({ targetMs: _gone, ...a }) => ({ ...a, xp: a.xp * 3 + (a.correct ? 7 : 0) })),
      sessions: today.sessions.map((s) => ({ ...s, xp: s.xp * 3 })),
      mocks: today.mocks.map((m) => ({ ...m, xp: m.xp * 3 })),
      sprints: today.sprints.map(({ day: _d, ...s }) => ({ ...s, xp: 0 })),
    };
    const rescored = rescoreXp(inflated);
    expect(rescored.xp).toBe(today.xp);
    expect(rescored.answers.map((a) => a.xp)).toEqual(today.answers.map((a) => a.xp));
    expect(rescored.sessions.map((s) => s.xp)).toEqual(today.sessions.map((s) => s.xp));
    expect(rescored.mocks.map((m) => m.xp)).toEqual(today.mocks.map((m) => m.xp));
    expect(rescored.sprints.map((s) => s.xp)).toEqual([14]);
  });

  it('pays a mock\'s answers at its passed or failed rate, with no combo or speed bonus', () => {
    const p = history();
    const mockId = p.mocks[0]!.id;
    const paid = p.answers.filter((a) => a.sessionId === mockId && a.correct).map((a) => a.xp);
    expect(new Set(paid).size).toBe(1);
    expect(p.mocks[0]!.xp).toBe(paid.reduce((s, x) => s + x, 0));
  });
});
