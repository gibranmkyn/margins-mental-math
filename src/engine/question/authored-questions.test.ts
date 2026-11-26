import { describe, expect, it } from 'vitest';
import { createQuestion, createRandom, listAuthoredQuestions, listSkills } from './index';
import type { ScenarioSkill, Tier } from './index';

const TIERS: Tier[] = [1, 2, 3];

function scenarioSkills(): ScenarioSkill[] {
  return listSkills().flatMap((s) => (s.kind === 'scenario' ? [s.skill] : []));
}

describe('authored questions through the question engine', () => {
  it('are served on request for a scenario skill and tier, as fixed multiple-choice questions', () => {
    for (const skill of scenarioSkills()) {
      for (const tier of TIERS) {
        const ids = new Set<string>();
        for (let seed = 1; seed <= 60; seed++) {
          const q = createQuestion(skill, tier, createRandom(seed), { source: 'authored' });
          expect(q).toMatchObject({ skill, tier, source: 'authored' });
          expect(q.answer.kind).toBe('choice');
          // Fixed wording: the same id always means the same question.
          expect(listAuthoredQuestions().find((a) => a.id === q.id)).toEqual(q);
          ids.add(q.id);
        }
        expect(ids.size, `${skill} tier ${tier}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('are listed as a source of every scenario skill', () => {
    for (const info of listSkills()) {
      if (info.kind === 'scenario') expect(info.sources, info.skill).toContain('authored');
    }
  });
});
