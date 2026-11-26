import { describe, expect, it } from 'vitest';
import { createQuestion, createRandom, listSkills, markAnswer, markingFor } from './index';
import type { DrillSkill, Question, Tier } from './index';

/**
 * Property tests for the six case-math drill skills. Each question is
 * recomputed independently from the numbers the owner sees in the prompt.
 */

const SEEDS = Array.from({ length: 3000 }, (_, i) => i + 1);
const TIERS: Tier[] = [1, 2, 3];

/** Every number-looking run in owner-facing text must be a well-formed number. */
// A minus sign is "−", never a hyphen: "-3" or "5 - 2" is malformed, as is a negative zero.
const MALFORMED = /NaN|undefined|null|Infinity|\d[eE][+-]?\d|(?<![\d.,])0\d|\d,(?=\d)(?!\d{3}(?!\d))|\.\d*\.|[-−]0(?![.\d])|(?<![\w-])-\d|\d\s+-\s+[\d$(]/;

/** A number as shown: grouped with commas, optional decimals. */
const N = String.raw`\d{1,3}(?:,\d{3})*(?:\.\d+)?`;
/** A number that may carry magnitude shorthand: 4.8bn, 60k, 1,200. */
const S = String.raw`${N}(?:k|m|bn)?`;
const ZEROS: Record<string, number> = { '': 0, k: 3, m: 6, bn: 9 };

/** Reads a number as shown in a prompt, shorthand included. */
function num(text: string): number {
  const match = /^(.*?)(k|m|bn)?$/.exec(text.replaceAll(',', '').replace('−', '-'))!;
  return Number(match[1]) * 10 ** ZEROS[match[2] ?? '']!;
}

type Unit = '' | '%';
type Reading = { truth: number; unit: Unit };
type MarkingKind = 'exact' | 'tolerance';

interface SkillSpec {
  /** How the spec says each tier is marked. */
  marking: Record<Tier, MarkingKind>;
  /** Recompute the answer from the prompt alone. Throws if the prompt is unreadable. */
  read(prompt: string): Reading;
}

function reader(patterns: Array<[RegExp, (m: string[]) => Reading]>) {
  return (prompt: string): Reading => {
    for (const [pattern, compute] of patterns) {
      const match = pattern.exec(prompt);
      if (match) return compute(match.slice(1));
    }
    throw new Error(`Unreadable prompt: "${prompt}"`);
  };
}

const re = (source: string) => new RegExp(`^${source}$`);

const SKILLS: Partial<Record<DrillSkill, SkillSpec>> = {
  percentages: {
    marking: { 1: 'exact', 2: 'exact', 3: 'exact' },
    read: reader([
      [re(`(${N})% of (${S})`), ([p, n]) => ({ truth: (num(p!) * num(n!)) / 100, unit: '' })],
      [re(`(${S}) as % of (${S})`), ([a, b]) => ({ truth: (num(a!) / num(b!)) * 100, unit: '%' })],
    ]),
  },
  'large-numbers': {
    marking: { 1: 'exact', 2: 'exact', 3: 'exact' },
    read: reader([
      [re(`(${S}) × (${S})`), ([a, b]) => ({ truth: num(a!) * num(b!), unit: '' })],
      [re(`(${S}) ÷ (${S})`), ([a, b]) => ({ truth: num(a!) / num(b!), unit: '' })],
    ]),
  },
  'compound-growth': {
    marking: { 1: 'tolerance', 2: 'tolerance', 3: 'tolerance' },
    read: reader([
      [
        re(`(${S}) at (${N})% for (${N}) yrs`),
        ([base, rate, years]) => ({ truth: num(base!) * (1 + num(rate!) / 100) ** num(years!), unit: '' }),
      ],
      [
        re(`CAGR (${S}) → (${S}), (${N}) yrs`),
        ([start, end, years]) => ({ truth: ((num(end!) / num(start!)) ** (1 / num(years!)) - 1) * 100, unit: '%' }),
      ],
    ]),
  },
  'fraction-conversions': {
    marking: { 1: 'exact', 2: 'exact', 3: 'tolerance' },
    read: reader([
      [re(`(${N})/(${N}) as %`), ([top, bottom]) => ({ truth: (num(top!) / num(bottom!)) * 100, unit: '%' })],
      [re(String.raw`(${N})% = \?/(${N})`), ([p, bottom]) => ({ truth: (num(p!) / 100) * num(bottom!), unit: '' })],
    ]),
  },
  'percentage-change': {
    marking: { 1: 'exact', 2: 'exact', 3: 'tolerance' },
    read: reader([
      [re(`(${S}) → (${S}), % change`), ([from, to]) => ({ truth: ((num(to!) - num(from!)) / num(from!)) * 100, unit: '%' })],
      [
        re(`(Rose|Fell) (${N})% to (${S})\\. Before\\?`),
        ([way, p, after]) => ({ truth: num(after!) / (1 + ((way === 'Rose' ? 1 : -1) * num(p!)) / 100), unit: '' }),
      ],
    ]),
  },
  'weighted-average': {
    marking: { 1: 'exact', 2: 'exact', 3: 'tolerance' },
    read: reader([
      [re(`(${N}%? at ${N}(?:, ${N}%? at ${N})+)`), ([groups]) => ({ truth: weightedAverage(groups!), unit: '' })],
      [
        re(`(${N}) and (${N}) average (${N})\\. % at (${N})\\?`),
        ([low, high, avg, asked]) => {
          if (asked !== high) throw new Error(`Mix asks for the share of ${asked}, not of ${high}`);
          return { truth: ((num(avg!) - num(low!)) / (num(high!) - num(low!))) * 100, unit: '%' };
        },
      ],
    ]),
  },
};

/** "60% at 10, 40% at 20" or "2 at 5, 3 at 8": weights then values. Percentage shares must add to 100. */
function weightedAverage(groups: string): number {
  const parsed = groups.split(', ').map((group) => {
    const [, weight, percent, value] = new RegExp(`^(${N})(%?) at (${N})$`).exec(group)!;
    return { weight: num(weight!), percent: percent === '%', value: num(value!) };
  });
  const total = parsed.reduce((sum, g) => sum + g.weight, 0);
  if (parsed.some((g) => g.percent) && !close(total, 100)) throw new Error(`Shares add to ${total}%: "${groups}"`);
  return parsed.reduce((sum, g) => sum + g.weight * g.value, 0) / total;
}

const numeric = (value: number) => ({ kind: 'numeric' as const, value });
/** As printed: grouped, with a true minus sign. */
const shown = (value: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(value).replace('-', '−');
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
const visibleText = (q: Question) => [q.prompt, ...q.solution, q.shortcut];

for (const [skill, spec] of Object.entries(SKILLS) as Array<[DrillSkill, SkillSpec]>) {
  describe(`${skill} drills`, () => {
    for (const tier of TIERS) {
      const drill = (seed: number) => createQuestion(skill, tier, createRandom(seed));
      const tolerance = spec.marking[tier] === 'tolerance';

      describe(`tier ${tier}`, () => {
        it('state an answer that matches the numbers shown in the prompt, in the unit the prompt asks for', () => {
          for (const seed of SEEDS) {
            const q = drill(seed);
            const { truth, unit } = spec.read(q.prompt);
            expect(q.answer.unit, `seed ${seed}: ${q.prompt}`).toBe(unit);
            if (tolerance) {
              // Approximate drills state the true value to two decimal places.
              expect(Math.abs(q.answer.value - truth), `seed ${seed}: ${q.prompt}`).toBeLessThanOrEqual(0.005 + 1e-9);
            } else {
              expect(close(q.answer.value, truth), `seed ${seed}: ${q.prompt} = ${truth}, stated ${q.answer.value}`).toBe(true);
              // An exact answer must be typeable: at most two decimal places.
              expect(close(q.answer.value * 100, Math.round(q.answer.value * 100)), `seed ${seed}: ${q.prompt}`).toBe(true);
            }
          }
        });

        it('give a shortcut that says something: no step that equates a number with itself', () => {
          for (const seed of SEEDS.slice(0, 300)) {
            const q = drill(seed);
            for (const [, a, b] of q.shortcut.matchAll(/(?<![\d.,/]|[+−×÷] )([\d.,]+[kmb]?n?) = ([\d.,]+[kmb]?n?)(?![\d.,/%])/g)) {
              expect(a, `seed ${seed}: ${q.shortcut}`).not.toBe(b);
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
          expect(prompts.size).toBeGreaterThan(20);
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
              const { truth } = spec.read(q.prompt);
              const mark = (value: number) => markAnswer(q, numeric(value));
              expect(mark(truth), `seed ${seed}`).toEqual({ correct: true, expected: q.answer.value });
              // Stated values are rounded to two decimals, which moves small percentages by up
              // to 0.2%; probes keep that far from the 3% line. The boundary itself is checked
              // exactly against the stated value below.
              for (const inside of [truth * 1.028, truth * 0.972, truth * 1.01]) {
                expect(mark(inside).correct, `seed ${seed}: ${q.prompt} ~ ${inside}`).toBe(true);
              }
              for (const outside of [truth * 1.032, truth * 0.968, truth * 1.1, truth / 10, truth * 10, -truth, 0]) {
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

          it('end the worked solution at the stated value and the shortcut at an estimate inside 3%', () => {
            for (const seed of SEEDS) {
              const q = drill(seed);
              const { truth } = spec.read(q.prompt);
              const unit = escape(q.answer.unit);
              expect(q.solution.at(-1), `seed ${seed}`).toMatch(new RegExp(`[=≈] ${escape(shown(q.answer.value))}${unit}$`));
              const estimate = new RegExp(`≈ (−?${N})${unit}$`).exec(q.shortcut);
              expect(estimate, `seed ${seed}: ${q.shortcut}`).not.toBeNull();
              const off = Math.abs(num(estimate![1]!) - truth) / Math.abs(truth);
              expect(off, `seed ${seed}: ${q.prompt} / ${q.shortcut}`).toBeLessThanOrEqual(0.03);
            }
          });
        } else {
          it('are marked exactly: the true value is right and every near miss is wrong', () => {
            for (const seed of SEEDS) {
              const q = drill(seed);
              const { truth } = spec.read(q.prompt);
              expect(markAnswer(q, numeric(truth)).correct, `seed ${seed}: ${q.prompt}`).toBe(true);
              for (const miss of [truth + 1, truth - 1, truth + 0.5, truth - 0.01, truth + 10, truth + Math.abs(truth) * 0.01 + 0.5, -truth - 1]) {
                expect(markAnswer(q, numeric(miss)).correct, `seed ${seed}: ${q.prompt} ~ ${miss}`).toBe(false);
              }
            }
          });

          it('end the worked solution and the shortcut at the stated answer', () => {
            for (const seed of SEEDS) {
              const q = drill(seed);
              const ending = new RegExp(`= ${escape(shown(q.answer.value))}${escape(q.answer.unit)}$`);
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
  });
}

describe('drill target times', () => {
  it('give each harder tier more time than the one below', () => {
    for (const { skill } of listSkills().filter((s) => s.kind === 'drill')) {
      const longest = (tier: Tier) => Math.max(...SEEDS.slice(0, 200).map((seed) => createQuestion(skill, tier, createRandom(seed)).targetTimeMs));
      const shortest = (tier: Tier) => Math.min(...SEEDS.slice(0, 200).map((seed) => createQuestion(skill, tier, createRandom(seed)).targetTimeMs));
      expect(shortest(2), `${skill} tier 2 against tier 1`).toBeGreaterThan(longest(1));
      expect(shortest(3), `${skill} tier 3 against tier 2`).toBeGreaterThan(longest(2));
    }
  });
});

describe('skill listing', () => {
  it('lists all ten drill skills, each in three tiers, served by generated questions', () => {
    const drills = listSkills().filter((s) => s.kind === 'drill');
    expect(drills.map((s) => s.skill).sort()).toEqual(
      [
        'addition',
        'subtraction',
        'multiplication',
        'division',
        'percentages',
        'large-numbers',
        'compound-growth',
        'fraction-conversions',
        'percentage-change',
        'weighted-average',
      ].sort(),
    );
    for (const info of drills) {
      expect(info).toMatchObject({ tiers: [1, 2, 3], sources: ['generated'] });
    }
  });
});

/** The numbers written in a shortcut, as printed. */
const numbersIn = (text: string) => [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => m[0]);
const decimalsOf = (printed: string) => printed.split('.')[1]?.length ?? 0;

describe('drill shortcuts are mental arithmetic', () => {
  const sample = (skill: DrillSkill, tier: Tier) => SEEDS.slice(0, 400).map((seed) => createQuestion(skill, tier, createRandom(seed)));

  it('compound growth: a whole-percent uplift and a whole-number estimate', () => {
    for (const tier of [1, 2] as Tier[]) {
      for (const q of sample('compound-growth', tier)) {
        for (const n of numbersIn(q.shortcut)) expect(decimalsOf(n), `${q.prompt}: ${q.shortcut}`).toBe(0);
      }
    }
  });

  it('percentage change: estimates to at most one decimal place, never a four-digit multiplier', () => {
    for (const q of sample('percentage-change', 3)) {
      for (const n of numbersIn(q.shortcut)) expect(decimalsOf(n), `${q.prompt}: ${q.shortcut}`).toBeLessThanOrEqual(1);
      expect(q.shortcut, q.prompt).not.toMatch(/% back/);
    }
  });

  it('division: halving stops at the first one-digit divisor, at most two halvings', () => {
    for (const tier of [1, 2] as Tier[]) {
      for (const q of sample('division', tier)) {
        const divisions = [...q.shortcut.matchAll(/÷ (\d+)/g)].map((m) => Number(m[1]));
        expect(divisions.length, q.shortcut).toBeLessThanOrEqual(3);
        expect(divisions.slice(0, -1).every((d) => d >= 10), q.shortcut).toBe(true);
      }
    }
  });

  it('weighted average of three groups: measured from the lowest value, so every gap adds', () => {
    for (const q of sample('weighted-average', 2)) {
      const values = [...q.prompt.matchAll(/\d+ at (\d+)/g)].map((m) => Number(m[1]));
      if (values.length !== 3) continue;
      expect(q.shortcut, q.prompt).toMatch(new RegExp(`^Measure from ${Math.min(...values)}:`));
      expect(q.shortcut, q.prompt).not.toMatch(/−/);
    }
  });
});
