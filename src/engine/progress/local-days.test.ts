import { describe, expect, it } from 'vitest';
import { createRandom } from '../question';
import { applyEvent, chooseNextSession, drillTimeTrend, initialProgress, streakStatus } from './index';
import type { AnswerRecord, Progress, SessionRecord } from './index';

/** Local-time date, so tests do not depend on the machine's time zone. */
const at = (day: number, hour = 12, minute = 0) => new Date(2026, 10, day, hour, minute);

describe('days are the local days the owner lived them, kept when recorded', () => {
  it('stores the local calendar day on each answer and finished session', () => {
    const plan = chooseNextSession(initialProgress(), at(25, 6, 30), createRandom(1));
    let p = applyEvent(initialProgress(), { type: 'answer-recorded', sessionId: plan.id, question: plan.questions[0]!, correct: true, timeMs: 1000 }, at(25, 6, 30)).progress;
    p = applyEvent(p, { type: 'session-finished', sessionId: plan.id }, at(25, 6, 31)).progress;
    expect(p.answers[0]!.day).toBe('2026-11-25');
    expect(p.sessions[0]!.day).toBe('2026-11-25');
  });

  it('counts a session on the day it was recorded, even when the phone is now in another time zone', () => {
    // Finished at 06:30 in Jakarta (23:30 UTC the day before), read later in London: still the 25th.
    const session: SessionRecord = { id: 's', kind: 'drill', skill: 'addition', day: '2026-11-25', finishedAt: '2026-11-20T23:30:00.000Z', questionCount: 5, correctCount: 5, timeMs: 5000, xp: 50 };
    const p: Progress = { ...initialProgress(), sessions: [session] };
    expect(streakStatus(p, at(25, 20))).toMatchObject({ current: 1, securedToday: true });
  });

  it('puts a drill on the day it was recorded in the time trend and in XP today', () => {
    const answer: AnswerRecord = { sessionId: 's', questionId: 'q', skill: 'addition', tier: 1, source: 'generated', correct: true, timeMs: 4000, metTarget: true, xp: 15, day: '2026-11-25', answeredAt: '2026-11-20T23:30:00.000Z' };
    const p: Progress = { ...initialProgress(), answers: [answer] };
    expect(drillTimeTrend(p, at(25)).points).toEqual([{ day: '2026-11-25', to: '2026-11-25', averageMs: 4000, count: 1 }]);
    expect(drillTimeTrend(p, at(25)).recentMs).toBe(4000);
    expect(streakStatus(p, at(25)).xpToday).toBe(15);
  });
});
