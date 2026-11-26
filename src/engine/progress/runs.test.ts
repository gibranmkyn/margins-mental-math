import { describe, expect, it } from 'vitest';
import { createRandom } from '../question';
import { chooseMock, chooseNextSession, initialProgress, resumeRun, SESSION_RESUME_MS } from './index';
import type { MockInProgress, SessionInProgress } from './index';

const START = new Date('2026-11-25T08:00:00Z');
const later = (ms: number) => new Date(START.getTime() + ms);

function mockRun(): MockInProgress {
  const plan = chooseMock(initialProgress(), 'short', START, createRandom(1));
  return {
    kind: 'mock',
    plan,
    startedAt: START.getTime(),
    index: 3,
    choices: plan.questions.map((_, i) => (i < 4 ? 1 : null)),
    flagged: plan.questions.map((_, i) => i === 2),
    spentMs: plan.questions.map((_, i) => (i < 4 ? 60_000 : 0)),
  };
}

function sessionRun(answered: number, savedAt = START): SessionInProgress {
  const plan = chooseNextSession(initialProgress(), START, createRandom(2), { skill: 'addition', tier: 1 });
  return { kind: 'session', plan, results: Array.from({ length: answered }, (_, i) => i !== 1), levelUps: [], badges: [], savedAt: savedAt.getTime() };
}

describe('coming back to a mock in progress after a reload or the phone closing the app', () => {
  it('resumes it with the wall-clock time still running when time is left', () => {
    const run = mockRun();
    expect(resumeRun(run, later(10 * 60_000))).toEqual({ action: 'resume-mock', run });
  });

  it('submits it at once with the saved answers when the time ran out while away', () => {
    const run = mockRun();
    expect(resumeRun(run, later(45 * 60_000))).toEqual({ action: 'submit-mock', run, timeMs: 20 * 60_000 });
  });

  it('submits it exactly at the deadline', () => {
    const run = mockRun();
    expect(resumeRun(run, later(20 * 60_000)).action).toBe('submit-mock');
  });
});

describe('coming back to a session in progress', () => {
  it('resumes at the first question not yet answered (answers given are already credited)', () => {
    const run = sessionRun(2);
    expect(resumeRun(run, later(60_000))).toEqual({ action: 'resume-session', run, index: 2 });
  });

  it('finishes a session whose every question was answered, as of its last answer, so the day still counts for the streak', () => {
    const run = sessionRun(5);
    expect(resumeRun(run, later(60_000))).toEqual({ action: 'finish-session', run, at: START });
  });

  it('finishes a fully answered session however long ago it was left, on the day it was played', () => {
    const run = sessionRun(5);
    expect(resumeRun(run, later(SESSION_RESUME_MS * 30))).toEqual({ action: 'finish-session', run, at: START });
  });

  it('ends a part-answered session left too long ago without recording it; its answers stay credited', () => {
    expect(resumeRun(sessionRun(2), later(SESSION_RESUME_MS + 1))).toEqual({ action: 'end-session' });
  });
});
