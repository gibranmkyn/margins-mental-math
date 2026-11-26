import { describe, expect, it } from 'vitest';
import { createRandom, listSkills, markAnswer } from '../question';
import type { ChartSkill, Question, ScenarioSkill } from '../question';
import { applyEvent, chooseNextSession, initialProgress, totals } from './index';
import type { Progress } from './index';

const EVENING = new Date('2026-11-24T19:30:00Z');
const SCENARIO_SKILLS: ScenarioSkill[] = [
  'break-even-payback',
  'percentages-in-context',
  'growth-trends',
  'unit-economics',
  'ratios-comparisons',
  'averages-mixes',
  'building-formulas',
  'testing-statements',
  'expected-value',
];
const CHART_SKILLS: ChartSkill[] = ['bar-charts', 'stacked-bar-charts', 'line-charts', 'pie-charts', 'cumulative-charts', 'waterfall-charts'];

/** Pick an option the way the scenario screen does: the right one, or the one after it. */
function choose(progress: Progress, sessionId: string, question: Question, right: boolean, timeMs: number) {
  if (question.answer.kind !== 'choice') throw new Error('Scenario question expected');
  const { correctIndex, options } = question.answer;
  const index = right ? correctIndex : (correctIndex + 1) % options.length;
  const mark = markAnswer(question, { kind: 'choice', index });
  return applyEvent(progress, { type: 'answer-recorded', sessionId, question, correct: mark.correct, timeMs }, EVENING);
}

describe('scenario sessions', () => {
  it.each(SCENARIO_SKILLS)('a %s session is exactly 3 different multiple-choice questions in that skill', (skill) => {
    for (let seed = 1; seed <= 50; seed++) {
      const plan = chooseNextSession(initialProgress(), EVENING, createRandom(seed), { skill, tier: 1 });
      expect(plan.kind).toBe('scenario');
      expect(plan.skill).toBe(skill);
      expect(plan.questions).toHaveLength(3);
      expect(new Set(plan.questions.map((q) => q.id)).size).toBe(3);
      for (const q of plan.questions) {
        expect(q.skill).toBe(skill);
        expect(q.answer.kind).toBe('choice');
      }
    }
  });

  it.each(CHART_SKILLS)('a %s session is 3 different chart questions, run as a scenario session', (skill) => {
    for (let seed = 1; seed <= 50; seed++) {
      const plan = chooseNextSession(initialProgress(), EVENING, createRandom(seed), { skill, tier: 2 });
      expect(plan.kind).toBe('scenario');
      expect(plan.questions).toHaveLength(3);
      expect(new Set(plan.questions.map((q) => q.id)).size).toBe(3);
      for (const q of plan.questions) {
        expect(q.skill).toBe(skill);
        expect(q.answer.kind).toBe('choice');
        expect(q.context.some((block) => block.type === 'chart')).toBe(true);
      }
    }
  });

  it('records a finished chart session under its chart skill', () => {
    const plan = chooseNextSession(initialProgress(), EVENING, createRandom(9), { skill: 'pie-charts', tier: 1 });
    let progress = initialProgress();
    plan.questions.forEach((q, i) => {
      progress = choose(progress, plan.id, q, i !== 1, 40_000).progress;
    });
    const finished = applyEvent(progress, { type: 'session-finished', sessionId: plan.id }, EVENING);
    expect(finished.happened).toContainEqual(expect.objectContaining({ kind: 'session-finished', score: 2, total: 3 }));
    expect(finished.progress.sessions.at(-1)).toMatchObject({ kind: 'scenario', skill: 'pie-charts' });
  });

  it.each(SCENARIO_SKILLS)('spreads the generated questions in a %s session across different templates', (skill) => {
    for (let seed = 1; seed <= 30; seed++) {
      const plan = chooseNextSession(initialProgress(), EVENING, createRandom(seed), { skill, tier: 2 });
      const templates = plan.questions.filter((q) => q.source === 'generated').map((q) => q.id.replace(/-t[123]-\d+$/, ''));
      expect(new Set(templates).size).toBe(templates.length);
    }
  });

  it('mixes authored and generated questions in every session of a skill that has both', () => {
    const mixed = listSkills().filter((s) => s.kind === 'scenario' && s.sources.includes('authored') && s.sources.includes('generated'));
    expect(mixed.length).toBeGreaterThan(0);
    for (const { skill, tiers } of mixed) {
      for (const tier of tiers) {
        const authoredCounts = new Set<number>();
        for (let seed = 1; seed <= 40; seed++) {
          const plan = chooseNextSession(initialProgress(), EVENING, createRandom(seed), { skill, tier });
          const sources = plan.questions.map((q) => q.source);
          expect(sources, `${skill} tier ${tier}`).toContain('authored');
          expect(sources, `${skill} tier ${tier}`).toContain('generated');
          for (const q of plan.questions) expect(q).toMatchObject({ skill, tier });
          authoredCounts.add(sources.filter((source) => source === 'authored').length);
        }
        // Sometimes one authored question, sometimes two.
        expect([...authoredCounts].sort(), `${skill} tier ${tier}`).toEqual([1, 2]);
      }
    }
  });

  it('fills a session from the authored bank alone for a skill with no templates, never repeating a question', () => {
    const authoredOnly = listSkills().filter((s) => s.kind === 'scenario' && s.sources.length === 1 && s.sources[0] === 'authored');
    for (const { skill, tiers } of authoredOnly) {
      for (const tier of tiers) {
        for (let seed = 1; seed <= 40; seed++) {
          const plan = chooseNextSession(initialProgress(), EVENING, createRandom(seed), { skill, tier });
          expect(plan.kind).toBe('scenario');
          expect(plan.questions).toHaveLength(3);
          expect(new Set(plan.questions.map((q) => q.id)).size).toBe(3);
          for (const q of plan.questions) expect(q).toMatchObject({ skill, tier, source: 'authored' });
        }
      }
    }
  });

  it('places authored questions at different points in the session', () => {
    const positions = new Set<number>();
    for (let seed = 1; seed <= 60; seed++) {
      const plan = chooseNextSession(initialProgress(), EVENING, createRandom(seed), { skill: 'percentages-in-context', tier: 1 });
      plan.questions.forEach((q, i) => q.source === 'authored' && positions.add(i));
    }
    expect([...positions].sort()).toEqual([0, 1, 2]);
  });

  it('reports score and time when finished, and records the session as a scenario session', () => {
    const plan = chooseNextSession(initialProgress(), EVENING, createRandom(4), { skill: 'percentages-in-context', tier: 1 });
    let progress = initialProgress();
    const outcomes: Array<[boolean, number]> = [
      [true, 61_000],
      [false, 95_000],
      [true, 48_000],
    ];
    plan.questions.forEach((question, i) => {
      const [right, ms] = outcomes[i]!;
      progress = choose(progress, plan.id, question, right, ms).progress;
    });

    const finished = applyEvent(progress, { type: 'session-finished', sessionId: plan.id }, EVENING);

    expect(finished.happened).toContainEqual(expect.objectContaining({ kind: 'session-finished', score: 2, total: 3, timeMs: 204_000 }));
    expect(totals(finished.progress)).toMatchObject({ answered: 3, correct: 2, sessionsFinished: 1 });
    expect(finished.progress.sessions.at(-1)).toMatchObject({ kind: 'scenario', skill: 'percentages-in-context' });
  });

  it('still records drill sessions as drill sessions', () => {
    const plan = chooseNextSession(initialProgress(), EVENING, createRandom(5));
    let progress = initialProgress();
    for (const question of plan.questions) {
      if (question.answer.kind !== 'numeric') throw new Error('Drill expected');
      const mark = markAnswer(question, { kind: 'numeric', value: question.answer.value });
      progress = applyEvent(progress, { type: 'answer-recorded', sessionId: plan.id, question, correct: mark.correct, timeMs: 5_000 }, EVENING).progress;
    }
    const finished = applyEvent(progress, { type: 'session-finished', sessionId: plan.id }, EVENING);
    expect(finished.progress.sessions.at(-1)).toMatchObject({ kind: 'drill', skill: 'addition' });
  });
});
