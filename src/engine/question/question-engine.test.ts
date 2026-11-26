import { describe, expect, it } from 'vitest';
import { createQuestion, createRandom, listSkills, markAnswer, markingFor } from './index';
import type { Question, Skill, Tier } from './index';

const SEEDS = Array.from({ length: 3000 }, (_, i) => i + 1);
const TIERS: Tier[] = [1, 2, 3];

/** Every number-looking run in owner-facing text must be a well-formed number. */
// A minus sign is "−", never a hyphen: "-3" or "5 - 2" is malformed, as is a negative zero.
const MALFORMED = /NaN|undefined|null|Infinity|\d[eE][+-]?\d|(?<![\d.,])0\d|\d,(?=\d)(?!\d{3}(?!\d))|\.\d*\.|[-−]0(?![.\d])|(?<![\w-])-\d|\d\s+-\s+[\d$(]/;

const NUMBER = String.raw`-?\d{1,3}(?:,\d{3})*(?:\.\d+)?`;

type DrillSkill = 'addition' | 'subtraction' | 'multiplication' | 'division';

/** The arithmetic each drill skill asks for, as it appears in the prompt. */
const DRILLS: Record<DrillSkill, { sign: string; apply(a: number, b: number): number }> = {
  addition: { sign: '+', apply: (a, b) => a + b },
  subtraction: { sign: '−', apply: (a, b) => a - b },
  multiplication: { sign: '×', apply: (a, b) => a * b },
  division: { sign: '÷', apply: (a, b) => a / b },
};

/** Which drills the owner should expect to estimate: long multiplication and division only. */
function expectsTolerance(skill: Skill, tier: Tier): boolean {
  return (skill === 'multiplication' || skill === 'division') && tier === 3;
}

const toNumber = (text: string) => Number(text.replaceAll(',', ''));

/**
 * Independent recomputation: read the two numbers the owner actually sees in
 * the prompt and apply the skill's operation, without touching anything the
 * engine computed.
 */
function readPrompt(skill: DrillSkill, prompt: string): { a: number; b: number; truth: number } {
  const { sign, apply } = DRILLS[skill];
  const match = new RegExp(`^(${NUMBER}) ${escape(sign)} (${NUMBER})$`).exec(prompt);
  if (!match) throw new Error(`Prompt is not a readable ${skill}: "${prompt}"`);
  const a = toNumber(match[1]!);
  const b = toNumber(match[2]!);
  return { a, b, truth: apply(a, b) };
}

function visibleText(question: Question): string[] {
  return [question.prompt, ...question.solution, question.shortcut];
}

const numeric = (value: number) => ({ kind: 'numeric' as const, value });
/** As printed: grouped, with a true minus sign. */
const shown = (value: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(value).replace('-', '−');
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const digits = (n: number) => String(Math.trunc(Math.abs(n))).length;

for (const skill of Object.keys(DRILLS) as DrillSkill[]) {
  describe(`${skill} drills`, () => {
    for (const tier of TIERS) {
      const drill = (seed: number) => createQuestion(skill, tier, createRandom(seed));
      const tolerance = expectsTolerance(skill, tier);

      describe(`tier ${tier}`, () => {
        it('give a shortcut that says something: no step that equates a number with itself', () => {
          for (const seed of SEEDS.slice(0, 300)) {
            const q = drill(seed);
            for (const [, a, b] of q.shortcut.matchAll(/(?<![\d.,/]|[+−×÷] )([\d.,]+[kmb]?n?) = ([\d.,]+[kmb]?n?)(?![\d.,/%])/g)) {
              expect(a, `seed ${seed}: ${q.shortcut}`).not.toBe(b);
            }
          }
        });

        it(`state an answer that matches the ${skill} of the numbers shown in the prompt`, () => {
          for (const seed of SEEDS) {
            const q = drill(seed);
            const { truth } = readPrompt(skill, q.prompt);
            if (tolerance) {
              // Approximate drills state the true value to the cent.
              expect(Math.abs(q.answer.value - truth), `seed ${seed}: ${q.prompt}`).toBeLessThanOrEqual(0.005 + 1e-9);
            } else {
              expect(q.answer.value, `seed ${seed}: ${q.prompt}`).toBe(truth);
              expect(Number.isInteger(q.answer.value), `seed ${seed}: ${q.prompt}`).toBe(true);
            }
          }
        });

        it('are reproduced exactly by the same seed', () => {
          for (const seed of SEEDS.slice(0, 300)) {
            expect(drill(seed)).toEqual(drill(seed));
          }
        });

        it('vary across seeds', () => {
          const prompts = new Set(SEEDS.slice(0, 200).map((seed) => drill(seed).prompt));
          expect(prompts.size).toBeGreaterThan(120);
        });

        it(`say up front that they are marked ${tolerance ? 'within 3%' : 'exactly'}`, () => {
          const expected = tolerance ? { mode: 'tolerance', percent: 3 } : { mode: 'exact' };
          expect(markingFor(skill, tier)).toEqual(expected);
          for (const seed of SEEDS.slice(0, 300)) {
            expect(drill(seed).answer.marking).toEqual(expected);
          }
        });

        if (tolerance) {
          it('accept answers inside 3% of the true value and reject answers outside it', () => {
            for (const seed of SEEDS) {
              const q = drill(seed);
              const { truth } = readPrompt(skill, q.prompt);
              const mark = (value: number) => markAnswer(q, numeric(value));
              expect(mark(truth), `seed ${seed}`).toEqual({ correct: true, expected: q.answer.value });
              for (const inside of [truth * 1.029, truth * 0.971, Math.round(truth), truth * 1.01]) {
                expect(mark(inside).correct, `seed ${seed}: ${q.prompt} ~ ${inside}`).toBe(true);
              }
              for (const outside of [truth * 1.031, truth * 0.969, truth * 1.1, truth / 10, truth * 10, -truth, 0]) {
                expect(mark(outside).correct, `seed ${seed}: ${q.prompt} ~ ${outside}`).toBe(false);
              }
            }
          });

          it('accept answers exactly on the 3% boundary and reject those just past it', () => {
            for (const seed of SEEDS) {
              const q = drill(seed);
              const stated = q.answer.value;
              const mark = (value: number) => markAnswer(q, numeric(value)).correct;
              expect(mark(stated * 1.03), `seed ${seed}`).toBe(true);
              expect(mark(stated * 0.97), `seed ${seed}`).toBe(true);
              expect(mark(stated * 1.0301), `seed ${seed}`).toBe(false);
              expect(mark(stated * 0.9699), `seed ${seed}`).toBe(false);
            }
          });

          it('end the worked solution at the exact value and the shortcut at an estimate inside 3%', () => {
            for (const seed of SEEDS) {
              const q = drill(seed);
              const { truth } = readPrompt(skill, q.prompt);
              expect(q.solution.at(-1), `seed ${seed}`).toMatch(new RegExp(`[=≈] ${escape(shown(q.answer.value))}$`));
              const estimate = new RegExp(`≈ (${NUMBER})$`).exec(q.shortcut);
              expect(estimate, `seed ${seed}: ${q.shortcut}`).not.toBeNull();
              const off = Math.abs(toNumber(estimate![1]!) - truth) / Math.abs(truth);
              expect(off, `seed ${seed}: ${q.prompt} / ${q.shortcut}`).toBeLessThanOrEqual(0.03);
            }
          });
        } else {
          it('are marked exactly: the true value is right and every near miss is wrong', () => {
            for (const seed of SEEDS) {
              const q = drill(seed);
              const { truth } = readPrompt(skill, q.prompt);
              expect(markAnswer(q, numeric(truth))).toEqual({ correct: true, expected: truth });
              for (const miss of [truth + 1, truth - 1, truth + 0.5, truth - 0.01, truth + 10, truth * 1.01 + 0.5, -truth - 1]) {
                expect(markAnswer(q, numeric(miss)).correct, `seed ${seed}: ${q.prompt} ~ ${miss}`).toBe(false);
              }
            }
          });

          it('end the worked solution and the shortcut at the stated answer', () => {
            for (const seed of SEEDS) {
              const q = drill(seed);
              const ending = new RegExp(`= ${escape(shown(readPrompt(skill, q.prompt).truth))}$`);
              expect(q.solution.length).toBeGreaterThan(0);
              expect(q.solution.at(-1), `seed ${seed}: ${q.prompt}`).toMatch(ending);
              expect(q.shortcut, `seed ${seed}: ${q.prompt}`).toMatch(ending);
            }
          });
        }

        it('never show malformed numbers', () => {
          for (const seed of SEEDS) {
            for (const text of visibleText(drill(seed))) {
              expect(text, `seed ${seed}`).not.toMatch(MALFORMED);
            }
          }
        });

        it('carry a positive target time and come from a generator', () => {
          for (const seed of SEEDS.slice(0, 100)) {
            const q = drill(seed);
            expect(q.targetTimeMs).toBeGreaterThan(0);
            expect(q.source).toBe('generated');
            expect(q.skill).toBe(skill);
            expect(q.tier).toBe(tier);
          }
        });
      });
    }

    it('use bigger numbers at each higher tier', () => {
      const sizeAt = (tier: Tier) => {
        const total = SEEDS.slice(0, 500).reduce((sum, seed) => {
          const { a, b } = readPrompt(skill, createQuestion(skill, tier, createRandom(seed)).prompt);
          return sum + digits(a) + digits(b);
        }, 0);
        return total / 500;
      };
      expect(sizeAt(2)).toBeGreaterThan(sizeAt(1));
      expect(sizeAt(3)).toBeGreaterThan(sizeAt(2));
    });
  });
}

describe('negative answers', () => {
  it('appear in hard subtraction drills but never in easier ones', () => {
    const answers = (tier: Tier) => SEEDS.slice(0, 1000).map((seed) => createQuestion('subtraction', tier, createRandom(seed)).answer.value);
    expect(answers(1).every((v) => v > 0)).toBe(true);
    expect(answers(2).every((v) => v > 0)).toBe(true);
    expect(answers(3).some((v) => v < 0)).toBe(true);
    expect(answers(3).some((v) => v > 0)).toBe(true);
  });
});

describe('skill listing', () => {
  it('lists the four core arithmetic drill skills, each in three tiers, served by generated questions', () => {
    for (const skill of ['addition', 'subtraction', 'multiplication', 'division'] as const) {
      expect(listSkills()).toContainEqual({ skill, kind: 'drill', tiers: [1, 2, 3], sources: ['generated'] });
    }
  });

  it('lists only skills that can actually produce a question at every listed tier', () => {
    for (const { skill, tiers } of listSkills()) {
      for (const tier of tiers) {
        expect(() => createQuestion(skill, tier, createRandom(7))).not.toThrow();
      }
    }
  });
});
