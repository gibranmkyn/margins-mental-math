import { formatNumber as f } from '../format';
import { randomInt } from '../random';
import type { Tier } from '../types';
import { MINUS, placeParts, roundTo } from './arithmetic';
import type { QuestionBody, Template } from './template';

/**
 * Tier 1: two two-digit numbers. Tier 2: two three-digit numbers.
 * Tier 3: a five-digit number plus a four-digit one. Always marked exactly.
 */
export const addition: Template = {
  skill: 'addition',
  tiers: [1, 2, 3],
  build(tier, random) {
    if (tier === 1) {
      const a = randomInt(random, 11, 99);
      const b = randomInt(random, 11, 99);
      return body(tier, a, b, columnSteps(a, b), shortcutFor(a, b));
    }
    const a = tier === 2 ? randomInt(random, 101, 999) : randomInt(random, 10_001, 99_999);
    const b = tier === 2 ? randomInt(random, 101, 999) : randomInt(random, 1_001, 9_999);
    return body(tier, a, b, leftToRight(a, b), roundAndCompensate(a, b));
  },
};

const TARGET_MS: Record<Tier, number> = { 1: 8000, 2: 12000, 3: 20000 };

function body(tier: Tier, a: number, b: number, solution: string[], shortcut: string): QuestionBody {
  return {
    targetTimeMs: TARGET_MS[tier],
    prompt: `${f(a)} + ${f(b)}`,
    context: [],
    answer: { kind: 'numeric', value: a + b, marking: { mode: 'exact' }, unit: '' },
    solution,
    shortcut,
  };
}

function columnSteps(a: number, b: number): string[] {
  const tens = (Math.floor(a / 10) + Math.floor(b / 10)) * 10;
  const units = (a % 10) + (b % 10);
  return [
    `Tens: ${f(a - (a % 10))} + ${f(b - (b % 10))} = ${f(tens)}`,
    `Units: ${a % 10} + ${b % 10} = ${f(units)}`,
    `${f(tens)} + ${f(units)} = ${f(a + b)}`,
  ];
}

/**
 * Round-and-compensate when one number sits just below a ten; otherwise add
 * left to right, tens first.
 */
function shortcutFor(a: number, b: number): string {
  const [big, small] = b % 10 >= a % 10 ? [a, b] : [b, a];
  const units = small % 10;
  if (units >= 7) {
    const up = small + (10 - units);
    const gap = up - small;
    return `${f(small)} is ${f(up)} − ${gap}: ${f(big)} + ${f(up)} = ${f(big + up)}, then − ${gap} = ${f(a + b)}`;
  }
  const tens = small - units;
  if (units === 0) {
    return `Add the tens straight on: ${f(big)} + ${f(small)} = ${f(a + b)}`;
  }
  return `Add left to right: ${f(big)} + ${f(tens)} = ${f(big + tens)}, then + ${units} = ${f(a + b)}`;
}

/** Add the second number on one place at a time, largest place first. */
function leftToRight(a: number, b: number): string[] {
  let running = a;
  return placeParts(b).map((part) => {
    const step = `${f(running)} + ${f(part)} = ${f(running + part)}`;
    running += part;
    return step;
  });
}

/** Round the second number to the nearest hundred, add, then correct. */
function roundAndCompensate(a: number, b: number): string {
  const round = roundTo(b, 100);
  const gap = b - round;
  if (gap === 0) return `Add the hundreds straight on: ${f(a)} + ${f(b)} = ${f(a + b)}`;
  const sign = gap > 0 ? '+' : MINUS;
  const size = f(Math.abs(gap));
  return `${f(b)} is ${f(round)} ${sign} ${size}: ${f(a)} + ${f(round)} = ${f(a + round)}, then ${sign} ${size} = ${f(a + b)}`;
}
