import { authoredFor, authoredQuestions } from './authored';
import { allBooklets, bookletFor, bookletQuestions } from './booklets';
import type { Booklet } from './booklets';
import { createRandom, randomInt, randomSeed } from './random';
import { compoundGrowth } from './templates/compound-growth';
import type { Random } from './random';
import { addition } from './templates/addition';
import { division } from './templates/division';
import { fractionConversions } from './templates/fraction-conversions';
import { largeNumbers } from './templates/large-numbers';
import { multiplication } from './templates/multiplication';
import { percentageChange } from './templates/percentage-change';
import { percentages } from './templates/percentages';
import { chartTemplates } from './templates/chart';
import { scenarioTemplates } from './templates/scenario';
import { subtraction } from './templates/subtraction';
import type { ScenarioTemplate, Template } from './templates/template';
import { weightedAverage } from './templates/weighted-average';
import type { ChartSkill, ChoiceSkill, DrillQuestion, DrillSkill, Marking, Question, QuestionSource, ScenarioSkill, Skill, Tier } from './types';

export { createRandom, randomInt, randomSeed, shuffle } from './random';
export type { Random } from './random';
export type * from './types';
export type { Booklet } from './booklets';

const templates: Record<DrillSkill, Template> = {
  addition,
  subtraction,
  multiplication,
  division,
  percentages,
  'large-numbers': largeNumbers,
  'compound-growth': compoundGrowth,
  'fraction-conversions': fractionConversions,
  'percentage-change': percentageChange,
  'weighted-average': weightedAverage,
};

/** Scenario and chart templates together: every multiple-choice skill. */
const choiceTemplates: Record<ChoiceSkill, ScenarioTemplate[]> = { ...scenarioTemplates, ...chartTemplates };

/** Drills are typed; scenario and chart questions are multiple choice. */
export type SkillInfo =
  | { skill: DrillSkill; kind: 'drill'; tiers: Tier[]; sources: QuestionSource[] }
  | { skill: ScenarioSkill; kind: 'scenario'; tiers: Tier[]; sources: QuestionSource[] }
  | { skill: ChartSkill; kind: 'chart'; tiers: Tier[]; sources: QuestionSource[] };

/** Every skill the engine can serve, with its tiers and the sources behind it. */
export function listSkills(): SkillInfo[] {
  const drills: SkillInfo[] = (Object.keys(templates) as DrillSkill[]).map((skill) => ({
    skill,
    kind: 'drill',
    tiers: [...templates[skill].tiers],
    sources: ['generated'],
  }));
  const scenarios: SkillInfo[] = scenarioSkills().flatMap((skill) => {
    const tiers = ([1, 2, 3] as const).filter(
      (tier) => hasGenerated(skill, tier) || authoredFor(skill, tier).length > 0 || bookletFor(skill, tier).length > 0,
    );
    const sources: QuestionSource[] = [
      ...(scenarioTemplates[skill].length > 0 ? (['generated'] as const) : []),
      ...(authoredQuestions().some((q) => q.skill === skill) ? (['authored'] as const) : []),
      ...(bookletQuestions().some((q) => q.skill === skill) ? (['booklet'] as const) : []),
    ];
    return tiers.length > 0 ? [{ skill, kind: 'scenario' as const, tiers, sources }] : [];
  });
  const charts: SkillInfo[] = (Object.keys(chartTemplates) as ChartSkill[]).map((skill) => ({
    skill,
    kind: 'chart',
    tiers: ([1, 2, 3] as const).filter((tier) => hasGenerated(skill, tier)),
    sources: ['generated'],
  }));
  return [...drills, ...scenarios, ...charts];
}

/**
 * The names of the templates behind a skill, or only those serving one tier.
 * A drill skill has one template, named after the skill.
 */
export function listTemplates(skill: Skill, tier?: Tier): string[] {
  if (!isScenarioSkill(skill)) return tier === undefined || templates[skill].tiers.includes(tier) ? [skill] : [];
  return choiceTemplates[skill].filter((t) => tier === undefined || t.tiers.includes(tier)).map((t) => t.id);
}

export interface QuestionChoice {
  /** Build from this template rather than one picked at random. */
  template?: string;
  /**
   * Generated (the default where the skill has templates at that tier) or
   * authored: one of the bank's fixed questions for the skill and tier; or
   * booklet: one of the booklet questions for the skill and tier.
   */
  source?: 'generated' | 'authored' | 'booklet';
}

/** Every authored question in the bank, with its fixed wording, numbers and options. */
export function listAuthoredQuestions(): readonly Question[] {
  return authoredQuestions();
}

/** The owner's booklets, each with the questions it serves so far, in booklet order. None when the private booklet files are absent. */
export function listBooklets(): readonly Booklet[] {
  return allBooklets();
}

/** True when the private booklet files (content/booklets) are present: false in a public checkout, which serves no booklet questions. */
export { hasBooklets } from './booklets';

/** Every booklet question the engine serves, labelled with its booklet, case and original number. */
export function listBookletQuestions(): readonly Question[] {
  return bookletQuestions();
}

/**
 * Produce a question for a skill and tier. The supplied random source only
 * picks a seed; the question is built from that seed alone, so its id is
 * enough to rebuild it.
 */
export function createQuestion(skill: DrillSkill, tier: Tier, random: Random, choice?: QuestionChoice): DrillQuestion;
export function createQuestion(skill: Skill, tier: Tier, random: Random, choice?: QuestionChoice): Question;
export function createQuestion(skill: Skill, tier: Tier, random: Random, choice: QuestionChoice = {}): Question {
  if (isScenarioSkill(skill)) return createScenarioQuestion(skill, tier, random, choice);
  const template = templates[skill];
  if (!template.tiers.includes(tier)) {
    throw new Error(`No tier ${tier} for ${skill}`);
  }
  const seed = randomSeed(random);
  const body = template.build(tier, createRandom(seed));
  return { id: `${skill}-t${tier}-${seed}`, skill, tier, source: 'generated', ...body };
}

/**
 * Scenario and chart questions come from one of several templates; the template's name
 * goes into the id beside the seed, so the id still rebuilds the question.
 * Scenario skills may also draw on the authored bank; chart skills are generated only.
 */
function createScenarioQuestion(skill: ChoiceSkill, tier: Tier, random: Random, choice: QuestionChoice): Question {
  if (choice.source === 'booklet') {
    const booklet = isChartSkill(skill) ? [] : bookletFor(skill, tier);
    if (booklet.length === 0) throw new Error(`No booklet question for ${skill} at tier ${tier}`);
    return booklet[randomInt(random, 0, booklet.length - 1)]!;
  }
  if (!isChartSkill(skill) && (choice.source === 'authored' || (!choice.template && !hasGenerated(skill, tier)))) {
    const bank = authoredFor(skill, tier);
    if (bank.length === 0) throw new Error(`No authored question for ${skill} at tier ${tier}`);
    return bank[randomInt(random, 0, bank.length - 1)]!;
  }
  const candidates = choiceTemplates[skill].filter((t) => t.tiers.includes(tier));
  const template: ScenarioTemplate | undefined = choice.template
    ? candidates.find((t) => t.id === choice.template)
    : candidates[randomInt(random, 0, candidates.length - 1)];
  if (!template) throw new Error(`No template ${choice.template ?? ''} for ${skill} at tier ${tier}`);
  const seed = randomSeed(random);
  const body = template.build(tier, createRandom(seed));
  return { id: `${template.id}-t${tier}-${seed}`, skill, tier, source: 'generated', ...body };
}

/** The question a missed one returns as: what a retry needs to know about it. */
export type MissedQuestion = Pick<Question, 'id' | 'skill' | 'tier' | 'source'>;

/**
 * The question a retry brings back. A booklet or authored question returns as the
 * very same question; a generated one as a fresh question from the same template
 * and tier, built from the supplied random source.
 */
export function retryQuestion(missed: MissedQuestion, random: Random): Question {
  if (missed.source !== 'generated') {
    const fixed = (missed.source === 'booklet' ? bookletQuestions() : authoredQuestions()).find((q) => q.id === missed.id);
    if (!fixed) throw new Error(`No ${missed.source} question ${missed.id}`);
    return fixed;
  }
  // A generated question's id is `<template>-t<tier>-<seed>`.
  const template = missed.id.replace(/-t\d-\d+$/, '');
  return createQuestion(missed.skill, missed.tier, random, { template });
}

function hasGenerated(skill: ChoiceSkill, tier: Tier): boolean {
  return choiceTemplates[skill].some((t) => t.tiers.includes(tier));
}

function scenarioSkills(): ScenarioSkill[] {
  return Object.keys(scenarioTemplates) as ScenarioSkill[];
}

/**
 * Answered by choosing an option in a 3-question session: a scenario skill, or a
 * chart skill (a chart question is a scenario question whose data is a chart).
 */
export function isScenarioSkill(skill: Skill): skill is ChoiceSkill {
  return skill in choiceTemplates;
}

export function isChartSkill(skill: Skill): skill is ChartSkill {
  return skill in chartTemplates;
}

/** A drill is answered by typing a number. */
export function isDrillQuestion(question: Question): question is DrillQuestion {
  return question.answer.kind === 'numeric' && !isScenarioSkill(question.skill);
}

/**
 * How answers in a drill skill and tier are marked, so the owner can be told before
 * starting. Every question a template builds at one tier is marked the same way.
 */
export function markingFor(skill: DrillSkill, tier: Tier): Marking {
  return createQuestion(skill, tier, createRandom(0)).answer.marking;
}

export { markAnswer } from './marking';
export { formatNumber, formatShort } from './format';
export { ENTRY_SUFFIX, readEntry } from './entry';
export type { EntrySuffix } from './entry';
export { pressKey } from './keys';
export type { Key } from './keys';
