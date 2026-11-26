import { describe, expect, it } from 'vitest';
import { createQuestion, createRandom } from '../question';
import { applyEvent, chooseNextSession, initialProgress, nextSprintQuestion, personalBest, SPRINT_MS, SPRINT_START, skipSprint, streakStatus, totals, typeIntoSprint } from './index';
import type { Progress, SprintStep } from './index';
import type { DrillQuestion, DrillSkill, Key, Marking } from '../question';

const NOON = new Date(2026, 10, 24, 12, 0);

const sprint = (progress: Progress, skill: DrillSkill, score: number, attempted = score + 2) =>
  applyEvent(progress, { type: 'sprint-finished', skill, score, attempted }, NOON);

describe('sprints', () => {
  it('lasts 60 seconds', () => {
    expect(SPRINT_MS).toBe(60_000);
  });

  it('draws drills of the chosen skill, never the same prompt twice in a row', () => {
    const random = createRandom(7);
    let previous: string | null = null;
    for (let i = 0; i < 200; i++) {
      const q = nextSprintQuestion('multiplication', random, previous);
      expect(q.skill).toBe('multiplication');
      expect(q.prompt).not.toBe(previous);
      previous = q.prompt;
    }
  });
});

describe('personal bests', () => {
  it('has none before a first sprint', () => {
    expect(personalBest(initialProgress(), 'addition')).toBeNull();
  });

  it('records the first sprint with any correct answer as a new personal best', () => {
    const { progress, happened } = sprint(initialProgress(), 'addition', 9);
    expect(personalBest(progress, 'addition')).toBe(9);
    expect(happened).toEqual([
      { kind: 'sprint-finished', skill: 'addition', score: 9, attempted: 11, xp: 9, previousBest: null, newBest: true },
    ]);
  });

  it('does not make a score of zero a personal best', () => {
    const { progress, happened } = sprint(initialProgress(), 'addition', 0, 3);
    expect(personalBest(progress, 'addition')).toBeNull();
    expect(happened[0]).toMatchObject({ newBest: false });
  });

  it('only ever improves: a beaten score is reported and kept, a lower or equal one is not', () => {
    let p = sprint(initialProgress(), 'addition', 9).progress;
    const better = sprint(p, 'addition', 12);
    expect(better.happened[0]).toMatchObject({ previousBest: 9, newBest: true });
    p = better.progress;

    for (const score of [12, 11, 0]) {
      const worse = sprint(p, 'addition', score);
      expect(worse.happened[0]).toMatchObject({ previousBest: 12, newBest: false });
      expect(personalBest(worse.progress, 'addition')).toBe(12);
      p = worse.progress;
    }
  });

  it('keeps a separate best for each drill skill', () => {
    let p = sprint(initialProgress(), 'addition', 14).progress;
    p = sprint(p, 'division', 5).progress;
    expect(personalBest(p, 'addition')).toBe(14);
    expect(personalBest(p, 'division')).toBe(5);
    expect(personalBest(p, 'subtraction')).toBeNull();
  });

  it('never changes the progress it was given', () => {
    const before = initialProgress();
    sprint(before, 'addition', 9);
    expect(personalBest(before, 'addition')).toBeNull();
  });
});

describe('sprints and the rest of progress', () => {
  it('create no retries or answers, earn one XP per correct answer, and do not count as a session or extend the streak', () => {
    const { progress } = sprint(initialProgress(), 'addition', 20, 25);
    expect(progress.answers).toEqual([]);
    expect(progress.sessions).toEqual([]);
    expect(progress.retries).toEqual([]);
    expect(progress.xp).toBe(20);
    expect(totals(progress)).toMatchObject({ answered: 0, correct: 0, sessionsFinished: 0 });
    expect(streakStatus(progress, NOON)).toMatchObject({ current: 0, securedToday: false });
  });

  it('leave an existing streak and sessions untouched', () => {
    const plan = chooseNextSession(initialProgress(), NOON, createRandom(1));
    let p = initialProgress();
    for (const question of plan.questions) {
      p = applyEvent(p, { type: 'answer-recorded', sessionId: plan.id, question, correct: true, timeMs: 1000 }, NOON).progress;
    }
    p = applyEvent(p, { type: 'session-finished', sessionId: plan.id }, NOON).progress;
    const after = sprint(p, 'addition', 10).progress;
    expect(after.sessions).toEqual(p.sessions);
    expect(streakStatus(after, NOON)).toEqual({ ...streakStatus(p, NOON), xpToday: streakStatus(p, NOON).xpToday + 10 });
  });
});

describe('typing into a sprint', () => {
  const asked = createQuestion('addition', 1, createRandom(3)) as DrillQuestion;
  const drillWith = (value: number, marking: Marking = { mode: 'exact' }, unit = ''): DrillQuestion => ({
    ...asked,
    answer: { kind: 'numeric', value, marking, unit },
  });
  const typeAll = (question: DrillQuestion, keys: Key[], entry = ''): SprintStep => {
    let step: SprintStep = { kind: 'typing', entry };
    for (const key of keys) {
      if (step.kind !== 'typing') throw new Error(`answered before ${key}`);
      step = typeIntoSprint(SPRINT_START, question, step.entry, key);
    }
    return step;
  };

  it('takes a right exact answer on its last digit, scoring it', () => {
    const question = drillWith(42);
    expect(typeIntoSprint(SPRINT_START, question, '', '4')).toEqual({ kind: 'typing', entry: '4' });
    expect(typeIntoSprint({ score: 3, attempted: 5 }, question, '4', '2')).toEqual({
      kind: 'answered',
      tally: { score: 4, attempted: 6 },
      mark: { correct: true, expected: 42 },
    });
  });

  it('leaves a wrong number on the board, to keep typing or correct', () => {
    const question = drillWith(42);
    expect(typeAll(question, ['4', '3'])).toEqual({ kind: 'typing', entry: '43' });
    expect(typeAll(question, ['4', '3', '0'])).toEqual({ kind: 'typing', entry: '430' });
  });

  it('takes a tolerance-marked answer as soon as the number is within tolerance', () => {
    const question = drillWith(1000, { mode: 'tolerance', percent: 5 });
    expect(typeAll(question, ['9', '4'])).toEqual({ kind: 'typing', entry: '94' });
    expect(typeAll(question, ['9', '4', '0'])).toEqual({ kind: 'typing', entry: '940' });
    expect(typeAll(question, ['9', '6'], '')).toEqual({ kind: 'typing', entry: '96' });
    expect(typeAll(question, ['9', '6', '0'])).toMatchObject({ kind: 'answered', mark: { correct: true, expected: 1000 } });
  });

  it('takes a shorthand entry the moment it stands for the right number', () => {
    const question = drillWith(7_200_000);
    expect(typeAll(question, ['7', '.', '2'])).toEqual({ kind: 'typing', entry: '7.2' });
    expect(typeAll(question, ['7', '.', '2', 'm'])).toMatchObject({ kind: 'answered', tally: { score: 1, attempted: 1 }, mark: { correct: true } });
    expect(typeAll(question, ['7', '.', '2', 'k'])).toEqual({ kind: 'typing', entry: '7.2k' });
  });

  it('takes an answer when deleting leaves the right number', () => {
    const question = drillWith(42);
    expect(typeIntoSprint(SPRINT_START, question, '427', 'delete')).toMatchObject({ kind: 'answered', mark: { correct: true, expected: 42 } });
    expect(typeIntoSprint(SPRINT_START, drillWith(4_200_000), '4.2bn', 'delete')).toEqual({ kind: 'typing', entry: '4.2' });
  });

  it('reads an incomplete entry as Submit would: a lone minus is no number, a trailing point is', () => {
    expect(typeIntoSprint(SPRINT_START, drillWith(-5), '', 'negate')).toEqual({ kind: 'typing', entry: '-' });
    expect(typeIntoSprint(SPRINT_START, drillWith(0), '', 'negate')).toEqual({ kind: 'typing', entry: '-' });
    expect(typeIntoSprint(SPRINT_START, drillWith(1), '1.5', 'delete')).toMatchObject({ kind: 'answered', mark: { correct: true } });
    expect(typeIntoSprint(SPRINT_START, drillWith(-5), '-', '5')).toMatchObject({ kind: 'answered', mark: { correct: true, expected: -5 } });
  });
});

describe('skipping in a sprint', () => {
  const question = { ...createQuestion('addition', 1, createRandom(3)), answer: { kind: 'numeric', value: 42, marking: { mode: 'exact' }, unit: '' } } as DrillQuestion;

  it('counts the drill as attempted and missed, and gives the right answer', () => {
    expect(skipSprint({ score: 3, attempted: 5 }, question)).toEqual({
      kind: 'answered',
      tally: { score: 3, attempted: 6 },
      mark: { correct: false, expected: 42 },
    });
  });
});
