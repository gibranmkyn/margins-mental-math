import type { Random } from '../random';
import type { ChoiceSkill, Question, Skill, Tier } from '../types';

/** Everything a template decides; the engine adds identity, skill, tier and source. */
export type QuestionBody = Omit<Question, 'id' | 'skill' | 'tier' | 'source'>;

/** A generated-question template: one skill, one or more tiers. */
export interface Template {
  skill: Skill;
  tiers: readonly Tier[];
  build(tier: Tier, random: Random): QuestionBody;
}

/** A scenario or chart template: one of several behind a skill, named so a question can be rebuilt from its id. */
export interface ScenarioTemplate extends Template {
  id: string;
  skill: ChoiceSkill;
}
