import { describe, expect, it } from 'vitest';
import { createQuestion, createRandom, listAuthoredQuestions, listBookletQuestions, retryQuestion } from './index';
import { NO_BOOKLETS } from './test-support/booklets';

/** The template part of a generated question's id: `<template>-t<tier>-<seed>`. */
const templateOf = (id: string) => id.replace(/-t\d-\d+$/, '');

describe('retry questions', () => {
  it.skipIf(NO_BOOKLETS)('bring a booklet question back as the very same question', () => {
    const missed = listBookletQuestions()[0]!;
    expect(retryQuestion(missed, createRandom(7))).toEqual(missed);
  });

  it('bring an authored question back as the very same question', () => {
    const missed = listAuthoredQuestions()[3]!;
    expect(retryQuestion(missed, createRandom(7))).toEqual(missed);
  });

  it('bring a generated drill back as a fresh drill of the same skill and tier', () => {
    const missed = createQuestion('multiplication', 2, createRandom(1));
    const retry = retryQuestion(missed, createRandom(2));
    expect(retry).toMatchObject({ skill: 'multiplication', tier: 2, source: 'generated' });
    expect(retry.id).not.toBe(missed.id);
    expect(retry.prompt).not.toBe(missed.prompt);
  });

  it('bring a generated scenario or chart question back as a fresh question from the same template', () => {
    for (const skill of ['break-even-payback', 'growth-trends', 'bar-charts', 'pie-charts'] as const) {
      for (let seed = 1; seed <= 20; seed++) {
        const missed = createQuestion(skill, 2, createRandom(seed), { source: 'generated' });
        const retry = retryQuestion(missed, createRandom(seed + 100));
        expect(retry).toMatchObject({ skill, tier: 2, source: 'generated' });
        expect(templateOf(retry.id)).toBe(templateOf(missed.id));
        expect(retry.id).not.toBe(missed.id);
      }
    }
  });

  it('build the same fresh question again from the same random source', () => {
    const missed = createQuestion('growth-trends', 1, createRandom(5), { source: 'generated' });
    expect(retryQuestion(missed, createRandom(9))).toEqual(retryQuestion(missed, createRandom(9)));
  });
});
