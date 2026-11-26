import { createQuestion, listAuthoredQuestions, listBookletQuestions, listSkills, listTemplates, randomInt, randomSeed, shuffle } from '../question';
import type { ChoiceSkill, Question, Random, Tier } from '../question';
import { correctQuestionIds } from './history';
import { drawNew } from './lengths';
import { answeredToday, fits, noSiblingOf, preferring } from './siblings';
import type { Kin } from './siblings';
import type { MockLength, MockRecord, Progress } from './types';

/** 10 questions in 20 minutes, or 26 in 55: roughly two minutes a question. */
export const MOCK_LENGTHS: Record<MockLength, { questions: number; minutes: number }> = {
  short: { questions: 10, minutes: 20 },
  full: { questions: 26, minutes: 55 },
};

/** A mock is passed with 70% or more of its questions correct. */
export const MOCK_PASS_PERCENT = 70;

/** Correct answers as a whole percentage, rounded down. */
export function mockPercent(correct: number, total: number): number {
  return total === 0 ? 0 : Math.floor((correct * 100) / total);
}

/** Passed at 70% or more, compared exactly: 18 of 26 (69.2%) fails, 7 of 10 passes. */
export function mockPassed(correct: number, total: number): boolean {
  return total > 0 && correct * 100 >= total * MOCK_PASS_PERCENT;
}

/** The clock ran out: the mock used all its time and was submitted at zero (by the clock, or on coming back after it). */
export function mockTimedOut(mock: Pick<MockRecord, 'length' | 'timeMs'>): boolean {
  return mock.timeMs >= MOCK_LENGTHS[mock.length].minutes * 60_000;
}

/** A mock ready to sit: its questions in order and the time allowed. */
export interface MockPlan {
  id: string;
  length: MockLength;
  questions: Question[];
  timeLimitMs: number;
}

/** How many of a mock's questions come from the booklets, and how many are generated or authored. */
export interface MockMix {
  booklet: number;
  other: number;
  /** The booklet share aimed for: half the mock, rounded down. Fewer booklet questions means too few are still open. */
  half: number;
}

/**
 * Generated and authored mock questions are drawn at tiers 2 and 3, the level of
 * the booklets' screening tests; a skill without those tiers uses what it has.
 */
const MOCK_TIERS: Tier[] = [2, 3];

/** Every booklet question not yet answered correctly, in any skill and tier: the half of a mock that draws on the owner's own material. */
function mockBookletPool(progress: Progress): Question[] {
  const right = correctQuestionIds(progress);
  return listBookletQuestions().filter((q) => !right.has(q.id));
}

/**
 * Half the mock (rounded down) from booklet questions not yet answered correctly,
 * as many as there are when fewer remain; the rest generated or authored.
 */
export function mockMix(progress: Progress, length: MockLength): MockMix {
  const total = MOCK_LENGTHS[length].questions;
  const half = Math.floor(total / 2);
  const booklet = Math.min(half, mockBookletPool(progress).length);
  return { booklet, other: total - booklet, half };
}

/**
 * Choose a mock: about half booklet questions not yet answered correctly, picked at
 * random; the rest generated or authored, one skill after another across every
 * scenario and chart skill so a mock covers as many as it has room for. When the
 * open booklet questions run short, generated and authored questions fill their
 * places. The questions come in random order; none repeats and no two are siblings.
 * Booklet and authored questions that are siblings of one answered today are passed
 * over while there are others.
 */
export function chooseMock(progress: Progress, length: MockLength, now: Date, random: Random): MockPlan {
  const mix = mockMix(progress, length);
  const today = answeredToday(progress, now);
  const shuffled = shuffle(mockBookletPool(progress), random);
  const clear = (q: Question) => noSiblingOf(q, today);
  const booklet = [...shuffled.filter(clear), ...shuffled.filter((q) => !clear(q))].slice(0, mix.booklet);
  const skills = shuffle(choiceSkills(), random);
  const other: Question[] = [];
  for (let i = 0; other.length < mix.other; i++) {
    const skill = skills[i % skills.length]!;
    const taken = [...booklet, ...other];
    other.push(drawNew(() => otherQuestion(skill, random, taken, today), (q) => !fits(q, taken)));
  }
  return {
    id: `m-${now.getTime().toString(36)}-${randomSeed(random).toString(36)}`,
    length,
    questions: shuffle([...booklet, ...other], random),
    timeLimitMs: MOCK_LENGTHS[length].minutes * 60_000,
  };
}

/** Every multiple-choice skill with the tiers it serves. */
function choiceSkills(): Array<{ skill: ChoiceSkill; tiers: Tier[] }> {
  return listSkills().flatMap((s) => (s.kind === 'drill' ? [] : [{ skill: s.skill, tiers: s.tiers }]));
}

/**
 * One generated or authored question in a skill: authored about half the time where
 * the skill has authored questions at that tier, chosen among those that fit the mock
 * so far (preferring ones that are no sibling of a question answered today). When none
 * fits, a generated question takes the place; a tier with no templates keeps the old
 * draw from its whole authored bank.
 */
function otherQuestion({ skill, tiers }: { skill: ChoiceSkill; tiers: Tier[] }, random: Random, taken: readonly Question[], today: readonly Kin[]): Question {
  const offered = tiers.filter((t) => MOCK_TIERS.includes(t));
  const pool = offered.length > 0 ? offered : tiers;
  const tier = pool[randomInt(random, 0, pool.length - 1)]!;
  const bank = listAuthoredQuestions().filter((q) => q.skill === skill && q.tier === tier);
  const generated = listTemplates(skill, tier).length > 0;
  if (bank.length > 0 && (!generated || random.next() < 0.5)) {
    const fitting = bank.filter((q) => fits(q, taken));
    if (fitting.length > 0) {
      const from = preferring(fitting, (q) => noSiblingOf(q, today));
      return from[randomInt(random, 0, from.length - 1)]!;
    }
    if (!generated) return bank[randomInt(random, 0, bank.length - 1)]!;
  }
  return createQuestion(skill, tier, random, { source: 'generated' });
}
