import type { ContextBlock, Question, ScenarioSkill, Tier } from './types';

/**
 * The authored bank: original one-off scenario questions with fixed wording and
 * numbers, kept as content in `content/authored/<skill>.json`. Each entry also
 * carries the data and calculation that reproduce its answer; only the content
 * tests read those, so they are not part of the question.
 */
interface AuthoredEntry {
  id: string;
  skill: ScenarioSkill;
  tier: Tier;
  targetTimeMs?: number;
  context: ContextBlock[];
  prompt: string;
  options: string[];
  correctIndex: number;
  solution: string[];
  shortcut: string;
  /** The id of the booklet question this one is modelled on, if stated. */
  modelledOn?: string;
}

/** Expected time by tier when an entry does not state its own, matching the scenario templates. */
const TARGET_TIME_MS: Record<Tier, number> = { 1: 60_000, 2: 90_000, 3: 120_000 };

const files = import.meta.glob<AuthoredEntry[]>('../../../content/authored/*.json', { eager: true, import: 'default' });

const bank: Question[] = Object.keys(files)
  .sort()
  .flatMap((path) => files[path]!)
  .map(toQuestion);

function toQuestion(entry: AuthoredEntry): Question {
  return {
    id: entry.id,
    skill: entry.skill,
    tier: entry.tier,
    source: 'authored',
    targetTimeMs: entry.targetTimeMs ?? TARGET_TIME_MS[entry.tier],
    prompt: entry.prompt,
    context: entry.context,
    answer: { kind: 'choice', options: entry.options, correctIndex: entry.correctIndex },
    solution: entry.solution,
    shortcut: entry.shortcut,
    ...(entry.modelledOn !== undefined && { modelledOn: entry.modelledOn }),
  };
}

/** Every authored question, in a stable order. */
export function authoredQuestions(): readonly Question[] {
  return bank;
}

/** The authored questions for one scenario skill and tier. */
export function authoredFor(skill: ScenarioSkill, tier: Tier): Question[] {
  return bank.filter((q) => q.skill === skill && q.tier === tier);
}
