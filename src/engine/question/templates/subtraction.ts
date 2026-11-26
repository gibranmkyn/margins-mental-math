import { formatNumber as f } from '../format';
import { randomInt } from '../random';
import type { Random } from '../random';
import type { Tier } from '../types';
import { MINUS, placeParts, roundTo } from './arithmetic';
import type { Template } from './template';

/**
 * Tier 1: two-digit minus a smaller two-digit number. Tier 2: three-digit
 * minus a smaller three-digit number. Tier 3: two four-digit numbers in either
 * order, so the answer may be negative. Always marked exactly.
 */
export const subtraction: Template = {
  skill: 'subtraction',
  tiers: [1, 2, 3],
  build(tier, random) {
    const [a, b] = operands(tier, random);
    const difference = a - b;
    return {
      targetTimeMs: TARGET_MS[tier],
      prompt: `${f(a)} ${MINUS} ${f(b)}`,
      context: [],
      answer: { kind: 'numeric', value: difference, marking: { mode: 'exact' }, unit: '' },
      solution: solutionFor(a, b),
      shortcut: shortcutFor(a, b, tier === 1 ? 10 : 100),
    };
  },
};

const TARGET_MS: Record<Tier, number> = { 1: 8000, 2: 12000, 3: 20000 };

function operands(tier: Tier, random: Random): [number, number] {
  if (tier === 1) {
    const a = randomInt(random, 22, 99);
    return [a, randomInt(random, 11, a - 1)];
  }
  if (tier === 2) {
    const a = randomInt(random, 202, 999);
    return [a, randomInt(random, 101, a - 1)];
  }
  const a = randomInt(random, 1_001, 9_999);
  let b = randomInt(random, 1_001, 9_999);
  while (b === a) b = randomInt(random, 1_001, 9_999);
  return [a, b];
}

/** Take the smaller number off one place at a time; if it is the larger, flip and negate. */
function solutionFor(a: number, b: number): string[] {
  if (a >= b) return takeOff(a, b);
  return [
    `${f(b)} is bigger than ${f(a)}, so the answer is negative: work out ${f(b)} ${MINUS} ${f(a)}`,
    ...takeOff(b, a),
    `So ${f(a)} ${MINUS} ${f(b)} = ${f(a - b)}`,
  ];
}

function takeOff(from: number, amount: number): string[] {
  let running = from;
  return placeParts(amount).map((part) => {
    const step = `${f(running)} ${MINUS} ${f(part)} = ${f(running - part)}`;
    running -= part;
    return step;
  });
}

function shortcutFor(a: number, b: number, unit: number): string {
  if (a >= b) return roundAndCompensate(a, b, unit);
  return `Work out ${f(b)} ${MINUS} ${f(a)} and make it negative. ${roundAndCompensate(b, a, unit)}, so ${f(a)} ${MINUS} ${f(b)} = ${f(a - b)}`;
}

/** Round what is taken off to a round number, subtract, then give back the difference. */
function roundAndCompensate(a: number, b: number, unit: number): string {
  const round = roundTo(b, unit);
  const gap = round - b;
  if (a - round < 0) {
    return `Count up from ${f(b)}: ${f(b)} + ${f(a - b)} = ${f(a)}, so ${f(a)} ${MINUS} ${f(b)} = ${f(a - b)}`;
  }
  if (gap === 0) return `Take ${f(b)} straight off: ${f(a)} ${MINUS} ${f(b)} = ${f(a - b)}`;
  const [sign, giveBack] = gap > 0 ? [MINUS, '+'] : ['+', MINUS];
  const size = f(Math.abs(gap));
  return `${f(b)} is ${f(round)} ${sign} ${size}: ${f(a)} ${MINUS} ${f(round)} = ${f(a - round)}, then ${giveBack} ${size} = ${f(a - b)}`;
}
