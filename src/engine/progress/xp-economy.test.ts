import { describe, expect, it } from 'vitest';
import { createRandom, listBooklets, listSkills } from '../question';
import type { Question, Skill, Tier } from '../question';
import { applyEvent, chooseBookletSession, chooseMock, chooseNextSession, initialProgress, levelFor, streakStatus } from './index';
import type { MockLength, Progress, SessionPlan } from './index';
import { NO_BOOKLETS } from '../question/test-support/booklets';

const START = new Date(2026, 10, 24, 8, 0);
const MINUTE = 60_000;

/**
 * The honest practice the economy is tuned to: four answers in five right, each given at
 * about its target time (alternately a tenth inside it and a tenth over).
 */
const honest = (i: number) => ({ correct: i % 5 !== 4, factor: i % 2 === 0 ? 0.9 : 1.1 });

interface Played {
  progress: Progress;
  xp: number;
  minutes: number;
}

/** Play a session's questions the honest way, then finish it; XP earned and minutes spent answering. */
function playSession(progress: Progress, plan: SessionPlan, at: Date, counter: { i: number }): Played {
  const before = progress.xp;
  let ms = 0;
  for (const question of plan.questions) {
    const { correct, factor } = honest(counter.i++);
    const timeMs = Math.round(question.targetTimeMs * factor);
    ms += timeMs;
    progress = applyEvent(progress, { type: 'answer-recorded', sessionId: plan.id, question, correct, timeMs }, at).progress;
  }
  progress = applyEvent(progress, { type: 'session-finished', sessionId: plan.id }, at).progress;
  return { progress, xp: progress.xp - before, minutes: ms / MINUTE };
}

function correctIndex(q: Question): number {
  if (q.answer.kind !== 'choice') throw new Error('Choice expected');
  return q.answer.correctIndex;
}

/** Sit a mock with `right` questions answered correctly and the rest wrong, using all the time allowed. */
function sitMock(length: MockLength, right: number, seed = 3): Played & { answerXp: number[] } {
  const mock = chooseMock(initialProgress(), length, START, createRandom(seed));
  const choices = mock.questions.map((q, i) => (i < right ? correctIndex(q) : (correctIndex(q) + 1) % 4));
  const perQuestion = mock.timeLimitMs / mock.questions.length;
  const { progress } = applyEvent(
    initialProgress(),
    { type: 'mock-finished', mock, choices, timesMs: mock.questions.map(() => perQuestion * 0.5), timeMs: mock.timeLimitMs },
    START,
  );
  return { progress, xp: progress.xp, minutes: mock.timeLimitMs / MINUTE, answerXp: progress.answers.filter((a) => a.correct).map((a) => a.xp) };
}

const perMinute = (runs: Played[]) => runs.reduce((s, r) => s + r.xp, 0) / runs.reduce((s, r) => s + r.minutes, 0);

/** Four sessions in one skill and tier, played the honest way. */
function sessionsIn(skill: Skill, tier: Tier): Played[] {
  let progress = initialProgress();
  const counter = { i: 0 };
  return Array.from({ length: 4 }, (_, n) => {
    const at = new Date(START.getTime() + n * 10 * MINUTE);
    const run = playSession(progress, chooseNextSession(progress, at, createRandom(n + 1), { skill, tier }), at, counter);
    progress = run.progress;
    return run;
  });
}

const SKILLS = listSkills();
const drillRuns = SKILLS.filter((s) => s.kind === 'drill').flatMap((s) => s.tiers.map((tier) => ({ name: `${s.skill} t${tier}`, runs: sessionsIn(s.skill, tier) })));
const choiceRuns = SKILLS.filter((s) => s.kind !== 'drill').flatMap((s) => s.tiers.map((tier) => ({ name: `${s.skill} t${tier}`, runs: sessionsIn(s.skill, tier) })));
const bookletRuns = listBooklets().map((b) => {
  let progress = initialProgress();
  const counter = { i: 0 };
  const runs = Array.from({ length: 3 }, (_, n) => {
    const at = new Date(START.getTime() + n * 10 * MINUTE);
    const run = playSession(progress, chooseBookletSession(progress, b.id, at, createRandom(n)), at, counter);
    progress = run.progress;
    return run;
  });
  return { name: b.id, runs };
});

describe('XP per minute of honest practice', () => {
  const drill = perMinute(drillRuns.flatMap((d) => d.runs));
  const scenario = perMinute(choiceRuns.flatMap((d) => d.runs));
  const booklet = perMinute(bookletRuns.flatMap((d) => d.runs));
  const mock = perMinute([sitMock('short', 8), sitMock('full', 21)]);

  it('is about 35 XP a minute in drill sessions', () => {
    expect(drill).toBeGreaterThan(28);
    expect(drill).toBeLessThan(42);
  });

  it('is about the same in every drill skill and tier', () => {
    for (const { name, runs } of drillRuns) {
      const ratio = perMinute(runs) / drill;
      expect({ name, inBand: ratio > 0.8 && ratio < 1.2 }).toEqual({ name, inBand: true });
    }
  });

  it('is about the same in scenario and chart sessions and a passed mock as in drills', () => {
    for (const rate of [scenario, mock]) {
      expect(rate).toBeGreaterThan(drill * 0.85);
      expect(rate).toBeLessThan(drill * 1.15);
    }
    for (const { runs } of choiceRuns) {
      expect(perMinute(runs)).toBeGreaterThan(scenario * 0.8);
      expect(perMinute(runs)).toBeLessThan(scenario * 1.2);
    }
  });

  it.skipIf(NO_BOOKLETS)('is about the same in booklet sessions as in drills', () => {
    expect(booklet).toBeGreaterThan(drill * 0.85);
    expect(booklet).toBeLessThan(drill * 1.15);
  });
});

describe('XP in a mock', () => {
  it('pays every correct answer the same: no combo and no speed bonus', () => {
    const { answerXp } = sitMock('full', 26);
    expect(new Set(answerXp).size).toBe(1);
  });

  it('pays a failed mock clearly less than a passed one', () => {
    const failed = sitMock('full', 18).xp;
    const passed = sitMock('full', 19).xp;
    expect(failed).toBeGreaterThan(0);
    expect(failed).toBeLessThan(passed * 0.7);
    expect(sitMock('short', 6).xp).toBeLessThan(sitMock('short', 7).xp * 0.7);
  });

  it('no longer carries a new owner up most of the rank ladder in one sitting', () => {
    expect(levelFor(sitMock('full', 26).xp).level).toBeLessThanOrEqual(3);
  });
});

describe('XP for a sprint', () => {
  const sprint = (progress: Progress, score: number) => applyEvent(progress, { type: 'sprint-finished', skill: 'addition', score, attempted: score + 3 }, START);

  it('is one XP per correct answer, kept with the sprint and counted in today\'s XP', () => {
    const { progress, happened } = sprint(initialProgress(), 17);
    expect(progress.xp).toBe(17);
    expect(progress.sprints[0]).toMatchObject({ score: 17, xp: 17 });
    expect(happened[0]).toMatchObject({ kind: 'sprint-finished', xp: 17 });
    expect(streakStatus(progress, START).xpToday).toBe(17);
  });

  it('is small next to a minute of sessions', () => {
    // A strong addition sprint is about 20 right in the minute.
    expect(sprint(initialProgress(), 20).progress.xp).toBeLessThan(drillRuns.length > 0 ? perMinute(drillRuns.flatMap((d) => d.runs)) : 0);
  });

  it('promotes when it crosses a rank', () => {
    const near: Progress = { ...initialProgress(), xp: levelFor(0).xpForLevel - 5 };
    expect(sprint(near, 10).happened).toContainEqual({ kind: 'level-up', from: 'Intern', to: 'Analyst' });
  });
});

describe('rank pacing', () => {
  /** One day of about 20 minutes of honest answering, drill and scenario sessions taking turns, every tier. */
  function oneDay(): number {
    let progress = initialProgress();
    let minutes = 0;
    const counter = { i: 0 };
    const pool = SKILLS.flatMap((s) => s.tiers.map((tier) => ({ skill: s.skill, tier, drill: s.kind === 'drill' })));
    const drills = pool.filter((p) => p.drill);
    const choices = pool.filter((p) => !p.drill);
    for (let n = 0; minutes < 20; n++) {
      const from = n % 2 === 0 ? drills : choices;
      const pick = from[(n * 7) % from.length]!;
      const at = new Date(START.getTime() + n * 5 * MINUTE);
      const run = playSession(progress, chooseNextSession(progress, at, createRandom(n), pick), at, counter);
      progress = run.progress;
      minutes += run.minutes;
    }
    return progress.xp;
  }
  const day = oneDay();

  it('reaches Analyst on the first day', () => {
    expect(levelFor(day).rank).not.toBe('Intern');
  });

  it('reaches Senior Partner in about three months of 20 minutes a day, not much sooner', () => {
    expect(levelFor(day * 75).rank).not.toBe('Senior Partner');
    expect(levelFor(day * 110).rank).toBe('Senior Partner');
  });

  it('comes quickly early and slowly late: each rank takes longer to earn than the one before', () => {
    const starts: number[] = [];
    for (let xp = 0, level = 0; xp < 200_000; xp += 10) {
      const now = levelFor(xp).level;
      if (now > level) starts.push(xp);
      level = now;
    }
    expect(starts).toHaveLength(9);
    const spans = starts.slice(1).map((s, i) => s - starts[i]!);
    for (let i = 1; i < spans.length; i++) expect(spans[i]).toBeGreaterThan(spans[i - 1]!);
  });
});
