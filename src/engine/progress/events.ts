import { isScenarioSkill, markAnswer } from '../question';
import type { DrillSkill, Question } from '../question';
import { unlockBadges } from './badges';
import { localDay } from './days';
import { levelFor } from './levels';
import { mockPassed, mockPercent } from './mocks';
import { mockAnswerXp, sessionAnswerXp, sprintXp } from './xp';
import type { MockPlan } from './mocks';
import { retriesAfterAnswer } from './retries';
import { personalBest } from './sprints';
import type { AnswerRecord, MockQuestionResult, MockRecord, Progress } from './types';

/** Something the owner did. */
export type ProgressEvent =
  | {
      type: 'answer-recorded';
      sessionId: string;
      question: Question;
      correct: boolean;
      timeMs: number;
    }
  /** A session's last answer was given. `spotCheck` marks a spot check's finish, so its record says so. */
  | { type: 'session-finished'; sessionId: string; spotCheck?: true }
  | { type: 'daily-goal-set'; goal: number }
  /** The app opened: nothing changes but badges already earned in the history (say, after a migration) unlock. */
  | { type: 'app-opened' }
  /** A sprint ran out of time. Sprint answers are not recorded one by one: only the result. */
  | { type: 'sprint-finished'; skill: DrillSkill; score: number; attempted: number }
  /**
   * A mock was submitted, by the owner or by the clock at zero. Answers can change
   * until then, so they are marked and recorded only now.
   */
  | {
      type: 'mock-finished';
      mock: MockPlan;
      /** The option chosen for each question, in mock order; null when left unanswered. */
      choices: Array<number | null>;
      /** Time spent on each question, summed over every visit to it. */
      timesMs: number[];
      /** Time used in all. */
      timeMs: number;
    };

/** Something that just happened as a result, for the interface to show. */
export type Happening =
  | { kind: 'session-finished'; score: number; total: number; timeMs: number; xp: number }
  | {
      kind: 'xp-earned';
      /** Total for this answer: base + speedBonus + comboBonus. Zero for a wrong answer. */
      xp: number;
      base: number;
      speedBonus: number;
      comboBonus: number;
      /** Length of the correct run in this session, counting this answer; 0 when wrong. */
      combo: number;
    }
  | { kind: 'level-up'; from: string; to: string }
  | {
      kind: 'sprint-finished';
      skill: DrillSkill;
      score: number;
      attempted: number;
      /** XP the sprint earned: one per correct answer. */
      xp: number;
      /** The best before this sprint; null when this was the first with a correct answer. */
      previousBest: number | null;
      /** This sprint beat the previous best. A score of zero never does. */
      newBest: boolean;
    }
  | {
      kind: 'mock-finished';
      mock: MockRecord;
      /** Questions answered wrongly or left unanswered, in mock order: what retries bring back. */
      missed: MockQuestionResult[];
    }
  | { kind: 'badge-unlocked'; id: string; mark: string; name: string };

/**
 * The time recorded for an answer is at most three times its target time. Time the
 * app spent hidden is already left out by the screens; this bounds whatever is left
 * (a long pause with the screen on), so one interruption cannot distort time trends.
 */
const TIME_CAP_TARGETS = 3;

export interface Transition {
  progress: Progress;
  happened: Happening[];
}

/**
 * The single place game rules live: given progress, an event and the current
 * time, return the new progress and what just happened. Never mutates its input.
 */
export function applyEvent(progress: Progress, event: ProgressEvent, now: Date): Transition {
  const result = applyRules(progress, event, now);
  const { progress: next, unlocked } = unlockBadges(result.progress, { now });
  if (unlocked.length === 0) return result;
  const badges: Happening[] = unlocked.map((b) => ({ kind: 'badge-unlocked', id: b.id, mark: b.mark, name: b.name }));
  return { progress: next, happened: [...result.happened, ...badges] };
}

function applyRules(progress: Progress, event: ProgressEvent, now: Date): Transition {
  switch (event.type) {
    case 'answer-recorded':
      return recordAnswer(progress, event, now);
    case 'session-finished':
      return finishSession(progress, event, now);
    case 'daily-goal-set':
      return setDailyGoal(progress, event.goal);
    case 'app-opened':
      return { progress, happened: [] };
    case 'sprint-finished':
      return finishSprint(progress, event, now);
    case 'mock-finished':
      return finishMock(progress, event, now);
  }
}

/** How a mock pays its answers: for their share of its time, at the passed or failed rate; no combo, no speed bonus. */
interface MockPay {
  timeLimitMs: number;
  questions: number;
  passed: boolean;
}

function recordAnswer(
  progress: Progress,
  { sessionId, question, correct, timeMs: given }: Extract<ProgressEvent, { type: 'answer-recorded' }>,
  now: Date,
  mock?: MockPay,
): Transition {
  const cap = question.targetTimeMs * TIME_CAP_TARGETS;
  const timeMs = Number.isFinite(given) ? Math.round(Math.min(cap, Math.max(0, given))) : cap;
  let run = 0;
  for (let i = progress.answers.length - 1; i >= 0; i--) {
    const earlier = progress.answers[i]!;
    if (earlier.sessionId !== sessionId) continue;
    if (!earlier.correct) break;
    run++;
  }
  const combo = correct && !mock ? run + 1 : 0;
  const metTarget = timeMs < question.targetTimeMs;
  const { xp, base, speedBonus, comboBonus } = mock
    ? mockAnswerXp(mock.timeLimitMs, mock.questions, mock.passed, correct)
    : sessionAnswerXp(question.targetTimeMs, correct, metTarget, combo);

  const record: AnswerRecord = {
    sessionId,
    questionId: question.id,
    skill: question.skill,
    tier: question.tier,
    source: question.source,
    correct,
    timeMs,
    metTarget,
    targetMs: question.targetTimeMs,
    xp,
    answeredAt: now.toISOString(),
    day: localDay(now),
  };
  const happened: Happening[] = [{ kind: 'xp-earned', xp, base, speedBonus, comboBonus, combo }];
  const before = levelFor(progress.xp);
  const after = levelFor(progress.xp + xp);
  if (after.level > before.level) happened.push({ kind: 'level-up', from: before.rank, to: after.rank });
  const retries = retriesAfterAnswer(progress.retries, question, correct, now);
  return { progress: { ...progress, xp: progress.xp + xp, answers: [...progress.answers, record], retries }, happened };
}

function finishSession(progress: Progress, { sessionId, spotCheck }: Extract<ProgressEvent, { type: 'session-finished' }>, now: Date): Transition {
  const answers = progress.answers.filter((a) => a.sessionId === sessionId);
  const first = answers[0];
  if (!first) return { progress, happened: [] };

  const score = answers.filter((a) => a.correct).length;
  const xp = answers.reduce((sum, a) => sum + a.xp, 0);
  const timeMs = answers.reduce((sum, a) => sum + a.timeMs, 0);
  return {
    progress: {
      ...progress,
      sessions: [
        ...progress.sessions,
        {
          id: sessionId,
          kind: isScenarioSkill(first.skill) ? 'scenario' : 'drill',
          skill: first.skill,
          finishedAt: now.toISOString(),
          day: localDay(now),
          questionCount: answers.length,
          correctCount: score,
          timeMs,
          xp,
          ...(spotCheck && { spotCheck }),
        },
      ],
    },
    happened: [{ kind: 'session-finished', score, total: answers.length, timeMs, xp }],
  };
}

/** A goal must be a positive whole number of XP; anything else is ignored. */
function setDailyGoal(progress: Progress, goal: number): Transition {
  if (!Number.isInteger(goal) || goal <= 0) return { progress, happened: [] };
  return { progress: { ...progress, dailyGoal: goal }, happened: [] };
}

function finishSprint(
  progress: Progress,
  { skill, score, attempted }: Extract<ProgressEvent, { type: 'sprint-finished' }>,
  now: Date,
): Transition {
  const previousBest = personalBest(progress, skill);
  const newBest = score > 0 && (previousBest === null || score > previousBest);
  const xp = sprintXp(score);
  const happened: Happening[] = [{ kind: 'sprint-finished', skill, score, attempted, xp, previousBest, newBest }];
  const before = levelFor(progress.xp);
  const after = levelFor(progress.xp + xp);
  if (after.level > before.level) happened.push({ kind: 'level-up', from: before.rank, to: after.rank });
  return {
    progress: {
      ...progress,
      xp: progress.xp + xp,
      sprints: [...progress.sprints, { skill, score, attempted, xp, finishedAt: now.toISOString(), day: localDay(now) }],
    },
    happened,
  };
}

/**
 * Mark every question of a mock. Each answered question is recorded as an answer
 * (so it counts for mastery and booklet progress), and a correct one is paid for its
 * share of the mock's time, more when the mock is passed than when it is failed.
 * Wrong and unanswered questions alike become retries for the next scenario
 * session; unanswered ones are otherwise kept only in the mock's record. A mock
 * already finished is ignored.
 */
function finishMock(
  progress: Progress,
  { mock, choices, timesMs, timeMs }: Extract<ProgressEvent, { type: 'mock-finished' }>,
  now: Date,
): Transition {
  if (progress.mocks.some((m) => m.id === mock.id)) return { progress, happened: [] };
  // Marked first, so every correct answer is paid at the passed or failed rate.
  const marks = mock.questions.map((question, i) => {
    const chosen = choices[i] ?? null;
    return chosen !== null && markAnswer(question, { kind: 'choice', index: chosen }).correct;
  });
  const pay: MockPay = { timeLimitMs: mock.timeLimitMs, questions: mock.questions.length, passed: mockPassed(marks.filter(Boolean).length, mock.questions.length) };
  let next = progress;
  const happened: Happening[] = [];
  const questions = mock.questions.map((question, i): MockQuestionResult => {
    if (question.answer.kind !== 'choice') throw new Error(`Mock question ${question.id} is not multiple choice`);
    const chosen = choices[i] ?? null;
    const correct = marks[i]!;
    if (chosen !== null) {
      // Recorded like any answer: XP, mastery, booklet progress, and a retry when wrong.
      const recorded = recordAnswer(next, { type: 'answer-recorded', sessionId: mock.id, question, correct, timeMs: timesMs[i] ?? 0 }, now, pay);
      next = recorded.progress;
      happened.push(...recorded.happened.filter((h) => h.kind === 'level-up'));
    } else {
      // Unanswered is a miss: it comes back as a retry like a wrong answer, without counting as answered.
      next = { ...next, retries: retriesAfterAnswer(next.retries, question, false, now) };
    }
    const { id: questionId, skill, tier, source } = question;
    return { questionId, skill, tier, source, chosen, correctIndex: question.answer.correctIndex, correct };
  });
  const correctCount = questions.filter((q) => q.correct).length;
  const record: MockRecord = {
    id: mock.id,
    length: mock.length,
    finishedAt: now.toISOString(),
    day: localDay(now),
    questionCount: questions.length,
    correctCount,
    answeredCount: questions.filter((q) => q.chosen !== null).length,
    percent: mockPercent(correctCount, questions.length),
    passed: mockPassed(correctCount, questions.length),
    timeMs: Math.min(Math.max(0, timeMs), mock.timeLimitMs),
    xp: next.xp - progress.xp,
    questions,
  };
  // Several promotions in one mock read as one: from the first rank to the last.
  const ups = happened.filter((h): h is Extract<Happening, { kind: 'level-up' }> => h.kind === 'level-up');
  const promotion: Happening[] = ups.length > 0 ? [{ kind: 'level-up', from: ups[0]!.from, to: ups[ups.length - 1]!.to }] : [];
  return {
    progress: { ...next, mocks: [...next.mocks, record] },
    happened: [{ kind: 'mock-finished', mock: record, missed: questions.filter((q) => !q.correct) }, ...promotion],
  };
}
