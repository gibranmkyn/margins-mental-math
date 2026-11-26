import { createRandom, isScenarioSkill, retryQuestion } from '../question';
import type { Tier } from '../question';
import { localDay } from './days';
import { MOCK_LENGTHS } from './mocks';
import type { AnswerRecord, Progress } from './types';
import { mockAnswerXp, sessionAnswerXp, sprintXp } from './xp';

/** Target times by kind and tier, for an old answer whose question can no longer be built. */
const FALLBACK_TARGET_MS: Record<'drill' | 'choice', Record<Tier, number>> = {
  drill: { 1: 10_000, 2: 20_000, 3: 25_000 },
  choice: { 1: 60_000, 2: 90_000, 3: 120_000 },
};

/**
 * The target time an answer was paid for: stored with it since v10; for an older one,
 * read from its question rebuilt (the same booklet or authored question, or one from the
 * same template and tier), else the usual target for its kind and tier.
 */
function targetTimer(): (answer: AnswerRecord) => number {
  const cache = new Map<string, number>();
  return (answer) => {
    if (typeof answer.targetMs === 'number' && answer.targetMs > 0) return answer.targetMs;
    const key = answer.source === 'generated' ? `${answer.questionId.replace(/-t\d-\d+$/, '')}|${answer.tier}` : answer.questionId;
    let target = cache.get(key);
    if (target === undefined) {
      try {
        target = retryQuestion({ id: answer.questionId, skill: answer.skill, tier: answer.tier, source: answer.source }, createRandom(1)).targetTimeMs;
      } catch {
        target = FALLBACK_TARGET_MS[isScenarioSkill(answer.skill) ? 'choice' : 'drill'][answer.tier] ?? 60_000;
      }
      cache.set(key, target);
    }
    return target;
  };
}

/**
 * Every XP figure worked out again from the history under today's rules: each answer
 * (by its session's run, or its mock's result), each session and mock as the sum of its
 * answers, each sprint from its score, and the lifetime total as the sum of them all.
 * A history earned under today's rules comes back unchanged.
 */
export function rescoreXp(progress: Progress): Progress {
  const mocks = new Map(
    progress.mocks.map((m) => [m.id, { timeLimitMs: MOCK_LENGTHS[m.length].minutes * 60_000, questions: m.questionCount, passed: m.passed }]),
  );
  const targetOf = targetTimer();
  const runs = new Map<string, number>();
  const answers = progress.answers.map((a): AnswerRecord => {
    const mock = mocks.get(a.sessionId);
    let xp: number;
    if (mock) {
      xp = mockAnswerXp(mock.timeLimitMs, mock.questions, mock.passed, a.correct).xp;
    } else {
      const run = a.correct ? (runs.get(a.sessionId) ?? 0) + 1 : 0;
      runs.set(a.sessionId, run);
      xp = sessionAnswerXp(targetOf(a), a.correct, a.metTarget, run).xp;
    }
    return a.xp === xp ? a : { ...a, xp };
  });
  const bySession = new Map<string, number>();
  for (const a of answers) bySession.set(a.sessionId, (bySession.get(a.sessionId) ?? 0) + a.xp);
  const sessions = progress.sessions.map((s) => {
    const xp = bySession.get(s.id) ?? 0;
    return s.xp === xp ? s : { ...s, xp };
  });
  const mockRecords = progress.mocks.map((m) => {
    const xp = bySession.get(m.id) ?? 0;
    return m.xp === xp ? m : { ...m, xp };
  });
  const sprints = progress.sprints.map((s) => {
    const xp = sprintXp(s.score);
    const day = s.day ?? localDay(new Date(s.finishedAt));
    return s.xp === xp && s.day === day ? s : { ...s, xp, day };
  });
  const xp = progress.earlier.xp + answers.reduce((sum, a) => sum + a.xp, 0) + sprints.reduce((sum, s) => sum + s.xp, 0);
  return { ...progress, xp, answers, sessions, mocks: mockRecords, sprints };
}
