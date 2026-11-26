import { describe, expect, it } from 'vitest';
import { createQuestion, createRandom, listSkills, listTemplates } from '../question';
import type { Random } from '../question';
import { chooseBookletSession, chooseMock, chooseNextSession, initialProgress, nextSprintQuestion } from './index';
import { NO_BOOKLETS } from '../question/test-support/booklets';

const NOW = new Date('2026-11-25T08:00:00Z');

/**
 * A source that always draws the same number, so every question it builds is the
 * same question: the worst case for any "draw until it is new" loop, standing in for
 * a pool smaller than the request (a skill and tier with few distinct prompts, or an
 * authored bank smaller than the places to fill).
 */
const stuck: Random = { next: () => 0.5 };

describe('choosing questions always finishes, even when the pool cannot fill the request', () => {
  it('a drill session', { timeout: 2000 }, () => {
    const plan = chooseNextSession(initialProgress(), NOW, stuck, { skill: 'addition', tier: 1 });
    expect(plan.questions).toHaveLength(5);
  });

  it('a scenario session', { timeout: 2000 }, () => {
    for (const skill of ['percentages-in-context', 'growth-trends', 'bar-charts'] as const) {
      expect(chooseNextSession(initialProgress(), NOW, stuck, { skill, tier: 2 }).questions).toHaveLength(3);
    }
  });

  it('a mock', { timeout: 2000 }, () => {
    expect(chooseMock(initialProgress(), 'full', NOW, stuck).questions).toHaveLength(26);
  });

  it('the next sprint drill', { timeout: 2000 }, () => {
    const first = nextSprintQuestion('addition', stuck);
    expect(nextSprintQuestion('addition', stuck, first.prompt).skill).toBe('addition');
  });

  it.skipIf(NO_BOOKLETS)('a booklet session', { timeout: 2000 }, () => {
    expect(chooseBookletSession(initialProgress(), 'pst1', NOW, stuck).questions).toHaveLength(3);
  });
});

describe('a session draws only on templates that serve its tier', () => {
  it('lists, for each skill and tier, only templates that can build at that tier', () => {
    for (const { skill, tiers } of listSkills()) {
      for (const tier of tiers) {
        for (const template of listTemplates(skill, tier)) {
          expect(() => createQuestion(skill, tier, createRandom(1), { template }), `${template} at tier ${tier}`).not.toThrow();
        }
      }
    }
  });
});
