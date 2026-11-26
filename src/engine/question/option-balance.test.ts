import { describe, expect, it } from 'vitest';
import { createQuestion, createRandom, listSkills, listTemplates } from './index';
import type { ChoiceSkill, Question, Tier } from './index';

/**
 * Multiple choice that cannot be beaten without doing the sum: across many
 * seeds of every generated template and tier, the correct option sits in each
 * of the four positions about equally often, and numeric options are
 * plausible neighbours of the answer rather than far-off or absurd figures.
 * (Exactly one option is strictly closest, and stays so under a reasonable
 * misreading of a chart, is checked per template beside its solver.)
 */

const SEEDS = 1_500;
/** Each position's share of correct answers, as for the authored bank. */
const LEAST = 0.18;
const MOST = 0.32;
/** The nearest wrong option is never further from the correct one than this share of it. */
const WIDEST_GAP = 0.3;
/** No option is below this share of the correct one: no "$10" beside hundreds. */
const LOWEST_OPTION = 0.1;

const CHOICE_SKILLS = listSkills().flatMap((s) => (s.kind === 'drill' ? [] : [{ skill: s.skill as ChoiceSkill, tiers: s.tiers }]));

const generated = new Map<string, Question[]>();
/** Every template serves every tier of its skill; the same seeds feed both checks. */
function generate(skill: ChoiceSkill, template: string, tier: Tier): Question[] {
  const key = `${template}:${tier}`;
  if (!generated.has(key)) generated.set(key, Array.from({ length: SEEDS }, (_, i) => createQuestion(skill, tier, createRandom(i + 1), { template })));
  return generated.get(key)!;
}

/** The number in an option, or null when the option is words. */
function value(option: string): number | null {
  const match = /-?\d{1,3}(?:,\d{3})*(?:\.\d+)?|-?\d+(?:\.\d+)?/.exec(option.replace('−', '-'));
  return match ? Number(match[0].replaceAll(',', '')) : null;
}

/** Numeric options: every option is one number in the same unit (only the digits differ). */
function numericOptions(q: Question): number[] | null {
  if (q.answer.kind !== 'choice') return null;
  const shapes = new Set(q.answer.options.map((o) => o.replace(/[\d.,−-]/g, '')));
  const values = q.answer.options.map(value);
  if (shapes.size !== 1 || values.some((v) => v === null)) return null;
  return values as number[];
}

describe.each(CHOICE_SKILLS)('$skill', ({ skill, tiers }) => {
  describe.each(listTemplates(skill))('template %s', (template) => {
    it.each(tiers)('tier %i puts the correct option in each position about equally often', (tier) => {
      const questions = generate(skill, template, tier);
      const counts = [0, 0, 0, 0];
      for (const q of questions) if (q.answer.kind === 'choice') counts[q.answer.correctIndex]!++;
      const shares = counts.map((c) => c / questions.length);
      for (const share of shares) {
        expect(share, `shares ${shares.map((s) => s.toFixed(2)).join(' ')}`).toBeGreaterThanOrEqual(LEAST);
        expect(share, `shares ${shares.map((s) => s.toFixed(2)).join(' ')}`).toBeLessThanOrEqual(MOST);
      }
    });

    it.each(tiers)('tier %i offers numeric options as plausible neighbours of the answer', (tier) => {
      for (const q of generate(skill, template, tier)) {
        const values = numericOptions(q);
        const answer = q.answer;
        if (!values || answer.kind !== 'choice') continue;
        const correct = values[answer.correctIndex]!;
        const nearest = Math.min(...values.filter((_, i) => i !== answer.correctIndex).map((v) => Math.abs(v - correct)));
        const shown = `${q.id}: ${answer.options.join(' | ')}`;
        expect(nearest / correct, shown).toBeLessThanOrEqual(WIDEST_GAP);
        expect(Math.min(...values) / correct, shown).toBeGreaterThanOrEqual(LOWEST_OPTION);
      }
    });
  });
});
